// "My SDR": serves the built page and owns the dongle on this computer. One mode at a time:
//   iq   — raw samples for Spectrum Lab listeners (/api/stream)
//   aprs — our AFSK modem on 144.39 MHz, stations pushed to /api/aprs/events
//   adsb — our Mode S decoder on 1090 MHz, aircraft pushed to /api/adsb/events
// A decoder starts on request when nobody listens to raw samples; raw listeners take the dongle back from
// a decoder nobody watches. Plain HTTP: on the internet it sits behind ihor.sh's proxy.
// Usage: npm run serve   (env: PORT=8073, RATE=1024000, REF_LAT/REF_LON = receiver location)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDongle } from "./scripts/node-usb.ts";
import type { RtlSdr } from "./src/rtlsdr.ts";
import { decodeCU8 } from "./src/iq.ts";
import { AprsReceiver, Stations } from "./src/aprs.ts";
import { Tracker, demodulate, magnitude } from "./src/adsb.ts";

const PORT = Number(process.env.PORT ?? 8073);
const RATE = Number(process.env.RATE ?? 1_024_000); // 2 MB/s: comfortable over Wi-Fi
const IDLE_MS = 5000; // release the dongle this long after the last listener leaves
const DIST = path.resolve(import.meta.dirname, "dist");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

const REF = { lat: Number(process.env.REF_LAT ?? 40.73), lon: Number(process.env.REF_LON ?? -73.95) };
const DECODER_IDLE_MS = 30 * 60_000; // an unwatched decoder stops after this long
const DECODERS = {
  aprs: { rate: 1_024_000, center: 144.29e6, gain: 40, label: "APRS map" }, // 144.390 MHz sits 100 kHz above center, away from the DC spike
  adsb: { rate: 2_000_000, center: 1090e6, gain: 49.6, label: "ADS-B radar" },
} as const;
type Decoder = keyof typeof DECODERS;
let mode: "idle" | "iq" | Decoder = "idle";
let lastSwitch = 0, decoderIdle: NodeJS.Timeout | undefined;
const watchers: Record<Decoder, Set<http.ServerResponse>> = { aprs: new Set(), adsb: new Set() };
let aprsRx: AprsReceiver | null = null;
const stations = new Stations();
const tracker = new Tracker(REF.lat, REF.lon);
let adsbTail = new Float32Array(0), adsbDirty = false;

const tuning = { center: 98.45e6, gain: 30 as number | null };
const clients = new Set<http.ServerResponse>();
const congested = new Set<http.ServerResponse>();
let sdr: RtlSdr | null = null;
let streaming: Promise<void> | null = null;
let opening: Promise<RtlSdr> | null = null;
let idle: NodeJS.Timeout | undefined;

/** Send each chunk to every listener; a listener that can't keep up skips chunks instead of lagging. */
function fanOut(chunk: Uint8Array) {
  for (const res of clients) {
    if (congested.has(res)) continue;
    if (!res.write(chunk)) { congested.add(res); res.once("drain", () => congested.delete(res)); }
  }
}

/** Server-sent events to everyone watching a decoder. */
function push(name: Decoder, event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of watchers[name]) res.write(msg);
}

/** Every chunk from the dongle goes where the current mode needs it. */
function onChunk(chunk: Uint8Array) {
  if (mode === "iq") return fanOut(chunk);
  if (mode === "aprs" && aprsRx) for (const p of aprsRx.process(decodeCU8(chunk))) push("aprs", "packet", { packet: p, station: stations.add(p) });
  if (mode === "adsb") {
    // keep the last 240 magnitudes so messages across chunk edges are found (and found once)
    const m = magnitude(chunk), all = new Float32Array(adsbTail.length + m.length);
    all.set(adsbTail); all.set(m, adsbTail.length);
    for (const msg of demodulate(all)) { tracker.add(msg); adsbDirty = true; }
    adsbTail = all.slice(-240);
  }
}
setInterval(() => { if (adsbDirty) { adsbDirty = false; push("adsb", "aircraft", tracker.current()); } }, 1000);

/** Open the dongle for `want` (raw IQ at the listeners' tuning, or a decoder's own settings). */
function ensureSdr(want: "iq" | Decoder = "iq"): Promise<RtlSdr> {
  if (sdr && mode === want) return Promise.resolve(sdr);
  opening ??= (async () => {
    if (sdr) await release();
    const d = want === "iq" ? null : DECODERS[want];
    const s = await openDongle();
    await s.setSampleRate(d?.rate ?? RATE);
    await s.setCenterFrequency(d?.center ?? tuning.center);
    await s.setGain(d ? d.gain : tuning.gain);
    mode = want;
    if (want === "aprs") aprsRx = new AprsReceiver(DECODERS.aprs.rate, 144.39e6 - DECODERS.aprs.center);
    adsbTail = new Float32Array(0);
    streaming = s.stream(onChunk).catch((e) => { console.error("stream:", e.message); });
    console.log(`dongle open for ${want}: ${s.tunerName}, ${s.sampleRate} S/s`);
    return (sdr = s);
  })().finally(() => (opening = null));
  return opening;
}

/** Start a decoder for a visitor. Throws a message they can read when the dongle can't be given to it. */
async function startDecoder(name: Decoder) {
  if (mode === name) return;
  if (clients.size) throw new Error("Someone is listening in Spectrum Lab right now, so the dongle is busy.");
  if ((mode === "aprs" || mode === "adsb") && watchers[mode].size) throw new Error(`${watchers[mode].size} watching the ${DECODERS[mode].label} right now, so the dongle is busy.`);
  if (Date.now() - lastSwitch < 10_000) throw new Error("The receiver was just switched. Try again in a few seconds.");
  lastSwitch = Date.now();
  await ensureSdr(name);
  for (const other of ["aprs", "adsb"] as const) if (other !== name) push(other, "offline", { mode: name });
  push(name, "online", { mode: name });
  scheduleDecoderIdle();
}
function scheduleDecoderIdle() {
  clearTimeout(decoderIdle);
  if (mode === "aprs" || mode === "adsb") if (!watchers[mode].size) decoderIdle = setTimeout(() => { if ((mode === "aprs" || mode === "adsb") && !watchers[mode].size) release(); }, DECODER_IDLE_MS);
}

async function release() {
  const s = sdr;
  if (!s) return;
  sdr = null;
  const was = mode;
  mode = "idle";
  if (was === "aprs" || was === "adsb") push(was, "offline", { mode: "idle" });
  s.stop();
  await streaming;
  await s.close().catch(() => {});
  console.log("dongle released");
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
}

const state = () => ({ tuner: sdr?.tunerName ?? "", rate: sdr?.sampleRate ?? RATE, center: tuning.center, gain: tuning.gain, listeners: clients.size,
  mode, watchers: { aprs: watchers.aprs.size, adsb: watchers.adsb.size } });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/state") return json(res, 200, state());

    if (url.pathname === "/api/tune" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { center, gain } = JSON.parse(body || "{}");
      if (typeof center === "number") {
        if (center < 24e6 || center > 1.766e9) return json(res, 400, { error: "Frequency must be 24–1766 MHz" });
        tuning.center = center;
        if (mode === "iq") await sdr?.setCenterFrequency(center);
      }
      if (gain === null || typeof gain === "number") { tuning.gain = gain; if (mode === "iq") await sdr?.setGain(gain); }
      return json(res, 200, state());
    }

    if (url.pathname === "/api/receiver" && req.method === "POST") {
      let body = "";
      for await (const c of req) { body += c; if (body.length > 200) return json(res, 413, {}); }
      const name = JSON.parse(body || "{}").mode;
      if (name !== "aprs" && name !== "adsb") return json(res, 400, { error: "mode must be aprs or adsb" });
      try { await startDecoder(name); return json(res, 200, state()); } catch (e) { return json(res, 409, { error: (e as Error).message }); }
    }

    const ev = url.pathname.match(/^\/api\/(aprs|adsb)\/events$/);
    if (ev) {
      const name = ev[1] as Decoder;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      watchers[name].add(res);
      clearTimeout(decoderIdle);
      res.write(`event: ${mode === name ? "online" : "offline"}\ndata: ${JSON.stringify({ mode })}\n\n`);
      if (name === "aprs") res.write(`event: snapshot\ndata: ${JSON.stringify({ stations: [...stations.map.values()], log: stations.log.slice(-100) })}\n\n`);
      else res.write(`event: aircraft\ndata: ${JSON.stringify(tracker.current())}\n\n`);
      const ping = setInterval(() => res.write(": ping\n\n"), 20_000); // keeps proxies from closing a quiet stream
      req.on("close", () => { clearInterval(ping); watchers[name].delete(res); scheduleDecoderIdle(); });
      return;
    }

    if (url.pathname === "/api/stream") {
      clearTimeout(idle);
      if ((mode === "aprs" || mode === "adsb") && watchers[mode].size)
        return json(res, 503, { error: `The dongle is busy: ${watchers[mode].size} watching the ${DECODERS[mode].label}. Try again later.` });
      await ensureSdr("iq");
      res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store", "x-sample-rate": String(sdr!.sampleRate) });
      clients.add(res);
      console.log(`listener joined (${clients.size})`);
      req.on("close", () => {
        clients.delete(res); congested.delete(res);
        console.log(`listener left (${clients.size})`);
        if (!clients.size) idle = setTimeout(release, IDLE_MS);
      });
      return;
    }

    // Static files from dist/ (run `vite build` first; `npm run serve` does both).
    const file = path.resolve(DIST, "." + decodeURIComponent(url.pathname) + (url.pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(DIST + path.sep)) return json(res, 403, { error: "Forbidden" });
    const data = await readFile(file).catch(() => null);
    if (!data) return json(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(req.url, msg);
    if (!res.headersSent) json(res, /No RTL-SDR|LIBUSB_ERROR_ACCESS|busy/i.test(msg) ? 503 : 500, { error: msg });
  }
});

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`Port ${PORT} is already in use (another server.ts still running?). Stop it, or pick another port: PORT=8074 npm run serve`);
  process.exit(1);
});
server.listen(PORT, () => console.log(`Spectrum Lab + server SDR on http://0.0.0.0:${PORT} (LAN only, don't port-forward)`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, async () => { await release(); process.exit(0); });
