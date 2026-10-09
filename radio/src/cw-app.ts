// The CW trainer page: Koch lessons, copy practice, sending practice with any key, and a chart.
import "./ham/ham.css";
import { CODE, KOCH, KeyDecoder, QSO, WORDS, callsign, ditMs, groups, schedule, score } from "./cw.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const blip = (text: string, mood = "happy", hop = 0) => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood, hop } }));

// ---------- settings and progress (this browser only) ----------
const KEY = "cw-trainer";
const S = { wpm: 20, eff: 10, tone: 600, vol: 50, keyType: "straight", swap: false, lesson: 1, maxLesson: 1 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const kochChars = () => KOCH.slice(0, S.lesson + 1);

// ---------- audio: one oscillator, a gain envelope with 5 ms edges (no clicks) ----------
let ctx: AudioContext | null = null, osc: OscillatorNode, gain: GainNode;
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    osc = ctx.createOscillator(); gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination); osc.start();
  }
  osc.frequency.value = S.tone;
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
const level = () => (S.vol / 100) ** 2 * 0.5;
const EDGE = 0.0017; // time constant: ~5 ms rise/fall
let playing = 0, blinkTimers: ReturnType<typeof setTimeout>[] = [];
const blipKey = (on: boolean) => dispatchEvent(new CustomEvent("blip:key", { detail: { on } })); // Blip's antenna keys along
function play(text: string, wpm = S.wpm, eff = Math.min(S.eff, S.wpm)) {
  const c = audio(), t0 = c.currentTime + 0.08, id = ++playing;
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setTargetAtTime(0, c.currentTime, EDGE);
  const { tones, duration } = schedule(text, wpm, eff);
  blinkTimers.forEach(clearTimeout); blinkTimers = [];
  const lead = (t0 - c.currentTime) * 1000;
  for (const [a, b] of tones) {
    gain.gain.setTargetAtTime(level(), t0 + a / 1000, EDGE); gain.gain.setTargetAtTime(0, t0 + b / 1000, EDGE);
    blinkTimers.push(setTimeout(() => blipKey(true), lead + a), setTimeout(() => blipKey(false), lead + b));
  }
  return new Promise<boolean>((done) => setTimeout(() => done(id === playing), duration + 120));
}
function stop() { playing++; blinkTimers.forEach(clearTimeout); blinkTimers = []; blipKey(false); if (ctx) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(0, ctx.currentTime, EDGE); } }
const keyOn = () => { blipKey(true); const c = audio(); gain.gain.cancelScheduledValues(c.currentTime); gain.gain.setTargetAtTime(level(), c.currentTime, EDGE); };
const keyOff = () => { blipKey(false); if (ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, EDGE); };

// ---------- settings UI ----------
const sliders = { wpm: (v: number) => `${v} WPM`, eff: (v: number) => `${Math.min(v, S.wpm)} WPM`, tone: (v: number) => `${v} Hz`, vol: (v: number) => `${v}%` } as const;
for (const [k, fmt] of Object.entries(sliders)) {
  const el = $<HTMLInputElement>(k), out = $(`${k}Out`);
  el.value = String((S as any)[k]); out.textContent = fmt((S as any)[k]);
  el.addEventListener("input", () => {
    (S as any)[k] = Number(el.value);
    if (k === "wpm" && S.eff > S.wpm) { S.eff = S.wpm; $<HTMLInputElement>("eff").value = String(S.eff); }
    for (const [k2, f2] of Object.entries(sliders)) $(`${k2}Out`).textContent = f2((S as any)[k2]);
    dec.dit = ditMs(S.wpm); save();
  });
}
$<HTMLSelectElement>("keyType").value = S.keyType;
$<HTMLSelectElement>("keyType").onchange = (e) => { S.keyType = (e.target as HTMLSelectElement).value; save(); padHelp(); };
$<HTMLInputElement>("swap").checked = S.swap;
$<HTMLInputElement>("swap").onchange = (e) => { S.swap = (e.target as HTMLInputElement).checked; save(); };

// ---------- modes ----------
let mode = "learn";
$("modes").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  mode = b.dataset.mode!;
  document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  for (const m of ["learn", "copy", "send", "chart"]) $(m).hidden = m !== mode;
  stop();
  if (mode === "send" && !target && $<HTMLSelectElement>("sendSource").value !== "free") newTarget();
});

// Shows a copy/send attempt character by character.
let last: { expected: string; accuracy: number; missed: string[] } | null = null;
function showResult(el: HTMLElement, expected: string, got: string) {
  const r = score(expected, got);
  last = { expected, accuracy: r.accuracy, missed: r.ops.filter((o) => o.op === "wrong" || o.op === "missed").map((o) => o.want!) };
  el.innerHTML = r.ops.map((o) => `<span class="${o.op}" title="${o.op === "wrong" ? `heard ${o.got}, was ${o.want}` : o.op}">${esc(o.op === "extra" ? o.got! : o.want!)}</span>`).join("")
    + `<div class="score">${Math.round(r.accuracy * 100)}% · ${r.errors} error${r.errors === 1 ? "" : "s"} · green = right, red = missed or wrong (hover to see), yellow = extra</div>`;
  return r;
}
function trouble() {
  if (!last?.missed.length) return "";
  const counts = new Map<string, number>();
  for (const c of last.missed) counts.set(c, (counts.get(c) ?? 0) + 1);
  const [c] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return `${c} is ${CODE[c]?.replace(/\./g, "di").replace(/-/g, "dah ").trim() ?? "?"}`;
}

// ---------- learn: Koch lessons ----------
let lessonText = "";
function renderLesson() {
  const chars = kochChars(), fresh = chars.at(-1)!;
  $("lessonNo").textContent = `${S.lesson} of ${KOCH.length - 1}: ${chars.length} characters`;
  $("koch").innerHTML = KOCH.map((c, i) => `<span class="${i < chars.length - 1 ? "on" : i === chars.length - 1 ? "new" : "off"}" title="${CODE[c]}">${esc(c)}</span>`).join("");
  $("newChar").textContent = fresh;
  $("newPattern").textContent = CODE[fresh].replace(/\./g, "·").replace(/-/g, "—");
  $("lessonPick").innerHTML = Array.from({ length: S.maxLesson }, (_, i) => `<option value="${i + 1}" ${i + 1 === S.lesson ? "selected" : ""}>${i + 1}: +${KOCH[i + 1]}</option>`).join("");
}
$<HTMLSelectElement>("lessonPick").onchange = (e) => { S.lesson = Number((e.target as HTMLSelectElement).value); save(); renderLesson(); };
$("hearNew").onclick = () => play(`${kochChars().at(-1)} ${kochChars().at(-1)} ${kochChars().at(-1)}`, S.wpm, S.wpm);
$("startLesson").onclick = async () => {
  lessonText = groups(kochChars());
  $<HTMLInputElement>("lessonCopy").value = ""; $("lessonResult").innerHTML = "";
  $<HTMLInputElement>("lessonCopy").focus();
  await play(lessonText);
};
$("replayLesson").onclick = () => lessonText && play(lessonText);
$("checkLesson").onclick = () => {
  if (!lessonText) return blip("Press Start first, then type what you hear!", "think");
  stop();
  const r = showResult($("lessonResult"), lessonText, $<HTMLInputElement>("lessonCopy").value);
  if (r.accuracy >= 0.9) {
    if (S.lesson === S.maxLesson && S.lesson < KOCH.length - 1) {
      S.maxLesson++; S.lesson++; save(); renderLesson();
      blip(`${Math.round(r.accuracy * 100)}%! New letter unlocked: ${kochChars().at(-1)}`, "happy", 8);
    } else blip(`${Math.round(r.accuracy * 100)}%. Clean copy!`, "happy", 5);
    lessonText = "";
  } else blip(`${Math.round(r.accuracy * 100)}%. Tip: ${trouble() || "keep going, it clicks with practice"}`, "think");
};
renderLesson();

// ---------- practice texts ----------
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), ALNUM = [...LETTERS, ..."0123456789".split("")];
function textFor(source: string) {
  switch (source) {
    case "koch": return groups(kochChars(), 4, 5);
    case "letters": return groups(LETTERS, 4, 5);
    case "numbers": return groups(ALNUM, 4, 5);
    case "words": return Array.from({ length: 6 }, () => pick(WORDS)).join(" ");
    case "calls": return Array.from({ length: 4 }, () => callsign()).join(" ");
    case "qso": return `${pick(QSO)} ${callsign()} ${pick(QSO)}`;
    default: return "";
  }
}

// ---------- copy ----------
let copyText = "";
$("playCopy").onclick = async () => {
  copyText = textFor($<HTMLSelectElement>("copySource").value);
  $<HTMLInputElement>("copyInput").value = ""; $("copyResult").innerHTML = "";
  $<HTMLInputElement>("copyInput").focus();
  await play(copyText);
};
$("replayCopy").onclick = () => copyText && play(copyText);
$("checkCopy").onclick = () => {
  if (!copyText) return blip("Press Play first!", "think");
  stop();
  const r = showResult($("copyResult"), copyText, $<HTMLInputElement>("copyInput").value);
  blip(r.accuracy >= 0.9 ? `${Math.round(r.accuracy * 100)}%! Try a notch faster?` : `${Math.round(r.accuracy * 100)}%. ${trouble() ? `Listen for ${trouble()}.` : ""}`, r.accuracy >= 0.9 ? "happy" : "think", r.accuracy >= 0.9 ? 5 : 0);
};

// ---------- send: straight key, iambic paddles, mouse/keyboard/touch/USB keys ----------
let target = "";
const dec = new KeyDecoder(S.wpm);
function newTarget() {
  target = textFor($<HTMLSelectElement>("sendSource").value);
  $("target").textContent = target || "Free keying: send anything, it's decoded below.";
  dec.reset(); renderDecoded(); $("sendResult").innerHTML = "";
}
$<HTMLSelectElement>("sendSource").onchange = newTarget;
$("newTarget").onclick = newTarget;
$("hearTarget").onclick = () => target && play(target);
$("clearSend").onclick = () => { dec.reset(); renderDecoded(); $("sendResult").innerHTML = ""; };
$("checkSend").onclick = () => {
  if (!target) return blip(`You sent: ${dec.text.trim() || "nothing yet"}`, "happy");
  const r = showResult($("sendResult"), target, dec.text);
  blip(r.accuracy >= 0.9 ? `${Math.round(r.accuracy * 100)}%! Nice fist.` : `${Math.round(r.accuracy * 100)}%. ${trouble() ? `Remember ${trouble()}.` : "Watch the spacing between letters."}`, r.accuracy >= 0.9 ? "happy" : "think", r.accuracy >= 0.9 ? 5 : 0);
};
let shown = "";
function renderDecoded() {
  const html = `${esc(dec.text)}<i>${dec.current.replace(/\./g, "·").replace(/-/g, "—")}</i>`;
  if (html !== shown) $("decoded").innerHTML = shown = html;
}
setInterval(() => { if (mode === "send") { dec.idle(performance.now()); renderDecoded(); } }, 40);

function padHelp() {
  $("padHelp").innerHTML = S.keyType === "straight"
    ? "Hold to key: mouse button, touch, <kbd>Space</kbd>, or your USB key"
    : "Paddles: left/right mouse button, <kbd>Z</kbd>/<kbd>X</kbd>, <kbd>[</kbd>/<kbd>]</kbd>, left/right <kbd>Ctrl</kbd>; on touch, left/right half of this pad";
}
padHelp();

const pad = $("pad");
let straightDown = false;
function straight(down: boolean) {
  if (down === straightDown) return;
  straightDown = down;
  const t = performance.now();
  pad.classList.toggle("down", down);
  if (down) { keyOn(); dec.down(t); } else { keyOff(); dec.up(t); }
  renderDecoded();
}

// Iambic keyer: holding a paddle repeats its element; squeezing both alternates. Mode B remembers a paddle
// pressed during an element and sends it next.
const paddles = { dit: false, dah: false, memDit: false, memDah: false, busy: false, last: "" as "" | "." | "-" };
function paddle(side: "dit" | "dah", down: boolean) {
  paddles[side] = down;
  if (!down) return;
  if (paddles.busy) { if (S.keyType === "iambicB") paddles[side === "dit" ? "memDit" : "memDah"] = true; }
  else nextElement();
}
function nextElement() {
  const wantDit = paddles.dit || paddles.memDit, wantDah = paddles.dah || paddles.memDah;
  paddles.memDit = paddles.memDah = false;
  const el: "." | "-" | null = wantDit && wantDah ? (paddles.last === "." ? "-" : ".") : wantDit ? "." : wantDah ? "-" : null;
  if (!el) { paddles.busy = false; pad.classList.remove("down"); return; }
  paddles.busy = true; paddles.last = el;
  const dit = ditMs(S.wpm);
  pad.classList.add("down"); keyOn();
  setTimeout(() => {
    keyOff(); pad.classList.remove("down");
    dec.element(el, performance.now()); renderDecoded();
    setTimeout(nextElement, dit);
  }, el === "." ? dit : 3 * dit);
}

/** One input: "left" (straight key / dit paddle) or "right" (dah paddle), pressed or released. */
function input(side: "left" | "right", down: boolean) {
  if (S.keyType === "straight") return straight(down);
  const s = S.swap ? (side === "left" ? "right" : "left") : side;
  paddle(s === "left" ? "dit" : "dah", down);
}
// Controls, Blip and the reader panel (both in shadow DOM) never count as key presses.
const isControl = (t: EventTarget | null) => t instanceof Element && !t.closest("#pad")
  && (!!t.shadowRoot || !!t.closest("button, a, input, select, textarea, label, summary, .tabs, .settings, .ihor-hud"));
const KEYS: Record<string, "left" | "right"> = { Space: "left", KeyZ: "left", BracketLeft: "left", ControlLeft: "left", KeyX: "right", BracketRight: "right", ControlRight: "right" };
for (const type of ["keydown", "keyup"] as const)
  addEventListener(type, (e) => {
    const side = KEYS[e.code];
    if (mode !== "send" || !side || e.repeat || (isControl(e.target) && e.target !== pad)) return;
    if (S.keyType === "straight" && side === "right") return; // one-lever straight keys use the left inputs
    e.preventDefault();
    input(side, type === "keydown");
  });
// Mice and USB keys that act like one: anywhere on the page while sending, except on controls.
addEventListener("mousedown", (e) => { if (mode === "send" && !isControl(e.target) && e.button <= 2 && e.button !== 1) { e.preventDefault(); input(e.button === 2 ? "right" : "left", true); } });
addEventListener("mouseup", (e) => { if (mode === "send" && e.button <= 2 && e.button !== 1) input(e.button === 2 ? "right" : "left", false); });
addEventListener("contextmenu", (e) => { if (mode === "send" && !isControl(e.target)) e.preventDefault(); });
// Touch and pen on the pad: straight key, or left/right half as paddles.
pad.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  e.preventDefault(); pad.setPointerCapture(e.pointerId);
  const side = e.clientX - pad.getBoundingClientRect().left < pad.clientWidth / 2 ? "left" : "right";
  (pad as any)[`side${e.pointerId}`] = side;
  input(S.keyType === "straight" ? "left" : side, true);
});
for (const t of ["pointerup", "pointercancel"]) pad.addEventListener(t, (e) => {
  const pe = e as PointerEvent;
  if (pe.pointerType === "mouse") return;
  input(S.keyType === "straight" ? "left" : (pad as any)[`side${pe.pointerId}`] ?? "left", false);
});

// ---------- chart ----------
$("chartGrid").innerHTML = [...KOCH, ...Object.keys(CODE).filter((c) => !KOCH.includes(c))]
  .map((c) => `<button data-c="${esc(c)}" aria-label="Play ${esc(c)}"><b>${esc(c)}</b><span>${CODE[c].replace(/\./g, "·").replace(/-/g, "—")}</span></button>`).join("");
$("chartGrid").addEventListener("click", (e) => { const c = (e.target as HTMLElement).closest("button")?.dataset.c; if (c) play(c, S.wpm, S.wpm); });

// ---------- what Blip sees here ----------
(window as any).blipContext = () => ({
  page: "CW trainer", mode, settings: { characterWpm: S.wpm, effectiveWpm: Math.min(S.eff, S.wpm), toneHz: S.tone, key: S.keyType },
  kochLesson: S.lesson, lettersLearned: kochChars().join(" "), newestLetter: kochChars().at(-1), lastCheck: last,
  sending: mode === "send" ? { target, decodedSoFar: dec.text.trim() } : undefined,
  codeTable: Object.fromEntries(kochChars().map((c) => [c, CODE[c]])),
});
