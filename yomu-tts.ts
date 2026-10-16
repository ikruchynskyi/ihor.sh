// Edge Neural TTS for Yomu (ja-JP-NanamiNeural).
// In-memory generation only; zero audio files stored on the server.
// Caching and reuse occur at the browser level.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = import.meta.dirname;
const AUDIO_DIR = path.join(ROOT, "yomu", "data", "audio");
const EDGE_SERVER_URL = process.env.EDGE_TTS_URL ?? "http://127.0.0.1:5056";

const PYTHON_BINS = [
  "/Users/irishdash/AI/venv/bin/python3",
  "/Users/irishdash/.pyenv/shims/python3",
  "python3",
];

let resolvedPythonBin: string | null = null;
async function getPythonBin(): Promise<string> {
  if (resolvedPythonBin) return resolvedPythonBin;
  for (const bin of PYTHON_BINS) {
    try {
      await execFileAsync(bin, ["-c", "import edge_tts"], { timeout: 3000 });
      resolvedPythonBin = bin;
      return bin;
    } catch {}
  }
  return "python3";
}

const SUBDIRS = ["words", "stories", "kana", "grammar", "kanji", "talk"];

// In-memory cache of manifest mappings with mtime tracking
interface CachedManifest {
  mtime: number;
  dict: Record<string, string>;
}
const manifestCache = new Map<string, CachedManifest>();

async function lookupStaticFile(text: string): Promise<Buffer | null> {
  const clean = text.trim();
  const stripped = clean.replace(/[。、！？!?,.\s]+$/g, "").trim();
  const candidates = stripped && stripped !== clean ? [clean, stripped] : [clean];

  for (const query of candidates) {
    const directHash = createHash("sha1").update(query).digest("hex").slice(0, 12);

    for (const sub of SUBDIRS) {
      const dir = path.join(AUDIO_DIR, sub);
      const manifestPath = path.join(dir, "manifest.json");
      try {
        let cached = manifestCache.get(sub);
        let currentMtime = 0;
        try {
          const s = await stat(manifestPath);
          currentMtime = s.mtimeMs;
        } catch {}

        if (!cached || cached.mtime < currentMtime) {
          const raw = await readFile(manifestPath, "utf8");
          const json = JSON.parse(raw);
          const dict = json.words || json.items || json.kana || json.grammar || json.kanji || json.talk || {};
          cached = { mtime: currentMtime, dict };
          manifestCache.set(sub, cached);
        }

        const fileKey = cached.dict?.[query] || directHash;
        const targetFile = path.join(dir, `${fileKey}.mp3`);
        try {
          const buf = await readFile(targetFile);
          return buf;
        } catch {}
      } catch {}
    }
  }
  return null;
}

const inflight = new Map<string, Promise<Buffer>>();

/**
 * Synthesize speech for `text` using Microsoft Edge neural TTS (ja-JP-NanamiNeural).
 * Pure in-memory streaming; no files are saved to the server disk.
 */
export async function edgeTTS(text: string, speed = 1.0): Promise<Buffer> {
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new Error("Empty text");

  const speedVal = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
  const percent = Math.round((speedVal - 1.0) * 100);
  const rateStr = `${percent >= 0 ? "+" : ""}${percent}%`;

  // Check static pre-generated audio files (for standard speed exact matches)
  if (Math.abs(speedVal - 1.0) < 0.05) {
    const staticBuf = await lookupStaticFile(clean);
    if (staticBuf) return staticBuf;
  }

  // Inflight deduplication for concurrent identical requests
  const inKey = `${rateStr}:${clean}`;
  if (inflight.has(inKey)) return inflight.get(inKey)!;

  const job = (async () => {
    // 1. Try local in-memory Edge TTS microservice
    try {
      const res = await fetch(`${EDGE_SERVER_URL}/tts?text=${encodeURIComponent(clean)}&speed=${speedVal}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
      }
    } catch {}

    // 2. Fallback: direct in-memory Python stdout stream (zero disk storage)
    const pyBin = await getPythonBin();
    const genScript = path.join(ROOT, "yomu", "src", "edge_tts_speak.py");
    const { stdout } = await execFileAsync(pyBin, [genScript, clean, String(speedVal), "ja-JP-NanamiNeural"], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15_000,
    });
    return stdout;
  })().finally(() => inflight.delete(inKey));

  inflight.set(inKey, job);
  return job;
}

// Aliases for compatibility
export const kokoroTTS = edgeTTS;
export const yomuTTS = edgeTTS;
