// A synthetic Meteor-M2 3/4 pass, built the way the satellite builds its signal (as SatDump's "M2-x LRPT 72k" pipeline
// expects it): picture packets → M_PDU → VCDUs → Reed-Solomon (conventional basis) → scrambling → sync words → NRZ-M →
// convolutional code → offset QPSK with root-raised-cosine pulses (roll-off 0.5), then Doppler, an unknown phase,
// mirrored I/Q and noise. Used by meteor.test.ts and by the page's self-test: the receiver must give back the exact pixels.
import { DC, qTable } from "./meteor.ts";
import { ConvEncoder, PN, ASM } from "./lrpt.ts";
import { rsEncode } from "./rs.ts";

/** The test picture: flat 8×8 blocks whose brightness ramps across each line and changes from line to line. */
export const level = (line: number, m: number) => 40 + ((m * 3 + line * 20) % 160);

const q = 80, q0 = qTable(q)[0], dcCode = new Map([...DC].map(([k, v]) => [v, k]));
/** One image packet: 14 blocks (DC only) of line `line`, starting at block `mcu`, stamped `ms` (satellite ms of day). */
function packet(apid: number, seq: number, line: number, mcu: number, ms: number) {
  const bits: number[] = [], put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  let prev = 0;
  for (let m = 0; m < 14; m++) {
    const dc = Math.round(((level(line, mcu + m) - 128) * 8) / q0), d = dc - prev; prev = dc;
    const n = d === 0 ? 0 : Math.floor(Math.log2(Math.abs(d))) + 1, key = dcCode.get(n)!;
    put(key & 0xffff, key >> 16); if (n) put(d > 0 ? d : d + (1 << n) - 1, n);
    put(0b1010, 4); // end of block
  }
  while (bits.length % 8) bits.push(1);
  const data = Uint8Array.from({ length: bits.length / 8 }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  const p = new Uint8Array(20 + data.length), len = p.length - 7;
  p.set([0x08 | (apid >> 8), apid & 0xff, 0xc0 | (seq >> 8), seq & 0xff, len >> 8, len & 0xff]);
  p[8] = (ms >>> 24) & 255; p[9] = (ms >> 16) & 255; p[10] = (ms >> 8) & 255; p[11] = ms & 255;
  p[14] = mcu; p[19] = q; p.set(data, 20);
  return p;
}

export interface SimOptions {
  lines?: number; apids?: number[];
  /** Where Q's symbols sit relative to I's: −0.5 (ahead) or 0.5 (behind). */
  qShift?: number;
  /** Doppler in Hz at a time in seconds. */
  doppler?: (s: number) => number;
  /** Noise per axis; Es/N0 = 0.256 / sigma² (0.30 → 4.5 dB, 0.40 → 2.0 dB). */
  sigma?: number;
  fs?: number; seed?: number;
  /** The first line's time (UTC ms), stamped into the packets in Moscow time; 0 leaves the stamps empty. */
  start?: number;
}

/** The pass as interleaved I/Q floats at `fs`, and how many 1024-byte frames it carries. */
export function synthesize(o: SimOptions = {}) {
  const { lines = 12, apids = [64], qShift = -0.5, doppler = () => 0, sigma = 0.3, fs = 204800, seed = 7, start = 0 } = o;
  const stream: number[] = []; let seq = 0;
  for (let line = 0; line < lines; line++) {
    const ms = start ? (start + line * 1232 + 3 * 3600e3) % 864e5 : 0;
    for (const apid of apids) for (let mcu = 0; mcu < 196; mcu += 14) stream.push(...packet(apid, seq++, line, mcu, ms));
    seq++; // the telemetry packet that follows each line
  }
  // VCDUs of 882 data bytes, each pointing at the first packet header that starts in it
  const starts = new Set<number>(); for (let p = 0; p < stream.length; ) { starts.add(p); p += ((stream[p + 4] << 8) | stream[p + 5]) + 7; }
  const cadus: number[] = [];
  for (let v = 0; v * 882 < stream.length; v++) {
    const f = new Uint8Array(1020); f[0] = 0x40; f[1] = 5; f[2] = 0; f[3] = v >> 8; f[4] = v & 0xff;
    let fhp = 0x7ff; for (let i = 0; i < 882; i++) if (starts.has(v * 882 + i)) { fhp = i; break; }
    f[8] = fhp >> 8; f[9] = fhp & 0xff;
    for (let i = 0; i < 882; i++) f[10 + i] = stream[v * 882 + i] ?? 0;
    for (let c = 0; c < 4; c++) { // Reed-Solomon check bytes, 4 codewords interleaved
      const d = Uint8Array.from({ length: 223 }, (_, j) => f[j * 4 + c]), par = rsEncode(d, false);
      for (let j = 0; j < 32; j++) f[(223 + j) * 4 + c] = par[j];
    }
    cadus.push(ASM >>> 24, (ASM >> 16) & 0xff, (ASM >> 8) & 0xff, ASM & 0xff, ...f.map((b, i) => b ^ PN[i % 255]));
  }
  // bits → NRZ-M → convolutional code
  const data = Uint8Array.from({ length: cadus.length * 8 }, (_, i) => (cadus[i >> 3] >> (7 - (i & 7))) & 1);
  let lfsr = 0xace1; // pseudo-random data before the first frame (a repeating pattern would put false lines in the z⁴ spectrum)
  const pre = Uint8Array.from({ length: 30000 }, () => { lfsr = (lfsr >> 1) ^ (-(lfsr & 1) & 0xb400); return lfsr & 1; });
  const plain = Uint8Array.from([...pre, ...data]), nrzm = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) nrzm[i] = plain[i] ^ (i ? nrzm[i - 1] : 0); // a 1 is sent as a change
  const coded = new ConvEncoder().encode(nrzm);
  // offset QPSK with RRC pulses, through the channel
  const nsym = coded.length / 2, sps = fs / 72000, a = 0.5;
  const h = (t: number) => {
    if (Math.abs(t) < 1e-9) return 1 - a + (4 * a) / Math.PI;
    if (Math.abs(Math.abs(4 * a * t) - 1) < 1e-9) return (a / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * a)) + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * a)));
    return (Math.sin(Math.PI * t * (1 - a)) + 4 * a * t * Math.cos(Math.PI * t * (1 + a))) / (Math.PI * t * (1 - (4 * a * t) ** 2));
  };
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = Math.floor(nsym * sps), iq = new Float32Array(2 * n);
  let ph = 1.1;
  for (let i = 0; i < n; i++) {
    const t = i / sps; let re = 0, im = 0;
    for (let k = Math.max(0, Math.ceil(t - 6)); k <= Math.min(nsym - 1, Math.floor(t + 6)); k++) { re += h(t - k) * (1 - 2 * coded[2 * k]); im += h(t - k - qShift) * (1 - 2 * coded[2 * k + 1]); }
    im = -im; // mirrored I/Q
    ph += (2 * Math.PI * doppler(i / fs)) / fs;
    const c = Math.cos(ph), sn = Math.sin(ph);
    iq[2 * i] = 0.3 * (re * c - im * sn) + sigma * gauss(); iq[2 * i + 1] = 0.3 * (re * sn + im * c) + sigma * gauss();
  }
  return { iq, frames: cadus.length / 1024, seconds: n / fs };
}

/** How many decoded blocks match the test picture exactly (by sampling one pixel per block), and how many there were. */
export function score(rows: Uint8Array[], lines = 12) {
  let good = 0, checked = 0;
  for (const row of rows) {
    const got = Array.from({ length: 196 }, (_, m) => row[3 * 1568 + m * 8 + 3]);
    const ok = (line: number) => got.filter((v, m) => v && Math.abs(v - level(line, m)) <= 4).length;
    good += Math.max(...Array.from({ length: lines }, (_, l) => ok(l))); checked += got.filter((v) => v).length;
  }
  return { good, checked };
}
