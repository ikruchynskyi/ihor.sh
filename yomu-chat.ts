// Yomu's free conversation at a JLPT level: Blip talks about whatever the learner wants, using only that level's
// grammar and vocabulary, and glosses every word so the page can show readings and meanings on a tap.
// Local model only (Ollama on this machine): nothing the learner writes leaves it. gpt-oss:20b takes 10–30 s a turn.
import { readFile } from "node:fs/promises";
import path from "node:path";

const MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const ROOT = import.meta.dirname;
const LEVELS = ["N5", "N4", "N3"] as const;
export type Level = (typeof LEVELS)[number];
export type Turn = { role: "user" | "assistant"; content: string };
export type Reply = { ja: string; en: string; words: { s: string; r: string; g: string }[]; fix: string };

const SCHEMA = {
  type: "object",
  properties: {
    ja: { type: "string", description: "Blip's reply in Japanese, 1–3 short sentences, ending with a question" },
    en: { type: "string", description: "the same in natural English" },
    words: { type: "array", description: "ja split into every word and particle, in order, with hiragana reading and a short English gloss", items: { type: "object", properties: { s: { type: "string" }, r: { type: "string" }, g: { type: "string" } }, required: ["s", "r", "g"] } },
    fix: { type: "string", description: "one gentle correction of the learner's last Japanese, in English, or empty" },
  },
  required: ["ja", "en", "words", "fix"],
};

let grammar: Promise<any[]> | null = null;
const grammarFor = async (level: Level) => {
  grammar ??= readFile(path.join(ROOT, "yomu/data/grammar.json"), "utf8").then(JSON.parse);
  const upTo = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  return (await grammar).filter((g) => upTo.includes(g.level)).map((g) => `${g.pattern} (${g.meaning})`);
};

const STYLE: Record<Level, string> = {
  N5: "Very simple: です/ます forms, basic particles, present and past, the most common 700 words. Kanji only for the most basic words (日, 人, 学生, 本), the rest in kana.",
  N4: "Everyday conversation: plain and polite forms, て-form chains, ～たい, ～ことがある, conditionals; the common 1,500 words. Normal kanji for N5–N4 words.",
  N3: "Natural everyday Japanese: nuance (～ようだ, ～そうだ, ～ば, passive and causative), opinions and reasons; the common 3,500 words. Normal kanji.",
};

/** One turn of conversation. `turns` are the learner's and Blip's previous lines (Blip's as Japanese only). */
export async function yomuChat(level: Level, turns: Turn[], topic = ""): Promise<Reply> {
  const points = await grammarFor(level);
  const system = `You are Blip, a small friendly robot who is a patient Japanese conversation partner for a learner at JLPT ${level}.
Talk about whatever the learner wants${topic ? ` (they asked to talk about: ${topic})` : ""}. Reply ONLY in Japanese at their level, 1–3 short sentences, and end with a question that keeps the conversation going.
Level ${level}: ${STYLE[level]}
Use only these grammar points (JLPT ${level} and below): ${points.join("; ")}.
Vocabulary: JLPT ${level} or easier. Never use grammar or words above the level, even if the learner does.
If the learner writes in English, answer their meaning in simple Japanese anyway (they're practicing), and keep "en" as the translation of your reply.
If their last Japanese had a mistake, put ONE short friendly correction in "fix": a full English sentence that quotes what they wrote and the fixed Japanese (e.g. "Nice! One small thing: 'がくせい' is usually written 学生."); if it was fine, "fix" is "" (don't invent corrections, and don't correct English or kana spelling of the right word).
"words": split your "ja" into every word and particle in order (so the learner can tap any of them): s = the surface form exactly as in ja, r = its reading in hiragana (for kana words the same), g = a short English meaning in plain words ("student", "to eat (past, polite)", "delicious"); for particles g explains the job ("particle: marks the topic", "particle: marks the object", "particle: and / with"). Punctuation gets s="。" g="". One dictionary word per item, particles and endings separate, like: こんにちは ／ ！ ／ ぼく ／ は ／ ブリップ ／ です ／ 。 ／ あなた ／ は ／ 何 ／ が ／ 好き ／ です ／ か ／ ？ — never a whole phrase in one item.
Answer with the JSON object only.`;
  const messages = [{ role: "system", content: system }, ...turns.slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 600) }))];
  if (!turns.length || turns.at(-1)!.role === "assistant") messages.push({ role: "user", content: "(Start the conversation: greet me and ask me something.)" });
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", signal: AbortSignal.timeout(150_000),
    body: JSON.stringify({ model: MODEL, stream: false, think: "low", format: SCHEMA, options: { num_predict: 900, temperature: 0.8 }, messages }),
  });
  if (!r.ok) throw new Error(`local model: ${r.status}`);
  const out = JSON.parse((await r.json()).message.content) as Reply;
  out.ja = String(out.ja ?? "").trim(); out.en = String(out.en ?? "").trim(); out.fix = String(out.fix ?? "").trim();
  out.words = (Array.isArray(out.words) ? out.words : []).map((w) => ({ s: String(w.s ?? ""), r: String(w.r ?? w.s ?? ""), g: String(w.g ?? "") })).filter((w) => w.s);
  // the glosses must cover the sentence (the page taps them) and be word-sized; otherwise ask once more just for the
  // split (a small, fast call), and if that fails too the page falls back to the plain line
  if (!wellSplit(out.words, out.ja)) { try { out.words = await splitWords(out.ja); } catch {} }
  if (!wellSplit(out.words, out.ja)) out.words = [];
  return out;
}
const letters = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "");
export function wellSplit(words: Reply["words"], ja: string) {
  const plain = letters(ja), covered = letters(words.map((w) => w.s).join(""));
  if (!plain || covered.length < plain.length * 0.85) return false;
  const real = words.filter((w) => letters(w.s)); // not punctuation
  return real.length >= Math.max(2, plain.length / 5) && real.every((w) => letters(w.s).length <= 9);
}
export async function splitWords(ja: string): Promise<Reply["words"]> {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model: MODEL, stream: false, think: "low", format: { type: "object", properties: { words: SCHEMA.properties.words }, required: ["words"] }, options: { num_predict: 700, temperature: 0 },
      messages: [{ role: "system", content: 'Split the Japanese sentence into dictionary words and particles, in order, covering every character: s = surface form, r = hiragana reading, g = short English meaning (particles: "particle: marks the topic" etc.; punctuation: g ""). One word per item, never a phrase. JSON only.' }, { role: "user", content: ja }] }),
  });
  if (!r.ok) throw new Error(`local model: ${r.status}`);
  const d = JSON.parse((await r.json()).message.content);
  return (Array.isArray(d.words) ? d.words : []).map((w: any) => ({ s: String(w.s ?? ""), r: String(w.r ?? w.s ?? ""), g: String(w.g ?? "") })).filter((w: any) => w.s);
}
export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
