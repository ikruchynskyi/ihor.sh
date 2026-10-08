// Drawing circuits on a course scene: wires with moving charges, resistors, batteries, meters, lamps.
import { C, label, line } from "../course/anim.ts";

export type Pt = [number, number];

/** Total length of a path, and the point at distance s along it (wrapping if closed). */
export function along(pts: Pt[], s: number, closed = true): Pt {
  const segs = closed ? [...pts, pts[0]] : pts;
  let total = 0; for (let i = 1; i < segs.length; i++) total += Math.hypot(segs[i][0] - segs[i - 1][0], segs[i][1] - segs[i - 1][1]);
  s = ((s % total) + total) % total;
  for (let i = 1; i < segs.length; i++) {
    const [ax, ay] = segs[i - 1], [bx, by] = segs[i], d = Math.hypot(bx - ax, by - ay);
    if (s <= d) return [ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d];
    s -= d;
  }
  return segs[segs.length - 1];
}
export function pathLength(pts: Pt[], closed = true) {
  const segs = closed ? [...pts, pts[0]] : pts;
  let total = 0; for (let i = 1; i < segs.length; i++) total += Math.hypot(segs[i][0] - segs[i - 1][0], segs[i][1] - segs[i - 1][1]);
  return total;
}

export function wire(g: CanvasRenderingContext2D, pts: Pt[], closed = true, color = C.axis, width = 3) {
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (closed) g.closePath();
  g.stroke();
}

/** Charges flowing along a path: `offset` grows with time × current, so the speed shows the current. */
export function charges(g: CanvasRenderingContext2D, pts: Pt[], offset: number, closed = true, color = C.blue, spacing = 22) {
  const L = pathLength(pts, closed);
  g.fillStyle = color;
  for (let s = 0; s < L; s += spacing) {
    const pos = closed ? s + offset : s + (((offset % spacing) + spacing) % spacing);
    if (!closed && pos > L) continue;
    const [x, y] = along(pts, pos, closed);
    g.beginPath(); g.arc(x, y, 3, 0, 2 * Math.PI); g.fill();
  }
}

/** A zigzag resistor between two points (the wire underneath should be covered first). */
export function resistor(g: CanvasRenderingContext2D, a: Pt, b: Pt, color = C.yellow, name = "") {
  const [ax, ay] = a, [bx, by] = b, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  g.strokeStyle = C.stage; g.lineWidth = 7; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  g.strokeStyle = color; g.lineWidth = 2.5; g.lineJoin = "miter"; g.beginPath(); g.moveTo(ax, ay);
  const n = 6;
  for (let i = 1; i < 2 * n; i++) { const s = (i / (2 * n)) * len, side = i % 2 ? 9 : -9; g.lineTo(ax + ux * s + nx * side, ay + uy * s + ny * side); }
  g.lineTo(bx, by); g.stroke();
  if (name) label(g, name, (ax + bx) / 2 + nx * 22, (ay + by) / 2 + ny * 22 + 4, color, "center", 12);
}

/** A battery across a vertical gap: long plate = +, short plate = −. */
export function battery(g: CanvasRenderingContext2D, x: number, y: number, text = "") {
  g.fillStyle = C.stage; g.fillRect(x - 20, y - 12, 40, 24);
  line(g, x - 18, y - 6, x + 18, y - 6, C.red, 3);
  line(g, x - 9, y + 6, x + 9, y + 6, C.text, 5);
  label(g, "+", x + 24, y - 2, C.red, "left", 13); label(g, "−", x + 24, y + 14, C.text, "left", 13);
  if (text) label(g, text, x - 26, y + 5, C.text, "right", 12);
}

/** A round meter face with a letter (V, A, Ω) and a reading. */
export function meter(g: CanvasRenderingContext2D, x: number, y: number, letter: string, reading: string, color = C.green, where: "below" | "right" = "below") {
  g.fillStyle = "#1e2530"; g.beginPath(); g.arc(x, y, 18, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = color; g.lineWidth = 2; g.stroke();
  label(g, letter, x, y + 5, color, "center", 14);
  if (reading) where === "right" ? label(g, reading, x + 26, y + 5, color, "left", 12) : label(g, reading, x, y + 36, color, "center", 12);
}

/** A lamp whose glow grows with power (0…1). */
export function lamp(g: CanvasRenderingContext2D, x: number, y: number, glow: number) {
  const r = 14 + 40 * glow, grad = g.createRadialGradient(x, y, 2, x, y, r);
  grad.addColorStop(0, `rgba(244, 211, 94, ${0.15 + 0.85 * glow})`); grad.addColorStop(1, "rgba(244, 211, 94, 0)");
  g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = C.text; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12, 0, 2 * Math.PI); g.stroke();
  line(g, x - 8, y - 8, x + 8, y + 8, C.text, 1.5); line(g, x - 8, y + 8, x + 8, y - 8, C.text, 1.5);
}

/** A capacitor symbol (two plates) centered between a and b. */
export function capacitor(g: CanvasRenderingContext2D, a: Pt, b: Pt, color = C.blue, name = "") {
  const [ax, ay] = a, [bx, by] = b, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, gap = 5, half = 13;
  g.strokeStyle = C.stage; g.lineWidth = 7; g.beginPath(); g.moveTo(mx - ux * gap, my - uy * gap); g.lineTo(mx + ux * gap, my + uy * gap); g.stroke();
  for (const sgn of [-1, 1]) line(g, mx + ux * gap * sgn - nx * half, my + uy * gap * sgn - ny * half, mx + ux * gap * sgn + nx * half, my + uy * gap * sgn + ny * half, color, 3);
  if (name) label(g, name, mx + nx * 26, my + ny * 26 + 4, color, "center", 12);
}

/** An inductor symbol (a row of bumps) between a and b. */
export function inductor(g: CanvasRenderingContext2D, a: Pt, b: Pt, color = C.pink, name = "") {
  const [ax, ay] = a, [bx, by] = b, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  g.strokeStyle = C.stage; g.lineWidth = 7; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  const n = 4, r = len / (2 * n), ang = Math.atan2(uy, ux);
  g.strokeStyle = color; g.lineWidth = 2.5;
  for (let i = 0; i < n; i++) { const cx = ax + ux * r * (2 * i + 1), cy = ay + uy * r * (2 * i + 1); g.beginPath(); g.arc(cx, cy, r, ang + Math.PI, ang, false); g.stroke(); }
  if (name) label(g, name, (ax + bx) / 2 - nx * 22, (ay + by) / 2 - ny * 22 + 4, color, "center", 12);
}

/** A ground symbol hanging below (x, y). */
export function ground(g: CanvasRenderingContext2D, x: number, y: number) {
  line(g, x - 10, y, x + 10, y, C.muted, 2); line(g, x - 6, y + 4, x + 6, y + 4, C.muted, 2); line(g, x - 2, y + 8, x + 2, y + 8, C.muted, 2);
}
