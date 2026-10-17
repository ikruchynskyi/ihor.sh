// The radio course's ledger check (course/ledger.json): a term may appear in a chapter earlier on the path (the course
// index's order) than the one that teaches it only
// in a paragraph that points there ("chapter 10", "ch. 10", "chapters 9 and 10", or a link to its page). Also: every page
// has a gist (<p class="gist">) and, from chapter 2 on, a "Before you start" box. Code (<pre>, <code>) and math don't count.
//   node scripts/course-ledger.ts            report
//   node scripts/course-ledger.ts --strict   exit 1 on any finding (npm run course-check uses this)
import { readFileSync, existsSync } from "node:fs";

type Term = string | { re: string; case?: boolean };
const L = JSON.parse(readFileSync("course/ledger.json", "utf8")) as { chapters: Record<string, string>; teaches: Record<string, Record<string, Term>> };
// The path is the course index's order (Part V's pictures come before Part VI's receiver chapters), not the numbers.
const order = [...readFileSync("course/index.html", "utf8").matchAll(/\["(\d\d)-[a-z0-9-]+"/g)].map((m) => m[1]);
const nums = order.filter((n) => L.chapters[n]), pos = (n: string) => nums.indexOf(n);

/** The page as paragraphs of plain text (code, math, scripts and styles removed). */
function paragraphs(file: string): string[] {
  let s = readFileSync(`course/${file}`, "utf8");
  s = s.replace(/<(script|style|pre|code|math|svg|nav)\b[\s\S]*?<\/\1>/gi, " ").replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, " ");
  s = s.replace(/<a [^>]*href="\.?\/?(\d\d)-[^"]*"[^>]*>/gi, " chapter $1 "); // a link to a chapter counts as pointing to it
  return s.split(/<\/?(?:p|li|h[1-4]|summary|div|td|th|label|option|figcaption)\b[^>]*>/i)
    .map((t) => t.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
}
/** Chapter numbers a paragraph points to. */
function pointers(p: string): Set<number> {
  const out = new Set<number>();
  for (const m of p.matchAll(/\b(?:chapters?|ch\.?)\s*((?:\d+\s*(?:,|and|to|–|-|&)?\s*)+)/gi)) {
    const ns = m[1].match(/\d+/g)!.map(Number);
    if (/[–-]|to/.test(m[1]) && ns.length === 2) for (let n = ns[0]; n <= ns[1]; n++) out.add(n); else ns.forEach((n) => out.add(n));
  }
  return out;
}

const findings: string[] = [];
const pages = new Map(nums.filter((n) => existsSync(`course/${L.chapters[n]}`)).map((n) => [n, paragraphs(L.chapters[n])] as const));
for (const [teach, terms] of Object.entries(L.teaches)) for (const [name, t] of Object.entries(terms)) {
  const re = new RegExp(typeof t === "string" ? t : t.re, typeof t === "string" || !t.case ? "i" : "");
  const own = pages.get(teach);
  if (own && !own.some((p) => re.test(p))) findings.push(`ch${teach}: "${name}" is listed as taught here, but the page never says it`);
  for (const [n, paras] of pages) {
    if (pos(n) >= pos(teach)) break;
    for (const p of paras) if (re.test(p) && !pointers(p).has(Number(teach)))
      findings.push(`ch${n}: "${name}" (taught in ch${teach}) in: ${p.replace(re, (m) => `»${m}«`).slice(0, 170)}`);
  }
}
for (const [n] of pages) {
  const html = readFileSync(`course/${L.chapters[n]}`, "utf8");
  if (!/class="gist"/.test(html)) findings.push(`ch${n}: no gist (<p class="gist">)`);
  if (n !== "01" && !/Before you start/.test(html)) findings.push(`ch${n}: no "Before you start" box`);
  const boxes = [...html.matchAll(/<details class="deeper"><summary>([^<]*)/g)].map((m) => m[1]); // the depth layers (ai/notebooks/PEDAGOGY.md §6)
  if (!boxes.some((b) => /^Why/.test(b))) findings.push(`ch${n}: no "Why …?" box (<details class="deeper">)`);
  if (!boxes.some((b) => /break/i.test(b))) findings.push(`ch${n}: no "Where it breaks" box`);
}
for (const f of findings) console.log(f);
console.log(findings.length ? `${findings.length} ledger findings` : "ledger: every term is taught before it's used");
if (process.argv.includes("--strict") && findings.length) process.exit(1);
