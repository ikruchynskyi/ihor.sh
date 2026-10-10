// Chapter 18: reading the band. Resolution, averaging, the noise floor, colors, clicking to tune, filter shift, and a
// squelch in the chart's decibels. Every scene runs the receiver's real code (synth, avgSpectrum, Receiver).
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, line, label } from "./anim.ts";
import { synth, avgSpectrum, Receiver, normalize } from "../dsp.ts";
import { decodeCU8 } from "../iq.ts";
import { playOnce } from "./audio.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const median = (x: Float32Array) => x.slice().sort()[x.length >> 1];
const fmtHz = (hz: number) => (Math.abs(hz) >= 1e3 ? `${(hz / 1e3).toFixed(hz % 1e3 ? 1 : 0)} kHz` : `${hz.toFixed(0)} Hz`);
// the waterfall's colors: black → blue → magenta → yellow (the same function as Spectrum Lab's)
const heat = (t: number) => { t = Math.min(1, Math.max(0, t)); return `rgb(${Math.round(255 * Math.min(1, t * 2))},${Math.round(255 * Math.max(0, t * 2 - 1))},${Math.round(255 * Math.min(1, t * 3) * (1 - Math.max(0, t * 2 - 1)))})`; };

// --- 1. Resolution: N bins share the band --------------------------------------------------------------------------------
{
  const fs = 2.4e6;
  const s = new Scene(el("s-res"), (g, w, h) => {
    const N = 2 ** val("rs-n"), d = val("rs-d"), df = fs / N;
    const iq = synth(fs, (N * 4) / fs, [{ kind: "USB", offset: -d / 2, tone: 0, amp: 0.3 }, { kind: "USB", offset: d / 2, tone: 0, amp: 0.3 }], 0.0005);
    const db = avgSpectrum(iq, N, 4), span = Math.max(5 * d, 14 * df);
    const L = 14, R = w - 14, T = 24, B = h - 34, top = Math.max(...db), lo = top - 50;
    const X = (f: number) => L + ((f + span / 2) / span) * (R - L), Y = (v: number) => B - ((Math.max(lo, v) - lo) / (top + 3 - lo)) * (B - T);
    // each bin as a bar as wide as it is: what the FFT really knows
    for (let i = 0; i < N; i++) {
      const f = ((i - N / 2) / N) * fs;
      if (f + df / 2 < -span / 2 || f - df / 2 > span / 2) continue;
      const x0 = Math.max(L, X(f - df / 2)), x1 = Math.min(R, X(f + df / 2));
      g.fillStyle = "rgba(88,196,221,0.25)"; g.fillRect(x0, Y(db[i]), x1 - x0, B - Y(db[i]));
      line(g, x0, Y(db[i]), x1, Y(db[i]), C.blue, 2);
    }
    for (const f of [-d / 2, d / 2]) { line(g, X(f), T - 6, X(f), B, C.yellow, 1.5, [4, 4]); }
    label(g, "the two carriers", X(d / 2) + 6, T + 2, C.yellow, "left", 11);
    line(g, L, B, R, B, C.axis, 1);
    for (const [f, al] of [[-span / 2, "left"], [0, "center"], [span / 2, "right"]] as const) label(g, f ? `${f > 0 ? "+" : "−"}${fmtHz(Math.abs(f))}` : "0", X(f), B + 18, C.muted, al, 11);
    let peaks = 0;
    for (let i = 1; i < N - 1; i++) if (db[i] > top - 6 && db[i] >= db[i - 1] && db[i] > db[i + 1]) peaks++;
    el("r-res").innerHTML = `Bins <em class="b">${fmtHz(df)}</em> wide; one FFT listens for <em>${((N / fs) * 1000).toFixed(2)} ms</em>. The carriers are ${(d / df).toFixed(1)} bins apart: you see <em class="y">${peaks >= 2 ? "two peaks" : "one bump"}</em>.`;
  }, 240, { animated: false, label: "Two carriers close together, and the FFT bins that try to tell them apart" });
  controls(s, ["rs-n", "rs-d"], () => { el("rs-no").textContent = String(2 ** val("rs-n")); el("rs-do").textContent = fmtHz(val("rs-d")); });
}

// --- 2. Averaging: the grass calms down, the carrier stays -------------------------------------------------------------
{
  const fs = 512e3, N = 512, carrier = 60e3, A = 0.0079; // 5 dB above the noise per bin (see the text)
  let last = -1, cache: Float32Array | null = null;
  const s = new Scene(el("s-avg"), (g, w, h, t) => {
    const K = 2 ** val("av-k");
    if (!cache || Math.floor(t * 5) !== last) { // a fresh noise sample 5 times a second
      last = Math.floor(t * 5);
      cache = avgSpectrum(synth(fs, (N * K) / fs, [{ kind: "USB", offset: carrier, tone: 0, amp: A }], 0.1), N, K);
    }
    const db = cache, floor = median(db), L = 14, R = w - 14, T = 20, B = h - 30, lo = floor - 16, hi = floor + 14;
    const X = (i: number) => L + (i / (N - 1)) * (R - L), Y = (v: number) => B - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1.2; g.beginPath();
    db.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
    line(g, L, Y(floor), R, Y(floor), C.muted, 1, [4, 4]); label(g, "noise floor (median)", L, Y(floor) - 5, C.muted, "left", 11);
    const ci = N / 2 + (carrier / fs) * N;
    line(g, X(ci), B + 2, X(ci), B + 12, C.yellow, 2); label(g, "a weak carrier is here", X(ci), B + 24, C.yellow, "center", 11);
    const others = Array.from(db).filter((_, i) => Math.abs(i - ci) > 3), m = others.reduce((a, v) => a + v, 0) / others.length;
    const sd = Math.sqrt(others.reduce((a, v) => a + (v - m) ** 2, 0) / others.length), grassTop = Math.max(...others);
    el("r-avg").innerHTML = `${K} FFT${K > 1 ? "s" : ""} averaged: the grass scatters <em class="b">±${sd.toFixed(1)} dB</em>; the carrier is <em class="y">${(db[ci] - grassTop).toFixed(1)} dB</em> ${db[ci] > grassTop ? "above" : "below"} the tallest blade of grass.`;
  }, 230, { label: "A noisy spectrum with a weak carrier, calming down as more FFTs are averaged" });
  controls(s, ["av-k"], () => { el("av-ko").textContent = String(2 ** val("av-k")); });
}

// --- 3. The noise floor: sort the bins, take the middle one ------------------------------------------------------------
{
  const N = 128, fs = 1.28e6;
  const stations = [[-450e3, 0.25], [-200e3, 0.05], [-60e3, 0.4], [150e3, 0.12], [330e3, 0.3], [520e3, 0.02]] as const;
  const db = avgSpectrum(synth(fs, (N * 16) / fs, stations.map(([offset, amp]) => ({ kind: "USB" as const, offset, tone: 0, amp })), 0.08), N, 16);
  const order = Array.from(db.keys()).sort((a, b) => db[a] - db[b]), rank = new Float32Array(N);
  order.forEach((bin, r) => (rank[bin] = r));
  const floor = db[order[N >> 1]], top = db[order[N - 1]];
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  new Scene(el("s-floor"), (g, w, h, t) => {
    const ph = t % 10, sorted = ph < 2 ? 0 : ph < 4 ? ease((ph - 2) / 2) : ph < 7 ? 1 : ease(1 - (ph - 7) / 2);
    const L = 14, R = w - 14, T = 26, B = h - 26, lo = floor - 12, hi = top + 3, bw = (R - L) / N;
    const Y = (v: number) => B - ((Math.max(lo, v) - lo) / (hi - lo)) * (B - T);
    for (let i = 0; i < N; i++) {
      const x = L + (i + (rank[i] - i) * sorted) * bw, isMed = i === order[N >> 1];
      g.fillStyle = isMed && ph >= 4 ? C.yellow : db[i] > floor + 10 ? C.pink : C.blue;
      g.fillRect(x, Y(db[i]), Math.max(1, bw - 1), B - Y(db[i]));
    }
    if (ph >= 4) { // the median's height, carried back over the spectrum
      line(g, L, Y(floor), R, Y(floor), C.yellow, 1.5, [5, 4]);
      label(g, `noise floor ${floor.toFixed(1)} dB`, L + 4, Y(floor) - 6, C.yellow, "left", 12);
    }
    const caption = ph < 2 ? "128 bins in frequency order: stations (pink) and noise (blue)" : ph < 4 ? "sorting the bins from quietest to loudest…" : ph < 7 ? "the middle bin of the sorted list is noise: the median" : "back in frequency order, with the floor where the median was";
    label(g, caption, L, 16, C.text, "left", 12);
    if (ph >= 4 && ph < 7) label(g, "← half the bins are quieter", (L + R) / 2 - 8, B + 18, C.muted, "right", 11), label(g, "half are louder →", (L + R) / 2 + 8, B + 18, C.muted, "left", 11);
  }, 250, { label: "Spectrum bins sliding into sorted order; the middle one is the noise floor" });
  el("r-floor").innerHTML = `Floor <em class="y">${floor.toFixed(1)} dB</em>; the strongest station is <em class="p">${(top - floor).toFixed(0)} dB</em> above it (its SNR). Six stations, and the median doesn't care where they are.`;
}

// --- 4. dB to colors: the contrast setting --------------------------------------------------------------------------------
{
  const N = 256, fs = 1.024e6, ROWS = 50;
  const sig = [{ kind: "FM" as const, offset: -300e3, tone: 900, amp: 0.3 }, { kind: "USB" as const, offset: -100e3, tone: 0, amp: 0.01 }, { kind: "AM" as const, offset: 150e3, tone: 500, amp: 0.08 }, { kind: "USB" as const, offset: 380e3, tone: 0, amp: 0.004 }];
  const rows = Array.from({ length: ROWS }, () => avgSpectrum(synth(fs, (N * 4) / fs, sig, 0.05), N, 4));
  const floor = median(Float32Array.from(rows, median));
  const s = new Scene(el("s-colors"), (g, w, h) => {
    const range = val("co-r"), L = 14, R = w - 14, bw = (R - L) / N, lineH = 70, stripT = 96, rowH = (h - stripT - 46) / ROWS;
    const X = (i: number) => L + i * bw, lo = floor - 10, hi = floor + 70, Y = (v: number) => 14 + lineH - ((Math.max(lo, v) - lo) / (hi - lo)) * lineH;
    g.fillStyle = "rgba(244,211,94,0.08)"; g.fillRect(L, Y(floor + range), R - L, Y(floor) - Y(floor + range)); // the dB span that gets colors
    line(g, L, Y(floor), R, Y(floor), C.muted, 1, [4, 4]); line(g, L, Y(floor + range), R, Y(floor + range), C.yellow, 1, [4, 4]);
    label(g, "floor = black", R, Y(floor) - 3, C.muted, "right", 10); label(g, `floor + ${range} dB = yellow`, R, Y(floor + range) - 3, C.yellow, "right", 10);
    g.strokeStyle = C.blue; g.lineWidth = 1.2; g.beginPath(); rows[0].forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
    rows.forEach((r, y) => r.forEach((v, i) => { g.fillStyle = heat((v - floor) / range); g.fillRect(X(i), stripT + y * rowH, bw + 0.5, rowH + 0.5); }));
    for (let i = 0; i <= 40; i++) { g.fillStyle = heat(i / 40); g.fillRect(L + (i / 41) * (R - L) * 0.5, h - 30, (R - L) * 0.5 / 41 + 1, 10); }
    label(g, `${floor.toFixed(0)} dB`, L, h - 6, C.muted, "left", 10); label(g, `${(floor + range).toFixed(0)} dB`, L + (R - L) * 0.5, h - 6, C.muted, "right", 10);
    label(g, "the color table: 256 colors from the floor up", L + (R - L) * 0.5 + 10, h - 21, C.muted, "left", 11);
  }, 300, { animated: false, label: "A spectrum line above a waterfall strip, colored with the chosen contrast" });
  controls(s, ["co-r"], () => { el("co-ro").textContent = `${val("co-r")} dB`; });
}

// --- 5. A click becomes a frequency -------------------------------------------------------------------------------------
{
  const fs = 2.4e6, C0 = 100e6, N = 1024;
  const db = avgSpectrum(synth(fs, (N * 8) / fs, [99.1e6, 99.5e6, 100.3e6, 100.7e6, 101.1e6].map((f, k) => ({ kind: "FM" as const, offset: f - C0, tone: 700 + 200 * k, amp: [0.3, 0.08, 0.25, 0.04, 0.15][k] })), 0.02), N, 8);
  const floor = median(db), top = Math.max(...db);
  let tuned = 300e3, clickFrac = 0.625;
  const box = () => { const span = fs / 2 ** val("tn-z"), mid = Math.max(-fs / 2 + span / 2, Math.min(fs / 2 - span / 2, tuned)); return { lo: mid - span / 2, hi: mid + span / 2 }; };
  const s = new Scene(el("s-tune"), (g, w, h) => {
    const { lo, hi } = box(), L = 14, R = w - 14, T = 18, B = h - 34;
    const X = (f: number) => L + ((f - lo) / (hi - lo)) * (R - L), Y = (v: number) => B - ((Math.max(floor - 5, v) - (floor - 5)) / (top + 3 - floor + 5)) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1.4; g.beginPath(); let first = true;
    for (let i = 0; i < N; i++) { const f = ((i - N / 2) / N) * fs; if (f < lo - fs / N || f > hi + fs / N) continue; first ? g.moveTo(X(f), Y(db[i])) : g.lineTo(X(f), Y(db[i])); first = false; }
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(X(tuned - 100e3), T, X(tuned + 100e3) - X(tuned - 100e3), B - T);
    line(g, X(tuned), T, X(tuned), B, C.yellow, 2);
    line(g, L + clickFrac * (R - L), B, L + clickFrac * (R - L), B + 8, C.pink, 2);
    const step = (hi - lo) > 1e6 ? 200e3 : (hi - lo) > 300e3 ? 50e3 : 10e3;
    for (let f = Math.ceil((C0 + lo) / step) * step; f <= C0 + hi; f += step) label(g, ((f) / 1e6).toFixed(step >= 1e5 ? 1 : 2), X(f - C0), B + 22, C.muted, "center", 11);
    label(g, "click anywhere on the chart", L, 12, C.muted, "left", 11);
  }, 220, { animated: false, label: "A spectrum of five FM stations; click to tune, with snapping to a channel step" });
  const canvas = el("s-tune").querySelector("canvas")!;
  canvas.style.cursor = "crosshair";
  const explain = () => {
    const { lo, hi } = box(), step = Number((el("tn-s") as HTMLSelectElement).value), f = lo + clickFrac * (hi - lo), abs = C0 + f;
    const snapped = step ? Math.round(abs / step) * step : abs;
    tuned = snapped - C0;
    el("r-tune").innerHTML = `x/W = <em>${clickFrac.toFixed(3)}</em> → f = ${fmtHz(lo)} + ${clickFrac.toFixed(3)} × ${fmtHz(hi - lo)} = <em class="p">${f >= 0 ? "+" : ""}${fmtHz(f)}</em> from the center → C + f = <em>${(abs / 1e6).toFixed(4)} MHz</em>${step ? ` → snapped to ${fmtHz(step)}: <em class="y">${(snapped / 1e6).toFixed(4)} MHz</em>` : ""}`;
  };
  canvas.addEventListener("click", (e) => { const r = canvas.getBoundingClientRect(); clickFrac = Math.min(1, Math.max(0, (e.clientX - r.left - 14) / (r.width - 28))); explain(); s.redraw(); });
  controls(s, ["tn-z", "tn-s"], () => { el("tn-zo").textContent = `${(2 ** val("tn-z")).toFixed(1)}×`; explain(); });
  el("tn-s").addEventListener("change", () => { explain(); s.redraw(); });
}

// --- 6. Filter shift: slide the window off a whistle ---------------------------------------------------------------------
{
  const fs = 48e3, BW = 2800, WHISTLE = 2600;
  const voice = [[400, 1], [700, 0.8], [1000, 0.6], [1500, 0.45], [2000, 0.3], [2400, 0.2]] as const; // USB: each tone sits that far above the carrier
  const s = new Scene(el("s-shift"), (g, w, h) => {
    const sh = val("sh-s"), L = 14, R = w - 14, T = 20, B = h - 34, f0 = -1500, f1 = 4500;
    const X = (f: number) => L + ((f - f0) / (f1 - f0)) * (R - L);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(X(sh), T, X(sh + BW) - X(sh), B - T);
    label(g, "passband", X(sh + BW / 2), T + 14, C.text, "center", 11);
    for (const [f, a] of voice) { const inside = f >= sh && f <= sh + BW; line(g, X(f), B, X(f), B - a * (B - T) * 0.7, inside ? C.blue : "#2f5866", 5); }
    const wIn = WHISTLE >= sh && WHISTLE <= sh + BW;
    line(g, X(WHISTLE), B, X(WHISTLE), T + 24, wIn ? C.yellow : "#6b5d2a", 3);
    label(g, "whistle", X(WHISTLE), T + 20, C.yellow, "center", 11);
    line(g, X(0), T, X(0), B, C.muted, 1, [3, 3]); label(g, "carrier", X(0), B + 30, C.muted, "center", 11);
    line(g, L, B, R, B, C.axis, 1);
    for (let f = -1000; f <= 4000; f += 1000) label(g, `${f / 1000} kHz`, X(f), B + 16, C.muted, "center", 10);
    const kept = voice.filter(([f]) => f >= sh && f <= sh + BW).reduce((a, [, v]) => a + v, 0) / voice.reduce((a, [, v]) => a + v, 0);
    el("r-shift").innerHTML = `Passband ${sh} to ${sh + BW} Hz above the carrier: the whistle is <em class="y">${wIn ? "inside (you hear it)" : "outside (gone)"}</em>, and <em class="b">${Math.round(kept * 100)}%</em> of the voice is kept.`;
  }, 210, { animated: false, label: "A voice's tones, a whistle, and the passband sliding over them" });
  controls(s, ["sh-s"], () => { const v = val("sh-s"); el("sh-so").textContent = `${v > 0 ? "+" : ""}${v} Hz`; });
  el("sh-play").addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement, n = fs * 3, iq = new Float32Array(2 * n);
    for (let k = 0; k < n; k++) {
      const t = k / fs, syll = 0.5 + 0.5 * Math.sin(TAU * 3.3 * t) ** 2; // syllables
      let re = 0.25 * Math.cos(TAU * WHISTLE * t), im = 0.25 * Math.sin(TAU * WHISTLE * t);
      for (const [f, a] of voice) { re += 0.12 * a * syll * Math.cos(TAU * f * t); im += 0.12 * a * syll * Math.sin(TAU * f * t); }
      iq[2 * k] = re; iq[2 * k + 1] = im;
    }
    const rx = new Receiver(fs, 0, "USB", BW, val("sh-s"));
    b.disabled = true; await playOnce(normalize(rx.process(iq).audio, 0.6), rx.audioFs); b.disabled = false;
  });
}

// --- 7. The squelch in the chart's dB ------------------------------------------------------------------------------------
{
  // 30 s at 20 chunks a second. Each chunk: 22 passband bins, each the average of 8 FFTs of noise (power ~ mean of 8
  // exponential draws), plus two transmissions: a strong one (+12 dB) and a weak one (+6 dB).
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const CH = 600, bins = 22, peaks = new Float32Array(CH), on = new Uint8Array(CH);
  for (let c = 0; c < CH; c++) {
    const tx = c > 80 && c < 200 ? 12 : c > 330 && c < 430 ? 6 : 0;
    on[c] = tx ? 1 : 0;
    let m = -Infinity;
    for (let b = 0; b < bins; b++) {
      let p = 0; for (let k = 0; k < 8; k++) p -= Math.log(1 - rnd()); p /= 8;
      if (tx && b === 11) p += 10 ** (tx / 10);
      m = Math.max(m, 10 * Math.log10(p));
    }
    peaks[c] = m + 0.2; // relative to the noise floor (the median of mean-of-8 noise sits ~0.2 dB under its mean)
  }
  const s = new Scene(el("s-sq"), (g, w, h, t) => {
    const thr = val("sq-t"), L = 46, R = w - 12, T = 18, B = h - 56, lo = -6, hi = 22, WIN = 200;
    const Y = (v: number) => B - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (B - T);
    let level = peaks[0], open = false; const lv = new Float32Array(CH), op = new Uint8Array(CH);
    for (let c = 0; c < CH; c++) { level = 0.5 * level + 0.5 * peaks[c]; if (!open && level > thr) open = true; else if (open && level < thr - 3) open = false; lv[c] = level; op[c] = open ? 1 : 0; }
    const end = Math.min(CH - 1, WIN + Math.floor((t * 20) % (CH - WIN))), start = end - WIN, X = (c: number) => L + ((c - start) / WIN) * (R - L);
    g.fillStyle = "rgba(244,140,60,0.13)"; g.fillRect(L, Y(thr), R - L, Y(thr - 3) - Y(thr)); // hysteresis band
    line(g, L, Y(0), R, Y(0), C.muted, 1, [4, 4]); label(g, "floor", L - 4, Y(0) + 4, C.muted, "right", 10);
    line(g, L, Y(thr), R, Y(thr), "#f48c3c", 2); label(g, "line", L - 4, Y(thr) + 4, "#f48c3c", "right", 10);
    g.strokeStyle = C.blue; g.lineWidth = 1.8; g.beginPath();
    for (let c = start; c <= end; c++) c > start ? g.lineTo(X(c), Y(lv[c])) : g.moveTo(X(c), Y(lv[c]));
    g.stroke();
    for (let c = start; c <= end; c++) {
      g.fillStyle = op[c] ? C.green : "#2a2f3a"; g.fillRect(X(c), B + 14, (R - L) / WIN + 0.6, 12);
      if (on[c]) { g.fillStyle = C.yellow; g.fillRect(X(c), B + 30, (R - L) / WIN + 0.6, 4); }
    }
    label(g, "loudest bin in the passband (dB over the floor)", L, 12, C.blue, "left", 11);
    label(g, "sound on (green)", L, B + 48, C.green, "left", 11); label(g, "someone transmitting (yellow)", R, B + 48, C.yellow, "right", 11);
    let falseOn = 0, caught = 0, missed = 0;
    for (let c = 0; c < CH; c++) { if (op[c] && !on.subarray(Math.max(0, c - 6), c + 1).some(Boolean)) falseOn++; if (on[c] && op[c]) caught++; if (on[c] && !op[c]) missed++; } // the tail just after a transmission isn't hiss
    el("r-sq").innerHTML = `Over 30 s: <em class="g">${Math.round((100 * caught) / (caught + missed))}%</em> of the transmissions heard, <em style="color:var(--red)">${(falseOn / 20).toFixed(1)} s</em> of noise let through. ${falseOn > 10 ? "The line is inside the noise's own peaks: hiss gets through." : caught / (caught + missed) < 0.95 ? "The line is above the weak transmission: it's cut." : "Just above the noise's peaks: both transmissions, no hiss."}`;
  }, 230, { label: "The passband's loudest bin over time, the squelch line, and when the sound is on" });
  controls(s, ["sq-t"], () => { el("sq-to").textContent = `${val("sq-t") > 0 ? "+" : ""}${val("sq-t")} dB`; });
}

// --- Lab: a live spectrum with this chapter's dials ----------------------------------------------------------------------
{
  let spec: Float32Array | null = null, center = 0, rate = 0, clickF: number | null = null;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    if (!spec) { label(g, "connect a dongle below", w / 2, h / 2, C.muted, "center", 13); return; }
    const N = spec.length, floor = median(spec), top = Math.max(...spec), L = 14, R = w - 14, T = 18, B = h - 30, lo = floor - 10, hi = Math.max(top + 3, floor + 30);
    const X = (i: number) => L + (i / (N - 1)) * (R - L), Y = (v: number) => B - ((Math.max(lo, v) - lo) / (hi - lo)) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1; g.beginPath(); spec.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
    line(g, L, Y(floor), R, Y(floor), C.yellow, 1, [4, 4]); label(g, `floor ${floor.toFixed(1)} dB`, L, Y(floor) - 5, C.yellow, "left", 11);
    for (let f = Math.ceil((center - rate / 2) / 1e5) * 1e5; f <= center + rate / 2; f += 2e5) label(g, (f / 1e6).toFixed(1), L + ((f - (center - rate / 2)) / rate) * (R - L), B + 18, C.muted, "center", 10);
    if (clickF !== null) { const x = L + ((clickF - (center - rate / 2)) / rate) * (R - L); line(g, x, T, x, B, C.pink, 1.5); }
    let best = 0; spec.forEach((v, i) => { if (Math.abs(i - N / 2) > N * 0.01 && v > spec![best]) best = i; });
    el("r-lab").innerHTML = `${N} bins of ${fmtHz(rate / N)} · strongest signal at <em>${((center + ((best - N / 2) / N) * rate) / 1e6).toFixed(3)} MHz</em>, SNR <em class="y">${(spec[best] - floor).toFixed(0)} dB</em>${clickF !== null ? ` · you clicked <em class="p">${(clickF / 1e6).toFixed(4)} MHz</em>` : ""}`;
  }, 220, { animated: false, label: "A live spectrum with the noise floor" });
  const canvas = el("s-lab").querySelector("canvas")!;
  canvas.addEventListener("click", (e) => { if (!rate) return; const r = canvas.getBoundingClientRect(); clickF = center + ((e.clientX - r.left - 14) / (r.width - 28) - 0.5) * rate; s.redraw(); });
  controls(s, ["lb-k"], () => { el("lb-ko").textContent = String(val("lb-k")); });
  lab(el("lab18"), {
    freqMHz: 118.7,
    onSamples: (cu8, r, c) => {
      const N = Number((el("lb-n") as HTMLSelectElement).value), x = decodeCU8(cu8);
      spec = avgSpectrum(x, N, val("lb-k")); center = c; rate = r;
      s.redraw();
    },
  });
}
