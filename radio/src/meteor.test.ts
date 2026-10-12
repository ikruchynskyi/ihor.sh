// Run: node src/meteor.test.ts. A synthetic Meteor-M pass in the real frame format (packets → M_PDU → VCDU → PN → ASM →
// convolutional code → RRC QPSK at 240 kS/s, with Doppler, an unknown phase, mirrored I/Q and noise), decoded back to pixels.
import assert from "node:assert/strict";
import { MeteorReceiver, DC, qTable } from "./meteor.ts";
import { ConvEncoder, PN, ASM } from "./lrpt.ts";

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
  cadus.push(ASM >>> 24, (ASM >> 16) & 0xff, (ASM >> 8) & 0xff, ASM & 0xff, ...f.map((b, i) => b ^ PN[i % 255]));
}

// 3. Bits → convolutional code → QPSK symbols → RRC pulses sampled at 240 kS/s, through the channel.
const bits = Uint8Array.from({ length: cadus.length * 8 }, (_, i) => (cadus[i >> 3] >> (7 - (i & 7))) & 1);
const pre = Uint8Array.from({ length: 30000 }, (_, i) => (i * 7919) % 3 & 1); // some noise-like data before the first frame
const coded = new ConvEncoder().encode(Uint8Array.from([...pre, ...bits]));
const nsym = coded.length / 2, fs = 240000, sps = fs / 72000, a = 0.6;
const h = (t: number) => { // root-raised-cosine at t symbols
  if (Math.abs(t) < 1e-9) return 1 - a + (4 * a) / Math.PI;
  if (Math.abs(Math.abs(4 * a * t) - 1) < 1e-9) return (a / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * a)) + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * a)));
  return (Math.sin(Math.PI * t * (1 - a)) + 4 * a * t * Math.cos(Math.PI * t * (1 + a))) / (Math.PI * t * (1 - (4 * a * t) ** 2));
};
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = Math.floor(nsym * sps), iq = new Float32Array(2 * n), dop = 1800, ph0 = 1.1, sigma = 0.35;
for (let i = 0; i < n; i++) {
  const t = i / sps; let re = 0, im = 0;
  for (let k = Math.max(0, Math.ceil(t - 5)); k <= Math.min(nsym - 1, Math.floor(t + 5)); k++) { const w = h(t - k); re += w * (1 - 2 * coded[2 * k]); im += w * (1 - 2 * coded[2 * k + 1]); }
  im = -im; // mirrored I/Q
  const ph = ph0 + (2 * Math.PI * dop * i) / fs, c = Math.cos(ph), s = Math.sin(ph);
  iq[2 * i] = 0.3 * (re * c - im * s) + sigma * gauss(); iq[2 * i + 1] = 0.3 * (re * s + im * c) + sigma * gauss();
}

// 4. Decode, in chunks like the live page.
const rx = new MeteorReceiver(fs);
for (let i = 0; i < iq.length; i += 32768) rx.push(iq.subarray(i, i + 32768));
const ch = rx.packets.channels.get(64);
console.log(`Doppler ${dop} Hz → measured ${rx.stats.freqHz.toFixed(0)} Hz; ${rx.stats.frames} of ${cadus.length / 1024} frames, ${rx.packets.stats.packets} packets, ${ch?.rows.length ?? 0} lines of blocks`);
assert.ok(Math.abs(rx.stats.freqHz - dop) < 100);
assert.ok(ch && ch.rows.length >= 4);
let good = 0, checked = 0;
for (const row of ch.rows) { // which line each row is (the first frames are lost while locking on); blocks never received stay 0
  const got = Array.from({ length: 196 }, (_, m) => row[3 * 1568 + m * 8 + 3]);
  const ok = (line: number) => got.filter((v, m) => v && Math.abs(v - level(line, m)) <= 4).length;
  good += Math.max(...Array.from({ length: 12 }, (_, l) => ok(l))); checked += got.filter((v) => v).length;
}
console.log(`${good} of ${checked} blocks exact (no Reed-Solomon: a bit error spoils the rest of its packet)`);
assert.ok(checked > 1500 && good / checked > 0.95);
console.log("all checks passed");
