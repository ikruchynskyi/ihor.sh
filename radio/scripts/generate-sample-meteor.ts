// Generates a sample Meteor-M LRPT 72k .cu8 baseband recording at 240000 S/s
// for testing demodulation and decoding logic in both the browser and SatDump.
import fs from "node:fs";
import path from "node:path";
import { DC, qTable } from "../src/meteor.ts";
import { ConvEncoder, PN, ASM } from "../src/lrpt.ts";
import { rsEncode } from "../src/rs.ts";

const q = 80, q0 = qTable(q)[0];
// Draw a recognizable test pattern (gradient + stripes + blocks)
const level = (line: number, m: number) => {
  const x = m * 8;
  const gradient = Math.round((x / 1568) * 180 + 30);
  const stripe = (line % 4 < 2) ? 20 : -20;
  return Math.max(10, Math.min(240, gradient + stripe));
};

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
// 16 lines of blocks for Channel 64 (visible) and Channel 65 (IR)
for (let line = 0; line < 16; line++) {
  for (let mcu = 0; mcu < 196; mcu += 14) stream.push(...packet(64, seq++, line, mcu));
  for (let mcu = 0; mcu < 196; mcu += 14) stream.push(...packet(65, seq++, line, mcu));
}

const starts = new Set<number>();
for (let p = 0; p < stream.length; ) {
  starts.add(p);
  p += ((stream[p + 4] << 8) | stream[p + 5]) + 7;
}

const cadus: number[] = [];
for (let v = 0; v * 882 < stream.length; v++) {
  const f = new Uint8Array(1020);
  f[0] = 0x40; f[1] = 5; f[2] = 0; f[3] = (v >> 8) & 0xff; f[4] = v & 0xff;
  let fhp = 0x7ff;
  for (let i = 0; i < 882; i++) {
    if (starts.has(v * 882 + i)) { fhp = i; break; }
  }
  f[8] = fhp >> 8; f[9] = fhp & 0xff;
  for (let i = 0; i < 882; i++) f[10 + i] = stream[v * 882 + i] ?? 0;
  for (let c = 0; c < 4; c++) {
    const d = Uint8Array.from({ length: 223 }, (_, j) => f[j * 4 + c]);
    const par = rsEncode(d, false);
    for (let j = 0; j < 32; j++) f[(223 + j) * 4 + c] = par[j];
  }
  cadus.push(ASM >>> 24, (ASM >> 16) & 0xff, (ASM >> 8) & 0xff, ASM & 0xff, ...f.map((b, i) => b ^ PN[i % 255]));
}

const data = Uint8Array.from({ length: cadus.length * 8 }, (_, i) => (cadus[i >> 3] >> (7 - (i & 7))) & 1);
let lfsr = 0xace1;
const pre = Uint8Array.from({ length: 40000 }, () => {
  lfsr = (lfsr >> 1) ^ (-(lfsr & 1) & 0xb400);
  return lfsr & 1;
});

const plain = Uint8Array.from([...pre, ...data]);
const nrzm = new Uint8Array(plain.length);
for (let i = 0; i < plain.length; i++) nrzm[i] = plain[i] ^ (i ? nrzm[i - 1] : 0);

const coded = new ConvEncoder().encode(nrzm);
const nsym = coded.length / 2;
const fsRate = 240000, symRate = 72000, sps = fsRate / symRate, a = 0.6;

const h = (t: number) => {
  if (Math.abs(t) < 1e-9) return 1 - a + (4 * a) / Math.PI;
  if (Math.abs(Math.abs(4 * a * t) - 1) < 1e-9)
    return (a / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * a)) + (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * a)));
  return (Math.sin(Math.PI * t * (1 - a)) + 4 * a * t * Math.cos(Math.PI * t * (1 + a))) / (Math.PI * t * (1 - (4 * a * t) ** 2));
};

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

const n = Math.floor(nsym * sps);
const out = new Uint8Array(2 * n);
let ph = 0.5;
const dopplerHz = 1800; // Simulated Doppler offset (+1.8 kHz)
const noiseSigma = 0.22; // Clean signal with ~8-10 dB SNR

for (let i = 0; i < n; i++) {
  const t = i / sps;
  let re = 0, im = 0;
  for (let k = Math.max(0, Math.ceil(t - 6)); k <= Math.min(nsym - 1, Math.floor(t + 6)); k++) {
    re += h(t - k) * (1 - 2 * coded[2 * k]);
    im += h(t - k - 0.5) * (1 - 2 * coded[2 * k + 1]);
  }
  ph += (2 * Math.PI * dopplerHz) / fsRate;
  const c = Math.cos(ph), s = Math.sin(ph);
  const I = 0.45 * (re * c - im * s) + noiseSigma * gauss();
  const Q = 0.45 * (re * s + im * c) + noiseSigma * gauss();
  // Scale to 8-bit unsigned centered at 127.5
  out[2 * i] = Math.max(0, Math.min(255, Math.round(127.5 + I * 80)));
  out[2 * i + 1] = Math.max(0, Math.min(255, Math.round(127.5 + Q * 80)));
}

const outDir = path.resolve("public/data");
fs.mkdirSync(outDir, { recursive: true });
const targetFile = path.join(outDir, "meteor-m2-3-137.9MHz-sample-240000sps.cu8");
fs.writeFileSync(targetFile, out);
console.log(`Generated ${targetFile}: ${(out.length / 1024 / 1024).toFixed(2)} MB (${out.length / 2 / fsRate} seconds of 72k LRPT)`);
