import { avgSpectrum, mix, freqResponse, receive, synth, Receiver, Agc, NoiseReducer, Biquad, DEMO_SIGNALS, DEFAULT_BW, CW_PITCH, type Mode } from "./dsp.ts";
import { CwSignalDecoder } from "./cw.ts";
import { decodeCU8, decodeCF32, parseName } from "./iq.ts";
import { RtlSdr } from "./rtlsdr.ts";
import { RemoteSdr } from "./remote.ts";
import { GAINS } from "./r820t.ts";
import { streamOut } from "./player.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => parseFloat($<HTMLInputElement>(id).value) || 0;
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const modeNow = () => $<HTMLSelectElement>("mode").value as Mode;
const N = 1024; // FFT size for the stage plots

let iq: Float32Array = new Float32Array(0);
let fs = 1.024e6;

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

// --- settings that stick (per browser) -------------------------------------------------------
const SAVED = ["vol", "agc", "sql", "nr", "voice", "step", "wfRange"];
try {
  const s = JSON.parse(localStorage.getItem("spectrum-lab") || "{}");
  for (const id of SAVED) if (id in s) { const el = $<HTMLInputElement>(id); el.type === "checkbox" ? (el.checked = s[id]) : (el.value = s[id]); }
} catch {}
const saveSettings = () => {
  try { localStorage.setItem("spectrum-lab", JSON.stringify(Object.fromEntries(SAVED.map((id) => { const el = $<HTMLInputElement>(id); return [id, el.type === "checkbox" ? el.checked : el.value]; })))); } catch {}
};
for (const id of SAVED) $(id).addEventListener("change", saveSettings);

// --- spectrum + waterfall ----------------------------------------------------------------
// 4096 bins (586 Hz each at 2.4 MS/s), so zooming in still shows detail. Rows keep their dB values, so a contrast
// change can repaint the whole history.
const WF_N = 4096, WF_ROWS = 256;
const wf = { rows: [] as Float32Array[], img: new OffscreenCanvas(WF_N, WF_ROWS), floor: NaN, live: false };
let trace: Float32Array | null = null; // the spectrum line
let view = { lo: -fs / 2, hi: fs / 2 }; // visible slice, Hz from the center
let hoverF: number | null = null;

function heat(t: number): [number, number, number] {
  // black → blue → magenta → yellow
  t = Math.min(1, Math.max(0, t));
  return [Math.round(255 * Math.min(1, t * 2)), Math.round(255 * Math.max(0, t * 2 - 1)), Math.round(255 * Math.min(1, t * 3) * (1 - Math.max(0, t * 2 - 1)))];
}
const LUT = new Uint32Array(256).map((_, i) => { const [r, g, b] = heat(i / 255); return (255 << 24) | (b << 16) | (g << 8) | r; }); // RGBA, little-endian
const median = (x: Float32Array) => x.slice().sort()[x.length >> 1];

function rowPixels(db: Float32Array) {
  const im = new ImageData(WF_N, 1), px = new Uint32Array(im.data.buffer), k = 255 / num("wfRange");
  for (let i = 0; i < WF_N; i++) px[i] = LUT[Math.max(0, Math.min(255, ((db[i] - wf.floor) * k) | 0))];
  return im;
}

function repaint() {
  const g = wf.img.getContext("2d")!;
  g.clearRect(0, 0, WF_N, WF_ROWS);
  wf.rows.forEach((r, y) => g.putImageData(rowPixels(r), 0, y));
  drawScope();
}

/** File mode: the whole capture, time running downward. */
function renderWaterfall() {
  const total = iq.length / 2, rows = Math.min(WF_ROWS, Math.max(1, Math.floor(total / WF_N))), step = Math.floor(total / rows);
  wf.rows = Array.from({ length: rows }, (_, r) => avgSpectrum(iq.subarray(2 * r * step, 2 * (r * step + Math.max(step, WF_N))), WF_N, 2));
  wf.live = false;
  wf.floor = median(Float32Array.from(wf.rows, median));
  trace = new Float32Array(WF_N);
  for (const r of wf.rows) for (let i = 0; i < WF_N; i++) trace[i] += r[i] / rows;
  resetView();
  repaint();
}

/** Live: one new row on top. */
function pushRow(db: Float32Array) {
  wf.rows.unshift(db);
  if (wf.rows.length > WF_ROWS) wf.rows.pop();
  const m = median(db);
  wf.floor = Number.isNaN(wf.floor) ? m : 0.9 * wf.floor + 0.1 * m;
  const g = wf.img.getContext("2d")!;
  g.drawImage(wf.img, 0, 1);
  g.putImageData(rowPixels(db), 0, 0);
  if (!trace) trace = db.slice();
  else for (let i = 0; i < WF_N; i++) trace[i] = 0.6 * trace[i] + 0.4 * db[i];
}

const centerHz = () => num("center") * 1e6;
const stepHz = () => {
  const s = Number($<HTMLSelectElement>("step").value);
  return s || { WFM: 100e3, NFM: 5e3, AM: 5e3, USB: 100, LSB: 100, CW: 10 }[modeNow()];
};
/** Offset `f` moved so the absolute frequency lands on the tuning step. */
const snap = (f: number) => Math.round((centerHz() + f) / stepHz()) * stepHz() - centerHz();

/** The passband [a, b] in Hz from the center, as the receiver will hear it. */
function passband() {
  const o = num("offset") * 1e3, bw = num("bw") * 1e3, m = modeNow(), sh = m === "CW" ? 0 : num("shift") * 1e3;
  return m === "USB" ? [o + sh, o + sh + bw] : m === "LSB" ? [o + sh - bw, o + sh] : [o + sh - bw / 2, o + sh + bw / 2];
}

const fmtMHz = (hz: number, digits = 6) => (hz / 1e6).toFixed(digits);
/** 98.700 000 */
const freqText = (hz: number) => fmtMHz(hz).replace(/(\.\d{3})/, "$1 ");

function drawScope() {
  if (!wf.rows.length) return;
  const span = view.hi - view.lo, dpr = window.devicePixelRatio || 1;
  // Waterfall: the visible slice of the image. Column i is centered on bin i's frequency.
  const c = $<HTMLCanvasElement>("wf"), g = fitCanvas(c), W = c.width, H = c.height;
  const u = (f: number) => (f / fs) * WF_N + WF_N / 2 + 0.5;
  const X = (f: number) => ((f - view.lo) / span) * W;
  g.imageSmoothingEnabled = false;
  g.drawImage(wf.img, u(view.lo), 0, u(view.hi) - u(view.lo), wf.live ? WF_ROWS : wf.rows.length, 0, 0, W, H);
  const [a, b] = passband(), o = num("offset") * 1e3;
  const band = (gg: CanvasRenderingContext2D, h: number) => {
    gg.fillStyle = "rgba(255,255,255,0.16)";
    gg.fillRect(X(a), 0, Math.max(2, X(b) - X(a)), h);
    gg.fillStyle = css("--accent");
    gg.fillRect(X(o) - dpr, 0, 2 * dpr, h);
  };
  band(g, H);
  if (filePlay) { g.fillStyle = "rgba(255,255,255,0.7)"; g.fillRect(0, (filePlay.pos / (iq.length / 2)) * H, W, dpr); } // playhead

  // Spectrum: grid, trace, passband, frequency labels.
  const s = $<HTMLCanvasElement>("spec"), h = fitCanvas(s), SW = s.width, SH = s.height, axisH = 16 * dpr;
  h.fillStyle = css("--card") || "#000"; h.fillRect(0, 0, SW, SH);
  const { lo, hi } = chartDb(), Y = (db: number) => (SH - axisH) * (1 - (db - lo) / (hi - lo));
  // grid every 10 dB, and frequency ticks at a round step
  h.fillStyle = css("--grid");
  for (let d = Math.ceil(lo / 10) * 10; d < hi; d += 10) h.fillRect(0, Y(d), SW, 1);
  const raw = span / 6, mag = 10 ** Math.floor(Math.log10(raw)), tick = [1, 2, 5, 10].map((k) => k * mag).find((t) => t >= raw)!;
  const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(tick / 1e6)))), C = centerHz();
  h.font = `${11 * dpr}px ui-sans-serif, system-ui, sans-serif`; h.textAlign = "center"; h.textBaseline = "bottom";
  for (let t = Math.ceil((C + view.lo) / tick) * tick; t <= C + view.hi; t += tick) {
    const x = X(t - C);
    h.fillStyle = css("--grid"); h.fillRect(x, 0, 1, SH - axisH);
    h.fillStyle = css("--muted"); h.fillText(fmtMHz(t, digits), x, SH - 2 * dpr);
  }
  band(h, SH - axisH);
  if (trace) {
    h.beginPath();
    const i0 = Math.max(0, Math.floor(u(view.lo)) - 1), i1 = Math.min(WF_N - 1, Math.ceil(u(view.hi)));
    for (let i = i0; i <= i1; i++) { const x = X(((i - WF_N / 2) / WF_N) * fs), y = Y(trace[i]); i === i0 ? h.moveTo(x, y) : h.lineTo(x, y); }
    h.strokeStyle = css("--plot"); h.lineWidth = 1.2 * dpr; h.stroke();
    h.lineTo(X(((i1 - WF_N / 2) / WF_N) * fs), SH - axisH); h.lineTo(X(((i0 - WF_N / 2) / WF_N) * fs), SH - axisH);
    h.fillStyle = css("--plot") + "33"; h.fill();
  }
  if (hoverF !== null) { h.fillStyle = css("--fg"); h.fillRect(X(hoverF), 0, 1, SH - axisH); }
  // dB labels on the grid lines
  h.textAlign = "left"; h.textBaseline = "bottom"; h.fillStyle = css("--muted");
  const every = Y(lo) - Y(lo + 10) < 16 * dpr ? 20 : 10; // fewer labels when the lines are close
  for (let d = Math.ceil(lo / every) * every; d < hi; d += every) if (Y(d) > 12 * dpr && Y(d) < SH - axisH - 4 * dpr && Math.abs(Y(d) - Y(wf.floor)) > 12 * dpr) h.fillText(`${d} dB`, 3 * dpr, Y(d) - 1);
  // the noise floor (median bin), dashed
  const label = (text: string, y: number, color: string, left = false) => { h.textAlign = left ? "left" : "right"; h.fillStyle = color; h.fillText(text, left ? 52 * dpr : SW - 3 * dpr, Math.max(12 * dpr, y - 1)); };
  h.setLineDash([4 * dpr, 4 * dpr]); h.strokeStyle = css("--muted"); h.lineWidth = dpr;
  h.beginPath(); h.moveTo(0, Y(wf.floor)); h.lineTo(SW, Y(wf.floor)); h.stroke(); h.setLineDash([]);
  label(`noise ${wf.floor.toFixed(0)} dB`, Y(wf.floor), css("--muted"), true); // left: the squelch label is on the right
  // what the squelch hears: the strongest bin in the passband, as a mark across the band
  if (!Number.isNaN(sqLevel)) { h.fillStyle = css("--fg"); h.fillRect(X(a), Y(sqLevel) - dpr, Math.max(2, X(b) - X(a)), 2 * dpr); }
  // the squelch: drag this line; at the bottom it's off
  const sqOff = num("sql") <= SQL_OFF, ys = sqOff ? SH - axisH - dpr : Math.min(SH - axisH - dpr, Math.max(dpr, Y(num("sql"))));
  h.fillStyle = css("--accent"); h.globalAlpha = sqOff ? 0.5 : 1; h.fillRect(0, ys - dpr, SW, 2 * dpr); h.globalAlpha = 1;
  label(sqOff ? "squelch off: drag up" : `squelch ${num("sql").toFixed(0)} dB${chain ? (sqOpen ? " · open" : " · closed") : ""}`, sqOff ? ys - 2 * dpr : ys, css("--accent"));
  $("freqShow").innerHTML = `${freqText(C + o)}<small>MHz</small>`;
}

/** The spectrum chart's dB range (follows the contrast setting). */
const chartDb = () => ({ lo: wf.floor - 10, hi: wf.floor + num("wfRange") + 10 });

// --- tuning with the mouse, wheel and keys ------------------------------------------------------
const scope = $("scope");
/** Where a pointer event falls across the canvas, 0…1, measured on screen (CSS zoom breaks offsetX; skip the border). */
function fracX(e: MouseEvent) {
  const c = $<HTMLCanvasElement>("wf"), r = c.getBoundingClientRect(), z = r.width / (c.offsetWidth || r.width);
  const cs = getComputedStyle(c), bl = parseFloat(cs.borderLeftWidth) * z, br = parseFloat(cs.borderRightWidth) * z;
  return Math.min(1, Math.max(0, (e.clientX - r.left - bl) / (r.width - bl - br)));
}
const fAt = (e: MouseEvent) => view.lo + fracX(e) * (view.hi - view.lo);
const pxPerHz = () => $("wf").getBoundingClientRect().width / (view.hi - view.lo);

function setView(lo: number, hi: number) {
  const span = Math.min(fs, Math.max(fs / 64, hi - lo));
  lo = Math.max(-fs / 2, Math.min(fs / 2 - span, lo));
  view = { lo, hi: lo + span };
  $<HTMLInputElement>("zoom").value = String(Math.log2(fs / span));
  drawScope();
}
function resetView() { view = { lo: -fs / 2, hi: fs / 2 }; $<HTMLInputElement>("zoom").value = "0"; }
function zoomAt(f: number, factor: number) { setView(f - (f - view.lo) * factor, f + (view.hi - f) * factor); }
$("zoom").addEventListener("input", () => {
  const span = fs / 2 ** num("zoom"), o = num("offset") * 1e3; // zoom around the tuned frequency
  setView(o - span / 2, o + span / 2);
});
$("wfRange").addEventListener("input", repaint);

function setOffset(f: number, full = true) {
  f = Math.max(-fs / 2, Math.min(fs / 2, f));
  $<HTMLInputElement>("offset").value = (f / 1e3).toFixed(3).replace(/\.?0+$/, "");
  // keep the tuned frequency in view
  if (f < view.lo || f > view.hi) setView(f - (view.hi - view.lo) / 2, f + (view.hi - view.lo) / 2);
  retune(full);
}

/** Step the tuning; live, past the edge of the dongle's band, it retunes the dongle. */
function nudge(n: number) {
  const f = snap(num("offset") * 1e3) + n * stepHz();
  if (sdr && Math.abs(f) > 0.45 * fs) { $<HTMLInputElement>("liveFreq").value = fmtMHz(centerHz() + f); tuneTo(centerHz() + f); return; }
  setOffset(f);
}

type Drag = { kind: "band" | "lo" | "hi" | "pan" | "sql"; x: number; f: number; offset: number; bw: number; view: typeof view; moved: boolean };
let drag: Drag | null = null;
/** dB at a pointer's height on the spectrum chart, or null when it's not over the chart. */
function dbAt(e: MouseEvent) {
  const r = $("spec").getBoundingClientRect(), plotH = r.height - 16, y = e.clientY - r.top;
  if (y < 0 || y > r.height) return null;
  const { lo, hi } = chartDb();
  return lo + (1 - Math.min(plotH, y) / plotH) * (hi - lo);
}
function hit(e: PointerEvent): Drag["kind"] {
  const db = dbAt(e), { lo, hi } = chartDb(), plotH = $("spec").getBoundingClientRect().height - 16;
  const sqDb = num("sql") <= SQL_OFF ? lo : Math.max(lo, num("sql"));
  if (db !== null && Math.abs(db - sqDb) * (plotH / (hi - lo)) < 7) return "sql"; // within 7 px of the squelch line
  const [a, b] = passband(), f = fAt(e), tol = 6 / pxPerHz();
  if (Math.abs(f - a) < tol && modeNow() !== "USB") return "lo";
  if (Math.abs(f - b) < tol && modeNow() !== "LSB") return "hi";
  return f > a && f < b ? "band" : "pan";
}
scope.addEventListener("pointerdown", (e) => {
  if (!wf.rows.length || e.button) return;
  scope.focus({ preventScroll: true });
  scope.setPointerCapture(e.pointerId);
  drag = { kind: hit(e), x: e.clientX, f: fAt(e), offset: num("offset") * 1e3, bw: num("bw") * 1e3, view: { ...view }, moved: false };
});
scope.addEventListener("pointermove", (e) => {
  hoverF = fAt(e);
  const bin = Math.round((hoverF / fs) * WF_N + WF_N / 2);
  $("hover").textContent = `${freqText(centerHz() + hoverF)} MHz${trace?.[bin] !== undefined ? ` · ${trace[bin].toFixed(0)} dB` : ""}`;
  if (!drag) {
    const k = wf.rows.length ? hit(e) : "pan";
    scope.className = `scope ${k === "lo" || k === "hi" ? "edge" : k === "band" ? "band" : k === "sql" ? "sqline" : ""}`;
    return drawScope();
  }
  if (drag.kind === "sql") { // drag the squelch line; below the chart's bottom turns it off
    const db = dbAt(e) ?? chartDb().lo, { lo } = chartDb();
    $<HTMLInputElement>("sql").value = String(db <= lo + 1 ? SQL_OFF : Math.round(db));
    drag.moved = true; meter(); drawScope(); return;
  }
  if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
  if (!drag.moved) return;
  const df = (e.clientX - drag.x) / pxPerHz(), m = modeNow(), sh = m === "CW" ? 0 : num("shift") * 1e3;
  if (drag.kind === "pan") { setView(drag.view.lo - df, drag.view.hi - df); return; }
  if (drag.kind === "band") { scope.className = "scope drag-band"; setOffset(snap(drag.offset + df), false); return; }
  // an edge: the bandwidth (symmetric modes widen both sides)
  const edge = fAt(e) - drag.offset - sh, max = Math.min(fs / 2, m === "WFM" ? 300e3 : 100e3);
  const bw = m === "USB" ? edge : m === "LSB" ? -edge : 2 * Math.abs(edge);
  $<HTMLInputElement>("bw").value = String(+(Math.max(50, Math.min(max, bw)) / 1e3).toFixed(2));
  retune(false);
});
scope.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.kind === "sql") return saveSettings();
  if (!d.moved) setOffset(snap(fAt(e)));
  else if (d.kind !== "pan") retune(true); // now redraw the stage plots too
});
const HINT = $("hover").textContent;
scope.addEventListener("pointerleave", () => { if (!drag) { hoverF = null; $("hover").textContent = HINT; drawScope(); } });
let wheelAcc = 0;
scope.addEventListener("wheel", (e) => {
  if (!wf.rows.length) return;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(fAt(e), Math.exp(e.deltaY * 0.01)); return; } // also a trackpad pinch
  if (document.activeElement !== scope) return; // the page scrolls until you click the scope
  e.preventDefault();
  wheelAcc += e.deltaY;
  while (Math.abs(wheelAcc) >= 40) { nudge(wheelAcc < 0 ? 1 : -1); wheelAcc -= 40 * Math.sign(wheelAcc); }
}, { passive: false });
scope.addEventListener("keydown", (e) => {
  const k = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
  if (k) { e.preventDefault(); nudge(k * (e.shiftKey ? 10 : 1)); }
  else if (e.key === "+" || e.key === "=") zoomAt(num("offset") * 1e3, 0.5);
  else if (e.key === "-") zoomAt(num("offset") * 1e3, 2);
  else if (e.key === "0") { resetView(); drawScope(); }
});

/** Tuning, mode, bandwidth or shift changed. `full`: also redo the stage plots (skipped mid-drag). */
function retune(full = true) {
  drawScope();
  if (sdr) $<HTMLInputElement>("liveFreq").value = fmtMHz(centerHz() + num("offset") * 1e3, 3);
  if (sdr || filePlay) newChain();
  if (full) run();
}

// --- pipeline (the stage plots) -----------------------------------------------------------
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
  const on = modeNow() === "CW";
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
  const mode = modeNow();
  const offset = num("offset") * 1e3, bw = num("bw") * 1e3;
  const s = receive(iq, fs, offset, mode, bw, num("shift") * 1e3);
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

  if (mode === "CW" && s.env && !sdr) { cw = new CwSignalDecoder(); cw.process(s.env, s.envFs); }
  cwShow();
  $<HTMLButtonElement>("play").disabled = !!sdr;
  $("audStat").textContent = `Audio at ${(s.audioFs / 1e3).toFixed(1)} kHz · the stage plots took ${ms.toFixed(0)} ms`;
}

// --- audio out: one continuous stream (src/player.ts) -----------------------------------------------
let out: { ctx: AudioContext; player: AudioWorkletNode; vol: GainNode; rec: MediaStreamAudioDestinationNode } | null = null;
let outReady: Promise<void> | null = null;
/** Created on a click (browsers only allow sound after one). */
function audioOut() {
  return (outReady ??= streamOut().then((o) => { out = o; setVolume(); $<HTMLButtonElement>("rec").disabled = false; }));
}
function setVolume() { if (out) out.vol.gain.value = 10 ** (num("vol") / 20) / 4; }
$("vol").addEventListener("input", setVolume);

// --- the audio chain, shared by live sources and file playback ---------------------------------------
const AGC = { slow: [1.5, 0.5], medium: [0.4, 0.25], fast: [0.1, 0.05] } as Record<string, [number, number]>; // release, hang (s)
type Chain = { rx: Receiver; agc: Agc | null; nr: NoiseReducer; hp: Biquad; lp: Biquad; gate: number; cushion: number };
let chain: Chain | null = null;
function newChain() {
  const rx = new Receiver(fs, num("offset") * 1e3, modeNow(), num("bw") * 1e3, num("shift") * 1e3);
  const a = AGC[$<HTMLSelectElement>("agc").value];
  chain = {
    rx, agc: a ? new Agc(rx.audioFs, a[0], a[1], 60) : null,
    nr: chain && chain.rx.audioFs === rx.audioFs ? chain.nr : new NoiseReducer(), // keeps what it learned about the noise
    hp: new Biquad(rx.audioFs, 300, "highpass"), lp: new Biquad(rx.audioFs, 3000, "lowpass"), gate: chain?.gate ?? 0,
    cushion: sdr instanceof RemoteSdr ? 0.35 : 0.15, // the server's stream crosses the internet: a bigger cushion
  };
  if (sdr) { cw = new CwSignalDecoder(); cwShow(); }
}
$("agc").addEventListener("change", () => { if (chain) newChain(); });

// The squelch works in the chart's dB: it opens when the strongest bin inside the passband rises above the line
// you drew, and closes 3 dB below it (so a signal right at the line doesn't flicker).
const SQL_OFF = -130;
let sqLevel = NaN, sqOpen = true;
function passbandPeak(db: Float32Array) {
  const [a, b] = passband(), bin = (f: number) => Math.round((f / fs) * WF_N + WF_N / 2);
  let m = -Infinity;
  for (let i = Math.max(0, bin(a)); i <= Math.min(WF_N - 1, bin(b)); i++) m = Math.max(m, db[i]);
  return m;
}

let meterDrawn = 0;
/** One chunk of I/Q (and its spectrum, dB per bin) in, audio out to the speakers. */
function listen(x: Float32Array, db: Float32Array) {
  const c = chain;
  if (!c) return;
  const peak = passbandPeak(db);
  sqLevel = Number.isNaN(sqLevel) ? peak : 0.5 * sqLevel + 0.5 * peak;
  if (!sqOpen && sqLevel > num("sql")) sqOpen = true;
  else if (sqOpen && sqLevel < num("sql") - 3) sqOpen = false;
  const o = c.rx.process(x);
  if (o.env && sdr) { cw.process(o.env, o.envFs); if (performance.now() - cwDrawn > 150) { cwDrawn = performance.now(); cwShow(); } }
  const open = num("sql") <= SQL_OFF || sqOpen;
  let a = o.audio;
  if ($<HTMLInputElement>("voice").checked && modeNow() !== "WFM") a = c.lp.process(c.hp.process(a));
  c.nr.strength = num("nr");
  if (c.nr.strength > 0) a = c.nr.process(a);
  if (c.agc) a = c.agc.process(a, 0.3);
  else a = a.map((v) => v * 0.3);
  // the squelch gate, ramped across the chunk so opening and closing don't click
  const g0 = c.gate, g1 = open ? 1 : 0;
  if (g0 !== 1 || g1 !== 1) for (let i = 0; i < a.length; i++) a[i] *= g0 + ((g1 - g0) * i) / a.length;
  c.gate = g1;
  out?.player.port.postMessage({ a, rate: c.rx.audioFs, cushion: c.cushion });
  if (performance.now() - meterDrawn > 100) { meterDrawn = performance.now(); meter(); }
}

/** The meter, on the chart's scale: signal (strongest bin in the passband), noise floor, and the squelch mark. */
function meter() {
  const { lo, hi } = chartDb(), pct = (db: number) => Math.min(100, Math.max(0, (100 * (db - lo)) / (hi - lo)));
  const on = chain && !Number.isNaN(sqLevel), off = num("sql") <= SQL_OFF;
  $("smLevel").style.width = `${on ? pct(sqLevel) : 0}%`;
  $("smSql").style.left = `${pct(num("sql"))}%`;
  $("smSql").hidden = off;
  $("smText").textContent = !on ? "" : `signal ${sqLevel.toFixed(0)} dB · noise ${wf.floor.toFixed(0)} dB · SNR ${(sqLevel - wf.floor).toFixed(0)} dB${off ? "" : sqOpen ? " · squelch open" : " · squelched"}`;
}
$("sql").addEventListener("input", () => { meter(); drawScope(); });
$("sqlAuto").addEventListener("click", () => {
  // just above what the band hears now: tune to an empty channel (only noise in the band) first
  if (!chain || Number.isNaN(sqLevel)) return void ($("smText").textContent = "Play or listen first, on an empty channel.");
  $<HTMLInputElement>("sql").value = String(Math.round(sqLevel + 3));
  saveSettings(); meter(); drawScope();
});

// --- recording what you hear --------------------------------------------------------------
let recorder: MediaRecorder | null = null;
$("rec").addEventListener("click", () => {
  if (recorder) return recorder.stop();
  if (!out) return;
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const r = (recorder = new MediaRecorder(out.rec.stream, type ? { mimeType: type } : {})), parts: Blob[] = [], t0 = Date.now();
  const name = `${fmtMHz(centerHz() + num("offset") * 1e3, 4)}MHz_${modeNow()}_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;
  const tick = setInterval(() => { $("recStat").textContent = `● Recording ${name}: ${Math.floor((Date.now() - t0) / 1000)} s`; }, 500);
  r.ondataavailable = (e) => parts.push(e.data);
  r.onstop = () => {
    clearInterval(tick);
    recorder = null;
    $("rec").textContent = "● Record"; $("rec").classList.remove("on");
    const blob = new Blob(parts, { type: r.mimeType }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${r.mimeType.includes("mp4") ? "m4a" : r.mimeType.includes("ogg") ? "ogg" : "webm"}`;
    a.click();
    $("recStat").textContent = `Saved ${a.download} (${(blob.size / 1024).toFixed(0)} KB).`;
  };
  r.start(1000);
  $("rec").textContent = "■ Stop recording"; $("rec").classList.add("on");
});

// --- file playback: the loaded recording, streamed through the same chain in real time ---------------------
let filePlay: { pos: number; sent: number; t0: number; timer: number } | null = null;
$("play").addEventListener("click", async () => {
  if (filePlay) return stopFile();
  await audioOut();
  await out!.ctx.resume();
  out!.player.port.postMessage({ reset: true, rate: 0 });
  newChain();
  const fp = (filePlay = { pos: 0, sent: 0, t0: performance.now(), timer: 0 });
  fp.timer = window.setInterval(() => {
    const total = iq.length / 2, due = ((performance.now() - fp.t0) / 1000 + 0.2) * fs; // stay 0.2 s ahead
    while (fp.sent < due) {
      const n = Math.min(Math.round(fs * 0.02), total - fp.pos);
      const x = iq.subarray(2 * fp.pos, 2 * (fp.pos + n)), db = avgSpectrum(x, WF_N, 2);
      for (let i = 0; i < WF_N; i++) trace![i] = 0.7 * trace![i] + 0.3 * db[i]; // the spectrum line follows the playhead
      listen(x, db);
      fp.pos = (fp.pos + n) % total; // loops
      fp.sent += n;
    }
    drawScope();
  }, 30);
  $("play").textContent = "■ Stop";
});
function stopFile() {
  if (!filePlay) return;
  clearInterval(filePlay.timer);
  filePlay = null;
  out?.player.port.postMessage({ reset: true, rate: 0 });
  $("play").textContent = "▶ Play";
  drawScope();
}

// --- inputs ------------------------------------------------------------------
function load(data: Float32Array, label: string) {
  stopFile();
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
  $<HTMLInputElement>("shift").disabled = m === "CW";
}

$("mode").addEventListener("change", () => { setMode(modeNow()); retune(); });
for (const id of ["offset", "bw", "shift"]) $(id).addEventListener("change", () => retune());
$("run").addEventListener("click", () => retune());
window.addEventListener("resize", () => { drawScope(); run(); });

// --- live: an RTL-SDR over WebUSB, or the server's ---------------------------------------------
const LIVE_RATE = 2_400_000;
const LIVE_OFFSET = 250e3; // tune the dongle this far below the station, away from its DC spike
const SNAPSHOT_S = 0.25; // how much recent signal the stage plots show
let sdr: RtlSdr | RemoteSdr | null = null; // your dongle (WebUSB) or the server's (HTTP)
let streaming: Promise<void> | null = null;
let recent: Float32Array[] = [];
let lastPlots = 0, drawQueued = false;

$<HTMLSelectElement>("gain").innerHTML = `<option value="auto">Auto</option>` +
  GAINS.map((g) => `<option value="${g / 10}">${(g / 10).toFixed(1)} dB</option>`).join("");
$<HTMLSelectElement>("gain").value = String(GAINS.find((g) => g >= 300)! / 10);
const gainValue = () => { const v = $<HTMLSelectElement>("gain").value; return v === "auto" ? null : parseFloat(v); };

function liveStatus(text: string) { $("status").textContent = text; }

async function connect(remote: boolean) {
  stopFile();
  const audio = audioOut(); // while the click still counts as a user gesture
  try {
    sdr = remote ? await RemoteSdr.connect() : await RtlSdr.request();
    fs = sdr instanceof RtlSdr ? await sdr.setSampleRate(LIVE_RATE) : sdr.sampleRate;
    $<HTMLInputElement>("rate").value = String(fs / 1e6);
    await sdr.setGain(gainValue());
    await audio;
    await out!.ctx.resume();
    wf.rows = []; wf.live = true; wf.floor = NaN; trace = null;
    wf.img.getContext("2d")!.clearRect(0, 0, WF_N, WF_ROWS);
    resetView();
    await tuneTo(num("liveFreq") * 1e6);
    $("wfText").textContent = "live, one row every few dozen ms, newest on top";
    $(remote ? "remote" : "connect").textContent = "Disconnect";
    $<HTMLButtonElement>(remote ? "connect" : "remote").disabled = true;
    $<HTMLButtonElement>("play").disabled = true;
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
  recorder?.stop();
  chain = null;
  out?.player.port.postMessage({ reset: true, rate: 0 });
  $("connect").textContent = "Connect USB SDR";
  $("remote").textContent = "Listen to server SDR";
  checkServer();
  $<HTMLButtonElement>("connect").disabled = !("usb" in navigator);
  $<HTMLButtonElement>("play").disabled = false;
  $("wfText").textContent = "each row is one FFT, with time running downward";
  liveStatus("Disconnected.");
}

/** Listen to `freq`: put the dongle LIVE_OFFSET below it and the receiver on it. */
async function tuneTo(freq: number) {
  if (!sdr) return;
  await sdr.setCenterFrequency(freq - LIVE_OFFSET);
  $<HTMLInputElement>("center").value = fmtMHz(freq - LIVE_OFFSET);
  $<HTMLInputElement>("offset").value = String(LIVE_OFFSET / 1e3);
  newChain();
  // the old rows were at the old center: start the picture over
  wf.rows = []; trace = null;
  wf.img.getContext("2d")!.clearRect(0, 0, WF_N, WF_ROWS);
  if (view.hi - view.lo < fs) setView(LIVE_OFFSET - (view.hi - view.lo) / 2, LIVE_OFFSET + (view.hi - view.lo) / 2);
  const src = sdr instanceof RemoteSdr ? "server SDR" : `${sdr.tunerName} tuner`;
  liveStatus(`Live: ${src}, ${(fs / 1e6).toFixed(2)} MS/s, listening on ${(freq / 1e6).toFixed(3)} MHz`);
}

function onSamples(cu8: Uint8Array) {
  if (!sdr || !chain) return;
  const x = decodeCU8(cu8), db = avgSpectrum(x, WF_N, 8);
  listen(x, db);
  pushRow(db);
  if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawScope(); }); }

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

meter();
$("demo").click();

// What Blip sees here: the tuning and, in CW mode, what the Morse decoder has read so far.
(window as any).blipContext = () => ({
  page: "Spectrum Lab (a software radio: mix, filter, decimate, demodulate)", mode: modeNow(),
  frequencyMHz: +fmtMHz(centerHz() + num("offset") * 1e3), tuneOffsetKHz: num("offset"), bandwidthKHz: num("bw"), filterShiftKHz: num("shift"), live: !!sdr,
  squelchDb: num("sql") > SQL_OFF ? num("sql") : "off", signalDb: chain && !Number.isNaN(sqLevel) ? Math.round(sqLevel) : undefined, noiseFloorDb: Math.round(wf.floor),
  cw: modeNow() === "CW" ? { decoded: cw.text, wpm: Math.round(cw.wpm), snrDb: Math.round(cw.snrDb) } : undefined,
});
