// Chapter 17: pictures over radio (SSTV). A row played as tones, line anatomy, the VIS header, hearing pitch, slant.
import "./course.css";
import { C, Scene, controls, val, label, line, arrow } from "./anim.ts";
import { playOnce } from "./audio.ts";
import { MODES, encode, SstvDecoder, lineMs, durationS, type Mode, type Seg } from "../sstv.ts";
import { Mixer, firLowpass, FirDecimator, FmDemod } from "../dsp.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;
const f2 = (v: number) => 1500 + (v * 800) / 255;

// --- 1. A row as a melody ------------------------------------------------------------------------------------------------------
{
  const ROW = Array.from({ length: 24 }, (_, i) => Math.round(255 * (0.5 + 0.45 * Math.sin(i / 3.2) * Math.cos(i / 9)))); // a made-up row: some light, some dark
  let playing: { t0: number; dur: number } | null = null;
  const s = new Scene(el("s-pitch"), (g, w, h) => {
    const L = 20, R = w - 20, bw = (R - L) / ROW.length, now = playing ? (performance.now() - playing.t0) / playing.dur : -1;
    ROW.forEach((v, i) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(L + i * bw, 16, bw - 1, 40); });
    label(g, "one row of a picture", L, 12, C.muted, "left", 10);
    const py = (f: number) => h - 20 - ((f - 1400) / 1000) * (h - 90);
    for (const f of [1500, 1900, 2300]) { line(g, L, py(f), R, py(f), "#1f242d", 1); label(g, `${f} Hz`, R, py(f) - 4, C.muted, "right", 9); }
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    ROW.forEach((v, i) => { const y = py(f2(v)); i ? g.lineTo(L + i * bw, y) : g.moveTo(L, y); g.lineTo(L + (i + 1) * bw, y); });
    g.stroke();
    if (now >= 0 && now <= 1) { const x = L + now * (R - L); line(g, x, 10, x, h - 14, C.white, 2); el("r-pitch").innerHTML = `Pixel ${Math.min(ROW.length - 1, Math.floor(now * ROW.length)) + 1}: <em class="y">${Math.round(f2(ROW[Math.min(ROW.length - 1, Math.floor(now * ROW.length))]))} Hz</em>`; }
    else if (playing && now > 1) playing = null;
  }, 220, { label: "A row of gray pixels and the tone frequency for each, from 1500 Hz for black to 2300 Hz for white" });
  const play = (msPerPixel: number) => {
    const fs = 48000, per = (msPerPixel / 1000) * fs, a = new Float32Array(Math.round(per * ROW.length)); let ph = 0;
    for (let n = 0; n < a.length; n++) { ph += (TAU * f2(ROW[Math.min(ROW.length - 1, Math.floor(n / per))])) / fs; a[n] = 0.3 * Math.sin(ph); }
    playOnce(a, fs); playing = { t0: performance.now(), dur: (a.length / fs) * 1000 };
    s.playing = true;
  };
  el("pt-play").addEventListener("click", () => play(120));
  el("pt-fast").addEventListener("click", () => play(146.432 / ROW.length));
  el("r-pitch").innerHTML = "Press play: slowly first, then at the speed of a real Martin M1 line (a seventh of a second).";
}

// --- 2. Anatomy of a line -------------------------------------------------------------------------------------------------------
const SEG_COLOR = (s: Seg, m: Mode, i: number): [string, string] => {
  if (s.sync) return [C.pink, "sync 1200"];
  if (!s.chan) return ["#5b6475", m.name === "Robot 36" && i === 3 ? "separator" : "porch 1500"];
  return ({ R: [C.red, "red"], G: [C.green, "green"], B: [C.blue, "blue"], Y: ["#d7dde5", "Y (brightness)"], Y2: ["#d7dde5", "Y, next row"], RY: ["#e07a9f", "R−Y"], BY: ["#58c4dd", "B−Y"], C: ["#b98ad6", "R−Y or B−Y"] } as Record<string, [string, string]>)[s.chan];
};
for (const id of ["ln-m", "vs-m"]) el(id).innerHTML = MODES.map((m, i) => `<option value="${i}" ${m.name === (id === "ln-m" ? "Martin M1" : "PD120") ? "selected" : ""}>${m.name}</option>`).join("");
{
  const s = new Scene(el("s-line"), (g, w, h) => {
    const m = MODES[+sel("ln-m")], total = lineMs(m), L = 20, R = w - 20, y = 40, bh = 46;
    let t = 0;
    m.line.forEach((sg, i) => {
      const x0 = L + (t / total) * (R - L), x1 = L + ((t + sg.ms) / total) * (R - L), [col, name] = SEG_COLOR(sg, m, i);
      g.fillStyle = col; g.fillRect(x0, y, Math.max(1, x1 - x0 - 1), bh);
      if (x1 - x0 > 40) { label(g, name, (x0 + x1) / 2, y + bh / 2 + 4, "#14171d", "center", 11); label(g, `${sg.ms} ms`, (x0 + x1) / 2, y + bh + 16, C.muted, "center", 10); }
      else if (sg.sync) label(g, "sync", (x0 + x1) / 2, y - 6, C.pink, "center", 10);
      t += sg.ms;
    });
    label(g, `one line: ${total.toFixed(1)} ms${m.rowsPerLine === 2 ? " (two picture rows)" : ""}`, L, 20, C.text, "left", 12);
  }, 130, { animated: false, label: "The parts of one SSTV line laid out in time for the chosen mode" });
  controls(s, ["ln-m"], () => { const m = MODES[+sel("ln-m")]; el("r-line").innerHTML = `${m.name}: ${m.width} × ${m.height} pixels, ${m.height / m.rowsPerLine} lines of ${lineMs(m).toFixed(1)} ms: <em class="y">${Math.round(durationS(m))} seconds</em> per picture.`; });
}

// --- 3. The VIS header ---------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-vis"), (g, w, h) => {
    const m = MODES[+sel("vs-m")], L = 40, R = w - 16, T = 20, B = h - 30;
    const segs: [number, number, string][] = [[300, 1900, "leader"], [10, 1200, ""], [300, 1900, "leader"], [30, 1200, "start"]];
    let ones = 0; for (let b = 0; b < 7; b++) { const bit = (m.vis >> b) & 1; ones += bit; segs.push([30, bit ? 1100 : 1300, `${bit}`]); }
    segs.push([30, ones % 2 ? 1100 : 1300, `p${ones % 2}`], [30, 1200, "stop"]);
    const total = segs.reduce((a, s2) => a + s2[0], 0), py = (f: number) => B - ((f - 1000) / 1000) * (B - T);
    for (const f of [1100, 1200, 1300, 1900]) { line(g, L, py(f), R, py(f), "#1f242d", 1); label(g, `${f}`, L - 4, py(f) + 4, C.muted, "right", 9); }
    let t = 0; g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    segs.forEach(([ms, f], i) => { const x0 = L + (t / total) * (R - L), x1 = L + ((t + ms) / total) * (R - L); i ? g.lineTo(x0, py(f)) : g.moveTo(x0, py(f)); g.lineTo(x1, py(f)); t += ms; });
    g.stroke();
    t = 0; segs.forEach(([ms, f, name]) => { const x = L + ((t + ms / 2) / total) * (R - L); if (name) label(g, name.startsWith("p") ? "parity" : name, x, py(f) + (f < 1250 ? 16 : -8), name.length === 1 ? C.green : C.muted, "center", 10); t += ms; });
    label(g, "Hz", L - 4, T - 6, C.muted, "right", 9);
  }, 220, { animated: false, label: "The VIS header: leader tones, start bit, seven data bits, parity and stop bit" });
  controls(s, ["vs-m"], () => { const m = MODES[+sel("vs-m")], bits = m.vis.toString(2).padStart(7, "0"); el("r-vis").innerHTML = `${m.name} is VIS code <em class="y">${m.vis}</em> = binary ${bits}, sent backwards (least significant bit first): ${[...bits].reverse().join(" ")}.`; });
}

// --- 4. Hearing pitch: mix by 1900 Hz, then measure the turn per sample ----------------------------------------------------------
{
  const FS = 11025;
  const measure = (f: number) => { // the decoder's real chain on 0.1 s of tone
    const n = Math.round(FS * 0.1), iq = new Float32Array(2 * n); for (let i = 0; i < n; i++) iq[2 * i] = Math.sin((TAU * f * i) / FS);
    const d = new FmDemod().process(new FirDecimator(firLowpass(1100 / FS, 700 / FS), 1, 2).process(new Mixer(FS, 1900).process(iq)));
    let s2 = 0, k = 0; for (let i = Math.floor(d.length / 2); i < d.length; i++) { s2 += d[i]; k++; }
    return 1900 + (s2 / k) * FS / TAU;
  };
  const s = new Scene(el("s-hear"), (g, w, h, t) => {
    const f = val("hr-f"), third = w / 3, cy = h / 2;
    // the tone
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath(); for (let x = 10; x < third - 10; x++) { const y = cy - 40 * Math.sin(((x - 10) / (third - 20)) * TAU * (f / 400) - t * 4); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    label(g, `audio: ${f} Hz`, third / 2, h - 10, C.yellow, "center", 11);
    // the arrow after mixing, slowed down 1000×
    const cx = third * 1.5, r = Math.min(60, h / 2 - 20), ang = (TAU * (f - 1900) * t) / 1000;
    g.strokeStyle = "#2a2f3a"; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    arrow(g, cx, cy, cx + r * Math.cos(ang), cy - r * Math.sin(ang), C.blue, 3);
    label(g, `after mixing by 1900: ${f - 1900 >= 0 ? "+" : ""}${f - 1900} turns/s`, cx, h - 10, C.blue, "center", 11);
    label(g, f > 1900 ? "↺" : f < 1900 ? "↻" : "still", cx, 18, C.blue, "center", 14);
    label(g, "(1000× slower)", cx, 32, C.muted, "center", 9);
    label(g, "measured", third * 2.5, cy - 14, C.muted, "center", 11);
    label(g, `${measure(f).toFixed(1)} Hz`, third * 2.5, cy + 12, C.green, "center", 18);
  }, 200, { label: "A tone, the arrow it becomes after mixing down by 1900 Hz, and the frequency measured from its turning speed" });
  controls(s, ["hr-f"], () => { const f = val("hr-f"); el("hr-fo").textContent = `${f} Hz`; el("r-hear").innerHTML = f <= 1250 ? "Around 1200 Hz: a sync pulse (or a VIS bit)." : f < 1500 ? "Between sync and black: only VIS bits live here (1100 and 1300 Hz)." : `A pixel of brightness <em class="y">${Math.round(((f - 1500) * 255) / 800)}</em> of 255.`; });
}

// --- 5. Slant: the real encoder and decoder with a clock error ----------------------------------------------------------------------
{
  const m = MODES.find((x) => x.name === "Robot 36")!, FS = 11025;
  const card = (() => { const a = new Uint8ClampedArray(m.width * m.height * 4); for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const v = (Math.floor(x / 40) % 2) ? 230 : 30, r = y < m.height / 2 ? v : 240 - v / 2; a.set([r, v, x % 80 < 40 ? 200 : 60, 255], (y * m.width + x) * 4); } return a; })();
  const img = new ImageData(m.width, m.height); let syncs: [number, number][] = [], startS = 0, rate = FS, fit: [number, number] | null = null;
  const run = () => {
    const clock = 1 + val("sl-c") / 100, audio = encode(m, card, FS, clock);
    const d = new SstvDecoder(FS, { onLine: (y, row) => img.data.set(row, y * m.width * 4) });
    d.slantCorrection = checked("sl-on"); d.push(audio); d.flush();
    syncs = d.syncLog; startS = d.startSample; rate = d.rate;
    if (syncs.length > 3) { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of syncs) { sx += x; sy += y; sxx += x * x; sxy += x * y; } const k = syncs.length, b = (k * sxy - sx * sy) / (k * sxx - sx * sx); fit = [(sy - b * sx) / k, b]; } else fit = null;
  };
  const off = document.createElement("canvas"); off.width = m.width; off.height = m.height;
  const s = new Scene(el("s-slant"), (g, w, h) => {
    off.getContext("2d")!.putImageData(img, 0, 0);
    const pw = Math.min(w * 0.5, (h - 20) * 4 / 3), ph = (pw * 3) / 4; g.drawImage(off, 10, 10, pw, ph);
    // measured sync times minus the nominal timing, per line, with the fitted line
    const L = pw + 50, R = w - 16, T = 20, B = h - 30, L0 = lineMs(m) * rate / 1000, devs = syncs.map(([n, t]) => [n, (t - (startS + n * L0)) / rate * 1000]);
    const maxD = Math.max(5, ...devs.map(([, d]) => Math.abs(d))), px = (n: number) => L + (n / m.height) * (R - L), py = (d: number) => (T + B) / 2 - (d / maxD) * ((B - T) / 2);
    if (R - L > 60) {
      line(g, L, py(0), R, py(0), C.axis, 1); label(g, `+${maxD.toFixed(0)} ms`, L - 4, T + 4, C.muted, "right", 9); label(g, `−${maxD.toFixed(0)}`, L - 4, B, C.muted, "right", 9);
      g.fillStyle = C.pink; for (const [n, d] of devs) g.fillRect(px(n) - 1, py(d) - 1, 2.5, 2.5);
      if (fit && checked("sl-on")) { const dv = (n: number) => ((fit![0] + fit![1] * n) - (startS + n * L0)) / rate * 1000; line(g, px(0), py(dv(0)), px(m.height), py(dv(m.height)), C.green, 2); }
      label(g, "where each sync really was, vs. expected", L, 12, C.muted, "left", 9); label(g, "line →", R, B + 16, C.muted, "right", 9);
    }
  }, 260, { animated: false, label: "A Robot 36 picture decoded with a clock error, and the measured sync pulse times drifting line by line" });
  let timer = 0;
  controls(s, ["sl-c", "sl-on"], () => {
    el("sl-co").textContent = `${val("sl-c") > 0 ? "+" : ""}${val("sl-c")}%`;
    clearTimeout(timer); timer = window.setTimeout(() => { run(); s.redraw(); const c = val("sl-c"); el("r-slant").innerHTML = c === 0 ? "Clocks agree: a straight picture either way." : checked("sl-on") ? `Corrected: the decoder fitted the <em class="g">green line</em> through the sync times and follows it.` : `Each line drifts by ${Math.abs(c * lineMs(m) / 100).toFixed(2)} ms, so the picture <em class="p">slants</em>. Tick slant correction.`; }, 120);
  });
}
