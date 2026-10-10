// Listen to a repeater on the server SDR, with live captions and a callsign detector (a reverse-beacon of our own):
// the dongle server streams a 240 kHz slice around the frequency → NFM demodulation in TypeScript (radio/src/dsp.ts)
// → a carrier squelch cuts the audio into transmissions → each one goes to Whisper on this Mac (mlx_whisper, local)
// → callsigns in the text (spoken plainly or in phonetics) are looked up in the FCC database and pinned on the map.
// One monitor at a time (one dongle); everyone on the page hears and reads the same thing. It stops after ten quiet
// minutes without anyone watching.
import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, unlink, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Receiver, firLowpass, FirDecimator } from "./radio/src/dsp.ts";
import { callsign as fccLookup } from "./ham.ts";

const SDR = `http://127.0.0.1:${process.env.SDR_PORT ?? 8073}`;
const PY = process.env.WHISPER_PY ?? "/Users/irishdash/AI/venv/bin/python3";
const MODEL = process.env.WHISPER_MODEL ?? "mlx-community/whisper-large-v3-mlx";
const DIR = path.join(import.meta.dirname, "data", "monitor");
const HEARD_FILE = path.join(import.meta.dirname, "data", "heard.json");
const WIDTH = 240_000, AUDIO_FS = 16_000, IDLE_MS = 10 * 60_000, MAX_UTT_S = 25, MIN_UTT_S = 0.7;

export type Caption = { at: string; text: string; seconds: number; calls: Call[] };
export type Call = { call: string; found: boolean; name?: string; cls?: string; grid?: string; lat?: number; lon?: number; city?: string; how: "spoken" | "phonetic" };
export type Spot = { call: string; at: string; mhz: number; label: string; name?: string; cls?: string; grid?: string; lat?: number; lon?: number; city?: string; text: string; times: number };

type Viewer = { res: import("node:http").ServerResponse };
const viewers = new Set<Viewer>(), ears = new Set<import("node:http").ServerResponse>();
let state = { on: false, mhz: 0, label: "", mode: "NFM" as "NFM" | "WFM", open: false, since: "", error: "", captions: [] as Caption[], transcribing: 0 };
let heard: Spot[] = [];
let abort: AbortController | null = null, lastViewer = Date.now(), whisper: ChildProcess | null = null;
const pending = new Map<string, (r: any) => void>();

const send = (ev: string, data: unknown) => { const line = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`; for (const v of viewers) v.res.write(line); };
const pub = () => ({ on: state.on, mhz: state.mhz, label: state.label, mode: state.mode, open: state.open, since: state.since, error: state.error, transcribing: state.transcribing, viewers: viewers.size, captions: state.captions.slice(-40) });
export const monitorState = () => ({ ...pub(), heard: heard.slice(-60) });

// ---------- the whisper worker: one python process that keeps the model loaded ----------
function worker(): ChildProcess {
  if (whisper && !whisper.killed && whisper.exitCode == null) return whisper;
  const script = `import sys, json, mlx_whisper
PROMPT = "Amateur radio repeater traffic. Callsigns like K2ABC, W2XYZ, N2QRZ, KD2ABC; phonetics alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey x-ray yankee zulu; 73, QSL, CQ, mobile, handheld, net control."
for line in sys.stdin:
    p = line.strip()
    if not p: continue
    try:
        r = mlx_whisper.transcribe(p, path_or_hf_repo=${JSON.stringify(MODEL)}, language="en", initial_prompt=PROMPT, condition_on_previous_text=False, temperature=0, no_speech_threshold=0.5, fp16=True)
        print(json.dumps({"path": p, "text": r.get("text", "").strip(), "segments": [{"s": round(s["start"], 1), "e": round(s["end"], 1), "t": s["text"].strip(), "p": s.get("no_speech_prob")} for s in r.get("segments", [])]}), flush=True)
    except Exception as e:
        print(json.dumps({"path": p, "error": str(e)}), flush=True)
`;
  whisper = spawn(PY, ["-u", "-c", script], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  whisper.stdout!.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const row = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(row); pending.get(j.path)?.(j); pending.delete(j.path); } catch {} } });
  whisper.stderr!.on("data", (d) => { const t = String(d); if (!/it\/s|Fetching|%\|/.test(t)) console.warn("whisper:", t.trim().slice(0, 200)); });
  whisper.on("exit", (c) => { console.warn(`whisper worker exited (${c})`); whisper = null; for (const [, r] of pending) r({ error: "worker exited" }); pending.clear(); });
  return whisper;
}
const transcribe = (file: string) => new Promise<any>((resolve) => { pending.set(file, resolve); worker().stdin!.write(file + "\n"); setTimeout(() => { if (pending.has(file)) { pending.delete(file); resolve({ error: "timeout" }); } }, 90_000); });

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
  return [...out].map(([call, how]) => ({ call, how })).filter(({ call }) => US.test(call) || how === "spoken");
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
  const down = new FirDecimator(firLowpass(6.5e3 / rx.audioFs, 2e3 / rx.audioFs), Math.round(rx.audioFs / AUDIO_FS), 1);
  state.since = new Date().toISOString(); state.error = ""; send("state", pub());
  const ring: number[] = []; // channel power per chunk over the last ~10 min: the quietest chunk is the noise floor
  let floor = Infinity, open = false, closedFor = 0, utt: Int16Array[] = [], uttLen = 0, utStart = 0, rest = new Uint8Array(0);
  const finish = async () => {
    const n = uttLen; const pcm = new Int16Array(n); let o = 0; for (const part of utt) { pcm.set(part, o); o += part.length; }
    utt = []; uttLen = 0;
    if (n < MIN_UTT_S * AUDIO_FS) return;
    const file = path.join(DIR, `utt-${Date.now()}.wav`);
    await mkdir(DIR, { recursive: true }); await writeFile(file, wav16(pcm));
    state.transcribing++; send("state", pub());
    const res = await transcribe(file); unlink(file).catch(() => {});
    state.transcribing--;
    const text = String(res?.text ?? "").trim();
    if (!text || res?.error || (text.match(/[A-Za-z0-9]/g) ?? []).length < 3) { send("state", pub()); return; } // nothing, or noise heard as punctuation
    const calls: Call[] = [];
    for (const c of findCallsigns(text).slice(0, 4)) {
      const d: any = await fccLookup(c.call).catch(() => null);
      calls.push(d?.found ? { call: c.call, found: true, name: d.name, cls: d.licenseClass ?? d.type, grid: d.grid, lat: d.lat, lon: d.lon, city: String(d.address ?? "").split(",").slice(-2).join(",").trim(), how: c.how } : { call: c.call, found: false, how: c.how });
    }
    const cap: Caption = { at: new Date().toISOString(), text, seconds: +(n / AUDIO_FS).toFixed(1), calls };
    state.captions.push(cap); if (state.captions.length > 200) state.captions.shift();
    for (const c of calls.filter((x) => x.found)) {
      const recent = heard.find((s) => s.call === c.call && s.mhz === state.mhz && Date.now() - Date.parse(s.at) < 15 * 60e3);
      if (recent) { recent.times++; recent.at = cap.at; recent.text = text.slice(0, 160); }
      else heard.push({ call: c.call, at: cap.at, mhz: state.mhz, label: state.label, name: c.name, cls: c.cls, grid: c.grid, lat: c.lat, lon: c.lon, city: c.city, text: text.slice(0, 160), times: 1 });
      if (heard.length > 500) heard.shift();
      writeFile(HEARD_FILE, JSON.stringify(heard.slice(-500))).catch(() => {});
    }
    send("caption", cap); send("state", pub());
  };
  const reader = r.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const bytes = rest.length ? Buffer.concat([rest, value]) : value, n = bytes.length & ~1, iq = new Float32Array(n);
    for (let i = 0; i < n; i++) iq[i] = (bytes[i] - 127.5) / 127.5;
    rest = bytes.subarray(n);
    const st = rx.process(iq);
    // carrier squelch on the channel's power (dB); the floor follows the quietest moments
    let p = 0; for (let i = 0; i < st.channel.length; i += 2) p += st.channel[i] ** 2 + st.channel[i + 1] ** 2;
    const db = 10 * Math.log10(p / Math.max(1, st.channel.length / 2) + 1e-12);
    ring.push(db); if (ring.length > 4400) ring.shift();
    floor = ring.length < 15 ? Infinity : Math.min(...ring); // the dongle needs a moment to settle, then the quietest recent chunk is the floor
    const sec = iq.length / 2 / fs, on = db > floor + 7;
    if (on) closedFor = 0; else closedFor += sec;
    const nowOpen = on || (open && closedFor < 0.7);
    if (nowOpen !== open) { open = nowOpen; state.open = open; send("squelch", { open, db: +db.toFixed(1), floor: +floor.toFixed(1) }); if (open) utStart = Date.now(); }
    const a = down.process(st.audio), pcm = new Int16Array(a.length);
    if (open) for (let i = 0; i < a.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(a[i] * 24000)));
    const chunk = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (const e of ears) e.write(chunk);
    if (open) { utt.push(pcm); uttLen += pcm.length; if (uttLen >= MAX_UTT_S * AUDIO_FS) finish(); }
    else if (uttLen) finish();
    if (Date.now() - lastViewer > IDLE_MS && !viewers.size) { stopMonitor("nobody listening"); break; }
  }
}

export async function startMonitor(mhz: number, label = "", mode: "NFM" | "WFM" = "NFM") {
  if (!(mhz >= 24 && mhz <= 1766)) throw new Error("Frequency must be 24–1766 MHz");
  stopMonitor("retuning", true);
  state = { ...state, on: true, mhz, label: label.slice(0, 60), mode, open: false, error: "", captions: state.mhz === mhz ? state.captions : [] };
  const ac = new AbortController(); abort = ac; lastViewer = Date.now();
  worker(); // warm the model while the dongle tunes
  run(mhz, mode, ac).catch((e) => { if (ac.signal.aborted) return; state.error = e.message; state.on = false; state.open = false; send("state", pub()); console.warn("monitor:", e.message); });
  return pub();
}
export function stopMonitor(why = "stopped", quiet = false) {
  abort?.abort(); abort = null;
  if (!quiet) { state = { ...state, on: false, open: false, error: "" }; send("state", pub()); for (const e of ears) e.end(); ears.clear(); }
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
export const heardLog = () => heard.slice(-200);
readFile(HEARD_FILE, "utf8").then((t) => { heard = JSON.parse(t); }).catch(() => {});
