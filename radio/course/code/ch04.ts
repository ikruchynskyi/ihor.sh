// Radio from scratch, chapter 4: the winding machine (the Fourier transform).
// Run it:  node course/code/ch04.ts
import assert from "node:assert/strict";
import { fft, avgSpectrum } from "../../src/dsp.ts";
import { captureBytes, CAPTURE } from "../../src/course/data/capture.ts";

const TAU = 2 * Math.PI;

/** The winding machine, written plainly: for each test speed k, un-spin every sample and add them up. */
function dft(re: Float64Array, im: Float64Array) {
  const n = re.length, outRe = new Float64Array(n), outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {                 // every test speed (k turns per block)…
    for (let t = 0; t < n; t++) {               // …un-spin every sample and add it up
      const a = (-TAU * k * t) / n, c = Math.cos(a), s = Math.sin(a);
      outRe[k] += re[t] * c - im[t] * s;
      outIm[k] += re[t] * s + im[t] * c;
    }
  }
  return [outRe, outIm];
}

// 1. A signal with hidden arrows at 2, −3 and 7 turns per block: the machine finds exactly those.
const n = 64, re = new Float64Array(n), im = new Float64Array(n);
for (const [f, a] of [[2, 1], [-3, 0.55], [7, 0.35]]) for (let t = 0; t < n; t++) { re[t] += a * Math.cos((TAU * f * t) / n); im[t] += a * Math.sin((TAU * f * t) / n); }
const [Xr, Xi] = dft(re, im);
const found = [...Xr].map((r, k) => ({ k: k < n / 2 ? k : k - n, len: Math.hypot(r, Xi[k]) / n })).filter((x) => x.len > 0.01);
console.log("hidden arrows found:", found.map((x) => `${x.k} turns/block (length ${x.len.toFixed(2)})`).join(", "));
assert.deepEqual(found.map((x) => x.k).sort((a, b) => a - b), [-3, 2, 7]);

// 2. The FFT gives the same answers as the plain machine…
const N = 1024, r1 = new Float64Array(N), i1 = new Float64Array(N);
for (let t = 0; t < N; t++) { r1[t] = Math.random() - 0.5; i1[t] = Math.random() - 0.5; }
const [Dr, Di] = dft(r1, i1);
const Fr = Float32Array.from(r1), Fi = Float32Array.from(i1);
fft(Fr, Fi);
let worst = 0; for (let k = 0; k < N; k++) worst = Math.max(worst, Math.abs(Fr[k] - Dr[k]), Math.abs(Fi[k] - Di[k]));
console.log(`FFT vs plain machine on ${N} random samples: biggest difference ${worst.toExponential(1)} (float rounding)`);
assert.ok(worst < 1e-3);

// 3. …but much faster.
let t0 = performance.now(); for (let i = 0; i < 3; i++) dft(r1, i1); const slow = (performance.now() - t0) / 3;
t0 = performance.now(); for (let i = 0; i < 300; i++) fft(Float32Array.from(r1), Float32Array.from(i1)); const fast = (performance.now() - t0) / 300;
console.log(`time for ${N} samples: plain machine ${slow.toFixed(1)} ms, FFT ${(fast * 1000).toFixed(0)} µs  (${Math.round(slow / fast)}× faster)`);

// 4. Real radio: the spectrum of 4000 samples from the dongle, and its strongest station.
const b = captureBytes(), iq = new Float32Array(b.length);
for (let i = 0; i < b.length; i++) iq[i] = (b[i] - 127.5) / 127.5;
const sp = avgSpectrum(iq, 512, 7), floor = [...sp].sort((a, c) => a - c)[256];
let best = 0; sp.forEach((v, i) => { if (Math.abs(i - 256) > 20 && v > sp[best]) best = i; });
const mhz = (CAPTURE.center + ((best - 256) / 512) * CAPTURE.rate) / 1e6;
console.log(`real samples around ${CAPTURE.center / 1e6} MHz: strongest station at ${mhz.toFixed(2)} MHz, ${(sp[best] - floor).toFixed(0)} dB above the noise floor`);
assert.ok(Math.abs(mhz - 98.7) < 0.1, "should be 98.7 FM");
console.log("all checks passed");
