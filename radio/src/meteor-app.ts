// Meteor-M pass recorder: the dongle's samples around 137.9 / 137.1 MHz, shifted to 0 Hz, cut down to ~240 kS/s,
// shown as a waterfall and kept as an 8-bit IQ file you can save and decode into a picture (SatDump's "METEOR M2-x LRPT").
import "./ham/ham.css";
import { lab } from "./course/lab.ts";
import { Mixer, FirDecimator, firLowpass } from "./dsp.ts";
import { spectrumOfIQ, Waterfall } from "./waterfall.ts";
import { MeteorReceiver, WIDTH } from "./meteor.ts";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el("status"), cv = el<HTMLCanvasElement>("wf"), g = cv.getContext("2d")!, wf = new Waterfall(512, 300);
let chain: { key: string; mix: Mixer; dec: FirDecimator; fs: number } | null = null, rx: MeteorReceiver | null = null;
// Recordings live in this tab's memory (about 30 MB a minute), never on the server: cap their length and how many are kept.
const MAX_REC_S = 20 * 60, MAX_KEPT = 3;
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
    if (!decodingFile) { if (!rx || rx.fs !== chain.fs) newDecoder(chain.fs); rx!.push(iq); }
    if (!recording) return;
    // slow AGC: keep the RMS around 32 counts so the weak signal uses the bytes' range without clipping
    let p = 0; for (const v of iq) p += v * v; rms = 0.9 * rms + 0.1 * Math.sqrt(p / iq.length || 1e-12);
    const k = 32 / rms, out = new Uint8Array(iq.length);
    for (let i = 0; i < iq.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(127.5 + iq[i] * k)));
    chunks.push(out); bytes += out.length; outFs = chain.fs;
    if (bytes / 2 / outFs >= MAX_REC_S) { stopRec(); status.textContent += ` Stopped at ${MAX_REC_S / 60} minutes (longer than any pass).`; return; }
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
  el("saves").insertAdjacentHTML("afterbegin", `<li data-url="${url}" data-name="${name}"><a href="${url}" download="${name}">${name}</a> · ${(bytes / 2 / outFs / 60).toFixed(1)} min, ${(bytes / 1e6).toFixed(0)} MB · <button type="button" data-act="decode">Decode</button> <button type="button" data-act="delete">Delete</button></li>`);
  const kept = el("saves").querySelectorAll<HTMLElement>("li");
  for (let i = MAX_KEPT; i < kept.length; i++) { URL.revokeObjectURL(kept[i].dataset.url!); kept[i].remove(); }
  status.textContent = `Saved below: Decode turns it into pictures here, the link downloads it.${kept.length > MAX_KEPT ? ` (Only the last ${MAX_KEPT} are kept; download the ones you want.)` : ""}`;
  chunks = []; bytes = 0;
}
el("saves").addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]"), li = b?.closest<HTMLElement>("li"); if (!b || !li) return;
  const { url, name } = li.dataset as { url: string; name: string };
  if (b.dataset.act === "delete") { URL.revokeObjectURL(url); li.remove(); return; }
  decodeFile(await fetch(url).then((r) => r.blob()), name);
});
el("rec").addEventListener("click", () => {
  if (recording) return stopRec();
  recording = true; chunks = []; bytes = 0; outFs = 0; el("rec").textContent = "Stop and save";
  status.textContent = "Recording… start the dongle above if it isn't running.";
});

// --- the decoder: pictures per channel, the constellation, and the Doppler it is tracking ---------------------------------
const cg = el<HTMLCanvasElement>("iq").getContext("2d")!, drawn = new Map<number, number>();
function newDecoder(fs: number) {
  rx = new MeteorReceiver(fs); drawn.clear(); el("pics").innerHTML = "";
}
function paint() {
  if (!rx) return;
  const st = rx.stats, pk = rx.packets.stats;
  el("dstat").textContent = `${st.locked ? "🔒 locked" : "searching"} · offset ${(st.freqHz / 1000).toFixed(2)} kHz (Doppler + dongle error, tracked automatically) · ${st.frames} frames · ${pk.packets} packets · ${pk.images} picture strips`;
  cg.fillStyle = "#000"; cg.fillRect(0, 0, 160, 160); cg.fillStyle = st.locked ? "#4de1ff" : "#888";
  for (const [i, q] of rx.constellation.slice(-600)) cg.fillRect(80 + i * 50, 80 - q * 50, 1.5, 1.5);
  for (const [apid, ch] of rx.packets.channels) {
    let c = document.getElementById(`ch${apid}`) as HTMLCanvasElement | null;
    if (!c) { el("pics").insertAdjacentHTML("beforeend", `<figure><canvas id="ch${apid}" width="${WIDTH}" height="0"></canvas><figcaption>Channel ${apid - 63} (APID ${apid}) · <a href="#" data-save="${apid}">save PNG</a></figcaption></figure>`); c = document.getElementById(`ch${apid}`) as HTMLCanvasElement; drawn.set(apid, 0); }
    const need = ch.rows.length * 8;
    if (need > c.height) { // growing a canvas clears it: grow in steps, then repaint everything
      const g = c.getContext("2d")!, keep = c.height ? g.getImageData(0, 0, WIDTH, c.height) : null;
      c.height = need + 128; if (keep) g.putImageData(keep, 0, 0);
    }
    const g = c.getContext("2d")!;
    for (let r = Math.max(0, drawn.get(apid)! - 1); r < ch.rows.length; r++) { // the last row may have filled in since
      const img = new ImageData(WIDTH, 8), row = ch.rows[r];
      for (let i = 0; i < row.length; i++) { img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = row[i]; img.data[4 * i + 3] = 255; }
      g.putImageData(img, 0, r * 8);
    }
    drawn.set(apid, ch.rows.length);
  }
}
setInterval(paint, 1000);
el("pics").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-save]"); if (!a || !rx) return;
  e.preventDefault();
  const apid = +a.dataset.save!, src = el<HTMLCanvasElement>(`ch${apid}`), out = document.createElement("canvas");
  out.width = WIDTH; out.height = rx.packets.channels.get(apid)!.rows.length * 8; out.getContext("2d")!.drawImage(src, 0, 0);
  const link = document.createElement("a"); link.href = out.toDataURL("image/png"); link.download = `meteor-ch${apid - 63}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.png`; link.click();
});

// A saved recording (8-bit IQ centered on the satellite), decoded faster than real time.
let decodingFile = false;
el("file").addEventListener("change", () => { const f = el<HTMLInputElement>("file").files?.[0]; if (f) decodeFile(f, f.name); });
async function decodeFile(f: Blob, name: string) {
  if (decodingFile) { status.textContent = "Already decoding a recording; wait for it to finish."; return; }
  const fs = +(name.match(/(\d+)sps/)?.[1] ?? el<HTMLInputElement>("frate").value);
  decodingFile = true; newDecoder(fs);
  el("pics").scrollIntoView({ behavior: "smooth", block: "start" });
  const step = 4 << 20;
  for (let at = 0; at < f.size; at += step) {
    const b = new Uint8Array(await f.slice(at, at + step).arrayBuffer());
    rx!.push(Float32Array.from(b, (v) => (v - 127.5) / 127.5));
    status.textContent = `Decoding ${name}: ${((100 * Math.min(f.size, at + step)) / f.size).toFixed(0)}% (${fs / 1000} kS/s)`;
    await new Promise((r) => setTimeout(r));
  }
  decodingFile = false; paint();
  const n = rx!.packets.stats.images;
  status.textContent = n ? `Finished ${name}: ${n} picture strips.` : `Finished ${name}: no picture (${rx!.stats.frames ? "frames found but no image packets" : "the decoder never locked: the signal was too weak or absent"}).`;
}
