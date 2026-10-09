// Smoke test for the running site: every page and API answers. Run: npm run check  (BASE=https://ihor.sh npm run check)
const BASE = process.env.BASE ?? "http://localhost:8080";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const URLS = [
  "/", "/robots.txt", "/sitemap.xml", "/theme.css", "/reader.js", "/companion.js", "/og.png",
  "/radio/", "/radio/course/", "/radio/ham/", "/radio/cw.html", "/radio/sstv.html", "/radio/aprs/", "/radio/adsb/",
  "/nyc/", "/nyc/free.html", "/nyc/archive.html", "/ai/", "/ai/01-matrices-are-moves.html",
  "/api/radio/status", "/api/state", "/api/nyc/archive", "/api/nyc/events", "/api/nyc/cameras", "/api/nyc/arrivals?stop=R20",
  "/api/nyc/point?lat=40.75&lon=-73.98", "/api/nyc/restaurants?q=katz", `/api/nyc/city-events?from=${today}&free=1`,
];
let failed = 0;
await Promise.all(URLS.map(async (u) => {
  const r = await fetch(BASE + u, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({ status: 0, statusText: e.message }) as Response);
  if (r.status !== 200) { failed++; console.log(`✗ ${r.status} ${u}`); }
}));
console.log(failed ? `${failed} of ${URLS.length} failed` : `all ${URLS.length} OK`);
process.exit(failed ? 1 : 0);
