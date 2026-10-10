// A digital weather-satellite link in the style of Meteor-M's LRPT, transmitter and receiver, from scratch:
// picture → 8×8 DCT blocks → frames with a sync word → scrambling → a rate-½ convolutional code (CCSDS, K = 7) → QPSK at
// 72 000 symbols/s with root-raised-cosine pulses; and back: AGC, matched filter, Gardner timing recovery, a 4th-power
// frequency estimate and a Costas loop for Doppler, all four QPSK rotations tried, Viterbi decoding, sync search,
// descrambling and the picture. Simplified from the real thing (no Reed-Solomon layer, one image channel, our own
// coefficient packing instead of Meteor's Huffman-coded JPEG), but every stage is the real idea.
import { fft } from "./dsp.ts";

export const SYM_RATE = 72000, SPS = 4, FS = SYM_RATE * SPS; // 288 kHz complex samples
export const ASM = 0x1acffc1d;                               // the CCSDS attached sync marker
export const W = 256, MCUS = W / 8, KEEP = 15;               // picture width; coefficients kept per 8×8 block
export const FRAME_BYTES = 4 + 2 + MCUS * KEEP + 2;          // sync, strip number, blocks, CRC-16 = 488
/** CRC-16/CCITT: a checksum, so a frame damaged beyond what Viterbi fixed is dropped (the real link uses Reed-Solomon, which can also repair). */
export const crc16 = (b: Uint8Array, from: number, to: number) => { let c = 0xffff; for (let i = from; i < to; i++) { c ^= b[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c; };
const TAU = 2 * Math.PI;

// ---------- bits ----------
const parity = (x: number) => { x ^= x >> 4; x ^= x >> 2; x ^= x >> 1; return x & 1; };
const G1 = 0o171, G2 = 0o133;

/** The CCSDS pseudo-random scrambler (x⁸+x⁷+x⁵+x³+1, all ones to start): 255 bytes, XORed onto each frame after the sync. */
export const PN = (() => { const out = new Uint8Array(255); let sr = 0xff; for (let i = 0; i < 255; i++) { let b = 0; for (let k = 0; k < 8; k++) { const bit = sr & 1; b = (b << 1) | bit; const fb = (sr ^ (sr >> 3) ^ (sr >> 5) ^ (sr >> 7)) & 1; sr = (sr >> 1) | (fb << 7); } out[i] = b; } return out; })();

/** Rate-½, constraint length 7 convolutional encoder: each input bit becomes two output bits. State carries across calls. */
export class ConvEncoder {
  s = 0;
  encode(bits: Uint8Array): Uint8Array {
    const out = new Uint8Array(bits.length * 2);
    for (let i = 0; i < bits.length; i++) { const reg = (bits[i] << 6) | this.s; out[2 * i] = parity(reg & G1); out[2 * i + 1] = parity(reg & G2); this.s = reg >> 1; }
    return out;
  }
}

/** Soft-decision Viterbi decoder, streaming: push pairs of soft values (+ means bit 0), get decided bits back. */
export class Viterbi {
  private m = new Float64Array(64); private n = new Float64Array(64);
  private dec: Uint8Array[] = []; private D = 96; // traceback depth
  out: number[] = [];
  private exp = Array.from({ length: 128 }, (_, reg) => [1 - 2 * parity(reg & G1), 1 - 2 * parity(reg & G2)]);
  push(a: number, b: number) {
    const d = new Uint8Array(64), m = this.m, n = this.n;
    for (let ns = 0; ns < 64; ns++) {
      const u = ns >> 5, p0 = (ns & 31) << 1, p1 = p0 | 1, e0 = this.exp[(u << 6) | p0], e1 = this.exp[(u << 6) | p1];
      const m0 = m[p0] + a * e0[0] + b * e0[1], m1 = m[p1] + a * e1[0] + b * e1[1];
      if (m1 > m0) { n[ns] = m1; d[ns] = 1; } else n[ns] = m0;
    }
    let best = -Infinity; for (let i = 0; i < 64; i++) if (n[i] > best) best = n[i];
    for (let i = 0; i < 64; i++) m[i] = n[i] - best; // keep the numbers small
    this.dec.push(d);
    if (this.dec.length >= this.D + 32) this.trace(32);
  }
  /** Trace back from the best state and release the oldest `k` bits. */
  private trace(k: number) {
    let s = 0, best = -Infinity; for (let i = 0; i < 64; i++) if (this.m[i] > best) { best = this.m[i]; s = i; }
    const bits = new Uint8Array(this.dec.length);
    for (let t = this.dec.length - 1; t >= 0; t--) { bits[t] = s >> 5; s = ((s & 31) << 1) | this.dec[t][s]; }
    for (let t = 0; t < k; t++) this.out.push(bits[t]);
    this.dec.splice(0, k);
  }
  flush() { if (this.dec.length) this.trace(this.dec.length); }
}

// ---------- pictures: 8×8 DCT blocks, like JPEG ----------
const ZZ = (() => { const z: number[] = []; for (let s = 0; s < 15; s++) for (let i = 0; i <= s; i++) { const r = s % 2 ? i : s - i, c = s - r; if (r < 8 && c < 8) z.push(r * 8 + c); } return z; })();
const Q = Array.from({ length: 64 }, (_, k) => (k ? 3 + 2 * ((k >> 3) + (k & 7)) : 16)); // the average (DC) needs room: ±1024/16; finer detail, coarser steps
const cosT = Array.from({ length: 64 }, (_, k) => Math.cos(((2 * (k >> 3) + 1) * (k & 7) * Math.PI) / 16)); // [x][u]
const cu = (u: number) => (u ? 1 : Math.SQRT1_2);
function dct(block: Float32Array) { const out = new Float32Array(64); for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += block[y * 8 + x] * cosT[x * 8 + u] * cosT[y * 8 + v]; out[v * 8 + u] = 0.25 * cu(u) * cu(v) * s; } return out; }
function idct(c: Float32Array) { const out = new Float32Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += cu(u) * cu(v) * c[v * 8 + u] * cosT[x * 8 + u] * cosT[y * 8 + v]; out[y * 8 + x] = 0.25 * s; } return out; }

/** One strip (8 rows × W, gray 0–255) → the frame's payload: the first KEEP zig-zag coefficients of each block, quantized. */
export function encodeStrip(rows: Uint8Array, keep = KEEP): Int8Array {
  const out = new Int8Array(MCUS * keep), b = new Float32Array(64);
  for (let m = 0; m < MCUS; m++) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = rows[y * W + m * 8 + x] - 128;
    const c = dct(b);
    for (let k = 0; k < keep; k++) { const z = ZZ[k]; out[m * keep + k] = Math.max(-127, Math.min(127, Math.round(c[z] / Q[z]))); }
  }
  return out;
}
export function decodeStrip(data: Int8Array, keep = KEEP): Uint8Array {
  const rows = new Uint8Array(8 * W), c = new Float32Array(64);
  for (let m = 0; m < MCUS; m++) {
    c.fill(0); for (let k = 0; k < keep; k++) { const z = ZZ[k]; c[z] = data[m * keep + k] * Q[z]; }
    const px = idct(c); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rows[y * W + m * 8 + x] = Math.max(0, Math.min(255, Math.round(px[y * 8 + x] + 128)));
  }
  return rows;
}

/** The Earth from 830 km, made up: coast, land, sea and clouds that go on forever as the satellite moves. */
export function earthStrip(strip: number): Uint8Array {
  const rows = new Uint8Array(8 * W);
  const h = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy; };
  const fbm = (x: number, y: number) => noise(x, y) * 0.5 + noise(2 * x, 2 * y) * 0.25 + noise(4 * x, 4 * y) * 0.125 + noise(8 * x, 8 * y) * 0.0625;
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) {
    const Y = strip * 8 + y, coast = 128 + 60 * Math.sin(Y / 90) + 30 * (fbm(Y / 40, 1.3) - 0.5) * 2, land = x < coast;
    const ground = land ? 70 + 50 * fbm(x / 20, Y / 20) : 25 + 10 * fbm(x / 30, Y / 30);
    const cloud = Math.max(0, fbm(x / 45 + 7, Y / 45) * 1.9 - 0.85) * 2.2;
    rows[y * W + x] = Math.min(255, ground * (1 - Math.min(1, cloud)) + 245 * Math.min(1, cloud));
  }
  return rows;
}

/** A frame's bytes: sync word, strip number, picture data, all scrambled after the sync. */
export function buildFrame(strip: number, data: Int8Array): Uint8Array {
  const f = new Uint8Array(FRAME_BYTES);
  f[0] = ASM >>> 24; f[1] = (ASM >> 16) & 255; f[2] = (ASM >> 8) & 255; f[3] = ASM & 255;
  f[4] = strip >> 8; f[5] = strip & 255; f.set(new Uint8Array(data.buffer, data.byteOffset, data.length), 6);
  const c = crc16(f, 4, FRAME_BYTES - 2); f[FRAME_BYTES - 2] = c >> 8; f[FRAME_BYTES - 1] = c & 255;
  for (let i = 4; i < FRAME_BYTES; i++) f[i] ^= PN[(i - 4) % 255];
  return f;
}
const toBits = (bytes: Uint8Array) => { const b = new Uint8Array(bytes.length * 8); for (let i = 0; i < b.length; i++) b[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1; return b; };

// ---------- the radio: QPSK with root-raised-cosine pulses ----------
export function rrc(alpha = 0.6, span = 8, sps = SPS): Float32Array {
  const n = span * sps + 1, h = new Float32Array(n), m = (n - 1) / 2; let e = 0;
  for (let i = 0; i < n; i++) {
    const t = (i - m) / sps;
    if (t === 0) h[i] = 1 - alpha + (4 * alpha) / Math.PI;
    else if (Math.abs(Math.abs(4 * alpha * t) - 1) < 1e-9) h[i] = (alpha / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * alpha)) + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * alpha)));
    else h[i] = (Math.sin(Math.PI * t * (1 - alpha)) + 4 * alpha * t * Math.cos(Math.PI * t * (1 + alpha))) / (Math.PI * t * (1 - (4 * alpha * t) ** 2));
    e += h[i] * h[i];
  }
  for (let i = 0; i < n; i++) h[i] /= Math.sqrt(e);
  return h;
}
const H = rrc();
export const GAINS = { g1: 0.03, g2: 0.00002 };

/** The transmitter, streaming: strips in, complex baseband samples out (interleaved I, Q at FS). */
export class Transmitter {
  private enc = new ConvEncoder(); private hist = new Float32Array(2 * H.length);
  strip = 0;
  next(strips: number, picture: (strip: number) => Uint8Array = earthStrip): Float32Array {
    const frames: Uint8Array[] = [];
    for (let k = 0; k < strips; k++, this.strip++) frames.push(buildFrame(this.strip & 0xffff, encodeStrip(picture(this.strip))));
    const bytes = new Uint8Array(frames.length * FRAME_BYTES); frames.forEach((f, i) => bytes.set(f, i * FRAME_BYTES));
    const coded = this.enc.encode(toBits(bytes)), nsym = coded.length / 2, out = new Float32Array(nsym * SPS * 2);
    // upsample (a symbol, then SPS−1 zeros) and shape with the RRC pulse; the filter's memory carries across calls
    const L = H.length, hist = this.hist;
    for (let s = 0, o = 0; s < nsym; s++) for (let k = 0; k < SPS; k++, o++) {
      hist.copyWithin(2, 0, 2 * L - 2);
      hist[0] = k ? 0 : (1 - 2 * coded[2 * s]) * Math.SQRT1_2; hist[1] = k ? 0 : (1 - 2 * coded[2 * s + 1]) * Math.SQRT1_2;
      let i = 0, q = 0; for (let j = 0; j < L; j++) { i += H[j] * hist[2 * j]; q += H[j] * hist[2 * j + 1]; }
      out[2 * o] = i * 2; out[2 * o + 1] = q * 2; // ×2 keeps symbols near ±1 after the receiver's matched filter
    }
    return out;
  }
}

/** The space between: a frequency offset (Hz, may change sample to sample), a phase, and noise at an Es/N0 in dB. */
export class Channel {
  private ph = 0.7; private s = 12345;
  private g() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return (this.s + 0.5) / 4294967296; }
  apply(x: Float32Array, dopplerHz: number | ((i: number) => number), esn0dB: number): Float32Array {
    const y = new Float32Array(x.length), n = x.length / 2, sigma = Math.sqrt(2 * 10 ** (-esn0dB / 10)); // a symbol's energy is 4 (pulse ×2, unit-energy RRC), so N0 = 4/(Es/N0), half per axis
    for (let i = 0; i < n; i++) {
      const f = typeof dopplerHz === "number" ? dopplerHz : dopplerHz(i); this.ph += (TAU * f) / FS;
      const c = Math.cos(this.ph), s = Math.sin(this.ph), I = x[2 * i], Q = x[2 * i + 1];
      const r = Math.sqrt(-2 * Math.log(this.g())) * sigma, a = TAU * this.g();
      y[2 * i] = I * c - Q * s + r * Math.cos(a); y[2 * i + 1] = I * s + Q * c + r * Math.sin(a);
    }
    return y;
  }
}

export interface RxStats { symbols: number; freqHz: number; locked: boolean; rotation: number; frames: number; badFrames: number; lastStrip: number; evm: number }

/** The receiver, streaming: push samples, get picture strips (via onStrip) and the latest symbols for a constellation. */
export class Receiver {
  private mf = new Float32Array(2 * H.length); private y: number[] = []; private t = SPS * 2 + 0.3; private rate = SPS; private prevI = 0; private prevQ = 0;
  private agc = 1; private freq = 0; private cphase = 0; private w = 0; private sinceAcq = 0; coarseHz = 0; private phase = 0; private freqKnown = false; private acq: number[] = [];
  private vit = [0, 1, 2, 3].map(() => new Viterbi()); private rot = -1; private sr = [0, 0, 0, 0]; private hits = [0, 0, 0, 0]; private sinceSync = 0;
  private frameBits: number[] | null = null; private recoded = new ConvEncoder(); private hardRef: number[] = [];
  constellation: [number, number][] = []; /** symbols before the Costas loop, for showing what it fixes */ raw: [number, number][] = [];
  stats: RxStats = { symbols: 0, freqHz: 0, locked: false, rotation: -1, frames: 0, badFrames: 0, lastStrip: -1, evm: 0 };
  private onStrip: (strip: number, rows: Uint8Array) => void;
  constructor(onStrip: (strip: number, rows: Uint8Array) => void) { this.onStrip = onStrip; }

  push(x: Float32Array) {
    const L = H.length;
    // NCO (the Costas loop steers it), then the matched RRC filter
    for (let i = 0; i < x.length / 2; i++) {
      this.phase -= this.freq / SPS; const c = Math.cos(this.phase), s = Math.sin(this.phase), I = x[2 * i] * c - x[2 * i + 1] * s, Q = x[2 * i] * s + x[2 * i + 1] * c;
      const m = this.mf; m.copyWithin(2, 0, 2 * L - 2); m[0] = I; m[1] = Q;
      let a = 0, b = 0; for (let j = 0; j < L; j++) { a += H[j] * m[2 * j]; b += H[j] * m[2 * j + 1]; }
      this.y.push(a, b);
    }
    // Gardner timing recovery: sample each symbol, compare its neighbors through the mid point between them
    const at = (t: number) => { const k = Math.floor(t), f = t - k; return [this.y[2 * k] * (1 - f) + this.y[2 * k + 2] * f, this.y[2 * k + 1] * (1 - f) + this.y[2 * k + 3] * f]; };
    while (this.t + 2 < this.y.length / 2) {
      const [sI, sQ] = at(this.t), [mI, mQ] = at(this.t - this.rate / 2);
      const e = (this.prevI - sI) * mI + (this.prevQ - sQ) * mQ;
      this.prevI = sI; this.prevQ = sQ;
      this.rate += GAINS.g2 * e; this.rate = Math.min(SPS * 1.0005, Math.max(SPS * 0.9995, this.rate)); this.t += this.rate + GAINS.g1 * e;
      // (crystals agree to ~100 ppm: a tight leash on the rate keeps noise from walking it off before there's a signal)
      this.symbol(sI, sQ);
    }
    const drop = Math.max(0, Math.floor(this.t) - 4); this.y.splice(0, 2 * drop); this.t -= drop;
  }

  private symbol(I: number, Q: number) {
    // AGC: keep the symbols at magnitude 1 (each axis ±0.707)
    const p = Math.hypot(I, Q); this.agc += 0.002 * (p - this.agc); I /= this.agc; Q /= this.agc;
    this.stats.symbols++; this.raw.push([I, Q]); if (this.raw.length > 600) this.raw.splice(0, 100);
    if (!this.freqKnown) {
      // the 4th-power trick: QPSK's four phases all land on one point at ×4, so z⁴ spins at 4 × the frequency offset
      this.acq.push(I, Q);
      if (this.acq.length < 2 * 4096) return;
      const N = 4096, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        let zr = this.acq[2 * k], zi = this.acq[2 * k + 1]; for (let r = 0; r < 2; r++) { const t = zr * zr - zi * zi; zi = 2 * zr * zi; zr = t; } // z⁴
        re[k] = zr; im[k] = zi;
      }
      fft(re, im); // a spike at 4 × the offset: take the tallest bin
      let best = 0, bin = 0; for (let k = 0; k < N; k++) { const p = re[k] * re[k] + im[k] * im[k]; if (p > best) { best = p; bin = k; } }
      this.freq = ((bin < N / 2 ? bin : bin - N) * TAU) / N / 4; this.coarseHz = (this.freq * SYM_RATE) / TAU; this.freqKnown = true; this.acq = []; this.sinceAcq = 0;
      return;
    }
    // no sync word for 4 frames' worth of symbols after measuring: the estimate was off, measure again
    if (this.rot < 0 && ++this.sinceAcq > 4 * FRAME_BYTES * 8) { this.freqKnown = false; this.w = 0; this.freq = 0; return; }
    // Costas loop: rotate by the loop's phase, compare with the nearest QPSK point, steer phase and frequency
    const c = Math.cos(this.cphase), s = Math.sin(this.cphase), zi = I * c + Q * s, zq = -I * s + Q * c;
    const err = Math.sign(zi) * zq - Math.sign(zq) * zi;   // how far the symbol sits off its nearest QPSK point, as an angle
    this.w += 0.0004 * err; this.cphase += this.w + 0.03 * err; // a second-order loop: phase and frequency (the Doppler drift)
    if (this.cphase > Math.PI) this.cphase -= TAU; else if (this.cphase < -Math.PI) this.cphase += TAU;
    this.stats.freqHz = ((this.freq + this.w) * SYM_RATE) / TAU;
    this.stats.evm = 0.99 * this.stats.evm + 0.01 * ((Math.abs(zi) - 0.707) ** 2 + (Math.abs(zq) - 0.707) ** 2);
    this.constellation.push([zi, zq]); if (this.constellation.length > 600) this.constellation.splice(0, 100);
    // Four possible rotations (the loop can lock at any multiple of 90°): decode them all until one shows sync words.
    const rots: [number, number][] = [[zi, zq], [zq, -zi], [-zi, -zq], [-zq, zi]];
    for (let r = 0; r < 4; r++) {
      if (this.rot >= 0 && r !== this.rot) continue;
      this.vit[r].push(rots[r][0], rots[r][1]);
      for (const bit of this.vit[r].out) this.bit(r, bit);
      this.vit[r].out.length = 0;
    }
  }

  private bit(r: number, b: number) {
    this.sr[r] = ((this.sr[r] << 1) | b) >>> 0;
    if (this.frameBits && r === this.rot) {
      this.frameBits.push(b);
      if (this.frameBits.length === (FRAME_BYTES - 4) * 8) this.frame(this.frameBits), (this.frameBits = null);
      return;
    }
    if (r === this.rot) this.sinceSync++;
    let d = (this.sr[r] ^ ASM) >>> 0, e = 0; while (d) { d &= d - 1; e++; }
    if (e <= 2) {
      if (this.rot < 0 && ++this.hits[r] >= 2) { this.rot = r; this.stats.rotation = r; }
      if (r === this.rot) { this.frameBits = []; this.sinceSync = 0; this.stats.locked = true; }
    }
    if (this.rot >= 0 && this.sinceSync > 3 * FRAME_BYTES * 8) { this.rot = -1; this.hits = [0, 0, 0, 0]; this.stats.locked = false; this.stats.rotation = -1; this.sinceSync = 0; }
  }

  private frame(bits: number[]) {
    const bytes = new Uint8Array(FRAME_BYTES - 4);
    for (let i = 0; i < bytes.length; i++) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k]; bytes[i] = v ^ PN[i % 255]; }
    const strip = (bytes[0] << 8) | bytes[1], n = bytes.length;
    if (crc16(bytes, 0, n - 2) !== ((bytes[n - 2] << 8) | bytes[n - 1])) { this.stats.badFrames++; return; } // damaged: drop it
    this.stats.frames++; this.stats.lastStrip = strip;
    this.onStrip(strip, decodeStrip(new Int8Array(bytes.buffer, 2, MCUS * KEEP)));
  }
}

/** A satellite pass: elevation, slant range and Doppler for an 830 km orbit at 7.45 km/s that rises to `maxEl` degrees. */
export function pass(maxElDeg: number, f0Hz = 137.9e6, steps = 200) {
  const Re = 6371, R = Re + 830, v = 7.45, c = 299792.458, w = v / R, el0 = (maxElDeg * Math.PI) / 180;
  const beta = Math.acos((Re * Math.cos(el0)) / R) - el0; // the orbit's closest angle to us, seen from Earth's center
  const at = (a: number) => {
    const P = [R * Math.sin(a), R * Math.sin(beta) * Math.cos(a), R * Math.cos(beta) * Math.cos(a)], r = [P[0], P[1], P[2] - Re], range = Math.hypot(...r);
    const dP = [R * w * Math.cos(a), -R * w * Math.sin(beta) * Math.sin(a), -R * w * Math.cos(beta) * Math.sin(a)];
    return { el: (Math.asin(r[2] / range) * 180) / Math.PI, range, rate: (r[0] * dP[0] + r[1] * dP[1] + r[2] * dP[2]) / range };
  };
  let aMax = 0; while (at(aMax).el > 0 && aMax < 1) aMax += 1e-4; // where it sets
  const T = (2 * aMax) / w, points: { t: number; el: number; range: number; doppler: number }[] = [];
  for (let k = 0; k <= steps; k++) { const a = -aMax + (2 * aMax * k) / steps, p = at(a); points.push({ t: a / w, el: p.el, range: p.range, doppler: (-p.rate / c) * f0Hz }); }
  return { T, points };
}
