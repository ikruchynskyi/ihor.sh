// Radio from scratch, chapter 18: reading the band. Resolution, averaging, the noise floor, snapping, filter shift
// and a squelch in the chart's own decibels.
// Run it:  node course/code/ch18.ts
import assert from "node:assert/strict";
import { powerSpectrum, avgSpectrum, synth, Receiver } from "../../src/dsp.ts";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1; // repeatable noise
const noise = (n: number, a: number) => Float32Array.from({ length: 2 * n }, () => a * rnd());
const median = (x: Float32Array) => x.slice().sort()[x.length >> 1];

// 1. Resolution: one FFT bin is fs/N wide, and one FFT needs N/fs seconds of signal.
const fs = 2.4e6;
for (const N of [1024, 4096, 16384]) console.log(`N = ${String(N).padStart(5)}: bins ${(fs / N).toFixed(0).padStart(4)} Hz wide, one FFT = ${((N / fs) * 1000).toFixed(2)} ms of signal`);

// 2. Two carriers 1.5 kHz apart: 1024 bins (2.3 kHz each) see one bump, 4096 bins (586 Hz) see two.
const pair = synth(fs, 0.05, [{ kind: "USB", offset: 100e3, tone: 0, amp: 0.3 }, { kind: "USB", offset: 101.5e3, tone: 0, amp: 0.3 }], 0.001);
const peaks = (N: number) => {
  const db = avgSpectrum(pair, N, 8), top = Math.max(...db);
  let n = 0;
  for (let i = 1; i < N - 1; i++) if (db[i] > top - 6 && db[i] >= db[i - 1] && db[i] > db[i + 1]) n++;
  return n;
};
console.log(`two carriers 1.5 kHz apart: N=1024 shows ${peaks(1024)} peak, N=4096 shows ${peaks(4096)} peaks`);
assert.equal(peaks(1024), 1); assert.equal(peaks(4096), 2);

// 3. Averaging K spectra: the noise "grass" shrinks about as 1/√K (measured as the spread of the bins in dB).
const spread = (x: Float32Array) => { const m = x.reduce((a, v) => a + v, 0) / x.length; return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / x.length); };
const hiss = noise(4096 * 64, 0.1), spreads: number[] = [];
for (const K of [1, 4, 16, 64]) { const s = spread(avgSpectrum(hiss, 4096, K)); spreads.push(s); console.log(`averaging ${String(K).padStart(2)} FFTs: noise bins spread ±${s.toFixed(2)} dB`); }
assert.ok(spreads[0] > 5 && spreads[0] < 6.2, "one FFT: ~5.6 dB"); assert.ok(spreads[3] < spreads[0] / 6, "64 FFTs: about 8× calmer");

// 4. The noise floor is the median bin: stations fill only a few bins, so the middle of the sorted list is noise.
const band = synth(fs, 0.02, [100e3, -300e3, 450e3, -700e3, 800e3].map((o) => ({ kind: "FM" as const, offset: o, tone: 1000, amp: 0.2 })), 0);
const both = band.map((v, i) => v + hiss[i]);
const onlyNoise = median(avgSpectrum(hiss.subarray(0, band.length), 4096, 8)), withStations = median(avgSpectrum(both, 4096, 8));
const covered = avgSpectrum(both, 4096, 8).filter((v) => v > onlyNoise + 6).length / 4096;
console.log(`median bin: ${onlyNoise.toFixed(1)} dB with noise alone, ${withStations.toFixed(1)} dB with five FM stations covering ${(covered * 100).toFixed(0)}% of the bins`);
assert.ok(Math.abs(onlyNoise - withStations) < 1.5, "fine while stations cover well under half the band");

// 5. Snapping a click to the channel grid: round the absolute frequency to the step.
const snap = (mhz: number, step: number) => (Math.round((mhz * 1e6) / step) * step) / 1e6;
for (const [mhz, step, what] of [[100.2093, 100e3, "FM broadcast, 100 kHz"], [146.7213, 5e3, "2 m repeater, 5 kHz"], [119.0952, 25e3, "airband, 25 kHz"]] as const)
  console.log(`click at ${mhz.toFixed(4)} MHz, ${what} step → ${snap(mhz, step).toFixed(4)} MHz`);
assert.equal(snap(146.7213, 5e3), 146.72);

// 6. Filter shift: USB with an 800 Hz tone. Slide the 2.8 kHz passband up 1.2 kHz and the tone falls outside it.
const usb = synth(1.024e6, 0.25, [{ kind: "USB", offset: 350e3, tone: 800, amp: 0.3 }], 0.002);
const rms = (shift: number) => { const a = new Receiver(1.024e6, 350e3, "USB", 2.8e3, shift).process(usb).audio.subarray(4000); return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length); };
const cut = 20 * Math.log10(rms(1200) / rms(0));
console.log(`filter shift +1.2 kHz on an 800 Hz USB tone: ${(-cut).toFixed(0)} dB quieter`);
assert.ok(cut < -20);

// 7. A squelch in the chart's dB: the loudest bin in the passband. In pure noise that peak sits above the median,
// so "Auto" goes 3 dB above what an empty channel shows. Count false opens on noise, and whether a weak carrier opens it.
const N = 4096, chunk = 40960, passBins = 22; // 12.5 kHz at 586 Hz per bin
const peakDb = (x: Float32Array) => { const db = avgSpectrum(x, N, 8); let m = -Infinity; for (let i = 2600; i < 2600 + passBins; i++) m = Math.max(m, db[i]); return { m, floor: median(db) }; };
let level = NaN, open = false;
const step = (x: Float32Array, thr: number) => { const { m } = peakDb(x); level = Number.isNaN(level) ? m : 0.5 * level + 0.5 * m; if (!open && level > thr) open = true; else if (open && level < thr - 3) open = false; return open; };
const empty = peakDb(noise(chunk, 0.1));
console.log(`empty channel: noise floor ${empty.floor.toFixed(1)} dB, loudest noise bin in the passband ${empty.m.toFixed(1)} dB (${(empty.m - empty.floor).toFixed(1)} dB above the floor)`);
const thr = empty.m + 3;
let falseOpens = 0;
for (let c = 0; c < 100; c++) if (step(noise(chunk, 0.1), thr)) falseOpens++;
const carrierAt = (2600 + 10 - N / 2) / N * fs; // a carrier in the middle of the passband
const weak = (amp: number) => { const x = noise(chunk, 0.1), c = synth(fs, chunk / fs, [{ kind: "USB", offset: carrierAt, tone: 0, amp }], 0); return x.map((v, i) => v + c[i]); };
let opened = false; for (let c = 0; c < 5; c++) opened = step(weak(0.02), thr);
const carrierDb = peakDb(weak(0.02)).m - empty.floor;
console.log(`squelch at ${thr.toFixed(1)} dB: ${falseOpens} of 100 noise chunks opened it; a carrier ${carrierDb.toFixed(0)} dB over the floor ${opened ? "opens" : "doesn't open"} it`);
assert.ok(falseOpens <= 2); assert.ok(opened);
console.log("all checks passed");
