// Chapter 9: FM, listening to the speed. The demodulator, its noise, de-emphasis, and what's in a broadcast.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label, grid, toPx, type Plane, type Handle } from "./anim.ts";
import { synth, Mixer, FirDecimator, FmDemod, Deemphasis, firLowpass, Agc, fft } from "../dsp.ts";
import { MPX } from "./data/mpx.ts";
import { playOnce, LivePlayer } from "./audio.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;

// --- 1. How far did it turn? Multiply by the mirrored previous arrow ------------------------------------------------
{
  const prev: Handle = { x: 0.9, y: 0.45, color: C.blue }, now: Handle = { x: 0.35, y: 0.95, color: C.yellow };
  const plane = (w: number, h: number): Plane => ({ cx: w / 2, cy: h / 2, unit: Math.min(w, h) / 3.2 });
  const out = () => {
    const px = now.x * prev.x + now.y * prev.y, py = now.y * prev.x - now.x * prev.y; // now × conj(prev)
    el("r-turn").innerHTML = `<em class="y">now ${deg(now.x, now.y).toFixed(0)}°</em> − <em class="b">before ${deg(prev.x, prev.y).toFixed(0)}°</em>` +
      ` = <em class="p">turned ${deg(px, py).toFixed(0)}°</em> (the pink arrow's angle)`;
  };
  new Scene(el("s-turn"), (g, w, h) => {
    const p = plane(w, h); grid(g, p, w, h);
    const O = toPx(p, 0, 0), c = { x: prev.x, y: -prev.y };
    const prod = { x: now.x * prev.x + now.y * prev.y, y: now.y * prev.x - now.x * prev.y };
    const [ax, ay] = toPx(p, prev.x, prev.y), [bx, by] = toPx(p, now.x, now.y), [cx, cy] = toPx(p, c.x, c.y), [dx, dy] = toPx(p, prod.x, prod.y);
    g.setLineDash([5, 5]); arrow(g, O[0], O[1], cx, cy, "#2f6f86", 2); g.setLineDash([]);
    arrow(g, O[0], O[1], ax, ay, C.blue, 3); arrow(g, O[0], O[1], bx, by, C.yellow, 3); arrow(g, O[0], O[1], dx, dy, C.pink, 3.5);
    label(g, "before", ax + 8, ay - 6, C.blue, "left", 12); label(g, "now", bx + 8, by - 6, C.yellow, "left", 12);
    label(g, "before, mirrored", cx + 8, cy + 14, "#4a9ab4", "left", 11); label(g, "now × mirrored = the turn", dx + 8, dy + 4, C.pink, "left", 12);
  }, 320, { animated: false, handles: [prev, now], plane, max: 1.3, onDrag: out, label: "Two draggable arrows, the mirror image of the first, and their product whose angle is the turn between them" });
  out();
}

// --- 2. The demodulator at work (slow motion) ---------------------------------------------------------------------------
{
  const N = 240; // samples shown
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // repeatable noise
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(TAU * rnd());
  const s = new Scene(el("s-demod"), (g, w, h, t) => {
    const noise = val("dm-n"), fade = (el("dm-f") as HTMLInputElement).checked;
    seed = 1;
    const msg = (k: number) => Math.sin((TAU * 3 * k) / N), dev = 0.5; // the music: 3 waves across the window; up to ±0.5 rad per step
    const xs: [number, number][] = [];
    let ph = 0;
    for (let k = 0; k < N; k++) {
      ph += dev * msg(k);
      const a = fade ? 0.25 + 0.75 * Math.abs(Math.sin((TAU * k) / (N * 1.3))) : 1;
      xs.push([a * Math.cos(ph) + noise * gauss(), a * Math.sin(ph) + noise * gauss()]);
    }
    const shown = still ? N : Math.min(N, Math.floor((t * 40) % (N + 60)));
    // left: the last few snapshots
    const R = Math.min(h * 0.36, w * 0.16), cx = R + 24, cy = h / 2;
    circle(g, cx, cy, R, C.grid);
    for (let k = Math.max(0, shown - 12); k < shown; k++) dot(g, cx + xs[k][0] * R * 0.9, cy - xs[k][1] * R * 0.9, k === shown - 1 ? C.yellow : "#3f6f80", k === shown - 1 ? 5 : 3);
    if (shown > 0) arrow(g, cx, cy, cx + xs[shown - 1][0] * R * 0.9, cy - xs[shown - 1][1] * R * 0.9, C.blue, 2.5);
    dot(g, cx, cy, C.red, 3);
    // right: the turn at each step (the demodulator's output), and the original music (dashed)
    const X0 = 2 * R + 60, X1 = w - 12, mid = h / 2, sc = (h * 0.44) / Math.PI; // a full ±180° turn fits
    const px = (k: number) => X0 + (k / (N - 1)) * (X1 - X0);
    line(g, X0, mid, X1, mid, C.grid, 1);
    g.strokeStyle = "rgba(131,193,103,0.7)"; g.setLineDash([4, 4]); g.lineWidth = 1.5; g.beginPath();
    for (let k = 0; k < N; k++) (k ? g.lineTo(px(k), mid - dev * msg(k) * sc) : g.moveTo(px(k), mid - dev * msg(k) * sc));
    g.stroke(); g.setLineDash([]);
    const turns: number[] = [0];
    for (let k = 1; k < N; k++) { const [x0, y0] = xs[k - 1], [x1, y1] = xs[k]; turns.push(Math.atan2(y1 * x0 - x1 * y0, x1 * x0 + y1 * y0)); }
    for (let k = 1; k < shown; k++) line(g, px(k), mid, px(k), mid - turns[k] * sc, Math.abs(turns[k]) > 1.6 ? C.red : C.pink, 1.6);
    // what the audio filter lets through: a short running average of the bars
    g.strokeStyle = C.yellow; g.lineWidth = 2.2; g.beginPath();
    for (let k = 5; k < shown - 4; k++) { let a = 0; for (let j = -4; j <= 4; j++) a += turns[k + j]; a /= 9; k > 5 ? g.lineTo(px(k), mid - a * sc) : g.moveTo(px(k), mid - a * sc); }
    g.stroke();
    label(g, "pink: turn per step · yellow: after the audio filter · green: the original music", X0, h - 6, C.muted, "left", 11);
  }, 300, { label: "An FM arrow's recent snapshots and the turn at each step, which traces the original music" });
  controls(s, ["dm-n", "dm-f"], () => { el("dm-no").textContent = val("dm-n") === 0 ? "none" : val("dm-n").toFixed(2); });
}

// --- 3. What's inside a real FM broadcast -------------------------------------------------------------------------------
{
  new Scene(el("s-mpx"), (g, w, h) => {
    const db = MPX.db, n = db.length, L = 12, R = w - 12, T = 34, B = h - 30;
    const lo = Math.min(...db), hi = Math.max(...db) + 4;
    const px = (f: number) => L + (f / (n * MPX.binHz)) * (R - L), py = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
    const band = (a: number, b: number, col: string, name: string) => {
      g.fillStyle = col; g.fillRect(px(a), T - 16, px(b) - px(a), B - T + 16);
      label(g, name, (px(a) + px(b)) / 2, T - 4, C.text, "center", 11);
    };
    band(30, 15000, "rgba(131,193,103,0.10)", "mono audio (L+R)");
    band(23000, 53000, "rgba(224,122,159,0.10)", "stereo difference (L−R)");
    band(55000, 59000, "rgba(88,196,221,0.14)", "RDS");
    g.fillStyle = "rgba(88,196,221,0.18)"; g.beginPath(); g.moveTo(px(0), B);
    db.forEach((v, i) => g.lineTo(px(i * MPX.binHz), py(v))); g.lineTo(px((n - 1) * MPX.binHz), B); g.closePath(); g.fill();
    g.strokeStyle = C.blue; g.lineWidth = 1.4; g.beginPath(); db.forEach((v, i) => (i ? g.lineTo(px(i * MPX.binHz), py(v)) : g.moveTo(px(0), py(v)))); g.stroke();
    const pi = Math.round(19000 / MPX.binHz);
    label(g, "19 kHz pilot", px(19000), py(db[pi]) - 8, C.yellow, "center", 12);
    for (let f = 0; f <= 60000; f += 10000) label(g, `${f / 1000}`, px(f), h - 12, C.muted, "center", 11);
    label(g, "kHz", R, h - 12, C.muted, "right", 11);
  }, 300, { animated: false, label: "The spectrum of a real FM station's demodulated signal: mono audio, the 19 kHz pilot, the stereo band and RDS" });
}

// --- 4. De-emphasis: hear the hiss go away ---------------------------------------------------------------------------------
const FS = 960e3, CH = 240e3, AUD = 48e3;
function fmTone(deemph: boolean, snr: number) {
  const iq = synth(FS, 2, [{ kind: "FM", offset: 0, tone: 440, amp: 1 }], 0);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < iq.length; i++) iq[i] += (rnd() - 0.5) * snr; // add noise to the radio signal
  const f1 = new FirDecimator(firLowpass(100e3 / FS, 40e3 / FS), 4, 2), dem = new FmDemod(), de = new Deemphasis(CH);
  const f2 = new FirDecimator(firLowpass(15e3 / CH, 9e3 / CH), 5, 1);
  const d = dem.process(f1.process(iq));
  const a = f2.process(deemph ? de.process(d) : d), k = CH / (TAU * 75e3) * 0.3;
  return a.map((v) => Math.max(-1, Math.min(1, v * k)));
}
{
  const s = new Scene(el("s-deemph"), (g, w, h) => {
    // the demodulator's output when the input is pure noise: its spectrum rises with frequency
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const noise = new Float32Array(2 * 40960).map(() => rnd() - 0.5);
    for (let i = 0; i < noise.length; i += 2) noise[i] += 3; // a strong steady carrier plus noise
    const d = new FmDemod().process(new FirDecimator(firLowpass(100e3 / FS, 40e3 / FS), 4, 2).process(noise));
    const spec = (x: Float32Array) => {
      const N = 1024, acc = new Float64Array(N / 2);
      for (let s0 = 0; s0 + N <= x.length; s0 += N) { const re = new Float32Array(N), im = new Float32Array(N); for (let i = 0; i < N; i++) re[i] = x[s0 + i]; fft(re, im); for (let i = 0; i < N / 2; i++) acc[i] += re[i] ** 2 + im[i] ** 2; }
      return Array.from(acc, (v) => 10 * Math.log10(v + 1e-20));
    };
    const a = spec(d), b = spec(new Deemphasis(CH).process(d));
    const top = Math.max(...a), L = 12, R = w - 12, T = 20, B = h - 28, n = 15000 / (CH / 1024); // show 0–15 kHz
    const px = (i: number) => L + (i / n) * (R - L), py = (v: number) => B - ((Math.max(top - 40, v) - (top - 40)) / 42) * (B - T);
    const curve = (arr: number[], col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let i = 1; i < n; i++) (i > 1 ? g.lineTo(px(i), py(arr[i])) : g.moveTo(px(i), py(arr[i]))); g.stroke(); };
    curve(a, C.red); curve(b, C.green);
    label(g, "noise after FM demodulation: rises with pitch (red) · after de-emphasis (green)", L, 14, C.muted, "left", 11);
    for (let f = 0; f <= 15000; f += 5000) label(g, `${f / 1000} kHz`, L + (f / 15000) * (R - L), h - 10, C.muted, "center", 11);
  }, 230, { animated: false, label: "The spectrum of noise after FM demodulation, with and without de-emphasis" });
  s.redraw();
  for (const [id, de] of [["de-off", false], ["de-on", true]] as const) {
    el(id).addEventListener("click", async (e) => {
      const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
      await playOnce(fmTone(de, 2.2), AUD); b.disabled = false;
    });
  }
}

// --- Lab: listen to live FM, built from the chapters' blocks ---------------------------------------------------------------
{
  let chain: { key: string; mix: Mixer; f1: FirDecimator; dem: FmDemod; de: Deemphasis; f2: FirDecimator; agc: Agc; chFs: number; aFs: number } | null = null;
  const player = new LivePlayer();
  let mpx: number[] | null = null;
  const sc = new Scene(el("s-lab"), (g, w, h) => {
    if (!mpx) { label(g, "connect a dongle below to hear FM", w / 2, h / 2, C.muted, "center", 13); return; }
    const L = 12, R = w - 12, T = 16, B = h - 24, n = mpx.length, top = Math.max(...mpx), lo = top - 50;
    const px = (i: number) => L + (i / (n - 1)) * (R - L), py = (v: number) => B - ((Math.max(lo, v) - lo) / 52) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1.4; g.beginPath(); mpx.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
    const pi = Math.round((19000 / 64000) * (n - 1));
    line(g, px(pi), T, px(pi), B, C.yellow, 1, [3, 3]); label(g, "19 kHz", px(pi), T - 2, C.yellow, "center", 11);
    for (let f = 0; f <= 60000; f += 20000) label(g, `${f / 1000} kHz`, L + (f / 64000) * (R - L), h - 6, C.muted, "center", 11);
  }, 220, { animated: false, label: "Live spectrum of the FM demodulator's output" });
  lab(el("lab9"), {
    freqMHz: 98.7, everyChunk: true,
    onSamples: (cu8, r, c, tgt) => {
      const key = `${r}|${c}|${tgt}`;
      if (!chain || chain.key !== key) {
        const m1 = Math.max(1, Math.floor(r / 300e3)), chFs = r / m1, m2 = Math.max(1, Math.round(chFs / 48e3));
        chain = { key, mix: new Mixer(r, tgt - c), f1: new FirDecimator(firLowpass(100e3 / r, Math.max(chFs - 200e3, 30e3) / r), m1, 2), dem: new FmDemod(),
          de: new Deemphasis(chFs), f2: new FirDecimator(firLowpass(15e3 / chFs, (chFs / m2 / 2 - 15e3) / chFs), m2, 1), agc: new Agc(chFs / m2), chFs, aFs: chFs / m2 };
      }
      const x = Float32Array.from(cu8, (v) => (v - 127.5) / 127.5);
      const d = chain.dem.process(chain.f1.process(chain.mix.process(x)));          // chapters 5, 6+7, 9
      const deOn = (el("lb-de") as HTMLInputElement).checked;
      const a = chain.f2.process(deOn ? chain.de.process(d) : d);                      // de-emphasis, audio filter
      player.push(chain.agc.process(a, 0.35), chain.aFs);
      // the demodulator output's spectrum, 0–64 kHz, for the picture
      const N = 1024, re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N && i < d.length; i++) re[i] = d[i] * (0.5 - 0.5 * Math.cos((TAU * i) / N));
      fft(re, im);
      const bins = Math.round((64000 / chain.chFs) * N);
      const now = Array.from({ length: bins }, (_, i) => 10 * Math.log10(re[i] ** 2 + im[i] ** 2 + 1e-20));
      mpx = mpx && mpx.length === now.length ? mpx.map((v, i) => 0.8 * v + 0.2 * now[i]) : now;
      sc.redraw();
      const pi = Math.round((19000 / chain.chFs) * N), around = (mpx[pi - 6] + mpx[pi + 6]) / 2;
      el("r-lab").innerHTML = `Pilot ${(mpx[pi] - around).toFixed(0)} dB above its surroundings → ${mpx[pi] - around > 10 ? '<em class="g">a stereo station</em>' : "no clear pilot (mono, or a weak signal)"} · de-emphasis ${deOn ? "on" : "off"}`;
    },
  });
}
