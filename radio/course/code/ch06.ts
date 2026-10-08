// Radio from scratch, chapter 6: averaging is filtering.
// Run it:  node course/code/ch06.ts
import assert from "node:assert/strict";
import { firLowpass, freqResponse, FirDecimator } from "../../src/dsp.ts";

const TAU = 2 * Math.PI;

// 1. A moving average of L samples: how much of an arrow spinning s turns per sample survives?
//    Measured by averaging, and compared with the formula |sin(πsL) / (L·sin(πs))|.
const L = 8;
for (const s of [0, 0.05, 0.125, 0.25, 0.4]) {
  let x = 0, y = 0;
  for (let k = 0; k < L; k++) { x += Math.cos(TAU * s * k); y += Math.sin(TAU * s * k); }
  const measured = Math.hypot(x, y) / L, formula = s === 0 ? 1 : Math.abs(Math.sin(Math.PI * s * L) / (L * Math.sin(Math.PI * s)));
  assert.ok(Math.abs(measured - formula) < 1e-9);
  console.log(`average of ${L}: speed ${s.toFixed(3)} turns/sample → ${(measured * 100).toFixed(1)}% survives${s * L === Math.round(s * L) && s > 0 ? "  (a whole number of turns: cancels completely)" : ""}`);
}

// 2. Same number of weights, different shapes: the worst leftover far from the passband.
const taps = 41, cut = 0.1, m = (taps - 1) / 2;
const shapes: Record<string, (i: number) => number> = {
  "plain average": () => 1,
  "triangle": (i) => 1 - Math.abs(i - m) / (m + 1),
  "sinc, chopped": (i) => (i === m ? 2 * cut : Math.sin(TAU * cut * (i - m)) / (Math.PI * (i - m))),
  "sinc × Hamming window": (i) => (i === m ? 2 * cut : Math.sin(TAU * cut * (i - m)) / (Math.PI * (i - m))) * (0.54 - 0.46 * Math.cos((TAU * i) / (taps - 1))),
};
for (const [name, f] of Object.entries(shapes)) {
  const h = Float32Array.from({ length: taps }, (_, i) => f(i)), sum = h.reduce((a, b) => a + b, 0);
  const resp = freqResponse(h.map((v) => v / sum), 1000);
  let worst = -999; resp.forEach((v, i) => { if (Math.abs(i / 1000 - 0.5) > 0.22) worst = Math.max(worst, v); });
  console.log(`${name.padEnd(22)} worst leftover beyond 0.22 turns/sample: ${worst.toFixed(1)} dB`);
}

// 3. Keep a station at 0 Hz, remove a neighbor 200 kHz away (fs = 1.024 MS/s).
const fs = 1_024_000, n = 20000, x = new Float32Array(2 * n);
for (let k = 0; k < n; k++) {
  x[2 * k] = Math.cos(0) + Math.cos((TAU * 200e3 * k) / fs);
  x[2 * k + 1] = Math.sin(0) + Math.sin((TAU * 200e3 * k) / fs);
}
const lp = firLowpass(100e3 / fs, 50e3 / fs), y = new FirDecimator(lp, 1, 2).process(x);
let nb = 0; for (let k = n / 2; k < n; k++) nb += Math.hypot(y[2 * k] - 1, y[2 * k + 1]); nb /= n / 2;
console.log(`station + neighbor through a ${lp.length}-weight low-pass: the neighbor is now ${(20 * Math.log10(nb)).toFixed(0)} dB (${(nb * 100).toFixed(2)}% of its original size)`);
assert.ok(nb < 0.01);

// 4. Sharper edges cost more weights.
for (const tr of [100e3, 50e3, 20e3, 5e3]) { const k = firLowpass(100e3 / fs, tr / fs).length; console.log(`transition ${(tr / 1e3).toString().padStart(3)} kHz wide → ${k} weights${k === 511 ? " (our designer caps it at 511; the rule of thumb asks for ~680)" : ""}`); }
console.log("all checks passed");
