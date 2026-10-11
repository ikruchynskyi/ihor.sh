// AI upscaling of a camera frame on this Mac: SeedVR2-3B (ByteDance's one-step diffusion restoration model) in MLX
// through mflux, in its own venv (~/AI/mflux-venv: mflux wants a newer mlx and torch than Whisper's venv). Quantized to
// 8 bits with MLX's cache capped and emptied after each frame: ~5 GB between frames and a ~16 GB peak, where fp16 sat
// at 20–29 GB and pushed the Mac into swap. Loads on the first request; exits after five idle minutes.
// The frame goes through a temp file (mflux reads paths), deleted at once; the result goes back as base64.
import { spawn, type ChildProcess } from "node:child_process";

const PY = process.env.MFLUX_PY ?? "/Users/irishdash/AI/mflux-venv/bin/python";
const IDLE_MS = 5 * 60_000, MAX_QUEUE = 3, MAX_SHORT = 1080; // output: ~4×, the short side at most 1080 px
const SCRIPT = `import sys, json, base64, io, os, tempfile, time
from PIL import Image
import mlx.core as mx
from mflux.models.common.config import ModelConfig
from mflux.models.seedvr2 import SeedVR2
model = None
mx.set_cache_limit(1 << 30)
for line in sys.stdin:
    j, path = {}, None
    try:
        j = json.loads(line); t = time.time()
        if model is None: model = SeedVR2(quantize=8, model_config=ModelConfig.seedvr2_3b())
        fd, path = tempfile.mkstemp(suffix=".jpg"); os.write(fd, base64.b64decode(j["img"])); os.close(fd)
        short = min(Image.open(path).size)
        out = model.generate_image(seed=42, image_path=path, resolution=max(short, min(4 * short, ${MAX_SHORT})), softness=0.0).image.convert("RGB")
        buf = io.BytesIO(); out.save(buf, "JPEG", quality=92)
        print(json.dumps({"id": j["id"], "img": base64.b64encode(buf.getvalue()).decode(), "w": out.width, "h": out.height, "ms": int((time.time() - t) * 1000)}), flush=True)
    except Exception as e:
        print(json.dumps({"id": j.get("id"), "error": str(e)[:200]}), flush=True)
    finally:
        if path: os.unlink(path)
        mx.clear_cache()
`;

let worker: ChildProcess | null = null, idle: ReturnType<typeof setTimeout> | undefined, seq = 0;
const pending = new Map<number, (r: any) => void>();
// the five idle minutes count only while nothing is queued (a long queue must not be cut off mid-run)
const armIdle = () => { clearTimeout(idle); if (!pending.size) idle = setTimeout(() => worker?.kill(), IDLE_MS); };
function py(): ChildProcess {
  if (worker && worker.exitCode == null && !worker.killed) return worker;
  const w = spawn(PY, ["-u", "-c", SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  w.stdout!.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const row = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(row); pending.get(j.id)?.(j); pending.delete(j.id); armIdle(); } catch {} } });
  w.stderr!.on("data", (d) => { const t = String(d); if (!/Fetching|%\||Warning|Downloading/.test(t)) console.warn("upscale:", t.trim().slice(0, 200)); });
  w.on("exit", () => { if (worker === w) worker = null; for (const [, r] of pending) r({ error: "the upscaler stopped" }); pending.clear(); });
  return (worker = w);
}

/** A JPEG/PNG frame → the same picture ~4× larger (short side up to 1080 px), as a base64 JPEG: the page shows it as a
 *  data: URL, so nothing is kept on the server. */
export function upscale(image: Buffer): Promise<{ img: string; w: number; h: number; ms: number }> {
  if (pending.size >= MAX_QUEUE) return Promise.reject(new Error("The upscaler is busy. Try again in a minute."));
  clearTimeout(idle);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { if (pending.delete(id)) { armIdle(); reject(new Error("The upscaler took too long.")); } }, 180_000);
    pending.set(id, (r) => { clearTimeout(t); r.error ? reject(new Error(r.error)) : resolve(r); });
    py().stdin!.write(JSON.stringify({ id, img: image.toString("base64") }) + "\n");
  });
}
