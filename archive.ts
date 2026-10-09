// MTA archive: every 5 minutes, poll the subway alerts feed and the elevator/escalator outage feed,
// and keep every alert and outage ever seen in SQLite with when we first and last saw it. The MTA
// only publishes what's happening now, so this history can't be backfilled: it has to run from day one.
// /nyc/archive.html reads the summary from /api/nyc/archive.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";
const ALERTS = FEED + "camsys%2Fsubway-alerts.json";
const OUTAGES = FEED + "nyct%2Fnyct_ene.json";
const EVERY_MS = 5 * 60_000;

const dir = path.join(import.meta.dirname, "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "mta.db"));
db.exec(`
  create table if not exists polls (feed text, at int, ok int, count int);
  create table if not exists alerts (id text primary key, type text, routes text, header text,
    created int, active_start int, active_end int, first_seen int, last_seen int);
  create table if not exists outages (equipment text, start int, station text, trains text, kind text,
    serving text, reason text, est_return int, ada int, first_seen int, last_seen int, primary key (equipment, start));
`);

const now = () => Math.floor(Date.now() / 1000);
// ponytail: the outage feed's dates are New York local time strings; this parses them in the server's
// time zone, which is New York on the Mac mini. Pass a zone explicitly if the server ever moves.
const nyTime = (s: string) => (s ? Math.floor(new Date(s).getTime() / 1000) || null : null);

const upsertAlert = db.prepare(`insert into alerts values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  on conflict(id) do update set type = excluded.type, routes = excluded.routes, header = excluded.header,
  active_start = excluded.active_start, active_end = excluded.active_end, last_seen = excluded.last_seen`);
const upsertOutage = db.prepare(`insert into outages values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  on conflict(equipment, start) do update set reason = excluded.reason, est_return = excluded.est_return, last_seen = excluded.last_seen`);
const logPoll = db.prepare("insert into polls values (?, ?, ?, ?)");

async function poll(feed: string, url: string, save: (data: any, at: number) => number) {
  const at = now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    db.exec("begin");
    const count = save(data, at);
    db.exec("commit");
    logPoll.run(feed, at, 1, count);
  } catch (e) {
    if (db.isTransaction) db.exec("rollback");
    logPoll.run(feed, at, 0, 0);
    console.error(`archive ${feed}:`, (e as Error).message);
  }
}

function saveAlerts(data: any, at: number) {
  for (const { id, alert: a } of data.entity ?? []) {
    const m = a["transit_realtime.mercury_alert"] ?? {};
    const routes = [...new Set((a.informed_entity ?? []).map((e: any) => e.route_id).filter(Boolean))].join(",");
    const header = a.header_text?.translation?.find((t: any) => t.language === "en")?.text ?? "";
    const periods = a.active_period ?? [];
    upsertAlert.run(id, m.alert_type ?? "", routes, header, m.created_at ?? null,
      periods[0]?.start ?? null, periods.at(-1)?.end ?? null, at, at);
  }
  return data.entity?.length ?? 0;
}

function saveOutages(rows: any[], at: number) {
  const current = rows.filter((o) => o.isupcomingoutage === "N");
  for (const o of current)
    upsertOutage.run(o.equipment, nyTime(o.outagedate), o.station, o.trainno, o.equipmenttype, o.serving,
      o.reason, nyTime(o.estimatedreturntoservice), o.ADA === "Y" ? 1 : 0, at, at);
  return current.length;
}

export function startArchive() {
  const run = () => { poll("alerts", ALERTS, saveAlerts); poll("outages", OUTAGES, saveOutages); };
  run();
  setInterval(run, EVERY_MS);
}

const planned = (type: string) => type.startsWith("Planned");

/** Everything the archive page shows, for the last `days` days. */
export function summary(days = 30) {
  const since = now() - days * 86400;
  const last = (feed: string) => (db.prepare("select max(at) at from polls where feed = ? and ok = 1").get(feed) as any)?.at ?? 0;
  const lastAlerts = last("alerts"), lastOutages = last("outages");
  const coverage = db.prepare("select min(at) first, count(*) polls, sum(ok) ok from polls").get() as any;

  const alerts = db.prepare("select * from alerts where last_seen >= ?").all(since) as any[];
  const byRoute: Record<string, { planned: number; unplanned: number }> = {};
  const byDay: Record<string, { planned: number; unplanned: number }> = {};
  for (const a of alerts) {
    const k = planned(a.type) ? "planned" : "unplanned";
    for (const r of a.routes ? a.routes.split(",") : []) (byRoute[r] ??= { planned: 0, unplanned: 0 })[k]++;
    const day = new Date(a.first_seen * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    (byDay[day] ??= { planned: 0, unplanned: 0 })[k]++;
  }
  const types: Record<string, number> = {};
  for (const a of alerts) if (a.last_seen === lastAlerts) types[a.type] = (types[a.type] ?? 0) + 1;

  const recent = alerts.filter((a) => !planned(a.type)).sort((a, b) => b.first_seen - a.first_seen).slice(0, 25)
    .map((a) => ({ type: a.type, routes: a.routes, header: a.header, first_seen: a.first_seen, last_seen: a.last_seen, active: a.last_seen === lastAlerts }));

  const outagesNow = db.prepare("select * from outages where last_seen = ? order by start").all(lastOutages);
  // Equipment that broke most often: count outages and total observed downtime in the window.
  const worst = db.prepare(`select equipment, station, trains, kind, serving, count(*) outages,
      sum(min(last_seen, ?) - max(start, ?)) down_s from outages where last_seen >= ? and reason != 'Planned Work'
      group by equipment order by down_s desc limit 12`).all(lastOutages, since, since);

  return {
    days, now: now(), lastAlerts, lastOutages, coverage,
    counts: { alertsNow: Object.values(types).reduce((s, n) => s + n, 0), outagesNow: outagesNow.length, alertsSeen: alerts.length },
    types, byRoute, byDay, recent, outagesNow, worst,
  };
}
