// A small circuit solver for the electronics course: modified nodal analysis (MNA), the method SPICE is built on.
// Elements connect numbered nodes (0 is ground):
//   { type: "R", a, b, ohms }      resistor
//   { type: "V", a, b, volts }     voltage source, a is the + terminal
//   { type: "I", a, b, amps }      current source pushing current from a, through itself, into b
//   { type: "D", a, b, is, n }     diode/LED, anode a, cathode b (Shockley equation, solved by Newton's method)
// solve() returns node voltages and the current through every element, measured from a to b.
// Pure, so node can test it: node learn/circuit.test.mjs

const VT = 0.025852; // thermal voltage at 27 °C

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

export function solve(elements) {
  const nodes = Math.max(0, ...elements.flatMap((e) => [e.a, e.b])); // node count, not counting ground
  const sources = elements.filter((e) => e.type === "V");
  const size = nodes + sources.length;
  const diodes = elements.filter((e) => e.type === "D");
  let v = new Array(nodes + 1).fill(0), x = null;
  for (let iter = 0; iter < (diodes.length ? 400 : 1); iter++) {
    const A = Array.from({ length: size }, () => new Array(size).fill(0)), b = new Array(size).fill(0);
    const stamp = (r, c, g) => { if (r && c) A[r - 1][c - 1] += g; };
    const conduct = (a, b2, g) => { stamp(a, a, g); stamp(b2, b2, g); stamp(a, b2, -g); stamp(b2, a, -g); };
    const inject = (node, amps) => { if (node) b[node - 1] += amps; };
    for (const e of elements) {
      if (e.type === "R") conduct(e.a, e.b, 1 / e.ohms);
      else if (e.type === "I") { inject(e.a, -e.amps); inject(e.b, e.amps); }
      else if (e.type === "D") {
        // Linearize around the last guess: a conductance g in parallel with a current source.
        // (vd is capped only to keep exp() finite; capping it near the answer, e.g. at 2 V, stops Newton from converging)
        const nvt = (e.n ?? 1) * VT, vd = Math.min(v[e.a] - v[e.b], 100 * nvt), id = e.is * (Math.exp(vd / nvt) - 1), g = e.is / nvt * Math.exp(vd / nvt) + 1e-12;
        conduct(e.a, e.b, g); inject(e.a, -(id - g * vd)); inject(e.b, id - g * vd);
      }
    }
    sources.forEach((s, k) => { const row = nodes + k; if (s.a) { A[row][s.a - 1] += 1; A[s.a - 1][row] += 1; } if (s.b) { A[row][s.b - 1] -= 1; A[s.b - 1][row] -= 1; } b[row] = s.volts; });
    x = gauss(A, b);
    const next = [0, ...x.slice(0, nodes)];
    // Newton can overshoot on the steep diode curve: limit each step, stop once nothing moves.
    const delta = Math.max(0, ...next.map((nv, i) => Math.abs(nv - v[i])));
    v = diodes.length ? next.map((nv, i) => v[i] + Math.max(-0.3, Math.min(0.3, nv - v[i]))) : next;
    if (diodes.length && delta < 1e-9) break;
  }
  const current = elements.map((e) => {
    const vd = v[e.a] - v[e.b];
    if (e.type === "R") return vd / e.ohms;
    if (e.type === "I") return e.amps;
    if (e.type === "D") return e.is * (Math.exp(vd / ((e.n ?? 1) * VT)) - 1);
    return -x[nodes + sources.indexOf(e)]; // MNA solves for the current into the + terminal; report it flowing out of +
  });
  return { v, current };
}

/** A red LED: about 1.9 V at 10 mA. */
export const RED_LED = { is: 1.2e-18, n: 2 };
