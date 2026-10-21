// Deals in NYC: designer sample sales (Chicmi's public NYC listing, schema.org Event data; robots.txt allows it)
// and the city's discount weeks (Restaurant Week, Broadway Week, Off-Broadway Week…) from the NYC Events API.
// Fetched at most every 3 hours; shown on Free NYC and the live map, and given to Blip.
import { cityEvents } from "./nycapi.ts";

const SOURCE = "https://www.chicmi.com/new-york/sample-sales/";
let cache: { at: number; sales: SampleSale[] } | null = null;

export interface SampleSale { name: string; start: string; end: string; place: string; address: string; lat: number | null; lon: number | null; url: string; summary: string }

/** schema.org Event objects from a page's JSON-LD blocks. */
export function parseSales(html: string): SampleSale[] {
  const out: SampleSale[] = [];
  for (const [, block] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d: any;
    try { d = JSON.parse(block); } catch { continue; }
    for (const e of Array.isArray(d) ? d : d["@graph"] ?? [d]) {
      if (e?.["@type"] !== "Event" || !e.name || !e.startDate) continue;
      const loc = e.location ?? {}, addr = loc.address ?? {};
      const url = String(e.url ?? "").replace(/^http:/, "https:").replace(/\?utm_[^#]*/, "");
      out.push({
        name: String(e.name).trim(), start: e.startDate, end: e.endDate ?? e.startDate,
        place: loc.name ?? "", address: [addr.streetAddress, addr.addressLocality, addr.postalCode].filter(Boolean).join(", "),
        lat: Number(loc.geo?.latitude) || null, lon: Number(loc.geo?.longitude) || null, url,
        summary: String(e.description ?? "").trim().replace(/\s+/g, " ").slice(0, 220),
      });
    }
  }
  return out;
}

export async function sampleSales() {
  if (!cache || cache.at < Date.now() - 3 * 3600_000) {
    const r = await fetch(SOURCE, { headers: { "user-agent": "ihor.sh Free NYC (+https://ihor.sh/nyc/free.html)" }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`chicmi ${r.status}`);
    cache = { at: Date.now(), sales: parseSales(await r.text()) };
  }
  return cache.sales;
}

const nyDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DEAL_WEEK = /\b(restaurant|broadway|off-broadway|must-see|attraction|hotel|museum)s?\s+weeks?\b|\bweek\b.*\b(2-for-1|two-for-one|prix fixe)\b/i;

/** Deals running on `date` (YYYY-MM-DD, New York): sample sales and the city's discount weeks. */
export async function deals(date = nyDate()) {
  const [sales, city] = await Promise.all([sampleSales().catch(() => []), cityEvents(date).catch(() => [])]);
  return {
    date,
    sampleSales: sales.filter((s) => s.start.slice(0, 10) <= date && date <= s.end.slice(0, 10)),
    cityDeals: city.filter((e) => DEAL_WEEK.test(e.name) || DEAL_WEEK.test(e.summary)),
    source: SOURCE,
  };
}
