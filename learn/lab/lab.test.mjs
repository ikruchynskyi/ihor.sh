// Run: node learn/lab/lab.test.mjs — every template simulates, and the classic ones match their textbook formulas.
import assert from "node:assert/strict";
import { simulation, measure, netlist } from "./engine.js";
import { TEMPLATES, instantiate } from "./templates.js";
import { pins, parseSI, si } from "./parts.js";

let id = 1;
const build = (name) => instantiate(name, [0, 0], () => id++);
const probeOf = (parts, ch) => pins(parts.find((p) => p.type === "probe" && p.ch === ch))[0];
/** Runs `secs` of simulated time; returns the last `keep` seconds of probe samples per channel. */
function run(parts, secs, keep = secs) {
  const sim = simulation(parts, { speed: 1 }), out = { 1: [], 2: [] }, probes = [1, 2].map((ch) => parts.some((p) => p.type === "probe" && p.ch === ch) ? sim.net.nodeOf.get(probeOf(parts, ch).join(",")) : null);
  const steps = Math.ceil(secs / sim.dt);
  for (let k = 0; k < steps; k++) {
    sim.advance(sim.dt);
    if (sim.t > secs - keep) probes.forEach((n, i) => n != null && out[i + 1].push([sim.t, sim.v[n]]));
  }
  assert.equal(sim.error, "", sim.error);
  return { sim, out };
}

assert.equal(parseSI("4.7k"), 4700); assert.ok(Math.abs(parseSI("100n") - 1e-7) < 1e-20); assert.equal(si(0.0153, "A"), "15.3 mA");

// every template builds and runs a little without errors or NaN
for (const name of Object.keys(TEMPLATES)) {
  const parts = build(name), { sim } = run(parts, 0.01);
  assert.ok(sim.v.every(Number.isFinite), `${name}: non-finite voltage`);
}

// LED + 470 Ω from 9 V: ≈ 15 mA through the ammeter
{ const parts = build("led"), { sim } = run(parts, 0.002), amm = parts.find((p) => p.type === "ammeter");
  const i = sim.cur.get(amm.id); assert.ok(i > 0.0140 && i < 0.0160, `LED current ${i}`); }

// two LEDs on one resistor: red takes it all, blue ~nothing; with their own resistors both light
{ const parts = build("ledsShared"), { sim } = run(parts, 0.002), [red, blue] = parts.filter((p) => p.type === "led");
  assert.ok(sim.cur.get(red.id) > 0.01 && Math.abs(sim.cur.get(blue.id)) < 1e-6, `shared: red ${sim.cur.get(red.id)} blue ${sim.cur.get(blue.id)}`); }
{ const parts = build("ledsOwn"), { sim } = run(parts, 0.002), [red, blue] = parts.filter((p) => p.type === "led");
  assert.ok(sim.cur.get(red.id) > 0.008 && sim.cur.get(blue.id) > 0.011, `own: red ${sim.cur.get(red.id)} blue ${sim.cur.get(blue.id)}`); }

// half-wave: DC ≈ 12 − 0.7, ripple ≈ I/(fC) ≈ 0.11/(60·0.001) ≈ 1.8 V; bridge: about half the ripple
{ const m = measure(run(build("halfwave"), 0.5, 0.1).out[2]); assert.ok(m.max > 10.2 && m.max < 11.4 && m.vpp > 1.2 && m.vpp < 2.2, `half-wave ${JSON.stringify(m)}`); }
{ const m = measure(run(build("bridge"), 0.5, 0.1).out[1]); assert.ok(m.max > 9.8 && m.max < 11 && m.vpp > 0.5 && m.vpp < 1.2, `bridge ${JSON.stringify(m)}`); }

// RC low-pass at its cutoff: 71% of the input
{ const { out } = run(build("lowpass"), 0.06, 0.025), a = measure(out[1]), b = measure(out[2]);
  assert.ok(Math.abs(b.vpp / a.vpp - 0.707) < 0.03, `low-pass gain ${b.vpp / a.vpp}`); assert.ok(Math.abs(b.freq - 159) < 3, `freq ${b.freq}`); }

// LC tank rings at ≈ 503 Hz once its one switch closes; the rebuilt simulation carries on in time (the scope relies on it)
{ const parts = build("lc"), sim = simulation(parts, { speed: 1 }), sw = parts.find((p) => p.type === "switch2");
  for (let k = 0; k < 0.002 / sim.dt; k++) sim.advance(sim.dt); // charge (τ = 10 Ω × 10 µF = 0.1 ms)
  sw.closed = true;
  const sim2 = simulation(parts, { speed: 1, memory: sim.memory, t0: sim.t }), node = sim2.net.nodeOf.get(probeOf(parts, 1).join(",")), out = [];
  assert.ok(Math.abs(sim2.t - sim.t) < 1e-12, "time carries over a rebuild");
  for (let k = 0; k < 0.01 / sim2.dt; k++) { sim2.advance(sim2.dt); out.push([sim2.t, sim2.v[node]]); }
  const m = measure(out); assert.ok(Math.abs(m.freq - 503) < 15 && m.max > 3, `LC ${JSON.stringify(m)}`); }

// 555 astable: f = 1.44 / ((1k + 2·47k)·10 µF) ≈ 1.52 Hz
{ const m = measure(run(build("blinker"), 4, 2.5).out[1]); assert.ok(Math.abs(m.freq - 1.52) < 0.12 && m.max > 6.5 && m.min < 0.5, `555 ${JSON.stringify(m)}`); }

// op-amps: inverting −10 (5 V peak), non-inverting 11
{ const { out } = run(build("inverting"), 0.004, 0.002), a = measure(out[1]), b = measure(out[2]); assert.ok(Math.abs(b.vpp / a.vpp - 10) < 0.2, `inverting gain ${b.vpp / a.vpp}`); }
{ const { out } = run(build("noninverting"), 0.004, 0.002), a = measure(out[1]), b = measure(out[2]); assert.ok(Math.abs(b.vpp / a.vpp - 11) < 0.25, `non-inverting gain ${b.vpp / a.vpp}`); }

// 7805: a steady 5 V from the rippling raw DC
{ const { out } = run(build("supply5v"), 0.6, 0.1), raw = measure(out[1]), reg = measure(out[2]);
  assert.ok(Math.abs(reg.avg - 5) < 0.05 && reg.vpp < 0.05 && raw.vpp > 0.2, `regulator raw ${JSON.stringify(raw)} out ${JSON.stringify(reg)}`); }

// Zener ≈ 5.1 V
{ const { sim } = run(build("zener"), 0.002), v = sim.voltAt(probeOf(build("zener"), 1)); assert.ok(v > 4.9 && v < 5.4, `zener ${v}`); }

// PWM motor: the drain swings between ~0 and ~12 V, never far above 12 (flyback diode)
{ const m = measure(run(build("motor"), 0.05, 0.02).out[2]); assert.ok(m.min < 1 && m.max > 11 && m.max < 13, `motor drain ${JSON.stringify(m)}`); }

// logic: AND gate output follows both switches
{ const parts = build("logic"), sw = parts.filter((p) => p.type === "switch"), gate = parts.find((p) => p.type === "and"), led = parts.find((p) => p.type === "led");
  for (const [a, b, want] of [[0, 0, 0], [1, 0, 0], [1, 1, 1]]) {
    sw[0].closed = !!a; sw[1].closed = !!b;
    const { sim } = run(parts, 0.002); assert.equal(sim.cur.get(led.id) > 0.005, !!want, `AND ${a}${b}`);
  } }

// no driver → nothing to simulate
assert.equal(netlist([{ id: 1, type: "resistor", a: [0, 0], b: [3, 0], ohms: 1 }]), null);
console.log("lab ok");

// BJT switch: switch open → LED dark; closed → ~15 mA through the LED and Vce near 0
{ const parts = build("bjtswitch"), sw = parts.find((p) => p.type === "switch"), led = parts.find((p) => p.type === "led");
  let { sim } = run(parts, 0.01); const off = Math.abs(sim.cur.get(led.id) ?? 0);
  sw.closed = true; ({ sim } = run(parts, 0.01)); const on = Math.abs(sim.cur.get(led.id) ?? 0), vce = sim.voltAt([10, 6]);
  assert.ok(off < 1e-4 && on > 0.012 && on < 0.018 && vce < 0.3, `bjt switch: off ${off} on ${on} vce ${vce}`); }
// transformer 10:1 on 170 V peak: secondary ≈ 17 V peak
{ const parts = build("transformer"), { out } = run(parts, 0.1, 0.05), m2 = measure(out[2]), m1 = measure(out[1]);
  assert.ok(Math.abs(m2.max - 17) < 1.5 && Math.abs(m1.max - 170) < 3 && Math.abs(m2.freq - 60) < 3, `transformer: primary ${m1.max} secondary ${m2.max} f ${m2.freq}`); }
// divide by two: Q at half the clock
{ const parts = build("divider2"), { out } = run(parts, 6, 4), clk = measure(out[1]), q = measure(out[2]);
  assert.ok(Math.abs(q.freq / clk.freq - 0.5) < 0.08, `divide by two: clock ${clk.freq} Q ${q.freq}`); }
// running light: over 8 s the counter moves on about 1.5 times a second
{ const parts = build("runlight"), { sim, out } = run(parts, 8, 6), st = sim.net.states.get(parts.find((p) => p.type === "counter4017").id), clk = measure(out[1]);
  assert.ok(clk.vpp > 5 && Math.abs(clk.freq - 1.52) < 0.15, `4017 clock: ${JSON.stringify(clk)}`);
  assert.ok(st && st.n >= 1, `4017 counted: ${JSON.stringify(st)}`); }
console.log("new parts ok");

// ---------- the build chapters' parts ----------
const { PARTS } = await import("./parts.js");
const P = (list) => list.map((p, i) => ({ ...structuredClone(PARTS[p.type].props ?? {}), id: 1000 + i, ...p })); // as the lab loads a part
const W = (a, b) => ({ type: "wire", a, b });
/** Settles a circuit (DC: a few ms) and returns the simulation. */
const settle = (parts, secs = 0.005) => run(parts, secs).sim;
// LDR: ≈15 kΩ at 10 lux, a 10× brighter light divides it by 10^0.7 ≈ 5, 1 MΩ when dark
{ const { ldrOhms } = await import("./parts.js"); assert.ok(Math.abs(ldrOhms(10) - 15e3) < 1 && Math.abs(ldrOhms(100) / ldrOhms(10) - 10 ** -0.7) < 1e-9 && ldrOhms(0.01) === 1e6); }
// LM393: IN− above IN+ pulls OUT low through its 10 kΩ pull-up; below, the pull-up wins
for (const [vn, low] of [[3, true], [1, false]]) {
  const parts = P([{ type: "battery", a: [0, 0], b: [0, 3], v: 5 }, { type: "ground", at: [0, 3] }, { type: "lm393", at: [4, 4] },
    W([0, 0], [6, 0]), W([6, 0], [6, 2]), { type: "resistor", a: [6, 0], b: [8, 0], ohms: 10e3 }, W([8, 0], [8, 4]), W([6, 6], [6, 7]), { type: "ground", at: [6, 7] },
    { type: "battery", a: [2, 0 + 3], b: [2, 6], v: vn }, W([2, 3], [4, 3]), { type: "ground", at: [2, 6] }, { type: "battery", a: [-2, 5], b: [-2, 8], v: 2 }, W([-2, 5], [4, 5]), { type: "ground", at: [-2, 8] }]);
  const sim = settle(parts), out = sim.voltAt([8, 4]);
  assert.ok(low ? out < 0.2 : out > 4.9, `LM393 IN− ${vn} V: OUT ${out}`);
}
// LM386: output idles at half the supply, 0.05 V on +IN moves it by 20 × 0.05 = 1 V, and it stops 0.7 V below the rail
for (const [vin, want] of [[0, 3], [0.05, 4], [0.2, 5.3]]) {
  const parts = P([{ type: "battery", a: [0, 0], b: [0, 3], v: 6 }, { type: "ground", at: [0, 3] }, { type: "lm386", at: [4, 4] }, W([0, 0], [6, 0]), W([6, 0], [6, 2]), W([6, 6], [6, 7]), { type: "ground", at: [6, 7] },
    { type: "battery", a: [2, 5], b: [2, 8], v: vin || 1e-9 }, W([2, 5], [4, 5]), { type: "ground", at: [2, 8] }, W([4, 3], [3, 3]), { type: "ground", at: [3, 3] }, { type: "resistor", a: [8, 4], b: [8, 7], ohms: 1e4 }, { type: "ground", at: [8, 7] }]);
  const out = settle(parts).voltAt([8, 4]); assert.ok(Math.abs(out - want) < 0.05, `LM386 +IN ${vin}: OUT ${out}`);
}
// MCP1700: 5 V in → 3.3 V out under 33 mA; 3.4 V in → only ~0.18 V less (dropout)
for (const [vin, want] of [[5, 3.3], [3.4, 3.22]]) {
  const parts = P([{ type: "battery", a: [0, 0], b: [0, 3], v: vin }, { type: "ground", at: [0, 3] }, { type: "ldo1700", at: [2, 0] }, W([0, 0], [2, 0]), { type: "ground", at: [4, 2] }, { type: "resistor", a: [6, 0], b: [6, 3], ohms: 100 }, W([6, 0], [6, 0]), { type: "ground", at: [6, 3] }]);
  const out = settle(parts, 0.02).voltAt([6, 0]); assert.ok(Math.abs(out - want) < 0.03, `MCP1700 at ${vin} V: ${out}`);
}
// 4017 on its own supply pins: counts while CLOCK INHIBIT is low, holds while it's high
for (const inhibit of [false, true]) {
  const parts = P([{ type: "battery", a: [0, -1], b: [0, 2], v: 9 }, { type: "ground", at: [0, 2] }, { type: "source", a: [-3, 1], b: [-3, 4], wave: "square", freq: 50, amp: 4.5, offset: 4.5 }, { type: "ground", at: [-3, 4] },
    { type: "counter4017", at: [4, 0] }, W([-3, 1], [4, 1]), W([4, 2], [2, 2]), { type: "ground", at: [2, 2] }, W([0, -1], [7, -1]), { type: "ground", at: [7, 12] }, inhibit ? W([4, 3], [3, 3]) : W([4, 3], [3, 4]), inhibit ? W([3, 3], [3, -1]) : { type: "ground", at: [3, 4] }]);
  const sim = settle(parts, 0.1), st = sim.net.states.get(1004);
  assert.ok(inhibit ? st.n === 0 : st.n >= 3, `4017 inhibit=${inhibit}: count ${st.n}`); assert.ok(Math.abs(st.vdd - 9) < 0.05, `4017 runs on its VDD pin: ${st.vdd}`);
}
console.log("build parts ok");
