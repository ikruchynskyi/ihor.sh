// Evening planner data: what's on in NYC in the next two weeks, from first-party sources only: NYC Parks' events feed,
// the city's events calendar (NYC Events API), permitted street events (parades, street fairs, markets; NYC open data),
// Ticketmaster (concerts, sports, shows, with prices), NYC for FREE's listings and museum free hours (Free NYC's rules).
// Every event keeps its source link and when we last saw it there. Refreshed daily, today's events re-checked hourly: one
// gone from its source twice (or cancelled there) is hidden. Times are New York local times as "YYYY-MM-DD HH:MM".
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cityEvents, restaurantsNear, tripPlan, webSearch, inNyc } from "./nycapi.ts";
import { annotateTrip } from "./transit.ts";
import { currentEvents } from "./events.ts";
import { corner, place, borough, loadBoroughs } from "./city.ts";
// @ts-ignore: plain JS shared with the Free NYC page
import { onDay, onDate } from "../nyc/free.js";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.EVENING_DB ?? path.join(dir, "evening.db"), { timeout: 5000 }); // wait out a reader (docker exec) instead of failing a write
db.exec(`
  create table if not exists ev (id text primary key, source text, title text, start text, "end" text, all_day int, venue text, address text, lat real, lon real,
    borough text, price_min real, price_max real, free int, category text, url text, image text, status text, outdoor int, summary text, first_seen int, last_seen int, missed int default 0, dup_of text);
  create index if not exists ev_start on ev (start);
  create table if not exists runs (at int, what text, n int, note text);
`);
const now = () => Math.floor(Date.now() / 1000);
const UA = { "user-agent": "ihor.sh evening planner (+https://ihor.sh/nyc/tonight.html)", accept: "application/json" };
const getJson = async (u: string, ms = 30_000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<any>; };
const nyDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hhmm = (s: string) => { const m = String(s ?? "").match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i); if (!m) return null; let h = +m[1]; if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0); return `${String(h).padStart(2, "0")}:${m[2]}`; };
const unent = (s: string) => String(s ?? "").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;/g, "‘").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// one set of categories for every source
const CATS: [string, RegExp][] = [["popups", /pop-?up|sample sale|activation|brand experience|store opening|launch party|giveaway|freebie/i], ["music", /music|concert|jazz|\bband\b|orchestra|\bopera\b|choir|\bdj\b|hip.?hop|\brock\b|classical/i], ["theater", /theat|broadway|musical|play\b|dance|ballet|performance/i],
  ["comedy", /comedy|stand.?up|improv/i], ["sports", /sport|basketball|baseball|football|soccer|hockey|tennis|race|run\b|marathon|wrestling|boxing/i],
  ["family", /kids|family|children|toddler|teen|youth|story ?time/i], ["outdoors", /outdoor|fitness|nature|hike|walk|bird|garden|yoga|tai chi|kayak|bike|tour/i],
  ["arts", /\barts?\b|artist|museum|exhibit|gallery|\bfilms?\b|movie|cinema|photograph/i], ["food", /food|market|tasting|wine|beer|cooking|farmers/i],
  ["talks", /talk|lecture|book|reading|workshop|class|learn|panel/i], ["community", /street fair|festival|parade|community|celebration|block party|volunteer|cleanup/i]];
// fields in the order given, and a tag list ("Film | Best for Kids | Free Summer Concerts") tag by tag: its first tag is the main one
export const category = (...txt: unknown[]) => { for (const t of txt.flatMap((x) => String(x ?? "").split(/\s*[|,;]\s*/))) { const c = CATS.find(([, re]) => re.test(t)); if (c) return c[0]; } return "other"; };

type E = { id: string; source: string; title: string; start: string; end?: string | null; allDay?: boolean; venue?: string; address?: string; lat?: number | null; lon?: number | null; borough?: string;
  priceMin?: number | null; priceMax?: number | null; free?: boolean; category: string; url: string; image?: string; status?: string; outdoor?: boolean; summary?: string };
const put = db.prepare(`insert into ev (id, source, title, start, "end", all_day, venue, address, lat, lon, borough, price_min, price_max, free, category, url, image, status, outdoor, summary, first_seen, last_seen, missed)
  values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) on conflict(id) do update set title=excluded.title, start=excluded.start, "end"=excluded."end", all_day=excluded.all_day, venue=excluded.venue,
  address=excluded.address, lat=excluded.lat, lon=excluded.lon, price_min=excluded.price_min, price_max=excluded.price_max, free=excluded.free, category=excluded.category, url=excluded.url,
  image=excluded.image, status=excluded.status, outdoor=excluded.outdoor, summary=excluded.summary, last_seen=excluded.last_seen, missed=0`);
export function save(e: E) {
  if (!e.title || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(e.start)) return false; // no clear date and time: not trustworthy
  const t = now();
  put.run(e.id, e.source, e.title.slice(0, 200), e.start, e.end ?? null, e.allDay ? 1 : 0, (e.venue ?? "").slice(0, 160), (e.address ?? "").slice(0, 200), e.lat ?? null, e.lon ?? null, e.borough ?? "",
    e.priceMin ?? null, e.priceMax ?? null, e.free ? 1 : 0, e.category, e.url, e.image ?? "", e.status ?? "ok", e.outdoor ? 1 : 0, (e.summary ?? "").slice(0, 400), t, t);
  return true;
}
/** After reading a source: its upcoming events not seen this time are one step closer to gone (two misses hide them). */
function sweep(source: string, seen: Set<string>, from: string, to: string) {
  for (const { id } of db.prepare(`select id from ev where source = ? and substr(start, 1, 10) between ? and ? and status != 'gone'`).all(source, from, to) as any[])
    if (!seen.has(id)) db.prepare("update ev set missed = missed + 1, status = case when missed + 1 >= 2 then 'gone' else status end where id = ?").run(id);
}
const run = (what: string, n: number, note = "") => db.prepare("insert into runs values (?,?,?,?)").run(now(), what, n, note);

// ---------- sources ----------
export async function fromParks() {
  const list = await getJson("https://www.nycgovparks.org/xml/events_300_rss.json", 60_000), today = nyDate(), to = addDays(today, 14), seen = new Set<string>();
  for (const e of list) {
    if (!e.startdate || e.startdate < today || e.startdate > to) continue;
    const [la, lo] = String(e.coordinates ?? "").split(",").map(Number), s = hhmm(e.starttime), id = `parks:${e.guid}`;
    if (!s) continue;
    const ok = save({ id, source: "parks", title: unent(e.title), start: `${e.startdate} ${s}`, end: hhmm(e.endtime) ? `${e.enddate || e.startdate} ${hhmm(e.endtime)}` : null, venue: unent(e.location || e.parknames), address: unent(e.parknames),
      lat: Number.isFinite(la) ? la : null, lon: Number.isFinite(lo) ? lo : null, free: true, priceMin: 0, category: category(e.categories, e.title), url: String(e.link).replace(/^http:/, "https:"), image: e.image || "",
      outdoor: !/recreation center|indoor|library|museum|nature center|arsenal/i.test(`${e.location} ${e.title}`), summary: unent(e.description).slice(0, 300) });
    if (ok) seen.add(id);
  }
  sweep("parks", seen, today, addDays(today, 3)); run("parks", seen.size); return seen.size;
}
export async function fromTicketmaster(days = 7) {
  const key = process.env.TICKETMASTER_KEY; if (!key) return 0;
  const today = nyDate(), to = addDays(today, days), seen = new Set<string>();
  const start = new Date(`${today}T04:00:00Z`).toISOString().replace(/\.\d+Z$/, "Z"), end = new Date(`${addDays(to, 1)}T06:00:00Z`).toISOString().replace(/\.\d+Z$/, "Z");
  for (let page = 0; page < 5; page++) {
    let d: any; try { d = await getJson(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&latlong=40.7484,-73.9857&radius=15&unit=miles&size=200&page=${page}&sort=date,asc&startDateTime=${start}&endDateTime=${end}`); } catch { break; }
    for (const e of d._embedded?.events ?? []) {
      const st = e.dates?.start, v = e._embedded?.venues?.[0];
      // long-running "flex admission" passes started months ago: not an evening out
      if (!st?.localDate || st.localDate < today || st.localDate > to || !st.localTime || e.dates?.spanMultipleDays || /flex admission|general admission pass|parking/i.test(e.name)) continue;
      const code = e.dates?.status?.code ?? "onsale", pr = e.priceRanges?.[0], seg = e.classifications?.[0];
      const id = `tm:${e.id}`, ok = save({ id, source: "ticketmaster", title: e.name, start: `${st.localDate} ${st.localTime.slice(0, 5)}`, venue: v?.name, address: [v?.address?.line1, v?.city?.name].filter(Boolean).join(", "),
        lat: Number(v?.location?.latitude) || null, lon: Number(v?.location?.longitude) || null, borough: v?.city?.name ?? "", priceMin: pr?.min ?? null, priceMax: pr?.max ?? null, free: false,
        category: category(seg?.segment?.name, seg?.genre?.name, e.name), url: e.url, image: e.images?.find((i: any) => i.ratio === "16_9" && i.width < 800)?.url ?? "", status: code === "cancelled" ? "cancelled" : code === "postponed" || code === "rescheduled" ? code : "ok", outdoor: /park|field|pier|beach|stadium/i.test(v?.name ?? "") });
      if (ok) seen.add(id);
    }
    if ((d.page?.totalPages ?? 1) <= page + 1) break;
  }
  sweep("ticketmaster", seen, today, addDays(today, Math.min(days, 3))); run("ticketmaster", seen.size); return seen.size;
}
export async function fromCity(days = 7) {
  const today = nyDate(), to = addDays(today, days), seen = new Set<string>();
  for (const e of await cityEvents(today, to)) {
    const s = e.start ? new Date(e.start) : null; if (!s || isNaN(+s)) continue;
    const local = s.toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16), id = `city:${e.id}`;
    const ok = save({ id, source: "city", title: e.name, start: local, end: e.end ? new Date(e.end).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16) : null, allDay: e.allDay, venue: e.place.split(" · ")[0], address: e.place.split(" · ")[1] ?? "",
      lat: e.lat, lon: e.lon, borough: (e.boroughs ?? [])[0] ?? "", free: e.free, priceMin: e.free ? 0 : null, category: category(e.categories, e.name), url: e.url, outdoor: /outdoor|park|street/i.test(`${e.categories} ${e.place}`), summary: e.summary });
    if (ok) seen.add(id);
  }
  sweep("city", seen, today, addDays(today, Math.min(days, 3))); run("city", seen.size); return seen.size;
}
// Permits that are private gatherings or upkeep, not events anyone can go to: "Celebration", "Picnic", a lawn closure, a wedding
export const PRIVATE = /^(celebration|picnic|party|barbecue|bbq|gathering|reunion|meeting|event|family (day|gathering|reunion)|get together|picnic house)s?$|private|rehearsal|filming|construction|wedding|birthday|bday|shower|anniversary|engagement|quincea|memorial service|funeral|proposal|lawn closure|meadow closure|work ?days?|\bMUTS\b/i;
const TYPES = ["Parade", "Street Event", "Street Festival", "Farmers Market", "Plaza Event", "Plaza Partner Event", "Open Street Partner Event", "Open Culture", "Single Block Festival", "Block Party", "Special Event", "Athletic Race / Tour", "Religious Event", "Sidewalk Sale"];
/** "Central Park: West Drive ,Central Park: Bow Bridge" → "Central Park, Manhattan"; a street → its first corner. */
export const permitPlace = (loc: string, boro: string) => { const first = String(loc ?? "").split(",")[0].trim(); return /:/.test(first) ? `${first.split(":")[0].trim()}, ${boro}` : corner(first, boro); };
export async function fromPermits() {
  const today = nyDate(), to = addDays(today, 14), seen = new Set<string>();
  const rows = await getJson(`https://data.cityofnewyork.us/resource/tvpp-9vvx.json?$limit=5000&$where=${encodeURIComponent(`start_date_time between '${today}T00:00:00' and '${to}T23:59:59' and event_type in (${TYPES.map((t) => `'${t}'`).join(",")})`)}`);
  for (const r of rows) {
    if (PRIVATE.test(String(r.event_name ?? "").trim())) continue;
    // a permit that spans days (the Marathon's Central Park permit runs Oct 28 – Nov 10 with setup) is one row per day under one event_id
    const pt = await place(permitPlace(r.event_location, r.event_borough)), id = `permit:${r.event_id}:${String(r.start_date_time).slice(0, 10)}`;
    const ok = save({ id, source: "permits", title: unent(r.event_name), start: String(r.start_date_time).slice(0, 16).replace("T", " "), end: String(r.end_date_time ?? "").slice(0, 16).replace("T", " ") || null,
      venue: String(r.event_location ?? "").replace(/\s+/g, " ").slice(0, 160), borough: r.event_borough, lat: pt?.lat ?? null, lon: pt?.lon ?? null, free: true, priceMin: 0, category: category(r.event_type, r.event_name),
      url: "https://www.nyc.gov/site/cecm/permitting/permitted-event-information.page", outdoor: true, summary: `${r.event_type}${r.street_closure_type && r.street_closure_type !== "N/A" ? ` · street closure: ${r.street_closure_type}` : ""}` });
    if (ok) seen.add(id);
  }
  sweep("permits", seen, today, addDays(today, 3)); run("permits", seen.size); return seen.size;
}
/** NYC for FREE's listings (archived hourly by events.ts) and museum free hours (Free NYC's checked rules). */
export function fromFree(days = 7) {
  const today = nyDate(), seen = new Set<string>(), rules = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "nyc", "free.json"), "utf8"));
  const feed = currentEvents().events as any[];
  for (let k = 0; k <= days; k++) {
    const date = addDays(today, k), day = new Date(`${date}T12:00:00`);
    for (const e of feed) { const o = onDate(e, date, day); if (!o?.start) continue;
      const id = `free:${e.slug}:${date}`, ok = save({ id, source: "nycforfree", title: e.title, start: `${date} ${o.start}`, end: o.end ? `${date} ${o.end}` : null, venue: e.address, address: e.address, lat: e.lat, lon: e.lon, borough: e.borough,
        free: true, priceMin: 0, category: category(e.category, e.title), url: e.url, summary: e.teaser, outdoor: /outdoor|park|street|plaza/i.test(`${e.category} ${e.teaser}`) });
      if (ok) seen.add(id); }
    for (const r of onDay(rules, day) as any[]) { if (!r.start || r.kind === "perk") continue;
      const id = `museum:${r.name}:${date}:${r.start}`, ok = save({ id, source: "freehours", title: `${r.name}: ${r.price === "Free" ? "free" : r.price} ${r.who ? `for ${r.who}` : "admission"}`, start: `${date} ${r.start}`, end: r.end ? `${date} ${r.end}` : null,
        venue: r.name, lat: r.lat, lon: r.lon, free: r.price === "Free", priceMin: r.price === "Free" ? 0 : null, category: "arts", url: r.url, summary: `Checked ${r.checked} on the venue's own site.`, outdoor: r.kind === "garden" });
      if (ok) seen.add(id); }
  }
  sweep("nycforfree", seen, today, addDays(today, 3)); run("free", seen.size); return seen.size;
}

const kmTo = (a: number, b: number, c: number, d: number) => { const r = Math.PI / 180, h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
// ---------- Eventbrite: its search API closed in 2019, so we keep a list of NYC organizers ----------
// Web search finds organizer pages (eventbrite.com/o/<name>-<id>); the API (EVENTBRITE_TOKEN) then lists each one's
// events, and an organizer counts as NYC while it has events at venues in the city.
db.exec("create table if not exists eb_orgs (id text primary key, name text, found int, checked int, nyc int default 0)");
const EB_TOPICS = ["comedy", "live music", "jazz", "art gallery", "book talk", "tech meetup", "networking", "dance party", "food festival", "walking tour", "workshop",
  "yoga", "film screening", "poetry", "drag show", "salsa", "kids", "market", "run club", "wine tasting", "lecture", "community", "theater", "nightlife"];
const EB_AREAS = ["New York", "Brooklyn", "Queens", "Manhattan", "Bronx"];
const ebQueries = EB_TOPICS.flatMap((t) => EB_AREAS.map((a) => `site:eventbrite.com/o ${t} ${a}`));
export const ebOrgIds = (urls: string[]) => [...new Set(urls.map((u) => u.match(/eventbrite\.[a-z.]+\/o\/[a-z0-9-]*?-(\d{6,})/i)?.[1]).filter(Boolean) as string[])];
/** A few search queries a day, taking turns through topics × boroughs (40 the first time). */
export async function ebDiscover() {
  const first = !(db.prepare("select count(*) c from eb_orgs").get() as any).c, n = first ? 40 : 6, turn = (db.prepare("select count(*) c from runs where what = 'eb-discover'").get() as any).c;
  const add = db.prepare("insert or ignore into eb_orgs (id, found) values (?, ?)");
  let added = 0;
  for (let i = 0; i < n; i++) {
    const r: any = await webSearch(ebQueries[(turn * n + i) % ebQueries.length]).catch(() => null);
    for (const id of ebOrgIds((r?.results ?? []).map((x: any) => x.url))) added += Number(add.run(id, now()).changes);
  }
  run("eb-discover", added); return added;
}
// Eventbrite's own categories (/v3/categories, /v3/subcategories) where they name one of ours; Arts and Other fall back to the text
const EB_SUB: Record<string, string> = { "4007": "comedy", "5010": "comedy", "5001": "theater", "5002": "theater", "5003": "theater", "5004": "theater", "5005": "music", "5006": "music", "5009": "talks" };
const EB_CAT: Record<string, string> = { "103": "music", "110": "food", "108": "sports", "102": "talks", "101": "talks", "115": "family", "109": "outdoors", "113": "community", "111": "community", "104": "arts" };
/** One Eventbrite event (expand=venue,ticket_availability) in our shape, or null when it isn't a dated NYC event. */
export function ebEvent(e: any): E | null {
  const v = e.venue ?? {}, lat = Number(v.latitude), lon = Number(v.longitude), start = String(e.start?.local ?? "").replace("T", " ").slice(0, 16);
  if (e.online_event || !Number.isFinite(lat) || !Number.isFinite(lon) || !inNyc(lat, lon) || !borough(lat, lon) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(start)) return null;
  const min = e.ticket_availability?.minimum_ticket_price?.major_value, title = String(e.name?.text ?? "").trim(), summary = String(e.summary ?? "").trim();
  return { id: `eb:${e.id}`, source: "eventbrite", title, start, end: String(e.end?.local ?? "").replace("T", " ").slice(0, 16) || null, venue: v.name ?? "", address: v.address?.localized_address_display ?? "",
    lat, lon, borough: borough(lat, lon) ?? "", free: !!e.is_free, priceMin: e.is_free ? 0 : min != null ? Number(min) : null, priceMax: e.ticket_availability?.maximum_ticket_price?.major_value != null ? Number(e.ticket_availability.maximum_ticket_price.major_value) : null,
    category: EB_SUB[e.subcategory_id] ?? EB_CAT[e.category_id] ?? category(title, summary), url: e.url, image: e.logo?.url ?? "", status: e.status === "canceled" ? "cancelled" : "ok", outdoor: /park|garden|rooftop|pier|beach|outdoor|street/i.test(`${v.name} ${title}`), summary };
}
export async function fromEventbrite(days = 14) {
  const token = process.env.EVENTBRITE_TOKEN; if (!token) return 0;
  if (!borough(40.7128, -74.006)) await loadBoroughs(); // NYC venues only: Jersey City is inside the city's bounding box
  if (now() - ((db.prepare("select max(at) t from runs where what = 'eb-discover'").get() as any)?.t ?? 0) > 20 * 3600) await ebDiscover();
  const today = nyDate(), to = addDays(today, days), seen = new Set<string>();
  // organizers with NYC events every day; the others once a week, in case they post some
  const orgs = db.prepare("select id from eb_orgs where nyc > 0 or checked is null or checked < ?").all(now() - 7 * 86400) as any[];
  for (const { id } of orgs) {
    let nyc = 0, name = "", cont = "";
    try {
      for (let page = 0; page < 4; page++) {
        const r = await fetch(`https://www.eventbriteapi.com/v3/organizers/${id}/events/?status=live&order_by=start_asc&expand=venue,ticket_availability,organizer${cont ? `&continuation=${cont}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
        if (r.status === 429) throw new Error("rate limited");
        if (!r.ok) break;
        const d: any = await r.json();
        for (const e of d.events ?? []) {
          name ||= e.organizer?.name ?? "";
          const x = ebEvent(e); if (!x) continue;
          nyc++;
          if (x.start.slice(0, 10) >= today && x.start.slice(0, 10) <= to && save(x)) seen.add(x.id);
        }
        if (!d.pagination?.has_more_items) break; cont = d.pagination.continuation;
      }
    } catch (e) { if ((e as Error).message === "rate limited") break; }
    db.prepare("update eb_orgs set checked = ?, nyc = ?, name = coalesce(nullif(?, ''), name) where id = ?").run(now(), nyc, name, id);
  }
  sweep("eventbrite", seen, today, addDays(today, 3)); run("eventbrite", seen.size, `${orgs.length} organizers`); return seen.size;
}

/** The same event from two sources (same day, nearly the same title, same place): keep one, the most specific source. */
export function dedupe() {
  db.exec("update ev set dup_of = null");
  const rank: Record<string, number> = { ticketmaster: 0, eventbrite: 1, city: 1, parks: 1, nycforfree: 2, freehours: 2, permits: 3 };
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(" ");
  const rows = db.prepare("select id, source, title, start, lat, lon from ev where status = 'ok' and start >= ?").all(nyDate()) as any[], best = new Map<string, any[]>();
  let n = 0;
  for (const r of rows.sort((a, b) => (rank[a.source] ?? 9) - (rank[b.source] ?? 9))) {
    const k = `${r.start.slice(0, 10)}|${key(r.title)}`, list = best.get(k) ?? [];
    // one source listing the same title twice that day is two showings (matinee and evening), not a duplicate;
    // "Halloween Party" in two parks is two parties
    const b = list.find((b) => (b.source !== r.source || b.start === r.start) && (b.lat == null || r.lat == null || kmTo(b.lat, b.lon, r.lat, r.lon) < 1.5));
    if (b) { db.prepare("update ev set dup_of = ? where id = ?").run(b.id, r.id); n++; } else best.set(k, [...list, r]);
  }
  return n;
}

// ---------- weather: rain chance per hour (Open-Meteo, no key) ----------
let rain: { at: number; byHour: Map<string, number> } | null = null;
async function rainChance() {
  if (rain && Date.now() - rain.at < 3600e3) return rain.byHour;
  try {
    const d = await getJson("https://api.open-meteo.com/v1/forecast?latitude=40.73&longitude=-73.99&hourly=precipitation_probability&timezone=America/New_York&forecast_days=14");
    rain = { at: Date.now(), byHour: new Map(d.hourly.time.map((t: string, i: number) => [t.replace("T", " ").slice(0, 13), d.hourly.precipitation_probability[i]])) };
  } catch { rain = { at: Date.now() - 3000e3, byHour: rain?.byHour ?? new Map() }; }
  return rain.byHour;
}

// ---------- asking ----------
export type EvQuery = { date?: string; from?: string; to?: string; budget?: string; cat?: string; near?: string; km?: number; source?: string; q?: string };
export async function events(qy: EvQuery) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(qy.date ?? "") ? qy.date! : nyDate(), from = /^\d{2}:\d{2}$/.test(qy.from ?? "") ? qy.from! : "00:00", to = /^\d{2}:\d{2}$/.test(qy.to ?? "") ? qy.to! : "23:59";
  const where = ["status in ('ok','postponed','rescheduled')", "dup_of is null", "substr(start, 1, 10) = ?", "substr(start, 12, 5) between ? and ?"], args: any[] = [date, from, to];
  // also events that started earlier and are still on during the window (a festival from noon to 6 pm)
  where.splice(2, 2, `(substr(start, 1, 10) = ? and (substr(start, 12, 5) between ? and ? or (substr(start, 12, 5) < ? and "end" is not null and substr("end", 12, 5) > ?) or all_day = 1))`); args.splice(0, 3, date, from, to, from, from);
  if (qy.budget === "free") where.push("free = 1");
  else if (qy.budget && /^\d+$/.test(qy.budget)) { where.push("(free = 1 or (price_min is not null and price_min <= ?))"); args.push(+qy.budget); }
  const cats = (qy.cat ?? "").split(",").filter(Boolean); if (cats.length) { where.push(`category in (${cats.map(() => "?").join(",")})`); args.push(...cats); }
  const srcs = (qy.source ?? "").split(",").filter(Boolean); if (srcs.length) { where.push(`source in (${srcs.map(() => "?").join(",")})`); args.push(...srcs); }
  if (qy.q) { where.push("(title like ? or venue like ? or summary like ?)"); const l = `%${qy.q.slice(0, 60)}%`; args.push(l, l, l); }
  // things that start in the window first, then the ones already going (a fair that runs all afternoon)
  let rows = db.prepare(`select *, case when substr(start, 12, 5) >= ? then 0 else 1 end ongoing from ev where ${where.join(" and ")} order by ongoing, start limit 600`).all(from, ...args) as any[];
  const [nla, nlo] = (qy.near ?? "").split(",").map(Number), hasNear = Number.isFinite(nla) && Number.isFinite(nlo);
  if (hasNear) { rows = rows.map((r) => ({ ...r, km: r.lat ? +kmTo(nla, nlo, r.lat, r.lon).toFixed(1) : null })); if (qy.km) rows = rows.filter((r) => (r.km != null && r.km <= qy.km!) || (r.lat == null && /all boroughs|citywide/i.test(`${r.venue} ${r.address}`))); }
  // timed-entry attractions (a museum with a slot every 15 minutes) become one entry with its times
  const groups = new Map<string, any>();
  const venueKey = (v: string) => String(v ?? "").toLowerCase().replace(/\s*-\s*(ny|nyc|new york)$/, "").replace(/[^a-z0-9]/g, "");
  for (const r of rows) { const k = `${r.source}|${r.title}|${venueKey(r.venue)}|${r.lat?.toFixed(3)},${r.lon?.toFixed(3)}`, g = groups.get(k); if (g) g.times.push(r.start.slice(11)); else groups.set(k, { ...r, times: [r.start.slice(11)] }); }
  rows = [...groups.values()];
  const byHour = await rainChance();
  const out = rows.map((r) => ({ ...r, rain: r.outdoor ? byHour.get(r.start.slice(0, 13)) ?? null : null, missed: undefined, dup_of: undefined, first_seen: undefined }));
  const facets = { category: Object.fromEntries((db.prepare(`select category k, count(*) n from ev where status = 'ok' and dup_of is null and substr(start, 1, 10) = ? group by category`).all(date) as any[]).map((r) => [r.k, r.n])) };
  return { date, from, to, total: out.length, events: out, facets, updated: (db.prepare("select max(at) t from runs").get() as any)?.t ?? 0 };
}
export const eventById = (id: string) => db.prepare("select * from ev where id = ?").get(id) ?? null;

/** Daily: everything for two weeks. Hourly: today's again, so a cancellation shows within the hour. */
let busy = false;
export async function eveningTick(full = false) {
  if (busy) return; busy = true;
  try {
    const last = (db.prepare("select max(at) t from runs where what = 'permits'").get() as any)?.t ?? 0, daily = full || now() - last > 20 * 3600;
    const tasks: [string, () => Promise<number> | number][] = daily ? [["parks", fromParks], ["ticketmaster", () => fromTicketmaster(7)], ["city", () => fromCity(7)], ["permits", fromPermits], ["free", () => fromFree(7)], ["eventbrite", () => fromEventbrite(14)]]
      : [["ticketmaster", () => fromTicketmaster(1)], ["city", () => fromCity(1)], ["parks", fromParks]];
    for (const [name, f] of tasks) { try { await f(); } catch (e) { console.log(`evening ${name}:`, (e as Error).message); } }
    dedupe();
  } finally { busy = false; }
}
export function startEvening() {
  // permits were keyed by event_id alone until 2026-10-29 (one day of a multi-day permit overwrote the others): read them again
  const old = db.prepare("delete from ev where source = 'permits' and id not glob 'permit:*:*'").run().changes;
  const never = ["permits", "free", "eventbrite"].some((w) => !db.prepare("select 1 from runs where what = ?").get(w)); // a source added since the last daily pass
  setTimeout(() => eveningTick(old > 0 || never), 45_000); setInterval(() => eveningTick(), 3600_000);
}

// ---------- plan my evening ----------
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5), fmt = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
/** An evening around one event: leave → (dinner nearby, grade-A, 75 min) → walk → the event → home, with the rides from the
 *  commute planner (and its MTA alerts), the weather, and the costs we know. Times in New York local time. */
export async function planEvening(eventId: string, from: string, { dinner = true, cuisine = "" } = {}) {
  const e: any = eventById(eventId);
  if (!e) return { error: "That event isn't listed any more." };
  if (e.lat == null) return { error: "That event has no exact location to plan around: open its page for directions." };
  const start = toMin(e.start.slice(11)), end = e.end && e.end.slice(0, 10) === e.start.slice(0, 10) ? toMin(e.end.slice(11)) : start + 120;
  const steps: any[] = [];
  let spot: any = null, alternatives: any[] = [];
  if (dinner) {
    // a sit-down dinner: not coffee, dessert, juice or snacks
    const near = (await restaurantsNear(e.lat, e.lon, 600).catch(() => [])).filter((r: any) => !/coffee|tea|donut|bakery|dessert|frozen|juice|smoothie|beverage|bottled|hotdog|pretzel|snack|nuts|candy|ice cream|bagel|sandwich|chicken$/i.test(r.cuisine ?? "") && !/starbucks|dunkin|mcdonald|subway|7-eleven|duane reade|cvs|walgreens/i.test(r.name));
    spot = near.find((r: any) => !cuisine || new RegExp(cuisine, "i").test(r.cuisine)) ?? near[0] ?? null;
    alternatives = near.filter((r: any) => r !== spot).slice(0, 2);
  }
  const meet = spot ? { label: spot.address, lat: spot.lat, lon: spot.lon } : { label: `${e.venue}, ${e.address}`.replace(/, $/, ""), lat: e.lat, lon: e.lon };
  const ride: any = from ? await tripPlan(from, `${meet.lat},${meet.lon}`, "transit").then((t: any) => (t.error ? t : annotateTrip(t))).catch((x) => ({ error: x.message })) : null;
  const best = ride?.options?.[0], rideMin = best?.minutes ?? null;
  // dinner before an evening event; after one that starts before 5:30 pm (a matinee, an afternoon fair)
  const after = !!spot && start < 17 * 60 + 30, dinnerAt = spot ? (after ? end + 15 : start - 15 - 75) : null, arriveBy = after || !spot ? start - 10 : dinnerAt!, leave = rideMin != null ? arriveBy - rideMin - 5 : null;
  if (leave != null) steps.push({ at: fmt(leave), what: `Leave ${from}`, detail: best ? `${best.legs.filter((l: any) => l.mode !== "WALK").map((l: any) => l.route).join(" → ") || "walk"}, about ${rideMin} min${best.transfers ? `, ${best.transfers} transfer${best.transfers > 1 ? "s" : ""}` : ""}` : "", alerts: best?.alerts ?? [] });
  const dinnerStep = spot && { at: fmt(dinnerAt!), what: `Dinner at ${spot.name}`, detail: `${spot.cuisine}, grade A (inspected ${spot.graded}), ${spot.m} m from the venue`, link: `/nyc/#at=${spot.lat},${spot.lon}`, place: spot };
  if (spot && !after) steps.push(dinnerStep, { at: fmt(start - 15), what: `Walk to ${e.venue}`, detail: `about ${Math.max(2, Math.round((spot.m * 1.3) / 80))} min` });
  steps.push({ at: e.start.slice(11), what: e.title, detail: `${e.venue}${e.free ? " · free" : e.price_min != null ? ` · from $${Math.round(e.price_min)}` : ""}`, link: e.url, event: true });
  if (spot && after) steps.push(dinnerStep);
  const back: any = from ? await tripPlan(`${e.lat},${e.lon}`, from, "transit").catch(() => null) : null, home = back?.options?.[0];
  steps.push({ at: fmt(after ? dinnerAt! + 75 : end), what: "Head home", detail: home ? `${home.legs.filter((l: any) => l.mode !== "WALK").map((l: any) => l.route).join(" → ") || "walk"}, about ${home.minutes} min (late-night service can be slower)` : "" });
  const byHour = await rainChance(), r = e.outdoor ? byHour.get(e.start.slice(0, 13)) : null;
  return { event: e, date: e.start.slice(0, 10), steps, dinner: spot, alternatives, rain: r ?? null, weatherNote: e.outdoor && r != null ? (r >= 40 ? `☔ ${r}% chance of rain at the start: it's outdoors, bring a layer and an umbrella` : `${r}% chance of rain: looks fine for outdoors`) : null,
    cost: { event: e.free ? 0 : e.price_min ?? null, subway: from ? 2 * 2.9 : 0 }, from };
}
