// ihor.sh: the home page, the built radio site under /radio/, and /api/ask for Blip, the companion.
// Public behind a Cloudflare tunnel, so only whitelisted paths are served (never the repo root).
// Usage: npm run build && npm start   (env: PORT=8080, OLLAMA_MODEL=gpt-oss:20b, OLLAMA_URL=http://localhost:11434)
import http from "node:http";
import net from "node:net";
import { readFile, readdir, stat } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { startArchive, summary } from "./archive.ts";
import { startEvents, currentEvents } from "./events.ts";
import { ask, systemPrompt } from "./blip.ts";
import { pointInfo, cityEvents, findRestaurants, restaurantInspections, trafficCameras } from "./nycapi.ts";

try { process.loadEnvFile(path.join(import.meta.dirname, ".env")); } catch {} // keys: see .env (git-ignored)

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = import.meta.dirname;
const RADIO = path.join(ROOT, "radio", "dist");
// Project worlds: URL prefix → folder served under it, and the label shown in the HUD bar.
const WORLDS: Record<string, { dir: string; label: string }> = {
  radio: { dir: RADIO, label: "World 1 · Radio" },
  nyc: { dir: path.join(ROOT, "nyc"), label: "World 2 · NYC" },
};
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wav": "audio/wav", ".cu8": "application/octet-stream" };
// The dongle server (radio/server.ts, `npm run serve` in radio/) when it's running. Each listener is
// ~2 MB/s of home upload, so public listeners are capped.
const SDR_PORT = Number(process.env.SDR_PORT ?? 8073);
const MAX_LISTENERS = 3;
let listeners = 0;
// Cloudflare keeps CSS/JS for hours, so links carry the file's modification time to bust its cache.
const asset = (name: string) => `/${name}?v=${Math.round(statSync(path.join(ROOT, name)).mtimeMs)}`;
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

function proxySdr(req: http.IncomingMessage, res: http.ServerResponse) {
  const offline = (msg: string) => { if (!res.headersSent) res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ error: msg })); };
  const stream = req.url?.startsWith("/api/stream");
  if (stream && listeners >= MAX_LISTENERS) return offline("The server SDR is full right now. Try again in a few minutes.");
  const up = http.request({ host: "127.0.0.1", port: SDR_PORT, path: req.url, method: req.method, headers: { "content-type": req.headers["content-type"] ?? "application/json" } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => offline("The server SDR is offline right now."));
  if (stream) { listeners++; res.on("close", () => { listeners--; up.destroy(); }); }
  req.pipe(up);
}

// Live receivers from ~/aprs-web (Direwolf APRS, dump1090 ADS-B). They share the one dongle with the
// server SDR, so each runs only when started by hand; while one is off, its page says so.
const LIVE: Record<string, { port: number; title: string; what: string }> = {
  "/radio/aprs/": { port: 3000, title: "APRS Map", what: "the APRS map (packet radio on 144.39 MHz: hams, weather stations and trackers around NYC)" },
  "/radio/adsb/": { port: 3001, title: "ADS-B Radar", what: "the ADS-B radar (aircraft over NYC, decoded from 1090 MHz)" },
};
const livePrefix = (p: string) => Object.keys(LIVE).find((k) => p.startsWith(k));

function proxyLive(req: http.IncomingMessage, res: http.ServerResponse, prefix: string) {
  const { port, title, what } = LIVE[prefix];
  const up = http.request({ host: "127.0.0.1", port, path: "/" + req.url!.slice(prefix.length), method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${port}`, "accept-encoding": "identity" } }, async (r) => {
    if (!String(r.headers["content-type"]).includes("text/html")) { res.writeHead(r.statusCode ?? 502, r.headers); return r.pipe(res); }
    let html = "";
    for await (const c of r) html += c;
    const { "content-length": _, etag: __, ...headers } = r.headers;
    html = html.replace(/<title>[^<]*/, `<title>${title}`);
    if (prefix === "/radio/adsb/") html = html.replace("</body>", `<script>showTab("aircraft")</script></body>`);
    res.writeHead(r.statusCode ?? 502, { ...headers, "cache-control": "no-store" }).end(dress(html, WORLDS.radio.label));
  });
  up.on("error", () => {
    if (res.headersSent) return;
    res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(dress(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>main { max-width: 640px; margin: 0 auto; padding: 48px 16px; } </style></head><body><main>
<p class="eyebrow">Off the air</p><h1>${title}</h1>
<p>This receiver isn't running right now. It's ${what}, picked up live by a radio dongle on a Mac in New York.</p>
<p class="lede">One dongle is shared by this map, the other live receiver and the server SDR in Spectrum Lab, so only one of them runs at a time. Check back later, or play with <a href="/radio/">Spectrum Lab</a> meanwhile.</p>
<p><a href="/">◄ Back to the map</a></p></main></body></html>`, WORLDS.radio.label));
  });
  req.pipe(up);
}

// The page's WebSocket (live packets / aircraft) goes to the same receiver, path prefix stripped.
function proxyLiveSocket(req: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) {
  const prefix = livePrefix(req.url ?? "");
  if (!prefix) return socket.destroy();
  const up = net.connect(LIVE[prefix].port, "127.0.0.1", () => {
    const lines = [`${req.method} /${req.url!.slice(prefix.length)} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join("\r\n") + "\r\n\r\n");
    up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
}

/** Which live receivers are up right now, for the home page's level cards. */
async function radioStatus() {
  const up = (port: number) => new Promise<boolean>((done) => {
    const s = net.connect(port, "127.0.0.1", () => { s.destroy(); done(true); });
    s.on("error", () => done(false));
    s.setTimeout(500, () => { s.destroy(); done(false); });
  });
  const [sdr, aprs, adsb] = await Promise.all([up(SDR_PORT), up(3000), up(3001)]);
  return { sdr, aprs, adsb };
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
  res.end(world && ext === ".html" ? dress(data.toString(), world, urlPath) : data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress);
      if (!allowed(ip)) return res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "Blip needs a breather. Try again in a few minutes." }));
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 64_000) return res.writeHead(413).end(); }
      const answer = await ask(JSON.parse(raw), SYSTEM);
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(answer));
    }
    if (["/api/state", "/api/tune", "/api/stream"].includes(url.pathname)) return proxySdr(req, res);
    if (url.pathname === "/api/radio/status") return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(await radioStatus()));
    if (url.pathname === "/radio/aprs" || url.pathname === "/radio/adsb") return res.writeHead(301, { location: url.pathname + "/" }).end();
    const live = livePrefix(url.pathname);
    if (live) return proxyLive(req, res, live);
    if (url.pathname.startsWith("/api/nyc/") && ["/api/nyc/point", "/api/nyc/restaurants", "/api/nyc/restaurant", "/api/nyc/city-events"].includes(url.pathname)) {
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
      if (url.pathname === "/api/nyc/restaurant") return send(await restaurantInspections(String(q.get("camis") ?? "")), 3600);
      const from = q.get("from") ?? "", to = q.get("to") ?? from;
      if (!day.test(from) || !day.test(to)) return res.writeHead(400).end();
      return send(await cityEvents(from, to, { freeOnly: q.get("free") === "1" }), 1800);
    }
    if (url.pathname === "/api/nyc/cameras") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=600" }).end(JSON.stringify(await trafficCameras()));
    if (url.pathname === "/api/nyc/events") return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=300" }).end(JSON.stringify(currentEvents()));
    if (url.pathname === "/api/nyc/archive") {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
      return res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" }).end(JSON.stringify(summary(days)));
    }
    if (url.pathname === "/") return serveFile(res, path.join(ROOT, "index.html"), "home");
    if (url.pathname === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
    if (url.pathname === "/sitemap.xml") return res.writeHead(200, { "content-type": "application/xml", "cache-control": "public, max-age=3600" }).end(await sitemap());
    if (["/companion.js", "/theme.css", "/reader.js", "/og.png"].includes(url.pathname)) return serveFile(res, path.join(ROOT, url.pathname));
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

server.on("upgrade", proxyLiveSocket);
startArchive();
startEvents();
server.listen(PORT, "127.0.0.1", () => console.log(`ihor.sh on http://localhost:${PORT}`));
