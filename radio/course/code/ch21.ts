// Radio from scratch, chapter 21: digital radio from a weather satellite (Meteor-M style LRPT). The pass's geometry and
// Doppler, symbols and the matched filter, finding each symbol's middle (Gardner), and the 4th-power frequency estimate.
// Run it:  node course/code/ch21.ts
import assert from "node:assert/strict";
import { Transmitter, Channel, Receiver, pass } from "../../src/lrpt.ts";
import { symbols, shape, noise, matched, snrAt, gardner, centerTx, centerMf, SPS } from "../../src/course/symbols.ts";

// 1. A pass: how long the satellite is up, and how far its frequency slides.
for (const el of [10, 30, 90]) {
  const p = pass(el), d = p.points.map((x) => x.doppler);
  console.log(`a pass rising to ${String(el).padStart(2)}°: ${(p.T / 60).toFixed(1)} min above the horizon, Doppler ${Math.max(...d).toFixed(0)} → ${Math.min(...d).toFixed(0)} Hz, closest ${Math.min(...p.points.map((x) => x.range)).toFixed(0)} km`);
}
const overhead = pass(90);
assert.ok(overhead.T > 13 * 60 && overhead.T < 17 * 60 && Math.abs(Math.max(...overhead.points.map((x) => x.doppler)) - 3300) < 300);

// 2. Symbols and the matched filter: the SNR at the symbols' middles, looking at one sample vs filtering with the pulse.
const sym = symbols(400), tx = shape(sym), nz = noise(tx.length, 0.1), rx = Float64Array.from(tx, (v, i) => v + nz[i]);
const raw = snrAt(rx, sym, centerTx), mf = snrAt(matched(rx), sym, centerMf);
console.log(`at ${SPS} samples per symbol: one sample at the middle ${raw.toFixed(1)} dB, after the matched filter ${mf.toFixed(1)} dB (${(mf - raw).toFixed(1)} dB better)`);
assert.ok(mf - raw > 5);

// 3. When to look: the matched filter's output is cleanest at the middle; Gardner's error says early or late.
const y = matched(rx);
for (const off of [-0.25, 0, 0.25]) console.log(`sampling ${off === 0 ? "at the middle   " : off < 0 ? "¼ symbol early  " : "¼ symbol late   "}: SNR ${snrAt(y, sym, centerMf, off).toFixed(1)} dB, Gardner's error ${gardner(y, sym, off) >= 0 ? "+" : ""}${gardner(y, sym, off).toFixed(3)}`);
assert.ok(snrAt(y, sym, centerMf, 0) > snrAt(y, sym, centerMf, 0.25) + 3 && gardner(y, sym, 0.25) < -0.05 && gardner(y, sym, -0.25) > 0.05 && Math.abs(gardner(y, sym, 0)) < 0.02);

// 4. The 4th-power trick finds the Doppler without knowing the data.
for (const dop of [-2000, 1000, 2500]) {
  const r = new Receiver(() => {}), ch = new Channel(), t = new Transmitter();
  for (let k = 0; k < 4; k++) r.push(ch.apply(t.next(1), dop, 8));
  console.log(`a ${String(dop).padStart(5)} Hz offset, Es/N0 8 dB: the 4th-power FFT measures ${r.coarseHz.toFixed(0).padStart(5)} Hz`);
  assert.ok(Math.abs(r.coarseHz - dop) < 40);
}
console.log("all checks passed");
