// Run: node src/cw.test.ts
import assert from "node:assert/strict";
import { CODE, DECODE, KOCH, KeyDecoder, callsign, ditMs, groups, schedule, score, spacing } from "./cw.ts";

// Table and Koch order
assert.equal(Object.keys(CODE).length, Object.keys(DECODE).length, "codes are unique");
assert.ok(KOCH.every((c) => CODE[c]), "every Koch character has a code");
assert.equal(new Set(KOCH).size, KOCH.length);

// PARIS is exactly 50 dits including the word gap: 20 WPM → 60 ms dit → "PARIS " = 3 s
assert.equal(ditMs(20), 60);
const paris = schedule("PARIS PARIS", 20);
assert.equal(paris.duration, 50 * 60 + 43 * 60, "PARIS + word gap + PARIS (43 dits without trailing gap)");
assert.deepEqual(schedule("E", 20).tones, [[0, 60]]);
assert.deepEqual(schedule("T", 20).tones, [[0, 180]]);
assert.deepEqual(schedule("EE", 20).tones, [[0, 60], [240, 300]], "character gap = 3 dits");

// Farnsworth stretches only the gaps
const f = spacing(20, 10);
assert.equal(f.dit, 60);
assert.ok(f.charGap > 3 * 60 && f.wordGap > 7 * 60 && Math.abs(f.wordGap / f.charGap - 7 / 3) < 1e-9);
assert.deepEqual(spacing(20, 25), spacing(20), "effective speed above character speed = standard spacing");

// Straight-key decoding from the schedule's own timing, at 20 WPM, then a slower sender (adaptive)
function keyText(text: string, wpm: number, decoderWpm: number) {
  const dec = new KeyDecoder(decoderWpm);
  const { tones, duration } = schedule(text, wpm);
  for (const [a, b] of tones) { dec.down(a); dec.up(b); }
  dec.idle(duration + 10 * ditMs(wpm));
  return dec.text.trim();
}
assert.equal(keyText("CQ DE K2ABC", 20, 20), "CQ DE K2ABC");
assert.equal(keyText("PARIS PARIS PARIS", 12, 20), "PARIS PARIS PARIS", "adapts from 20 to 12 WPM");

// Paddles: elements arrive whole
const p = new KeyDecoder(20);
for (const el of "-.-") p.element(el as "." | "-", 0);
p.idle(1000);
assert.equal(p.text.trim(), "K");

// Scoring
assert.equal(score("KMKM", "KMKM").accuracy, 1);
const s = score("KMRU", "KXRUE");
assert.equal(s.errors, 2);
assert.deepEqual(s.ops.map((o) => o.op), ["ok", "wrong", "ok", "ok", "extra"]);
assert.equal(score("K M", "km").accuracy, 1, "case and spaces don't matter");

// Generators
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const g = groups(["K", "M", "U"], 5, 5, rand);
assert.match(g, /^([KMU]{5} ){4}[KMU]{5}$/);
for (let i = 0; i < 50; i++) assert.match(callsign(rand), /^[AKNW][A-Z]?\d[A-Z]{1,3}$/);

console.log("cw ok");
// character timing, for revealing text as it plays
{ const s = schedule("EE T", 20); assert.deepEqual(s.chars.map((c) => [c.c, c.at, c.end]), [["E", 0, 60], ["E", 240, 300], [" ", 720, 720], ["T", 720, 900]]); }
console.log("cw timing ok");
// paddles at 20 WPM with Farnsworth 10: a person tapping X Z X Z ~250 ms apart still makes one C
{ const d = new KeyDecoder(20, 10); let t = 0;
  for (const el of ["-", ".", "-", "."] as const) { t += el === "." ? 60 : 180; d.element(el, t); t += 250; d.gap(t); }
  d.idle(t + 2000); assert.equal(d.text.trim(), "C", `farnsworth paddles: ${d.text}`);
  const tight = new KeyDecoder(20); t = 0;
  for (const el of ["-", ".", "-", "."] as const) { t += el === "." ? 60 : 180; tight.element(el, t); t += 250; tight.gap(t); }
  tight.idle(t + 2000); assert.notEqual(tight.text.trim(), "C"); }
console.log("cw paddle gaps ok");
// the idle check never ends a letter while an element is still sounding (a long dah, or a held straight key)
{ const d = new KeyDecoder(20, 10); d.element("-", 180); d.start(500); d.idle(900); assert.equal(d.text, "", "split mid-element"); d.element(".", 1000); d.idle(3000); assert.equal(d.text.trim(), "N"); }
{ const d = new KeyDecoder(20); d.down(0); d.up(180); d.down(240); d.idle(800); assert.equal(d.text, "", "straight key split while held"); }
console.log("cw held ok");
