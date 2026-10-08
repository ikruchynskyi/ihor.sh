// Chapter 7: throwing away snapshots. Decimation: filter, then keep every M-th sample.
import "./course.css";
import { C, Scene, controls, val, line, label, dot } from "./anim.ts";
import { avgSpectrum, mix, synth, DEMO_SIGNALS, firLowpass, FirDecimator, Mixer } from "../dsp.ts";
import { spectrumOfIQ } from "../waterfall.ts";
import { spectrum } from "./plots.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FS = 1.024e6;
const band = mix(synth(FS, 0.04, DEMO_SIGNALS), FS, 200e3); // FM station centered; AM now at −350 kHz, USB tone at +150 kHz

/** Plot a spectrum (dB) in a box, with a fixed scale so pictures can be compared. */
function plot(g: CanvasRenderingContext2D, sp: Float32Array, x: number, y: number, w: number, h: number, top: number, col = C.blue) {
  const lo = top - 80, n = sp.length;
  g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
  sp.forEach((v, i) => { const px = x + (i / (n - 1)) * w, py = y + h - ((Math.max(lo, v) - lo) / 85) * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.stroke();
}

// --- 1. The folding picture: keeping every M-th sample stacks the spectrum's slices -------------------------
{
  const s = new Scene(el("s-fold"), (g, w, h, t) => {
    const M = val("fd-m"), filtered = (el("fd-f") as HTMLInputElement).checked;
    const src = filtered ? new FirDecimator(firLowpass(100e3 / FS, (FS / M - 200e3) / FS), 1, 2).process(band) : band;
    const sp = avgSpectrum(src, 512, 12), top = Math.max(...avgSpectrum(band, 512, 12));
    const L = 10, R = w - 10, W = R - L, upper = h * 0.42;
    // top: the full band, cut into M slices of width fs/M
    label(g, `before: 1024 kHz wide, cut into ${M} slices of ${(FS / M / 1e3).toFixed(0)} kHz`, L, 14, C.text, "left", 12);
    // The slices that get stacked are centered on 0, ±fs/M, ±2fs/M…; the middle one (yellow) is what you keep.
    const slice = W / M;
    for (let k = -Math.ceil(M / 2); k <= Math.ceil(M / 2); k++) {
      const a = Math.max(L, L + W / 2 + (k - 0.5) * slice), b = Math.min(R, L + W / 2 + (k + 0.5) * slice);
      if (b <= a) continue;
      g.fillStyle = k === 0 ? "rgba(244,211,94,0.14)" : Math.abs(k) % 2 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)";
      g.fillRect(a, 22, b - a, upper - 22);
    }
    plot(g, sp, L, 22, W, upper - 22, top);
    // bottom: after keeping every M-th sample, every slice lands on the same narrow range, added together
    const after = avgSpectrum(new FirDecimator(new Float32Array([1]), M, 2).process(src), 256, 8);
    const by = upper + 34, bh = h - by - 22, bw = Math.min(W, Math.max(120, W / M * 2.2)), bx = L + (W - bw) / 2;
    label(g, `after keeping every ${M}${M === 1 ? "st" : M === 2 ? "nd" : M === 3 ? "rd" : "th"} sample: only ${(FS / M / 1e3).toFixed(0)} kHz wide, every slice stacked here`, L, upper + 26, C.yellow, "left", 12);
    g.fillStyle = "rgba(244,211,94,0.08)"; g.fillRect(bx, by, bw, bh);
    plot(g, after, bx, by, bw, bh, top, C.yellow);
    // the station's ±100 kHz, for reference
    const sx = (f: number) => bx + (f / (FS / M) + 0.5) * bw;
    if (FS / M > 200e3) { line(g, sx(-100e3), by, sx(-100e3), by + bh, C.green, 1, [3, 3]); line(g, sx(100e3), by, sx(100e3), by + bh, C.green, 1, [3, 3]); }
    label(g, "dashed green: your station's ±100 kHz", R, h - 6, C.green, "right", 11);
    // animation hint: slices sliding in
    if (!still && M > 1) {
      const ph = (t * 0.5) % 1, k = (Math.floor(t * 0.5) % M) - Math.floor(M / 2);
      const fromX = L + W / 2 + k * slice, toX = L + W / 2;
      dot(g, fromX + (toX - fromX) * ph, 22 + (by - 22) * ph, C.pink, 4);
    }
  }, 380, { label: "A spectrum cut into slices that are stacked on top of each other by decimation" });
  controls(s, ["fd-m", "fd-f"], () => {
    const M = val("fd-m"), filtered = (el("fd-f") as HTMLInputElement).checked;
    el("fd-mo").textContent = `every ${M}`;
    el("r-fold").innerHTML = M === 1 ? "Keeping every sample changes nothing." :
      FS / M < 200e3 ? `<em style="color:var(--red)">Too far:</em> the new range (${(FS / M / 1e3).toFixed(0)} kHz) is narrower than the station itself (200 kHz). Its own edges fold onto each other.` :
      filtered ? `<em class="y">Clean.</em> The filter emptied every slice except the middle one, so nothing lands on the station.` :
      `<em style="color:var(--red)">Aliasing:</em> the other slices weren't emptied, so the AM station and the tone fold onto the new range, on top of or right next to your station.`;
  });
}

// --- 2. Only compute what you keep -------------------------------------------------------------------------------
{
  const s = new Scene(el("s-skip"), (g, w, h, t) => {
    const M = val("sk-m"), taps = 9, N = 60, L = 14, R = w - 14, px = (i: number) => L + (i / (N - 1)) * (R - L);
    const step = still ? N - 1 : Math.floor(t * 6) % N;
    const y1 = h * 0.32, y2 = h * 0.74;
    label(g, "input samples", L, 16, C.muted, "left", 12);
    label(g, `outputs: only every ${M}${M === 1 ? "st" : M === 2 ? "nd" : M === 3 ? "rd" : "th"} one is computed`, L, h * 0.55, C.yellow, "left", 12);
    for (let i = 0; i < N; i++) dot(g, px(i), y1, C.blue, 3);
    const p = Math.floor(step / M) * M;
    if (p >= taps - 1) {
      g.fillStyle = "rgba(244,211,94,0.16)"; g.fillRect(px(p - taps + 1) - 4, y1 - 12, px(p) - px(p - taps + 1) + 8, 24);
      line(g, px(p), y1 + 12, px(p), y2 - 8, C.yellow, 1, [3, 3]);
    }
    for (let i = taps - 1; i <= Math.max(p, taps - 1) && i <= step; i++) {
      if (i % M === 0) dot(g, px(i), y2, C.yellow, 5); else dot(g, px(i), y2, "#3a3f4a", 2);
    }
    el("r-skip").innerHTML = `Work per second at 2.4 MS/s with 69 weights: filter every sample then throw ${M - 1} of every ${M} away = <em style="color:var(--red)">${(2.4 * 69 * 2).toFixed(0)} million</em> multiply-adds; compute only the kept ones = <em class="g">${((2.4 * 69 * 2) / M).toFixed(0)} million</em>.`;
  }, 200, { label: "A filter bracket jumping several samples at a time, computing only the outputs that are kept" });
  controls(s, ["sk-m"], () => { el("sk-mo").textContent = `${val("sk-m")}`; });
}

// --- Lab: zoom in on a real station ----------------------------------------------------------------------------------
{
  let raw: Float32Array | null = null, center = 0, rate = 0, target = 0;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!raw) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const M = val("ld-m");
    const centered = new Mixer(rate, target - center).process(raw);
    const taps = firLowpass(100e3 / rate, Math.max(rate / M - 200e3, rate / M * 0.1) / rate);
    const kept = new FirDecimator(taps, M, 2).process(centered);
    label(g, `centered, ${(rate / 1e6).toFixed(3)} MS/s`, 12, 16, C.text, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(centered, 512, 16), target, rate, false, 26);
    g.save(); g.translate(0, h / 2);
    label(g, `filtered + every ${M}th sample kept: ${(rate / M / 1e3).toFixed(0)} kS/s, zoomed in ${M}×`, 12, 16, C.yellow, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(kept, 256, 8), target, rate / M, false, 26);
    g.restore();
  }, 440, { animated: false, label: "Live spectrum before and after filtering and decimation" });
  controls(s, ["ld-m"], () => { el("ld-mo").textContent = `${val("ld-m")}`; });
  lab(el("lab7"), {
    freqMHz: 98.7,
    onSamples: (cu8, r, c, tgt) => { raw = Float32Array.from(cu8.subarray(0, 2 * 512 * 32), (v) => (v - 127.5) / 127.5); center = c; rate = r; target = tgt; s.redraw(); },
  });
}
