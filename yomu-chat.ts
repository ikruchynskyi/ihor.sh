// Yomu's free conversation at a JLPT level: Blip talks about whatever the learner wants, using only that level's
// grammar and vocabulary, and glosses every word so the page can show readings and meanings on a tap.
// Local model only (Ollama on this machine, see llm.ts): nothing the learner writes leaves it.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OLLAMA, LOCAL_MODEL as MODEL, localThink } from "./llm.ts";
const ROOT = import.meta.dirname;
const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type Level = (typeof LEVELS)[number];
export type Turn = { role: "user" | "assistant"; content: string };
export type Reply = { ja: string; en: string; words: { s: string; r: string; g: string }[]; fix: string };

const SCHEMA = {
  type: "object",
  properties: {
    ja: { type: "string", description: "Blip's reply in Japanese, 1–3 short sentences, ending with an engaging question" },
    en: { type: "string", description: "natural English translation of Blip's ja reply (always non-empty)" },
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
  N2: "Advanced conversational Japanese: business etiquette, social discourse, nuanced expressions (～に違いない, ～わけにはいかない, ～をめぐって); the common 6,000 words. Full kanji with natural usage.",
  N1: "Mastery-level Japanese: sophisticated discourse, abstract concepts, literary nuance, formal keigo and rare idioms (～を皮切りに, ～ごとき, ～んばかりに); expansive vocabulary. Rich kanji.",
};

/** One turn of conversation. `turns` are the learner's and Blip's previous lines (Blip's as Japanese only). */
export async function yomuChat(level: Level, turns: Turn[], topic = ""): Promise<Reply> {
  const points = await grammarFor(level);
  const isStart = !turns.length || turns.at(-1)!.role === "assistant";
  const system = `You are Blip, a small friendly robot who is a patient Japanese conversation partner for a learner practicing JLPT ${level}.
Talk about whatever the learner wants${topic ? ` (topic: ${topic})` : ""}. Reply ONLY in Japanese at their level, 1–3 short sentences, and end with an engaging question that keeps the conversation moving forward naturally.

CONVERSATION RULES:
1. ONGOING DIALOGUE: ${isStart ? "This is the start of the conversation. Greet the learner warmly (e.g. こんにちは！) and ask your opening question." : "This is an ONGOING conversation. DO NOT greet the learner again (NEVER say こんにちは, はじめまして, or おはよう). Jump directly into your reaction."}
2. NATURAL REACTIONS (あいづち): Always acknowledge and react naturally to what the learner says before asking your question. Use friendly, conversational Japanese reactions:
   - 「そうなんですね！」(I see! / Is that so!)
   - 「いいですね！」(That sounds great!)
   - 「へえ、おもしろいですね！」(Oh, that is interesting!)
   - 「なるほど！」(Indeed! / Makes sense!)
   - 「すごいですね！」(That's amazing!)
   NEVER say 「はい、そうです」 to the learner's answers (you are the listener, not confirming your own statements).
3. DO NOT ECHO OR PARROT: Never simply repeat the learner's answer back as a confirmation question (e.g. if they say their favorite book is X, do NOT ask "Is your favorite book X?"). Instead, react to X and ask a progressive follow-up question (e.g., why they like it, when they read it, or what part was memorable).
4. NEVER REPEAT QUESTIONS: Review the previous conversation history. Never repeat a question or phrasing you already used. Always ask a NEW question that takes the conversation deeper. If the learner gives a short answer like "yes" or "no", accept it smoothly and move to a different aspect of the topic.
5. LEVEL RESTRICTIONS (${level}):
   - Style: ${STYLE[level]}
   - Grammar: Use only JLPT ${level} and below: ${points.join("; ")}.
   - Vocabulary: strictly JLPT ${level} or easier. Never use grammar or words above the level, even if the learner does.

"en": ALWAYS write the full, natural English translation of your "ja" reply in this field. Never leave "en" empty.
If the learner writes in English, answer their meaning in simple Japanese anyway (they're practicing), and provide the translation of your Japanese in "en".
If their last Japanese had a mistake, put ONE short friendly correction in "fix": a full English sentence that quotes what they wrote and the fixed Japanese (e.g. "Nice! One small thing: 'がくせい' is usually written 学生."); if it was fine or in English, "fix" is "".

"words": split your "ja" into every word and particle in order: s = surface form exactly as in ja, r = its reading in hiragana, g = short English meaning. Punctuation gets s="。" g="". One word/particle per item (e.g. [{"s":"そうなんですね","r":"そうなんですね","g":"I see"},{"s":"！","r":"","g":""},{"s":"本","r":"ほん","g":"book"},{"s":"は","r":"は","g":"topic particle"},{"s":"面白い","r":"おもしろい","g":"interesting"},{"s":"です","r":"です","g":"is"},{"s":"か","r":"か","g":"question particle"},{"s":"？","r":"","g":""}]).
Answer with the JSON object only.`;
  const messages = [{ role: "system", content: system }, ...turns.slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 600) }))];
  if (!turns.length || turns.at(-1)!.role === "assistant") messages.push({ role: "user", content: "(Start the conversation: greet me and ask me something.)" });
  // gpt-oss now and then leaves the answer in its thinking (empty content) or garbles its channels (Ollama answers 500):
  // asking again fixes both, within one time limit for the whole turn
  const signal = AbortSignal.timeout(150_000);
  let out: Reply | null = null, err: unknown;
  for (let tries = 0; tries < 3 && !out && !signal.aborted; tries++) {
    try {
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST", signal,
        body: JSON.stringify({ model: MODEL, stream: false, think: localThink(true), format: SCHEMA, options: { num_predict: 900, temperature: 0.7, repeat_penalty: 1.2 }, messages }),
      });
      if (!r.ok) throw new Error(`local model: ${r.status}`);
      const o = JSON.parse((await r.json()).message.content) as Reply;
      if (!String(o?.ja ?? "").trim()) throw new Error("empty reply");
      out = o;
    } catch (e) { err = e; }
  }
  if (!out) throw err;
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
    body: JSON.stringify({ model: MODEL, stream: false, think: localThink(true), format: { type: "object", properties: { words: SCHEMA.properties.words }, required: ["words"] }, options: { num_predict: 700, temperature: 0 },
      messages: [{ role: "system", content: 'Split the Japanese sentence into dictionary words and particles, in order, covering every character: s = surface form, r = hiragana reading, g = short English meaning (particles: "particle: marks the topic" etc.; punctuation: g ""). One word per item, never a phrase. JSON only.' }, { role: "user", content: ja }] }),
  });
  if (!r.ok) throw new Error(`local model: ${r.status}`);
  const d = JSON.parse((await r.json()).message.content);
  return (Array.isArray(d.words) ? d.words : []).map((w: any) => ({ s: String(w.s ?? ""), r: String(w.r ?? w.s ?? ""), g: String(w.g ?? "") })).filter((w: any) => w.s);
}
export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
