// Run: node yomu/handwriting.test.mjs: draws every deck kanji the way a sloppy learner might (shuffled stroke
// order, some strokes backwards, wobbly, off-center, squashed) and checks the recognizer still finds it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { references, recognize } from "./handwriting.js";

const json = JSON.parse(readFileSync(new URL("./data/strokes.json", import.meta.url)));
const refs = references(json);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const learner = (flat, { shuffle, reverse, wobble, drop, join }) => {
  let st = flat.map((f) => Array.from({ length: f.length / 2 }, (_, i) => [f[2 * i], f[2 * i + 1]]));
  if (drop && st.length > 3) st.splice(Math.floor(rand() * st.length), 1); // forgot a stroke
  if (join && st.length > 3) { const i = Math.floor(rand() * (st.length - 1)); st.splice(i, 2, [...st[i], ...st[i + 1]]); } // two strokes in one go
  if (shuffle) st = st.map((s) => [rand(), s]).sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  if (reverse) st = st.map((s) => (rand() < 0.3 ? [...s].reverse() : s));
  const [sx, sy, dx, dy] = [2 + rand(), 2.4 + rand(), rand() * 50, rand() * 50]; // a 300-px canvas, squashed and shifted
  return st.map((s) => s.map(([x, y]) => [x * sx + dx + (rand() - 0.5) * wobble, y * sy + dy + (rand() - 0.5) * wobble]));
};
for (const [name, opts, top1, top5] of [["in order", { wobble: 6 }, 0.9, 0.97], ["any order, some backwards", { shuffle: true, reverse: true, wobble: 10 }, 0.8, 0.93],
  ["one stroke left out", { shuffle: true, wobble: 8, drop: true }, 0.6, 0.8], ["two strokes joined", { shuffle: true, wobble: 8, join: true }, 0.6, 0.8]]) {
  let hit1 = 0, hit5 = 0;
  const t0 = performance.now();
  for (const [k, flat] of Object.entries(json)) {
    const got = recognize(learner(flat, opts), refs, 5).map((r) => r.k);
    hit1 += got[0] === k; hit5 += got.includes(k);
  }
  const n = Object.keys(json).length, ms = (performance.now() - t0) / n;
  console.log(`${name}: top-1 ${(hit1 / n * 100).toFixed(1)}%, top-5 ${(hit5 / n * 100).toFixed(1)}%, ${ms.toFixed(1)} ms per drawing`);
  assert.ok(hit1 / n >= top1 && hit5 / n >= top5, name);
}
console.log("handwriting ok");
