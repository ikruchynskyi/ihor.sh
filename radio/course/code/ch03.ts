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
console.log("all checks passed");
