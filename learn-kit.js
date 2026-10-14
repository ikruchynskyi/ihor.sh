// Lesson kit for the courses (AI, electronics, radio): questions you answer before you're told, code you can edit and
// run, and math typeset with KaTeX. Pages just write markup; importing this module wires it up.
//
//   <div class="q" data-answer="b">                     a question with choices
//     <p>Which way does the ball roll?</p>
//     <ul><li data-k="a" data-says="feedback for a wrong pick">left</li><li data-k="b">right</li></ul>
//     <div class="why">the explanation, shown once it's answered</div>
//   </div>
//   <div class="q" data-num="0.25" data-tol="0.01">…</div>  a number to type (tol: how close counts, default 1%)
//   <div class="q"><p>Why…?</p><div class="why">…</div></div>  an open question: think first, then reveal
//
//   <div class="code" id="sgd" data-uses="other-id"><textarea>print(1 + 1)</textarea></div>
//     runs in the page with print(...), plot(ys or [[x, y]…], {label}) and table(rows); data-uses runs another
//     block's code first (quietly), so a chapter can build a program up in steps. Ctrl/⌘+Enter runs.
//
//   \( inline math \) and \[ display math \] anywhere in the text.
//
//   <div class="code" data-lang="python">…</div>  (or data-lang="python" on any ancestor, e.g. <main>) runs Python
//     in the page with Pyodide: NumPy, pandas, scikit-learn and matplotlib load on first use. print() prints,
//     matplotlib figures show as images, a last-line expression is shown (DataFrames as tables), get(url) fetches
//     text from this site. data-uses works the same way.

const css = `
.q { border: 2px solid var(--line); border-radius: 12px; background: var(--card); padding: 14px 16px; margin: 18px 0; }
.q::before { content: "Your turn"; display: block; font: 700 0.75rem ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.q.solved { border-color: var(--green, #2f9e44); }
.q.solved::before { content: "Solved ✓"; color: var(--green, #2f9e44); }
.q > p:first-of-type { margin-top: 0; }
.q ul { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 6px; }
.q li button { width: 100%; text-align: left; font: calc(16px * var(--px, 1))/1.5 ui-sans-serif, system-ui, sans-serif !important; box-shadow: none !important; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; text-transform: none !important; letter-spacing: normal !important; }
.q li button:hover:not(:disabled) { border-color: var(--accent); }
.q li.right button { border-color: var(--green, #2f9e44); background: color-mix(in srgb, var(--green, #2f9e44) 18%, var(--bg)); }
.q li.wrong button { border-color: var(--red, #e03131); background: color-mix(in srgb, var(--red, #e03131) 14%, var(--bg)); }
.q .says { font-size: 0.92em; margin: 6px 0 0; min-height: 1em; }
.q .says.no { color: var(--red, #e03131); } .q .says.ok { color: var(--green, #2f9e44); }
.q .num { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.q .num input { width: 9em; font: inherit; padding: 6px 8px; }
.q .why { display: none; border-top: 1px dashed var(--line); margin-top: 10px; padding-top: 8px; }
.q.solved .why, .q.shown .why { display: block; }
.q .think { margin-top: 6px; }
.q .giveup { font-size: 0.85em; background: none !important; border: none !important; color: var(--muted) !important; text-decoration: underline; cursor: pointer; padding: 0 !important; box-shadow: none !important; }
.code { margin: 18px 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
.code .bar { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); font: 0.8rem ui-sans-serif, system-ui, sans-serif; color: var(--muted); }
.code .bar b { flex: 1; color: var(--fg); font-weight: 600; }
.code .bar button { font-size: 0.8rem !important; padding: 3px 10px !important; }
/* the editor: a transparent textarea over a syntax-colored copy of its text (same metrics, kept in sync) */
.code .ed { position: relative; background: #0f1218; }
.code .ed > textarea, .code .ed > pre { display: block; width: 100%; box-sizing: border-box; margin: 0 !important; border: 0 !important; border-radius: 0 !important; padding: 10px 12px !important; font: 13.5px/1.55 ui-monospace, Menlo, monospace !important; letter-spacing: 0 !important; tab-size: 4; white-space: pre; overflow: auto; outline: none; box-shadow: none !important; }
.code .ed > pre { position: absolute; inset: 0; overflow: hidden; pointer-events: none; background: transparent !important; color: #d7dde5; }
.code .ed > pre code { all: unset; font: inherit !important; white-space: pre; }
.code .ed > textarea { position: relative; resize: vertical; background: transparent !important; color: transparent !important; caret-color: #f4d35e; }
.code .ed > textarea::selection { background: rgba(88, 196, 221, 0.35); color: transparent; }
.code .ac { position: absolute; z-index: 5; min-width: 220px; max-width: 420px; max-height: 220px; overflow: auto; background: #1b2029; border: 1px solid #3a4252; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.35); font: 13px/1.4 ui-monospace, Menlo, monospace; color: #d7dde5; }
.code .ac div { padding: 2px 8px; cursor: pointer; white-space: nowrap; display: flex; gap: 8px; }
.code .ac div.on { background: #2d3a52; }
.code .ac i { color: #7d8796; font-style: normal; margin-left: auto; font-size: 11px; }
.code .ac .doc { white-space: normal; color: #9aa4b2; font-size: 11.5px; border-top: 1px solid #3a4252; cursor: default; }
.code .token.comment { color: #7d8796; font-style: italic; } .code .token.string, .code .token.triple-quoted-string { color: #83c167; }
.code .token.number, .code .token.boolean { color: #f4d35e; } .code .token.keyword { color: #fc6255; }
.code .token.builtin, .code .token.function { color: #58c4dd; } .code .token.decorator, .code .token.class-name { color: #e6a3f0; }
.code .token.punctuation, .code .token.operator { color: #a8b1be; }
.code .out { margin: 0; padding: 8px 12px; font: 13px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; border-top: 1px solid var(--line); max-height: 340px; overflow: auto; }
.code .out:empty { display: none; }
.code .out .err { color: var(--red, #e03131); }
.code .out canvas { display: block; max-width: 100%; margin: 6px 0; background: #14171d; border-radius: 6px; }
.code .out table { border-collapse: collapse; margin: 4px 0; } .code .out td { border: 1px solid var(--line); padding: 2px 8px; text-align: right; }
.code .out .df { white-space: normal; overflow-x: auto; } .code .out .df th { border: 1px solid var(--line); padding: 2px 8px; text-align: right; font-weight: 600; }
.code .out img { display: block; margin: 6px 0; border-radius: 6px; background: #fff; }
.code .out .muted { color: var(--muted); }
/* phones: nothing wider than the screen, and buttons big enough for a thumb */
main select, main input[type="file"], main svg:not(.katex svg) { max-width: 100%; }
main svg:not(.katex svg) { height: auto; }
.wide-scroll { overflow-x: auto; max-width: 100%; }
@media (pointer: coarse), (max-width: 640px) {
  .code .bar button { min-height: 40px; padding: 8px 14px !important; }
  .q button.giveup, .q button.think { min-height: 40px; padding: 8px 6px !important; }
  .q li button { min-height: 44px; }
  .q .num input { min-height: 40px; font-size: 16px !important; }   /* 16px stops iOS from zooming into the field */
  .code .ed > textarea, .code .ed > pre { font-size: 16px !important; }   /* both layers, so colors stay aligned
}
.deeper { border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--card) 85%, transparent); padding: 4px 16px; margin: 18px 0; border-radius: 0 10px 10px 0; }
.deeper > summary { cursor: pointer; font-weight: 700; padding: 8px 0; }
.deeper[open] > summary { margin-bottom: 4px; }
.levels { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.levels > div { border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; background: var(--card); }
.levels > div > b:first-child { display: block; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
@media (max-width: 640px) { .levels { grid-template-columns: 1fr; } }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
`;
document.head.insertAdjacentHTML("beforeend", `<style id="learn-kit">${css}</style>`);
const say = (text, mood = "happy") => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood } }));

// ---------- questions ----------
// Every answer is announced (learnkit:answer {q, right, first}), so a course can track progress and gaps.
const tell = (q, right) => { const first = !q.dataset.tried; q.dataset.tried = "1"; dispatchEvent(new CustomEvent("learnkit:answer", { detail: { q, right, first } })); };
export function setupQuestion(q) {
  const solve = () => { q.classList.add("solved"); q.querySelectorAll("button, input").forEach((b) => { if (!b.classList.contains("keep")) b.disabled = true; }); };
  const says = document.createElement("p"); says.className = "says"; says.setAttribute("aria-live", "polite");
  const why = q.querySelector(".why");
  if (q.dataset.answer) {
    for (const li of q.querySelectorAll("li[data-k]")) {
      const b = document.createElement("button"); b.innerHTML = li.innerHTML; li.replaceChildren(b);
      b.onclick = () => {
        tell(q, li.dataset.k === q.dataset.answer);
        if (li.dataset.k === q.dataset.answer) { li.classList.add("right"); says.className = "says ok"; says.textContent = "Right."; solve(); }
        else { li.classList.add("wrong"); b.disabled = true; says.className = "says no"; says.textContent = li.dataset.says || "Not quite. Try another."; }
      };
    }
    q.querySelector("ul")?.after(says);
  } else if (q.dataset.num != null) {
    const want = Number(q.dataset.num), tol = q.dataset.tol != null ? Number(q.dataset.tol) : Math.max(1e-9, Math.abs(want) * 0.01);
    const row = document.createElement("div"); row.className = "num";
    row.innerHTML = `<input type="text" inputmode="decimal" aria-label="Your answer" placeholder="your answer"><button>Check</button>${q.dataset.unit ? `<span>${q.dataset.unit}</span>` : ""}`;
    const [inp, btn] = row.children;
    const check = () => {
      const got = Number(inp.value.replace(",", ".").replace(/[^\d.eE+-]/g, ""));
      if (!inp.value.trim() || !Number.isFinite(got)) { says.className = "says no"; says.textContent = "Type a number."; return; }
      tell(q, Math.abs(got - want) <= tol);
      if (Math.abs(got - want) <= tol) { says.className = "says ok"; says.textContent = `Right: ${q.dataset.show ?? want}.`; solve(); }
      else { says.className = "says no"; says.textContent = (got > want ? "Too big. " : "Too small. ") + (q.dataset.hint ?? "Try again."); }
    };
    btn.onclick = check; inp.onkeydown = (e) => { if (e.key === "Enter") check(); };
    const ask = [...q.querySelectorAll(":scope > p")].at(-1); ask ? ask.after(row) : q.prepend(row);
    row.after(says);
  }
  else { // an open question: think, then reveal
    const b = document.createElement("button"); b.className = "think keep"; b.textContent = "I've thought about it: show me";
    b.onclick = () => { q.classList.add("solved"); b.remove(); };
    q.querySelector(".why")?.before(b);
    return;
  }
  if (why) {
    const give = document.createElement("button"); give.className = "giveup keep"; give.textContent = "show me the answer";
    give.onclick = () => { q.classList.add("shown"); give.remove(); };
    says.after(give);
    new MutationObserver(() => { if (q.classList.contains("solved")) give.remove(); }).observe(q, { attributes: true, attributeFilter: ["class"] });
  }
}

// ---------- runnable code ----------
const blocks = new Map(), painters = [];
// syntax colors by Prism (cdnjs), loaded once if the page has code boxes; boxes show plain text until it arrives
function loadPrism() {
  window.Prism = { manual: true };
  const base = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/";
  const load = (src) => new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = base + src; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
  load("components/prism-core.min.js").then(() => load("components/prism-clike.min.js")).then(() => Promise.all([load("components/prism-python.min.js"), load("components/prism-javascript.min.js")]))
    .then(() => painters.forEach((p) => p())).catch(() => {});
}
// Python by Pyodide, loaded once per page on the first run (about 10 MB, then cached by the browser)
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let pyReady = null;
function python() {
  return (pyReady ??= new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = PYODIDE + "pyodide.js"; sc.onload = ok; sc.onerror = () => no(new Error("Couldn't load Python (offline?)")); document.head.append(sc); })
    .then(() => window.loadPyodide({ indexURL: PYODIDE, env: { MPLBACKEND: "AGG" } }))
    .then(async (py) => {
      await py.runPythonAsync(`
import warnings
warnings.filterwarnings("ignore", message=".*non-interactive.*")   # plt.show() is fine here: figures appear below the box
from pyodide.http import open_url
def get(url):
    "Text of a URL on this site (or any that allows it), e.g. get('/ai/data/outages.json')."
    return open_url(url).read()
__SUBPLOTS = None
def __hint_types(src, caret_line):
    # matplotlib types subplots() as returning (Figure, Any), so Jedi can't tell what ax is. For the standard idiom
    # fig, ax = plt.subplots(...) we append annotations to that line (positions don't move): ax is one Axes, or a
    # NumPy array of them when rows/columns are given.
    global __SUBPLOTS
    import re
    __SUBPLOTS = __SUBPLOTS or re.compile(r"^(\\s*)(\\w+)\\s*,\\s*(\\w+)\\s*=\\s*(?:plt|pyplot|matplotlib\\.pyplot)\\.subplots\\((.*)\\)\\s*$")
    lines = src.split("\\n")
    for i, text in enumerate(lines):
        m = __SUBPLOTS.match(text)
        if m and i != caret_line - 1:
            grid = re.search(r"\\b(nrows|ncols)\\s*=\\s*([2-9]|\\d\\d)|^\\s*([2-9]|\\d\\d)\\b", m.group(4))
            ax_type = "numpy.ndarray" if grid else "matplotlib.axes.Axes"
            lines[i] = text + f"; import numpy, matplotlib.axes, matplotlib.figure; {m.group(2)}: matplotlib.figure.Figure; {m.group(3)}: {ax_type}"
    return "\\n".join(lines)
def __complete(src, line, col, ns=None):
    # Completions at (line, col) by Jedi: [name, kind, text to insert, one-line description]. With ns (the box's
    # last run), Jedi also sees the live objects, so methods of arrays and DataFrames complete too.
    import jedi
    src = __hint_types(src, line)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            cs = (jedi.Interpreter(src, [ns]) if ns is not None else jedi.Script(src)).complete(line, col)
            if not cs and ns is not None:   # the source can hide a live object's type (np.array(...)); ask about this line alone
                cur = src.split("\\n")[line - 1][:col]
                cs = jedi.Interpreter(cur, [ns]).complete(1, len(cur))
    except Exception:
        return []
    return [[c.name, c.type, c.complete, (c.description or "")[:90]] for c in cs[:60] if not c.name.startswith("__")]
def __figures():
    import sys
    if "matplotlib.pyplot" not in sys.modules: return []
    import matplotlib.pyplot as plt, io, base64
    out = []
    for n in plt.get_fignums():
        b = io.BytesIO(); plt.figure(n).savefig(b, format="png", dpi=100, bbox_inches="tight"); out.append(base64.b64encode(b.getvalue()).decode())
    plt.close("all")
    return out
`);
      return py;
    }));
}
// ---------- Python autocomplete: Jedi running in the same Pyodide (no server; works offline once loaded) ----------
// One queue: Pyodide can report a package as loaded while an earlier request is still installing it, and Jedi then
// finds nothing, so each request waits for the one before.
let jediQueue = null;
const jediReady = (code) => (jediQueue = (jediQueue ?? python().then(async (py) => { await py.loadPackage("jedi", { messageCallback: () => {} }); return py; }))
  .then(async (py) => { await py.loadPackagesFromImports(code, { messageCallback: () => {} }).catch(() => {}); return py; }));
function autocomplete(box, ed, ta, paint) {
  const pop = document.createElement("div"); pop.className = "ac"; pop.hidden = true; ed.append(pop);
  let items = [], sel = 0, timer = 0, asked = 0;
  const prefixCode = () => (box.dataset.uses ?? "").split(/\s+/).filter(Boolean).map((id) => blocks.get(id)?.value ?? "").join("\n");
  const close = () => { pop.hidden = true; items = []; };
  const accept = () => {
    const it = items[sel]; if (!it) return close();
    ta.setRangeText(it[2], ta.selectionStart, ta.selectionEnd, "end"); close(); paint(); ta.focus();
    if (it[1] === "function" || it[1] === "class") { ta.setRangeText("()", ta.selectionStart, ta.selectionStart, "end"); ta.selectionStart = ta.selectionEnd = ta.selectionStart - 1; paint(); }
  };
  const render = () => {
    pop.innerHTML = items.map(([n, k], i) => `<div data-i="${i}" class="${i === sel ? "on" : ""}">${n.replace(/</g, "&lt;")}<i>${k}</i></div>`).join("")
      + (items[sel]?.[3] ? `<div class="doc">${items[sel][3].replace(/</g, "&lt;")}</div>` : "");
    pop.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  // where the caret is, in pixels: the font is monospace and the metrics are fixed in CSS
  // the editor's real metrics (16px on phones, 13.5px elsewhere), so the popup lands under the caret
  const metrics = () => { const cs = getComputedStyle(ta), c = document.createElement("canvas").getContext("2d"); c.font = `${cs.fontSize} ui-monospace, Menlo, monospace`;
    return { cw: c.measureText("M").width, lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.55 }; };
  async function ask(force = false) {
    const before = ta.value.slice(0, ta.selectionStart), lineText = before.slice(before.lastIndexOf("\n") + 1);
    const word = lineText.match(/[A-Za-z_][\w]*$/)?.[0] ?? "", afterDot = /\.\w*$/.test(lineText);
    if (!force && !afterDot && word.length < 2) return close();
    if (/#/.test(lineText.replace(/(["'])(?:\\.|(?!\1).)*\1/g, ""))) return close();     // inside a comment
    const id = ++asked, pre = prefixCode(), py = await jediReady(pre + "\n" + ta.value);
    if (id !== asked) return;
    const line = pre ? pre.split("\n").length + before.split("\n").length : before.split("\n").length;
    const res = py.globals.get("__complete")((pre ? pre + "\n" : "") + ta.value, line, lineText.length, box.ns ?? null).toJs();
    if (id !== asked) return;
    items = res.filter(([n]) => n.startsWith(word) || afterDot && !word); sel = 0;
    if (!items.length || (items.length === 1 && items[0][2] === "")) return close();
    const row = before.split("\n").length - 1, { cw, lh } = metrics();
    pop.style.left = `${Math.max(0, Math.min(12 + lineText.length * cw - ta.scrollLeft - word.length * cw, ta.clientWidth - 230))}px`;
    const lineTop = 10 + row * lh - ta.scrollTop;
    pop.hidden = false; render();
    // below the caret's line if it fits inside the box, otherwise above it (the box clips what overflows)
    const below = lineTop + lh + 2;
    pop.style.top = `${below + pop.offsetHeight <= ed.clientHeight ? below : Math.max(0, lineTop - pop.offsetHeight - 2)}px`;
  }
  ta.addEventListener("focus", () => jediReady(ta.value), { once: true });            // warm up while they read
  ta.addEventListener("input", (e) => { clearTimeout(timer); if (e.inputType?.startsWith("delete") && pop.hidden) return; timer = setTimeout(() => ask().catch((err) => console.warn("autocomplete:", err)), 180); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === " " && e.ctrlKey) { e.preventDefault(); ask(true).catch((err) => console.warn("autocomplete:", err)); return; }
    if (pop.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; render(); }
    else if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); accept(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  ta.addEventListener("blur", () => setTimeout(close, 150));
  ta.addEventListener("scroll", close);
  pop.addEventListener("mousedown", (e) => { const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); sel = +d.dataset.i; accept(); } });
}
function setupCode(box) {
  const isPy = box.closest("[data-lang]")?.dataset.lang === "python";
  const ta = box.querySelector("textarea"), original = ta.value.replace(/^\n/, "").replace(/\s+$/, "");
  ta.value = original; ta.spellcheck = false; ta.setAttribute("autocapitalize", "off");
  const ed = document.createElement("div"), hl = document.createElement("pre"), hlCode = document.createElement("code");
  ed.className = "ed"; hl.setAttribute("aria-hidden", "true"); hl.append(hlCode); ta.before(ed); ed.append(hl, ta);
  const paint = () => { hlCode.textContent = ta.value + "\n"; window.Prism?.highlightElement?.(hlCode); hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
  hlCode.className = `language-${isPy ? "python" : "javascript"}`;
  ta.addEventListener("input", paint); ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
  painters.push(paint); paint();
  if (isPy) autocomplete(box, ed, ta, paint);
  ta.rows = Math.min(28, original.split("\n").length + 1);
  const bar = document.createElement("div"); bar.className = "bar";
  bar.innerHTML = `<b>${box.dataset.title ?? "Try it: edit the code and run it"}</b><button class="run">▶ Run</button><button class="reset">Reset</button>`;
  const out = document.createElement("div"); out.className = "out"; out.setAttribute("aria-live", "polite");
  box.prepend(bar); box.append(out);
  if (box.id) blocks.set(box.id, ta);
  const run = async () => {
    out.replaceChildren();
    const quiet = { on: false };
    const line = (text, cls) => { if (quiet.on) return; const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text; out.append(d); };
    const show = (v) => typeof v === "string" ? v : typeof v === "number" ? String(+v.toPrecision(6)) : Array.isArray(v) && v.every((x) => typeof x === "number") ? `[${v.map(show).join(", ")}]` : (() => { try { return JSON.stringify(v, (k, x) => typeof x === "number" ? +x.toPrecision(6) : x); } catch { return String(v); } })();
    const print = (...a) => line(a.map(show).join(" "));
    const table = (rows) => { if (quiet.on) return; const t = document.createElement("table"); t.innerHTML = rows.map((r) => `<tr>${(Array.isArray(r) ? r : Object.values(r)).map((c) => `<td>${typeof c === "number" ? +c.toPrecision(5) : String(c).replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join(""); out.append(t); };
    const plot = (data, { label = "", w = 520, h = 180 } = {}) => {
      if (quiet.on) return;
      const pts = data.map((d, i) => (Array.isArray(d) ? d : [i, d])).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; out.append(cv);
      const g = cv.getContext("2d"), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys, y0 + 1e-9);
      const X = (x) => 40 + ((x - x0) / (x1 - x0 || 1)) * (w - 50), Y = (y) => h - 20 - ((y - y0) / (y1 - y0)) * (h - 34);
      g.strokeStyle = "#4a5262"; g.beginPath(); g.moveTo(40, Y(0)); g.lineTo(w - 10, Y(0)); g.stroke();
      g.strokeStyle = "#f4d35e"; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
      g.fillStyle = "#d7dde5"; g.font = "11px ui-monospace, monospace"; g.fillText(String(+y1.toPrecision(3)), 2, 12); g.fillText(String(+y0.toPrecision(3)), 2, h - 22); g.fillText(label, 44, h - 4);
    };
    const prefix = (box.dataset.uses ?? "").split(/\s+/).filter(Boolean).map((id) => blocks.get(id)?.value ?? "").join(isPy ? "\n" : "\n;\n");
    if (isPy) {
      const wait = document.createElement("div"); wait.className = "muted"; wait.textContent = pyReady ? "Running…" : "Starting Python (first run on this page loads about 10 MB)…"; out.append(wait);
      bar.querySelector(".run").disabled = true;
      try {
        const py = await python();
        const ns = py.globals.get("dict")(), all = prefix + "\n" + ta.value;
        ns.set("get", py.globals.get("get"));
        wait.textContent = "Loading libraries…";
        await py.loadPackagesFromImports(all, { messageCallback: () => {} });
        wait.remove();
        py.setStdout({ batched: (t) => line(t) }); py.setStderr({ batched: (t) => { if (!/font cache/.test(t)) line(t, "err"); } });
        if (prefix.trim()) { quiet.on = true; await py.runPythonAsync(prefix, { globals: ns }); quiet.on = false; }
        const v = await py.runPythonAsync(ta.value, { globals: ns });
        for (const png of py.globals.get("__figures")().toJs()) { const img = document.createElement("img"); img.src = `data:image/png;base64,${png}`; img.style.maxWidth = "100%"; out.append(img); }
        if (v !== undefined && v !== null) {
          const html = v?._repr_html_?.();
          if (html) { const d = document.createElement("div"); d.className = "df"; d.innerHTML = html; out.append(d); } else line(typeof v === "object" ? py.globals.get("repr")(v) : String(v));
          v?.destroy?.();
        }
        box.ns?.destroy(); box.ns = ns;                     // kept for autocomplete: Jedi can look at the live objects
        if (!out.childElementCount) line("(ran, printed nothing: add print(...) to see values)");
      } catch (e) {
        quiet.on = false; wait.remove();
        const msg = String(e.message ?? e), lines = msg.trim().split("\n");
        // a Python traceback: keep the part about the user's code, not Pyodide's internals
        const from = lines.findIndex((l) => l.includes('File "<exec>"')); line((from >= 0 ? lines.slice(from) : lines.slice(-3)).join("\n"), "err");
      } finally { bar.querySelector(".run").disabled = false; }
      return;
    }
    try {
      const fn = new (async function () {}).constructor("print", "plot", "table", "console", "__q", `__q.on = true;\n${prefix}\n;__q.on = false;\n${ta.value}`);
      await fn(print, plot, table, { log: print, error: (...a) => line(a.map(show).join(" "), "err") }, quiet);
      if (!out.childElementCount) line("(ran, printed nothing: add print(...) to see values)");
    } catch (e) { quiet.on = false; line(`${e.name}: ${e.message}`, "err"); }
  };
  bar.querySelector(".run").onclick = run;
  bar.querySelector(".reset").onclick = () => { ta.value = original; out.replaceChildren(); paint(); };
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ta.setRangeText(isPy ? "    " : "  ", ta.selectionStart, ta.selectionEnd, "end"); paint(); }
  });
}

// ---------- math ----------
function typeset() {
  if (!/\\\(|\\\[/.test(document.body.textContent)) return;
  const base = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/";
  document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${base}katex.min.css">`);
  const load = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  load(`${base}katex.min.js`).then(() => load(`${base}contrib/auto-render.min.js`)).then(() =>
    window.renderMathInElement(document.querySelector("main") ?? document.body, { delimiters: [{ left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }], throwOnError: false }))
    .catch(() => {}); // offline: the TeX source stays readable
}

// Pages load this file as /learn-kit.js?v=… (the server's cache-buster), so a plain "/learn-kit.js" import elsewhere
// would be a second copy of the module: other scripts use window.learnKit instead, and a second copy does nothing.
const first = !window.learnKit;
window.learnKit ??= { setupQuestion };
if (first) {
document.querySelectorAll(".q").forEach(setupQuestion);
document.querySelectorAll(".code").forEach(setupCode);
if (painters.length) loadPrism();
// a table wider than the page scrolls sideways inside its own box instead of being cut off on a phone
for (const t of document.querySelectorAll("main table")) if (!t.closest(".wide, .wide-scroll, .code") && t.scrollWidth > (t.parentElement?.clientWidth ?? 0)) { const w = document.createElement("div"); w.className = "wide-scroll"; t.before(w); w.append(t); }
typeset();
let solvedOnce = false;
new MutationObserver(() => { if (!solvedOnce && document.querySelectorAll(".q.solved").length === document.querySelectorAll(".q").length && document.querySelectorAll(".q").length > 2) { solvedOnce = true; say("Every question on this page solved!", "happy"); } })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
}
