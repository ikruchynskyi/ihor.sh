// Blip: the ihor.sh companion. Its body is a d3-force soft body (a ring of nodes on springs around a
// core, plus a two-segment antenna). It idles, watches the cursor, clicks and selections, can be
// dragged, thrown and poked, and answers questions about the current page through /api/ask.
const d3 = await import("https://cdn.jsdelivr.net/npm/d3@7/+esm");

// Fonts must live in the document (an @font-face inside a shadow root isn't picked up).
document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap">`);

const store = (s) => ({ get: (k) => { try { return s().getItem(k); } catch { return null; } }, set: (k, v) => { try { s().setItem(k, v); } catch {} } });
const session = store(() => sessionStorage), local = store(() => localStorage);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const QUIPS = [
  "FM wiggles the frequency. AM wiggles the loudness. I wiggle everything.",
  "Psst. You can drag me. Gently.",
  "λ = 300 / f. My favorite formula. In MHz and meters.",
  "Every radio here is math in TypeScript. No magic. Okay, a little magic.",
  "Did you know a $30 USB dongle can hear airplanes?",
  "Select any text and I'll explain it.",
  "Beep boop. That's Morse for… nothing, actually.",
];
const MOUTH = {
  idle: "M-5,9 Q0,13 5,9", happy: "M-8,7 Q0,18 8,7 Z", surprised: "M-3,10 a3,3.5 0 1,0 6,0 a3,3.5 0 1,0 -6,0",
  sleep: "M-4,10 L4,10", dizzy: "M-8,11 q2,-3 4,0 t4,0 t4,0 t4,0", think: "M-4,11 Q1,9 5,10", annoyed: "M-6,12 Q0,7 6,12",
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.stage { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.blip { pointer-events: auto; cursor: grab; touch-action: none; outline: none; }
.blip:active { cursor: grabbing; }
.blip:focus-visible .body { stroke: #4de1ff; stroke-width: 4; }
.body { stroke: #2a1405; stroke-width: 3; stroke-linejoin: round; }
.antenna { fill: none; stroke: #2a1405; stroke-width: 3; stroke-linecap: round; }
.tip { fill: #ff5c8a; stroke: #2a1405; stroke-width: 2.5; }
.tip.on { fill: #ffd0dc; filter: drop-shadow(0 0 6px #ff5c8a); }
.hat { pointer-events: none; }
.arm-line { fill: none; stroke: #2a1405; stroke-width: 4; stroke-linecap: round; }
.hand { fill: #ffb347; stroke: #2a1405; stroke-width: 2.5; }
.party .body { animation: party 0.6s linear infinite; }
@keyframes party { to { filter: hue-rotate(360deg); } }
.shadow { fill: rgba(0,0,0,.35); }
.white { fill: #fff; stroke: #2a1405; stroke-width: 2; }
.pupil { fill: #14080a; }
.ball { transform-box: fill-box; transform-origin: center; transition: transform .08s; }
.face.blink .ball { transform: scaleY(.1); }
.mood-surprised .ball { transform: scale(1.2); }
.e { fill: none; stroke: #2a1405; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; display: none; }
.mood-happy .ball, .mood-sleep .ball, .mood-dizzy .ball, .mood-annoyed .ball { display: none; }
.mood-happy .e-happy, .mood-sleep .e-shut, .mood-dizzy .e-x, .mood-annoyed .e-squint { display: inline; }
.cheek { fill: #ff7a7a; opacity: .55; }
.mouth { fill: none; stroke: #2a1405; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.mouth.happy, .mouth.surprised { fill: #6b1d2a; }
.ring { fill: none; stroke: #ff5c8a; stroke-width: 2; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; animation: ring 1.1s ease-out forwards; }
@keyframes ring { to { transform: scale(7); opacity: 0; } }
.z { font: 12px "Press Start 2P", monospace; fill: #cfe3ff; animation: z 2.2s ease-out forwards; }
@keyframes z { to { transform: translate(16px, -46px); opacity: 0; } }

.bubble { position: fixed; left: 0; top: 0; max-width: min(250px, calc(100vw - 32px)); padding: 6px 12px 8px; background: #fff8e7; color: #1b1020; font: 21px/1 "VT323", monospace; pointer-events: none; box-shadow: 0 -3px 0 #1b1020, 0 3px 0 #1b1020, -3px 0 0 #1b1020, 3px 0 0 #1b1020, 4px 7px 0 rgba(0,0,0,.35); }
.bubble::after { content: ""; position: absolute; left: var(--tail, 50%); bottom: -9px; width: 9px; height: 9px; margin-left: -4px; background: #fff8e7; box-shadow: 3px 0 0 #1b1020, -3px 0 0 #1b1020, 0 3px 0 #1b1020; }
.bubble.clickable { pointer-events: auto; cursor: pointer; }
.bubble.clickable:hover { background: #fff; }
.rest { visibility: hidden; }
.cta { display: block; margin-top: 6px; font: 8px "Press Start 2P", monospace; color: #d6336c; animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.scrim { position: fixed; inset: 0; background: rgba(5,8,20,.45); pointer-events: auto; }
.panel { position: fixed; left: 16px; bottom: 16px; width: min(560px, calc(100vw - 32px)); max-height: min(72vh, 640px); display: flex; flex-direction: column; background: #0d1226; color: #e8edff; pointer-events: auto; font: 21px/1.2 "VT323", monospace; border: 4px solid #e8edff; box-shadow: inset 0 0 0 4px #3b4bb0, 10px 10px 0 rgba(0,0,0,.55); animation: rise .2s steps(4); }
@keyframes rise { from { transform: translateY(24px); opacity: 0; } }
.panel header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 4px solid #3b4bb0; }
.panel h2 { margin: 0; font: 12px "Press Start 2P", monospace; color: #ffb347; }
.panel header p { margin: 4px 0 0; font: 8px/1.4 "Press Start 2P", monospace; color: #7f8bc4; }
.portrait { width: 40px; height: 40px; flex: none; }
.x { margin-left: auto; align-self: flex-start; }
.log { flex: 1; overflow-y: auto; padding: 14px 16px 4px; min-height: 140px; }
.msg { margin: 0 0 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg .who { display: block; margin-bottom: 4px; font: 8px "Press Start 2P", monospace; color: #4de1ff; }
.msg.you .who { color: #5cff9d; }
.msg b:not(.who) { color: #fff; }
.msg .used { display: block; margin-top: 6px; font-size: 16px; color: #7f8bc4; }
.msg.err { color: #ff8fa8; }
.msg a { color: #ffb347; }
.msg code { background: #1e2650; padding: 0 4px; }
.dots::after { content: "."; animation: dots 1.2s steps(3) infinite; }
@keyframes dots { 33% { content: ".."; } 66% { content: "..."; } }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
form { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-top: 4px solid #3b4bb0; }
.caret { color: #5cff9d; animation: blink 1s steps(2) infinite; }
input { flex: 1; min-width: 0; background: none; border: 0; color: inherit; font: inherit; outline: none; caret-color: #5cff9d; }
input::placeholder { color: #5d679b; }
button { font: 9px "Press Start 2P", monospace; color: #1b1020; background: #ffb347; border: 0; padding: 10px 12px; box-shadow: 0 4px 0 #b86b1e; cursor: pointer; }
button:active { transform: translateY(2px); box-shadow: 0 2px 0 #b86b1e; }
button:focus-visible, input:focus-visible { outline: 3px solid #4de1ff; outline-offset: 2px; }
.chips button { color: #e8edff; background: #1e2650; box-shadow: 0 4px 0 #3b4bb0; text-align: left; line-height: 1.5; }
.panel footer { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; padding: 4px 14px 12px; font: 8px "Press Start 2P", monospace; color: #7f8bc4; }
.panel footer a, .panel footer button { color: #7f8bc4; background: none; box-shadow: none; padding: 4px 0; text-decoration: none; font: inherit; }
.panel footer a:hover, .panel footer button:hover { color: #ffb347; }
.tab { position: fixed; right: 12px; bottom: 0; pointer-events: auto; }
@media (max-width: 600px) { .panel { left: 8px; bottom: 8px; width: calc(100vw - 16px); } }
`;

const eye = (s) => `<g transform="translate(${s * 10},-4)">
  <g class="ball"><ellipse class="white" rx="6.5" ry="8"/><g class="look"><circle class="pupil" r="3.6"/></g></g>
  <path class="e e-happy" d="M-5,2 Q0,-6 5,2"/><path class="e e-shut" d="M-5,1 L5,1"/>
  <path class="e e-x" d="M-4,-4 L4,4 M4,-4 L-4,4"/><path class="e e-squint" d="M${-4 * s},-4 L${3 * s},0 L${-4 * s},4"/></g>`;

const host = document.createElement("div");
host.id = "blip";
host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000";
document.body.append(host);
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>${CSS}</style>
<svg class="stage">
  <defs><radialGradient id="skin" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#ffb347"/><stop offset="1" stop-color="#f0782a"/></radialGradient></defs>
  <ellipse class="shadow" rx="30" ry="5"/>
  <g class="fx"></g>
  <g class="blip" tabindex="0" role="button" aria-label="Blip, the site companion. Press Enter to ask a question.">
    <path class="antenna"/><circle class="tip" r="5"/>
    <g class="arm" hidden><path class="arm-line"/><circle class="hand" r="5"/></g>
    <g class="hat" hidden><ellipse cx="0" cy="-6" rx="12" ry="9" fill="#ff8c1a" stroke="#2a1405" stroke-width="2.5"/><path d="M-4,-14 Q0,-6 -1,2 M4,-14 Q1,-6 2,2" stroke="#c75f00" stroke-width="1.5" fill="none"/><path d="M0,-15 q1,-5 4,-6" stroke="#2f6b1e" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <path class="body" fill="url(#skin)"/>
    <g class="face mood-idle">${eye(-1)}${eye(1)}
      <ellipse class="cheek" cx="-17" cy="6" rx="4" ry="2.5"/><ellipse class="cheek" cx="17" cy="6" rx="4" ry="2.5"/>
      <path class="mouth"/></g>
  </g>
</svg>
<div class="bubble" hidden></div>
<button class="tab" hidden>▲ BLIP</button>
<div class="dialog" hidden>
  <div class="scrim"></div>
  <section class="panel" role="dialog" aria-modal="true" aria-labelledby="blip-h">
    <header>
      <svg class="portrait" viewBox="-24 -30 48 54" aria-hidden="true"><path d="M0,-18 Q2,-24 0,-28" fill="none" stroke="#2a1405" stroke-width="3"/><circle cy="-28" r="4" fill="#ff5c8a" stroke="#2a1405" stroke-width="2"/><ellipse rx="20" ry="18" fill="url(#skin)" stroke="#2a1405" stroke-width="3"/><circle cx="-7" cy="-3" r="4"/><circle cx="7" cy="-3" r="4"/><path d="M-5,7 Q0,11 5,7" fill="none" stroke="#2a1405" stroke-width="2.5"/></svg>
      <div><h2 id="blip-h">BLIP</h2><p>COMPANION · ON AIR</p></div>
      <button class="x" aria-label="Close">X</button>
    </header>
    <div class="log" aria-live="polite"></div>
    <form><span class="caret" aria-hidden="true">▶</span><input aria-label="Your question" autocomplete="off" maxlength="500" placeholder="Ask me anything about this page…"><button>SEND</button></form>
    <footer><span>ESC CLOSE</span><a href="/">⌂ HOME</a><button type="button" class="new">NEW CHAT</button><button type="button" class="hide">HIDE BLIP</button></footer>
  </section>
</div>`;
const $ = (s) => root.querySelector(s);
const [stage, bodyEl, antennaEl, tipEl, face, mouth, shadow, fx, blipEl, bubble, tab] =
  [".stage", ".body", ".antenna", ".tip", ".face", ".mouth", ".shadow", ".fx", ".blip", ".bubble", ".tab"].map($);
const looks = root.querySelectorAll(".look");
const hat = root.querySelector(".hat");
const arm = root.querySelector(".arm"), armLine = root.querySelector(".arm-line"), hand = root.querySelector(".hand");
let pointAt = null; // { x, y, until }: the arm reaches toward it
hat.hidden = new Date().getMonth() !== 9; // a pumpkin on the head all October

// ---------- the soft body ----------
let W = innerWidth, H = innerHeight;
addEventListener("resize", () => { W = innerWidth; H = innerHeight; });
const N = 14, R = 30, G = 0.45;
const firstVisit = !session.get("blip:x");
const x0 = Math.min(W - 70, Math.max(70, Number(session.get("blip:x")) || W - 100)), y0 = firstVisit ? -80 : H - R - 6;
const core = { x: x0, y: y0 };
const ring = d3.range(N).map((i) => { const a = (i / N) * 2 * Math.PI - Math.PI / 2; return { x: x0 + R * Math.cos(a), y: y0 + R * Math.sin(a) }; });
const top = ring[0], stalk = { x: x0, y: y0 - R - 14 }, tip = { x: x0, y: y0 - R - 28 };
const nodes = [core, ...ring, stalk, tip];
// Shape matching: every node is pulled toward its rest spot around the ring's centroid, so Blip
// always recovers its shape and stays upright. The springs between neighbours make it jiggle.
const rest = new Map([[core, [0, 0]], ...ring.map((n, i) => { const a = (i / N) * 2 * Math.PI - Math.PI / 2; return [n, [R * Math.cos(a), R * Math.sin(a)]]; }), [stalk, [0, -R - 14]], [tip, [0, -R - 28]]]);
const SHAPE = 0.3;
const links = [
  ...ring.map((n, i) => ({ source: n, target: ring[(i + 1) % N], d: 2 * R * Math.sin(Math.PI / N), k: 0.5 })),
  { source: top, target: stalk, d: 14, k: 0.7 }, { source: stalk, target: tip, d: 14, k: 0.7 },
];

let grounded = false, impact = 0, walk = null, flying = false;
function world() {
  grounded = false; impact = 0;
  const floor = H - 4;
  for (const n of nodes) {
    if (n.fx != null) continue;
    n.vy += G;
    if (n.y + n.vy > floor) {
      impact = Math.max(impact, n.vy);
      n.vy = n.vy > 6 ? -n.vy * 0.35 : floor - n.y;
      n.vx *= 0.75;
      grounded = true;
    }
    if (n.y + n.vy < 4 && n.vy < 0) n.vy = -n.vy * 0.5;
    if (n.x + n.vx < 4) n.vx = Math.abs(n.vx) * 0.5;
    if (n.x + n.vx > W - 4) n.vx = -Math.abs(n.vx) * 0.5;
  }
  const c = centroid();
  for (const [n, [ox, oy]] of rest) {
    const k = n === tip ? SHAPE / 3 : SHAPE; // a floppier tip makes the antenna wobble
    n.vx += (c.x + ox - n.x) * k; n.vy += (c.y + oy - n.y) * k;
  }
  if (impact > 9 && !dragging) land(impact);
  if (walk) {
    const now = performance.now();
    if (now > walk.until || Math.abs(walk.x - core.x) < 12) walk = null;
    else if (grounded) {
      const dir = Math.sign(walk.x - core.x);
      for (const n of nodes) n.vx += dir * 0.2;
      if (now > walk.hop) { hop(3); walk.hop = now + 320; }
    }
  }
}
const sim = d3.forceSimulation(nodes).alphaDecay(0).velocityDecay(0.05)
  .force("link", d3.forceLink(links).distance((l) => l.d).strength((l) => l.k).iterations(3))
  .force("world", world)
  .on("tick", render);

const outline = d3.line().x((d) => d.x).y((d) => d.y).curve(d3.curveCatmullRomClosed);
const centroid = () => ({ x: d3.mean(ring, (n) => n.x), y: d3.mean(ring, (n) => n.y) });
const mouse = { x: 0, y: 0, seen: false };
let gaze = null, mood = "idle";
const pupil = { x: 0, y: 0 };
function render() {
  const c = centroid();
  bodyEl.setAttribute("d", outline(ring));
  antennaEl.setAttribute("d", `M${top.x},${top.y}Q${stalk.x},${stalk.y} ${tip.x},${tip.y}`);
  tipEl.setAttribute("cx", tip.x); tipEl.setAttribute("cy", tip.y);
  if (pointAt && performance.now() < pointAt.until) {
    const dx = pointAt.x - c.x, dy = pointAt.y - c.y, m = Math.hypot(dx, dy) || 1, ux = dx / m, uy = dy / m;
    const sx = c.x + ux * (R - 2), sy = c.y + uy * (R - 2), ex = c.x + ux * (R + 20), ey = c.y + uy * (R + 20) - 4 * Math.sin(performance.now() / 120);
    armLine.setAttribute("d", `M${sx},${sy} Q${(sx + ex) / 2 - uy * 6},${(sy + ey) / 2 + ux * 6} ${ex},${ey}`);
    hand.setAttribute("cx", ex); hand.setAttribute("cy", ey);
    arm.hidden = false;
  } else if (!arm.hidden) arm.hidden = true;
  if (!hat.hidden) hat.setAttribute("transform", `translate(${c.x - 13},${d3.min(ring, (n) => n.y) + 4}) rotate(-12)`);
  face.setAttribute("transform", `translate(${c.x},${c.y})`);
  const t = gaze && performance.now() < gaze.until ? gaze : mood === "think" ? { x: c.x + 20, y: c.y - 200 } : mouse.seen ? mouse : { x: c.x - 40, y: c.y + 10 };
  const dx = t.x - c.x, dy = t.y - c.y, m = Math.hypot(dx, dy) || 1, s = Math.min(1, m / 60) * 3.2;
  pupil.x += (dx / m * s - pupil.x) * 0.25; pupil.y += (dy / m * s - pupil.y) * 0.25;
  for (const el of looks) el.setAttribute("transform", `translate(${pupil.x},${pupil.y})`);
  const height = H - d3.max(ring, (n) => n.y);
  shadow.setAttribute("cx", c.x); shadow.setAttribute("cy", H - 3);
  shadow.setAttribute("rx", Math.max(8, 30 - height / 10)); shadow.style.opacity = Math.max(0.2, 1 - height / 300);
  if (!bubble.hidden) {
    const w = bubble.offsetWidth, h = bubble.offsetHeight;
    const bx = Math.min(W - w - 10, Math.max(10, c.x - w / 2)), by = Math.max(10, tip.y - h - 18);
    bubble.style.transform = `translate(${bx}px,${by}px)`;
    bubble.style.setProperty("--tail", `${Math.min(w - 12, Math.max(12, c.x - bx))}px`);
  }
}

// ---------- expressions, speech, effects ----------
let moodTimer;
function setMood(m, ms) {
  mood = m;
  face.setAttribute("class", `face mood-${m}`);
  mouth.setAttribute("d", MOUTH[m]); mouth.setAttribute("class", `mouth ${m}`);
  clearTimeout(moodTimer);
  if (ms) moodTimer = setTimeout(() => setMood(asleep ? "sleep" : "idle"), ms);
}
setMood("idle");

let sayTimer, typeTimer;
function say(text, { ms = 3500, cta = "", onClick = null } = {}) {
  clearTimeout(sayTimer); clearInterval(typeTimer);
  bubble.hidden = false;
  bubble.classList.toggle("clickable", !!onClick);
  bubble.onclick = onClick && (() => { hush(); onClick(); });
  bubble.innerHTML = `<span class="shown"></span><span class="rest"></span>${cta ? `<span class="cta">${cta}</span>` : ""}`;
  const [shown, rest] = bubble.children;
  let i = 0;
  rest.textContent = text;
  typeTimer = setInterval(() => { shown.textContent = text.slice(0, ++i); rest.textContent = text.slice(i); if (i >= text.length) clearInterval(typeTimer); }, 28);
  sayTimer = setTimeout(hush, ms + text.length * 28);
  render();
}
function hush() { bubble.hidden = true; clearInterval(typeTimer); }

function spawn(tag, attrs, text = "") {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.textContent = text;
  el.addEventListener("animationend", () => el.remove());
  fx.append(el);
}
function ping() {
  spawn("circle", { class: "ring", cx: tip.x, cy: tip.y, r: 6 });
  tipEl.classList.add("on"); setTimeout(() => tipEl.classList.remove("on"), 150);
}
function scan() { setMood("think", 1600); [0, 250, 500].forEach((t) => setTimeout(ping, t)); say(`Tuning ${(88 + Math.random() * 20).toFixed(1)} MHz…`, { ms: 1400 }); }
const hop = (v) => { for (const n of nodes) n.vy -= v; };
const walkTo = (x) => { walk = { x: Math.min(W - 50, Math.max(50, x)), until: performance.now() + 4000, hop: 0 }; };
function blink() { face.classList.add("blink"); setTimeout(() => face.classList.remove("blink"), 130); }
(function blinkLoop() { if (mood === "idle" || mood === "think") blink(); setTimeout(blinkLoop, 2000 + Math.random() * 4000); })();

let landCooldown = 0;
function land(v) {
  const now = performance.now();
  if (now < landCooldown) return;
  landCooldown = now + 800;
  if (firstVisit && !greeted) { greeted = true; setMood("happy", 1500); say("Hi! I'm Blip. I live here.", { ms: 2500 }); nextIdle = now + 5000; return; }
  if (flying || v > 18) { flying = false; setMood("dizzy", 1600); say(pick(["Oof. Nailed it.", "I meant to do that.", "Ten out of ten landing."]), { ms: 1500 }); }
}
let greeted = !firstVisit;

// ---------- idle life ----------
let lastInput = performance.now(), nextIdle = performance.now() + (firstVisit ? 6000 : 4000), asleep = false, dialogOpen = false, dragging = false, hidden = false, asked = false, zzz;
function idle() {
  const r = Math.random();
  if (!asked || r < 0.1) { asked = true; return say("Have a question?", { ms: 6000, cta: "▶ ASK ME", onClick: () => openDialog() }); }
  if (reduced) return blink();
  if (r < 0.4) return walkTo(Math.random() * W);
  if (r < 0.52) { hop(6); return setMood("happy", 900); }
  if (r < 0.66) return scan();
  if (r < 0.82) return say(pick(QUIPS), { ms: 4000 });
  gaze = { x: Math.random() * W, y: Math.random() * H * 0.7, until: performance.now() + 1500 };
}
function sleep() {
  asleep = true; walk = null; hush(); setMood("sleep");
  zzz = setInterval(() => { const c = centroid(); spawn("text", { class: "z", x: c.x + 18, y: c.y - 30 }, "z"); }, 1300);
}
function activity() {
  lastInput = performance.now();
  if (!asleep) return;
  asleep = false; clearInterval(zzz);
  setMood("surprised", 900); hop(7);
  say(pick(["!", "Huh? I'm up!", "Wasn't sleeping. Just… buffering."]), { ms: 1500 });
}
setInterval(() => {
  const now = performance.now();
  if (hidden || dialogOpen || dragging) return;
  if (!asleep && now - lastInput > 30000) return sleep();
  if (asleep || now < nextIdle) return;
  nextIdle = now + 3500 + Math.random() * 4500;
  idle();
}, 250);

// ---------- watching the visitor ----------
let shake = 0, lastMove = 0;
addEventListener("pointermove", (e) => {
  const now = performance.now();
  shake = shake * Math.exp(-(now - lastMove) / 400) + Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
  lastMove = now;
  Object.assign(mouse, { x: e.clientX, y: e.clientY, seen: true });
  activity();
  if (shake > 3000 && !dragging && !dialogOpen && mood !== "dizzy") { shake = 0; setMood("dizzy", 1600); say("Whoa… my eyes can't keep up!", { ms: 1600 }); }
}, { passive: true });
document.documentElement.addEventListener("mouseleave", () => { mouse.seen = false; });
addEventListener("keydown", activity);

addEventListener("click", (e) => {
  if (e.composedPath().includes(host)) return;
  activity();
  gaze = { x: e.clientX, y: e.clientY, until: performance.now() + 1200 };
  if (dialogOpen || hidden) return;
  const el = e.target.closest?.("a, button, summary, [role=button], input, select, label");
  const label = (el?.getAttribute("aria-label") || el?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
  if (label && Math.random() < 0.5) say(pick([`“${label}”, nice pick!`, `Ooh, ${label}!`, `${label}? Let's go!`]), { ms: 1600 });
  else if (!el && Math.random() < 0.15) say(pick(["I saw that.", "Click!", "What's over there?"]), { ms: 1200 });
  if (Math.random() < 0.4) hop(5);
}, true);

let hoverEl = null;
addEventListener("pointerover", (e) => {
  const el = e.target.closest?.("[data-blip]");
  if (!el || el === hoverEl || dialogOpen || dragging || hidden) return;
  hoverEl = el;
  const r = el.getBoundingClientRect();
  gaze = { x: r.x + r.width / 2, y: r.y + r.height / 2, until: performance.now() + 2000 };
  say(el.dataset.blip, { ms: 2600 });
});

addEventListener("mouseup", (e) => {
  if (e.composedPath().includes(host) || dialogOpen || hidden) return;
  setTimeout(() => {
    const text = getSelection()?.toString().trim().replace(/\s+/g, " ") ?? "";
    if (text.length < 3 || text.length > 400) return;
    const short = text.length > 40 ? text.slice(0, 38) + "…" : text;
    setMood("surprised", 800);
    say(`Want me to explain “${short}”?`, { ms: 6000, cta: "▶ EXPLAIN", onClick: () => openDialog(`Explain “${text}”`) });
  });
});

let lastScroll = scrollY, scrollT = 0;
addEventListener("scroll", () => {
  const now = performance.now();
  activity();
  if (now - scrollT < 150) return;
  scrollT = now;
  gaze = { x: centroid().x, y: scrollY > lastScroll ? H + 300 : -300, until: now + 600 };
  lastScroll = scrollY;
}, { passive: true });

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); session.set("blip:x", Math.round(core.x)); return; }
  if (Date.now() - hiddenAt > 20000 && !hidden) { activity(); say("Welcome back!", { ms: 1800 }); hop(6); }
});
addEventListener("pagehide", () => session.set("blip:x", Math.round(core.x)));

// ---------- drag, throw, poke ----------
let grab = null, moved = 0, trail = [], pokes = [];
d3.select(blipEl).call(d3.drag().container(stage)
  .on("start", (e) => {
    activity(); hush(); walk = null; dragging = true; moved = 0;
    grab = d3.least(nodes, (n) => (n.x - e.x) ** 2 + (n.y - e.y) ** 2);
    grab.fx = grab.x; grab.fy = grab.y;
    trail = [{ x: e.x, y: e.y, t: performance.now() }];
  })
  .on("drag", (e) => {
    moved += Math.hypot(e.dx, e.dy);
    grab.fx = e.x; grab.fy = e.y;
    trail.push({ x: e.x, y: e.y, t: performance.now() });
    if (trail.length > 5) trail.shift();
    if (moved > 6 && mood !== "surprised") setMood("surprised");
  })
  .on("end", (e) => {
    grab.fx = grab.fy = null; grab = null; dragging = false;
    if (moved < 6) return poke(e.x, e.y);
    const a = trail[0], b = trail.at(-1), now = performance.now();
    const dt = Math.max(16, b.t - a.t), still = now - b.t > 80;
    const vx = still ? 0 : (b.x - a.x) / dt * 16, vy = still ? 0 : (b.y - a.y) / dt * 16;
    for (const n of nodes) { n.vx += vx * 0.8; n.vy += vy * 0.8; }
    if (Math.hypot(vx, vy) > 12) { flying = true; setMood("happy", 1500); say(pick(["Wheeeee!", "I can fly!", "Yeeet!"]), { ms: 1200 }); }
    else setMood("happy", 800);
  }));

function poke(x, y) {
  const now = performance.now();
  pokes = pokes.filter((t) => now - t < 4000);
  pokes.push(now);
  for (const n of ring) if (Math.hypot(n.x - x, n.y - y) < R) { n.vx += (core.x - n.x) * 0.25; n.vy += (core.y - n.y) * 0.25; }
  hop(5);
  dispatchEvent(new CustomEvent("blip:poke"));
  if (pokes.length >= 4) {
    pokes = [];
    setMood("annoyed", 1800);
    say("Okay, okay! Did you want to ask me something?", { ms: 5000, cta: "▶ ASK ME", onClick: () => openDialog() });
  } else {
    setMood(pick(["surprised", "happy", "annoyed"]), 900);
    say(pick(["Hey!", "Hehe, that tickles.", "Boop!", "Ow. Gently!", "*bzzt*"]), { ms: 1200 });
  }
}

// Pages can make Blip react to what happens on them: dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood, hop } })).
addEventListener("blip:say", (e) => {
  const { text, mood: m, hop: h, ms } = e.detail ?? {};
  if (hidden || dialogOpen) return;
  if (asleep) activity();
  if (m && MOUTH[m]) setMood(m, 1800);
  if (h) hop(h);
  if (text) say(String(text).slice(0, 140), { ms: ms ?? 3000 });
});

/** Walk toward a spot on screen (or an element) and point at it with an arm for a few seconds. */
function point(target, ms = 3500) {
  const r = target instanceof Element ? target.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : target?.x, y = r ? r.top + r.height / 2 : target?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || hidden) return;
  walkTo(Math.min(W - 60, Math.max(60, x + (x > W / 2 ? -90 : 90)))); // stand beside it, not on it
  pointAt = { x, y, until: performance.now() + ms };
  gaze = { x, y, until: performance.now() + ms };
}
addEventListener("blip:point", (e) => point(e.detail?.element ?? e.detail, e.detail?.ms));

// More page hooks: blip:ping (antenna flash + radio ring), blip:key {on} (antenna light, e.g. in time with Morse),
// blip:look {x, y, ms} (eyes go there).
addEventListener("blip:ping", () => { if (!hidden) ping(); });
addEventListener("blip:key", (e) => tipEl.classList.toggle("on", !!e.detail?.on));
addEventListener("blip:look", (e) => { const { x, y, ms = 1500 } = e.detail ?? {}; if (Number.isFinite(x) && Number.isFinite(y)) gaze = { x, y, until: performance.now() + ms }; });

// Party mode: the Konami code (↑ ↑ ↓ ↓ ← → ← → B A).
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konami = 0;
addEventListener("keydown", (e) => {
  konami = e.key === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
  if (konami < KONAMI.length) return;
  konami = 0;
  if (hidden) show();
  blipEl.classList.add("party"); setMood("happy", 6000); say("PARTY MODE! ✦", { ms: 2500 });
  for (let i = 0; i < 10; i++) setTimeout(() => { hop(7); ping(); const c = centroid(); spawn("text", { class: "z", x: c.x - 30 + Math.random() * 60, y: c.y - 20 }, pick(["✦", "★", "♪", "✧"])); }, i * 450);
  setTimeout(() => blipEl.classList.remove("party"), 5000);
});

blipEl.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDialog(); } });

// ---------- hide / show ----------
function hide() {
  hidden = true; local.set("blip:hidden", "1"); closeDialog(); hush();
  sim.stop(); stage.style.display = "none"; tab.hidden = false;
}
function show() {
  hidden = false; local.set("blip:hidden", "");
  stage.style.display = ""; tab.hidden = true;
  for (const n of nodes) n.y -= H; // drop back in from above
  flying = true; sim.restart();
}
tab.onclick = show;
if (local.get("blip:hidden")) hide();

// ---------- the dialog ----------
const dialog = $(".dialog"), log = $(".log"), form = $("form"), input = $("input");
let history = [];
try { history = JSON.parse(session.get("blip:log") || "[]"); } catch {}
const save = () => session.set("blip:log", JSON.stringify(history.slice(-30)));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Links may be relative ("../nyc/free.html") or absolute; only http(s) is allowed, other sites open in a new tab.
function link(_, text, href) {
  try {
    const u = new URL(href.replace(/&amp;/g, "&"), location.href);
    if (!/^https?:$/.test(u.protocol)) return text;
    const same = u.origin === location.origin;
    return `<a href="${esc(same ? u.pathname + u.search + u.hash : u.href)}"${same ? "" : ' target="_blank" rel="noopener"'}>${text}</a>`;
  } catch { return text; }
}
const format = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, link)
  .replace(/^\s*[-*] /gm, "• ");
const line = (who, html, cls = "") => `<p class="msg ${who === "YOU" ? "you" : ""} ${cls}"><b class="who">${who}</b>${html}</p>`;
const CHIPS = ["What is this page about?", "Where should I start?", "Tell me a radio fun fact"];

function renderLog() {
  log.innerHTML = history.length
    ? history.map((m) => line(m.role === "user" ? "YOU" : "BLIP", m.role === "user" ? esc(m.content) : format(m.content))).join("")
    : line("BLIP", "Hi! I'm Blip. I know my way around this site, and around radio. What's up?") +
      `<div class="chips">${CHIPS.map((c) => `<button type="button">${c}</button>`).join("")}</div>`;
  log.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => send(b.textContent)));
  log.scrollTop = log.scrollHeight;
}

function openDialog(q) {
  if (hidden) show();
  if (asleep) activity();
  dialogOpen = true; dialog.hidden = false; hush();
  if (innerWidth > 700) walkTo(W - 70);
  renderLog(); input.focus();
  if (q) send(q);
}
function closeDialog() {
  if (!dialogOpen) return;
  dialogOpen = false; dialog.hidden = true;
  if (!hidden) blipEl.focus({ preventScroll: true });
}
$(".x").onclick = closeDialog;
$(".scrim").onclick = closeDialog;
$(".hide").onclick = hide;
$(".new").onclick = () => { history = []; save(); renderLog(); input.focus(); };
root.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDialog(); });
form.onsubmit = (e) => { e.preventDefault(); send(input.value); };

// Pages can publish what they show (map markers, the selected item, a drill in progress) as window.blipContext().
const pageObjects = () => { try { return typeof window.blipContext === "function" ? JSON.stringify(window.blipContext()).slice(0, 5000) : ""; } catch { return ""; } };
const TOOL_LABEL = { web_search: "searched the web", subway_status: "checked the subway", subway_arrivals: "checked train times", trip_plan: "planned the route", deals: "checked deals", callsign_lookup: "looked up the callsign", repeaters_near: "found repeaters", free_events: "checked free events", city_events: "checked the city calendar",
  restaurant_inspections: "checked health inspections", address_info: "looked up the address" };
// Blip remembers where you've been (this browser only) and greets you per world.
const WORLD_NAMES = { radio: "Radio", nyc: "NYC", ai: "AI" };
const progress = (() => { try { return JSON.parse(local.get("blip:progress") || "{}"); } catch { return {}; } })();
progress.pages ??= {}; progress.worlds ??= {};
{
  const world = location.pathname.split("/")[1];
  const firstWorld = WORLD_NAMES[world] && !progress.worlds[world];
  progress.pages[location.pathname] = (progress.pages[location.pathname] ?? 0) + 1;
  if (WORLD_NAMES[world]) progress.worlds[world] = (progress.worlds[world] ?? 0) + 1;
  const keys = Object.keys(progress.pages);
  if (keys.length > 80) delete progress.pages[keys[0]];
  local.set("blip:progress", JSON.stringify(progress));
  const line = firstWorld ? `First time in the ${WORLD_NAMES[world]} world! Ask me anything here.`
    : WORLD_NAMES[world] && progress.worlds[world] === 3 ? `Third visit to ${WORLD_NAMES[world]}. You're a regular now!` : null;
  if (line) setTimeout(() => { if (!dialogOpen && !hidden) say(line, { ms: 4000 }); }, 2500);
}

// Pages can also offer actions Blip may perform on them: window.blipActions = { name: { description, parameters, run(args) } }.
const pageActions = () => Object.entries(window.blipActions ?? {}).map(([name, a]) => ({ name, description: a.description, parameters: a.parameters ?? {} }));
async function perform(actions) {
  for (const { name, args } of actions ?? []) {
    const a = window.blipActions?.[name];
    if (!a) continue;
    try {
      const result = await a.run(args ?? {});
      hop(4); ping();
      // An action can return what it changed (an element or {x, y}); Blip goes and points at it.
      if (result instanceof Element || (result && Number.isFinite(result.x))) setTimeout(() => point(result), 300);
    } catch (e) { console.warn("Blip action failed:", name, e); }
  }
}
const pageInfo = () => ({
  url: location.pathname,
  title: document.title,
  context: pageObjects(),
  actions: pageActions(),
  visited: Object.keys(progress.worlds).map((w) => `${WORLD_NAMES[w] ?? w} (${progress.worlds[w]} visits)`).join(", "),
  text: (document.querySelector("main, article") ?? document.body).innerText.replace(/\n\s*\n+/g, "\n").slice(0, 6000),
});

let pending = false;
async function send(q) {
  q = q.trim().slice(0, 500);
  if (!q || pending) return;
  pending = true; input.value = "";
  history.push({ role: "user", content: q }); save(); renderLog();
  log.insertAdjacentHTML("beforeend", line("BLIP", `<span class="t"><span class="dots"></span></span>`));
  const out = log.lastElementChild.querySelector(".t");
  log.scrollTop = log.scrollHeight;
  setMood("think"); const pinging = setInterval(ping, 700);
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history, page: pageInfo() }) })
      .catch(() => { throw new Error("Blip lost the signal. Try again?"); });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Blip lost the signal. Try again?");
    history.push({ role: "assistant", content: data.reply }); save();
    clearInterval(pinging);
    await typeOut(out, data.reply);
    const did = [...new Set([...(data.tools ?? []).map((t) => TOOL_LABEL[t] ?? t), ...(data.actions ?? []).map((a) => window.blipActions?.[a.name]?.label ?? a.name.replace(/_/g, " "))])];
    if (did.length) out.insertAdjacentHTML("afterend", `<span class="used">⚙ ${did.join(" · ")}</span>`);
    perform(data.actions);
    setMood("happy", 1500);
  } catch (err) {
    history.pop(); save(); input.value = q;
    out.parentElement.classList.add("err"); out.textContent = err.message;
    setMood("dizzy", 1400);
  } finally {
    clearInterval(pinging); pending = false;
  }
}
function typeOut(el, text) {
  const step = Math.max(1, Math.ceil(text.length / 120));
  return new Promise((done) => {
    let i = 0;
    const t = setInterval(() => {
      i += step;
      el.textContent = text.slice(0, i);
      log.scrollTop = log.scrollHeight;
      if (i >= text.length) { clearInterval(t); el.innerHTML = format(text); done(); }
    }, 14);
  });
}
