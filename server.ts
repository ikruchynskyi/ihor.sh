// ihor.sh: the home page, the built radio site under /radio/, and /api/ask for Blip, the companion.
// Public behind a Cloudflare tunnel, so only whitelisted paths are served (never the repo root).
// Usage: npm run build && npm start   (env: PORT=8080, OLLAMA_MODEL=gpt-oss:20b, OLLAMA_URL=http://localhost:11434)
import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { startArchive, summary } from "./archive.ts";
import { stationArrivals, ferryBoard, ferryBoats, trainPositions, busStops, busArrivals, busRoute } from "./transit.ts";
import { deals } from "./deals.ts";
import { callsign, repeatersIn } from "./ham.ts";
import { today as ornaToday, plan as ornaPlan, materialNames } from "./orna.ts";
import { startEvents, currentEvents } from "./events.ts";
import { ask, systemPrompt, toolCatalog } from "./blip.ts";
import { issue, check, cookie, spend, TTL } from "./session.ts";
import { routeStops, bikeRoute, placeSearch } from "./ride.ts";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pointInfo, cityEvents, findRestaurants, restaurantInspections, trafficCameras, trafficSpeeds, tripPlan, geocode, complaints311 } from "./nycapi.ts";

try { process.loadEnvFile(path.join(import.meta.dirname, ".env")); } catch {} // keys: see .env (git-ignored)

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = import.meta.dirname;
const RADIO = path.join(ROOT, "radio", "dist");
// Project worlds: URL prefix → folder served under it, and the label shown in the HUD bar.
const WORLDS: Record<string, { dir: string; label: string }> = {
  radio: { dir: RADIO, label: "World 1 · Radio" },
  nyc: { dir: path.join(ROOT, "nyc"), label: "World 2 · NYC" },
  ai: { dir: path.join(ROOT, "ai"), label: "World 3 · AI" },
  yomu: { dir: path.join(ROOT, "yomu"), label: "World 4 · Yomu" },
  ride: { dir: path.join(ROOT, "ride"), label: "World 5 · Ride" },
  learn: { dir: path.join(ROOT, "learn"), label: "World 6 · Learn & build" },
  orna: { dir: path.join(ROOT, "orna"), label: "Bonus · ORNA" },
};
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wav": "audio/wav", ".cu8": "application/octet-stream" };
// The dongle server (radio/server.ts, `npm run serve` in radio/) when it's running. Each listener is
// ~2 MB/s of home upload, so public listeners are capped.
const SDR_PORT = Number(process.env.SDR_PORT ?? 8073);
const MAX_LISTENERS = 3;
let listeners = 0;
// Cloudflare keeps CSS/JS for hours, so links carry the file's modification time to bust its cache.
const asset = (name: string) => `/${name}?v=${Math.round(statSync(path.join(ROOT, name)).mtimeMs)}`;
// The same for a page's own scripts and styles ("/yomu/lib.js" → "/yomu/lib.js?v=…") when they live in this repo.
const versioned = (html: string) => html.replace(/(["'])(\/[\w/.-]+\.(?:js|css))\1/g, (m, q, p) => (existsSync(path.join(ROOT, p)) ? `${q}${asset(p.slice(1))}${q}` : m));
const companion = () => `<script type="module" src="${asset("reader.js")}"></script><script type="module" src="${asset("companion.js")}"></script>`;

// Site map for the system prompt, read from the built pages so new lessons show up on restart.
async function siteMap() {
  const lines = ["/ — home: the project select screen"];
  for (const [name, { dir }] of Object.entries(WORLDS))
    for (const f of (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".html")).sort()) {
      const title = (await readFile(path.join(dir, f), "utf8")).match(/<title>([^<]*)/)?.[1]?.trim();
      lines.push(`/${name}/${f.replace(/index\.html$/, "")} — ${title ?? f}`);
    }
  return lines.join("\n");
}

const SYSTEM = systemPrompt(await siteMap());

// ponytail: in-memory per-IP + daily caps, reset on restart; enough for a hobby site on one box.
const hits = new Map<string, number[]>();
let day = "", today = 0;
const PER_IP = 20, WINDOW_MS = 10 * 60_000, PER_DAY = 1000;
// Map data endpoints use keyed city APIs: a looser per-IP budget of their own.
const dataHits = new Map<string, number[]>();
function dataAllowed(ip: string) {
  const now = Date.now(), recent = (dataHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= 150) return false;
  recent.push(now); dataHits.set(ip, recent);
  if (dataHits.size > 5000) dataHits.clear();
  return true;
}
function allowed(ip: string) {
  const now = Date.now(), d = new Date().toDateString();
  if (d !== day) { day = d; today = 0; hits.clear(); }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP || today >= PER_DAY) return false;
  recent.push(now); hits.set(ip, recent); today++;
  return true;
}

async function proxySdr(req: http.IncomingMessage, res: http.ServerResponse) {
  const offline = (msg: string) => { if (!res.headersSent) res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ error: msg })); };
  const stream = req.url?.startsWith("/api/stream");
  if (stream && listeners >= MAX_LISTENERS) return offline("The server SDR is full right now. Try again in a few minutes.");
  const up = http.request({ host: "127.0.0.1", port: SDR_PORT, path: req.url, method: req.method, headers: { "content-type": req.headers["content-type"] ?? "application/json" } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => offline("The server SDR is offline right now."));
  if (stream) { listeners++; res.on("close", () => listeners--); }
  res.on("close", () => up.destroy()); // a closed stream or event feed must close upstream too (it counts listeners/watchers)
  req.pipe(up);
}

/** What the dongle is doing (raw IQ for Spectrum Lab, APRS or ADS-B decoding), for the home page cards. */
async function radioStatus() {
  try {
    const st = await (await fetch(`http://127.0.0.1:${SDR_PORT}/api/state`, { signal: AbortSignal.timeout(1500) })).json();
    return { sdr: true, mode: st.mode, aprs: st.mode === "aprs", adsb: st.mode === "adsb", sdrListeners: st.listeners, watchers: st.watchers };
  } catch { return { sdr: false, mode: "offline", aprs: false, adsb: false, sdrListeners: 0, watchers: { aprs: 0, adsb: 0 } }; }
}

// Search and sharing: a fuller title, canonical URL, Open Graph/Twitter cards and JSON-LD breadcrumbs.
const SITE = "https://ihor.sh";
const attr = (s: string) => s.replace(/"/g, "&quot;");
function seo(html: string, world: string, urlPath: string) {
  const title = html.match(/<title>([^<]*)/)?.[1]?.trim() ?? "ihor.sh";
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const url = SITE + urlPath.replace(/index\.html$/, "");
  const worldName = world.split(" · ")[1] ?? world, worldUrl = `${SITE}/${urlPath.split("/")[1]}/`;
  const crumbs = [["ihor.sh", `${SITE}/`], [worldName, worldUrl], ...(url === worldUrl ? [] : [[title, url]])];
  const ld = JSON.stringify([
    { "@context": "https://schema.org", "@type": "WebPage", name: title, description: desc, url, inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: "ihor.sh", url: `${SITE}/` } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
  ]).replace(/</g, "\\u003c");
  const full = `${title} · ${worldName} · ihor.sh`;
  return html.replace(/<title>[^<]*<\/title>/, `<title>${full}</title>`).replace("</head>", `<link rel="canonical" href="${attr(url)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="ihor.sh"><meta property="og:title" content="${attr(full)}">
<meta property="og:description" content="${desc}"><meta property="og:url" content="${attr(url)}"><meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script></head>`);
}

async function sitemap() {
  const urls: [string, Date][] = [[`${SITE}/`, (await stat(path.join(ROOT, "index.html"))).mtime]];
  for (const [name, { dir }] of Object.entries(WORLDS))
    for (const f of (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".html")).sort())
      urls.push([`${SITE}/${name}/${f.replace(/index\.html$/, "")}`, (await stat(path.join(dir, f))).mtime]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d.toISOString().slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>\n`;
}

// Every project page gets the shared game theme, a HUD bar back to the map, and Blip.
function dress(html: string, world: string, urlPath = "") {
  const title = html.match(/<title>([^<]*)/)?.[1]?.trim() ?? "";
  const hud = `<nav class="ihor-hud" aria-label="Site"><a href="/">◄ ihor.sh</a><span>${world}</span><b>${title}</b></nav>`;
  if (urlPath) html = seo(html, world, urlPath);
  return html
    .replace("</head>", `<link rel="stylesheet" href="${asset("theme.css")}"></head>`)
    .replace(/<body[^>]*>/, (m) => m + hud)
    .replace("</body>", `${companion()}</body>`);
}

async function serveFile(res: http.ServerResponse, file: string, world?: string | "home", urlPath = "") {
  const data = await readFile(file).catch(() => null);
  if (!data) return res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  const ext = path.extname(file);
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache" });
  if (world === "home") return res.end(data.toString().replace(/src="\/(companion|reader)\.js"/g, (_, n) => `src="${asset(n + ".js")}"`));
  res.end(world && ext === ".html" ? dress(versioned(data.toString()), world, urlPath) : data);
}

// The API answers only the site's own pages: ihor.sh and its subdomains (localhost while developing). Browsers send
// Sec-Fetch-Site (older ones Origin/Referer) by themselves; direct calls from scripts and other servers get 403.
// A non-browser client can fake these headers, so the API also wants a visitor session (session.ts): a signed cookie
// that only loading a page hands out, with per-session and per-IP limits on the endpoints that spend our API keys.
const SITE_ORIGINS = /^(?:https:\/\/(?:[a-z0-9-]+\.)*ihor\.sh|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;
export function fromSite(h: http.IncomingHttpHeaders) {
  const fetchSite = h["sec-fetch-site"];
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "same-site"; // same-site: an ihor.sh subdomain
  for (const v of [h.origin, h.referer]) { try { if (v && SITE_ORIGINS.test(new URL(String(v)).origin)) return true; } catch {} }
  return false;
}

// The signing secret lives in .env, created on first start, so restarts don't end anyone's session.
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  const s = randomBytes(32).toString("hex");
  appendFileSync(path.join(ROOT, ".env"), `\nSESSION_SECRET=${s}\n`);
  return s;
})();
// Endpoints that call keyed or rate-limited services. (Bus stops by area are cached for a day, so they're free.)
const METERED = ["/api/ride/route", "/api/ride/places", "/api/ride/stops", "/api/nyc/camera-image", "/api/nyc/trip", "/api/nyc/geocode", "/api/nyc/point", "/api/nyc/restaurant", "/api/nyc/city-events", "/api/nyc/311", "/api/nyc/bus-arrivals", "/api/nyc/bus-route", "/api/radio/callsign"];
const json403 = (res: http.ServerResponse, error: string, code = 403) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ error }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const session = check(SESSION_SECRET, cookie(req.headers.cookie));
  // Pages hand out a session; any request renews one past half its life, so a map left open keeps working.
  if ((!session && !url.pathname.startsWith("/api/")) || (session && session.age > TTL / 2)) {
    const live = /(^|\.)ihor\.sh$/.test(String(req.headers.host ?? "").split(":")[0]);
    res.setHeader("set-cookie", `ihs=${issue(SESSION_SECRET)}; Path=/; Max-Age=${TTL / 1000}; HttpOnly; SameSite=Lax${live ? "; Secure; Domain=ihor.sh" : ""}`);
  }
  if (url.pathname.startsWith("/api/")) {
    if (!fromSite(req.headers) || !session) return json403(res, "This API serves ihor.sh pages only. Reload the page if you see this there.");
    const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
    if (METERED.some((p) => url.pathname.startsWith(p)) && (!spend(`s:${session.id}`, 150, 10 * 60_000) || !spend(`ip:${ip}`, 600, 10 * 60_000)))
      return json403(res, "Slow down a little: too many lookups in the last few minutes.", 429);
  }
  try {
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
      if (!allowed(ip)) return res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "Blip needs a breather. Try again in a few minutes." }));
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 64_000) return res.writeHead(413).end(); }
      const answer = await ask(JSON.parse(raw), SYSTEM);
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(answer));
    }
    if (["/api/state", "/api/tune", "/api/stream", "/api/aprs/events", "/api/adsb/events"].includes(url.pathname)) return proxySdr(req, res);
    if (url.pathname === "/api/viewer" && req.method === "POST") return proxySdr(req, res);
    if (url.pathname === "/api/receiver" && req.method === "POST") {
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
      if (!dataAllowed(ip)) return res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "Too many requests." }));
      return proxySdr(req, res);
    }
    if (url.pathname === "/api/radio/status") return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(await radioStatus()));
    if (url.pathname.startsWith("/api/nyc/") && ["/api/nyc/point", "/api/nyc/restaurants", "/api/nyc/restaurant", "/api/nyc/city-events", "/api/nyc/trip", "/api/nyc/geocode", "/api/nyc/311"].includes(url.pathname)) {
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
      if (!dataAllowed(ip)) return res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "Too many requests, try again in a few minutes." }));
      const q = url.searchParams, send = (data: unknown, maxAge = 300) => res.writeHead(200, { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}` }).end(JSON.stringify(data));
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (url.pathname === "/api/nyc/point") {
        const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
        if (!(lat > 40.4 && lat < 41 && lon > -74.3 && lon < -73.6)) return res.writeHead(400).end();
        return send(await pointInfo(lat, lon), 3600);
      }
      if (url.pathname === "/api/nyc/restaurants") return send(await findRestaurants(String(q.get("q") ?? "").slice(0, 60), String(q.get("boro") ?? "").slice(0, 20)), 3600);
      if (url.pathname === "/api/nyc/311") {
        const [bs, bw, bn, be] = String(q.get("bbox") ?? "").split(",").map(Number);
        if (![bs, bw, bn, be].every(Number.isFinite) || bn - bs > 0.2 || be - bw > 0.3) return res.writeHead(400).end(); // zoomed in enough
        return send(await complaints311(bs, bw, bn, be), 600);
      }
      if (url.pathname === "/api/nyc/geocode") return send(await geocode(String(q.get("q") ?? "").slice(0, 120)), 3600);
      if (url.pathname === "/api/nyc/trip") return send(await tripPlan(String(q.get("from") ?? "").slice(0, 120), String(q.get("to") ?? "").slice(0, 120), (["drive", "bike", "walk", "transit"].includes(q.get("mode") ?? "") ? q.get("mode") : "drive") as any, { avoidFerries: q.get("ferry") === "0" }), 120);
      if (url.pathname === "/api/nyc/restaurant") return send(await restaurantInspections(String(q.get("camis") ?? "")), 3600);
      const from = q.get("from") ?? "", to = q.get("to") ?? from;
      if (!day.test(from) || !day.test(to)) return res.writeHead(400).end();
      return send(await cityEvents(from, to, { freeOnly: q.get("free") === "1" }), 1800);
    }
    if (url.pathname === "/api/nyc/ferry") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=30" }).end(JSON.stringify(await ferryBoard()));
    if (url.pathname === "/api/nyc/bus-stops") {
      const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
      if (!(lat > 40.4 && lat < 41.0 && lon > -74.3 && lon < -73.6)) return res.writeHead(400).end();
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" }).end(JSON.stringify(await busStops(lat, lon)));
    }
    if (url.pathname === "/api/nyc/bus-arrivals") {
      const stop = String(url.searchParams.get("stop") ?? "");
      if (!/^MTA_\d{1,7}$/.test(stop)) return res.writeHead(400).end();
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=20" }).end(JSON.stringify(await busArrivals(stop)));
    }
    if (url.pathname === "/api/nyc/bus-route") {
      const id = String(url.searchParams.get("route") ?? "");
      if (!/^[A-Z ]{3,12}_[A-Z0-9+-]{1,10}$/.test(id)) return res.writeHead(400).end();
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=86400" }).end(JSON.stringify(await busRoute(id)));
    }
    if (url.pathname === "/api/nyc/camera-image") { // a traffic camera frame, same-origin so pages can read its pixels
      const id = String(url.searchParams.get("id") ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return res.writeHead(400).end();
      const r = await fetch(`https://webcams.nyctmc.org/api/cameras/${id}/image`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!r?.ok) return res.writeHead(502).end();
      return res.writeHead(200, { "content-type": r.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=2" }).end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname === "/api/ride/route" && req.method === "POST") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 10_000) return res.writeHead(413).end(); }
      const d: any = await bikeRoute(JSON.parse(raw || "{}"));
      return res.writeHead(d.error ? 502 : 200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(d));
    }
    if (url.pathname === "/api/ride/places") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" }).end(JSON.stringify(await placeSearch(String(url.searchParams.get("q") ?? "").slice(0, 120))));
    if (url.pathname === "/api/ride/stops" && req.method === "POST") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 40_000) return res.writeHead(413).end(); }
      const d: any = await routeStops(JSON.parse(raw || "{}").line);
      return res.writeHead(d.error ? 502 : 200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(d));
    }
    if (url.pathname === "/api/blip/tools") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" }).end(JSON.stringify(toolCatalog()));
    if (url.pathname === "/api/nyc/boats") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=15" }).end(JSON.stringify(await ferryBoats()));
    if (url.pathname === "/api/nyc/trains") {
      const q = url.searchParams, trip = String(q.get("trip") ?? "").slice(0, 40) || undefined;
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=15" }).end(JSON.stringify(await trainPositions(trip, trip && String(q.get("stop") ?? "").slice(0, 6))));
    }
    if (url.pathname === "/api/nyc/arrivals") {
      const d = await stationArrivals(String(url.searchParams.get("stop") ?? "").slice(0, 6));
      return d ? res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=20" }).end(JSON.stringify(d)) : res.writeHead(404).end();
    }
    if (url.pathname === "/api/orna/today") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=600" }).end(JSON.stringify(await ornaToday()));
    if (url.pathname === "/api/orna/materials") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" }).end(JSON.stringify(await materialNames()));
    if (url.pathname === "/api/orna/plan") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=600" })
      .end(JSON.stringify(await ornaPlan(String(url.searchParams.get("material") ?? "").slice(0, 60), Math.min(1e6, Math.max(0, Number(url.searchParams.get("count")) || 0)))));
    if (url.pathname === "/api/radio/repeaters") {
      const [bs, bw, bn, be] = String(url.searchParams.get("bbox") ?? "39.5,-76,42.3,-71.5").split(",").map(Number);
      if (![bs, bw, bn, be].every(Number.isFinite)) return res.writeHead(400).end();
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" }).end(JSON.stringify(await repeatersIn(bs, bw, bn, be)));
    }
    if (url.pathname === "/api/radio/callsign") {
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
      if (!dataAllowed(ip)) return res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "Too many requests." }));
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=86400" }).end(JSON.stringify(await callsign(String(url.searchParams.get("call") ?? ""))));
    }
    if (url.pathname === "/api/nyc/deals") {
      const date = url.searchParams.get("date") ?? "";
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=900" }).end(JSON.stringify(await deals(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined)));
    }
    if (url.pathname === "/api/nyc/speeds") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=120" }).end(JSON.stringify(await trafficSpeeds()));
    if (url.pathname === "/api/nyc/cameras") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=600" }).end(JSON.stringify(await trafficCameras()));
    if (url.pathname === "/api/nyc/events") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=300" }).end(JSON.stringify(currentEvents()));
    if (url.pathname === "/api/nyc/archive") {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" }).end(JSON.stringify(summary(days)));
    }
    if (url.pathname === "/") return serveFile(res, path.join(ROOT, "index.html"), "home");
    if (url.pathname === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
    if (url.pathname === "/sitemap.xml") return res.writeHead(200, { "content-type": "application/xml", "cache-control": "public, max-age=3600" }).end(await sitemap());
    if (["/companion.js", "/theme.css", "/reader.js", "/maps.js", "/learn-kit.js", "/og.png"].includes(url.pathname)) return serveFile(res, path.join(ROOT, url.pathname));
    const [, name, rest] = url.pathname.match(/^\/([a-z]+)(\/.*)?$/) ?? [];
    const world = WORLDS[name];
    if (world && !rest) return res.writeHead(301, { location: `/${name}/` }).end();
    if (world) {
      const rel = decodeURIComponent(rest);
      const file = path.resolve(world.dir, "." + rel + (rel.endsWith("/") ? "index.html" : ""));
      if (!file.startsWith(world.dir + path.sep)) return res.writeHead(403).end();
      return serveFile(res, file, world.label, url.pathname);
    }
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  } catch (e) {
    console.error(req.url, (e as Error).message);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "Blip lost the signal. Try again?" }));
  }
});

startArchive();
startEvents();
server.listen(PORT, "127.0.0.1", () => console.log(`ihor.sh on http://localhost:${PORT}`));
