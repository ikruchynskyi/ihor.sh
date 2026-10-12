// Meteor-M pass recorder: the dongle's samples around 137.9 / 137.1 MHz, shifted to 0 Hz, cut down to ~240 kS/s,
// shown as a waterfall and kept as an 8-bit IQ file you can save and decode into a picture (SatDump's "METEOR M2-x LRPT").
import "./ham/ham.css";
import { lab } from "./course/lab.ts";
import { Mixer, FirDecimator, firLowpass } from "./dsp.ts";
import { spectrumOfIQ, Waterfall } from "./waterfall.ts";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el("status"), cv = el<HTMLCanvasElement>("wf"), g = cv.getContext("2d")!, wf = new Waterfall(512, 300);
let chain: { key: string; mix: Mixer; dec: FirDecimator; fs: number } | null = null;
let chunks: Uint8Array[] = [], bytes = 0, recording = false, outFs = 0, rms = 0.05;

el<HTMLSelectElement>("sat").addEventListener("change", () => {
  const f = el("rd-lab").querySelector<HTMLInputElement>(".lab-f")!;
  f.value = el<HTMLSelectElement>("sat").value; f.dispatchEvent(new Event("change"));
});

lab(el("rd-lab"), {
  freqMHz: 137.9, everyChunk: true,
  onSamples: (cu8, rate, center, target) => {
    const key = `${rate}|${center}|${target}`;
    if (!chain || chain.key !== key) {
      const m = Math.max(1, Math.floor(rate / 200e3)); // 1.2 MS/s → 240k, 1.024 MS/s → 256k: room for the 120 kHz signal ± Doppler
      chain = { key, mix: new Mixer(rate, target - center), dec: new FirDecimator(firLowpass(80e3 / rate, 40e3 / rate), m, 2), fs: rate / m };
      if (recording && outFs && outFs !== chain.fs) stopRec(); // ponytail: a rate change mid-pass ends the file rather than resampling
    }
    const iq = chain.dec.process(chain.mix.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5)));
    wf.push(spectrumOfIQ(iq, 512, 8));
    if (!recording) return;
    // slow AGC: keep the RMS around 32 counts so the weak signal uses the bytes' range without clipping
    let p = 0; for (const v of iq) p += v * v; rms = 0.9 * rms + 0.1 * Math.sqrt(p / iq.length || 1e-12);
    const k = 32 / rms, out = new Uint8Array(iq.length);
    for (let i = 0; i < iq.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(127.5 + iq[i] * k)));
    chunks.push(out); bytes += out.length; outFs = chain.fs;
    status.textContent = `Recording: ${(bytes / 2 / outFs).toFixed(0)} s, ${(bytes / 1e6).toFixed(0)} MB at ${outFs / 1000} kS/s.`;
  },
});

function draw() {
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height); wf.draw(g, 0, 0, cv.width, cv.height);
  g.strokeStyle = "#f4d35e"; g.globalAlpha = 0.5; // where a 72k-symbol LRPT signal sits (±60 kHz) at this rate
  if (chain) for (const f of [-60e3, 60e3]) { const x = (0.5 + f / chain.fs) * cv.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
  g.globalAlpha = 1; requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function stopRec() {
  recording = false; el("rec").textContent = "Start recording";
  if (!bytes) { status.textContent = "Nothing recorded (is the dongle running?)."; return; }
  const name = `meteor-${el<HTMLSelectElement>("sat").value}MHz-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}-${outFs}sps.cu8`;
  const url = URL.createObjectURL(new Blob(chunks as BlobPart[]));
  el("saves").insertAdjacentHTML("afterbegin", `<li><a href="${url}" download="${name}">${name}</a> · ${(bytes / 2 / outFs / 60).toFixed(1)} min, ${(bytes / 1e6).toFixed(0)} MB</li>`);
  status.textContent = `Saved below. Decode it in SatDump: baseband, format cu8, sample rate ${outFs}.`;
  chunks = []; bytes = 0;
}
el("rec").addEventListener("click", () => {
  if (recording) return stopRec();
  recording = true; chunks = []; bytes = 0; outFs = 0; el("rec").textContent = "Stop and save";
  status.textContent = "Recording… start the dongle above if it isn't running.";
});
