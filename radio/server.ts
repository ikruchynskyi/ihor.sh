// "My SDR" on the LAN: serves the built page and streams the dongle on this computer to browsers
// on the home network. Plain HTTP only, so keep it on the LAN (no router port forwarding).
// Usage: npm run serve   (env: PORT=8073, RATE=1024000)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDongle } from "./scripts/node-usb.ts";
import type { RtlSdr } from "./src/rtlsdr.ts";

const PORT = Number(process.env.PORT ?? 8073);
const RATE = Number(process.env.RATE ?? 1_024_000); // 2 MB/s: comfortable over Wi-Fi
const IDLE_MS = 5000; // release the dongle this long after the last listener leaves
const DIST = path.resolve(import.meta.dirname, "dist");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

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

function ensureSdr(): Promise<RtlSdr> {
  if (sdr) return Promise.resolve(sdr);
  opening ??= (async () => {
    const s = await openDongle();
    await s.setSampleRate(RATE);
    await s.setCenterFrequency(tuning.center);
    await s.setGain(tuning.gain);
    streaming = s.stream(fanOut).catch((e) => { console.error("stream:", e.message); });
    console.log(`dongle open: ${s.tunerName}, ${s.sampleRate} S/s`);
    return (sdr = s);
  })().finally(() => (opening = null));
  return opening;
}

async function release() {
  const s = sdr;
  if (!s) return;
  sdr = null;
  s.stop();
  await streaming;
  await s.close().catch(() => {});
  console.log("dongle released");
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
}

const state = () => ({ tuner: sdr?.tunerName ?? "", rate: sdr?.sampleRate ?? RATE, center: tuning.center, gain: tuning.gain, listeners: clients.size });

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
        await sdr?.setCenterFrequency(center);
      }
      if (gain === null || typeof gain === "number") { tuning.gain = gain; await sdr?.setGain(gain); }
      return json(res, 200, state());
    }

    if (url.pathname === "/api/stream") {
      clearTimeout(idle);
      await ensureSdr();
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
