// NYC data behind the map pages and Blip's tools. Every call runs on the server, so the keys in .env
// (NYC API portal, Socrata) never reach the browser.
//   address:     NYC Planning GeoSearch (point → address) + NYC Geoclient v2 (address → districts, BBL, BIN…)
//   map click:   address + businesses there (OpenStreetMap via Photon, DCWP licenses w7w3-xahh, restaurant inspections)
//   events:      NYC Events Calendar API (nyc.gov), cached 30 min
//   restaurants: DOHMH restaurant inspections on NYC Open Data (Socrata 43nn-pn8j)

import { OLLAMA, LOCAL_MODEL } from "./llm.ts";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

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
/** What's at a point outside NYC: OpenStreetMap's address (Photon) and the places there; no city records. */
async function pointAnywhere(lat: number, lon: number) {
  const [d, osm] = await Promise.all([json(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1&lang=en`), osmPlaces(lat, lon).catch(() => [])]);
  const p = d.features?.[0]?.properties;
  if (!p) return { lat, lon, found: false };
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  return { lat, lon, found: true, place: p.name ?? street, address: [p.name && p.name !== street ? p.name : null, street, p.city ?? p.county].filter(Boolean).join(", "),
    neighborhood: [p.district, p.state, p.country].filter(Boolean).join(", "), zip: p.postcode ?? "", businesses: osm, outsideNyc: true };
}
export const inNyc = (lat: number, lon: number) => lat > 40.4 && lat < 41 && lon > -74.3 && lon < -73.6;
export async function pointInfo(lat: number, lon: number) {
  if (!inNyc(lat, lon)) return pointAnywhere(lat, lon);
  const d = await json(`https://geosearch.planninglabs.nyc/v2/reverse?point.lat=${lat}&point.lon=${lon}&size=1`);
  const p = d.features?.[0]?.properties;
  if (!p) return { lat, lon, found: false };
  const query = p.housenumber ? `${p.housenumber} ${p.street} ${p.borough}` : p.label;
  const info: any = await addressInfo(query).catch(() => ({}));
  const bin = info["BIN (building)"]?.replace(/\D/g, "");
  const [osm, licensed, food, rated] = await Promise.all([osmPlaces(lat, lon).catch(() => []), bin ? licensedAt(bin).catch(() => []) : [], bin ? restaurantsAt(bin).catch(() => []) : [], googleRatings(lat, lon).catch(() => [])]);
  const businesses = mergeBusinesses([...food, ...osm, ...licensed], rated);
  return { lat, lon, found: true, place: p.label, address: p.housenumber ? `${titleCase(`${p.housenumber.replace(/\s+GARAGE$/i, "")} ${p.street}`).replace(/\bB'way\b/, "Broadway")}, ${p.borough}` : p.label.replace(/, (NY, )?USA$/, ""), neighborhood: info.neighborhood ?? p.neighbourhood ?? null, zip: info.ZIP ?? p.postalcode ?? null, businesses };
}

// "Marea Restaurant" (inspections), "Marea" (OpenStreetMap) and "Marea" (Google) are one place: names compared without
// words like Restaurant, Corp or LLC and without "(Columbus Circle)"; one that starts the other matches too.
const NAME_NOISE = /\b(the|and|of|restaurant|restaurants|bakery|cafe|corp|corporation|inc|llc|ltd|co|nyc|ny|new york|manhattan|brooklyn)\b/g;
export const nameKey = (n: string) => n.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " ").replace(/[^a-z0-9 ]/g, "").replace(NAME_NOISE, " ").replace(/\s+/g, " ").trim();
const sameName = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b + " ") || b.startsWith(a + " ")));
/** One line per business: city records and OpenStreetMap first, Google's rating, hours, website and phone merged into the
 *  matching one. Google-only places (offices upstairs, rental listings) need a rating and come after what's at street level. */
export function mergeBusinesses(local: any[], google: any[]) {
  const out: any[] = [];
  for (const b of local) {
    const k = nameKey(b.name), same = k && out.find((x) => sameName(x.k, k));
    if (same) { for (const [f, v] of Object.entries(b)) if (same[f] == null || same[f] === "") same[f] = v; same.sources.add(b.source); }
    else out.push({ ...b, k, sources: new Set([b.source]) });
  }
  for (const g of google) {
    const k = nameKey(g.name), extra = { rating: g.rating, reviews: g.reviews, ratingUrl: g.url, website: g.website, phone: g.phone, open: g.open, hoursToday: g.hoursToday };
    const hit = k && out.find((x) => sameName(x.k, k));
    if (hit) { Object.assign(hit, extra); hit.sources.add("Google"); }
    else if (g.rating) out.push({ name: g.name, kind: g.kind, ...extra, k, sources: new Set(["Google"]) });
  }
  const score = (b: any) => ([...b.sources].some((x: string) => x === "Health inspections" || x === "OpenStreetMap") ? 3 : b.sources.has("NYC license") ? 1 : 0) + (b.ratingUrl ? 1 : 0) + (b.grade ? 1 : 0) + (b.website ? 1 : 0);
  return out.map((b, i) => ({ b, i })).sort((x, y) => score(y.b) - score(x.b) || x.i - y.i).map(({ b }) => { const { k, sources, ...rest } = b; return { ...rest, source: [...sources].join(", ") }; });
}

// ---------- Google Places on a map click: rating, website, phone, hours, inside the free tier ----------
// Rating, website, phone and hours put Nearby Search in Google's Enterprise SKU: 1,000 free calls a month (per-SKU free
// usage since March 2025). We stop at PLACES_MONTHLY_CAP (default 900) and PLACES_DAILY_CAP (default 60) calls, counted
// in data/places.db so a restart doesn't reset them, and keep each ~28 m square's answer for 30 days.
// opened on first use: modules that import this one (and their tests on the host) never touch the live file
let placesDb: DatabaseSync | null = null;
const pdbOpen = () => { if (!placesDb) { placesDb = new DatabaseSync(process.env.PLACES_DB ?? path.join(import.meta.dirname, "..", "data", "places.db"), { timeout: 5000 });
  placesDb.exec("create table if not exists cache (k text primary key, at int, v text); create table if not exists used (day text primary key, n int)"); } return placesDb; };
const nyDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
/** One call of a Google SKU ("nearby" for map clicks, "text" for searches; 1,000 free a month each): false once it would
 *  pass PLACES_MONTHLY_CAP (900) or PLACES_DAILY_CAP (60) for that SKU. */
function spendPlaces(sku: string) {
  const pdb = pdbOpen(), day = nyDay(), get = (q: string, k: string) => (pdb.prepare(q).get(k) as any)?.n ?? 0;
  if (get("select n from used where day = ?", `${sku}:${day}`) >= (Number(env("PLACES_DAILY_CAP")) || 60) || get("select sum(n) n from used where day like ?", `${sku}:${day.slice(0, 7)}%`) >= (Number(env("PLACES_MONTHLY_CAP")) || 900)) return false;
  pdb.prepare("insert into used values (?, 1) on conflict(day) do update set n = n + 1").run(`${sku}:${day}`);
  return true;
}
const placesKey = () => env("GOOGLE_PLACES_KEY") || env("GOOGLE_PLACES_API") || env("SHEETS_API_KEY");
/** Google's weekly hours → open at this moment in New York (periods use 0 = Sunday, like JS; one period with no close = 24/7). */
export function openNow(periods: any[] | undefined, now = new Date()) {
  if (!periods?.length) return null;
  if (periods.length === 1 && !periods[0].close) return true;
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })), t = ny.getDay() * 1440 + ny.getHours() * 60 + ny.getMinutes(), at = (x: any) => x.day * 1440 + (x.hour ?? 0) * 60 + (x.minute ?? 0);
  return periods.some((p) => { if (!p.open || !p.close) return false; const a = at(p.open), b = at(p.close); return b > a ? t >= a && t < b : t >= a || t < b; }); // b < a: open past Saturday midnight
}
export async function googleRatings(lat: number, lon: number) {
  const key = placesKey();
  if (!key) return [];
  const pdb = pdbOpen(), glat = Math.round(lat * 4000) / 4000, glon = Math.round(lon * 3000) / 3000, k = `${glat},${glon}`; // ~28 m squares
  const hit = pdb.prepare("select v from cache where k = ? and at > ?").get(k, Date.now() / 1000 - 30 * 86400) as { v: string } | undefined;
  let places: any[];
  if (hit) places = JSON.parse(hit.v);
  else {
    if (!spendPlaces("nearby")) return [];
    // a key restricted to ihor.sh pages: these calls are made for those pages
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST", signal: AbortSignal.timeout(8_000),
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, Referer: "https://ihor.sh/", "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber,places.regularOpeningHours,places.primaryTypeDisplayName,places.businessStatus" },
      body: JSON.stringify({ maxResultCount: 15, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude: glat, longitude: glon }, radius: 45 } } }),
    });
    if (!r.ok) throw new Error(`Places API ${r.status}`);
    places = ((await r.json()).places ?? []).filter((p: any) => p.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY").map((p: any) => ({
      name: p.displayName.text, kind: p.primaryTypeDisplayName?.text ?? "", rating: p.rating ?? null, reviews: p.userRatingCount ?? 0, url: p.googleMapsUri, website: p.websiteUri ?? "",
      phone: p.nationalPhoneNumber ?? "", periods: p.regularOpeningHours?.periods ?? null, week: p.regularOpeningHours?.weekdayDescriptions ?? null, closedForNow: p.businessStatus === "CLOSED_TEMPORARILY" }));
    pdb.prepare("insert or replace into cache values (?, ?, ?)").run(k, Math.floor(Date.now() / 1000), JSON.stringify(places));
  }
  const dow = (new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay() + 6) % 7; // weekdayDescriptions start on Monday
  return places.map(({ periods, week, ...p }) => ({ ...p, open: p.closedForNow ? false : openNow(periods), hoursToday: week?.[dow]?.replace(/^[A-Za-z]+:\s*/, "") ?? "" }));
}

/** Places by what and where ("ramen", "shoe store", "rooftop bar" near a point): Google's Text Search with rating, price,
 *  hours, website and phone (its own 1,000 free calls a month), each search cached 7 days and filtered here by distance, rating,
 *  price and open now; restaurants get their city inspection grade. Without Google (quota, key, outage): grade-A restaurants
 *  from the city's inspections for food, OpenStreetMap otherwise, each with a Google Maps search link. */
const PRICE = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];
const FOOD = /restaurant|food|dinner|lunch|brunch|breakfast|pizza|sushi|ramen|taco|burger|bbq|steak|noodle|dumpling|bakery|cafe|coffee|deli|bagel|vegan|thai|italian|chinese|japanese|korean|indian|mexican|french|greek|halal|seafood|dessert|ice cream/i;
export async function searchPlaces({ what, lat, lon, km = 1, minRating = 0, maxPrice = 4, onlyOpen = false }: { what: string; lat: number; lon: number; km?: number; minRating?: number; maxPrice?: number; onlyOpen?: boolean }) {
  const q = what.trim().slice(0, 80), r = Math.min(5, Math.max(0.2, km)), maps = (name: string, address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
  const dist = (a: number, b: number) => +Math.hypot((a - lat) * 111.2, (b - lon) * 84.3).toFixed(2);
  const key = placesKey(), ck = `text:${q.toLowerCase()}|${(Math.round(lat * 400) / 400).toFixed(4)},${(Math.round(lon * 300) / 300).toFixed(4)}|${r}`;
  let found: any[] | null = null;
  if (key) {
    const pdb = pdbOpen(), hit = pdb.prepare("select v from cache where k = ? and at > ?").get(ck, Date.now() / 1000 - 7 * 86400) as { v: string } | undefined;
    if (hit) found = JSON.parse(hit.v);
    else if (spendPlaces("text")) {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", "X-Goog-Api-Key": key, Referer: "https://ihor.sh/", "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.primaryTypeDisplayName,places.regularOpeningHours,places.businessStatus" },
        body: JSON.stringify({ textQuery: q, pageSize: 20, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: r * 1000 } } }) }).catch(() => null);
      if (res?.ok) {
        found = ((await res.json()).places ?? []).filter((p: any) => p.location && p.businessStatus !== "CLOSED_PERMANENTLY").map((p: any) => ({ name: p.displayName?.text ?? "", kind: p.primaryTypeDisplayName?.text ?? "", address: (p.formattedAddress ?? "").replace(/, USA$/, ""),
          lat: p.location.latitude, lon: p.location.longitude, rating: p.rating ?? null, reviews: p.userRatingCount ?? 0, price: p.priceLevel ? PRICE.indexOf(p.priceLevel) : null, website: p.websiteUri ?? "", phone: p.nationalPhoneNumber ?? "",
          googleMaps: p.googleMapsUri, periods: p.regularOpeningHours?.periods ?? null, week: p.regularOpeningHours?.weekdayDescriptions ?? null, closedForNow: p.businessStatus === "CLOSED_TEMPORARILY" }));
        pdb.prepare("insert or replace into cache values (?, ?, ?)").run(ck, Math.floor(Date.now() / 1000), JSON.stringify(found));
      }
    }
  }
  if (found) {
    const dow = (new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay() + 6) % 7;
    let list = found.map(({ periods, week, ...p }) => ({ ...p, km: dist(p.lat, p.lon), open: p.closedForNow ? false : openNow(periods), today: week?.[dow]?.replace(/^[A-Za-z]+:\s*/, "") ?? "" }))
      .filter((p) => p.km <= r * 1.3 && (p.rating ?? 0) >= minRating && (p.price == null || p.price <= maxPrice) && (!onlyOpen || p.open !== false));
    // food: grade A on the city's latest inspection (one query for the area), matched by name within 150 m
    if (FOOD.test(q)) { const a = await restaurantsNear(lat, lon, r * 1300).catch(() => []), k = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
      for (const p of list) if (a.some((x: any) => k(x.name) === k(p.name) && Math.hypot((x.lat - p.lat) * 111.2, (x.lon - p.lon) * 84.3) <= 0.15)) (p as any).grade = "A"; }
    return { source: "Google Maps", results: list.slice(0, 10) };
  }
  // no Google: the city's grade-A restaurants for food, OpenStreetMap for everything else
  if (FOOD.test(q)) {
    // the city files restaurants by cuisine: a dish is looked up as its cuisine too
    const DISH: Record<string, string> = { ramen: "japanese", sushi: "japanese", udon: "japanese", taco: "mexican", burrito: "mexican", dumpling: "chinese", "dim sum": "chinese", curry: "indian", pho: "vietnamese", banh: "vietnamese", falafel: "middle eastern", shawarma: "middle eastern", bbq: "barbecue", burger: "hamburgers", bagel: "bagels", espresso: "coffee", brunch: "american" };
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !/restaurant|food|dinner|lunch|place|good|best|cheap/.test(w)).flatMap((w) => [w, ...((DISH[w] ?? DISH[w.replace(/s$/, "")]) ? [DISH[w] ?? DISH[w.replace(/s$/, "")]] : [])]);
    const list = (await restaurantsNear(lat, lon, r * 1000).catch(() => [])).filter((x: any) => !words.length || words.some((w) => `${x.cuisine} ${x.name}`.toLowerCase().includes(w)));
    if (list.length) return { source: "NYC restaurant inspections (grade A); Google's details aren't available right now", results: list.slice(0, 10).map((x: any) => ({ name: x.name, kind: x.cuisine, address: x.address, lat: x.lat, lon: x.lon, km: +(x.m / 1000).toFixed(2), grade: "A", googleMaps: maps(x.name, x.address) })) };
  }
  const d = await json(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lon}&limit=25&lang=en&bbox=-74.26,40.49,-73.69,40.92`).catch(() => null);
  const list = ((d?.features ?? []) as any[]).map((f) => ({ name: f.properties.name, kind: String(f.properties.osm_value ?? "").replace(/_/g, " "), address: [f.properties.housenumber, f.properties.street].filter(Boolean).join(" "), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
    .filter((x) => x.name).map((x) => ({ ...x, km: dist(x.lat, x.lon), googleMaps: maps(x.name, x.address) })).filter((x) => x.km <= r * 1.3).sort((a, b) => a.km - b.km);
  return { source: "OpenStreetMap; Google's details aren't available right now", results: list.slice(0, 10) };
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
const soda = (params: Record<string, string>, resourceId = "43nn-pn8j") => {
  const auth = env("SOCRATA_KEY_ID") ? { Authorization: "Basic " + Buffer.from(`${env("SOCRATA_KEY_ID")}:${env("SOCRATA_KEY_SECRET")}`).toString("base64") } : {};
  return json(`https://data.cityofnewyork.us/resource/${resourceId}.json?${new URLSearchParams(params)}`, auth);
};
const soql = (s: string) => s.replace(/'/g, "''");

/** Restaurants whose name matches `name` (one row per restaurant, with its latest inspection). */
/** Restaurants whose name matches; with `near`, the 40 closest to that point (nearest first), else the 40 inspected most recently. */
export async function findRestaurants(name: string, borough = "", near?: { lat: number; lon: number }) {
  const where = [`upper(dba) like '%${soql(name.toUpperCase())}%'`, "latitude IS NOT NULL", "latitude > 0", borough && `upper(boro) = '${soql(borough.toUpperCase())}'`].filter(Boolean).join(" AND ");
  // squared flat-earth distance (a degree of longitude is 0.76 of a degree of latitude here): enough to rank by
  const dist = near && `(max(latitude) - ${near.lat}) * (max(latitude) - ${near.lat}) + (max(longitude) - ${near.lon}) * (max(longitude) - ${near.lon}) * 0.58`;
  const rows: any[] = await soda({
    $select: "camis, dba, boro, building, street, zipcode, cuisine_description, max(inspection_date) as last, max(latitude) as lat, max(longitude) as lon",
    $where: where, $group: "camis, dba, boro, building, street, zipcode, cuisine_description", $order: dist ? `${dist} ASC` : "last DESC", $limit: "40",
  });
  const km = (r: any) => (near ? +(Math.hypot((r.lat - near.lat) * 111.2, (r.lon - near.lon) * 84.3)).toFixed(2) : undefined);
  return rows.map((r) => ({ camis: r.camis, name: r.dba, cuisine: r.cuisine_description, address: `${r.building ?? ""} ${r.street ?? ""}, ${r.boro} ${r.zipcode ?? ""}`.trim(), lat: Number(r.lat), lon: Number(r.lon), km: km({ lat: Number(r.lat), lon: Number(r.lon) }), lastInspection: r.last?.slice(0, 10) }));
}

/** Restaurants within ~`m` meters of a point whose latest graded inspection is an A (the city's data, last two years). */
export async function restaurantsNear(lat: number, lon: number, m = 600) {
  const dLat = m / 111_200, dLon = m / (111_200 * Math.cos((lat * Math.PI) / 180)), since = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const rows: any[] = await soda({ $select: "camis, dba, cuisine_description, building, street, boro, grade, inspection_date, latitude, longitude",
    $where: `latitude between ${lat - dLat} and ${lat + dLat} and longitude between ${lon - dLon} and ${lon + dLon} and grade in ('A','B','C') and inspection_date > '${since}'`, $order: "inspection_date DESC", $limit: "800" });
  const latest = new Map<string, any>();
  for (const r of rows) if (!latest.has(r.camis)) latest.set(r.camis, r); // newest graded inspection per restaurant
  return [...latest.values()].filter((r) => r.grade === "A").map((r) => ({ camis: r.camis, name: r.dba, cuisine: r.cuisine_description, address: `${r.building ?? ""} ${r.street ?? ""}, ${r.boro}`.trim(), lat: +r.latitude, lon: +r.longitude, graded: r.inspection_date.slice(0, 10),
    m: Math.round(Math.hypot((+r.latitude - lat) * 111_200, (+r.longitude - lon) * 111_200 * Math.cos((lat * Math.PI) / 180))) })).sort((a, b) => a.m - b.m);
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
/** NYC DOT traffic cameras (webcams.nyctmc.org): id, name, area, lat/lon, live JPEG URL, plus NYSDOT's live video, the
 *  YouTube streams and windy.com's webcams. Every one has a still `image` (✨ upscaling and the AI lessons read it). Cached 10 min. */
// One load at a time (the first takes ~20 s); while a stale list reloads, callers get the stale one.
let camsLoading: Promise<any[]> | null = null;
export async function trafficCameras() {
  if (!cams || cams.at < Date.now() - 10 * 60_000) camsLoading ??= (async () => {
    const [rows, video, yt, windy] = await Promise.all([json("https://webcams.nyctmc.org/api/cameras") as Promise<any[]>, nysdotVideo().catch(() => []), youtubeLive(), windyWebcams().catch(() => [])]);
    cams = { at: Date.now(), list: [...rows.filter((c) => c.isOnline === "true" || c.isOnline === true)
      .map((c) => ({ id: c.id, name: c.name, area: c.area, lat: c.latitude, lon: c.longitude, image: c.imageUrl })), ...video, ...yt, ...windy] };
    return cams.list;
  })().finally(() => (camsLoading = null));
  return cams?.list ?? camsLoading!;
}
/** NYSDOT's live video cameras around the city (511NY's map feed, no key): expressway HLS streams the page plays itself,
 *  most 352×240 but ~90 at 512–1920 px wide, each with a full-size still refreshed every couple of minutes. */
async function nysdotVideo() {
  const d = await json("https://api-511x-nysdot.carsprogram.org/cameras/map-features");
  const list = (d.features as any[]).flatMap((f) => {
    const [lon, lat] = f.geometry.coordinates, v = f.properties.views?.find((v: any) => v.type !== "STILL_IMAGE" && !v.broken);
    return v && inNyc(lat, lon) ? [{ id: `n${f.properties.id}`, name: f.properties.name, area: "", lat, lon, image: v.videoPreviewUrl, video: v.url, source: "511NY", page: "https://511ny.org/" }] : [];
  });
  // Each stream is checked: its size (the map badges the sharp ones) and that it's live (its segment list answers and
  // moves on between checks). New streams are checked before they're listed; known ones again in the background.
  await probeStreams(list.filter((c) => !streams.has(c.video)).map((c) => c.video));
  if (Date.now() - probedAt > 9 * 60_000) { probedAt = Date.now(); probeStreams(list.map((c) => c.video)).catch(() => {}); }
  return list.filter((c) => streamUp(c.video)).map((c) => { const { w, h } = streams.get(c.video) ?? {}; return { ...c, w, h }; });
}
/** A stream is listed unless its last two checks failed, or it failed its only check. */
const streams = new Map<string, { w?: number; h?: number; seq?: number; bad: number; ok: boolean }>();
let probedAt = Date.now();
export const streamUp = (url: string) => { const s = streams.get(url); return !s || !(s.bad >= 2 || (s.bad >= 1 && !s.ok)); };
/** The master playlist (sizes), then its segment list: segments listed, and a media sequence that moved since last time. */
export async function probeStreams(urls: string[]) {
  let i = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (i < urls.length) {
      const url = urls[i++], prev = streams.get(url);
      try {
        const master = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).text(), sizes = [...master.matchAll(/RESOLUTION=(\d+)x(\d+)/g)].map((m) => ({ w: +m[1], h: +m[2] })).sort((a, b) => b.h - a.h);
        const chunk = master.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim();
        if (!chunk) throw new Error("no stream in the playlist");
        const list = await (await fetch(new URL(chunk, url), { signal: AbortSignal.timeout(6000) })).text(), seq = Number(list.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]);
        if (!/^[^#\s].*\.ts/m.test(list)) throw new Error("no segments");
        if (prev?.seq != null && seq === prev.seq) throw new Error("frozen"); // the same segments as ~10 minutes ago
        streams.set(url, { ...sizes[0], seq, bad: 0, ok: true });
      } catch { streams.set(url, { ...prev, bad: (prev?.bad ?? 0) + 1, ok: prev?.ok ?? false }); }
    }
  }));
}
// 24/7 YouTube streams of the city, pinned at the camera ("from …") or at what it shows. An id dies when its owner
// restarts the stream, so only the ones live now are listed (checked every 6 h); swap in the new id when one drops out.
const YOUTUBE: [string, string, number, number][] = [
  ["tErYxn2UM5Y", "Brooklyn Bridge (EarthCam)", 40.7061, -73.9969],
  ["1kvGNR_A3DY", "Brooklyn Bridge, Lower Manhattan & the harbor from St. George Tower", 40.6976, -73.9937],
  ["obqnslJKrxc", "East River & both skylines over the Navy Yard, 4K", 40.702, -73.969],
  ["o5Ie_LpZ9uk", "Statue of Liberty (EarthCam)", 40.6892, -74.0445],
  ["ZYQlLQHz2Mg", "9/11 Memorial & Museum (EarthCam)", 40.7115, -74.0134],
  ["5C9oM7C2Q9k", "World Trade Center from Jersey City (EarthCam)", 40.7163, -74.0331],
  ["sixP_dAJ8D4", "Midtown skyline from Weehawken (EarthCam)", 40.7585, -74.0257],
];
let ytLive: { at: number; list: any[] } | null = null;
async function youtubeLive() {
  if (!ytLive || ytLive.at < Date.now() - 6 * 3600_000) {
    // live now, and its sharpest quality (the page lists them: "1080p", "2160p"…)
    const now = await Promise.all(YOUTUBE.map(([id]) => fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { "accept-language": "en" }, signal: AbortSignal.timeout(10_000) })
      .then((r) => r.text()).then((t) => ({ live: t.includes('"isLiveNow":true'), h: Math.max(0, ...[...t.matchAll(/"qualityLabel":"(\d+)p/g)].map((m) => +m[1])) || undefined }))
      .catch(() => ({ live: true, h: undefined })))); // couldn't tell: keep it
    YOUTUBE.forEach(([id, name], i) => now[i].live || console.warn(`cameras: YouTube ${id} (${name}) isn't live; find its new id`));
    ytLive = { at: Date.now(), list: YOUTUBE.flatMap(([id, name, lat, lon], i) => now[i].live ? [{ id: `y${id}`, name, area: "", lat, lon, h: now[i].h,
      image: `https://i.ytimg.com/vi/${id}/maxresdefault_live.jpg`, youtube: id, source: "YouTube", page: `https://www.youtube.com/watch?v=${id}` }] : []) };
  }
  return ytLive.list;
}
/** The camera list as last fetched, without waiting (empty right after a restart, while trafficCameras checks the streams). */
export const camerasNow = () => { if (!cams) trafficCameras().catch(() => {}); return cams?.list ?? []; };
/** Webcams elsewhere (the map looking outside NYC): windy.com's within 60 km of a point on a 0.5° grid, cached 30 min. */
const away = new Map<string, { at: number; list: any[] }>();
export async function webcamsNear(lat: number, lon: number) {
  const la = Math.round(lat * 2) / 2, lo = Math.round(lon * 2) / 2, k = `${la},${lo}`, hit = away.get(k);
  if (hit && hit.at > Date.now() - 30 * 60_000) return hit.list;
  if (away.size > 200) away.clear();
  const list = await windyWebcams(la, lo);
  away.set(k, { at: Date.now(), list });
  return list;
}
/** Public webcams within 60 km from windy.com (key WINDY_WEBCAMS_KEY): skyline, harbor and street views. Their stills
 *  change every few minutes, so the map refreshes them once a minute; windy.com asks for a link back to each camera. */
export async function windyWebcams(lat = 40.73, lon = -73.95) {
  const key = env("WINDY_WEBCAMS_KEY");
  if (!key) return [];
  const d = await json(`https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lon},60&limit=50&include=location,images,urls`, { "x-windy-api-key": key });
  return (d.webcams as any[]).filter((w) => w.status === "active" && w.images?.current?.preview).map((w) => ({
    id: `w${w.webcamId}`, name: w.title, area: w.location?.city ?? "", lat: w.location.latitude, lon: w.location.longitude,
    image: w.images.current.preview, source: "windy.com", page: w.urls?.detail ?? `https://windy.com/webcams/${w.webcamId}`, refreshMs: 60_000,
  }));
}

// ---------- public restrooms (NYC Open Data i7jb-7jku: parks, libraries, transit and other city-run restrooms) ----------
let restrooms: { at: number; list: any[] } | null = null;
export async function publicRestrooms() {
  if (!restrooms || restrooms.at < Date.now() - 24 * 3600_000) {
    const rows = (await json("https://data.cityofnewyork.us/resource/i7jb-7jku.json?$limit=5000")) as any[];
    restrooms = { at: Date.now(), list: rows.filter((r) => Number(r.latitude) && Number(r.longitude)).map((r) => ({
      name: r.facility_name ?? "", type: r.location_type ?? "", operator: r.operator ?? "", status: r.status ?? "", open: r.open ?? "", hours: r.hours_of_operation ?? "",
      accessibility: r.accessibility ?? "", kind: r.restroom_type ?? "", changing: /yes/i.test(r.changing_stations ?? ""), website: r.website ?? "", lat: +Number(r.latitude).toFixed(5), lon: +Number(r.longitude).toFixed(5),
    })) };
  }
  return restrooms.list;
}

// ---------- privately owned public spaces (City Planning's APOPS, Open Data rvih-nhyn): plazas, atriums, arcades ----------
let pops: { at: number; list: any[] } | null = null;
export async function publicSpaces() {
  if (!pops || pops.at < Date.now() - 24 * 3600_000) {
    const rows = (await json("https://data.cityofnewyork.us/resource/rvih-nhyn.json?$limit=1000")) as any[];
    pops = { at: Date.now(), list: rows.filter((r) => Number(r.latitude) && Number(r.longitude)).map((r) => ({
      id: r.pops_number, name: r.building_name || `${r.address_number ?? ""} ${titleCase(r.street_name ?? "")}`.trim(), address: `${r.address_number ?? ""} ${titleCase(r.street_name ?? "")}, ${r.borough_name ?? ""}`.trim(),
      type: r.public_space_type ?? "", indoor: /atrium|arcade|covered|indoor/i.test(r.public_space_type ?? ""), hours: r.hour_of_access_required ?? "", amenities: r.amenities_required && r.amenities_required !== "None" ? r.amenities_required : "",
      size: r.size_required ?? "", accessible: r.physically_disabled ?? "", lat: +Number(r.latitude).toFixed(5), lon: +Number(r.longitude).toFixed(5), url: `https://apops.mas.org/pops/${String(r.pops_number ?? "").toLowerCase()}/`,
    })) };
  }
  return pops.list;
}

// ---------- one building: its conditions from city records, and who owns it (JustFix's Who Owns What) ----------
/** Who Owns What: the building's owners on the HPD registration, rent-stabilized units, evictions, and the landlord's portfolio. */
async function whoOwns(bbl: string) {
  const W = "https://wow-django.herokuapp.com/api/address", b = bbl[0], block = bbl.slice(1, 6), lot = bbl.slice(6);
  const [one, all] = await Promise.all([json(`${W}?borough=${b}&block=${block}&lot=${lot}`), json(`${W}/aggregate?bbl=${bbl}`)]);
  const me = (one.addrs ?? []).find((x: any) => x.bbl === bbl), agg = all.result?.[0];
  if (!me && !agg) return null;
  return { owners: (me?.ownernames ?? []).map((o: any) => `${o.value} (${o.title.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()})`), companies: me?.corpnames ?? [],
    rentStabilizedUnits: me?.rsunitslatest ?? null, rentStabilizedYear: me?.rsunitslatestyear ?? null, evictions: me?.evictions ?? null,
    portfolio: agg && { buildings: agg.bldgs, units: agg.units, openViolations: agg.totalopenviolations, openViolationsPerUnit: agg.openviolationsperresunit, evictions: agg.totalevictions, rentStabilizedChange: agg.totalrsdiff, topOwners: agg.topowners?.slice(0, 4) ?? [] } };
}
/** What an HPD violation orders fixed, without the code sections it cites: "§ 27-2031 ADM CODE PROVIDE HOT WATER … LOCATED AT APT 21B, …"
 *  → "Provide hot water …" (the apartment is its own field). */
const VIOLATION_REF = /^(§.*|[\d(][\w.\-(),/;:§]*|SECTION|SEC\.?|HMC-?[,:;.]?|ADM(IN)?\.?|CODE[,:;.]?|RCNY[,:;.]?|MDL[,:;.]?|M\/D|LAW[,:;.]?|NYC|FIRE|AND|&|-|[A-Z]\)[,:;]?|D\.C\.?|RULES?)$/i;
export function plainViolation(s: string) {
  const w = s.trim().split(/\s+/);
  let i = 0;
  while (i < w.length - 1 && VIOLATION_REF.test(w[i])) i++;
  const t = w.slice(i).join(" ").replace(/^[-:\s]+/, "").split(/\s+(?:IN THE [A-Z ]+? )?LOCATED AT\s/i)[0];
  return t.charAt(0) + t.slice(1).toLowerCase();
}
/** One building by address: HPD's open violations by class and a year of tenant complaints, DOB's active complaints, the latest
 *  rat inspections, PLUTO's basics, and its owner and landlord portfolio (Who Owns What), with links to each source. */
export async function buildingReport(input: string) {
  const a: any = await addressInfo(input);
  const bbl = String(a["BBL (tax lot)"] ?? "").replace(/\D/g, ""), bin = String(a["BIN (building)"] ?? "").replace(/\D/g, "");
  if (!a.found || bbl.length !== 10) return { input, found: false };
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), q = (id: string, p: Record<string, string>) => soda(p, id).catch(() => null);
  const [hpd, complaints, dob, rats, pluto, wow, openList, complaintList, bedbugs, cases, aep] = await Promise.all([
    q("wvxf-dwi5", { $select: "class, count(*) as n", $where: `bbl='${bbl}' AND violationstatus='Open'`, $group: "class" }),
    q("ygpa-z7cr", { $select: "major_category, count(*) as n", $where: `bbl='${bbl}' AND received_date > '${yearAgo}'`, $group: "major_category", $order: "n DESC", $limit: "6" }),
    /^\d{7}$/.test(bin) && !/^\d000000$/.test(bin) ? q("eabe-havv", { $select: "count(*) as n", $where: `bin='${bin}' AND status='ACTIVE'` }) : null,
    q("p937-wjvj", { $select: "result, inspection_date", $where: `bbl='${bbl}' AND inspection_date > '${new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10)}'`, $order: "inspection_date DESC", $limit: "50" }),
    q("64uk-42ks", { $select: "yearbuilt, unitsres, unitstotal, numfloors, ownername, bldgclass", bbl }),
    whoOwns(bbl).catch(() => null),
    // the details behind the counts: what each open violation orders fixed, each complaint and what HPD found
    q("wvxf-dwi5", { $select: "class, novdescription, apartment, story, inspectiondate, originalcorrectbydate, currentstatus", $where: `bbl='${bbl}' AND violationstatus='Open'`, $order: "inspectiondate DESC", $limit: "200" }),
    q("ygpa-z7cr", { $select: "received_date, apartment, type, major_category, minor_category, problem_code, complaint_status, status_description", $where: `bbl='${bbl}' AND received_date > '${yearAgo}'`, $order: "received_date DESC", $limit: "40" }),
    q("wz6d-d3jb", { $select: "filing_date, filing_period_start_date, filling_period_end_date, of_dwelling_units, infested_dwelling_unit_count, eradicated_unit_count, re_infested_dwelling_unit", bbl, $order: "filing_date DESC", $limit: "6" }),
    q("59kj-x8nc", { $select: "casetype, caseopendate, casestatus, casejudgement", bbl, $order: "caseopendate DESC", $limit: "20" }),
    q("hcir-3275", { $select: "aep_start_date, current_status, discharge_date, of_b_c_violations_at_start", bbl, $order: "aep_start_date DESC", $limit: "1" }),
  ]);
  const day = (t: any) => (t ? String(t).slice(0, 10) : null), lower = (t: any) => (t ? String(t).charAt(0) + String(t).slice(1).toLowerCase() : "");
  // bedbug filings: owners report each year (Nov–Oct) how many units had bedbugs; one filing per building, so a lot with several buildings has several a year
  const bb = (bedbugs ?? []).map((r: any) => ({ filed: day(r.filing_date), from: day(r.filing_period_start_date), to: day(r.filling_period_end_date), units: +r.of_dwelling_units || 0, infested: +r.infested_dwelling_unit_count || 0, eradicated: +r.eradicated_unit_count || 0, reinfested: +r.re_infested_dwelling_unit || 0 }));
  const byClass = Object.fromEntries((hpd ?? []).map((r: any) => [r.class, +r.n])), p = pluto?.[0], block = +bbl.slice(1, 6), lot = +bbl.slice(6);
  return { found: true, address: a.address, bbl, bin, neighborhood: a.neighborhood, councilDistrict: a["council district"] ?? null,
    building: p && { yearBuilt: +p.yearbuilt || null, floors: Math.round(+p.numfloors) || null, residentialUnits: +p.unitsres || 0, totalUnits: +p.unitstotal || 0, ownerOnTaxRolls: p.ownername ?? "" },
    hpdOpenViolations: hpd && { total: Object.values(byClass).reduce((x: number, y: any) => x + y, 0), immediatelyHazardousC: byClass.C ?? 0, hazardousB: byClass.B ?? 0, nonHazardousA: byClass.A ?? 0, ordersI: byClass.I ?? 0 },
    tenantComplaintsLastYear: complaints && complaints.map((r: any) => ({ kind: r.major_category, n: +r.n })),
    dobActiveComplaints: dob ? +dob[0]?.n || 0 : null,
    // baiting visits follow a failed inspection: the latest real inspection says more
    rats: rats && { latest: ((r) => r && { date: String(r.inspection_date).slice(0, 10), result: r.result })(rats.find((r: any) => !/bait|clean ?up/i.test(r.result))), failedForRatsIn2Years: rats.filter((r: any) => /rat activity/i.test(r.result)).length },
    // C (immediately hazardous) first, then B, the orders (I: vacate orders, programs), A; newest first within each; 40 at most
    openViolations: openList && openList.sort((x: any, y: any) => "CBIA".indexOf(x.class) - "CBIA".indexOf(y.class)).slice(0, 40).map((r: any) => ({ cls: r.class, what: plainViolation(r.novdescription ?? ""), apt: r.apartment || null, story: r.story || null, inspected: day(r.inspectiondate), correctBy: day(r.originalcorrectbydate), status: /^NOV SENT/.test(r.currentstatus ?? "") ? "notice sent to the owner" : lower(r.currentstatus) })),
    complaints: complaintList && complaintList.map((r: any) => ({ at: day(r.received_date), apt: r.apartment || null, urgency: lower(r.type), kind: lower(r.major_category), what: lower([r.minor_category, r.problem_code].filter(Boolean).join(": ")), status: r.complaint_status === "CLOSE" ? "closed" : lower(r.complaint_status), found: r.status_description ?? "" })),
    bedbugs: bedbugs && { latestYear: bb.filter((x) => x.to === bb[0]?.to), filings: bb.length },
    litigation: cases && cases.map((r: any) => ({ type: r.casetype, opened: day(r.caseopendate), status: lower(r.casestatus), judgement: r.casejudgement === "YES" })),
    worstBuildingsProgram: aep?.[0] ? { since: day(aep[0].aep_start_date), status: aep[0].current_status, discharged: day(aep[0].discharge_date), bcViolationsAtStart: +aep[0].of_b_c_violations_at_start || 0 } : null,
    whoOwnsWhat: wow,
    links: { whoOwnsWhat: `https://whoownswhat.justfix.org/en/bbl/${bbl}`, hpdOnline: "https://hpdonline.nyc.gov/hpdonline/", dobBis: /^\d{7}$/.test(bin) ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?bin=${bin}` : null,
      acris: `https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=${bbl[0]}&block=${block}&lot=${lot}`, council: a["council district"] ? `https://council.nyc.gov/district-${+a["council district"]}/` : null },
    sources: "HPD violations, complaints, bedbug filings and housing court cases, DOB, DOHMH rodent inspections and PLUTO on NYC Open Data (updated daily); owners and portfolios from JustFix's Who Owns What (HPD registrations)" };
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
  // link_points is text that the feed cuts off mid-number ("-7", "40.76408,0", "-73"): keep only points inside the
  // city, and break a road into pieces where two points are far apart, or the map draws lines across neighborhoods.
  const inCity = (p: number[]) => p.length === 2 && p[0] > 40.45 && p[0] < 40.95 && p[1] > -74.3 && p[1] < -73.65;
  const links = [...byLink.values()].map((r) => {
    const points = String(r.link_points ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number)).filter(inCity) as [number, number][];
    const segments: [number, number][][] = [];
    points.forEach((p, i) => {
      const q = points[i - 1], gap = q ? Math.hypot((p[0] - q[0]) * 111, (p[1] - q[1]) * 84) : Infinity; // km
      if (gap > 1.5) segments.push([]);
      segments.at(-1)!.push(p);
    });
    return { id: r.link_id, name: r.link_name, borough: r.borough, mph: Number(r.speed), ok: r.status !== "-101" && Number(r.speed) > 0,
      points, segments: segments.filter((g) => g.length > 1) };
  }).filter((l) => l.segments.length);
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
export async function suggest(text: string, near?: { lat: number; lon: number }) {
  if (text.trim().length < 2) return [];
  if (near && !inNyc(near.lat, near.lon)) { // looking elsewhere: OpenStreetMap places, nearest that view first
    const d = await json(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&lang=en&lat=${near.lat}&lon=${near.lon}`).catch(() => null);
    return ((d?.features ?? []) as any[]).map((f) => { const q = f.properties, street = [q.housenumber, q.street].filter(Boolean).join(" ");
      return { name: q.name ?? street, detail: [q.name ? street : null, q.city ?? q.county, q.state ?? q.country].filter(Boolean).join(", "), kind: String(q.osm_value ?? "").replace(/_/g, " "), lon: f.geometry.coordinates[0] as number, lat: f.geometry.coordinates[1] as number }; });
  }
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
export async function tripPlan(from: string, to: string, mode: keyof typeof COSTING | "transit" = "drive", { avoidFerries = false, via = [] as string[], accessible = false } = {}) {
  const names = [from, ...via.slice(0, 6), to], found = await Promise.all(names.map(geocode));
  const missing = found.findIndex((p) => !p);
  if (missing >= 0) return { error: `Couldn't find ${names[missing]} in NYC.` };
  const pts = found as Place[], a = pts[0], b = pts[pts.length - 1], stops = pts.slice(1, -1);
  if (mode === "transit") return stops.length ? transitWithStops(pts, accessible) : transitPlan(a, b, undefined, accessible);
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
async function transitWithStops(pts: Place[], accessible = false) {
  const parts: any[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d: any = await transitPlan(pts[i - 1], pts[i], parts.at(-1)?.arrive, accessible);
    if (d.error) return { error: `${pts[i - 1].label} → ${pts[i].label}: ${d.error}` };
    const o = d.options[0];
    o.legs.at(-1).stopAfter = i < pts.length - 1 ? pts[i].label : undefined;
    parts.push(o);
  }
  const depart = parts[0].depart, arrive = parts.at(-1).arrive;
  return { from: pts[0], to: pts.at(-1), stops: pts.slice(1, -1), mode: "transit", source: "Transitous (MTA schedules and live updates)",
    options: [{ minutes: Math.round((Date.parse(arrive) - Date.parse(depart)) / 60000), transfers: parts.reduce((t, o) => t + o.transfers, 0), depart, arrive, later: [],
      walkMinutes: parts.reduce((t, o) => t + o.walkMinutes, 0), waitMinutes: parts.reduce((t, o) => t + o.waitMinutes, 0), legs: parts.flatMap((o) => o.legs) }] };
}

/** MTA subway and bus stops within `km` of a point, nearest first (Transitous's stop map), one per name. */
async function stopsNear(p: Place, km = 1.5) {
  const dLat = km / 111.32, dLon = dLat / Math.cos((p.lat * Math.PI) / 180), k = Math.PI / 180;
  const r = await fetch(`https://api.transitous.org/api/v1/map/stops?min=${p.lat - dLat},${p.lon - dLon}&max=${p.lat + dLat},${p.lon + dLon}`,
    { headers: { "user-agent": "ihor.sh trip planner (+https://ihor.sh/nyc/)" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const list: any[] = r?.ok ? await r.json() : [], seen = new Set<string>();
  return list.filter((x) => /MTA/.test(x.stopId ?? "") && (x.modes ?? []).some((m: string) => m === "SUBWAY" || m === "BUS"))
    .map((x) => ({ label: titleCase(String(x.name)), lat: +x.lat, lon: +x.lon, m: Math.hypot((x.lon - p.lon) * k * Math.cos(p.lat * k), (x.lat - p.lat) * k) * 6371e3 }))
    .filter((x) => x.m <= km * 1000).sort((x, y) => x.m - y.m).filter((x) => !seen.has(x.label) && seen.add(x.label));
}
/** No route at all, usually because one end can't be walked to (a bridge or highway, a pier, a rail yard): the same
 *  trip to the nearest stops that work around that end, and how far short of it they leave you. */
async function transitNearby(a: Place, b: Place, leaveAt?: string, accessible = false) {
  for (const end of ["to", "from"] as const) {
    const p = end === "to" ? b : a, stops = (await stopsNear(p)).slice(0, 4);
    const tries = await Promise.all(stops.map((s) => transitPlan(end === "to" ? a : s, end === "to" ? s : b, leaveAt, accessible, false).then((d: any) => ({ s, d }))));
    const ok = tries.find((t) => !t.d.error); // nearest first
    if (ok) return { ...ok.d, from: a, to: b, short: { end, stop: ok.s.label, lat: ok.s.lat, lon: ok.s.lon, meters: Math.round(ok.s.m / 10) * 10,
      note: `No subway or bus route ${end === "to" ? "reaches" : "starts at"} ${p.label} itself (often a highway, bridge or pier with no way to walk there). This one ${end === "to" ? "gets you to" : "starts from"} ${ok.s.label}, ${ok.s.m < 1000 ? `${Math.round(ok.s.m / 10) * 10} m` : `${(ok.s.m / 1000).toFixed(1)} km`} away in a straight line.` } };
  }
  return { error: `No subway or bus route found, even to the stops within 1.5 km of either end.` };
}
async function transitPlan(a: Place, b: Place, leaveAt?: string, accessible = false, nearby = true): Promise<any> {
  const q = new URLSearchParams({ fromPlace: `${a.lat},${a.lon}`, toPlace: `${b.lat},${b.lon}`, numItineraries: "8", transitModes: "SUBWAY,BUS", directModes: "WALK" });
  if (accessible) q.set("pedestrianProfile", "WHEELCHAIR"); // step-free walking paths and stops marked wheelchair-accessible in the GTFS
  if (leaveAt) q.set("time", leaveAt);
  const r = await fetch(`https://api.transitous.org/api/v1/plan?${q}`, { headers: { "user-agent": "ihor.sh trip planner (+https://ihor.sh/nyc/)" }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) return { error: `The transit router isn't answering (${r.status}). Try again in a minute.` };
  const d = await r.json();
  // The router optimizes arrival time only, so it suggests one-stop bus hops to catch a train a minute earlier, and
  // NY Waterway's ferry shuttles. Keep MTA legs only, and rank by how simple a trip is to ride.
  const mta = (it: any) => it.legs.every((l: any) => l.mode === "WALK" || /^MTA/.test(l.agencyName ?? ""));
  const hops = (it: any) => it.legs.filter((l: any) => l.mode !== "WALK" && (l.intermediateStops?.length ?? 0) === 0 && l.duration <= 240).length;
  // Rank by when you'd arrive leaving now, not by the ride alone: a faster bus that comes in 15 minutes loses to a
  // slower train that comes in 2. Waits at transfers are inside that already (each leg keeps its scheduled times).
  const now = Date.now(), score = (it: any) => (Date.parse(it.endTime) - now) / 60000 + 4 * it.transfers + 6 * hops(it);
  const walk = (d.direct ?? []).find((x: any) => x.legs.length === 1 && x.legs[0].mode === "WALK" && x.duration <= 45 * 60);
  // The same routes at later times are one option with its next departures.
  const all = [...(walk ? [{ ...walk, transfers: 0 }] : []), ...(d.itineraries ?? []).filter(mta).map(dropHops)].sort((x, y) => Date.parse(x.startTime) - Date.parse(y.startTime));
  const groups = new Map<string, any>();
  for (const it of all) { const g = groups.get(sig(it)); if (g) g.later.push(it.startTime); else groups.set(sig(it), { ...it, later: [] }); }
  const best = [...groups.values()].sort((x, y) => score(x) - score(y)).slice(0, 4);
  const options = best.map((it: any) => ({
    minutes: Math.round(it.duration / 60), transfers: it.transfers, depart: it.startTime, arrive: it.endTime, later: (it.later ?? []).slice(0, 3),
    walkMinutes: Math.round(it.legs.filter((l: any) => l.mode === "WALK").reduce((t: number, l: any) => t + l.duration, 0) / 60),
    // standing at stops between legs (the wait before leaving home is depart − now, worked out on the page)
    waitMinutes: Math.round(it.legs.reduce((t: number, l: any, i: number) => t + (i ? Math.max(0, Date.parse(l.startTime) - Date.parse(it.legs[i - 1].endTime)) : 0), 0) / 60000),
    legs: it.legs.map((l: any) => ({
      mode: l.mode, route: l.routeShortName ?? "", color: l.routeColor ? `#${l.routeColor}` : null, text: l.routeTextColor ? `#${l.routeTextColor}` : "#ffffff",
      headsign: l.headsign ?? "", from: l.from.name, to: l.to.name, depart: l.startTime, arrive: l.endTime, minutes: Math.max(1, Math.round(l.duration / 60)),
      stops: (l.intermediateStops?.length ?? 0) + 1, realTime: !!l.realTime, estimated: !!l.estimated,
      line: (l.line ?? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6)).map(([la, lo]: number[]) => [+la.toFixed(5), +lo.toFixed(5)]),
      // "20261009_10:36_us-ny-MTA-NYCSubway_…_063600_4..S06R" → the realtime id "063600_4..S06R"; boarding stop "635S"
      ...(l.mode === "SUBWAY" && l.tripId ? { trip: l.tripId.split("_").slice(-2).join("_"), stop: String(l.from.stopId ?? "").split("_").pop(), alight: String(l.to.stopId ?? "").split("_").pop() } : {}),
    })),
  }));
  if (!options.length) return nearby ? transitNearby(a, b, leaveAt, accessible) : { error: "No subway or bus route found between those places." };
  return { from: a, to: b, mode: "transit", options, source: "Transitous (MTA schedules and live updates)" };
}

// ---------- the web ----------
/** Web search: Tavily, then Ollama's web search, then DuckDuckGo's HTML results; the first that answers with results. */
export async function webSearch(query: string) {
  const key = env("TAVILY_API_KEY");
  if (key) {
    try {
      const r = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(8_000),
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, max_results: 5 }) });
      const results = r.ok ? ((await r.json()).results ?? []) : [];
      if (results.length) return { engine: "tavily", results: results.map((x: any) => ({ title: x.title, url: x.url, snippet: String(x.content ?? "").slice(0, 400) })) };
    } catch {}
  }
  const okey = env("OLLAMA_CLOUD_KEY");
  if (okey) {
    try {
      const r = await fetch("https://ollama.com/api/web_search", { method: "POST", signal: AbortSignal.timeout(8_000),
        headers: { "content-type": "application/json", Authorization: `Bearer ${okey}` }, body: JSON.stringify({ query, max_results: 5 }) });
      const results = r.ok ? ((await r.json()).results ?? []) : [];
      if (results.length) return { engine: "ollama", results: results.map((x: any) => ({ title: x.title, url: x.url, snippet: String(x.content ?? "").replace(/\s+/g, " ").slice(0, 400) })) };
    } catch {}
  }
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "user-agent": "Mozilla/5.0 (ihor.sh Blip)" }, signal: AbortSignal.timeout(8_000) });
  const html = await r.text();
  const results = [...html.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].slice(0, 5).map(([, href, title, snippet]) => {
    const u = new URL(href.replace(/&amp;/g, "&"), "https://duckduckgo.com");
    return { title: strip(title), url: u.searchParams.get("uddg") ?? u.href, snippet: strip(snippet) };
  });
  return { engine: "duckduckgo", results };
}

// ---------- a camera's frame, read by the local Qwen (it sees images) ----------
const SEEN = {
  type: "object",
  required: ["description", "traffic_flow", "weather", "road_condition", "emergency_activity", "smoke_or_fire", "objects"],
  properties: {
    description: {
      type: "string",
      description: "Detailed 3-5 sentence description detailing vehicle/pedestrian actions, traffic flow, road surface, visibility, and any hazards or notable events."
    },
    traffic_flow: {
      type: "string",
      enum: ["clear", "light", "moderate", "heavy", "gridlock", "stopped"]
    },
    weather: {
      type: "string",
      enum: ["clear", "overcast", "rain", "fog", "snow"]
    },
    road_condition: {
      type: "string",
      enum: ["dry", "wet", "flooded", "snow_covered"]
    },
    emergency_activity: {
      type: "boolean"
    },
    smoke_or_fire: {
      type: "boolean"
    },
    objects: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "label", "action", "count"],
        properties: {
          kind: {
            type: "string",
            enum: ["car", "suv", "taxi", "bus", "truck", "bicycle", "motorcycle", "pedestrian", "emergency_vehicle", "construction", "debris", "other"]
          },
          label: { type: "string" },
          action: { type: "string" },
          count: { type: "integer" }
        }
      }
    }
  }
};
/** Several cameras in ONE call to the vision model (one turn of the model's line, so nothing else runs in between;
 *  measured with 5 cameras: 14 s in one call, 15 s in five when the model is free, minutes when other work slipped in
 *  between). Each frame comes back as fields an LLM (Blip, an MCP agent) can reason over (traffic, road, visibility,
 *  emergency vehicles, smoke or fire, what's notable, a two-sentence description, and the answer to an optional
 *  question), plus one summary line. Answers are kept only for image numbers that exist. */
const LOOK_ONE = { type: "object", required: ["image", "traffic", "road", "visibility", "emergency_vehicles", "smoke_or_fire", "notable", "description"], properties: {
  image: { type: "integer" }, traffic: { enum: ["none", "light", "moderate", "heavy", "stopped", "unclear"] }, road: { enum: ["dry", "wet", "flooded", "snow", "unclear"] },
  visibility: { enum: ["clear", "reduced", "obstructed"] }, emergency_vehicles: { type: "boolean" }, smoke_or_fire: { type: "boolean" },
  notable: { type: "string" }, description: { type: "string" }, answer: { type: "string" } } };
export type Look = { id: string; name: string; lat: number; lon: number; traffic: string; road: string; visibility: string; emergencyVehicles: boolean; smokeOrFire: boolean; notable: string; description: string; answer?: string; text: string };
export async function lookAtCameras(ids: string[], question?: string) {
  const all = await trafficCameras(), cams = ids.map((id) => all.find((c) => c.id === id)).filter(Boolean) as any[];
  const shots = (await Promise.all(cams.map(async (c) => { const r = await fetch(c.image, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    return r?.ok ? { c, img: Buffer.from(await r.arrayBuffer()).toString("base64") } : null; }))).filter(Boolean) as { c: any; img: string }[];
  if (!shots.length) return { summary: "", model: LOCAL_MODEL, looks: [] as Look[] };
  const one = question ? { ...LOOK_ONE, required: [...LOOK_ONE.required, "answer"] } : LOOK_ONE; // asked a question: every camera answers it
  const schema = { type: "object", required: ["cameras", "summary"], properties: { cameras: { type: "array", items: one }, summary: { type: "string" } } };
  const res = await fetch(`${OLLAMA}/api/chat`, { method: "POST", signal: AbortSignal.timeout(240_000), body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: false, format: schema,
    options: { num_predict: 160 * shots.length + 100, temperature: 0.2 }, messages: [{ role: "user", images: shots.map((x) => x.img),
      content: `${shots.length} live NYC traffic camera frames, in this order: ${shots.map((x, i) => `image ${i + 1} = "${x.c.name}"`).join("; ")}. For each image: traffic, road surface, visibility, whether emergency vehicles or smoke/fire are visible, notable (one sentence: anything unusual or that draws attention, like an accident, a blocked lane, flooding, a crowd or a stopped bus; or "nothing unusual"), and description (two sentences about the scene: vehicles, how traffic moves, the road, the weather and light).${question ? ` answer: ${question.slice(0, 300)}` : ""} Then summary: one sentence about all of them together. Only the scene: don't describe or identify people, faces or license plates, and don't guess the time. Say "unclear" when you can't tell.` }] }) });
  if (!res.ok) throw new Error(`vision model: HTTP ${res.status}`);
  let out: any[] = [], summary = "";
  try { const j = JSON.parse(String((await res.json()).message?.content ?? "")); out = j.cameras ?? []; summary = String(j.summary ?? "").trim(); } catch { throw new Error("the vision model's answer didn't parse"); }
  const seen = new Set<number>();
  return { summary, model: LOCAL_MODEL, looks: out.filter((x) => Number.isInteger(x.image) && x.image >= 1 && x.image <= shots.length && !seen.has(x.image) && seen.add(x.image)).map((x): Look => {
    const c = shots[x.image - 1].c, notable = String(x.notable ?? "").trim(), description = String(x.description ?? "").trim();
    return { id: c.id, name: c.name, lat: c.lat, lon: c.lon, traffic: x.traffic, road: x.road, visibility: x.visibility, emergencyVehicles: !!x.emergency_vehicles, smokeOrFire: !!x.smoke_or_fire,
      notable, description, ...(x.answer ? { answer: String(x.answer).trim() } : {}), text: x.answer ? String(x.answer).trim() : notable || description };
  }) };
}
/** What a camera shows now: structured JSON with description, traffic flow, weather, road condition, emergency activity,
 *  and detected objects (kind, label, action, count) for programmatic analysis; or the answer to one question. Never
 *  people, faces or plates; no time of day (the model guesses it wrong). The caller holds the model's line (inLine/whenIdle). */
export async function inspectCamera(id: string, question?: string) {
  const cam = (await trafficCameras()).find((c) => c.id === id);
  if (!cam) throw new Error(`No camera "${id}".`);
  const r = await fetch(cam.image, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) throw new Error(`${cam.name} didn't send a picture just now.`);
  const content = question
    ? `A live NYC traffic camera frame. ${question.slice(0, 300)} Answer in 1-2 sentences. Only the scene: don't describe or identify people, faces or license plates, and don't guess the time.`
    : "Analyze this live NYC traffic camera image. Provide a detailed 3-5 sentence description detailing vehicle and pedestrian movements, traffic flow, road conditions, and any hazards or emergency activity, along with the list of detected objects. Only describe the scene: don't describe or identify people, faces or license plates, and don't guess the time.";
  const res = await fetch(`${OLLAMA}/api/chat`, { method: "POST", signal: AbortSignal.timeout(90_000), body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: false,
    // a question gets a short answer (1-2 sentences, ~100 tokens); the full report gets the long description
    options: { num_predict: question ? 100 : 500, temperature: 0.2 }, ...(question ? {} : { format: SEEN }), messages: [
      ...(question ? [] : [{ role: "system", content: "You are an expert traffic camera vision system for New York City. Analyze the camera frame and provide a detailed, accurate JSON report strictly following the schema. In the description, provide 3 to 5 clear sentences describing the scene, movement of vehicles and pedestrians, road conditions, and any hazards. Never identify individual faces, people names, or license plates." }]),
      { role: "user", content, images: [Buffer.from(await r.arrayBuffer()).toString("base64")] }
    ] }) });
  if (!res.ok) throw new Error(`vision model: HTTP ${res.status}`);
  const raw = String((await res.json()).message?.content ?? "").trim();
  let seen: any = null;
  if (!question) {
    // an answer that doesn't parse is an error, never a made-up "moderate, clear, dry" reading (the camera checks store these)
    try { seen = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch { throw new Error("the vision model's answer didn't parse"); }
    // Backwards compatibility aliases for server/city.ts
    seen.traffic = seen.traffic_flow ?? "moderate";
    seen.road = seen.road_condition === "snow_covered" ? "snow" : (seen.road_condition ?? "dry");
    seen.emergency_vehicles = !!(seen.emergency_activity || seen.emergency_vehicles);
    seen.smoke_or_fire = !!seen.smoke_or_fire;
    seen.notes = seen.description ?? raw;
  }
  const desc = seen?.description || raw;
  return {
    id: cam.id,
    name: cam.name,
    lat: cam.lat,
    lon: cam.lon,
    seen,
    model: LOCAL_MODEL,
    text: desc,
    description: desc,
    trafficFlow: seen?.traffic_flow ?? null,
    weather: seen?.weather ?? null,
    roadCondition: seen?.road_condition ?? null,
    emergencyActivity: !!(seen?.emergency_activity || seen?.emergency_vehicles),
    smokeOrFire: !!seen?.smoke_or_fire,
    objects: Array.isArray(seen?.objects) ? seen.objects : []
  };
}
