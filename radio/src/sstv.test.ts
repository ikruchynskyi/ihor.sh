// SSTV round trips: encode a test card in every mode, decode it back (with noise and a wrong clock), compare.
// Run: node src/sstv.test.ts
import assert from "node:assert/strict";
import { MODES, encode, SstvDecoder, durationS, type Mode } from "./sstv.ts";

function testCard(m: Mode) {
  const a = new Uint8ClampedArray(m.width * m.height * 4);
  const bars = [[255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0], [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0]];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const c = y < m.height / 2 ? bars[Math.floor((x / m.width) * 8)] : [Math.round((x / m.width) * 255), Math.round((x / m.width) * 255), Math.round((x / m.width) * 255)];
    a.set([...c, 255], (y * m.width + x) * 4);
  }
  return a;
}
function decode(m: Mode, audio: Float32Array, fs: number, slant = true) {
  const img = new Uint8ClampedArray(m.width * m.height * 4); let mode: Mode | null = null, lines = 0;
  const d = new SstvDecoder(fs, { onMode: (x) => (mode = x), onLine: (y, row) => { img.set(row, y * m.width * 4); lines++; } });
  d.slantCorrection = slant;
  for (let i = 0; i < audio.length; i += 4096) d.push(audio.subarray(i, i + 4096)); // arrives in chunks, like live audio
  d.flush();
  return { img, mode: mode as Mode | null, lines };
}
const psnr = (a: Uint8ClampedArray, b: Uint8ClampedArray, m: Mode) => { // ignore the outer 3% of columns (filter edges)
  let se = 0, n = 0; const x0 = Math.floor(m.width * 0.03), x1 = m.width - x0;
  for (let y = 2; y < m.height - 2; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) { const i = (y * m.width + x) * 4 + c, e = a[i] - b[i]; se += e * e; n++; }
  return 10 * Math.log10((255 * 255) / (se / n));
};
let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

for (const m of MODES) {
  const fs = 11025, card = testCard(m), clean = encode(m, card, fs);
  assert.ok(Math.abs(clean.length / fs - durationS(m)) < 0.05, `${m.name}: ${clean.length / fs} s vs ${durationS(m)}`);
  const r = decode(m, clean, fs);
  assert.equal(r.mode?.name, m.name, `${m.name}: VIS not recognized`);
  assert.equal(r.lines, m.height, `${m.name}: ${r.lines} lines`);
  const q = psnr(r.img, card, m);
  console.log(`${m.name.padEnd(10)} ${durationS(m).toFixed(1)} s, clean: ${q.toFixed(1)} dB`);
  assert.ok(q > (m.name === "Robot 36" ? 18 : 22), `${m.name}: PSNR ${q}`); // Robot 36 sends color at half resolution: sharp bars blur
}
// Noise, a 48 kHz sound card, and a sender whose clock runs 0.3% fast: slant correction must keep the picture straight.
{
  const m = MODES.find((x) => x.name === "Martin M1")!, fs = 48000, card = testCard(m);
  const audio = encode(m, card, fs, 1.003).map((v) => v + 0.6 * noise());
  const fixed = psnr(decode(m, audio, fs, true).img, card, m), slanted = psnr(decode(m, audio, fs, false).img, card, m);
  console.log(`Martin M1, noisy, clock +0.3%: with slant correction ${fixed.toFixed(1)} dB, without ${slanted.toFixed(1)} dB`);
  assert.ok(fixed > 18 && fixed > slanted + 5);
}
console.log("sstv: all checks passed");
