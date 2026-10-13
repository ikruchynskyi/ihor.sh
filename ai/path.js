// "On the path" box at the end of every AI lesson: previous and next lesson, read from the index's order (ai/index.html is
// the one place the path is defined, so reordering it there reorders every page's links).
const here = location.pathname.split("/").pop();
const html = await fetch("/ai/").then((r) => r.text()).catch(() => "");
const doc = new DOMParser().parseFromString(html, "text/html"), lessons = [];
for (const h of doc.querySelectorAll("h2.stage")) {
  const ol = h.nextElementSibling?.nextElementSibling;
  for (const a of ol?.matches("ol.path") ? ol.querySelectorAll("li:not(.soon) a") : []) lessons.push({ href: a.getAttribute("href").replace("./", ""), title: a.textContent, stage: h.textContent });
}
const i = lessons.findIndex((l) => l.href === here);
if (i >= 0) {
  const { stage } = lessons[i], inStage = lessons.filter((l) => l.stage === stage), prev = lessons[i - 1], next = lessons[i + 1];
  const nav = document.createElement("nav");
  nav.className = "card";
  nav.style.cssText = "margin: 40px 0 0; padding: 12px 16px; font-size: 1rem;";
  nav.innerHTML = `<div style="font-size:.8rem;color:var(--muted)">On the path · ${stage} · lesson ${inStage.indexOf(lessons[i]) + 1} of ${inStage.length} ready</div>`
    + (prev ? `<div>← Previous: <a href="./${prev.href}">${prev.title}</a></div>` : "")
    + (next ? `<div>Next: <a href="./${next.href}"><b>${next.title}</b></a> →</div>` : `<div>That's the end of the path so far. <a href="./">See what's coming</a>.</div>`);
  document.querySelector("main")?.append(nav);
}
// A lesson's practice notebook (ai/notebooks/index.json, written by ai/notebooks/build.py): Colab, Kaggle or download.
const nb = (await fetch("/ai/notebooks/index.json").then((r) => r.json()).catch(() => ({})))[here];
if (nb) {
  const box = document.createElement("aside");
  box.className = "card";
  box.style.cssText = "margin: 40px 0 0; padding: 12px 16px; font-size: 1rem; border-left: 4px solid var(--accent);";
  box.innerHTML = `<b>Practice notebook</b>: exercises with checks, in Python, on a free cloud machine.<br>`
    + `<a href="${nb.colab}" target="_blank" rel="noopener">Open in Colab</a> · <a href="${nb.kaggle}" target="_blank" rel="noopener">Open on Kaggle</a> (then <i>Copy &amp; Edit</i>) · <a href="/ai/notebooks/${nb.notebook}" download>download .ipynb</a>`;
  const main = document.querySelector("main"), navEl = main?.querySelector(":scope > nav.card");
  navEl ? navEl.before(box) : main?.append(box);
}
