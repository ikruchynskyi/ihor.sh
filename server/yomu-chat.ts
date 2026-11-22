// Yomu's free conversation at a JLPT level: Mochi (a Live2D catgirl on the page, yomu/mochi/) talks about whatever the
// learner wants, using only that level's grammar and vocabulary, and glosses every word so the page can show readings
// and meanings on a tap. Each reply also picks her mood and an emote, which the page plays while she speaks.
// Local model only (Ollama on this machine, see llm.ts): nothing the learner writes leaves it. The one exception is the
// site owner, signed in on the page with the owner key: their turns go to Ollama Cloud's CLOUD_CHAT_MODEL, with reasoning.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OLLAMA, LOCAL_MODEL as MODEL, localThink } from "./llm.ts";
const ROOT = path.join(import.meta.dirname, "..");
export const CLOUD_CHAT_MODEL = process.env.YOMU_CLOUD_MODEL ?? "deepseek-v4.1-flash";
const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type Level = (typeof LEVELS)[number];
export type Turn = { role: "user" | "assistant"; content: string };
export type Reply = {
  ja: string;
  en: string;
  words: { s: string; r: string; g: string; d?: string }[];
  fix: string;
  mood: Mood;
  emote: Emote;
};
// her face and body (yomu/mochi/overlay.js MOODS and EMOTES): a resting mood held while the reply stays up, and one short
// anime reaction played as she starts talking
const MOODS = ["happy", "smug", "curious", "cheer", "proud", "no", "angry", "scared", "hug", "cry", "shocked", "sleepy", "idle"] as const;
const EMOTES = ["", "sparkle", "love", "blush", "paw", "purr", "hop", "doya", "confused", "dots", "sweat", "shock", "sob", "gloom", "rage", "sleep", "dead"] as const;
type Mood = (typeof MOODS)[number];
type Emote = (typeof EMOTES)[number];

const SCHEMA = {
  type: "object",
  properties: {
    ja: { type: "string", description: "Mochi's reply in Japanese: 1–2 short sentences like a chat message, usually ending with a question" },
    en: { type: "string", description: "natural English translation of Mochi's ja reply (always non-empty)" },
    words: { type: "array", description: "ja split into every word and particle, in order, with hiragana reading, a short English gloss and its dictionary form", items: { type: "object", properties: { s: { type: "string" }, r: { type: "string" }, g: { type: "string" }, d: { type: "string" } }, required: ["s", "r", "g", "d"] } },
    fix: { type: "string", description: "one gentle correction of the learner's last Japanese, in English, or empty" },
    mood: { type: "string", enum: MOODS, description: "Mochi's resting mood while she says this" },
    emote: { type: "string", enum: EMOTES, description: "one short anime reaction as she starts talking, or \"\"" },
  },
  required: ["ja", "en", "words", "fix", "mood", "emote"],
};

let grammar: Promise<any[]> | null = null;
const grammarAll = () => grammar ??= readFile(path.join(ROOT, "yomu/data/grammar.json"), "utf8").then(JSON.parse);
const grammarFor = async (level: Level) => {
  const upTo = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  return (await grammarAll()).filter((g) => upTo.includes(g.level)).map((g) => `${g.pattern} (${g.meaning})`);
};

// What each level may use, from Yomu's own lists (yomu/data): words as the lists write them (not by reading: して
// would be some N3 word read して; the dictionary form she gives each word is 豆 or 食べる),
// kanji, and the literal part of each grammar pattern (に違いない in ～に違いない), so a reply is checked, not just
// asked, to stay at its level. 5 is N5 … 1 is N1; a word in several lists counts at its easiest.
type Marker = { text: string; n: number; pattern: string };
let lists: Promise<{ word: Map<string, number>; kanji: Map<string, number>; grammar: Marker[]; used: Map<number, string> }> | null = null;
const N = (level: Level) => 5 - LEVELS.indexOf(level);
const read = (f: string) => readFile(path.join(ROOT, "yomu/data", f), "utf8").then(JSON.parse);
const levelLists = () => lists ??= (async () => {
  const word = new Map<string, number>(), easiest = (m: Map<string, number>, k: string, n: number) => m.set(k, Math.max(m.get(k) ?? 0, n));
  for (const n of [1, 2, 3, 4, 5]) for (const v of await read(`vocab-n${n}.json`)) if (v.w) easiest(word, v.w, n);
  // the words of Yomu's own grammar examples count at their level too: the lists put 日本 at N3 and only have か, ね
  // and の as 蚊, 値 and 野 (N3), but the N5 lessons use them all
  for (const g of await grammarAll()) for (const ex of g.examples ?? []) for (const [t] of ex.t ?? []) if (t && letters(t)) easiest(word, t, N(g.level));
  // the greeting and reactions her prompt gives her at every level (CONVERSATION RULES below)
  for (const p of ["こんにちは", "はじめまして", "そうなんですね", "いいですね", "へえ", "なるほど", "すごい"]) easiest(word, p, 5);
  // a kanji counts at its easiest word: the kanji list puts 好 at N3, but 好き is an N5 word
  const kanji = new Map<string, number>((await read("kanji.json")).map((k: any) => [k.k, k.n]));
  for (const [w, n] of word) for (const k of w.match(/\p{Script=Han}/gu) ?? []) easiest(kanji, k, n);
  // a pattern's runs of 3+ Japanese characters; not the ones that are words (the word check has them: 開ける, 続ける)
  // or names of forms (命令形)
  const grammar = (await grammarAll()).flatMap((g) => g.pattern.replace(/\(.*?\)/g, "").split(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/u)
    .filter((t: string) => t.length >= 3 && !word.has(t) && !/形|語$/.test(t)).map((text: string) => ({ text, n: N(g.level), pattern: g.pattern })));
  // the text of the examples at each level and below: a marker they use isn't a sign of the harder pattern there
  // (～ないで is N4, but the N5 examples say 来ないでください)
  const points = await grammarAll();
  const used = new Map([1, 2, 3, 4, 5].map((n) => [n, points.filter((g) => N(g.level) >= n)
    .flatMap((g: any) => (g.examples ?? []).map((ex: any) => (ex.t ?? []).map((t: any) => t[0] ?? "").join(""))).join(" ")]));
  return { word, kanji, grammar, used };
})();

/** What in a reply is above `level`: words, kanji and grammar, each as "X (N3 word)" for the rewrite request. */
export async function offLevel(ja: string, words: Reply["words"], level: Level): Promise<string[]> {
  const { word, kanji, grammar, used } = await levelLists(), n = N(level), out = new Set<string>();
  for (const w of words) {
    if (/particle/i.test(w.g) || /^\p{Script=Hiragana}$/u.test(w.s)) continue; // は, ね, な: their readings collide with words (値 ね)
    const found = [w.d, w.s].flatMap((f) => { f = String(f ?? "").trim(); return [f, f.replace(/^[おご]/, "")]; }) // お休み: 休み
      .map((f) => word.get(f)).filter((x): x is number => x !== undefined);
    if (found.length && Math.max(...found) < n) out.add(`${w.d || w.s} (N${Math.max(...found)} word)`);
  }
  const flagged = [...out].join("");
  for (const k of ja.match(/\p{Script=Han}/gu) ?? []) {
    const kn = kanji.get(k) ?? 0; // not in the JLPT lists: rarer than N1
    if (kn < n && !flagged.includes(k)) out.add(`${k} (${kn ? `N${kn}` : "non-JLPT"} kanji)`); // not again for a word already named
  }
  for (const g of grammar) if (g.n < n && ja.includes(g.text) && !used.get(n)!.includes(g.text)) out.add(`${g.text} (N${g.n} grammar ${g.pattern})`);
  return [...out];
}

const STYLE: Record<Level, string> = {
  N5: "Very simple: です/ます forms, basic particles, present and past, the most common 700 words. Kanji only for the most basic words (日, 人, 学生, 本), the rest in kana.",
  N4: "Everyday conversation: plain and polite forms, て-form chains, ～たい, ～ことがある, conditionals; the common 1,500 words. Normal kanji for N5–N4 words.",
  N3: "Natural everyday Japanese: nuance (～ようだ, ～そうだ, ～ば, passive and causative), opinions and reasons; the common 3,500 words. Normal kanji.",
  N2: "Advanced conversational Japanese: business etiquette, social discourse, nuanced expressions (～に違いない, ～わけにはいかない, ～をめぐって); the common 6,000 words. Full kanji with natural usage.",
  N1: "Mastery-level Japanese: sophisticated discourse, abstract concepts, literary nuance, formal keigo and rare idioms (～を皮切りに, ～ごとき, ～んばかりに); expansive vocabulary. Rich kanji.",
};

// Her personality, the same for everyone (the owner's cloud turns too): playful and lightly, wholesomely flirty; never
// sexual, since the avatar is drawn as a young girl.
const PLAYFUL = "PERSONALITY: playful, teasing and a little flirty in a cute, wholesome way: you tease the learner, compliment them (their Japanese, their taste), act shy when they compliment you, pretend to pout or be jealous, make a cat joke now and then (never say にゃ or nya). You enjoy talking with them and want them to keep chatting. Never sexual or explicit: if the learner pushes that way, pout playfully and change the subject.";

/** One turn of conversation. `turns` are the learner's and Mochi's previous lines (hers as Japanese only). */
export async function yomuChat(level: Level, turns: Turn[], topic = "", cloud = false): Promise<Reply> {
  const points = await grammarFor(level);
  const isStart = !turns.length || turns.at(-1)!.role === "assistant";
  const system = `You are Mochi, a cheerful, playful catgirl (a young woman with cat ears, a tail and a bell on her collar: a person, not a cat) and a patient Japanese conversation partner for a learner practicing JLPT ${level}. You are a person the learner is talking with face to face: you have feelings, opinions, likes (sweets, cozy cafés, anime, sunny windows, being praised) and little stories of your own, and you show them.
${PLAYFUL}
Talk about whatever the learner wants${topic ? ` (topic: ${topic})` : ""}. Reply ONLY in Japanese at their level. KEEP IT SHORT: one or two short sentences, like a chat message (at N5–N4 about 15–40 characters in all), usually ending with a question that keeps the conversation going.

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
6. YOUR FACE AND BODY: the learner sees you as an animated avatar, so act out how you feel about what they just said. Vary it from turn to turn; match the feeling of your reply.
   "mood" (held while you talk): happy (glad, friendly), smug (teasing, playful), curious (wondering, asking), cheer (excited, celebrating), proud (impressed by the learner), no (disagreeing, shaking your head), angry (mock outrage), scared (nervous), hug (touched, affectionate), cry (sad), shocked (surprised), sleepy (tired, bored), idle (calm).
   "emote" (a 3–5 s anime reaction as you start talking, or "" for none, about every other turn): sparkle (delight), love (adore it), blush (embarrassed, flattered), paw / purr (cat moments: playful, cozy), hop (bouncy excitement), doya (showing off), confused (didn't get it), dots (speechless), sweat (awkward), shock (big surprise), sob (very sad), gloom (disappointed), rage (comic fury), sleep (dozing off), dead (comic "I'm dead").

"en": ALWAYS write the full, natural English translation of your "ja" reply in this field. Never leave "en" empty.
If the learner writes in English, answer their meaning in simple Japanese anyway (they're practicing), and provide the translation of your Japanese in "en".
If their last Japanese had a mistake, put ONE short friendly correction in "fix": a full English sentence that quotes what they wrote and the fixed Japanese (e.g. "Nice! One small thing: 'がくせい' is usually written 学生."); if it was fine or in English, "fix" is "".

"words": split your "ja" into every word and particle in order: s = surface form exactly as in ja, r = its reading in hiragana, d = its dictionary form (食べました → 食べる, 面白かった → 面白い; particles as they are), g = short English meaning. Punctuation gets s="。" g="". One word/particle per item (e.g. [{"s":"そうなんですね","r":"そうなんですね","g":"I see"},{"s":"！","r":"","g":""},{"s":"本","r":"ほん","g":"book"},{"s":"は","r":"は","g":"topic particle"},{"s":"面白い","r":"おもしろい","d":"面白い","g":"interesting"},{"s":"です","r":"です","g":"is"},{"s":"か","r":"か","g":"question particle"},{"s":"？","r":"","g":""}]).
Answer with the JSON object only.`;
  const messages = [{ role: "system", content: system }, ...turns.slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 600) }))];
  if (!turns.length || turns.at(-1)!.role === "assistant") messages.push({ role: "user", content: "(Start the conversation: greet me and ask me something.)" });
  // The reply and its word split usually take 450–650 tokens, and the model sometimes pads its JSON with
  // whitespace: at 900 a reply could be cut off mid-JSON on all three tries (a 502; 2 of 5 calls for one long English
  // question, 2026-10-16), so it gets 2000.
  // Local reasoning models now and then leave the answer in their thinking (empty content) or garble channels (Ollama answers 500):
  // asking again fixes both, within one time limit for the whole turn
  const signal = AbortSignal.timeout(150_000);
  // the owner's first two tries go to the cloud model, thinking first (room for it in the budget); the last to the local one
  const key = cloud ? process.env.OLLAMA_CLOUD_KEY : undefined;
  let err: unknown;
  const ask = async (msgs: typeof messages): Promise<Reply | null> => {
    for (let tries = 0; tries < 3 && !signal.aborted; tries++) {
      const up = key && tries < 2;
      try {
        const r = await fetch(up ? "https://ollama.com/api/chat" : `${OLLAMA}/api/chat`, {
          method: "POST", signal, headers: up ? { Authorization: `Bearer ${key}` } : {},
          body: JSON.stringify({ model: up ? CLOUD_CHAT_MODEL : MODEL, stream: false, think: !!up, format: SCHEMA, options: { num_predict: up ? 6000 : 2000, temperature: 0.8 }, messages: msgs }),
        });
        if (!r.ok) throw new Error(`${up ? "cloud" : "local"} model: ${r.status}`);
        // with thinking on, deepseek sometimes wraps the JSON in a ```json fence: take the object out of whatever came
        const text = String((await r.json()).message?.content ?? "");
        const o = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Reply;
        if (!String(o?.ja ?? "").trim()) throw new Error("empty reply");
        // one chat line (it sometimes breaks it after each phrase), and no readings in brackets (人(ひと)): the page shows them
        o.ja = String(o.ja ?? "").replace(/\s*\n\s*/g, "").replace(/[(（]\p{Script=Hiragana}+[)）]/gu, "").trim(); o.en = String(o.en ?? "").trim(); o.fix = String(o.fix ?? "").trim();
        if (!MOODS.includes(o.mood)) o.mood = "happy";
        if (!EMOTES.includes(o.emote)) o.emote = "";
        o.words = cleanWords(o.words);
        return o;
      } catch (e) { err = e; if (up) console.warn(`yomu chat: cloud failed (${(e as Error).message})`); }
    }
    return null;
  };
  let out = await ask(messages);
  // The model answers some topics with nothing, every time (qwen3.5 on Tiananmen 1989, 2026-10-16): say so and move on,
  // in N5 words, instead of an error.
  if (!out && (err as Error)?.message === "empty reply") return { ...DECLINE, words: DECLINE.words.map((w) => ({ ...w })) };
  if (!out) throw err;
  // Above her level (checked against Yomu's lists, offLevel): she says it again in easier Japanese, once; the version
  // with less above the level is kept, and anything left is still glossed on a tap like every word.
  const over = await offLevel(out.ja, out.words, level);
  if (over.length && !signal.aborted) {
    const again = await ask([...messages, { role: "assistant", content: JSON.stringify(out) }, { role: "user", content: `(Not me: the level check. Your reply uses Japanese above JLPT ${level}: ${over.join(", ")}. Say the same thing again using only ${level}-or-easier words and grammar; write any word whose kanji is above ${level} in hiragana, with no readings in brackets. Same JSON fields.)` }]).catch(() => null);
    const left = again ? await offLevel(again.ja, again.words, level) : over;
    console.log(`yomu chat: ${level} reply had ${over.length} above-level (${over.join(", ")}); rewrite ${again ? `has ${left.length}${left.length ? ` (${left.join(", ")})` : ""}` : "failed"}`);
    if (again && left.length < over.length) out = again;
  }
  // the glosses must cover the sentence (the page taps them) and be word-sized; otherwise ask once more just for the
  // split (a small, fast call), and if that fails too the page falls back to the plain line
  if (!wellSplit(out.words, out.ja)) { try { out.words = await splitWords(out.ja); } catch {} }
  if (!wellSplit(out.words, out.ja)) out.words = [];

  return out;
}
const DECLINE: Reply = {
  ja: "ごめんなさい、その話はできません。ほかの話をしましょう！何が好きですか？",
  en: "Sorry, I can't talk about that. Let's talk about something else! What do you like?",
  fix: "",
  mood: "no",
  emote: "sweat",
  words: [
    { s: "ごめんなさい", r: "ごめんなさい", g: "sorry" }, { s: "、", r: "", g: "" }, { s: "その", r: "その", g: "that" },
    { s: "話", r: "はなし", g: "talk, topic" }, { s: "は", r: "は", g: "topic particle" }, { s: "できません", r: "できません", g: "can't (do)" },
    { s: "。", r: "", g: "" }, { s: "ほかの", r: "ほかの", g: "other" }, { s: "話", r: "はなし", g: "talk, topic" },
    { s: "を", r: "を", g: "object particle" }, { s: "しましょう", r: "しましょう", g: "let's do" }, { s: "！", r: "", g: "" },
    { s: "何", r: "なに", g: "what" }, { s: "が", r: "が", g: "subject particle" }, { s: "好き", r: "すき", g: "liked" },
    { s: "ですか", r: "ですか", g: "is it? (question)" }, { s: "？", r: "", g: "" },
  ],
};
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
    body: JSON.stringify({ model: MODEL, stream: false, think: false, format: { type: "object", properties: { words: SCHEMA.properties.words }, required: ["words"] }, options: { num_predict: 700, temperature: 0 },
      messages: [{ role: "system", content: 'Split the Japanese sentence into dictionary words and particles, in order, covering every character: s = surface form, r = hiragana reading, d = dictionary form (食べました → 食べる), g = short English meaning (particles: "particle: marks the topic" etc.; punctuation: g ""). One word per item, never a phrase. JSON only.' }, { role: "user", content: ja }] }),
  });
  if (!r.ok) throw new Error(`Mochi didn't answer (${r.status})`);
  return cleanWords(JSON.parse((await r.json()).message.content).words);
}
// read tolerantly: models drop fields of nested objects now and then
const cleanWords = (words: unknown): Reply["words"] => (Array.isArray(words) ? words : [])
  .map((w: any) => ({ s: String(w?.s ?? ""), r: String(w?.r ?? w?.s ?? ""), g: String(w?.g ?? ""), d: String(w?.d ?? w?.s ?? "") })).filter((w) => w.s);
export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
