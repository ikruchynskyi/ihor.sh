// Reader tools: an "Aa READER" button in the HUD bar ("🎨 THEME" on the home page) opens a panel to pick a theme
// (colors, a body font and a display face for headings), the font, text size, line and letter spacing. Every
// text/background pair is >= 7:1 contrast (WCAG AAA). Choices are kept per browser in localStorage.
// Arcade (the default) is the pixel look; every other theme uses the sleek look (theme.css: glass panels, soft light).
// It also draws the "still working" bar for the page's API calls (tracked by the inline script server.ts puts in <head>).

const FONTS = {
  inter: { label: "Inter", css: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif', google: "Inter:wght@400;600;700" },
  atkinson: { label: "Atkinson", css: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif', google: "Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400" },
  literata: { label: "Literata", css: '"Literata", Georgia, serif', google: "Literata:ital,wght@0,400;0,700;1,400" },
  lexend: { label: "Lexend", css: '"Lexend", ui-sans-serif, system-ui, sans-serif', google: "Lexend:wght@400;700" },
  system: { label: "System", css: "ui-sans-serif, system-ui, -apple-system, sans-serif" },
  mono: { label: "Mono", css: '"JetBrains Mono", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;700" },
  pixel: { label: "Pixel", css: '"VT323", ui-monospace, monospace', google: "VT323" },
};
// Display faces for headings: each theme brings one.
const DISPLAY = {
  rajdhani: { css: '"Rajdhani", "Inter", ui-sans-serif, sans-serif', google: "Rajdhani:wght@600;700" },
  chakra: { css: '"Chakra Petch", "Inter", ui-sans-serif, sans-serif', google: "Chakra+Petch:wght@600;700" },
  exo: { css: '"Exo 2", "Inter", ui-sans-serif, sans-serif', google: "Exo+2:wght@600;700;800" },
  cinzel: { css: '"Cinzel", Georgia, serif', google: "Cinzel:wght@600;700" },
  grotesk: { css: '"Space Grotesk", "Inter", ui-sans-serif, sans-serif', google: "Space+Grotesk:wght@600;700" },
  pressstart: { css: '"Press Start 2P", ui-monospace, monospace', google: "Press+Start+2P" },
};
// c: [text, background, card, link/accent, secondary text, borders, labels, second accent]; contrast checked: text/bg 16+:1,
// secondary text and accent 7+:1. A theme also brings a body font and a display face (the visitor can still change the font).
const THEMES = {
  nova: { label: "Nova", kind: "cinematic", c: ["#e6edf7", "#070b14", "#0f1626", "#5ee1ff", "#9aa8c0", "#273349", "#7cf2b2", "#8b7bff"], dark: true, font: "inter", display: "rajdhani" },
  ember: { label: "Ember", kind: "cinematic", c: ["#f3ebe4", "#0c0a09", "#17120f", "#ff7a3d", "#b3a79d", "#3a2e27", "#ffd166", "#ff3d6e"], dark: true, font: "inter", display: "chakra" },
  aurora: { label: "Aurora", kind: "cinematic", c: ["#eef0ff", "#0b0f1f", "#141a33", "#bf98ff", "#a7acd0", "#2d3561", "#6ff0d6", "#6ff0d6"], dark: true, font: "inter", display: "exo" },
  obsidian: { label: "Obsidian", kind: "cinematic", c: ["#ece7dc", "#0a0a0b", "#141416", "#d9b35a", "#aaa498", "#2a2a2e", "#9ad3a8", "#f0dba0"], dark: true, font: "inter", display: "cinzel" },
  frost: { label: "Frost", kind: "cinematic", c: ["#121826", "#f4f7fb", "#ffffff", "#124fae", "#475266", "#d8dfeb", "#176a44", "#7c3aed"], dark: false, font: "inter", display: "grotesk" },
  arcade: { label: "Arcade", kind: "retro", c: ["#e8edff", "#07090f", "#0d1226", "#ffb347", "#aab3e0", "#3b4bb0", "#5cff9d", "#ff5c8a"], dark: true, style: "pixel", font: "atkinson", display: "pressstart" },
  matrix: { label: "Matrix", kind: "retro", world: "terminal", c: ["#33ff66", "#000000", "#02140a", "#b6ff4d", "#22c55e", "#14532d", "#d9ffe0", "#b6ff4d"], dark: true, font: "mono", display: "grotesk" },
  subway: { label: "Subway", kind: "light", world: "NYC", c: ["#16181d", "#ffffff", "#f3f4f6", "#0039a6", "#4b5260", "#d4d7de", "#00632a", "#ee352e"], dark: false, font: "atkinson", display: "grotesk" },
  washi: { label: "Washi", kind: "light", world: "Yomu", c: ["#2a2626", "#faf7f0", "#ffffff", "#96202a", "#524d49", "#ddd3c3", "#1f5e3a", "#c98a2e"], dark: false, font: "literata", display: "cinzel" },
  amber: { label: "Amber CRT", kind: "color", world: "Radio", c: ["#ffd08a", "#120c05", "#1c1409", "#ffe7c2", "#c9a26a", "#6b4a1c", "#ffe7c2", "#ffb347"], dark: true, font: "mono", display: "chakra" },
  neural: { label: "Neural", kind: "color", world: "AI", c: ["#ece6ff", "#1c1236", "#261a48", "#7ef0c8", "#b9addb", "#5a479a", "#ffd166", "#ffd166"], dark: true, font: "lexend", display: "exo" },
  forest: { label: "Forest", kind: "color", world: "Ride", c: ["#f1ead8", "#14291e", "#1b3627", "#ffb26b", "#bfcfb8", "#3f6b4f", "#ffd166", "#ffd166"], dark: true, font: "atkinson", display: "rajdhani" },
  blueprint: { label: "Blueprint", kind: "color", world: "Learn", c: ["#eaf2ff", "#0b2747", "#0f3460", "#ffd166", "#b0c7e6", "#4672a8", "#8ef0c0", "#8ef0c0"], dark: true, font: "atkinson", display: "rajdhani" },
};
const GROUPS = [["retro", "Retro"], ["cinematic", "Cinematic"], ["light", "Light"], ["color", "By world"]];
const isHome = !!document.querySelector(".hud #snd");
const DEFAULT_THEME = "arcade";
const DEFAULTS = { theme: DEFAULT_THEME, line: isHome ? 1.5 : 1.7, letter: 0 };

// Only what the visitor changed is stored, so each page keeps its own defaults for the rest; the font and the size
// follow the theme unless the visitor set them.
const KEY = "ihor-reader";
let chosen = {};
try { chosen = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
if (!THEMES[chosen.theme]) delete chosen.theme;
let s = { ...DEFAULTS, ...chosen };
const set = (k, v) => { chosen[k] = v; s[k] = v; store(); };
const unset = (k) => { delete chosen[k]; delete s[k]; store(); };
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch {} };
const theme = () => THEMES[s.theme] ?? THEMES[DEFAULT_THEME];
const styleOf = (t) => t.style ?? "sleek";
const fontKey = () => (FONTS[s.font] ? s.font : theme().font ?? "inter");
const sizeOf = () => s.size ?? (isHome ? (fontKey() === "pixel" ? 22 : 17) : 18);

const loaded = new Set();
function loadFont(key, table = FONTS) {
  const g = table[key]?.google;
  if (!g || loaded.has(g)) return;
  loaded.add(g);
  document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${g}&display=swap">`);
}

// The page styles: reading text, colors and headings, all from the current settings.
const style = document.createElement("style");
document.head.append(style);
// Reading text in articles, plus the side panels of the map pages.
const TEXT = ":is(main, #panel, aside) :is(p, li, dd, dt, blockquote, figcaption, .lede, td, th, label, summary)";
// White or near-black text on accent-colored buttons, whichever reads better.
const lum = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const onAccent = (a) => (1.05 / (lum(a) + 0.05) > (lum(a) + 0.05) / (lum("#1b1020") + 0.05) ? "#ffffff" : "#1b1020");
function apply() {
  const t = theme(), look = styleOf(t), f = FONTS[fontKey()], d = DISPLAY[t.display] ?? DISPLAY.rajdhani, size = sizeOf();
  const [fg, bg, card, accent, muted, line, ok, accent2] = t.c;
  // The size slider zooms whole content areas, so buttons, <details>, cards and headings all scale together
  // (font-size rules alone missed everything with its own px size). The HUD bar and the maps stay as they are.
  const base = isHome ? (fontKey() === "pixel" ? 22 : 17) : 18, k = size / base;
  loadFont(fontKey()); loadFont(t.display, DISPLAY);
  const html = document.documentElement;
  html.dataset.theme = s.theme in THEMES ? s.theme : DEFAULT_THEME; // the home page picks its animated background from this
  html.dataset.style = look;
  style.textContent = `
    :root:root { --fg: ${fg}; --bg: ${bg}; --card: ${card}; --soft: ${card}; --field: ${bg}; --accent: ${accent}; --accent2: ${accent2}; --on-accent: ${onAccent(accent)}; --muted: ${muted}; --line: ${line}; --ok: ${ok}; color-scheme: ${t.dark ? "dark" : "light"};
      --body-font: ${f.css}; --display-font: ${d.css};
      /* for panels in shadow DOM (Blip's chat, this reader panel): custom properties cross the boundary */
      --reader-font: ${f.css}; --reader-size: ${fontKey() === "pixel" ? size + 3 : size}px; --reader-line: ${fontKey() === "pixel" ? Math.max(1.15, s.line - 0.3) : s.line}; --reader-letter: ${s.letter}em; --zoom: ${k.toFixed(3)}; } /* --zoom: the factor on main/#panel/aside below; a zoomed box's own top and max-height scale with it */
    html, body { background: ${bg} !important; color: ${fg}; } ${isHome ? "body { background: transparent !important; } /* keeps the waterfall canvas visible */" : ""}
    body { font-family: ${f.css}; } ${isHome && fontKey() !== "pixel" ? "body { font-size: 17px; }" : ""}
    ${look === "pixel" ? "" : `:root:root { --pixel: ${f.css}; --px: 1.55; }`} /* the pixel face's small labels, in a readable font a size up */
    main strong, main b, .ihor-hud b { color: ${fg} !important; } .ihor-hud span { color: ${muted}; }
    ${k !== 1 ? `:is(main, #panel, aside) { zoom: ${k.toFixed(3)}; }` : ""}
    ${TEXT} { font-family: ${f.css} !important; font-size: ${base}px !important; line-height: ${s.line} !important; letter-spacing: ${s.letter}em !important; }
    ${t.dark ? "" : `body::after { display: none; } #wf { opacity: .25 !important; } h1 { text-shadow: none !important; } .leaflet-control-layers-toggle { filter: none !important; } .leaflet-tile-pane { filter: none !important; }
      :root:root { --elev: 0 1px 2px rgba(0,0,0,.05), 0 20px 40px -28px rgba(0,0,0,.3); --panel-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 30px 60px -24px rgba(0,0,0,.35); }`}`;
}
apply();

// ---------- the panel ----------
const host = document.createElement("div");
host.style.cssText = "position:fixed;top:52px;right:12px;z-index:2147481500";
document.body.append(host);
const root = host.attachShadow({ mode: "open" });
const pick = (name, opts, cur, render) => `<div class="row" role="radiogroup" aria-label="${name}">${Object.entries(opts).map(([k, o]) =>
  `<button type="button" role="radio" aria-checked="${k === cur}" data-${name}="${k}">${render(k, o)}</button>`).join("")}</div>`;
const swatch = (t) => `<span class="sw"><i style="background:linear-gradient(135deg,${t.c[1]} 55%,${t.c[3]});color:${t.c[0]};border-color:${t.c[7]}">Aa</i>${t.label}${t.world ? ` <small>${t.world}</small>` : ""}</span>`;
function panelHTML() {
  return `<style>
    :host { all: initial; }
    .panel { width: min(380px, calc(100vw - 24px)); max-height: calc(100vh - 70px); overflow: auto; padding: 14px 16px 16px; background: var(--card, #0f1626); color: var(--fg, #e6edf7);
      border: var(--panel-edge, 4px solid var(--fg, #e6edf7)); border-radius: var(--r, 0); box-shadow: var(--panel-shadow, 8px 8px 0 rgba(0,0,0,.55)); font: calc(var(--reader-size, 18px) * .85)/1.4 var(--reader-font, ui-sans-serif, system-ui, sans-serif); }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    h2 { margin: 0; font: calc(11px * var(--px, 1)) var(--pixel, "Press Start 2P", monospace); color: var(--accent, #5ee1ff); letter-spacing: .08em; text-transform: uppercase; }
    h3 { margin: 14px 0 6px; font: calc(8px * var(--px, 1)) var(--pixel, "Press Start 2P", monospace); color: var(--muted, #9aa8c0); display: flex; justify-content: space-between; letter-spacing: .1em; text-transform: uppercase; }
    h3 output { font: inherit; color: var(--fg, #e6edf7); }
    .row { display: flex; flex-wrap: wrap; gap: 6px; }
    button { font: inherit; color: var(--fg, #e6edf7); background: var(--bg, #121b2e); border: 2px solid var(--line, #273349); border-radius: var(--r-sm, 0); padding: 6px 9px; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
    button:hover { border-color: var(--accent, #5ee1ff); }
    button[aria-checked="true"] { border-color: var(--accent, #5ee1ff); box-shadow: 0 0 0 2px var(--accent, #5ee1ff); }
    button:focus-visible, input:focus-visible { outline: 3px solid var(--accent, #5ee1ff); outline-offset: 2px; }
    .sw { display: inline-flex; align-items: center; gap: 6px; }
    .sw small { opacity: .65; font-size: 11px; }
    .sw i { width: 22px; height: 22px; display: grid; place-items: center; font: 700 12px ui-sans-serif, sans-serif; font-style: normal; border: 1px solid #fff4; border-radius: calc(var(--r-sm, 0) / 2); }
    input[type=range] { width: 100%; accent-color: var(--accent, #5ee1ff); }
    .x, .reset { font: calc(8px * var(--px, 1)) var(--pixel, "Press Start 2P", monospace); padding: 8px; letter-spacing: .06em; text-transform: uppercase; }
    .reset { margin-top: 16px; width: 100%; }
    .hint { margin: 2px 0 0; font-size: .85em; color: var(--muted, #9aa8c0); }
  </style>
  <section class="panel" role="dialog" aria-label="Reader settings">
    <header><h2>${isHome ? "Theme" : "Reader"}</h2><button class="x" aria-label="Close reader settings">✕</button></header>
    ${GROUPS.map(([kind, label]) => `<h3>${label}</h3>${pick("theme", Object.fromEntries(Object.entries(THEMES).filter(([, t]) => t.kind === kind)), s.theme, (k, t) => swatch(t))}`).join("")}
    <p class="hint">Arcade is the pixel look. The others are smooth, with their own fonts.</p>
    <h3>Font</h3>${pick("font", FONTS, fontKey(), (k, o) => `<span style='font-family:${o.css.replace(/"/g, "&quot;")}'>${o.label}</span>`)}
    <h3><label for="size">Size</label><output>${sizeOf()}px</output></h3><input id="size" type="range" min="14" max="28" step="1" value="${sizeOf()}">
    <h3><label for="line">Line spacing</label><output>${s.line}</output></h3><input id="line" type="range" min="1.3" max="2.3" step="0.1" value="${s.line}">
    <h3><label for="letter">Letter spacing</label><output>${s.letter}em</output></h3><input id="letter" type="range" min="0" max="0.12" step="0.01" value="${s.letter}">
    <button class="reset" type="button">Reset</button>
  </section>`;
}
let open = false, button;
function render() {
  root.innerHTML = open ? panelHTML() : "";
  if (!open) return;
  for (const k of Object.keys(FONTS)) loadFont(k); // previews in their own fonts
  root.querySelector(".x").onclick = toggle;
  root.querySelector(".reset").onclick = () => { chosen = {}; s = { ...DEFAULTS }; try { localStorage.removeItem(KEY); } catch {} apply(); render(); };
  root.querySelectorAll("[role=radio]").forEach((b) => (b.onclick = () => {
    const [k, v] = Object.entries(b.dataset)[0];
    set(k, v);
    if (k === "theme") { unset("font"); unset("size"); } // they follow the theme until the visitor picks them
    apply(); render();
    root.querySelector(`[data-${k}="${v}"]`)?.focus();
  }));
  root.querySelectorAll("input[type=range]").forEach((r) => (r.oninput = () => {
    set(r.id, Number(r.value));
    r.previousElementSibling.querySelector("output").textContent = r.value + (r.id === "size" ? "px" : r.id === "letter" ? "em" : "");
    apply();
  }));
}
function toggle() {
  open = !open;
  button?.setAttribute("aria-expanded", String(open));
  render();
  (open ? root.querySelector(".x") : button)?.focus();
}
root.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(); });

{
  button = document.createElement("button");
  button.className = "ihor-read";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Reader settings: theme, font, size, spacing");
  button.innerHTML = isHome ? "<span aria-hidden='true'>🎨</span> THEME" : "<span aria-hidden='true'>Aa</span> READER";
  button.onclick = toggle;
  // Project pages: before the page title in the HUD bar. Home: before the sound toggle.
  const anchor = document.querySelector(".ihor-hud b, .hud #snd");
  anchor ? anchor.before(button) : document.body.append(button);
}

// ---------- "still working" ----------
// The inline script in <head> (server.ts) wraps fetch and keeps every in-flight /api/ call in window.__wait, with how
// long each endpoint usually takes (learned per browser). After a moment a bar runs at the top; after a few seconds a
// pill says what the page is waiting for, how long it's been, and how long it usually takes.
const WAIT_LABEL = [
  [/^\/api\/ask/, "Blip is thinking"], [/^\/api\/jobs\/match/, "Matching jobs to your résumé"], [/^\/api\/jobs\/suggest/, "Writing suggestions"],
  [/^\/api\/jobs\/search/, "Searching jobs"], [/^\/api\/evening\/plan/, "Planning your evening"], [/^\/api\/evening\/events/, "Loading events"],
  [/^\/api\/nyc\/trip/, "Planning the trip"], [/^\/api\/nyc\/(geocode|suggest|point)/, "Looking up the place"], [/^\/api\/nyc\/restaurant/, "Checking inspections"],
  [/^\/api\/ride\/route/, "Finding a bike route"], [/^\/api\/ride\/(camps|stops|places|stations)/, "Searching the map"],
  [/^\/api\/radio\/callsign/, "Looking up the callsign"], [/^\/api\/radio\/repeaters/, "Finding repeaters"], [/^\/api\/nyc\/iss/, "Computing passes"],
];
const W = window.__wait;
if (W) {
  const el = document.createElement("div");
  el.className = "ihor-wait"; el.hidden = true; el.innerHTML = `<i></i><output aria-live="polite"></output>`;
  document.body.append(el);
  const out = el.querySelector("output");
  let timer = 0;
  const draw = () => {
    let oldest = null;
    for (const r of W.active.values()) if (!oldest || r.at < oldest.at) oldest = r;
    if (!oldest) { el.hidden = true; el.classList.remove("long"); document.documentElement.classList.remove("ihor-busy"); clearInterval(timer); timer = 0; return; }
    const sec = (performance.now() - oldest.at) / 1000;
    el.hidden = sec < 0.6;
    document.documentElement.classList.toggle("ihor-busy", sec >= 0.6);
    el.classList.toggle("long", sec >= 2.5);
    if (sec < 2.5) return;
    const label = WAIT_LABEL.find(([re]) => re.test(oldest.key))?.[1] ?? "Working on it", usual = W.typical[oldest.key];
    out.textContent = `${label}… ${Math.round(sec)} s` + (usual > 2500 ? ` · usually about ${Math.round(usual / 1000)} s` : "") + (sec > 60 ? " · still going, hang on" : "");
  };
  W.on.add(() => { draw(); if (!timer) timer = setInterval(draw, 500); });
  if (W.active.size) { draw(); timer = setInterval(draw, 500); }
}
