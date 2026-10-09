// Chapter 5: moving a station. Mixing = multiplying by a spinning arrow.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label } from "./anim.ts";
import { mix, avgSpectrum, synth, DEMO_SIGNALS, Mixer } from "../dsp.ts";
import { spectrumOfIQ } from "../waterfall.ts";
import { spectrum } from "./plots.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const FS = 1.024e6;
const demo = synth(FS, 0.02, DEMO_SIGNALS); // FM at +200 kHz, AM at −150 kHz, USB tone at +350 kHz

/** A spectrum of the demo band from −512 to +512 kHz, with the center marked. */
function band(g: CanvasRenderingContext2D, x0: number, w: number, h: number, sp: Float32Array, note = "0 (the center)") {
  const lo = Math.min(...sp), hi = Math.max(...sp) + 3, n = sp.length, B = h - 24;
  const px = (i: number) => x0 + (i / (n - 1)) * w, py = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (B - 10);
  line(g, x0 + w / 2, 6, x0 + w / 2, B, C.pink, 1.5);
  g.strokeStyle = C.blue; g.lineWidth = 1.5; g.beginPath();
  sp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
  label(g, "−512 kHz", x0, h - 6, C.muted, "left", 11);
  label(g, note, x0 + w / 2, h - 6, C.pink, "center", 11);
  label(g, "+512 kHz", x0 + w, h - 6, C.muted, "right", 11);
}

// --- 1. Shift the band: one station's arrow slows to a stop -------------------------------------------
{
  const s = new Scene(el("s-shift"), (g, w, h, t) => {
    const f0 = val("sh-f");
    // left: the FM station's arrow in slow motion (100 kHz of offset = 1 turn per second on screen)
    const R = Math.min(h * 0.34, w * 0.13), cx = R + 24, cy = h / 2 - 6;
    const speed = (200 - f0) / 100, wob = 0.25; // the station's music wobbles its speed
    const angle = TAU * (speed * t - (wob / (TAU * 0.4)) * Math.cos(TAU * 0.4 * t));
    circle(g, cx, cy, R, C.grid);
    arrow(g, cx, cy, cx + R * Math.cos(angle), cy - R * Math.sin(angle), C.blue, 3);
    label(g, "the FM station's arrow", cx, h - 26, C.text, "center", 12);
    label(g, Math.abs(speed) < 0.01 ? "only the music's wobble left" : `spins at ${Math.abs(speed * 100).toFixed(0)} kHz ${speed > 0 ? "↺" : "↻"}`, cx, h - 8, C.yellow, "center", 12);
    // right: the whole band, shifted
    band(g, 2 * R + 60, w - 2 * R - 72, h, avgSpectrum(mix(demo, FS, f0), 512, 12));
  }, 280, { label: "One station's arrow slowing down as the whole band is shifted" });
  controls(s, ["sh-f"], () => {
    const f0 = val("sh-f");
    el("sh-fo").textContent = `${f0} kHz`;
    el("r-shift").innerHTML = f0 === 0 ? `No shift: the band as received. The FM station is at +200 kHz.` : f0 === 200 ? `The FM station now sits <em class="y">exactly at the center</em>.` :
      f0 === -150 ? `The AM station now sits <em class="y">exactly at the center</em>.` :
      `Every station moved ${f0 > 0 ? "down" : "up"} by ${Math.abs(f0)} kHz. The FM station is now at ${200 - f0 > 0 ? "+" : ""}${200 - f0} kHz.`;
  });
}

// --- 2. With one shadow, you get two copies -------------------------------------------------------------
{
  const s = new Scene(el("s-copies"), (g, w, h) => {
    const one = (el("cp-one") as HTMLInputElement).checked, f0 = 200e3;
    let out: Float32Array;
    if (one) { // multiply by cos only: the sideways shadow of the spinning arrow
      out = new Float32Array(demo.length);
      for (let k = 0; k < demo.length; k += 2) { const c = Math.cos((TAU * f0 * (k / 2)) / FS); out[k] = demo[k] * c; out[k + 1] = demo[k + 1] * c; }
    } else out = mix(demo, FS, f0);
    band(g, 12, w - 24, h, avgSpectrum(out, 512, 12));
  }, 240, { animated: false, label: "The band after mixing by 200 kHz, with a full arrow or with cosine only" });
  controls(s, ["cp-one"], () => {
    el("r-copies").innerHTML = (el("cp-one") as HTMLInputElement).checked
      ? `Multiplying by <em class="g">cos</em> alone: <em style="color:var(--red)">every station appears twice</em>, once shifted down by 200 kHz and once shifted up, each at half strength.`
      : `Multiplying by the full spinning arrow: every station appears <em class="y">once</em>, shifted down by 200 kHz.`;
  });
}

// --- 3. The NCO: a dial that steps ------------------------------------------------------------------------
{
  const s = new Scene(el("s-nco"), (g, w, h, t) => {
    const stepDeg = val("nc-s"), step = (stepDeg * Math.PI) / 180, n = Math.floor(t * 3) % 40;
    const R = Math.min(h * 0.36, w * 0.17), cx = R + 30, cy = h / 2;
    circle(g, cx, cy, R, C.grid); line(g, cx - R - 8, cy, cx + R + 8, cy, C.grid, 1); line(g, cx, cy - R - 8, cx, cy + R + 8, C.grid, 1);
    // the running angle, kept between −180° and +180°
    let ph = 0; const angles: number[] = [];
    for (let k = 0; k <= n; k++) { angles.push(ph); ph += step; if (ph > Math.PI) ph -= TAU; else if (ph < -Math.PI) ph += TAU; }
    angles.forEach((a, k) => dot(g, cx + R * Math.cos(a), cy - R * Math.sin(a), k === n ? C.yellow : "#3f6f80", k === n ? 6 : 3));
    const a = angles[n];
    arrow(g, cx, cy, cx + R * Math.cos(a), cy - R * Math.sin(a), C.blue, 3);
    label(g, `angle ${(a * 180 / Math.PI).toFixed(0)}°`, cx, h - 8, C.text, "center", 12);
    // the two shadows it produces, sample by sample
    const x0 = 2 * R + 70, gw = w - x0 - 12, rows = [[cy - R * 0.55, "cos (I)", C.green, Math.cos], [cy + R * 0.55, "sin (Q)", C.yellow, Math.sin]] as const;
    for (const [y, name, col, fn] of rows) {
      line(g, x0, y, w - 12, y, C.grid, 1); label(g, name, x0, y - R * 0.42, col, "left", 11);
      angles.forEach((ang, k) => { const x = x0 + (k / 40) * gw, v = fn(ang) * R * 0.38; line(g, x, y, x, y - v, col, 1.5); dot(g, x, y - v, col, 2.5); });
    }
  }, 280, { label: "A numerically controlled oscillator: an angle stepping around a dial and the cosine and sine it produces" });
  controls(s, ["nc-s"], () => { el("nc-so").textContent = `${val("nc-s")}° per sample`; });
}

// --- Lab: center a real station ----------------------------------------------------------------------------
{
  let raw: Float32Array | null = null, center = 0, rate = 0, target = 0;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!raw) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const f0 = val("lb-f") * 1e3;
    label(g, "as received", 12, 16, C.text, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(raw, 512, 16), center, rate, target, 26);
    g.save(); g.translate(0, h / 2);
    label(g, `after mixing by ${(f0 / 1e3).toFixed(0)} kHz (the center line is the new 0)`, 12, 16, C.yellow, "left", 12);
    spectrum(g, w, h / 2, spectrumOfIQ(new Mixer(rate, f0).process(raw), 512, 16), center + f0, rate, false, 26);
    g.restore();
    line(g, w / 2, h / 2 + 22, w / 2, h - 28, C.pink, 1.5);
  }, 440, { animated: false, label: "Live spectrum before and after mixing" });
  controls(s, ["lb-f"], () => { el("lb-fo").textContent = `${val("lb-f")} kHz`; });
  lab(el("lab5"), {
    freqMHz: 98.7,
    onSamples: (cu8, r, c, tgt) => {
      raw = Float32Array.from(cu8.subarray(0, 2 * 512 * 16), (v) => (v - 127.5) / 127.5);
      center = c; rate = r; target = tgt; s.redraw();
    },
  });
}
