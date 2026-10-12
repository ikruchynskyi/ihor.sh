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
