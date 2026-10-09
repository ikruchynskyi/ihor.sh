// Chapter 11: from numbers to speakers. Clocks that drift, rate conversion, automatic volume, squelch.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, line, label, dot } from "./anim.ts";
import { Agc, Squelch, AmDemod, Receiver, type Mode } from "../dsp.ts";
import { playOnce, LivePlayer } from "./audio.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const AUD = 8000;

// --- 1. Two clocks that never quite agree ---------------------------------------------------------------------------
{
  const s = new Scene(el("s-clock"), (g, w, h, t) => {
    const ppm = val("ck-p"), minutes = 240; // simulate 4 hours
    // Every second the dongle delivers 1 s × (1 + ppm·1e-6) of sound; the sound card plays exactly 1 s.
    const L = 50, R = w - 12, T = 16, B = h - 30, py = (ms: number) => B - (ms / 700) * (B - T), px = (min: number) => L + (min / minutes) * (R - L);
    for (const [ms, name, col] of [[600, "too far ahead: drop a chunk", C.red], [150, "target cushion", C.green], [50, "ran dry: refill", C.yellow]] as const) {
      line(g, L, py(ms), R, py(ms), col, 1, [4, 4]); label(g, name, R, py(ms) - 4, col, "right", 11);
    }
    label(g, "700 ms", L - 6, T + 4, C.muted, "right", 10); label(g, "0", L - 6, B + 4, C.muted, "right", 10);
    let level = 150, drops = 0, gaps = 0, firstAt = -1;
    g.strokeStyle = C.blue; g.lineWidth = 2; g.beginPath();
    for (let sec = 0; sec <= minutes * 60; sec += 10) {
      level += 10 * ppm * 1e-6 * 1000; // ms gained (or lost) in 10 seconds
      if (level > 600) { level -= 55; drops++; if (firstAt < 0) firstAt = sec; }
      if (level < 50) { level = 150; gaps++; if (firstAt < 0) firstAt = sec; }
      const x = px(sec / 60), y = py(level);
      sec ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    for (let m = 0; m <= minutes; m += 60) label(g, `${m / 60} h`, px(m), h - 10, C.muted, "center", 11);
    el("r-clock").innerHTML = ppm === 0 ? "Perfect clocks: the cushion never moves. (Real crystals are never perfect.)" :
      `In 4 hours: ${drops ? `<em style="color:var(--red)">${drops} dropped chunks</em> (a tiny skip each)` : ""}${gaps ? `<em class="y">${gaps} gaps</em> (a short silence each)` : ""}${!drops && !gaps ? "no glitches yet" : ""}` +
      (firstAt > 0 ? ` · first one after ${(firstAt / 60).toFixed(0)} minutes` : "");
    void t;
  }, 240, { animated: false, label: "The audio buffer slowly filling or draining when two clocks disagree" });
  controls(s, ["ck-p"], () => { const p = val("ck-p"); el("ck-po").textContent = `${p > 0 ? "+" : ""}${p} ppm`; });
}

// --- 2. Playing sound at a different rate: interpolation -----------------------------------------------------------------
{
  const s = new Scene(el("s-resample"), (g, w, h) => {
    const ratio = val("rs-r"), N = 18, L = 14, R = w - 14, mid = h / 2, sc = h * 0.34;
    const f = (t: number) => Math.sin(t * 0.55) + 0.35 * Math.sin(t * 1.7);
    const px = (t: number) => L + (t / (N - 1)) * (R - L);
    g.strokeStyle = "rgba(131,193,103,0.5)"; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath();
    for (let i = 0; i <= 300; i++) { const t = (i / 300) * (N - 1); i ? g.lineTo(px(t), mid - f(t) * sc) : g.moveTo(px(t), mid - f(t) * sc); }
    g.stroke(); g.setLineDash([]);
    for (let i = 0; i < N; i++) { line(g, px(i), mid, px(i), mid - f(i) * sc, "#2f5866", 1.5); dot(g, px(i), mid - f(i) * sc, C.blue, 4); }
    // new sample times, every `ratio` old samples: each value drawn on the straight line between its two neighbors
    let worst = 0;
    for (let t = 0; t <= N - 1.0001; t += ratio) {
      const i = Math.floor(t), frac = t - i, v = f(i) * (1 - frac) + f(i + 1) * frac;
      worst = Math.max(worst, Math.abs(v - f(t)));
      line(g, px(i), mid - f(i) * sc, px(i + 1), mid - f(i + 1) * sc, "rgba(244,211,94,0.25)", 1);
      dot(g, px(t), mid - v * sc, C.yellow, 4.5);
    }
    label(g, "blue: samples we have · yellow: samples the sound card wants, read off straight lines · green: the true sound", L, h - 8, C.muted, "left", 11);
    el("r-resample").innerHTML = `Biggest error of straight-line guessing here: <em class="y">${(worst * 100).toFixed(1)}%</em> of full scale. Browsers use smarter curves (and our samples are far closer together than these), so the error is far smaller in practice.`;
  }, 230, { animated: false, label: "Samples at one rate, and new samples at another rate estimated between them" });
  controls(s, ["rs-r"], () => { el("rs-ro").textContent = `${val("rs-r").toFixed(2)}`; });
}

// --- 3. Automatic volume (AGC) ------------------------------------------------------------------------------------------
{
  const n = 2400, fs = 1000;
  const s = new Scene(el("s-agc"), (g, w, h) => {
    const rel = val("ag-r");
    // a fading signal with loud and quiet passages
    const x = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const strength = 0.15 + 0.85 * Math.abs(Math.sin((TAU * k) / (n * 0.9))), passage = k % 800 < 400 ? 1 : 0.35;
      x[k] = strength * passage * Math.sin((TAU * 13 * k) / fs);
    }
    const agc = new Agc(fs, rel);
    const y = agc.process(x, 0.8);
    const lanes = [[x, "in: fading and changing loudness", C.blue], [y, `out: after automatic volume (release ${rel.toFixed(2)} s)`, C.yellow]] as const;
    lanes.forEach(([arr, name, col], li) => {
      const top = 16 + li * (h / 2), mid = top + h / 4 - 8, sc = h / 4 - 14;
      label(g, name, 12, top, col, "left", 11);
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
      for (let k = 0; k < n; k++) { const xx = 12 + (k / (n - 1)) * (w - 24); k ? g.lineTo(xx, mid - arr[k] * sc) : g.moveTo(xx, mid - arr[k] * sc); }
      g.stroke();
    });
  }, 260, { animated: false, label: "A signal with changing loudness before and after automatic gain control" });
  controls(s, ["ag-r"], () => { el("ag-ro").textContent = `${val("ag-r").toFixed(2)} s`; });
}

// --- 4. Squelch: silence between transmissions -------------------------------------------------------------------------------
function channel(sec: number) {
  // 8 kHz complex baseband: always noise, plus three "transmissions" (AM voice-like tones)
  const n = Math.floor(AUD * sec), x = new Float32Array(2 * n);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let k = 0; k < n; k++) {
    const t = k / AUD, on = (t > 0.4 && t < 1.2) || (t > 1.8 && t < 2.3) || (t > 2.9 && t < 3.6);
    const voice = 0.5 * Math.sin(TAU * 330 * t) * (0.6 + 0.4 * Math.sin(TAU * 3 * t));
    x[2 * k] = (on ? 0.6 * (1 + voice) : 0) + 0.25 * rnd();
    x[2 * k + 1] = 0.25 * rnd();
  }
  return x;
}
function squelched(threshold: number | null) {
  const x = channel(4), sq = new Squelch(threshold ?? -999), dem = new AmDemod(), out = new Float32Array(x.length / 2), levels: [number, boolean][] = [];
  for (let s0 = 0; s0 < x.length; s0 += 320) { // 20 ms chunks
    const c = x.subarray(s0, s0 + 320), open = sq.update(c), a = dem.process(c);
    levels.push([sq.level, open]);
    out.set(a.map((v) => (open ? v * 0.5 : 0)), s0 / 2);
  }
  return { out, levels };
}
{
  const s = new Scene(el("s-squelch"), (g, w, h) => {
    const thr = val("sq-t"), { levels } = squelched(thr);
    const L = 46, R = w - 12, T = 16, B = h - 60, lo = -20, hi = 0;
    const px = (i: number) => L + (i / (levels.length - 1)) * (R - L), py = (db: number) => B - ((Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * (B - T);
    line(g, L, py(thr), R, py(thr), C.red, 1.5, [5, 4]); label(g, "threshold", L - 4, py(thr) + 4, C.red, "right", 11);
    g.strokeStyle = C.blue; g.lineWidth = 2; g.beginPath(); levels.forEach(([db], i) => (i ? g.lineTo(px(i), py(db)) : g.moveTo(px(i), py(db)))); g.stroke();
    levels.forEach(([, open], i) => { g.fillStyle = open ? C.green : "#2a2f3a"; g.fillRect(px(i), B + 16, (R - L) / levels.length + 0.5, 16); });
    label(g, "channel strength", L, 12, C.blue, "left", 11); label(g, "sound on (green) / muted", L, h - 10, C.green, "left", 11);
  }, 220, { animated: false, label: "Channel strength over time, the squelch threshold, and when the sound is let through" });
  controls(s, ["sq-t"], () => { el("sq-to").textContent = `${val("sq-t")} dB`; });
  for (const [id, on] of [["sq-off", false], ["sq-on", true]] as const) {
    el(id).addEventListener("click", async (e) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; await playOnce(squelched(on ? val("sq-t") : null).out, AUD); b.disabled = false; });
  }
}

// --- Lab: the full receiver, with squelch and a signal meter ------------------------------------------------------------------
{
  let rx: Receiver | null = null, agc: Agc | null = null, sq: Squelch | null = null, key = "";
  const player = new LivePlayer();
  const meter = new Scene(el("s-lab"), (g, w, h) => {
    if (!sq) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const lo = -70, hi = 0, px = (db: number) => 12 + ((Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * (w - 24);
    g.fillStyle = sq.open ? C.green : C.blue; g.fillRect(12, h / 2 - 14, px(sq.level) - 12, 28);
    line(g, px(sq.threshold), 10, px(sq.threshold), h - 22, C.red, 2);
    label(g, `channel ${sq.level.toFixed(0)} dB · squelch ${sq.open ? "OPEN (sound on)" : "closed (muted)"}`, 12, 14, sq.open ? C.green : C.text, "left", 12);
    for (let db = lo; db <= hi; db += 10) label(g, `${db}`, px(db), h - 6, C.muted, "center", 10);
  }, 100, { animated: false, label: "Signal meter with the squelch threshold" });
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const [mhz, mode] = b.dataset.preset!.split(",");
    (el("lb-mode") as HTMLSelectElement).value = mode;
    const f = el("lab11").querySelector(".lab-f") as HTMLInputElement; f.value = mhz; f.dispatchEvent(new Event("change"));
  }));
  lab(el("lab11"), {
    freqMHz: 118.7, everyChunk: true,
    onSamples: (cu8, r, c, tgt) => {
      const mode = (el("lb-mode") as HTMLSelectElement).value as Mode, bw = mode === "WFM" ? 200e3 : mode === "NFM" ? 12.5e3 : mode === "AM" ? 10e3 : 2.8e3;
      const k = `${r}|${c}|${tgt}|${mode}`;
      if (!rx || k !== key) { rx = new Receiver(r, tgt - c, mode, bw); agc = new Agc(rx.audioFs); sq = new Squelch(); key = k; }
      sq!.threshold = val("lb-sq");
      const { channel, audio } = rx.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5));
      const open = (el("lb-sqon") as HTMLInputElement).checked ? sq!.update(channel) : (sq!.update(channel), true);
      const sound = agc!.process(audio, 0.3);
      player.push(open ? sound : new Float32Array(sound.length), rx.audioFs);
      meter.redraw();
    },
  });
  controls(meter, ["lb-sq"], () => { el("lb-sqo").textContent = `${val("lb-sq")} dB`; });
}
