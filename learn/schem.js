// Schematic drawing kit for the electronics course: parts on a canvas, and current shown as dots moving along
// the wires at a speed proportional to the current the solver found in that branch (conventional current, + to −).

export const C = { stage: "#14171d", wire: "#8f98a8", text: "#d7dde5", blue: "#58c4dd", yellow: "#f4d35e", green: "#83c167", red: "#fc6255", dim: "#4a5262" };

/** Animate a scene: draw(g, W, H) paints the parts; flows() lists { pts: [[x, y]…], amps } paths for the moving dots. */
export function scene(canvas, draw, flows) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, offsets = new Map();
  let last = performance.now(), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.fillStyle = C.stage; g.fillRect(0, 0, W, H);
    for (const [k, f] of flows().entries()) {
      wire(g, f.pts);
      const len = pathLength(f.pts), speed = Math.sign(f.amps) * Math.min(400, Math.sqrt(Math.abs(f.amps) * 1000) * 40); // px/s, √ so small currents still visibly move
      const off = still ? 0 : ((offsets.get(k) ?? 0) + speed * dt + len) % 24;
      offsets.set(k, off);
      if (Math.abs(f.amps) > 1e-7) { g.fillStyle = C.yellow; for (let d = off; d < len; d += 24) { const [x, y] = pointAt(f.pts, d); g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); } }
    }
    draw(g, W, H);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= seg) return [a[0] + ((b[0] - a[0]) * d) / seg, a[1] + ((b[1] - a[1]) * d) / seg];
    d -= seg;
  }
  return pts.at(-1);
}
export function wire(g, pts, color = C.wire) { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
const clear = (g, x, y, w, h) => { g.fillStyle = C.stage; g.fillRect(x, y, w, h); };

/** A battery standing vertically at (x, y), + on top. */
export function battery(g, x, y, label) {
  clear(g, x - 26, y - 22, 52, 44);
  g.strokeStyle = C.text; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x - 24, y - 8); g.lineTo(x + 24, y - 8); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(x - 12, y + 8); g.lineTo(x + 12, y + 8); g.stroke();
  g.fillStyle = C.text; g.font = "15px ui-monospace, monospace"; g.fillText("+", x + 28, y - 4); g.fillText(label, x + 30, y + 16);
}
/** A resistor (zigzag) between two points on a horizontal or vertical wire; glow 0…1 tints it hot. */
export function resistor(g, [x1, y1], [x2, y2], label, glow = 0) {
  const vert = x1 === x2, mid = vert ? (y1 + y2) / 2 : (x1 + x2) / 2, half = 34;
  if (vert) clear(g, x1 - 14, mid - half, 28, half * 2); else clear(g, mid - half, y1 - 14, half * 2, 28);
  if (glow > 0) { g.fillStyle = `rgba(252,98,85,${Math.min(0.6, glow * 0.6)})`; g.beginPath(); g.arc(vert ? x1 : mid, vert ? mid : y1, 30, 0, 7); g.fill(); }
  g.strokeStyle = glow > 1 ? C.red : C.text; g.lineWidth = 3; g.beginPath();
  for (let k = 0; k <= 8; k++) { const t = -half + (k * half * 2) / 8, s = k === 0 || k === 8 ? 0 : k % 2 ? 10 : -10; vert ? (k ? g.lineTo(x1 + s, mid + t) : g.moveTo(x1 + s, mid + t)) : (k ? g.lineTo(mid + t, y1 + s) : g.moveTo(mid + t, y1 + s)); }
  g.stroke();
  g.fillStyle = C.text; g.font = "15px ui-monospace, monospace";
  vert ? g.fillText(label, x1 + 18, mid + 5) : g.fillText(label, mid - g.measureText(label).width / 2, y1 - 20);
}
/** An LED pointing down (anode on top) on a vertical wire at x; brightness 0…1; dead draws it burnt out. */
export function led(g, x, y, brightness, label, dead = false) {
  clear(g, x - 22, y - 22, 44, 44);
  if (!dead && brightness > 0.01) { const r = 22 + 40 * brightness; const grd = g.createRadialGradient(x, y, 2, x, y, r); grd.addColorStop(0, `rgba(255,70,60,${Math.min(1, 0.25 + brightness)})`); grd.addColorStop(1, "rgba(255,70,60,0)"); g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = dead ? "#3a3a3a" : brightness > 0.01 ? "#ff6b5e" : "#7a2a26"; g.strokeStyle = C.text; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(x - 14, y - 10); g.lineTo(x + 14, y - 10); g.lineTo(x, y + 12); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 14, y + 12); g.lineTo(x + 14, y + 12); g.stroke();
  g.fillStyle = C.text; g.font = "15px ui-monospace, monospace"; g.fillText(label, x + 22, y + 5);
  if (dead) { g.fillStyle = "rgba(180,180,180,.5)"; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - 6 + k * 7, y - 26 - k * 9 + Math.sin(performance.now() / 300 + k) * 3, 6 + k * 2, 0, 7); g.fill(); } }
}
/** A capacitor (two plates) on a vertical wire at x between y1 and y2; fill 0…1 shows how charged it is. */
export function capacitor(g, x, y1, y2, label, fill = 0) {
  const mid = (y1 + y2) / 2;
  clear(g, x - 30, mid - 14, 60, 28);
  g.fillStyle = `rgba(88,196,221,${0.15 + 0.6 * Math.max(0, Math.min(1, fill))})`; g.fillRect(x - 24, mid - 7, 48, 14);
  g.strokeStyle = C.text; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 26, mid - 8); g.lineTo(x + 26, mid - 8); g.moveTo(x - 26, mid + 8); g.lineTo(x + 26, mid + 8); g.stroke();
  g.fillStyle = C.text; g.font = "15px ui-monospace, monospace"; g.fillText(label, x + 34, mid + 5);
}
/** A switch on a horizontal wire from x1 to x2 at y: open, or closed. */
export function switchSym(g, x1, x2, y, closed, label = "") {
  clear(g, x1, y - 22, x2 - x1, 30);
  g.strokeStyle = C.text; g.lineWidth = 3; g.fillStyle = C.text;
  g.beginPath(); g.arc(x1 + 4, y, 4, 0, 7); g.arc(x2 - 4, y, 4, 0, 7); g.fill();
  g.beginPath(); g.moveTo(x1 + 4, y); g.lineTo(closed ? x2 - 4 : x2 - 10, closed ? y : y - 18); g.stroke();
  if (label) { g.font = "13px ui-monospace, monospace"; g.fillText(label, x1, y + 22); }
}
/** A small oscilloscope: traces [{ ys, color, label }] over a shared time axis, values in [lo, hi]. */
export function scope(g, x, y, w, h, traces, lo, hi, caption = "") {
  g.fillStyle = "#0b0d12"; g.fillRect(x, y, w, h);
  g.strokeStyle = "#232836"; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x, y + (h * k) / 4); g.lineTo(x + w, y + (h * k) / 4); g.stroke(); }
  for (const tr of traces) {
    g.strokeStyle = tr.color; g.lineWidth = 2.5; g.beginPath();
    tr.ys.forEach((v, i) => { const px = x + (i / Math.max(1, tr.ys.length - 1)) * w, py = y + h - ((v - lo) / (hi - lo)) * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
  }
  g.font = "13px ui-monospace, monospace";
  traces.forEach((tr, k) => { g.fillStyle = tr.color; g.fillText(tr.label, x + 8 + k * 150, y + 16); });
  if (caption) { g.fillStyle = "#8f98a8"; g.fillText(caption, x + 8, y + h - 8); }
}
/** A voltage label in a box at (x, y). */
export function tag(g, x, y, text, color = C.blue) { g.font = "14px ui-monospace, monospace"; const w = g.measureText(text).width + 10; g.fillStyle = "rgba(20,23,29,.85)"; g.fillRect(x - 4, y - 15, w, 21); g.strokeStyle = color; g.lineWidth = 1.5; g.strokeRect(x - 4, y - 15, w, 21); g.fillStyle = color; g.fillText(text, x + 1, y); }
export const fmtA = (a) => (Math.abs(a) >= 1 ? `${a.toFixed(2)} A` : Math.abs(a) >= 1e-3 ? `${(a * 1000).toFixed(1)} mA` : `${(a * 1e6).toFixed(0)} µA`);
export const fmtR = (r) => (r >= 1e6 ? `${(r / 1e6).toFixed(1)} MΩ` : r >= 1000 ? `${(r / 1000).toFixed(r >= 1e4 ? 0 : 1)} kΩ` : `${Math.round(r)} Ω`);
