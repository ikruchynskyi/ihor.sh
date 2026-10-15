// Run: node src/meteor.test.ts. A synthetic Meteor-M2 3/4 pass in the real format, as SatDump's "M2-x LRPT 72k" pipeline
// expects it (packets → M_PDU → VCDU → Reed-Solomon in the conventional basis → PN → ASM → NRZ-M → convolutional code →
// offset QPSK, RRC roll-off 0.5, at 204.8 kS/s like the page), with Doppler, an unknown phase, mirrored I/Q and noise,
// decoded back to pixels.
import assert from "node:assert/strict";
import { MeteorReceiver, DC, qTable, Channel, align, composite } from "./meteor.ts";
import { ConvEncoder, PN, ASM } from "./lrpt.ts";
import { rsEncode } from "./rs.ts";

// 1. Image packets: 14 flat 8×8 blocks each (DC only), brightness ramping across the line.
const q = 80, q0 = qTable(q)[0], level = (line: number, m: number) => 40 + ((m * 3 + line * 20) % 160);
const dcCode = new Map([...DC].map(([k, v]) => [v, k]));
function packet(apid: number, seq: number, line: number, mcu: number) {
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
  p[14] = mcu; p[19] = q; p.set(data, 20);
  return p;
}
const stream: number[] = []; let seq = 0;
for (let line = 0; line < 12; line++) for (let mcu = 0; mcu < 196; mcu += 14) stream.push(...packet(64, seq++, line, mcu));

// 2. VCDUs of 882 data bytes, each with the pointer to the first packet header starting in it.
const starts = new Set<number>(); for (let p = 0; p < stream.length; ) { starts.add(p); p += ((stream[p + 4] << 8) | stream[p + 5]) + 7; }
const cadus: number[] = [];
for (let v = 0; v * 882 < stream.length; v++) {
  const f = new Uint8Array(1020); f[0] = 0x40; f[1] = 5; f[2] = 0; f[3] = v >> 8; f[4] = v & 0xff;
  let fhp = 0x7ff; for (let i = 0; i < 882; i++) if (starts.has(v * 882 + i)) { fhp = i; break; }
  f[8] = fhp >> 8; f[9] = fhp & 0xff;
  for (let i = 0; i < 882; i++) f[10 + i] = stream[v * 882 + i] ?? 0;
  for (let c = 0; c < 4; c++) { // Reed-Solomon check bytes, 4 codewords interleaved, conventional basis (as M2-3/M2-4 send)
    const d = Uint8Array.from({ length: 223 }, (_, j) => f[j * 4 + c]), par = rsEncode(d, false);
    for (let j = 0; j < 32; j++) f[(223 + j) * 4 + c] = par[j];
  }
  cadus.push(ASM >>> 24, (ASM >> 16) & 0xff, (ASM >> 8) & 0xff, ASM & 0xff, ...f.map((b, i) => b ^ PN[i % 255]));
}

// 3. Bits → NRZ-M → convolutional code → offset QPSK (Q half a symbol off I) with RRC pulses at 204.8 kS/s, through the channel.
const data = Uint8Array.from({ length: cadus.length * 8 }, (_, i) => (cadus[i >> 3] >> (7 - (i & 7))) & 1);
let lfsr = 0xace1; // pseudo-random data before the first frame (a repeating pattern would put false lines in the z⁴ spectrum)
const pre = Uint8Array.from({ length: 30000 }, () => { lfsr = (lfsr >> 1) ^ (-(lfsr & 1) & 0xb400); return lfsr & 1; });
const plain = Uint8Array.from([...pre, ...data]), nrzm = new Uint8Array(plain.length);
for (let i = 0; i < plain.length; i++) nrzm[i] = plain[i] ^ (i ? nrzm[i - 1] : 0); // a 1 is sent as a change
const coded = new ConvEncoder().encode(nrzm);
const nsym = coded.length / 2, fs = 204800, sps = fs / 72000, a = 0.5;
const h = (t: number) => { // root-raised-cosine at t symbols
  if (Math.abs(t) < 1e-9) return 1 - a + (4 * a) / Math.PI;
  if (Math.abs(Math.abs(4 * a * t) - 1) < 1e-9) return (a / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * a)) + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * a)));
  return (Math.sin(Math.PI * t * (1 - a)) + 4 * a * t * Math.cos(Math.PI * t * (1 + a))) / (Math.PI * t * (1 - (4 * a * t) ** 2));
};
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
/** The pass: `qShift` is where Q's symbols sit relative to I's (±0.5), `dop(seconds)` the Doppler in Hz, `sigma` the noise. */
function signal(qShift: number, dop: (s: number) => number, sigma: number) {
  const n = Math.floor(nsym * sps), iq = new Float32Array(2 * n);
  let ph = 1.1;
  for (let i = 0; i < n; i++) {
    const t = i / sps; let re = 0, im = 0;
    for (let k = Math.max(0, Math.ceil(t - 6)); k <= Math.min(nsym - 1, Math.floor(t + 6)); k++) { re += h(t - k) * (1 - 2 * coded[2 * k]); im += h(t - k - qShift) * (1 - 2 * coded[2 * k + 1]); }
    im = -im; // mirrored I/Q
    ph += (2 * Math.PI * dop(i / fs)) / fs;
    const c = Math.cos(ph), s = Math.sin(ph);
    iq[2 * i] = 0.3 * (re * c - im * s) + sigma * gauss(); iq[2 * i + 1] = 0.3 * (re * s + im * c) + sigma * gauss();
  }
  return iq;
}

// 4. Decode, in chunks like the live page.
function decode(name: string, iq: Float32Array, finalDop: number, minBlocks: number) {
  const rx = new MeteorReceiver(fs);
  for (let i = 0; i < iq.length; i += 32768) rx.push(iq.subarray(i, i + 32768));
  const ch = rx.packets.channels.get(64);
  console.log(`${name}: Doppler ends at ${finalDop.toFixed(0)} Hz → measured ${rx.stats.freqHz.toFixed(0)} Hz; ${rx.stats.frames} of ${cadus.length / 1024} frames, ${rx.packets.stats.packets} packets, ${ch?.rows.length ?? 0} lines of blocks, Reed-Solomon fixed ${rx.stats.rsFixed} bytes, ${rx.stats.rsBad} frames beyond repair`);
  assert.ok(Math.abs(rx.stats.freqHz - finalDop) < 100, `${name}: frequency tracked`);
  assert.ok(ch && ch.rows.length >= 2, `${name}: picture lines`);
  let good = 0, checked = 0;
  for (const row of ch.rows) { // which line each row is (the first frames are lost while locking on); blocks never received stay 0
    const got = Array.from({ length: 196 }, (_, m) => row[3 * 1568 + m * 8 + 3]);
    const ok = (line: number) => got.filter((v, m) => v && Math.abs(v - level(line, m)) <= 4).length;
    good += Math.max(...Array.from({ length: 12 }, (_, l) => ok(l))); checked += got.filter((v) => v).length;
  }
  assert.ok(rx.stats.rsProven && checked >= minBlocks && good === checked, `${name}: ${good} of ${checked} blocks exact`);
}
// Es/N0 = 0.256 / sigma² here (a symbol's energy over the noise density): 0.30 → 4.5 dB, 0.35 → 3.2 dB, close to the
// ~2.5–3 dB where the rate-½ code stops coping. Real passes sweep about ±3.3 kHz at up to ~70 Hz/s; the second case
// swings 5.6 kHz in under a second, past the old receiver's ±2.9 kHz tracking range.
const secs = (nsym * sps) / fs, hold = 0.45;
decode("Q ahead, steady 2.8 kHz, 4.5 dB", signal(-0.5, () => 2800, 0.3), 2800, 1500);
decode("Q behind, 2.8 → −2.8 kHz, 4.5 dB", signal(0.5, (t) => (t < hold ? 2800 : 2800 - (5600 * (t - hold)) / (secs - hold)), 0.3), -2800, 500);
decode("Q ahead, −1.5 kHz, 3.2 dB", signal(-0.5, () => -1500, 0.35), -1500, 500);
// 5. Lining channels up: one shared counter, each line sent as 14 packets of APID 64, then 65, then 66, then telemetry.
// Channel 65 loses line 3 completely (it becomes a blank row); the counter wraps at 16384 in the middle.
{
  const chs = new Map([64, 65, 66].map((a) => [a, new Channel()])), px = new Uint8Array(112 * 8);
  let seq = 16384 - 100;
  for (let line = 0; line < 8; line++) for (const a of [64, 65, 66, 70]) for (let k = 0; k < 14; k++, seq++) if (a !== 70 && !(a === 65 && line === 3)) chs.get(a)!.add(k * 14, seq % 16384, px);
  assert.equal(chs.get(65)!.rows.length, 8, "the lost line is kept as a gap, so the picture keeps its shape");
  assert.ok(chs.get(65)!.rows[3].every((v) => v === 0) && chs.get(65)!.rowMs[3] === 0, "a blank row with no time");
  assert.deepEqual(align(chs.get(65)!, 65, chs.get(64)!, 64), [0, 1, 2, 3, 4, 5, 6, 7], "65 → 64 looks back");
  assert.deepEqual(align(chs.get(64)!, 64, chs.get(65)!, 65), [0, 1, 2, 3, 4, 5, 6, 7], "64 → 65 looks forward");
  assert.deepEqual(align(chs.get(64)!, 64, chs.get(66)!, 66), [0, 1, 2, 3, 4, 5, 6, 7]);
  const img = composite(chs, [65, 65, 64]);
  assert.equal(img.height, 8 * 8, "as tall as the red channel, gap included");
  console.log("channels line up across a lost line and the counter wrap");
}
console.log("all checks passed");
