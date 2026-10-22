// Run: node learn/build.test.mjs — the Part II builds: every breadboard joins exactly the pins its schematic joins,
// every part the text explains exists, and the numbers the chapters quote come out of the simulation.
import assert from "node:assert/strict";
import { load, refs, checkBreadboard, labLink } from "./build.js";
import { simulation, measure } from "./lab/engine.js";
import * as PROJECTS from "./electronics/projects.js";

const builds = Object.entries(PROJECTS).filter(([k]) => /^P\d+$/.test(k));
for (const [name, pr] of builds) {
  const errs = checkBreadboard(pr); assert.deepEqual(errs, [], `${name} breadboard:\n${errs.join("\n")}`);
  const R = new Set(refs(load(pr.parts)).values());
  for (const r of Object.keys(pr.why)) assert.ok(R.has(r), `${name}: why.${r} has no part`);
  for (const b of pr.bb.parts) if (b.ref) assert.ok(R.has(b.ref), `${name}: breadboard ${b.ref} has no part`);
  assert.ok(labLink(pr).startsWith("/learn/lab.html#c2="));
}

/** Simulates `secs`, returning the sim and [t, v] samples of a point and the current of a part over the last `keep` s. */
function run(pr, secs, { point, part, keep = secs, without = [] } = {}) {
  const parts = load(pr.parts), R = refs(parts), id = [...R].find(([, r]) => r === part)?.[0];
  const live = parts.flatMap((p) => (!without.includes(R.get(p.id)) ? [p] : pr.why[R.get(p.id)]?.remove === "short" ? [{ id: p.id, type: "wire", a: p.a, b: p.b }] : [])); // as the page takes a part out
  const sim = simulation(live, { speed: pr.speed ?? 1 }), v = [], i = [];
  const steps = Math.ceil(secs / sim.dt);
  for (let k = 0; k < steps; k++) { sim.advance(sim.dt); if (sim.t > secs - keep) { if (point) v.push([sim.t, sim.voltAt(point)]); if (id) i.push([sim.t, sim.cur.get(id) ?? 0]); } }
  assert.equal(sim.error, "");
  return { sim, v, i };
}
const fmt = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, x]) => [k, x == null ? x : +x.toFixed(4)])));

// ---------- ch17: the 555 blinker ----------
{ const P = PROJECTS.P17;
  // f = 1.44 / ((10k + 2·47k)·10 µF) ≈ 1.38 Hz; high 0.40 s, low 0.33 s; LED ≈ 11 mA while lit
  const { v, i } = run(P, 6, { point: [18, 7], part: "LED1", keep: 4 }), m = measure(v), led = measure(i);
  assert.ok(Math.abs(m.freq - 1.38) < 0.1, `ch17 blink ${fmt(m)}`);
  assert.ok(led.max > 0.0095 && led.max < 0.0125, `ch17 LED current ${fmt(led)}`);
  const edges = v.slice(1).filter(([, x], k) => (x > 4) !== (v[k][1] > 4)).map(([t, x]) => [t, x > 4]), rise = edges.filter((e) => e[1]).map((e) => e[0]), fall = edges.filter((e) => !e[1]).map((e) => e[0]);
  const high = fall.at(-1) - rise.filter((t) => t < fall.at(-1)).at(-1), low = rise.at(-1) - fall.filter((t) => t < rise.at(-1)).at(-1), duty = high / (high + low);
  assert.ok(Math.abs(high - 0.395) < 0.01 && Math.abs(low - 0.326) < 0.01, `ch17 high ${high} low ${low}`);
  console.log(`ch17: ${m.freq.toFixed(2)} Hz, high ${high.toFixed(3)} s, low ${low.toFixed(3)} s, duty ${(duty * 100).toFixed(0)}%, LED ${(led.max * 1000).toFixed(1)} mA, output high ${m.max.toFixed(2)} V`);
  // without R1 or R2 the output stays high (LED on, steady); without C1 it flips far too fast to see
  for (const r of ["R1", "R2"]) { const { v: o } = run(P, 3, { point: [18, 7], keep: 2, without: [r] }), mm = measure(o); assert.ok(mm.min > 6, `ch17 without ${r}: ${fmt(mm)}`); }
  { const { v: o, sim } = run(P, 0.2, { point: [18, 7], keep: 0.1, without: ["C1"] }), mm = measure(o); assert.ok(mm.freq == null || mm.freq > 100, `ch17 without C1: ${fmt(mm)}`); console.log(`ch17 without C1: output ${fmt(mm)}`); }
  // without C2 nothing changes in the simulator
  { const { v: o } = run(P, 6, { point: [18, 7], keep: 4, without: ["C2"] }); assert.ok(Math.abs(measure(o).freq - m.freq) < 0.02); }
}
// ---------- ch18: the 5 V and 3.3 V supply ----------
{ const P = PROJECTS.P18, at = (v, secs = 0.2) => { const pr = { ...P, parts: P.parts.map((p, k) => (k === 0 ? { ...p, v } : p)) }; return run(pr, secs).sim; };
  const s9 = at(9), d = s9.voltAt([3, 1]), v5 = s9.voltAt([9, 1]), v3 = s9.voltAt([25, 1]);
  assert.ok(Math.abs(d - 8.3) < 0.05 && Math.abs(v5 - 5) < 0.01 && Math.abs(v3 - 3.3) < 0.01, `ch18 at 9 V: ${d} ${v5} ${v3}`);
  const s75 = at(7.5), v5b = s75.voltAt([9, 1]); assert.ok(Math.abs(v5b - 4.8) < 0.05 && Math.abs(s75.voltAt([25, 1]) - 3.3) < 0.01, `ch18 at 7.5 V: ${v5b}`);
  console.log(`ch18: 9 V → ${d.toFixed(2)} V after D1 → ${v5.toFixed(2)} / ${v3.toFixed(3)} V; a 7.5 V battery → ${v5b.toFixed(2)} V on the 5 V rail`);
}
// ---------- ch19: 555 + 4017 running light ----------
{ const P = PROJECTS.P19, { sim, v, i } = run(P, 5, { point: [24, 3], part: "LED1", keep: 3 }), clk = measure(v), led = measure(i), st = sim.net.states.get(load(P.parts).find((p) => p.type === "counter4017").id);
  assert.ok(Math.abs(clk.freq - 4.48) < 0.3 && clk.max > 6.3, `ch19 clock ${fmt(clk)}`);
  assert.ok(Math.abs(led.max - 0.0058) < 0.0006, `ch19 LED ${fmt(led)}`); assert.ok(st.n >= 0 && st.n <= 9);
  // only one LED at a time: the shared resistor's current equals the lit LED's
  const r3 = sim.cur.get(load(P.parts).find((p) => p.type === "resistor" && p.ohms === 1e3).id); assert.ok(Math.abs(r3 - Math.max(...[...Array(10)].map((_, k) => sim.cur.get(load(P.parts).filter((p) => p.type === "led")[k].id) ?? 0))) < 1e-4, "ch19 one LED at a time");
  console.log(`ch19: clock ${clk.freq.toFixed(2)} Hz, high ${clk.max.toFixed(2)} V; LED ${(led.max * 1000).toFixed(2)} mA`);
}
// ---------- ch20: the dusk light ----------
{ const P = PROJECTS.P20, parts = load(P.parts), ldr = parts.find((p) => p.type === "ldr"), lamp = parts.find((p) => p.type === "lamp");
  const memory = { capV: new Map(), indI: new Map() }; let sim = null, on = null, offAt = null, onAt = null;
  const settle = () => { sim = simulation(parts, { speed: 1, memory, t0: sim?.t ?? 0 }); for (let k = 0; k < 0.005 / sim.dt; k++) sim.advance(sim.dt); return (sim.cur.get(lamp.id) ?? 0) > 0.5; };
  const luxes = []; for (let l = 30; l >= 3; l *= 0.98) luxes.push(l);
  for (const l of luxes) { ldr.lux = l; const o = settle(); if (o && !onAt) onAt = l; } // getting darker
  for (const l of [...luxes].reverse()) { ldr.lux = l; const o = settle(); if (!o && onAt && !offAt) offAt = l; } // getting lighter
  assert.ok(Math.abs(onAt - 7.9) < 0.4 && Math.abs(offAt - 12.0) < 0.6, `ch20 thresholds on ${onAt} off ${offAt}`);
  ldr.lux = 1; settle(); const iStrip = sim.cur.get(lamp.id), gate = sim.voltAt([16, 4]), ref = sim.voltAt([8, 3]);
  assert.ok(Math.abs(iStrip - 1) < 0.02 && gate > 11.5 && Math.abs(ref - 6) < 0.05, `ch20 dark: strip ${iStrip} gate ${gate} ref ${ref}`);
  ldr.lux = 300; settle(); assert.ok((sim.cur.get(lamp.id) ?? 0) < 1e-3 && sim.voltAt([16, 4]) < 0.2, "ch20 off in daylight");
  console.log(`ch20: on below ${onAt.toFixed(1)} lux, off above ${offAt.toFixed(1)} lux; dark: strip ${iStrip.toFixed(3)} A, gate ${gate.toFixed(2)} V, reference ${ref.toFixed(2)} V; day: gate ${sim.voltAt([16, 4]).toFixed(3)} V`);
}
// ---------- ch21: the LM386 amplifier ----------
{ const P = PROJECTS.P21, withPos = (pos, extra = {}) => ({ ...P, parts: P.parts.map((p) => (p.type === "pot" ? { ...p, pos } : p)), ...extra });
  const idle = run({ ...P, parts: P.parts.map((p) => (p.type === "source" ? { ...p, amp: 0 } : p)) }, 0.05, { point: [12, 4], part: "LS1", keep: 0.01 }), mi = measure(idle.v);
  assert.ok(Math.abs(mi.avg - 2.5) < 0.01, `ch21 idle output ${fmt(mi)}`);
  const half = run(withPos(50), 0.2, { point: [12, 4], part: "LS1", keep: 0.02 }), mo = measure(half.v), ms = measure(half.i);
  assert.ok(Math.abs(mo.vpp / 2 - 0.94) < 0.02 && Math.abs(mo.avg - 2.5) < 0.02, `ch21 output ${fmt(mo)}`); // the input's 50 kΩ loads the pot a little
  assert.ok(Math.abs(ms.avg) < 0.003 && ms.max > 0.1 && ms.max < 0.125, `ch21 speaker ${fmt(ms)}`);
  const full = run(withPos(100), 0.2, { point: [12, 4], keep: 0.02 }), mf = measure(full.v);
  assert.ok(Math.abs(mf.max - 4.3) < 0.03 && Math.abs(mf.min - 0.7) < 0.03, `ch21 clipping ${fmt(mf)}`);
  const noC = run(withPos(50), 0.2, { part: "LS1", keep: 0.02, without: ["C1"] }), mn = measure(noC.i);
  assert.ok(Math.abs(mn.avg - 0.31) < 0.01, `ch21 without C1 ${fmt(mn)}`);
  console.log(`ch21: idle ${mi.avg.toFixed(3)} V; pot at half: ±${(mo.vpp / 2).toFixed(2)} V out, speaker ±${(ms.max * 1000).toFixed(0)} mA around ${(ms.avg * 1000).toFixed(1)} mA; full volume clips at ${mf.min.toFixed(2)}–${mf.max.toFixed(2)} V; without C1 the speaker carries ${(mn.avg * 1000).toFixed(0)} mA DC`);
}
console.log("build ok");
