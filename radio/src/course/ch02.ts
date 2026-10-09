// Chapter 2: arrows as numbers. Every scene lives on the same "arrow plane".
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label, grid, toPx, type Plane, type Handle } from "./anim.ts";

const el = (id: string) => document.getElementById(id)!;
type Z = { x: number; y: number }; // an arrow: x = I (sideways), y = Q (up)
const mul = (a: Z, b: Z): Z => ({ x: a.x * b.x - a.y * b.y, y: a.x * b.y + a.y * b.x });
const len = (a: Z) => Math.hypot(a.x, a.y);
const deg = (a: Z) => ((Math.atan2(a.y, a.x) * 180) / Math.PI + 360) % 360;
const f2 = (v: number) => (Math.abs(v) < 0.005 ? "0.00" : v.toFixed(2));
const centered = (range: number) => (w: number, h: number): Plane => ({ cx: w / 2, cy: h / 2, unit: Math.min(w, h) / (2 * range) });

function arrowZ(g: CanvasRenderingContext2D, p: Plane, from: Z, to: Z, color: string, width = 3) {
  const [x1, y1] = toPx(p, from.x, from.y), [x2, y2] = toPx(p, to.x, to.y);
  if (Math.hypot(x2 - x1, y2 - y1) > 2) arrow(g, x1, y1, x2, y2, color, width);
}

/** An arc around 0 from angle a0 to a1 (radians, counter-clockwise positive). */
function arc(g: CanvasRenderingContext2D, p: Plane, r: number, a0: number, a1: number, color: string) {
  g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath();
  g.arc(p.cx, p.cy, r, -a0, -a1, a1 > a0); g.stroke();
}
const O: Z = { x: 0, y: 0 };
// With reduced motion, scenes that grow over time show their finished picture instead.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Hook: powers of one arrow curl into a spiral ---------------------------------------------
{
  const z: Handle = { x: 0.9, y: 0.42, color: C.blue }, plane = centered(1.7);
  new Scene(el("s-hook"), (g, w, h, t) => {
    const p = plane(w, h); grid(g, p, w, h);
    const n = still ? 44 : 1 + (Math.floor(t * 5) % 45);
    let cur: Z = { x: 1, y: 0 }, prev = cur;
    for (let k = 0; k <= n && len(cur) < 3; k++) {
      const [px, py] = toPx(p, cur.x, cur.y), [qx, qy] = toPx(p, prev.x, prev.y);
      line(g, qx, qy, px, py, "#3a4a5a", 1.2);
      dot(g, px, py, k === n ? C.yellow : C.blue, k === n ? 6 : 3.5);
      if (k > 0 && k < 4) label(g, ["1", "z", "z²", "z³"][k], px + 8, py - 8, C.text);
      prev = cur; cur = mul(cur, z);
    }
    arrowZ(g, p, O, z, C.blue, 2);
  }, 300, { handles: [z], plane, max: 1.6, label: "Powers of a draggable arrow z spiral around the center" });
}

// --- 1. An arrow is two numbers ---------------------------------------------------------------
{
  const a: Handle = { x: 0.8, y: 0.6, color: C.blue }, plane = centered(1.6);
  const out = () => {
    el("r-two").innerHTML = `<em class="g">I = ${f2(a.x)}</em> sideways · <em class="y">Q = ${f2(a.y)}</em> up` +
      ` · length ${f2(len(a))} · angle ${deg(a).toFixed(0)}°`;
  };
  new Scene(el("s-two"), (g, w, h) => {
    const p = plane(w, h); grid(g, p, w, h);
    const [tx, ty] = toPx(p, a.x, a.y), [ox, oy] = toPx(p, 0, 0);
    line(g, ox, oy, tx, oy, C.green, 5); line(g, ox, oy, ox, ty, C.yellow, 5);
    line(g, tx, ty, tx, oy, C.green, 1, [4, 4]); line(g, tx, ty, ox, ty, C.yellow, 1, [4, 4]);
    arrowZ(g, p, O, a, C.blue);
  }, 300, { animated: false, handles: [a], plane, max: 1.5, onDrag: out, label: "A draggable arrow with its sideways (I) and upward (Q) parts" });
  out();
}

// --- 2. Adding: tip to tail -----------------------------------------------------------------------
{
  const a: Handle = { x: 1, y: 0.3, color: C.blue }, b: Handle = { x: -0.3, y: 0.8, color: C.pink }, plane = centered(1.75);
  const out = () => {
    const s = { x: a.x + b.x, y: a.y + b.y };
    el("r-add").innerHTML = `<em class="b">a = (${f2(a.x)}, ${f2(a.y)})</em> + <em class="p">b = (${f2(b.x)}, ${f2(b.y)})</em>` +
      ` = <em class="y">(${f2(s.x)}, ${f2(s.y)})</em>: the I's add up, and so do the Q's.`;
  };
  new Scene(el("s-add"), (g, w, h) => {
    const p = plane(w, h); grid(g, p, w, h, false);
    const s = { x: a.x + b.x, y: a.y + b.y };
    g.globalAlpha = 0.35; arrowZ(g, p, O, b, C.pink, 2); g.globalAlpha = 1;
    arrowZ(g, p, O, a, C.blue);
    arrowZ(g, p, a, s, C.pink);
    arrowZ(g, p, O, s, C.yellow, 2.5);
  }, 340, { animated: false, handles: [a, b], plane, max: 1.6, onDrag: out, label: "Two draggable arrows and their sum, drawn tip to tail" });
  out();
}

// --- 3. Multiplying: lengths multiply, angles add --------------------------------------------
{
  const a: Handle = { x: 0.9, y: 0.35, color: C.blue }, b: Handle = { x: 0.6, y: 0.8, color: C.pink }, plane = centered(1.8);
  const out = () => {
    const m = mul(a, b);
    el("r-mul").innerHTML =
      `length: <em class="b">${f2(len(a))}</em> × <em class="p">${f2(len(b))}</em> = <em class="y">${f2(len(m))}</em>` +
      ` · angle: <em class="b">${deg(a).toFixed(0)}°</em> + <em class="p">${deg(b).toFixed(0)}°</em> = <em class="y">${deg(m).toFixed(0)}°</em>`;
  };
  new Scene(el("s-mul"), (g, w, h) => {
    const p = plane(w, h); grid(g, p, w, h);
    const m = mul(a, b), aa = Math.atan2(a.y, a.x), ab = Math.atan2(b.y, b.x);
    arc(g, p, p.unit * 0.28, 0, aa, C.blue);
    arc(g, p, p.unit * 0.4, aa, aa + ab, C.pink);
    arrowZ(g, p, O, a, C.blue); arrowZ(g, p, O, b, C.pink);
    arrowZ(g, p, O, m, C.yellow, 3.5);
  }, 380, { animated: false, handles: [a, b], plane, max: 1.7, onDrag: out, label: "Two draggable arrows and their product; the product's angle is the sum of their angles" });
  out();
}

// --- 4. Game: hit the target by multiplying --------------------------------------------------
{
  const plane = centered(2.3);
  const m: Handle = { x: 1, y: 0, color: C.pink };
  let s: Z = { x: 1, y: 0 }, T: Z = { x: 1, y: 0 }, hits = 0, done = false;
  const polar = (r: number, a: number): Z => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
  const round = () => {
    s = polar(0.8 + Math.random() * 0.5, Math.random() * TAU);
    T = polar(0.6 + Math.random() * 1.0, Math.random() * TAU);
    m.x = 1; m.y = 0; done = false;
    el("r-game").textContent = "Drag the pink multiplier until the yellow product lands in the ring.";
  };
  const out = () => {
    const pr = mul(s, m), off = Math.hypot(pr.x - T.x, pr.y - T.y);
    if (!done && off < 0.09) { done = true; hits++; el("r-game").textContent = `Hit! Your multiplier turned by ${deg(m).toFixed(0)}° and stretched ×${f2(len(m))}.`; }
    el("g2-score").textContent = `${hits} hit${hits === 1 ? "" : "s"}`;
    const turn = (deg(T) - deg(s) + 360) % 360, stretch = len(T) / len(s);
    el("r-hint").textContent = (el("g2-hint") as HTMLInputElement).checked
      ? `Needed: turn ${turn.toFixed(0)}° and stretch ×${f2(stretch)}. Yours: turn ${deg(m).toFixed(0)}°, stretch ×${f2(len(m))}.` : "";
  };
  const sc = new Scene(el("s-game"), (g, w, h) => {
    const p = plane(w, h); grid(g, p, w, h);
    const [tx, ty] = toPx(p, T.x, T.y);
    circle(g, tx, ty, p.unit * 0.09, done ? C.green : C.white, 2);
    arrowZ(g, p, O, s, C.blue); arrowZ(g, p, O, m, C.pink, 2.5); arrowZ(g, p, O, mul(s, m), C.yellow, 3.5);
  }, 420, { animated: false, handles: [m], plane, max: 2.2, onDrag: out, label: "Game: drag a multiplier so the product of the blue arrow and it lands on the target ring" });
  el("g2-new").addEventListener("click", () => { round(); out(); sc.redraw(); });
  el("g2-hint").addEventListener("input", out);
  round(); out(); sc.redraw();
}

// --- 5. Multiply again and again: spinning -------------------------------------------------------
{
  const s = new Scene(el("s-spin"), (g, w, h, t) => {
    const a = (val("sp-a") * Math.PI) / 180, r = val("sp-r"), step: Z = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const side = Math.min(h, w * 0.45), p: Plane = { cx: side / 2, cy: h / 2, unit: side / 3.4 };
    grid(g, p, side, h);
    const n = still ? 79 : Math.floor(t * 6) % 80, qs: number[] = [];
    let z: Z = { x: 1, y: 0 };
    for (let k = 0; k <= n && len(z) < 2.6; k++) {
      const [px, py] = toPx(p, z.x, z.y);
      dot(g, px, py, k === n ? C.yellow : "#3f6f80", k === n ? 5 : 3);
      qs.push(z.y);
      if (k === n) arrowZ(g, p, O, z, C.blue);
      z = mul(z, step);
    }
    // the upward part (Q) of every snapshot, one after another: chapter 1's sine, in dots
    const x0 = side + 24, gw = w - x0 - 12, cy = h / 2, sc = h * 0.22;
    line(g, x0, cy, w - 12, cy, C.grid, 1);
    qs.forEach((q, k) => { const x = x0 + (k / 80) * gw; line(g, x, cy, x, cy - q * sc, "#6b5a1e", 1.5); dot(g, x, cy - q * sc, C.yellow, 3); });
    label(g, "up part (Q) of each step →", x0, 18, C.yellow);
  }, 300, { label: "An arrow multiplied by the same small arrow again and again; its upward part traced as dots" });
  controls(s, ["sp-a", "sp-r"], () => { el("sp-ao").textContent = `${val("sp-a")}°`; el("sp-ro").textContent = `×${val("sp-r").toFixed(2)}`; });
}

// --- 6. The arrow at angle θ, from many tiny turns --------------------------------------------
{
  const plane = centered(1.65);
  const s = new Scene(el("s-euler"), (g, w, h) => {
    const θ = val("eu-t"), n = val("eu-n"), p = plane(w, h);
    grid(g, p, w, h);
    arc(g, p, p.unit, 0, θ, "#2f6f86");
    const [gx, gy] = toPx(p, Math.cos(θ), Math.sin(θ));
    circle(g, gx, gy, 8, C.blue, 2);
    const step: Z = { x: 1, y: θ / n };
    let z: Z = { x: 1, y: 0 };
    for (let k = 0; k < n; k++) { const nz = mul(z, step); arrowZ(g, p, z, nz, C.pink, n > 20 ? 1.5 : 2.5); z = nz; }
    const [zx, zy] = toPx(p, z.x, z.y);
    dot(g, zx, zy, C.yellow, 6);
    const zl = len(z), za = Math.atan2(z.y, z.x);
    el("r-euler").innerHTML = `${n} step${n > 1 ? "s" : ""} of “turn sideways by θ/${n}”: <em class="y">length ${f2(zl)}, angle ${((za * 180) / Math.PI).toFixed(1)}°</em>` +
      ` · the arrow at angle θ: <em class="b">length 1.00, angle ${((Math.atan2(Math.sin(θ), Math.cos(θ)) * 180) / Math.PI).toFixed(1)}°</em>`;
  }, 380, { animated: false, label: "Many small sideways steps curl onto the circle at angle theta" });
  controls(s, ["eu-t", "eu-n"], () => { el("eu-to").textContent = `${val("eu-t").toFixed(2)} (${((val("eu-t") * 180) / Math.PI).toFixed(0)}°)`; el("eu-no").textContent = `${val("eu-n")}`; });
}
