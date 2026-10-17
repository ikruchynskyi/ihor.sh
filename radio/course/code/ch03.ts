// Radio from scratch, chapter 3: taking snapshots.
// Run it:  node course/code/ch03.ts
import assert from "node:assert/strict";
import { captureBytes, CAPTURE } from "../../src/course/data/capture.ts";

const TAU = 2 * Math.PI, rate = 10; // 10 snapshots per second
const snap = (f: number, n: number) => ({ I: Math.cos((TAU * f * n) / rate), Q: Math.sin((TAU * f * n) / rate) });
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// 1. A 9 turns/s arrow photographed 10 times a second gives exactly the same photos as −1 turn/s.
for (let n = 0; n < 20; n++) {
  const a = snap(9, n), b = snap(-1, n);
  assert.ok(same(a.I, b.I) && same(a.Q, b.Q), `photo ${n}`);
}
console.log("9 turns/s and −1 turn/s give identical photos at 10 photos/s  (9 − 10 = −1)");

// 2. With only one shadow (I), +3 and −3 turns/s are indistinguishable. With both, they differ.
let iSame = true, qSame = true;
for (let n = 0; n < 20; n++) { iSame &&= same(snap(3, n).I, snap(-3, n).I); qSame &&= same(snap(3, n).Q, snap(-3, n).Q); }
assert.ok(iSame && !qSame);
console.log("+3 vs −3 turns/s: I alone identical; Q differs  → with both shadows, speeds from −5 to +5 are all distinct");

// 3. Measuring with 256 marks (8 bits): how much weaker is the error than a full-scale signal?
for (const bits of [4, 8, 12]) {
  const step = 2 / (2 ** bits - 1);
  let ps = 0, pe = 0;
  for (let i = 0; i < 100000; i++) {
    const v = Math.sin(i * 0.01234), r = Math.round((v + 1) / step) * step - 1;
    ps += v * v; pe += (r - v) ** 2;
  }
  console.log(`${String(bits).padStart(2)} bits: signal is ${(10 * Math.log10(ps / pe)).toFixed(1)} dB above the measuring error  (rule of thumb: 6 dB per bit)`);
}

// 4. Real bytes from the dongle: the first four samples, and how many of the 256 marks are in use.
const bytes = captureBytes();
for (let k = 0; k < 4; k++) {
  const I = (bytes[2 * k] - 127.5) / 127.5, Q = (bytes[2 * k + 1] - 127.5) / 127.5;
  console.log(`sample ${k}: bytes (${bytes[2 * k]}, ${bytes[2 * k + 1]}) → arrow I = ${I.toFixed(3)}, Q = ${Q.toFixed(3)}`);
}
let lo = 255, hi = 0; for (const b of bytes) { lo = Math.min(lo, b); hi = Math.max(hi, b); }
console.log(`${bytes.length / 2} real samples at ${CAPTURE.rate / 1e6} MS/s: bytes ${lo}..${hi}, using ${hi - lo + 1} of 256 marks`);
console.log(`at 2.4 MS/s the dongle sends 2.4e6 × 2 bytes = ${(2.4e6 * 2 / 1e6).toFixed(1)} MB every second`);
// 5. Noise and RMS. Noise is a small random number added to every I and Q; its typical size is the RMS (root mean
//    square: square, average, square root). How often does noise of a given RMS hit the ruler's ends (±127.5 counts)?
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(TAU * rnd()); // RMS 1
const rms = (x: number[]) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
for (const r of [8, 32, 64, 113]) {
  const x = Array.from({ length: 200000 }, () => r * gauss());
  const clipped = x.filter((v) => Math.abs(v) >= 127.5).length / x.length;
  assert.ok(Math.abs(rms(x) / r - 1) < 0.01);
  console.log(`noise at ${String(r).padStart(3)} counts RMS: ${(100 * clipped).toFixed(r < 60 ? 3 : 1)}% of numbers reach the ends of the ruler`);
}
const big = Array.from({ length: 200000 }, gauss);
console.log(`noise peaks: ${(100 * big.filter((v) => Math.abs(v) > 3).length / big.length).toFixed(2)}% beyond 3 × RMS, ${(100 * big.filter((v) => Math.abs(v) > 4).length / big.length).toFixed(3)}% beyond 4 × RMS`);

// 6. Gain makes the station and the noise bigger together, so their ratio (SNR) doesn't change, until the ruler gets in
//    the way: too small and rounding adds its own error, too big and clipping does.
const station = Math.sqrt(2 * 10); // an arrow whose power is 10× the noise's (noise RMS 1 in I and in Q: power 2 per arrow)
const snrAfter = (gainDb: number) => {
  const g = 0.05 * 10 ** (gainDb / 20), byte = (v: number) => Math.max(0, Math.min(255, Math.round(g * v + 127.5))) - 127.5; // gain, then the 8-bit ruler
  const s: number[][] = [], r: number[][] = [];
  for (let n = 0; n < 50000; n++) {
    const a = 0.37 * n, si = station * Math.cos(a), sq = station * Math.sin(a);
    s.push([si, sq]); r.push([byte(si + gauss()), byte(sq + gauss())]);
  }
  // how much of the station is in what came out (the best scale c), and everything else: noise, rounding, clipping
  let dot = 0, ss = 0; for (let n = 0; n < s.length; n++) { dot += r[n][0] * s[n][0] + r[n][1] * s[n][1]; ss += s[n][0] ** 2 + s[n][1] ** 2; }
  const c = dot / ss; let pe = 0;
  for (let n = 0; n < s.length; n++) pe += (r[n][0] - c * s[n][0]) ** 2 + (r[n][1] - c * s[n][1]) ** 2;
  return { snr: 10 * Math.log10((c * c * ss) / pe), noiseRms: 0.05 * 10 ** (gainDb / 20) };
};
for (const gdb of [0, 20, 40, 52, 60, 66]) {
  const { snr, noiseRms } = snrAfter(gdb);
  console.log(`gain ${String(gdb).padStart(2)} dB: noise ${noiseRms.toFixed(2).padStart(6)} counts RMS → SNR after the ruler ${snr.toFixed(1)} dB (10.0 in the air)`);
}
assert.ok(Math.abs(snrAfter(40).snr - 10) < 0.3 && snrAfter(0).snr < 6 && snrAfter(20).snr < 9.5 && snrAfter(66).snr < 8.5);

// 7. The real capture: its RMS and how much of it clipped.
const xs = Array.from(bytes, (b) => b - 127.5);
console.log(`the real samples: ${rms(xs).toFixed(1)} counts RMS, ${xs.filter((v) => Math.abs(v) === 127.5).length} of ${xs.length} numbers clipped`);
console.log("all checks passed");
