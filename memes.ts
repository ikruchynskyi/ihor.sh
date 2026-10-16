// Memegen integration: 209 iconic meme templates loaded from the local memegen service (or cached in data/meme-templates.json).
// Supports fuzzy template matching, semantic mood/intent mapping (dad jokes, honest work, galaxy brain, JLPT panic, etc.),
// and image generation via http://127.0.0.1:5055/images (reverse-proxied to /api/memegen/images/...).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const LOCAL_MEMEGEN = process.env.MEMEGEN_URL || "http://127.0.0.1:5055";

export type MemeTemplate = {
  id: string;
  name: string;
  lines: number;
  keywords: string[];
  example: string[];
};

// Aliases mapping colloquial or alternative meme names to memegen template IDs
const ALIASES: Record<string, string> = {
  "dad-joke": "captain-america",
  "dadjoke": "captain-america",
  "dad_joke": "captain-america",
  "captain-america": "captain-america",
  "captainamerica": "captain-america",
  "elevator": "captain-america",
  "honest-work": "bihw",
  "honestwork": "bihw",
  "honest_work": "bihw",
  "it-aint-much": "bihw",
  "it-aint-much-but-its-honest-work": "bihw",
  "farmer": "bihw",
  "bihw": "bihw",
  "roll-safe": "rollsafe",
  "rollsafe": "rollsafe",
  "think-about-it": "rollsafe",
  "smart": "rollsafe",
  "big-brain": "rollsafe",
  "galaxy-brain": "gb",
  "galaxybrain": "gb",
  "gb": "gb",
  "this-is-fine": "fine",
  "thisisfine": "fine",
  "fine": "fine",
  "burning-house": "fine",
  "drake": "drake",
  "drakeposting": "drake",
  "hotline-bling": "drake",
  "futurama-fry": "fry",
  "fry": "fry",
  "not-sure-if": "fry",
  "notsureif": "fry",
  "squinting-fry": "fry",
  "spiderman": "spiderman",
  "spider-man": "spiderman",
  "spiderman-pointing": "spiderman",
  "pointing": "spiderman",
  "woman-cat": "woman-cat",
  "womancat": "woman-cat",
  "woman-yelling-at-cat": "woman-cat",
  "woman-yelling-at-a-cat": "woman-cat",
  "smudge": "woman-cat",
  "distracted-boyfriend": "db",
  "distracted-bf": "db",
  "db": "db",
  "distracted-girlfriend": "dg",
  "dg": "dg",
  "spongebob": "spongebob",
  "mocking-spongebob": "spongebob",
  "mocking": "spongebob",
  "doge": "doge",
  "shiba": "doge",
  "much-wow": "doge",
  "bongo": "bongo",
  "bongo-cat": "bongo",
  "bongocat": "bongo",
  "pigeon": "pigeon",
  "is-this-a-pigeon": "pigeon",
  "butterfly": "pigeon",
  "disaster-girl": "disastergirl",
  "disastergirl": "disastergirl",
  "grumpy-cat": "grumpycat",
  "grumpycat": "grumpycat",
  "harold": "harold",
  "hide-the-pain": "harold",
  "hide-the-pain-harold": "harold",
  "panik": "panik-kalm-panik",
  "panic": "panik-kalm-panik",
  "panik-kalm-panik": "panik-kalm-panik",
  "success": "success",
  "success-kid": "success",
  "bad-luck-brian": "blb",
  "badluckbrian": "blb",
  "blb": "blb",
  "badchoice": "badchoice",
  "milk-was-a-bad-choice": "badchoice",
  "wonka": "wonka",
  "condescending-wonka": "wonka",
  "willy-wonka": "wonka",
  "kermit": "kermit",
  "none-of-my-business": "kermit",
  "tea": "kermit",
  "two-guys-on-a-bus": "bus",
  "bus": "bus",
  "same": "same",
  "same-picture": "same",
  "theyre-the-same-picture": "same",
  "both": "both",
  "why-not-both": "both",
  "stonks": "stonks",
  "stocks": "stonks",
  "gru": "gru",
  "grus-plan": "gru",
  "gru-plan": "gru",
  "clown": "clown",
  "clown-makeup": "clown",
  "buzz": "buzz",
  "buzz-lightyear": "buzz",
  "everywhere": "buzz",
  "change-my-mind": "cmm",
  "cmm": "cmm",
  "money": "money",
  "shut-up-and-take-my-money": "money",
  "take-my-money": "money",
  "afraid": "afraid",
  "afraid-to-ask": "afraid",
  "afraid-to-ask-andy": "afraid",
  "ams": "ams",
  "awkward-seal": "ams",
  "awkward": "awkward",
  "socially-awkward-penguin": "awkward",
  "headaches": "headaches",
  "headache": "headaches",
  "types-of-headaches": "headaches",
  "ptj": "ptj",
  "phoebe-teaching-joey": "ptj",
  "phoebe": "ptj",
  "facepalm": "facepalm",
  "regret": "regret",
  "firsttry": "firsttry",
  "first-try": "firsttry",
  "who-killed-hannibal": "wkh",
  "wkh": "wkh",
  "morpheus": "morpheus",
  "matrix": "morpheus",
  "ackbar": "ackbar",
  "its-a-trap": "ackbar",
  "mordor": "mordor",
  "one-does-not-simply": "mordor",
  "boromir": "mordor",
  "3hd": "3hd",
  "three-headed-dragon": "3hd",
  "tuxedo-pooh": "pooh",
  "pooh": "pooh",
  "fancy-pooh": "pooh",
  "handshake": "handshake",
  "epic-handshake": "handshake",
  "drunk": "drunk",
  "drunk-baby": "drunk",
  "yallgot": "yallgot",
  "y-all-got-any-more-of-them": "yallgot",
  "icanhas": "icanhas",
  "happy-cat": "icanhas",
  "cheezburger": "icanhas",
};

// Rich semantic keywords to augment templates with emotional and conversational triggers
const EXTRA_KEYWORDS: Record<string, string[]> = {
  "panik-kalm-panik": ["panic", "kalm", "stress", "anxiety", "test", "exam", "worry", "jlpt", "countdown"],
  "fine": ["fire", "burning", "disaster", "chaos", "smiling through pain", "okay", "survive", "fine"],
  "rollsafe": ["think", "smart", "brain", "idea", "trick", "hack", "clever", "galaxy brain", "big brain", "loophole"],
  "gb": ["galaxy brain", "expanding brain", "levels", "ascended", "deep"],
  "bihw": ["honest work", "farmer", "modest", "simple", "humble", "daily practice", "grind", "study", "it ain't much", "honest"],
  "captain-america": ["dad joke", "pun", "bad joke", "groan", "elevator", "marvel", "corny", "witty", "joke"],
  "fry": ["not sure if", "squint", "doubt", "suspicious", "confused", "skeptical", "wonder"],
  "pigeon": ["is this a", "butterfly", "confused", "misidentify", "wrong word", "mistake"],
  "drake": ["drakeposting", "no yes", "dislike like", "preference", "choice", "avoid", "better"],
  "same": ["they're the same picture", "identical", "difference", "twin", "lookalike", "kanji"],
  "spiderman": ["pointing", "identical", "twin", "homophone", "impostor"],
  "ptj": ["phoebe teaching joey", "repeat after me", "tutoring", "student", "struggle", "teaching", "pronunciation"],
  "success": ["success kid", "win", "passed", "nailed it", "triumph", "proud", "victory", "first try"],
  "blb": ["bad luck brian", "fail", "bad luck", "misfortune", "disaster", "oops", "worst"],
  "badchoice": ["milk was a bad choice", "regret", "poor decision", "mistake"],
  "wonka": ["condescending wonka", "sarcasm", "sarcastic", "tell me more", "arrogant", "irony"],
  "kermit": ["none of my business", "sipping tea", "tea", "judgmental", "ironic"],
  "db": ["distracted boyfriend", "distraction", "temptation", "wandering eye", "slang"],
  "headaches": ["types of headaches", "migraine", "headache", "stress", "kanji readings", "pain"],
  "bongo": ["bongo cat", "typing", "keyboard", "cute", "fast", "cat"],
  "doge": ["such", "much", "very", "wow", "shiba", "cute", "wholesome"],
  "ams": ["awkward moment seal", "uncomfortable", "cringe", "slip up", "blunder"],
  "awkward": ["socially awkward penguin", "awkward", "shy", "embarrassing"],
  "afraid": ["afraid to ask andy", "too afraid to ask", "embarrassed to ask", "beginner question"],
  "spongebob": ["mocking spongebob", "mocking", "sarcastic", "mimic", "excuse"],
  "woman-cat": ["woman yelling at cat", "yelling", "cat at table", "argument", "confused cat"],
  "firsttry": ["first try", "accidentally right", "lucky", "fluke"],
  "both": ["why not both", "taco", "compromise", "two choices"],
  "stonks": ["stonks", "profit", "investment", "genius move"],
  "pooh": ["tuxedo winnie the pooh", "fancy", "sophisticated", "keigo", "polite"],
};

// Curated reference archetypes categorized by comedic and educational intent
export const CURATED_TEMPLATES = [
  {
    category: "Dad Jokes & Puns",
    templates: [
      { id: "captain-america", name: "Captain America Elevator Fight Dad Joke", bestFor: "Corny dad jokes, puns, two-part punchlines" },
      { id: "doge", name: "Doge", bestFor: "Wholesome silly wordplay (such X, very Y, much Z)" },
    ],
  },
  {
    category: "Honest Work & Daily Practice",
    templates: [
      { id: "bihw", name: "But It's Honest Work", bestFor: "Modest pride in studying, learning 1 kanji a day, small consistent steps" },
      { id: "firsttry", name: "First Try!", bestFor: "Accidentally or surprisingly getting something right on the first attempt" },
      { id: "success", name: "Success Kid", bestFor: "Remembering a tricky kanji, passing a drill, small victories" },
    ],
  },
  {
    category: "Confusion & Skepticism",
    templates: [
      { id: "fry", name: "Futurama Fry", bestFor: "Not sure if hard grammar or just tricky spelling; squinting in suspicion" },
      { id: "pigeon", name: "Is This a Pigeon?", bestFor: "Mistaking one kanji/grammar rule for another; funny misidentifications" },
      { id: "gandalf", name: "Confused Gandalf", bestFor: "Returning to practice after a while; 'I have no memory of this place'" },
      { id: "noidea", name: "I Have No Idea What I'm Doing", bestFor: "Complete beginner confusion or laughing at unexpected mistakes" },
    ],
  },
  {
    category: "Cleverness & Galaxy Brain",
    templates: [
      { id: "rollsafe", name: "Roll Safe (Think About It)", bestFor: "Unorthodox study hacks, witty loopholes, big brain solutions" },
      { id: "gb", name: "Galaxy Brain", bestFor: "Ascending levels of understanding or funny over-complicated explanations" },
      { id: "pooh", name: "Tuxedo Winnie the Pooh", bestFor: "Comparing plain slang vs fancy polite keigo" },
    ],
  },
  {
    category: "Panic, Stress & Chaotic Situations",
    templates: [
      { id: "fine", name: "This is Fine", bestFor: "Surrounded by N1 kanji or mock test countdown; smiling through the chaos" },
      { id: "panik-kalm-panik", name: "Panik Kalm Panik", bestFor: "Passed N5 (kalm) -> N4 uses kanji (panik) -> memorized kana (kalm)" },
      { id: "headaches", name: "Types of Headaches", bestFor: "Migraine, hypertension, and memorizing on'yomi vs kun'yomi" },
      { id: "disastergirl", name: "Disaster Girl", bestFor: "Cheerfully watching grammar rules burn down" },
    ],
  },
  {
    category: "Comparison & Choices",
    templates: [
      { id: "drake", name: "Drakeposting", bestFor: "Rejecting romanized romaji, preferring authentic kana & kanji" },
      { id: "same", name: "They're The Same Picture", bestFor: "Confusing identical-looking kanji (e.g. 人 vs 入, 日 vs 白)" },
      { id: "db", name: "Distracted Boyfriend", bestFor: "Distracted by anime slang instead of textbook grammar" },
      { id: "both", name: "Why Not Both?", bestFor: "Can't decide between two good options" },
    ],
  },
  {
    category: "Teaching & Learning Struggles",
    templates: [
      { id: "ptj", name: "Phoebe Teaching Joey", bestFor: "Tutor patiently repeating a line and the learner botching the last word" },
      { id: "afraid", name: "Afraid to Ask Andy", bestFor: "Been studying 6 months and too afraid to ask what は actually does" },
      { id: "ams", name: "Awkward Moment Seal", bestFor: "Saying the wrong word in polite company" },
      { id: "blb", name: "Bad Luck Brian", bestFor: "Guesses the only kanji reading that doesn't exist" },
      { id: "woman-cat", name: "Woman Yelling at a Cat", bestFor: "Passionate grammar debate vs confused innocence" },
      { id: "spiderman", name: "Spider-Man Pointing", bestFor: "Two homophones or twin particles pointing at each other" },
    ],
  },
  {
    category: "Ironic Condescension & Wit",
    templates: [
      { id: "wonka", name: "Condescending Wonka", bestFor: "Tell me more about how you'll master Japanese in two weeks without kanji" },
      { id: "kermit", name: "None of My Business", bestFor: "Watching someone use google translate for JLPT practice" },
      { id: "spongebob", name: "Mocking SpongeBob", bestFor: "Playfully mimicking an excuse ('bUt KaNjI iS tOo HaRd')" },
      { id: "bongo", name: "Bongo Cat", bestFor: "Fast furious typing on the Japanese keyboard" },
    ],
  },
];

let cachedTemplates: MemeTemplate[] | null = null;

/** Load templates from local data file or fetch from local memegen service */
export function getTemplates(): MemeTemplate[] {
  if (cachedTemplates && cachedTemplates.length) return cachedTemplates;
  const dataPath = path.join(ROOT, "data/meme-templates.json");
  if (existsSync(dataPath)) {
    try {
      const raw = JSON.parse(readFileSync(dataPath, "utf8")) as MemeTemplate[];
      cachedTemplates = raw.map((t) => ({
        ...t,
        keywords: Array.from(new Set([...(t.keywords || []), ...(EXTRA_KEYWORDS[t.id] || [])])),
      }));
      return cachedTemplates;
    } catch {}
  }
  return fallbackTemplates();
}

/** Asynchronously refresh template list from the running local service */
export async function refreshTemplates(): Promise<MemeTemplate[]> {
  try {
    const res = await fetch(`${LOCAL_MEMEGEN}/templates`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const list = (await res.json()) as any[];
      cachedTemplates = list.map((t) => ({
        id: String(t.id),
        name: String(t.name),
        lines: Number(t.lines) || 2,
        keywords: Array.from(new Set([...(Array.isArray(t.keywords) ? t.keywords.map(String) : []), ...(EXTRA_KEYWORDS[t.id] || [])])),
        example: Array.isArray(t.example?.text) ? t.example.text.map(String) : [],
      }));
      return cachedTemplates;
    }
  } catch {}
  return getTemplates();
}

/** Normalize string for search/lookup */
function normalize(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Search all meme templates by keywords, phrases or name */
export function searchTemplates(query: string, limit = 6): MemeTemplate[] {
  const templates = getTemplates();
  const qClean = normalize(query);
  if (!qClean) return templates.slice(0, limit);

  // Check alias direct hit first
  const aliasTarget = ALIASES[qClean.replace(/\s+/g, "-")] || ALIASES[qClean.replace(/\s+/g, "")];
  if (aliasTarget) {
    const found = templates.find((t) => t.id === aliasTarget);
    if (found) {
      const rest = templates.filter((t) => t.id !== aliasTarget);
      return [found, ...searchTemplatesRanked(qClean, rest, limit - 1)];
    }
  }

  return searchTemplatesRanked(qClean, templates, limit);
}

function searchTemplatesRanked(qClean: string, templates: MemeTemplate[], limit: number): MemeTemplate[] {
  const tokens = qClean.split(" ").filter(Boolean);
  const scored = templates.map((t) => {
    let score = 0;
    const tId = t.id.toLowerCase();
    const tName = t.name.toLowerCase();
    const nameWords = new Set(tName.split(/[^a-z0-9]+/));
    const idWords = new Set(tId.split(/[^a-z0-9]+/));
    const kwWords = new Set(t.keywords.flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/)));
    const exWords = new Set(t.example.flatMap((e) => e.toLowerCase().split(/[^a-z0-9]+/)));

    if (tId === qClean || tId === qClean.replace(/\s+/g, "-")) score += 1000;
    if (tName === qClean) score += 600;

    for (const tok of tokens) {
      if (tId === tok) score += 300;
      else if (idWords.has(tok)) score += 200;
      else if (tok.length >= 4 && tId.includes(tok)) score += 40;

      if (nameWords.has(tok)) score += 180;
      else if (tok.length >= 4 && tName.includes(tok)) score += 30;

      if (kwWords.has(tok)) score += 160;
      if (exWords.has(tok)) score += 50;
    }

    return { t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.t);
}

/** Find the most suitable meme template for an ID, query, or phrase */
export function matchTemplate(queryOrId?: string, fallback = "doge"): MemeTemplate {
  const templates = getTemplates();
  const raw = String(queryOrId || "").trim();
  if (!raw) return templates.find((t) => t.id === fallback) || templates[0];

  const clean = normalize(raw);
  const dashed = clean.replace(/\s+/g, "-");
  const compact = clean.replace(/\s+/g, "");

  // 1. Direct ID match
  const exact = templates.find((t) => t.id === dashed || t.id === compact || t.id.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  // 2. Alias match
  const aliasId = ALIASES[dashed] || ALIASES[compact];
  if (aliasId) {
    const aliasT = templates.find((t) => t.id === aliasId);
    if (aliasT) return aliasT;
  }

  // 3. Semantic mood heuristics
  if (/dad|pun|groan|elevator/.test(clean)) return templates.find((t) => t.id === "captain-america") || exactFallback(templates);
  if (/honest|work|farmer|humble|grind|daily/.test(clean)) return templates.find((t) => t.id === "bihw") || exactFallback(templates);
  if (/think|smart|brain|idea|trick|hack|clever/.test(clean)) return templates.find((t) => t.id === "rollsafe") || exactFallback(templates);
  if (/fine|fire|burning|survive|calm/.test(clean)) return templates.find((t) => t.id === "fine") || exactFallback(templates);
  if (/confus|doubt|not sure|squint|wonder/.test(clean)) return templates.find((t) => t.id === "fry") || exactFallback(templates);
  if (/panic|kalm|stress|exam|test|jlpt/.test(clean)) return templates.find((t) => t.id === "panik-kalm-panik") || exactFallback(templates);
  if (/\b(success|win|won|victory|passed|first try|celebrat)\b/.test(clean)) return templates.find((t) => t.id === "success") || exactFallback(templates);
  if (/fail|luck|mistake|wrong|oops|bad/.test(clean)) return templates.find((t) => t.id === "blb") || exactFallback(templates);
  if (/pigeon|butterfly|misident/.test(clean)) return templates.find((t) => t.id === "pigeon") || exactFallback(templates);
  if (/prefer|choice|better|instead/.test(clean)) return templates.find((t) => t.id === "drake") || exactFallback(templates);
  if (/teach|repeat|joey|phoebe/.test(clean)) return templates.find((t) => t.id === "ptj") || exactFallback(templates);
  if (/same|identical|difference|twin/.test(clean)) return templates.find((t) => t.id === "same") || exactFallback(templates);
  if (/cat|bongo|type|keyboard/.test(clean)) return templates.find((t) => t.id === "bongo") || exactFallback(templates);
  if (/spider|pointing/.test(clean)) return templates.find((t) => t.id === "spiderman") || exactFallback(templates);
  if (/condescend|wonka|tell me/.test(clean)) return templates.find((t) => t.id === "wonka") || exactFallback(templates);
  if (/kermit|business|tea/.test(clean)) return templates.find((t) => t.id === "kermit") || exactFallback(templates);

  // 4. Search ranking across all templates
  const ranked = searchTemplatesRanked(clean, templates, 1);
  if (ranked.length) return ranked[0];

  return templates.find((t) => t.id === fallback) || exactFallback(templates);
}

function exactFallback(templates: MemeTemplate[]): MemeTemplate {
  return templates.find((t) => t.id === "doge") || templates[0];
}

/** Escape special characters for Memegen URL paths according to memegen specification */
export function escapeMemeText(text: string): string {
  if (!text || !text.trim()) return "_";
  return text
    .replace(/_/g, "__")
    .replace(/-/g, "--")
    .replace(/\s+/g, "_")
    .replace(/\?/g, "~q")
    .replace(/%/g, "~p")
    .replace(/#/g, "~h")
    .replace(/\//g, "~s")
    .replace(/"/g, "''")
    .replace(/\\/g, "~b")
    .replace(/</g, "~l")
    .replace(/>/g, "~g")
    .replace(/\n/g, "~n");
}

export type GenerateMemeOptions = {
  template?: string;
  top: string;
  bottom: string;
  search?: string;
  mood?: string;
  siteUrl?: string;
};

export type GeneratedMeme = {
  url: string;
  imageUrl: string;
  template: MemeTemplate;
  top: string;
  bottom: string;
  markdown: string;
};

/** Generate a meme image using the local memegen service with resilient URL formatting */
export async function generateMeme(opts: GenerateMemeOptions): Promise<GeneratedMeme> {
  const top = String(opts.top ?? "").trim();
  const bottom = String(opts.bottom ?? "").trim();
  const template = matchTemplate(opts.template || opts.search || opts.mood || `${top} ${bottom}`);

  let pathUrl = "";
  try {
    const res = await fetch(`${LOCAL_MEMEGEN}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template_id: template.id,
        text: [top, bottom],
        extension: "png",
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      if (data?.url) {
        const u = new URL(data.url);
        pathUrl = `/api/memegen${u.pathname}`;
      }
    }
  } catch {}

  if (!pathUrl) {
    pathUrl = `/api/memegen/images/${template.id}/${escapeMemeText(top)}/${escapeMemeText(bottom)}.png`;
  }

  const site = opts.siteUrl ? opts.siteUrl.replace(/\/$/, "") : "";
  const imageUrl = site ? `${site}${pathUrl}` : pathUrl;
  const markdown = `![${template.name}](${pathUrl})`;

  return {
    url: pathUrl,
    imageUrl,
    template,
    top,
    bottom,
    markdown,
  };
}

function fallbackTemplates(): MemeTemplate[] {
  return [
    { id: "doge", name: "Doge", lines: 2, keywords: ["shiba", "dog", "wow"], example: ["such japanese", "very kanji"] },
    { id: "fine", name: "This is Fine", lines: 2, keywords: ["dog", "fire"], example: ["this is fine", "i am okay"] },
    { id: "captain-america", name: "Captain America Elevator Fight Dad Joke", lines: 2, keywords: ["marvel", "dad joke", "pun"], example: ["why do programmers wear glasses", "because they don't C#"] },
    { id: "bihw", name: "But It's Honest Work", lines: 2, keywords: ["farmer", "honest"], example: ["it ain't much", "but it's honest work"] },
    { id: "rollsafe", name: "Roll Safe", lines: 2, keywords: ["think", "smart"], example: ["you can't fail the test", "if you never take it"] },
    { id: "drake", name: "Drakeposting", lines: 2, keywords: ["drake", "choice"], example: ["romaji", "hiragana"] },
    { id: "fry", name: "Futurama Fry", lines: 2, keywords: ["not sure if", "squint"], example: ["not sure if hard kanji", "or just messy handwriting"] },
    { id: "pigeon", name: "Is This a Pigeon?", lines: 2, keywords: ["butterfly", "confused"], example: ["is this", "a grammar point?"] },
    { id: "spiderman", name: "Spider-Man Pointing", lines: 2, keywords: ["twins", "pointing"], example: ["人", "入"] },
    { id: "panik-kalm-panik", name: "Panik Kalm Panik", lines: 3, keywords: ["panic", "stress"], example: ["JLPT test tomorrow", "I studied all night", "It was the wrong level"] },
    { id: "success", name: "Success Kid", lines: 2, keywords: ["win", "proud"], example: ["read whole sentence", "without checking dictionary"] },
  ];
}

/** Pick an alternative template that has not been used yet in the current conversation */
export function pickFreshTemplate(usedTemplates: string[], desiredId?: string): string | null {
  const templates = getTemplates();
  const used = new Set(usedTemplates.map((s) => s.toLowerCase().trim()));

  if (desiredId) {
    const match = matchTemplate(desiredId);
    const matchKw = new Set(match.keywords.map((k) => k.toLowerCase()));
    const related = templates.filter((t) => !used.has(t.id) && t.id !== match.id && t.keywords.some((k) => matchKw.has(k.toLowerCase())));
    if (related.length) {
      return related[Math.floor(Math.random() * related.length)].id;
    }
  }

  const available = templates.filter((t) => !used.has(t.id));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)].id;
}

/** Sample a diverse rotation of unused templates to inspire the LLM on a conversation turn */
export function sampleTemplatesForTurn(usedTemplates: string[] = [], count = 24): MemeTemplate[] {
  const templates = getTemplates();
  const used = new Set(usedTemplates.map((s) => s.toLowerCase().trim()));
  const available = templates.filter((t) => !used.has(t.id));
  const pool = available.length >= count ? available : templates;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
