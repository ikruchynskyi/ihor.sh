// Imports FM repeaters for NY, NJ and CT from a RepeaterBook table the user copied by hand (no API token yet), so the
// map has current listings there instead of HearHam's stale ones. Run: node ham-import.ts data/repeaterbook-paste.txt
// Input: tab-separated rows "freq sign, tone, location, county, call, use, modes, status"; New York first, then a line
// "NJ repeaters", then "CT repeaters". RepeaterBook's table has no coordinates, so each row gets HearHam's position
// for the same call and frequency, else the town's (OpenStreetMap Nominatim, cached in data/geocache.json), moved to a
// HearHam repeater on the same frequency within 15 km when there is one (a renamed machine on the same tower).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { band, type Repeater } from "./ham.ts";

const UA = { "user-agent": "ihor.sh radio (+https://ihor.sh/radio/repeaters/)" };
const STATUS: Record<string, string> = { "🟢": "on air", "🔴": "off air", "🟡": "testing", "⚪": "status unknown" };
// RepeaterBook shows only the offset's sign; these are each band's standard split
const SPLIT: Record<string, number> = { "10m": 0.1, "6m": 1, "2m": 0.6, "1.25m": 1.6, "70cm": 5, "33cm": 12, "23cm": 12 };
const LINKS = ["AllStar", "EchoLink", "IRLP"], DIGITAL = ["Fusion", "WIRES-X", "DMR", "D-STAR", "P-25", "NXDN"];
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const paste = readFileSync(process.argv[2] ?? "data/repeaterbook-paste.txt", "utf8");
const cachePath = "data/geocache.json", cache: Record<string, { lat: number; lon: number } | null> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
// q is a free-text place, or "?city=…&county=…&state=…" for Nominatim's structured search
async function geocode(q: string) {
  if (!(q in cache)) {
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim's policy: at most one request a second
    const params = q.startsWith("?") ? q.slice(1) : `q=${encodeURIComponent(q)}`;
    const d: any[] = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&${params}`, { headers: UA })).json();
    cache[q] = d[0] ? { lat: +d[0].lat, lon: +d[0].lon } : null;
    writeFileSync(cachePath, JSON.stringify(cache));
  }
  return cache[q];
}

// rough state boxes: a position outside its state's box is a bad geocode or someone else's site
const BOX: Record<string, number[]> = { "New York": [40.4, 45.1, -79.9, -71.7], "New Jersey": [38.85, 41.4, -75.6, -73.85], Connecticut: [40.95, 42.1, -73.75, -71.75] };
const inState = (p: { lat: number; lon: number } | null, st: string) => { const b = BOX[st]; return !!p && p.lat >= b[0] && p.lat <= b[1] && p.lon >= b[2] && p.lon <= b[3]; };
// Connecticut swapped its counties for planning regions in 2022, so OpenStreetMap often can't place "Town, X County, CT":
// "Town, Connecticut" is tried before falling back to the county.
async function town(place: string, county: string, st: string) {
  const enc = encodeURIComponent;
  for (const q of [`${place}, ${county} County, ${st}`, `?city=${enc(place)}&county=${enc(county + " County")}&state=${enc(st)}`, `${place}, ${st}`, `?county=${enc(county + " County")}&state=${enc(st)}`]) {
    const p = await geocode(q);
    if (inState(p, st)) return p;
  }
  return null;
}
const hh: any[] = (await (await fetch("https://hearham.com/api/repeaters/v1", { headers: UA })).json()).filter((r: any) => Number.isFinite(r.latitude));
let state = "New York";
const out: Repeater[] = [], skipped: string[] = [];
let exact = 0, tower = 0, atTown = 0;
for (const line of paste.split("\n")) {
  if (/NJ repeaters/i.test(line)) { state = "New Jersey"; continue; }
  if (/CT repeaters/i.test(line)) { state = "Connecticut"; continue; }
  const p = line.trim().split("\t").map((x) => x.trim()), m = p[0]?.match(/^(\d+\.\d+)\s*([+\-sx]?)$/);
  if (!m || p.length < 8) { if (line.trim()) skipped.push(line.trim()); continue; }
  const [, f, sign] = m, [, tone, loc, county, call, use, modes, status] = p, mhz = +f;
  const analog = modes.startsWith("FM") || (!DIGITAL.some((d) => modes.includes(d)) && LINKS.some((l) => modes.includes(l)));
  if (!analog) continue;
  // same call and frequency in HearHam: its exact position (nearest to the town when there are several)
  const same = hh.filter((r) => (r.callsign ?? "").toUpperCase() === call.toUpperCase() && Math.abs(r.frequency / 1e6 - mhz) < 0.0015);
  const place = loc.split(",")[0];
  let at: { lat: number; lon: number } | null = null, how = "";
  // HearHam's coordinates are trusted only near the town: some are swapped or belong to the call's machine elsewhere
  const t = await town(place, county, state);
  if (t) {
    const nearest = (rs: any[]) => rs.filter((r) => inState({ lat: r.latitude, lon: r.longitude }, state)).map((r) => ({ r, d: km(t, { lat: r.latitude, lon: r.longitude }) })).sort((a, b) => a.d - b.d)[0];
    const mine = nearest(same), other = nearest(hh.filter((r) => Math.abs(r.frequency / 1e6 - mhz) < 0.0015));
    if (mine && mine.d < 40) { at = { lat: mine.r.latitude, lon: mine.r.longitude }; how = "exact"; }
    else if (other && other.d < 15) { at = { lat: other.r.latitude, lon: other.r.longitude }; how = "tower"; }
    else { at = t; how = "town"; }
  }
  if (!at) { skipped.push(`no location: ${line.trim()}`); continue; }
  how === "exact" ? exact++ : how === "tower" ? tower++ : atTown++;
  const b = band(mhz), hit = same[0], split = sign === "s" ? 0 : sign === "x" ? (hit ? hit.offset / 1e6 : 0) : (sign === "-" ? -1 : 1) * (hit && Math.sign(hit.offset) === (sign === "-" ? -1 : 1) ? Math.abs(hit.offset / 1e6) : SPLIT[b] ?? 0);
  const words = modes.match(/AllStar|EchoLink|IRLP|WIRES-X|Fusion|DMR|D-STAR|P-25|NXDN/g) ?? [];
  out.push({
    id: 1e10 + hash(`${call}|${f}|${loc}|${state}`), callsign: call || "?", lat: +at.lat.toFixed(5), lon: +at.lon.toFixed(5), city: `${loc}, ${state}`,
    mode: ["FM", ...words.filter((w) => DIGITAL.includes(w))].join("/"), outputMHz: mhz, offsetMHz: +split.toFixed(3), inputMHz: +(mhz + split).toFixed(4),
    toneUp: tone, toneDown: "", network: words.filter((w) => LINKS.includes(w)).join(", "), node: "",
    description: `${county} County, ${state} · ${STATUS[[...status][0]] ?? status} · RepeaterBook, copied ${new Date().toISOString().slice(0, 10)}`
      + (how === "town" ? " · map position is the town center, not the site" : "") + (sign === "x" && !hit ? " · non-standard split: check the input frequency" : ""),
    operational: !status.startsWith("🔴"), restriction: use === "OPEN" ? "" : use.toLowerCase(), band: b,
  });
}
writeFileSync("data/repeaters-rb.json", JSON.stringify(out));
console.log(`${out.length} FM repeaters: ${exact} at HearHam's exact site, ${tower} at a same-frequency site nearby, ${atTown} at the town center`);
if (skipped.length) console.log(`skipped ${skipped.length}:\n${skipped.slice(0, 10).join("\n")}`);
