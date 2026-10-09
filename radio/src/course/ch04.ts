// Chapter 4: the winding machine. Finding the arrows hidden inside a signal (the Fourier transform).
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label } from "./anim.ts";
import { captureBytes, CAPTURE } from "./data/capture.ts";
import { avgSpectrum } from "../dsp.ts";
import { spectrumOf, Waterfall } from "../waterfall.ts";
import { lab } from "./lab.ts";
import { spectrum } from "./plots.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
type Part = { f: number; a: number; p: number }; // speed (turns/s), length, starting angle (turns)

// The mystery signal used through the chapter: three hidden arrows.
const MYSTERY: Part[] = [{ f: 2, a: 1, p: 0 }, { f: -3, a: 0.55, p: 0.2 }, { f: 7, a: 0.35, p: 0.6 }];
const N = 400; // samples in one second of signal

/** x(t) as an arrow (I, Q). */
const at = (parts: Part[], t: number): [number, number] => {
  let x = 0, y = 0;
  for (const s of parts) { const a = TAU * (s.f * t + s.p); x += s.a * Math.cos(a); y += s.a * Math.sin(a); }
  return [x, y];
};

/** The winding machine: un-spin by g turns/s, return the center of mass of all samples. */
function wind(parts: Part[], g: number, n = N, window = false): [number, number] {
  let sx = 0, sy = 0, ws = 0;
  for (let k = 0; k < n; k++) {
    const t = k / n, [x, y] = at(parts, t), c = Math.cos(-TAU * g * t), s = Math.sin(-TAU * g * t);
    const w = window ? 0.5 - 0.5 * Math.cos((TAU * k) / n) : 1;
    sx += w * (x * c - y * s); sy += w * (x * s + y * c); ws += w;
  }
  return [sx / ws, sy / ws];
}

// --- Hook: a tangled signal -------------------------------------------------------------------
{
  new Scene(el("s-hook"), (g, w, h, t) => {
    const sc = Math.min(h, w) * 0.24, cx = w / 2, cy = h / 2;
    const T = still ? 1 : (t * 0.25) % 1.2; // draw one second of the path, slowly
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 600 * Math.min(T, 1); i++) { const [x, y] = at(MYSTERY, i / 600); i ? g.lineTo(cx + x * sc, cy - y * sc) : g.moveTo(cx + x * sc, cy - y * sc); }
    g.stroke();
    // the hidden arrows, chained, drawing the tip
    let x = 0, y = 0;
    for (const s of MYSTERY) {
      const a = TAU * (s.f * Math.min(T, 1) + s.p), nx = x + s.a * Math.cos(a), ny = y + s.a * Math.sin(a);
      g.globalAlpha = 0.55; arrow(g, cx + x * sc, cy - y * sc, cx + nx * sc, cy - ny * sc, C.blue, 2); g.globalAlpha = 1;
      x = nx; y = ny;
    }
    dot(g, cx + x * sc, cy - y * sc, C.white, 5);
  }, 320, { label: "A tangled path traced by the tip of three hidden spinning arrows" });
}

// --- 1. Un-spinning one arrow --------------------------------------------------------------------
{
  const s = new Scene(el("s-unspin"), (g, w, h, t) => {
    const gs = val("us-g"), panel = w / 3, R = Math.min(panel * 0.3, h * 0.32), cy = h / 2 - 8;
    const items: [string, number, string][] = [["signal: 3 turns/s", 3, C.blue], [`× un-spin by ${gs}`, -gs, C.pink], [`= ${(3 - gs).toFixed(1)} turns/s`, 3 - gs, C.yellow]];
    items.forEach(([name, f, col], i) => {
      const cx = panel * (i + 0.5), a = TAU * f * t * 0.25;
      circle(g, cx, cy, R, C.grid);
      arrow(g, cx, cy, cx + R * Math.cos(a), cy - R * Math.sin(a), col, 3);
      label(g, name, cx, h - 12, col, "center", 13);
    });
    label(g, "×", panel, cy + 6, C.text, "center", 22); label(g, "=", panel * 2, cy + 6, C.text, "center", 22);
  }, 240, { label: "A spinning arrow multiplied by a counter-spinning arrow; the result spins at the difference" });
  controls(s, ["us-g"], () => {
    const gs = val("us-g");
    el("us-go").textContent = `${gs} turns/s`;
    el("r-unspin").innerHTML = Math.abs(3 - gs) < 1e-9 ? `<em class="y">The result stands still.</em> The un-spin exactly cancels the signal's spin.` : `The result still spins, at 3 − ${gs} = <em class="y">${(3 - gs).toFixed(1)}</em> turns/s.`;
  });
}

// --- 2. The winding machine ----------------------------------------------------------------------
{
  const G0 = -9, G1 = 9, steps = 720;
  const curve = Array.from({ length: steps + 1 }, (_, i) => { const [x, y] = wind(MYSTERY, G0 + ((G1 - G0) * i) / steps); return Math.hypot(x, y); });
  const gIn = el("wm-g") as HTMLInputElement;
  const s = new Scene(el("s-wind"), (g, w, h, t) => {
    const auto = (el("wm-auto") as HTMLInputElement).checked && !still;
    if (auto) gIn.value = (G0 + ((t * 1.2) % (G1 - G0))).toFixed(2);
    const gs = parseFloat(gIn.value);
    el("wm-go").textContent = `${gs.toFixed(2)} turns/s`;
    // left: every sample, un-spun, joined in order; and their center of mass
    const side = Math.min(h, w * 0.46), cx = side / 2, cy = h / 2, sc = side * 0.24;
    circle(g, cx, cy, sc, C.grid); line(g, cx - side / 2 + 8, cy, cx + side / 2 - 8, cy, C.grid, 1); line(g, cx, 8, cx, h - 8, C.grid, 1);
    g.strokeStyle = "rgba(88,196,221,0.75)"; g.lineWidth = 1.2; g.beginPath();
    for (let k = 0; k <= N; k++) {
      const tt = k / N, [x, y] = at(MYSTERY, tt), c = Math.cos(-TAU * gs * tt), sn = Math.sin(-TAU * gs * tt);
      const ux = x * c - y * sn, uy = x * sn + y * c;
      k ? g.lineTo(cx + ux * sc, cy - uy * sc) : g.moveTo(cx + ux * sc, cy - uy * sc);
    }
    g.stroke();
    const [mx, my] = wind(MYSTERY, gs), m = Math.hypot(mx, my);
    line(g, cx, cy, cx + mx * sc, cy - my * sc, C.yellow, 2.5);
    dot(g, cx + mx * sc, cy - my * sc, C.yellow, 7);
    label(g, "center of mass", cx + mx * sc + 10, cy - my * sc - 10, C.yellow, "left", 12);
    // right: distance of the center of mass from 0, for every test speed
    const L = side + 30, B = h - 28, T = 14, R = w - 12;
    const px = (v: number) => L + ((v - G0) / (G1 - G0)) * (R - L), py = (v: number) => B - (v / 1.1) * (B - T);
    line(g, L, B, R, B, C.axis, 1); line(g, px(0), T, px(0), B, C.grid, 1);
    for (const v of [-8, -4, 0, 4, 8]) label(g, String(v), px(v), B + 16, C.muted, "center", 11);
    g.strokeStyle = C.muted; g.lineWidth = 1.5; g.beginPath();
    curve.forEach((v, i) => (i ? g.lineTo(px(G0 + ((G1 - G0) * i) / steps), py(v)) : g.moveTo(px(G0), py(v))));
    g.stroke();
    line(g, px(gs), B, px(gs), py(m), C.yellow, 2); dot(g, px(gs), py(m), C.yellow, 6);
    label(g, "test speed (turns/s) →", R, T + 4, C.muted, "right", 11);
  }, 340, { label: "The winding machine: samples un-spun by a test speed, their center of mass, and a graph of its distance from zero" });
  controls(s, ["wm-g", "wm-auto"]);
}

// --- 3. In-between speeds, smeared peaks, and windows -----------------------------------------------
{
  const NB = 32; // the FFT's test speeds: whole numbers of turns per block
  const s = new Scene(el("s-leak"), (g, w, h) => {
    const sp = val("lk-s"), win = (el("lk-w") as HTMLInputElement).checked;
    const parts = [{ f: sp, a: 1, p: 0.1 }];
    const L = 40, R = w - 12, T = 14, B = h - 30, G0 = -6, G1 = 12;
    const px = (v: number) => L + ((v - G0) / (G1 - G0)) * (R - L), py = (db: number) => T + ((0 - Math.max(-70, db)) / 70) * (B - T);
    for (const db of [0, -20, -40, -60]) { line(g, L, py(db), R, py(db), C.grid, 1); label(g, `${db} dB`, L - 4, py(db) + 4, C.muted, "right", 10); }
    for (let v = G0; v <= G1; v += 2) label(g, String(v), px(v), B + 16, C.muted, "center", 11);
    const dbOf = (gg: number) => { const [x, y] = wind(parts, gg, NB, win); return 20 * Math.log10(Math.hypot(x, y) + 1e-9); };
    g.strokeStyle = C.muted; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i <= 600; i++) { const gg = G0 + ((G1 - G0) * i) / 600; i ? g.lineTo(px(gg), py(dbOf(gg))) : g.moveTo(px(gg), py(dbOf(gg))); }
    g.stroke();
    for (let k = G0; k <= G1; k++) { const d = dbOf(k); line(g, px(k), B, px(k), py(d), C.yellow, 2); dot(g, px(k), py(d), C.yellow, 4); }
    line(g, px(sp), T, px(sp), B, C.blue, 1.5, [4, 4]);
    label(g, "true speed", px(sp) + 4, T + 10, C.blue, "left", 11);
  }, 300, { animated: false, label: "Strength found at each whole-number test speed, for a signal whose speed may fall between them" });
  controls(s, ["lk-s", "lk-w"], () => { el("lk-so").textContent = `${val("lk-s").toFixed(2)} turns/s`; });
}

// --- 4. How much work: the plain machine vs the FFT --------------------------------------------------
{
  const s = new Scene(el("s-cost"), (g, w, h) => {
    const p = val("co-n"), n = 2 ** p, slow = n * n, fast = n * p;
    const L = 12, R = w - 12, maxLog = Math.log10(2 ** 32);
    const bar = (y: number, v: number, col: string, name: string) => {
      const bw = (Math.log10(v) / maxLog) * (R - L);
      g.fillStyle = col; g.fillRect(L, y, Math.max(2, bw), 26);
      label(g, `${name}: ${v.toLocaleString("en-US")} steps`, L, y - 6, C.text, "left", 12);
    };
    bar(30, slow, C.red, "winding machine at every speed (N × N)");
    bar(98, fast, C.green, "FFT (N × log₂N)");
    label(g, "bar lengths on a log scale", R, h - 8, C.muted, "right", 11);
    // butterfly diagram for N = 8
    const bx = w * 0.55, by = 150, bw2 = (w - bx - 16) / 3, rowH = (h - by - 20) / 8;
    if (bw2 > 30) {
      const order = [0, 4, 2, 6, 1, 5, 3, 7];
      for (let r = 0; r < 8; r++) label(g, `x${order[r]}`, bx - 6, by + r * rowH + 4, C.muted, "right", 10);
      for (let st = 0; st < 3; st++) {
        const span = 1 << st, x0 = bx + st * bw2, x1 = x0 + bw2;
        for (let r = 0; r < 8; r++) {
          const partner = (r % (2 * span)) < span ? r + span : r - span;
          line(g, x0, by + r * rowH, x1, by + r * rowH, "#3a4252", 1);
          line(g, x0, by + r * rowH, x1, by + partner * rowH, st === 2 ? C.green : "#4a6a54", 1.2);
        }
      }
      label(g, "N = 8: three layers of crossings", bx, by - 12, C.green, "left", 11);
    }
  }, 340, { animated: false, label: "Work needed by the plain winding machine compared with the FFT, and the FFT's butterfly pattern" });
  controls(s, ["co-n"], () => {
    const p = val("co-n"), n = 2 ** p;
    el("co-no").textContent = `N = ${n.toLocaleString("en-US")}`;
    el("r-cost").innerHTML = `${n.toLocaleString("en-US")} samples: the FFT needs <em class="g">${Math.round((n * n) / (n * p)).toLocaleString("en-US")}×</em> less work.` +
      ` At a billion steps per second: <em style="color:var(--red)">${fmt(n * n / 1e9)}</em> vs <em class="g">${fmt(n * p / 1e9)}</em>.`;
  });
  function fmt(sec: number) { return sec >= 1 ? `${sec.toFixed(1)} s` : sec >= 1e-3 ? `${(sec * 1e3).toFixed(2)} ms` : `${(sec * 1e6).toFixed(1)} µs`; }
}

// --- 5. Your real radio data ------------------------------------------------------------------------
{
  const b = captureBytes(), iq = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) iq[i] = (b[i] - 127.5) / 127.5;
  const NN = 512, sp = avgSpectrum(iq, NN, 7);
  new Scene(el("s-real"), (g, w, h) => {
    spectrum(g, w, h, sp, CAPTURE.center, CAPTURE.rate, true);
  }, 300, { animated: false, label: "The spectrum of real samples from the dongle, with the strongest station labeled" });
}

// --- Lab: live spectrum and waterfall (src/waterfall.ts, explained in build.html) -------------------------
{
  let sp: Float32Array | null = null, center = 0, rate = 0, target = 0;
  const wf = new Waterfall(512, 120);
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!sp) { label(g, "connect a dongle below to see the live spectrum", w / 2, h / 2, C.muted, "center", 13); return; }
    spectrum(g, w, h * 0.55, sp, center, rate, target);
    wf.draw(g, 10, h * 0.58, w - 20, h * 0.4);
  }, 400, { animated: false, label: "Live spectrum and waterfall from a dongle" });
  lab(el("lab4"), {
    freqMHz: 98.7,
    onSamples: (cu8, r, c, tgt) => {
      center = c; rate = r; target = tgt;
      sp = spectrumOf(cu8, 512, 16);
      wf.push(sp);
      s.redraw();
    },
  });
}
