// Chapter 10: AM, SSB and Morse. Sound in the arrow's length, in one sideband, or in on/off keying.
import "./course.css";
import { C, TAU, Scene, controls, val, arrow, circle, line, label } from "./anim.ts";
import { SsbDemod, Receiver, Agc, avgSpectrum, type Mode } from "../dsp.ts";
import { playOnce, LivePlayer } from "./audio.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const AUD = 8000; // the audio demos use 8000 samples per second

// --- 1. AM: the sound is in the length ---------------------------------------------------------------------------
{
  const N = 300;
  const s = new Scene(el("s-am"), (g, w, h, t) => {
    const depth = val("am-d"), fade = (el("am-f") as HTMLInputElement).checked;
    const msg = (k: number) => Math.sin((TAU * 3 * k) / N);
    const strength = (k: number) => (fade ? 0.35 + 0.65 * Math.abs(Math.cos((TAU * k) / (N * 1.6))) : 1);
    const len = (k: number) => strength(k) * (1 + depth * msg(k)) / (1 + depth);
    const shown = still ? N - 1 : Math.floor((t * 50) % N);
    // left: the arrow (centered station, so it turns only slowly), its length breathing with the music
    const R = Math.min(h * 0.4, w * 0.16), cx = R + 24, cy = h / 2, a = t * 0.6;
    circle(g, cx, cy, R, C.grid);
    arrow(g, cx, cy, cx + R * len(shown) * Math.cos(a), cy - R * len(shown) * Math.sin(a), C.blue, 3);
    // right: the arrow's length over time (the demodulator's output) vs the music
    const X0 = 2 * R + 60, X1 = w - 12, B = h - 26, T = 14, px = (k: number) => X0 + (k / (N - 1)) * (X1 - X0), py = (v: number) => B - v * (B - T);
    g.strokeStyle = "rgba(131,193,103,0.7)"; g.setLineDash([4, 4]); g.lineWidth = 1.5; g.beginPath();
    for (let k = 0; k < N; k++) { const v = (1 + depth * msg(k)) / (1 + depth); k ? g.lineTo(px(k), py(v)) : g.moveTo(px(k), py(v)); }
    g.stroke(); g.setLineDash([]);
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    for (let k = 0; k <= shown; k++) (k ? g.lineTo(px(k), py(len(k))) : g.moveTo(px(k), py(len(k))));
    g.stroke();
    line(g, X0, B, X1, B, C.grid, 1);
    label(g, "yellow: the arrow's length (what an AM receiver plays) · green: the music", X0, h - 6, C.muted, "left", 11);
  }, 260, { label: "An AM arrow whose length follows the music, and its length over time" });
  controls(s, ["am-d", "am-f"], () => {
    const d = val("am-d");
    el("am-do").textContent = `${Math.round(d * 100)}%`;
    const carrier = 1 / (1 + (d * d) / 2);
    el("r-am").innerHTML = `At ${Math.round(d * 100)}% modulation, <em style="color:var(--red)">${Math.round(carrier * 100)}%</em> of the transmitter's power goes into the steady carrier, which carries no sound at all.`;
  });
}

// --- 2. The AM spectrum: carrier + two mirror-image sidebands --------------------------------------------------------
{
  // An AM "voice" at 0 Hz: three tones (300, 700, 1200 Hz), sampled at 8 kHz.
  const n = 8192, x = new Float32Array(2 * n);
  for (let k = 0; k < n; k++) {
    const voice = 0.4 * Math.sin((TAU * 300 * k) / AUD) + 0.3 * Math.sin((TAU * 700 * k) / AUD) + 0.2 * Math.sin((TAU * 1200 * k) / AUD);
    x[2 * k] = 1 + 0.8 * voice; // AM: length = 1 + voice (the arrow points steadily right)
  }
  const s = new Scene(el("s-amspec"), (g, w, h) => {
    const ssb = (el("as-s") as HTMLSelectElement).value;
    let sig = x;
    if (ssb !== "am") {
      // keep one side only (what single sideband transmits): remove the carrier, and one half of the spectrum
      sig = new Float32Array(2 * n);
      for (let k = 0; k < n; k++) {
        let I = 0, Q = 0;
        for (const [f, a] of [[300, 0.4], [700, 0.3], [1200, 0.2]]) { const ff = ssb === "usb" ? f : -f; I += 0.4 * a * Math.cos((TAU * ff * k) / AUD); Q += 0.4 * a * Math.sin((TAU * ff * k) / AUD); }
        sig[2 * k] = I; sig[2 * k + 1] = Q;
      }
    }
    const sp = avgSpectrum(sig, 512, 12), top = 0, lo = -70;
    const L = 12, R = w - 12, T = 16, B = h - 26, px = (i: number) => L + (i / 511) * (R - L), py = (v: number) => B - ((Math.max(lo, v) - lo) / (top - lo + 4)) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1.6; g.beginPath(); sp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
    line(g, (L + R) / 2, T, (L + R) / 2, B, C.grid, 1, [3, 3]);
    if (ssb === "am") { label(g, "carrier", (L + R) / 2, T + 4, C.red, "center", 12); label(g, "lower sideband", L + (R - L) * 0.33, T + 4, C.pink, "center", 12); label(g, "upper sideband", L + (R - L) * 0.67, T + 4, C.green, "center", 12); }
    else label(g, ssb === "usb" ? "upper sideband only" : "lower sideband only", ssb === "usb" ? L + (R - L) * 0.67 : L + (R - L) * 0.33, T + 4, ssb === "usb" ? C.green : C.pink, "center", 12);
    label(g, "−4 kHz", L, h - 8, C.muted, "left", 11); label(g, "0", (L + R) / 2, h - 8, C.muted, "center", 11); label(g, "+4 kHz", R, h - 8, C.muted, "right", 11);
  }, 230, { animated: false, label: "The spectrum of an AM signal (carrier and two sidebands) or of single sideband" });
  controls(s, ["as-s"]);
}

// --- 3. SSB: hear what mistuning does ---------------------------------------------------------------------------------
function melody(mistuneHz: number, upper: boolean) {
  // A little three-note phrase sent as upper (or lower) sideband, received with a tuning error.
  const sec = 2.4, n = Math.floor(AUD * sec), x = new Float32Array(2 * n), notes = [392, 523, 659, 523];
  for (let k = 0; k < n; k++) {
    const f0 = notes[Math.floor((k / n) * notes.length)], env = Math.min(1, ((k / AUD) % (sec / notes.length)) * 20);
    for (const [mult, a] of [[1, 0.5], [2, 0.2], [3, 0.1]]) {
      const f = (upper ? 1 : -1) * f0 * mult + mistuneHz; // the receiver's tuning error shifts every component
      x[2 * k] += env * a * Math.cos((TAU * f * k) / AUD); x[2 * k + 1] += env * a * Math.sin((TAU * f * k) / AUD);
    }
  }
  const out = new SsbDemod(AUD, 2800, upper).process(x);
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  return out.map((v) => (v / peak) * 0.3);
}
{
  const s = new Scene(el("s-ssb"), (g, w, h) => {
    const off = val("ss-m");
    const notes = [392, 523, 659], L = 12, R = w - 12, B = h - 26, px = (f: number) => L + (f / 2500) * (R - L);
    line(g, L, B, R, B, C.axis, 1);
    for (const f of notes) {
      line(g, px(f), B, px(f), B - (h - 60) * 0.85, "rgba(131,193,103,0.6)", 2, [4, 4]);
      line(g, px(f + off), B, px(f + off), B - (h - 60) * 0.85, C.yellow, 3);
      for (const m of [2, 3]) if (f * m + off < 2500) line(g, px(f * m + off), B, px(f * m + off), B - (h - 60) * (m === 2 ? 0.35 : 0.18), C.yellow, 2);
    }
    for (let f = 0; f <= 2500; f += 500) label(g, `${f}`, px(f), h - 8, C.muted, "center", 11);
    label(g, "Hz", R, h - 8, C.muted, "right", 11);
    label(g, "green dashed: the notes as sent · yellow: as received (with their overtones)", L, 14, C.muted, "left", 11);
  }, 180, { animated: false, label: "Notes of a melody before and after a tuning error shifts them all by the same number of hertz" });
  controls(s, ["ss-m"], () => {
    const off = val("ss-m");
    el("ss-mo").textContent = `${off > 0 ? "+" : ""}${off} Hz`;
    el("r-ssb").innerHTML = off === 0 ? "Tuned exactly: every note and overtone is where it should be." :
      `Every component moved by ${off} Hz. The notes' <em>ratios</em> are broken: an overtone that should be exactly 2× its note is now ${((2 * 523 + off) / (523 + off)).toFixed(3)}×. That's the "Donald Duck" sound of a mistuned SSB voice.`;
  });
  for (const [id, fn] of [["ss-play", () => melody(val("ss-m"), true)], ["ss-play0", () => melody(0, true)]] as const) {
    el(id).addEventListener("click", async (e) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; await playOnce(fn(), AUD); b.disabled = false; });
  }
}

// --- 4. Morse: a carrier switched on and off --------------------------------------------------------------------------
{
  const code = "... --- ...   -.-. --.-"; // SOS CQ
  const unit = 0.06; // seconds per dot
  const timeline: number[] = []; // 1 = carrier on, per unit
  for (const ch of code) {
    if (ch === ".") timeline.push(1, 0); else if (ch === "-") timeline.push(1, 1, 1, 0); else timeline.push(0, 0);
  }
  const s = new Scene(el("s-cw"), (g, w, h) => {
    const L = 12, R = w - 12, px = (u: number) => L + (u / timeline.length) * (R - L), y = h / 2;
    timeline.forEach((on, u) => { if (on) { g.fillStyle = C.yellow; g.fillRect(px(u), y - 16, px(u + 1) - px(u) + 0.5, 32); } });
    line(g, L, y, R, y, C.grid, 1);
    label(g, "carrier on/off: · · ·   — — —   · · ·      — · — ·   — — · —", L, 20, C.muted, "left", 12);
    label(g, "S       O       S            C           Q", L, h - 10, C.text, "left", 12);
  }, 120, { animated: false, label: "Morse code: a carrier switched on for dots and dashes" });
  controls(s, ["cw-p"], () => { el("cw-po").textContent = `${val("cw-p")} Hz`; });
  el("cw-play").addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
    // The receiver mixes the carrier down to a few hundred hertz (the "beat" tone), so the on/off keying becomes audible.
    const pitch = val("cw-p"), n = Math.floor(timeline.length * unit * AUD), out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const u = Math.floor(k / (unit * AUD)), on = timeline[u] ?? 0, ramp = Math.min(1, ((k / AUD) % unit) * 200);
      out[k] = on * ramp * 0.3 * Math.sin((TAU * pitch * k) / AUD);
    }
    await playOnce(out, AUD); b.disabled = false;
  });
}

// --- Lab: real AM and narrow FM -----------------------------------------------------------------------------------------
{
  let rx: Receiver | null = null, agc: Agc | null = null, key = "";
  const player = new LivePlayer();
  const presets: Record<string, [number, Mode, number]> = {
    lga: [118.7, "AM", 10e3], jfk: [119.1, "AM", 10e3], noaa: [162.55, "NFM", 12.5e3], fm: [98.7, "WFM", 200e3],
  };
  const fIn = () => el("lab10").querySelector(".lab-f") as HTMLInputElement;
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const [mhz, mode] = presets[b.dataset.preset!];
    (el("lb-mode") as HTMLSelectElement).value = mode;
    const f = fIn(); f.value = String(mhz); f.dispatchEvent(new Event("change"));
  }));
  lab(el("lab10"), {
    freqMHz: 118.7, everyChunk: true,
    onSamples: (cu8, r, c, tgt) => {
      const mode = (el("lb-mode") as HTMLSelectElement).value as Mode, bw = mode === "WFM" ? 200e3 : mode === "NFM" ? 12.5e3 : mode === "AM" ? 10e3 : 2.8e3;
      const k = `${r}|${c}|${tgt}|${mode}`;
      if (!rx || k !== key) { rx = new Receiver(r, tgt - c, mode, bw); agc = new Agc(rx.audioFs); key = k; }
      const out = rx.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5)).audio;
      // FM: the output is the speed, so a fixed scale works. AM/SSB: the level depends on signal strength, so use automatic volume.
      const fm = mode === "WFM" || mode === "NFM", k2 = rx.chanFs / (TAU * (mode === "WFM" ? 75e3 : 5e3)) * 0.4;
      player.push(fm ? out.map((v) => Math.max(-1, Math.min(1, v * k2))) : agc!.process(out, 0.3), rx.audioFs);
      el("r-lab").textContent = `${mode} at ${(tgt / 1e6).toFixed(3)} MHz · ${(player.buffered * 1000).toFixed(0)} ms of sound queued`;
    },
  });
}
