import "./env.ts";

// The local model: what Blip and Jobs AI fall back to when Ollama Cloud fails or its free credits run out, and Yomu's
// only model (its chat promises nothing leaves this machine). Default qwen3.8:27b-mlx; OLLAMA_MODEL in .env overrides it.
export const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.8:27b-mlx";
/** Ollama Cloud's model (free credits every two weeks): Blip, Jobs AI and the map's incident research try it first. */
export const CLOUD_MODEL = process.env.BLIP_CLOUD_MODEL ?? "gemma4:31b";

/** Models that take a reasoning effort level in Ollama ("low" / "medium" / "high"). */
export const supportsEffort = (model = LOCAL_MODEL) =>
  model.startsWith("gpt-oss") || model.startsWith("qwen3.5") || model.startsWith("qwen");

/** Thinking for the local model:
 *  - When a schema'd JSON answer is wanted (json = true): gpt-oss takes "low" effort, while models like qwen3.5
 *    skip thinking (false) so thinking doesn't consume the reply's token budget before JSON is written.
 *  - In conversational chat (json = false, e.g. Blip): reasoning models default to "low", or "high" when thinking hard. */
export const localThink = (json: boolean, deep = false, model = LOCAL_MODEL) => {
  if (json) return model.startsWith("gpt-oss") ? "low" : false;
  if (supportsEffort(model)) return deep ? "high" : "low";
  return true;
};

// The line for model requests: one at a time, first come first served. Blip (the site chat, MCP, A2A) and Yomu's chat
// share it, since the local model answers one request at a time. A full line refuses newcomers instead of queueing them
// past what a visitor would wait for (and past Cloudflare's 100 s for a reply that isn't streamed).
export const MAX_WAITING = 8;
let busy = false;
const line: (() => void)[] = [], later: (() => void)[] = [];
const next = () => { const go = line.shift() ?? later.shift(); if (go) go(); else busy = false; }; // hands the turn straight on: busy stays true
export class LineFull extends Error {}
/** Runs fn when it's this request's turn. ahead(n) hears how many are before it, only when it has to wait. */
export async function inLine<T>(fn: () => Promise<T>, ahead?: (n: number) => void): Promise<T> {
  if (busy) {
    if (line.length >= MAX_WAITING) throw new LineFull(`Blip is answering ${line.length + 1} people already. Try again in a minute.`);
    await new Promise<void>((go) => { line.push(go); ahead?.(line.length); });
  }
  busy = true;
  try { return await fn(); }
  finally { next(); }
}
/** Background work (the city's briefs, camera checks): runs only when no visitor is waiting, after all of them. */
export async function whenIdle<T>(fn: () => Promise<T>): Promise<T> {
  if (busy) await new Promise<void>((go) => later.push(go));
  busy = true;
  try { return await fn(); }
  finally { next(); }
}

if (import.meta.url === `file://${process.argv[1]}`) { // node llm.ts: self-check of the line
  const assert = (await import("node:assert/strict")).default;
  const order: string[] = [], waits: number[] = [], sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const job = (name: string, ms: number, fail = false) => inLine(async () => { order.push(`start ${name}`); await sleep(ms); order.push(`end ${name}`); if (fail) throw new Error(name); return name; }, (n) => waits.push(n));
  const all = await Promise.allSettled([job("a", 30), job("b", 10, true), job("c", 10)]);
  assert.deepEqual(order, ["start a", "end a", "start b", "end b", "start c", "end c"]); // one at a time, in order
  assert.deepEqual(waits, [1, 2]); // b waited behind a; c behind a and b
  assert.deepEqual(all.map((r) => r.status), ["fulfilled", "rejected", "fulfilled"]); // a failure still passes the turn on
  const many = Array.from({ length: MAX_WAITING + 2 }, (_, i) => job(`m${i}`, 1));
  const settled = await Promise.allSettled(many);
  assert.equal(settled.filter((r) => r.status === "rejected" && r.reason instanceof LineFull).length, 1); // 1 running + 8 waiting; the 10th is refused
  assert.equal(await job("after", 1), "after"); // and the line is free again
  order.length = 0;
  const bg = whenIdle(async () => { order.push("bg1"); await sleep(10); });
  const v = job("v", 5), bg2 = whenIdle(async () => { order.push("bg2"); }), v2 = job("v2", 5);
  await Promise.all([bg, v, bg2, v2]);
  assert.deepEqual(order.filter((o) => !o.startsWith("end")), ["bg1", "start v", "start v2", "bg2"]); // visitors go before waiting background work
  console.log("llm.ts: line OK");
}

/** One model call that must answer JSON in a schema: the cloud model first, the local one if it fails. _model says which answered. */
export async function llmJson(system: string, user: string, schema: object, maxTokens = 2500): Promise<any> {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }], key = process.env.OLLAMA_CLOUD_KEY;
  const parse = (s: string) => JSON.parse(s.replace(/^```(json)?|```$/g, "").trim());
  if (key) {
    try {
      const r = await fetch("https://ollama.com/api/chat", { method: "POST", signal: AbortSignal.timeout(90_000), headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: CLOUD_MODEL, stream: false, format: schema, options: { num_predict: maxTokens, temperature: 0.2 }, messages }) });
      if (r.ok) return { ...parse((await r.json()).message.content), _model: CLOUD_MODEL };
    } catch {}
  }
  const r = await fetch(`${OLLAMA}/api/chat`, { method: "POST", signal: AbortSignal.timeout(240_000), body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: localThink(true), format: schema, options: { num_predict: maxTokens, temperature: 0.2 }, messages }) });
  if (!r.ok) throw new Error(`model ${r.status}`);
  return { ...parse((await r.json()).message.content), _model: LOCAL_MODEL };
}
