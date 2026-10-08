// Study sessions (spaced repetition, instant feedback) and mock exams (one question per group, scored at the end).
import "./ham.css";
import { answer, answerOrder, exam, groupChances, groupOf, passChance, ruleLinks, scoreDistribution, session, subOf, type Memory, type Pool, type Question } from "./srs.ts";
import { esc, loadMemory, loadPool, saveExam, saveMemory, setLastPool, type PoolId } from "./store.ts";
import { COURSE, lessonsFor } from "./lessons.ts";

const el = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const id = (["T", "G", "E"].includes(params.get("pool") ?? "") ? params.get("pool") : "T") as PoolId;
const mode = params.get("mode") === "exam" ? "exam" : "study";
const scope = params.get("scope") ?? ""; // subelements or groups, comma-separated ("T5" or "T5A,T5D")
const LETTERS = "ABCD";

let pool: Pool, mem: Memory;
const chanceNow = () => passChance(scoreDistribution([...groupChances(pool, mem).values()]), pool.pass);
const groupTitle = (q: Question) => pool.subs.flatMap((s) => s.groups).find((g) => g.id === groupOf(q.id))!.title;

/** Where to read up on a question: the visual lessons, the course chapters, and the rule text. */
function learnLinks(q: Question) {
  const g = groupOf(q.id);
  const items = [
    ...lessonsFor(g).map((l) => `<a href="./lessons/${l.slug}.html">${esc(l.title)}</a> (lesson)`),
    ...(COURSE[g] ?? []).map((c) => `<a href="../course/${c.ch}">${esc(c.title)}</a> (course)`),
    ...ruleLinks(q.ref).map((r) => `<a href="${r.url}" target="_blank" rel="noopener">FCC rule ${r.text}</a>`),
  ];
  return items.length ? `<p>Learn why: ${items.join(" · ")}</p>` : "";
}

function card(q: Question, order: number[], meta: string) {
  return `<div class="card"><div class="meta"><span>${q.id} · ${esc(groupTitle(q))}</span><span>${meta}</span></div>
    <p class="qtext">${esc(q.q)}</p>
    ${q.fig ? `<figure><img src="./fig/${q.fig}" alt="Figure ${q.fig.replace(".png", "").toUpperCase()} from the question pool"></figure>` : ""}
    <div class="answers">${order.map((k, i) => `<button type="button" data-k="${k}"><b>${LETTERS[i]}</b><span>${esc(q.a[k])}</span></button>`).join("")}</div>
    <div class="feedback" id="fb" aria-live="polite"></div></div>`;
}

// --- Study ------------------------------------------------------------------------------------------------------------
function study() {
  const inScope = (q: Question) => !scope || scope.split(",").some((p) => q.id.startsWith(p));
  const queue = session(pool, mem, inScope);
  const retries = new Map<string, number>(), before = chanceNow();
  let i = 0, right = 0, answered = 0;
  el("title").textContent = `${pool.name} study${scope ? `: ${scope}` : ""}`;
  if (!queue.length) { el("stage").innerHTML = `<p>Nothing due and no new questions left${scope ? ` in ${scope}` : ""}. Come back tomorrow, or <a href="./practice.html?pool=${id}&mode=exam">take a mock exam</a>.</p>`; return; }

  const show = () => {
    if (i >= queue.length) return finish();
    const q = queue[i], order = answerOrder(q), c = mem[q.id];
    el("stage").innerHTML = `<div class="progress"><div style="width:${(i / queue.length) * 100}%"></div></div>` +
      card(q, order, `${i + 1} of ${queue.length} · ${c ? `review (box ${c.b})` : "new"}`) +
      `<p class="note">Keys: <span class="kbd">1</span>–<span class="kbd">4</span> or <span class="kbd">A</span>–<span class="kbd">D</span> to answer, <span class="kbd">Enter</span> for next.</p>`;
    let done = false;
    const pick = (k: number) => {
      if (done) return; done = true; answered++;
      const ok = k === q.c; if (ok) right++;
      answer(mem, q.id, ok); saveMemory(id, mem);
      document.querySelectorAll<HTMLButtonElement>(".answers button").forEach((b) => {
        const bk = +b.dataset.k!; b.disabled = true;
        if (bk === q.c) b.classList.add("right"); else if (bk === k) b.classList.add("wrong");
      });
      if (!ok && (retries.get(q.id) ?? 0) < 2) { retries.set(q.id, (retries.get(q.id) ?? 0) + 1); queue.splice(Math.min(queue.length, i + 4), 0, q); }
      const correctLetter = LETTERS[order.indexOf(q.c)];
      el("fb").innerHTML = `<p><span class="verdict ${ok ? "ok" : "no"}">${ok ? "Right." : `Not quite: the answer is ${correctLetter}.`}</span>
        ${ok ? "" : "It will come back in a few questions."}</p>${learnLinks(q)}
        <button type="button" class="btn" id="next">Next →</button>`;
      el("next").focus();
      el("next").addEventListener("click", () => { i++; show(); });
    };
    document.querySelectorAll<HTMLButtonElement>(".answers button").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.k!)));
    onkey = (key) => {
      const n = "1234".indexOf(key) >= 0 ? "1234".indexOf(key) : "abcd".indexOf(key.toLowerCase());
      if (!done && n >= 0) pick(order[n]); else if (done && key === "Enter") { i++; show(); }
    };
  };
  const finish = () => {
    onkey = () => {};
    const after = chanceNow();
    el("stage").innerHTML = `<div class="card"><p class="qtext">Session done: <b>${right}</b> right out of ${answered} answers.</p>
      <p>Chance of passing the ${esc(pool.name)} exam today: ${Math.round(before * 100)}% → <b>${Math.round(after * 100)}%</b>.</p>
      <div class="row"><a class="btn" href="${location.href}">Another session</a><a class="btn alt" href="./">Dashboard</a></div></div>`;
  };
  show();
}

// --- Exam ---------------------------------------------------------------------------------------------------------------
function mockExam() {
  const qs = exam(pool), orders = qs.map((q) => answerOrder(q)), picks: (number | null)[] = qs.map(() => null);
  let i = 0;
  el("title").textContent = `${pool.name} mock exam`;
  const grid = () => `<div class="qgrid">${qs.map((_, k) => `<button type="button" data-i="${k}" class="${picks[k] !== null ? "done" : ""} ${k === i ? "cur" : ""}" aria-label="Question ${k + 1}">${k + 1}</button>`).join("")}</div>`;
  const show = () => {
    const q = qs[i];
    el("stage").innerHTML = `<p class="note">${qs.length} questions, one from each group; you need ${pool.pass}. Nothing is marked until you finish.</p>` + grid() +
      card(q, orders[i], `question ${i + 1} of ${qs.length}`) +
      `<div class="row"><button class="btn alt" id="prev" ${i ? "" : "disabled"}>← Back</button><button class="btn alt" id="fwd">${i < qs.length - 1 ? "Next →" : "Review"}</button>
       <button class="btn" id="finish">Finish and score (${picks.filter((p) => p !== null).length}/${qs.length} answered)</button></div>`;
    document.querySelectorAll<HTMLButtonElement>(".answers button").forEach((b) => {
      if (+b.dataset.k! === picks[i]) b.classList.add("chosen");
      b.addEventListener("click", () => { picks[i] = +b.dataset.k!; if (i < qs.length - 1) i++; show(); });
    });
    document.querySelectorAll<HTMLButtonElement>(".qgrid button").forEach((b) => b.addEventListener("click", () => { i = +b.dataset.i!; show(); }));
    el("prev").addEventListener("click", () => { i = Math.max(0, i - 1); show(); });
    el("fwd").addEventListener("click", () => { i = Math.min(qs.length - 1, i + 1); show(); });
    el("finish").addEventListener("click", score);
    onkey = (key) => {
      const n = "1234".indexOf(key) >= 0 ? "1234".indexOf(key) : "abcd".indexOf(key.toLowerCase());
      if (n >= 0) { picks[i] = orders[i][n]; if (i < qs.length - 1) i++; show(); }
      else if (key === "ArrowRight") { i = Math.min(qs.length - 1, i + 1); show(); }
      else if (key === "ArrowLeft") { i = Math.max(0, i - 1); show(); }
    };
  };
  const score = () => {
    onkey = () => {};
    const ok = qs.map((q, k) => picks[k] === q.c), total = ok.filter(Boolean).length;
    const bySub: Record<string, [number, number]> = {};
    qs.forEach((q, k) => { const s = (bySub[subOf(q.id)] ??= [0, 0]); s[1]++; if (ok[k]) s[0]++; answer(mem, q.id, ok[k]); });
    saveMemory(id, mem); saveExam(id, { date: Date.now(), score: total, of: qs.length, pass: pool.pass, bySub });
    const passed = total >= pool.pass;
    el("stage").innerHTML = `<div class="card"><p class="qtext"><b class="${passed ? "pass" : "fail"}">${passed ? "Pass" : "Not yet"}</b>: ${total} of ${qs.length} (you need ${pool.pass}).</p>
      <table class="res"><tr><th>Topic</th><th class="n">Right</th></tr>${pool.subs.map((s) => `<tr><td>${s.id} ${esc(s.title)}</td><td class="n">${bySub[s.id]?.[0] ?? 0} / ${bySub[s.id]?.[1] ?? 0}</td></tr>`).join("")}</table>
      <div class="row"><a class="btn" href="${location.href}">Another exam</a><a class="btn alt" href="./">Dashboard</a></div></div>
      <h2>Review your misses</h2>` +
      (qs.map((q, k) => ok[k] ? "" : `<div class="card"><div class="meta"><span>${q.id} · ${esc(groupTitle(q))}</span></div><p class="qtext">${esc(q.q)}</p>
        ${q.fig ? `<figure><img src="./fig/${q.fig}" alt=""></figure>` : ""}
        <p>${picks[k] === null ? "Not answered." : `You chose: <span class="fail">${esc(q.a[picks[k]!])}</span>`}<br>Answer: <span class="pass">${esc(q.a[q.c])}</span></p>${learnLinks(q)}</div>`).join("") || "<p>None. Well done.</p>");
    scrollTo(0, 0);
  };
  show();
}

let onkey: (key: string) => void = () => {};
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
  if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return; // the focused button's own click handles it
  onkey(e.key);
});

(async () => {
  setLastPool(id);
  pool = await loadPool(id); mem = loadMemory(id);
  (mode === "exam" ? mockExam : study)();
})();
