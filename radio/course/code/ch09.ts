// Radio from scratch, chapter 9: FM, listening to the speed.
// Run it:  node course/code/ch09.ts
import assert from "node:assert/strict";
import { FmDemod, Deemphasis, receive } from "../../src/dsp.ts";
import { captureBytes, CAPTURE } from "../../src/course/data/capture.ts";

const TAU = 2 * Math.PI, fs = 48_000;
// An FM signal at 0 Hz carrying a 1 kHz tone, with 5 kHz deviation: the arrow's speed swings ±5 kHz.
const fm = (n: number, amp: (k: number) => number = () => 1) => {
  const x = new Float32Array(2 * n); let ph = 0;
  for (let k = 0; k < n; k++) { ph += (TAU * 5000 * Math.sin((TAU * 1000 * k) / fs)) / fs; x[2 * k] = amp(k) * Math.cos(ph); x[2 * k + 1] = amp(k) * Math.sin(ph); }
  return x;
};

// 1. The demodulator's output is the speed: a 1 kHz sine whose peak is the deviation.
const out = new FmDemod().process(fm(4800));
const peakHz = Math.max(...out.slice(10)) * fs / TAU;
let crossings = 0; for (let i = 11; i < out.length; i++) if ((out[i - 1] < 0) !== (out[i] < 0)) crossings++;
console.log(`recovered tone: ${(crossings / 2 / ((out.length - 11) / fs)).toFixed(0)} Hz, peak speed ${peakHz.toFixed(0)} Hz (the deviation)`);
assert.ok(Math.abs(peakHz - 5000) < 50);

// 2. Strength doesn't matter: a fading signal gives the same output as a steady one.
const steady = new FmDemod().process(fm(4800)), fading = new FmDemod().process(fm(4800, (k) => 0.1 + 0.9 * Math.abs(Math.sin(k / 700))));
let diff = 0; for (let i = 1; i < steady.length; i++) diff = Math.max(diff, Math.abs(steady[i] - fading[i]));
console.log(`steady vs fading (down to 10% strength): outputs differ by at most ${diff.toExponential(1)}`);

// 3. Noise: how often the output jumps wildly ("clicks"), as the noise grows.
let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(TAU * rnd());
for (const sigma of [0.05, 0.2, 0.4, 0.7]) {
  const x = fm(48000); for (let i = 0; i < x.length; i++) x[i] += sigma * gauss();
  const y = new FmDemod().process(x); let clicks = 0;
  for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > 2) clicks++;
  console.log(`noise ${sigma.toFixed(2)} × the signal: ${clicks} clicks per second`);
}

// 4. De-emphasis: how much each pitch is turned down (75 µs).
for (const f of [100, 1000, 3000, 10000, 15000]) {
  const de = new Deemphasis(240e3), n = 24000, x = new Float32Array(n);
  for (let k = 0; k < n; k++) x[k] = Math.sin((TAU * f * k) / 240e3);
  const y = de.process(x); let peak = 0; for (let k = n / 2; k < n; k++) peak = Math.max(peak, Math.abs(y[k]));
  console.log(`de-emphasis at ${String(f).padStart(5)} Hz: ${(20 * Math.log10(peak)).toFixed(1)} dB`);
}

// 5. The real station in the embedded samples: its 19 kHz stereo pilot.
const b = captureBytes(), iq = Float32Array.from(b, (v) => (v - 127.5) / 127.5);
const s = receive(iq, CAPTURE.rate, 250e3, "WFM", 200e3);
const g = (x: Float32Array, f: number) => { const c = 2 * Math.cos((TAU * f) / s.chanFs); let p = 0, q = 0; for (const v of x) { const t = v + c * p - q; q = p; p = t; } return p * p + q * q - c * p * q; };
const pilot = 10 * Math.log10(g(s.demod, 19e3) / ((g(s.demod, 17e3) + g(s.demod, 21e3)) / 2));
console.log(`98.7 FM in the embedded samples (${(s.demod.length / s.chanFs * 1000).toFixed(1)} ms): 19 kHz pilot ${pilot.toFixed(0)} dB above its neighbors → stereo`);
assert.ok(pilot > 10);
console.log("all checks passed");
