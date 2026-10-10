import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Ride: everything useful along a route from OpenStreetMap (Overpass). The query is built here, not sent by the page,
// the public instance is often busy (504s) so we back off and retry, and each route's answer is cached for a day.

// The main instance first. Mirrors are a fallback for when it's down, but they have answered 200 with no data for NYC
// (stale or partial), so an empty answer from a mirror counts as a failure, never as "no water anywhere".
// Its 504 means "queue full", so we wait and retry, within a time budget that stays under Cloudflare's 100 s.
const OVERPASS = "https://overpass-api.de/api/interpreter", MIRRORS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const BACKOFF = [3, 8, 15], BUDGET_MS = 70_000;
const UA = { "user-agent": "ihor.sh route notebook (+https://ihor.sh/ride/)", accept: "application/json" };
const cache = new Map<string, { at: number; v: unknown }>();

/** One Overpass query with retries: the main instance (backing off on its "queue full" 504s), then the mirrors, whose
 *  empty answers don't count. Elements come back as { lat, lon, tags } (ways and areas at their center). */
async function overpass(query: string, deadline = Date.now() + BUDGET_MS) {
  const ask = async (server: string) => {
    const left = deadline - Date.now();
    if (left < 3000) throw new Error("out of time");
    const r = await fetch(server, { method: "POST", headers: UA, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(Math.min(60_000, left)) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (d.remark && /error|timed out/i.test(d.remark)) throw new Error(d.remark.slice(0, 80));
    return (d.elements ?? []).map((e: any) => ({ id: `${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags ?? {} })).filter((e: any) => e.lat);
  };
  let last = "";
  for (const wait of [0, ...BACKOFF]) {
    if (wait) { if (Date.now() + wait * 1000 > deadline - 3000) break; await new Promise((r) => setTimeout(r, wait * 1000)); }
    try { return await ask(OVERPASS); } catch (e) { last = (e as Error).message; }
    for (const m of MIRRORS) { try { const els = await ask(m); if (els.length) return els; last = "a mirror answered with no data"; } catch (e) { last = (e as Error).message; } }
  }
  throw new Error(last);
}

/** Stops near a route given as up to 400 [lat, lon] points: water, food, bike repair within 400 m; lodging and stations within 3 km. */
export async function routeStops(line: unknown) {
  if (!Array.isArray(line) || line.length < 2 || line.length > 400 || !line.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180))
    return { error: "Send 2–400 [lat, lon] points." };
  const coords = (line as number[][]).map(([a, o]) => `${a.toFixed(5)},${o.toFixed(5)}`).join(",");
  const key = createHash("sha1").update(coords).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.v;
  // Two light queries instead of one heavy one, both inside the route's bounding box (Overpass times out on big ones
  // and then answers 200 with a "remark" and no data). Water and food are nearly always mapped as nodes.
  const lat = (line as number[][]).map((p) => p[0]), lon = (line as number[][]).map((p) => p[1]), pad = 0.03;
  const bbox = `[bbox:${Math.min(...lat) - pad},${Math.min(...lon) - pad},${Math.max(...lat) + pad},${Math.max(...lon) + pad}]`;
  const near = `(around:400,${coords})`, wide = `(around:3000,${coords})`;
  const queries = [
    `[out:json][timeout:90]${bbox};(node["amenity"~"^(drinking_water|water_point|cafe|fast_food|restaurant|bicycle_repair_station)$"]${near};node["man_made"="water_tap"]${near};node["shop"~"^(supermarket|convenience|general|bakery|deli|greengrocer|bicycle)$"]${near};);out;`, // "out tags" would drop the coordinates
    `[out:json][timeout:90]${bbox};(nwr["tourism"~"^(camp_site|hostel|motel|hotel|guest_house|alpine_hut|wilderness_hut)$"]${wide};node["railway"="station"]${wide};);out center tags;`,
  ];
  const deadline = Date.now() + BUDGET_MS, run = (query: string) => overpass(query, deadline);
  try {
    const elements = [...(await run(queries[0])), ...(await run(queries[1]))]; // one after the other: Overpass allows ~2 per IP at once
    const v = { elements };
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch (e) {
    return { error: `OpenStreetMap's Overpass servers aren't answering right now (${(e as Error).message}). Try again in a few minutes.` };
  }
}

// ---------- planning a bike route ----------
const VALHALLA = "https://valhalla1.openstreetmap.de";
const decode6 = (s: string) => { const out: [number, number][] = []; let i = 0, lat = 0, lon = 0; const next = () => { let r = 0, sh = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); return r & 1 ? ~(r >> 1) : r >> 1; }; while (i < s.length) { lat += next(); lon += next(); out.push([lat / 1e6, lon / 1e6]); } return out; };
const BIKES = { road: "Road", hybrid: "Hybrid", mountain: "Mountain", gravel: "Cross" } as const;

// The public Valhalla server routes bicycles at most 150 km per request, so long trips go leg by leg: every stretch
// is cut into pieces of at most LEG_KM in a straight line (roads run longer), routed one after another, and joined.
const LEG_KM = 110, MAX_KM = 2500;
const kmBetween = ([a, b]: number[], [c, d]: number[]) => { const r = Math.PI / 180, h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

/** A cycling route through 2–12 points (OSM via Valhalla), with elevation for every point. */
export async function bikeRoute(body: any) {
  const pts = body?.points;
  if (!Array.isArray(pts) || pts.length < 2 || pts.length > 12 || !pts.every((p: any) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return { error: "Send 2–12 [lat, lon] points." };
  const bike = BIKES[body.bike as keyof typeof BIKES] ?? "Hybrid", hills = Math.max(0, Math.min(1, Number(body.hills ?? 0.4)));
  const straight = pts.slice(1).reduce((s: number, p: number[], i: number) => s + kmBetween(pts[i], p), 0);
  if (straight > MAX_KM) return { error: `That's ${Math.round(straight)} km in a straight line; the planner handles trips up to ${MAX_KM} km. Split it into parts.` };
  // the stops along the way, with extra ones on long stretches (marked so they can be nudged if they land somewhere unroutable)
  const stops: { p: number[]; extra: boolean }[] = [{ p: pts[0], extra: false }];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.ceil(kmBetween(pts[i - 1], pts[i]) / LEG_KM);
    for (let k = 1; k < n; k++) stops.push({ p: [pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n], extra: true });
    stops.push({ p: pts[i], extra: false });
  }
  const leg = async (a: number[], b: number[]) => {
    const req = { locations: [a, b].map(([lat, lon]) => ({ lat, lon })), costing: "bicycle", costing_options: { bicycle: { bicycle_type: bike, use_hills: hills, use_roads: bike === "Road" ? 0.6 : 0.3 } }, units: "kilometers" };
    const r = await fetch(`${VALHALLA}/route`, { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify(req), signal: AbortSignal.timeout(40_000) });
    const d = await r.json().catch(() => null);
    return r.ok && d?.trip ? d.trip : { error: d?.error ?? `HTTP ${r.status}` };
  };
  let line: [number, number][] = [], km = 0, minutes = 0;
  for (let i = 1; i < stops.length; i++) {
    let trip: any = null;
    // An in-between point in a lake or a forest has no road nearby: try it shifted a few km each way.
    const tries = stops[i].extra ? [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.07], [0, -0.07], [0.12, 0.12], [-0.12, -0.12]] : [[0, 0]];
    for (const [dl, dn] of tries) {
      const b = [stops[i].p[0] + dl, stops[i].p[1] + dn];
      trip = await leg(stops[i - 1].p, b);
      if (!trip.error) { stops[i].p = b; break; }
      if (!stops[i].extra || !/edges|location|path|route/i.test(trip.error)) break;
    }
    if (trip.error) return { error: `No bike route${stops.length > 2 ? ` for part ${i} of ${stops.length - 1}` : ""}: ${trip.error}` };
    const shape = trip.legs.flatMap((l: any) => decode6(l.shape));
    line.push(...(line.length ? shape.slice(1) : shape));
    km += trip.summary.length; minutes += trip.summary.time / 60;
  }
  const every = Math.max(1, Math.ceil(line.length / 3000)); // ponytail: thinned to ≤ 3,000 points; plenty for planning
  line = line.filter((_, i) => i % every === 0 || i === line.length - 1);
  const h = await fetch(`${VALHALLA}/height`, { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ shape: line.map(([lat, lon]) => ({ lat, lon })), range: false }), signal: AbortSignal.timeout(40_000) }).then((x) => x.json()).catch(() => null);
  return { km, minutes: Math.round(minutes), legs: stops.length - 1, points: line.map(([lat, lon], i) => [+lat.toFixed(6), +lon.toFixed(6), h?.height?.[i] ?? null]) };
}

/** Places for the route planner's search box: Photon (OpenStreetMap), nudged toward New York but not limited to it. */
export async function placeSearch(q: string) {
  if (!q.trim()) return [];
  const c = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
  if (c) return [{ label: `${(+c[1]).toFixed(5)}, ${(+c[2]).toFixed(5)}`, lat: +c[1], lon: +c[2] }];
  const d = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en&lat=40.75&lon=-73.95`, { headers: UA, signal: AbortSignal.timeout(15_000) }).then((r) => r.json()).catch(() => null);
  return (d?.features ?? []).map((f: any) => { const p = f.properties; return { label: [p.name, [p.housenumber, p.street].filter(Boolean).join(" "), p.city ?? p.county, p.state].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }; });
}

// ---------- bike + train escapes: stations, and campgrounds near one ----------
const RAIL = { MNR: /Metro-North/i, LIRR: /Long Island Rail Road|LIRR/i, NJT: /NJ Transit/i } as const;
const STATIONS_FILE = path.join(import.meta.dirname, "data", "rail-stations.json");
let stationsCache: { at: number; v: any[] } | null = (() => { try { return JSON.parse(readFileSync(STATIONS_FILE, "utf8")); } catch { return null; } })(); // survives restarts
/** Every Metro-North, LIRR and NJ Transit station (OpenStreetMap), with which of the three serve it. Cached a week. */
export async function railStations() {
  if (stationsCache && Date.now() - stationsCache.at < 7 * 864e5) return stationsCache.v;
  const els = await overpass('[out:json][timeout:90];nwr["railway"="station"]["network"~"Metro-North|Long Island Rail Road|LIRR|NJ Transit",i](39.3,-75.6,42.3,-71.7);out center tags;');
  const seen = new Set<string>();
  const v = els.filter((e: any) => !["subway", "light_rail", "tram"].includes(e.tags.station) && e.tags.name).map((e: any) => ({
    name: e.tags.name, lat: +e.lat.toFixed(5), lon: +e.lon.toFixed(5), rr: (Object.keys(RAIL) as (keyof typeof RAIL)[]).filter((k) => RAIL[k].test(e.tags.network ?? "")),
  })).filter((s: any) => s.rr.length && !seen.has(`${s.name}|${s.rr}`) && seen.add(`${s.name}|${s.rr}`)).sort((a: any, b: any) => a.name.localeCompare(b.name));
  stationsCache = { at: Date.now(), v };
  try { writeFileSync(STATIONS_FILE, JSON.stringify(stationsCache)); } catch {}
  return v;
}
const campCache = new Map<string, { at: number; v: unknown }>();
/** Campgrounds within `km` of a point, as mapped in OpenStreetMap: name, website, fees, tents, and the straight-line distance. */
export async function campsNear(lat: number, lon: number, km: number) {
  if (![lat, lon, km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: "Need lat, lon and km." };
  const r = Math.min(60, Math.max(2, km)), key = `${lat.toFixed(3)},${lon.toFixed(3)},${r}`, hit = campCache.get(key);
  if (hit && Date.now() - hit.at < 864e5) return hit.v;
  try {
    const els = await overpass(`[out:json][timeout:60];nwr["tourism"="camp_site"](around:${r * 1000},${lat},${lon});out center tags;`);
    // campgrounds you can book: named, not single pitches, not private, tents allowed, not scout or group camps
    const names = new Set<string>(), ok = (t: any) => t.name && t.camp_site !== "camp_pitch" && t.access !== "private" && t.access !== "no" && t.tents !== "no" && t.group_only !== "yes" && !/scout|council|ymca|church|bible|private|group/i.test(t.name) && /[a-z]{3}/i.test(t.name);
    const v = { camps: els.filter((e: any) => ok(e.tags) && !names.has(e.tags.name) && names.add(e.tags.name)).map((e: any) => ({
      osm: e.id, name: e.tags.name, lat: +e.lat.toFixed(5), lon: +e.lon.toFixed(5), km: +kmBetween([lat, lon], [e.lat, e.lon]).toFixed(1),
      website: e.tags.website ?? e.tags["contact:website"] ?? e.tags.url ?? "", operator: e.tags.operator ?? "", fee: e.tags.fee ?? "", reservation: e.tags.reservation ?? "", backcountry: e.tags.backcountry === "yes" || /lean-?to|shelter/i.test(e.tags.name) || (/campsite$/i.test(e.tags.name) && !e.tags.website && !e.tags.operator), season: e.tags.opening_hours ?? "", phone: e.tags.phone ?? e.tags["contact:phone"] ?? "",
    })).sort((a: any, b: any) => a.km - b.km).slice(0, 40) };
    if (campCache.size > 300) campCache.clear();
    campCache.set(key, { at: Date.now(), v });
    return v;
  } catch (e) { return { error: `OpenStreetMap's Overpass servers aren't answering right now (${(e as Error).message}). Try again in a few minutes.` }; }
}
