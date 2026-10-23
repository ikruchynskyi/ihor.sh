// The city's live picture, for the NYC command post. Pollers write every live feed into one SQLite store
// (data/city.db: like archive.ts, nobody keeps this history for us, so it starts now) and everything else reads it:
// the map's layers, "what's happening here", the HUD, Blip. Code does the analysis (incidents, corroboration,
// baselines); the local Qwen only words the briefs, and a bullet that cites no fact, or a number its facts don't
// have, is dropped. Feeds, all keyless (checked 2026-10-23): 511NY events (incidents, closures, construction, Waze
// reports, special events), Notify NYC (Everbridge CAP RSS), NWS alerts, NOAA's Battery tide gauge, Con Ed outages,
// Open-Meteo air quality and rain, FloodNet sensors, NYC Open Data (permitted street events, film permits, 311),
// and helicopters circling (adsb.lol). Plan and measurements: IDEAS.md, "NYC command post".
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { geocode, inNyc, trafficCameras, inspectCamera } from "./nycapi.ts";
import { aircraft, km } from "./sky.ts";
import { OLLAMA, LOCAL_MODEL, whenIdle } from "./llm.ts";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.CITY_DB ?? path.join(dir, "city.db"));
db.exec(`
  create table if not exists events (id text primary key, source text, kind text, sev int, lat real, lon real,
    starts int, ends int, first_seen int, last_seen int, title text, detail text, url text);
  create index if not exists events_live on events(source, ends);
  create index if not exists events_starts on events(source, starts);
  create table if not exists metrics (key text, at int, value real, primary key (key, at));
  create table if not exists places (text text primary key, lat real, lon real);
  create table if not exists briefs (scope text, at int, body text, facts text, primary key (scope, at));
  create table if not exists polls (source text, at int, ok int, count int, error text);
`);

const now = () => Math.floor(Date.now() / 1000);
// Socrata's timestamps are New York local time without a zone; the server runs in New York (TZ in compose.yaml).
const local = (s?: string) => (s ? Math.floor(new Date(s).getTime() / 1000) || null : null);
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
const UA = { "user-agent": "ihor.sh NYC map (+https://ihor.sh/nyc/)" };
const get = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r;
};
const json = async (url: string, headers: Record<string, string> = {}) => (await get(url, headers)).json() as Promise<any>;
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const strip = (h = "") => h.replace(/<[^>]+>/g, " ").replace(/&(\w+|#\d+);/g, (m, e) => entities[e] ?? m).replace(/\s+/g, " ").trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tx = <T>(f: () => T) => { db.exec("begin"); try { const r = f(); db.exec("commit"); return r; } catch (e) { db.exec("rollback"); throw e; } };

// ---------- the store ----------
export type Ev = { id: string; source: string; kind: string; sev: number; lat: number | null; lon: number | null; starts: number; ends: number | null;
  first_seen: number; last_seen: number; title: string; detail: string; url: string | null };
type New = { id: string; kind: string; sev: number; lat?: number | null; lon?: number | null; starts?: number | null; ends?: number | null; title: string; detail?: unknown; url?: string };
const upsert = db.prepare(`insert into events values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  on conflict(id) do update set kind = excluded.kind, sev = excluded.sev, lat = excluded.lat, lon = excluded.lon, starts = excluded.starts,
  ends = excluded.ends, last_seen = excluded.last_seen, title = excluded.title, detail = excluded.detail, url = excluded.url`);
export function save(source: string, list: New[], at = now()) {
  for (const e of list) upsert.run(`${source}:${e.id}`, source, e.kind, e.sev, e.lat ?? null, e.lon ?? null, e.starts ?? at, e.ends ?? null, at, at, e.title, JSON.stringify(e.detail ?? {}), e.url ?? null);
  return list.length;
}
/** A feed that lists everything happening now: whatever it no longer lists has ended. */
export function snapshot(source: string, list: New[], at = now()) {
  save(source, list, at);
  db.prepare("update events set ends = ? where source = ? and last_seen < ? and (ends is null or ends > ?)").run(at, source, at, at);
  return list.length;
}
const endOne = db.prepare("update events set ends = ? where id = ? and ends is null");
const known = db.prepare("select lat from events where id = ?");
const putMetric = db.prepare("insert or replace into metrics values (?, ?, ?)");
const metric = (key: string, value: unknown) => { if (value != null && Number.isFinite(Number(value))) putMetric.run(key, now(), Number(value)); };
const getMetric = db.prepare("select at, value from metrics where key = ? order by at desc limit 1");
export const latest = (key: string) => getMetric.get(key) as { at: number; value: number } | undefined;
/** Everything happening now (311 reports aren't "happening": they're the record), newest first. */
const activeQ = db.prepare("select * from events where source != '311' and starts <= ? and (ends is null or ends > ?) order by starts desc");
export const active = (at = now()) => activeQ.all(at, at) as Ev[];

// Places named in the feeds, geocoded once (NYC Geoclient for cross streets, see nycapi.geocode); misses are kept too.
const placeGet = db.prepare("select lat, lon from places where text = ?"), placePut = db.prepare("insert or replace into places values (?, ?, ?)");
async function place(q: string) {
  const hit = placeGet.get(q) as { lat: number | null; lon: number | null } | undefined;
  if (hit) return hit.lat == null ? null : { lat: hit.lat, lon: hit.lon! };
  const g = await geocode(q).catch(() => undefined);
  if (g === undefined) return null; // the geocoder is down: ask again next time
  const ok = g && inNyc(g.lat, g.lon) ? g : null;
  placePut.run(q, ok?.lat ?? null, ok?.lon ?? null);
  return ok && { lat: ok.lat, lon: ok.lon };
}
/** "EAST 18 STREET between 5 AVENUE and BROADWAY" → "EAST 18 STREET & 5 AVENUE, Manhattan" (a corner the geocoder knows). */
export const corner = (s: string, boro: string) => {
  const m = s.replace(/\s+/g, " ").trim().match(/^(.+?) between (.+?) and (.+)$/i);
  return `${m ? `${m[1]} & ${m[2]}` : s.replace(/\s+/g, " ").trim()}, ${boro}`;
};

// ---------- the feeds ----------
const CARS = "https://api-511x-nysdot.carsprogram.org/events/map-features?eventClassifications=";
// 511NY's own queries: closures and construction that are on now, special events for the next two weeks
const ROADS: [string, string][] = [["incidents", "incident"], ["closures&maxBeginDateOffset=300000", "closure"], ["construction&maxBeginDateOffset=300000", "construction"],
  ["wazeReports", "waze"], ["specialEvents&maxBeginDateOffset=1210000000", "event"]];
const firstPoint = (g: any): number[] | null => { let c = g?.coordinates; while (Array.isArray(c?.[0])) c = c[0]; return typeof c?.[0] === "number" ? c : null; };
/** 511NY (NYSDOT's CARS feed, the one behind our NYSDOT cameras): incidents, closures, construction, Waze reports, special events. */
async function roads() {
  const lists = await Promise.all(ROADS.map(async ([q, cls]) => ((await json(CARS + q)).features as any[]).flatMap((f): New[] => {
    const p = f.properties, pt = firstPoint(f.geometry);
    if (!pt || !inCity(pt[1], pt[0]) || (["incident", "closure", "construction"].includes(cls) && p.active === false)) return [];
    const what = String(p.title ?? "").split(": ").pop()!.replace(/\.$/, "");
    const sev = cls === "waze" ? (/major accident/i.test(what) ? 2 : /accident/i.test(what) ? 1 : 0) : cls === "incident" ? (p.priority <= 3 ? 2 : 1) : cls === "closure" ? 1 : 0;
    return [{ id: String(p.id), kind: cls === "waze" ? `road:waze-${slug(what)}` : `road:${cls}`, sev, lat: pt[1], lon: pt[0], starts: p.startTime?.time ? Math.floor(p.startTime.time / 1000) : null,
      title: p.title ?? what, detail: { route: p.route, by: p.agency, text: strip(p.description).replace(/ Comment: This report was generated in 511NY.*$/, "").slice(0, 500) }, url: "https://511ny.org/" }];
  })));
  return tx(() => snapshot("511ny", lists.flat()));
}

const NOTIFY = "https://feeds.everbridge.net/feeds/453003085617722/rss/rss.xml";
const CAP_SEV: Record<string, number> = { Extreme: 3, Severe: 2, Moderate: 1, Minor: 0 };
const tag = (s: string, t: string) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
const BORO_CODES: Record<string, string> = { MN: "Manhattan", BK: "Brooklyn", QN: "Queens", BX: "Bronx", SI: "Staten Island" };
/** Notify NYC's English items: each alert is sent in ~13 languages; the English one carries "<type> - <where>" in its
 *  title, or "<type> -10/24- <where> (QN)" for planned work on a day. A lone street gets its first cross street from
 *  "…between X and Y…" in the text, so it can be placed. */
export function notifyItems(rss: string) {
  return [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]).filter((it) => /\[English\]/.test(tag(it, "author"))).map((it) => {
    const title = strip(tag(it, "title")).replace(/^Notify NYC\s*-\s*/i, ""), day = title.match(/\s-(\d{1,2})\/(\d{1,2})-\s/);
    const [type, ...rest] = title.split(/\s+-\s+|\s+-\d{1,2}\/\d{1,2}-\s+/);
    const body = strip(tag(it, "description")).replace(/\s*To view this message in .*$/i, "").replace(/^Notification issued .*?(AM|PM)\.\s*/i, "");
    let where = rest.join(" - ").trim();
    const code = where.match(/\s*\((MN|BK|QN|BX|SI)\)$/);
    if (code) where = where.slice(0, code.index).trim();
    const cross = [...body.matchAll(/\bbetween ([^,.]+?) and ([^,.]+?)(?= in |,|\.)/g)].find((m) => !/\d:\d/.test(m[0]));
    if (where && !/ (&|and|at) /i.test(where) && cross) where = `${where} & ${cross[1].trim()}`;
    return { id: tag(it, "guid"), type: type.trim(), where, body, cap: tag(it, "link").trim(), sent: Math.floor(Date.parse(tag(it, "pubDate")) / 1000), day: day ? { month: +day[1], date: +day[2] } : null,
      borough: (code && BORO_CODES[code[1]]) ?? body.match(/\bin (?:the )?(Bronx|Brooklyn|Manhattan|Queens|Staten Island)\b/i)?.[1] ?? null };
  });
}
/** Notify NYC, NYC Emergency Management's public alerts: fires, gas leaks, police activity, outages, weather… */
async function notify() {
  const fresh: New[] = [];
  for (const n of notifyItems(await (await get(NOTIFY)).text())) {
    const had = known.get(`notify:${n.id}`) as { lat: number | null } | undefined;
    if (!n.id || (had && (had.lat != null || !n.where))) continue; // stored, and placed or not placeable: done
    if (/missing/i.test(n.type)) continue; // people, not places: they stay on Notify NYC, out of our store
    const cap = n.cap ? await get(n.cap).then((r) => r.text()).catch(() => "") : "";
    const boro = n.borough, where = n.where && !/^(citywide|manhattan|brooklyn|queens|bronx|the bronx|staten island)$/i.test(n.where) ? n.where : "";
    const pt = where ? await place(boro ? `${where}, ${boro}` : where) : null, expires = Date.parse(tag(cap, "expires"));
    // planned work on a later day ("-10/24-") starts that day, not now
    const on = n.day && new Date(new Date().getFullYear(), n.day.month - 1, n.day.date).getTime() / 1000, planned = on && on > n.sent ? on : null;
    fresh.push({ id: n.id, kind: `alert:${slug(n.type)}`, sev: CAP_SEV[tag(cap, "severity")] ?? 1, lat: pt?.lat, lon: pt?.lon, starts: planned ?? n.sent,
      ends: planned ? planned + 86400 : expires ? Math.floor(expires / 1000) : n.sent + 3 * 3600, title: `${n.type}${n.where ? ` - ${n.where}` : ""}`,
      detail: { type: n.type, where: n.where, borough: boro, text: n.body.slice(0, 900), severity: tag(cap, "severity") || null, urgency: tag(cap, "urgency") || null }, url: n.cap || undefined });
  }
  return tx(() => save("notify", fresh));
}

const BORO_POINTS = [[40.7831, -73.9712], [40.6782, -73.9442], [40.7282, -73.7949], [40.8448, -73.8648], [40.5795, -74.1502]];
/** National Weather Service alerts covering any borough (warnings, watches, advisories). They cover areas, so no pin. */
async function nws() {
  const all = new Map<string, any>();
  for (const [la, lo] of BORO_POINTS) for (const f of (await json(`https://api.weather.gov/alerts/active?point=${la},${lo}`, { accept: "application/geo+json" })).features) all.set(f.properties.id, f.properties);
  return tx(() => snapshot("nws", [...all.values()].map((p) => ({ id: p.id, kind: `weather:${slug(p.event)}`, sev: CAP_SEV[p.severity] ?? 1, starts: Math.floor(Date.parse(p.onset ?? p.effective) / 1000),
    ends: Math.floor(Date.parse(p.ends ?? p.expires) / 1000) || null, title: p.headline ?? p.event, detail: { event: p.event, area: p.areaDesc, text: String(p.description ?? "").slice(0, 900), instruction: String(p.instruction ?? "").slice(0, 400) },
    url: "https://forecast.weather.gov/MapClick.php?lat=40.73&lon=-73.95" }))));
}

/** The Battery's tide gauge (NOAA 8518750): water level now against the predicted tide. Surge = the difference. Our
 *  marks: 1 ft and 2 ft of surge (NWS's coastal flood stages are by water level, which depends on the tide too). */
async function tide() {
  const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8518750&datum=MLLW&units=english&time_zone=gmt&format=json";
  const obs = (await json(`${base}&product=water_level&date=latest`)).data?.[0], preds: { t: string; v: string }[] = (await json(`${base}&product=predictions&date=today&interval=6`)).predictions ?? [];
  if (!obs || !preds.length) return 0;
  const t = (s: string) => Date.parse(s.replace(" ", "T") + "Z"), at = t(obs.t), pred = preds.reduce((a, b) => (Math.abs(t(b.t) - at) < Math.abs(t(a.t) - at) ? b : a));
  const level = Number(obs.v), surge = +(level - Number(pred.v)).toFixed(2);
  metric("battery.level", level); metric("battery.surge", surge);
  return tx(() => snapshot("noaa", surge >= 1 ? [{ id: "battery-surge", kind: "water:surge", sev: surge >= 2 ? 2 : 1, lat: 40.7006, lon: -74.0142,
    title: `Harbor water ${surge} ft above the predicted tide at the Battery`, detail: { levelFt: level, predictedFt: Number(pred.v), at: obs.t }, url: "https://tidesandcurrents.noaa.gov/stationhome.html?id=8518750" }] : []));
}

/** Con Ed's outage map summary (updated every 15–30 min): outages and customers out across NYC and Westchester. */
async function coned() {
  const base = "https://outagemap.coned.com/resources/data/external/interval_generation_data/";
  const d = (await json(`${base}${(await json(base + "metadata.json")).directory}/data.json`)).summaryFileData;
  metric("coned.outages", d.total_outages); metric("coned.customers", d.total_cust_a?.val); metric("coned.served", d.total_cust_s);
  return 1;
}

/** Air quality (US AQI, EPA's bands: over 100 is unhealthy for sensitive groups) and the last hour's rain, from Open-Meteo. */
async function air() {
  const a = (await json("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=40.73&longitude=-73.95&current=us_aqi,pm2_5")).current;
  const w = (await json("https://api.open-meteo.com/v1/forecast?latitude=40.73&longitude=-73.95&minutely_15=precipitation&past_minutely_15=4&forecast_minutely_15=1")).minutely_15;
  metric("air.aqi", a.us_aqi); metric("air.pm25", a.pm2_5); metric("rain.mm", Math.max(0, ...w.precipitation.map(Number)));
  const sev = a.us_aqi > 200 ? 3 : a.us_aqi > 150 ? 2 : a.us_aqi > 100 ? 1 : -1;
  return tx(() => snapshot("air", sev < 0 ? [] : [{ id: "aqi", kind: "air:aqi", sev, title: `Air quality index ${a.us_aqi} (unhealthy${sev === 1 ? " for sensitive groups" : ""})`,
    detail: { pm25: a.pm2_5 }, url: "https://www.airnow.gov/?city=New%20York&state=NY&country=USA" }]));
}

const FLOODNET = "https://api.floodnet.nyc/api/rest/deployments/flood";
let sensors = { at: 0, list: [] as { id: string; name: string; type: string; status: string; lat: number; lon: number }[] };
/** FloodNet's street flood sensors (NYU, CUNY and the city): where they are and how they are. */
export async function floodnetSensors() {
  if (sensors.at < Date.now() - 6 * 3600_000) sensors = { at: Date.now(), list: ((await json(FLOODNET)).deployments as any[]).filter((d) => !d.date_down && d.location?.coordinates)
    .map((d) => ({ id: d.deployment_id, name: d.name, type: d.deploy_type, status: d.sensor_status, lon: d.location.coordinates[0], lat: d.location.coordinates[1] })) };
  return sensors.list;
}
/** Water on the street now, from each sensor's last 15 minutes. Gently, it's a research API: all working sensors while
 *  it's raining, otherwise only the coastal ones (high tides flood those on dry days). FloodNet marks 4 and 12 inches. */
async function floods() {
  const rain = latest("rain.mm"), wet = !!rain && rain.value > 0 && rain.at > now() - 1800;
  const list = (await floodnetSensors()).filter((s) => /^(good|low_charge|signal|noisy)/.test(s.status) && (wet || s.type === "coastal"));
  const q = `start_time=${new Date(Date.now() - 15 * 60_000).toISOString()}&end_time=${new Date().toISOString()}`, depth = new Map<string, number>();
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < list.length) { const s = list[i++]; const d = await json(`${FLOODNET}/${s.id}/depth?${q}`).catch(() => null); if (d) depth.set(s.id, Math.max(0, ...d.depth_data.map((x: any) => Number(x.depth_proc_mm) || 0))); }
  }));
  const at = now(), wetNow = list.filter((s) => (depth.get(s.id) ?? 0) >= 25);
  tx(() => {
    save("floodnet", wetNow.map((s) => { const mm = depth.get(s.id)!; return { id: s.id, kind: "flood:street", sev: mm >= 305 ? 3 : mm >= 102 ? 2 : 1, lat: s.lat, lon: s.lon,
      title: `Street flooding: ${(mm / 25.4).toFixed(1)} in of water at ${s.name}`, detail: { depthMm: mm, sensor: s.id, type: s.type }, url: "https://dataviz.floodnet.nyc/" }; }), at);
    for (const s of list) if (depth.has(s.id) && !wetNow.includes(s)) endOne.run(at, `floodnet:${s.id}`);
  });
  metric("floodnet.flooding", wetNow.length); metric("floodnet.checked", depth.size);
  return depth.size;
}
export const floodDepth = (id: string) => (db.prepare("select detail from events where id = ? and ends is null").get(`floodnet:${id}`) as { detail: string } | undefined);

const SODA = "https://data.cityofnewyork.us/resource/";
const soda = (id: string, q: Record<string, string>) => json(`${SODA}${id}.json?${new URLSearchParams(q)}`,
  process.env.SOCRATA_KEY_ID ? { Authorization: "Basic " + Buffer.from(`${process.env.SOCRATA_KEY_ID}:${process.env.SOCRATA_KEY_SECRET}`).toString("base64") } : {});
/** Permitted street events on now that close streets, curb lanes or sidewalks (CECM's NYC Permitted Event Information). */
async function permits() {
  const t = localNow(), rows: any[] = await soda("tvpp-9vvx", { $where: `start_date_time <= '${t}' AND end_date_time >= '${t}' AND street_closure_type != 'N/A'`, $limit: "2000" });
  const list: New[] = [];
  for (const r of rows) {
    const pt = await place(corner(r.event_location ?? "", r.event_borough ?? ""));
    list.push({ id: `${r.event_id}:${slug(r.event_location ?? "")}`, kind: `permit:${slug(r.event_type ?? "event")}`, sev: /full street/i.test(r.street_closure_type) ? 1 : 0, lat: pt?.lat, lon: pt?.lon,
      starts: local(r.start_date_time), ends: local(r.end_date_time), title: `${r.event_name}: ${r.street_closure_type}`,
      detail: { type: r.event_type, by: r.event_agency, where: r.event_location?.replace(/\s+/g, " "), borough: r.event_borough, side: r.event_street_side }, url: "https://www.nyc.gov/site/cecm/permitting/permitted-event-information.page" });
  }
  return tx(() => snapshot("permits", list));
}
/** Film and TV shoots on now (Mayor's Office of Media and Entertainment). The dataset stopped at July 2026's permits when
 *  checked on 2026-10-23, so its newest start is kept too: the map says so instead of showing an empty layer as "none". */
async function film() {
  const t = localNow(), [{ newest }] = await soda("tg4x-b46p", { $select: "max(startdatetime) as newest" });
  metric("film.newest", local(newest));
  const rows: any[] = await soda("tg4x-b46p", { $where: `startdatetime <= '${t}' AND enddatetime >= '${t}'`, $limit: "1000" }), list: New[] = [];
  for (const r of rows) {
    const first = String(r.parkingheld ?? "").split(",")[0], pt = first ? await place(corner(first, r.borough ?? "")) : null;
    list.push({ id: r.eventid, kind: "film", sev: 0, lat: pt?.lat, lon: pt?.lon, starts: local(r.startdatetime), ends: local(r.enddatetime), title: `${r.category ?? "Shoot"}: ${r.subcategoryname ?? r.eventtype}`,
      detail: { parkingHeld: String(r.parkingheld ?? "").replace(/\s+/g, " ").slice(0, 900), borough: r.borough }, url: "https://www.nyc.gov/site/mome/permits/permits.page" });
  }
  return tx(() => snapshot("film", list));
}
/** 311 service requests (they run ~1.5 days behind): type, time and place only, for "what's reported around here" and the
 *  baselines. The first run backfills 33 days (4 weeks + a day + the lag), so the baseline works from day one. */
async function reports311() {
  const last = (db.prepare("select max(starts) t from events where source = '311'").get() as { t: number | null }).t;
  let from = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000 - (last ? now() - last : 33 * 86400) * 1000).toISOString().slice(0, 19), n = 0;
  for (;;) {
    const rows: any[] = await soda("erm2-nwe9", { $select: "unique_key, created_date, complaint_type, descriptor, agency, latitude, longitude",
      $where: `created_date >= '${from}' AND latitude IS NOT NULL`, $order: "created_date", $limit: "50000" });
    tx(() => save("311", rows.map((r) => { const t = local(r.created_date); return { id: r.unique_key, kind: `311:${r.complaint_type}`, sev: 0, lat: Number(r.latitude), lon: Number(r.longitude),
      starts: t, ends: t, title: `${r.complaint_type}${r.descriptor ? `: ${r.descriptor}` : ""}`, detail: { by: r.agency } }; })));
    n += rows.length;
    if (rows.length < 50000) return n;
    from = rows.at(-1).created_date.slice(0, 19);
  }
}

// Helicopters circling: each one's last 10 minutes of positions (low, inside the city), checked every 30 s.
const tracks = new Map<string, { t: number; lat: number; lon: number; trk: number | null }[]>();
/** A track that turned through a full circle (or more) while staying within 2 km of its middle. */
export function orbit(tr: { lat: number; lon: number; trk: number | null }[]) {
  let turn = 0;
  for (let i = 1; i < tr.length; i++) if (tr[i].trk != null && tr[i - 1].trk != null) turn += Math.abs(((tr[i].trk! - tr[i - 1].trk! + 540) % 360) - 180);
  const mid = { lat: tr.reduce((s, p) => s + p.lat, 0) / tr.length, lon: tr.reduce((s, p) => s + p.lon, 0) / tr.length }, r = Math.max(...tr.map((p) => km(mid, p)));
  return tr.length >= 5 && turn >= 360 && r <= 2 ? { ...mid, turn: Math.round(turn), radiusKm: +r.toFixed(2) } : null;
}
async function helicopters() {
  const t = now(), list = (await aircraft()).filter((a) => a.heli && inNyc(a.lat, a.lon) && (a.altFt ?? 0) < 3000), circling: New[] = [];
  for (const a of list) tracks.set(a.hex, [...(tracks.get(a.hex) ?? []), { t, lat: a.lat, lon: a.lon, trk: a.track }].filter((p) => p.t > t - 600));
  for (const [hex, tr] of tracks) if (tr.at(-1)!.t < t - 600) tracks.delete(hex);
  for (const a of list) {
    const o = orbit(tracks.get(a.hex)!);
    if (o) circling.push({ id: a.hex, kind: "air:helicopter-orbit", sev: 1, lat: o.lat, lon: o.lon, title: `Helicopter ${a.flight || a.reg || a.hex} circling at ${a.altFt ?? "?"} ft`,
      detail: { hex: a.hex, type: a.type, turnDeg: o.turn, radiusKm: o.radiusKm }, url: `/nyc/#aircraft=${a.hex}` });
  }
  return tx(() => snapshot("adsb", circling));
}

// ---------- incidents: reports of one thing, merged, and how many independent sources agree ----------
const PLANNED = /^(road:closure|road:construction|road:event|permit:|film|vision:clear|water:)/; // water: the harbor's surge is a reading, not a spot
const AREA_WIDE = ["notify", "nws", "air"]; // alerts for a whole area; anything else without a place just couldn't be placed
export type Incident = { id: string; title: string; kind: string; sev: number; lat: number; lon: number; starts: number; sources: string[]; confidence: number; events: Ev[] };
const witness = (e: Ev) => (e.kind.startsWith("road:waze") ? "waze" : e.source); // Waze drivers and NYSDOT's operators are different eyes
/** Unplanned things with a place, most severe first, each joined to the first incident within 300 m. */
export function cluster(evs: Ev[]) {
  const out: Incident[] = [];
  for (const e of evs.filter((e) => e.lat != null && !PLANNED.test(e.kind)).sort((a, b) => b.sev - a.sev || a.starts - b.starts)) {
    const c = out.find((c) => km(c, e as { lat: number; lon: number }) <= 0.3);
    if (!c) { out.push({ id: e.id, title: e.title, kind: e.kind, sev: e.sev, lat: e.lat!, lon: e.lon!, starts: e.starts, sources: [witness(e)], confidence: 1, events: [e] }); continue; }
    c.events.push(e); c.starts = Math.min(c.starts, e.starts);
    if (!c.sources.includes(witness(e))) c.sources.push(witness(e));
    c.confidence = c.sources.length;
  }
  return out.sort((a, b) => b.sev - a.sev || b.confidence - a.confidence || b.starts - a.starts);
}
let clustered = { at: 0, list: [] as Incident[] };
export const incidents = () => (clustered.at > Date.now() - 30_000 ? clustered.list : (clustered = { at: Date.now(), list: cluster(active()) }).list);

/** A source's events that started in the last few hours, newest first (ended ones too: "what happened today"). */
export const recent = (source: string, hours = 24) => (db.prepare("select * from events where source = ? and starts > ? order by starts desc limit 200").all(source, now() - hours * 3600) as Ev[]);
/** One event as the page and Blip see it. */
export const view = (e: Ev) => ({ id: e.id, source: e.source, kind: e.kind, sev: e.sev, title: e.title, lat: e.lat, lon: e.lon, starts: e.starts, ends: e.ends, url: e.url, ...JSON.parse(e.detail || "{}") });
export const incidentView = (c: Incident) => ({ id: c.id, title: c.title, kind: c.kind, sev: c.sev, confidence: c.confidence, sources: c.sources, lat: c.lat, lon: c.lon, starts: c.starts,
  borough: borough(c.lat, c.lon), events: c.events.slice(0, 12).map(view), checkedBy: cameraChecks(c.id) });

/** What's going on within r km of a point: incidents, closures and permits, area-wide alerts, the week's 311 reports. */
export function around(lat: number, lon: number, r = 0.4) {
  const at = now(), here = { lat, lon }, near = (e: { lat: number | null; lon: number | null }) => e.lat != null && km(here, e as { lat: number; lon: number }) <= r, all = active(at);
  const dLat = r / 111, dLon = r / (111 * Math.cos((lat * Math.PI) / 180));
  const r311 = db.prepare(`select substr(kind, 5) type, count(*) n from events where source = '311' and starts > ? and lat between ? and ? and lon between ? and ? group by kind order by n desc limit 8`)
    .all(at - 7 * 86400, lat - dLat, lat + dLat, lon - dLon, lon + dLon);
  return { center: here, radiusM: Math.round(r * 1000), incidents: incidents().filter(near).map(incidentView), planned: all.filter((e) => near(e) && PLANNED.test(e.kind) && !e.kind.startsWith("vision")).map(view),
    areaWide: all.filter((e) => e.lat == null && AREA_WIDE.includes(e.source)).map(view), reports311: { days: 7, newest: latest311(), byType: r311 }, unusual: anomalies().filter(near), pulse: pulse() };
}
const latest311 = () => { const t = (db.prepare("select max(starts) t from events where source = '311'").get() as { t: number | null }).t; return t && new Date(t * 1000).toISOString(); };

// ---------- boroughs (NYC Open Data wh2p-dxnf, with their water: bridges and the harbor count; fetched once into data/) ----------
let boros: { name: string; rings: number[][][] }[] = [];
async function loadBoroughs() {
  const f = path.join(dir, "boroughs.geojson");
  if (!existsSync(f)) writeFileSync(f, await (await get(`${SODA}wh2p-dxnf.geojson`)).text());
  boros = JSON.parse(readFileSync(f, "utf8")).features.map((x: any) => ({ name: x.properties.boroname, rings: x.geometry.coordinates.map((p: number[][][]) => p[0]) }));
}
export const inRing = (ring: number[][], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};
export const borough = (lat: number, lon: number) => boros.find((b) => b.rings.some((r) => inRing(r, lon, lat)))?.name ?? null;
/** In the five boroughs (511NY's feed covers the whole state and New Jersey's roads around the city). */
const inCity = (lat: number, lon: number) => inNyc(lat, lon) && (!boros.length || !!borough(lat, lon));
export const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// ---------- unusual: counts now against the same hours of the same weekday in the four weeks before ----------
const CELL = 0.02; // ~2 km squares
let unusual = { at: 0, list: [] as { kind: string; n: number; usual: number; lat: number; lon: number; place: string; text: string }[], note: "" };
const labels = new Map<string, string>();
/** Squares where a kind of report is at least 3× its usual count (and at least 5). 311 compares its newest published day;
 *  the live feeds their last 3 hours, once they have 4 weeks of history. */
async function refreshUnusual() {
  const out: typeof unusual.list = [], notes: string[] = [];
  const count = (source: string, from: number, to: number) => db.prepare(`select kind, cast(round(lat / ${CELL}) as int) y, cast(round(lon / ${CELL}) as int) x, count(*) n, avg(lat) lat, avg(lon) lon
    from events where source = ? and starts > ? and starts <= ? and lat is not null group by kind, y, x`).all(source, from, to) as { kind: string; y: number; x: number; n: number; lat: number; lon: number }[];
  for (const [source, span] of [["311", 86400], ["511ny", 3 * 3600], ["notify", 3 * 3600]] as const) {
    // since when we have it: 311 is backfilled; the live feeds only since we started listening (their own start times can be weeks old)
    const first = (db.prepare(`select min(${source === "311" ? "starts" : "first_seen"}) t from events where source = ?`).get(source) as { t: number | null }).t, end = source === "311" ? Date.parse(latest311() ?? "") / 1000 : now();
    if (!first || !end || first > end - 28 * 86400 - span) { notes.push(`${source}: needs 4 weeks of history, from ${first ? new Date((first + 28 * 86400 + span) * 1000).toISOString().slice(0, 10) : "when its data arrives"}`); continue; }
    const before = new Map<string, number>();
    for (let w = 1; w <= 4; w++) for (const r of count(source, end - span - w * 7 * 86400, end - w * 7 * 86400)) before.set(`${r.kind}|${r.y}|${r.x}`, (before.get(`${r.kind}|${r.y}|${r.x}`) ?? 0) + r.n / 4);
    for (const r of count(source, end - span, end)) {
      const usual = before.get(`${r.kind}|${r.y}|${r.x}`) ?? 0;
      if (r.n < 5 || r.n < 3 * Math.max(usual, 1)) continue;
      const key = `${r.y},${r.x}`;
      if (!labels.has(key)) labels.set(key, (await geocode(`${r.lat.toFixed(5)},${r.lon.toFixed(5)}`).catch(() => null))?.label.split(",").slice(0, 2).join(",") ?? `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}`);
      const what = r.kind.replace(/^311:/, "").replace(/^road:waze-/, "Waze: ").replace(/^road:/, "").replace(/^alert:/, "Notify NYC: ").replace(/-/g, " ");
      out.push({ kind: r.kind, n: r.n, usual: +usual.toFixed(1), lat: r.lat, lon: r.lon, place: labels.get(key)!,
        text: `${r.n} ${source === "311" ? "311 reports" : "reports"} of "${what}" in ${source === "311" ? "the newest published day" : "the last 3 hours"} within ~1 km of ${labels.get(key)}, against ${usual.toFixed(1)} usually (same hours, same weekday, past 4 weeks)` });
    }
  }
  unusual = { at: Date.now(), list: out.sort((a, b) => b.n / Math.max(b.usual, 1) - a.n / Math.max(a.usual, 1)).slice(0, 30), note: notes.join("; ") };
}
export const anomalies = () => unusual.list;
export const anomaliesNote = () => unusual.note;

// ---------- the HUD's numbers ----------
export function pulse() {
  const at = now(), all = active(at), inc = incidents(), m = (k: string) => latest(k)?.value ?? null;
  return { at, alerts: all.filter((e) => e.source === "notify").length, weather: all.filter((e) => e.source === "nws").map((e) => e.title), incidents: inc.length,
    severe: inc.filter((c) => c.sev >= 2).length, corroborated: inc.filter((c) => c.confidence >= 2).length,
    closures: all.filter((e) => /^road:(closure|construction)$/.test(e.kind) || e.source === "permits").length, flooding: all.filter((e) => e.source === "floodnet").length,
    helicopters: all.filter((e) => e.source === "adsb").length, surgeFt: m("battery.surge"), aqi: m("air.aqi"), outages: m("coned.outages"), customersOut: m("coned.customers"),
    unusual: unusual.list.length, filmNewest: m("film.newest") };
}

// ---------- briefs: facts by code, words by the local Qwen, every bullet checked against its facts ----------
const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const SOURCE_NAMES: Record<string, string> = { notify: "Notify NYC", "511ny": "511NY", waze: "Waze drivers", adsb: "aircraft tracking", floodnet: "FloodNet", noaa: "NOAA", nws: "NWS", vision: "a camera check", air: "air sensors" };
export function facts(scope = "city") {
  const inScope = (x: { lat: number | null; lon: number | null }) => scope === "city" || (x.lat != null && borough(x.lat, x.lon!) === scope);
  const F: { id: string; text: string }[] = [], add = (text: string) => F.push({ id: `F${F.length + 1}`, text });
  const inc = incidents().filter(inScope), p = pulse();
  for (const c of inc.slice(0, 10)) add(`${c.title}${scope === "city" && borough(c.lat, c.lon) ? ` (${borough(c.lat, c.lon)})` : ""}: ${c.events.length} report${c.events.length > 1 ? "s" : ""} from ${c.sources.map((s) => SOURCE_NAMES[s] ?? s).join(" and ")}, severity ${c.sev} of 3, since ${hhmm(c.starts)}`);
  for (const e of active().filter((e) => e.lat == null && e.source !== "air" && AREA_WIDE.includes(e.source))) add(`${e.title} (${SOURCE_NAMES[e.source] ?? e.source}, citywide)`);
  for (const a of anomalies().filter(inScope).slice(0, 5)) add(`Unusual: ${a.text}`);
  if (scope === "city") {
    if (p.surgeFt != null) add(`Harbor water at the Battery is ${p.surgeFt} ft ${p.surgeFt >= 0 ? "above" : "below"} the predicted tide`);
    if (p.aqi != null) add(`Air quality index ${p.aqi} (${p.aqi > 100 ? "unhealthy for sensitive groups or worse" : "good or moderate"})`);
    if (p.outages != null) add(`Con Ed reports ${p.outages} power outages with ${p.customersOut ?? 0} customers out`);
  }
  const closures = active().filter((e) => inScope(e) && (/^road:(closure|construction)$/.test(e.kind) || e.source === "permits")).length;
  add(`In total: ${inc.length} incidents now (${inc.filter((c) => c.sev >= 2).length} of severity 2 or more), ${closures} road or street closures`);
  return F;
}
const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** A bullet stays only if it cites facts that exist and every number in it appears in those facts. */
export const faithful = (b: { text: string; facts: string[] }, F: Map<string, string>) =>
  !!b.facts?.length && b.facts.every((id) => F.has(id)) && nums(b.text).every((n) => b.facts.some((id) => nums(F.get(id)!).includes(n)));
const BRIEF = { type: "object", required: ["bullets"], properties: { bullets: { type: "array", items: { type: "object", required: ["text", "facts"],
  properties: { text: { type: "string" }, facts: { type: "array", items: { type: "string" } } } } } } };
export async function makeBrief(scope = "city") {
  const F = facts(scope), byId = new Map(F.map((f) => [f.id, f.text]));
  let bullets: { text: string; facts: string[] }[] = [], by = LOCAL_MODEL;
  try {
    const r = await whenIdle(() => fetch(`${OLLAMA}/api/chat`, { method: "POST", signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: false, format: BRIEF,
      options: { num_predict: 500, temperature: 0.2 }, messages: [
        { role: "system", content: "You write the situation brief for a New York City command post, for people who live and travel here. Use only the numbered facts. Write 3 to 6 bullets, most urgent first, each one short plain sentence, and list the ids of the facts each bullet uses. Never add a number, place, cause or prediction that isn't in its facts. Don't repeat the same fact twice." },
        { role: "user", content: `Scope: ${scope === "city" ? "all of New York City" : scope}. Facts:\n${F.map((f) => `${f.id}: ${f.text}`).join("\n")}` }] }) }).then((r) => r.json()));
    bullets = JSON.parse(r.message?.content ?? "{}").bullets ?? [];
  } catch (e) { console.warn(`city brief ${scope}:`, (e as Error).message); }
  const kept = bullets.filter((b) => faithful(b, byId)).slice(0, 6), dropped = bullets.length - kept.length;
  if (!kept.length) { by = "code (the model's answer was missing or didn't check out)"; kept.push(...F.slice(0, 5).map((f) => ({ text: f.text, facts: [f.id] }))); }
  db.prepare("insert or replace into briefs values (?, ?, ?, ?)").run(scope, now(), JSON.stringify({ bullets: kept, by, dropped }), JSON.stringify(F));
  return latestBrief(scope);
}
export function latestBrief(scope = "city") {
  const r = db.prepare("select * from briefs where scope = ? order by at desc limit 1").get(scope) as { at: number; body: string; facts: string } | undefined;
  return r ? { scope, at: r.at, ...JSON.parse(r.body), facts: JSON.parse(r.facts) as { id: string; text: string }[] } : null;
}

// ---------- camera checks: a new serious or corroborated incident → its nearest cameras, read by the local Qwen ----------
const checked = new Set<string>();
let spent: { t: number; s: number }[] = []; // model seconds spent on camera checks in the last hour
const cameraChecks = (incident: string) => (db.prepare("select * from events where source = 'vision' and detail like ? order by last_seen desc limit 3").all(`%"incident":"${incident.replace(/["%]/g, "")}"%`) as Ev[]).map(view);
async function triage() {
  const cams = await trafficCameras().catch(() => [] as any[]);
  for (const c of incidents()) {
    if (checked.has(c.id) || (c.sev < 2 && c.confidence < 2) || c.kind.startsWith("vision:")) continue;
    checked.add(c.id);
    const near = cams.filter((k) => !k.youtube && km(c, k) <= 0.4).sort((a, b) => (b.h ?? 0) - (a.h ?? 0) || km(c, a) - km(c, b)).slice(0, 3);
    for (const cam of near) {
      spent = spent.filter((x) => x.t > Date.now() - 3600_000);
      if (spent.reduce((a, x) => a + x.s, 0) >= 720) return; // at most 12 min of model time an hour (a frame took 19–22 s with the full description, measured)
      const v = await whenIdle(async () => { const t1 = Date.now(); try { return await inspectCamera(cam.id); } finally { spent.push({ t: Date.now(), s: (Date.now() - t1) / 1000 }); } }).catch(() => null), s = v?.seen;
      if (!s) continue;
      const what = [s.smoke_or_fire && "smoke or fire", s.emergency_vehicles && "emergency vehicles", s.road === "flooded" && "a flooded road", ["heavy", "gridlock", "stopped"].includes(s.traffic) && `${s.traffic} traffic`].filter(Boolean) as string[];
      tx(() => save("vision", [{ id: cam.id, kind: what.length ? `vision:${slug(what[0])}` : "vision:clear", sev: what.length ? 1 : 0, lat: cam.lat, lon: cam.lon, ends: now() + 1800,
        title: `Camera ${cam.name}: ${what.length ? what.join(", ") : "nothing unusual"}`, detail: { camera: cam.id, seen: s, incident: c.id, model: v!.model }, url: `/nyc/#cam=${cam.id}` }]));
      clustered.at = 0;
    }
  }
}

// ---------- the clock ----------
const logPoll = db.prepare("insert into polls values (?, ?, ?, ?, ?)");
function every(source: string, minutes: number, f: () => Promise<unknown>) {
  const run = async () => {
    const at = now();
    try { const n = await f(); logPoll.run(source, at, 1, typeof n === "number" ? n : 0, null); }
    catch (e) { logPoll.run(source, at, 0, 0, String((e as Error).message).slice(0, 200)); console.warn(`city ${source}:`, (e as Error).message); }
  };
  setTimeout(run, Math.random() * 30_000); // staggered, so a restart doesn't hit every feed at once
  setInterval(run, minutes * 60_000);
}
export async function startCity() {
  await loadBoroughs().catch((e) => console.warn("city boroughs:", e.message));
  every("511ny", 2, roads); every("notify", 2, notify); every("nws", 5, nws); every("noaa", 6, tide); every("coned", 15, coned);
  every("air", 10, air); every("floodnet", 10, floods); every("permits", 60, permits); every("film", 60, film); every("311", 60, reports311);
  every("adsb", 0.5, helicopters); every("unusual", 15, refreshUnusual); every("vision", 2, triage);
  every("brief", 15, async () => { // the city's every 15 minutes, a borough's when it has something going on
    await makeBrief("city");
    for (const b of BOROUGHS) if (incidents().some((c) => borough(c.lat, c.lon) === b)) await makeBrief(b);
  });
  every("prune", 24 * 60, async () => {
    const at = now();
    db.prepare("delete from events where source = '311' and starts < ?").run(at - 90 * 86400);
    db.prepare("delete from polls where at < ?").run(at - 30 * 86400);
    db.prepare("delete from briefs where at < ?").run(at - 30 * 86400);
  });
}
