// The AI world's drawing kit: a plane on a canvas, draggable points, grids and arrows (3Blue1Brown colors).
export const C = { stage: "#14171d", grid: "#2a2f3a", axis: "#4a5262", text: "#d7dde5", blue: "#58c4dd", yellow: "#f4d35e", green: "#83c167", red: "#fc6255", fill: "rgba(244,211,94,0.18)" };
const UNIT = 60;

/**
 * A canvas plane: draw(s) paints it, handles() lists draggable points ({ p: [x, y], color, fix? }), onChange runs after
 * each paint. Options: unit (px per unit, 60), origin ([px, py], the center), snap (round to quarters, true).
 * A handle's fix(p) can constrain where it goes, e.g. onto a curve. Returns render().
 */
export function scene(id, draw, handles, onChange, { unit = UNIT, origin, snap = true } = {}) {
  const cv = document.getElementById(id), g = cv.getContext("2d");
  const W = cv.width, H = cv.height, [ox, oy] = origin ?? [W / 2, H / 2];
  const toPx = ([x, y]) => [ox + x * unit, oy - y * unit], toW = (px, py) => [(px - ox) / unit, (oy - py) / unit];
  let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  cv.addEventListener("pointerdown", (e) => {
    const [px, py] = pos(e);
    drag = handles().find((h) => { const [hx, hy] = toPx(h.p); return Math.hypot(hx - px, hy - py) < 26; }) ?? null;
    if (drag) { cv.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y] = toW(...pos(e));
    drag.p[0] = snap ? Math.round(x * 4) / 4 : x; drag.p[1] = snap ? Math.round(y * 4) / 4 : y; // quarters: friendlier numbers
    drag.fix?.(drag.p);
    render();
  });
  cv.addEventListener("pointerup", () => { drag = null; });
  function render() {
    g.fillStyle = C.stage; g.fillRect(0, 0, W, H);
    draw({ g, W, H, toPx, toW, unit });
    for (const h of handles()) { const [x, y] = toPx(h.p); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = h.color; g.fill(); }
    onChange?.();
  }
  render();
  return render;
}

export function grid({ g, W, H, toPx }, m = [[1, 0], [0, 1]], bend = false, color = C.grid) {
  const f = ([x, y]) => { let p = [m[0][0] * x + m[0][1] * y, m[1][0] * x + m[1][1] * y]; if (bend) p = p.map((v) => Math.max(0, v)); return toPx(p); };
  g.strokeStyle = color; g.lineWidth = 1.5;
  for (let k = -12; k <= 12; k++) for (const [a, b] of [[[k, -12], [k, 12]], [[-12, k], [12, k]]]) {
    g.beginPath();
    for (let t = 0; t <= 48; t++) { const p = [a[0] + ((b[0] - a[0]) * t) / 48, a[1] + ((b[1] - a[1]) * t) / 48]; const [x, y] = f(p); t ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
}
export function axes({ g, W, H, toPx }) { const [x0, y0] = toPx([0, 0]); g.strokeStyle = C.axis; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.moveTo(x0, 0); g.lineTo(x0, H); g.stroke(); }
export function arrow({ g, toPx }, from, to, color, width = 4) {
  const [x1, y1] = toPx(from), [x2, y2] = toPx(to), a = Math.atan2(y2 - y1, x2 - x1);
  g.strokeStyle = g.fillStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  if (Math.hypot(x2 - x1, y2 - y1) > 6) { g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 14 * Math.cos(a - 0.4), y2 - 14 * Math.sin(a - 0.4)); g.lineTo(x2 - 14 * Math.cos(a + 0.4), y2 - 14 * Math.sin(a + 0.4)); g.fill(); }
}
export const fmt = (v) => (Number.isInteger(v) ? v : v.toFixed(2)).toString();
export const say = (text, mood = "happy") => dispatchEvent(new CustomEvent("blip:say", { detail: { text, mood } }));

