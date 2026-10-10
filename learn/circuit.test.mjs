// Run: node learn/circuit.test.mjs
import assert from "node:assert/strict";
import { solve, simulate, mosfet, RED_LED } from "./circuit.js";
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
// node numbers with gaps (node 1 unused) are fine and keep their numbers
r = solve([{ type: "V", a: 2, b: 0, volts: 4 }, { type: "R", a: 2, b: 3, ohms: 100 }, { type: "R", a: 3, b: 0, ohms: 100 }]);
near(r.v[3], 2); near(r.v[2], 4);
// a floating node is reported, not silently wrong
assert.throws(() => solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 2, b: 3, ohms: 100 }]), /floating/);
// RC charging: 5 V, 1 kΩ, 1 µF → τ = 1 ms; after one τ the capacitor is at 63% (3.16 V), after 5τ nearly full
let sim = simulate([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "C", a: 2, b: 0, farads: 1e-6 }], { dt: 1e-5, steps: 500 });
near(sim.v[100][2], 5 * (1 - Math.exp(-1)), 0.01); near(sim.v[500][2], 5 * (1 - Math.exp(-5)), 0.01);
near(sim.i[0][1], 0.005, 1e-4); // at the start the empty capacitor looks like a wire: 5 V / 1 kΩ
// discharge from 5 V through 1 kΩ: 37% after τ
sim = simulate([{ type: "R", a: 1, b: 0, ohms: 1000 }, { type: "C", a: 1, b: 0, farads: 1e-6, v0: 5 }], { dt: 1e-5, steps: 100 });
near(sim.v[100][1], 5 * Math.exp(-1), 0.01);
// LC tank: 1 mH and 1 µF ring at 1/(2π√LC) ≈ 5033 Hz, and keep ringing (no fake damping)
sim = simulate([{ type: "L", a: 1, b: 0, henries: 1e-3 }, { type: "C", a: 1, b: 0, farads: 1e-6, v0: 1 }], { dt: 1e-6, steps: 2000 });
const ups = []; for (let n = 1; n < sim.v.length; n++) if (sim.v[n - 1][1] < 0 && sim.v[n][1] >= 0) ups.push(sim.t[n]);
const f = (ups.length - 1) / (ups.at(-1) - ups[0]);
assert.ok(Math.abs(f - 1 / (2 * Math.PI * Math.sqrt(1e-9))) < 30, `LC rings at ${f.toFixed(0)} Hz`);
assert.ok(Math.max(...sim.v.slice(1800).map((v) => v[1])) > 0.98, "amplitude kept");
// a coil already carrying 1 A, shorted through 2 Ω: the current decays with τ = L/R
sim = simulate([{ type: "L", a: 1, b: 0, henries: 1, i0: 1 }, { type: "R", a: 1, b: 0, ohms: 2 }], { dt: 1e-4, steps: 5000 });
near(sim.i[5000][0], Math.exp(-1), 0.01);
// backward Euler: RC charging is still right to about a percent
sim = { st: (await import("./circuit.js")).stepper([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "C", a: 2, b: 0, farads: 1e-6 }], 1e-5, { method: "euler" }) };
let last; for (let n = 0; n <= 100; n++) last = sim.st.step();
near(last.v[2], 5 * (1 - Math.exp(-1)), 0.03);
// a sine source through an RC low-pass at its cutoff comes out at 1/√2 of the input amplitude
const fc = 1 / (2 * Math.PI * 1000 * 1e-6);
sim = simulate([{ type: "V", a: 1, b: 0, volts: (t) => Math.sin(2 * Math.PI * fc * t) }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "C", a: 2, b: 0, farads: 1e-6 }], { dt: 2e-6, steps: 15000 });
near(Math.max(...sim.v.slice(10000).map((v) => v[2])), Math.SQRT1_2, 0.01);
// with gmin, an unconnected resistor doesn't break the rest of the circuit
r = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 0, ohms: 1000 }, { type: "R", a: 2, b: 3, ohms: 100 }], { gmin: 1e-9 });
near(r.current[1], 0.005, 1e-8); near(r.current[2], 0, 1e-12);
// MOSFET as a switch: 12 V through a 12 Ω load to the drain; gate at 0 V → off, at 10 V → fully on (drain near 0 V)
const sw = (vg) => solve([{ type: "V", a: 1, b: 0, volts: 12 }, { type: "R", a: 1, b: 2, ohms: 12 }, { type: "V", a: 3, b: 0, volts: vg }, { type: "M", a: 2, b: 0, g: 3, vth: 2, k: 2 }]);
r = sw(0); near(r.v[2], 12, 1e-6); near(r.current[3], 0, 1e-9);
r = sw(10); assert.ok(r.v[2] < 0.1 && Math.abs(r.current[3] - 1) < 0.01, `on: drain ${r.v[2]} V, ${r.current[3]} A`);
// a weak gate drive (just above threshold) leaves it half on, in saturation: Id = k/2·(Vgs − vth)²
r = sw(2.5); near(r.current[3], (2 / 2) * 0.25, 1e-6); assert.ok(r.v[2] > 8);
assert.deepEqual(mosfet({ vth: 2, k: 1 }, 1, 5).id, 0);
// op-amp, inverting amplifier: 1 V in, 1 kΩ in, 10 kΩ feedback, ±15 V rails → −10 V out
const inv = (rf) => solve([{ type: "V", a: 1, b: 0, volts: 1 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "R", a: 2, b: 3, ohms: rf }, { type: "OA", p: 0, n: 2, o: 3, vp: 15, vn: -15 }]);
r = inv(10000); near(r.v[3], -10, 0.01); near(r.v[2], 0, 0.001);
r = inv(100000); near(r.v[3], -15, 0.01); // −100 V asked for: it stops at the −15 V limit
// non-inverting gain 2 with the rails taken from supply nodes
r = solve([{ type: "V", a: 4, b: 0, volts: 12 }, { type: "V", a: 5, b: 0, volts: -12 }, { type: "V", a: 1, b: 0, volts: 2 }, { type: "R", a: 3, b: 2, ohms: 1000 }, { type: "R", a: 2, b: 0, ohms: 1000 }, { type: "OA", p: 1, n: 2, o: 3, vpNode: 4, vnNode: 5 }]);
near(r.v[3], 4, 0.01);
// a 5.1 V Zener from 12 V through 1 kΩ holds about 5.1 V
r = solve([{ type: "V", a: 1, b: 0, volts: 12 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "D", a: 0, b: 2, is: 1e-14, n: 1, bv: 5.1 }]);
assert.ok(r.v[2] > 5.1 && r.v[2] < 5.25, `zener at ${r.v[2]}`);
console.log("circuit ok");

// bipolar transistor: common-emitter switch. 5 V through 1 kΩ into the base, 12 V through 1 kΩ to the collector: saturated
{
  const { solve } = await import("./circuit.js");
  const sat = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 1000 }, { type: "V", a: 3, b: 0, volts: 12 }, { type: "R", a: 3, b: 4, ohms: 1000 }, { type: "Q", a: 4, b: 0, g: 2, is: 1e-14, bf: 100 }]);
  const vbe = sat.v[2], vce = sat.v[4], ic = sat.current[4];
  if (!(vbe > 0.6 && vbe < 0.8 && vce < 0.3 && Math.abs(ic - 0.0118) < 0.0006)) throw new Error(`npn saturated: vbe ${vbe} vce ${vce} ic ${ic}`);
  // active region: a small base current (100 kΩ from 5 V ≈ 43 µA) gives Ic ≈ β·Ib ≈ 4.3 mA, Vce well above 0
  const act = solve([{ type: "V", a: 1, b: 0, volts: 5 }, { type: "R", a: 1, b: 2, ohms: 100e3 }, { type: "V", a: 3, b: 0, volts: 12 }, { type: "R", a: 3, b: 4, ohms: 1000 }, { type: "Q", a: 4, b: 0, g: 2, is: 1e-14, bf: 100 }]);
  if (!(Math.abs(act.current[4] - 0.0043) < 0.0004 && act.v[4] > 6)) throw new Error(`npn active: ic ${act.current[4]} vce ${act.v[4]}`);
  // pnp: emitter at 12 V, base pulled to 0 through 100 kΩ, collector to ground through 1 kΩ: ~11 mA flows out of the collector
  const pnp = solve([{ type: "V", a: 1, b: 0, volts: 12 }, { type: "R", a: 2, b: 0, ohms: 100e3 }, { type: "R", a: 3, b: 0, ohms: 1000 }, { type: "Q", a: 3, b: 1, g: 2, is: 1e-14, bf: 100, pnp: true }]);
  if (!(pnp.v[3] > 10 && pnp.v[3] < 12)) throw new Error(`pnp: collector ${pnp.v[3]}`);
  console.log(`bjt ok: saturated vce ${vce.toFixed(2)} V, active ic ${(act.current[4] * 1000).toFixed(2)} mA, pnp collector ${pnp.v[3].toFixed(2)} V`);
}
