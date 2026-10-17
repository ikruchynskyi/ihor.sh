// Checks the station check's analysis on a synthetic window with a known passband and a known interfering carrier,
// and its recommendation rules. Run: node meteor-diag.test.ts
import assert from "node:assert/strict";
import { fft } from "./radio/src/dsp.ts";
import { analyzeWindow, recommend, sectorOf, bandOf, DEFAULTS, type RadioCheck, type PassSummary, type SkyCell } from "./meteor-diag.ts";

// A 9.6 MS/s window at 137.5 MHz: noise everywhere, 25 dB more between 136.2 and 138.8 MHz (the "amplifier"), and a
// carrier at 137.95 MHz, inside the 137.9 MHz channel. Built block by block as a spectrum with random phases, scaled to
// about 8 counts RMS (each bin carries power 2 on average, 0.27 of them 25 dB more, summed over 4096 bins: σ ≈ 593 → ×0.0135).
const rate = 9.6e6, center = 137.5e6, N = 4096, blocks = 80; let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const bytes = new Uint8Array(2 * N * blocks);
for (let b = 0; b < blocks; b++) {
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const f = (center + (((k + N / 2) % N) - N / 2) * (rate / N)) / 1e6, amp = (f > 136.2 && f < 138.8 ? 10 ** (25 / 20) : 1) * Math.sqrt(-2 * Math.log(rnd())), ph = 2 * Math.PI * rnd();
    re[k] = amp * Math.cos(ph); im[k] = amp * Math.sin(ph);
  }
  const tone = Math.round(((137.95e6 - center) / rate) * N); re[(tone + N) % N] += 3000;
  for (let k = 0; k < N; k++) im[k] = -im[k]; fft(re, im); // inverse FFT: mirror, FFT, mirror
  for (let i = 0; i < N; i++) { bytes[2 * (b * N + i)] = Math.max(0, Math.min(255, Math.round(127.5 + re[i] * 0.0135))); bytes[2 * (b * N + i) + 1] = Math.max(0, Math.min(255, Math.round(127.5 - im[i] * 0.0135))); }
}
const a = analyzeWindow(bytes, rate, center);
console.log(`synthetic: ${a.rms} counts RMS, ${a.clipPct}% clipped, margin ${a.margin} dB (built: 25), passband ${a.passband?.map((x) => x.toFixed(1)).join("–")} MHz (built: 136.2–138.8), spurs ${a.spurs.map((s) => `${s.mhz} MHz +${s.db} dB${s.inChannel ? " (in channel)" : ""}`).join(", ")}`);
assert.ok(Math.abs(a.margin - 25) < 1.5, "margin");
assert.ok(a.passband && Math.abs(a.passband[0] - 136.2) < 0.25 && Math.abs(a.passband[1] - 138.8) < 0.25, "passband edges");
assert.ok(a.spurs.some((s) => Math.abs(s.mhz - 137.95) < 0.005 && s.inChannel), "the carrier in the 137.9 channel");

// the rules
const ok: RadioCheck = { t: Date.now(), ok: true, gains: "LNA 16 dB, VGA 12 dB", rms: 7, clipPct: 0, margin: 27, added: 0.008, ownFloor: 29, inBand: 56, passband: [136, 138.6], spurs: [], slice: { rms: 14, clipPct: 0 } };
const lv = (r: RadioCheck) => recommend(r, [], [], DEFAULTS).filter((x) => x.area !== "Sky" && x.area !== "Antenna").map((x) => `${x.level}:${x.area}`);
assert.deepEqual(lv(ok).filter((s) => s.startsWith("bad") || s.startsWith("warn")), [], "a healthy radio raises nothing");
assert.ok(lv({ ...ok, clipPct: 2 }).includes("bad:Radio"), "clipping is bad");
assert.ok(lv({ ...ok, margin: 2 }).includes("bad:Amplifier"), "no passband: amplifier off");
assert.ok(lv({ ...ok, margin: 10 }).includes("warn:Amplifier"), "low margin");
assert.ok(lv({ ...ok, spurs: [{ mhz: 137.91, db: 15, inChannel: true }] }).includes("bad:Interference"), "interference in channel");
const ps: PassSummary[] = [1, 2, 3].map((i) => ({ id: `p${i}`, sat: "meteor-m2-4", start: i, maxEl: 60, best: 3.8, bestAt: "40° N", minutes2: 1, minutes35: 0.4, frames: 300, good: 0, strips: 40, ok: false }));
const sky: SkyCell[] = [{ sector: 0, band: 2, best: 3.8, n: 20 }, { sector: 4, band: 1, best: 0.3, n: 20 }];
const recs = recommend(ok, ps, sky, DEFAULTS);
assert.ok(recs.some((r) => r.area === "Decoding" && r.level === "warn" && /nothing decoded/.test(r.title)), "strong but undecoded");
const partial = recommend(ok, ps.map((p, i) => ({ ...p, good: i ? 0 : 13 })), sky, DEFAULTS);
assert.ok(partial.some((r) => r.area === "Decoding" && r.level === "warn" && /edge/.test(r.title)), "some frames but no picture: at the edge, not ok");
assert.ok(recs.some((r) => r.area === "Sky" && /S/.test(r.detail)), "the south named as blocked");
assert.equal(sectorOf(359), 0); assert.equal(sectorOf(200), 4); assert.equal(bandOf(45), 2); assert.equal(bandOf(90), 3);
console.log("station check: analysis and rules pass");
