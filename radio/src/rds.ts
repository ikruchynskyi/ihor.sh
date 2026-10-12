// RDS (RBDS in the US): the digital data FM stations send on a 57 kHz subcarrier, under the music. 1187.5 bit/s of
// biphase BPSK carrying the station's name (PS), RadioText (song and artist, show, slogan), its program type, and a PI
// code that in the US spells the call letters. From the FM demodulator's output (the multiplex) to text:
// 57 kHz → 0 Hz, low-pass, decimate → Costas loop (carrier phase) → half-bit matched filter → Mueller–Muller clock
// recovery (one sample per bit) → sign → differential decoding → 26-bit blocks found by their checkwords → groups.
// (The matched filter is the bit's own shape, +d then −d: one peak per bit. Half a bit on its own gives two peaks of
// opposite sign per bit, and the clock slips between them: that decoded 4 groups in 6 s instead of ~60.)
import { firLowpass, FirDecimator } from "./dsp.ts";

const BIT_RATE = 1187.5, SUB = 57_000;
const POLY = 0x5b9; // g(x) = x^10 + x^8 + x^7 + x^5 + x^4 + x^3 + 1
// A block is 16 data bits + 10 check bits; the check bits are XORed with an offset word that says which block it is.
// A valid block's remainder mod g is exactly its offset word.
const OFFSETS: Record<number, "A" | "B" | "C" | "C'" | "D"> = { 0x0fc: "A", 0x198: "B", 0x168: "C", 0x350: "C'", 0x1b4: "D" };
const NEXT = { A: "B", B: "C", C: "D", "C'": "D", D: "A" } as const;
/** Remainder of a 26-bit block mod g(x). */
export function syndrome(block: number) {
  let r = block;
  for (let bit = 25; bit >= 10; bit--) if (r & (1 << bit)) r ^= POLY << (bit - 10);
  return r & 0x3ff;
}
// Program types, the North American (RBDS) list
const PTY = ["", "News", "Information", "Sports", "Talk", "Rock", "Classic Rock", "Adult Hits", "Soft Rock", "Top 40", "Country", "Oldies", "Soft", "Nostalgia", "Jazz", "Classical", "R&B", "Soft R&B", "Language", "Religious Music", "Religious Talk", "Personality", "Public", "College", "", "", "", "", "", "Weather", "Emergency Test", "Emergency"];
/** US PI codes 0x1000–0x994F encode the call letters (K: from 4096, W: from 21672), three base-26 letters after the first. */
export function callLetters(pi: number) {
  if (pi < 0x1000 || pi > 0x994f) return "";
  const w = pi >= 21672, n = pi - (w ? 21672 : 4096), L = (k: number) => String.fromCharCode(65 + k);
  return (w ? "W" : "K") + L(Math.floor(n / 676)) + L(Math.floor((n % 676) / 26)) + L(n % 26);
}
const ch = (c: number) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : c === 0x0d ? "\r" : " ");

export type RdsInfo = { pi: string; call: string; ps: string; rt: string; pty: string; groups: number; errors: number };

export class RdsDecoder {
  info: RdsInfo = { pi: "", call: "", ps: "", rt: "", pty: "", groups: 0, errors: 0 };
  private phase = 0; private step: number;
  private lp: FirDecimator; private fs2: number;
  // Costas loop
  private theta = 0; private freq = 0; private pow = 1;
  costas = 0.02; clock = -0.05; // loop gains (carrier phase; clock). Swept on a 6 s HackRF recording of 97.1/97.9/98.7: 66–67 groups of ~68 with
  // 0–2 bad blocks for any clock gain from −0.01 to −0.3; a positive clock gain (the textbook sign here is the other way) found 2–8
  // matched filter and clock recovery
  private box: number[] = []; private older = 0; private newer = 0; private half: number; private sps: number;
  private hist: number[] = []; private mu = 0; private prev = 0; private prevDec = 0; private lastBit = 0;
  // blocks and groups
  private reg = 0; private bits = 0; private synced = false; private expect: keyof typeof NEXT = "A"; private bad = 0; private sinceBlock = 0;
  private group: (number | null)[] = [null, null, null, null];
  private psBuf = Array(8).fill(" "); private psSeen = 0; private rtBuf = Array(64).fill(" "); private rtAB = -1; private rtSeen = 0;

  private onUpdate?: (i: RdsInfo) => void;
  constructor(fs: number, onUpdate?: (i: RdsInfo) => void) {
    this.onUpdate = onUpdate;
    const D = Math.max(1, Math.round(fs / 20_000)); // ~20 kHz: room for the 2.4 kHz-wide data, cheap to run
    this.fs2 = fs / D; this.step = (2 * Math.PI * SUB) / fs;
    this.lp = new FirDecimator(firLowpass(2.6e3 / fs, 2e3 / fs), D, 2);
    this.sps = this.fs2 / BIT_RATE; this.half = Math.max(1, Math.round(this.sps / 2));
  }

  /** The FM demodulator's output (the multiplex), at the rate given to the constructor. */
  process(mpx: Float32Array) {
    const iq = new Float32Array(2 * mpx.length);
    for (let i = 0; i < mpx.length; i++) { iq[2 * i] = mpx[i] * Math.cos(this.phase); iq[2 * i + 1] = -mpx[i] * Math.sin(this.phase); this.phase += this.step; }
    this.phase %= 2 * Math.PI;
    const y = this.lp.process(iq);
    for (let i = 0; i < y.length; i += 2) this.sample(y[i], y[i + 1]);
  }

  private sample(re: number, im: number) {
    // Costas loop: rotate by the phase estimate; for BPSK the error is I·Q (normalized by the running power)
    const c = Math.cos(this.theta), s = Math.sin(this.theta), I = re * c + im * s, Q = im * c - re * s;
    this.pow = 0.999 * this.pow + 0.001 * (I * I + Q * Q);
    const e = (I * Q) / (this.pow + 1e-20);
    this.freq += (this.costas * this.costas) / 2 * e; this.theta += this.freq + this.costas * e;
    // biphase matched filter: a bit is +d for half a bit, then −d, so correlate the older half minus the newer half
    const v = I / Math.sqrt(this.pow + 1e-20), h = this.half, b = this.box;
    b.push(v); this.newer += v;
    if (b.length > h) { const m = b[b.length - 1 - h]; this.newer -= m; this.older += m; }
    if (b.length > 2 * h) this.older -= b.shift()!;
    this.hist.push((this.older - this.newer) / (2 * h));
    // Mueller–Muller: take a (linearly interpolated) sample every sps inputs, nudged by the timing error
    while (this.hist.length >= 2 && this.mu < this.hist.length - 1) {
      const k = Math.floor(this.mu), f = this.mu - k, x = this.hist[k] * (1 - f) + this.hist[k + 1] * f, dec = x > 0 ? 1 : -1;
      const err = this.prevDec * x - dec * this.prev;
      this.prev = x; this.prevDec = dec;
      this.mu += this.sps + this.clock * err;
      this.bit(dec > 0 ? 1 : 0);
    }
    const drop = Math.min(Math.floor(this.mu) - 1, this.hist.length - 2); // keep what the next sample still needs
    if (drop > 0) { this.hist.splice(0, drop); this.mu -= drop; }
  }

  private bit(b: number) {
    const m = b ^ this.lastBit; this.lastBit = b; // differential decoding
    this.reg = ((this.reg << 1) | m) & 0x3ffffff; this.bits++; this.sinceBlock++;
    if (!this.synced) {
      if (this.bits < 26) return;
      const o = OFFSETS[syndrome(this.reg)];
      if (o) { this.synced = true; this.expect = o; this.sinceBlock = 26; this.bad = 0; }
      else return;
    }
    if (this.sinceBlock < 26) return;
    this.sinceBlock = 0;
    const got = OFFSETS[syndrome(this.reg)], want = this.expect, ok = got === want || (want === "C" && got === "C'");
    this.expect = NEXT[want];
    if (!ok) { this.info.errors++; if (++this.bad > 20) this.synced = false; this.group = [null, null, null, null]; return; }
    this.bad = Math.max(0, this.bad - 1);
    const data = this.reg >>> 10, slot = { A: 0, B: 1, C: 2, "C'": 2, D: 3 }[want];
    if (slot === 0) this.group = [data, null, null, null]; else this.group[slot] = data;
    if (slot === 3) this.decode();
  }

  private decode() {
    const [A, B, C, D] = this.group;
    if (A == null || B == null || D == null) return;
    const i = this.info, type = B >> 12, v = (B >> 11) & 1;
    i.groups++; i.pi = A.toString(16).toUpperCase().padStart(4, "0"); i.call = callLetters(A); i.pty = PTY[(B >> 5) & 31];
    if (type === 0) { // 0A/0B: two characters of the 8-character station name
      const seg = B & 3; this.psBuf[2 * seg] = ch(D >> 8); this.psBuf[2 * seg + 1] = ch(D & 0xff);
      this.psSeen |= 1 << seg; if (this.psSeen === 15) { i.ps = this.psBuf.join("").trim(); this.psSeen = 0; }
    } else if (type === 2) { // 2A: four characters of 64 (C and D); 2B: two of 32 (D)
      const ab = (B >> 4) & 1, seg = B & 15;
      if (ab !== this.rtAB) { this.rtBuf.fill(" "); this.rtSeen = 0; this.rtAB = ab; } // the A/B flag flips: a new text
      const chars = v ? [D >> 8, D & 0xff] : C == null ? [] : [C >> 8, C & 0xff, D >> 8, D & 0xff];
      chars.forEach((c, k) => (this.rtBuf[seg * chars.length + k] = ch(c)));
      this.rtSeen |= 1 << seg;
      const text = this.rtBuf.join(""), end = text.indexOf("\r"), full = end >= 0 ? text.slice(0, end) : text;
      const need = Math.ceil((end >= 0 ? end : full.trimEnd().length) / (v ? 2 : 4)); // every segment up to the end
      if (need && Array.from({ length: need }, (_, k) => (this.rtSeen >> k) & 1).every(Boolean)) i.rt = full.trim();
    }
    this.onUpdate?.(i);
  }
}
