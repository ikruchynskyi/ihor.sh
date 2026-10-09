// Free NYC events: every hour, read the public events calendar of NYC for FREE (nycforfree.co, the
// site behind @nyc_forfree; robots.txt allows it) and keep each event in SQLite with when we first and
// last saw it. Free NYC (/nyc/free.html) shows the current ones next to its museum rules, via /api/nyc/events.
// We show the title, time, place and a short teaser, and always link back to their page for the details.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SOURCE = "https://www.nycforfree.co";
const EVERY_MS = 60 * 60_000;

const dir = path.join(import.meta.dirname, "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "events.db"));
db.exec(`
  create table if not exists fetches (at int, ok int, count int);
  create table if not exists events (slug text primary key, title text, category text, borough text, address text,
    lat real, lon real, start_date text, end_date text, start_time text, end_time text, frequency text,
    recurring_days text, teaser text, first_seen int, last_seen int);
`);
try { db.exec("alter table events add column occurrences text"); } catch {} // added after the first release

const now = () => Math.floor(Date.now() / 1000);
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** "October 17, 2026" → "2026-10-17" (no time zone involved). */
export function isoDate(s: string) {
  const m = s.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (!m) return null;
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(m[1]) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** "1:00 PM" → "13:00". */
export function hhmm(s: string) {
  const m = s.match(/^(\d{1,2}):(\d{2}) ?([AP]M)$/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** At most ~180 characters, cut at a word. */
const teaser = (s: string) => {
  s = s.replace(/…$/, "").trim();
  return s.length <= 180 ? s : s.slice(0, 180).replace(/\s+\S*$/, "") + "…";
};

/** Each event on the listing page is a Webflow list item whose attributes carry all its fields. */
export function parseEvents(html: string) {
  const out = [];
  const items = [...html.matchAll(/<div ([^>]*class="w-dyn-item"[^>]*)>/g)];
  for (const [i, { 1: attrs, index }] of items.entries()) {
    // "Multiple dates" events list each date inside the item: "2026-09-10|06:00|08:00,2026-09-24|…".
    const body = html.slice(index, items[i + 1]?.index);
    const occurrences = body.match(/event-data="occurrences"[^>]*>([^<]*)</)?.[1].trim() ?? "";
    const a = Object.fromEntries([...attrs.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, k, v]) => [k, unescape(v)]));
    const start = a["start-date"] && isoDate(a["start-date"]);
    if (!a.slug || !a.title || !start) continue;
    out.push({
      slug: a.slug, title: a.title, category: a.category ?? "", borough: a.borough ?? "", address: a.address ?? "",
      lat: Number(a.lat) || null, lon: Number(a.long) || null,
      start_date: start, end_date: (a["end-date"] && isoDate(a["end-date"])) || start,
      start_time: a["start-time"] ? hhmm(a["start-time"]) : null, end_time: a["end-time"] ? hhmm(a["end-time"]) : null,
      frequency: a.frequency ?? "", recurring_days: a["recurring-days"] ?? "",
      teaser: teaser(a.description ?? ""), occurrences,
    });
  }
  return out;
}

const upsert = db.prepare(`insert into events values (:slug, :title, :category, :borough, :address, :lat, :lon,
    :start_date, :end_date, :start_time, :end_time, :frequency, :recurring_days, :teaser, :at, :at, :occurrences)
  on conflict(slug) do update set title = excluded.title, category = excluded.category, borough = excluded.borough,
    address = excluded.address, lat = excluded.lat, lon = excluded.lon, start_date = excluded.start_date,
    end_date = excluded.end_date, start_time = excluded.start_time, end_time = excluded.end_time,
    frequency = excluded.frequency, recurring_days = excluded.recurring_days, teaser = excluded.teaser, occurrences = excluded.occurrences, last_seen = excluded.last_seen`);

async function refresh() {
  const at = now();
  try {
    const r = await fetch(`${SOURCE}/events`, { headers: { "user-agent": "ihor.sh Free NYC (+https://ihor.sh/nyc/free.html)" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const events = parseEvents(await r.text());
    if (!events.length) throw new Error("no events parsed (did the page layout change?)");
    db.exec("begin");
    for (const e of events) upsert.run({ ...e, at });
    db.exec("commit");
    db.prepare("insert into fetches values (?, 1, ?)").run(at, events.length);
  } catch (e) {
    if (db.isTransaction) db.exec("rollback");
    db.prepare("insert into fetches values (?, 0, 0)").run(at);
    console.error("events:", (e as Error).message);
  }
}

export function startEvents() {
  refresh();
  setInterval(refresh, EVERY_MS);
}

/** Events still listed at the last good fetch that haven't ended yet. */
export function currentEvents() {
  const last = (db.prepare("select max(at) at from fetches where ok = 1").get() as any)?.at ?? 0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const events = db.prepare("select * from events where last_seen = ? and end_date >= ? order by start_date, start_time").all(last, today)
    .map((e: any) => ({ ...e, url: `${SOURCE}/events/${e.slug}` }));
  return { updated: last, source: SOURCE, events };
}
