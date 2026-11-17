// The big employers whose career sites have no public ATS API: one reader each, a minute at most per employer per run
// (user, 2026-11-16), returning what it read in that time. Plain HTTP here: Google (its results page embeds the jobs),
// Goldman Sachs (its own GraphQL), and Radancy career sites (BlackRock, Moody's: search pages, then each job's
// schema.org JobPosting), Intuit and UnitedHealth (Radancy's results endpoint), Deloitte (Avature) and EY (SuccessFactors).
// The ones that need a real browser (Meta, Apple, Bloomberg) run on the Mac: crawl.ts.

export type Posting = { id: string; company: string; title: string; location: string; url: string; posted?: number; department?: string; description: string; salary?: { min: number; max: number; period: "year" | "hour" } };
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = async (u: string, init: RequestInit = {}) => { const r = await fetch(u, { ...init, headers: { ...UA, ...(init.headers as any) }, signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };

/** schema.org JobPosting in a page (what Google for Jobs reads), or null. */
export function jobPostingLd(html: string): any {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const all = [JSON.parse(m[1].trim())].flat().flatMap((x: any) => x?.["@graph"] ?? [x]); const jp = all.find((x: any) => x?.["@type"] === "JobPosting"); if (jp) return jp; } catch {}
  }
  return null;
}
/** The same from schema.org microdata (itemprop attributes: EY's SuccessFactors pages), shaped like the JSON-LD. */
function microJob(html: string): any {
  const at = html.search(/itemprop="description"/); if (at < 0) return null;
  const open = html.slice(0, at).lastIndexOf("<"), tag = html.slice(open + 1).match(/^\w+/)![0], start = html.indexOf(">", at) + 1, re = new RegExp(`<(/?)${tag}\\b`, "g");
  let depth = 1, end = html.length; re.lastIndex = start; // the element's own content: its nested tags of the same name counted
  for (let m = re.exec(html); m; m = re.exec(html)) { depth += m[1] ? -1 : 1; if (!depth) { end = m.index; break; } }
  const prop = (k: string) => { const m = html.match(new RegExp(`itemprop="${k}"([^>]*)>([^<]*)`)); return (m?.[1].match(/content="([^"]*)"/)?.[1] ?? m?.[2] ?? "").trim(); };
  return { title: prop("title"), description: html.slice(start, end), datePosted: prop("datePosted"), jobLocation: [{ address: { addressLocality: prop("addressLocality"), addressRegion: prop("addressRegion") } }] };
}
const ldPlace = (jp: any) => [jp?.jobLocation].flat().filter(Boolean).map((l: any) => [l.address?.addressLocality, l.address?.addressRegion].filter(Boolean).join(", ")).filter(Boolean).join("; ");
const ldPay = (jp: any): Posting["salary"] => { const v = jp?.baseSalary?.value, min = Number(v?.minValue ?? v?.value), max = Number(v?.maxValue ?? v?.value), unit = String(v?.unitText ?? jp?.baseSalary?.unitText ?? "").toUpperCase();
  return min > 0 ? { min, max: max || min, period: unit === "HOUR" ? "hour" : "year" } : undefined; };

/** Google: the results page carries 20 jobs a page in its ds:1 data, descriptions included. */
async function google(until: number): Promise<{ jobs: Posting[]; partial: boolean; listPartial: boolean }> {
  const jobs: Posting[] = [];
  for (let page = 1; page <= 50; page++) {
    if (Date.now() > until) return { jobs, partial: true, listPartial: true };
    const html = await get(`https://www.google.com/about/careers/applications/jobs/results?location=${encodeURIComponent("New York, NY, USA")}&sort_by=date&page=${page}`);
    const m = html.match(/AF_initDataCallback\(\{key: 'ds:1', hash: '\d+', data:([\s\S]*?), sideChannel/);
    const list: any[] = m ? JSON.parse(m[1])[0] ?? [] : [];
    for (const j of list) jobs.push({ id: String(j[0]), company: String(j[7] ?? "Google"), title: String(j[1]), location: (j[9] ?? []).map((l: any) => l[0]).join("; "), url: `https://www.google.com/about/careers/applications/jobs/results/${j[0]}`,
      posted: Array.isArray(j[12]) ? j[12][0] * 1000 : undefined, description: [j[10]?.[1], j[3]?.[1] && `Responsibilities:\n${j[3][1]}`, j[4]?.[1], j[19]?.[1] && `Preferred:\n${j[19][1]}`].filter(Boolean).join("\n\n") });
    if (list.length < 20) return { jobs, partial: false, listPartial: false };
    await sleep(800);
  }
  return { jobs, partial: true, listPartial: true };
}

/** Goldman Sachs: its own GraphQL (the query its site sends), New York roles newest first; each role's text from the site's role file. */
const GS_QUERY = "query GetRoles($searchQueryInput: RoleSearchQueryInput!) { roleSearch(searchQueryInput: $searchQueryInput) { totalCount items { roleId corporateTitle jobTitle jobFunction locations { primary state country city } division externalSource { sourceId } } } }";
const GS_NY = [{ filterCategoryType: "LOCATION", filters: [{ filter: "United States", subFilters: [{ filter: "NY", subFilters: [{ filter: "New York", subFilters: [] }] }, { filter: "New York", subFilters: [{ filter: "New York", subFilters: [] }] }] }] }];
async function goldman(until: number, known: Set<string>): Promise<{ jobs: Posting[]; partial: boolean; listPartial: boolean; listed: string[] }> {
  const items: any[] = []; let listPartial = false;
  for (let n = 0; n < 30; n++) {
    if (Date.now() >= until) { listPartial = true; break; }
    const d = JSON.parse(await get("https://api-higher.gs.com/gateway/api/v1/graphql", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationName: "GetRoles", query: GS_QUERY, variables: { searchQueryInput: { page: { pageSize: 20, pageNumber: n }, sort: { sortStrategy: "POSTED_DATE", sortOrder: "DESC" }, filters: GS_NY, experiences: ["EARLY_CAREER", "PROFESSIONAL"], searchTerm: "" } } }) }));
    const got = d.data?.roleSearch?.items ?? []; items.push(...got);
    if (got.length < 20 || items.length >= (d.data?.roleSearch?.totalCount ?? 0)) break;
    if (n === 29) listPartial = true;
    await sleep(500);
  }
  const build = (await get("https://higher.gs.com/")).match(/"buildId":"([^"]+)"/)?.[1], jobs: Posting[] = [], listed: string[] = [];
  let partial = false;
  for (const r of items) {
    const sid = String(r.externalSource?.sourceId ?? r.roleId), base: Posting = { id: sid, company: "Goldman Sachs", title: String(r.jobTitle), location: (r.locations ?? []).map((l: any) => [l.city, l.state].filter(Boolean).join(", ")).join("; "),
      url: `https://higher.gs.com/roles/${sid}`, department: [r.division, r.jobFunction].filter(Boolean).join(" · "), description: "" };
    listed.push(sid);
    if (known.has(sid) || !build) { jobs.push(base); continue; }
    if (Date.now() > until) { partial = true; continue; }
    const role = JSON.parse(await get(`https://higher.gs.com/_next/data/${build}/roles/${sid}.json?roleId=${sid}`).catch(() => "{}")).pageProps?.role ?? {};
    const desc = Object.entries(role).filter(([k, v]) => typeof v === "string" && /desc|responsib|qualif|summary|overview/i.test(k)).map(([, v]) => v).join("\n\n");
    jobs.push({ ...base, description: desc, posted: Date.parse(role.postedDate ?? role.datePosted ?? "") || undefined });
    await sleep(400);
  }
  return { jobs: jobs.filter((j) => j.description || known.has(j.id)), partial: partial || listPartial, listPartial, listed };
}

/** A Radancy career site (BlackRock, Moody's): the search pages for New York, then each new job's JobPosting data. */
async function radancy(origin: string, company: string, until: number, known: Set<string>): Promise<{ jobs: Posting[]; partial: boolean; listPartial: boolean; listed: string[] }> {
  const links = new Map<string, string>(); let listPartial = false;
  for (let p = 1; p <= 20; p++) {
    if (Date.now() >= until) { listPartial = true; break; }
    const html = await get(`${origin}/search-jobs/New%20York?p=${p}`), before = links.size;
    for (const m of html.matchAll(/href="([^"]*\/job\/[^"]+?\/(\d{6,}))"/g)) links.set(m[2], new URL(m[1], origin).href);
    if (links.size === before) break;
    if (p === 20) listPartial = true;
    await sleep(500);
  }
  const jobs: Posting[] = []; let partial = false;
  for (const [id, url] of links) {
    if (known.has(id)) { jobs.push({ id, company, title: "", location: "New York, NY", url, description: "" }); continue; }
    if (Date.now() > until) { partial = true; continue; }
    const jp = jobPostingLd(await get(url).catch(() => ""));
    if (jp) jobs.push({ id, company, title: String(jp.title ?? ""), location: ldPlace(jp) || "New York, NY", url, posted: Date.parse(jp.datePosted ?? "") || undefined, department: String(jp.occupationalCategory ?? ""), description: String(jp.description ?? ""), salary: ldPay(jp) });
    await sleep(400);
  }
  return { jobs, partial: partial || listPartial, listPartial, listed: [...links.keys()] };
}

type Keep = (location: string, title: string) => boolean; // jobs.ts's test: our area or remote US, tech, data or finance
/** List pages 0, 1, 2… read `conc` at a time until one comes back empty, `max` pages, or `until`. rows() parses a page and
 *  says how many jobs it had. */
async function pages(url: (i: number) => string, rows: (html: string) => number, until: number, conc = 4, max = 150, init: RequestInit = {}) {
  let next = 0, done = false, err = false;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (!done && Date.now() < until) {
      const i = next++; if (i >= max) return;
      let html: string; try { html = await get(url(i), init); } catch { err = true; done = true; return; }
      if (!rows(html)) done = true;
    }
  }));
  return !done || err; // true: stopped by time, max, or error, so there may be more
}
/** Each job page's schema.org JobPosting, `conc` at a time until `until`; known ones are passed through untouched. */
const notOurs = new Set<string>(); // job pages read that turned out elsewhere ("Multiple Locations"), not read again while this runs
async function pagesLd(company: string, list: { id: string; url: string; title: string; location: string }[], until: number, known: Set<string>, keep?: Keep, conc = 3) {
  const jobs: Posting[] = [], queue = list.filter((j) => !known.has(j.id) && !notOurs.has(`${company}:${j.id}`)); let partial = false;
  for (const j of list) if (known.has(j.id)) jobs.push({ id: j.id, company, title: j.title, location: j.location, url: j.url, description: "" });
  await Promise.all(Array.from({ length: conc }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      if (Date.now() > until) { partial = true; return; }
      const html = await get(j.url).catch(() => ""), jp = jobPostingLd(html) ?? microJob(html); if (!jp) continue;
      // the list's place too (EY's page names one city); "Multiple Locations" isn't one
      const cities = ldPlace(jp) ? ldPlace(jp).split("; ") : [...html.replace(/<[^>]+>/g, " ").matchAll(/([A-Z][A-Za-z.' -]{1,30}, [A-Z][A-Za-z ]{1,25}), United States/g)].map((m) => m[1].trim()).slice(0, 60); // Deloitte's many-city jobs: the cities in its text
      const location = [...new Set([j.location, ...cities, /\bremote\b/i.test(`${j.location} ${j.title}`) ? "Remote" : ""].filter((x) => x && !/multiple locations/i.test(x)))].join("; ");
      if (keep && !keep(location, j.title)) { notOurs.add(`${company}:${j.id}`); continue; }
      jobs.push({ id: j.id, company, title: String(jp.title ?? j.title).trim(), location, url: j.url,
        posted: Date.parse(jp.datePosted ?? "") || undefined, department: String(jp.occupationalCategory ?? ""), description: String(jp.description ?? ""), salary: ldPay(jp) });
    }
  }));
  return { jobs, partial: partial || queue.length > 0 };
}
/** Radancy sites that list everything at once (Intuit, UnitedHealth): 100 jobs a page from its results endpoint, each
 *  row's title and place deciding which job pages to open. */
async function radancyAll(origin: string, company: string, until: number, known: Set<string>, keep: Keep) {
  const rows = new Map<string, { id: string; url: string; title: string; location: string }>();
  const more = await pages((i) => `${origin}/search-jobs/results?ActiveFacetID=0&CurrentPage=${i + 1}&RecordsPerPage=100&Distance=50&RadiusUnitType=0&Keywords=&Location=&ShowRadius=False&IsPagination=False&FacetType=0&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters&SortCriteria=0&SortDirection=0&SearchType=5&ResultsType=0`,
    (h) => { let n = 0; try { for (const m of String(JSON.parse(h).results ?? "").matchAll(/<a[^>]+href="([^"]*\/job\/[^"]+?\/(\d{6,}))"[^>]*>([\s\S]*?)<\/a>/g)) {
      n++; const parts = m[3].replace(/<[^>]+>/g, "\n").split("\n").map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x)), title = parts[0] ?? "", location = parts.length > 1 ? parts.at(-1)! : "";
      if (keep(location, title)) rows.set(m[2], { id: m[2], url: new URL(m[1], origin).href, title, location }); } } catch {} return n; },
    until - 25_000, 4, 80, { headers: { "x-requested-with": "XMLHttpRequest" } });
  const r = await pagesLd(company, [...rows.values()], until, known); return { jobs: r.jobs, partial: r.partial || more, listPartial: more, listed: [...rows.keys()] };
}
/** Deloitte (Avature): its US list, 10 a page with each job's first city, then the job pages of ours (every city). */
async function avature(origin: string, company: string, until: number, known: Set<string>, keep: Keep) {
  const rows = new Map<string, { id: string; url: string; title: string; location: string }>();
  const more = await pages((i) => `${origin}/SearchJobs?listFilterMode=1&jobRecordsPerPage=10&jobOffset=${i * 10}`, (h) => { let n = 0;
    for (const art of h.split(/<article\b/).slice(1)) { // a result: its link, then "Deloitte US | <entity> | <first city>"
      const a = art.match(/<a\s[^>]*href="([^"]+\/JobDetail\/[^"]+?\/(\d+))"[^>]*>\s*([^<]+?)\s*<\/a>/), spans = [...art.matchAll(/<span>\s*([^<]*?)\s*<\/span>/g)].map((x) => x[1]);
      if (!a) continue; n++; const location = spans.at(-1) ?? "";
      if (keep(location, a[3]) || (/multiple locations/i.test(location) && keep("New York, NY", a[3]))) rows.set(a[2], { id: a[2], url: a[1], title: a[3], location }); } // its page lists them all
    return n; }, until - 30_000, 4, 300);
  const r = await pagesLd(company, [...rows.values()], until, known, keep, 4); return { jobs: r.jobs, partial: r.partial || more, listPartial: more, listed: [...rows.keys()] };
}
/** EY (SAP SuccessFactors career site): its search for each place, 25 a page, then the job pages of ours. */
async function sapsf(origin: string, company: string, places: string[], until: number, known: Set<string>, keep: Keep) {
  const rows = new Map<string, { id: string; url: string; title: string; location: string }>(); let more = false;
  for (const place of places) more = (await pages((i) => `${origin}/search/?createNewAlert=false&q=&locationsearch=${encodeURIComponent(place)}&startrow=${i * 25}`, (h) => { let n = 0;
    for (const [, tr] of h.matchAll(/<tr class="data-row">([\s\S]*?)<\/tr>/g)) { const a = tr.match(/href="([^"]+\/(\d{6,})\/)"[^>]*class="jobTitle-link"[^>]*>([^<]+)/), loc = tr.match(/class="jobLocation"[^>]*>\s*([^<]+)/)?.[1]?.trim() ?? "";
      if (!a) continue; n++; const location = loc.replace(/,\s*US,?\s*[\d-]*$/, ""); if (keep(location, a[3])) rows.set(a[2], { id: a[2], url: new URL(a[1], origin).href, title: a[3].trim(), location }); }
    return n; }, until - 25_000, 3, 60)) || more;
  const r = await pagesLd(company, [...rows.values()], until, known); return { jobs: r.jobs, partial: r.partial || more, listPartial: more, listed: [...rows.keys()] };
}

/** The employers read here, by key; each gets until `until` (ms since epoch). known: ids already stored (no detail request). */
export const PLAIN: Record<string, { name: string; read: (until: number, known: Set<string>, keep: Keep) => Promise<{ jobs: Posting[]; partial: boolean; listPartial?: boolean; listed?: string[] }> }> = {
  google: { name: "Google", read: (until) => google(until) },
  goldman: { name: "Goldman Sachs", read: goldman },
  blackrock: { name: "BlackRock", read: (until, known) => radancy("https://careers.blackrock.com", "BlackRock", until, known) },
  moodys: { name: "Moody's", read: (until, known) => radancy("https://careers.moodys.com", "Moody's", until, known) },
  intuit: { name: "Intuit", read: (until, known, keep) => radancyAll("https://jobs.intuit.com", "Intuit", until, known, keep) },
  unitedhealth: { name: "UnitedHealth Group", read: (until, known, keep) => radancyAll("https://careers.unitedhealthgroup.com", "UnitedHealth Group", until, known, keep) },
  deloitte: { name: "Deloitte", read: (until, known, keep) => avature("https://apply.deloitte.com/en_US/careers", "Deloitte", until, known, keep) },
  ey: { name: "EY", read: (until, known, keep) => sapsf("https://careers.ey.com/ey", "EY", ["New York, NY", "Hoboken, NJ"], until, known, keep) },
};

if (import.meta.url === `file://${process.argv[1]}`) { // node server/bigtech.ts [key…]: read them live, a minute each
  for (const k of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLAIN)) {
    const t = Date.now(), r = await PLAIN[k].read(Date.now() + 60_000, new Set()).catch((e) => ({ jobs: [], partial: true, error: (e as Error).message }) as any);
    console.log(`${k}: ${r.jobs.length} jobs in ${Math.round((Date.now() - t) / 1000)} s${r.partial ? " (partial)" : ""}${r.error ? ` ERROR ${r.error}` : ""} | e.g. ${r.jobs[0] ? `${r.jobs[0].title} | ${r.jobs[0].location} | ${r.jobs[0].description.length} chars${r.jobs[0].salary ? ` | $${r.jobs[0].salary.min}-${r.jobs[0].salary.max}` : ""}` : "-"}`);
  }
}
