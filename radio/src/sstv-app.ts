// The SSTV decoder page: four sources (built-in transmitter, audio file, microphone, dongle) feeding one decoder.
import "./ham/ham.css";
import { MODES, encode, SstvDecoder, durationS, type Mode } from "./sstv.ts";
import { lab } from "./course/lab.ts";
import { LivePlayer } from "./course/audio.ts";
import { Receiver } from "./dsp.ts";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pic = el<HTMLCanvasElement>("pic"), pg = pic.getContext("2d")!, status = el("status");
const track = el<HTMLCanvasElement>("track"), tg = track.getContext("2d")!;
let dec: SstvDecoder | null = null, stopCurrent: () => void = () => {};

// --- the decoder and its display --------------------------------------------------------------------------------------------
function newDecoder(fs: number) {
  dec = new SstvDecoder(fs, {
    onMode: (m) => { pic.width = m.width; pic.height = m.height; pg.fillStyle = "#000"; pg.fillRect(0, 0, m.width, m.height); status.textContent = `${m.name} picture coming in (${m.width}×${m.height}, about ${Math.round(durationS(m))} s)…`; },
    onLine: (y, row, m) => { pg.putImageData(new ImageData(row as Uint8ClampedArray<ArrayBuffer>, m.width, 1), 0, y); status.textContent = `${m.name}: line ${y + 1} of ${m.height}`; },
    onDone: (m) => { status.textContent = `${m.name} picture received. Listening for the next one.`; addToGallery(m); },
  });
  dec.slantCorrection = el<HTMLInputElement>("slant").checked;
  return dec;
}
el("slant").addEventListener("change", () => { if (dec) dec.slantCorrection = el<HTMLInputElement>("slant").checked; });

function addToGallery(m: Mode) {
  const url = pic.toDataURL("image/png"), g = el("gallery");
  g.querySelector("p")?.remove();
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  g.insertAdjacentHTML("afterbegin", `<figure><a href="${url}" download="sstv-${m.name.replace(" ", "")}-${stamp.replace(/[: ]/g, "")}.png"><img src="${url}" alt="Received ${m.name} picture"></a><figcaption>${m.name} · ${stamp}</figcaption></figure>`);
}

// The pitch over the last two seconds, with the meaningful frequencies marked.
function drawTrack() {
  const w = track.width, h = track.height;
  tg.fillStyle = "#14171d"; tg.fillRect(0, 0, w, h);
  const py = (f: number) => h - ((f - 1000) / 1500) * h;
  for (const [f, name, col] of [[1200, "sync 1200", "#e07a9f"], [1500, "black 1500", "#8a93a3"], [1900, "1900", "#4a5262"], [2300, "white 2300", "#ece6e2"]] as const) {
    tg.strokeStyle = col; tg.globalAlpha = 0.5; tg.beginPath(); tg.moveTo(0, py(f)); tg.lineTo(w, py(f)); tg.stroke(); tg.globalAlpha = 1;
    tg.fillStyle = col; tg.font = "11px ui-sans-serif, system-ui"; tg.fillText(name, 4, py(f) - 3);
  }
  if (dec) {
    const n1 = dec.position, n0 = n1 - dec.rate * 2;
    tg.strokeStyle = "#f4d35e"; tg.lineWidth = 1.2; tg.beginPath();
    for (let x = 0; x < w; x++) { const f = dec.freqAt(n0 + ((n1 - n0) * x) / w); if (Number.isNaN(f)) continue; const y = py(Math.max(1000, Math.min(2500, f))); x ? tg.lineTo(x, y) : tg.moveTo(x, y); }
    tg.stroke();
  }
  requestAnimationFrame(drawTrack);
}
requestAnimationFrame(drawTrack);

/** Feed a whole recording faster than real time, a slice per frame, so the picture still visibly builds up. */
function feedFast(audio: Float32Array, fs: number) {
  const d = newDecoder(fs); let i = 0, live = true;
  const step = () => { if (!live) return; const n = Math.round(fs * 1.5); d.push(audio.subarray(i, i + n)); i += n; if (i < audio.length) requestAnimationFrame(step); else { d.flush(); if (!d.mode && !el("gallery").querySelector("figure")) status.textContent = "Finished. No SSTV header found (check it's a full recording from the start)."; } };
  stopCurrent(); stopCurrent = () => { live = false; };
  requestAnimationFrame(step);
}

// --- source switching ---------------------------------------------------------------------------------------------------------
el("srcs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button"); if (!b) return;
  document.querySelectorAll<HTMLButtonElement>("#srcs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  document.querySelectorAll<HTMLElement>(".pane").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.src));
});

// --- 1. Built-in transmitter -------------------------------------------------------------------------------------------------
el("dm-mode").innerHTML = MODES.map((m, i) => `<option value="${i}" ${m.name === "Robot 36" ? "selected" : ""}>${m.name} (${Math.round(durationS(m))} s)</option>`).join("");
el("dm-clock").addEventListener("input", () => { el("dm-clocko").textContent = `${el<HTMLInputElement>("dm-clock").value}%`; });
let uploaded: HTMLImageElement | null = null;
el("dm-pic").addEventListener("change", () => { if (el<HTMLSelectElement>("dm-pic").value === "upload") el("dm-file").click(); });
el("dm-file").addEventListener("change", () => {
  const f = el<HTMLInputElement>("dm-file").files?.[0]; if (!f) return;
  const img = new Image(); img.onload = () => (uploaded = img); img.src = URL.createObjectURL(f);
});

function picture(m: Mode): Uint8ClampedArray {
  const c = document.createElement("canvas"); c.width = m.width; c.height = m.height;
  const g = c.getContext("2d")!, w = m.width, h = m.height, kind = el<HTMLSelectElement>("dm-pic").value;
  if (kind === "upload" && uploaded) { // cover the frame, cropping the excess
    const s = Math.max(w / uploaded.width, h / uploaded.height);
    g.drawImage(uploaded, (w - uploaded.width * s) / 2, (h - uploaded.height * s) / 2, uploaded.width * s, uploaded.height * s);
  } else if (kind === "sky") {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#1b2a6b"); sky.addColorStop(0.55, "#e86f3a"); sky.addColorStop(0.75, "#f6c35b"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffe9a8"; g.beginPath(); g.arc(w * 0.62, h * 0.68, h * 0.11, 0, 2 * Math.PI); g.fill();
    g.fillStyle = "#14171d"; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += w / 16) g.lineTo(x, h * (0.78 + 0.08 * Math.sin(x / w * 9) + 0.04 * Math.sin(x / w * 23))); g.lineTo(w, h); g.fill();
    g.fillStyle = "#fff"; g.font = `bold ${Math.round(h / 12)}px ui-sans-serif, system-ui`; g.fillText("ihor.sh", w * 0.05, h * 0.15);
  } else {
    const bars = ["#fff", "#ff0", "#0ff", "#0f0", "#f0f", "#f00", "#00f", "#000"];
    bars.forEach((c2, i) => { g.fillStyle = c2; g.fillRect((i * w) / 8, 0, w / 8 + 1, h * 0.55); });
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(0, h * 0.55, w, h * 0.15);
    g.fillStyle = "#14171d"; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = "#f4d35e"; g.font = `bold ${Math.round(h / 9)}px ui-sans-serif, system-ui`; g.fillText(m.name, w * 0.05, h * 0.86);
    g.fillStyle = "#fff"; g.font = `${Math.round(h / 16)}px ui-sans-serif, system-ui`; g.fillText("ihor.sh/radio", w * 0.05, h * 0.95);
    g.strokeStyle = "#fff"; g.lineWidth = Math.max(1, w / 320); g.beginPath(); g.arc(w * 0.82, h * 0.85, h * 0.1, 0, 2 * Math.PI); g.moveTo(w * 0.82 - h * 0.14, h * 0.85); g.lineTo(w * 0.82 + h * 0.14, h * 0.85); g.stroke();
  }
  return g.getImageData(0, 0, w, h).data;
}

el("dm-go").addEventListener("click", () => {
  const m = MODES[+el<HTMLSelectElement>("dm-mode").value], sound = el<HTMLInputElement>("dm-sound").checked;
  const fs = sound ? 48000 : 11025, clock = 1 + +el<HTMLInputElement>("dm-clock").value / 100, nz = +el<HTMLInputElement>("dm-noise").value;
  status.textContent = "Encoding…";
  setTimeout(() => {
    let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    const audio = encode(m, picture(m), fs, clock).map((v) => 0.6 * v + nz * 0.6 * rnd());
    if (!sound) { feedFast(audio, fs); return; }
    // real time: play it, and feed the decoder whatever has been played so far
    const ctx = new AudioContext({ sampleRate: fs }), buf = ctx.createBuffer(1, audio.length, fs);
    buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    const d = newDecoder(fs), t0 = ctx.currentTime + 0.1; let fed = 0, live = true;
    src.start(t0);
    const step = () => { if (!live) return; const upto = Math.min(audio.length, Math.round((ctx.currentTime - t0) * fs)); if (upto > fed) { d.push(audio.subarray(fed, upto)); fed = upto; } if (fed < audio.length) requestAnimationFrame(step); else d.flush(); };
    stopCurrent(); stopCurrent = () => { live = false; src.stop(); ctx.close(); };
    requestAnimationFrame(step);
  }, 20);
});

// --- 2. Audio file ----------------------------------------------------------------------------------------------------------
el("fl-file").addEventListener("change", async () => {
  const f = el<HTMLInputElement>("fl-file").files?.[0]; if (!f) return;
  status.textContent = `Reading ${f.name}…`;
  try {
    const ctx = new AudioContext(), buf = await ctx.decodeAudioData(await f.arrayBuffer());
    const mono = buf.getChannelData(0);
    status.textContent = `${f.name}: ${buf.duration.toFixed(0)} s at ${buf.sampleRate} Hz. Looking for SSTV…`;
    feedFast(mono, buf.sampleRate); ctx.close();
  } catch (e) { status.textContent = `Couldn't read that file: ${(e as Error).message}`; }
});

// --- 3. Microphone -----------------------------------------------------------------------------------------------------------
const WORKLET = `registerProcessor("tap", class extends AudioWorkletProcessor { process(i) { if (i[0] && i[0][0]) this.port.postMessage(i[0][0].slice(0)); return true; } });`;
el("mc-go").addEventListener("click", async () => {
  const btn = el<HTMLButtonElement>("mc-go");
  if (btn.dataset.on) { stopCurrent(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    const node = new AudioWorkletNode(ctx, "tap"), d = newDecoder(ctx.sampleRate);
    node.port.onmessage = (e) => d.push(e.data as Float32Array);
    ctx.createMediaStreamSource(stream).connect(node);
    stopCurrent(); btn.dataset.on = "1"; btn.textContent = "Stop listening"; status.textContent = "Listening. Play an SSTV signal near the microphone.";
    stopCurrent = () => { stream.getTracks().forEach((t) => t.stop()); ctx.close(); delete btn.dataset.on; btn.textContent = "Start listening"; status.textContent = "Stopped."; };
  } catch (e) { status.textContent = `No microphone: ${(e as Error).message}`; }
});

// --- 4. Radio --------------------------------------------------------------------------------------------------------------------
{
  let rx: Receiver | null = null, key = "", d: SstvDecoder | null = null;
  const player = new LivePlayer();
  lab(el("rd-lab"), {
    freqMHz: 145.8, everyChunk: true,
    onStart: () => { stopCurrent(); stopCurrent = () => {}; },
    onSamples: (cu8, rate, center, target) => {
      const k = `${rate}|${center}|${target}`;
      if (!rx || k !== key) { rx = new Receiver(rate, target - center, "NFM", 15e3); key = k; d = newDecoder(rx.audioFs); status.textContent = "Listening on the radio. Waiting for an SSTV header…"; }
      const { audio } = rx.process(Float32Array.from(cu8, (v) => (v - 127.5) / 127.5));
      d!.push(audio);
      if (el<HTMLInputElement>("rd-sound").checked) { let pk = 1e-6; for (const v of audio) pk = Math.max(pk, Math.abs(v)); player.push(audio.map((v) => (0.5 * v) / pk), rx.audioFs); }
    },
  });
}
