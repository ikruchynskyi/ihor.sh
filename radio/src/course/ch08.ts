// Chapter 8: chunks of a live stream. Every block must remember the end of the previous chunk.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, line, label } from "./anim.ts";
import { synth, Mixer, FirDecimator, FmDemod, Deemphasis, firLowpass, Receiver } from "../dsp.ts";
import { playOnce, LivePlayer } from "./audio.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const FS = 960e3, M1 = 4, M2 = 5, CH = FS / M1, AUD = CH / M2; // 960 kS/s → 240 kS/s → 48 kS/s
type Forget = "none" | "mixer" | "filter" | "demod" | "all";

// A pretend FM station 50 kHz above center, playing a 700 Hz tone. Two seconds of it.
const station = synth(FS, 2, [{ kind: "FM", offset: 50e3, tone: 700, amp: 0.6 }], 0.01);
const taps1 = firLowpass(100e3 / FS, (CH - 200e3) / FS), taps2 = firLowpass(15e3 / CH, (AUD / 2 - 15e3) / CH);

/** The receiver's chain, fed chunk by chunk. `forget` names a block that is rebuilt (memory wiped) for every chunk. */
function run(seconds: number, chunkMs: number, forget: Forget): { audio: Float32Array; edges: number[] } {
  const n = Math.floor(FS * seconds), chunk = Math.max(64, Math.round((FS * chunkMs) / 1000));
  const make = {
    mixer: () => new Mixer(FS, 50e3), filter: () => new FirDecimator(taps1, M1, 2), demod: () => new FmDemod(),
    de: () => new Deemphasis(CH), audio: () => new FirDecimator(taps2, M2, 1),
  };
  let mixer = make.mixer(), filter = make.filter(), demod = make.demod(), de = make.de(), audio = make.audio();
  const parts: Float32Array[] = [], edges: number[] = [];
  let produced = 0;
  for (let s = 0; s < n; s += chunk) {
    if (s > 0) {
      edges.push(produced);
      if (forget === "mixer" || forget === "all") mixer = make.mixer();
      if (forget === "filter" || forget === "all") { filter = make.filter(); audio = make.audio(); de = make.de(); }
      if (forget === "demod" || forget === "all") demod = make.demod();
    }
    const x = station.subarray(2 * s, 2 * Math.min(n, s + chunk));
    const a = audio.process(de.process(demod.process(filter.process(mixer.process(x)))));
    parts.push(a); produced += a.length;
  }
  const out = new Float32Array(produced); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  const k = CH / (2 * Math.PI * 75e3); // 75 kHz of deviation → ±1
  return { audio: out.map((v) => Math.max(-1, Math.min(1, v * k))), edges };
}

// --- The scene: the decoded tone, with chunk edges marked ------------------------------------------------------
{
  const s = new Scene(el("s-chunks"), (g, w, h) => {
    const forget = (el("ck-f") as HTMLSelectElement).value as Forget, ms = val("ck-ms");
    const { audio, edges } = run(0.08, ms, forget);
    const from = Math.round(AUD * 0.02), to = Math.round(AUD * 0.07); // skip the first 20 ms (filters filling up)
    const L = 10, R = w - 10, px = (i: number) => L + ((i - from) / (to - from)) * (R - L), cy = h / 2, sc = h * 0.38;
    line(g, L, cy, R, cy, C.grid, 1);
    for (const e of edges) if (e > from && e < to) { line(g, px(e), 10, px(e), h - 22, C.pink, 1, [4, 4]); }
    g.strokeStyle = C.yellow; g.lineWidth = 1.8; g.beginPath();
    for (let i = from; i < to; i++) (i === from ? g.moveTo(px(i), cy - audio[i] * sc * 0.8) : g.lineTo(px(i), cy - audio[i] * sc * 0.8));
    g.stroke();
    label(g, "pink dashed lines: where one chunk ends and the next begins", L, h - 6, C.pink, "left", 11);
    label(g, "50 ms of decoded sound", R, h - 6, C.muted, "right", 11);
  }, 260, { animated: false, label: "A decoded tone with chunk boundaries marked; forgetting state causes glitches at the boundaries" });
  controls(s, ["ck-f", "ck-ms"], () => { el("ck-mso").textContent = `${val("ck-ms")} ms`; });
  for (const id of ["ck-play", "ck-play-good"]) {
    el(id).addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement, forget = id === "ck-play-good" ? "none" : ((el("ck-f") as HTMLSelectElement).value as Forget);
      btn.disabled = true;
      await playOnce(run(2, val("ck-ms"), forget).audio.map((v) => v * 0.3), AUD);
      btn.disabled = false;
    });
  }
}

// --- Latency: what a chunk costs in delay ---------------------------------------------------------------------------
{
  const s = new Scene(el("s-delay"), (g, w, h) => {
    const ms = val("dl-ms"), filterMs = ((taps1.length / 2) / FS + (taps2.length / 2) / CH) * 1000, cushion = 150;
    const parts: [string, number, string][] = [["waiting for a full chunk", ms, C.blue], ["filters' delay", filterMs, C.green], ["audio cushion", cushion, C.pink]];
    const total = parts.reduce((a, p) => a + p[1], 0), scale = (w - 20) / Math.max(total, 450);
    let x = 10;
    parts.forEach(([name, v, col], i) => {
      g.fillStyle = col; g.fillRect(x, 30, v * scale, 34);
      label(g, `${name}: ${v.toFixed(v < 10 ? 1 : 0)} ms`, x + 2, 84 + i * 18, col, "left", 12);
      x += v * scale;
    });
    label(g, `antenna → speaker: about ${total.toFixed(0)} ms`, 10, 20, C.text, "left", 13);
  }, 150, { animated: false, label: "The delay from antenna to speaker, made of chunk size, filter delay and audio cushion" });
  controls(s, ["dl-ms"], () => { el("dl-mso").textContent = `${val("dl-ms")} ms`; });
}

// --- Lab: hear it on live radio ------------------------------------------------------------------------------------------
{
  let rx: Receiver | null = null, key = "";
  const player = new LivePlayer();
  lab(el("lab8"), {
    freqMHz: 98.7,
    everyChunk: true,
    onSamples: (cu8, r, c, tgt) => {
      const forget = (el("lb-forget") as HTMLInputElement).checked, k = `${r}|${c}|${tgt}`;
      if (!rx || forget || k !== key) { rx = new Receiver(r, tgt - c, "WFM", 200e3); key = k; }
      const x = Float32Array.from(cu8, (v) => (v - 127.5) / 127.5);
      const a = rx.process(x).audio, g = rx.chanFs / (2 * Math.PI * 75e3) * 0.4;
      player.push(a.map((v) => Math.max(-1, Math.min(1, v * g))), rx.audioFs);
      el("r-lab").textContent = `${forget ? "Forgetting at every chunk edge" : "Remembering across chunks"} · ${(player.buffered * 1000).toFixed(0)} ms of sound queued`;
    },
  });
}
