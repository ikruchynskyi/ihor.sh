// NYC data behind the map pages and Blip's tools. Every call runs on the server, so the keys in .env
// (NYC API portal, Socrata) never reach the browser.
//   address:     NYC Planning GeoSearch (point → address) + NYC Geoclient v2 (address → districts, BBL, BIN…)
//   map click:   address + businesses there (OpenStreetMap via Photon, DCWP licenses w7w3-xahh, restaurant inspections)
//   events:      NYC Events Calendar API (nyc.gov), cached 30 min
//   restaurants: DOHMH restaurant inspections on NYC Open Data (Socrata 43nn-pn8j)

const env = (k: string) => process.env[k] ?? "";
const json = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
};

// ---------- addresses ----------
const GEOCLIENT_FIELDS: Record<string, string> = {
  bbl: "BBL (tax lot)", buildingIdentificationNumber: "BIN (building)", communityDistrict: "community district",
  cityCouncilDistrict: "council district", policePrecinct: "police precinct", firehouse: "nearest fire company",
  schoolDistrict: "school district", zipCode: "ZIP", ntaName: "neighborhood", assemblyDistrict: "assembly district",
  congressionalDistrict: "congressional district", sanitationDistrict: "sanitation district", healthCenterDistrict: "health center district",
  latitude: "lat", longitude: "lon",
};

/** Everything Geoclient knows about an address or place name ("348 E 54th St Manhattan", "Empire State Building"). */
export async function addressInfo(input: string) {
  const key = env("NYC_GEOCLIENT_KEY");
  if (!key) throw new Error("NYC_GEOCLIENT_KEY is not set");
  const d = await json(`https://api.nyc.gov/geoclient/v2/search.json?input=${encodeURIComponent(input)}`, { "Ocp-Apim-Subscription-Key": key });
  const hit = d.results?.[0];
  if (!hit) return { input, found: false };
  const r = hit.response ?? {};
  const out: Record<string, string> = {};
  for (const [k, label] of Object.entries(GEOCLIENT_FIELDS)) if (r[k]) out[label] = String(r[k]).trim();
  const street = [r.houseNumber ?? r.houseNumberIn, r.boePreferredStreetName ?? r.firstStreetNameNormalized].filter(Boolean).join(" ");
  return { input, found: true, address: [street, r.firstBoroughName].filter(Boolean).join(", "), ...out };
}

/** A map click: the nearest address (GeoSearch) and who is there: OpenStreetMap shops and places within ~50 m,
 *  NYC-licensed businesses in that building (DCWP) and restaurants with their latest inspection grade (DOHMH). */
export async function pointInfo(lat: number, lon: number) {
  const d = await json(`https://geosearch.planninglabs.nyc/v2/reverse?point.lat=${lat}&point.lon=${lon}&size=1`);
  const p = d.features?.[0]?.properties;
  if (!p) return { lat, lon, found: false };
  const query = p.housenumber ? `${p.housenumber} ${p.street} ${p.borough}` : p.label;
  const info: any = await addressInfo(query).catch(() => ({}));
  const bin = info["BIN (building)"]?.replace(/\D/g, "");
  const [osm, licensed, food] = await Promise.all([osmPlaces(lat, lon).catch(() => []), bin ? licensedAt(bin).catch(() => []) : [], bin ? restaurantsAt(bin).catch(() => []) : []]);
  const seen = new Set<string>(), key = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(inc|llc|corp)$/, "");
  const businesses = [...food, ...osm, ...licensed].filter((b) => !seen.has(key(b.name)) && seen.add(key(b.name)));
  return { lat, lon, found: true, place: p.label, address: p.housenumber ? `${titleCase(`${p.housenumber.replace(/\s+GARAGE$/i, "")} ${p.street}`).replace(/\bB'way\b/, "Broadway")}, ${p.borough}` : p.label.replace(/, (NY, )?USA$/, ""), neighborhood: info.neighborhood ?? p.neighbourhood ?? null, zip: info.ZIP ?? p.postalcode ?? null, businesses };
}

const titleCase = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/(^|[\s/-])[a-z]/g, (c) => c.toUpperCase());
/** Named shops, cafés, offices… within 50 m (OpenStreetMap via Photon's reverse geocoder). */
export async function osmPlaces(lat: number, lon: number) {
  const tags = ["shop", "amenity", "office", "tourism", "leisure", "craft", "healthcare"].map((t) => `&osm_tag=${t}`).join("");
  const d = await json(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=30&radius=0.05${tags}`);
  return (d.features as any[]).map((f) => f.properties).filter((p) => p.name && !/^(bench|bicycle_parking|parking|waste_basket|post_box|telephone|atm|fountain|bicycle_rental|toilets|drinking_water)$/.test(p.osm_value))
    .map((p) => ({ name: p.name, kind: `${p.osm_value.replace(/_/g, " ")}${p.osm_key === "shop" ? " shop" : ""}`, address: p.housenumber ? `${p.housenumber} ${p.street ?? ""}`.trim() : p.street ?? null, source: "OpenStreetMap" }));
}
/** Businesses with an active NYC consumer-protection license in the building (BIN). */
async function licensedAt(bin: string) {
  const rows: any[] = await json(`https://data.cityofnewyork.us/resource/w7w3-xahh.json?${new URLSearchParams({ bin, license_status: "Active", $limit: "25" })}`);
  return rows.map((r) => ({ name: titleCase(r.dba_trade_name || r.business_name), kind: r.business_category, address: `${r.address_building ?? ""} ${titleCase(r.address_street_name ?? "")}`.trim(), source: "NYC license" }));
}
/** Restaurants in the building (BIN) with their latest inspection grade. */
async function restaurantsAt(bin: string) {
  const rows: any[] = await soda({ bin, $select: "camis, dba, cuisine_description, building, street, grade, inspection_date", $order: "inspection_date DESC", $limit: "200" });
  const out = new Map<string, any>();
  for (const r of rows) {
    const cur = out.get(r.camis) ?? { name: titleCase(r.dba), kind: `restaurant · ${r.cuisine_description ?? ""}`.replace(/ · $/, ""), address: `${r.building ?? ""} ${titleCase(r.street ?? "")}`.trim(), camis: r.camis, grade: null, source: "Health inspections" };
    cur.grade ??= r.grade ?? null;
    out.set(r.camis, cur);
  }
  return [...out.values()];
}

// ---------- events calendar ----------
const strip = (html = "") => html.replace(/\\[nrt]/g, " ").replace(/\\\//g, "/").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&rsquo;|&lsquo;/g, "'").replace(/&reg;/g, "®").replace(/&[a-z]+;/g, "").replace(/\s+/g, " ").trim();
const usDate = (iso: string, end = false) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y} ${end ? "11:59 PM" : "12:00 AM"}`; };
const cache = new Map<string, { at: number; data: unknown }>();

/** NYC Events Calendar for `from`..`to` (YYYY-MM-DD, New York dates). */
export async function cityEvents(from: string, to = from, { freeOnly = false } = {}) {
  const key = env("NYC_EVENTS_KEY");
  if (!key) throw new Error("NYC_EVENTS_KEY is not set");
  const id = `${from}|${to}`;
  let items = cache.get(id)?.at! > Date.now() - 30 * 60_000 ? (cache.get(id)!.data as any[]) : null;
  if (!items) {
    items = [];
    for (let page = 1; page <= 5; page++) {
      const d = await json(`https://api.nyc.gov/calendar/discover?startDate=${encodeURIComponent(usDate(from))}&endDate=${encodeURIComponent(usDate(to, true))}&pageSize=100&pageNumber=${page}`,
        { "Ocp-Apim-Subscription-Key": key, "Cache-Control": "no-cache" });
      items.push(...(d.items ?? []));
      if (d.pagination?.isLastPage !== false) break;
    }
    cache.set(id, { at: Date.now(), data: items });
  }
  return items
    .filter((e) => !e.canceled && (!freeOnly || /(^|,)Free(,|$)/.test(e.categories ?? "")))
    .map((e) => ({
      id: e.id, name: e.name, when: `${e.datePart} · ${e.timePart}`, start: e.startDate, end: e.endDate ?? null, allDay: !!e.allDay,
      place: [e.location, e.address].filter(Boolean).join(" · "), boroughs: e.boroughs ?? [], categories: e.categories ?? "",
      free: /(^|,)Free(,|$)/.test(e.categories ?? ""), summary: strip(e.shortDesc || e.desc).slice(0, 220),
      url: e.website || e.permalink, permalink: e.permalink,
      lat: Number(e.geometry?.[0]?.lat) || null, lon: Number(e.geometry?.[0]?.lng) || null,
    }));
}

// ---------- restaurant inspections ----------
const SODA = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const soda = (params: Record<string, string>) => {
  const auth = env("SOCRATA_KEY_ID") ? { Authorization: "Basic " + Buffer.from(`${env("SOCRATA_KEY_ID")}:${env("SOCRATA_KEY_SECRET")}`).toString("base64") } : {};
  return json(`${SODA}?${new URLSearchParams(params)}`, auth);
};
const soql = (s: string) => s.replace(/'/g, "''");

/** Restaurants whose name matches `name` (one row per restaurant, with its latest inspection). */
export async function findRestaurants(name: string, borough = "") {
  const where = [`upper(dba) like '%${soql(name.toUpperCase())}%'`, "latitude IS NOT NULL", borough && `upper(boro) = '${soql(borough.toUpperCase())}'`].filter(Boolean).join(" AND ");
  const rows: any[] = await soda({
    $select: "camis, dba, boro, building, street, zipcode, cuisine_description, max(inspection_date) as last, max(latitude) as lat, max(longitude) as lon",
    $where: where, $group: "camis, dba, boro, building, street, zipcode, cuisine_description", $order: "last DESC", $limit: "40",
  });
  return rows.map((r) => ({ camis: r.camis, name: r.dba, cuisine: r.cuisine_description, address: `${r.building ?? ""} ${r.street ?? ""}, ${r.boro} ${r.zipcode ?? ""}`.trim(), lat: Number(r.lat), lon: Number(r.lon), lastInspection: r.last?.slice(0, 10) }));
}

/** One restaurant's inspection history: grade, score and violations per visit, newest first. */
export async function restaurantInspections(camis: string) {
  const rows: any[] = await soda({ camis: camis.replace(/\D/g, ""), $order: "inspection_date DESC", $limit: "200" });
  if (!rows.length) return null;
  const visits = new Map<string, any>();
  for (const r of rows) {
    const date = r.inspection_date?.slice(0, 10);
    if (!date || date.startsWith("1900")) continue; // 1900-01-01 means "not inspected yet"
    const v = visits.get(date) ?? { date, type: r.inspection_type, grade: r.grade ?? null, score: r.score ? Number(r.score) : null, action: r.action, violations: [] as any[] };
    if (r.violation_description) v.violations.push({ code: r.violation_code, critical: r.critical_flag === "Critical", text: r.violation_description });
    v.grade ??= r.grade ?? null;
    visits.set(date, v);
  }
  const r = rows[0];
  return { camis: r.camis, name: r.dba, cuisine: r.cuisine_description, address: `${r.building} ${r.street}, ${r.boro} ${r.zipcode}`, phone: r.phone,
    lat: Number(r.latitude) || null, lon: Number(r.longitude) || null, visits: [...visits.values()].slice(0, 8) };
}

// ---------- traffic cameras ----------
let cams: { at: number; list: any[] } | null = null;
/** NYC DOT traffic cameras (webcams.nyctmc.org): id, name, area, lat/lon, live JPEG URL. Cached 10 min. */
export async function trafficCameras() {
  if (!cams || cams.at < Date.now() - 10 * 60_000) {
    const rows: any[] = await json("https://webcams.nyctmc.org/api/cameras");
    cams = { at: Date.now(), list: rows.filter((c) => c.isOnline === "true" || c.isOnline === true)
      .map((c) => ({ id: c.id, name: c.name, area: c.area, lat: c.latitude, lon: c.longitude, image: c.imageUrl })) };
  }
  return cams.list;
}

// ---------- 311 ----------
/** 311 service requests from the newest 48 hours of published data (it lags about a day), inside a map box. */
export async function complaints311(s: number, w: number, n: number, e: number) {
  const auth = env("SOCRATA_KEY_ID") ? { Authorization: "Basic " + Buffer.from(`${env("SOCRATA_KEY_ID")}:${env("SOCRATA_KEY_SECRET")}`).toString("base64") } : {};
  const base = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
  const [{ last }] = await json(`${base}?$select=max(created_date) as last`, auth);
  const since = new Date(new Date(last + "Z").getTime() - 48 * 3600_000).toISOString().slice(0, 19);
  const rows: any[] = await json(`${base}?${new URLSearchParams({
    $select: "unique_key, created_date, complaint_type, descriptor, incident_address, latitude, longitude, status, agency",
    $where: `created_date >= '${since}' AND within_box(location, ${n}, ${w}, ${s}, ${e})`, $order: "created_date DESC", $limit: "600" })}`, auth);
  return { asOf: last, items: rows.filter((r) => r.latitude).map((r) => ({ id: r.unique_key, at: r.created_date, type: r.complaint_type, what: r.descriptor ?? "", address: r.incident_address ?? "", status: r.status, agency: r.agency, lat: Number(r.latitude), lon: Number(r.longitude) })) };
}

// ---------- traffic speeds ----------
let speeds: { at: number; data: any } | null = null;
/** NYC DOT real-time link speeds (Socrata i4gi-tjb9): the latest reading per road segment. Cached 2 min. */
export async function trafficSpeeds() {
  if (speeds && speeds.at > Date.now() - 2 * 60_000) return speeds.data;
  const auth = env("SOCRATA_KEY_ID") ? { Authorization: "Basic " + Buffer.from(`${env("SOCRATA_KEY_ID")}:${env("SOCRATA_KEY_SECRET")}`).toString("base64") } : {};
  const base = "https://data.cityofnewyork.us/resource/i4gi-tjb9.json";
  const [{ last }] = await json(`${base}?$select=max(data_as_of) as last`, auth);
  const since = new Date(new Date(last + "Z").getTime() - 15 * 60_000).toISOString().slice(0, 19);
  const rows: any[] = await json(`${base}?${new URLSearchParams({ $where: `data_as_of >= '${since}'`, $order: "data_as_of DESC", $limit: "5000", $select: "link_id, link_name, borough, speed, status, data_as_of, link_points" })}`, auth);
  const byLink = new Map<string, any>();
  for (const r of rows) if (!byLink.has(r.link_id)) byLink.set(r.link_id, r);
  // data_as_of is New York local time without a zone; compare in NY time to judge freshness
  const nyNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const ageMin = Math.round((nyNow.getTime() - new Date(last).getTime()) / 60_000);
  const links = [...byLink.values()].map((r) => ({
    id: r.link_id, name: r.link_name, borough: r.borough, mph: Number(r.speed), ok: r.status !== "-101" && Number(r.speed) > 0,
    points: String(r.link_points ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite) && p[0] > 40 && p[0] < 41.2),
  })).filter((l) => l.points.length > 1);
  const data = { asOf: last, ageMinutes: ageMin, stale: ageMin > 30, links };
  speeds = { at: Date.now(), data };
  return data;
}

// ---------- trip planner ----------
/** First match for an address or place in NYC (NYC Planning GeoSearch); "lat,lon" (a point picked on the map) is used as is. */
export async function geocode(text: string) {
  const c = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (c) {
    const lat = Number(c[1]), lon = Number(c[2]);
    const near = await json(`https://geosearch.planninglabs.nyc/v2/reverse?point.lat=${lat}&point.lon=${lon}&size=1`).catch(() => null);
    return { label: near?.features?.[0]?.properties?.label ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon };
  }
  // Intersections ("Canal St and Broadway"): Geoclient understands NYC cross streets far better than GeoSearch.
  if (/\s(and|&|at)\s/i.test(text)) {
    const g: any = await addressInfo(text).catch(() => null);
    if (g?.found && g.lat && g.lon) return { label: g.address || text, lat: Number(g.lat), lon: Number(g.lon) };
  }
  // Names ("Grand Central", "Jackson Heights"): Photon (OpenStreetMap) inside NYC. GeoSearch matched those to a Harlem
  // address and a business in St. Albans. Street addresses ("350 5th Ave") stay with GeoSearch, the city's own data.
  if (!/^\s*\d/.test(text)) {
    const p = await json(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lang=en&bbox=-74.26,40.49,-73.69,40.92`).catch(() => null);
    const f = p?.features?.[0];
    if (f) { const q = f.properties; return { label: [q.name, [q.housenumber, q.street].filter(Boolean).join(" "), q.district ?? q.city].filter(Boolean).join(", "), lon: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number }; }
  }
  const d = await json(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(text)}&size=1`);
  const f = d.features?.[0];
  return f ? { label: f.properties.label as string, lon: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number } : null;
}

/**
 * What you might mean so far, for the trip planner's dropdown as you type: place names from OpenStreetMap (Photon,
 * inside NYC) and street addresses from NYC Planning GeoSearch's autocomplete. Addresses first when the text starts
 * with a number. Duplicates (a station's several entrances) are folded by name and ~300 m.
 */
export async function suggest(text: string) {
  if (text.trim().length < 2) return [];
  const photon = json(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&lang=en&bbox=-74.26,40.49,-73.69,40.92`).then((d) => (d.features as any[]).map((f) => {
    const q = f.properties, street = [q.housenumber, q.street].filter(Boolean).join(" ");
    return { name: q.name ?? street, detail: [q.name ? street : null, q.district ?? q.city].filter(Boolean).join(", "), kind: String(q.osm_value ?? "").replace(/_/g, " "), lon: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number };
  })).catch(() => []);
  const addresses = json(`https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}`).then((d) => (d.features as any[]).slice(0, 6).map((f) => {
    const q = f.properties;
    return { name: titleCase(q.name), detail: [q.borough, q.postalcode].filter(Boolean).join(" "), kind: "address", lon: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number };
  })).catch(() => []);
  const [a, b] = await Promise.all([photon, addresses]);
  const out: Awaited<typeof photon> = [];
  // a typed name: the city's address list adds alias spellings ("Barclay's Center & Arena"…), so only its top two
  for (const x of /^\s*\d/.test(text) ? [...b, ...a] : [...a, ...b.slice(0, 2)])
    if (x.name && !out.some((y) => y.name.toLowerCase() === x.name.toLowerCase() && Math.abs(y.lat - x.lat) + Math.abs(y.lon - x.lon) < 0.004)) out.push(x);
  return out.slice(0, 8);
}

const COSTING = { drive: "auto", bike: "bicycle", walk: "pedestrian" } as const;

type Place = { lat: number; lon: number; label: string };
/** A car route through `pts` in order, with live and typical traffic from TomTom (key in .env as TOMTOM_API_KEY). */
async function tomtomRoute(pts: Place[], avoidFerries: boolean) {
  const q = new URLSearchParams({ key: env("TOMTOM_API_KEY"), traffic: "true", travelMode: "car", computeTravelTimeFor: "all", sectionType: "ferry", routeRepresentation: "polyline" });
  q.append("sectionType", "traffic"); // jams on the route: where, how bad, how slow
  if (avoidFerries) q.set("avoid", "ferries");
  const d = await json(`https://api.tomtom.com/routing/1/calculateRoute/${pts.map((p) => `${p.lat},${p.lon}`).join(":")}/json?${q}`);
  const r = d.routes?.[0];
  if (!r) throw new Error("no TomTom route");
  return {
    distance: r.summary.lengthInMeters, duration: r.summary.travelTimeInSeconds, delay: r.summary.trafficDelayInSeconds ?? 0,
    noTraffic: r.summary.noTrafficTravelTimeInSeconds ?? r.summary.travelTimeInSeconds,
    usesFerry: (r.sections ?? []).some((x: any) => x.sectionType === "FERRY"),
    // magnitudeOfDelay: 0 unknown, 1 minor, 2 moderate, 3 major, 4 undefined (closures); indices point into `line`
    jams: (r.sections ?? []).filter((x: any) => x.sectionType === "TRAFFIC").map((x: any) => ({
      from: x.startPointIndex, to: x.endPointIndex, magnitude: x.magnitudeOfDelay ?? 0, delayMinutes: Math.round((x.delayInSeconds ?? 0) / 60),
      kmh: x.effectiveSpeedInKmh ?? null, kind: x.simpleCategory ?? "JAM" })),
    line: r.legs.flatMap((l: any) => l.points.map((p: any) => [p.latitude, p.longitude])) as [number, number][],
  };
}
/** Valhalla's encoded polyline (6 decimal places) → [lat, lon] points. */
function decodePolyline(str: string, precision = 6) {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => { let r = 0, shift = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < str.length) { lat += next(); lon += next(); out.push([lat / 10 ** precision, lon / 10 ** precision]); }
  return out;
}
/**
 * A route from A to B through up to 6 stops in order (Valhalla on valhalla1.openstreetmap.de, which can avoid ferries)
 * and the traffic cameras along it, in order: every camera within 150 m of the line, sorted by how far along the trip it is.
 */
export async function tripPlan(from: string, to: string, mode: keyof typeof COSTING | "transit" = "drive", { avoidFerries = false, via = [] as string[] } = {}) {
  const names = [from, ...via.slice(0, 6), to], found = await Promise.all(names.map(geocode));
  const missing = found.findIndex((p) => !p);
  if (missing >= 0) return { error: `Couldn't find ${names[missing]} in NYC.` };
  const pts = found as Place[], a = pts[0], b = pts[pts.length - 1], stops = pts.slice(1, -1);
  if (mode === "transit") return stops.length ? transitWithStops(pts) : transitPlan(a, b);
  // Car trips with a TomTom key: live traffic in the time. Otherwise (and for bike/walk) Valhalla's typical speeds.
  const tt = mode === "drive" && env("TOMTOM_API_KEY") ? await tomtomRoute(pts, avoidFerries).catch(() => null) : null;
  const costing = COSTING[mode] ?? "auto";
  const req = { locations: pts.map((p) => ({ lat: p.lat, lon: p.lon })), costing, costing_options: { [costing]: { use_ferry: avoidFerries ? 0 : 0.5 } }, units: "kilometers" };
  const trip = tt ? null : (await (await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(req))}`,
    { headers: { "user-agent": "ihor.sh trip planner (+https://ihor.sh/nyc/)" }, signal: AbortSignal.timeout(25_000) })).json()).trip;
  if (!tt && !trip) return { error: "No route found." };
  const usesFerry = tt ? tt.usesFerry : trip.legs.some((l: any) => l.maneuvers.some((m: any) => m.type === 28)); // 28 = board a ferry
  const route = tt ?? { distance: trip.summary.length * 1000, duration: trip.summary.time };
  const line = (tt ? tt.line : trip.legs.flatMap((l: any) => decodePolyline(l.shape))) as [number, number][];
  // Flat-earth meters are plenty at city scale.
  const M_LAT = 111_320, M_LON = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const cams = await trafficCameras().catch(() => []);
  const along: { cam: any; at: number; off: number }[] = [];
  for (const c of cams) {
    let best = { off: Infinity, at: 0 }, walked = 0;
    for (let i = 1; i < line.length; i++) {
      const [y1, x1] = [line[i - 1][0] * M_LAT, line[i - 1][1] * M_LON], [y2, x2] = [line[i][0] * M_LAT, line[i][1] * M_LON], [py, px] = [c.lat * M_LAT, c.lon * M_LON];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len ** 2));
      const off = Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
      if (off < best.off) best = { off, at: walked + t * len };
      walked += len;
    }
    if (best.off <= 150) along.push({ cam: c, ...best });
  }
  along.sort((x, y) => x.at - y.at);
  // Road segments with live speeds that the route follows (most of their points within 60 m of it).
  const near = (lat: number, lon: number) => line.some(([y, x], i) => i && (() => {
    const [y1, x1] = [line[i - 1][0] * M_LAT, line[i - 1][1] * M_LON], [y2, x2] = [y * M_LAT, x * M_LON], [py, px] = [lat * M_LAT, lon * M_LON];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len ** 2));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))) < 60;
  })());
  const sp = mode === "drive" ? await trafficSpeeds().catch(() => null) : null;
  const traffic = sp ? { asOf: sp.asOf, stale: sp.stale, onRoute: sp.links.filter((l: any) => l.ok && l.points.filter(([la, lo]: number[]) => near(la, lo)).length >= l.points.length * 0.6)
    .map((l: any) => ({ name: l.name, mph: l.mph })).sort((x: any, y: any) => x.mph - y.mph) } : null;
  const jams = tt?.jams ?? [];
  const eta = tt ? { source: "TomTom live traffic", delayMinutes: Math.round(tt.delay / 60), noTrafficMinutes: Math.round(tt.noTraffic / 60) } : { source: mode === "drive" ? "typical speeds (no live traffic)" : "typical speeds" };
  return { from: a, to: b, stops, mode, avoidFerries, usesFerry, eta, jams, traffic, distanceKm: +(route.distance / 1000).toFixed(1), minutes: Math.round(route.duration / 60), line,
    cameras: along.map(({ cam, at, off }) => ({ ...cam, kmAlong: +(at / 1000).toFixed(1), metersOff: Math.round(off) })) };
}

/**
 * Commute: subway + bus + walking options from Transitous (transitous.org), a free community MOTIS router that runs on
 * the MTA's own GTFS feeds. Each subway leg carries the MTA realtime trip id, so the map can show that train live.
 */
const sig = (it: any) => it.legs.filter((l: any) => l.mode !== "WALK").map((l: any) => l.routeShortName).join(">") || "walk";
/** A one- or two-stop bus at the very start or end of a trip (to catch a train a minute earlier) becomes a walk,
 *  timed from the straight-line distance (×1.3 for streets, 80 m a minute). */
function dropHops(it: any) {
  const legs = [...it.legs];
  let start = Date.parse(it.startTime), end = Date.parse(it.endTime);
  const transit = () => legs.filter((l) => l.mode !== "WALK");
  for (const atEnd of [false, true]) {
    const t = atEnd ? transit().at(-1) : transit()[0];
    if (transit().length < 2 || t.mode !== "BUS" || (t.intermediateStops?.length ?? 0) > 1 || t.duration > 300) continue;
    const i = legs.indexOf(t), lo = legs[i - 1]?.mode === "WALK" ? i - 1 : i, hi = legs[i + 1]?.mode === "WALK" ? i + 1 : i;
    const A = legs[lo].from, B = legs[hi].to, k = Math.PI / 180;
    const m = Math.hypot((B.lon - A.lon) * k * Math.cos(A.lat * k), (B.lat - A.lat) * k) * 6371e3, sec = Math.round((m * 1.3) / 80) * 60;
    const next = legs[hi + 1], prev = legs[lo - 1];
    if (atEnd) end = Date.parse(prev.endTime) + sec * 1000; else start = Date.parse(next.startTime) - sec * 1000;
    legs.splice(lo, hi - lo + 1, { mode: "WALK", from: A, to: B, duration: sec, startTime: new Date(atEnd ? end - sec * 1000 : start).toISOString(), endTime: new Date(atEnd ? end : start + sec * 1000).toISOString(),
      legGeometry: null, line: [[A.lat, A.lon], [B.lat, B.lon]], estimated: true });
  }
  return { ...it, legs, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), duration: (end - start) / 1000, transfers: Math.max(0, transit().length - 1) };
}

/** Transit through stops: each stretch planned in turn, leaving when the last one arrives; the simplest option of each, joined. */
async function transitWithStops(pts: Place[]) {
  const parts: any[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d: any = await transitPlan(pts[i - 1], pts[i], parts.at(-1)?.arrive);
    if (d.error) return { error: `${pts[i - 1].label} → ${pts[i].label}: ${d.error}` };
    const o = d.options[0];
    o.legs.at(-1).stopAfter = i < pts.length - 1 ? pts[i].label : undefined;
    parts.push(o);
  }
  const depart = parts[0].depart, arrive = parts.at(-1).arrive;
  return { from: pts[0], to: pts.at(-1), stops: pts.slice(1, -1), mode: "transit", source: "Transitous (MTA schedules and live updates)",
    options: [{ minutes: Math.round((Date.parse(arrive) - Date.parse(depart)) / 60000), transfers: parts.reduce((t, o) => t + o.transfers, 0), depart, arrive, later: [],
      walkMinutes: parts.reduce((t, o) => t + o.walkMinutes, 0), legs: parts.flatMap((o) => o.legs) }] };
}

async function transitPlan(a: Place, b: Place, leaveAt?: string) {
  const q = new URLSearchParams({ fromPlace: `${a.lat},${a.lon}`, toPlace: `${b.lat},${b.lon}`, numItineraries: "8", transitModes: "SUBWAY,BUS", directModes: "WALK" });
  if (leaveAt) q.set("time", leaveAt);
  const r = await fetch(`https://api.transitous.org/api/v1/plan?${q}`, { headers: { "user-agent": "ihor.sh trip planner (+https://ihor.sh/nyc/)" }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) return { error: `The transit router isn't answering (${r.status}). Try again in a minute.` };
  const d = await r.json();
  // The router optimizes arrival time only, so it suggests one-stop bus hops to catch a train a minute earlier, and
  // NY Waterway's ferry shuttles. Keep MTA legs only, and rank by how simple a trip is to ride.
  const mta = (it: any) => it.legs.every((l: any) => l.mode === "WALK" || /^MTA/.test(l.agencyName ?? ""));
  const hops = (it: any) => it.legs.filter((l: any) => l.mode !== "WALK" && (l.intermediateStops?.length ?? 0) === 0 && l.duration <= 240).length;
  const score = (it: any) => it.duration / 60 + 4 * it.transfers + 6 * hops(it);
  const walk = (d.direct ?? []).find((x: any) => x.legs.length === 1 && x.legs[0].mode === "WALK" && x.duration <= 45 * 60);
  // The same routes at later times are one option with its next departures.
  const all = [...(walk ? [{ ...walk, transfers: 0 }] : []), ...(d.itineraries ?? []).filter(mta).map(dropHops)].sort((x, y) => Date.parse(x.startTime) - Date.parse(y.startTime));
  const groups = new Map<string, any>();
  for (const it of all) { const g = groups.get(sig(it)); if (g) g.later.push(it.startTime); else groups.set(sig(it), { ...it, later: [] }); }
  const best = [...groups.values()].sort((x, y) => score(x) - score(y)).slice(0, 4);
  const options = best.map((it: any) => ({
    minutes: Math.round(it.duration / 60), transfers: it.transfers, depart: it.startTime, arrive: it.endTime, later: (it.later ?? []).slice(0, 3),
    walkMinutes: Math.round(it.legs.filter((l: any) => l.mode === "WALK").reduce((t: number, l: any) => t + l.duration, 0) / 60),
    legs: it.legs.map((l: any) => ({
      mode: l.mode, route: l.routeShortName ?? "", color: l.routeColor ? `#${l.routeColor}` : null, text: l.routeTextColor ? `#${l.routeTextColor}` : "#ffffff",
      headsign: l.headsign ?? "", from: l.from.name, to: l.to.name, depart: l.startTime, arrive: l.endTime, minutes: Math.max(1, Math.round(l.duration / 60)),
      stops: (l.intermediateStops?.length ?? 0) + 1, realTime: !!l.realTime, estimated: !!l.estimated,
      line: (l.line ?? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6)).map(([la, lo]: number[]) => [+la.toFixed(5), +lo.toFixed(5)]),
      // "20261009_10:36_us-ny-MTA-NYCSubway_…_063600_4..S06R" → the realtime id "063600_4..S06R"; boarding stop "635S"
      ...(l.mode === "SUBWAY" && l.tripId ? { trip: l.tripId.split("_").slice(-2).join("_"), stop: String(l.from.stopId ?? "").split("_").pop() } : {}),
    })),
  }));
  if (!options.length) return { error: "No subway or bus route found between those places." };
  return { from: a, to: b, mode: "transit", options, source: "Transitous (MTA schedules and live updates)" };
}

// ---------- the web ----------
/** Web search: Tavily when its key works, DuckDuckGo's HTML results otherwise. */
export async function webSearch(query: string) {
  const key = env("TAVILY_API_KEY");
  if (key) {
    try {
      const r = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, max_results: 5 }) });
      if (r.ok) return { engine: "tavily", results: ((await r.json()).results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: String(x.content ?? "").slice(0, 400) })) };
    } catch {}
  }
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "user-agent": "Mozilla/5.0 (ihor.sh Blip)" }, signal: AbortSignal.timeout(15_000) });
  const html = await r.text();
  const results = [...html.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, 5).map(([, href, title, snippet]) => {
    const u = new URL(href.replace(/&amp;/g, "&"), "https://duckduckgo.com");
    return { title: strip(title), url: u.searchParams.get("uddg") ?? u.href, snippet: strip(snippet) };
  });
  return { engine: "duckduckgo", results };
}
