// "My SDR": serves the built page and owns the dongle on this computer. One mode at a time:
//   iq   — raw samples for Spectrum Lab listeners (/api/stream)
//   aprs — our AFSK modem on 144.39 MHz, stations pushed to /api/aprs/events
//   adsb — our Mode S decoder on 1090 MHz, aircraft pushed to /api/adsb/events
// A decoder starts on request when nobody listens to raw samples. Spectrum Lab (raw samples) always wins:
// it pauses a running decoder, which resumes by itself afterwards if anyone is still watching it.
// Plain HTTP: on the internet it sits behind ihor.sh's proxy.
// Usage: npm run serve   (env: PORT=8073, RATE=1024000, REF_LAT/REF_LON = receiver location)
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openDongle, resetDongle, looksStalled, type Sdr } from "./scripts/node-usb.ts";
import { HackRf } from "./src/hackrf.ts";
import { bandKey } from "./src/bandplan.ts";
import { decodeCU8 } from "./src/iq.ts";
import { avgSpectrum, firLowpass, FirDecimator } from "./src/dsp.ts";
import { AprsReceiver, Stations } from "./src/aprs.ts";
import { Tracker, demodulate, magnitude } from "./src/adsb.ts";

const PORT = Number(process.env.PORT ?? 8073);
const RATE = Number(process.env.RATE ?? 2_400_000); // the shared window: listeners get slices of it, not all of it
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
let paused: Decoder | null = null; // a decoder Spectrum Lab interrupted, to resume when it's done
const watchers: Record<Decoder, Set<http.ServerResponse>> = { aprs: new Set(), adsb: new Set() };
// Viewers check in every 30 s and say goodbye when they leave; a tunnel doesn't always pass a closed
// connection on, so anyone silent for 90 s is dropped too.
const viewerIds = new Map<string, { res: http.ServerResponse; seen: number }>();
setInterval(() => { for (const [id, v] of viewerIds) if (Date.now() - v.seen > 90_000) { viewerIds.delete(id); v.res.destroy(); } }, 15_000);
let aprsRx: AprsReceiver | null = null;
const stations = new Stations();
const tracker = new Tracker(REF.lat, REF.lon);
let adsbTail = new Float32Array(0), adsbDirty = false;

const tuning = { center: 98.45e6, gain: 30 as number | null, lna: 24, vga: 24, amp: false }; // gain: the RTL-SDR's; lna/vga/amp: the HackRF's

// Two radios, whichever is plugged in. The RTL-SDR: a 2.4 MHz window. The HackRF: 9.6 MS/s through an 8 MHz baseband
// filter, an 8 MHz window that still divides evenly into the 240 kHz and 1.2 MHz slices (÷40, ÷8).
const HACKRF_RATE = 9_600_000, HACKRF_FILTER = 8_000_000;
// Where the HackRF's 14 dB RF amp may not be on: bands with strong transmitters around NYC, which can overload it (and,
// close enough, damage it). LNA and VGA gain can't hurt the radio, only clip the signal; the watchdog below handles that.
const LOUD: [number, number, string][] = [[87.5e6, 108e6, "FM broadcast"], [174e6, 216e6, "VHF TV"], [512e6, 608e6, "UHF TV"], [617e6, 652e6, "cellular"], [728e6, 757e6, "cellular"], [860e6, 894e6, "cellular"], [929e6, 932e6, "paging"]];
const ampBlocked = (center = tuning.center) => { const h = half(), b = LOUD.find(([lo, hi]) => center + h > lo && center - h < hi); return b ? `${b[2]} (${b[0] / 1e6}–${b[1] / 1e6} MHz) is in the window` : ""; };
/** The HackRF's gains as tuning says, with the amp forced off where it isn't allowed. */
async function applyHackrf(s: Sdr | null = sdr) {
  if (!(s instanceof HackRf)) return;
  if (tuning.amp && ampBlocked()) tuning.amp = false;
  await s.setGains(tuning.lna, tuning.vga);
  if (s.amp !== tuning.amp) await s.setAmp(tuning.amp);
}

// Gain is remembered per band (kept in gains.json): FM broadcast wants far less than a 2 m repeater, so moving the
// window into another band brings back what was last set there.
// The satellite server (:8074) keeps its own file: in a shared one, one server's change to a band's gain also rewrote the
// other's (2026-10-16: :8074 started at 32.8 dB next time, 15% clipped).
const GAINS_FILE = path.resolve(import.meta.dirname, PORT === 8073 ? "gains.json" : `gains-${PORT}.json`); // git-ignored
type Gains = { gain: number | null; lna: number; vga: number; amp: boolean };
const gainMemory: Record<string, Gains> = await readFile(GAINS_FILE, "utf8").then(JSON.parse).catch(() => ({}));
let gainBand = bandKey(tuning.center);
Object.assign(tuning, gainMemory[gainBand] ?? {}); // start with what was last set in the band it starts in
function rememberGain() {
  gainMemory[gainBand] = { gain: tuning.gain, lna: tuning.lna, vga: tuning.vga, amp: tuning.amp };
  const mine = gainMemory[gainBand], band = gainBand; // merged into the file: bands set before stay
  readFile(GAINS_FILE, "utf8").then(JSON.parse).catch(() => ({}))
    .then((disk) => writeFile(GAINS_FILE, JSON.stringify({ ...disk, [band]: mine }, null, 1))).catch(() => {});
}
/** After the window moved: into another band, that band's gain (if any was set there) on the radio. */
async function followBand() {
  const k = bandKey(tuning.center);
  if (k === gainBand) return;
  gainBand = k;
  const m = gainMemory[k];
  if (!m) return;
  Object.assign(tuning, m);
  if (mode !== "iq") return;
  if (sdr instanceof HackRf) await applyHackrf(); else await sdr?.setGain(tuning.gain);
}

// The ADC's level, from every 7th byte: RMS in dBFS and the share of samples at the rails, shown on the pages. Clipping
// with the HackRF's RF amp on switches the amp off (the one stage strong signals can harm); LNA and VGA only distort
// when too high, so they stay where the listener set them (an automatic LNA/VGA backoff kept muting weak 2 m repeaters).
let acc = { sum: 0, n: 0, clip: 0, at: Date.now() }, level = { dbfs: -99, clipPct: 0 }, protectNote: { text: string; at: number } | null = null, lastProtect = 0;
function measure(chunk: Uint8Array) {
  for (let i = 0; i < chunk.length; i += 7) { const v = chunk[i] - 127.5; acc.sum += v * v; acc.n++; if (v * v >= 126 ** 2) acc.clip++; }
  if (Date.now() - acc.at < 500) return;
  level = { dbfs: +(10 * Math.log10(acc.sum / acc.n / 127.5 ** 2 + 1e-12)).toFixed(1), clipPct: +((100 * acc.clip) / acc.n).toFixed(2) };
  acc = { sum: 0, n: 0, clip: 0, at: Date.now() };
  if (level.clipPct > 0.2 && tuning.amp && mode === "iq" && sdr instanceof HackRf && Date.now() - lastProtect > 1500) void protect(sdr);
  tellBand(); // twice a second: the meters on the pages
}
async function protect(s: HackRf) {
  lastProtect = Date.now();
  tuning.amp = false;
  const text = "RF amp switched off";
  protectNote = { text: `${text}: the signal was clipping (${level.clipPct}% of samples at full scale)`, at: Date.now() };
  rememberGain(); // what's safe here is what this band gets next time
  console.log(`protect: ${protectNote.text}`);
  await applyHackrf(s).catch((e) => console.error("protect:", e.message));
}
const clients = new Set<http.ServerResponse>();
const congested = new Set<http.ServerResponse>();
let sdr: Sdr | null = null;
let streaming: Promise<void> | null = null;
let opening: Promise<Sdr> | null = null;
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

// Stall watchdog: now and then, check that the dongle sends samples and not a replayed buffer; if it
// does, USB-reset it and reopen in the same mode (listeners and viewers stay connected).
let chunkCount = 0, recovering = false;
async function recover(why = "stalled (replaying a buffer)") {
  if (recovering) return;
  recovering = true;
  const want = mode === "idle" ? "iq" : mode, hackrf = sdr instanceof HackRf;
  console.error(`dongle ${why} in ${want} mode: resetting it`);
  try {
    await release();
    console.log(`USB reset: ${(await resetDongle(hackrf)) ? "ok" : "failed"}`);
    await new Promise((r) => setTimeout(r, 2500)); // re-enumeration
    if (want !== "iq" || listening()) { await ensureSdr(want); if (want !== "iq") push(want, "online", { mode: want }); }
  } catch (e) { console.error("recovery failed:", (e as Error).message); }
  finally { recovering = false; }
}

/** Every chunk from the dongle goes where the current mode needs it. */
function onChunk(chunk: Uint8Array) {
  if (++chunkCount % 64 === 8 && !recovering && looksStalled(chunk)) { recover(); return; }
  measure(chunk);
  if (scanSink) return scanSink(decodeCU8(chunk));
  if (mode === "iq") {
    fanOut(chunk); // raw listeners (on this computer's network only)
    if (slices.size || overviewers.size) { const x = decodeCU8(chunk); for (const sl of slices.values()) sliceOut(sl, x); overview(x); }
    return;
  }
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

// ---------- FM band scan ----------
// Which broadcast FM channels this antenna actually hears. Hop across 88–108 MHz 0.8 MHz at a time: each hop holds four
// US channels (odd tenths) at ±100 and ±300 kHz from center, so none sits on the dongle's DC spike. A channel's level
// is its ±75 kHz average against the hop's quiet bins (10th percentile: in a busy band the median is a station).
// Runs only while nobody uses the dongle (~8 s), and the result is kept for 10 minutes.
let scanSink: ((x: Float32Array) => void) | null = null;
const SCAN_FILE = path.resolve(import.meta.dirname, "fm-scan.json"); // kept across restarts (git-ignored)
let scanResult: { at: number; gain: number | null; channels: { mhz: number; snrDb: number }[] } | null = await readFile(SCAN_FILE, "utf8").then(JSON.parse).catch(() => null);
let scanning: Promise<typeof scanResult> | null = null;
const collect = (n: number) => new Promise<Float32Array>((done) => {
  const parts: Float32Array[] = [];
  let have = 0, skip = 1; // the first chunk after a retune may straddle it
  scanSink = (x) => {
    if (skip-- > 0) return;
    parts.push(x); have += x.length / 2;
    if (have < n) return;
    scanSink = null;
    const out = new Float32Array(2 * have); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    done(out);
  };
});
async function scanFm() {
  if (mode !== "idle" || listening() || opening) throw new Error("The dongle is busy right now (someone is listening or watching a decoder). Try again in a few minutes.");
  const s = await ensureSdr("iq"), fs = s.sampleRate, channels: { mhz: number; snrDb: number }[] = [];
  try {
    for (let c = 88.4e6; c <= 107.7e6; c += 0.8e6) {
      await s.setCenterFrequency(c);
      const db = avgSpectrum(await collect(fs * 0.1), 1024, 32), bin = fs / 1024; // 1 kHz bins at 1.024 MS/s
      const quiet = db.slice().sort()[Math.floor(db.length * 0.1)];
      for (const off of [-300e3, -100e3, 100e3, 300e3]) {
        const mhz = +((c + off) / 1e6).toFixed(1);
        if (mhz < 88 || mhz > 108) continue;
        let p = 0, k = 0;
        for (let f = off - 75e3; f <= off + 75e3; f += bin) { p += 10 ** (db[Math.round(f / bin + 512)] / 10); k++; }
        channels.push({ mhz, snrDb: +(10 * Math.log10(p / k) - quiet).toFixed(1) });
      }
    }
  } finally {
    scanSink = null;
    if (listening()) await s.setCenterFrequency(tuning.center).catch(() => {}); // someone joined meanwhile: back to their tuning
    else await release();
  }
  scanResult = { at: Date.now(), gain: tuning.gain, channels };
  await writeFile(SCAN_FILE, JSON.stringify(scanResult)).catch(() => {});
  return scanResult;
}

// ---------- slices: each listener gets just their part of the band ----------
// The dongle captures a 2.4 MHz window; sending all of it costs 4.8 MB/s per listener. Instead every listener gets a
// slice around their own station: mixed to 0 Hz, low-passed and decimated here (2.4 MS/s → 480 k → 240 k, or one
// stage to 1.2 M), 8-bit like the dongle's own bytes. Slices are absolute frequencies, so everyone tunes on their own;
// the window itself moves only when it can still cover every slice.
type Slice = { id: string; res: http.ServerResponse; center: number; width: number; tag: string; phase: number; stages: FirDecimator[]; congested: boolean; scale: number };
const slices = new Map<string, Slice>();
const overviewers = new Set<http.ServerResponse>();
const listening = () => clients.size + slices.size;
const USABLE = 0.45; // of the sample rate, each side of center: the dongle's filter rolls off beyond
const half = () => (sdr instanceof HackRf && sdr.filter ? Math.min(USABLE * sdr.sampleRate, sdr.filter / 2) : USABLE * (sdr?.sampleRate ?? RATE)); // a HackRF: its baseband filter's edge
const BUDGET = Number(process.env.STREAM_BUDGET ?? 3_500_000); // bytes/s of upload for all slices together (~28 Mbit/s)
const WIDTHS = [240_000, 1_200_000];
function stages(rate: number, width: number) {
  const pass = 0.45 * width, out: FirDecimator[] = [];
  let r = rate;
  const factors: number[] = []; // 2.4 MS/s → 240 k: ÷5 ÷2; 9.6 MS/s → 240 k: ÷5 ÷4 ÷2
  if (rate % width) throw new Error(`${rate} S/s doesn't divide into ${width}`);
  for (let left = rate / width, f = 5; left > 1; ) if (left % f === 0) { factors.push(f); left /= f; } else if (--f < 2) throw new Error(`${rate} S/s doesn't divide into ${width}`);
  for (const f of factors) { // anything above (r/f − pass) would fold back onto the passband
    const o = r / f, stop = o - pass;
    out.push(new FirDecimator(firLowpass((pass + stop) / 2 / r, (stop - pass) / r), f, 2));
    r = o;
  }
  return out;
}
function sliceOut(sl: Slice, x: Float32Array) {
  // mix by a rotating phasor (cheaper than cos/sin per sample), renormalized now and then against rounding drift
  const step = (-2 * Math.PI * (sl.center - tuning.center)) / (sdr?.sampleRate ?? RATE), cw = Math.cos(step), sw = Math.sin(step);
  let c = Math.cos(sl.phase), s = Math.sin(sl.phase);
  const m = new Float32Array(x.length);
  for (let k = 0; k < x.length; k += 2) {
    m[k] = x[k] * c - x[k + 1] * s; m[k + 1] = x[k] * s + x[k + 1] * c;
    const nc = c * cw - s * sw; s = c * sw + s * cw; c = nc;
    if ((k & 8191) === 0) { const g = 1 / Math.hypot(c, s); c *= g; s *= g; }
  }
  sl.phase = Math.atan2(s, c);
  let y: Float32Array = m;
  for (const st of sl.stages) y = st.process(y);
  if (sl.congested) return;
  const b = new Uint8Array(y.length);
  for (let i = 0; i < y.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(y[i] * sl.scale + 127.5)));
  if (!sl.res.write(b)) { sl.congested = true; sl.res.once("drain", () => (sl.congested = false)); }
}
const fmtMHz = (hz: number) => (hz / 1e6).toFixed(2);
/** Where a slice can go: inside the window as it is, or by moving the window if it can still cover everyone. */
async function place(id: string | null, f: number, width: number) {
  const w2 = width / 2, others = [...slices.values()].filter((s) => s.id !== id);
  const spikeInside = Math.abs(tuning.center - f) < w2 + 10e3; // the dongle's DC spike would land in this slice
  if (f - w2 >= tuning.center - half() && f + w2 <= tuning.center + half() && (others.length || !spikeInside)) return f;
  const lo = Math.min(f - w2, ...others.map((s) => s.center - s.width / 2)), hi = Math.max(f + w2, ...others.map((s) => s.center + s.width / 2));
  if (hi - lo > 2 * half()) {
    const olo = Math.min(...others.map((s) => s.center - s.width / 2)), ohi = Math.max(...others.map((s) => s.center + s.width / 2));
    throw Object.assign(new Error(`The radio is shared: ${others.length} other listener${others.length > 1 ? "s are" : " is"} on ${fmtMHz(olo)}–${fmtMHz(ohi)} MHz, and it covers ${fmtMHz(2 * half())} MHz at once. Pick something between ${fmtMHz(ohi - 2 * half())} and ${fmtMHz(olo + 2 * half())} MHz, or try again later.`), { code: 409 });
  }
  // alone: put the dongle's DC spike just below your slice; shared: center on everyone, nudged off any slice
  const inSlice = (c: number) => [...others, { center: f, width }].some((s) => Math.abs(c - s.center) < s.width / 2);
  const fitsAll = (c: number) => lo >= c - half() && hi <= c + half();
  const tries = others.length ? [(lo + hi) / 2, ...[...others, { center: f, width }].flatMap((s) => [s.center - s.width / 2 - 40e3, s.center + s.width / 2 + 40e3])] : [f - w2 - 50e3];
  const c = tries.find((t) => fitsAll(t) && !inSlice(t)) ?? (lo + hi) / 2;
  tuning.center = Math.round(c);
  if (mode === "iq") { await sdr?.setCenterFrequency(tuning.center); if (tuning.amp && ampBlocked()) await applyHackrf(); }
  await followBand();
  return f;
}
// The whole window for everyone, ~7 rows a second (dB above the floor, ¼ dB per step), plus who listens where.
let lastRow = 0;
function overview(x: Float32Array) {
  if (!overviewers.size || Date.now() - lastRow < 140) return;
  lastRow = Date.now();
  const db = avgSpectrum(x, 1024, 8), floor = db.slice().sort()[512], row = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) row[i] = Math.max(0, Math.min(255, Math.round((db[i] - floor + 8) * 4)));
  const msg = `event: row\ndata: ${Buffer.from(row).toString("base64")}\n\n`;
  for (const r of overviewers) r.write(msg);
}
const radio = () => sdr instanceof HackRf ? { device: "hackrf", tuner: sdr.tunerName, hackrf: { lna: tuning.lna, vga: tuning.vga, amp: tuning.amp, filter: sdr.filter, ampBlocked: ampBlocked() } }
  : { device: sdr ? "rtl" : "", tuner: sdr?.tunerName ?? "" };
const band = () => ({ center: tuning.center, rate: sdr?.sampleRate ?? RATE, half: half(), gain: tuning.gain, listeners: listening(), ...radio(), level, protect: protectNote, gainBand, gainRemembered: !!gainMemory[gainBand],
  slices: [...slices.values()].map((s) => ({ tag: s.tag, center: s.center, width: s.width })) });
function tellBand() { const msg = `event: band\ndata: ${JSON.stringify(band())}\n\n`; for (const r of overviewers) r.write(msg); }

/** Open the dongle for `want` (raw IQ at the listeners' tuning, or a decoder's own settings). */
function ensureSdr(want: "iq" | Decoder = "iq"): Promise<Sdr> {
  if (sdr && mode === want) return Promise.resolve(sdr);
  opening ??= (async () => {
    if (sdr) await release();
    const d = want === "iq" ? null : DECODERS[want];
    const s = await openDongle();
    const hack = s instanceof HackRf, rate = d?.rate ?? (hack ? HACKRF_RATE : RATE), min = hack ? s.minRate : 0; // a HackRF starts at 2 MS/s: 1.024 → 2.048
    const r = rate < min ? rate * Math.ceil(min / rate) : rate;
    await (hack ? s.setSampleRate(r, d ? undefined : HACKRF_FILTER) : s.setSampleRate(r));
    await s.setCenterFrequency(d?.center ?? tuning.center);
    if (hack && !d) await applyHackrf(s); else await s.setGain(d ? d.gain : tuning.gain);
    mode = want;
    if (want === "aprs") aprsRx = new AprsReceiver(s.sampleRate, 144.39e6 - DECODERS.aprs.center);
    adsbTail = new Float32Array(0);
    streaming = s.stream(onChunk).catch((e) => { console.error("stream:", e.message); if (sdr === s) recover("stream failed"); }); // a USB error mid-stream: reset and reopen, listeners stay connected
    console.log(`dongle open for ${want}: ${s.tunerName}, ${s.sampleRate} S/s`);
    return (sdr = s);
  })().finally(() => (opening = null));
  return opening;
}

/** Spectrum Lab is done: give the dongle back to the decoder it interrupted, if someone still watches it. */
async function resumeOrRelease() {
  const d = paused;
  paused = null;
  if (listening()) return;
  if (d && watchers[d].size) { await ensureSdr(d); push(d, "online", { mode: d }); scheduleDecoderIdle(); }
  else await release();
}

/** Start a decoder for a visitor. Throws a message they can read when the dongle can't be given to it. */
async function startDecoder(name: Decoder) {
  if (mode === name) return;
  if (listening()) throw new Error("Someone is listening in Spectrum Lab right now, so the dongle is busy.");
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

const state = () => ({ ...radio(), rate: sdr?.sampleRate ?? RATE, center: tuning.center, gain: tuning.gain, listeners: listening(), half: half(),
  mode, watchers: { aprs: watchers.aprs.size, adsb: watchers.adsb.size } });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/state") return json(res, 200, state());

    if (url.pathname === "/api/tune" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const parsed = JSON.parse(body || "{}"), viaInternet = !!req.headers["x-via-ihor"];
      // Gains are the owner's: from the internet (ihor.sh's proxy marks it), only the frequency can change. A visitor's
      // gain used to be accepted here, which let anyone retune the station's gains (and its saved gains.json).
      const { center } = parsed, { gain, lna, vga, amp } = viaInternet ? ({} as Record<string, undefined>) : parsed;
      if (viaInternet && ["gain", "lna", "vga", "amp"].some((k) => k in parsed)) return json(res, 403, { error: "The server's gains are set by its owner.", ...state() });
      if (typeof center === "number") { // moves the whole window, so only when it still covers every slice
        if (center < 24e6 || center > 1.766e9) return json(res, 400, { error: "Frequency must be 24–1766 MHz" });
        const out = [...slices.values()].find((s) => Math.abs(s.center - center) + s.width / 2 > half());
        if (out) return json(res, 409, { error: `Someone is listening at ${fmtMHz(out.center)} MHz, outside that window.` });
        tuning.center = center;
        if (mode === "iq") await sdr?.setCenterFrequency(center);
        await followBand();
      }
      if (gain === null || typeof gain === "number") { tuning.gain = gain; if (mode === "iq" && !(sdr instanceof HackRf)) await sdr?.setGain(gain); }
      // the HackRF's own controls, clamped to what the chips take; the amp only where ampBlocked() allows it
      if (typeof lna === "number" && Number.isFinite(lna)) tuning.lna = Math.max(0, Math.min(40, 8 * Math.round(lna / 8)));
      if (typeof vga === "number" && Number.isFinite(vga)) tuning.vga = Math.max(0, Math.min(62, 2 * Math.round(vga / 2)));
      if (amp === true && ampBlocked()) return json(res, 409, { error: `The RF amp stays off here: ${ampBlocked()}, and strong transmitters there can overload it.`, ...state() });
      if (typeof amp === "boolean") tuning.amp = amp;
      if (mode === "iq") await applyHackrf();
      if (gain !== undefined || lna !== undefined || vga !== undefined || amp !== undefined) rememberGain();
      tellBand();
      return json(res, 200, state());
    }

    // Owner-only (this Mac): drop every Spectrum Lab listener and map viewer and release the dongle. ihor.sh never forwards it.
    if (url.pathname === "/api/admin/free" && req.method === "POST") {
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) return json(res, 403, { error: "local only" });
      const dropped = { listeners: listening(), aprs: watchers.aprs.size, adsb: watchers.adsb.size };
      for (const c of [...clients, ...[...slices.values()].map((s) => s.res), ...overviewers, ...watchers.aprs, ...watchers.adsb]) c.destroy();
      clients.clear(); slices.clear(); overviewers.clear(); watchers.aprs.clear(); watchers.adsb.clear();
      paused = null; clearTimeout(idle); clearTimeout(decoderIdle);
      await release();
      return json(res, 200, { dropped, ...state() });
    }

    if (url.pathname === "/api/receiver" && req.method === "POST") {
      let body = "";
      for await (const c of req) { body += c; if (body.length > 200) return json(res, 413, {}); }
      const name = JSON.parse(body || "{}").mode;
      if (name === "off") {
        // Only when the decoder is on and the one asking is its only viewer (or nobody watches): don't cut others off.
        if (mode !== "aprs" && mode !== "adsb") return json(res, 200, state());
        const others = watchers[mode].size - 1;
        if (others > 0) return json(res, 409, { error: `${others} other ${others === 1 ? "person is" : "people are"} watching the ${DECODERS[mode].label}, so it stays on.` });
        paused = null;
        await release();
        return json(res, 200, state());
      }
      if (name !== "aprs" && name !== "adsb") return json(res, 400, { error: "mode must be aprs, adsb or off" });
      try { await startDecoder(name); return json(res, 200, state()); } catch (e) { return json(res, 409, { error: (e as Error).message }); }
    }

    // A viewer checking in (alive) or leaving the page (leave, sent as a beacon on pagehide).
    if (url.pathname === "/api/viewer" && req.method === "POST") {
      const v = viewerIds.get(String(url.searchParams.get("id")));
      if (v && url.searchParams.get("action") === "leave") { viewerIds.delete(String(url.searchParams.get("id"))); v.res.destroy(); }
      else if (v) v.seen = Date.now();
      return json(res, v ? 200 : 404, {});
    }

    const ev = url.pathname.match(/^\/api\/(aprs|adsb)\/events$/);
    if (ev) {
      const name = ev[1] as Decoder;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      watchers[name].add(res);
      const viewerId = crypto.randomUUID();
      viewerIds.set(viewerId, { res, seen: Date.now() });
      res.write(`event: hello\ndata: ${JSON.stringify({ id: viewerId })}\n\n`);
      clearTimeout(decoderIdle);
      res.write(`event: ${mode === name ? "online" : "offline"}\ndata: ${JSON.stringify({ mode })}\n\n`);
      if (name === "aprs") res.write(`event: snapshot\ndata: ${JSON.stringify({ stations: [...stations.map.values()], log: stations.log.slice(-100) })}\n\n`);
      else res.write(`event: aircraft\ndata: ${JSON.stringify(tracker.current())}\n\n`);
      const ping = setInterval(() => res.write(": ping\n\n"), 20_000); // keeps proxies from closing a quiet stream
      req.on("close", () => { clearInterval(ping); viewerIds.delete(viewerId); watchers[name].delete(res); scheduleDecoderIdle(); });
      return;
    }

    if (url.pathname === "/api/scan/fm") {
      if (req.method !== "POST" || (scanResult && Date.now() - scanResult.at < 10 * 60_000)) return json(res, 200, scanResult ?? { at: 0, channels: [] });
      try { return json(res, 200, await (scanning ??= scanFm().finally(() => (scanning = null)))); }
      catch (e) { return json(res, 409, { error: (e as Error).message, last: scanResult }); }
    }
    // GET /api/stream?center=Hz&width=240000|1200000&id=… : your slice of the window (no center: the window's middle,
    // 1.2 MHz wide, which is what older pages expect). ?raw=1, the whole 2.4 MHz, only on this computer's own network.
    // ?boost=1 scales the slice by √(rate ÷ width): narrowing 2.4 MHz to 240 kHz leaves a tenth of the noise power, which
    // at the dongle's scale is about 1 count of 8 bits (a Meteor pass on 2026-10-16: 92% of samples were 127 or 128,
    // about 1 dB lost to rounding). Boosted, the noise keeps the dongle's level; a strong station could clip, so only
    // weak-signal recorders ask for it.
    if (url.pathname === "/api/stream") {
      const q = url.searchParams, raw = q.get("raw") === "1" && !req.headers["x-via-ihor"];
      const width = WIDTHS.includes(Number(q.get("width"))) ? Number(q.get("width")) : 1_200_000;
      const used = [...slices.values()].reduce((t, s) => t + 2 * s.width, 0);
      if (!raw && used + 2 * width > BUDGET) return json(res, 503, { error: "The radio's upload is full right now (too many listeners). Try again in a few minutes." });
      clearTimeout(idle);
      if (mode === "aprs" || mode === "adsb") { paused = mode; push(mode, "offline", { mode: "iq", reason: "spectrum" }); }
      const id = String(q.get("id") ?? "").replace(/[^\w-]/g, "").slice(0, 40) || Math.random().toString(36).slice(2);
      let center = Number(q.get("center")) || tuning.center;
      if (!raw) try { center = await place(id, center, width); } catch (e) { return json(res, (e as any).code ?? 500, { error: (e as Error).message }); }
      await ensureSdr("iq");
      if (req.socket.destroyed) { if (!listening()) idle = setTimeout(resumeOrRelease, IDLE_MS); return; } // gone while the radio opened: its close already fired
      const headers = { "content-type": "application/octet-stream", "cache-control": "no-store", "x-sample-rate": String(raw ? sdr!.sampleRate : width), "x-center": String(raw ? tuning.center : center), "x-slice-id": id,
        "x-gain": sdr instanceof HackRf ? `LNA ${sdr.lna} dB, VGA ${sdr.vga} dB${sdr.amp ? ", RF amp on" : ""}` : tuning.gain === null ? "auto" : `${tuning.gain} dB` }; // shown on pages, set by the owner
      res.writeHead(200, headers);
      const leave = () => { if (!listening()) idle = setTimeout(resumeOrRelease, IDLE_MS); tellBand(); console.log(`listener left (${listening()})`); };
      if (raw) { clients.add(res); req.on("close", () => { clients.delete(res); congested.delete(res); leave(); }); }
      else {
        slices.get(id)?.res.destroy(); // the same page reconnecting replaces its old stream
        slices.set(id, { id, res, center, width, tag: id.slice(-4), phase: 0, stages: stages(sdr!.sampleRate, width), congested: false, scale: 127.5 * (q.get("boost") === "1" ? Math.sqrt(sdr!.sampleRate / width) : 1) });
        req.on("close", () => { if (slices.get(id)?.res === res) slices.delete(id); leave(); });
      }
      console.log(`listener joined (${listening()})`);
      tellBand();
      return;
    }
    // POST /api/slice {id, center}: move your slice (moves the window too if it can still cover everyone).
    if (url.pathname === "/api/slice" && req.method === "POST") {
      let body = "";
      for await (const c of req) { body += c; if (body.length > 300) return json(res, 413, {}); }
      const { id, center } = JSON.parse(body || "{}"), sl = slices.get(String(id));
      if (!sl) return json(res, 404, { error: "No stream with that id." });
      if (!(center >= 24e6 && center <= 1.766e9)) return json(res, 400, { error: "Frequency must be 24–1766 MHz" });
      try { sl.center = await place(sl.id, center, sl.width); } catch (e) { return json(res, (e as any).code ?? 500, { error: (e as Error).message }); }
      tellBand();
      return json(res, 200, { center: sl.center, window: [tuning.center - half(), tuning.center + half()] });
    }
    // GET /api/overview: server-sent events: "band" (the window, the gain, everyone's slices) and "row" (a spectrum row).
    if (url.pathname === "/api/overview") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
      res.write(`event: band\ndata: ${JSON.stringify(band())}\n\n`);
      overviewers.add(res);
      const beat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
      req.on("close", () => { clearInterval(beat); overviewers.delete(res); });
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
    if (!res.headersSent) json(res, /No RTL-SDR|LIBUSB_ERROR_ACCESS|busy|in use/i.test(msg) ? 503 : 500, { error: msg });
  }
});

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`Port ${PORT} is already in use (another server.ts still running?). Stop it, or pick another port: PORT=8074 npm run serve`);
  process.exit(1);
});
server.listen(PORT, () => console.log(`Spectrum Lab + server SDR on http://0.0.0.0:${PORT} (LAN only, don't port-forward)`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, async () => { await release(); process.exit(0); });
