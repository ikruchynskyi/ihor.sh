// License dashboard: pick a class, see where you stand, and jump into study or a mock exam.
import "./ham.css";
import { C, Scene, label, line } from "../course/anim.ts";
import { groupChances, groupOf, passChance, scoreDistribution, subOf, type Memory, type Pool } from "./srs.ts";
import { POOL_IDS, esc, lastPool, loadExams, loadMemory, loadPool, resetPool, setLastPool, type PoolId } from "./store.ts";
import { COURSE, LESSONS, lessonsFor } from "./lessons.ts";

const el = (id: string) => document.getElementById(id)!;
const NAMES: Record<PoolId, [string, string]> = { T: ["Technician", "Element 2 · 35 questions"], G: ["General", "Element 3 · 35 questions"], E: ["Amateur Extra", "Element 4 · 50 questions"] };
const pct = (x: number) => (x < 0.01 && x > 0 ? "<1%" : x > 0.99 && x < 1 ? ">99%" : `${Math.round(x * 100)}%`);
const fmtDate = (s: string) => new Date(s + "T12:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

let pool: Pool, mem: Memory, id: PoolId = lastPool();
let dist: number[] = [1];

// The predicted score: one bar per possible score, the pass mark as a line.
const chart = new Scene(el("s-dist"), (g, w, h) => {
  if (!pool) return;
  const n = pool.exam, L = 12, R = w - 12, T = 24, B = h - 26, bw = (R - L) / (n + 1), top = Math.max(...dist, 1e-9);
  dist.forEach((p, k) => {
    const bh = (p / top) * (B - T);
    g.fillStyle = k >= pool.pass ? C.green : C.blue; g.fillRect(L + k * bw + 1, B - bh, Math.max(1, bw - 2), bh);
  });
  const xp = L + pool.pass * bw;
  line(g, xp, T - 8, xp, B, C.yellow, 1.5, [5, 4]);
  label(g, `pass: ${pool.pass} of ${n}`, xp + 6, T + 4, C.yellow, "left", 11);
  for (const k of [0, Math.round(n / 2), n]) label(g, `${k}`, L + k * bw + bw / 2, h - 8, C.muted, "center", 10);
  label(g, "how likely each exam score is, if you sat the exam today", L, 14, C.muted, "left", 11);
}, 180, { animated: false, label: "Predicted distribution of your exam score, with the pass mark" });

function render() {
  const chances = groupChances(pool, mem);
  dist = scoreDistribution(pool.subs.flatMap((s) => s.groups.map((g) => chances.get(g.id)!)));
  const expected = dist.reduce((a, p, k) => a + p * k, 0), seen = pool.q.filter((q) => mem[q.id]).length;
  const due = pool.q.filter((q) => mem[q.id] && mem[q.id].due <= Date.now()).length;
  el("pool-info").innerHTML = `<b>${esc(pool.name)}</b>, FCC Element ${pool.element}: ${pool.q.length} questions in the pool, valid ${fmtDate(pool.valid[0])} to ${fmtDate(pool.valid[1])}. The exam takes one question from each of the ${pool.exam} groups; you pass with ${pool.pass} right (74%).`;
  el("stats").innerHTML = `<div><b>${pct(passChance(dist, pool.pass))}</b><span>chance of passing today</span></div>
    <div><b>${expected.toFixed(1)}</b><span>expected score of ${pool.exam}</span></div>
    <div><b>${seen}</b><span>of ${pool.q.length} questions seen</span></div>
    <div><b>${due}</b><span>due for review</span></div>`;
  el("go-study").setAttribute("href", `./practice.html?pool=${id}&mode=study`);
  el("go-exam").setAttribute("href", `./practice.html?pool=${id}&mode=exam`);
  chart.redraw();

  el("subs").innerHTML = pool.subs.map((s) => {
    const qs = pool.q.filter((q) => subOf(q.id) === s.id), n = qs.length;
    const k = [0, 0, 0, 0]; for (const q of qs) { const c = mem[q.id]; if (c) k[c.b === 0 ? 0 : c.b <= 2 ? 1 : c.b <= 4 ? 2 : 3]++; }
    const exp = s.groups.reduce((a, g) => a + chances.get(g.id)!, 0);
    return `<details class="sub"><summary><span class="sid">${s.id}</span><span class="stitle">${esc(s.title)}</span>
      <span class="schance">${exp.toFixed(1)} of ${s.groups.length} expected</span>
      <span class="sbar"><span class="bar5">${k.map((c, i) => `<i class="k${i}" style="width:${(c / n) * 100}%"></i>`).join("")}</span></span></summary>
      <div class="groups"><p class="row"><a class="btn alt" href="./practice.html?pool=${id}&mode=study&scope=${s.id}">Study ${s.id} only</a>
        <span class="note">${n} questions, ${s.groups.length} on the exam</span></p><ul>
      ${s.groups.map((g) => {
        const links = [...lessonsFor(g.id).map((l) => `<a href="./lessons/${l.slug}.html">${esc(l.title)}</a>`),
          ...(COURSE[g.id] ?? []).map((c) => `<a href="../course/${c.ch}">${esc(c.title)}</a> (course)`)];
        const gq = pool.q.filter((q) => groupOf(q.id) === g.id).length;
        return `<li><span class="gid">${g.id}</span>${esc(g.title)} <span class="note">· ${gq} questions · ${pct(chances.get(g.id)!)}</span>
          ${links.length ? `<span class="glinks">Learn it: ${links.join(" · ")}</span>` : ""}</li>`;
      }).join("")}</ul></div></details>`;
  }).join("");

  const exams = loadExams(id).slice().reverse();
  el("history").innerHTML = exams.length
    ? `<table class="res"><tr><th>Date</th><th>Score</th><th>Result</th></tr>${exams.slice(0, 10).map((e) => `<tr><td>${new Date(e.date).toLocaleString()}</td><td class="n">${e.score} / ${e.of}</td><td class="${e.score >= e.pass ? "pass" : "fail"}">${e.score >= e.pass ? "pass" : "not yet"}</td></tr>`).join("")}</table>`
    : `<p class="note">No mock exams yet.</p>`;
}

async function choose(next: PoolId) {
  id = next; setLastPool(id);
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === id)));
  pool = await loadPool(id); mem = loadMemory(id); render();
}

el("tabs").innerHTML = POOL_IDS.map((p) => `<button type="button" data-p="${p}" aria-pressed="false">${NAMES[p][0]}<small>${NAMES[p][1]}</small></button>`).join("");
el("tabs").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) choose(b.dataset.p as PoolId); });

el("lessons").innerHTML = LESSONS.map((l) => `<li>${l.ready ? `<a href="./lessons/${l.slug}.html"><b>${esc(l.title)}</b></a>` : `<b>${esc(l.title)}</b> <span class="note">(coming)</span>`}: ${esc(l.blurb)}</li>`).join("");

// Reset asks twice in-page instead of with a browser dialog.
const reset = el("reset") as HTMLButtonElement;
reset.addEventListener("click", () => {
  if (reset.dataset.armed) { resetPool(id); mem = loadMemory(id); render(); reset.textContent = "Reset progress"; delete reset.dataset.armed; return; }
  reset.dataset.armed = "1"; reset.textContent = `Really erase your ${NAMES[id][0]} progress? Click again`;
  setTimeout(() => { reset.textContent = "Reset progress"; delete reset.dataset.armed; }, 4000);
});
addEventListener("pageshow", () => { if (pool) { mem = loadMemory(id); render(); } }); // fresh numbers when coming back from practice
choose(id);
