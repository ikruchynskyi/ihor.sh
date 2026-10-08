// Radio from scratch, chapter 5: moving a station (mixing).
// Run it:  node course/code/ch05.ts
import assert from "node:assert/strict";
import { Mixer, powerSpectrum } from "../../src/dsp.ts";

const TAU = 2 * Math.PI, fs = 1_024_000, N = 1024;
const tone = (f: number) => { const x = new Float32Array(2 * N); for (let n = 0; n < N; n++) { x[2 * n] = Math.cos((TAU * f * n) / fs); x[2 * n + 1] = Math.sin((TAU * f * n) / fs); } return x; };
// local maxima within 20 dB of the strongest: one entry per station (the window spreads each over ±1 bin)
const peaks = (x: Float32Array) => { const sp = powerSpectrum(x, 0, N), top = Math.max(...sp); return [...sp].map((v, i) => ({ f: ((i - N / 2) * fs) / N, v, i })).filter((p) => p.v > top - 20 && p.v >= (sp[p.i - 1] ?? -1e9) && p.v >= (sp[p.i + 1] ?? -1e9)).map((p) => p.f); };

// 1. Mixing by 250 kHz moves a station at +250 kHz to exactly 0, and one at +100 kHz to −150 kHz.
const x = tone(250_000), y = tone(100_000);
for (let i = 0; i < x.length; i++) x[i] += y[i];
const mixed = new Mixer(fs, 250_000).process(x);
console.log("before mixing, stations at (kHz):", peaks(x).map((f) => f / 1e3));
console.log("after mixing by 250 kHz:        ", peaks(mixed).map((f) => f / 1e3));
assert.deepEqual(peaks(mixed), [-150_000, 0]);

// 2. With only one shadow (cos), each station appears twice, at half strength each (−6 dB).
const one = new Float32Array(2 * N), t250 = tone(250_000);
for (let n = 0; n < N; n++) { const c = Math.cos((TAU * 100_000 * n) / fs); one[2 * n] = t250[2 * n] * c; one[2 * n + 1] = t250[2 * n + 1] * c; }
const sp = powerSpectrum(one, 0, N), at = (f: number) => sp[Math.round((f / fs) * N + N / 2)];
console.log(`cos-only mixing by 100 kHz: copies at +150 kHz (${at(150_000).toFixed(1)} dB) and +350 kHz (${at(350_000).toFixed(1)} dB); the full arrow gives one copy at ${powerSpectrum(new Mixer(fs, 100_000).process(t250), 0, N)[Math.round((150_000 / fs) * N + N / 2)].toFixed(1)} dB`);

// 3. Why the real code keeps an angle instead of multiplying by a step arrow over and over.
const step = { I: Math.cos(0.3), Q: Math.sin(0.3) };
let z = { I: 1, Q: 0 }, ph = 0;
let maxErr = 0;
for (let k = 1; k <= 10_000_000; k++) {
  z = { I: z.I * step.I - z.Q * step.Q, Q: z.I * step.Q + z.Q * step.I };
  ph += 0.3; if (ph > Math.PI) ph -= TAU;
  if (k % 1_000_000 === 0) maxErr = Math.abs(Math.hypot(z.I, z.Q) - 1);
}
const f32 = (v: number) => Math.fround(v);
let w = { I: 1, Q: 0 };
for (let k = 0; k < 10_000_000; k++) w = { I: f32(f32(w.I * step.I) - f32(w.Q * step.Q)), Q: f32(f32(w.I * step.Q) + f32(w.Q * step.I)) };
console.log(`after 10 million repeated multiplications: length off by ${maxErr.toExponential(1)} (64-bit numbers), ${Math.abs(Math.hypot(w.I, w.Q) - 1).toExponential(1)} (32-bit numbers)`);
console.log("with a running angle, every arrow is computed fresh: its length is exactly 1 every time");
console.log("all checks passed");
