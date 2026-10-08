// Radio from scratch, chapter 10: AM, SSB and Morse.
// Run it:  node course/code/ch10.ts
import assert from "node:assert/strict";
import { AmDemod, SsbDemod, FmDemod } from "../../src/dsp.ts";

const TAU = 2 * Math.PI, fs = 48_000, n = 48_000;
const tone = (x: Float32Array) => { let c = 0; for (let i = n / 2 + 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) c++; return c / 2 / ((x.length - n / 2) / fs); };
const rms = (x: Float32Array) => Math.sqrt(x.slice(n / 2).reduce((a, v) => a + v * v, 0) / (x.length - n / 2));

// 1. AM: the length of the arrow is the sound. The demodulator measures length (and removes the steady carrier).
const am = (fade: (k: number) => number) => { const x = new Float32Array(2 * n); for (let k = 0; k < n; k++) x[2 * k] = fade(k) * (1 + 0.5 * Math.sin((TAU * 600 * k) / fs)); return x; };
const steady = new AmDemod().process(am(() => 1)), faded = new AmDemod().process(am(() => 0.3));
console.log(`AM: recovered tone ${tone(steady).toFixed(0)} Hz; at 30% signal strength the sound is ${(rms(faded) / rms(steady) * 100).toFixed(0)}% as loud`);
assert.ok(Math.abs(tone(steady) - 600) < 10);

// 2. FM, for comparison: the same fade changes nothing (chapter 9).
const fm = (a: number) => { const x = new Float32Array(2 * n); let ph = 0; for (let k = 0; k < n; k++) { ph += (TAU * 3000 * Math.sin((TAU * 600 * k) / fs)) / fs; x[2 * k] = a * Math.cos(ph); x[2 * k + 1] = a * Math.sin(ph); } return x; };
console.log(`FM: at 30% signal strength the sound is ${(rms(new FmDemod().process(fm(0.3))) / rms(new FmDemod().process(fm(1))) * 100).toFixed(0)}% as loud`);

// 3. Where an AM transmitter's power goes.
for (const m of [1, 0.5, 0.3]) console.log(`AM at ${m * 100}% modulation: ${(100 / (1 + (m * m) / 2)).toFixed(0)}% of the power is in the carrier, which carries no sound`);

// 4. SSB: a 1000 Hz tone sent as upper sideband, received correctly and 150 Hz mistuned.
const usb = (f: number) => { const x = new Float32Array(2 * n); for (let k = 0; k < n; k++) { x[2 * k] = Math.cos((TAU * f * k) / fs); x[2 * k + 1] = Math.sin((TAU * f * k) / fs); } return x; };
const ok = new SsbDemod(fs, 2800, true).process(usb(1000)), off = new SsbDemod(fs, 2800, true).process(usb(1150));
console.log(`SSB: tuned right → ${tone(ok).toFixed(0)} Hz; tuned 150 Hz off → ${tone(off).toFixed(0)} Hz (every pitch shifts by the same amount)`);
assert.ok(Math.abs(tone(ok) - 1000) < 10);

// 5. Morse: a carrier that the receiver lands 700 Hz from 0 becomes an audible 700 Hz beep while keyed.
const cw = new Float32Array(2 * n); for (let k = 0; k < n; k++) { const on = Math.floor(k / 2880) % 2; cw[2 * k] = on * Math.cos((TAU * 700 * k) / fs); cw[2 * k + 1] = on * Math.sin((TAU * 700 * k) / fs); }
const beep = new SsbDemod(fs, 2800, true).process(cw);
const seg = beep.slice(3 * 2880 + 300, 4 * 2880); // inside one "on" period (segments 1, 3, 5… are on)
let c = 0; for (let i = 1; i < seg.length; i++) if ((seg[i - 1] < 0) !== (seg[i] < 0)) c++;
const level = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
const quiet = level(beep.slice(4 * 2880 + 600, 5 * 2880)) < 0.01 * level(seg);
console.log(`Morse with a 700 Hz beat: ${(c / 2 / (seg.length / fs)).toFixed(0)} Hz beep while keyed, silence between: ${quiet}`);
assert.ok(Math.abs(c / 2 / (seg.length / fs) - 700) < 20 && quiet);
console.log("all checks passed");
