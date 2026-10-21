// The sky over NYC, and what's on the air: aircraft (adsb.lol), the ISS (wheretheiss.at), tropical storms (NOAA NHC),
// the weather now (NWS), and internet radio stations near the city (Radio Browser). All keyless. Every source is
// fetched here and cached, so one upstream request serves every visitor; the NYC map and Blip read the same data.
import { mvtPoints } from "./mvt.ts";
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
/** Everything flying within ~35 nm of the city (or of any point: the map's view) now, refreshed every 8 s. Points snap
 *  to a 0.25° grid, so everyone looking at about the same area shares one upstream request. */
export function aircraft(lat = NYC.lat, lon = NYC.lon): Promise<Aircraft[]> {
  const la = Math.round(lat * 4) / 4, lo = Math.round(lon * 4) / 4, home = Math.abs(lat - NYC.lat) < 0.2 && Math.abs(lon - NYC.lon) < 0.25;
  return cached(home ? "aircraft" : `aircraft:${la},${lo}`, 8_000, async () => {
    const d = await json(`https://api.adsb.lol/v2/lat/${home ? NYC.lat : la}/lon/${home ? NYC.lon : lo}/dist/35`);
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
/** The weather at NYC (Central Park), or at any point: in the US the nearest NWS station, its forecast and alerts;
 *  elsewhere Open-Meteo's model (no station, no alerts). */
export function weather(lat = NYC.lat, lon = NYC.lon) {
  const home = Math.abs(lat - NYC.lat) < 0.2 && Math.abs(lon - NYC.lon) < 0.25, la = home ? NYC.lat : +lat.toFixed(1), lo = home ? NYC.lon : +lon.toFixed(1);
  return cached(home ? "weather" : `weather:${la},${lo}`, 10 * 60_000, async () => {
    const pt = await json(`https://api.weather.gov/points/${la},${lo}`).catch(() => null); // 404 outside the US
    if (!pt) return openMeteo(la, lo);
    const st = home ? { id: "KNYC", name: "Central Park" } : await json(pt.properties.observationStations).then((d) => ({ id: d.features[0].properties.stationIdentifier, name: d.features[0].properties.name }));
    const [obs, alerts, fc] = await Promise.all([
      json(`https://api.weather.gov/stations/${st.id}/observations/latest`),
      json(`https://api.weather.gov/alerts/active?point=${la},${lo}`),
      json(pt.properties.forecast).catch(() => null),
    ]);
    const o = obs.properties, c = (v: any) => (typeof v?.value === "number" ? Math.round(v.value) : null);
    const tempC = c(o.temperature);
    return {
      station: st.name, at: o.timestamp, sky: o.textDescription, tempC, tempF: tempC === null ? null : Math.round(tempC * 1.8 + 32),
      windKmh: c(o.windSpeed), humidity: c(o.relativeHumidity),
      forecast: (fc?.properties?.periods ?? []).slice(0, 3).map((p: any) => `${p.name}: ${p.detailedForecast}`),
      alerts: (alerts.features as any[]).map((f) => ({ event: f.properties.event, headline: f.properties.headline, until: f.properties.ends ?? f.properties.expires })),
    };
  });
}

// WMO weather codes (Open-Meteo) in words.
const wmo = (n: number) => n === 0 ? "Clear" : n <= 2 ? "Partly cloudy" : n === 3 ? "Overcast" : n <= 48 ? "Fog" : n <= 57 ? "Drizzle" : n <= 67 ? "Rain" : n <= 77 ? "Snow" : n <= 82 ? "Rain showers" : n <= 86 ? "Snow showers" : "Thunderstorm";
async function openMeteo(lat: number, lon: number) {
  const d = await json(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=3&timezone=auto`);
  const c = d.current, tempC = Math.round(c.temperature_2m);
  return {
    station: `Open-Meteo forecast model at ${lat}, ${lon}`, at: c.time, sky: wmo(c.weather_code), tempC, tempF: Math.round(tempC * 1.8 + 32), windKmh: Math.round(c.wind_speed_10m), humidity: c.relative_humidity_2m,
    forecast: (d.daily.time as string[]).map((t, i) => `${t}: ${wmo(d.daily.weather_code[i])}, ${Math.round(d.daily.temperature_2m_min[i])}–${Math.round(d.daily.temperature_2m_max[i])} °C, rain chance ${d.daily.precipitation_probability_max[i] ?? "?"}%`),
    alerts: [],
  };
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

// ---------- street-level photos ----------
/** Every Mapillary photo in a box (zoomed-in map view), newest first, as points; thumbnails come from photoImages.
 *  Read from Mapillary's coverage tiles (z14, ~2.4 km, every photo): the search API returns at most 400 a box, all
 *  bunched in one spot. Key MAPILLARY_TOKEN; photos CC BY-SA 4.0, "© Mapillary contributors". Over PHOTO_MAX in the
 *  box, the newest per small grid cell. */
export type Photo = { id: string; lat: number; lon: number; at: number; angle: number | null; pano: boolean };
const PHOTO_MAX = 3000, tiles = new Map<string, { at: number; p: Promise<Photo[]> }>();
function photoTile(x: number, y: number): Promise<Photo[]> {
  const k = `${x}/${y}`, hit = tiles.get(k);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.p;
  const p = fetch(`https://tiles.mapillary.com/maps/vtp/mly1_public/2/14/${k}?access_token=${process.env.MAPILLARY_TOKEN}`, { signal: AbortSignal.timeout(30_000) })
    .then(async (r) => { if (!r.ok) throw new Error(`Mapillary tiles: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); })
    .then((b) => mvtPoints(b, "image", 14, x, y).map((m) => ({ id: String(m.id), lat: +m.lat.toFixed(6), lon: +m.lon.toFixed(6), at: Number(m.captured_at), angle: m.compass_angle ?? null, pano: !!m.is_pano })));
  tiles.delete(k); tiles.set(k, { at: Date.now(), p }); // newest last: a Manhattan tile is ~50,000 photos, so keep only a dozen
  if (tiles.size > 12) tiles.delete(tiles.keys().next().value!);
  p.catch(() => tiles.delete(k));
  return p;
}
export async function streetPhotos(s: number, w: number, n: number, e: number) {
  if (!process.env.MAPILLARY_TOKEN) return [];
  if (!(n > s && e > w && n - s <= 0.03 && e - w <= 0.04)) throw new Error("zoom in further");
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * 16384), ty = (lat: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 16384);
  const parts: Promise<Photo[]>[] = [];
  for (let x = tx(w); x <= tx(e); x++) for (let y = ty(n); y <= ty(s); y++) parts.push(photoTile(x, y));
  let list = (await Promise.all(parts)).flat().filter((p) => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e).sort((a, b) => b.at - a.at);
  if (list.length > PHOTO_MAX) { // the newest photo per cell, cells sized so about PHOTO_MAX fit
    const cell = Math.sqrt(((n - s) * (e - w)) / PHOTO_MAX), seen = new Set<string>();
    list = list.filter((p) => { const c = `${Math.floor(p.lat / cell)},${Math.floor(p.lon / cell)}`; return !seen.has(c) && !!seen.add(c); });
  }
  return list;
}
/** Thumbnails (signed links that expire, so kept an hour) and photographers for up to 50 photos, in one request. */
const images = new Map<string, { at: number; thumb: string; by: string | null }>();
export async function photoImages(ids: string[]) {
  const want = [...new Set(ids.filter((id) => /^\d{1,20}$/.test(id)))].slice(0, 50), fresh = (id: string) => { const i = images.get(id); return i && Date.now() - i.at < 3600_000; };
  const missing = want.filter((id) => !fresh(id));
  if (missing.length && process.env.MAPILLARY_TOKEN) {
    const q = new URLSearchParams({ access_token: process.env.MAPILLARY_TOKEN, image_ids: missing.join(","), fields: "id,thumb_1024_url,creator" });
    const d: any = await json(`https://graph.mapillary.com/images?${q}`, 25_000);
    for (const m of d.data ?? []) if (m.thumb_1024_url) images.set(m.id, { at: Date.now(), thumb: m.thumb_1024_url, by: m.creator?.username ?? null });
    if (images.size > 20_000) images.clear();
  }
  return Object.fromEntries(want.filter(fresh).map((id) => { const { at, ...i } = images.get(id)!; void at; return [id, i]; }));
}
/** MapillaryJS (the street-photo viewer) asks the graph API through us: the token is added here and never reaches a
 *  page. Answers are kept 10 minutes (the photo links in them are signed for longer), at most 400 of them. */
const graphCache = new Map<string, { at: number; p: Promise<string> }>();
export function mapillaryGraph(path: string, query: URLSearchParams) {
  query.delete("access_token");
  const k = `${path}?${query}`, hit = graphCache.get(k);
  if (hit && Date.now() - hit.at < 600_000) return hit.p;
  query.set("access_token", process.env.MAPILLARY_TOKEN ?? "");
  const p = fetch(`https://graph.mapillary.com/${path}?${query}`, { signal: AbortSignal.timeout(20_000) })
    .then(async (r) => { if (!r.ok) throw Object.assign(new Error(`Mapillary ${r.status}`), { code: r.status }); return r.text(); });
  graphCache.delete(k); graphCache.set(k, { at: Date.now(), p });
  if (graphCache.size > 400) graphCache.delete(graphCache.keys().next().value!);
  p.catch(() => graphCache.delete(k));
  return p;
}
/** The best Mapillary photo of a point within ~100 m (the middle of a big block is that far from a street): near, looking at it (a 360° photo always is), newer. */
export async function photoNear(lat: number, lon: number) {
  const list = await streetPhotos(lat - 0.0009, lon - 0.0012, lat + 0.0009, lon + 0.0012);
  const toward = (p: { lat: number; lon: number }) => (Math.atan2((lon - p.lon) * Math.cos((lat * Math.PI) / 180), lat - p.lat) * 180 / Math.PI + 360) % 360;
  const off = (p: { lat: number; lon: number; angle: number | null; pano: boolean }) => (p.pano || p.angle == null ? 0 : Math.abs(((p.angle - toward(p) + 540) % 360) - 180));
  const score = (p: { lat: number; lon: number; at: number; angle: number | null; pano: boolean }) => km(p, { lat, lon }) * 1000 + (Date.now() - p.at) / (365 * 864e5) * 5 + Math.max(0, off(p) - 30) * 0.5; // 5 m per year of age; 15 m per 30° looking away
  const best = [...list].sort((a, b) => score(a) - score(b))[0]; // a copy: the cached list stays newest-first
  const img = best && (await photoImages([best.id]))[best.id];
  return best && img ? { ...best, ...img, meters: Math.round(km(best, { lat, lon }) * 1000), page: `https://www.mapillary.com/app/?pKey=${best.id}` } : null;
}

// ---------- FM stations on the air (FCC) + what our own antenna hears ----------
/** Licensed full-power FM stations within ~100 km of the city, from the FCC's FM query (refreshed weekly). The list
 *  says what's on the air; a stream's name ("WNYC 93.9") is only a claim, and many streams are internet-only. */
function fccFm() {
  return cached("fcc-fm", 7 * 24 * 3600_000, async () => {
    const txt = await (await get("https://transition.fcc.gov/fcc-bin/fmq?serv=FM&vac=3&freq=87.9&fre2=108.0&list=4&dist=100&dlat2=40&mlat2=44&slat2=0&NS=N&dlon2=73&mlon2=59&slon2=0&EW=W&size=9", 40_000)).text();
    const best = new Map<string, any>();
    for (const line of txt.split("\n")) {
      const f = line.split("|").map((x) => x.trim());
      if (f.length < 29 || !/^\d/.test(f[2])) continue;
      const st = { call: f[1].replace(/-FM$/, ""), mhz: parseFloat(f[2]), status: f[9], city: f[10], state: f[11], erpKw: Math.max(parseFloat(f[14]) || 0, parseFloat(f[15]) || 0),
        lat: +(+f[20] + +f[21] / 60 + +f[22] / 3600).toFixed(4), lon: -(+f[24] + +f[25] / 60 + +f[26] / 3600).toFixed(4), licensee: f[27], km: parseFloat(f[28]) };
      const cur = best.get(st.call);
      if (!cur || (cur.status !== "LIC" && st.status === "LIC")) best.set(st.call, st); // one record per station, the license first
    }
    return [...best.values()].sort((a, b) => a.mhz - b.mhz);
  });
}
const SDR = `http://${process.env.SDR_HOST ?? "127.0.0.1"}:${process.env.SDR_PORT ?? 8073}`;
/** The latest FM band scan from our dongle; asks for a new one (in the background) when it's over 6 hours old. */
async function fmScan() {
  const last = await json(`${SDR}/api/scan/fm`, 5_000).catch(() => null);
  if (!last?.at || Date.now() - last.at > 6 * 3600_000) cached("fm-scan-kick", 10 * 60_000, () => fetch(`${SDR}/api/scan/fm`, { method: "POST", signal: AbortSignal.timeout(60_000) }).catch(() => null));
  return last?.at ? last : null;
}
/** NYC radio: every FM station on the air (FCC), whether our antenna hears it (the scan), and its internet stream if one
 *  matches its call sign; plus internet-only streams from the city. */
export async function radioDial() {
  const [fm, streams, scan] = await Promise.all([fccFm(), radioStations().catch(() => []), fmScan()]); // the FM list stands without Radio Browser's streams
  const level = new Map<number, number>((scan?.channels ?? []).map((c: any) => [c.mhz, c.snrDb]));
  const used = new Set<string>();
  const stations = fm.map((st: any) => {
    const call = new RegExp(`\\b${st.call}\\b`, "i");
    const mine = streams.filter((s) => call.test(`${s.name} ${s.homepage ?? ""} ${s.tags.join(" ")}`));
    mine.forEach((s) => used.add(s.id));
    const snr = level.get(st.mhz) ?? null;
    // within 200 kHz of a channel ≥10 dB louder, a modest reading is that neighbor spilling over, not this station
    const louder = [-0.2, 0.2].some((d) => (level.get(+(st.mhz + d).toFixed(1)) ?? -99) >= (snr ?? 0) + 10);
    const heard = snr === null ? "not scanned" : snr >= 15 ? "clear" : snr >= 8 && !louder ? "heard" : louder && snr >= 8 ? "spillover" : "not heard";
    return { ...st, snrDb: snr, heard, streams: mine.map((s) => ({ name: s.name, url: s.stream, https: s.https, codec: s.codec, kbps: s.kbps })) };
  });
  // Stations far apart share channels (four on 88.1), and a scan measures the channel: credit what's heard to the one
  // most likely to arrive here (power ÷ distance²), and mark the rest as sharing it.
  const likely = new Map<number, any>();
  for (const st of stations) { const cur = likely.get(st.mhz), w = (s: any) => s.erpKw / Math.max(1, s.km) ** 2; if (!cur || w(st) > w(cur)) likely.set(st.mhz, st); }
  for (const st of stations) if (likely.get(st.mhz) !== st && (st.heard === "clear" || st.heard === "heard")) Object.assign(st, { heard: "co-channel", sharesWith: likely.get(st.mhz).call });
  const internet = streams.filter((s) => !used.has(s.id)).map((s) => ({ name: s.name, tags: s.tags, url: s.stream, https: s.https, homepage: s.homepage, claimsFm: s.fmMHz }));
  return { scan: scan && { at: scan.at, gain: scan.gain }, stations, internet };
}
