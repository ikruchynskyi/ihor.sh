// The big employers whose career sites have no public ATS API: one reader each, a minute at most per employer per run
// (user, 2026-11-16), returning what it read in that time. Plain HTTP here: Google (its results page embeds the jobs),
// Goldman Sachs (its own GraphQL), and Radancy career sites (BlackRock, Moody's: search pages, then each job's
// schema.org JobPosting). The ones that need a real browser (Meta, Apple, Bloomberg) run on the Mac: crawl.ts.

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
const ldPlace = (jp: any) => [jp?.jobLocation].flat().filter(Boolean).map((l: any) => [l.address?.addressLocality, l.address?.addressRegion].filter(Boolean).join(", ")).filter(Boolean).join("; ");
const ldPay = (jp: any): Posting["salary"] => { const v = jp?.baseSalary?.value, min = Number(v?.minValue ?? v?.value), max = Number(v?.maxValue ?? v?.value), unit = String(v?.unitText ?? jp?.baseSalary?.unitText ?? "").toUpperCase();
  return min > 0 ? { min, max: max || min, period: unit === "HOUR" ? "hour" : "year" } : undefined; };

/** Google: the results page carries 20 jobs a page in its ds:1 data, descriptions included. */
async function google(until: number): Promise<{ jobs: Posting[]; partial: boolean }> {
  const jobs: Posting[] = [];
  for (let page = 1; page <= 50; page++) {
    if (Date.now() > until) return { jobs, partial: true };
    const html = await get(`https://www.google.com/about/careers/applications/jobs/results?location=${encodeURIComponent("New York, NY, USA")}&sort_by=date&page=${page}`);
    const m = html.match(/AF_initDataCallback\(\{key: 'ds:1', hash: '\d+', data:([\s\S]*?), sideChannel/);
    const list: any[] = m ? JSON.parse(m[1])[0] ?? [] : [];
    for (const j of list) jobs.push({ id: String(j[0]), company: String(j[7] ?? "Google"), title: String(j[1]), location: (j[9] ?? []).map((l: any) => l[0]).join("; "), url: `https://www.google.com/about/careers/applications/jobs/results/${j[0]}`,
      posted: Array.isArray(j[12]) ? j[12][0] * 1000 : undefined, description: [j[10]?.[1], j[3]?.[1] && `Responsibilities:\n${j[3][1]}`, j[4]?.[1], j[19]?.[1] && `Preferred:\n${j[19][1]}`].filter(Boolean).join("\n\n") });
    if (list.length < 20) break;
    await sleep(800);
  }
  return { jobs, partial: false };
}

/** Goldman Sachs: its own GraphQL (the query its site sends), New York roles newest first; each role's text from the site's role file. */
const GS_QUERY = "query GetRoles($searchQueryInput: RoleSearchQueryInput!) { roleSearch(searchQueryInput: $searchQueryInput) { totalCount items { roleId corporateTitle jobTitle jobFunction locations { primary state country city } division externalSource { sourceId } } } }";
const GS_NY = [{ filterCategoryType: "LOCATION", filters: [{ filter: "United States", subFilters: [{ filter: "NY", subFilters: [{ filter: "New York", subFilters: [] }] }, { filter: "New York", subFilters: [{ filter: "New York", subFilters: [] }] }] }] }];
async function goldman(until: number, known: Set<string>): Promise<{ jobs: Posting[]; partial: boolean }> {
  const items: any[] = [];
  for (let n = 0; n < 30 && Date.now() < until; n++) {
    const d = JSON.parse(await get("https://api-higher.gs.com/gateway/api/v1/graphql", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationName: "GetRoles", query: GS_QUERY, variables: { searchQueryInput: { page: { pageSize: 20, pageNumber: n }, sort: { sortStrategy: "POSTED_DATE", sortOrder: "DESC" }, filters: GS_NY, experiences: ["EARLY_CAREER", "PROFESSIONAL"], searchTerm: "" } } }) }));
    const got = d.data?.roleSearch?.items ?? []; items.push(...got);
    if (got.length < 20 || items.length >= (d.data?.roleSearch?.totalCount ?? 0)) break;
    await sleep(500);
  }
  const build = (await get("https://higher.gs.com/")).match(/"buildId":"([^"]+)"/)?.[1], jobs: Posting[] = [];
  let partial = false;
  for (const r of items) {
    const sid = String(r.externalSource?.sourceId ?? r.roleId), base: Posting = { id: sid, company: "Goldman Sachs", title: String(r.jobTitle), location: (r.locations ?? []).map((l: any) => [l.city, l.state].filter(Boolean).join(", ")).join("; "),
      url: `https://higher.gs.com/roles/${sid}`, department: [r.division, r.jobFunction].filter(Boolean).join(" · "), description: "" };
    if (known.has(sid) || !build) { jobs.push(base); continue; }
    if (Date.now() > until) { partial = true; continue; }
    const role = JSON.parse(await get(`https://higher.gs.com/_next/data/${build}/roles/${sid}.json?roleId=${sid}`).catch(() => "{}")).pageProps?.role ?? {};
    const desc = Object.entries(role).filter(([k, v]) => typeof v === "string" && /desc|responsib|qualif|summary|overview/i.test(k)).map(([, v]) => v).join("\n\n");
    jobs.push({ ...base, description: desc, posted: Date.parse(role.postedDate ?? role.datePosted ?? "") || undefined });
    await sleep(400);
  }
  return { jobs: jobs.filter((j) => j.description || known.has(j.id)), partial };
}

/** A Radancy career site (BlackRock, Moody's): the search pages for New York, then each new job's JobPosting data. */
async function radancy(origin: string, company: string, until: number, known: Set<string>): Promise<{ jobs: Posting[]; partial: boolean }> {
  const links = new Map<string, string>();
  for (let p = 1; p <= 20 && Date.now() < until; p++) {
    const html = await get(`${origin}/search-jobs/New%20York?p=${p}`), before = links.size;
    for (const m of html.matchAll(/href="([^"]*\/job\/[^"]+?\/(\d{6,}))"/g)) links.set(m[2], new URL(m[1], origin).href);
    if (links.size === before) break;
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
  return { jobs, partial };
}

/** The employers read here, by key; each gets until `until` (ms since epoch). known: ids already stored (no detail request). */
export const PLAIN: Record<string, { name: string; read: (until: number, known: Set<string>) => Promise<{ jobs: Posting[]; partial: boolean }> }> = {
  google: { name: "Google", read: (until) => google(until) },
  goldman: { name: "Goldman Sachs", read: goldman },
  blackrock: { name: "BlackRock", read: (until, known) => radancy("https://careers.blackrock.com", "BlackRock", until, known) },
  moodys: { name: "Moody's", read: (until, known) => radancy("https://careers.moodys.com", "Moody's", until, known) },
};

if (import.meta.url === `file://${process.argv[1]}`) { // node server/bigtech.ts [key…]: read them live, a minute each
  for (const k of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLAIN)) {
    const t = Date.now(), r = await PLAIN[k].read(Date.now() + 60_000, new Set()).catch((e) => ({ jobs: [], partial: true, error: (e as Error).message }) as any);
    console.log(`${k}: ${r.jobs.length} jobs in ${Math.round((Date.now() - t) / 1000)} s${r.partial ? " (partial)" : ""}${r.error ? ` ERROR ${r.error}` : ""} | e.g. ${r.jobs[0] ? `${r.jobs[0].title} | ${r.jobs[0].location} | ${r.jobs[0].description.length} chars${r.jobs[0].salary ? ` | $${r.jobs[0].salary.min}-${r.jobs[0].salary.max}` : ""}` : "-"}`);
  }
}
