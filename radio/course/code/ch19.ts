// Radio from scratch, chapter 19: cleaner sound. The voice filter (two biquads), noise reduction (overlapping frames,
// a noise tracker, gentle gains), AGC hang, a soft limiter, and one continuous stream that holds a cushion.
// Run it:  node course/code/ch19.ts
import assert from "node:assert/strict";
import { Biquad, NoiseReducer, Agc, fft } from "../../src/dsp.ts";

const TAU = 2 * Math.PI, fs = 48e3;
let seed = 9;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// 1. The voice filter: a 300 Hz high-pass and a 3 kHz low-pass, each a biquad. Gain at a few frequencies.
const gainDb = (f: number) => {
  const hp = new Biquad(fs, 300, "highpass"), lp = new Biquad(fs, 3000, "lowpass");
  const x = Float32Array.from({ length: fs }, (_, k) => Math.sin((TAU * f * k) / fs)), y = lp.process(hp.process(x)).subarray(fs / 2);
  return 20 * Math.log10(Math.sqrt(y.reduce((a, v) => a + v * v, 0) / y.length) / Math.SQRT1_2);
};
const table: [number, string][] = [[67, "lowest CTCSS tone"], [150, "a CTCSS tone"], [300, "the low edge"], [1000, "the middle of a voice"], [3000, "the high edge"], [8000, "hiss"]];
for (const [f, what] of table) console.log(`voice filter at ${String(f).padStart(4)} Hz (${what}): ${gainDb(f).toFixed(1).padStart(6)} dB`);
assert.ok(gainDb(67) < -25 && Math.abs(gainDb(1000)) < 0.5 && Math.abs(gainDb(300) + 3) < 0.5 && gainDb(8000) < -15);

// 2. Overlapping frames: √Hann in, √Hann out, half overlapped. The two windows multiply to Hann, and Hanns half a
// frame apart add up to exactly 1, so frames that aren't changed come back as the original sound.
const n = 512, w = Float32Array.from({ length: n }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((TAU * i) / n)));
let worst = 0;
for (let i = 0; i < n / 2; i++) worst = Math.max(worst, Math.abs(w[i] ** 2 + w[i + n / 2] ** 2 - 1));
console.log(`√Hann² + √Hann² half a frame later: off from 1 by at most ${worst.toExponential(1)}`);
assert.ok(worst < 1e-6);

// 3. Noise reduction on a keyed tone in hiss: the hiss in the pauses drops, the tone stays.
const x = new Float32Array(fs * 3);
for (let i = 0; i < x.length; i++) x[i] = (i % 24000 < 14400 ? 0.3 * Math.sin((TAU * 1000 * i) / fs) : 0) + 0.05 * rnd();
const band = (y: Float32Array, start: number, lo: number, hi: number) => {
  const re = new Float32Array(8192), im = new Float32Array(8192);
  for (let i = 0; i < 8192; i++) re[i] = y[start + i] * (0.5 - 0.5 * Math.cos((TAU * i) / 8192));
  fft(re, im);
  let p = 0; for (let b = Math.round((lo * 8192) / fs); b < Math.round((hi * 8192) / fs); b++) p += re[b] ** 2 + im[b] ** 2;
  return 10 * Math.log10(p);
};
for (const strength of [0.5, 1]) {
  const nr = new NoiseReducer(); nr.strength = strength;
  const y = nr.process(x), pause = 2 * 24000 + 14800, burst = 2 * 24000 + 1000;
  const hiss = band(x, pause, 3000, 20000) - band(y, pause, 3000, 20000), tone = band(x, burst, 900, 1100) - band(y, burst + 512, 900, 1100);
  console.log(`noise reduction ${strength}: hiss in the pauses ${hiss.toFixed(1)} dB lower, the tone changed by ${tone.toFixed(1)} dB`);
  if (strength === 1) assert.ok(hiss > 10 && Math.abs(tone) < 3);
}

// 4. AGC hang: after a loud word, a 150 ms pause. Without hang the gain climbs and the pause's hiss comes up.
const burst = new Float32Array(fs / 10).fill(0.5), quiet = new Float32Array(fs * 0.15).fill(0.01);
for (const hang of [0, 0.2]) { const a = new Agc(fs, 0.05, hang); a.process(burst); console.log(`AGC, hang ${hang * 1000} ms: the pause comes out at ${Math.max(...a.process(quiet).slice(-100)).toFixed(3)} (it went in at 0.010)`); }

// 5. The soft limiter: volume v, then ×¼, then tanh(4x): overall tanh(v·x). Small sounds pass at v, big ones round off.
for (const v of [0.1, 0.5, 1, 2, 4]) console.log(`limiter: in ${v.toFixed(1)} → out ${Math.tanh(v).toFixed(3)} (a hard clip would give ${Math.min(1, v).toFixed(3)})`);

// 6. One continuous stream vs one buffer per chunk. Chunks of 55 ms come from a radio whose clock runs 50 ppm fast,
// over a network that sometimes stalls (nothing for `stallMs`, then the backlog at once). The sound card takes 128
// samples at a time. The old player rebuilt a 150 ms cushion when it ran low (a gap you hear) and dropped chunks more
// than 600 ms ahead (a skip); the stream holds 350 ms for the network and plays up to 0.5% fast or slow instead.
function session(continuous: boolean, hours: number, stallMs: number) {
  const rate = 48e3, chunk = Math.round(0.055 * rate), ppm = 50e-6, cushion = (stallMs ? 0.35 : 0.15) * rate;
  const arrivals: number[] = [];
  for (let k = 0; ; k++) {
    const t = (k * chunk) / rate / (1 + ppm); // the radio's clock is fast: chunks come a hair early
    if (t > hours * 3600) break;
    const stall = Math.floor(t / 20) * 20 + 10; // every 20 s, a stall starting 10 s in
    arrivals.push(stallMs && t >= stall && t < stall + stallMs / 1000 ? stall + stallMs / 1000 : t);
  }
  let gaps = 0, skips = 0;
  if (!continuous) {
    let t = 0;
    for (const at of arrivals) {
      if (t < at + 0.05) { if (t) gaps++; t = at + 0.15; } // ran low: wait to rebuild 150 ms of cushion (silence)
      if (t > at + 0.6) { skips++; continue; } // too far ahead: drop the chunk
      t += chunk / rate;
    }
    return { gaps, skips, lo: 0, hi: 0 };
  }
  let have = 0, on = false, next = 0, lo = Infinity, hi = 0;
  for (let blk = 0; blk < (hours * 3600 * rate) / 128; blk++) {
    const now = (blk * 128) / rate;
    while (next < arrivals.length && arrivals[next] <= now) { have += chunk; next++; }
    if (have > 4 * cushion + chunk) { have = cushion; skips++; } // far behind: skip ahead
    if (!on && have >= cushion) on = true;
    if (!on) continue;
    const step = 1 + Math.max(-0.005, Math.min(0.005, (0.01 * (have - cushion)) / cushion)); // a hair fast or slow
    if (have < 128 * step) { on = false; gaps++; continue; }
    have -= 128 * step;
    if (now > 60) { lo = Math.min(lo, have); hi = Math.max(hi, have); }
  }
  return { gaps, skips, lo: lo / rate, hi: hi / rate };
}
for (const [hours, stallMs, what] of [[4, 0, "4 hours, USB dongle, clocks 50 ppm apart"], [1, 300, "1 hour over the internet, a 300 ms stall every 20 s"]] as const) {
  const old = session(false, hours, stallMs), now = session(true, hours, stallMs);
  console.log(`${what}:\n  one buffer per chunk: ${old.gaps} gaps, ${old.skips} skips\n  one stream:           ${now.gaps} gaps, ${now.skips} skips (cushion stayed between ${(now.lo * 1000).toFixed(0)} and ${(now.hi * 1000).toFixed(0)} ms)`);
  assert.ok(now.gaps === 0 && now.skips === 0 && old.gaps + old.skips > 0);
}
console.log("all checks passed");
