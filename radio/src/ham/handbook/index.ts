// The Handbook companion index: parts → chapters → sections, each with links to its interactive explanations.
import "../ham.css";
import { PARTS, chapters, resolve } from "./map.ts";
import { esc } from "../store.ts";

const chs = new Map(chapters().map((c) => [c.num, c]));
document.getElementById("toc")!.innerHTML = PARTS.map(([part, nums]) => `<h2>${esc(part)}</h2>` + nums.map((n) => {
  const c = chs.get(n)!, linked = c.sections.filter((s) => s.links.length).length;
  return `<details class="sub" id="ch${n}"><summary><span class="ch-head"><span class="n">${n}</span><span class="stitle">${esc(c.title)}</span><span class="cov">${linked} sections linked</span></span></summary>
    <ul class="secs">${c.sections.map((s) => `<li><span class="sn">${s.num}</span><span>${esc(s.title)}</span><span class="chips">${s.links.map((k) => { const r = resolve(k); const anchor = k.split("#")[1]; return `<a class="k-${r.kind}" href="${r.href}">${r.text}${anchor ? ` · ${anchor.replace(/-/g, " ")}` : ""}</a>`; }).join("")}</span></li>`).join("")}</ul></details>`;
}).join("")).join("");
// Open the chapter named in the URL (e.g. #ch21).
const target = document.getElementById(location.hash.slice(1));
if (target instanceof HTMLDetailsElement) target.open = true;
