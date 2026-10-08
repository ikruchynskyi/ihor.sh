// Radio from scratch, chapter 7: throwing away snapshots (decimation).
// Run it:  node course/code/ch07.ts
import assert from "node:assert/strict";
import { firLowpass, FirDecimator, powerSpectrum } from "../../src/dsp.ts";

const TAU = 2 * Math.PI, fs = 1_024_000, n = 65536;
const tone = (f: number, a = 1) => { const x = new Float32Array(2 * n); for (let k = 0; k < n; k++) { x[2 * k] = a * Math.cos((TAU * f * k) / fs); x[2 * k + 1] = a * Math.sin((TAU * f * k) / fs); } return x; };
const strongest = (x: Float32Array, rate: number) => { const N = 1024, sp = powerSpectrum(x, x.length / 4, N); let b = 0; sp.forEach((v, i) => { if (v > sp[b]) b = i; }); return { f: ((b - N / 2) / N) * rate, db: sp[b] }; };

// 1. A neighbor at +350 kHz. Keep every 4th sample (new rate 256 kS/s, honest range ±128 kHz).
const M = 4, neighbor = tone(350e3);
const raw = new FirDecimator(new Float32Array([1]), M, 2).process(neighbor);   // no filter: just pick samples
const pk = strongest(raw, fs / M);
console.log(`no filter: the +350 kHz neighbor reappears at ${(pk.f / 1e3).toFixed(0)} kHz  (350 − 256 = 94)`);
assert.ok(Math.abs(pk.f - 94e3) < 2e3);

// 2. Filter first (keep ±100 kHz, edge up to the new range): the neighbor is gone before anything folds.
const taps = firLowpass(100e3 / fs, (fs / M - 200e3) / fs);
const clean = new FirDecimator(taps, M, 2).process(neighbor);
let p = 0; for (let k = clean.length / 4; k < clean.length / 2; k++) p += clean[2 * k] ** 2 + clean[2 * k + 1] ** 2;
console.log(`with a ${taps.length}-weight filter first: what's left of it is ${(10 * Math.log10(p / (clean.length / 4))).toFixed(0)} dB`);

// 3. Computing only the kept outputs gives exactly the same numbers as filtering everything, then picking.
const x = tone(30e3);
for (let k = 0; k < x.length; k++) x[k] += (Math.random() - 0.5) * 0.1;
const all = new FirDecimator(taps, 1, 2).process(x);
const picked = new Float32Array(Math.ceil(all.length / 2 / M) * 2);
for (let k = 0; k < picked.length / 2; k++) { picked[2 * k] = all[2 * k * M]; picked[2 * k + 1] = all[2 * k * M + 1]; }
const smart = new FirDecimator(taps, M, 2).process(x);
assert.equal(smart.length, picked.length);
assert.ok(smart.every((v, i) => v === picked[i]));
console.log(`filter-everything-then-pick and compute-only-kept agree on all ${smart.length / 2} outputs, with ${M}× less work`);

// 4. The receiver's choice of M for each mode at 2.4 MS/s: the largest M that keeps the rate ≥ max(48 kHz, 1.5 × bandwidth).
for (const [mode, bw] of [["WFM", 200e3], ["NFM", 12.5e3], ["AM", 10e3], ["USB", 2.8e3]] as const) {
  const m1 = Math.max(1, Math.floor(2.4e6 / Math.max(48e3, 1.5 * bw)));
  console.log(`${mode.padEnd(3)} (${(bw / 1e3).toString().padStart(5)} kHz wide): keep every ${String(m1).padStart(2)} → ${(2.4e6 / m1 / 1e3).toFixed(0).padStart(3)} kS/s`);
}
console.log("all checks passed");
