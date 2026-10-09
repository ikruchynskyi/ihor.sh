// Chapter 1: spinning arrows. Every scene is the same idea seen from a new angle.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label, curve } from "./anim.ts";

const el = (id: string) => document.getElementById(id)!;
const PPS = 80; // trace speed: pixels per second

interface WheelOpts {
  theta: (τ: number) => number; // the arrow's angle at time τ (radians, counter-clockwise)
  amp?: number; // arrow length as a fraction of the wheel
  yellow?: boolean; // trace the height (sine) to the right
  green?: boolean; // trace the sideways position (cosine) downward
  hide?: boolean; // cover the wheel (for the guessing game)
}

/** A spinning arrow on the left; its shadows traced as it turns. Old values flow away from the wheel. */
function wheel(g: CanvasRenderingContext2D, w: number, h: number, t: number, o: WheelOpts) {
  const amp = o.amp ?? 1, yellow = o.yellow ?? true;
  const R = o.green ? Math.min(w * 0.15, h * 0.24) : Math.min(w * 0.17, h * 0.38);
  const cx = R + 28, cy = o.green ? R + 22 : h / 2, r = R * amp;
  const θ = o.theta(t), x = cx + r * Math.cos(θ), y = cy - r * Math.sin(θ);

  circle(g, cx, cy, R, C.grid);
  line(g, cx - R - 10, cy, cx + R + 10, cy, C.grid, 1);
  line(g, cx, cy - R - 10, cx, cy + R + 10, C.grid, 1);
  if (o.hide) {
    g.fillStyle = "#232833"; g.beginPath(); g.arc(cx, cy, R + 12, 0, TAU); g.fill();
    label(g, "?", cx, cy + 12, C.text, "center", 34);
  } else {
    circle(g, cx, cy, r, "#33405a");
    arrow(g, cx, cy, x, y, C.blue);
  }

  if (yellow) {
    const x0 = cx + R + 40, box = { x: x0, y: cy - R, w: w - x0 - 12, h: 2 * R };
    line(g, x0, cy, w - 12, cy, C.grid, 1);
    if (!o.hide) { dot(g, x, y, C.yellow); line(g, x, y, x0, y, C.yellow, 1, [4, 4]); }
    // τ runs from now (at x0) back into the past (to the right)
    curve(g, (τ) => amp * Math.sin(o.theta(τ)), t, t - box.w / PPS, box, R, C.yellow);
    dot(g, x0, cy - amp * R * Math.sin(θ), C.yellow, 4);
  }
  if (o.green) {
    const y0 = cy + R + 26, len = h - y0 - 10;
    line(g, cx, y0, cx, h - 10, C.grid, 1);
    if (!o.hide) { dot(g, x, y, C.green, 4); line(g, x, y, x, y0, C.green, 1, [4, 4]); }
    g.strokeStyle = C.green; g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= len; i++) {
      const τ = t - i / PPS, gx = cx + amp * R * Math.cos(o.theta(τ));
      i ? g.lineTo(gx, y0 + i) : g.moveTo(gx, y0);
    }
    g.stroke();
    dot(g, cx + amp * R * Math.cos(θ), y0, C.green, 4);
  }
}

// --- Hook: four arrows chained tip to tail draw a square-ish wave ----------------------------
{
  new Scene(el("s-hook"), (g, w, h, t) => {
    const R = Math.min(w * 0.13, h * 0.3), cx = R + 40, cy = h / 2, f = 0.18;
    let x = cx, y = cy;
    for (const n of [1, 3, 5, 7]) {
      const r = (R * 4) / (Math.PI * n) * 0.8, θ = TAU * f * n * t;
      circle(g, x, y, r, "#2c3442", 1);
      const nx = x + r * Math.cos(θ), ny = y - r * Math.sin(θ);
      arrow(g, x, y, nx, ny, C.blue, n === 1 ? 3 : 2);
      x = nx; y = ny;
    }
    const x0 = cx + R * 1.45, box = { x: x0, y: cy - R, w: w - x0 - 12, h: 2 * R };
    line(g, x, y, x0, y, C.yellow, 1, [4, 4]);
    dot(g, x, y, C.yellow);
    const height = (τ: number) => [1, 3, 5, 7].reduce((s, n) => s + (4 / (Math.PI * n)) * 0.8 * Math.sin(TAU * f * n * τ), 0);
    curve(g, height, t, t - box.w / PPS, box, R, C.yellow);
  }, 240);
}

// --- 1. A dot on a wheel draws a wave ------------------------------------------------------
{
  const s = new Scene(el("s-wheel"), (g, w, h, t) => {
    const f = val("w-f"), amp = val("w-a"), φ = (val("w-p") * TAU) / 360;
    wheel(g, w, h, t, { theta: (τ) => TAU * f * τ + φ, amp });
    label(g, `${(f * t).toFixed(1)} turns`, 12, h - 12);
  });
  controls(s, ["w-f", "w-a", "w-p"], () => {
    el("w-fo").textContent = `${val("w-f")} turns/s`;
    el("w-ao").textContent = `${val("w-a")}`;
    el("w-po").textContent = `${val("w-p")}°`;
  });
}

// --- 2. Two shadows ------------------------------------------------------------------------
{
  new Scene(el("s-shadows"), (g, w, h, t) => {
    wheel(g, w, h, t, { theta: (τ) => TAU * 0.25 * τ, green: true });
    label(g, "height → sine", w - 12, 24, C.yellow, "right");
    label(g, "↓ sideways → cosine", w * 0.4, h - 14, C.green);
  }, 380);
}

// --- 3. The game: which way is it spinning? ------------------------------------------------
{
  let dir = Math.random() < 0.5 ? 1 : -1, reveal = false, right = 0, tries = 0;
  const twoShadows = () => (el("g-two") as HTMLInputElement).checked;
  const s = new Scene(el("s-game"), (g, w, h, t) => {
    wheel(g, w, h, t, { theta: (τ) => dir * TAU * 0.3 * τ, green: true, yellow: twoShadows(), hide: !reveal });
  }, 380);
  const result = el("g-result");
  const guess = (d: number) => {
    tries++; if (d === dir) right++;
    reveal = true;
    result.textContent = (d === dir ? "Right! " : "Not this time. ") + (twoShadows()
      ? "With both shadows you can always tell: when green is at its peak, yellow rises next for counter-clockwise and falls next for clockwise."
      : "With only the green shadow, there's no way to know: both directions draw exactly the same green line. Turn on the second shadow and try again.");
    el("g-score").textContent = `${right} / ${tries} right`;
    s.redraw();
  };
  el("g-ccw").addEventListener("click", () => guess(1));
  el("g-cw").addEventListener("click", () => guess(-1));
  el("g-new").addEventListener("click", () => { dir = Math.random() < 0.5 ? 1 : -1; reveal = false; result.textContent = "New mystery wheel. Which way?"; s.t = 0; s.redraw(); });
  el("g-two").addEventListener("input", () => s.redraw());
}

// --- 4. Adding arrows ----------------------------------------------------------------------
{
  const s = new Scene(el("s-add"), (g, w, h, t) => {
    const f1 = 0.2, f2 = val("a-f") * f1, k = val("a-l");
    const R = Math.min(w * 0.12, h * 0.26), cx = R * (1 + k) + 30, cy = h / 2;
    const θ1 = TAU * f1 * t, θ2 = TAU * f2 * t;
    const x1 = cx + R * Math.cos(θ1), y1 = cy - R * Math.sin(θ1);
    const x2 = x1 + R * k * Math.cos(θ2), y2 = y1 - R * k * Math.sin(θ2);
    circle(g, cx, cy, R, C.grid); circle(g, x1, y1, R * k, "#2c3442", 1);
    arrow(g, cx, cy, x1, y1, C.blue); if (k > 0.01) arrow(g, x1, y1, x2, y2, C.pink, 2.5);
    const x0 = cx + R * (1 + k) + 30, box = { x: x0, y: cy - R, w: w - x0 - 12, h: 2 * R };
    line(g, x2, y2, x0, y2, C.yellow, 1, [4, 4]); dot(g, x2, y2, C.yellow);
    curve(g, (τ) => Math.sin(TAU * f1 * τ), t, t - box.w / PPS, box, R, "#3a5a66", 1.5);
    curve(g, (τ) => Math.sin(TAU * f1 * τ) + k * Math.sin(TAU * f2 * τ), t, t - box.w / PPS, box, R, C.yellow);
    label(g, "faint: the first arrow alone", w - 12, h - 10, C.muted, "right");
  });
  controls(s, ["a-f", "a-l"], () => { el("a-fo").textContent = `${val("a-f")}× as fast`; el("a-lo").textContent = `${val("a-l")}`; });
}

// --- 5. Radio: the music is in the wobble of the speed ------------------------------------
{
  const s = new Scene(el("s-fm"), (g, w, h, t) => {
    const f0 = 0.6, fm = 0.2, dev = val("fm-d");
    // speed(τ) = f0 + dev·sin(2π·fm·τ); the angle is its running total (the integral)
    const theta = (τ: number) => TAU * f0 * τ - (dev / fm) * Math.cos(TAU * fm * τ);
    wheel(g, w, h * 0.7, t, { theta });
    // the music: the speed itself, drawn underneath
    const R = Math.min(w * 0.17, h * 0.7 * 0.38), x0 = R * 2 + 68, box = { x: x0, y: h * 0.72, w: w - x0 - 12, h: h * 0.24 };
    line(g, x0, box.y + box.h / 2, w - 12, box.y + box.h / 2, C.grid, 1);
    curve(g, (τ) => (dev ? Math.sin(TAU * fm * τ) : 0), t, t - box.w / PPS, box, box.h * 0.42, C.pink);
    label(g, "spin speed (the music)", 12, box.y + box.h / 2 + 4, C.pink);
  }, 330);
  controls(s, ["fm-d"], () => { el("fm-do").textContent = `${val("fm-d")}`; });
}
