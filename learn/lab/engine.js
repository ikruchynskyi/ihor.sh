// Circuit Lab engine: parts on a grid → a netlist for learn/circuit.js → a simulation you step through time.
// No DOM here, so node can test it: node learn/lab/lab.test.mjs
import { stepper } from "../circuit.js";
import { PARTS, pins } from "./parts.js";

const key = ([x, y]) => `${x},${y}`;

/** Points of other parts lying strictly inside a straight wire, ordered from its start (T-junctions). */
export function onWire(w, parts) {
  const [ax, ay] = w.a, [bx, by] = w.b, seen = new Set();
  if (ax !== bx && ay !== by) return []; // diagonal wires only join at their ends
  return parts.flatMap((p) => (p === w ? [] : pins(p))).filter(([x, y]) => {
    const t = ax === bx ? (x === ax ? (y - ay) / (by - ay || 1) : -1) : (y === ay ? (x - ax) / (bx - ax || 1) : -1);
    const k = `${x},${y}`;
    if (t <= 0 || t >= 1 || seen.has(k)) return false;
    seen.add(k); return true;
  }).sort((p, q) => Math.abs(p[0] - ax) + Math.abs(p[1] - ay) - (Math.abs(q[0] - ax) + Math.abs(q[1] - ay)));
}

/**
 * Builds the circuit. memory: { capV: Map(id → volts), indI: Map(id → amps) } carries capacitor voltages and coil
 * currents across rebuilds (so flipping a switch doesn't empty every capacitor).
 * Returns null when there's nothing to simulate, else { els, owner, nodeOf, behaviors, states, segs, method, ground, fmax }.
 */
export function netlist(parts, memory = { capV: new Map(), indI: new Map() }) {
  const drivers = parts.filter((p) => ["battery", "source"].includes(p.type) || PARTS[p.type].cat === "ICs" || PARTS[p.type].cat === "Logic");
  if (!drivers.length) return null;
  const nodeOf = new Map();
  let n = 1, ground = "symbol";
  for (const p of parts) if (p.type === "ground") nodeOf.set(key(pins(p)[0]), 0);
  if (!nodeOf.size) { const s = parts.find((p) => p.type === "battery" || p.type === "source"); if (s) { nodeOf.set(key(s.b), 0); ground = "source"; } else ground = "none"; }
  const node = (pt) => { const k = key(pt); if (!nodeOf.has(k)) nodeOf.set(k, n++); return nodeOf.get(k); };
  // how many things touch each grid point (to tell an unwired pin)
  const touches = new Map(), bump = (pt) => touches.set(key(pt), (touches.get(key(pt)) ?? 0) + 1);
  for (const p of parts) for (const pt of pins(p)) bump(pt);
  for (const w of parts) if (w.type === "wire") for (const pt of onWire(w, parts)) bump(pt);

  const els = [], owner = [], behaviors = [], states = new Map(), segs = new Map();
  for (const p of parts) {
    if (p.type === "wire") { // split at T-junctions; every piece is a 1 mΩ resistor so it carries a current we can show
      const stops = [p.a, ...onWire(p, parts), p.b], list = [];
      for (let k = 1; k < stops.length; k++) { list.push({ from: stops[k - 1], to: stops[k], idx: els.length }); els.push({ type: "R", a: node(stops[k - 1]), b: node(stops[k]), ohms: 1e-3 }); owner.push(null); }
      segs.set(p.id, list);
      continue;
    }
    const ps = pins(p);
    const ctx = {
      pin: (k) => node(ps[k]),
      node: () => n++,
      free: (k) => (touches.get(key(ps[k])) ?? 0) < 2,
      add: (el, o = {}) => { els.push(el); owner.push(o.main || o.cap || o.ind ? { id: p.id, sign: o.sign ?? 1, main: !!o.main, cap: !!o.cap, ind: !!o.ind } : null); },
      behave: (fn) => behaviors.push(fn),
      state: (id, s) => states.set(id, s),
      memory,
    };
    PARTS[p.type].stamp(p, ctx);
  }
  // Switching parts next to coils make trapezoidal integration ring; backward Euler damps that (and is plenty accurate here).
  const coil = parts.some((p) => p.type === "inductor" || p.type === "motor");
  const switching = parts.some((p) => ["nmos", "timer555"].includes(p.type) || PARTS[p.type].cat === "Logic" || (p.type === "source" && p.wave !== "sine"));
  // The fastest thing that can happen: a source's frequency, or the ringing of the smallest L with the smallest C.
  const Ls = parts.filter((p) => p.type === "inductor" || p.type === "motor").map((p) => p.henries), Cs = parts.filter((p) => p.type === "capacitor").map((p) => p.farads);
  const ring = Ls.length && Cs.length ? 1 / (2 * Math.PI * Math.sqrt(Math.min(...Ls) * Math.min(...Cs))) : 0;
  const fmax = Math.max(0, ring, ...parts.filter((p) => p.type === "source").map((p) => p.freq));
  return { els, owner, nodeOf, behaviors, states, segs, method: coil && switching ? "euler" : "trap", ground, fmax, nodes: n };
}

/**
 * A running simulation. speed: simulated seconds per real second. Each frame call advance(realSeconds); read
 * .v (node voltages), .cur (part id → amps, a → b), .wire (wire segment index → amps), .t, and probe samples via onSample.
 */
export function simulation(parts, { speed = 1, memory, onSample } = {}) {
  memory ??= { capV: new Map(), indI: new Map() };
  const net = netlist(parts, memory);
  if (!net) return null;
  // Time step: ~100 per frame at the chosen speed, at least 100 per cycle of the fastest source, and never more than 1 ms.
  let dt = Math.min(1e-3, speed / 60 / 100, net.fmax ? 1 / (net.fmax * 100) : Infinity);
  if (parts.some((p) => p.type === "timer555" || PARTS[p.type].cat === "Logic")) dt = Math.min(dt, speed / 60 / 200);
  dt = Math.max(dt, 1e-9);
  const st = stepper(net.els, dt, { gmin: 1e-9, method: net.method === "euler" ? "euler" : undefined });
  const sim = { net, dt, speed, t: 0, v: [], cur: new Map(), wire: new Map(), raw: null, error: "", lag: false, memory };
  const record = (r) => {
    sim.raw = r; sim.v = r.v;
    for (const fn of net.behaviors) fn(r.v, r);
    onSample?.(sim.t, r.v);
  };
  sim.advance = (real) => {
    const want = real * sim.speed, steps = Math.round(want / dt), cap = 400, todo = Math.min(cap, Math.max(1, steps));
    sim.lag = steps > cap;
    try {
      for (let k = 0; k < todo; k++) { const r = st.step(); sim.t += dt; record(r); }
    } catch (e) { sim.error = e.message; return; }
    const r = sim.raw, cur = new Map();
    net.owner.forEach((o, k) => {
      if (!o) return;
      if (o.main) cur.set(o.id, (cur.get(o.id) ?? 0) + o.sign * r.i[k]);
      if (o.cap) memory.capV.set(o.id, r.v[net.els[k].a] - r.v[net.els[k].b]);
      if (o.ind) memory.indI.set(o.id, r.i[k]);
    });
    sim.cur = cur;
    for (const list of net.segs.values()) for (const s of list) sim.wire.set(s.idx, r.i[s.idx]);
  };
  sim.voltAt = (pt) => { const k = net.nodeOf.get(key(pt)); return k == null ? null : sim.v[k] ?? 0; };
  return sim;
}

// ---------- oscilloscope measurements ----------
/** Vmin, Vmax, Vpp, average, RMS and frequency of samples [t, v][] (frequency from upward crossings of the average). */
export function measure(samples) {
  if (samples.length < 2) return null;
  let lo = Infinity, hi = -Infinity, area = 0, sq = 0;
  for (let k = 1; k < samples.length; k++) {
    const [t0, v0] = samples[k - 1], [t1, v1] = samples[k], h = t1 - t0;
    area += ((v0 + v1) / 2) * h; sq += ((v0 * v0 + v1 * v1) / 2) * h;
  }
  for (const [, v] of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = samples.at(-1)[0] - samples[0][0] || 1, avg = area / span, rms = Math.sqrt(Math.max(0, sq / span));
  // crossings with a little hysteresis, so noise near the level doesn't count twice
  const band = (hi - lo) * 0.05, ups = [];
  let armed = false;
  for (let k = 1; k < samples.length; k++) {
    const [, v] = samples[k];
    if (v < avg - band) armed = true;
    if (armed && v >= avg && samples[k - 1][1] < avg) { const [t0, v0] = samples[k - 1], [t1, v1] = samples[k]; ups.push(t0 + ((avg - v0) / (v1 - v0 || 1)) * (t1 - t0)); armed = false; }
  }
  const freq = hi - lo > 1e-3 && ups.length >= 2 ? (ups.length - 1) / (ups.at(-1) - ups[0]) : null;
  return { min: lo, max: hi, vpp: hi - lo, avg, rms, freq };
}
