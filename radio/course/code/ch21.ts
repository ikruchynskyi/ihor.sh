// Radio from scratch, chapter 21: digital pictures from a weather satellite (Meteor-M style LRPT). The pass's geometry
// and Doppler, the convolutional code and Viterbi, the 4th-power frequency estimate, and the whole link end to end.
// Run it:  node course/code/ch21.ts
import assert from "node:assert/strict";
import { ConvEncoder, Viterbi, Transmitter, Channel, Receiver, pass, earthStrip, encodeStrip, decodeStrip, FRAME_BYTES, SYM_RATE } from "../../src/lrpt.ts";

// 1. A pass: how long the satellite is up, and how far its frequency slides.
for (const el of [10, 30, 90]) {
  const p = pass(el), d = p.points.map((x) => x.doppler);
  console.log(`a pass rising to ${String(el).padStart(2)}°: ${(p.T / 60).toFixed(1)} min above the horizon, Doppler ${Math.max(...d).toFixed(0)} → ${Math.min(...d).toFixed(0)} Hz, closest ${Math.min(...p.points.map((x) => x.range)).toFixed(0)} km`);
}
const overhead = pass(90);
assert.ok(overhead.T > 13 * 60 && overhead.T < 17 * 60 && Math.abs(Math.max(...overhead.points.map((x) => x.doppler)) - 3300) < 300);

// 2. The convolutional code: flip 4% of the coded bits; Viterbi gets the message back.
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const msg = Uint8Array.from({ length: 4000 }, () => (rnd() < 0.5 ? 1 : 0)), coded = new ConvEncoder().encode(msg);
let flipped = 0; const rx = Array.from(coded, (b) => (rnd() < 0.04 ? (flipped++, 1 - b) : b));
const v = new Viterbi(); for (let i = 0; i < rx.length; i += 2) v.push(1 - 2 * rx[i], 1 - 2 * rx[i + 1]); v.flush();
const wrong = msg.reduce((a, b, i) => a + (b !== v.out[i] ? 1 : 0), 0);
console.log(`convolutional code: ${flipped} of ${coded.length} coded bits flipped (4%), ${wrong} message bits wrong after Viterbi`);
assert.ok(wrong === 0);

// 3. Pictures: 8×8 blocks, keeping the first coefficients of each.
const strip = earthStrip(40);
for (const keep of [1, 6, 15, 36]) {
  const back = decodeStrip(encodeStrip(strip, keep), keep); let se = 0; for (let i = 0; i < strip.length; i++) se += (strip[i] - back[i]) ** 2;
  console.log(`keeping ${String(keep).padStart(2)} of 64 coefficients: ${(keep / 64 * 100).toFixed(0).padStart(3)}% of the numbers, PSNR ${(10 * Math.log10(255 ** 2 / (se / strip.length))).toFixed(1)} dB`);
}

// 4. The whole link: 30 frames through Doppler and noise. The receiver needs a moment to measure the frequency and to
// find which of QPSK's four rotations is right, then decodes every frame; below about 4 dB it loses lock entirely.
function link(esn0: number, doppler: number) {
  const tx = new Transmitter(), ch = new Channel(); let se = 0, n = 0;
  const r = new Receiver((s, rows) => { const ref = earthStrip(s); for (let i = 0; i < rows.length; i++) { se += (rows[i] - ref[i]) ** 2; n++; } });
  for (let k = 0; k < 30; k++) r.push(ch.apply(tx.next(1), doppler, esn0));
  return { r, psnr: n ? 10 * Math.log10(255 ** 2 / (se / n)) : 0 };
}
console.log(`frames of ${FRAME_BYTES} bytes, ${(FRAME_BYTES * 8) / SYM_RATE * 1000 | 0} ms each at ${SYM_RATE / 1000}k symbols/s`);
const res: Record<number, ReturnType<typeof link>> = {};
for (const [esn0, dop] of [[12, 0], [6, 2500], [4, -2000], [2, 1000]] as const) {
  const { r, psnr } = (res[esn0] = link(esn0, dop));
  console.log(`Es/N0 ${String(esn0).padStart(2)} dB, Doppler ${String(dop).padStart(5)} Hz: measured ${r.coarseHz.toFixed(0).padStart(5)} Hz, rotation ${r.stats.rotation}, ${String(r.stats.frames).padStart(2)}/30 frames (${r.stats.badFrames} failed the CRC), picture PSNR ${psnr.toFixed(1)} dB`);
}
assert.ok(Math.abs(res[6].r.coarseHz - 2500) < 40, "the 4th-power trick finds the Doppler");
assert.ok(res[12].r.stats.frames >= 25 && res[6].r.stats.frames >= 25 && res[6].psnr > 22);
assert.ok(res[2].r.stats.frames === 0, "the cliff: too much noise, nothing at all");
console.log("all checks passed");
