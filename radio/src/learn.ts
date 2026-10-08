// Interactive widgets for learn.html. They run the same dsp.ts code as Spectrum Lab, so what you
// play with here is exactly what processes real radio.
import { mix, avgSpectrum, firLowpass, freqResponse, FirDecimator, FmDemod, synth, DEMO_SIGNALS } from "./dsp.ts";

const TAU = 2 * Math.PI;
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Size a canvas for the screen's pixel density; returns a context in CSS pixels. */
function surface(id: string) {
  const c = $<HTMLCanvasElement>(id);
  // Remember the intended CSS height once: setting c.height below also overwrites the height
  // attribute, so re-reading it would double the box on every redraw on a 2× (Retina) screen.
  c.dataset.h ??= c.getAttribute("height") ?? "200";
  c.style.height = `${c.dataset.h}px`;
  const r = devicePixelRatio || 1;
  c.width = Math.round(c.clientWidth * r);
  c.height = Math.round(c.clientHeight * r);
  const g = c.getContext("2d")!;
  g.scale(r, r);
  return { g, w: c.clientWidth, h: c.clientHeight };
}

type Box = { x: number; y: number; w: number; h: number };

/** y-values across a box, scaled lo..hi. */
function trace(g: CanvasRenderingContext2D, ys: ArrayLike<number>, b: Box, lo: number, hi: number, color: string, width = 1.6) {
  g.strokeStyle = color; g.lineWidth = width; g.beginPath();
  for (let i = 0; i < ys.length; i++) {
    const x = b.x + (i / (ys.length - 1)) * b.w;
    const y = b.y + b.h - ((Math.min(hi, Math.max(lo, ys[i])) - lo) / (hi - lo)) * b.h;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color = css("--muted"), align: CanvasTextAlign = "left") {
  g.fillStyle = color; g.font = "12px ui-sans-serif, system-ui, sans-serif"; g.textAlign = align; g.fillText(s, x, y);
}

function vline(g: CanvasRenderingContext2D, x: number, b: Box, color = css("--line")) {
  g.fillStyle = color; g.fillRect(x, b.y, 1, b.h);
}

/** Re-run a draw function on input and resize. */
function bind(draw: () => void, ...ids: string[]) {
  ids.forEach((id) => $(id).addEventListener("input", draw));
  addEventListener("resize", draw);
  draw();
}

// --- 0 · I/Q: a spinning arrow and its two shadows ---------------------------------------
{
  let t0 = performance.now();
  const draw = () => {
    const f = parseFloat($<HTMLInputElement>("pf").value);
    $("pfo").textContent = `${f > 0 ? "+" : ""}${f} Hz`;
    const { g, w, h } = surface("phasor");
    const t = reduced ? 0.15 : (performance.now() - t0) / 1000;
    const R = Math.min(h * 0.38, w * 0.16), cx = R + 24, cy = h / 2;
    const a = TAU * f * t, I = Math.cos(a), Q = Math.sin(a);
    // circle, axes, arrow, shadows
    g.strokeStyle = css("--line"); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(cx - R - 8, cy); g.lineTo(cx + R + 8, cy); g.moveTo(cx, cy - R - 8); g.lineTo(cx, cy + R + 8); g.stroke();
    g.strokeStyle = css("--fg"); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * I, cy - R * Q); g.stroke();
    g.fillStyle = css("--plot"); g.fillRect(cx + R * I - 4, cy - 4, 8, 8);
    g.fillStyle = css("--plot2"); g.fillRect(cx - 4, cy - R * Q - 4, 8, 8);
    text(g, f === 0 ? "not spinning (0 Hz)" : f > 0 ? "counter-clockwise" : "clockwise", cx, h - 6, css("--muted"), "center");
    // traces of the last 2 seconds, newest at the left edge
    const b = { x: cx + R + 40, y: 14, w: w - (cx + R + 52), h: h - 40 };
    const n = 200, Is = new Float32Array(n), Qs = new Float32Array(n);
    for (let i = 0; i < n; i++) { const ti = t - (i / n) * 2; Is[i] = Math.cos(TAU * f * ti); Qs[i] = Math.sin(TAU * f * ti); }
    g.fillStyle = css("--line"); g.fillRect(b.x, b.y + b.h / 2, b.w, 1);
    trace(g, Is, b, -1.1, 1.1, css("--plot"));
    trace(g, Qs, b, -1.1, 1.1, css("--plot2"));
    text(g, "now", b.x, h - 6); text(g, "2 s ago", b.x + b.w, h - 6, css("--muted"), "right");
    if (!reduced) requestAnimationFrame(draw);
  };
  $("pf").addEventListener("input", () => { if (reduced) draw(); });
  addEventListener("resize", () => { if (reduced) draw(); });
  draw();
}

// --- 1 · FFT: multiply by a test tone, add the arrows up -----------------------------------
{
  const N = 32;
  // A signal with two tones: bin 3 (strong) and bin −6 (weaker).
  const xr = new Float32Array(N), xi = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    xr[n] = Math.cos((TAU * 3 * n) / N) + 0.6 * Math.cos((TAU * -6 * n) / N);
    xi[n] = Math.sin((TAU * 3 * n) / N) + 0.6 * Math.sin((TAU * -6 * n) / N);
  }
  const products = (k: number) => {
    const pts: [number, number][] = [[0, 0]];
    let sr = 0, si = 0;
    for (let n = 0; n < N; n++) {
      const c = Math.cos((-TAU * k * n) / N), s = Math.sin((-TAU * k * n) / N);
      sr += xr[n] * c - xi[n] * s; si += xr[n] * s + xi[n] * c;
      pts.push([sr, si]);
    }
    return pts;
  };
  const ks: number[] = [];
  for (let k = -16; k <= 16; k += 0.125) ks.push(k);
  const sweep = ks.map((k) => { const p = products(k).at(-1)!; return Math.hypot(p[0], p[1]); });

  bind(() => {
    const k = parseFloat($<HTMLInputElement>("fk").value);
    const pts = products(k), end = pts.at(-1)!, mag = Math.hypot(end[0], end[1]);
    $("fko").textContent = `${k} cycles`;
    const { g, w, h } = surface("fft");
    // left: head-to-tail arrows
    const side = Math.min(h, w * 0.42), cx = side / 2, cy = h / 2, sc = (side / 2 - 8) / N;
    g.strokeStyle = css("--line"); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - side / 2, cy); g.lineTo(cx + side / 2, cy); g.moveTo(cx, cy - side / 2); g.lineTo(cx, cy + side / 2); g.stroke();
    g.strokeStyle = css("--plot"); g.lineWidth = 1.5; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * sc, cy - y * sc) : g.moveTo(cx, cy)));
    g.stroke();
    g.strokeStyle = css("--plot2"); g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + end[0] * sc, cy - end[1] * sc); g.stroke();
    text(g, `sum length ${mag.toFixed(1)}`, cx, h - 4, css("--fg"), "center");
    // right: the spectrum this builds
    const b = { x: side + 36, y: 10, w: w - side - 44, h: h - 34 };
    trace(g, sweep, b, 0, N * 1.05, css("--muted"), 1.2);
    const mx = b.x + ((k + 16) / 32) * b.w;
    vline(g, mx, b, css("--plot2"));
    g.fillStyle = css("--plot2"); g.beginPath(); g.arc(mx, b.y + b.h - (mag / (N * 1.05)) * b.h, 5, 0, TAU); g.fill();
    text(g, "−16", b.x, h - 4); text(g, "0", b.x + b.w / 2, h - 4, css("--muted"), "center"); text(g, "+16 cycles", b.x + b.w, h - 4, css("--muted"), "right");
  }, "fk");
}

// --- 2 · Mixer: slide the whole spectrum ------------------------------------------------
const FS = 1.024e6;
const demo = synth(FS, 0.02, DEMO_SIGNALS); // FM at +200 kHz, AM at −150 kHz, USB at +350 kHz
{
  bind(() => {
    const f0 = parseFloat($<HTMLInputElement>("mf").value) * 1e3;
    $("mfo").textContent = `${f0 / 1e3} kHz`;
    const spec = avgSpectrum(mix(demo, FS, f0), 512, 12);
    const { g, w, h } = surface("cmix");
    const b = { x: 4, y: 8, w: w - 8, h: h - 30 };
    vline(g, b.x + b.w / 2, b, css("--plot2"));
    trace(g, spec, b, Math.min(...spec), Math.max(...spec) + 3, css("--plot"));
    text(g, "−512 kHz", b.x, h - 6); text(g, "0 (the center)", b.x + b.w / 2, h - 6, css("--plot2"), "center"); text(g, "+512 kHz", b.x + b.w, h - 6, css("--muted"), "right");
  }, "mf");
}

// --- 3 · Filter: the weights and what they do -------------------------------------------
{
  bind(() => {
    const taps = parseInt($<HTMLInputElement>("ft").value) | 1;
    const cut = parseFloat($<HTMLInputElement>("fc").value);
    const win = $<HTMLInputElement>("fw").checked;
    $("fto").textContent = `${taps} taps`; $("fco").textContent = `${cut.toFixed(2)} × fs`;
    // With the window: our real firLowpass (asked for exactly `taps` taps). Without: a plain chopped sinc.
    let hh: Float32Array;
    if (win) hh = firLowpass(cut, 3.3 / taps);
    else {
      hh = new Float32Array(taps);
      const m = (taps - 1) / 2; let sum = 0;
      for (let i = 0; i < taps; i++) { const x = i - m; hh[i] = x === 0 ? 2 * cut : Math.sin(TAU * cut * x) / (Math.PI * x); sum += hh[i]; }
      for (let i = 0; i < taps; i++) hh[i] /= sum;
    }
    const resp = freqResponse(hh, 400);
    const { g, w, h } = surface("cfilt");
    const half = (w - 24) / 2;
    // left: weights as stems
    const b1 = { x: 4, y: 8, w: half - 8, h: h - 30 };
    const hmax = Math.max(...hh), hmin = Math.min(...hh, 0), zero = b1.y + b1.h * (hmax / (hmax - hmin));
    g.fillStyle = css("--line"); g.fillRect(b1.x, zero, b1.w, 1);
    hh.forEach((v, i) => {
      const x = b1.x + (i / Math.max(1, hh.length - 1)) * b1.w, y = zero - (v / (hmax - hmin)) * b1.h;
      g.fillStyle = css("--plot"); g.fillRect(x - 0.5, Math.min(y, zero), 1.5, Math.abs(zero - y));
    });
    text(g, "the weights (taps): a sinc", b1.x, h - 6);
    // right: frequency response in dB
    const b2 = { x: half + 20, y: 8, w: half - 4, h: h - 30 };
    for (const db of [0, -40]) { const y = b2.y + ((5 - db) / 95) * b2.h; g.fillStyle = css("--line"); g.fillRect(b2.x, y, b2.w, 1); text(g, `${db} dB`, b2.x + b2.w, y - 3, css("--muted"), "right"); }
    trace(g, resp, b2, -90, 5, css("--plot2"));
    text(g, "what passes: −fs/2 … 0 … +fs/2", b2.x, h - 6);
  }, "ft", "fc", "fw");
}

// --- 4 · Aliasing: samples that lie --------------------------------------------------------
{
  const RATE = 10;
  bind(() => {
    const f = parseFloat($<HTMLInputElement>("af").value);
    const fa = f - Math.round(f / RATE) * RATE; // what the samples look like
    $("afo").textContent = `${f} Hz → looks like ${Math.abs(fa)} Hz`;
    const { g, w, h } = surface("alias");
    const b = { x: 4, y: 10, w: w - 8, h: h - 30 }, T = 1;
    const n = 600, real = new Float32Array(n), seen = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = (i / n) * T; real[i] = Math.cos(TAU * f * t); seen[i] = Math.cos(TAU * fa * t); }
    trace(g, real, b, -1.15, 1.15, css("--line"), 1.2);
    trace(g, seen, b, -1.15, 1.15, css("--plot"), 2);
    g.fillStyle = css("--plot2");
    for (let k = 0; k <= RATE * T; k++) {
      const t = k / RATE, x = b.x + (t / T) * b.w, y = b.y + b.h / 2 - (Math.cos(TAU * f * t) / 2.3) * b.h;
      g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
    }
    text(g, "1 second", b.x + b.w, h - 6, css("--muted"), "right");
  }, "af");
}

// --- 4b · Decimating with and without the filter -----------------------------------------
{
  const M = 4, centered = mix(demo, FS, 200e3); // tune the FM station to 0, then keep every 4th sample
  const taps = firLowpass(100e3 / FS, (FS / M - 200e3) / FS);
  bind(() => {
    const filtered = $<HTMLInputElement>("df").checked;
    const out = new FirDecimator(filtered ? taps : new Float32Array([1]), M, 2).process(centered);
    const spec = avgSpectrum(out, 256, 12);
    const { g, w, h } = surface("decim");
    const b = { x: 4, y: 8, w: w - 8, h: h - 30 };
    const px = (f: number) => b.x + (f / (FS / M) + 0.5) * b.w;
    g.fillStyle = css("--soft") || "rgba(0,0,0,.05)";
    g.fillStyle = "rgba(127,127,127,0.12)"; g.fillRect(px(-100e3), b.y, px(100e3) - px(-100e3), b.h);
    trace(g, spec, b, Math.min(...spec), Math.max(...spec) + 3, css("--plot"));
    text(g, "−128 kHz", b.x, h - 6); text(g, "your station (±100 kHz)", b.x + b.w / 2, h - 6, css("--fg"), "center"); text(g, "+128 kHz", b.x + b.w, h - 6, css("--muted"), "right");
    $("dfo").textContent = filtered
      ? "Clean: only the FM station is left."
      : "Without the filter, the AM and USB stations folded into the new, narrower range. Two spikes now sit right next to (or inside) your station, and no later step can remove them.";
  }, "df");
}

// --- 5 · FM: the sound is in the spin speed -----------------------------------------------
{
  bind(() => {
    const tone = parseFloat($<HTMLInputElement>("mt").value), dev = parseFloat($<HTMLInputElement>("md").value);
    $("mto").textContent = `${tone} Hz`; $("mdo").textContent = `±${dev} Hz`;
    const fs = 400, n = 400, carrier = 12; // slow motion: a 12 Hz "carrier", 1 second shown
    const msg = new Float32Array(n), iq = new Float32Array(2 * n), wave = new Float32Array(n);
    let ph = 0, phc = 0;
    for (let i = 0; i < n; i++) {
      msg[i] = Math.sin((TAU * tone * i) / fs);
      ph += (TAU * dev * msg[i]) / fs; // baseband FM: phase grows by deviation × audio
      phc += (TAU * (carrier + dev * msg[i])) / fs; // the same, around a visible carrier
      iq[2 * i] = Math.cos(ph); iq[2 * i + 1] = Math.sin(ph);
      wave[i] = Math.cos(phc);
    }
    const out = new FmDemod().process(iq).map((v) => (v * fs) / (TAU * dev)); // rad/sample → back to ±1
    out[0] = out[1];
    const { g, w, h } = surface("fm");
    const rowH = (h - 30) / 2;
    const b1 = { x: 4, y: 6, w: w - 8, h: rowH - 10 }, b2 = { x: 4, y: rowH + 14, w: w - 8, h: rowH - 10 };
    trace(g, wave, b1, -1.1, 1.1, css("--fg"), 1.2);
    text(g, "what's transmitted: the wave squeezes when the audio is high, stretches when it's low", b1.x, b1.y + b1.h + 12);
    trace(g, msg, b2, -1.3, 1.3, css("--line"), 5);
    trace(g, out, b2, -1.3, 1.3, css("--plot2"), 1.8);
    text(g, "grey (thick) = original audio · orange = what FmDemod recovers", b2.x, h - 4);
  }, "mt", "md");
}
