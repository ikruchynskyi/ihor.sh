import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { alertsNow, outagesNow } from "./archive.ts";

// Subway arrivals: the MTA's GTFS-realtime feeds (protobuf, no key) → next trains per station and direction.
// A tiny protobuf reader covers the few fields we need; feeds are fetched on demand and cached 30 s.

const FEEDS = ["gtfs", "gtfs-ace", "gtfs-bdfm", "gtfs-g", "gtfs-jz", "gtfs-nqrw", "gtfs-l", "gtfs-si"]
  .map((f) => `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F${f}`);
const STATIONS = "https://data.ny.gov/resource/39hk-dx4f.json?$limit=2000";

// ---------- protobuf: varints and length-delimited fields only (all GTFS-rt needs here) ----------
type Field = [field: number, value: number | Uint8Array];
export function fields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let i = 0;
  const varint = () => { let v = 0, mul = 1, b; do { b = buf[i++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80); return v; };
  while (i < buf.length) {
    const key = varint(), field = Math.floor(key / 8), wire = key & 7;
    if (wire === 0) out.push([field, varint()]);
    else if (wire === 2) { const len = varint(); out.push([field, buf.subarray(i, i + len)]); i += len; }
    else if (wire === 1) { out.push([field, new DataView(buf.buffer, buf.byteOffset + i, 8).getFloat64(0, true)]); i += 8; }
    else if (wire === 5) { out.push([field, new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true)]); i += 4; } // floats: vehicle GPS
    else throw new Error(`protobuf wire type ${wire}`);
  }
  return out;
}
const sub = (f: Field[], n: number) => f.filter(([k, v]) => k === n && v instanceof Uint8Array).map(([, v]) => v as Uint8Array);
const num = (f: Field[], n: number) => f.find(([k, v]) => k === n && typeof v === "number")?.[1] as number | undefined;
const text = (f: Field[], n: number) => { const b = sub(f, n)[0]; return b ? new TextDecoder().decode(b) : ""; };

export interface Arrival { route: string; stop: string; time: number; trip: string }
/** Every predicted arrival in one feed: FeedMessage.entity → trip_update → stop_time_update. */
export function arrivals(feed: Uint8Array): Arrival[] {
  const out: Arrival[] = [];
  for (const entity of sub(fields(feed), 2)) {
    const tu = sub(fields(entity), 3)[0];
    if (!tu) continue;
    const t = fields(tu), trip = fields(sub(t, 1)[0] ?? new Uint8Array());
    const route = text(trip, 5), tripId = text(trip, 1);
    for (const stu of sub(t, 2)) {
      const s = fields(stu), ev = sub(s, 2)[0] ?? sub(s, 3)[0];
      const time = ev ? num(fields(ev), 2) : undefined;
      if (time) out.push({ route, stop: text(s, 4), time, trip: tripId });
    }
  }
  return out;
}

export interface Vehicle { trip: string; route: string; stop: string; status: number; time: number; lat?: number; lon?: number; label?: string }
/** Every vehicle in one feed: FeedMessage.entity → vehicle (status 0 incoming at, 1 stopped at, 2 in transit to). */
export function vehicles(feed: Uint8Array): Vehicle[] {
  const out: Vehicle[] = [];
  for (const entity of sub(fields(feed), 2)) {
    const vp = sub(fields(entity), 4)[0];
    if (!vp) continue;
    const v = fields(vp), trip = fields(sub(v, 1)[0] ?? new Uint8Array()), pos = sub(v, 2)[0], desc = sub(v, 8)[0];
    const p = pos ? fields(pos) : [];
    out.push({ trip: text(trip, 1), route: text(trip, 5), stop: text(v, 7), status: num(v, 4) ?? 2, time: num(v, 5) ?? 0,
      ...(pos ? { lat: num(p, 1), lon: num(p, 2) } : {}), ...(desc ? { label: text(fields(desc), 2) } : {}) });
  }
  return out;
}

// ---------- stations and cache ----------
type Station = { id: string; name: string; lines: string; north: string; south: string; lat: number; lon: number; ada: number; adaN: number; adaS: number; adaNotes: string };
let stations: Map<string, Station> | null = null;
async function loadStations() {
  if (stations) return stations;
  const rows: any[] = await (await fetch(STATIONS, { signal: AbortSignal.timeout(20_000) })).json();
  stations = new Map(rows.map((r) => [r.gtfs_stop_id, { id: r.gtfs_stop_id, name: r.stop_name, lines: r.daytime_routes, north: r.north_direction_label || "Northbound", south: r.south_direction_label || "Southbound", lat: +r.gtfs_latitude, lon: +r.gtfs_longitude,
    ada: +r.ada || 0, adaN: +r.ada_northbound || 0, adaS: +r.ada_southbound || 0, adaNotes: r.ada_notes && r.ada_notes !== "NaN" ? r.ada_notes : "" }]));
  return stations;
}
/** Step-free access at a platform: "635S" → the station and its southbound platform. ada: 0 none, 1 full, 2 partial. */
export async function stationAccess(stopId: string) {
  const st = (await loadStations()).get(stopId.replace(/[NS]$/, ""));
  if (!st) return null;
  const dir = stopId.endsWith("N") ? st.adaN : stopId.endsWith("S") ? st.adaS : st.ada;
  return { name: st.name, lines: st.lines, ada: dir || st.ada, notes: st.adaNotes };
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** A commute's options get what affects them: active MTA alerts on their subway lines, and (accessible) whether each
 *  boarding and exit platform is step-free right now (MTA's station data, minus elevators reported out). */
export async function annotateTrip(d: any, accessible = false) {
  if (!d?.options) return d;
  const alerts = alertsNow(), outs = outagesNow().filter((o) => o.kind === "EL");
  for (const o of d.options) {
    const routes = new Set(o.legs.filter((l: any) => l.mode === "SUBWAY").map((l: any) => String(l.route).replace(/X$/, "")));
    o.alerts = alerts.filter((a) => a.routes.split(",").some((r) => routes.has(r))).slice(0, 6).map((a) => ({ type: a.type, routes: a.routes, text: a.header.slice(0, 220) }));
    if (!accessible) continue;
    const notes: string[] = [];
    for (const l of o.legs.filter((x: any) => x.mode === "SUBWAY")) for (const [stop, what] of [[l.stop, "board"], [l.alight, "exit"]]) {
      const a = stop ? await stationAccess(stop) : null;
      if (!a) continue;
      if (a.ada === 0) notes.push(`${a.name}: not step-free (${what} the ${l.route})`);
      else if (a.ada === 2) notes.push(`${a.name}: only partly accessible${a.notes ? ` (${a.notes})` : ""}`);
      const r = String(l.route).replace(/X$/, ""), platformFor = (x: { serving: string }) => x.serving.match(/\b([A-Z0-9](?:\/[A-Z0-9])+|[A-Z0-9]) platform/)?.[1].split("/");
      // an elevator that names another line's platform ("2/3 platform") doesn't stop a Q rider; mezzanine/street ones do
      const down = outs.filter((x) => norm(x.station) === norm(a.name) && x.trains.split("/").includes(r) && (platformFor(x)?.includes(r) ?? true));
      for (const x of down) notes.push(`${a.name}: elevator out (${x.serving})${x.est_return ? `, back ~${new Date(x.est_return * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`);
    }
    o.access = { stepFree: notes.length === 0, notes };
  }
  if (accessible) d.options.sort((x: any, y: any) => Number(y.access?.stepFree) - Number(x.access?.stepFree)); // step-free first, otherwise as ranked
  d.accessible = accessible;
  return d;
}
let cache: { at: number; byStop: Map<string, Arrival[]>; byTrip: Map<string, Arrival[]>; vehicles: Vehicle[] } | null = null;
async function board() {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  const feeds = await Promise.all(FEEDS.map(async (u) => {
    try { const b = new Uint8Array(await (await fetch(u, { signal: AbortSignal.timeout(15_000) })).arrayBuffer()); return { a: arrivals(b), v: vehicles(b) }; } catch { return { a: [], v: [] }; }
  }));
  const byStop = new Map<string, Arrival[]>(), byTrip = new Map<string, Arrival[]>();
  for (const a of feeds.flatMap((f) => f.a)) {
    (byStop.get(a.stop) ?? byStop.set(a.stop, []).get(a.stop)!).push(a);
    (byTrip.get(a.trip) ?? byTrip.set(a.trip, []).get(a.trip)!).push(a);
  }
  for (const list of byTrip.values()) list.sort((x, y) => x.time - y.time);
  return (cache = { at: Date.now(), byStop, byTrip, vehicles: feeds.flatMap((f) => f.v) });
}

/** Next trains at a station (parent GTFS id like "A27"), by direction, in minutes from now. */
export async function stationArrivals(id: string, limit = 6) {
  const [st, b] = await Promise.all([loadStations(), board()]);
  const s = st.get(id);
  if (!s) return null;
  const now = Date.now() / 1000;
  const dir = (suffix: "N" | "S") => (b.byStop.get(id + suffix) ?? []).filter((a) => a.time > now - 30).sort((x, y) => x.time - y.time).slice(0, limit)
    .map((a) => ({ route: a.route, minutes: Math.max(0, Math.round((a.time - now) / 60)), trip: a.trip }));
  return { station: s.name, id, lines: s.lines, updated: Math.round(b.at / 1000), north: { label: s.north, trains: dir("N") }, south: { label: s.south, trains: dir("S") } };
}

/** Stations whose name matches `q` (for Blip: "next trains at Union Sq"). */
export async function findStations(q: string) {
  const norm = (x: string) => x.toLowerCase().replace(/street/g, "st").replace(/avenue/g, "av").replace(/square/g, "sq").replace(/[^a-z0-9]/g, "");
  const n = norm(q);
  return [...(await loadStations()).values()].filter((s) => norm(s.name).includes(n)).slice(0, 6);
}

/** The `n` subway stations nearest a point. */
export async function stationsNear(lat: number, lon: number, n = 3) {
  return [...(await loadStations()).values()].map((s) => ({ ...s, m: Math.round(meters([lat, lon], [s.lat, s.lon])) })).sort((x, y) => x.m - y.m).slice(0, n);
}

// ---------- Citi Bike (GBFS, no key) ----------
const GBFS = "https://gbfs.citibikenyc.com/gbfs/en";
let bikeInfo: { at: number; byId: Map<string, { name: string; lat: number; lon: number }> } | null = null;
let bikeStatus: { at: number; list: any[] } | null = null;
/** Citi Bike stations nearest a point that are renting and have a bike (or an e-bike, with `ebike`), live counts. */
export async function citiBikeNear(lat: number, lon: number, { ebike = false, n = 5 } = {}) {
  if (!bikeInfo || Date.now() - bikeInfo.at > 6 * 3600_000) {
    const d = await (await fetch(`${GBFS}/station_information.json`, { signal: AbortSignal.timeout(15_000) })).json();
    bikeInfo = { at: Date.now(), byId: new Map(d.data.stations.map((s: any) => [s.station_id, { name: s.name, lat: s.lat, lon: s.lon }])) };
  }
  if (!bikeStatus || Date.now() - bikeStatus.at > 30_000) {
    const d = await (await fetch(`${GBFS}/station_status.json`, { signal: AbortSignal.timeout(15_000) })).json();
    bikeStatus = { at: Date.now(), list: d.data.stations };
  }
  return bikeStatus.list.filter((s) => s.is_renting && (ebike ? s.num_ebikes_available > 0 : s.num_bikes_available > 0) && bikeInfo!.byId.has(s.station_id))
    .map((s) => { const i = bikeInfo!.byId.get(s.station_id)!, m = Math.round(meters([lat, lon], [i.lat, i.lon])); return { station: i.name, lat: i.lat, lon: i.lon, meters: m, walkMinutes: Math.max(1, Math.round((m * 1.3) / 80)), bikes: s.num_bikes_available - s.num_ebikes_available, ebikes: s.num_ebikes_available, docksFree: s.num_docks_available }; })
    .sort((x, y) => x.meters - y.meters).slice(0, n);
}

// ---------- where each train is now ----------
// The subway reports no GPS, only "stopped at X" or "heading to X" plus the predicted arrival there. So a moving
// train is drawn on its line's shape (static GTFS), walked back from X by the distance it covers in the time left.

const SUBWAY_STATIC = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const TRAIN_M_PER_S = 9; // ponytail: one average speed for every line; per-segment run times (stop_times.txt) if it looks off
type Pt = [lat: number, lon: number];
let subwayStatic: { at: number; shapes: Map<string, Pt[]>; stops: Map<string, { name: string; lat: number; lon: number }> } | null = null;
async function loadSubwayStatic() {
  if (subwayStatic && subwayStatic.at > Date.now() - 24 * 3600_000) return subwayStatic;
  const zip = path.join(os.tmpdir(), "subway-gtfs.zip");
  await writeFile(zip, new Uint8Array(await (await fetch(SUBWAY_STATIC, { signal: AbortSignal.timeout(60_000) })).arrayBuffer()));
  const [shapeRows, stopRows] = await Promise.all(["shapes.txt", "stops.txt"].map((f) => unzip(zip, f).then(csv)));
  const shapes = new Map<string, Pt[]>();
  for (const r of shapeRows) (shapes.get(r.shape_id) ?? shapes.set(r.shape_id, []).get(r.shape_id)!).push([+r.shape_pt_lat, +r.shape_pt_lon]); // rows come in sequence order
  return (subwayStatic = { at: Date.now(), shapes, stops: new Map(stopRows.map((r) => [r.stop_id, { name: r.stop_name, lat: +r.stop_lat, lon: +r.stop_lon }])) });
}
const meters = (a: Pt, b: Pt) => { const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k), y = (b[0] - a[0]) * k; return Math.hypot(x, y) * 6371e3; };
const closest = (pts: Pt[], p: Pt) => pts.reduce((best, q, i) => (meters(q, p) < meters(pts[best], p) ? i : best), 0);
/** The point `d` meters back along `pts` from index `i`, and the index it lands on. */
export function walkBack(pts: Pt[], i: number, d: number): { at: Pt; i: number } {
  while (i > 0) {
    const step = meters(pts[i - 1], pts[i]);
    if (step >= d) { const f = d / step; return { at: [pts[i][0] + (pts[i - 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i - 1][1] - pts[i][1]) * f], i: i - 1 }; }
    d -= step; i--;
  }
  return { at: pts[0], i: 0 };
}
// Realtime trip ids end in the shape, sometimes shortened: "057400_L..N" ↔ shape "L..N01R".
const shapeFor = (shapes: Map<string, Pt[]>, trip: string) => { const key = trip.slice(trip.indexOf("_") + 1); return shapes.get(key) ?? [...shapes].find(([id]) => id.startsWith(key))?.[1]; };

/** Every running train: where it is now (estimated), where it's headed, and (with `toStop`) the track ahead to that stop. */
export async function trainPositions(onlyTrip?: string, toStop?: string) {
  const [st, b] = await Promise.all([loadSubwayStatic(), board()]);
  const now = Date.now() / 1000;
  const out = [];
  for (const v of b.vehicles) {
    if (onlyTrip && v.trip !== onlyTrip) continue;
    const next = st.stops.get(v.stop), ahead = (b.byTrip.get(v.trip) ?? []).filter((a) => a.time > now - 30);
    if (!next) continue;
    const eta = ahead.find((a) => a.stop === v.stop)?.time ?? now, last = st.stops.get(ahead.at(-1)?.stop ?? v.stop);
    const shape = shapeFor(st.shapes, v.trip), at: Pt = [next.lat, next.lon];
    let pos = { at, i: shape ? closest(shape, at) : 0 };
    if (shape && v.status !== 1 && eta > now) pos = walkBack(shape, pos.i, (eta - now) * TRAIN_M_PER_S);
    const where = v.status === 1 ? `at ${next.name}` : `${eta - now < 60 ? "arriving at" : "heading to"} ${next.name}`;
    const t: any = { trip: v.trip, route: v.route, lat: +pos.at[0].toFixed(5), lon: +pos.at[1].toFixed(5), where, to: last?.name ?? "" };
    if (toStop && shape) {
      const s = st.stops.get(toStop);
      if (s) t.path = [pos.at, ...shape.slice(pos.i + 1, closest(shape, [s.lat, s.lon]) + 1)].map(([a, o]) => [+a.toFixed(5), +o.toFixed(5)]);
    }
    out.push(t);
  }
  return { updated: Math.round(b.at / 1000), trains: out };
}

// ---------- NYC Ferry: static GTFS (stops, routes, trips) + real-time trip updates ----------

const FERRY_STATIC = "http://nycferry.connexionz.net/rtt/public/resource/gtfs.zip";
const FERRY_RT = "http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate";
const FERRY_VP = "http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition";

/** A small CSV reader (quoted fields, no embedded newlines: enough for GTFS). */
export function csv(textIn: string) {
  const [head, ...rows] = textIn.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const split = (line: string) => [...line.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => (m[2] !== undefined ? m[2].replace(/""/g, '"') : m[1]));
  const keys = split(head);
  return rows.map((r) => Object.fromEntries(split(r).map((v, i) => [keys[i], v])));
}
const unzip = (zip: string, file: string) => new Promise<string>((ok, fail) => execFile("unzip", ["-p", zip, file], { maxBuffer: 50e6 }, (e, out) => (e ? fail(e) : ok(out))));

let ferryStatic: { at: number; stops: any[]; routes: Map<string, any>; tripRoute: Map<string, string> } | null = null;
async function loadFerryStatic() {
  if (ferryStatic && ferryStatic.at > Date.now() - 24 * 3600_000) return ferryStatic;
  const zip = path.join(os.tmpdir(), "nycferry-gtfs.zip");
  await writeFile(zip, new Uint8Array(await (await fetch(FERRY_STATIC, { signal: AbortSignal.timeout(30_000) })).arrayBuffer()));
  const [stops, routes, trips] = await Promise.all(["stops.txt", "routes.txt", "trips.txt"].map((f) => unzip(zip, f).then(csv)));
  return (ferryStatic = { at: Date.now(), stops, routes: new Map(routes.map((r) => [r.route_id, r])), tripRoute: new Map(trips.map((t) => [t.trip_id, t.route_id])) });
}
let ferryRt: { at: number; list: Arrival[] } | null = null;

/** Every NYC Ferry landing with its next boats (route, color, minutes). */
export async function ferryBoard(limit = 4) {
  const st = await loadFerryStatic();
  if (!ferryRt || ferryRt.at < Date.now() - 30_000)
    ferryRt = { at: Date.now(), list: arrivals(new Uint8Array(await (await fetch(FERRY_RT, { signal: AbortSignal.timeout(15_000) })).arrayBuffer())) };
  const now = Date.now() / 1000;
  return st.stops.map((s) => {
    const next = ferryRt!.list.filter((a) => a.stop === s.stop_id && a.time > now - 30).sort((a, b) => a.time - b.time).slice(0, limit).map((a) => {
      const r = st.routes.get(a.route || st.tripRoute.get(a.trip) || "");
      return { route: r?.route_long_name ?? "NYC Ferry", short: r?.route_short_name ?? "", color: r?.route_color ? `#${r.route_color}` : "#4de1ff", minutes: Math.max(0, Math.round((a.time - now) / 60)), trip: a.trip };
    });
    return { id: s.stop_id, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon), accessible: s.wheelchair_boarding === "1", next };
  });
}

let ferryVp: { at: number; list: Vehicle[] } | null = null;
/** Every NYC Ferry boat out now, from its GPS. */
export async function ferryBoats() {
  const st = await loadFerryStatic();
  if (!ferryVp || ferryVp.at < Date.now() - 15_000)
    ferryVp = { at: Date.now(), list: vehicles(new Uint8Array(await (await fetch(FERRY_VP, { signal: AbortSignal.timeout(15_000) })).arrayBuffer())) };
  await ferryBoard(); // refreshes the trip predictions, which name each boat's next landing (the GPS feed doesn't)
  const stops = new Map(st.stops.map((s) => [s.stop_id, s.stop_name])), now = Date.now() / 1000;
  return ferryVp.list.filter((v) => v.lat).map((v) => {
    const r = st.routes.get(v.route || st.tripRoute.get(v.trip) || "");
    const next = v.stop || ferryRt!.list.filter((a) => a.trip === v.trip && a.time > now - 30).sort((a, b) => a.time - b.time)[0]?.stop;
    return { trip: v.trip, boat: v.label ?? "", lat: +v.lat!.toFixed(5), lon: +v.lon!.toFixed(5), route: r?.route_long_name ?? "NYC Ferry", short: r?.route_short_name ?? "", color: r?.route_color ? `#${r.route_color}` : "#4de1ff",
      where: next ? `${v.status === 1 ? "at" : "heading to"} ${stops.get(next)}` : "between trips", seen: v.time };
  });
}

// ---------- MTA buses: Bus Time (key in .env as MTA_BUSTIME_KEY) ----------
// Stops come from the OneBusAway API by map area, arrivals from SIRI stop monitoring (with each bus's GPS),
// and route lines from stops-for-route (Google-encoded polylines).
const BUSTIME = "https://bustime.mta.info/api";
const busKey = () => process.env.MTA_BUSTIME_KEY ?? "";
const memo = new Map<string, { at: number; v: any }>();
async function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v;
  const v = await f();
  if (memo.size > 5000) memo.clear(); // ponytail: crude cap, an LRU if memory ever matters
  memo.set(key, { at: Date.now(), v });
  return v;
}
const busJson = async (u: string) => { const r = await fetch(`${BUSTIME}${u}${u.includes("?") ? "&" : "?"}key=${busKey()}`, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`bustime ${r.status}`); return r.json(); };

/** Bus stops in one cell of a 0.0075° grid (~800 m). Bus Time answers at most 100 stops per call; the densest
 *  cell (Midtown) has ~60, so a cell never gets cut off. The map asks cell by cell, and neighbors share the cache. */
export const BUS_GRID = 0.0075;
export async function busStops(lat: number, lon: number) {
  const la = +(Math.round(lat / BUS_GRID) * BUS_GRID).toFixed(4), lo = +(Math.round(lon / BUS_GRID) * BUS_GRID).toFixed(4);
  return cached(`stops:${la},${lo}`, 24 * 3600_000, async () => {
    const d = await busJson(`/where/stops-for-location.json?lat=${la}&lon=${lo}&latSpan=${BUS_GRID + 0.0005}&lonSpan=${BUS_GRID + 0.0005}`);
    if (d.data.limitExceeded) console.log(`bus stops: cell ${la},${lo} hit the 100-stop limit`);
    return d.data.stops.map((s: any) => ({ id: s.id, name: s.name, dir: s.direction, lat: s.lat, lon: s.lon,
      routes: s.routes.map((r: any) => ({ id: r.id, name: r.shortName, color: `#${r.color || "1c7ed6"}`, text: `#${r.textColor || "FFFFFF"}`, long: r.longName })) }));
  });
}

/** Next buses at a stop: route, destination, minutes, stops away, and where the bus is now. */
export async function busArrivals(stop: string) {
  return cached(`arr:${stop}`, 20_000, async () => {
    const d = await busJson(`/siri/stop-monitoring.json?OperatorRef=MTA&MonitoringRef=${encodeURIComponent(stop)}&MaximumStopVisits=8&StopMonitoringDetailLevel=minimum`);
    const now = Date.now(), visits = d.Siri.ServiceDelivery.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
    return visits.map((v: any) => {
      const j = v.MonitoredVehicleJourney, c = j.MonitoredCall ?? {}, t = c.ExpectedArrivalTime ?? c.AimedArrivalTime;
      return { route: j.PublishedLineName, routeId: j.LineRef, to: j.DestinationName, vehicle: j.VehicleRef,
        minutes: t ? Math.max(0, Math.round((Date.parse(t) - now) / 60_000)) : null, away: c.Extensions?.Distances?.PresentableDistance ?? "",
        lat: j.VehicleLocation?.Latitude, lon: j.VehicleLocation?.Longitude, occupancy: j.Occupancy ?? "" };
    });
  });
}

/** Google's encoded polyline format → [lat, lon] points. */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => { let r = 0, shift = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << shift; shift += 5; } while (b >= 32); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length) { lat += next(); lon += next(); out.push([lat / 1e5, lon / 1e5]); }
  return out;
}
/** A bus route's line on the map. */
export async function busRoute(id: string) {
  return cached(`route:${id}`, 24 * 3600_000, async () => {
    const d = await busJson(`/where/stops-for-route/${encodeURIComponent(id)}.json?includePolylines=true&version=2`);
    const r = d.data.references.routes.find((x: any) => x.id === id) ?? {};
    return { id, name: r.shortName ?? id, color: `#${r.color || "1c7ed6"}`, long: r.longName ?? "", lines: d.data.entry.polylines.map((p: any) => decodePolyline(p.points).map(([a, o]) => [+a.toFixed(5), +o.toFixed(5)])) };
  });
}
