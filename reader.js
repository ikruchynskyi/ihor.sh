// Reader tools: an "Aa READER" button in the HUD bar ("🎨 THEME" on the home page) opens a panel to pick a theme
// (colors + a matching font), the font, text size, line and letter spacing (every text/background pair is >= 7:1
// contrast, WCAG AAA) and pixel or plain headings. Choices are kept per browser in localStorage.

const FONTS = {
  atkinson: { label: "Atkinson", css: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif', google: "Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400" },
  literata: { label: "Literata", css: '"Literata", Georgia, serif', google: "Literata:ital,wght@0,400;0,700;1,400" },
  lexend: { label: "Lexend", css: '"Lexend", ui-sans-serif, system-ui, sans-serif', google: "Lexend:wght@400;700" },
  system: { label: "System", css: "ui-sans-serif, system-ui, -apple-system, sans-serif" },
  mono: { label: "Mono", css: '"JetBrains Mono", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;700" },
  pixel: { label: "Pixel", css: '"VT323", ui-monospace, monospace', google: "VT323" },
};
// [text, background, card, link/accent, secondary text, borders, labels]; contrast checked: text/bg 11–21:1.
// A theme also brings a font and heading style (picking one sets them; the visitor can still change both after).
const THEMES = {
  arcade: { label: "Arcade", c: ["#e8edff", "#07090f", "#0d1226", "#ffb347", "#aab3e0", "#3b4bb0", "#5cff9d"], dark: true },
  matrix: { label: "Matrix", world: "terminal", c: ["#33ff66", "#000000", "#02140a", "#b6ff4d", "#22c55e", "#14532d", "#d9ffe0"], dark: true, font: "mono", headings: "plain" },
  radio: { label: "Radio", world: "Radio", c: ["#1d2a33", "#fbf6e9", "#fffdf6", "#7a4200", "#444f56", "#d9cfb5", "#1a5560"], dark: false, font: "atkinson", headings: "plain" },
  washi: { label: "Washi", world: "Yomu", c: ["#2a2626", "#faf7f0", "#ffffff", "#96202a", "#524d49", "#ddd3c3", "#1f5e3a"], dark: false, font: "literata", headings: "plain" },
  subway: { label: "Subway", world: "NYC", c: ["#16181d", "#ffffff", "#f3f4f6", "#0039a6", "#4b5260", "#d4d7de", "#00632a"], dark: false, font: "atkinson", headings: "plain" },
  notebook: { label: "Notebook", world: "AI", c: ["#1f1d2e", "#f7f6fc", "#ffffff", "#5b2d9e", "#4a4866", "#d9d6ea", "#155e4f"], dark: false, font: "lexend", headings: "plain" },
  workbench: { label: "Workbench", world: "EDC", c: ["#22201c", "#f3f2ee", "#ffffff", "#8a2e10", "#4d4944", "#d6d3cd", "#14532d"], dark: false, font: "mono", headings: "plain" },
  trail: { label: "Trail", world: "Ride", c: ["#232a1e", "#f5f3ea", "#fffdf5", "#36500d", "#4b5041", "#d6d2bf", "#7c2d12"], dark: false, font: "atkinson", headings: "plain" },
  blueprint: { label: "Blueprint", world: "Learn", c: ["#eaf2ff", "#0b2747", "#0f3460", "#ffd166", "#b0c7e6", "#4672a8", "#8ef0c0"], dark: true, font: "atkinson", headings: "plain" },
  phosphor: { label: "Phosphor", c: ["#a6ffbf", "#03110a", "#071d10", "#ffd166", "#78c992", "#1f6b3a", "#ffd166"], dark: true },
  amber: { label: "Amber CRT", c: ["#ffd08a", "#120c05", "#1c1409", "#ffe7c2", "#c9a26a", "#6b4a1c", "#ffe7c2"], dark: true },
  contrast: { label: "High contrast", c: ["#ffffff", "#000000", "#000000", "#ffff00", "#d0d0d0", "#ffffff", "#00ff66"], dark: true },
  paper: { label: "Paper", c: ["#1f1d1a", "#fbf8f1", "#ffffff", "#a8420a", "#5c574e", "#cfc8b8", "#1e6b35"], dark: false },
  sepia: { label: "Sepia", c: ["#3a2c1a", "#f3e9d2", "#faf3e3", "#8a3f0e", "#6b5a43", "#cdbb95", "#2f5d1e"], dark: false },
};
// The home page keeps its pixel look unless the visitor picks otherwise; articles default to Atkinson.
const isHome = !!document.querySelector(".hud #snd");
const DEFAULTS = isHome
  ? { font: "pixel", size: 22, line: 1.3, letter: 0, theme: "arcade", headings: "pixel" }
  : { font: "atkinson", size: 18, line: 1.7, letter: 0, theme: "arcade", headings: "pixel" };

// Only what the visitor changed is stored, so each page keeps its own defaults for the rest.
const KEY = "ihor-reader";
let chosen = {};
try { chosen = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
let s = { ...DEFAULTS, ...chosen };
const set = (k, v) => { chosen[k] = v; s[k] = v; try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch {} };

const loaded = new Set();
function loadFont(key) {
  const g = FONTS[key]?.google;
  if (!g || loaded.has(key)) return;
  loaded.add(key);
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
  const f = FONTS[s.font] ?? FONTS.atkinson, t = THEMES[s.theme] ?? THEMES.arcade;
  const [fg, bg, card, accent, muted, line, ok] = t.c;
  const k = s.size / DEFAULTS.size; // headings grow and shrink with the text size
  loadFont(s.font);
  style.textContent = `
    :root:root { --fg: ${fg}; --bg: ${bg}; --card: ${card}; --soft: ${card}; --field: ${bg}; --accent: ${accent}; --on-accent: ${onAccent(accent)}; --muted: ${muted}; --line: ${line}; --ok: ${ok}; color-scheme: ${t.dark ? "dark" : "light"}; }
    html, body { background: ${bg} !important; color: ${fg}; } ${isHome ? "body { background: transparent !important; } /* keeps the waterfall canvas visible */" : ""}
    body { font-family: ${f.css}; } ${isHome && s.font !== "pixel" ? "body { font-size: 17px; }" : ""}
    ${s.headings === "plain" ? `:root:root { --pixel: ${f.css}; --px: 1.55; }` : ""} /* the pixel font's small labels, in a readable font a size up */
    main strong, main b, .ihor-hud b { color: ${fg} !important; } .ihor-hud span { color: ${muted}; }
    ${TEXT} { font-family: ${f.css} !important; font-size: ${s.size}px !important; line-height: ${s.line} !important; letter-spacing: ${s.letter}em !important; }
    ${t.dark ? "" : "body::after, body::before { display: none; } #wf { opacity: .12 !important; } h1 { text-shadow: none !important; } .leaflet-control-layers-toggle { filter: none !important; } .ihor-hud { background: " + card + " !important; }"}
    ${s.headings === "plain" ? `h1, h2, h3, .eyebrow { font-family: ${f.css} !important; font-weight: 700 !important; text-shadow: none !important; letter-spacing: -0.01em !important; }
      h1:not(.logo) { font-size: calc(clamp(28px, 5vw, 40px) * ${k}) !important; line-height: 1.15 !important; } .logo { text-shadow: none !important; } h2 { font-size: ${24 * k}px !important; line-height: 1.25 !important; } h3 { font-size: ${19 * k}px !important; }`
    : k !== 1 ? `h1 { font-size: calc(clamp(18px, 3.4vw, 28px) * ${k}) !important; } h2 { font-size: calc(clamp(13px, 2vw, 16px) * ${k}) !important; } h3 { font-size: ${11 * k}px !important; }` : ""}`;
}
apply();

// ---------- the panel ----------
const host = document.createElement("div");
host.style.cssText = "position:fixed;top:52px;right:12px;z-index:2147481500";
document.body.append(host);
const root = host.attachShadow({ mode: "open" });
const pick = (name, opts, cur, render) => `<div class="row" role="radiogroup" aria-label="${name}">${Object.entries(opts).map(([k, o]) =>
  `<button type="button" role="radio" aria-checked="${k === cur}" data-${name}="${k}">${render(k, o)}</button>`).join("")}</div>`;
function panelHTML() {
  return `<style>
    :host { all: initial; }
    .panel { width: min(330px, calc(100vw - 24px)); max-height: calc(100vh - 70px); overflow: auto; padding: 14px 16px 16px; background: #0d1226; color: #e8edff;
      border: 4px solid #e8edff; box-shadow: inset 0 0 0 4px #3b4bb0, 8px 8px 0 rgba(0,0,0,.55); font: 15px/1.4 ui-sans-serif, system-ui, sans-serif; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    h2 { margin: 0; font: 11px "Press Start 2P", monospace; color: #ffb347; }
    h3 { margin: 14px 0 6px; font: 8px "Press Start 2P", monospace; color: #9aa3cf; display: flex; justify-content: space-between; }
    h3 output { font: inherit; color: #e8edff; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; }
    button { font: inherit; color: #e8edff; background: #111939; border: 2px solid #3b4bb0; padding: 6px 9px; cursor: pointer; }
    button[aria-checked="true"] { border-color: #ffb347; box-shadow: 0 0 0 2px #ffb347; }
    button:focus-visible, input:focus-visible { outline: 3px solid #4de1ff; outline-offset: 2px; }
    .sw { display: inline-flex; align-items: center; gap: 6px; }
    .sw small { opacity: .65; font-size: 11px; }
    .sw i { width: 22px; height: 22px; display: grid; place-items: center; font: 700 12px ui-sans-serif, sans-serif; font-style: normal; border: 1px solid #fff4; }
    input[type=range] { width: 100%; accent-color: #ffb347; }
    .x, .reset { font: 8px "Press Start 2P", monospace; padding: 8px; }
    .reset { margin-top: 16px; width: 100%; }
  </style>
  <section class="panel" role="dialog" aria-label="Reader settings">
    <header><h2>${isHome ? "THEME" : "READER"}</h2><button class="x" aria-label="Close reader settings">X</button></header>
    <h3>THEME</h3>${pick("theme", THEMES, s.theme, (k, t) => `<span class="sw"><i style="background:${t.c[1]};color:${t.c[0]};border-color:${t.c[3]}">Aa</i>${t.label}${t.world ? ` <small>${t.world}</small>` : ""}</span>`)}
    <h3>FONT</h3>${pick("font", FONTS, s.font, (k, o) => `<span style='font-family:${o.css.replace(/"/g, "&quot;")}'>${o.label}</span>`)}
    <h3><label for="size">SIZE</label><output>${s.size}px</output></h3><input id="size" type="range" min="14" max="28" step="1" value="${s.size}">
    <h3><label for="line">LINE SPACING</label><output>${s.line}</output></h3><input id="line" type="range" min="1.3" max="2.3" step="0.1" value="${s.line}">
    <h3><label for="letter">LETTER SPACING</label><output>${s.letter}em</output></h3><input id="letter" type="range" min="0" max="0.12" step="0.01" value="${s.letter}">
    <h3>HEADINGS</h3>${pick("headings", { pixel: { label: "Pixel" }, plain: { label: "Plain" } }, s.headings, (k, o) => o.label)}
    <button class="reset" type="button">RESET</button>
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
    if (k === "theme") {
      const t = THEMES[v];
      set("font", t.font ?? DEFAULTS.font); set("headings", t.headings ?? "pixel");
      if (isHome) set("size", t.font ? 17 : 22); // a pixel font reads small, so it gets a bigger size
    }
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
  button.setAttribute("aria-label", "Reader settings: font, size, spacing and colors");
  button.innerHTML = isHome ? "<span aria-hidden='true'>🎨</span> THEME" : "<span aria-hidden='true'>Aa</span> READER";
  button.onclick = toggle;
  // Project pages: before the page title in the HUD bar. Home: before the sound toggle.
  const anchor = document.querySelector(".ihor-hud b, .hud #snd");
  anchor ? anchor.before(button) : document.body.append(button);
}
