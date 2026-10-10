// Chapter 21: digital pictures from a weather satellite. A pass and its Doppler, QPSK on a constellation (and the Costas
// loop that stops it spinning), the convolutional code fixing errors, JPEG-style blocks, and a lab: a whole simulated
// pass decoded live by src/lrpt.ts, with the picture building up strip by strip.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, label, line, dot } from "./anim.ts";
import { Transmitter, Channel, Receiver, ConvEncoder, Viterbi, pass, earthStrip, encodeStrip, decodeStrip, W, SYM_RATE, FRAME_BYTES } from "../lrpt.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const constellation = (g: CanvasRenderingContext2D, pts: [number, number][], cx: number, cy: number, r: number, color: string) => {
  line(g, cx - r, cy, cx + r, cy, C.grid, 1); line(g, cx, cy - r, cx, cy + r, C.grid, 1);
  for (const [i, q] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) dot(g, cx + i * 0.707 * r * 0.7, cy - q * 0.707 * r * 0.7, "#3a4252", 5);
  g.fillStyle = color; for (const [i, q] of pts) g.fillRect(cx + i * r * 0.7 - 1, cy - q * r * 0.7 - 1, 2.2, 2.2);
};
const SNR = (range: number) => 13 - 20 * Math.log10(range / 850); // Es/N0 in dB: a link budget that falls with distance²

// --- 1. A pass --------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-pass"), (g, w, h) => {
    const p = pass(val("ps-e")), L = 46, R = w - 46, T = 20, B = h - 30, X = (t: number) => L + ((t + p.T / 2) / p.T) * (R - L);
    const Yel = (e: number) => B - (e / 90) * (B - T), Yd = (d: number) => (T + B) / 2 - (d / 3500) * ((B - T) / 2);
    line(g, L, B, R, B, C.axis, 1); line(g, L, Yd(0), R, Yd(0), C.grid, 1, [3, 4]);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(X(q.t), Yel(q.el)) : g.moveTo(X(q.t), Yel(q.el)))); g.stroke();
    g.strokeStyle = C.blue; g.lineWidth = 2.5; g.beginPath(); p.points.forEach((q, i) => (i ? g.lineTo(X(q.t), Yd(q.doppler)) : g.moveTo(X(q.t), Yd(q.doppler)))); g.stroke();
    // where the signal is strong enough to decode (Es/N0 above ~4 dB)
    const ok = p.points.filter((q) => SNR(q.range) > 4.5);
    if (ok.length) { g.fillStyle = "rgba(131,193,103,0.12)"; g.fillRect(X(ok[0].t), T, X(ok[ok.length - 1].t) - X(ok[0].t), B - T); }
    label(g, "elevation", L + 4, Yel(val("ps-e")) - 6, C.yellow, "left", 11); label(g, "+3.5 kHz", L - 4, Yd(3500) + 4, C.blue, "right", 10); label(g, "−3.5 kHz", L - 4, Yd(-3500) + 4, C.blue, "right", 10);
    label(g, "Doppler", R - 4, Yd(p.points[p.points.length - 1].doppler) - 8, C.blue, "right", 11);
    label(g, `${(p.T / 60).toFixed(1)} minutes horizon to horizon`, (L + R) / 2, B + 18, C.muted, "center", 11);
    const d = p.points.map((q) => q.doppler), good = ok.length ? (ok[ok.length - 1].t - ok[0].t) / 60 : 0;
    el("r-pass").innerHTML = `Up for <em class="y">${(p.T / 60).toFixed(1)} min</em>; the frequency slides from <em class="b">+${Math.max(...d).toFixed(0)} Hz</em> to <em class="b">${Math.min(...d).toFixed(0)} Hz</em>. Strong enough to decode for about <em class="g">${good.toFixed(1)} min</em> (shaded): low passes are short and far.`;
  }, 260, { animated: false, label: "A satellite pass: elevation and Doppler shift over time" });
  controls(s, ["ps-e"], () => (el("ps-eo").textContent = `${val("ps-e")}°`));
}

// --- 2. QPSK, spinning and locked -------------------------------------------------------------------------------------
{
  let tx = new Transmitter(), ch = new Channel(), rx = new Receiver(() => {}), key = "", lastT = -1;
  const s = new Scene(el("s-qpsk"), (g, w, h, t) => {
    const k = `${val("qp-n")}|${val("qp-f")}`; if (k !== key) { tx = new Transmitter(); ch = new Channel(); rx = new Receiver(() => {}); key = k; lastT = -1; }
    if (lastT < 0 || t - lastT > 0.1 || t < lastT) { rx.push(ch.apply(tx.next(1), val("qp-f"), val("qp-n"))); lastT = t; } // a frame's worth, ten times a second
    const r = Math.min(h / 2 - 16, w / 4 - 16);
    constellation(g, rx.raw.slice(-500), w / 4, h / 2, r, C.blue); label(g, "before the Costas loop", w / 4, h - 6, C.muted, "center", 11);
    constellation(g, rx.constellation.slice(-500), (3 * w) / 4, h / 2, r, C.green); label(g, "after it", (3 * w) / 4, h - 6, C.muted, "center", 11);
    el("r-qpsk").innerHTML = `Four phases, two bits each. A ${val("qp-f")} Hz offset turns the whole picture ${((val("qp-f") / SYM_RATE) * 360).toFixed(1)}° per symbol: a ring. The receiver measured <em class="b">${rx.coarseHz.toFixed(0)} Hz</em>; the loop now tracks <em class="b">${rx.stats.freqHz.toFixed(0)} Hz</em>${rx.stats.locked ? `, and sync words are showing up (<em class="g">locked</em>)` : ""}.`;
  }, 260, { label: "QPSK symbols before and after the Costas loop" });
  controls(s, ["qp-n", "qp-f"], () => { el("qp-no").textContent = `${val("qp-n")} dB`; el("qp-fo").textContent = `${val("qp-f")} Hz`; });
}

// --- 3. The convolutional code --------------------------------------------------------------------------------------------
{
  const text = "METEOR-M", bits = Uint8Array.from([...text].flatMap((c) => [...Array(8)].map((_, i) => (c.charCodeAt(0) >> (7 - i)) & 1)).concat(Array(8).fill(0)));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = new Scene(el("s-conv"), (g, w, h) => {
    seed = 7 + val("cv-s"); const coded = new ConvEncoder().encode(bits), nerr = Math.round(val("cv-e")), flip = new Set<number>();
    while (flip.size < nerr) flip.add(Math.floor(rnd() * coded.length));
    const rx = Array.from(coded, (b, i) => (flip.has(i) ? 1 - b : b)), v = new Viterbi(); for (let i = 0; i < rx.length; i += 2) v.push(1 - 2 * rx[i], 1 - 2 * rx[i + 1]); v.flush();
    const per = Math.floor((w - 20) / 6.2), cell = (w - 20) / per;
    rx.forEach((b, i) => { const x = 10 + (i % per) * cell, y = 10 + Math.floor(i / per) * 15; g.fillStyle = flip.has(i) ? C.red : b ? C.blue : "#2a3242"; g.fillRect(x, y, cell - 1, 12); });
    const out = String.fromCharCode(...[...Array(text.length)].map((_, c) => v.out.slice(c * 8, c * 8 + 8).reduce((a, b) => (a << 1) | b, 0)));
    const raw = String.fromCharCode(...[...Array(text.length)].map((_, c) => [...Array(8)].reduce((a, _, i) => (a << 1) | rx[2 * (c * 8 + i)], 0))).replace(/[^\x20-\x7e]/g, "·");
    label(g, `${coded.length} coded bits (red: flipped by noise)`, 10, h - 34, C.muted, "left", 11);
    label(g, `decoded: ${out}`, 10, h - 12, out === text ? C.green : C.red, "left", 15);
    el("r-conv").innerHTML = `${nerr} of ${coded.length} bits flipped (${((nerr / coded.length) * 100).toFixed(1)}%). Reading every other bit without the code would give <em class="p">${raw}</em>; Viterbi gives <em class="${out === text ? "g" : "p"}">${out}</em>.`;
  }, 200, { animated: false, label: "A message's coded bits with some flipped, and what the Viterbi decoder recovers" });
  controls(s, ["cv-e", "cv-s"], () => (el("cv-eo").textContent = String(val("cv-e"))));
}

// --- 4. JPEG-style blocks -------------------------------------------------------------------------------------------------
{
  const strips = [0, 1, 2, 3, 4, 5].map((k) => earthStrip(60 + k));
  const s = new Scene(el("s-dct"), (g, w, h) => {
    const keep = Math.round(val("dc-k")), sc = Math.min(1.4, (w - 30) / (2 * W)), img = (rows: Uint8Array[], x0: number) => rows.forEach((r, k) => { for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) { const v = r[y * W + x]; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x0 + x * sc, 20 + (k * 8 + y) * sc, sc + 0.5, sc + 0.5); } });
    const back = strips.map((r) => decodeStrip(encodeStrip(r, keep), keep));
    img(strips, 10); img(back, 20 + W * sc);
    label(g, "original", 10, 14, C.muted, "left", 11); label(g, `${keep} of 64 numbers per block`, 20 + W * sc, 14, C.muted, "left", 11);
    let se = 0, n = 0; strips.forEach((r, k) => r.forEach((v, i) => { se += (v - back[k][i]) ** 2; n++; }));
    el("r-dct").innerHTML = `Each 8×8 block becomes 64 "how much of this pattern" numbers; keeping the first <em class="y">${keep}</em> (the smooth patterns) sends ${((keep / 64) * 100).toFixed(0)}% of the data. PSNR <em class="b">${(10 * Math.log10(255 ** 2 / (se / n))).toFixed(1)} dB</em>.`;
  }, 110, { animated: false, label: "A strip of satellite picture, original and rebuilt from a few DCT coefficients per block" });
  controls(s, ["dc-k"]);
}

// --- Lab: a whole pass -----------------------------------------------------------------------------------------------------
{
  const N = 96, out = el("lab-img") as HTMLCanvasElement, cv = el("lab-plot") as HTMLCanvasElement;
  out.width = W; out.height = N * 8;
  const og = out.getContext("2d")!;
  let p = pass(60), k = N, tx = new Transmitter(), ch = new Channel(), rx = new Receiver(() => {}), timer = 0, log: { f: number; tracked: number; snr: number; ok: boolean }[] = [];
  const start = () => {
    clearTimeout(timer); p = pass(+sel("lab-e")); k = 0; log = []; tx = new Transmitter(); ch = new Channel();
    og.fillStyle = "#000"; og.fillRect(0, 0, W, N * 8);
    rx = new Receiver((strip, rows) => { const img = og.createImageData(W, 8); rows.forEach((v, i) => { img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255; }); og.putImageData(img, 0, (strip % N) * 8); if (log[strip]) log[strip].ok = true; });
    step();
  };
  const step = () => {
    if (k >= N) return;
    // frame k is sent at time t; Doppler slides smoothly through it; the noise follows the distance
    const at = (j: number) => p.points[Math.min(p.points.length - 1, Math.round((j / N) * (p.points.length - 1)))], a = at(k), b = at(k + 1), n = (FRAME_BYTES * 8 * 4);
    const snr = SNR(a.range) + val("lab-a");
    rx.push(ch.apply(tx.next(1), (i) => a.doppler + ((b.doppler - a.doppler) * i) / n, snr));
    log.push({ f: a.doppler, tracked: rx.stats.freqHz, snr, ok: false });
    draw(a.el); k++;
    timer = window.setTimeout(step, 1000 / +sel("lab-v"));
  };
  const draw = (elev: number) => {
    const g = cv.getContext("2d")!, w = (cv.width = cv.clientWidth * devicePixelRatio), h = (cv.height = 300 * devicePixelRatio), r = devicePixelRatio;
    g.setTransform(r, 0, 0, r, 0, 0); const W2 = w / r, H2 = h / r;
    g.fillStyle = C.stage; g.fillRect(0, 0, W2, H2);
    constellation(g, rx.constellation.slice(-400), 80, 80, 70, rx.stats.locked ? C.green : C.blue);
    const L = 170, R = W2 - 10, X = (i: number) => L + (i / N) * (R - L), Y = (f: number) => 80 - (f / 3500) * 70;
    line(g, L, Y(0), R, Y(0), C.grid, 1, [3, 4]);
    log.forEach((q, i) => { dot(g, X(i), Y(q.f), "#3a4252", 2); dot(g, X(i), Y(q.tracked), C.blue, 1.6); g.fillStyle = q.ok ? C.green : C.red; g.fillRect(X(i), 160, Math.max(1, (R - L) / N - 0.5), 10); });
    label(g, "Doppler: true (gray), tracked (blue)", L, 12, C.muted, "left", 11); label(g, "frames: decoded (green), lost (red)", L, 186, C.muted, "left", 11);
    const last = log[log.length - 1];
    label(g, `elevation ${elev.toFixed(0)}°   Es/N0 ${last ? last.snr.toFixed(1) : "–"} dB   ${rx.stats.locked ? "LOCKED" : "searching…"}`, 10, 220, rx.stats.locked ? C.green : C.yellow, "left", 13);
    label(g, `${rx.stats.frames} frames decoded, ${rx.stats.badFrames} failed the checksum, QPSK rotation ${rx.stats.rotation < 0 ? "?" : rx.stats.rotation * 90 + "°"}`, 10, 242, C.muted, "left", 12);
    el("lab-r").textContent = `${k + 1 >= N ? "Pass over. " : ""}${(p.T / 60).toFixed(1)} minutes of pass in ${(N / +sel("lab-v")).toFixed(0)} seconds; each strip is one frame.`;
  };
  el("lab-go").addEventListener("click", start);
  el("lab-ao").textContent = `${val("lab-a")} dB`; el("lab-a").addEventListener("input", () => (el("lab-ao").textContent = `${val("lab-a")} dB`));
  start();
}

(window as unknown as { blipContext: () => unknown }).blipContext = () => ({ page: "Radio course chapter 21: digital pictures from weather satellites (Meteor-M style LRPT): passes and Doppler, QPSK and the Costas loop, convolutional code and Viterbi, DCT blocks, sync words, and a simulated pass lab", labElevation: sel("lab-e") });
