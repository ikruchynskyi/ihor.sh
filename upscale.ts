// AI upscaling of a camera frame on this Mac: Real-ESRGAN in MLX (realesrgan-mlx, pinned to xocialize/realesrgan-mlx@52c0fc1
// in the AI venv; weights from mlx-community on Hugging Face, BSD-3). One Python worker keeps both models loaded and
// goes away after ten idle minutes. Small frames (traffic cameras are 352×240) get RealESRGAN_x4plus, the better model
// (~1 s on the M4 Pro); bigger ones the compact realesr-general-x4v3 (~0.1 s per 100k pixels), so no click waits long.
import { spawn, type ChildProcess } from "node:child_process";

const PY = process.env.WHISPER_PY ?? "/Users/irishdash/AI/venv/bin/python3";
const IDLE_MS = 10 * 60_000, MAX_QUEUE = 4;
const SCRIPT = `import sys, json, base64, io, time
import numpy as np
from PIL import Image
from realesrgan_mlx.pipeline_mlx import make_upsampler
ups = {}
for line in sys.stdin:
    j = {}
    try:
        j = json.loads(line); t = time.time()
        img = Image.open(io.BytesIO(base64.b64decode(j["img"]))).convert("RGB")
        if img.width * img.height > 1_500_000: img.thumbnail((1600, 1600))  # the output stays under ~4096 px anyway
        v = "RealESRGAN_x4plus" if img.width * img.height <= 300_000 else "realesr-general-x4v3"
        if v not in ups: ups[v] = make_upsampler(v, tile=512)  # tiles cap the memory on big frames
        out, _ = ups[v].enhance(np.asarray(img), outscale=min(4.0, 4096 / max(img.size)))
        buf = io.BytesIO(); Image.fromarray(out).save(buf, "JPEG", quality=90)
        print(json.dumps({"id": j["id"], "img": base64.b64encode(buf.getvalue()).decode(), "w": out.shape[1], "h": out.shape[0], "model": v, "ms": int((time.time() - t) * 1000)}), flush=True)
    except Exception as e:
        print(json.dumps({"id": j.get("id"), "error": str(e)[:200]}), flush=True)
`;

let worker: ChildProcess | null = null, idle: ReturnType<typeof setTimeout> | undefined, seq = 0;
const pending = new Map<number, (r: any) => void>();
function py(): ChildProcess {
  if (worker && worker.exitCode == null && !worker.killed) return worker;
  const w = spawn(PY, ["-u", "-c", SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  w.stdout!.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const row = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(row); pending.get(j.id)?.(j); pending.delete(j.id); } catch {} } });
  w.stderr!.on("data", (d) => { const t = String(d); if (!/Fetching|%\||Warning/.test(t)) console.warn("upscale:", t.trim().slice(0, 200)); });
  w.on("exit", () => { if (worker === w) worker = null; for (const [, r] of pending) r({ error: "the upscaler stopped" }); pending.clear(); });
  return (worker = w);
}

/** A JPEG/PNG frame → the same picture ~4× larger (long side up to 4096 px), as a base64 JPEG: the page shows it as a
 *  data: URL, so nothing is kept on the server. */
export function upscale(image: Buffer): Promise<{ img: string; w: number; h: number; model: string; ms: number }> {
  if (pending.size >= MAX_QUEUE) return Promise.reject(new Error("The upscaler is busy. Try again in a few seconds."));
  clearTimeout(idle); idle = setTimeout(() => worker?.kill(), IDLE_MS);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { if (pending.delete(id)) reject(new Error("The upscaler took too long.")); }, 60_000);
    pending.set(id, (r) => { clearTimeout(t); r.error ? reject(new Error(r.error)) : resolve(r); });
    py().stdin!.write(JSON.stringify({ id, img: image.toString("base64") }) + "\n");
  });
}
