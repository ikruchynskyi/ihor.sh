// Radio from scratch, chapter 2: arrows as numbers.
// Run it:  node course/code/ch02.ts      (Node 22+ runs TypeScript directly)
import assert from "node:assert/strict";

/** An arrow: I = how far sideways, Q = how far up. */
type Arrow = { I: number; Q: number };

const add = (a: Arrow, b: Arrow): Arrow => ({ I: a.I + b.I, Q: a.Q + b.Q });

/** Rotate-and-stretch, written with the two shadows: (a.I + j·a.Q)(b.I + j·b.Q), using j·j = −1. */
const mul = (a: Arrow, b: Arrow): Arrow => ({
  I: a.I * b.I - a.Q * b.Q,
  Q: a.I * b.Q + a.Q * b.I,
});

const length = (a: Arrow) => Math.hypot(a.I, a.Q);
const angle = (a: Arrow) => (Math.atan2(a.Q, a.I) * 180) / Math.PI; // degrees
const atAngle = (degrees: number, len = 1): Arrow => {
  const r = (degrees * Math.PI) / 180;
  return { I: len * Math.cos(r), Q: len * Math.sin(r) };
};
const near = (x: number, y: number, what: string) => assert.ok(Math.abs(x - y) < 1e-9, `${what}: ${x} vs ${y}`);

// 1. j is "a quarter turn". Two quarter turns make a half turn: j·j = −1.
const j: Arrow = { I: 0, Q: 1 };
const jj = mul(j, j);
near(jj.I, -1, "j·j sideways"); near(jj.Q, 0, "j·j up");
console.log("j · j =", jj, "→ a half turn: −1");

// 2. Multiplying: lengths multiply, angles add.
const a = atAngle(30, 2), b = atAngle(45, 1.5), p = mul(a, b);
near(length(p), 3, "length"); near(angle(p), 75, "angle");
console.log(`(length 2, 30°) × (length 1.5, 45°) = (length ${length(p).toFixed(3)}, ${angle(p).toFixed(3)}°)`);

// 3. Adding is tip to tail: the I's add, the Q's add.
console.log("(1, 2) + (3, −1) =", add({ I: 1, Q: 2 }, { I: 3, Q: -1 }));

// 4. Multiplying by the same arrow again and again spins: four quarter turns bring you back.
let z: Arrow = { I: 1, Q: 0 };
for (let k = 0; k < 4; k++) z = mul(z, j);
near(z.I, 1, "four quarter turns"); near(z.Q, 0, "four quarter turns");
console.log("1 × j × j × j × j =", { I: +z.I.toFixed(12), Q: +z.Q.toFixed(12) });

// 5. The arrow at angle θ, built from n tiny sideways steps: (1 + j·θ/n)^n.
const θ = Math.PI / 2; // a quarter turn, 90°
for (const n of [1, 4, 30, 1000, 100000]) {
  const step: Arrow = { I: 1, Q: θ / n };
  let w: Arrow = { I: 1, Q: 0 };
  for (let k = 0; k < n; k++) w = mul(w, step);
  console.log(`n = ${String(n).padStart(6)}: length ${length(w).toFixed(5)}, angle ${angle(w).toFixed(3)}°`);
}
console.log("→ it settles on length 1 at exactly 90°: the arrow at angle θ, which mathematicians write e^(jθ).");
console.log("all checks passed");
