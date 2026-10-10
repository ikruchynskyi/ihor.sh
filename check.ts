// Smoke test for the running site: every page and API answers. Run: npm run check  (BASE=https://ihor.sh npm run check)
const BASE = process.env.BASE ?? "http://localhost:8080";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const URLS = [
  "/", "/robots.txt", "/sitemap.xml", "/theme.css", "/reader.js", "/companion.js", "/og.png",
  "/radio/", "/radio/course/", "/radio/course/20-analog-tv.html", "/radio/course/21-weather-satellites.html", "/radio/ham/", "/radio/cw.html", "/radio/mesh/", "/api/mesh/state", "/radio/sstv.html", "/radio/aprs/", "/radio/adsb/", "/radio/repeaters/", "/api/radio/repeaters", "/api/radio/callsign?call=W1AW",
  "/nyc/", "/nyc/free.html", "/nyc/jobs.html", "/nyc/tonight.html", "/api/evening/events", "/nyc/resume.html", "/nyc/resume.js", "/api/jobs/stats", "/api/jobs/search?q=engineer&region=nyc", "/nyc/archive.html", "/ai/", "/ai/01-matrices-are-moves.html", "/ai/02-gradients.html", "/ai/03-a-neuron.html", "/ai/04-backprop.html", "/ai/05-probability-and-loss.html", "/ai/06-convolutions.html", "/ai/07-attention.html", "/ai/08-agents.html", "/ai/09-vision.html", "/ai/10-tiny-transformer.html", "/ai/tinygpt.js", "/ai/data/stations.txt", "/ride/", "/ride/route.js", "/ride/escapes.html", "/ride/escapes.js", "/ride/samples/hudson.gpx", "/learn/", "/learn/electronics/01-voltage-current-resistance.html", "/learn/electronics/02-capacitors-and-time.html", "/learn/lab.html", "/learn/electronics/03-coils-and-resonance.html", "/learn/electronics/04-diodes-and-transistors.html", "/learn/electronics/05-real-parts.html", "/learn/electronics/06-circuit-theory.html", "/learn/electronics/07-op-amps.html", "/learn/electronics/08-filters.html", "/learn/electronics/09-oscillators-and-timers.html", "/learn/electronics/10-power-supplies.html", "/learn/electronics/11-light-and-sensors.html", "/learn/electronics/12-gates-to-a-computer.html", "/learn/electronics/13-microcontrollers-and-buses.html", "/learn/electronics/14-motors.html", "/learn/electronics/15-hands-on.html", "/learn/electronics/16-audio.html", "/learn/circuit.js", "/learn/lab/parts.js", "/learn/lab/engine.js", "/learn/lab/templates.js", "/learn-kit.js", "/learn/schem.js", "/api/blip/tools", "/ai/plane.js", "/yomu/", "/yomu/kana.html", "/yomu/grammar.html?level=N4", "/yomu/deck.html?level=N3&type=kanji", "/yomu/review.html", "/yomu/placement.html", "/yomu/draw.html", "/yomu/talk.html", "/yomu/talk.js", "/yomu/data/strokes.json", "/yomu/story.html?u=n5-01", "/yomu/data/grammar.json", "/orna/", "/api/orna/today", "/api/orna/plan?material=Adamantine&count=300",
  "/api/radio/status", "/api/state", "/api/nyc/archive", "/api/nyc/events", "/api/nyc/cameras", "/api/nyc/speeds", "/api/nyc/deals", "/api/nyc/ferry", "/api/nyc/arrivals?stop=R20", "/api/nyc/trains", "/api/nyc/boats", "/api/nyc/bus-stops?lat=40.735&lon=-73.99", "/api/nyc/bus-arrivals?stop=MTA_400003", "/api/nyc/bus-route?route=MTA%20NYCT_M1",
  "/api/nyc/point?lat=40.75&lon=-73.98", "/api/nyc/trip?from=Union%20Square&to=Grand%20Central&mode=transit", "/api/nyc/restaurants?q=katz", `/api/nyc/city-events?from=${today}&free=1`,
];
let failed = 0;
// A visitor session, as a page load hands it out.
const page = await fetch(BASE + "/", { signal: AbortSignal.timeout(30_000) });
const session = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("ihs=")) ?? "";
if (!session) { failed++; console.log("✗ / handed out no session cookie"); }
await Promise.all(URLS.map(async (u) => {
  const r = await fetch(BASE + u, { headers: { referer: BASE + "/", cookie: session }, signal: AbortSignal.timeout(30_000) }) // as the site's own pages.catch((e) => ({ status: 0, statusText: e.message }) as Response);
  if (r.status !== 200) { failed++; console.log(`✗ ${r.status} ${u}`); }
}));
// The API refuses callers that aren't the site's pages.
for (const [why, headers] of [["no headers", {}], ["site headers but no session", { referer: BASE + "/" }]] as const) {
  const r = await fetch(BASE + "/api/nyc/events", { headers, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (r?.status !== 403) { failed++; console.log(`✗ /api/nyc/events with ${why} answered ${r?.status}, expected 403`); }
}
console.log(failed ? `${failed} of ${URLS.length} failed` : `all ${URLS.length} OK`);
process.exit(failed ? 1 : 0);
