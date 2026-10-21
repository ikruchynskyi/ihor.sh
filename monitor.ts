// Listen to a repeater on the server SDR, with live captions and a callsign detector (a reverse-beacon of our own):
// the dongle server streams a 240 kHz slice around the frequency → NFM demodulation in TypeScript (radio/src/dsp.ts)
// → a carrier squelch cuts the audio into transmissions → each one goes to Whisper on this Mac (mlx_whisper, local)
// → callsigns in the text (spoken plainly or in phonetics) are looked up in the FCC database and pinned on the map.
// One monitor at a time (one dongle); everyone on the page hears and reads the same thing. Nothing is kept: the
// callsigns heard live only in the pages that were listening, and the captions are dropped when listening stops. It stops after ten quiet
// minutes without anyone watching.
import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { Receiver, firLowpass, FirDecimator } from "./radio/src/dsp.ts";
import { callsign as fccLookup } from "./ham.ts";

const SDR = `http://${process.env.SDR_HOST ?? "127.0.0.1"}:${process.env.SDR_PORT ?? 8073}`;
const PY = process.env.WHISPER_PY ?? "/Users/irishdash/AI/venv/bin/python3";
const MODEL = process.env.WHISPER_MODEL ?? "mlx-community/whisper-large-v3-mlx";
const DIR = path.join(import.meta.dirname, "data", "monitor");
const SCAN_DWELL = 0.25, SCAN_HANG = 2.5, SCAN_MAX_HOLD = 15, SCAN_MAX = 150; // seconds on each quiet channel; how long to stay after a transmission ends; the most on any one channel
const WIDTH = 240_000, AUDIO_FS = 16_000, IDLE_MS = 10 * 60_000;
const MAX_UTT_S = 6.0, MIN_UTT_S = 0.3, OVERLAP_S = 0.5, SQUELCH_HANG_S = 0.65;

export type Caption = { at: string; text: string; seconds: number; calls: Call[]; mhz: number; label: string };
type Scan = { list: { mhz: number; label: string }[]; i: number; hits: Record<string, string>; round?: number; roundStart?: number };
export type Call = { call: string; found: boolean; name?: string; cls?: string; grid?: string; lat?: number; lon?: number; city?: string; how: "spoken" | "phonetic" };

type Viewer = { res: import("node:http").ServerResponse };
const viewers = new Set<Viewer>(), ears = new Set<import("node:http").ServerResponse>();
let state = { on: false, mhz: 0, label: "", mode: "NFM" as "NFM" | "WFM", open: false, since: "", error: "", captions: [] as Caption[], transcribing: 0, scan: null as Scan | null };
let abort: AbortController | null = null, lastViewer = Date.now(), whisper: ChildProcess | null = null;
const pending = new Map<string, (r: any) => void>();

interface AudioJob {
  pcm: Int16Array;
  mhz: number;
  label: string;
  at: string;
  seq: number;
}
let jobSeq = 0;
const audioQueue: AudioJob[] = [];
let queueBusy = false;

const NOISE_PHRASES = new Set(["thank you.", "thank you", "thanks for watching.", "thanks for watching", "subtitles by", "you", "bye.", "bye"]);
function isHallucination(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (NOISE_PHRASES.has(clean)) return true;
  if (/^\[.*\]$/.test(clean)) return true;
  if (/^[\(\*\.\s]+$/.test(clean)) return true;
  return false;
}

const send = (ev: string, data: unknown) => { const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`; for (const v of viewers) v.res.write(line); };
const pub = () => ({ on: state.on, mhz: state.mhz, label: state.label, mode: state.mode, open: state.open, since: state.since, error: state.error, transcribing: state.transcribing, viewers: viewers.size, captions: state.captions.slice(-40), scan: state.scan });
export const monitorState = pub;

// ---------- the whisper worker: one python process that keeps the model loaded ----------
function worker(): ChildProcess {
  if (whisper && !whisper.killed && whisper.exitCode == null) return whisper;
  const script = `import sys, json, mlx_whisper
PROMPT = "Amateur radio repeater traffic. Callsigns like K2ABC, W2XYZ, N2QRZ, KD2ABC; phonetics alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey x-ray yankee zulu; 73, QSL, CQ, mobile, handheld, net control."
for line in sys.stdin:
    p = line.strip()
    if not p: continue
    try:
        r = mlx_whisper.transcribe(
            p,
            path_or_hf_repo=${JSON.stringify(MODEL)},
            language="en",
            initial_prompt=PROMPT,
            condition_on_previous_text=False,
            temperature=0,
            no_speech_threshold=0.85,
            logprob_threshold=-1.5,
            verbose=False,
            fp16=True
        )
        out = {"path": p, "text": r.get("text", "").strip(), "segments": [{"s": round(s["start"], 1), "e": round(s["end"], 1), "t": s["text"].strip(), "p": s.get("no_speech_prob")} for s in r.get("segments", [])]}
        print(json.dumps(out), flush=True)
    except Exception as e:
        print(json.dumps({"path": p, "error": str(e)}), flush=True)
`;
  whisper = spawn(PY, ["-u", "-c", script], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  whisper.stdout!.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const row = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const start = row.indexOf("{");
      if (start >= 0) {
        try {
          const j = JSON.parse(row.slice(start));
          pending.get(j.path)?.(j);
          pending.delete(j.path);
        } catch {}
      }
    }
  });
  whisper.stderr!.on("data", (d) => { const t = String(d); if (!/it\/s|Fetching|%\|/.test(t)) console.warn("whisper:", t.trim().slice(0, 200)); });
  whisper.on("exit", (c) => { console.warn(`whisper worker exited (${c})`); whisper = null; for (const [, r] of pending) r({ error: "worker exited" }); pending.clear(); });
  return whisper;
}
export const transcribeLocal = (file: string) => new Promise<any>((resolve) => { pending.set(file, resolve); worker().stdin!.write(file + "\n"); setTimeout(() => { if (pending.has(file)) { pending.delete(file); resolve({ error: "timeout" }); } }, 90_000); });
const transcribe = (file: string) => process.env.HOST_BRIDGE
  ? fetch(`${process.env.HOST_BRIDGE}/whisper`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: path.basename(file) }), signal: AbortSignal.timeout(90_000) }).then((r) => r.json()).catch((e) => ({ error: (e as Error).message }))
  : transcribeLocal(file);

async function processQueue() {
  if (queueBusy || !audioQueue.length) return;
  queueBusy = true;
  state.transcribing = audioQueue.length;
  send("state", pub());

  while (audioQueue.length > 0) {
    const job = audioQueue.shift()!;
    state.transcribing = audioQueue.length + 1;
    send("state", pub());

    const file = path.join(DIR, `utt-${Date.now()}-${job.seq}.wav`);
    try {
      await mkdir(DIR, { recursive: true });
      await writeFile(file, wav16(job.pcm));
      const res = await transcribe(file);
      await unlink(file).catch(() => {});

      const text = String(res?.text ?? "").trim();
      if (text && !res?.error && (text.match(/[A-Za-z0-9]/g) ?? []).length >= 2 && !isHallucination(text)) {
        const calls: Call[] = [];
        for (const c of findCallsigns(text).slice(0, 4)) {
          const d: any = await fccLookup(c.call).catch(() => null);
          calls.push(d?.found ? {
            call: c.call,
            found: true,
            name: d.name,
            cls: d.licenseClass ?? d.type,
            grid: d.grid,
            lat: d.lat,
            lon: d.lon,
            city: String(d.address ?? "").split(",").slice(-2).join(",").trim(),
            how: c.how
          } : { call: c.call, found: false, how: c.how });
        }
        const cap: Caption = {
          at: job.at,
          text,
          seconds: +(job.pcm.length / AUDIO_FS).toFixed(1),
          calls,
          mhz: job.mhz,
          label: job.label
        };
        state.captions.push(cap);
        if (state.captions.length > 250) state.captions.shift();
        send("caption", cap);
      }
    } catch (err: any) {
      console.warn("transcribe queue error:", err?.message);
    }
  }

  queueBusy = false;
  state.transcribing = 0;
  send("state", pub());
}

function enqueueAudio(pcm: Int16Array, mhz: number, label: string) {
  if (pcm.length < MIN_UTT_S * AUDIO_FS) return;
  audioQueue.push({
    pcm,
    mhz,
    label,
    at: new Date().toISOString(),
    seq: ++jobSeq
  });
  void processQueue();
}

// ---------- callsigns in text: "K2ABC", "K 2 A B C", "kilo two alpha bravo charlie" ----------
const NATO: Record<string, string> = { ALPHA: "A", ALFA: "A", BRAVO: "B", CHARLIE: "C", DELTA: "D", ECHO: "E", FOXTROT: "F", GOLF: "G", HOTEL: "H", INDIA: "I", JULIET: "J", JULIETT: "J", KILO: "K", LIMA: "L", MIKE: "M", NOVEMBER: "N", OSCAR: "O", PAPA: "P", QUEBEC: "Q", ROMEO: "R", SIERRA: "S", TANGO: "T", UNIFORM: "U", VICTOR: "V", WHISKEY: "W", WHISKY: "W", XRAY: "X", "X-RAY": "X", YANKEE: "Y", ZULU: "Z",
  ZERO: "0", ONE: "1", TWO: "2", THREE: "3", FOUR: "4", FIVE: "5", SIX: "6", SEVEN: "7", EIGHT: "8", NINE: "9", NINER: "9", // and the ones hams actually say
  KING: "K", QUEEN: "Q", ZEBRA: "Z", SUGAR: "S", GERMANY: "G", JAPAN: "J", MEXICO: "M", NORWAY: "N", ITALY: "I", DENMARK: "D", CANADA: "C", AMERICA: "A", BOSTON: "B", HENRY: "H", LONDON: "L", NANCY: "N", PETER: "P", RADIO: "R", THOMAS: "T", UNION: "U", WILLIAM: "W", YOUNG: "Y", OCEAN: "O", FRANCE: "F", ENGLAND: "E", TEXAS: "T", DAVID: "D", EDWARD: "E", FRANK: "F", GEORGE: "G" };
const CALL = /^(?:[A-Z]{1,2}\d{1,2}[A-Z]{1,4}|\d[A-Z]\d[A-Z]{1,3})$/, US = /^(?:[KNW][A-Z]?|A[A-L][A-Z]?)\d[A-Z]{1,3}$/;
export function findCallsigns(text: string): { call: string; how: "spoken" | "phonetic" }[] {
  const out = new Map<string, "spoken" | "phonetic">();
  const words = text.toUpperCase().replace(/[^A-Z0-9\- ]/g, " ").split(/\s+/).filter(Boolean);
  for (const w of words) { const c = w.replace(/-/g, ""); if (c.length >= 4 && c.length <= 7 && CALL.test(c) && /\d/.test(c) && /[A-Z]/.test(c)) out.set(c, "spoken"); }
  // runs of spelled-out characters (phonetics, digits, single letters) → candidate strings
  let run: string[] = [];
  const flush = () => { if (run.length >= 4) { const s = run.join(""); for (let a = 0; a < run.length; a++) for (let b = Math.min(run.length, a + 7); b - a >= 4; b--) { const c = run.slice(a, b).join(""); if (CALL.test(c) && !out.has(c)) { out.set(c, "phonetic"); a = b; break; } } void s; } run = []; };
  for (const w of words) { const ch = NATO[w] ?? (w.length === 1 ? w : null); if (ch) run.push(ch); else flush(); }
  flush();
  return [...out].map(([call, how]) => ({ call, how })).filter(({ call, how }) => US.test(call) || how === "spoken");
}

// ---------- the radio chain ----------
function wav16(samples: Int16Array) {
  const h = Buffer.alloc(44), n = samples.length * 2;
  h.write("RIFF", 0); h.writeUInt32LE(36 + n, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(AUDIO_FS, 24); h.writeUInt32LE(AUDIO_FS * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, n)]);
}
const WAV_HEAD = (() => { const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(0xffffffff, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(AUDIO_FS, 24); h.writeUInt32LE(AUDIO_FS * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(0xffffffff, 40); return h; })();

async function run(mhz: number, mode: "NFM" | "WFM", ac: AbortController) {
  const hz = Math.round(mhz * 1e6);
  const r = await fetch(`${SDR}/api/stream?id=monitor&center=${hz}&width=${WIDTH}`, { headers: { "x-via-ihor": "1" }, signal: ac.signal });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `SDR ${r.status}`);
  const fs = Number(r.headers.get("x-sample-rate")) || WIDTH, center = Number(r.headers.get("x-center")) || hz;
  const rx = new Receiver(fs, hz - center, mode, mode === "WFM" ? 150e3 : 12.5e3);
  // the squelch compares the channel's power with the empty air 80 kHz either side (whichever is quieter): a carrier
  // is 6–40 dB above that, hiss is not, and a transmission that never ends can't fool it. WFM broadcasts aren't squelched.
  const sides = mode === "NFM" ? [80e3, -80e3].map((off) => new Receiver(fs, hz - center + off, "NFM", 12.5e3)) : [];
  const power = (ch: Float32Array) => { let p = 0; for (let i = 0; i < ch.length; i += 2) p += ch[i] ** 2 + ch[i + 1] ** 2; return 10 * Math.log10(p / Math.max(1, ch.length / 2) + 1e-12); };
  const down = new FirDecimator(firLowpass(6.5e3 / rx.audioFs, 2e3 / rx.audioFs), Math.round(rx.audioFs / AUDIO_FS), 1);
  state.since = new Date().toISOString(); state.error = ""; send("state", pub());
  let chunks = 0, open = false, closedFor = 0, utt: Int16Array[] = [], uttLen = 0, utStart = 0, rest = new Uint8Array(0);
  // Scanning: the slice hops from channel to channel (instant inside the dongle's window; outside it the dongle retunes),
  // listens DWELL seconds, and holds on a channel while it's busy and HANG seconds after, like a scanner radio.
  let settle = 0, dwell = SCAN_DWELL, hopping = false, fails = 0, window0 = 0, onFor = 0;
  const hop = async () => {
    const sc = state.scan!; hopping = true; onFor = 0;
    if (open) { open = false; state.open = false; closedFor = 0; send("squelch", { open: false, db: null, snr: null, mhz: state.mhz }); } // leaving a channel that's still busy
    sc.i = (sc.i + 1) % sc.list.length; const ch = sc.list[sc.i];
    if (!sc.i) { if (sc.roundStart) sc.round = Math.round((Date.now() - sc.roundStart) / 1000); sc.roundStart = Date.now(); } // how long a round takes: a transmission shorter than that may be missed
    state.mhz = ch.mhz; state.label = ch.label;
    const r: any = await fetch(`${SDR}/api/slice`, { method: "POST", headers: { "content-type": "application/json", "x-via-ihor": "1" }, body: JSON.stringify({ id: "monitor", center: Math.round(ch.mhz * 1e6) }), signal: ac.signal }).then((x) => x.json()).catch((e) => ({ error: e.message }));
    if (ac.signal.aborted) return;
    if (r.error) { if (++fails >= sc.list.length) { stopMonitor("scan blocked"); state.error = `Can't scan: ${r.error}`; send("state", pub()); return; } settle = 0; dwell = 0; }
    else { fails = 0; settle = r.window?.[0] !== window0 ? 0.35 : 0.12; window0 = r.window?.[0]; dwell = SCAN_DWELL; } // skip what was in flight (and the retune)
    hopping = false; send("scan", { i: sc.i, mhz: ch.mhz, label: ch.label, round: sc.round });
  };
  const OVERLAP_SAMPLES = Math.round(OVERLAP_S * AUDIO_FS);
  const flushUtt = (isContinuation = false) => {
    if (!uttLen) return;
    const n = uttLen; const pcm = new Int16Array(n); let o = 0; for (const part of utt) { pcm.set(part, o); o += part.length; }
    if (isContinuation && n > OVERLAP_SAMPLES) {
      const overlap = pcm.slice(n - OVERLAP_SAMPLES);
      utt = [overlap];
      uttLen = overlap.length;
    } else {
      utt = [];
      uttLen = 0;
    }
    enqueueAudio(pcm, state.mhz, state.label);
  };
  const reader = r.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const bytes = rest.length ? Buffer.concat([rest, value]) : value, n = bytes.length & ~1, iq = new Float32Array(n);
    for (let i = 0; i < n; i++) iq[i] = (bytes[i] - 127.5) / 127.5;
    rest = bytes.subarray(n);
    const st = rx.process(iq), db = power(st.channel);
    const noise = sides.length ? Math.min(...sides.map((r) => power(r.process(iq).channel))) : -Infinity, snr = db - noise;
    const sec = iq.length / 2 / fs;
    if (state.scan && (hopping || settle > 0)) { settle -= sec; continue; }
    const on = mode === "WFM" || (++chunks > 15 && snr > 5); // the dongle needs a moment to settle. 5 dB: empty 2 m channels measure 0–1, and a weak repeater (146.955 MHz on the HackRF) sat at 6–8, muted by the old 10
    if (on) closedFor = 0; else closedFor += sec;
    const nowOpen = on || (open && closedFor < SQUELCH_HANG_S);
    if (nowOpen !== open) {
      open = nowOpen; state.open = open; send("squelch", { open, db: +db.toFixed(1), snr: Number.isFinite(snr) ? +snr.toFixed(1) : null, mhz: state.mhz }); if (open) utStart = Date.now();
      if (open && state.scan) { state.scan.hits[state.mhz] = new Date().toISOString(); send("hit", { mhz: state.mhz, label: state.label, at: state.scan.hits[state.mhz] }); }
    }
    const a = down.process(st.audio), pcm = new Int16Array(a.length);
    if (open) for (let i = 0; i < a.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(a[i] * 24000)));
    const chunk = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (const e of ears) e.write(chunk);
    if (open) {
      utt.push(pcm);
      uttLen += pcm.length;
      if (uttLen >= MAX_UTT_S * AUDIO_FS) flushUtt(true);
    } else if (uttLen) {
      flushUtt(false);
    }
    if (state.scan && chunks > 15) {
      if ((onFor += sec) > SCAN_MAX_HOLD) { if (uttLen) flushUtt(false); void hop(); } // a channel that never goes quiet doesn't stop the scan
      else if (open) dwell = SCAN_HANG; else if ((dwell -= sec) <= 0 && !uttLen) void hop();
    }
    if (Date.now() - lastViewer > IDLE_MS && !viewers.size) { stopMonitor("nobody listening"); break; }
  }
}

export async function startMonitor(mhz: number, label = "", mode: "NFM" | "WFM" = "NFM", scan: Scan | null = null) {
  if (!(mhz >= 24 && mhz <= 1766)) throw new Error("Frequency must be 24–1766 MHz");
  stopMonitor("retuning", true);
  state = { ...state, on: true, mhz, label: label.slice(0, 60), mode, open: false, error: "", captions: state.mhz === mhz || scan || state.scan ? state.captions : [], scan };
  const ac = new AbortController(); abort = ac; lastViewer = Date.now();
  worker(); // warm the model while the dongle tunes
  run(mhz, mode, ac).catch((e) => { if (ac.signal.aborted) return; state.error = e.message; state.on = false; state.open = false; send("state", pub()); console.warn("monitor:", e.message); });
  return pub();
}
/** Scan a list of FM channels (repeater outputs) in a loop; channels that carry a transmission are kept in scan.hits. */
export function startScan(list: unknown) {
  const chans = (Array.isArray(list) ? list : []).map((c: any) => ({ mhz: +Number(c?.mhz).toFixed(4), label: String(c?.label ?? "").slice(0, 40) }))
    .filter((c) => c.mhz >= 24 && c.mhz <= 1766).filter((c, i, a) => a.findIndex((d) => d.mhz === c.mhz) === i).slice(0, SCAN_MAX);
  if (chans.length < 2) throw new Error("Pick at least two repeaters to scan.");
  return startMonitor(chans[0].mhz, chans[0].label, "NFM", { list: chans, i: 0, hits: {} });
}
export function stopMonitor(why = "stopped", quiet = false) {
  abort?.abort(); abort = null;
  // what was said stays only with those who listened (their page keeps it)
  if (!quiet) { audioQueue.length = 0; state = { ...state, on: false, open: false, error: "", captions: [], scan: null, transcribing: 0 }; send("state", pub()); for (const e of ears) e.end(); ears.clear(); }
  void why;
}
/** Server-sent events for the page: state, squelch, caption. */
export function monitorEvents(res: import("node:http").ServerResponse) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
  const v = { res }; viewers.add(v); lastViewer = Date.now();
  res.write(`event: state\ndata: ${JSON.stringify(monitorState())}\n\n`);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  res.on("close", () => { viewers.delete(v); clearInterval(ping); lastViewer = Date.now(); send("state", pub()); });
}
/** The demodulated audio as an endless WAV (16 kHz mono), squelched. */
export function monitorAudio(res: import("node:http").ServerResponse) {
  res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store", "x-accel-buffering": "no" });
  res.write(WAV_HEAD); ears.add(res); lastViewer = Date.now();
  res.on("close", () => ears.delete(res));
}
