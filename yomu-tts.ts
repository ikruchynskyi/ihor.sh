// Local Neural TTS for Yomu using Irodori-TTS (Apple Silicon MPS) and pre-generated static audio caches.
// Completely offline; zero external cloud services (Rewind.ai removed).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = import.meta.dirname;
const AUDIO_DIR = path.join(ROOT, "yomu", "data", "audio");

const SUBDIRS = ["words", "stories", "kana", "grammar", "kanji", "talk"];

// In-memory cache of manifest mappings with mtime tracking
interface CachedManifest {
  mtime: number;
  dict: Record<string, string>;
}
const manifestCache = new Map<string, CachedManifest>();

// High-speed in-memory buffer cache (LRU-like cap)
const bufferCache = new Map<string, Buffer>();
function cacheBuffer(key: string, buf: Buffer) {
  if (bufferCache.size > 2000) {
    const oldest = bufferCache.keys().next().value;
    if (oldest) bufferCache.delete(oldest);
  }
  bufferCache.set(key, buf);
}

async function lookupStaticFile(text: string): Promise<Buffer | null> {
  const clean = text.trim();
  const stripped = clean.replace(/[。、！？!?,.\s]+$/g, "").trim();
  const candidates = stripped && stripped !== clean ? [clean, stripped] : [clean];

  for (const query of candidates) {
    if (bufferCache.has(`static:${query}`)) {
      return bufferCache.get(`static:${query}`)!;
    }

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
          cacheBuffer(`static:${query}`, buf);
          return buf;
        } catch {}
      } catch {}
    }
  }
  return null;
}

/** Synthesize on-demand using local Irodori-TTS on Apple Silicon MPS. */
export async function irodoriSingleTTS(text: string): Promise<Buffer> {
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new Error("Empty text");
  const hash = createHash("sha1").update(`irodori:${clean}`).digest("hex");
  const cachedFile = path.join(AUDIO_DIR, `${hash}.mp3`);

  if (bufferCache.has(`irodori:${clean}`)) {
    return bufferCache.get(`irodori:${clean}`)!;
  }

  try {
    const buf = await readFile(cachedFile);
    cacheBuffer(`irodori:${clean}`, buf);
    return buf;
  } catch {}

  const pythonBin = "/Users/irishdash/Irodori-TTS/.venv/bin/python";
  const genScript = path.join(ROOT, "yomu", "src", "irodori_gen.py");
  await execFileAsync(pythonBin, [genScript, "--text", clean, "--output", cachedFile, "--steps", "18"], {
    timeout: 15_000,
  });
  const buf = await readFile(cachedFile);
  cacheBuffer(`irodori:${clean}`, buf);
  return buf;
}

const inflight = new Map<string, Promise<Buffer>>();

/** Synthesize speech for `text` using local static audio caches or on-demand Irodori-TTS. */
export async function kokoroTTS(text: string, speed = 1.0): Promise<Buffer> {
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new Error("Empty text");

  // 1. Check in-memory buffer cache
  if (bufferCache.has(`irodori:${clean}`)) {
    return bufferCache.get(`irodori:${clean}`)!;
  }

  // 2. Check disk cache in root audio dir
  const hash = createHash("sha1").update(`irodori:${clean}`).digest("hex");
  const cachedFile = path.join(AUDIO_DIR, `${hash}.mp3`);
  try {
    const buf = await readFile(cachedFile);
    cacheBuffer(`irodori:${clean}`, buf);
    return buf;
  } catch {}

  // 3. Check static directories and manifests (words, kana, grammar, etc.)
  const staticBuf = await lookupStaticFile(clean);
  if (staticBuf) return staticBuf;

  // 4. Fallback to on-demand local Irodori-TTS with inflight deduplication
  const key = clean;
  if (inflight.has(key)) return inflight.get(key)!;

  const job = (async () => {
    return await irodoriSingleTTS(clean);
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

export const yomuTTS = kokoroTTS;

