// Chapter 19: cleaner sound. The voice filter (biquads), noise reduction (overlap-add, gains, the noise tracker),
// AGC hang, the soft limiter, and the continuous stream. Scenes use the receiver's real classes where they exist.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, line, label, dot, circle } from "./anim.ts";
import { Biquad, Agc, NoiseReducer, Receiver, fft, normalize, type Mode } from "../dsp.ts";
import { decodeCU8 } from "../iq.ts";
import { playOnce } from "./audio.ts";
import { streamOut, type StreamOut } from "../player.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
let seed = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // repeatable, 0…1
const expo = () => -Math.log(1 - rnd()); // the power of one noise bin: exponential, mean 1

// --- 1a. A biquad answering a click ------------------------------------------------------------------------------------
{
  const fs = 16e3, n = 64;
  const s = new Scene(el("s-biquad"), (g, w, h, t) => {
    const imp = new Float32Array(n); imp[0] = 1;
    const y = new Biquad(fs, val("bq-f"), (el("bq-k") as HTMLSelectElement).value as "lowpass" | "highpass").process(imp);
    const shown = Math.min(n, 1 + Math.floor((t * 12) % (n + 24))), L = 30, R = w - 14, mid = h * 0.55, sc = h * 0.38 / Math.max(...Array.from(y, Math.abs));
    const X = (k: number) => L + (k / (n - 1)) * (R - L);
    line(g, L, mid, R, mid, C.axis, 1);
    for (let k = 0; k < shown; k++) { const cur = k === shown - 1; line(g, X(k), mid, X(k), mid - y[k] * sc, cur ? C.yellow : C.blue, 2); dot(g, X(k), mid - y[k] * sc, cur ? C.yellow : C.blue, 3); }
    const k = shown - 1;
    // the five numbers the newest output used: two past inputs (only the click at n = 0 is nonzero) and two past outputs
    for (const [j, col] of [[k - 1, C.pink], [k - 2, C.pink]] as const) if (j >= 0) circle(g, X(j), mid - y[j] * sc, 7, col, 1.5);
    if (k <= 2) circle(g, X(0), mid - y[0] * sc, 10, C.green, 1.5);
    label(g, `y[${k}] = b·(inputs n, n−1, n−2) − a·(outputs ${k - 1}, ${k - 2})`, L, 18, C.text, "left", 12);
    label(g, "pink: the two past outputs it feeds back · green: the click itself", L, 36, C.muted, "left", 11);
    label(g, "n →", R, mid + 18, C.muted, "right", 11);
  }, 230, { label: "The output of a biquad filter to a single click, computed one sample at a time" });
  controls(s, ["bq-f", "bq-k"], () => { el("bq-fo").textContent = `${val("bq-f")} Hz`; });
  el("bq-k").addEventListener("change", () => s.redraw());
}

// --- 1b. The voice filter's frequency response, and hearing it --------------------------------------------------------
{
  const fs = 48e3, N = 8192;
  const response = (lo: number, hi: number) => { // the FFT of the impulse response through both biquads
    const imp = new Float32Array(N); imp[0] = 1;
    const re = new Biquad(fs, hi, "lowpass").process(new Biquad(fs, lo, "highpass").process(imp)), im = new Float32Array(N);
    fft(re, im);
    return Float32Array.from({ length: N / 2 }, (_, k) => 10 * Math.log10(re[k] ** 2 + im[k] ** 2 + 1e-20));
  };
  const s = new Scene(el("s-voice"), (g, w, h) => {
    const db = response(val("vf-lo"), val("vf-hi")), L = 40, R = w - 14, T = 16, B = h - 30, f0 = 30, f1 = 12000;
    const X = (f: number) => L + (Math.log(f / f0) / Math.log(f1 / f0)) * (R - L), Y = (v: number) => T + (-Math.max(-40, Math.min(0, v)) / 40) * (B - T);
    g.fillStyle = "rgba(224,122,159,0.15)"; g.fillRect(X(67), T, X(250) - X(67), B - T); label(g, "CTCSS tones", X(130), B - 6, C.pink, "center", 11);
    g.fillStyle = "rgba(88,196,221,0.10)"; g.fillRect(X(300), T, X(3000) - X(300), B - T); label(g, "a voice", X(950), B - 6, C.blue, "center", 11);
    for (const d of [0, -3, -10, -20, -30, -40]) { line(g, L, Y(d), R, Y(d), d === -3 ? "#5a4f2a" : C.grid, 1); label(g, `${d}`, L - 6, Y(d) + 4, C.muted, "right", 10); }
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath(); let first = true;
    for (let k = 1; k < N / 2; k++) { const f = (k * fs) / N; if (f < f0 || f > f1) continue; first ? g.moveTo(X(f), Y(db[k])) : g.lineTo(X(f), Y(db[k])); first = false; }
    g.stroke();
    for (const f of [50, 100, 300, 1000, 3000, 10000]) label(g, f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), B + 16, C.muted, "center", 10);
    label(g, "dB", L - 6, T - 4, C.muted, "right", 10); label(g, "Hz, log scale", R, T + 12, C.muted, "right", 10);
  }, 230, { animated: false, label: "The voice filter's frequency response over the CTCSS and voice bands" });
  controls(s, ["vf-lo", "vf-hi"], () => { el("vf-loo").textContent = `${val("vf-lo")} Hz`; el("vf-hio").textContent = `${val("vf-hi")} Hz`; });
  // a voice-like sound: 140 Hz pitch, a few formants, syllables; plus a 100 Hz CTCSS tone and hiss
  const voice = () => {
    const n = fs * 3, x = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const t = k / fs, syl = Math.max(0, Math.sin(TAU * 2.6 * t)) ** 0.5;
      let v = 0; for (let hN = 1; hN < 25; hN++) { const f = 140 * hN, form = Math.exp(-(((f - 600) / 300) ** 2)) + 0.6 * Math.exp(-(((f - 1700) / 400) ** 2)); v += form * Math.sin(TAU * f * t + hN); }
      x[k] = 0.12 * syl * v + 0.18 * Math.sin(TAU * 100 * t) + 0.06 * (rnd() * 2 - 1);
    }
    return x;
  };
  const play = async (b: HTMLButtonElement, filtered: boolean) => {
    b.disabled = true;
    let x: Float32Array = voice();
    if (filtered) x = new Biquad(fs, val("vf-hi"), "lowpass").process(new Biquad(fs, val("vf-lo"), "highpass").process(x));
    await playOnce(normalize(x, 0.6), fs); b.disabled = false;
  };
  el("vf-raw").addEventListener("click", (e) => play(e.currentTarget as HTMLButtonElement, false));
  el("vf-on").addEventListener("click", (e) => play(e.currentTarget as HTMLButtonElement, true));
}

// --- 2. Overlap-add: windows that add up to one -------------------------------------------------------------------------
{
  new Scene(el("s-ola"), (g, w, h, t) => {
    const frames = 9, hop = 1 / (frames + 1), L = 14, R = w - 14, top = 30, base = h - 60, wave = 30;
    const X = (u: number) => L + u * (R - L), shown = Math.min(frames, Math.floor((t % 11) * 1.2));
    // the sound being sliced
    g.strokeStyle = "#3a4a55"; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i <= 400; i++) { const u = i / 400, v = Math.sin(u * 60) * (0.5 + 0.5 * Math.sin(u * 7)); i ? g.lineTo(X(u), wave - v * 16 + 8) : g.moveTo(X(u), wave - v * 16 + 8); }
    g.stroke();
    // each frame's window (√Hann twice = Hann), and their running sum
    const sum = new Float32Array(401);
    for (let f = 0; f < shown; f++) {
      const a = f * hop, col = f === shown - 1 ? C.yellow : C.blue;
      g.strokeStyle = col; g.lineWidth = f === shown - 1 ? 2.5 : 1.2; g.beginPath();
      for (let i = 0; i <= 80; i++) { const u = a + (2 * hop * i) / 80, hann = 0.5 - 0.5 * Math.cos((TAU * i) / 80), y = base - hann * (base - top - 30); i ? g.lineTo(X(u), y) : g.moveTo(X(u), y); }
      g.stroke();
      for (let i = 0; i <= 400; i++) { const u = i / 400, p = (u - a) / (2 * hop); if (p >= 0 && p <= 1) sum[i] += 0.5 - 0.5 * Math.cos(TAU * p); }
    }
    g.strokeStyle = C.green; g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 400; i++) { const y = h - 22 - sum[i] * 26; i ? g.lineTo(X(i / 400), y) : g.moveTo(X(i / 400), y); }
    g.stroke();
    line(g, L, h - 48, R, h - 48, "#3a5a33", 1, [3, 3]); label(g, "1", R, h - 52, C.green, "right", 10);
    label(g, "each frame's window, applied twice (yellow: the newest)", R, top - 2, C.blue, "right", 11);
    label(g, "their sum: flat at exactly 1 once two overlap", L, h - 4, C.green, "left", 11);
  }, 250, { label: "Overlapping windowed frames whose windows add up to a flat line" });
}

// --- 3a. Gains in one frame -----------------------------------------------------------------------------------------------
{
  const K = 96, fs = 8000; // bins up to 4 kHz
  const S = Float32Array.from({ length: K }, (_, k) => { // one frame: voice harmonics on top of hiss (mean 1)
    const f = (k * fs) / 2 / K, harm = Math.exp(-(((f % 140) / 18) ** 2)) + Math.exp(-((((f % 140) - 140) / 18) ** 2)), form = 30 * Math.exp(-(((f - 600) / 350) ** 2)) + 12 * Math.exp(-(((f - 1800) / 450) ** 2));
    return expo() * 0.6 + 0.4 + harm * form;
  });
  const s = new Scene(el("s-gain"), (g, w, h) => {
    const st = val("gn-s"), over = 0.5 + 1.5 * st, floor = 10 ** (-(6 + 14 * st) / 20);
    const L = 40, R = w - 40, T = 16, B = h - 30, lo = -6, hi = 18, bw = (R - L) / K;
    const Y = (db: number) => B - ((Math.min(hi, Math.max(lo, db)) - lo) / (hi - lo)) * (B - T), Yg = (gn: number) => B - gn * (B - T);
    for (let k = 0; k < K; k++) {
      const gn = st > 0 ? Math.max(floor, 1 - over / S[k]) : 1, x = L + k * bw;
      g.fillStyle = "rgba(88,196,221,0.35)"; g.fillRect(x, Y(10 * Math.log10(S[k])), bw - 1, B - Y(10 * Math.log10(S[k])));
      g.fillStyle = C.green; g.fillRect(x, Y(10 * Math.log10(S[k] * gn * gn)), bw - 1, 3);
      dot(g, x + bw / 2, Yg(gn), C.yellow, 2.2);
    }
    line(g, L, Y(10 * Math.log10(over)), R, Y(10 * Math.log10(over)), C.muted, 1, [4, 4]);
    label(g, `${over.toFixed(2)} × hiss`, R, Y(10 * Math.log10(over)) - 4, C.muted, "right", 10);
    label(g, "blue: the frame's level per bin · green: after the gain · yellow dots: the gain (0 at the bottom, 1 at the top)", L, 12, C.text, "left", 11);
    label(g, "0", L - 6, B + 4, C.muted, "right", 10); label(g, "4 kHz", R, B + 16, C.muted, "right", 10);
  }, 240, { animated: false, label: "One frame's spectrum, the gain per bin, and the result" });
  controls(s, ["gn-s"], () => { el("gn-so").textContent = val("gn-s").toFixed(2); });
}

// --- 3b. Musical noise: gains over time, raw vs floored and smoothed ----------------------------------------------------------
{
  const K = 56, W = 150;
  const raw: Float32Array[] = [], calm: Float32Array[] = [];
  const sm = new Float32Array(K).fill(1), gk = new Float32Array(K).fill(1);
  let frame = 0, lastT = 0;
  const step = () => {
    const talking = Math.sin(frame / 22) > 0.2, r = new Float32Array(K), c = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      const voice = talking && (k % 7 === 2 || k % 7 === 3) && k < 40 ? 12 * (1 - k / 50) : 0, p = expo() + voice;
      r[k] = Math.max(0, 1 - 2 / p); // no smoothing, no floor
      sm[k] = 0.8 * sm[k] + 0.2 * p;
      const gg = Math.max(0.1, 1 - 2 / sm[k]);
      gk[k] = gg > gk[k] ? 0.65 * gk[k] + 0.35 * gg : 0.75 * gk[k] + 0.25 * gg;
      c[k] = gk[k];
    }
    raw.push(r); calm.push(c); if (raw.length > W) { raw.shift(); calm.shift(); }
    frame++;
  };
  for (let i = 0; i < W; i++) step();
  new Scene(el("s-musical"), (g, w, h, t) => {
    for (let n = Math.floor((t - lastT) * 30); n > 0; n--) step(); // 30 frames a second (slowed down from 187)
    if (t - lastT > 1 / 30 || t < lastT) lastT = t;
    const half = (w - 36) / 2, ph = h - 40, cw = half / W, ch = ph / K;
    [[raw, "no floor, no smoothing: musical noise", 12], [calm, "−20 dB floor, gentle release (what Spectrum Lab does)", 24 + half]].forEach(([grid, name, x0]) => {
      (grid as Float32Array[]).forEach((col, i) => col.forEach((v, k) => { const b = Math.round(v * 255); g.fillStyle = `rgb(${Math.round(b * 0.95)},${Math.round(b * 0.83)},${Math.round(b * 0.37)})`; g.fillRect((x0 as number) + i * cw, 22 + (K - 1 - k) * ch, cw + 0.5, ch + 0.5); }));
      label(g, name as string, x0 as number, 14, C.text, "left", 11);
    });
    label(g, "time →   (brighter = gain closer to 1; up = higher frequency)", 12, h - 6, C.muted, "left", 11);
  }, 230, { label: "The gains of every frequency bin over time, flickering without smoothing and calm with it" });
}

// --- 4. The noise tracker -------------------------------------------------------------------------------------------------
{
  const W = 900; // frames shown (~5 s at 187 frames a second)
  let lvl = 1, nz = Infinity, frame = 0, lastT = 0;
  const hist: [number, number, number, number][] = []; // level dB, tracker dB, estimate dB, true hiss dB
  const step = () => {
    const hiss = frame % 3000 < 1500 ? 1 : 6, talking = Math.sin(frame / 60) > 0.3 && frame % 400 < 300;
    lvl = 0.8 * lvl + 0.2 * (hiss * expo() + (talking ? 25 : 0));
    nz = !(nz < Infinity) ? lvl : lvl < nz ? nz * (lvl / nz) ** 0.05 : nz * 1.01;
    hist.push([10 * Math.log10(lvl), 10 * Math.log10(nz), 10 * Math.log10(2 * nz), 10 * Math.log10(hiss)]);
    if (hist.length > W) hist.shift();
    frame++;
  };
  for (let i = 0; i < W; i++) step();
  new Scene(el("s-track"), (g, w, h, t) => {
    for (let n = Math.floor((t - lastT) * 187); n > 0; n--) step();
    lastT = t;
    const L = 40, R = w - 14, T = 18, B = h - 26, lo = -12, hi = 20, X = (i: number) => L + (i / (W - 1)) * (R - L), Y = (d: number) => B - ((Math.min(hi, Math.max(lo, d)) - lo) / (hi - lo)) * (B - T);
    for (const [k, col, wd, dash] of [[0, "#3d6f7d", 1, []], [3, C.muted, 1.5, [2, 4]], [1, C.yellow, 2, []], [2, C.green, 2, [6, 4]]] as const) {
      g.strokeStyle = col; g.lineWidth = wd; g.setLineDash([...dash]); g.beginPath();
      hist.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[k])) : g.moveTo(X(i), Y(p[k])))); g.stroke(); g.setLineDash([]);
    }
    for (const d of [-10, 0, 10, 20]) label(g, `${d} dB`, L - 4, Y(d) + 4, C.muted, "right", 10);
    label(g, "one bin's level", L, 12, "#58a4b5", "left", 11); label(g, "tracker (lives in the dips)", L + 110, 12, C.yellow, "left", 11);
    label(g, "× 2: the hiss estimate", L + 290, 12, C.green, "left", 11); label(g, "true hiss", L + 440, 12, C.muted, "left", 11);
  }, 230, { label: "One frequency bin's level over time, with the noise tracker following its dips" });
}

// --- 5. AGC hang -------------------------------------------------------------------------------------------------------
{
  const fs = 4000, n = fs * 2, x = new Float32Array(n);
  for (let k = 0; k < n; k++) { const t = k / fs, word = (t > 0.1 && t < 0.7) || (t > 1.25 && t < 1.85); x[k] = (word ? 0.5 * Math.sin(TAU * 180 * t) * (0.6 + 0.4 * Math.sin(TAU * 4 * t)) : 0) + 0.01 * (rnd() * 2 - 1); }
  const s = new Scene(el("s-hang"), (g, w, h) => {
    const agc = new Agc(fs, 0.4, val("hg-h"), 60), y = agc.process(x, 0.5), L = 12, R = w - 12;
    [[x, "in: a word, a pause with faint hiss, a word", C.blue, 0.8], [y, `out (hang ${(val("hg-h") * 1000).toFixed(0)} ms)`, C.yellow, 0.8]].forEach(([arr, name, col, k], li) => {
      const top = 16 + li * (h / 2), mid = top + h / 4 - 6, sc = (h / 4 - 14) / (k as number);
      label(g, name as string, L, top, col as string, "left", 11);
      g.strokeStyle = col as string; g.lineWidth = 1; g.beginPath();
      for (let i = 0; i < n; i += 2) { const xx = L + (i / n) * (R - L), v = (arr as Float32Array)[i]; i ? g.lineTo(xx, mid - v * sc) : g.moveTo(xx, mid - v * sc); }
      g.stroke();
    });
  }, 250, { animated: false, label: "Speech with a pause, before and after AGC with a hang time" });
  controls(s, ["hg-h"], () => { el("hg-ho").textContent = `${(val("hg-h") * 1000).toFixed(0)} ms`; });
}

// --- 6. The soft limiter --------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-limiter"), (g, w, h) => {
    const v = 10 ** (val("lm-v") / 20), half = (w - 36) / 2, T = 18, B = h - 24, cy = (T + B) / 2, sc = (B - T) / 2 - 4;
    // left: the curves
    const L = 12, Xc = (x: number) => L + ((x + 1) / 2) * half, Yc = (y: number) => cy - y * sc;
    line(g, L, cy, L + half, cy, C.axis, 1); line(g, Xc(0), T, Xc(0), B, C.axis, 1);
    for (const [f, col] of [[(x: number) => Math.max(-1, Math.min(1, v * x)), C.red], [(x: number) => Math.tanh(v * x), C.yellow]] as const) {
      g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath();
      for (let i = 0; i <= 200; i++) { const x = -1 + i / 100; i ? g.lineTo(Xc(x), Yc(f(x))) : g.moveTo(Xc(x), Yc(f(x))); }
      g.stroke();
    }
    label(g, "in →", L + half, cy + 14, C.muted, "right", 10); label(g, "out", Xc(0) + 4, T + 8, C.muted, "left", 10);
    // right: a sine through both
    const L2 = 24 + half, X2 = (i: number) => L2 + (i / 300) * half;
    for (const [f, col] of [[(x: number) => Math.max(-1, Math.min(1, v * x)), C.red], [(x: number) => Math.tanh(v * x), C.yellow]] as const) {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i <= 300; i++) { const y = f(0.6 * Math.sin((TAU * 2.5 * i) / 300)); i ? g.lineTo(X2(i), Yc(y)) : g.moveTo(X2(i), Yc(y)); }
      g.stroke();
    }
    label(g, "red: hard clip (a corner, crackles) · yellow: tanh (rounded)", L, h - 4, C.muted, "left", 11);
  }, 230, { animated: false, label: "Hard clipping versus a tanh soft limiter, as curves and on a loud sine" });
  controls(s, ["lm-v"], () => { const d = val("lm-v"); el("lm-vo").textContent = `${d > 0 ? "+" : ""}${d} dB`; });
}

// --- 7. The ring buffer and its control loop ------------------------------------------------------------------------------
{
  const RING = 1.0, CUSHION = 0.35, CHUNK = 0.055; // seconds
  let w = CUSHION, r = 0, next = 0, last = 0, stallUntil = -1, on = true, gaps = 0;
  const fill: number[] = [];
  el("rg-stall").addEventListener("click", () => { stallUntil = last + 0.3; });
  new Scene(el("s-ring"), (g, W, H, t) => {
    const dt = Math.min(0.05, t - last); last = t;
    if (dt > 0) {
      const radio = 1 + val("rg-p") * 1e-6; // the radio's clock vs the card's (exaggerated so you can watch it)
      next += dt * radio;
      if (t >= stallUntil) while (next >= CHUNK) { w += CHUNK; next -= CHUNK; } // chunks arrive (all at once after a stall)
      const have = w - r, speed = 1 + Math.max(-0.005, Math.min(0.005, (0.01 * (have - CUSHION)) / CUSHION));
      if (!on && have >= CUSHION) on = true;
      if (on) { if (have < dt * speed) { on = false; gaps++; } else r += dt * speed; }
      fill.push(w - r); if (fill.length > 600) fill.shift();
    }
    const have = w - r, speed = 1 + Math.max(-0.005, Math.min(0.005, (0.01 * (have - CUSHION)) / CUSHION));
    // the ring: angle = position mod the ring's length
    const cx = H / 2 + 10, cy = H / 2, rad = H / 2 - 22, ang = (p: number) => -Math.PI / 2 + ((p % RING) / RING) * TAU;
    circle(g, cx, cy, rad, C.grid, 14);
    g.strokeStyle = "rgba(244,211,94,0.55)"; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, rad, ang(r), ang(r) + (Math.min(have, RING) / RING) * TAU); g.stroke();
    const tip = (p: number, col: string, txt: string) => { const a = ang(p); line(g, cx, cy, cx + Math.cos(a) * (rad + 10), cy + Math.sin(a) * (rad + 10), col, 2.5); label(g, txt, cx + Math.cos(a) * (rad + 22), cy + Math.sin(a) * (rad + 22) + 4, col, "center", 11); };
    tip(w, C.yellow, "write"); tip(r, C.blue, "read");
    label(g, `${(have * 1000).toFixed(0)} ms`, cx, cy + 4, C.text, "center", 13);
    // the cushion over time
    const L = H + 30, R = W - 12, T = 20, B = H - 26, Y = (s: number) => B - (Math.min(0.8, s) / 0.8) * (B - T);
    line(g, L, Y(CUSHION), R, Y(CUSHION), C.green, 1, [4, 4]); label(g, "target cushion", R, Y(CUSHION) - 4, C.green, "right", 10);
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath(); fill.forEach((f, i) => (i ? g.lineTo(L + (i / 599) * (R - L), Y(f)) : g.moveTo(L, Y(f)))); g.stroke();
    label(g, "cushion over the last 10 s", L, 12, C.muted, "left", 11);
    el("r-ring").innerHTML = `Reading at <em class="b">${((speed - 1) * 100).toFixed(2)}%</em> ${speed >= 1 ? "faster" : "slower"} than the sound card's own pace · cushion <em class="y">${(have * 1000).toFixed(0)} ms</em>${gaps ? ` · ran dry ${gaps}×` : ""}${!on ? " · <em>refilling</em>" : ""}`;
  }, 230, { label: "A ring buffer with write and read pointers, and the cushion between them over time" });
  const sl = () => { const p = val("rg-p"); el("rg-po").textContent = `${p > 0 ? "+" : ""}${p} ppm`; };
  el("rg-p").addEventListener("input", sl); sl();
}

// --- Lab: a live voice, cleaned up, through the continuous stream ---------------------------------------------------------
{
  let rx: Receiver | null = null, key = "", out: StreamOut | null = null, starting: Promise<StreamOut> | null = null;
  let hp: Biquad, lp: Biquad, nr: NoiseReducer, agc: Agc | null = null, before: Float32Array | null = null, after: Float32Array | null = null;
  const AGC: Record<string, [number, number]> = { slow: [1.5, 0.5], medium: [0.4, 0.25], fast: [0.1, 0.05] };
  const spec = (a: Float32Array) => { const n = 1024, re = new Float32Array(n), im = new Float32Array(n); for (let i = 0; i < n; i++) re[i] = (a[a.length - n + i] ?? 0) * (0.5 - 0.5 * Math.cos((TAU * i) / n)); fft(re, im); return Float32Array.from({ length: n / 2 }, (_, k) => 10 * Math.log10(re[k] ** 2 + im[k] ** 2 + 1e-12)); };
  const meter = new Scene(el("s-lab"), (g, w, h) => {
    if (!before || !after || !rx) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const L = 34, R = w - 12, T = 14, B = h - 22, kMax = Math.round((4000 / rx.audioFs) * 1024), lo = -90, hi = 10;
    const X = (k: number) => L + (k / kMax) * (R - L), Y = (d: number) => B - ((Math.min(hi, Math.max(lo, d)) - lo) / (hi - lo)) * (B - T);
    for (const [sp, col] of [[before, "#5b6270"], [after, C.blue]] as const) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); for (let k = 1; k <= kMax; k++) k > 1 ? g.lineTo(X(k), Y(sp[k])) : g.moveTo(X(k), Y(sp[k])); g.stroke(); }
    label(g, "0", L, B + 14, C.muted, "center", 10); label(g, "4 kHz", R, B + 14, C.muted, "right", 10);
  }, 160, { animated: false, label: "The sound's spectrum before and after the cleanup" });
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const [mhz, mode] = b.dataset.preset!.split(",");
    (el("lb-mode") as HTMLSelectElement).value = mode;
    const f = el("lab19").querySelector(".lab-f") as HTMLInputElement; f.value = mhz; f.dispatchEvent(new Event("change"));
  }));
  const setVol = () => { if (out) out.vol.gain.value = 10 ** (val("lb-vol") / 20) / 4; };
  controls(meter, ["lb-nr", "lb-vol"], () => { el("lb-nro").textContent = val("lb-nr").toFixed(2); el("lb-volo").textContent = `${val("lb-vol")} dB`; setVol(); });
  el("lb-agc").addEventListener("change", () => (key = ""));
  let drawn = 0;
  lab(el("lab19"), {
    freqMHz: 162.55, everyChunk: true,
    onSamples: (cu8, r, c, tgt) => {
      if (!out) { starting ??= streamOut().then((o) => { out = o; setVol(); return o; }); return; } // made on the first samples, after your click
      const mode = (el("lb-mode") as HTMLSelectElement).value as Mode, bw = mode === "NFM" ? 12.5e3 : mode === "AM" ? 10e3 : 2.8e3, a0 = AGC[(el("lb-agc") as HTMLSelectElement).value];
      const k = `${r}|${c}|${tgt}|${mode}|${a0}`;
      if (!rx || k !== key) {
        rx = new Receiver(r, tgt - c, mode, bw); key = k;
        hp = new Biquad(rx.audioFs, 300, "highpass"); lp = new Biquad(rx.audioFs, 3000, "lowpass"); nr = new NoiseReducer(); agc = a0 ? new Agc(rx.audioFs, a0[0], a0[1], 60) : null;
      }
      let a = rx.process(decodeCU8(cu8)).audio;
      before = spec(a);
      if ((el("lb-voice") as HTMLInputElement).checked) a = lp.process(hp.process(a));
      nr.strength = val("lb-nr");
      if (nr.strength > 0) a = nr.process(a);
      a = agc ? agc.process(a, 0.3) : a.map((v) => v * 0.3);
      after = spec(a);
      out.player.port.postMessage({ a, rate: rx.audioFs, cushion: 0.35 });
      if (performance.now() - drawn > 200) { drawn = performance.now(); meter.redraw(); el("r-lab").textContent = `Sound at ${(rx.audioFs / 1000).toFixed(1)} kHz, through the continuous stream with a 350 ms cushion.`; }
    },
  });
}
