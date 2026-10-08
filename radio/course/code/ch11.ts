// Radio from scratch, chapter 11: from numbers to speakers.
// Run it:  node course/code/ch11.ts
import assert from "node:assert/strict";
import { Agc, Squelch } from "../../src/dsp.ts";

const TAU = 2 * Math.PI;

// 1. Two clocks: how long until the 150 ms cushion hits a limit (600 ms ahead, or 50 ms left)?
for (const ppm of [10, 50, 200]) {
  const msPerHour = ppm * 1e-6 * 3600 * 1000;
  console.log(`clocks ${String(ppm).padStart(3)} ppm apart: the buffer drifts ${msPerHour.toFixed(0).padStart(3)} ms per hour → first glitch after ${(450 / msPerHour * 60).toFixed(0)} min (fast dongle) or ${(100 / msPerHour * 60).toFixed(0)} min (slow dongle)`);
}

// 2. Rate conversion by straight lines between samples: error vs. how many samples per wave we have.
for (const perWave of [4, 10, 50]) {
  let worst = 0;
  for (let t = 0; t < 200; t += 0.37) { const i = Math.floor(t), f = t - i; const s = (k: number) => Math.sin((TAU * k) / perWave); worst = Math.max(worst, Math.abs(s(i) * (1 - f) + s(i + 1) * f - s(t))); }
  console.log(`straight-line resampling, ${String(perWave).padStart(2)} samples per wave: worst error ${(worst * 100).toFixed(2)}%`);
}

// 3. Automatic volume: a signal fading from 100% to 10% comes out at a steady level.
const fs = 8000, agc = new Agc(fs), n = fs * 4, x = new Float32Array(n);
for (let k = 0; k < n; k++) x[k] = (k < n / 2 ? 1 : 0.1) * Math.sin((TAU * 440 * k) / fs);
const y = agc.process(x, 0.5);
const peak = (a: number, b: number) => { let p = 0; for (let k = a; k < b; k++) p = Math.max(p, Math.abs(y[k])); return p; };
console.log(`AGC: loud part peaks at ${peak(fs, n / 2).toFixed(2)}, quiet part (10× weaker in) peaks at ${peak(n / 2 + 1.5 * fs, n).toFixed(2)} once it has adjusted`);
assert.ok(Math.abs(peak(n / 2 + 1.5 * fs, n) - 0.5) < 0.05);

// 4. Squelch: three transmissions in noise. Count how many 20 ms chunks it lets through.
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const sq = new Squelch(-10); let openChunks = 0, onChunks = 0, wrong = 0;
for (let c = 0; c < 200; c++) {
  const on = (c > 20 && c < 60) || (c > 90 && c < 115) || (c > 145 && c < 180), chunk = new Float32Array(320);
  for (let i = 0; i < 320; i += 2) { chunk[i] = (on ? 0.6 : 0) + 0.25 * rnd(); chunk[i + 1] = 0.25 * rnd(); }
  const open = sq.update(chunk);
  if (open) openChunks++; if (on) onChunks++; if (open !== on) wrong++;
}
console.log(`squelch: ${onChunks} chunks had a transmission, ${openChunks} were let through, ${wrong} disagreed: at most 2 chunks (40 ms) late at each of the 6 edges, from smoothing the level`);
assert.ok(wrong <= 12);
console.log("all checks passed");
