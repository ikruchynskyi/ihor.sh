// AI search (ASO) and SEO check over every page in the sitemap, as an AI crawler sees it: the raw HTML, no JavaScript.
// AI crawlers fetch scripts but don't run them, so content that only JavaScript draws is invisible to them (IDEAS.md,
// "AI search (ASO) and SEO"). Errors fail the run; the report lists pages to improve and pages due for a freshness review.
//   node aso-check.ts                     (BASE=https://ihor.sh node aso-check.ts for the live site)
//   REVIEW_DAYS=120 node aso-check.ts     a page whose content hasn't changed for this long is due for review (default 180)
//   node aso-check.ts --list              print every finding, not just counts and the first few
const BASE = process.env.BASE ?? "http://localhost:8080", REVIEW_DAYS = Number(process.env.REVIEW_DAYS ?? 180), LIST = process.argv.includes("--list");
const UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)";
const VAGUE = /^(overview|introduction|intro|more|details|misc|other|notes|summary|background|the problem|the solution|why|how|what|next|results?|conclusion)$/i;

const get = (u: string) => fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))));
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (h: string) => h.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " "); // what's left is what a crawler reads
const text = (h: string) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const urls = [...(await get(`${BASE}/sitemap.xml`)).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]).replace("https://ihor.sh", BASE));
type Page = { path: string; title: string; desc: string; words: number; h1: number; main: boolean; h2: string[]; skips: string[]; modified: string; canonical: boolean };
const pages: Page[] = [], broken: string[] = [];
for (let i = 0; i < urls.length; i += 12) await Promise.all(urls.slice(i, i + 12).map(async (u) => {
  const html = await get(u).catch((e) => { broken.push(`${u} (${e.message})`); return ""; });
  if (!html) return;
  const body = strip(html.slice(html.search(/<body\b/i)));
  const heads = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: +m[1], text: text(m[2]) }));
  const skips: string[] = []; heads.forEach((h, k) => { if (k && h.level > heads[k - 1].level + 1) skips.push(`h${heads[k - 1].level}→h${h.level} "${h.text.slice(0, 40)}"`); });
  pages.push({
    path: u.slice(BASE.length) || "/", title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? ""), desc: decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ""),
    words: text(body).split(" ").length, h1: heads.filter((h) => h.level === 1).length, main: /<main\b|role="main"/.test(body),
    h2: heads.filter((h) => h.level === 2).map((h) => h.text), skips, modified: html.match(/"dateModified":"(\d{4}-\d\d-\d\d)"/)?.[1] ?? "", canonical: /<link rel="canonical"/.test(html),
  });
}));

const errors: [string, string[]][] = [], report: [string, string[]][] = [];
const add = (to: typeof errors, what: string, list: string[]) => { if (list.length) to.push([what, list]); };
const titles = new Map<string, string[]>(); for (const p of pages) titles.set(p.title, [...(titles.get(p.title) ?? []), p.path]);
add(errors, "pages that don't load", broken);
add(errors, "no <title>", pages.filter((p) => !p.title).map((p) => p.path));
add(errors, "the same <title> on several pages", [...titles].filter(([t, ps]) => t && ps.length > 1).map(([t, ps]) => `"${t}": ${ps.join(", ")}`));
add(errors, "no meta description", pages.filter((p) => !p.desc).map((p) => p.path));
add(errors, "not exactly one <h1> (outside scripts)", pages.filter((p) => p.h1 !== 1).map((p) => `${p.path} (${p.h1})`));
add(errors, "no <main> or role=\"main\"", pages.filter((p) => !p.main).map((p) => p.path));
add(errors, "no canonical link", pages.filter((p) => !p.canonical).map((p) => p.path));
add(errors, "no dateModified in the JSON-LD", pages.filter((p) => !p.modified && p.path !== "/").map((p) => p.path)); // the home page describes the WebSite

const today = Date.now(), age = (d: string) => Math.floor((today - Date.parse(d)) / 864e5);
add(report, `content unchanged for over ${REVIEW_DAYS} days: due for a freshness review (update what's changed; the commit dates it)`, pages.filter((p) => p.modified && age(p.modified) > REVIEW_DAYS).sort((a, b) => a.modified.localeCompare(b.modified)).map((p) => `${p.path} (${p.modified})`));
add(report, "under 150 words without JavaScript: AI crawlers see an almost empty page (server-render the main content)", pages.filter((p) => p.words < 150).sort((a, b) => a.words - b.words).map((p) => `${p.path} (${p.words} words)`));
add(report, "description over 170 characters (cut off in results; lead with the subject)", pages.filter((p) => p.desc.length > 170).map((p) => `${p.path} (${p.desc.length})`));
add(report, "description under 50 characters (too thin to classify the page)", pages.filter((p) => p.desc && p.desc.length < 50).map((p) => `${p.path} (${p.desc.length})`));
add(report, "title over 70 characters", pages.filter((p) => p.title.length > 70).map((p) => `${p.path} (${p.title.length})`));
add(report, "over 400 words but no <h2>: no subheadings for AI retrieval to match passages against", pages.filter((p) => p.words > 400 && !p.h2.length).map((p) => p.path));
add(report, "vague subheadings (name what the section says instead)", pages.flatMap((p) => p.h2.filter((h) => VAGUE.test(h.replace(/^[\d.\s]+/, ""))).map((h) => `${p.path}: "${h}"`)));
add(report, "heading levels skipped", pages.flatMap((p) => p.skips.map((s) => `${p.path}: ${s}`)));

const show = (list: string[]) => (LIST ? list : list.slice(0, 5)).map((l) => `    ${l}`).join("\n") + (!LIST && list.length > 5 ? `\n    … ${list.length - 5} more (--list)` : "");
console.log(`aso-check: ${pages.length} pages from ${BASE}/sitemap.xml`);
for (const [what, list] of errors) console.log(`✗ ${list.length} ${what}\n${show(list)}`);
for (const [what, list] of report) console.log(`• ${list.length} ${what}\n${show(list)}`);
console.log(errors.length ? `${errors.reduce((n, [, l]) => n + l.length, 0)} errors` : "0 errors");
process.exit(errors.length ? 1 : 0);
