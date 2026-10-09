import { schedule } from "./cw.ts";
// All complex signals are interleaved Float32Array: [I0, Q0, I1, Q1, ...].
// Frequencies are in Hz unless a name says "norm" (cycles/sample).

const TAU = 2 * Math.PI;

/** In-place radix-2 complex FFT. re.length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Power spectrum in dB of n complex samples starting at sample `start`, Hann-windowed, DC centered. */
export function powerSpectrum(iq: Float32Array, start: number, n: number): Float32Array {
  const re = new Float32Array(n), im = new Float32Array(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((TAU * i) / n);
    wsum += w;
    const k = 2 * (start + i);
    re[i] = (iq[k] ?? 0) * w;
    im[i] = (iq[k + 1] ?? 0) * w;
  }
  fft(re, im);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + n / 2) % n; // fftshift: bin 0 (DC) lands in the middle
    out[i] = 10 * Math.log10((re[j] ** 2 + im[j] ** 2) / wsum ** 2 + 1e-20);
  }
  return out;
}

/** Average of `frames` spectra spread evenly across the signal (smoother than one FFT). */
export function avgSpectrum(iq: Float32Array, n: number, frames = 16): Float32Array {
  const total = iq.length / 2;
  const acc = new Float32Array(n);
  const step = Math.max(n, Math.floor((total - n) / frames));
  let count = 0;
  for (let s = 0; s + n <= total && count < frames; s += step, count++) {
    const p = powerSpectrum(iq, s, n);
    for (let i = 0; i < n; i++) acc[i] += 10 ** (p[i] / 10);
  }
  for (let i = 0; i < n; i++) acc[i] = 10 * Math.log10(acc[i] / Math.max(count, 1) + 1e-20);
  return acc;
}

/** Shifts a stream down by `freq` (multiply by e^(-j·2π·freq·t)), keeping phase across chunks. */
export class Mixer {
  private ph = 0;
  private step: number;
  constructor(fs: number, freq: number) { this.step = (-TAU * freq) / fs; }
  process(iq: Float32Array): Float32Array {
    const out = new Float32Array(iq.length);
    let ph = this.ph;
    for (let k = 0; k < iq.length; k += 2) {
      const c = Math.cos(ph), s = Math.sin(ph);
      out[k] = iq[k] * c - iq[k + 1] * s;
      out[k + 1] = iq[k] * s + iq[k + 1] * c;
      ph += this.step;
      if (ph < -Math.PI) ph += TAU; else if (ph > Math.PI) ph -= TAU;
    }
    this.ph = ph;
    return out;
  }
}

export const mix = (iq: Float32Array, fs: number, freq: number) => new Mixer(fs, freq).process(iq);

/** Windowed-sinc low-pass (Hamming, ~-53 dB stopband). Tap count picked from transition width. */
export function firLowpass(cutoffNorm: number, transitionNorm: number): Float32Array {
  let n = Math.ceil(3.3 / Math.max(transitionNorm, 1e-4));
  n = Math.min(511, n | 1);
  const h = new Float32Array(n);
  const m = (n - 1) / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = i - m;
    const sinc = x === 0 ? 2 * cutoffNorm : Math.sin(TAU * cutoffNorm * x) / (Math.PI * x);
    h[i] = sinc * (0.54 - 0.46 * Math.cos((TAU * i) / (n - 1)));
    sum += h[i];
  }
  for (let i = 0; i < n; i++) h[i] /= sum; // unity gain at DC
  return h;
}

/** |H(f)| in dB at `points` frequencies from -0.5 to +0.5 cycles/sample (for plotting). */
export function freqResponse(h: Float32Array, points: number): Float32Array {
  const out = new Float32Array(points);
  for (let p = 0; p < points; p++) {
    const w = TAU * (p / points - 0.5);
    let r = 0, i = 0;
    for (let k = 0; k < h.length; k++) { r += h[k] * Math.cos(w * k); i -= h[k] * Math.sin(w * k); }
    out[p] = 10 * Math.log10(r * r + i * i + 1e-20);
  }
  return out;
}

// --- Streaming blocks ----------------------------------------------------------
// Each keeps its state between process() calls, so a live stream cut into chunks gives exactly
// the same output as one big buffer (no clicks at chunk edges). Batch mode is just one chunk.

/** FIR filter that keeps every m-th output. `ch` = 2 for interleaved I/Q, 1 for real samples. */
export class FirDecimator {
  private h: Float32Array;
  private m: number;
  private ch: number;
  private hist: Float32Array; // last (taps-1) input samples
  private next = 0; // where in the next chunk the next kept output falls

  constructor(h: Float32Array, m: number, ch: 1 | 2) {
    this.h = h; this.m = m; this.ch = ch;
    this.hist = new Float32Array((h.length - 1) * ch);
  }

  process(x: Float32Array): Float32Array {
    const { h, m, ch } = this, t = h.length, n = x.length / ch;
    const buf = new Float32Array(this.hist.length + x.length);
    buf.set(this.hist); buf.set(x, this.hist.length);
    const count = this.next < n ? Math.floor((n - 1 - this.next) / m) + 1 : 0;
    const out = new Float32Array(count * ch);
    for (let o = 0, j = this.next; o < count; o++, j += m) {
      const base = (t - 1 + j) * ch;
      if (ch === 2) {
        let r = 0, i = 0;
        for (let k = 0; k < t; k++) { const idx = base - 2 * k; r += buf[idx] * h[k]; i += buf[idx + 1] * h[k]; }
        out[2 * o] = r; out[2 * o + 1] = i;
      } else {
        let acc = 0;
        for (let k = 0; k < t; k++) acc += buf[base - k] * h[k];
        out[o] = acc;
      }
    }
    this.next += count * m - n;
    this.hist = buf.slice(buf.length - this.hist.length);
    return out;
  }
}

/** FM: the phase step between consecutive samples, arg(x[n]·conj(x[n-1])), is the instantaneous frequency. */
export class FmDemod {
  private pi = 0;
  private pq = 0;
  process(iq: Float32Array): Float32Array {
    const out = new Float32Array(iq.length / 2);
    let pi = this.pi, pq = this.pq;
    for (let k = 0; k < iq.length; k += 2) {
      const i = iq[k], q = iq[k + 1];
      out[k / 2] = Math.atan2(q * pi - i * pq, i * pi + q * pq);
      pi = i; pq = q;
    }
    this.pi = pi; this.pq = pq;
    return out;
  }
}

/** AM: the envelope |x|, with the carrier's DC removed by a one-pole DC blocker. */
export class AmDemod {
  private x1 = 0;
  private y1 = 0;
  process(iq: Float32Array): Float32Array {
    const out = new Float32Array(iq.length / 2);
    for (let k = 0; k < out.length; k++) {
      const x = Math.hypot(iq[2 * k], iq[2 * k + 1]);
      out[k] = this.y1 = x - this.x1 + 0.995 * this.y1;
      this.x1 = x;
    }
    return out;
  }
}

/** SSB: shift the wanted sideband to straddle 0 Hz, low-pass it, shift back, take the real part. */
export class SsbDemod {
  private down: Mixer;
  private up: Mixer;
  private lp: FirDecimator;
  constructor(fs: number, bw: number, upper: boolean) {
    const shift = upper ? bw / 2 : -bw / 2;
    this.down = new Mixer(fs, shift);
    this.up = new Mixer(fs, -shift);
    this.lp = new FirDecimator(firLowpass(bw / 2 / fs, bw / 4 / fs), 1, 2);
  }
  process(iq: Float32Array): Float32Array {
    const back = this.up.process(this.lp.process(this.down.process(iq)));
    const out = new Float32Array(back.length / 2);
    for (let k = 0; k < out.length; k++) out[k] = back[2 * k];
    return out;
  }
}

/**
 * CW (Morse): the carrier is moved to 0 Hz, decimated to a few kHz, filtered narrow (±bw/2) so only one signal
 * survives, then mixed back up to an audio tone (`pitch`, like a receiver's BFO) and stretched back to the input rate.
 * The narrow channel's magnitude is the keying envelope, kept in `env` (at `envFs`) for the Morse decoder.
 */
export class CwDemod {
  readonly envFs: number;
  env = new Float32Array(0);
  private m: number;
  private dec: FirDecimator;
  private narrow: FirDecimator;
  private phase = 0;
  private step: number;
  private last = 0;
  constructor(fs: number, bw: number, pitch = 700) {
    this.m = Math.max(1, Math.round(fs / 6000));
    this.envFs = fs / this.m;
    const keep = Math.min(2000, 0.4 * this.envFs);
    this.dec = new FirDecimator(firLowpass(keep / fs, Math.max(this.envFs / 2 - keep, 200) / fs), this.m, 2);
    this.narrow = new FirDecimator(firLowpass(bw / 2 / this.envFs, Math.max(bw / 4, 40) / this.envFs), 1, 2);
    this.step = (TAU * pitch) / this.envFs;
  }
  process(iq: Float32Array): Float32Array {
    const z = this.narrow.process(this.dec.process(iq)), n = z.length / 2, m = this.m;
    this.env = new Float32Array(n);
    const out = new Float32Array(n * m);
    for (let k = 0; k < n; k++) {
      const re = z[2 * k], im = z[2 * k + 1];
      this.env[k] = Math.hypot(re, im);
      const y = re * Math.cos(this.phase) - im * Math.sin(this.phase); // Re(z · e^{jφ}): the tone
      this.phase = (this.phase + this.step) % TAU;
      for (let j = 0; j < m; j++) out[k * m + j] = this.last + ((y - this.last) * (j + 1)) / m; // back to the input rate
      this.last = y;
    }
    return out;
  }
}

/** One-pole low-pass that undoes broadcast FM pre-emphasis (75 µs in the Americas). */
export class Deemphasis {
  private a: number;
  private y = 0;
  constructor(fs: number, tau = 75e-6) { this.a = 1 - Math.exp(-1 / (fs * tau)); }
  process(x: Float32Array): Float32Array {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = this.y += this.a * (x[i] - this.y);
    return out;
  }
}

/** Live audio level control: instant attack, slow release (default 0.4 s). (Files use normalize() instead.) */
export class Agc {
  private env = 1e-4;
  private decay: number;
  constructor(fs: number, release = 0.4) { this.decay = Math.exp(-1 / (release * fs)); }
  process(x: Float32Array, target = 0.5): Float32Array {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      this.env = a > this.env ? a : Math.max(1e-4, this.env * this.decay);
      out[i] = (x[i] * target) / this.env;
    }
    return out;
  }
}

/**
 * Squelch: mutes the audio while the channel holds only noise. Measures the channel's power (dB) for each
 * chunk, smooths it, opens above `threshold` and closes 3 dB below it (the gap stops it flickering).
 */
export class Squelch {
  threshold: number;
  open = false;
  level = -200;
  constructor(threshold = -40) { this.threshold = threshold; }
  update(channel: Float32Array): boolean {
    let p = 0;
    for (let k = 0; k < channel.length; k += 2) p += channel[k] ** 2 + channel[k + 1] ** 2;
    const db = 10 * Math.log10(p / Math.max(1, channel.length / 2) + 1e-20);
    this.level = this.level < -150 ? db : 0.7 * this.level + 0.3 * db;
    if (!this.open && this.level > this.threshold) this.open = true;
    else if (this.open && this.level < this.threshold - 3) this.open = false;
    return this.open;
  }
}

export function normalize(x: Float32Array, peak = 0.8): Float32Array {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / max;
  return x;
}

export type Mode = "WFM" | "NFM" | "AM" | "USB" | "LSB" | "CW";

export const DEFAULT_BW: Record<Mode, number> = { WFM: 200e3, NFM: 12.5e3, AM: 10e3, USB: 2.8e3, LSB: 2.8e3, CW: 500 };
export const CW_PITCH = 700; // Hz: the tone a CW signal is heard at

/** The full receive chain: tune → filter → decimate → demodulate → audio, as a stream. */
export class Receiver {
  readonly taps: Float32Array; // channel filter
  readonly chanFs: number;
  readonly audioFs: number;
  private mixer: Mixer;
  private chan: FirDecimator;
  private demod: { process(x: Float32Array): Float32Array; env?: Float32Array; envFs?: number };
  private deemph: Deemphasis | null;
  private audioFir: FirDecimator;

  constructor(fs: number, offset: number, mode: Mode, bw: number) {
    const ssb = mode === "USB" || mode === "LSB";
    const half = ssb ? bw : bw / 2; // SSB lives on one side of 0 Hz, so keep ±bw
    const m1 = Math.max(1, Math.floor(fs / Math.max(48e3, 1.5 * bw)));
    this.chanFs = fs / m1;
    // Anything between chanFs-half and fs/2 would alias onto our passband, so that is the stop edge.
    this.taps = firLowpass(half / fs, Math.max(this.chanFs - 2 * half, this.chanFs * 0.1) / fs);
    this.mixer = new Mixer(fs, offset);
    this.chan = new FirDecimator(this.taps, m1, 2);
    this.demod = mode === "WFM" || mode === "NFM" ? new FmDemod()
      : mode === "AM" ? new AmDemod() : mode === "CW" ? new CwDemod(this.chanFs, bw, CW_PITCH) : new SsbDemod(this.chanFs, bw, mode === "USB");
    this.deemph = mode === "WFM" ? new Deemphasis(this.chanFs) : null;

    const m2 = Math.max(1, Math.round(this.chanFs / 48e3));
    const audioCut = mode === "WFM" ? 15e3 : mode === "CW" ? 1500 : Math.min(half, 0.45 * (this.chanFs / m2));
    const ha = firLowpass(audioCut / this.chanFs, Math.max(this.chanFs / m2 / 2 - audioCut, 1e3) / this.chanFs);
    this.audioFir = new FirDecimator(ha, m2, 1);
    this.audioFs = this.chanFs / m2;
  }

  process(iq: Float32Array) {
    const channel = this.chan.process(this.mixer.process(iq));
    const demod = this.demod.process(channel);
    const audio = this.audioFir.process(this.deemph ? this.deemph.process(demod) : demod);
    return { channel, demod, audio, env: this.demod.env ?? null, envFs: this.demod.envFs ?? 0 };
  }
}

export interface Stages {
  taps: Float32Array;
  chanFs: number;
  channel: Float32Array; // after mix + filter + decimate
  demod: Float32Array; // raw demodulator output at chanFs
  audioFs: number;
  audio: Float32Array;
  env: Float32Array | null; // CW only: the keying envelope
  envFs: number;
}

/** Whole-buffer convenience for files: one chunk through a fresh Receiver, then normalized. */
export function receive(iq: Float32Array, fs: number, offset: number, mode: Mode, bw: number): Stages {
  const r = new Receiver(fs, offset, mode, bw);
  const { channel, demod, audio, env, envFs } = r.process(iq);
  return { taps: r.taps, chanFs: r.chanFs, channel, demod, audioFs: r.audioFs, audio: normalize(audio), env, envFs };
}

export interface SynthSignal {
  kind: "FM" | "AM" | "USB" | "CW";
  text?: string; // CW: what it sends (repeated)
  wpm?: number;
  offset: number; // Hz from center
  tone: number; // modulating tone, Hz
  amp: number;
}

export const DEMO_SIGNALS: SynthSignal[] = [
  { kind: "FM", offset: 200e3, tone: 1000, amp: 0.5 },
  { kind: "AM", offset: -150e3, tone: 600, amp: 0.4 },
  { kind: "USB", offset: 350e3, tone: 800, amp: 0.3 },
  { kind: "CW", offset: -320e3, tone: 0, amp: 0.25, text: "CQ DE IHOR K", wpm: 20 },
];

/** Synthetic IQ: a few modulated carriers plus white noise. Lets the lab run with no file. */
export function synth(fs: number, seconds: number, signals: SynthSignal[], noise = 0.02): Float32Array {
  const n = Math.floor(fs * seconds);
  const iq = new Float32Array(2 * n);
  for (const s of signals) {
    let ph = 0;
    // CW: an on/off keyed carrier, with 5 ms soft edges so it doesn't splatter
    let keyed: ((t: number) => number) | null = null;
    if (s.kind === "CW") {
      const { tones, duration } = schedule(s.text ?? "CQ", s.wpm ?? 18), period = duration + 1500, edge = 5;
      const gain = new Float32Array(Math.ceil(period)); // per millisecond, computed once
      for (const [a, b] of tones) for (let ms = Math.max(0, Math.floor(a - edge)); ms < Math.min(gain.length, b + edge); ms++) gain[ms] = Math.max(gain[ms], Math.min(1, (ms - a + edge) / (2 * edge), (b + edge - ms) / (2 * edge)));
      keyed = (t) => gain[Math.floor(((t / fs) * 1000) % period)];
    }
    for (let t = 0; t < n; t++) {
      const m = Math.sin((TAU * s.tone * t) / fs);
      let f = s.offset, a = s.amp;
      if (s.kind === "FM") f += 75e3 * m; // broadcast deviation
      else if (s.kind === "AM") a *= 1 + 0.8 * m;
      else if (s.kind === "CW") a *= keyed!(t);
      else if (s.kind === "USB") f += s.tone; // USB with one tone = a single carrier tone above the suppressed carrier
      ph += (TAU * f) / fs;
      iq[2 * t] += a * Math.cos(ph);
      iq[2 * t + 1] += a * Math.sin(ph);
    }
  }
  // ponytail: Math.random noise is fine for a demo; seed it if tests ever need determinism here.
  for (let i = 0; i < iq.length; i++) iq[i] += noise * (Math.random() * 2 - 1);
  return iq;
}
