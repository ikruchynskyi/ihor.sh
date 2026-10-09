import { avgSpectrum, powerSpectrum, mix, freqResponse, receive, synth, Receiver, Agc, DEMO_SIGNALS, DEFAULT_BW, CW_PITCH, type Mode } from "./dsp.ts";
import { CwSignalDecoder } from "./cw.ts";
import { decodeCU8, decodeCF32, parseName } from "./iq.ts";
import { RtlSdr } from "./rtlsdr.ts";
import { RemoteSdr } from "./remote.ts";
import { GAINS } from "./r820t.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => parseFloat($<HTMLInputElement>(id).value);
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const N = 1024; // FFT size for every plot

let iq: Float32Array = new Float32Array(0);
let fs = 1.024e6;
let audio: { data: Float32Array; rate: number } | null = null;
let source: AudioBufferSourceNode | null = null;

function fitCanvas(c: HTMLCanvasElement) {
  const r = window.devicePixelRatio || 1;
  c.width = Math.round(c.clientWidth * r);
  c.height = Math.round(c.clientHeight * r);
  return c.getContext("2d")!;
}

function axis(id: string, span: number, unit = "kHz", div = 1e3) {
  const f = (v: number) => `${(v / div).toFixed(Math.abs(span / div) < 10 ? 1 : 0)} ${unit}`;
  $(id).innerHTML = `<span>${f(-span / 2)}</span><span>0</span><span>${f(span / 2)}</span>`;
}

/** Line plot. `series` share one y range so overlays line up. */
function plot(c: HTMLCanvasElement, series: { y: Float32Array; color: string }[], lo?: number, hi?: number) {
  const g = fitCanvas(c), w = c.width, h = c.height;
  const all = series.flatMap((s) => Array.from(s.y));
  lo ??= Math.min(...all); hi ??= Math.max(...all);
  if (hi - lo < 1e-9) hi = lo + 1;
  g.fillStyle = css("--grid");
  g.fillRect(w / 2, 0, 1, h);
  for (const s of series) {
    g.strokeStyle = s.color; g.lineWidth = 1.5 * (window.devicePixelRatio || 1);
    g.beginPath();
    s.y.forEach((v, i) => {
      const x = (i / (s.y.length - 1)) * w, y = h - ((Math.min(hi!, Math.max(lo!, v)) - lo!) / (hi! - lo!)) * h;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
}

// --- waterfall ---------------------------------------------------------------
let wfCanvas: OffscreenCanvas | null = null; // file mode: whole capture; live mode: scrolling history

function heat(t: number): [number, number, number] {
  // black → blue → magenta → yellow
  t = Math.min(1, Math.max(0, t));
  return [Math.round(255 * Math.min(1, t * 2)), Math.round(255 * Math.max(0, t * 2 - 1)), Math.round(255 * Math.min(1, t * 3) * (1 - Math.max(0, t * 2 - 1)))];
}

function renderWaterfall() {
  const total = iq.length / 2;
  const rows = Math.min(256, Math.max(1, Math.floor(total / N)));
  const step = Math.floor((total - N) / Math.max(rows - 1, 1));
  const spectra = Array.from({ length: rows }, (_, r) => powerSpectrum(iq, r * step, N));
  const sorted = spectra.flatMap((s) => Array.from(s)).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.5)], hi = sorted[sorted.length - 1];
  const img = new ImageData(N, rows);
  spectra.forEach((s, r) => s.forEach((v, i) => {
    const [R, G, B] = heat((v - lo) / (hi - lo));
    img.data.set([R, G, B, 255], 4 * (r * N + i));
  }));
  wfCanvas = new OffscreenCanvas(N, rows);
  wfCanvas.getContext("2d")!.putImageData(img, 0, 0);
  drawWaterfall();
  axis("wfAxis", fs);
}

function drawWaterfall() {
  if (!wfCanvas) return;
  const c = $<HTMLCanvasElement>("wf"), g = fitCanvas(c);
  g.imageSmoothingEnabled = false;
  g.drawImage(wfCanvas, 0, 0, c.width, c.height);
  // tuning marker: passband as a translucent band
  const x = (f: number) => (f / fs + 0.5) * c.width;
  const o = num("offset") * 1e3, bw = num("bw") * 1e3, mode = $<HTMLSelectElement>("mode").value;
  const [a, b] = mode === "USB" ? [o, o + bw] : mode === "LSB" ? [o - bw, o] : [o - bw / 2, o + bw / 2];
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), c.height);
  g.fillStyle = css("--accent");
  g.fillRect(x(o) - 1, 0, 2, c.height);
}

$("wf").addEventListener("click", (e) => {
  const c = e.currentTarget as HTMLCanvasElement;
  const f = ((e.offsetX / c.clientWidth) - 0.5) * fs;
  $<HTMLInputElement>("offset").value = (f / 1e3).toFixed(1);
  retune();
});

/** Tuning, mode or bandwidth changed. */
function retune() {
  drawWaterfall();
  if (sdr) {
    newReceiver();
    $<HTMLInputElement>("liveFreq").value = ((sdr.centerFrequency + num("offset") * 1e3) / 1e6).toFixed(3);
  }
  run();
}

// --- pipeline ----------------------------------------------------------------
const DEMOD_TEXT: Record<Mode, string> = {
  WFM: "FM carries the audio in the <i>frequency</i>. The phase step between consecutive samples, arg(x[n]·x*[n−1]), is the instantaneous frequency, and that is the audio. Broadcast FM also needs de-emphasis (a 75 µs low-pass).",
  NFM: "Same as WFM: the phase step between samples is the audio. Narrowband FM (repeaters, NOAA weather) just uses much less deviation and bandwidth.",
  AM: "AM carries the audio in the <i>amplitude</i>. The envelope |x| minus its average (the carrier) is the audio.",
  USB: "Single sideband sends only the upper half of an AM signal, with no carrier. Shift that sideband to straddle 0 Hz, filter, shift back, and the real part is the audio.",
  LSB: "Same as USB, but the lower half. Below 10 MHz, hams use LSB by convention.",
  CW: `CW (Morse) is a carrier switched on and off. Move it to 0 Hz, filter very narrow (a few hundred Hz) so neighbors vanish, then mix it up to a ${CW_PITCH} Hz tone (a receiver's "BFO") so you hear dits and dahs. The narrow channel's strength is the keying, decoded below.`,
};

// ---------- CW: the Morse panel ----------
let cw = new CwSignalDecoder(), cwDrawn = 0;
function cwShow() {
  const on = $<HTMLSelectElement>("mode").value === "CW";
  $("cwPanel").hidden = !on;
  if (!on) return;
  const box = $("cwText"), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.textContent = cw.text || "…listening";
  if (atEnd) box.scrollTop = box.scrollHeight;
  const top = Math.max(cw.peak * 1.2, 1e-9);
  $("cwLevel").style.width = `${Math.min(100, (100 * cw.level) / top)}%`;
  $("cwThr").style.left = `${Math.min(100, (100 * (cw.floor + 0.5 * (cw.peak - cw.floor))) / top)}%`;
  $("cwStat").textContent = `${cw.on ? "▮ key down" : "▯ key up"} · ≈${cw.wpm.toFixed(0)} WPM · signal ${cw.snrDb.toFixed(0)} dB over noise${cw.snrDb < 10 ? " (too weak to decode reliably)" : ""}`;
}
$("cwClear").addEventListener("click", () => { cw.clear(); cwShow(); });

function run() {
  if (!iq.length) return;
  const t0 = performance.now();
  const mode = $<HTMLSelectElement>("mode").value as Mode;
  const offset = num("offset") * 1e3, bw = num("bw") * 1e3;
  const s = receive(iq, fs, offset, mode, bw);
  const ms = performance.now() - t0;

  const mixed = avgSpectrum(mix(iq.subarray(0, Math.min(iq.length, 2 * N * 32)), fs, offset), N);
  plot($("mixPlot"), [{ y: mixed, color: css("--plot") }]);
  axis("mixAxis", fs);

  const resp = freqResponse(s.taps, N);
  const top = Math.max(...mixed);
  plot($("firPlot"), [
    { y: mixed, color: css("--plot") },
    { y: resp.map((v) => v + top), color: css("--plot2") },
  ], top - 90, top + 5);
  $("firStat").textContent = `${s.taps.length} taps · cutoff ±${((mode === "USB" || mode === "LSB" ? bw : bw / 2) / 1e3).toFixed(1)} kHz · decimate by ${Math.round(fs / s.chanFs)}`;

  plot($("decPlot"), [{ y: avgSpectrum(s.channel, Math.min(N, 1 << Math.floor(Math.log2(s.channel.length / 2)))), color: css("--plot") }]);
  axis("decAxis", s.chanFs);

  $("demodText").innerHTML = DEMOD_TEXT[mode];
  const win = s.demod.subarray(s.demod.length >> 1, (s.demod.length >> 1) + Math.round(s.chanFs * 0.01)); // 10 ms
  plot($("demPlot"), [{ y: win, color: css("--plot") }]);
  $("demStat").textContent = `10 ms of demodulator output at ${(s.chanFs / 1e3).toFixed(1)} kS/s`;

  if (mode === "CW" && s.env) { cw = new CwSignalDecoder(); cw.process(s.env, s.envFs); }
  cwShow();
  audio = { data: s.audio, rate: s.audioFs };
  $<HTMLButtonElement>("play").disabled = false;
  $("audStat").textContent = `${(s.audio.length / s.audioFs).toFixed(1)} s at ${(s.audioFs / 1e3).toFixed(1)} kHz · pipeline took ${ms.toFixed(0)} ms`;
}

$("play").addEventListener("click", () => {
  if (source) { source.stop(); source = null; $("play").textContent = "▶ Play"; return; }
  if (!audio) return;
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, audio.data.length, audio.rate);
  buf.copyToChannel(audio.data as Float32Array<ArrayBuffer>, 0);
  source = ctx.createBufferSource();
  source.buffer = buf; source.connect(ctx.destination);
  source.onended = () => { source = null; $("play").textContent = "▶ Play"; ctx.close(); };
  source.start();
  $("play").textContent = "■ Stop";
});

// --- inputs ------------------------------------------------------------------
function load(data: Float32Array, label: string) {
  iq = data;
  fs = num("rate") * 1e6;
  $("status").textContent = `${label}: ${(iq.length / 2 / fs).toFixed(2)} s, ${(iq.length / 2 / 1e6).toFixed(2)} M samples`;
  renderWaterfall();
  run();
}

$("demo").addEventListener("click", async () => {
  if (sdr) await disconnect();
  $<HTMLInputElement>("rate").value = "1.024";
  $<HTMLInputElement>("center").value = "100";
  setMode("WFM", 200);
  load(synth(1.024e6, 8, DEMO_SIGNALS), "Demo: WFM at +200 kHz, AM at −150 kHz, USB at +350 kHz, CW (Morse) at −320 kHz");
});

$<HTMLInputElement>("file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (sdr) await disconnect();
  const { center, rate } = parseName(f.name);
  if (center) $<HTMLInputElement>("center").value = String(center / 1e6);
  if (rate) $<HTMLInputElement>("rate").value = String(rate / 1e6);
  const fmt = $<HTMLSelectElement>("fmt").value;
  const isCU8 = fmt === "cu8" || (fmt === "auto" && /\.(cu8|bin)$/i.test(f.name));
  // ponytail: whole file in memory and main-thread DSP; stream + Web Worker if 10 s @ 2.4 MS/s janks the UI
  $("status").textContent = "Loading…";
  const buf = await f.arrayBuffer();
  load(isCU8 ? decodeCU8(buf) : decodeCF32(buf), f.name);
});

function setMode(m: Mode, bwKHz = DEFAULT_BW[m] / 1e3) {
  $<HTMLSelectElement>("mode").value = m;
  $<HTMLInputElement>("bw").value = String(bwKHz);
}

$("mode").addEventListener("change", () => { setMode($<HTMLSelectElement>("mode").value as Mode); retune(); });
$("run").addEventListener("click", retune);
window.addEventListener("resize", () => { drawWaterfall(); run(); });

// --- live: an RTL-SDR over WebUSB --------------------------------------------------
const LIVE_RATE = 2_400_000;
const LIVE_OFFSET = 250e3; // tune the dongle this far below the station, away from its DC spike
const SNAPSHOT_S = 0.25; // how much recent signal the stage plots show
let sdr: RtlSdr | RemoteSdr | null = null; // your dongle (WebUSB) or the server's (HTTP)
let streaming: Promise<void> | null = null;
let live: { rx: Receiver; agc: Agc; ctx: AudioContext; t: number } | null = null;
let recent: Float32Array[] = [];
let lastPlots = 0, drawQueued = false, floor = -60;

$<HTMLSelectElement>("gain").innerHTML = `<option value="auto">Auto</option>` +
  GAINS.map((g) => `<option value="${g / 10}">${(g / 10).toFixed(1)} dB</option>`).join("");
$<HTMLSelectElement>("gain").value = String(GAINS.find((g) => g >= 300)! / 10);
const gainValue = () => { const v = $<HTMLSelectElement>("gain").value; return v === "auto" ? null : parseFloat(v); };

function newReceiver() {
  if (!live || !sdr) return;
  const mode = $<HTMLSelectElement>("mode").value as Mode;
  live.rx = new Receiver(fs, num("offset") * 1e3, mode, num("bw") * 1e3);
  cw = new CwSignalDecoder(); cwShow();
  live.agc = new Agc(live.rx.audioFs);
}

function liveStatus(text: string) { $("status").textContent = text; }

async function connect(remote: boolean) {
  try {
    sdr = remote ? await RemoteSdr.connect() : await RtlSdr.request();
    fs = sdr instanceof RtlSdr ? await sdr.setSampleRate(LIVE_RATE) : sdr.sampleRate;
    $<HTMLInputElement>("rate").value = String(fs / 1e6);
    await sdr.setGain(gainValue());
    live = { rx: null!, agc: null!, ctx: new AudioContext(), t: 0 };
    await tuneTo(num("liveFreq") * 1e6);
    wfCanvas = new OffscreenCanvas(N, 256);
    axis("wfAxis", fs);
    $("wfText").textContent = "Live: one FFT row every ~55 ms, newest on top.";
    $(remote ? "remote" : "connect").textContent = "Disconnect";
    $<HTMLButtonElement>(remote ? "connect" : "remote").disabled = true;
    streaming = sdr.stream(onSamples).catch((e) => liveStatus(`Stream stopped: ${e.message}`));
  } catch (e) {
    if (sdr) await sdr.close().catch(() => {});
    sdr = null;
    const msg = (e as Error).message;
    liveStatus(/No device selected/i.test(msg) ? "No dongle selected." : `Could not start the SDR: ${msg}`);
  }
}

async function disconnect() {
  const s = sdr;
  sdr = null;
  s?.stop();
  await streaming;
  await s?.close().catch(() => {});
  await live?.ctx.close();
  live = null;
  $("connect").textContent = "Connect USB SDR";
  $("remote").textContent = "Listen to server SDR";
  checkServer();
  $<HTMLButtonElement>("connect").disabled = !("usb" in navigator);
  $("wfText").textContent = "Each row is one FFT, with time running downward.";
  liveStatus("Disconnected.");
}

/** Listen to `freq`: put the dongle LIVE_OFFSET below it and the receiver on it. */
async function tuneTo(freq: number) {
  if (!sdr) return;
  await sdr.setCenterFrequency(freq - LIVE_OFFSET);
  $<HTMLInputElement>("center").value = ((freq - LIVE_OFFSET) / 1e6).toFixed(3);
  $<HTMLInputElement>("offset").value = String(LIVE_OFFSET / 1e3);
  newReceiver();
  drawWaterfall();
  const src = sdr instanceof RemoteSdr ? "server SDR" : `${sdr.tunerName} tuner`;
  liveStatus(`Live: ${src}, ${(fs / 1e6).toFixed(2)} MS/s, listening on ${(freq / 1e6).toFixed(3)} MHz`);
}

function onSamples(cu8: Uint8Array) {
  if (!live) return;
  const x = decodeCU8(cu8);

  // Audio: through the streaming receiver, then scheduled back to back.
  const out = live.rx.process(x), a = live.agc.process(out.audio);
  if (out.env) { cw.process(out.env, out.envFs); if (performance.now() - cwDrawn > 150) { cwDrawn = performance.now(); cwShow(); } }
  if (a.length) {
    const ctx = live.ctx, now = ctx.currentTime;
    if (live.t < now + 0.05) live.t = now + 0.15; // underrun: rebuild a small cushion
    // ponytail: dongle and sound card clocks drift apart; dropping a chunk when we get >0.6 s ahead
    // is audible only every few minutes. Resample by the measured drift if that ever matters.
    if (live.t < now + 0.6) {
      const buf = ctx.createBuffer(1, a.length, live.rx.audioFs);
      buf.copyToChannel(a as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(live.t);
      live.t += buf.duration;
    }
  }

  // Waterfall: one new row per chunk, newest on top.
  const row = powerSpectrum(x, 0, N);
  const sorted = Array.from(row).sort((p, q) => p - q);
  floor = 0.9 * floor + 0.1 * sorted[N >> 1];
  const img = new ImageData(N, 1);
  row.forEach((v, i) => img.data.set([...heat((v - floor) / 45), 255], 4 * i));
  const g = wfCanvas!.getContext("2d")!;
  g.drawImage(wfCanvas!, 0, 1);
  g.putImageData(img, 0, 0);
  if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawWaterfall(); }); }

  // Stage plots: refresh from the last SNAPSHOT_S seconds every 1.5 s.
  recent.push(x);
  let have = recent.reduce((n, c) => n + c.length, 0);
  while (recent.length > 1 && have - recent[0].length >= 2 * SNAPSHOT_S * fs) have -= recent.shift()!.length;
  if (performance.now() - lastPlots > 1500) {
    lastPlots = performance.now();
    iq = new Float32Array(have);
    let o = 0; for (const c of recent) { iq.set(c, o); o += c.length; }
    run();
  }
}

$("connect").addEventListener("click", () => (sdr ? disconnect() : connect(false)));
$("remote").addEventListener("click", () => (sdr ? disconnect() : connect(true)));
// ?listen=146.73 (from the repeater map): preset the listen frequency; it's used when a live source connects.
{
  const f = Number(new URLSearchParams(location.search).get("listen"));
  if (f >= 24 && f <= 1766) { $<HTMLInputElement>("liveFreq").value = f.toFixed(3); liveStatus(`Ready to listen on ${f.toFixed(3)} MHz: connect the server SDR or your own dongle.`); }
}

// What Blip can do here: tune the receiver.
(window as any).blipActions = {
  tune: { label: "tuned the radio", description: "Tune Spectrum Lab's live receiver to a frequency in MHz (e.g. 98.7 FM, 162.55 NOAA weather, 119.1 JFK tower). Sets the listen frequency if no SDR is connected yet.", parameters: { mhz: { type: "number", description: "Frequency in MHz, 24 to 1766" } },
    run: async ({ mhz }: { mhz: number }) => { const f = Number(mhz); if (!(f >= 24 && f <= 1766)) return; $<HTMLInputElement>("liveFreq").value = f.toFixed(3); await tuneTo(f * 1e6); } },
};

// Leaving the page ends the stream, so the server stops counting this listener at once.
addEventListener("pagehide", () => { if (sdr) disconnect(); });
// The server button is lit while a dongle server answers (server.ts here, or ihor.sh's proxy to it)
// and greyed out while it's offline; it re-checks so it lights up when the server starts.
async function checkServer() {
  if (sdr) return;
  const up = await fetch("/api/state").then((r) => r.ok).catch(() => false);
  if (sdr) return;
  const b = $<HTMLButtonElement>("remote");
  b.disabled = !up;
  b.title = up ? "" : "The server SDR is offline right now.";
}
checkServer();
setInterval(checkServer, 15_000);
$("liveFreq").addEventListener("change", () => tuneTo(num("liveFreq") * 1e6));
$("gain").addEventListener("change", () => sdr?.setGain(gainValue()));
if (!("usb" in navigator)) {
  $<HTMLButtonElement>("connect").disabled = true;
  $("liveHelp").textContent = window.isSecureContext
    ? "USB live mode needs WebUSB, which this browser lacks (use Chrome, Edge or Opera). You can still listen to the server SDR or load a recording."
    : "USB live mode needs an https:// or localhost address. From another computer, use \"Listen to server SDR\" instead.";
}

$("demo").click();

// What Blip sees here: the tuning and, in CW mode, what the Morse decoder has read so far.
(window as any).blipContext = () => ({
  page: "Spectrum Lab (a software radio: mix, filter, decimate, demodulate)", mode: $<HTMLSelectElement>("mode").value,
  tuneOffsetKHz: num("offset"), bandwidthKHz: num("bw"), live: !!sdr,
  cw: $<HTMLSelectElement>("mode").value === "CW" ? { decoded: cw.text, wpm: Math.round(cw.wpm), snrDb: Math.round(cw.snrDb) } : undefined,
});
