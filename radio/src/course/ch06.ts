// Chapter 6: averaging is filtering. Moving averages, frequency response, windowed sinc.
import "./course.css";
import { C, TAU, Scene, controls, val, line, label, dot, circle, arrow } from "./anim.ts";
import { mix, avgSpectrum, synth, DEMO_SIGNALS, firLowpass, freqResponse, FirDecimator, Mixer } from "../dsp.ts";
import { spectrumOfIQ } from "../waterfall.ts";
import { spectrum } from "./plots.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- 1. A moving average, sliding along ------------------------------------------------------------------
{
  const N = 120;
  const x = (i: number) => Math.sin((TAU * i) / 60) + 0.45 * Math.sin((TAU * i) / 6.3); // slow wave + fast wiggle
  const s = new Scene(el("s-avg"), (g, w, h, t) => {
    const L = val("av-l"), pos = still ? N - 1 : Math.floor(t * 18) % (N + 30);
    const X0 = 12, X1 = w - 12, px = (i: number) => X0 + (i / (N - 1)) * (X1 - X0);
    const top = h * 0.28, bot = h * 0.74, sc = h * 0.16;
    label(g, "input: slow wave + fast wiggle", X0, 16, C.muted, "left", 12);
    label(g, `output: each point = average of the last ${L} inputs`, X0, h * 0.5 + 8, C.yellow, "left", 12);
    line(g, X0, top, X1, top, C.grid, 1); line(g, X0, bot, X1, bot, C.grid, 1);
    for (let i = 0; i < N; i++) { line(g, px(i), top, px(i), top - x(i) * sc, "#2f5866", 1.5); dot(g, px(i), top - x(i) * sc, C.blue, 2.2); }
    // the bracket: which inputs are being averaged right now
    const p = Math.min(pos, N - 1);
    if (p >= L - 1) {
      g.fillStyle = "rgba(244,211,94,0.14)"; g.fillRect(px(p - L + 1) - 3, top - sc * 1.6, px(p) - px(p - L + 1) + 6, sc * 3.2);
      line(g, (px(p - L + 1) + px(p)) / 2, top + sc * 1.6, px(p), bot - sc * 1.6, C.yellow, 1, [3, 3]);
    }
    // the output so far
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    let started = false;
    for (let i = L - 1; i <= p; i++) {
      let a = 0; for (let k = 0; k < L; k++) a += x(i - k); a /= L;
      started ? g.lineTo(px(i), bot - a * sc) : (g.moveTo(px(i), bot - a * sc), (started = true));
    }
    g.stroke();
    g.strokeStyle = "rgba(131,193,103,0.5)"; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath();
    for (let i = 0; i < N; i++) { const v = Math.sin((TAU * i) / 60); i ? g.lineTo(px(i), bot - v * sc) : g.moveTo(px(i), bot - v * sc); }
    g.stroke(); g.setLineDash([]);
    label(g, "dashed green: the slow wave alone", X1, h - 8, C.green, "right", 11);
  }, 320, { label: "A moving average sliding along a signal, smoothing out a fast wiggle" });
  controls(s, ["av-l"], () => { el("av-lo").textContent = `${val("av-l")} samples`; });
}

// --- 2. Why: averaging over a full turn cancels an arrow ----------------------------------------------------
{
  const s = new Scene(el("s-why"), (g, w, h) => {
    const L = val("wy-l"), speed = val("wy-s"); // speed in turns per sample
    const R = Math.min(h * 0.36, w * 0.16), cx = R + 30, cy = h / 2;
    circle(g, cx, cy, R, C.grid);
    let sx = 0, sy = 0;
    for (let k = 0; k < L; k++) {
      const a = TAU * speed * k, x = Math.cos(a), y = Math.sin(a);
      g.globalAlpha = 0.5; arrow(g, cx, cy, cx + R * x, cy - R * y, C.blue, 1.5); g.globalAlpha = 1;
      sx += x / L; sy += y / L;
    }
    line(g, cx, cy, cx + R * sx, cy - R * sy, C.yellow, 3); dot(g, cx + R * sx, cy - R * sy, C.yellow, 6);
    label(g, `average of ${L} positions`, cx, h - 8, C.yellow, "center", 12);
    // right: how much survives the average, for every speed
    const X0 = 2 * R + 80, X1 = w - 12, T = 16, B = h - 30, sMax = 0.5;
    const px = (v: number) => X0 + (v / sMax) * (X1 - X0), py = (v: number) => B - v * (B - T);
    line(g, X0, B, X1, B, C.axis, 1);
    g.strokeStyle = C.muted; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i <= 300; i++) {
      const sp = (i / 300) * sMax; let ax = 0, ay = 0;
      for (let k = 0; k < L; k++) { ax += Math.cos(TAU * sp * k); ay += Math.sin(TAU * sp * k); }
      const v = Math.hypot(ax, ay) / L; i ? g.lineTo(px(sp), py(v)) : g.moveTo(px(sp), py(v));
    }
    g.stroke();
    const here = Math.hypot(sx, sy);
    line(g, px(speed), B, px(speed), py(here), C.yellow, 2); dot(g, px(speed), py(here), C.yellow, 5);
    label(g, "0", X0, B + 16, C.muted, "center", 11); label(g, "½ turn per sample", X1, B + 16, C.muted, "right", 11);
    label(g, "how much survives", X0, T - 2, C.muted, "left", 11);
  }, 280, { animated: false, label: "An arrow's positions over the averaging window, their average, and how much survives at every speed" });
  controls(s, ["wy-l", "wy-s"], () => { el("wy-lo").textContent = `${val("wy-l")} samples`; el("wy-so").textContent = `${val("wy-s").toFixed(3)} turns/sample`; });
}

// --- 3. Weights decide the response ------------------------------------------------------------------------
function weights(kind: string, taps: number, cut: number): Float32Array {
  const h = new Float32Array(taps), m = (taps - 1) / 2;
  for (let i = 0; i < taps; i++) {
    const x = i - m;
    if (kind === "box") h[i] = 1;
    else if (kind === "tri") h[i] = 1 - Math.abs(x) / (m + 1);
    else { // sinc, with or without the window
      const sinc = x === 0 ? 2 * cut : Math.sin(TAU * cut * x) / (Math.PI * x);
      h[i] = kind === "sinc" ? sinc : sinc * (0.54 - 0.46 * Math.cos((TAU * i) / (taps - 1)));
    }
  }
  const sum = h.reduce((a, b) => a + b, 0);
  return h.map((v) => v / sum);
}
{
  const s = new Scene(el("s-shape"), (g, w, h) => {
    const kind = (el("sp-k") as HTMLSelectElement).value, taps = val("sp-t") | 1, cut = val("sp-c");
    const hh = weights(kind, taps, cut), resp = freqResponse(hh, 500);
    const half = (w - 30) / 2;
    // left: the weights
    const b1 = { x: 10, y: 22, w: half - 10, h: h - 52 };
    const hmax = Math.max(...hh), hmin = Math.min(...hh, 0), zero = b1.y + b1.h * (hmax / (hmax - hmin));
    line(g, b1.x, zero, b1.x + b1.w, zero, C.grid, 1);
    hh.forEach((v, i) => { const x = b1.x + (i / Math.max(1, taps - 1)) * b1.w, y = zero - (v / (hmax - hmin)) * b1.h; line(g, x, zero, x, y, C.blue, 2); dot(g, x, y, C.blue, 2.5); });
    label(g, "the weights", b1.x, 14, C.blue, "left", 12);
    // right: the response (0 Hz in the middle), in dB
    const b2 = { x: half + 30, y: 22, w: half - 10, h: h - 52 };
    for (const db of [0, -20, -40, -60]) { const y = b2.y + (-db / 75) * b2.h; line(g, b2.x, y, b2.x + b2.w, y, C.grid, 1); label(g, `${db}`, b2.x + b2.w, y - 3, C.muted, "right", 10); }
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    resp.forEach((v, i) => { const x = b2.x + (i / (resp.length - 1)) * b2.w, y = b2.y + (Math.min(75, -v) / 75) * b2.h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    label(g, "what gets through (dB)", b2.x, 14, C.yellow, "left", 12);
    label(g, "−½", b2.x, h - 10, C.muted, "left", 10); label(g, "0", b2.x + b2.w / 2, h - 10, C.muted, "center", 10); label(g, "+½ turn/sample", b2.x + b2.w, h - 10, C.muted, "right", 10);
    // the worst leftover far from the passband
    let worst = -200; resp.forEach((v, i) => { const f = Math.abs(i / (resp.length - 1) - 0.5); if (f > cut * 2.2 && v > worst) worst = v; });
    el("r-shape").innerHTML = `${taps} weights · biggest leftover well outside the passband: <em class="y">${worst.toFixed(0)} dB</em> (${(10 ** (worst / 20) * 100).toFixed(2)}% of the arrow's length)`;
  }, 280, { animated: false, label: "Filter weights on the left and the frequency response they produce on the right" });
  controls(s, ["sp-k", "sp-t", "sp-c"], () => { el("sp-to").textContent = `${val("sp-t") | 1}`; el("sp-co").textContent = `±${val("sp-c").toFixed(2)}`; });
}

// --- 4. A real band through our filter -------------------------------------------------------------------------
{
  const FS = 1.024e6, band = mix(synth(FS, 0.03, DEMO_SIGNALS), FS, 200e3); // the FM station centered
  const s = new Scene(el("s-real"), (g, w, h) => {
    const cut = val("rf-c") * 1e3, tr = val("rf-t") * 1e3;
    const taps = firLowpass(cut / FS, tr / FS);
    const before = avgSpectrum(band, 512, 12), after = avgSpectrum(new FirDecimator(taps, 1, 2).process(band), 512, 12), resp = freqResponse(taps, 512);
    const top = Math.max(...before), L = 10, R = w - 10, T = 16, B = h - 26, lo = top - 90;
    const px = (i: number) => L + (i / 511) * (R - L), py = (v: number) => B - ((Math.max(lo, v) - lo) / (top + 5 - lo)) * (B - T);
    const curve = (arr: Float32Array | number[], col: string, wd: number, off = 0) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); arr.forEach((v, i) => (i ? g.lineTo(px(i), py(v + off)) : g.moveTo(px(i), py(v + off)))); g.stroke(); };
    curve(before, "#3f6f80", 1.2); curve(resp, C.pink, 1.5, top); curve(after, C.yellow, 1.8);
    label(g, "faint: before · pink: the filter · yellow: after", L, 12, C.muted, "left", 11);
    label(g, "−512 kHz", L, h - 6, C.muted, "left", 10); label(g, "0", (L + R) / 2, h - 6, C.muted, "center", 10); label(g, "+512 kHz", R, h - 6, C.muted, "right", 10);
    el("r-real").innerHTML = `<em class="y">${taps.length}</em> weights · each output costs ${taps.length} multiply-adds, so at 2.4 million samples per second that's <em class="y">${(taps.length * 2.4 * 2).toFixed(0)} million</em> per second (two per weight: I and Q)`;
  }, 280, { animated: false, label: "The demo band before and after our low-pass filter, with the filter's response" });
  controls(s, ["rf-c", "rf-t"], () => { el("rf-co").textContent = `±${val("rf-c")} kHz`; el("rf-to").textContent = `${val("rf-t")} kHz`; });
}

// --- Lab: filter the neighbors off a real station ------------------------------------------------------------------
{
  let raw: Float32Array | null = null, center = 0, rate = 0, target = 0;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!raw) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const centered = new Mixer(rate, target - center).process(raw);
    const taps = firLowpass(val("lf-c") * 1e3 / rate, 40e3 / rate);
    label(g, "centered (chapter 5)", 12, 16, C.text, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(centered, 512, 16), target, rate, false, 26);
    g.save(); g.translate(0, h / 2);
    label(g, `filtered: keep ±${val("lf-c")} kHz (${taps.length} weights)`, 12, 16, C.yellow, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(new FirDecimator(taps, 1, 2).process(centered), 512, 16), target, rate, false, 26);
    g.restore();
  }, 440, { animated: false, label: "Live spectrum of a centered station before and after filtering" });
  controls(s, ["lf-c"], () => { el("lf-co").textContent = `±${val("lf-c")} kHz`; });
  lab(el("lab6"), {
    freqMHz: 98.7,
    onSamples: (cu8, r, c, tgt) => { raw = Float32Array.from(cu8.subarray(0, 2 * 512 * 16), (v) => (v - 127.5) / 127.5); center = c; rate = r; target = tgt; s.redraw(); },
  });
}
