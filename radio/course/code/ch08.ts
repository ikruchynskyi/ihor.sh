// Radio from scratch, chapter 8: chunks of a live stream.
// Run it:  node course/code/ch08.ts
import assert from "node:assert/strict";
import { Receiver, synth, Mixer, FirDecimator, FmDemod, firLowpass } from "../../src/dsp.ts";

const fs = 1_024_000;
const iq = synth(fs, 0.2, [{ kind: "FM", offset: 200e3, tone: 1000, amp: 0.5 }]);

// 1. Every mode: processing in odd-sized chunks gives bit-for-bit the same sound as one big buffer.
for (const mode of ["WFM", "NFM", "AM", "USB", "LSB"] as const) {
  const bw = mode === "WFM" ? 200e3 : mode === "NFM" ? 12.5e3 : mode === "AM" ? 10e3 : 2.8e3;
  const whole = new Receiver(fs, 200e3, mode, bw).process(iq).audio;
  const rx = new Receiver(fs, 200e3, mode, bw), parts: number[] = [];
  for (let s = 0; s < iq.length; s += 2 * 12_345) parts.push(...rx.process(iq.subarray(s, s + 2 * 12_345)).audio);
  assert.equal(parts.length, whole.length);
  assert.ok(parts.every((v, i) => v === whole[i]), mode);
  console.log(`${mode.padEnd(3)}: ${whole.length} audio samples, chunked = whole, bit for bit`);
}

// 2. What forgetting costs: the biggest jump in the mixer's output at a chunk edge.
const chunk = 50_000, ref = new Mixer(fs, 200e3).process(iq);
let worst = 0;
for (let s = chunk; s < iq.length / 2; s += chunk) {
  const fresh = new Mixer(fs, 200e3).process(iq.subarray(2 * s, 2 * s + 2)); // a mixer that forgot its angle
  worst = Math.max(worst, Math.hypot(fresh[0] - ref[2 * s], fresh[1] - ref[2 * s + 1]));
}
console.log(`a mixer that forgets its angle: output jumps by up to ${worst.toFixed(2)} at chunk edges (the signal itself is 0.5 long)`);

// 3. A filter that forgets its history starts from silence: its first outputs are too small.
const taps = firLowpass(100e3 / fs, 50e3 / fs), tail = new FirDecimator(taps, 1, 2);
tail.process(iq.subarray(0, 2 * chunk));
const good = tail.process(iq.subarray(2 * chunk, 2 * chunk + 2 * taps.length));
const bad = new FirDecimator(taps, 1, 2).process(iq.subarray(2 * chunk, 2 * chunk + 2 * taps.length));
console.log(`a filter that forgets: its first output is ${(Math.hypot(bad[0], bad[1]) / Math.hypot(good[0], good[1]) * 100).toFixed(0)}% of the right size, and it takes ${taps.length} samples to recover`);

// 4. The FM demodulator needs the previous sample: without it, the first answer of each chunk is garbage.
const dem = new FmDemod(); dem.process(iq.subarray(0, 2 * chunk));
console.log(`FM demodulator at a chunk edge: with memory ${dem.process(iq.subarray(2 * chunk, 2 * chunk + 2))[0].toFixed(3)} rad, forgetting ${new FmDemod().process(iq.subarray(2 * chunk, 2 * chunk + 2))[0].toFixed(3)} rad`);

// 5. The delay budget at 2.4 MS/s with 256 KiB chunks.
console.log(`waiting for one 256 KiB chunk at 2.4 MS/s: ${(131072 / 2.4e6 * 1000).toFixed(1)} ms; plus filter delay and a 150 ms audio cushion`);
console.log("all checks passed");
