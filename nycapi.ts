// NYC data behind the map pages and Blip's tools. Every call runs on the server, so the keys in .env
// (NYC API portal, Socrata) never reach the browser.
//   address:     NYC Planning GeoSearch (point → address) + NYC Geoclient v2 (address → districts, BBL, BIN…)
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

/** A map click: the nearest address (GeoSearch), then its Geoclient record. */
export async function pointInfo(lat: number, lon: number) {
  const d = await json(`https://geosearch.planninglabs.nyc/v2/reverse?point.lat=${lat}&point.lon=${lon}&size=1`);
  const p = d.features?.[0]?.properties;
  if (!p) return { lat, lon, found: false };
  const query = p.housenumber ? `${p.housenumber} ${p.street} ${p.borough}` : p.label;
  const info = await addressInfo(query).catch(() => ({}));
  return { lat, lon, place: p.label, ...info };
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
