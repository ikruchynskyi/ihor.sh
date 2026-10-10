// The sky over NYC, and what's on the air: aircraft (adsb.lol), the ISS (wheretheiss.at), tropical storms (NOAA NHC),
// the weather now (NWS), and internet radio stations near the city (Radio Browser). All keyless. Every source is
// fetched here and cached, so one upstream request serves every visitor; the NYC map and Blip read the same data.
import { gunzipSync } from "node:zlib";

const UA = { "user-agent": "ihor.sh NYC map (+https://ihor.sh/nyc/)" };
const NYC = { lat: 40.7306, lon: -73.9352 };
const get = async (url: string, timeout = 15_000) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r;
};
const json = async (url: string, timeout?: number) => (await get(url, timeout)).json();
/** Remember a value for `ms`; concurrent callers share one fetch. */
const memo = new Map<string, { at: number; p: Promise<any> }>();
function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.p;
  const p = f();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key)); // don't keep a failure
  if (memo.size > 500) memo.clear();
  return p;
}
/** Kilometers between two points (haversine). */
export const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2));
};

// ---------- aircraft ----------
// adsb.lol: community ADS-B, ODbL. Category A7 is a rotorcraft; dbFlags bit 1 marks military.
const HELI_TYPES = /^(EC\d|AS\d|A1\d\d|AW\d|B0\d|B4\d|B2\d|R22|R44|R66|S76|S92|H\d\d|UH\d|MD\d|BK17|EH10|A109|A119|A139|A169|A189)/;
export type Aircraft = { hex: string; flight: string; reg: string; type: string; lat: number; lon: number; altFt: number | null; kts: number | null; track: number | null; heli: boolean; military: boolean; squawk: string; emergency: string | null };
/** Everything flying within ~35 nm of the city now, refreshed every 8 s. */
export function aircraft(): Promise<Aircraft[]> {
  return cached("aircraft", 8_000, async () => {
    const d = await json(`https://api.adsb.lol/v2/lat/${NYC.lat}/lon/${NYC.lon}/dist/35`);
    return (d.ac as any[]).filter((a) => typeof a.lat === "number").map((a) => ({
      hex: a.hex, flight: String(a.flight ?? "").trim(), reg: a.r ?? "", type: a.t ?? "", lat: +a.lat.toFixed(5), lon: +a.lon.toFixed(5),
      altFt: a.alt_baro === "ground" ? 0 : typeof a.alt_baro === "number" ? a.alt_baro : null, kts: a.gs ?? null, track: a.track ?? a.true_heading ?? null,
      heli: a.category === "A7" || HELI_TYPES.test(a.t ?? ""), military: ((a.dbFlags ?? 0) & 1) === 1, squawk: a.squawk ?? "",
      emergency: a.emergency && a.emergency !== "none" ? a.emergency : null,
    }));
  });
}
/** One aircraft's track over the last ~24 h (adsb.lol's readsb trace), thinned to at most ~400 points. */
export function trace(hex: string) {
  if (!/^~?[0-9a-f]{6}$/.test(hex)) throw new Error("bad hex");
  return cached(`trace:${hex}`, 60_000, async () => {
    const buf = Buffer.from(await (await get(`https://adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`)).arrayBuffer());
    const d = JSON.parse((buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf8")); // served gzipped as plain JSON
    const pts = (d.trace as any[]).filter((p) => typeof p[1] === "number"), step = Math.max(1, Math.ceil(pts.length / 400));
    const since = Date.now() / 1000 - 24 * 3600;
    return { hex, from: d.timestamp, points: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).filter((p) => d.timestamp + p[0] > since)
      .map((p) => [+p[1].toFixed(5), +p[2].toFixed(5), p[3] === "ground" ? 0 : p[3] ?? null, Math.round(d.timestamp + p[0])]) };
  });
}

// ---------- the ISS ----------
/** Where the ISS is now, and its ground track for the next ~90 minutes (one orbit), every 3 minutes. */
export function iss() {
  return cached("iss", 5_000, async () => {
    const now = await json("https://api.wheretheiss.at/v1/satellites/25544");
    const track = await cached("iss-track", 120_000, async () => {
      const t0 = Math.floor(Date.now() / 1000), times = Array.from({ length: 30 }, (_, i) => t0 + i * 180), out: [number, number][] = [];
      for (let i = 0; i < times.length; i += 10) { // 10 timestamps per request
        const ps = await json(`https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${times.slice(i, i + 10).join(",")}`);
        for (const p of ps) out.push([+p.latitude.toFixed(3), +p.longitude.toFixed(3)]);
      }
      return out;
    });
    const at = { lat: now.latitude, lon: now.longitude };
    return { lat: +at.lat.toFixed(3), lon: +at.lon.toFixed(3), altKm: Math.round(now.altitude), kmh: Math.round(now.velocity), daylight: now.visibility === "daylight",
      footprintKm: Math.round(now.footprint), kmFromNyc: Math.round(km(at, NYC)), track };
  });
}

// ---------- tropical storms ----------
const NHC_MAP = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer";
const layer = (id: number) => json(`${NHC_MAP}/${id}/query?where=1%3D1&outFields=*&f=geojson&returnGeometry=true`, 25_000);
/** Active storms (Atlantic + Pacific) with forecast cones, tracks and points as GeoJSON, refreshed every 10 minutes. */
export function storms() {
  return cached("storms", 10 * 60_000, async () => {
    const [cur, points, track, cone, past] = await Promise.all([json("https://www.nhc.noaa.gov/CurrentStorms.json"), layer(5), layer(6), layer(7), layer(11)]);
    const lat = (s: string) => parseFloat(s) * (s.endsWith("S") ? -1 : 1), lon = (s: string) => parseFloat(s) * (s.endsWith("W") ? -1 : 1);
    const list = (cur.activeStorms as any[]).map((s) => ({
      name: s.name, kind: ({ HU: "hurricane", TS: "tropical storm", TD: "tropical depression", STS: "subtropical storm", PTC: "potential tropical cyclone" } as Record<string, string>)[s.classification] ?? s.classification,
      windKt: Number(s.intensity), pressureMb: Number(s.pressure), lat: lat(s.latitude), lon: lon(s.longitude), moving: `${s.movementDir}° at ${s.movementSpeed} mph`,
      kmFromNyc: Math.round(km({ lat: lat(s.latitude), lon: lon(s.longitude) }, NYC)), advisory: s.forecastAdvisory?.url ?? s.publicAdvisory?.url ?? null,
    }));
    return { storms: list, cone, track, points, past };
  });
}

// ---------- weather now ----------
/** Central Park's latest observation, the NWS forecast for the city, and any active alerts. */
export function weather() {
  return cached("weather", 10 * 60_000, async () => {
    const [obs, alerts, pt] = await Promise.all([
      json("https://api.weather.gov/stations/KNYC/observations/latest"),
      json(`https://api.weather.gov/alerts/active?point=${NYC.lat},${NYC.lon}`),
      json(`https://api.weather.gov/points/${NYC.lat},${NYC.lon}`),
    ]);
    const fc = await json(pt.properties.forecast).catch(() => null);
    const o = obs.properties, c = (v: any) => (typeof v?.value === "number" ? Math.round(v.value) : null);
    const tempC = c(o.temperature);
    return {
      station: "Central Park", at: o.timestamp, sky: o.textDescription, tempC, tempF: tempC === null ? null : Math.round(tempC * 1.8 + 32),
      windKmh: c(o.windSpeed), humidity: c(o.relativeHumidity),
      forecast: (fc?.properties?.periods ?? []).slice(0, 3).map((p: any) => `${p.name}: ${p.detailedForecast}`),
      alerts: (alerts.features as any[]).map((f) => ({ event: f.properties.event, headline: f.properties.headline, until: f.properties.ends ?? f.properties.expires })),
    };
  });
}

// ---------- radio stations ----------
const FM = /\b(8[89]|9\d|10[0-7])\.[1-9]\b/;
/** Internet radio stations based within ~40 km of the city (Radio Browser), one per name, refreshed daily. FM ones carry
 *  their frequency, so the map can offer to tune the site's own SDR to them. */
export function radioStations() {
  return cached("radio", 24 * 3600_000, async () => {
    const d: any[] = await json(`https://de1.api.radio-browser.info/json/stations/search?geo_lat=${NYC.lat}&geo_long=${NYC.lon}&geo_distance=40000&limit=400&hidebroken=true&order=clickcount&reverse=true`, 25_000);
    const seen = new Set<string>();
    const fresh = (k: string) => !seen.has(k) && !!seen.add(k);
    return d.filter((s) => s.geo_lat && fresh(s.name.trim().toLowerCase()) && fresh(s.url_resolved)).map((s) => ({ // one per name and per stream
      id: s.stationuuid, name: s.name.trim(), tags: String(s.tags ?? "").split(",").filter(Boolean).slice(0, 6), lat: +s.geo_lat, lon: +s.geo_long,
      stream: s.url_resolved, https: String(s.url_resolved).startsWith("https://"), homepage: s.homepage || null, codec: s.codec, kbps: s.bitrate || null,
      fmMHz: Number((`${s.name} ${s.tags}`.match(FM) ?? [])[0]) || null, votes: s.votes,
    }));
  });
}
