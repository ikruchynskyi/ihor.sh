// Host supervisor and hardware/GPU bridge on macOS (run at boot by sh.ihor.server):
// 1. Starts Docker Desktop and Ollama if they aren't running yet, then brings up the Docker Compose stack (`docker compose up -d`).
// 2. Exposes local-only endpoints for the host services that Docker Desktop for Mac can't virtualize:
//    - HTTP 127.0.0.1:8075: `/whisper` (mlx_whisper captions on Metal), `/upscale` (SeedVR2-3B mflux upscaler on Metal)
//      `/ocr` (a street photo's text, Apple Vision through ~/AI/ocr-venv) and `/voice` (Mochi's voice, Irodori-TTS
//      on Metal through ~/Irodori-TTS/.venv: server/voice.py).
//    - TCP  127.0.0.1:8076: raw serial bridge to the Meshtastic USB radio (`/dev/cu.usbmodem*`).
import { execFile, execFileSync, spawn } from "node:child_process";
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, statSync, writeSync, constants } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { transcribeLocal } from "./server/monitor.ts";
import { upscaleLocal } from "./server/upscale.ts";
import { readLocal } from "./server/ocr.ts";
import { startVoice, voiceLocal } from "./server/voice.ts";
import { crawl, CRAWLED, jobText, jobTexts } from "./server/crawl.ts";
import { findMeshPort } from "./server/mesh.ts";

const execFileAsync = promisify(execFile);
const ROOT = import.meta.dirname;
const MONITOR_DIR = path.join(ROOT, "data", "monitor");
const BRIDGE_PORT = Number(process.env.HOST_BRIDGE_PORT ?? 8075);
const MESH_BRIDGE_PORT = Number(process.env.MESH_BRIDGE_PORT ?? 8076);
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

async function dockerReady(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureOllama() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    if (r.ok) return;
  } catch {}
  const bin = "/Applications/Ollama.app/Contents/Resources/ollama";
  if (existsSync(bin)) {
    console.log("host: starting headless Ollama server on 0.0.0.0:11434");
    const logDir = path.join(homedir(), ".ollama", "logs");
    let logFd: number | null = null;
    try { mkdirSync(logDir, { recursive: true }); logFd = openSync(path.join(logDir, "server.log"), "a"); } catch {}
    const env = {
      ...process.env,
      OLLAMA_HOST: process.env.OLLAMA_HOST ?? "0.0.0.0:11434",
      OLLAMA_CONTEXT_LENGTH: process.env.OLLAMA_CONTEXT_LENGTH ?? "65536",
      OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION ?? "1",
      OLLAMA_KV_CACHE_TYPE: process.env.OLLAMA_KV_CACHE_TYPE ?? "q8_0",
      OLLAMA_MAX_LOADED_MODELS: process.env.OLLAMA_MAX_LOADED_MODELS ?? "2",
      OLLAMA_NUM_PARALLEL: process.env.OLLAMA_NUM_PARALLEL ?? "1",
      OLLAMA_KEEP_ALIVE: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
    };
    const p = spawn(bin, ["serve"], { detached: true, env, stdio: logFd !== null ? ["ignore", logFd, logFd] : "ignore" });
    if (logFd !== null) closeSync(logFd);
    p.unref();
  }
}

let ensuring = false;
async function ensureDockerAndContainers() {
  if (ensuring) return;
  ensuring = true;
  try {
    await ensureOllama();
    if (!(await dockerReady())) {
      console.log("host: Docker daemon is not running; starting Docker Desktop...");
      try {
        await execFileAsync("docker", ["desktop", "start"], { timeout: 30_000 });
      } catch {
        const backend = "/Applications/Docker.app/Contents/MacOS/com.docker.backend";
        if (existsSync(backend)) {
          const p = spawn(backend, ["run"], { detached: true, stdio: "ignore" });
          p.unref();
        }
      }
      for (let i = 0; i < 60; i++) {
        if (await dockerReady()) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!(await dockerReady())) {
      console.error("host: Docker daemon still not ready; will retry in 60s");
      return;
    }
    // A deploy (manage.sh rebuild, restart.sh) is recreating containers right now: running `compose up` too would race it
    // for port 8080. The file is removed when the deploy ends; one older than 10 minutes is a deploy that died, so heal anyway.
    const lock = path.join(ROOT, "data", ".deploying");
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 10 * 60_000) return;
    // Check if web container is running; if not, run `docker compose up -d`
    const { stdout: psOut } = await execFileAsync("docker", ["compose", "ps", "--status", "running", "--format", "{{.Service}}"], { cwd: ROOT, timeout: 10_000 }).catch(() => ({ stdout: "" }));
    const running = new Set(psOut.trim().split(/\r?\n/).filter(Boolean));
    if (!running.has("web") || !running.has("fli") || !running.has("stays") || !running.has("tts")) {
      console.log("host: bringing up docker compose services...");
      await execFileAsync("docker", ["compose", "up", "-d"], { cwd: ROOT, timeout: 300_000 });
      console.log("host: docker compose services are up");
    }
  } catch (e) {
    console.error("host: ensureDockerAndContainers:", (e as Error).message);
  } finally {
    ensuring = false;
  }
}

// ---------- 1. HTTP bridge on 127.0.0.1:8075 (Whisper captions + SeedVR2 camera upscaler) ----------
const RELAY_HOSTS = /^([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com|wd\d+\.myworkdaysite\.com|[a-z0-9-]+\.fa(\.[a-z0-9-]+)?\.oraclecloud\.com)$/; // the /fetch relay's only hosts
const MAX_CRAWL_WAITING = 4;
let crawlBusy = false;
const crawlQueue: (() => void)[] = [];
class CrawlBusyError extends Error {}
async function withCrawlSlot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new Error("crawl aborted");
  if (crawlBusy) {
    if (crawlQueue.length >= MAX_CRAWL_WAITING) throw new CrawlBusyError("crawler is busy; try again shortly");
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { const i = crawlQueue.indexOf(go); if (i >= 0) crawlQueue.splice(i, 1); reject(new Error("crawl aborted")); };
      const go = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
      signal?.addEventListener("abort", onAbort, { once: true });
      crawlQueue.push(go);
    });
  }
  crawlBusy = true;
  try { return await fn(); }
  finally { const next = crawlQueue.shift(); if (next) next(); else crawlBusy = false; }
}
const httpBridge = http.createServer(async (req, res) => {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return res.writeHead(403).end();
  const send = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
  try {
    if (req.url === "/health" && req.method === "GET") {
      return send(200, { ok: true, docker: await dockerReady(), meshPort: findMeshPort(), crawlBusy, crawlQueued: crawlQueue.length });
    }
    if (req.url === "/whisper" && req.method === "POST") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 2000) return res.writeHead(413).end(); }
      const { file } = JSON.parse(raw || "{}");
      if (typeof file !== "string" || !/^utt-[\w.-]+\.wav$/.test(file)) return send(400, { error: "invalid file" });
      const full = path.join(MONITOR_DIR, file);
      if (!existsSync(full)) return send(404, { error: "file not found" });
      const out = await transcribeLocal(full);
      return send(200, out);
    }
    if (req.url === "/upscale" && req.method === "POST") {
      const chunks: Buffer[] = [];
      let len = 0;
      for await (const c of req) {
        const b = Buffer.from(c);
        len += b.length;
        if (len > 10_000_000) return res.writeHead(413).end();
        chunks.push(b);
      }
      const out = await upscaleLocal(Buffer.concat(chunks));
      return send(200, out);
    }
    if (req.url === "/ocr" && req.method === "POST") { // a street photo's text (Apple Vision, server/ocr.py)
      const chunks: Buffer[] = [];
      let len = 0;
      for await (const c of req) { const b = Buffer.from(c); len += b.length; if (len > 15_000_000) return res.writeHead(413).end(); chunks.push(b); }
      return send(200, await readLocal(Buffer.concat(chunks)));
    }
    if (req.url === "/crawl" && req.method === "POST") { // a big employer's career site in a headless browser (server/crawl.ts), serialized 1 at a time
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 2_000_000) return res.writeHead(413).end(); }
      const { site, known, page, title, pages } = JSON.parse(raw || "{}");
      const ac = new AbortController();
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });
      if (page) return send(200, { description: await withCrawlSlot(() => jobText(String(page), String(title ?? ""), ac.signal).catch(() => ""), ac.signal) });
      if (Array.isArray(pages)) return send(200, await withCrawlSlot(() => jobTexts(pages.map((p: any) => ({ url: String(p?.url ?? ""), title: String(p?.title ?? "") })), 60_000, ac.signal).catch(() => []), ac.signal));
      if (!CRAWLED.includes(String(site))) return send(400, { error: "no crawler for that site" });
      return send(200, await withCrawlSlot(() => crawl(String(site), Array.isArray(known) ? known.map(String) : [], 60_000, ac.signal), ac.signal));
    }
    if (req.url === "/fetch" && req.method === "POST") { // job boards whose Cloudflare turns the container away but answers this Mac (Workday, 2026-11-16; server/jobs.ts): only those hosts, https, no redirects
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 20_000) return res.writeHead(413).end(); }
      const { url, body } = JSON.parse(raw || "{}");
      let u: URL; try { u = new URL(String(url)); } catch { return send(400, { error: "bad url" }); }
      if (u.protocol !== "https:" || !RELAY_HOSTS.test(u.hostname)) return send(403, { error: "not a job board this relay serves" });
      const r = await fetch(u, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(30_000), body: body ? JSON.stringify(body) : undefined,
        headers: { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)", accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) } });
      return send(200, { status: r.status, body: (await r.text()).slice(0, 8_000_000) });
    }
    if (req.url === "/voice" && req.method === "POST") { // Mochi's line as MP3 (server/voice.ts), never saved
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 2000) return res.writeHead(413).end(); }
      const mp3 = await voiceLocal(String(JSON.parse(raw || "{}").text ?? ""));
      return res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" }).end(mp3);
    }
    send(404, { error: "not found" });
  } catch (e) {
    if (!res.headersSent) send(e instanceof CrawlBusyError ? 429 : 500, { error: (e as Error).message });
  }
});
httpBridge.listen(BRIDGE_PORT, "127.0.0.1", () => console.log(`host: MLX bridge (whisper, upscale) on http://127.0.0.1:${BRIDGE_PORT}`));

// ---------- 2. TCP bridge on 127.0.0.1:8076 (Meshtastic USB serial /dev/cu.usbmodem*) ----------
let activeSocket: net.Socket | null = null;
const meshBridge = net.createServer((client) => {
  if (!LOOPBACK.has(client.remoteAddress ?? "")) { client.destroy(); return; }
  const port = findMeshPort();
  if (!port || !existsSync(port)) { client.destroy(); return; }
  activeSocket?.destroy();
  activeSocket = client;
  let fd = -1, stream: ReturnType<typeof createReadStream> | null = null;
  const cleanup = () => {
    if (activeSocket === client) activeSocket = null;
    try { stream?.destroy(); } catch {}
    if (fd >= 0) { try { closeSync(fd); } catch {} fd = -1; }
    try { client.destroy(); } catch {}
  };
  try {
    fd = openSync(port, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
    execFileSync("stty", ["-f", port, "115200", "raw", "-echo", "-hupcl", "clocal"]);
    stream = createReadStream("", { fd: openSync(port, constants.O_RDONLY | constants.O_NOCTTY), highWaterMark: 512 });
    stream.on("data", (c) => { if (!client.destroyed) client.write(c as Buffer); });
    stream.on("error", cleanup);
    stream.on("close", cleanup);
    client.on("data", (c) => { if (fd >= 0) try { writeSync(fd, c); } catch { cleanup(); } });
    client.on("error", cleanup);
    client.on("close", cleanup);
  } catch {
    cleanup();
  }
});
meshBridge.listen(MESH_BRIDGE_PORT, "127.0.0.1", () => console.log(`host: Meshtastic serial bridge on 127.0.0.1:${MESH_BRIDGE_PORT}`));

// Mochi's voice: loaded now, so the first line doesn't wait for the model; voice.ts restarts it if it crashes.
startVoice();

// Start Docker & containers now, and check every 60s so a daemon restart or crash self-heals.
ensureDockerAndContainers();
setInterval(ensureDockerAndContainers, 60_000);
