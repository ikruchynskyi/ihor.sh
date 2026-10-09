// Blip's wardrobe: costumes (each with its own face, colors and signature move), hats, things to hold, and random tricks.
// companion.js hands over a small API (the body's nodes and layers, say, mood, hop…) and calls render() every frame.
// Costumes are affectionate homages drawn in Blip's own style; names stay descriptive.

const NS = "http://www.w3.org/2000/svg";
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const SKINS = {
  blip: { label: "Blip", stops: ["#ffe08a", "#ffb347", "#f0782a"] },
  web: {
    label: "Web-slinger", stops: ["#ff5a5a", "#e23636", "#a31515"], mask: true,
    costume: `<path d="M-45,6 Q0,12 45,6 L45,45 L-45,45 Z" fill="#1f4fbf"/>
      <g stroke="#5a0a0a" stroke-width="1.1" fill="none" opacity=".75">${Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * 2 * Math.PI; return `<path d="M0,-6 L${(45 * Math.cos(a)).toFixed(1)},${(-6 + 45 * Math.sin(a)).toFixed(1)}"/>`; }).join("")}
      <circle cx="0" cy="-6" r="9"/><circle cx="0" cy="-6" r="17"/><circle cx="0" cy="-6" r="25"/><circle cx="0" cy="-6" r="33"/></g>
      <path d="M-5,16 L0,10 L5,16 L0,22 Z M-11,12 L-5,16 M11,12 L5,16 M-11,22 L-5,18 M11,22 L5,18" fill="#111" stroke="#111" stroke-width="1.6"/>`,
    face: `<path class="lens" d="M-3,-3 Q-6,-15 -20,-12 Q-22,-1 -12,3 Q-6,4 -3,-3 Z" fill="#fff" stroke="#111" stroke-width="2.8"/><path class="lens" d="M3,-3 Q6,-15 20,-12 Q22,-1 12,3 Q6,4 3,-3 Z" fill="#fff" stroke="#111" stroke-width="2.8"/>`,
    quips: ["Your friendly neighborhood Blip.", "With great bandwidth comes great responsibility.", "My antenna is tingling!", "Thwip!"],
  },
  iron: {
    label: "Iron suit", stops: ["#d72a2a", "#b31217", "#6d080b"], mask: true,
    costume: `<path d="M-45,-2 Q-30,-8 -22,4 L-28,40 L-45,40 Z M45,-2 Q30,-8 22,4 L28,40 L45,40 Z" fill="#e8b33a" opacity=".9"/>
      <path d="M-14,26 Q0,32 14,26" stroke="#7a4d00" stroke-width="2" fill="none"/>
      <circle class="arc" cx="0" cy="17" r="5.5" fill="#d9fbff" stroke="#7a4d00" stroke-width="1.5"/><circle cx="0" cy="17" r="2.5" fill="#fff"/>`,
    face: `<path d="M-17,-17 Q0,-23 17,-17 L15,7 Q0,14 -15,7 Z" fill="#f2c14e" stroke="#7a4d00" stroke-width="2"/>
      <path class="slit" d="M-13,-6 L-4,-4 M13,-6 L4,-4" stroke="#d9fbff" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M-6,7 L6,7" stroke="#7a4d00" stroke-width="2" stroke-linecap="round"/>`,
    quips: ["Suit up!", "Jarvis, run diagnostics. Oh wait, that's me.", "Arc reactor at 100%.", "Repulsors charged."],
  },
  ninja: {
    label: "Orange ninja", stops: ["#ffbd59", "#ff8c1a", "#d9480f"], pupil: "#2b6ef2",
    costume: `<path d="M-45,26 Q0,34 45,26 L45,45 L-45,45 Z" fill="#1d1d1d"/><path d="M-8,26 L0,40 L8,26" fill="#f5f5f5" stroke="#1d1d1d" stroke-width="1.5"/>`,
    face: `<path d="M-30,-19 Q0,-25 30,-19 L30,-13 Q0,-19 -30,-13 Z" fill="#1f3c88" stroke="#0b1a40" stroke-width="1.5"/>
      <rect x="-9" y="-23" width="18" height="10" rx="2" fill="#c9d2dc" stroke="#4a5262" stroke-width="1.5"/><path d="M0,-18 m-3,0 a3,3 0 1,1 3,3 a1.6,1.6 0 1,1 -1.5,-1.6" fill="none" stroke="#4a5262" stroke-width="1.2"/>
      <path d="M-24,4 L-15,5 M-24,8 L-15,8 M-23,12 L-15,10 M24,4 L15,5 M24,8 L15,8 M23,12 L15,10" stroke="#2a1405" stroke-width="1.4" stroke-linecap="round"/>`,
    hair: `<path d="M-26,0 L-30,-14 L-18,-10 L-20,-26 L-8,-16 L-4,-32 L4,-18 L12,-30 L12,-14 L24,-24 L20,-8 L32,-10 L26,2 Z" fill="#ffd43b" stroke="#2a1405" stroke-width="2"/>`,
    quips: ["Never giving up, that's my way!", "Clone technique!", "Ramen after this?", "Believe in yourself!"],
  },
  idol: {
    label: "Twin-tail idol", stops: ["#fff4ec", "#ffe1d0", "#f5bfa6"], pupil: "#1aa9a0", tails: "#39c5bb",
    costume: `<path d="M-45,-14 Q-26,-40 0,-37 Q26,-40 45,-14 Q30,-22 18,-14 Q12,-26 2,-16 Q-6,-27 -12,-15 Q-26,-24 -45,-14 Z" fill="#39c5bb" stroke="#1d7f78" stroke-width="1.5"/>
      <path d="M-45,24 Q0,32 45,24 L45,45 L-45,45 Z" fill="#5b6b74"/><path d="M-6,24 L0,34 L6,24" fill="#39c5bb"/>`,
    face: `<path d="M-29,-4 Q-31,-22 -18,-27" fill="none" stroke="#2b2f36" stroke-width="2.4"/><rect x="-33" y="-6" width="7" height="10" rx="2" fill="#2b2f36"/>
      <path d="M-29,4 Q-22,12 -11,10" fill="none" stroke="#2b2f36" stroke-width="1.6"/><circle cx="-10" cy="10" r="2" fill="#39c5bb"/>
      <path d="M-14,-11 L-16,-14 M-9,-12 L-10,-15 M14,-11 L16,-14 M9,-12 L10,-15" stroke="#2a1405" stroke-width="1.5" stroke-linecap="round"/>`,
    quips: ["♪ La la laaa ♪", "Concert at the waterfall tonight!", "My twin tails are tuned to 440 Hz.", "Sing along?"],
  },
};

// Hats sit on top of the head: 0,0 is the top of the body.
export const HATS = {
  none: { label: "No hat" },
  top: { label: "Top hat", svg: `<rect x="-12" y="-27" width="24" height="25" rx="2" fill="#1d1d1d" stroke="#000" stroke-width="1.5"/><rect x="-12" y="-9" width="24" height="5" fill="#c0392b"/><rect x="-19" y="-4" width="38" height="6" rx="3" fill="#1d1d1d" stroke="#000" stroke-width="1.5"/>` },
  party: { label: "Party hat", svg: `<path d="M-13,1 L0,-32 L13,1 Z" fill="#cc5de8" stroke="#2a1405" stroke-width="2"/><path d="M-9,-8 L8,-4 M-5,-19 L5,-16" stroke="#ffd43b" stroke-width="3"/><circle cy="-33" r="4.5" fill="#ffd43b" stroke="#2a1405" stroke-width="1.5"/>` },
  crown: { label: "Crown", svg: `<path d="M-15,1 L-17,-18 L-8,-9 L0,-22 L8,-9 L17,-18 L15,1 Z" fill="#fcc419" stroke="#8a5a00" stroke-width="2"/><circle cx="0" cy="-6" r="2.6" fill="#e03131"/><circle cx="-9" cy="-4" r="2" fill="#1c7ed6"/><circle cx="9" cy="-4" r="2" fill="#2f9e44"/>` },
  wizard: { label: "Wizard hat", sparkle: true, svg: `<path d="M-20,2 Q0,-4 20,2 L4,-40 Q10,-46 14,-44 Q4,-48 0,-36 Z" fill="#364fc7" stroke="#1a2a6c" stroke-width="2"/><path d="M-22,2 Q0,-6 22,2 Q0,6 -22,2 Z" fill="#364fc7" stroke="#1a2a6c" stroke-width="2"/><text x="-6" y="-12" font-size="9" fill="#ffd43b">★</text><text x="2" y="-24" font-size="6" fill="#ffd43b">★</text>` },
  beanie: { label: "Beanie", svg: `<path d="M-22,2 Q-22,-24 0,-24 Q22,-24 22,2 Z" fill="#e03131" stroke="#2a1405" stroke-width="2"/><rect x="-23" y="-4" width="46" height="7" rx="3" fill="#c92a2a" stroke="#2a1405" stroke-width="1.5"/><circle cy="-26" r="5" fill="#fff" stroke="#2a1405" stroke-width="1.5"/>` },
  chef: { label: "Chef hat", svg: `<rect x="-13" y="-12" width="26" height="13" fill="#fff" stroke="#adb5bd" stroke-width="1.5"/><circle cx="-10" cy="-18" r="8" fill="#fff" stroke="#adb5bd" stroke-width="1.5"/><circle cx="0" cy="-23" r="9" fill="#fff" stroke="#adb5bd" stroke-width="1.5"/><circle cx="10" cy="-18" r="8" fill="#fff" stroke="#adb5bd" stroke-width="1.5"/><rect x="-12" y="-13" width="24" height="6" fill="#fff"/>` },
  cowboy: { label: "Cowboy hat", svg: `<path d="M-30,-2 Q-24,4 0,3 Q24,4 30,-2 Q20,0 0,-1 Q-20,0 -30,-2 Z" fill="#8b5a2b" stroke="#4a2a10" stroke-width="2"/><path d="M-14,-1 Q-15,-22 -6,-20 Q0,-15 6,-20 Q15,-22 14,-1 Z" fill="#a0692f" stroke="#4a2a10" stroke-width="2"/><rect x="-14" y="-6" width="28" height="3" fill="#4a2a10"/>` },
  propeller: { label: "Propeller cap", spin: true, svg: `<path d="M-18,1 Q-18,-16 0,-16 Q18,-16 18,1 Z" fill="#1c7ed6" stroke="#2a1405" stroke-width="2"/><path d="M-6,-16 Q0,-12 6,-16" fill="#e03131"/><path d="M-16,1 Q0,-4 16,1" fill="none" stroke="#fcc419" stroke-width="2.5"/><rect x="-1" y="-22" width="2" height="7" fill="#495057"/><g class="prop"><ellipse cx="-8" cy="-22" rx="8" ry="2.2" fill="#e03131" stroke="#2a1405" stroke-width="1"/><ellipse cx="8" cy="-22" rx="8" ry="2.2" fill="#fcc419" stroke="#2a1405" stroke-width="1"/></g>` },
};

// Things to hold, at the right side: 0,0 is the hand.
export const ITEMS = {
  world: { label: "This world's item" },
  none: { label: "Nothing" },
  balloon: { label: "Balloon", float: true, svg: `<path class="string" d="M0,0 Q6,-20 0,-44" fill="none" stroke="#868e96" stroke-width="1.2"/><g class="bob"><ellipse cx="0" cy="-58" rx="12" ry="15" fill="#ff5c8a" stroke="#2a1405" stroke-width="2"/><path d="M-3,-43 L3,-43 L0,-46 Z" fill="#ff5c8a" stroke="#2a1405" stroke-width="1"/><ellipse cx="-4" cy="-63" rx="3" ry="5" fill="#fff" opacity=".5"/></g>` },
  icecream: { label: "Ice cream", svg: `<path d="M-6,-6 L0,12 L6,-6 Z" fill="#e8b33a" stroke="#8a5a00" stroke-width="1.5"/><circle cx="0" cy="-9" r="7" fill="#ffc9de" stroke="#d6336c" stroke-width="1.5"/><circle cx="0" cy="-17" r="5" fill="#a5d8ff" stroke="#1c7ed6" stroke-width="1.5"/><circle cx="1" cy="-23" r="2" fill="#e03131"/>` },
  wand: { label: "Magic wand", sparkle: true, svg: `<rect x="-1.5" y="-24" width="3" height="24" rx="1.5" fill="#1d1d1d"/><rect x="-1.6" y="-24" width="3.2" height="4" fill="#fff"/><text x="-6" y="-24" font-size="12" fill="#ffd43b">★</text>` },
  flag: { label: "Flag", wave: true, svg: `<rect x="-1" y="-34" width="2.4" height="38" fill="#868e96"/><path class="cloth" d="M1,-34 Q10,-38 20,-34 Q30,-30 38,-34 L38,-20 Q30,-16 20,-20 Q10,-24 1,-20 Z" fill="#ffb347" stroke="#2a1405" stroke-width="1.5"/><text x="8" y="-23" font-size="7" font-family="monospace" font-weight="bold" fill="#2a1405">ihor</text>` },
  coffee: { label: "Coffee", steam: true, svg: `<path d="M-6,-10 L6,-10 L5,6 L-5,6 Z" fill="#fff" stroke="#2a1405" stroke-width="1.5"/><rect x="-6.5" y="-13" width="13" height="4" rx="1" fill="#6b3f1d"/><path d="M-5,-3 L5,-3" stroke="#8b5a2b" stroke-width="3"/>` },
  guitar: { label: "Guitar", svg: `<g transform="rotate(-30)"><rect x="-1.5" y="-36" width="3" height="22" fill="#6b3f1d"/><rect x="-3" y="-40" width="6" height="6" rx="1" fill="#4a2a10"/><path d="M-9,-14 Q-12,-6 -8,0 Q-12,6 -8,12 Q0,16 8,12 Q12,6 8,0 Q12,-6 9,-14 Q0,-18 -9,-14 Z" fill="#e8590c" stroke="#2a1405" stroke-width="1.5"/><circle cy="-2" r="3" fill="#2a1405"/></g>` },
  umbrella: { label: "Umbrella", svg: `<rect x="-1" y="-40" width="2" height="44" fill="#495057"/><path d="M1,4 q0,4 -4,4" fill="none" stroke="#495057" stroke-width="2"/><path d="M-26,-40 Q0,-66 26,-40 Q20,-44 13,-40 Q6,-45 0,-40 Q-6,-45 -13,-40 Q-20,-44 -26,-40 Z" fill="#4dabf7" stroke="#1864ab" stroke-width="2"/>` },
};

const CSS = `
.lens { transform-box: fill-box; transform-origin: center; transition: transform .1s; }
.mood-happy .lens { transform: scaleY(.55); } .mood-surprised .lens { transform: scale(1.15); } .mood-sleep .lens, .blink .lens { transform: scaleY(.12); }
.mood-annoyed .lens { transform: scaleY(.6) rotate(6deg); } .mood-dizzy .lens { transform: rotate(25deg) scaleY(.8); }
.slit { filter: drop-shadow(0 0 3px #7ef7ff); }
.arc { filter: drop-shadow(0 0 5px #7ef7ff); animation: arc 1.6s ease-in-out infinite; }
@keyframes arc { 50% { filter: drop-shadow(0 0 10px #b8fbff); } }
.masked .ball, .masked .e, .masked .cheek, .masked .mouth, .masked .glasses { display: none !important; }
.note { font: bold 16px sans-serif; animation: note 1.8s ease-out forwards; }
@keyframes note { to { transform: translate(var(--dx, 10px), -60px) rotate(var(--r, 15deg)); opacity: 0; } }
.puff { fill: #e9ecef; opacity: .9; transform-box: fill-box; transform-origin: center; animation: puff .7s ease-out forwards; }
@keyframes puff { to { transform: scale(2.2); opacity: 0; } }
.clone { opacity: .65; animation: clone 1.6s ease-in forwards; }
@keyframes clone { 70% { opacity: .6; } to { opacity: 0; } }
.flame { fill: #ffa94d; animation: flame .45s ease-in forwards; }
@keyframes flame { to { transform: translateY(26px) scale(.3); opacity: 0; } }
.spark { fill: #ffe066; animation: spark .9s ease-out forwards; }
@keyframes spark { to { transform: translate(var(--dx, 0), var(--dy, -20px)); opacity: 0; } }
.webline { stroke: #f1f3f5; stroke-width: 1.6; fill: none; }
.beam { stroke: #b8fbff; stroke-width: 5; stroke-linecap: round; filter: drop-shadow(0 0 6px #7ef7ff); animation: beam .45s ease-out forwards; }
@keyframes beam { to { opacity: 0; stroke-width: 1; } }
.wardrobe { padding: 8px 16px 4px; border-top: 4px solid #3b4bb0; max-height: 40vh; overflow: auto; }
.wardrobe h3 { margin: 8px 0 6px; font: 8px "Press Start 2P", monospace; color: #7f8bc4; }
.wardrobe .opts { display: flex; flex-wrap: wrap; gap: 6px; }
.wardrobe .opts button { font: 8px "Press Start 2P", monospace; padding: 7px 8px; color: #e8edff; background: #1e2650; box-shadow: 0 3px 0 #3b4bb0; }
.wardrobe .opts button[aria-pressed="true"] { background: #ffb347; color: #1b1020; box-shadow: 0 3px 0 #b86b1e; }
`;

/** Wires the wardrobe into Blip. api: { root, stage, bodyEl, face, layers: { behind, costume, clip, faceOver, hat, held, act }, nodes, ring, core, R, centroid, say, setMood, hop, walkTo, spawn, ping, world, H(), W(), mood() } */
export function setup(api) {
  const { root, layers } = api;
  root.querySelector("style").insertAdjacentText("beforeend", CSS);
  // one gradient per costume
  const defs = root.querySelector("defs");
  for (const [k, s] of Object.entries(SKINS)) defs.insertAdjacentHTML("beforeend", `<radialGradient id="skin-${k}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${s.stops[0]}"/><stop offset=".55" stop-color="${s.stops[1]}"/><stop offset="1" stop-color="${s.stops[2]}"/></radialGradient>`);
  let look = { skin: "blip", hat: "none", item: "world" };
  try { Object.assign(look, JSON.parse(localStorage.getItem("blip:look") || "{}")); } catch {}
  const saveLook = () => { try { localStorage.setItem("blip:look", JSON.stringify(look)); } catch {} };

  function apply() {
    if (!SKINS[look.skin]) look.skin = "blip"; if (!HATS[look.hat]) look.hat = "none"; if (!ITEMS[look.item]) look.item = "world";
    const s = SKINS[look.skin];
    api.bodyEl.setAttribute("fill", `url(#skin-${look.skin})`);
    layers.costume.innerHTML = s.costume ?? "";
    layers.faceOver.innerHTML = s.face ?? "";
    layers.hair.innerHTML = s.hair ?? "";
    api.face.classList.toggle("masked", !!s.mask);
    for (const p of root.querySelectorAll(".pupil")) p.style.fill = s.pupil ?? "";
    layers.hat.innerHTML = HATS[look.hat].svg ?? "";
    layers.held.innerHTML = look.item === "world" || look.item === "none" ? "" : ITEMS[look.item].svg;
    api.onLook?.(look);
  }
  apply();

  // ---------- acts: things that play out over a few frames ----------
  let act = null; // { kind, start, until, … }
  const now = () => performance.now();
  const W = () => api.W(), H = () => api.H();
  const svgEl = (tag, attrs, parent = layers.act) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.append(e); return e; };
  const fxText = (cls, x, y, text, style = "") => { const e = document.createElementNS(NS, "text"); e.setAttribute("class", cls); e.setAttribute("x", x); e.setAttribute("y", y); if (style) e.setAttribute("style", style); e.textContent = text; e.addEventListener("animationend", () => e.remove()); api.fx.append(e); };
  const fxShape = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.addEventListener("animationend", () => e.remove()); api.fx.append(e); return e; };
  const push = (vx, vy, nodes = api.nodes) => { for (const n of nodes) { n.vx += vx; n.vy += vy; } };

  const SPECIALS = {
    web() { // shoot a web to the ceiling and get yanked along it
      const c = api.centroid(), tx = Math.min(W() - 60, Math.max(60, c.x + (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 250))), ty = 10;
      act = { kind: "web", start: now(), until: now() + 1100, tx, ty };
      api.setMood("happy", 1500); api.say(pick(["Thwip!", "Web zip!", "Swing time!"]), { ms: 1200 });
    },
    iron() {
      if (Math.random() < 0.5) { act = { kind: "thrust", start: now(), until: now() + 1500 }; api.setMood("happy", 1800); api.say(pick(["Thrusters!", "Liftoff!", "Flight test, take one."]), { ms: 1300 }); }
      else { const c = api.centroid(), tx = c.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 120), ty = c.y - 80 - Math.random() * 120; act = { kind: "repulsor", start: now(), until: now() + 900, tx, ty }; api.say("Repulsor!", { ms: 1000 }); }
    },
    ninja() {
      if (Math.random() < 0.6) {
        const c = api.centroid(), d = api.bodyEl.getAttribute("d");
        for (const dx of [-75, 75, -150]) {
          if (c.x + dx < 30 || c.x + dx > W() - 30) continue;
          const g = fxShape("g", { class: "clone", transform: `translate(${dx},0)` }); g.innerHTML = `<path d="${d}" fill="url(#skin-ninja)" stroke="#2a1405" stroke-width="3"/>`;
          for (let k = 0; k < 4; k++) fxShape("circle", { class: "puff", cx: c.x + dx + (Math.random() - 0.5) * 30, cy: c.y + (Math.random() - 0.5) * 30, r: 8 + Math.random() * 6 });
        }
        api.setMood("happy", 1400); api.say("Clone technique!", { ms: 1400 });
      } else { api.walkTo(api.centroid().x < W() / 2 ? W() - 60 : 60); act = { kind: "dash", start: now(), until: now() + 1500 }; api.say(pick(["Ninja run!", "Too fast to see!"]), { ms: 1200 }); }
    },
    idol() {
      act = { kind: "sing", start: now(), until: now() + 2600, next: 0, dir: 1 };
      api.setMood("happy", 2600); api.say(pick(["♪ La la la ♪", "♫ Blip-blip-bloop! ♫", "♪ Do re mi fa sol ♪"]), { ms: 2000 });
    },
  };
  const TRICKS = {
    wave() { act = { kind: "wave", start: now(), until: now() + 1800 }; api.setMood("happy", 1800); api.say(pick(["Hi there!", "👋 Hello!", "Hey, you!"]), { ms: 1400 }); },
    dance() { act = { kind: "dance", start: now(), until: now() + 2400, next: 0, dir: 1 }; api.setMood("happy", 2400); },
    juggle() { act = { kind: "juggle", start: now(), until: now() + 2600 }; api.setMood("think", 2600); api.say("Watch this…", { ms: 1200 }); },
    yawn() { api.setMood("surprised", 1500); api.say(pick(["*yaaawn*", "Is it nap time yet?"]), { ms: 1500 }); for (const n of api.ring.slice(0, 5)) n.vy -= 5; },
    spin() { api.hop(10); push((Math.random() - 0.5) * 8, 0); api.setMood("dizzy", 1300); api.say(pick(["Wheee!", "Spin attack!"]), { ms: 1100 }); },
    sneeze() { api.setMood("surprised", 600); setTimeout(() => { api.hop(6); push(-3, 0); api.ping(); api.setMood("dizzy", 1000); api.say("A-a-ACHOO!", { ms: 1200 }); }, 600); },
  };
  function trick(name) {
    if (name && SPECIALS[name]) return SPECIALS[name]();
    if (name && TRICKS[name]) return TRICKS[name]();
    if (look.skin !== "blip" && Math.random() < 0.6) return SPECIALS[look.skin]();
    return pick(Object.values(TRICKS))();
  }

  // ---------- every frame ----------
  function render(c, minY, maxX, w) {
    const t = now(), s = SKINS[look.skin];
    // costume, clipped to the body (the clip path is the body outline itself)
    layers.clip.setAttribute("d", api.bodyEl.getAttribute("d"));
    layers.costume.setAttribute("transform", `translate(${c.x},${c.y}) scale(${w.toFixed(3)},1)`);
    layers.faceOver.setAttribute("transform", "");
    layers.hair.setAttribute("transform", `translate(${c.x},${minY + 6}) scale(${w.toFixed(3)})`);
    // twin tails swing with the body's motion
    if (s.tails) {
      const sway = Math.sin(t / 380) * 4 - api.core.vx * 3, len = 58;
      const side = (dir) => { const x0 = c.x + dir * 22 * w, y0 = minY + 12, xe = x0 + dir * 16 + sway, ye = y0 + len; return `M${x0},${y0 - 4} Q${x0 + dir * 30 + sway / 2},${y0 + len / 2} ${xe},${ye} Q${x0 + dir * 8 + sway},${y0 + len * 0.6} ${x0 - dir * 2},${y0 + 4} Z`; };
      layers.behind.innerHTML = `<path d="${side(-1)}" fill="${s.tails}" stroke="#1d7f78" stroke-width="2"/><path d="${side(1)}" fill="${s.tails}" stroke="#1d7f78" stroke-width="2"/>
        <rect x="${c.x - 26 * w}" y="${minY + 5}" width="8" height="9" rx="2" fill="#2b2f36" stroke="#ff5c8a" stroke-width="1.5"/><rect x="${c.x + 18 * w}" y="${minY + 5}" width="8" height="9" rx="2" fill="#2b2f36" stroke="#ff5c8a" stroke-width="1.5"/>`;
    } else if (layers.behind.innerHTML) layers.behind.innerHTML = "";
    // hat
    const hat = HATS[look.hat];
    if (hat.svg) {
      layers.hat.setAttribute("transform", `translate(${c.x + 2},${minY + 5}) rotate(-6) scale(${w.toFixed(3)})`);
      if (hat.spin) layers.hat.querySelector(".prop")?.setAttribute("transform", `translate(0,-22) scale(${Math.cos(t / 40).toFixed(2)},1) translate(0,22)`);
      if (hat.sparkle && Math.random() < 0.02) sparkle(c.x + (Math.random() - 0.5) * 30, minY - 30);
    }
    // held item
    const item = ITEMS[look.item];
    if (item?.svg) {
      layers.held.setAttribute("transform", `translate(${maxX - 2},${c.y + 8}) rotate(${item.float ? 8 + Math.sin(t / 500) * 6 : 18})`);
      if (item.float) layers.held.querySelector(".bob")?.setAttribute("transform", `translate(${Math.sin(t / 600) * 3},${Math.sin(t / 450) * 2})`);
      if (item.wave) layers.held.querySelector(".cloth")?.setAttribute("transform", `skewY(${Math.sin(t / 200) * 4})`);
      if (item.sparkle && Math.random() < 0.03) sparkle(maxX + 4, c.y - 20);
      if (item.steam && Math.random() < 0.03) fxText("note", maxX + 2, c.y - 6, "~", "fill:#dee2e6;--dx:2px;--r:0deg;font-size:12px");
    }
    // the act in progress
    layers.act.innerHTML = "";
    if (!act) return;
    if (t > act.until) { if (act.kind === "thrust") api.say(pick(["Landing gear down.", "Flight test: passed."]), { ms: 1200 }); act = null; return; }
    const p = (t - act.start) / (act.until - act.start);
    if (act.kind === "web") {
      const topY = minY;
      svgEl("path", { class: "webline", d: `M${c.x},${topY} L${act.tx},${act.ty}` });
      if (p > 0.15 && p < 0.7) { const dx = act.tx - c.x, dy = act.ty - c.y, m = Math.hypot(dx, dy) || 1; push((dx / m) * 1.6, (dy / m) * 1.6 - 0.2); }
    } else if (act.kind === "thrust") {
      if (p < 0.75) push(0, -0.62);
      for (const dx of [-12, 12]) if (Math.random() < 0.7) fxShape("circle", { class: "flame", cx: c.x + dx * w, cy: c.y + api.R - 2, r: 5 + Math.random() * 3 });
    } else if (act.kind === "repulsor") {
      const ux = Math.sign(act.tx - c.x), hx = c.x + ux * (api.R + 8), hy = c.y - 4;
      svgEl("path", { d: `M${c.x + ux * (api.R - 2)},${c.y} L${hx},${hy}`, stroke: "#b31217", "stroke-width": 7, "stroke-linecap": "round" });
      svgEl("circle", { cx: hx, cy: hy, r: 5, fill: "#d9fbff", style: "filter:drop-shadow(0 0 6px #7ef7ff)" });
      if (!act.fired && p > 0.35) { act.fired = true; fxShape("path", { class: "beam", d: `M${hx},${hy} L${act.tx},${act.ty}` }); fxShape("circle", { class: "puff", cx: act.tx, cy: act.ty, r: 10, style: "fill:#b8fbff" }); push(-ux * 2, 0); }
    } else if (act.kind === "dash") {
      if (Math.random() < 0.4) fxShape("circle", { class: "puff", cx: c.x - Math.sign(api.core.vx || 1) * 20, cy: H() - 8, r: 5 });
      push(Math.sign(api.core.vx || 1) * 0.25, 0);
    } else if (act.kind === "sing" || act.kind === "dance") {
      if (t > act.next) {
        act.next = t + (act.kind === "dance" ? 320 : 420); act.dir = -act.dir; push(act.dir * 1.6, 0); api.hop(act.kind === "dance" ? 4 : 2.5);
        const notes = ["♪", "♫", "♬"];
        fxText("note", c.x + (Math.random() - 0.5) * 30, minY - 6, pick(notes), `fill:hsl(${Math.floor(Math.random() * 360)},80%,65%);--dx:${(Math.random() - 0.5) * 40}px;--r:${(Math.random() - 0.5) * 50}deg`);
      }
    } else if (act.kind === "wave") {
      const sx = c.x - api.R * w + 4, sy = c.y - 2, a = -2.2 + Math.sin(t / 110) * 0.45, ex = sx + Math.cos(a) * 26, ey = sy + Math.sin(a) * 26;
      svgEl("path", { d: `M${sx},${sy} Q${sx - 10},${sy - 8} ${ex},${ey}`, fill: "none", stroke: "#2a1405", "stroke-width": 4, "stroke-linecap": "round" });
      svgEl("circle", { cx: ex, cy: ey, r: 5, class: "hand", fill: "#ffb347", stroke: "#2a1405", "stroke-width": 2.5 });
    } else if (act.kind === "juggle") {
      const colors = ["#ff5c8a", "#4de1ff", "#ffd43b"];
      for (let k = 0; k < 3; k++) {
        const ph = ((t - act.start) / 700 + k / 3) % 1, x = c.x + Math.cos(ph * 2 * Math.PI) * 22, y = minY - 12 - Math.abs(Math.sin(ph * Math.PI)) * 50;
        svgEl("circle", { cx: x, cy: y, r: 5, fill: colors[k], stroke: "#2a1405", "stroke-width": 1.5 });
      }
    }
  }
  function sparkle(x, y) { fxShape("circle", { class: "spark", cx: x, cy: y, r: 2.2, style: `--dx:${(Math.random() - 0.5) * 30}px;--dy:${-10 - Math.random() * 20}px` }); }

  // ---------- the wardrobe panel, inside Blip's dialog ----------
  function panel(el) {
    const row = (title, table, key) => `<h3>${title}</h3><div class="opts">${Object.entries(table).map(([k, v]) => `<button type="button" data-k="${key}" data-v="${k}" aria-pressed="${look[key] === k}">${v.label}</button>`).join("")}</div>`;
    el.innerHTML = row("COSTUME", SKINS, "skin") + row("HAT", HATS, "hat") + row("IN HAND", ITEMS, "item") + `<h3>TRICKS</h3><div class="opts"><button type="button" data-trick="">🎲 Surprise me</button>${Object.keys(TRICKS).map((k) => `<button type="button" data-trick="${k}">${k}</button>`).join("")}</div>`;
    el.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.trick != null) { trick(b.dataset.trick || null); return; }
      look[b.dataset.k] = b.dataset.v; saveLook(); apply(); panel(el);
      api.hop(5); api.setMood("happy", 1000);
      if (b.dataset.k === "skin") { const q = SKINS[look.skin].quips; api.say(q ? pick(q) : "Back to plain old me!", { ms: 1800 }); }
    };
  }

  // What Blip itself can do when asked in chat ("wear the ninja costume", "do a trick").
  const actions = {
    wear: { label: "changed outfit", description: `Change Blip's own look. costume: ${Object.entries(SKINS).map(([k, v]) => `${k} (${v.label})`).join(", ")}; hat: ${Object.keys(HATS).join(", ")}; item: ${Object.keys(ITEMS).join(", ")}. Any of the three may be left out.`,
      parameters: { costume: { type: "string" }, hat: { type: "string" }, item: { type: "string" } },
      run: ({ costume, hat, item }) => { if (SKINS[costume]) look.skin = costume; if (HATS[hat]) look.hat = hat; if (ITEMS[item]) look.item = item; saveLook(); apply(); api.hop(5); } },
    do_trick: { label: "did a trick", description: `Blip performs a move: ${[...Object.keys(TRICKS), ...Object.keys(SPECIALS).map((k) => `${k} (the ${SKINS[k].label} costume's move)`)].join(", ")}.`,
      parameters: { name: { type: "string" } }, run: ({ name }) => trick(name) },
  };

  return { render, trick, panel, actions, look: () => look, quip: () => { const q = SKINS[look.skin].quips; return q && Math.random() < 0.5 ? pick(q) : null; } };
}
