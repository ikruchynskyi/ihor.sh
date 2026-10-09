// Chapter 12: inside the dongle. The analog front end, the image problem, and the PLL.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, line, label } from "./anim.ts";
import { spectrumOf } from "../waterfall.ts";
import { spectrum } from "./plots.ts";
import { lab } from "./lab.ts";
import { pll } from "./pllmath.ts";

const el = (id: string) => document.getElementById(id)!;
const IF = 3.57e6, XTAL = 28.8e6;
// A realistic slice of the NYC FM dial: [MHz, strength in dB above the noise]
const STATIONS: [number, number][] = [[88.3, 32], [89.9, 22], [92.3, 40], [93.9, 25], [95.5, 34], [96.3, 30], [97.1, 36], [98.7, 38], [99.5, 40],
  [100.3, 38], [101.1, 28], [102.7, 34], [103.5, 27], [104.3, 30], [105.1, 24], [106.7, 28], [107.5, 28]];

/** Draw a spectrum made of station humps, mapping each RF frequency through `map` (Hz → x, or null to hide). */
function humps(g: CanvasRenderingContext2D, w: number, h: number, f0: number, f1: number, parts: { f: number; db: number; col?: string }[], floor: number, axis: (f: number) => string) {
  const L = 12, R = w - 12, T = 34, B = h - 26, px = (f: number) => L + ((f - f0) / (f1 - f0)) * (R - L), py = (db: number) => B - (db / 60) * (B - T);
  line(g, L, py(floor), R, py(floor), "#2a3a44", 1);
  for (const p of parts) {
    if (p.f < f0 || p.f > f1 || p.db <= floor) continue;
    const half = Math.max(2, ((0.1e6) / (f1 - f0)) * (R - L));
    g.fillStyle = p.col ?? "rgba(88,196,221,0.55)";
    g.beginPath(); g.moveTo(px(p.f) - half, py(floor)); g.lineTo(px(p.f) - half * 0.6, py(p.db)); g.lineTo(px(p.f) + half * 0.6, py(p.db)); g.lineTo(px(p.f) + half, py(floor)); g.closePath(); g.fill();
  }
  const step = Math.pow(10, Math.floor(Math.log10((f1 - f0) / 4)));
  for (let f = Math.ceil(f0 / step) * step; f <= f1; f += step) if ((f - f0) / (f1 - f0) < 0.93) label(g, axis(f), px(f), h - 8, C.muted, "center", 10);
  return { px, py, T, B };
}

// --- 1. The signal's journey, stage by stage --------------------------------------------------------------------------
const STAGES = [
  ["antenna", "Every station in the air arrives at once, along with all the other radio in the city. They're tiny: millionths of a volt."],
  ["amplifier (LNA)", "The low-noise amplifier makes everything bigger (that's the gain setting), adding as little noise of its own as possible. A tracking filter in front keeps far-away bands out."],
  ["mixer", "An analog mixer multiplies by the local oscillator, a plain wave (one shadow) from the PLL at your frequency + 3.57 MHz. Like chapter 5's cos-only mixing, everything lands in two places; we only care about the copy near 3.57 MHz, which is now upside down."],
  ["IF filter", "A fixed filter keeps about 6 MHz around 3.57 MHz, the intermediate frequency (IF), and removes everything else. Because the IF never changes, this filter can be sharp and simple."],
  ["ADC", "The 8-bit analog-to-digital converter takes 28.8 million real snapshots per second (one shadow). Real samples at 28.8 MS/s can honestly show 0 to 14.4 MHz (chapter 3), plenty for a band around 3.57 MHz."],
  ["digital mixer", "Now in numbers: the RTL2832U multiplies by a spinning arrow at −3.57 MHz (chapter 5, both shadows this time) and flips the spectrum back the right way up. Your frequency is now at 0."],
  ["resampler → USB", "A filter plus decimation (chapters 6 and 7) keeps ± half your sample rate and thins 28.8 MS/s down to it. These are the I/Q bytes that arrive over USB."],
] as const;
{
  let stage = 0;
  const fc = 98.45e6;
  const s = new Scene(el("s-path"), (g, w, h) => {
    // the block diagram
    const n = STAGES.length, bw = (w - 24) / n;
    STAGES.forEach(([name], i) => {
      const x = 12 + i * bw, on = i === stage;
      g.fillStyle = on ? "rgba(244,211,94,0.18)" : "rgba(255,255,255,0.04)"; g.fillRect(x + 3, 6, bw - 6, 40);
      g.strokeStyle = on ? C.yellow : C.grid; g.lineWidth = on ? 2 : 1; g.strokeRect(x + 3, 6, bw - 6, 40);
      label(g, `${i + 1}`, x + bw / 2, 22, on ? C.yellow : C.muted, "center", 12);
      label(g, name.length > 14 && bw < 110 ? name.split(" ")[0] : name, x + bw / 2, 38, on ? C.text : C.muted, "center", 10);
      if (i < n - 1) label(g, "→", x + bw, 30, C.muted, "center", 12);
    });
    // the spectrum at the chosen stage
    g.save(); g.translate(0, 56); const H = h - 56;
    const near = STATIONS.map(([m, db]) => ({ f: m * 1e6, db }));
    if (stage <= 1) {
      const lift = stage === 1 ? 14 : 0;
      humps(g, w, H, 80e6, 115e6, near.map((p) => ({ ...p, db: p.db + lift, col: Math.abs(p.f - fc) < 1.3e6 ? "rgba(244,211,94,0.8)" : undefined })), 6 + lift * 0.8, (f) => `${(f / 1e6).toFixed(0)}`);
    } else if (stage <= 3) {
      // after the analog mixer: each station at |f − LO|; the IF filter (stage 3) keeps ~0.6–6.6 MHz
      const lo = fc + IF, parts = near.map((p) => ({ f: Math.abs(p.f - lo), db: p.db + 14 - (stage === 3 && (Math.abs(p.f - lo) < 0.57e6 || Math.abs(p.f - lo) > 6.57e6) ? 60 : 0), col: Math.abs(p.f - fc) < 1.3e6 ? "rgba(244,211,94,0.8)" : undefined }));
      const r = humps(g, w, H, 0, 20e6, parts, 18, (f) => `${(f / 1e6).toFixed(0)}`);
      if (stage === 3) { g.fillStyle = "rgba(131,193,103,0.10)"; g.fillRect(r.px(0.57e6), r.T, r.px(6.57e6) - r.px(0.57e6), r.B - r.T); }
      line(g, r.px(IF), r.T - 6, r.px(IF), r.B, C.yellow, 1, [3, 3]); label(g, "3.57 MHz (IF)", r.px(IF), r.T - 10, C.yellow, "center", 11);
    } else if (stage === 4) {
      const lo = fc + IF, parts = near.filter((p) => { const f = Math.abs(p.f - lo); return f > 0.57e6 && f < 6.57e6; }).map((p) => ({ f: Math.abs(p.f - lo), db: p.db + 14, col: Math.abs(p.f - fc) < 1.3e6 ? "rgba(244,211,94,0.8)" : undefined }));
      const r = humps(g, w, H, 0, 14.4e6, parts, 22, (f) => `${(f / 1e6).toFixed(0)}`);
      label(g, "quantization noise floor (chapter 3) is higher now", r.px(14.4e6) - 4, r.py(22) - 6, C.muted, "right", 10);
    } else {
      // centered: offset = f − fc; the resampler keeps ±1.2 MHz at 2.4 MS/s
      const keep = stage === 6 ? 1.2e6 : 3e6;
      const parts = near.filter((p) => Math.abs(p.f - fc) < keep).map((p) => ({ f: p.f - fc, db: p.db + 14, col: "rgba(244,211,94,0.8)" }));
      const r = humps(g, w, H, -keep, keep, parts, 22, (f) => `${f >= 0 ? "+" : ""}${(f / 1e6).toFixed(1)}`);
      line(g, r.px(0), r.T - 6, r.px(0), r.B, C.pink, 1, [3, 3]); label(g, "0 = 98.45 MHz", r.px(0), r.T - 10, C.pink, "center", 11);
    }
    g.restore();
    el("r-path").innerHTML = `<b>${stage + 1}. ${STAGES[stage][0]}.</b> ${STAGES[stage][1]}`;
  }, 330, { animated: false, label: "The dongle's signal path as blocks, with the spectrum at the selected stage" });
  controls(s, ["pt-s"], () => { stage = val("pt-s") - 1; el("pt-so").textContent = `${stage + 1} of ${STAGES.length}`; });
}

// --- 2. The image: a second station that lands on the same IF ----------------------------------------------------------
{
  const s = new Scene(el("s-image"), (g, w, h) => {
    const fc = val("im-f") * 1e6, lo = fc + IF, img = lo + IF;
    const parts = STATIONS.map(([m, db]) => ({ f: m * 1e6, db, col: Math.abs(m * 1e6 - fc) < 0.15e6 ? "rgba(244,211,94,0.9)" : Math.abs(m * 1e6 - img) < 0.15e6 ? "rgba(252,98,85,0.9)" : undefined }));
    const r = humps(g, w, h, 86e6, 116e6, parts, 6, (f) => `${(f / 1e6).toFixed(0)}`);
    // the tuner's tracking filter: a broad bump centered on where you listen
    g.strokeStyle = C.green; g.lineWidth = 1.8; g.beginPath();
    for (let i = 0; i <= 300; i++) { const f = 86e6 + (i / 300) * 30e6, att = Math.min(40, 20 * Math.log10(1 + ((f - fc) / 5e6) ** 2)); const y = r.py(55 - att); i ? g.lineTo(r.px(f), y) : g.moveTo(r.px(f), y); }
    g.stroke();
    for (const [f, name, col] of [[fc, "you", C.yellow], [lo, "oscillator", C.text], [img, "image", C.red]] as const) { line(g, r.px(f), r.T - 4, r.px(f), r.B, col, 1.5, [4, 3]); label(g, name, r.px(f), r.T - 10, col, "center", 11); }
    const imgStation = STATIONS.find(([m]) => Math.abs(m * 1e6 - img) < 0.15e6);
    const att = Math.min(40, 20 * Math.log10(1 + ((img - fc) / 5e6) ** 2));
    el("r-image").innerHTML = `Listening at ${(fc / 1e6).toFixed(1)} MHz, the oscillator is at ${(lo / 1e6).toFixed(2)} MHz, so ${(img / 1e6).toFixed(2)} MHz <em style="color:var(--red)">also</em> lands on the 3.57 MHz IF. ` +
      (imgStation ? `There's a station there (${imgStation[0]} MHz)! The tracking filter weakens it by about ${att.toFixed(0)} dB; a strong one can still leak through as a faint ghost.` : "No station sits there right now, so there's nothing to leak through.");
  }, 260, { animated: false, label: "The FM band with the station you want, the oscillator, and the image frequency that would land on the same IF" });
  controls(s, ["im-f"], () => { el("im-fo").textContent = `${val("im-f").toFixed(1)} MHz`; });
}

// --- 3. The PLL calculator: the same arithmetic as src/r820t.ts (see src/course/pllmath.ts) -----------------------
function showPll(mhz: number, target: HTMLElement) {
  const p = pll(mhz * 1e6);
  if (!p) { target.innerHTML = `<em style="color:var(--red)">${mhz} MHz is outside this tuner's range (about 24 to 1766 MHz).</em>`; return; }
  target.innerHTML = `
    <ol class="pll">
      <li>Oscillator must run at <b>${mhz} + 3.57 = ${(p.lo / 1e6).toFixed(3)} MHz</b>.</li>
      <li>The VCO only works between 1.77 and 3.54 GHz, so multiply by the power of two that lands there: <b>× ${p.mixDiv} = ${(p.vco / 1e9).toFixed(5)} GHz</b>.</li>
      <li>The VCO is locked to the crystal: VCO ÷ (2 × 28.8 MHz) = <b>${(p.vco / (2 * XTAL)).toFixed(5)}</b> = integer <b>${p.nint}</b> + fraction <b>${p.sdm}</b>/65536.</li>
      <li>Written to the tuner: register 0x14 = <b>0x${p.reg14.toString(16).toUpperCase()}</b> (the integer, in an odd split form), registers 0x15/0x16 = <b>0x${p.sdm.toString(16).toUpperCase().padStart(4, "0")}</b> (the fraction), divider setting for ×${p.mixDiv}.</li>
      <li>Actual frequency: <b>${(p.actual / 1e6).toFixed(6)} MHz</b>, off by <b>${p.error.toFixed(1)} Hz</b>.</li>
    </ol>`;
}
{
  const inp = el("pl-f") as HTMLInputElement;
  const go = () => showPll(parseFloat(inp.value), el("r-pll"));
  inp.addEventListener("input", go); go();
}

// --- Lab: explore the tuner's whole range --------------------------------------------------------------------------------------
{
  let sp: Float32Array | null = null, center = 0, rate = 0, target = 0;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!sp) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    spectrum(g, w, h, sp, center, rate, target);
  }, 260, { animated: false, label: "Live spectrum at the chosen frequency" });
  document.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const f = el("lab12").querySelector(".lab-f") as HTMLInputElement; f.value = b.dataset.go!; f.dispatchEvent(new Event("change"));
  }));
  lab(el("lab12"), {
    freqMHz: 162.55,
    onSamples: (cu8, r, c, tgt) => { sp = spectrumOf(cu8, 512, 16); center = c; rate = r; target = tgt; s.redraw(); showPll(c / 1e6, el("r-labpll")); },
  });
}
