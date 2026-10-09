// A Smith chart grid on a course scene: resistance circles, reactance arcs, axes and labels. Γ maps to (cx + Γr·R0, cy − Γi·R0).
import { C, circle, label, line } from "../course/anim.ts";

export function smithGrid(g: CanvasRenderingContext2D, cx: number, cy: number, R0: number, z0Label = "50 Ω") {
  g.save(); g.beginPath(); g.arc(cx, cy, R0, 0, 2 * Math.PI); g.clip();
  for (const r of [0.2, 0.5, 1, 2, 5]) circle(g, cx + (r / (1 + r)) * R0, cy, R0 / (1 + r), "#2f3846", 1);
  for (const x of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) circle(g, cx + R0, cy - (sg / x) * R0, R0 / x, sg > 0 ? "#3a2f3c" : "#2a3540", 1);
  g.restore();
  circle(g, cx, cy, R0, C.axis, 2); line(g, cx - R0, cy, cx + R0, cy, C.axis, 1.5);
  label(g, "0", cx - R0 + 4, cy - 4, C.muted, "left", 9); label(g, "∞", cx + R0 - 10, cy - 4, C.muted, "left", 9); label(g, z0Label, cx + 4, cy - 4, C.muted, "left", 9);
  label(g, "+j (inductive)", cx, cy - R0 - 6, C.pink, "center", 10); label(g, "−j (capacitive)", cx, cy + R0 + 16, C.blue, "center", 10);
}

/** Reflection coefficient of an impedance r + jx on a z0 system. */
export function gammaOf(r: number, x: number, z0 = 50): [number, number] {
  const nr = r - z0, dr = r + z0, d = dr * dr + x * x;
  return [(nr * dr + x * x) / d, (x * dr - nr * x) / d];
}
