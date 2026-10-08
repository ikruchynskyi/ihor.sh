// Radio from scratch, chapter 16: the whole receiver.
// Run it:  node course/code/ch16.ts
import assert from "node:assert/strict";
import { synth, Mixer, FirDecimator, FmDemod, Deemphasis, firLowpass, Agc } from "../../src/dsp.ts";
import { captureBytes, CAPTURE } from "../../src/course/data/capture.ts";

const TAU = 2 * Math.PI;

// 1. Where the time goes: one second of radio at 2.4 MS/s through each block.
const FS = 2.4e6, x = synth(FS, 1, [{ kind: "FM", offset: 250e3, tone: 1000, amp: 0.5 }]);
const time = (name: string, fn: () => unknown) => { const t0 = performance.now(); fn(); const ms = performance.now() - t0; console.log(`${name.padEnd(28)} ${ms.toFixed(0).padStart(5)} ms`); return ms; };
let mixed!: Float32Array, chan!: Float32Array, dem!: Float32Array, aud!: Float32Array;
const taps = firLowpass(100e3 / FS, 100e3 / FS), atap = firLowpass(15e3 / 300e3, 10e3 / 300e3);
const total =
  time("mixer", () => { mixed = new Mixer(FS, 250e3).process(x); }) +
  time(`filter + decimate (${taps.length} taps)`, () => { chan = new FirDecimator(taps, 8, 2).process(mixed); }) +
  time("FM demodulator", () => { dem = new FmDemod().process(chan); }) +
  time("de-emphasis + audio filter", () => { aud = new FirDecimator(atap, 6, 1).process(new Deemphasis(300e3).process(dem)); }) +
  time("AGC", () => { new Agc(50e3).process(aud); });
console.log(`total: ${total.toFixed(0)} ms for 1 s of radio → ${(total / 10).toFixed(0)}% of one core`);

// 2. The whole chain, built from the chapters' blocks, on the real samples recorded by this site's dongle.
const b = captureBytes(), iq = Float32Array.from(b, (v) => (v - 127.5) / 127.5), fs = CAPTURE.rate;
const m1 = 3, chFs = fs / m1;
const d = new FmDemod().process(new FirDecimator(firLowpass(100e3 / fs, (chFs - 200e3) / fs), m1, 2).process(new Mixer(fs, 250e3).process(iq)));
const g = (f: number) => { const c = 2 * Math.cos((TAU * f) / chFs); let p = 0, q = 0; for (const v of d) { const t = v + c * p - q; q = p; p = t; } return p * p + q * q - c * p * q; };
const pilot = 10 * Math.log10(g(19e3) / ((g(17e3) + g(21e3)) / 2));
console.log(`chapters 3 → 5 → 6/7 → 9 on real samples of 98.7 FM: 19 kHz pilot ${pilot.toFixed(0)} dB above its neighbors`);
assert.ok(pilot > 10);
console.log("all checks passed");
