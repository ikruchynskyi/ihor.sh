// Yomu: the shared engine for every Japanese page. Kana tables and a romaji converter, the script switch
// (kanji + furigana / kana / romaji), spaced repetition, speech (listen + speak), progress in localStorage.

const W = typeof window === "undefined" ? {} : window; // node tests import this file too

// ---------- kana ----------
export const GOJUON = [
  ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
  ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
  ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
  ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
  ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
  ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
  ["や", "ya"], null, ["ゆ", "yu"], null, ["よ", "yo"],
  ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
  ["わ", "wa"], null, null, null, ["を", "wo"],
  ["ん", "n"], null, null, null, null,
];
export const DAKUTEN = [
  ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"],
  ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"],
  ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"],
  ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"],
  ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"],
];
export const YOON = [
  ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"], ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"],
  ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"], ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"],
  ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"], ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"],
  ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"], ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"],
  ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"], ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"],
  ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"],
];
const ROMA = Object.fromEntries([...GOJUON, ...DAKUTEN, ...YOON].filter(Boolean));
Object.assign(ROMA, { "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o", "ゔ": "vu" });
// katakana-only combinations (loanwords)
const EXTRA = { "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe", "ふぉ": "fo", "てぃ": "ti", "でぃ": "di", "とぅ": "tu", "どぅ": "du", "うぃ": "wi", "うぇ": "we", "うぉ": "wo", "ちぇ": "che", "しぇ": "she", "じぇ": "je", "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo" };
Object.assign(ROMA, EXTRA);

export const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const toKatakana = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
export const isKana = (s) => /^[぀-ヿー・]+$/.test(s);
export const hasKanji = (s) => /[一-鿿々]/.test(s);

/** Hepburn romaji for kana. Particles は/へ/を are read wa/e/o when `particle` is set. */
export function romaji(kana, particle = false) {
  if (particle) { if (kana === "は") return "wa"; if (kana === "へ") return "e"; if (kana === "を") return "o"; }
  const h = toHiragana(kana);
  let out = "";
  for (let i = 0; i < h.length; i++) {
    const two = h.slice(i, i + 2), one = h[i];
    if (one === "っ") { // small tsu doubles the next consonant (っち → tch)
      const next = ROMA[h.slice(i + 1, i + 3)] ?? ROMA[h[i + 1]] ?? "";
      out += next.startsWith("ch") ? "t" : next[0] ?? "";
      continue;
    }
    if (one === "ー") { const v = out.match(/[aeiou]$/)?.[0]; out += v ? { a: "a", i: "i", u: "u", e: "e", o: "o" }[v] : ""; continue; }
    if (ROMA[two]) { out += ROMA[two]; i++; continue; }
    if (one === "ん") { out += /^[aiueoy]/.test(ROMA[h[i + 1]] ?? "") ? "n'" : "n"; continue; }
    out += ROMA[one] ?? one;
  }
  return out;
}

// ---------- tokens and the script switch ----------
// A token is [surface, reading|null, gloss|null, kind|null]; kind "p" = particle, "x" = punctuation.
export const tok = (t) => ({ s: t[0], r: t[1] ?? null, g: t[2] ?? null, k: t[3] ?? null });
export const reading = (t) => t.r ?? t.s;

/** HTML for a line of tokens in the current script mode; known words can drop their furigana. */
export function renderTokens(tokens, settings, known = {}) {
  const ts = tokens.map(tok);
  return ts.map((t, i) => {
    if (t.k === "x") return `<span class="pn">${esc(settings.script === "romaji" ? romajiPunct(t.s) : t.s)}</span>`;
    const r = reading(t), word = esc(t.s);
    let inner;
    if (settings.script === "romaji") inner = esc(romaji(r, t.k === "p"));
    else if (settings.script === "kana") inner = esc(r);
    else if (t.r && hasKanji(t.s) && settings.furigana !== "none" && !(settings.furigana === "unknown" && known[t.s])) inner = ruby(t.s, t.r);
    else inner = word;
    const sep = settings.script !== "romaji" || i === 0 || t.k === "x" || glued(ts[i - 1], t) ? "" : " ";
    return `${sep}<span class="w${t.k === "p" ? " p" : ""}${t.g ? " g" : ""}" data-i="${i}" tabindex="${t.g ? 0 : -1}">${inner}</span>`;
  }).join("");
}
/** In romaji, a kanji word and the kana right after it are one word (食|べます → tabemasu) unless the kana starts with a particle or です. */
const glued = (prev, t) => !!prev?.r && !t.r && !t.k && prev.k !== "x" && !/^(です|でし|だ|じゃ|では|[はをがもにでとへかやのよね])/.test(t.s);
/** Furigana only over the kanji: 食べる/たべる → <ruby>食<rt>た</rt></ruby>べる. */
export function ruby(s, r) {
  let a = 0, b = 0;
  while (a < s.length - 1 && !hasKanji(s[a]) && s[a] === r[a]) a++;
  while (b < s.length - a - 1 && !hasKanji(s[s.length - 1 - b]) && s[s.length - 1 - b] === r[r.length - 1 - b]) b++;
  const mid = s.slice(a, s.length - b), rt = r.slice(a, r.length - b);
  return `${esc(s.slice(0, a))}<ruby>${esc(mid)}<rt>${esc(rt)}</rt></ruby>${esc(s.slice(s.length - b))}`;
}
const romajiPunct = (p) => ({ "。": ".", "、": ",", "？": "?", "！": "!", "「": "“", "」": "”", "…": "…" })[p] ?? p;
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const plain = (tokens) => tokens.map(tok).map((t) => t.s).join("");
export const kanaLine = (tokens) => tokens.map(tok).map(reading).join("");

// ---------- progress (this browser only) ----------
const KEY = "yomu";
const DEFAULTS = { settings: { script: "kanji", furigana: "all", translation: true, rate: 0.85, slow: false }, known: {}, srs: {}, done: {}, xp: 0, streak: { last: "", days: 0 }, start: null, gaps: {}, dailyQuiz: {} };
export const state = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return structuredClone(DEFAULTS); } })();
state.settings = { ...DEFAULTS.settings, ...state.settings };
state.gaps ??= {};
state.dailyQuiz ??= {};
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

/** XP and a daily streak: a little game loop around studying. */
export function gain(xp) {
  state.xp += xp;
  const today = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  if (state.streak.last !== today) state.streak = { last: today, days: state.streak.last === y ? state.streak.days + 1 : 1 };
  save();
  dispatchEvent(new CustomEvent("yomu:xp", { detail: { xp, total: state.xp } }));
}

// ---------- spaced repetition (SM-2 style, grades 0 again · 1 hard · 2 good · 3 easy) ----------
export function addCard(id, card) { if (!state.srs[id]) { state.srs[id] = { ...card, due: Date.now(), interval: 0, ease: 2.5, reps: 0 }; save(); } }
export function grade(id, g) {
  const c = state.srs[id];
  if (!c) return;
  if (g === 0) { c.reps = 0; c.interval = 0; c.due = Date.now() + 60_000; c.ease = Math.max(1.3, c.ease - 0.2); }
  else {
    c.reps++;
    c.ease = Math.max(1.3, c.ease + [0, -0.15, 0, 0.15][g]);
    c.interval = c.reps === 1 ? (g === 3 ? 3 : 1) : c.reps === 2 ? (g === 1 ? 2 : 4) : Math.round(c.interval * c.ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1));
    c.due = Date.now() + c.interval * 86400_000;
    if (c.interval >= 21) state.known[c.word ?? c.front] = true; // learned
  }
  save();
}
export const dueCards = () => Object.entries(state.srs).filter(([, c]) => c.due <= Date.now()).map(([id, c]) => ({ id, ...c }));

// ---------- knowledge gaps & daily miniquiz ----------
export function recordGap(gap, isCorrect) {
  if (!gap || !gap.id) return null;
  state.gaps ??= {};
  const g = state.gaps[gap.id] || {
    id: gap.id,
    title: gap.title || gap.id,
    category: gap.category || "General",
    level: gap.level || "N5",
    link: gap.link || "",
    why: gap.why || "",
    sampleQ: gap.sampleQ || "",
    missCount: 0,
    correctCount: 0,
    history: [],
    created: Date.now()
  };
  if (gap.title) g.title = gap.title;
  if (gap.category) g.category = gap.category;
  if (gap.level) g.level = gap.level;
  if (gap.link) g.link = gap.link;
  if (gap.why) g.why = gap.why;
  if (gap.sampleQ) g.sampleQ = gap.sampleQ;

  const today = new Date().toISOString().slice(0, 10);
  if (isCorrect) {
    g.correctCount = (g.correctCount || 0) + 1;
    g.lastCorrect = today;
    g.streak = (g.streak || 0) + 1;
    if (g.streak >= 2 || (g.correctCount >= g.missCount && g.streak >= 1)) {
      g.resolved = true;
      g.resolvedAt = today;
    }
  } else {
    g.missCount = (g.missCount || 0) + 1;
    g.lastMissed = today;
    g.streak = 0;
    g.resolved = false;
  }
  g.history = g.history || [];
  g.history.push({ date: today, ok: !!isCorrect });
  if (g.history.length > 10) g.history.shift();

  state.gaps[gap.id] = g;
  save();
  return g;
}

export function getActiveGaps() {
  state.gaps ??= {};
  return Object.values(state.gaps).filter((g) => !g.resolved);
}

export function clearGap(id) {
  state.gaps ??= {};
  if (state.gaps[id]) {
    state.gaps[id].resolved = true;
    state.gaps[id].resolvedAt = new Date().toISOString().slice(0, 10);
    save();
  }
}

export function saveDailyQuizResult(dateStr, result) {
  state.dailyQuiz ??= {};
  state.dailyQuiz[dateStr] = {
    date: dateStr,
    level: result.level,
    score: result.score,
    total: result.total,
    gaps: result.gaps || [],
    completedAt: Date.now()
  };
  save();
}

export function getDailyQuizResult(dateStr) {
  state.dailyQuiz ??= {};
  return state.dailyQuiz[dateStr] || null;
}

// ---------- speech (Edge neural AI voice + pre-generated audio + browser fallback) ----------
let jaVoice = null;
const pickVoice = () => (jaVoice = ("speechSynthesis" in W ? speechSynthesis.getVoices() : []).filter((v) => v.lang.replace("_", "-").startsWith("ja")).sort((a, b) => Number(/Google|Kyoko|Otoya|O-ren/i.test(b.name)) - Number(/Google|Kyoko|Otoya|O-ren/i.test(a.name)))[0] ?? null);
if ("speechSynthesis" in W) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export const canSpeak = () => true;

let player = null;
let currentAudio = null;
let activeAudioDone = null;
function getPlayer() {
  if (!player && typeof Audio !== "undefined") player = new Audio();
  return player;
}

export function stopAudio() {
  if (player) {
    try {
      player.pause();
    } catch {}
  }
  if (currentAudio && currentAudio !== player) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
  if (activeAudioDone) {
    const fn = activeAudioDone;
    activeAudioDone = null;
    fn(false);
  }
  if ("speechSynthesis" in W) {
    try { speechSynthesis.cancel(); } catch {}
  }
  if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("blip:key", { detail: { on: false } }));
}

const DEFAULT_AUDIO_V = 1791901234;

async function fetchManifest(relPath) {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const p = path.join(process.cwd(), relPath.replace(/^\//, ""));
      const raw = await fs.readFile(p, "utf-8");
      return JSON.parse(raw);
    } catch {}
  }
  return fetch(relPath).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
}

let manifestData = null;
let manifestPromise = null;
/** Fetch manifest of pre-generated story audio lines (Irodori-TTS). */
export async function getStoryAudioManifest() {
  if (manifestData) return manifestData;
  return (manifestPromise ??= fetchManifest("/yomu/data/audio/stories/manifest.json")
    .then((data) => (manifestData = data)));
}

/** Returns the URL of pre-rendered story audio (Irodori-TTS). */
export function storyAudioUrl(storyId, lineIdx, isSlow = state.settings.slow) {
  const v = (manifestData && manifestData._v) ? manifestData._v : DEFAULT_AUDIO_V;
  const suffix = isSlow ? "_slow" : "";
  return `/yomu/data/audio/stories/${encodeURIComponent(storyId)}_${lineIdx}${suffix}.mp3?v=${v}`;
}

let wordManifestData = null;
let wordManifestPromise = null;
/** Fetch manifest of pre-generated vocabulary word audio (Irodori-TTS). */
export async function getWordAudioManifest() {
  if (wordManifestData) return wordManifestData;
  return (wordManifestPromise ??= fetchManifest("/yomu/data/audio/words/manifest.json")
    .then((data) => (wordManifestData = data)));
}

/** Returns the URL of pre-rendered word audio (Irodori-TTS) if available, or null. */
export function wordAudioUrl(word) {
  const w = String(word ?? "").trim();
  const cleanWord = w.replace(/[。、！？!?,.\s]+$/g, "").trim();
  const hash = wordManifestData?.words?.[w] || wordManifestData?.words?.[cleanWord];
  if (!hash) return null;
  const v = (wordManifestData && wordManifestData._v) ? wordManifestData._v : DEFAULT_AUDIO_V;
  return `/yomu/data/audio/words/${hash}.mp3?v=${v}`;
}

let kanaManifestData = null;
let kanaManifestPromise = null;
/** Fetch manifest of pre-generated kana audio (Irodori-TTS). */
export async function getKanaAudioManifest() {
  if (kanaManifestData) return kanaManifestData;
  return (kanaManifestPromise ??= fetchManifest("/yomu/data/audio/kana/manifest.json")
    .then((data) => (kanaManifestData = data)));
}

/** Returns the URL of pre-rendered kana audio (Irodori-TTS) if available, or null. */
export function kanaAudioUrl(kana) {
  const k = String(kana ?? "").trim();
  const hash = kanaManifestData?.kana?.[k] || kanaManifestData?.kana?.[toHiragana(k)];
  if (!hash) return null;
  const v = (kanaManifestData && kanaManifestData._v) ? kanaManifestData._v : DEFAULT_AUDIO_V;
  return `/yomu/data/audio/kana/${hash}.mp3?v=${v}`;
}

let grammarManifestData = null;
let grammarManifestPromise = null;
/** Fetch manifest of pre-generated grammar audio (Irodori-TTS). */
export async function getGrammarAudioManifest() {
  if (grammarManifestData) return grammarManifestData;
  return (grammarManifestPromise ??= fetchManifest("/yomu/data/audio/grammar/manifest.json")
    .then((data) => (grammarManifestData = data)));
}

/** Returns the URL of pre-rendered grammar audio (Irodori-TTS) if available, or null. */
export function grammarAudioUrl(text) {
  const t = String(text ?? "").trim();
  const tClean = t.replace(/[。. \t\r\n]+$/, "");
  const hash = grammarManifestData?.grammar?.[t] || grammarManifestData?.grammar?.[tClean];
  if (!hash) return null;
  const v = (grammarManifestData && grammarManifestData._v) ? grammarManifestData._v : DEFAULT_AUDIO_V;
  return `/yomu/data/audio/grammar/${hash}.mp3?v=${v}`;
}

let talkManifestData = null;
let talkManifestPromise = null;
/** Fetch manifest of pre-generated talk scene audio (Irodori-TTS). */
export async function getTalkAudioManifest() {
  if (talkManifestData) return talkManifestData;
  return (talkManifestPromise ??= fetchManifest("/yomu/data/audio/talk/manifest.json")
    .then((data) => (talkManifestData = data)));
}

/** Returns the URL of pre-rendered talk audio (Irodori-TTS) if available, or null. */
export function talkAudioUrl(text) {
  const t = String(text ?? "").trim();
  const hash = talkManifestData?.talk?.[t];
  if (!hash) return null;
  const v = (talkManifestData && talkManifestData._v) ? talkManifestData._v : DEFAULT_AUDIO_V;
  return `/yomu/data/audio/talk/${hash}.mp3?v=${v}`;
}

// Pre-load manifests in browser context
if (typeof window !== "undefined") {
  getStoryAudioManifest();
  getWordAudioManifest();
  getKanaAudioManifest();
  getGrammarAudioManifest();
  getTalkAudioManifest();
}

// Browser-level in-memory cache for synthesized MP3 blobs (reused across plays without server disk storage)
const browserAudioCache = new Map();

/** Read Japanese aloud (pre-rendered neural audio, Edge neural TTS, or browser voice). Resolves when done. */
export function speak(text, rate = (state.settings.slow ? 0.7 : state.settings.rate), audioUrl = null) {
  stopAudio();
  const clean = String(text ?? "").trim();
  const cleanWord = clean.replace(/[。、！？!?,.\s]+$/g, "").trim();
  if (!clean && !audioUrl) return Promise.resolve(false);

  const speed = state.settings.slow ? 0.7 : (Number(rate) || 1.0);

  if (typeof Audio !== "undefined") {
    return new Promise((resolve) => {
      const audio = getPlayer();
      if (!audio) return browserSpeak(clean, speed).then(resolve);

      const staticResolved = audioUrl || wordAudioUrl(clean) || wordAudioUrl(cleanWord) || kanaAudioUrl(clean) || grammarAudioUrl(clean) || talkAudioUrl(clean);
      let targetUrl = staticResolved;
      if (!targetUrl) {
        const cacheKey = `${clean}|${speed}`;
        if (browserAudioCache.has(cacheKey)) {
          targetUrl = browserAudioCache.get(cacheKey);
        } else {
          const apiUrl = `/api/yomu/tts?text=${encodeURIComponent(clean)}&speed=${speed}`;
          // Prefetch as blob and store in browser memory cache for instantaneous reuse
          fetch(apiUrl)
            .then((r) => (r.ok ? r.blob() : null))
            .then((blob) => {
              if (blob && !browserAudioCache.has(cacheKey)) {
                browserAudioCache.set(cacheKey, URL.createObjectURL(blob));
              }
            })
            .catch(() => {});
          targetUrl = apiUrl;
        }
      }
      currentAudio = audio;

      // If playing pre-generated slow audio file, edge-tts, or cached blob (speed adjusted), playbackRate stays 1.0
      try {
        const isSpeedPreSet = targetUrl.includes("_slow.mp3") || targetUrl.startsWith("/api/yomu/tts") || targetUrl.startsWith("blob:");
        audio.playbackRate = isSpeedPreSet ? 1.0 : speed;
        audio.defaultPlaybackRate = audio.playbackRate;
        audio.preservesPitch = true;
      } catch {}

      if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("blip:key", { detail: { on: true } }));

      let finished = false;
      const done = (ok) => {
        if (finished) return;
        finished = true;
        if (activeAudioDone === done) activeAudioDone = null;
        audio.onended = null;
        audio.onerror = null;
        if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("blip:key", { detail: { on: false } }));
        resolve(ok);
      };
      activeAudioDone = done;

      audio.onended = () => done(true);
      audio.onerror = () => {
        // Fallback to browser voice on audio error
        browserSpeak(clean, speed).then(done);
      };

      if (!audio.src.endsWith(targetUrl) && audio.src !== targetUrl) {
        audio.src = targetUrl;
      } else {
        try { audio.currentTime = 0; } catch {}
      }

      const p = audio.play();
      if (p) {
        p.catch((err) => {
          if (err && err.name === "AbortError") {
            done(false);
            return;
          }
          console.warn("Audio play rejected, falling back to browser voice:", err);
          browserSpeak(clean, speed).then(done);
        });
      }
    });
  }

  return browserSpeak(clean, rate);
}

export function browserSpeak(text, rate = state.settings.rate) {
  return new Promise((done) => {
    if (!("speechSynthesis" in W)) return done(false);
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("blip:key", { detail: { on: false } }));
      done(ok);
    };
    const timer = setTimeout(() => finish(false), 5000);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP"; u.rate = rate; if (jaVoice) u.voice = jaVoice;
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("blip:key", { detail: { on: true } }));
      speechSynthesis.speak(u);
    } catch {
      finish(false);
    }
  });
}

const Recognition = W.SpeechRecognition ?? W.webkitSpeechRecognition;
export const canListen = () => !!Recognition;
/** Listen for Japanese speech; resolves with what was heard (or "" on silence/error). */
export function listen() {
  return new Promise((done) => {
    if (!Recognition) return done("");
    const r = new Recognition();
    r.lang = "ja-JP"; r.interimResults = false; r.maxAlternatives = 3;
    r.onresult = (e) => done([...e.results[0]].map((a) => a.transcript).join(" / "));
    r.onerror = r.onnomatch = () => done("");
    r.start();
  });
}

/** How close a spoken answer is to the target, by kana (0..1). */
export function similarity(a, b) {
  const x = toHiragana(a).replace(/[^぀-ゟ一-鿿]/g, ""), y = toHiragana(b).replace(/[^぀-ゟ一-鿿]/g, "");
  if (!x || !y) return 0;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}

// ---------- pitch accent (Kanjium NHK data) ----------
let pitchCache = null;
export async function getPitchData() {
  return (pitchCache ??= fetch("/yomu/data/pitch.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));
}

const SMALL_KANA = new Set("ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ");
/** Split kana into phonological morae (combining small kana with previous character). */
export function splitMorae(kana) {
  const s = toHiragana(String(kana ?? "")).replace(/[^぀-ゟー]/g, "");
  const morae = [];
  for (let i = 0; i < s.length; i++) {
    if (i + 1 < s.length && SMALL_KANA.has(s[i + 1])) {
      morae.push(s[i] + s[i + 1]);
      i++;
    } else {
      morae.push(s[i]);
    }
  }
  return morae;
}

/**
 * Returns pitch accent information for a word and its reading:
 * { pitch: number[], p: number, type: "heiban"|"atamadaka"|"nakadaka"|"odaka", name: string, moras: { mora: string, high: boolean, drop: boolean }[] } | null
 */
export async function pitchInfo(word, reading) {
  const map = await getPitchData();
  const w = String(word ?? "").trim(), r = toHiragana(String(reading ?? word ?? "").trim());
  const nums = map[`${w}|${r}`] ?? map[w] ?? map[r] ?? null;
  if (!nums || !nums.length) return null;

  const moras = splitMorae(r);
  const N = moras.length;
  if (!N) return null;

  const P = nums[0];
  let type = "heiban", name = "平板";
  if (P === 0) { type = "heiban"; name = "平板 (flat)"; }
  else if (P === 1) { type = "atamadaka"; name = "頭高 (head-high)"; }
  else if (P === N) { type = "odaka"; name = "尾高 (tail-high)"; }
  else if (P > 1 && P < N) { type = "nakadaka"; name = "中高 (mid-high)"; }
  else { type = "nakadaka"; name = `[${P}]`; }

  const moraStates = moras.map((m, i) => {
    const moraNum = i + 1;
    let high = false;
    if (P === 0) {
      high = moraNum > 1;
    } else if (P === 1) {
      high = moraNum === 1;
    } else {
      high = moraNum > 1 && moraNum <= P;
    }
    const drop = moraNum === P;
    return { mora: m, high, drop };
  });

  return { pitch: nums, p: P, type, name, moras: moraStates };
}

/** HTML for pitch accent contour visualization and badge. */
export function renderPitch(info) {
  if (!info) return "";
  const curve = info.moras.map((m) =>
    `<span class="mora ${m.high ? "high" : "low"}${m.drop ? " drop" : ""}">${esc(m.mora)}${m.drop ? '<span class="downstep">ꜜ</span>' : ""}</span>`
  ).join("");
  return `<div class="pitch-info" title="Pitch accent: ${info.name}">
    <span class="pitch-badge ${info.type}">[${info.p}] ${info.name}</span>
    <span class="pitch-curve">${curve}</span>
  </div>`;
}

// ---------- stroke order (KanjiVG, CC BY-SA 3.0, by Ulrich Apel) ----------
/** Animate the strokes of a kanji or kana into `el`. */
export async function strokes(ch, el) {
  const code = ch.codePointAt(0).toString(16).padStart(5, "0");
  el.innerHTML = '<span class="muted">…</span>';
  // jsDelivr refuses a few files (週, 判, 参); GitHub's raw URL has them all.
  const get = (u) => fetch(u).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const svg = (await get(`https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${code}.svg`)) || (await get(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${code}.svg`));
  if (!svg) { el.innerHTML = '<span class="muted">No stroke data</span>'; return; }
  el.innerHTML = svg.slice(svg.indexOf("<svg"));
  const paths = [...el.querySelectorAll("path")];
  el.querySelectorAll("text").forEach((t) => t.remove());
  // Each stroke draws itself in order. (A CSS transition here raced its own start value: strokes appeared at once.)
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  paths.forEach((p, i) => {
    const len = p.getTotalLength();
    Object.assign(p.style, { fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeDasharray: len });
    if (!still) p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: (0.45 + len / 250) * 1000, delay: i * 550, easing: "ease-in-out", fill: "backwards" });
  });
}

// ---------- the settings bar every page shows ----------
export function settingsBar(el, onChange, opts = {}) {
  const s = state.settings;
  el.innerHTML = `<div class="yset" role="group" aria-label="Display">
    <span>Script</span>${[["kanji", "漢字 + furigana"], ["kana", "かな only"], ["romaji", "Romaji"]].map(([v, l]) => `<button data-s="${v}" aria-pressed="${s.script === v}">${l}</button>`).join("")}
    <label>Furigana <select id="yfuri"><option value="all">on all kanji</option><option value="unknown">only on words I don't know</option><option value="none">off</option></select></label>
    <label><input type="checkbox" id="ytr" ${s.translation ? "checked" : ""}> English</label>
    <label><input type="checkbox" id="yslow" ${s.slow ? "checked" : ""}> Slow mode</label>
    <span class="yxp" title="XP and streak">★ ${state.xp} XP · 🔥 ${state.streak.days} day${state.streak.days === 1 ? "" : "s"}</span></div>`;
  el.querySelector("#yfuri").value = s.furigana;
  el.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { s.script = b.dataset.s; save(); settingsBar(el, onChange, opts); onChange?.(); }));
  el.querySelector("#yfuri").onchange = (e) => { s.furigana = e.target.value; save(); onChange?.(); };
  el.querySelector("#ytr").onchange = (e) => { s.translation = e.target.checked; save(); onChange?.(); };
  el.querySelector("#yslow").onchange = (e) => { s.slow = e.target.checked; s.rate = e.target.checked ? 0.7 : 1.0; save(); onChange?.(); };
  addEventListener("yomu:xp", () => { const x = el.querySelector(".yxp"); if (x) x.textContent = `★ ${state.xp} XP · 🔥 ${state.streak.days} day${state.streak.days === 1 ? "" : "s"}`; });
}

export const blip = (text, mood = "happy", hop = 0) => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood, hop } }));

// ---------- the full JLPT decks (data/*.json, built by src/data.py and src/grammar.py) ----------
const loaded = {};
export const data = (name) => (loaded[name] ??= fetch(`/yomu/data/${name}.json`).then((r) => r.json()));
export const LEVELS = ["N5", "N4", "N3", "N2", "N1"]; // full JLPT spectrum from beginner to mastery
export const DECK_LEVELS = [...LEVELS]; // kanji, word and grammar decks go all the way
export const vocab = (level) => data(`vocab-${level.toLowerCase()}`);
export const kanjiDeck = async (level) => (await data("kanji")).filter((k) => `N${k.n}` === level);
export const grammarDeck = async (level) => (await data("grammar")).filter((g) => !level || g.level === level);
/** Card ids: w:word, k:kanji, g:grammar id, a:kana. "Learning" = in the review deck. */
export const inDeck = (id) => !!state.srs[id];
export const learned = (id) => (state.srs[id]?.interval ?? 0) >= 21;
export const wordCard = (w) => ["w:" + w.w, { word: w.w, front: w.w, reading: w.r, meaning: w.m, kind: "word" }];
export const kanjiCard = (k) => ["k:" + k.k, { word: k.k, front: k.k, reading: [...k.on, ...k.kun].join("、"), meaning: k.m.join(", "), kind: "kanji" }];
export const grammarCard = (g) => ["g:" + g.id, { front: g.pattern, meaning: g.meaning, gid: g.id, kind: "grammar" }];

/** An example sentence with its quiz part blanked out. */
export function cloze(ex, settings, filled = null) {
  const [a, b] = ex.blank;
  const blank = `<span class="blank">${filled ? esc(filled) : "＿＿＿"}</span>`;
  return renderTokens(ex.t.slice(0, a), settings) + blank + renderTokens(ex.t.slice(b), settings);
}
/** A choice label in the current script (choices are plain Japanese text). */
export const choiceLabel = (s, settings) => (settings.script === "romaji" && !hasKanji(s) ? romaji(toHiragana(s)) : s);
/** Shuffle (Fisher–Yates) a copy. */
export const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

// ---------- kanji links: every kanji in a word opens its page (kanji.html, data from Jisho via the server) ----------
export const kanjiHref = (k) => `/yomu/kanji.html?k=${encodeURIComponent(k)}`;
export const kanjiLinks = (s) => [...s].map((c) => (hasKanji(c) ? `<a class="klink" href="${kanjiHref(c)}" title="${esc(c)}: open its kanji page">${esc(c)}</a>` : esc(c))).join("");
/** A word in the current script: kanji (linked) with furigana over the kanji only, kana, or romaji. */
export function wordHtml(w, r, settings = state.settings, furigana = true) {
  if (settings.script === "romaji") return esc(romaji(r));
  if (settings.script === "kana" || !hasKanji(w)) return esc(settings.script === "kana" ? r : w);
  const html = ruby(w, r).replace(/<ruby>(.*?)<rt>/, (_, mid) => `<ruby>${kanjiLinks(mid.replace(/&amp;/g, "&"))}<rt>`);
  return furigana && settings.furigana !== "none" ? html : kanjiLinks(w);
}

// ---------- checking a typed answer, as forgiving as a teacher ----------
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const gloss = (s) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9' ]/g, " ").replace(/\b(to|a|an|the|be|one's|someone|something|sth)\b/g, " ").replace(/\s+/g, " ").trim();
/** Does an English answer match a word's meanings ("to eat, to have a meal")? Any listed sense counts; small typos and
 *  the leading "to"/"a" don't matter; a shorter answer counts if its words are the core of a short sense. */
export function meaningMatches(answer, meanings) {
  const a = gloss(answer);
  if (!a) return false;
  return meanings.split(/[;,/]/).map(gloss).filter(Boolean).some((g) => g === a || lev(g, a) <= Math.max(1, Math.floor(g.length / 6))
    || (a.length >= 3 && g.split(" ").length <= 3 && a.split(" ").every((w) => g.split(" ").includes(w)) && a.split(" ").length * 2 >= g.split(" ").length));
}
// romaji: Kunrei and wapuro spellings (si, tu, zi, sya…) to Hepburn, and long vowels written any way (ou, oo, o) count the same
const KUNREI = [["sya", "sha"], ["syu", "shu"], ["syo", "sho"], ["tya", "cha"], ["tyu", "chu"], ["tyo", "cho"], ["zya", "ja"], ["zyu", "ju"], ["zyo", "jo"], ["jya", "ja"], ["jyu", "ju"], ["jyo", "jo"], ["si", "shi"], ["ti", "chi"], ["tu", "tsu"], ["hu", "fu"], ["zi", "ji"]];
const roma = (s) => { let x = s.toLowerCase().replace(/[^a-z]/g, ""); for (const [k, h] of KUNREI) x = x.replaceAll(k, h); return x.replace(/shhi/g, "shi").replace(/chhi/g, "chi").replace(/tssu/g, "tsu").replace(/ou|oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee|ei/g, "e").replace(/nn/g, "n"); };
/** Does a Japanese answer (kana, kanji or romaji) match the word? */
export function readingMatches(answer, word, reading) {
  const a = answer.trim().replace(/\s+/g, "");
  if (!a) return false;
  if (a === word || toHiragana(a) === toHiragana(reading)) return true;
  return /^[a-z' -]+$/i.test(a) && roma(a) === roma(romaji(reading));
}
