// What every AI lesson gets around its content, from the path's order (ai/index.html is the one place it's defined)
// and /ai/course.json: a "before you start" box (prerequisites, goals, a quick recall of the last lesson), section
// anchors, gap tracking for every question, a checkpoint quiz that marks the lesson done and adds its concept cards
// to the review deck, the practice notebook, and previous/next links. Progress lives in ai/learn.js (this browser).
import { state, course, path, finish, answered, slug, gain, did, XP } from "/ai/learn.js";
import { strip } from "/ai/hud.js";

const here = location.pathname.split("/").pop(), main = document.querySelector("main");
const lessons = await path;
const i = lessons.findIndex((l) => l.href === here), prev = lessons[i - 1], next = lessons[i + 1];
const C = await course, me = C[here] ?? {}, esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const box = (css = "") => { const el = document.createElement("aside"); el.className = "card"; el.style.cssText = `margin: 40px 0 0; padding: 12px 16px; font-size: 1rem; ${css}`; return el; };

// ---------- section anchors (so gaps and the checkpoint can link straight to a section) ----------
const sections = [...(main?.querySelectorAll(":scope > h2") ?? [])];
for (const h of sections) if (!h.id) h.id = slug(h.textContent);
const sectionOf = (el) => sections.filter((h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);

// ---------- before you start ----------
if (i >= 0 && (me.goals || prev)) {
  const needs = [...new Set([prev?.href, ...(me.needs ?? [])].filter(Boolean))].map((h) => lessons.find((l) => l.href === h)).filter(Boolean);
  const recall = (prev && C[prev.href]?.cards?.slice(0, 2)) ?? [];
  const top = box("margin: 18px 0 8px; border-left: 4px solid var(--accent);");
  const done = state.done[here];
  top.innerHTML = (done ? `<div style="color:var(--green,#2f9e44)">✓ You ${done.testedOut ? "tested out of" : "finished"} this lesson (${done.testedOut ? "tested out" : `checkpoint ${done.score}/5`}). <a href="./review.html">Review deck</a></div>` : "")
    + (needs.length ? `<div><b>You need:</b> ${needs.map((l) => `<a href="./${l.href}">${state.done[l.href] ? "✓ " : ""}${esc(l.title)}</a>`).join(" · ")}</div>` : "")
    + (me.goals ? `<div><b>You'll be able to:</b></div><ul style="margin:4px 0">${me.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "")
    + (recall.length ? `<div><b>Quick recall</b> from <i>${esc(prev.title)}</i>: answer in your head, then open.</div>` + recall.map(([f, b]) => `<details style="margin:2px 0"><summary>${esc(f)}</summary>→ ${esc(b)}</details>`).join("") : "");
  const hud = document.createElement("div"); hud.style.cssText = "margin-top:8px;padding-top:6px;border-top:1px solid var(--line)";
  top.append(strip(hud));
  (main.querySelector(":scope > .lede") ?? main.querySelector("h1"))?.after(top);
}

// ---------- gaps: a first-try miss marks the section; later right answers there clear it ----------
addEventListener("learnkit:answer", ({ detail: { q, right, first } }) => {
  if (!first || i < 0) return;
  const h = q.dataset.sec ? sections[+q.dataset.sec - 1] : sectionOf(q);
  if (h) answered(here, h.id, `${lessons[i].title}: ${h.textContent.replace(/^\s*\d+\.\s*/, "")}`, right);
  // XP for an inline question right on the first try, once per question (the checkpoint pays on its own)
  if (right && !q.closest("#checkpoint")) gain(XP.question, "question", `question:${here}#${[...main.querySelectorAll(".q")].indexOf(q)}`);
});

// ---------- checkpoint ----------
function checkpoint() {
  const el = box("border: 2px solid var(--accent);"), firsts = new Map();
  el.id = "checkpoint";
  el.innerHTML = `<h2 style="margin:0 0 4px">Checkpoint</h2><p style="margin:0">Five questions on the whole lesson. Get 4 right on the first try to finish it: its concept cards go into your <a href="./review.html">review deck</a>, and anything you miss shows up as a gap to revisit.</p>`
    + me.check.map((c, n) => `<div class="q" data-answer="${"abcde"[c.answer]}" data-sec="${c.sec ?? ""}" data-n="${n}"><p>${n + 1}. ${esc(c.q)}</p><ul>${c.options.map((o, k) => `<li data-k="${"abcde"[k]}">${esc(o)}</li>`).join("")}</ul><div class="why">${esc(c.why)}${c.sec && sections[c.sec - 1] ? ` <a href="#${sections[c.sec - 1].id}">Back to that section</a>` : ""}</div></div>`).join("")
    + `<div class="result"></div>`;
  const qs = [...el.querySelectorAll(".q")];
  qs.forEach((q) => window.learnKit?.setupQuestion(q));
  addEventListener("learnkit:answer", ({ detail: { q, right, first } }) => {
    if (!el.contains(q) || !first) return;
    firsts.set(q, right);
    if (firsts.size < qs.length) return;
    const score = [...firsts.values()].filter(Boolean).length, res = el.querySelector(".result");
    if (score >= 4) {
      finish(here, score, me.cards);
      res.innerHTML = `<p><b style="color:var(--green,#2f9e44)">✓ ${score}/5: lesson finished.</b> ${me.cards?.length ?? 0} concept cards added to your <a href="./review.html">review deck</a> (first review tomorrow).${next ? ` Next: <a href="./${next.href}"><b>${esc(next.title)}</b></a> →` : ""}</p>`;
      dispatchEvent(new CustomEvent("blip:say", { detail: { text: `Lesson done, ${score}/5! Your cards are in the review deck.`, mood: "happy" } }));
    } else {
      const missed = qs.filter((q) => !firsts.get(q)).map((q) => sections[+q.dataset.sec - 1]).filter(Boolean);
      res.innerHTML = `<p><b>${score}/5.</b> Reread ${[...new Set(missed)].map((h) => `<a href="#${h.id}">${esc(h.textContent.replace(/^\s*\d+\.\s*/, ""))}</a>`).join(", ") || "the lesson"}, then <button type="button" class="again">try the checkpoint again</button>.</p>`;
      res.querySelector(".again").onclick = () => { const fresh = checkpoint(); el.replaceWith(fresh); };
    }
  });
  return el;
}
if (me.check?.length && main) main.append(checkpoint());

// ---------- practice notebook (ai/notebooks/index.json, written by ai/notebooks/build.py) ----------
const nb = (await fetch("/ai/notebooks/index.json").then((r) => r.json()).catch(() => ({})))[here];
if (nb && main) {
  const el = box("border-left: 4px solid var(--accent);");
  el.innerHTML = `<b>Practice notebook</b>: exercises with checks, in Python, on a free cloud machine.<br>`
    + `<a href="${nb.colab}" target="_blank" rel="noopener">Open in Colab</a> · <a href="${nb.kaggle}" target="_blank" rel="noopener">Open on Kaggle</a> (then <i>Copy &amp; Edit</i>) · <a href="/ai/notebooks/${nb.notebook}" download>download .ipynb</a>`
    + `<div style="margin-top:6px"><button type="button" class="nb-done"></button></div>`;
  const btn = el.querySelector(".nb-done"), key = `notebook:${here}`;
  const mark = () => { btn.textContent = did(key) ? "✓ Notebook finished" : `I finished the notebook (+${XP.notebook} XP)`; btn.disabled = did(key); };
  btn.onclick = () => { gain(XP.notebook, "notebook", key); mark(); };
  mark();
  main.append(el);
}

// ---------- on the path: previous and next ----------
if (i >= 0 && main) {
  const { stage } = lessons[i], inStage = lessons.filter((l) => l.stage === stage);
  const nav = document.createElement("nav");
  nav.className = "card";
  nav.style.cssText = "margin: 40px 0 0; padding: 12px 16px; font-size: 1rem;";
  nav.innerHTML = `<div style="font-size:.8rem;color:var(--muted)">On the path · ${stage} · lesson ${inStage.indexOf(lessons[i]) + 1} of ${inStage.length} ready · <a href="./review.html">review deck</a> · <a href="./glossary.html">glossary</a></div>`
    + (prev ? `<div>← Previous: <a href="./${prev.href}">${prev.title}</a></div>` : "")
    + (next ? `<div>Next: <a href="./${next.href}"><b>${next.title}</b></a> →</div>` : `<div>That's the end of the path so far. <a href="./">See what's coming</a>.</div>`);
  main.append(nav);
}

// ---------- practice (lane K) ----------
if (me.practice?.length && main) {
  const pBox = box("border-left: 4px solid var(--accent); margin-top: 14px;");
  const links = me.practice
    .map((id) => `<a href="./practice.html?skill=${encodeURIComponent(id)}"><b>${esc(id.replace(/-/g, " "))}</b> →</a>`)
    .join(" · ");
  pBox.innerHTML = `<b>Practice this math</b>: generated problems with step-by-step checks.<br>${links}`;
  main.append(pBox);
}
// ---------- practice (lane K) ----------
