// Slow-scan TV: an encoder (image → audio) and a streaming decoder (audio → image), with VIS mode detection and slant
// correction. Brightness is tone frequency: 1500 Hz black … 2300 Hz white; 1200 Hz marks sync.
// Timings follow the standard mode specifications (JL Barber, "Proposal for SSTV mode specifications").
import { Mixer, firLowpass, FirDecimator, FmDemod } from "./dsp.ts";

export type Chan = "R" | "G" | "B" | "Y" | "Y2" | "RY" | "BY" | "C"; // C: Robot 36 chroma, R-Y on even lines, B-Y on odd
export interface Seg { ms: number; freq?: number; chan?: Chan; sync?: boolean }
export interface Mode { name: string; vis: number; width: number; height: number; rowsPerLine: 1 | 2; line: Seg[]; firstSync?: number }

const S = (ms: number): Seg => ({ ms, freq: 1200, sync: true });
const P = (ms: number, freq = 1500): Seg => ({ ms, freq });
const pd = (name: string, vis: number, width: number, height: number, scan: number): Mode =>
  ({ name, vis, width, height, rowsPerLine: 2, line: [S(20), P(2.08), { ms: scan, chan: "Y" }, { ms: scan, chan: "RY" }, { ms: scan, chan: "BY" }, { ms: scan, chan: "Y2" }] });

export const MODES: Mode[] = [
  { name: "Robot 36", vis: 8, width: 320, height: 240, rowsPerLine: 1, line: [S(9), P(3), { ms: 88, chan: "Y" }, P(4.5), P(1.5, 1900), { ms: 44, chan: "C" }] },
  { name: "Martin M1", vis: 44, width: 320, height: 256, rowsPerLine: 1, line: [S(4.862), P(0.572), { ms: 146.432, chan: "G" }, P(0.572), { ms: 146.432, chan: "B" }, P(0.572), { ms: 146.432, chan: "R" }, P(0.572)] },
  { name: "Scottie S1", vis: 60, width: 320, height: 256, rowsPerLine: 1, firstSync: 9, line: [P(1.5), { ms: 138.24, chan: "G" }, P(1.5), { ms: 138.24, chan: "B" }, S(9), P(1.5), { ms: 138.24, chan: "R" }] },
  pd("PD90", 99, 320, 256, 170.24),
  pd("PD120", 95, 640, 496, 121.6),
  pd("PD180", 96, 640, 496, 183.04),
];
export const lineMs = (m: Mode) => m.line.reduce((a, s) => a + s.ms, 0);
export const durationS = (m: Mode) => (0.91 + ((m.firstSync ?? 0) + lineMs(m) * (m.height / m.rowsPerLine)) / 1000);
/** Where in a line its sync pulse starts (ms), used to lock onto each line. */
const syncAt = (m: Mode) => { let t = 0; for (const s of m.line) { if (s.sync) return t; t += s.ms; } return 0; };

const lev2f = (v: number) => 1500 + (Math.max(0, Math.min(255, v)) * 800) / 255;
const f2lev = (f: number) => Math.max(0, Math.min(255, ((f - 1500) * 255) / 800));
export const yuv = (r: number, g: number, b: number) => [16 + (65.738 * r + 129.057 * g + 25.064 * b) / 256, 128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256, 128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256]; // Y, B-Y (Cb), R-Y (Cr)
export const rgb = (y: number, cb: number, cr: number) => [1.164 * (y - 16) + 1.596 * (cr - 128), 1.164 * (y - 16) - 0.813 * (cr - 128) - 0.391 * (cb - 128), 1.164 * (y - 16) + 2.018 * (cb - 128)].map((v) => Math.max(0, Math.min(255, v)));

// --- Encoder -------------------------------------------------------------------------------------------------------------
/** Encode an RGBA image (already width × height of the mode) to audio at `fs`. `clock` > 1 simulates a fast sound card. */
export function encode(m: Mode, rgba: Uint8ClampedArray, fs: number, clock = 1): Float32Array {
  const out: number[] = []; let t = 0, ph = 0, emitted = 0;
  const tone = (ms: number, f: (u: number) => number) => { // f(u) gives the frequency at fraction u through the segment
    t += (ms / 1000) * fs * clock;
    const end = Math.round(t), n0 = emitted;
    for (; emitted < end; emitted++) { const u = (emitted - n0 + 0.5) / Math.max(1, end - n0); ph += (2 * Math.PI * f(u)) / fs; out.push(Math.sin(ph)); }
  };
  const flat = (ms: number, f: number) => tone(ms, () => f);
  // VIS header
  flat(300, 1900); flat(10, 1200); flat(300, 1900); flat(30, 1200);
  let ones = 0; for (let b = 0; b < 7; b++) { const bit = (m.vis >> b) & 1; ones += bit; flat(30, bit ? 1100 : 1300); }
  flat(30, ones % 2 ? 1100 : 1300); flat(30, 1200);
  if (m.firstSync) flat(m.firstSync, 1200);
  const px = (x: number, y: number) => { const i = (Math.min(m.height - 1, y) * m.width + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };
  for (let y = 0; y < m.height; y += m.rowsPerLine) {
    for (const s of m.line) {
      if (!s.chan) { flat(s.ms, s === m.line[3] && m.name === "Robot 36" ? (y % 2 ? 2300 : 1500) : s.freq!); continue; }
      const ch = s.chan, w = m.width;
      tone(s.ms, (u) => {
        const x = Math.min(w - 1, Math.floor(u * w));
        if (ch === "R" || ch === "G" || ch === "B") return lev2f(px(x, y)["RGB".indexOf(ch)]);
        const yy = ch === "Y2" ? y + 1 : y;
        if (ch === "Y" || ch === "Y2") return lev2f(yuv(...(px(x, yy) as [number, number, number]))[0]);
        // chroma: PD averages its two rows; Robot 36 sends R-Y on even lines and B-Y on odd ones, averaged over the pair
        const a = yuv(...(px(x, m.name === "Robot 36" ? y - (y % 2) : y) as [number, number, number])), b = yuv(...(px(x, (m.name === "Robot 36" ? y - (y % 2) : y) + 1) as [number, number, number]));
        const want = ch === "RY" || (ch === "C" && y % 2 === 0) ? 2 : 1;
        return lev2f((a[want] + b[want]) / 2);
      });
    }
  }
  return Float32Array.from(out);
}

// --- Decoder -----------------------------------------------------------------------------------------------------------------
export interface DecoderEvents { onMode?: (m: Mode) => void; onLine?: (y: number, rgba: Uint8ClampedArray, m: Mode) => void; onDone?: (m: Mode) => void }

/**
 * Streaming SSTV decoder. Push audio in chunks of any size. It measures the instantaneous tone frequency (mix the audio
 * around 1900 Hz down to 0, low-pass it, and measure the angle turned per sample: chapter 9's FM demodulator), watches
 * for a VIS header, then decodes lines, locking each one to its sync pulse and fitting the drift (slant correction).
 */
export class SstvDecoder {
  readonly rate: number;
  slantCorrection = true;
  /** Every sync pulse found in the current picture: [line, measured start (samples at `rate`)]. */
  syncLog: [number, number][] = [];
  mode: Mode | null = null;
  private mixer: Mixer; private lp: FirDecimator; private fm = new FmDemod();
  private freq: number[] = []; private base = 0; // freq track at `rate`; base = absolute index of freq[0]
  private scanFrom = 0; private start = 0; private line = 0; private syncs: [number, number][] = [];
  private pending: { y: Float32Array; c: Float32Array } | null = null; // Robot 36: the even line, waiting for its odd partner
  private ev: DecoderEvents; private fs: number;
  constructor(fs: number, ev: DecoderEvents = {}) {
    this.ev = ev; this.fs = fs;
    const m = Math.max(1, Math.floor(fs / 11025));
    this.rate = fs / m;
    this.mixer = new Mixer(fs, 1900);
    this.lp = new FirDecimator(firLowpass(1100 / fs, 700 / fs), m, 2);
  }

  /** Absolute index (at `rate`) of the newest measured sample. */
  get position() { return this.base + this.freq.length; }
  /** Where line n should start (samples at `rate`), and where it would without slant correction. */
  predicted(n: number) { return this.lineStart(n); }
  get startSample() { return this.start; }
  /** Lines decoded so far in the current picture. */
  get lineCount() { return this.mode ? this.line * this.mode.rowsPerLine : 0; }

  /** The measured tone frequency (Hz) at absolute sample n of the decoder's rate, or NaN if gone. */
  freqAt(n: number) { const i = Math.round(n) - this.base; return i >= 0 && i < this.freq.length ? this.freq[i] : NaN; }

  push(audio: Float32Array) {
    const iq = new Float32Array(audio.length * 2); for (let i = 0; i < audio.length; i++) iq[2 * i] = audio[i];
    const d = this.fm.process(this.lp.process(this.mixer.process(iq)));
    for (const v of d) this.freq.push(1900 + (v * this.rate) / (2 * Math.PI));
    if (!this.mode) this.findVis(); else this.decodeLines();
    // between pictures, forget audio we've already searched (a picture in progress keeps everything: a few MB at most)
    const drop = this.scanFrom - this.base - Math.round(this.rate);
    if (!this.mode && drop > this.rate * 10) { this.freq.splice(0, drop); this.base += drop; }
  }

  /** At the end of a file: pad with silence so the last lines (which wait for a little audio past their end) decode. */
  flush() { if (this.mode) this.push(new Float32Array(Math.round(this.fs * 0.5))); }

  private avg(a: number, b: number) { let s = 0, n = 0; for (let i = Math.floor(a); i < Math.ceil(b); i++) { const f = this.freqAt(i); if (!Number.isNaN(f)) { s += f; n++; } } return n ? s / n : NaN; }

  private findVis() {
    const r = this.rate / 1000, end = this.base + this.freq.length; // r: samples per ms
    for (let t = Math.max(this.scanFrom, this.base + 120 * r); t + 300 * r < end; t += r) {
      // the start bit: 30 ms of 1200 Hz right after at least 100 ms of 1900 Hz leader
      if (Math.abs(this.avg(t, t + 30 * r) - 1200) > 70 || Math.abs(this.avg(t - 100 * r, t - 5 * r) - 1900) > 70) continue;
      const edge = t; // within a few ms; each line's sync pulse fixes the timing exactly
      let code = 0, ones = 0, ok = true;
      for (let b = 0; b < 8; b++) {
        const f = this.avg(edge + (30 * (b + 1) + 5) * r, edge + (30 * (b + 2) - 5) * r);
        if (Math.abs(f - 1100) > 80 && Math.abs(f - 1300) > 80) { ok = false; break; }
        const bit = f < 1200 ? 1 : 0; ones += bit; if (b < 7) code |= bit << b;
      }
      const m = MODES.find((x) => x.vis === code);
      if (ok && ones % 2 === 0 && m) {
        this.mode = m; this.line = 0; this.syncs = []; this.syncLog = []; this.pending = null;
        this.start = edge + 300 * r + (m.firstSync ?? 0) * r; // start bit + 8 bits + stop bit
        this.ev.onMode?.(m); this.decodeLines(); return;
      }
      this.scanFrom = t + r;
    }
    this.scanFrom = Math.max(this.scanFrom, end - 300 * r);
  }

  /** Predicted start of line n: from the fitted sync times when correcting slant, else nominal. */
  private lineStart(n: number) {
    const m = this.mode!, L = lineMs(m) * this.rate / 1000;
    if (!this.slantCorrection || !this.syncs.length) return this.start + n * L;
    if (this.syncs.length < 3) { const [ln, lt] = this.syncs[this.syncs.length - 1]; return lt + (n - ln) * L; } // follow the last sync until there's enough for a fit
    // least-squares line through (line number, measured start)
    let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of this.syncs) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const k = this.syncs.length, slope = (k * sxy - sx * sy) / (k * sxx - sx * sx), icpt = (sy - slope * sx) / k;
    return icpt + slope * n;
  }

  private decodeLines() {
    const m = this.mode!, r = this.rate / 1000, L = lineMs(m) * r, end = this.base + this.freq.length;
    while (this.line < m.height / m.rowsPerLine && this.lineStart(this.line) + L + 20 * r < end) {
      const n = this.line;
      // measure where this line's sync really ends: 1200 Hz, then the 1500 Hz porch that follows every sync. (The end, not
      // the start: before the first line, the header's 1200 Hz stop bit runs straight into the sync.)
      const si = m.line.findIndex((s) => s.sync), sync = m.line[si].ms * r, porch = Math.max(0.5, Math.min(1.5, m.line[si + 1].ms)) * r;
      const pred = this.lineStart(n) + syncAt(m) * r + sync;
      let best = pred, bestScore = Infinity;
      for (let t = pred - 12 * r; t <= pred + 12 * r; t += r / 4) { const sc = Math.abs(this.avg(t - sync, t) - 1200) + Math.abs(this.avg(t, t + porch) - 1500); if (sc < bestScore) { bestScore = sc; best = t; } }
      if (bestScore < 120) { const st = best - sync - syncAt(m) * r; this.syncs.push([n, st]); this.syncLog.push([n, st]); if (this.syncs.length > 40) this.syncs.shift(); }
      const s0 = this.lineStart(n);
      // sample every channel
      const ch: Partial<Record<Chan, Float32Array>> = {};
      let t = s0;
      for (const s of m.line) {
        if (s.chan) {
          const a = new Float32Array(m.width), dur = (s.ms * r) / m.width;
          for (let x = 0; x < m.width; x++) a[x] = f2lev(this.avg(t + x * dur, t + (x + 1) * dur));
          // ponytail: the tone filter smears the next segment into the last ~0.3 ms; repeat the last clean pixel there.
          // (A sharper filter would fix it properly, at the cost of noise.)
          const bad = Math.min(m.width - 1, Math.ceil((0.3 * r) / dur)); for (let x = m.width - bad; x < m.width; x++) a[x] = a[m.width - bad - 1];
          ch[s.chan] = a;
        }
        t += s.ms * r;
      }
      this.emit(n, ch);
      this.line++;
    }
    if (this.line >= m.height / m.rowsPerLine) { this.ev.onDone?.(m); this.scanFrom = this.lineStart(this.line); this.mode = null; }
  }

  private emit(n: number, ch: Partial<Record<Chan, Float32Array>>) {
    const m = this.mode!, w = m.width, row = () => new Uint8ClampedArray(w * 4);
    const put = (y: number, px: (x: number) => number[]) => { const a = row(); for (let x = 0; x < w; x++) { const [r, g, b] = px(x); a.set([r, g, b, 255], x * 4); } this.ev.onLine?.(y, a, m); };
    if (ch.R) return put(n, (x) => [ch.R![x], ch.G![x], ch.B![x]]);
    if (ch.Y2) { put(2 * n, (x) => rgb(ch.Y![x], ch.BY![x], ch.RY![x])); return put(2 * n + 1, (x) => rgb(ch.Y2![x], ch.BY![x], ch.RY![x])); }
    // Robot 36: an even line carries R-Y, the odd line after it B-Y; decode them as a pair
    if (n % 2 === 0) { this.pending = { y: ch.Y!, c: ch.C! }; return; }
    const ev = this.pending ?? { y: ch.Y!, c: ch.C! }, cr = ev.c, cb = ch.C!;
    put(n - 1, (x) => rgb(ev.y[x], cb[x], cr[x])); put(n, (x) => rgb(ch.Y![x], cb[x], cr[x]));
  }
}
