// The big employers whose career sites only work in a real browser (Meta, Apple, Bloomberg), read on the Mac with a
// headless Chromium (Playwright) behind the host bridge's /crawl (host.ts; the web container has no browser). A minute
// at most per employer per run; whatever was read by then comes back (user, 2026-11-16).
import { createRequire } from "node:module";
import { jobPostingLd, type Posting } from "./bigtech.ts";

const PW_DIR = process.env.PLAYWRIGHT_DIR ?? `${process.env.HOME}/.npm/_npx/9833c18b2d85bc59/node_modules/`;
const CHROME = process.env.PLAYWRIGHT_CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const text = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
/** Each job's page opened in the browser, 6 tabs at a time until the minute runs out: the page's main text (Meta's and
 *  Apple's job pages only render in a browser). */
async function pagesText(page: any, jobs: Posting[], until: number) {
  const ctx = page.context(), queue = jobs.filter((j) => !j.description), tabs = await Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => ctx.newPage()));
  await Promise.all(tabs.map(async (tab: any) => {
    for (let j = queue.shift(); j && Date.now() < until - 4000; j = queue.shift()) {
      try { await tab.goto(j.url, { waitUntil: "domcontentloaded", timeout: 15_000 }); await tab.waitForTimeout(1500); const t = await tab.$eval("main, [role=main], body", (e: any) => e.innerText).catch(() => ""), at = t.indexOf(j.title); j.description = (at >= 0 ? t.slice(at) : t).slice(0, 20_000); } catch {} // from the title on: no site menu
    }
  }));
}

/** Meta: its job search page asks its GraphQL for every matching job at once; the answer is read as the page loads. */
async function meta(page: any, until: number, known: Set<string>) {
  const found = new Map<string, any>();
  const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (x.id && x.title && (x.locations || x.teams)) found.set(String(x.id), x); Object.values(x).forEach(walk); } };
  page.on("response", async (r: any) => { if (!r.url().includes("/graphql")) return; const t = await r.text().catch(() => ""); for (const line of t.replace(/^for \(;;\);/, "").split("\n")) { try { walk(JSON.parse(line)); } catch {} } });
  await page.goto("https://www.metacareers.com/jobsearch/?offices[0]=New%20York%2C%20NY", { waitUntil: "domcontentloaded", timeout: Math.max(5000, until - Date.now()) });
  for (let i = 0; i < 20 && !found.size && Date.now() < until - 2000; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  const jobs = [...found.values()].map((j): Posting => ({ id: String(j.id), company: "Meta", title: String(j.title), location: [j.locations].flat().filter(Boolean).map(String).join("; "),
    url: `https://www.metacareers.com/profile/job_details/${j.id}/`, department: [j.teams, j.sub_teams].flat().filter(Boolean).join(" · "), description: "" }));
  await pagesText(page, jobs.filter((j) => !known.has(j.id) && /new york|jersey|remote/i.test(j.location)), until);
  return jobs;
}

/** Apple: the search's result pages (20 a page), then each new job's page for its JobPosting data. */
async function apple(page: any, until: number, known: Set<string>) {
  const rows = new Map<string, { title: string; url: string }>();
  for (let p = 1; p <= 10 && Date.now() < until - 5000; p++) {
    await page.goto(`https://jobs.apple.com/en-us/search?location=new-york-city-NYC&page=${p}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(1500);
    const got = await page.$$eval("a[href*='/details/']", (as: any[]) => as.map((a) => ({ href: a.href, title: a.textContent.trim() })));
    const before = rows.size;
    for (const g of got) { const id = g.href.match(/\/details\/([\w-]+)/)?.[1]; if (id && g.title && !/locationPicker/.test(g.href) && !rows.has(id)) rows.set(id, { title: g.title, url: g.href.replace(/\?.*$/, "") }); }
    if (rows.size === before) break;
  }
  const jobs: Posting[] = [...rows].map(([id, r]) => ({ id, company: "Apple", title: r.title, location: "New York, NY", url: r.url, description: "" }));
  await pagesText(page, jobs.filter((j) => !known.has(j.id)), until); // Apple's job text only renders in a browser
  return jobs;
}

/** Bloomberg (Avature): the search for New York, 20 a page, then each new job's page in the same browser (plain requests get 403). */
async function bloomberg(page: any, until: number, known: Set<string>) {
  const rows = new Map<string, { title: string; url: string }>();
  for (let off = 0; off < 400 && Date.now() < until - 8000; off += 20) {
    await page.goto(`https://bloomberg.avature.net/careers/SearchJobs?listFilterMode=1&jobRecordsPerPage=20&jobOffset=${off}&location=${encodeURIComponent("New York")}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const got = await page.$$eval("a[href*='/JobDetail/']", (as: any[]) => as.map((a) => ({ href: a.href, title: a.textContent.trim() })));
    const before = rows.size;
    for (const g of got) { const id = g.href.match(/\/(\d{3,})(?:[/?#]|$)/)?.[1]; if (id && g.title && !rows.has(id)) rows.set(id, { title: g.title, url: g.href }); }
    if (rows.size === before) break;
  }
  const jobs: Posting[] = [];
  for (const [id, r] of rows) {
    if (known.has(id) || Date.now() > until - 3000) { jobs.push({ id, company: "Bloomberg", title: r.title, location: "New York, NY", url: r.url, description: "" }); continue; }
    await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
    const jp = jobPostingLd(await page.content()), body = jp?.description ?? await page.$eval("main, article, .article, body", (e: any) => e.innerText).catch(() => "");
    jobs.push({ id, company: "Bloomberg", title: String(jp?.title ?? r.title), location: "New York, NY", url: r.url, posted: Date.parse(jp?.datePosted ?? "") || undefined, description: String(body).slice(0, 20_000) });
  }
  return jobs;
}

const SITES: Record<string, (page: any, until: number, known: Set<string>) => Promise<Posting[]>> = { meta, apple, bloomberg };
export const CRAWLED = Object.keys(SITES);

/** One employer, a minute at most: { jobs, partial }. known: ids already stored, so their pages aren't opened again. */
export async function crawl(site: string, known: string[] = [], ms = 60_000) {
  if (!SITES[site]) throw new Error(`no crawler for ${site}`);
  const { chromium } = createRequire(PW_DIR)("playwright"), until = Date.now() + ms;
  const browser = await chromium.launch({ executablePath: CHROME }), ctx = await browser.newContext({ userAgent: UA, locale: "en-US" }), page = await ctx.newPage();
  const stop = setTimeout(() => browser.close().catch(() => {}), ms + 10_000); // a hard stop past the minute
  try {
    const jobs = await SITES[site](page, until, new Set(known));
    return { jobs: jobs.map((j) => ({ ...j, description: text(j.description) ? j.description : "" })), partial: Date.now() > until - 3000 };
  } finally { clearTimeout(stop); await browser.close().catch(() => {}); }
}

/** One job's page, read now (someone opened it on the site before a crawl got to it): its text from the title on. */
const PAGE_HOSTS = /^(www\.metacareers\.com|jobs\.apple\.com|bloomberg\.avature\.net)$/;
export async function jobText(url: string, title: string) {
  const u = new URL(url); if (u.protocol !== "https:" || !PAGE_HOSTS.test(u.hostname)) throw new Error("not a page this reader serves");
  const { chromium } = createRequire(PW_DIR)("playwright"), browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await (await browser.newContext({ userAgent: UA, locale: "en-US" })).newPage(), job: Posting = { id: "", company: "", title, location: "", url: u.href, description: "" };
    await pagesText(page, [job], Date.now() + 30_000); return job.description;
  } finally { await browser.close().catch(() => {}); }
}

if (import.meta.url === `file://${process.argv[1]}`) { // node server/crawl.ts [site…]: crawl live from this Mac
  for (const s of process.argv.slice(2).length ? process.argv.slice(2) : CRAWLED) {
    const t = Date.now(), r = await crawl(s).catch((e) => ({ jobs: [], partial: true, error: (e as Error).message }) as any);
    console.log(`${s}: ${r.jobs.length} jobs in ${Math.round((Date.now() - t) / 1000)} s${r.partial ? " (partial)" : ""}${r.error ? ` ERROR ${r.error}` : ""} | e.g. ${r.jobs[0] ? `${r.jobs[0].title} | ${r.jobs[0].location} | ${r.jobs[0].description.length} chars` : "-"}`);
  }
}
