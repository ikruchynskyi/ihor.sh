// Layoffs employers must announce: New York State's WARN notices (a notice is required before laying off 50 or more
// people at one site), read daily from the state Labor Department's public dashboard (since January 2025). They go on
// the company page and its card's facts, the market tab and its AI brief, and the job check. New Jersey's notices sit
// behind bot protection and aren't read.
import { createHash } from "node:crypto";
import { jobsDb as db, ckey, csvRows, employerKeys, getCompanyInfo } from "./jobs.ts";

const SRC = "https://public.tableau.com/views/WorkerAdjustmentRetrainingNotificationWARN/WARNList.csv?:showVizHome=no";
export const WARN_PAGE = "https://dol.ny.gov/warn-dashboard";
db.exec(`create table if not exists warn (id text primary key, company text, ck text, ck2 text, posted int, notice int, starts int, site text, county text,
  area text, industry text, kind text, temp text, reason text, workers int);
  create index if not exists warn_ck on warn (ck); create index if not exists warn_ck2 on warn (ck2); create index if not exists warn_posted on warn (area, posted);`);

const NYC = new Set(["New York", "Kings", "Queens", "Bronx", "Richmond"]), SUBURBS = new Set(["Nassau", "Suffolk", "Westchester", "Rockland", "Putnam"]);
const now = () => Math.floor(Date.now() / 1000), D = 86400;
/** "2026-11-05" or "11/5/2026" as noon in New York (seconds). */
const date = (s: string) => {
  const a = s.trim(), iso = a.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), us = a.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [y, mo, d] = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : [];
  const t = y ? Date.parse(`${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}T12:00:00-05:00`) : NaN;
  return Number.isFinite(t) ? t / 1000 : null;
};
/** The name a notice is filed under, split into its legal name and its trade name: "SDH Education West, LLC d/b/a
 *  Sodexo - Binghamton University" is SDH Education West and Sodexo; "Amazon (Western)" is Amazon. */
export function warnNames(name: string) {
  const dba = name.match(/\bd\/?b\/?a\b\.?\s*([^-(]+)/i)?.[1]?.trim();
  return { legal: name.split(/\s+-\s+|\s+d\/?b\/?a\b|\(/i)[0].trim(), dba: dba || null };
}
// One employer under its legal name: our name plus legal words only ("citi" / "citigroup", "meta" / "metaplatforms",
// "jpmorganchase" / "jpmorganchasebankna", "goldmansachs" / "goldmansachsand" from "& Co", "nbcuniversal" / "nbcuniversalmedia"),
// never another word ("apple" is not Apple Bank, "nice" not Nice-Pak).
const LEGAL = /^(bankna|na|and|media|limited|ltd|inc|llc|plc|llp|lp|corporation|corp|company|co|holdings?|group|usa?|us|america|services|technolog(y|ies)|international|global|platforms|management|operations|enterprises|worldwide|retail|stores)+$/;
export const sameEmployer = (a: string, b: string) => { const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return !!s && (a === b || (s.length >= 4 && l.startsWith(s) && LEGAL.test(l.slice(s.length)))); };

export async function refreshWarn(signal?: AbortSignal) {
  const r = await fetch(SRC, { headers: { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)" }, signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const [head, ...rows] = csvRows(await r.text()), at = (n: string) => head.findIndex((h) => h.trim().toLowerCase().startsWith(n));
  const c = { name: at("business legal name"), starts: at("date layoff"), notice: at("date of warn"), posted: at("date posted"), site: at("impacted site address"), county: at("impacted site county"),
    industry: at("industry"), kind: at("layoff or closure"), temp: at("permanent or temporary"), reason: at("reason"), workers: at("min. number") };
  if (Object.values(c).some((i) => i < 0) || rows.length < 100) throw new Error(`unexpected file: ${rows.length} rows, columns ${head.join(" | ").slice(0, 200)}`); // a changed file keeps yesterday's
  const ins = db.prepare("insert or replace into warn values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  db.exec("begin");
  try {
    db.exec("delete from warn");
    for (const x of rows) {
      const name = (x[c.name] ?? "").trim(), county = (x[c.county] ?? "").trim(), { legal, dba } = warnNames(name);
      if (!name) continue;
      ins.run(createHash("sha1").update(`${name}|${x[c.notice]}|${x[c.site]}`).digest("hex").slice(0, 16), name, ckey(legal), dba ? ckey(dba) : null, date(x[c.posted] ?? ""), date(x[c.notice] ?? ""), date(x[c.starts] ?? ""),
        (x[c.site] ?? "").replace(/\s+/g, " ").trim(), county, NYC.has(county) ? "nyc" : SUBURBS.has(county) ? "metro" : "ny", (x[c.industry] ?? "").trim(), (x[c.kind] ?? "").trim(), (x[c.temp] ?? "").trim(),
        (x[c.reason] ?? "").trim(), Number(String(x[c.workers] ?? "").replace(/[^\d]/g, "")) || 0);
    }
    db.exec("commit");
  } catch (e) { db.exec("rollback"); throw e; }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "warn", 1, rows.length, `${rows.length} New York layoff notices`);
  return rows.length;
}
export const warnCount = () => (db.prepare("select count(*) n from warn").get() as any).n as number;
const lastRead = () => (db.prepare("select max(at) t from runs where what = 'warn'").get() as any)?.t ?? null;

const row = (r: any) => ({ company: r.company, posted: r.posted, notice: r.notice, starts: r.starts, site: r.site, county: r.county, area: r.area, industry: r.industry, kind: r.kind, temp: r.temp, reason: r.reason, workers: r.workers });
/** An employer's notices (any of its names here, its legal or trade name there), newest first. */
export function warnFor(name: string) {
  // its names here, by the strict rule too: the page's own merging lets "Apple Bank" into Apple's (a bank tail is allowed there)
  const keys = [...new Set([ckey(name), ...employerKeys(name).filter((k) => sameEmployer(k, ckey(name)))])].filter((k) => k.length >= 3);
  if (!keys.length) return null;
  const like = keys.map((k) => `${k.slice(0, 4)}%`), q = keys.map(() => "ck like ? or ck2 like ?").join(" or ");
  const notices = (db.prepare(`select * from warn where ${q} order by posted desc`).all(...like.flatMap((l) => [l, l])) as any[])
    .filter((r) => keys.some((k) => sameEmployer(r.ck, k) || (r.ck2 && sameEmployer(r.ck2, k)))).map(row);
  const t = now(), y = notices.filter((r) => (r.posted ?? 0) >= t - 365 * D);
  return { notices, workers: notices.reduce((s, r) => s + r.workers, 0), workers12: y.reduce((s, r) => s + r.workers, 0), n12: y.length,
    since: (db.prepare("select min(posted) t from warn").get() as any).t, read: lastRead(), source: WARN_PAGE };
}

/** The market tab's layoffs: notices for sites in NYC and its New York suburbs (the job filters don't apply; an employer
 *  filter does): by month for a year, the last 90 days against the 90 before, by industry, the largest recent ones,
 *  and, for the market's top employers, their notices here in the last 12 months and their latest round on Layoffs.fyi
 *  (any country, from their company card) in the last two years. */
export function layoffsMarket(company?: string, employers: { key: string; name: string }[] = []) {
  const t = now(), local = "area in ('nyc', 'metro')";
  const only = company ? warnFor(company) : null, all = only ? only.notices.filter((r) => r.area !== "ny")
    : (db.prepare(`select * from warn where ${local} and posted >= ? order by posted desc`).all(t - 400 * D) as any[]).map(row);
  const sum = (l: any[]) => ({ notices: l.length, workers: l.reduce((s, r) => s + r.workers, 0) });
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (11 - i)); const key = d.toISOString().slice(0, 7);
    return { month: key, ...sum(all.filter((r) => r.posted && new Date(r.posted * 1000).toISOString().slice(0, 7) === key)) }; });
  const in90 = all.filter((r) => r.posted >= t - 90 * D), prev90 = all.filter((r) => r.posted < t - 90 * D && r.posted >= t - 180 * D), year = all.filter((r) => r.posted >= t - 365 * D);
  const ind = new Map<string, { notices: number; workers: number }>(); for (const r of year) { const g = ind.get(r.industry) ?? { notices: 0, workers: 0 }; g.notices++; g.workers += r.workers; ind.set(r.industry, g); }
  const hiring = (n: string) => employerKeys(n).length > 0; // an employer with open jobs here: its name links to its page
  return { last90: sum(in90), prev90: sum(prev90), year: sum(year), months,
    industries: [...ind].map(([industry, g]) => ({ industry, ...g })).sort((a, b) => b.workers - a.workers).slice(0, 8),
    largest: [...in90].sort((a, b) => b.workers - a.workers).slice(0, 10).map((r) => ({ ...r, hiring: hiring(warnNames(r.company).dba ?? warnNames(r.company).legal) })),
    employers: Object.fromEntries(employers.map((e) => {
      const l = (warnFor(e.name)?.notices ?? []).filter((r) => r.area !== "ny" && r.posted >= t - 365 * D), f = getCompanyInfo(e.name)?.layoffs?.latest, ft = f?.date ? Date.parse(`${f.date}T12:00:00Z`) / 1000 : 0;
      const warn = l.length ? { notices: l.length, workers: l.reduce((s, r) => s + r.workers, 0), latest: l[0].posted } : null, fyi = ft >= t - 730 * D ? { date: f.date, count: f.count ?? null } : null;
      return [e.key, warn || fyi ? { warn, fyi } : null]; }).filter(([, v]) => v)),
    read: lastRead(), source: WARN_PAGE, company: company ?? null };
}
