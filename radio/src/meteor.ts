// The real Meteor-M LRPT downlink (Meteor-M2 3 and 4 at 137.9 MHz, 72k symbols/s), from IQ samples to pictures:
// offset-QPSK demod (lrpt.ts's chain at any sample rate) → Viterbi in all 8 ambiguities → NRZ-M until the sync word shows →
// 1024-byte CADUs, de-randomized → VCDUs (VCID 5) → CCSDS packets → per-channel (APID 64–69) strips of 14 8×8 blocks,
// Huffman-coded like JPEG with the quality factor in each packet.
// Reed-Solomon (rs.ts) repairs each frame; until one frame has passed it (proof that the code is what we think), frames it
// can't fix are used anyway, after that they are dropped.
import { fft } from "./dsp.ts";
import { Viterbi, PN, rrc, ASM, ZZ, idct } from "./lrpt.ts";
import { rsDecodeInterleaved } from "./rs.ts";

export const SYM_RATE = 72000, CADU_BITS = 1020 * 8, WIDTH = 196 * 8; // 196 blocks across, 1568 pixels
const TAU = 2 * Math.PI;

// ---------- Meteor's JPEG: standard luminance tables, quality factor per packet ----------
const STD_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
export function qTable(q: number) {
  const f = q > 20 && q < 50 ? 5000 / q : 200 - 2 * q;
  return STD_Q.map((v) => Math.max(1, Math.round((f / 100) * v)));
}
/** Huffman table as a map from (length << 16 | code) to the symbol. */
function huff(counts: number[], vals: number[]) {
  const t = new Map<number, number>(); let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) { for (let i = 0; i < counts[len - 1]; i++) t.set((len << 16) | code++, vals[k++]); code <<= 1; }
  return t;
}
export const DC = huff([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
export const AC = huff([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]);

/** A packet's 14 blocks → 112×8 pixels (row-major); blocks after a decoding error stay 0. Returns how many decoded. */
export function decodeMcus(d: Uint8Array, q: number, out: Uint8Array): number {
  const qt = qTable(q); let pos = 0, dc = 0;
  const bit = () => { if (pos >= d.length * 8) throw 0; const b = (d[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return b; };
  const bits = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const sym = (t: Map<number, number>) => { let code = 0; for (let len = 1; len <= 16; len++) { code = (code << 1) | bit(); const s = t.get((len << 16) | code); if (s !== undefined) return s; } throw 0; };
  const ext = (v: number, n: number) => (n === 0 ? 0 : v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  let m = 0;
  try {
    for (; m < 14; m++) {
      const c = new Float32Array(64), z = new Float32Array(64);
      let n = sym(DC); dc += ext(bits(n), n); z[0] = dc;
      for (let k = 1; k < 64; ) {
        const rs = sym(AC); if (rs === 0) break; // end of block
        k += rs >> 4; n = rs & 15; if (k > 63) throw 0;
        z[k++] = ext(bits(n), n);
      }
      for (let k = 0; k < 64; k++) c[ZZ[k]] = z[k] * qt[ZZ[k]];
      const px = idct(c);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 112 + m * 8 + x] = Math.max(0, Math.min(255, Math.round(px[y * 8 + x] + 128)));
    }
  } catch { /* corrupted: keep what decoded */ }
  return m;
}

// ---------- the picture: one growing image per APID ----------
export class Channel {
  rows: Uint8Array[] = []; // 8-pixel-high strips, WIDTH wide
  rowSeq: number[] = [];   // the packet counter (unwrapped) where each row's line starts: lines channels up for combining
  rowMs: number[] = [];    // the satellite's clock (ms of its day) for each row, 0 for a lost line: puts the picture on the map
  private lastMcu = 999; private lastSeq = -1; private abs = -1; private gaps: number[] = [];
  add(mcu: number, seq: number, px: Uint8Array, ms = 0) {
    // a new line of blocks: the position went back to the left, or the packet counter jumped further than the position
    // (a line's other packets were lost)
    const steps = (mcu - this.lastMcu) / 14, jump = (seq - this.lastSeq + 16384) % 16384;
    this.abs = this.abs < 0 ? seq : this.abs + jump; // the 14-bit counter wraps every few minutes
    if (mcu <= this.lastMcu || jump >= steps + 10) {
      const start = this.abs - mcu / 14, prev = this.rowSeq.at(-1);
      if (prev !== undefined && start > prev) {
        const period = this.period(); // counter steps per line, learned from the lines that arrived one after another
        const missing = period ? Math.round((start - prev) / period) - 1 : 0, lost = missing <= MAX_FILL ? missing : 0;
        for (let k = 1; k <= lost; k++) { this.rows.push(new Uint8Array(WIDTH * 8)); this.rowSeq.push(prev + k * period); this.rowMs.push(0); }
        this.gaps.push(start - prev); if (this.gaps.length > 31) this.gaps.shift();
      }
      this.rows.push(new Uint8Array(WIDTH * 8)); this.rowSeq.push(start); this.rowMs.push(ms);
    }
    this.lastMcu = mcu; this.lastSeq = seq;
    const row = this.rows[this.rows.length - 1];
    for (let y = 0; y < 8; y++) row.set(px.subarray(y * 112, y * 112 + 112).subarray(0, Math.min(112, WIDTH - mcu * 8)), y * WIDTH + mcu * 8);
  }
  /** The usual counter gap between neighboring lines (the median, so lost lines don't skew it); 0 until two are seen. */
  private period() { if (this.gaps.length < 2) return 0; const g = [...this.gaps].sort((a, b) => a - b); return g[g.length >> 1]; }
}
const MAX_FILL = 50; // lines a gap may stand for; a longer one (a counter glitch) isn't filled

/** For each row of `base`, the row of `other` from the same scan line (-1 where `other` lost it). Each line is sent one
 *  channel after another, so their counters differ by a fixed offset: the most common gap to the other channel's nearest
 *  line, looking forward for a later channel and back for an earlier one. ponytail: assumes lines go out in APID order. */
export function align(base: Channel, baseApid: number, other: Channel, otherApid: number): number[] {
  if (base === other) return base.rows.map((_, i) => i);
  const fwd = otherApid > baseApid, count = new Map<number, number>(), o = other.rowSeq;
  for (const s of base.rowSeq) {
    let near = NaN; for (const t of o) if (fwd ? t >= s && !(t >= near) : t <= s && !(t <= near)) near = t;
    if (!Number.isNaN(near)) count.set(near - s, (count.get(near - s) ?? 0) + 1);
  }
  let d = 0, best = 0; for (const [k, n] of count) if (n > best) { best = n; d = k; }
  return base.rowSeq.map((s) => { let bi = -1, be = 4; o.forEach((t, i) => { const e = Math.abs(t - s - d); if (e < be) { be = e; bi = i; } }); return bi; });
}
/** A color picture from three channels (red, green, blue APIDs; one may repeat), lined up by scan line. */
export function composite(chs: Map<number, Channel>, apids: [number, number, number]) {
  const base = chs.get(apids[0])!, maps = apids.map((a) => align(base, apids[0], chs.get(a)!, a)), n = WIDTH * 8;
  const data = new Uint8ClampedArray(base.rows.length * n * 4);
  for (let r = 0; r < base.rows.length; r++)
    for (let k = 0; k < 3; k++) {
      const m = maps[k][r], src = m >= 0 ? chs.get(apids[k])!.rows[m] : null; if (!src) continue;
      for (let p = 0; p < n; p++) data[(r * n + p) * 4 + k] = src[p];
    }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: WIDTH, height: base.rows.length * 8 };
}

// ---------- frames → packets ----------
export class Packets {
  channels = new Map<number, Channel>();
  stats = { vcdus: 0, packets: 0, images: 0 };
  private buf: number[] | null = null; private last = -1;
  onImage?: (apid: number) => void;

  /** One de-randomized CADU body (1020 bytes, without the sync word). */
  vcdu(f: Uint8Array) {
    if ((f[1] & 0x3f) !== 5) return; // VCID 5 carries the imager; 63 is fill
    this.stats.vcdus++;
    const count = (f[2] << 16) | (f[3] << 8) | f[4];
    if (count !== ((this.last + 1) & 0xffffff)) this.buf = null; // a frame went missing: the packet in progress is lost
    this.last = count;
    const fhp = ((f[8] & 7) << 8) | f[9], data = f.subarray(10, 10 + 882);
    if (fhp === 0x7ff) { if (this.buf) this.more(data); return; }
    if (this.buf && fhp <= 882) this.more(data.subarray(0, fhp));
    this.buf = null;
    let p = fhp;
    while (p < 882) {
      if (p + 6 > 882) { this.buf = Array.from(data.subarray(p)); break; }
      const len = ((data[p + 4] << 8) | data[p + 5]) + 7;
      if (p + len > 882) { this.buf = Array.from(data.subarray(p)); break; }
      this.packet(data.subarray(p, p + len)); p += len;
    }
  }
  private more(d: Uint8Array) {
    const b = this.buf!; for (const v of d) b.push(v);
    if (b.length >= 6) { const len = ((b[4] << 8) | b[5]) + 7; if (b.length >= len) { this.packet(Uint8Array.from(b.slice(0, len))); this.buf = null; } }
  }
  private packet(p: Uint8Array) {
    this.stats.packets++;
    const apid = ((p[0] & 7) << 8) | p[1];
    if (apid < 64 || apid > 69 || p.length < 21) return;
    const mcu = p[14], q = p[19], px = new Uint8Array(112 * 8);
    if (mcu % 14 || mcu >= 196 || !decodeMcus(p.subarray(20), q, px)) return;
    let ch = this.channels.get(apid); if (!ch) this.channels.set(apid, (ch = new Channel()));
    ch.add(mcu, ((p[2] & 0x3f) << 8) | p[3], px, ((p[8] << 24) | (p[9] << 16) | (p[10] << 8) | p[11]) >>> 0); this.stats.images++; this.onImage?.(apid);
  }
}

// ---------- IQ → symbols → frames ----------
// Meteor-M2 3 and 4 send offset QPSK (Q runs half a symbol ahead of I), NRZ-M coded (a 1 is a change of bit), with the
// Reed-Solomon bytes in the conventional basis: SatDump's "METEOR M2-x LRPT 72k" pipeline, which this follows.
const ACQ_N = 16384;      // matched-filter samples per frequency measurement (80 ms at 204.8 kS/s)
const ACQ_MIN_PEAK = 30;  // tallest z⁴ bin ÷ the average: noise alone gives about 10, a signal at Es/N0 ≈ 2 dB over 30
const MAX_FREQ = 0.8;     // rad/symbol ≈ ±9 kHz: Doppler (±3.3 kHz) plus any dongle's crystal error
const SYNC_GAP = CADU_BITS + 32; // one sync word to the next

export interface MeteorStats { symbols: number; freqHz: number; locked: boolean; frames: number; evm: number; rsFixed: number; rsBad: number; rsProven: boolean }
export class MeteorReceiver {
  readonly packets = new Packets();
  stats: MeteorStats = { symbols: 0, freqHz: 0, locked: false, frames: 0, evm: 0, rsFixed: 0, rsBad: 0, rsProven: false };
  constellation: [number, number][] = [];
  private sps: number; private H: Float32Array; private mf: Float32Array; private y: number[] = []; private t: number; private rate: number;
  private prevI = 0; private prevQ = 0; private agc = 1;
  // the oscillator that cancels the carrier, sample by sample: `freq` (rad/symbol) is set by the z⁴ measurement and then
  // steered, with `phase`, by a carrier loop on every matched-filter sample, before I and Q are lined up
  private phase = 0; private freq = 0; private freqKnown = false; private acq = new Float32Array(2 * ACQ_N); private nAcq = 0; private sinceAcq = 0;
  // the 8 ambiguities. A 90° turn of offset QPSK swaps which channel runs half a symbol early, so it changes how the coded
  // bits pair up, not only their signs: 4 pairings of this symbol's I and Q with each other or with the previous I ×
  // 2 sign patterns (NRZ-M makes a full inversion harmless). Each gets its own Viterbi until one finds the sync word.
  private vit = Array.from({ length: 8 }, () => new Viterbi()); private hyp = -1; private sr = new Uint32Array(8);
  private nrz = new Uint8Array(8); private prevA = NaN;
  private nbits = new Float64Array(8); private lastHit = new Float64Array(8).fill(-Infinity);
  private frameBits: number[] | null = null; private sinceSync = 0;
  private rsDual: boolean | null = null; // which byte basis the Reed-Solomon code uses, once a frame proves it

  /** Whether the satellite's carrier frequency has been found (the z⁴ spike stood out). */
  get acquired() { return this.freqKnown; }

  readonly fs: number;
  constructor(fs: number) {
    this.fs = fs; this.sps = fs / SYM_RATE; this.rate = this.sps; this.t = this.sps * 2 + 0.3;
    this.H = rrc(0.5, 8, this.sps); this.mf = new Float32Array(2 * this.H.length);
  }

  /** Interleaved I/Q floats at `fs`, centered on the satellite's frequency. */
  push(x: Float32Array) {
    const H = this.H, L = H.length, m = this.mf, y = this.y;
    for (let i = 0; i < x.length / 2; i++) {
      this.phase += this.freq / this.sps;
      if (this.phase > Math.PI) this.phase -= TAU; else if (this.phase < -Math.PI) this.phase += TAU;
      const c = Math.cos(this.phase), s = Math.sin(this.phase), I = x[2 * i] * c + x[2 * i + 1] * s, Q = x[2 * i + 1] * c - x[2 * i] * s; // × e^(−j·phase)
      m.copyWithin(2, 0, 2 * L - 2); m[0] = I; m[1] = Q;
      let a = 0, b = 0; for (let j = 0; j < L; j++) { a += H[j] * m[2 * j]; b += H[j] * m[2 * j + 1]; }
      y.push(a, b);
      if (this.freqKnown) { // carrier loop on every sample, before and independent of symbol timing (as SatDump and MeteorDemod do)
        const err = Math.max(-1, Math.min(1, (Math.sign(a) * b - Math.sign(b) * a) / (this.agc + 1e-12))); // clamped: a noise spike can't kick it
        this.phase += (0.015 / this.sps) * err; this.freq = Math.max(-MAX_FREQ, Math.min(MAX_FREQ, this.freq + (0.00004 / this.sps) * err));
      } else { this.acq[2 * this.nAcq] = a; this.acq[2 * this.nAcq + 1] = b; if (++this.nAcq === ACQ_N) this.acquire(); }
      while (this.t + 2 < y.length / 2) this.timing();
    }
    const drop = Math.max(0, Math.floor(this.t - this.rate) - 2); y.splice(0, 2 * drop); this.t -= drop;
  }

  /** The 4th-power trick on raw matched-filter samples: z⁴ wipes out the QPSK data and leaves a spike at 4× the carrier
   *  offset. On raw samples (not lined-up symbols) it doesn't depend on timing or on offset QPSK's half-symbol shift. */
  private acquire() {
    const N = ACQ_N, re = new Float32Array(N), im = new Float32Array(N), z = this.acq;
    for (let k = 0; k < N; k++) {
      let zr = z[2 * k], zi = z[2 * k + 1]; const mag = Math.hypot(zr, zi) || 1e-12; zr /= mag; zi /= mag;
      for (let r = 0; r < 2; r++) { const t = zr * zr - zi * zi; zi = 2 * zr * zi; zr = t; }
      re[k] = zr; im[k] = zi;
    }
    fft(re, im);
    let best = 0, sum = 0, bin = 0;
    for (let k = 0; k < N; k++) { const pw = re[k] * re[k] + im[k] * im[k]; if (pw > best) { best = pw; bin = k; } sum += pw; }
    if (best / (sum / N || 1e-12) > ACQ_MIN_PEAK) { // the offset in rad per sample, ÷4, as rad per symbol
      this.freq = Math.max(-MAX_FREQ, Math.min(MAX_FREQ, this.freq + (((bin < N / 2 ? bin : bin - N) * TAU) / N / 4) * this.sps));
      this.freqKnown = true; this.sinceAcq = 0; this.nAcq = 0;
    } else { z.copyWithin(0, N, 2 * N); this.nAcq = N / 2; } // keep the newer half and keep looking
  }

  /** Matched-filter output at a fractional sample position: k = 0 for I, 1 for Q. */
  private at(t: number, k: number) { // cubic (Catmull-Rom) through the 4 nearest samples: less loss than a straight line at ~2.8 samples a symbol
    const y = this.y, n = Math.floor(t), f = t - n, p0 = y[2 * n - 2 + k] ?? y[2 * n + k], p1 = y[2 * n + k], p2 = y[2 * n + 2 + k], p3 = y[2 * n + 4 + k] ?? p2;
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }

  /** Gardner timing recovery on I and on Q taken half a symbol earlier (offset QPSK lined up into plain QPSK). */
  private timing() {
    const h = this.rate / 2, I = this.at(this.t, 0), Q = this.at(this.t - h, 1), mI = this.at(this.t - h, 0), mQ = this.at(this.t - 2 * h, 1);
    const e = ((this.prevI - I) * mI + (this.prevQ - Q) * mQ) / (this.agc * this.agc + 1e-12); // scaled, so the loop's speed doesn't depend on signal level
    this.prevI = I; this.prevQ = Q;
    this.rate = Math.min(this.sps * 1.0005, Math.max(this.sps * 0.9995, this.rate + 0.00001 * e)); this.t += this.rate + 0.015 * e;
    this.symbol(I, Q);
  }

  private symbol(I: number, Q: number) {
    const p = Math.hypot(I, Q); this.agc += 0.002 * (p - this.agc); I /= this.agc; Q /= this.agc;
    this.stats.symbols++;
    if (!this.freqKnown) return;
    // no sync for 6 frames' worth: measure the frequency again from scratch (the estimate may have been a stray carrier)
    if (this.hyp < 0 && ++this.sinceAcq > 6 * 8192) { this.freqKnown = false; this.freq = 0; this.nAcq = 0; return; }
    this.stats.freqHz = (this.freq * SYM_RATE) / TAU;
    this.stats.evm = 0.999 * this.stats.evm + 0.001 * ((Math.abs(I) - 0.707) ** 2 + (Math.abs(Q) - 0.707) ** 2);
    if (this.stats.symbols % 4 === 0) { this.constellation.push([I, Q]); if (this.constellation.length > 1000) this.constellation.splice(0, 200); }
    const pa = this.prevA, pairs: [number, number][] = [[I, Q], [Q, I], [Q, pa], [pa, Q]];
    this.prevA = I;
    for (let h = 0; h < 8; h++) {
      if (this.hyp >= 0 && h !== this.hyp) continue;
      const [x, y] = pairs[h >> 1];
      if (Number.isNaN(x) || Number.isNaN(y)) continue; // the very first symbol has no previous I
      const v = this.vit[h]; v.push(x, h & 1 ? -y : y);
      for (const bit of v.out) this.bit(h, bit);
      v.out.length = 0;
    }
  }

  private bit(h: number, raw: number) {
    const b = raw ^ this.nrz[h]; this.nrz[h] = raw; // NRZ-M: a 1 means "the bit changed"
    this.sr[h] = ((this.sr[h] << 1) | b) >>> 0; this.nbits[h]++;
    if (this.frameBits && h === this.hyp) {
      this.frameBits.push(b);
      if (this.frameBits.length === CADU_BITS) { this.frame(this.frameBits); this.frameBits = null; }
      return;
    }
    if (h === this.hyp) this.sinceSync++;
    if (pop(this.sr[h] ^ ASM) <= 3) {
      if (this.hyp < 0) { // a sync word exactly a whole number of frames after the last one is no coincidence
        const gap = this.nbits[h] - this.lastHit[h]; this.lastHit[h] = this.nbits[h];
        if (gap % SYNC_GAP === 0 && gap <= 4 * SYNC_GAP) this.hyp = h;
      }
      if (h === this.hyp) { this.frameBits = []; this.sinceSync = 0; this.stats.locked = true; }
    }
    if (this.hyp >= 0 && this.sinceSync > 3 * SYNC_GAP) { this.hyp = -1; this.lastHit.fill(-Infinity); this.stats.locked = false; this.sinceSync = 0; this.sinceAcq = 0; this.freqKnown = false; this.nAcq = 0; }
  }

  private frame(bits: number[]) {
    const f = new Uint8Array(1020);
    for (let i = 0; i < 1020; i++) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k]; f[i] = v ^ PN[i % 255]; }
    this.stats.frames++;
    let fixed = -1;
    for (const dual of [false, true]) { // until a frame passes, try both byte bases; then only the one that worked
      if (fixed >= 0 || (this.rsDual !== null && this.rsDual !== dual)) continue;
      const g = f.slice(), n = rsDecodeInterleaved(g, 4, dual);
      if (n >= 0) { fixed = n; this.rsDual = dual; f.set(g); }
    }
    if (fixed >= 0) { this.stats.rsProven = true; this.stats.rsFixed += fixed; }
    else { this.stats.rsBad++; if (this.stats.rsProven) return; } // too damaged to repair: its packets would only add noise
    this.packets.vcdu(f);
  }
}
const pop = (x: number) => { x >>>= 0; let n = 0; while (x) { x &= x - 1; n++; } return n; };
