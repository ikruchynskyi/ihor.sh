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
const DEFAULTS = { settings: { script: "kanji", furigana: "all", translation: true, rate: 0.85 }, known: {}, srs: {}, done: {}, xp: 0, streak: { last: "", days: 0 }, start: null };
export const state = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return structuredClone(DEFAULTS); } })();
state.settings = { ...DEFAULTS.settings, ...state.settings };
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

// ---------- speech ----------
let jaVoice = null;
const pickVoice = () => (jaVoice = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith("ja")).sort((a, b) => Number(/Google|Kyoko|Otoya|O-ren/i.test(b.name)) - Number(/Google|Kyoko|Otoya|O-ren/i.test(a.name)))[0] ?? null);
if ("speechSynthesis" in W) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export const canSpeak = () => "speechSynthesis" in W && !!jaVoice;
/** Read Japanese aloud (the browser's Japanese voice). Resolves when done. */
export function speak(text, rate = state.settings.rate) {
  return new Promise((done) => {
    if (!("speechSynthesis" in W)) return done(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = rate; if (jaVoice) u.voice = jaVoice;
    u.onend = () => done(true); u.onerror = () => done(false);
    speechSynthesis.speak(u);
    dispatchEvent(new CustomEvent("blip:key", { detail: { on: true } }));
    u.addEventListener("end", () => dispatchEvent(new CustomEvent("blip:key", { detail: { on: false } })));
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
export function settingsBar(el, onChange) {
  const s = state.settings;
  el.innerHTML = `<div class="yset" role="group" aria-label="Display">
    <span>Script</span>${[["kanji", "漢字 + furigana"], ["kana", "かな only"], ["romaji", "Romaji"]].map(([v, l]) => `<button data-s="${v}" aria-pressed="${s.script === v}">${l}</button>`).join("")}
    <label>Furigana <select id="yfuri"><option value="all">on all kanji</option><option value="unknown">only on words I don't know</option><option value="none">off</option></select></label>
    <label><input type="checkbox" id="ytr" ${s.translation ? "checked" : ""}> English</label>
    <label>Voice speed <input type="range" id="yrate" min="0.5" max="1.2" step="0.05" value="${s.rate}"></label>
    <span class="yxp" title="XP and streak">★ ${state.xp} XP · 🔥 ${state.streak.days} day${state.streak.days === 1 ? "" : "s"}</span></div>`;
  el.querySelector("#yfuri").value = s.furigana;
  el.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { s.script = b.dataset.s; save(); settingsBar(el, onChange); onChange?.(); }));
  el.querySelector("#yfuri").onchange = (e) => { s.furigana = e.target.value; save(); onChange?.(); };
  el.querySelector("#ytr").onchange = (e) => { s.translation = e.target.checked; save(); onChange?.(); };
  el.querySelector("#yrate").oninput = (e) => { s.rate = Number(e.target.value); save(); };
  addEventListener("yomu:xp", () => { const x = el.querySelector(".yxp"); if (x) x.textContent = `★ ${state.xp} XP · 🔥 ${state.streak.days} day${state.streak.days === 1 ? "" : "s"}`; });
}

export const blip = (text, mood = "happy", hop = 0) => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood, hop } }));

// ---------- the full JLPT decks (data/*.json, built by src/data.py and src/grammar.py) ----------
const loaded = {};
export const data = (name) => (loaded[name] ??= fetch(`/yomu/data/${name}.json`).then((r) => r.json()));
export const LEVELS = ["N5", "N4", "N3"];
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
