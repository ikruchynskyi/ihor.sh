// The big employers in and around NYC, and whether this site reads their jobs (admin.html's coverage list). "Big" is
// any of: based in the city with 1,000+ employees (Wikidata, CC0; refreshed monthly), many job ads here over the last
// year (this site's own record, Adzuna's ads included), or a layoff notice for 100+ workers at a site here (New York's
// WARN notices). Each is read (its own board, or the city's or the government's listings), listed (a board in the
// board lists, which the daily sweep or discovery will check), or not found: the gap to close by hand.
import { jobsDb as db, ckey, sameCompany, STAFFING, NOT_EMPLOYER } from "./jobs.ts";
import { warnNames } from "./layoffs.ts";

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

type Row = { name: string; ck: string; employees?: number; ads?: number; laidOff?: number; website?: string | null };
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
  // who we read: an employer's own board (any name of it), or open jobs from a source that isn't Adzuna (the city's, the government's)
  const read = new Map<string, string[]>();
  for (const c of db.prepare("select ats, slug, coalesce(name, slug) name from companies").all() as any[]) { const k = ckey(c.name); read.set(k, [...(read.get(k) ?? []), c.ats]); }
  for (const j of db.prepare("select ckey, source from jobs where closed is null and dup_of is null and source not in ('adzuna', 'himalayas', 'remotive') group by ckey, source").all() as any[]) read.set(j.ckey, [...new Set([...(read.get(j.ckey) ?? []), j.source])]);
  const readKeys = [...read.keys()], open = db.prepare("select count(*) n from jobs where ckey like ? and closed is null and dup_of is null");
  const listed = db.prepare("select ats, slug, ck from directory where ck like ?");
  const rows = [...m.values()].map((r) => {
    // read under another form of its name: the same company by the jobs' rule, or one name starting with the other (5+
    // letters: "Bloomberg L.P." is Bloomberg, "J.P. Morgan" JPMorgan Chase; loose, but this is a to-do list, not a merge)
    const via = readKeys.filter((k) => k.slice(0, 3) === r.ck.slice(0, 3) && (sameCompany(k, r.ck) || (Math.min(k.length, r.ck.length) >= 5 && (k.startsWith(r.ck) || r.ck.startsWith(k))))).flatMap((k) => read.get(k)!);
    const boards = via.length ? [] : (listed.all(`${r.ck.slice(0, 4)}%`) as any[]).filter((d) => sameCompany(d.ck, r.ck)).map((d) => `${d.ats}:${d.slug}`);
    return { ...r, status: via.length ? "read" : boards.length ? "listed" : "none", via: [...new Set(via)], boards: boards.slice(0, 3), open: (open.get(`${r.ck}%`) as any).n as number };
  }).filter((r) => r.ck.length >= 3);
  // its size: staff (Wikidata's count counts for less without a sign of hiring here: some entries are stale, Kodak's), ads, layoffs
  const size = (r: Row) => (r.employees ?? 0) / (r.ads || r.laidOff ? 100 : 2000) + (r.ads ?? 0) + (r.laidOff ?? 0) / 10;
  return rows.sort((a, b) => Number(a.status === "read") - Number(b.status === "read") || size(b) - size(a));
}
