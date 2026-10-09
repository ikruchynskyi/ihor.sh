// Reader tools for article pages: an "Aa READER" button in the HUD bar opens a panel to pick the
// font, text size, line and letter spacing, a color theme (every text/background pair is >= 7:1
// contrast, WCAG AAA) and pixel or plain headings. Choices are kept per browser in localStorage.

const FONTS = {
  atkinson: { label: "Atkinson", css: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif', google: "Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400" },
  literata: { label: "Literata", css: '"Literata", Georgia, serif', google: "Literata:ital,wght@0,400;0,700;1,400" },
  lexend: { label: "Lexend", css: '"Lexend", ui-sans-serif, system-ui, sans-serif', google: "Lexend:wght@400;700" },
  system: { label: "System", css: "ui-sans-serif, system-ui, -apple-system, sans-serif" },
  pixel: { label: "Pixel", css: '"VT323", ui-monospace, monospace', google: "VT323" },
};
// [text, background, card, link/accent, secondary text, borders, labels]; contrast checked: text/bg 11–21:1.
const THEMES = {
  arcade: { label: "Arcade", c: ["#e8edff", "#07090f", "#0d1226", "#ffb347", "#aab3e0", "#3b4bb0", "#5cff9d"], dark: true },
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
const TEXT = "main :is(p, li, dd, dt, blockquote, figcaption, .lede)";
function apply() {
  const f = FONTS[s.font] ?? FONTS.atkinson, t = THEMES[s.theme] ?? THEMES.arcade;
  const [fg, bg, card, accent, muted, line, ok] = t.c;
  loadFont(s.font);
  style.textContent = `
    :root:root { --fg: ${fg}; --bg: ${bg}; --card: ${card}; --soft: ${card}; --accent: ${accent}; --muted: ${muted}; --line: ${line}; --ok: ${ok}; color-scheme: ${t.dark ? "dark" : "light"}; }
    html, body { background: ${bg} !important; color: ${fg}; }
    body { font-family: ${f.css}; }
    main strong, main b, .ihor-hud b { color: ${fg} !important; } .ihor-hud span { color: ${muted}; }
    ${TEXT} { font-family: ${f.css} !important; font-size: ${s.size}px !important; line-height: ${s.line} !important; letter-spacing: ${s.letter}em !important; }
    ${t.dark ? "" : "body::after, body::before { display: none; } #wf { opacity: .12 !important; } h1 { text-shadow: none !important; } .ihor-hud { background: " + card + " !important; }"}
    ${s.headings === "plain" ? `h1, h2, h3, .eyebrow { font-family: ${f.css} !important; font-weight: 700 !important; text-shadow: none !important; letter-spacing: -0.01em !important; }
      h1 { font-size: clamp(28px, 5vw, 40px) !important; line-height: 1.15 !important; } h2 { font-size: 24px !important; line-height: 1.25 !important; } h3 { font-size: 19px !important; }` : ""}`;
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
    .sw i { width: 22px; height: 22px; display: grid; place-items: center; font: 700 12px ui-sans-serif, sans-serif; font-style: normal; border: 1px solid #fff4; }
    input[type=range] { width: 100%; accent-color: #ffb347; }
    .x, .reset { font: 8px "Press Start 2P", monospace; padding: 8px; }
    .reset { margin-top: 16px; width: 100%; }
  </style>
  <section class="panel" role="dialog" aria-label="Reader settings">
    <header><h2>READER</h2><button class="x" aria-label="Close reader settings">X</button></header>
    <h3>FONT</h3>${pick("font", FONTS, s.font, (k, o) => `<span style='font-family:${o.css.replace(/"/g, "&quot;")}'>${o.label}</span>`)}
    <h3><label for="size">SIZE</label><output>${s.size}px</output></h3><input id="size" type="range" min="14" max="28" step="1" value="${s.size}">
    <h3><label for="line">LINE SPACING</label><output>${s.line}</output></h3><input id="line" type="range" min="1.3" max="2.3" step="0.1" value="${s.line}">
    <h3><label for="letter">LETTER SPACING</label><output>${s.letter}em</output></h3><input id="letter" type="range" min="0" max="0.12" step="0.01" value="${s.letter}">
    <h3>COLORS</h3>${pick("theme", THEMES, s.theme, (k, t) => `<span class="sw"><i style="background:${t.c[1]};color:${t.c[0]}">Aa</i>${t.label}</span>`)}
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
    set(k, v); apply(); render();
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
  button.innerHTML = "<span aria-hidden='true'>Aa</span> READER";
  button.onclick = toggle;
  // Project pages: before the page title in the HUD bar. Home: before the sound toggle.
  const anchor = document.querySelector(".ihor-hud b, .hud #snd");
  anchor ? anchor.before(button) : document.body.append(button);
}
