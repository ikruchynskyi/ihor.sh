import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
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

// ---------- stations and cache ----------
type Station = { id: string; name: string; lines: string; north: string; south: string; lat: number; lon: number };
let stations: Map<string, Station> | null = null;
async function loadStations() {
  if (stations) return stations;
  const rows: any[] = await (await fetch(STATIONS, { signal: AbortSignal.timeout(20_000) })).json();
  stations = new Map(rows.map((r) => [r.gtfs_stop_id, { id: r.gtfs_stop_id, name: r.stop_name, lines: r.daytime_routes, north: r.north_direction_label || "Northbound", south: r.south_direction_label || "Southbound", lat: +r.gtfs_latitude, lon: +r.gtfs_longitude }]));
  return stations;
}
let cache: { at: number; byStop: Map<string, Arrival[]> } | null = null;
async function board() {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  const all = (await Promise.all(FEEDS.map(async (u) => {
    try { return arrivals(new Uint8Array(await (await fetch(u, { signal: AbortSignal.timeout(15_000) })).arrayBuffer())); } catch { return []; }
  }))).flat();
  const byStop = new Map<string, Arrival[]>();
  for (const a of all) (byStop.get(a.stop) ?? byStop.set(a.stop, []).get(a.stop)!).push(a);
  return (cache = { at: Date.now(), byStop });
}

/** Next trains at a station (parent GTFS id like "A27"), by direction, in minutes from now. */
export async function stationArrivals(id: string, limit = 6) {
  const [st, b] = await Promise.all([loadStations(), board()]);
  const s = st.get(id);
  if (!s) return null;
  const now = Date.now() / 1000;
  const dir = (suffix: "N" | "S") => (b.byStop.get(id + suffix) ?? []).filter((a) => a.time > now - 30).sort((x, y) => x.time - y.time).slice(0, limit)
    .map((a) => ({ route: a.route, minutes: Math.max(0, Math.round((a.time - now) / 60)) }));
  return { station: s.name, id, lines: s.lines, updated: Math.round(b.at / 1000), north: { label: s.north, trains: dir("N") }, south: { label: s.south, trains: dir("S") } };
}

/** Stations whose name matches `q` (for Blip: "next trains at Union Sq"). */
export async function findStations(q: string) {
  const norm = (x: string) => x.toLowerCase().replace(/street/g, "st").replace(/avenue/g, "av").replace(/square/g, "sq").replace(/[^a-z0-9]/g, "");
  const n = norm(q);
  return [...(await loadStations()).values()].filter((s) => norm(s.name).includes(n)).slice(0, 6);
}

// ---------- NYC Ferry: static GTFS (stops, routes, trips) + real-time trip updates ----------

const FERRY_STATIC = "http://nycferry.connexionz.net/rtt/public/resource/gtfs.zip";
const FERRY_RT = "http://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate";

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
      return { route: r?.route_long_name ?? "NYC Ferry", short: r?.route_short_name ?? "", color: r?.route_color ? `#${r.route_color}` : "#4de1ff", minutes: Math.max(0, Math.round((a.time - now) / 60)) };
    });
    return { id: s.stop_id, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon), accessible: s.wheelchair_boarding === "1", next };
  });
}
