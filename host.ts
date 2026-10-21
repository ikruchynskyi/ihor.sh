// Host supervisor and hardware/GPU bridge on macOS (run at boot by sh.ihor.server):
// 1. Starts Docker Desktop and Ollama if they aren't running yet, then brings up the Docker Compose stack (`docker compose up -d`).
// 2. Exposes local-only endpoints for the host services that Docker Desktop for Mac can't virtualize:
//    - HTTP 127.0.0.1:8075: `/whisper` (mlx_whisper captions on Metal) and `/upscale` (SeedVR2-3B mflux upscaler on Metal).
//    - TCP  127.0.0.1:8076: raw serial bridge to the Meshtastic USB radio (`/dev/cu.usbmodem*`).
import { execFile, execFileSync, spawn } from "node:child_process";
import { closeSync, createReadStream, existsSync, openSync, statSync, writeSync, constants } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { transcribeLocal } from "./server/monitor.ts";
import { upscaleLocal } from "./server/upscale.ts";
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
    console.log("host: starting Ollama server on 127.0.0.1:11434");
    const p = spawn(bin, ["serve"], { detached: true, stdio: "ignore" });
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
    // Remove legacy standalone memegen container if it wasn't created by docker compose
    try {
      const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{index .Config.Labels \"com.docker.compose.project\"}}", "memegen"], { timeout: 5000 });
      if (!stdout.trim()) {
        console.log("host: replacing standalone memegen container with compose service");
        await execFileAsync("docker", ["rm", "-f", "memegen"], { timeout: 10_000 });
      }
    } catch {}
    // A deploy (manage.sh rebuild, restart.sh) is recreating containers right now: running `compose up` too would race it
    // for port 8080. The file is removed when the deploy ends; one older than 10 minutes is a deploy that died, so heal anyway.
    const lock = path.join(ROOT, "data", ".deploying");
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 10 * 60_000) return;
    // Check if web container is running; if not, run `docker compose up -d`
    const { stdout: psOut } = await execFileAsync("docker", ["compose", "ps", "--status", "running", "--format", "{{.Service}}"], { cwd: ROOT, timeout: 10_000 }).catch(() => ({ stdout: "" }));
    const running = new Set(psOut.trim().split(/\r?\n/).filter(Boolean));
    if (!running.has("web") || !running.has("tts") || !running.has("memegen")) {
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
const httpBridge = http.createServer(async (req, res) => {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return res.writeHead(403).end();
  const send = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
  try {
    if (req.url === "/health" && req.method === "GET") {
      return send(200, { ok: true, docker: await dockerReady(), meshPort: findMeshPort() });
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
    send(404, { error: "not found" });
  } catch (e) {
    send(500, { error: (e as Error).message });
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

// Start Docker & containers now, and check every 60s so a daemon restart or crash self-heals.
ensureDockerAndContainers();
setInterval(ensureDockerAndContainers, 60_000);
