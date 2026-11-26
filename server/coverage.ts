// The big employers in and around NYC, and whether this site reads their jobs (admin.html's coverage list). "Big" is
// any of: based in the city with 1,000+ employees (Wikidata, CC0; refreshed monthly), many job ads here over the last
// year (this site's own record, Adzuna's ads included), a layoff notice for 100+ workers at a site here (New York's
// WARN notices), or H-1B filings for professionals at worksites here (the Labor Department's, data/h1b-nyc.json from
// scripts/h1b.py: the owner downloads the files by hand, as its servers turn automated downloads away). Each is read (its own board, or the city's or the government's listings), listed (a board in the
// board lists, which the daily sweep or discovery will check), or not found: the gap to close by hand.
import { jobsDb as db, ckey, sameCompany, STAFFING, NOT_EMPLOYER } from "./jobs.ts";
import { warnNames } from "./layoffs.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

db.exec("create table if not exists bigco (ck text primary key, name text, employees int, website text, at int)");
const now = () => Math.floor(Date.now() / 1000), D = 86400;

// organisations headquartered in the five boroughs with 1,000+ employees, not dissolved (government bodies are left out
// by name below: asking Wikidata to leave out every kind of agency timed out, 2026-11-25)
const QUERY = `SELECT ?org ?orgLabel (MAX(?emp) AS ?employees) (SAMPLE(?site) AS ?website) WHERE {
  VALUES ?city { wd:Q60 wd:Q11299 wd:Q18419 wd:Q18424 wd:Q18426 wd:Q18432 }
  ?org wdt:P159 ?hq . ?hq wdt:P131* ?city . ?org wdt:P1128 ?emp . FILTER(?emp >= 1000)
  FILTER NOT EXISTS { ?org wdt:P576 ?end }
  OPTIONAL { ?org wdt:P856 ?site } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?org ?orgLabel`;
const GOV = /\b(department|police|authority|city of|state of|board of|new york city|united states|united nations)\b/i; // the city's jobs come from its own listings
export async function refreshBigEmployers(signal?: AbortSignal) {
  const r = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`, { headers: { accept: "application/sparql-results+json", "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)" },
    signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]) });
  if (!r.ok) throw new Error(`Wikidata: HTTP ${r.status}`);
  const rows = ((await r.json()).results?.bindings ?? []) as any[];
  if (rows.length < 50) throw new Error(`only ${rows.length} organisations`); // a bad answer keeps last month's
  db.exec("begin");
  try {
    db.exec("delete from bigco");
    const ins = db.prepare("insert or replace into bigco values (?, ?, ?, ?, ?)");
    for (const x of rows) { const name = String(x.orgLabel?.value ?? ""); if (name && !/^Q\d+$/.test(name) && !GOV.test(name)) ins.run(ckey(name), name, Math.round(Number(x.employees?.value)), x.website?.value ?? null, now()); }
    db.exec("commit");
  } catch (e) { db.exec("rollback"); throw e; }
  return rows.length;
}
export const bigEmployersCount = () => (db.prepare("select count(*) n from bigco").get() as any).n as number;

type Row = { name: string; ck: string; employees?: number; ads?: number; laidOff?: number; h1b?: number; website?: string | null };
const H1B = path.join(import.meta.dirname, "..", "data", "h1b-nyc.json");
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s); // "GOLDMAN SACHS & CO. LLC"
/** Every big employer with its status, the ones not read first, then by size. */
export function coverage() {
  const t = now(), m = new Map<string, Row>(), get = (ck: string, name: string) => m.get(ck) ?? m.set(ck, { name, ck }).get(ck)!;
  for (const b of db.prepare("select * from bigco").all() as any[]) Object.assign(get(b.ck, b.name), { employees: b.employees, website: b.website });
  // the most job ads in the city, New Jersey and the metro over a year (distinct titles: one job in five offices is one)
  for (const a of db.prepare(`select ckey, max(company) company, count(distinct lower(title)) n from jobs where region in ('nyc', 'nj', 'metro') and dup_of is null and coalesce(posted, first_seen) >= ?
    group by ckey having n >= 25 order by n desc limit 400`).all(t - 365 * D) as any[]) if (!STAFFING.test(a.company) && !NOT_EMPLOYER.test(a.company)) get(a.ckey, a.company).ads = a.n;
  for (const w of db.prepare("select company, max(workers) w from warn where area in ('nyc', 'metro') and posted >= ? group by company having w >= 100").all(t - 730 * D) as any[]) {
    const { legal, dba } = warnNames(w.company), name = dba ?? legal, r = get(ckey(name), name); r.laidOff = Math.max(r.laidOff ?? 0, w.w);
  }
  // H-1B positions at worksites here: 25+ a year (pro rata for the quarters on file)
  let h1b: any = null; try { h1b = JSON.parse(readFileSync(H1B, "utf8")); } catch {}
  for (const e of h1b?.employers ?? []) if (e.positions >= Math.max(6, Math.round((25 * (h1b.quarters?.length ?? 4)) / 4)) && !STAFFING.test(e.name) && !NOT_EMPLOYER.test(e.name)) {
    const r = get(ckey(e.name), titleCase(e.name)); r.h1b = (r.h1b ?? 0) + e.positions;
  }
  // who we read: an employer's own board (any name of it), or open jobs from a source that isn't Adzuna (the city's, the government's)
  const read = new Map<string, string[]>();
  for (const c of db.prepare("select ats, slug, coalesce(name, slug) name from companies").all() as any[]) { const k = ckey(c.name); read.set(k, [...(read.get(k) ?? []), c.ats]); }
  for (const j of db.prepare("select ckey, source from jobs where closed is null and dup_of is null and source not in ('adzuna', 'himalayas', 'remotive') group by ckey, source").all() as any[]) read.set(j.ckey, [...new Set([...(read.get(j.ckey) ?? []), j.source])]);
  const readKeys = [...read.keys()], open = db.prepare("select count(*) n from jobs where ckey like ? and closed is null and dup_of is null");
  const listed = db.prepare("select ats, slug, ck from directory where ck like ?");
  // the same employer under names that share no letters: what the lists file it under → what it's read as here
  const ALIAS: [RegExp, string][] = [[/^ernstandyoung/, "ey"], [/^pricewaterhousecoopers/, "pwc"], [/^internationalbusinessmachines/, "ibm"], [/^amazon(com|webservices)/, "amazon"], [/^alphabet/, "google"], [/^merrill/, "bankofamerica"]];
  const rows = [...m.values()].map((r) => {
    const alias = ALIAS.find(([re]) => re.test(r.ck))?.[1];
    if (alias && read.has(alias)) return { ...r, status: "read", via: read.get(alias)!, boards: [], open: (open.get(`${alias}%`) as any).n as number };
    // read under another form of its name: the same company by the jobs' rule, or one name starting with the other (5+
    // letters: "Bloomberg L.P." is Bloomberg, "J.P. Morgan" JPMorgan Chase; loose, but this is a to-do list, not a merge)
    const via = readKeys.filter((k) => k.slice(0, 3) === r.ck.slice(0, 3) && (sameCompany(k, r.ck) || (Math.min(k.length, r.ck.length) >= 5 && (k.startsWith(r.ck) || r.ck.startsWith(k))))).flatMap((k) => read.get(k)!);
    const boards = via.length ? [] : (listed.all(`${r.ck.slice(0, 4)}%`) as any[]).filter((d) => sameCompany(d.ck, r.ck)).map((d) => `${d.ats}:${d.slug}`);
    return { ...r, status: via.length ? "read" : boards.length ? "listed" : "none", via: [...new Set(via)], boards: boards.slice(0, 3), open: (open.get(`${r.ck}%`) as any).n as number };
  }).filter((r) => r.ck.length >= 3);
  // its size: staff (Wikidata's count counts for less without a sign of hiring here: some entries are stale, Kodak's), ads, layoffs
  const size = (r: Row) => (r.employees ?? 0) / (r.ads || r.laidOff || r.h1b ? 100 : 2000) + (r.ads ?? 0) + (r.laidOff ?? 0) / 10 + (r.h1b ?? 0) * 2;
  return rows.sort((a, b) => Number(a.status === "read") - Number(b.status === "read") || size(b) - size(a));
}

/** admin.html's page of the list: a status (none, listed, read, all), a name search, 25 a page, with the counts. The
 *  list is worked out at most every 10 minutes (about a second each time). */
let cached: { at: number; rows: ReturnType<typeof coverage> } | null = null;
export function coveragePage(status = "none", q = "", page = 0, size = 25) {
  if (!cached || Date.now() - cached.at > 600_000) cached = { at: Date.now(), rows: coverage() };
  const all = cached.rows, term = q.trim().toLowerCase(), counts: Record<string, number> = { all: all.length, read: 0, listed: 0, none: 0 };
  for (const r of all) counts[r.status]++;
  const rows = all.filter((r) => (status === "all" || r.status === status) && (!term || r.name.toLowerCase().includes(term)));
  return { counts, total: rows.length, page, size, rows: rows.slice(page * size, page * size + size), at: Math.floor(cached.at / 1000) };
}
