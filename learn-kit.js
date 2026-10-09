// Lesson kit for the courses (AI, electronics, radio): questions you answer before you're told, code you can edit and
// run, and math typeset with KaTeX. Pages just write markup; importing this module wires it up.
//
//   <div class="q" data-answer="b">                     a question with choices
//     <p>Which way does the ball roll?</p>
//     <ul><li data-k="a" data-says="feedback for a wrong pick">left</li><li data-k="b">right</li></ul>
//     <div class="why">the explanation, shown once it's answered</div>
//   </div>
//   <div class="q" data-num="0.25" data-tol="0.01">…</div>  a number to type (tol: how close counts, default 1%)
//
//   <div class="code" id="sgd" data-uses="other-id"><textarea>print(1 + 1)</textarea></div>
//     runs in the page with print(...), plot(ys or [[x, y]…], {label}) and table(rows); data-uses runs another
//     block's code first (quietly), so a chapter can build a program up in steps. Ctrl/⌘+Enter runs.
//
//   \( inline math \) and \[ display math \] anywhere in the text.

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
.q .giveup { font-size: 0.85em; background: none !important; border: none !important; color: var(--muted) !important; text-decoration: underline; cursor: pointer; padding: 0 !important; box-shadow: none !important; }
.code { margin: 18px 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
.code .bar { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); font: 0.8rem ui-sans-serif, system-ui, sans-serif; color: var(--muted); }
.code .bar b { flex: 1; color: var(--fg); font-weight: 600; }
.code .bar button { font-size: 0.8rem !important; padding: 3px 10px !important; }
.code textarea { display: block; width: 100%; box-sizing: border-box; border: 0; margin: 0; padding: 10px 12px; resize: vertical; background: #0f1218; color: #d7dde5; font: 13.5px/1.55 ui-monospace, Menlo, monospace; tab-size: 2; white-space: pre; overflow: auto; outline: none; }
.code .out { margin: 0; padding: 8px 12px; font: 13px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; border-top: 1px solid var(--line); max-height: 340px; overflow: auto; }
.code .out:empty { display: none; }
.code .out .err { color: var(--red, #e03131); }
.code .out canvas { display: block; max-width: 100%; margin: 6px 0; background: #14171d; border-radius: 6px; }
.code .out table { border-collapse: collapse; margin: 4px 0; } .code .out td { border: 1px solid var(--line); padding: 2px 8px; text-align: right; }
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
function setupQuestion(q) {
  const solve = () => { q.classList.add("solved"); q.querySelectorAll("button, input").forEach((b) => { if (!b.classList.contains("keep")) b.disabled = true; }); };
  const says = document.createElement("p"); says.className = "says"; says.setAttribute("aria-live", "polite");
  const why = q.querySelector(".why");
  if (q.dataset.answer) {
    for (const li of q.querySelectorAll("li[data-k]")) {
      const b = document.createElement("button"); b.innerHTML = li.innerHTML; li.replaceChildren(b);
      b.onclick = () => {
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
      if (Math.abs(got - want) <= tol) { says.className = "says ok"; says.textContent = `Right: ${q.dataset.show ?? want}.`; solve(); }
      else { says.className = "says no"; says.textContent = (got > want ? "Too big. " : "Too small. ") + (q.dataset.hint ?? "Try again."); }
    };
    btn.onclick = check; inp.onkeydown = (e) => { if (e.key === "Enter") check(); };
    const ask = [...q.querySelectorAll(":scope > p")].at(-1); ask ? ask.after(row) : q.prepend(row);
    row.after(says);
  }
  if (why) {
    const give = document.createElement("button"); give.className = "giveup keep"; give.textContent = "show me the answer";
    give.onclick = () => { q.classList.add("shown"); give.remove(); };
    says.after(give);
    new MutationObserver(() => { if (q.classList.contains("solved")) give.remove(); }).observe(q, { attributes: true, attributeFilter: ["class"] });
  }
}

// ---------- runnable code ----------
const blocks = new Map();
function setupCode(box) {
  const ta = box.querySelector("textarea"), original = ta.value.replace(/^\n/, "").replace(/\s+$/, "");
  ta.value = original; ta.spellcheck = false; ta.setAttribute("autocapitalize", "off");
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
    const prefix = (box.dataset.uses ?? "").split(/\s+/).filter(Boolean).map((id) => blocks.get(id)?.value ?? "").join("\n;\n");
    try {
      const fn = new (async function () {}).constructor("print", "plot", "table", "console", "__q", `__q.on = true;\n${prefix}\n;__q.on = false;\n${ta.value}`);
      await fn(print, plot, table, { log: print, error: (...a) => line(a.map(show).join(" "), "err") }, quiet);
      if (!out.childElementCount) line("(ran, printed nothing: add print(...) to see values)");
    } catch (e) { quiet.on = false; line(`${e.name}: ${e.message}`, "err"); }
  };
  bar.querySelector(".run").onclick = run;
  bar.querySelector(".reset").onclick = () => { ta.value = original; out.replaceChildren(); };
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); }
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

document.querySelectorAll(".q").forEach(setupQuestion);
document.querySelectorAll(".code").forEach(setupCode);
typeset();
let solvedOnce = false;
new MutationObserver(() => { if (!solvedOnce && document.querySelectorAll(".q.solved").length === document.querySelectorAll(".q").length && document.querySelectorAll(".q").length > 2) { solvedOnce = true; say("Every question on this page solved!", "happy"); } })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
