// Radio from scratch, chapter 1: spinning arrows. Chapter 1 has no code of its own; this checks the numbers in its
// "Where it breaks" box: arrows of speeds 1, 3, 5, 7… and lengths 1, 1/3, 1/5, 1/7… draw a square wave whose corners
// always overshoot by about 9% of the jump, however many arrows.
// Run it:  node course/code/ch01.ts
import assert from "node:assert/strict";

for (const n of [4, 50]) {
  const height = (t: number) => { let s = 0; for (let k = 0; k < n; k++) s += Math.sin((2 * k + 1) * t) / (2 * k + 1); return s; };
  let peak = 0; for (let i = 1; i < 20000; i++) peak = Math.max(peak, height((i / 20000) * Math.PI));
  const flat = Math.PI / 4, overshoot = (peak - flat) / (2 * flat); // the jump is from −π/4 to +π/4
  console.log(`${String(n).padStart(2)} arrows: flat top ${flat.toFixed(3)}, peak ${peak.toFixed(3)}, overshoot ${(100 * overshoot).toFixed(1)}% of the jump`);
  assert.ok(overshoot > 0.085 && overshoot < 0.095);
}
console.log("all checks passed");
