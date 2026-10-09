// L-network impedance matching (two reactive parts) from a load R + jX to a resistive source Z0. Formulas after Pozar,
// Microwave Engineering, §5.1. Each solution is a series reactance X and a shunt susceptance B, and which one sits next to
// the load depends on whether the load's resistance is above or below Z0.

export interface LNet { shuntAtLoad: boolean; X: number; B: number } // X in ohms (series), B in siemens (shunt)

export function lMatch(R: number, X: number, Z0 = 50): LNet[] {
  const out: LNet[] = [];
  if (R > Z0) {
    // shunt B right across the load, then series X toward the source
    const root = Math.sqrt(R / Z0) * Math.sqrt(R * R + X * X - Z0 * R);
    for (const s of [1, -1]) {
      const B = (X + s * root) / (R * R + X * X);
      out.push({ shuntAtLoad: true, B, X: 1 / B + (X * Z0) / R - Z0 / (B * R) });
    }
  } else {
    // series X next to the load, then shunt B at the source side
    for (const s of [1, -1]) {
      const Xs = s * Math.sqrt(R * (Z0 - R)) - X, B = (s * Math.sqrt((Z0 - R) / R)) / Z0;
      out.push({ shuntAtLoad: false, X: Xs, B });
    }
  }
  return out.filter((n) => Number.isFinite(n.X) && Number.isFinite(n.B));
}

/** Input impedance [re, im] seen from the source through the network. */
export function zIn(R: number, X: number, n: LNet): [number, number] {
  const par = (r: number, x: number, b: number): [number, number] => { // (r + jx) in parallel with susceptance b
    const yr = r / (r * r + x * x), yi = -x / (r * r + x * x) + b, d = yr * yr + yi * yi;
    return [yr / d, -yi / d];
  };
  if (n.shuntAtLoad) { const [r, x] = par(R, X, n.B); return [r, x + n.X]; }
  return par(R, X + n.X, n.B);
}

/** A reactance or susceptance as a part value at frequency f (Hz). */
export function part(kind: "series" | "shunt", v: number, f: number): string {
  const w = 2 * Math.PI * f;
  const fmtL = (h: number) => (h >= 1e-6 ? `${(h * 1e6).toFixed(2)} µH` : `${(h * 1e9).toFixed(0)} nH`);
  const fmtC = (c: number) => (c >= 1e-9 ? `${(c * 1e9).toFixed(2)} nF` : `${(c * 1e12).toFixed(0)} pF`);
  if (kind === "series") return v >= 0 ? `series inductor ${fmtL(v / w)}` : `series capacitor ${fmtC(-1 / (w * v))}`;
  return v >= 0 ? `shunt capacitor ${fmtC(v / w)}` : `shunt inductor ${fmtL(-1 / (w * v))}`;
}
