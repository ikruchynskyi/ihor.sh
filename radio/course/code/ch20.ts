// Radio from scratch, chapter 20: how analog TV worked. Encode a test card to NTSC composite video, send it through
// channels of different widths and noise, decode it again (syncs, fields, flywheel, burst, comb filter), and compare.
// Run it:  node course/code/ch20.ts
import assert from "node:assert/strict";
import { FS, FSC, LINE, LINES, FRAME, LINE_RATE, FIELD_RATE, encodeFrame, channel, decodeFrame, testCard, psnr, psnrLuma } from "../../src/ntsc.ts";

// 1. The numbers that define NTSC.
console.log(`lines per second: ${LINE_RATE.toFixed(2)} (525 lines × ${(FIELD_RATE / 2).toFixed(3)} frames/s)`);
console.log(`color subcarrier: ${(FSC / 1e6).toFixed(6)} MHz = ${(FSC / LINE_RATE).toFixed(1)} × the line rate`);
console.log(`sampled at 4 × subcarrier = ${(FS / 1e6).toFixed(3)} MHz: ${LINE} samples per line, ${FRAME} per frame`);
assert.ok(Math.abs(LINE_RATE - 15734.264) < 0.01 && Math.abs(FSC / LINE_RATE - 227.5) < 1e-9 && LINES * LINE === FRAME);

// 2. A frame through the air and back. The decoder needs to see the end of the previous frame (to find the first
// vertical sync), so it gets two lines of the frame before, as a real receiver would.
const W = 320, H = 480, card = testCard(W, H);
function roundTrip(cutoffHz: number, noise: number, color = true) {
  const f0 = encodeFrame(card, W, H, { color, n0: 0 }), f1 = encodeFrame(card, W, H, { color, n0: FRAME });
  const stream = new Float32Array(2 * LINE + FRAME);
  stream.set(f0.subarray(FRAME - 2 * LINE)); stream.set(f1, 2 * LINE);
  return decodeFrame(channel(stream, cutoffHz, noise), W, { n0: FRAME - 2 * LINE });
}
const rows: [string, number, number][] = [["the whole 4.2 MHz of video", 4.2e6, 0], ["4.2 MHz with noise (snowy)", 4.2e6, 6], ["3 MHz (what fits a 3.2 MS/s dongle)", 3.0e6, 0], ["2 MHz (a 2.4 MS/s dongle)", 2.0e6, 0]];
const results: Record<string, ReturnType<typeof roundTrip>> = {};
for (const [what, bw, nz] of rows) {
  const d = (results[what] = roundTrip(bw, nz));
  console.log(`${what.padEnd(38)} fields ${d.fields.join("+")}  burst ${d.burst.toFixed(1)} IRE  ${d.color ? "color " : "B&W   "}  PSNR ${psnr(card, d.rgba, W).toFixed(1)} dB (brightness ${psnrLuma(card, d.rgba, W).toFixed(1)} dB)  sync jitter ${d.lineJitter.toFixed(2)} samples`);
}
const full = results[rows[0][0]], two = results[rows[3][0]], noisy = results[rows[1][0]];
assert.deepEqual(full.fields, [1, 2]);
assert.ok(full.color && psnr(card, full.rgba, W) > 24, "full bandwidth decodes in color");
assert.ok(!two.color && psnrLuma(card, two.rgba, W) > 20, "2 MHz loses the subcarrier: black and white, but the picture is there");
assert.ok(noisy.color && psnrLuma(card, noisy.rgba, W) > 18, "noise makes snow, not chaos: the flywheel keeps the lines straight");

// 3. Black-and-white sets ignore the color: a B&W transmission decodes the same brightness.
const bw = roundTrip(4.2e6, 0, false);
console.log(`a black-and-white transmission: burst ${bw.burst.toFixed(1)} IRE → color killer on, brightness PSNR ${psnrLuma(card, bw.rgba, W).toFixed(1)} dB`);
assert.ok(!bw.color && psnrLuma(card, bw.rgba, W) > 24);
console.log("all checks passed");
