import { createHash } from "node:crypto";

// Ride: everything useful along a route from OpenStreetMap (Overpass). The query is built here, not sent by the page,
// the public instance is often busy (504s) so we back off and retry, and each route's answer is cached for a day.

// Only the main instance: mirrors tried here answered 200 with no data for NYC (stale or partial), which reads as
// "no water anywhere". Its 504 means "queue full", so we wait and retry instead.
const OVERPASS = "https://overpass-api.de/api/interpreter", BACKOFF = [3, 8, 15, 25];
const UA = { "user-agent": "ihor.sh route notebook (+https://ihor.sh/ride/)", accept: "application/json" };
const cache = new Map<string, { at: number; v: unknown }>();

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
  const run = async (query: string) => {
    let last = "";
    for (const wait of [0, ...BACKOFF]) {
      if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
      try {
        const r = await fetch(OVERPASS, { method: "POST", headers: UA, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(100_000) });
        if (!r.ok) { last = `HTTP ${r.status}`; continue; }
        const d = await r.json();
        if (d.remark && /error|timed out/i.test(d.remark)) { last = d.remark.slice(0, 80); continue; }
        return (d.elements ?? []).map((e: any) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags ?? {} })).filter((e: any) => e.lat);
      } catch (e) { last = (e as Error).message; }
    }
    throw new Error(last);
  };
  try {
    const elements = [...(await run(queries[0])), ...(await run(queries[1]))]; // one after the other: Overpass allows ~2 per IP at once
    const v = { elements };
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch (e) {
    return { error: `OpenStreetMap's Overpass servers are busy right now (${(e as Error).message}). Try again in a minute.` };
  }
}
