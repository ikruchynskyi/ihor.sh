// A small circuit solver for the electronics course: modified nodal analysis (MNA), the method SPICE is built on.
// Elements connect numbered nodes (0 is ground):
//   { type: "R", a, b, ohms }      resistor
//   { type: "V", a, b, volts }     voltage source, a is the + terminal
//   { type: "I", a, b, amps }      current source pushing current from a, through itself, into b
//   { type: "D", a, b, is, n }     diode/LED, anode a, cathode b (Shockley equation, solved by Newton's method)
//   { type: "D", …, bv }            with bv: a Zener diode that also conducts backwards above bv volts
//   { type: "OA", p, n, o, vp, vn, gain } op-amp: output node o follows gain·(v(p) − v(n)), saturating smoothly
//                                     between output limits vp and vn (volts), or 1.5 V inside supply nodes vpNode/vnNode
//   { type: "M", a, b, g, vth, k }   n-channel MOSFET: drain a, source b, gate g (square-law model, Newton like diodes)
//   { type: "C", a, b, farads, v0 } and { type: "L", a, b, henries, i0 }: only in simulate()/stepper(), over time
// solve() returns node voltages and the current through every element, measured from a to b.
// A voltage source's volts may be a function of time (t, seconds) in simulate(): square waves, sine waves.
// Pure, so node can test it: node learn/circuit.test.mjs

const VT = 0.025852; // thermal voltage at 27 °C

/** Square-law n-channel MOSFET: drain current and its slopes. Off below vth; a resistor-like "linear" region at small Vds;
 *  saturation (current set by the gate) above Vgs − vth. Symmetric for Vds < 0 (no body diode modeled). */
export function mosfet(e, vgs, vds) {
  // Drain and source swap roles when vds goes negative (a MOSFET is symmetric): id(vgs, vds) = −F(vgs − vds, −vds).
  if (vds < 0) { const r = mosfet(e, vgs - vds, -vds); return { id: -r.id, gm: -r.gm, gds: r.gm + r.gds }; }
  const { vth = 2, k = 1 } = e, ov = vgs - vth;
  if (ov <= 0) return { id: 0, gm: 0, gds: 1e-9 };
  if (vds < ov) return { id: k * (ov * vds - vds * vds / 2), gm: k * vds, gds: k * (ov - vds) + 1e-9 };
  return { id: (k / 2) * ov * ov, gm: k * ov, gds: 1e-9 };
}

/** Op-amp transfer: the output swings between the rails, steeply (gain) around v(p) = v(n). */
function opamp(e, x, v) {
  const hi = e.vpNode != null ? v[e.vpNode] - 1.5 : e.vp ?? 12, lo = e.vnNode != null ? v[e.vnNode] + 1.5 : e.vn ?? -12; // outputs stop ~1.5 V short of the rails
  const mid = (hi + lo) / 2, half = Math.max(0.01, (hi - lo) / 2), A = e.gain ?? 1e5, t = Math.tanh((A * x) / half);
  return { f: mid + half * t, g: A * (1 - t * t) + 1e-9 };
}

/** Solve A·x = b by Gaussian elimination with partial pivoting (A is modified in place). */
function gauss(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-15) throw new Error("the circuit has a floating node or a loop of voltage sources");
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

// opts.gmin: a tiny conductance from every node to ground (as SPICE does), so a half-built circuit with an
// unconnected part still solves (that part just sits at 0 V) instead of throwing.
export function solve(input, { gmin = 0, state } = {}) {
  // Renumber the nodes actually used to 1…n (an unused number, e.g. after a part is removed, isn't a floating node).
  const pins = (e) => (e.type === "OA" ? [e.p, e.n, e.o, e.vpNode, e.vnNode].filter((x) => x != null) : [e.a, e.b, ...(e.type === "M" ? [e.g] : [])]);
  const used = [...new Set(input.flatMap(pins).filter((n) => n))].sort((x, y) => x - y), map = new Map(used.map((n, i) => [n, i + 1]));
  const re = (n) => (n == null ? n : map.get(n) ?? 0);
  const elements = input.map((e) => e.type === "OA" ? { ...e, p: re(e.p), n: re(e.n), o: re(e.o), vpNode: re(e.vpNode), vnNode: re(e.vnNode) }
    : { ...e, a: re(e.a), b: re(e.b), ...(e.type === "M" ? { g: re(e.g) } : {}) });
  const nodes = used.length; // node count, not counting ground
  const sources = elements.filter((e) => e.type === "V" || e.type === "OA"); // each adds a current unknown
  const size = nodes + sources.length;
  const diodes = elements.filter((e) => e.type === "D" || e.type === "M" || e.type === "OA"); // the parts that need Newton's method
  let v = new Array(nodes + 1).fill(0), x = null, limited = false;
  // A warm start (state from the previous time step): begin Newton at last step's answer, with each junction's memory.
  // Element k keeps its slot, so this only makes sense for the same circuit step after step (as stepper() does).
  if (state?.v) used.forEach((n, i) => (v[i + 1] = state.v[n] ?? 0));
  const lastVd = state ? (state.junction ??= new Map()) : new Map(); // per diode/FET (by index): the voltages used last time
  let iterCount = 0;
  for (let iter = 0; iter < (diodes.length ? 400 : 1); iter++) {
    iterCount = iter + 1;
    const A = Array.from({ length: size }, () => new Array(size).fill(0)), b = new Array(size).fill(0);
    limited = false;
    const stamp = (r, c, g) => { if (r && c) A[r - 1][c - 1] += g; };
    const conduct = (a, b2, g) => { stamp(a, a, g); stamp(b2, b2, g); stamp(a, b2, -g); stamp(b2, a, -g); };
    const inject = (node, amps) => { if (node) b[node - 1] += amps; };
    if (gmin) for (let n = 1; n <= nodes; n++) stamp(n, n, gmin);
    for (let k = 0; k < elements.length; k++) {
      const e = elements[k];
      if (e.type === "R") conduct(e.a, e.b, 1 / e.ohms);
      else if (e.type === "I") { inject(e.a, -e.amps); inject(e.b, e.amps); }
      else if (e.type === "D") {
        // Linearize around the last guess: a conductance g in parallel with a current source.
        // (vd is capped only to keep exp() finite; capping it near the answer, e.g. at 2 V, stops Newton from converging)
        const nvt = (e.n ?? 1) * VT;
        // SPICE's junction limiting (pnjlim): a big jump in the diode's voltage is replaced by a logarithmic step,
        // so Newton can't overshoot the exponential. Node voltages themselves move freely.
        let vd = v[e.a] - v[e.b];
        const old = lastVd.get(k) ?? 0, vcrit = nvt * Math.log(nvt / (Math.SQRT2 * e.is));
        if (vd > vcrit && Math.abs(vd - old) > 2 * nvt) { vd = old > 0 ? old + nvt * Math.log(1 + (vd - old) / nvt) : nvt * Math.log(vd / nvt); limited = true; }
        if (e.bv && -vd - e.bv > 0 && Math.abs(vd - old) > 2 * nvt) { const r = -vd - e.bv, ro = -old - e.bv; vd = -e.bv - (ro > 0 ? ro + nvt * Math.log(1 + (r - ro) / nvt) : nvt * Math.log(r / nvt)); limited = true; }
        lastVd.set(k, vd);
        let id = e.is * (Math.exp(vd / nvt) - 1), g = (e.is / nvt) * Math.exp(vd / nvt) + 1e-12;
        if (e.bv) { const r = 1e-3 * Math.exp(Math.min(-(vd + e.bv) / nvt, 100)); id -= r; g += r / nvt; } // Zener: 1 mA backwards at bv (SPICE's IBV), steeply more past it
        conduct(e.a, e.b, g); inject(e.a, -(id - g * vd)); inject(e.b, id - g * vd);
      } else if (e.type === "M") {
        // Linearize Id(Vgs, Vds) around the last guess: Id ≈ Id0 + gm·ΔVgs + gds·ΔVds, a conductance plus a controlled source.
        // Limit how far the gate and drain voltages may move per iteration (SPICE does the same for FETs).
        const old = lastVd.get(k) ?? { vgs: 0, vds: 0 }, clampTo = (x, o, d) => Math.max(o - d, Math.min(o + d, x));
        let vgs = v[e.g] - v[e.b], vds = v[e.a] - v[e.b];
        const lg = clampTo(vgs, old.vgs, 1), ld = clampTo(vds, old.vds, 2);
        if (lg !== vgs || ld !== vds) limited = true;
        vgs = lg; vds = ld; lastVd.set(k, { vgs, vds });
        const { id, gm, gds } = mosfet(e, vgs, vds);
        conduct(e.a, e.b, gds + 1e-12);
        stamp(e.a, e.g, gm); stamp(e.a, e.b, -gm); stamp(e.b, e.g, -gm); stamp(e.b, e.b, gm);
        const ieq = id - gm * vgs - gds * vds;
        inject(e.a, -ieq); inject(e.b, ieq);
      }
    }
    sources.forEach((s, k) => {
      const row = nodes + k;
      if (s.type === "OA") {
        // v(o) = f(v(p) − v(n)), linearized around the last guess: v(o) − g·v(p) + g·v(n) = f0 − g·x0
        const x0 = v[s.p] - v[s.n], { f, g } = opamp(s, x0, v);
        if (s.o) { A[row][s.o - 1] += 1; A[s.o - 1][row] += 1; }
        if (s.p) A[row][s.p - 1] -= g; if (s.n) A[row][s.n - 1] += g;
        b[row] = f - g * x0;
        return;
      }
      if (s.a) { A[row][s.a - 1] += 1; A[s.a - 1][row] += 1; } if (s.b) { A[row][s.b - 1] -= 1; A[s.b - 1][row] -= 1; } b[row] = s.volts;
    });
    x = gauss(A, b);
    const next = [0, ...x.slice(0, nodes)];
    // Stop once nothing moves (the steep diode curve is tamed inside the diode itself, by junction limiting).
    const delta = Math.max(0, ...next.map((nv, i) => Math.abs(nv - v[i])));
    v = next;
    if (diodes.length && delta < 1e-9 && !limited) break;
  }
  const current = elements.map((e) => {
    const vd = v[e.a] - v[e.b];
    if (e.type === "R") return vd / e.ohms;
    if (e.type === "I") return e.amps;
    if (e.type === "D") { const nvt = (e.n ?? 1) * VT; return e.is * (Math.exp(Math.min(vd, 100 * nvt) / nvt) - 1) - (e.bv ? 1e-3 * Math.exp(Math.min(-(vd + e.bv) / nvt, 100)) : 0); }
    if (e.type === "OA") return -x[nodes + sources.indexOf(e)]; // the output's current
    if (e.type === "M") return mosfet(e, v[e.g] - v[e.b], vd).id;
    return -x[nodes + sources.indexOf(e)]; // MNA solves for the current into the + terminal; report it flowing out of +
  });
  // Report voltages under the caller's own node numbers.
  const vOut = new Array(Math.max(0, ...used) + 1).fill(0);
  used.forEach((n, i) => (vOut[n] = v[i + 1]));
  if (state) state.v = vOut;
  return { v: vOut, current, iterations: iterCount };
}

/**
 * Step a circuit through time. Capacitors and inductors become their trapezoidal "companion models" (a resistor plus a
 * current source that remembers the last step), the method SPICE uses; trapezoidal keeps an LC tank ringing instead of
 * damping it. Returns { t, v: node voltages per step, i: element currents per step }.
 */
export function simulate(elements, { dt, steps }) {
  const sim = stepper(elements, dt), out = { t: [], v: [], i: [] };
  for (let n = 0; n <= steps; n++) { const r = sim.step(); out.t.push(r.t); out.v.push(r.v); out.i.push(r.i); }
  return out;
}

/** The same, one step at a time (for circuits that run live on a page): step() advances dt and returns { t, v, i }. */
// opts.method "euler" (backward Euler) instead of trapezoidal: it damps a little, but it doesn't ring when a coil is
// suddenly switched into a near-open circuit (a MOSFET turning off), which trapezoidal does.
export function stepper(elements, dt, opts = {}) {
  const be = opts.method === "euler";
  const state = elements.map((e) => ({ v: e.type === "C" ? e.v0 ?? 0 : 0, i: e.type === "L" ? e.i0 ?? 0 : 0 })); // a coil can start with current flowing (i0)
  const warm = {}; // Newton starts each step from the last one's answer
  let n = 0;
  return { step() {
    const t = n++ * dt, flat = [], owner = [];
    elements.forEach((e, k) => {
      const s = state[k];
      if (e.type === "C") { const g = (be ? 1 : 2) * e.farads / dt; flat.push({ type: "R", a: e.a, b: e.b, ohms: 1 / g }, { type: "I", a: e.b, b: e.a, amps: g * s.v + (be ? 0 : s.i) }); owner.push(k, -1); }
      else if (e.type === "L") { const g = dt / ((be ? 1 : 2) * e.henries); flat.push({ type: "R", a: e.a, b: e.b, ohms: 1 / g }, { type: "I", a: e.a, b: e.b, amps: s.i + (be ? 0 : g * s.v) }); owner.push(k, -1); }
      else { flat.push(e.type === "V" && typeof e.volts === "function" ? { ...e, volts: e.volts(t) } : e); owner.push(k); }
    });
    const r = solve(flat, { ...opts, state: warm }), cur = elements.map(() => 0);
    flat.forEach((f, j) => { if (owner[j] >= 0) cur[owner[j]] += r.current[j]; });
    elements.forEach((e, k) => {
      if (e.type !== "C" && e.type !== "L") return;
      const vab = r.v[e.a] - r.v[e.b], s = state[k];
      cur[k] = be ? (e.type === "C" ? (e.farads / dt) * (vab - s.v) : s.i + (dt / e.henries) * vab)
        : e.type === "C" ? ((2 * e.farads) / dt) * (vab - s.v) - s.i : s.i + (dt / (2 * e.henries)) * (vab + s.v);
      s.v = vab; s.i = cur[k];
    });
    return { t, v: r.v, i: cur };
  } };
}

/** A red LED: about 1.9 V at 10 mA. */
export const RED_LED = { is: 1.2e-18, n: 2 };
