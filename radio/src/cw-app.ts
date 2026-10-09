// The CW trainer page: Koch lessons, copy practice, sending (a keyboard keyer, or by hand with any key), and a chart.
// One player bar and three keys run everything: Enter (play / check / next), Shift+Enter (replay), Esc (stop).
import "./ham/ham.css";
import { CODE, KOCH, KeyDecoder, QSO, WORDS, callsign, ditMs, groups, schedule, score, spacing } from "./cw.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const blip = (text: string, mood = "happy", hop = 0) => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood, hop } }));

// ---------- settings, progress and per-letter scores (this browser only) ----------
const KEY = "cw-trainer";
const S = { wpm: 20, eff: 10, tone: 600, vol: 50, keyType: "straight", swap: false, lesson: 1, maxLesson: 1, reveal: false, how: "type", stats: {} as Record<string, [number, number]> };
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
// What's playing now, for the progress bar and the letters-as-they-play line.
let now: { chars: { c: string; at: number; end: number }[]; duration: number; t0: number; reveal: boolean } | null = null;
function play(text: string, wpm = S.wpm, eff = Math.min(S.eff, S.wpm), reveal = false) {
  const c = audio(), t0 = c.currentTime + 0.08, id = ++playing;
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setTargetAtTime(0, c.currentTime, EDGE);
  const { tones, chars, duration } = schedule(text, wpm, eff);
  blinkTimers.forEach(clearTimeout); blinkTimers = [];
  const lead = (t0 - c.currentTime) * 1000;
  for (const [a, b] of tones) {
    gain.gain.setTargetAtTime(level(), t0 + a / 1000, EDGE); gain.gain.setTargetAtTime(0, t0 + b / 1000, EDGE);
    blinkTimers.push(setTimeout(() => blipKey(true), lead + a), setTimeout(() => blipKey(false), lead + b));
  }
  now = { chars, duration, t0: performance.now() + lead, reveal };
  return new Promise<boolean>((done) => setTimeout(() => { if (id === playing) now = null; done(id === playing); }, duration + 120));
}
function stop() { playing++; now = null; blinkTimers.forEach(clearTimeout); blinkTimers = []; blipKey(false); if (ctx) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(0, ctx.currentTime, EDGE); } }
const keyOn = () => { blipKey(true); const c = audio(); gain.gain.cancelScheduledValues(c.currentTime); gain.gain.setTargetAtTime(level(), c.currentTime, EDGE); };
const keyOff = () => { blipKey(false); if (ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, EDGE); };

// Progress bar, "letter 7 of 25", and (training wheels) each letter shown once it has played.
function tick() {
  const n = now, t = n ? performance.now() - n.t0 : 0;
  const letters = n ? n.chars.filter((x) => x.c !== " ") : [], done = letters.filter((x) => x.end <= t).length;
  $("progBar").style.width = n ? `${Math.min(100, (100 * t) / n.duration)}%` : "0";
  $("progText").textContent = n ? `letter ${Math.min(done + 1, letters.length)} of ${letters.length}` : round.state === "playing" ? "your turn: type, then Enter" : "ready";
  if (n?.reveal) $("revealLine").innerHTML = n.chars.filter((x) => x.at <= t).map((x, i, a) => (i === a.length - 1 && x.end > t ? `<b>${esc(x.c)}</b>` : esc(x.c))).join("");
  if (!n && round.state === "playing") round.state = "answer";
  requestAnimationFrame(tick);
}

// ---------- settings UI ----------
const sliders = { wpm: (v: number) => `${v} WPM`, eff: (v: number) => `${Math.min(v, S.wpm)} WPM`, tone: (v: number) => `${v} Hz`, vol: (v: number) => `${v}%` } as const;
const setSum = () => ($("setSum").textContent = `${S.wpm} WPM letters, ${Math.min(S.eff, S.wpm)} WPM overall, ${S.tone} Hz, ${S.keyType === "straight" ? "straight key" : "paddles"}`);
for (const [k, fmt] of Object.entries(sliders)) {
  const el = $<HTMLInputElement>(k), out = $(`${k}Out`);
  el.value = String((S as any)[k]); out.textContent = fmt((S as any)[k]);
  el.addEventListener("input", () => {
    (S as any)[k] = Number(el.value);
    if (k === "wpm" && S.eff > S.wpm) { S.eff = S.wpm; $<HTMLInputElement>("eff").value = String(S.eff); }
    for (const [k2, f2] of Object.entries(sliders)) $(`${k2}Out`).textContent = f2((S as any)[k2]);
    dec.dit = ditMs(S.wpm); save(); setSum();
  });
}
$<HTMLSelectElement>("keyType").value = S.keyType;
$<HTMLSelectElement>("keyType").onchange = (e) => { S.keyType = (e.target as HTMLSelectElement).value; save(); padHelp(); setSum(); };
$<HTMLInputElement>("swap").checked = S.swap;
$<HTMLInputElement>("swap").onchange = (e) => { S.swap = (e.target as HTMLInputElement).checked; save(); };
$<HTMLInputElement>("reveal").checked = S.reveal;
$<HTMLInputElement>("reveal").onchange = (e) => { S.reveal = (e.target as HTMLInputElement).checked; save(); };

// ---------- modes ----------
let mode = "learn";
function setMode(m: string) {
  mode = m;
  document.querySelectorAll<HTMLButtonElement>("#modes button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === m)));
  for (const k of ["learn", "copy", "send", "chart"]) $(k).hidden = k !== m;
  $("answer").hidden = !["learn", "copy"].includes(m);
  $("player").hidden = m === "chart" || (m === "send" && S.how === "type");
  stop(); typeStop(); round.state = "idle"; round.text = ""; $("result").innerHTML = ""; $("revealLine").innerHTML = ""; goLabel();
  if (m === "send") { setHow(S.how); if (S.how === "key" && !target && $<HTMLSelectElement>("sendSource").value !== "free") newTarget(); }
  if (m === "learn" || m === "copy") $("copyInput").focus();
}
$("modes").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) setMode(b.dataset.mode!); });

// Shows a copy/send attempt character by character, and adds it to the per-letter scores.
let last: { expected: string; accuracy: number; missed: string[] } | null = null;
function showResult(el: HTMLElement, expected: string, got: string, count = true) {
  const r = score(expected, got);
  last = { expected, accuracy: r.accuracy, missed: r.ops.filter((o) => o.op === "wrong" || o.op === "missed").map((o) => o.want!) };
  if (count) { for (const o of r.ops) if (o.want) { const st = (S.stats[o.want] ??= [0, 0]); st[1]++; if (o.op === "ok") st[0]++; } save(); renderChart(); }
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
function renderLesson() {
  const chars = kochChars(), fresh = chars.at(-1)!;
  $("lessonNo").textContent = `${S.lesson} of ${KOCH.length - 1}: ${chars.length} characters`;
  $("koch").innerHTML = KOCH.map((c, i) => `<span class="${i < chars.length - 1 ? "on" : i === chars.length - 1 ? "new" : "off"}" title="${CODE[c]}">${esc(c)}</span>`).join("");
  $("newChar").textContent = fresh;
  $("newPattern").textContent = CODE[fresh].replace(/\./g, "·").replace(/-/g, "—");
  $("lessonPick").innerHTML = Array.from({ length: S.maxLesson }, (_, i) => `<option value="${i + 1}" ${i + 1 === S.lesson ? "selected" : ""}>${i + 1}: +${KOCH[i + 1]}</option>`).join("");
}
$<HTMLSelectElement>("lessonPick").onchange = (e) => { S.lesson = Number((e.target as HTMLSelectElement).value); save(); renderLesson(); };
$("hearNew").onclick = () => { const c = kochChars().at(-1); play(`${c} ${c} ${c}`, S.wpm, S.wpm); $("copyInput").focus(); };
renderLesson();

// ---------- practice texts ----------
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), ALNUM = [...LETTERS, ..."0123456789".split("")];
const ratio = (c: string) => { const [ok, n] = S.stats[c] ?? [0, 0]; return n ? ok / n : 1; };
function textFor(source: string) {
  switch (source) {
    case "koch": return groups(kochChars(), 4, 5);
    case "weak": { const tried = Object.keys(S.stats).filter((c) => CODE[c] && S.stats[c][1] >= 3).sort((a, b) => ratio(a) - ratio(b)).slice(0, 5);
      return groups(tried.length >= 2 ? tried : kochChars(), 4, 5); }
    case "letters": return groups(LETTERS, 4, 5);
    case "numbers": return groups(ALNUM, 4, 5);
    case "words": return Array.from({ length: 6 }, () => pick(WORDS)).join(" ");
    case "calls": return Array.from({ length: 4 }, () => callsign()).join(" ");
    case "qso": return `${pick(QSO)} ${callsign()} ${pick(QSO)}`;
    case "own": return $<HTMLTextAreaElement>("ownText").value.toUpperCase().replace(/[^A-Z0-9.,?/=+'@\s-]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
    default: return "";
  }
}
$<HTMLSelectElement>("copySource").onchange = (e) => { $("ownText").hidden = (e.target as HTMLSelectElement).value !== "own"; };

// ---------- one round in Learn and Copy: play → type → check → next ----------
const round = { state: "idle" as "idle" | "playing" | "answer" | "checked", text: "" };
function goLabel() {
  const label = mode === "send" ? "Hear the text" : round.state === "idle" || round.state === "checked" ? (round.text ? "Next" : "Play") : "Check";
  $("goLabel").textContent = label;
}
async function newRound() {
  const text = mode === "learn" ? groups(kochChars()) : textFor($<HTMLSelectElement>("copySource").value);
  if (!text) return blip("Type some text to practice on first.", "think");
  round.text = text; round.state = "playing";
  $<HTMLInputElement>("copyInput").value = ""; $("result").innerHTML = ""; $("revealLine").innerHTML = "";
  $("copyInput").focus(); goLabel();
  await play(text, S.wpm, Math.min(S.eff, S.wpm), S.reveal);
}
function check() {
  stop(); round.state = "checked"; goLabel();
  const r = showResult($("result"), round.text, $<HTMLInputElement>("copyInput").value);
  $("revealLine").textContent = round.text;
  const pct = Math.round(r.accuracy * 100);
  if (mode === "learn") {
    if (r.accuracy >= 0.9 && S.lesson === S.maxLesson && S.lesson < KOCH.length - 1) {
      S.maxLesson++; S.lesson++; save(); renderLesson();
      blip(`${pct}%! New letter unlocked: ${kochChars().at(-1)}. Press Enter for a drill with it.`, "happy", 8);
    } else blip(r.accuracy >= 0.9 ? `${pct}%. Clean copy!` : `${pct}%. Tip: ${trouble() || "keep going, it clicks with practice"}`, r.accuracy >= 0.9 ? "happy" : "think", r.accuracy >= 0.9 ? 5 : 0);
  } else blip(r.accuracy >= 0.9 ? `${pct}%! Try a notch faster?` : `${pct}%. ${trouble() ? `Listen for ${trouble()}.` : ""}`, r.accuracy >= 0.9 ? "happy" : "think", r.accuracy >= 0.9 ? 5 : 0);
}
function go() {
  if (mode === "send") return S.how === "key" ? checkSend() : undefined;
  if (mode === "chart") return;
  if ((round.state === "playing" || round.state === "answer") && $<HTMLInputElement>("copyInput").value.trim()) return check();
  if (round.state === "playing" || round.state === "answer") return blip("Type what you heard first (or Esc to stop).", "think");
  newRound();
}
function replay() {
  if (mode === "send") { if (target) play(target); return; }
  if (round.text) { const checked = round.state === "checked"; play(round.text, S.wpm, Math.min(S.eff, S.wpm), S.reveal && !checked); if (!checked) round.state = "playing"; goLabel(); }
}
function stopAll() { stop(); typeStop(); if (round.state === "playing") round.state = "answer"; goLabel(); }
$("go").onclick = go; $("replay").onclick = replay; $("stopBtn").onclick = stopAll;
// The three keys work everywhere, including while typing in the answer box.
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); stopAll(); return; }
  if (e.key !== "Enter" || e.isComposing) return;
  const t = e.target as HTMLElement;
  if (t.id === "typeInput" || t.id === "ownText" && !e.ctrlKey && !e.metaKey) return; // their own Enter
  if (t.tagName === "BUTTON" || t.tagName === "SELECT" || t.tagName === "A" || t.tagName === "SUMMARY") return; // Enter on a control presses it
  e.preventDefault();
  e.shiftKey ? replay() : go();
});
$("copyInput").addEventListener("input", () => { if (round.state === "answer" || round.state === "playing") goLabel(); });

// ---------- send, way 1: type it (a keyboard keyer) ----------
// What's in the box is sent in order; `sentTo` marks how much has gone out. Backspace can only take back unsent text.
let sentTo = 0, typing = 0;
const typeBox = () => $<HTMLInputElement>("typeInput");
function renderSent(cur = -1) {
  const v = typeBox().value.toUpperCase();
  $("sentLine").innerHTML = `<span class="done">${esc(v.slice(0, cur >= 0 ? cur : sentTo))}</span>${cur >= 0 ? `<span class="now">${esc(v[cur] ?? "")}</span>` : ""}<span class="todo">${esc(v.slice(cur >= 0 ? cur + 1 : sentTo))}</span>`;
}
async function typeLoop() {
  if (typing) return;
  const id = (typing = Math.random());
  const { charGap, wordGap } = spacing(S.wpm, Math.min(S.eff, S.wpm));
  while (typing === id && sentTo < typeBox().value.length) {
    const i = sentTo, c = typeBox().value[i].toUpperCase();
    renderSent(i);
    if (c === " ") await new Promise((r) => setTimeout(r, wordGap - charGap));
    else if (CODE[c]) { if (!(await play(c, S.wpm, S.wpm))) break; await new Promise((r) => setTimeout(r, charGap)); }
    if (typing !== id) break;
    sentTo = i + 1; renderSent();
  }
  if (typing === id) typing = 0;
}
function typeStop() { typing = 0; stop(); sentTo = typeBox().value.length; renderSent(); }
typeBox().addEventListener("input", () => {
  if (typeBox().value.length < sentTo) sentTo = typeBox().value.length; // took back everything unsent, and then some: keep what's in the box
  renderSent(); typeLoop();
});
typeBox().addEventListener("keydown", (e) => {
  if (e.key === "Backspace" && typeBox().selectionStart! <= sentTo && typeBox().selectionEnd === typeBox().selectionStart) e.preventDefault(); // can't unsend
  if (e.key === "Enter") { e.preventDefault(); if (!typing) { typeBox().value = ""; sentTo = 0; renderSent(); } }
});
function setHow(how: string) {
  S.how = how; save();
  document.querySelectorAll<HTMLButtonElement>("#sendHow button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.how === how)));
  $("typeBox").hidden = how !== "type"; $("keyBox").hidden = how !== "key";
  $("player").hidden = how === "type";
  if (how === "type") typeBox().focus(); else { typeStop(); if (!target && $<HTMLSelectElement>("sendSource").value !== "free") newTarget(); $("pad").focus(); }
  goLabel();
}
$("sendHow").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) setHow(b.dataset.how!); });

// ---------- send, way 2: key it by hand ----------
let target = "";
const dec = new KeyDecoder(S.wpm);
function newTarget() {
  target = textFor($<HTMLSelectElement>("sendSource").value);
  $("target").textContent = target || "Free keying: send anything, it's decoded below.";
  dec.reset(); renderDecoded(); $("sendResult").innerHTML = "";
}
$<HTMLSelectElement>("sendSource").onchange = newTarget;
$("newTarget").onclick = newTarget;
$("clearSend").onclick = () => { dec.reset(); renderDecoded(); $("sendResult").innerHTML = ""; };
function checkSend() {
  if (!target) return blip(`You sent: ${dec.text.trim() || "nothing yet"}`, "happy");
  const r = showResult($("sendResult"), target, dec.text, false);
  blip(r.accuracy >= 0.9 ? `${Math.round(r.accuracy * 100)}%! Nice fist.` : `${Math.round(r.accuracy * 100)}%. ${trouble() ? `Remember ${trouble()}.` : "Watch the spacing between letters."}`, r.accuracy >= 0.9 ? "happy" : "think", r.accuracy >= 0.9 ? 5 : 0);
}
let shown = "";
function renderDecoded() {
  const html = `${esc(dec.text)}<i>${dec.current.replace(/\./g, "·").replace(/-/g, "—")}</i>`;
  if (html !== shown) $("decoded").innerHTML = shown = html;
}
setInterval(() => { if (mode === "send" && S.how === "key") { dec.idle(performance.now()); renderDecoded(); } }, 40);

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
// Clicks on controls, Blip and the reader panel (both in shadow DOM) never count as key presses.
const isControl = (t: EventTarget | null) => t instanceof Element && !t.closest("#pad")
  && (!!t.shadowRoot || !!t.closest("button, a, input, select, textarea, label, summary, .tabs, .settings, .player, .ihor-hud"));
// Keys count everywhere except while typing into a text field (a focused button must not swallow Space).
const isTyping = (t: EventTarget | null) => t instanceof Element && (!!t.shadowRoot || !!t.closest("input:not([type=checkbox]):not([type=range]), textarea, select, [contenteditable]"));
const keying = () => mode === "send" && S.how === "key";
const KEYS: Record<string, "left" | "right"> = { Space: "left", KeyZ: "left", BracketLeft: "left", ControlLeft: "left", KeyX: "right", BracketRight: "right", ControlRight: "right" };
for (const type of ["keydown", "keyup"] as const)
  addEventListener(type, (e) => {
    const side = KEYS[e.code];
    if (!keying() || !side || e.repeat || isTyping(e.target)) return;
    if (S.keyType === "straight" && side === "right") return; // one-lever straight keys use the left inputs
    e.preventDefault();
    input(side, type === "keydown");
  });
// Mice and USB keys that act like one: anywhere on the page while sending, except on controls.
addEventListener("mousedown", (e) => { if (keying() && !isControl(e.target) && e.button <= 2 && e.button !== 1) { e.preventDefault(); input(e.button === 2 ? "right" : "left", true); } });
addEventListener("mouseup", (e) => { if (keying() && e.button <= 2 && e.button !== 1) input(e.button === 2 ? "right" : "left", false); });
addEventListener("contextmenu", (e) => { if (keying() && !isControl(e.target)) e.preventDefault(); });
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
function renderChart() {
  $("chartGrid").innerHTML = [...KOCH, ...Object.keys(CODE).filter((c) => !KOCH.includes(c))].map((c) => {
    const [ok, n] = S.stats[c] ?? [0, 0], p = n >= 3 ? ok / n : null;
    return `<button data-c="${esc(c)}" aria-label="Play ${esc(c)}${p != null ? `, copied right ${Math.round(p * 100)}%` : ""}" title="${p != null ? `${ok} of ${n} right` : "not enough tries yet"}"><b>${esc(c)}</b><span>${CODE[c].replace(/\./g, "·").replace(/-/g, "—")}</span><i><u style="width:${p != null ? Math.round(p * 100) : 0}%;background:${p == null ? "transparent" : p >= 0.9 ? "var(--green)" : p >= 0.7 ? "var(--yellow)" : "var(--red)"}"></u></i></button>`;
  }).join("");
}
renderChart();
$("chartGrid").addEventListener("click", (e) => { const c = (e.target as HTMLElement).closest("button")?.dataset.c; if (c) play(c, S.wpm, S.wpm); });
addEventListener("keydown", (e) => { const c = e.key.toUpperCase(); if (mode === "chart" && !e.metaKey && !e.ctrlKey && !e.altKey && CODE[c] && !isTyping(e.target)) { e.preventDefault(); play(c, S.wpm, S.wpm); } });
$("resetStats").onclick = () => { S.stats = {}; save(); renderChart(); };

setSum(); setMode("learn"); requestAnimationFrame(tick);

// ---------- what Blip can do here ----------
(window as any).blipActions = {
  play_morse: { label: "played Morse", description: "Play text in Morse code at the visitor's speed settings (letters, numbers, . , ? / =).", parameters: { text: { type: "string", description: "What to send, e.g. CQ or a word" } },
    run: ({ text }: { text: string }) => play(String(text ?? "").toUpperCase().slice(0, 80)) },
};

// ---------- what Blip sees here ----------
(window as any).blipContext = () => ({
  page: "CW trainer", mode, settings: { characterWpm: S.wpm, effectiveWpm: Math.min(S.eff, S.wpm), toneHz: S.tone, key: S.keyType },
  kochLesson: S.lesson, lettersLearned: kochChars().join(" "), newestLetter: kochChars().at(-1), lastCheck: last,
  sending: mode === "send" ? (S.how === "key" ? { target, decodedSoFar: dec.text.trim() } : { typed: typeBox().value }) : undefined,
  weakestLetters: Object.keys(S.stats).filter((c) => S.stats[c][1] >= 3).sort((a, b) => ratio(a) - ratio(b)).slice(0, 5),
  codeTable: Object.fromEntries(kochChars().map((c) => [c, CODE[c]])),
});
