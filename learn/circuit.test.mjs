// Run: node learn/circuit.test.mjs
import assert from "node:assert/strict";
import { solve, RED_LED } from "./circuit.js";
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Ohm's law: 9 V across 1 kΩ → 9 mA, and the battery delivers it
let r = solve([{ type: "V", a: 1, b: 0, volts: 9 }, { type: "R", a: 1, b: 0, ohms: 1000 }]);
near(r.v[1], 9); near(r.current[1], 0.009); near(r.current[0], 0.009);
// a divider: 10 V over 1 kΩ + 3 kΩ → 7.5 V in the middle
r = solve([{ type: "V", a: 1, b: 0, volts: 10 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "R", a: 2, b: 0, ohms: 3000 }]);
near(r.v[2], 7.5); near(r.current[1], 0.0025);
// parallel: 6 V across 2 kΩ ∥ 3 kΩ → 3 mA + 2 mA = 5 mA from the battery (Kirchhoff's current law)
r = solve([{ type: "V", a: 1, b: 0, volts: 6 }, { type: "R", a: 1, b: 0, ohms: 2000 }, { type: "R", a: 1, b: 0, ohms: 3000 }]);
near(r.current[1], 0.003); near(r.current[2], 0.002); near(r.current[0], 0.005);
// a current source of 2 mA into 500 Ω → 1 V
r = solve([{ type: "I", a: 0, b: 1, amps: 0.002 }, { type: "R", a: 1, b: 0, ohms: 500 }]);
near(r.v[1], 1);
// a red LED with 330 Ω from 5 V: about 9 mA, about 1.9 V across the LED, and the loop adds up (KVL)
r = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 330 }, { type: "D", a: 2, b: 0, ...RED_LED }]);
assert.ok(r.current[2] > 0.008 && r.current[2] < 0.0105, `LED current ${r.current[2]}`);
assert.ok(r.v[2] > 1.8 && r.v[2] < 2.0, `LED voltage ${r.v[2]}`);
near(r.current[1], r.current[2], 1e-7); near(330 * r.current[1] + r.v[2], 5, 1e-6);
// no resistor, only 1 Ω (a battery's insides): amps, not millions of amps, with the LED at about 2.2 V
r = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 1 }, { type: "D", a: 2, b: 0, ...RED_LED }]);
assert.ok(r.current[2] > 1 && r.current[2] < 4 && r.v[2] > 2 && r.v[2] < 2.5, `no-resistor LED ${r.current[2]} A at ${r.v[2]} V`);
near(r.current[1] * 1 + r.v[2], 5, 1e-6);
// reversed LED: essentially no current
r = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 330 }, { type: "D", a: 0, b: 2, ...RED_LED }]);
assert.ok(Math.abs(r.current[2]) < 1e-12);
// a floating node is reported, not silently wrong
assert.throws(() => solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 2, b: 3, ohms: 100 }]), /floating/);
console.log("circuit ok");
