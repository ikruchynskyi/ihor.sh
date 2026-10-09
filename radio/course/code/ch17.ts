// Radio from scratch, chapter 17: pictures over radio (SSTV).
// Run it:  node course/code/ch17.ts
import assert from "node:assert/strict";
import { MODES, encode, SstvDecoder, durationS, type Mode } from "../../src/sstv.ts";

// 1. Brightness is pitch: black 1500 Hz, white 2300 Hz.
const f = (v: number) => 1500 + (v * 800) / 255;
console.log(`black ${f(0)} Hz, mid-gray ${f(128).toFixed(0)} Hz, white ${f(255)} Hz`);

// 2. A test card through every mode, encoder → audio → decoder, compared pixel by pixel.
function card(m: Mode) {
  const a = new Uint8ClampedArray(m.width * m.height * 4);
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const v = Math.round((x / m.width) * 255); a.set(y < m.height / 2 ? [v, 255 - v, 128, 255] : [v, v, v, 255], (y * m.width + x) * 4); }
  return a;
}
function roundTrip(m: Mode, fs: number, clock = 1, slant = true, noise = 0) {
  const src = card(m), out = new Uint8ClampedArray(src.length); let seed = 7, found = "";
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const d = new SstvDecoder(fs, { onMode: (x) => (found = x.name), onLine: (y, row) => out.set(row, y * m.width * 4) });
  d.slantCorrection = slant;
  const audio = encode(m, src, fs, clock).map((v) => v + noise * rnd());
  for (let i = 0; i < audio.length; i += 4096) d.push(audio.subarray(i, i + 4096));
  d.flush();
  let se = 0, n = 0; const x0 = Math.floor(m.width * 0.03);
  for (let y = 2; y < m.height - 2; y++) for (let x = x0; x < m.width - x0; x++) for (let c = 0; c < 3; c++) { const i = (y * m.width + x) * 4 + c; se += (out[i] - src[i]) ** 2; n++; }
  return { found, psnr: 10 * Math.log10((255 * 255) / (se / n)) };
}
for (const m of MODES) {
  const r = roundTrip(m, 11025);
  console.log(`${m.name.padEnd(10)} ${durationS(m).toFixed(1).padStart(5)} s  header says ${r.found.padEnd(10)}  ${r.psnr.toFixed(1)} dB`);
  assert.equal(r.found, m.name); assert.ok(r.psnr > 22);
}

// 3. A sender whose clock runs 0.3% fast: slanted without correction, straight with it.
const m = MODES.find((x) => x.name === "Martin M1")!;
const on = roundTrip(m, 48000, 1.003, true, 0.4).psnr, off = roundTrip(m, 48000, 1.003, false, 0.4).psnr;
console.log(`clock +0.3%, noisy: slant correction ${on.toFixed(1)} dB, none ${off.toFixed(1)} dB`);
assert.ok(on > 18 && on > off + 5);
console.log("all checks passed");
