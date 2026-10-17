// Chapter 21: digital radio from a weather satellite. A pass and its Doppler, symbols and the matched filter, an eye
// diagram with Gardner's early/late check, and QPSK on a constellation (and the Costas loop that stops it spinning).
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, label, line, dot } from "./anim.ts";
import { Transmitter, Channel, Receiver, pass, SYM_RATE } from "../lrpt.ts";
import { symbols, shape, noise, matched, snrAt, gardner, centerTx, centerMf, SPS, PULSE } from "./symbols.ts";

const el = (id: string) => document.getElementById(id)!;
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

// --- 1b. Symbols and the matched filter ----------------------------------------------------------------------------------
{
  const sym = symbols(400), tx = shape(sym), N = 16, k0 = 20, PEAK = Math.max(...PULSE); // show 16 symbols from the middle of the stream
  let rx = new Float64Array(0), mf = new Float64Array(0);
  const s = new Scene(el("s-symbols"), (g, w, h) => {
    const on = checked("sy-m"), L = 12, R = w - 12, mid = h / 2, amp = h * 0.28;
    const X = (sym: number) => L + ((sym - k0) / N) * (R - L), Y = (v: number) => mid - v * amp;
    line(g, L, mid, R, mid, C.grid, 1);
    g.strokeStyle = "#5b6475"; g.lineWidth = 2; g.beginPath(); // what was meant: ±1 per symbol
    for (let k = k0; k < k0 + N; k++) { g.moveTo(X(k), Y(sym[k])); g.lineTo(X(k + 1), Y(sym[k])); }
    g.stroke();
    g.fillStyle = on ? "rgba(88,196,221,0.35)" : C.blue; // what arrives: noisy samples (the bump of symbol k peaks at centerTx(k))
    for (let n = Math.ceil(centerTx(k0 - 0.5)); n < centerTx(k0 + N - 0.5); n++) { const kk = (n - centerTx(0)) / SPS + 0.5; g.fillRect(X(kk) - 1.5, Y(rx[n] / PEAK) - 1.5, 3, 3); } // drawn at the scale of the symbol (a lone bump peaks at PEAK)
    if (on) {
      g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
      for (let n = Math.ceil(centerMf(k0 - 0.5)); n < centerMf(k0 + N - 0.5); n++) { const kk = (n - centerMf(0)) / SPS + 0.5, x = X(kk), y = Y(mf[n]); n === Math.ceil(centerMf(k0 - 0.5)) ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
      for (let k = k0; k < k0 + N; k++) line(g, X(k + 0.5), Y(mf[centerMf(k)]) - 7, X(k + 0.5), Y(mf[centerMf(k)]) + 7, C.white, 2);
    }
    label(g, on ? "gray: meant · dots: arrived · yellow: filtered · white: middles" : "gray: meant (+1 or −1) · blue: what arrives", w / 2, h - 6, C.muted, "center", 11);
  }, 230, { animated: false, label: "Symbols as ±1 steps, the noisy samples that arrive, and the matched filter's smooth output" });
  controls(s, ["sy-n", "sy-m"], () => {
    const sigma = val("sy-n"), nz = noise(tx.length, sigma);
    rx = Float64Array.from(tx, (v, i) => v + nz[i]); mf = matched(rx);
    el("sy-no").textContent = sigma.toFixed(2);
    const a = snrAt(rx, sym, centerTx), b = snrAt(mf, sym, centerMf);
    el("r-symbols").innerHTML = `SNR at the symbols' middles: one sample <em class="b">${a.toFixed(1)} dB</em>` + (checked("sy-m") ? ` · after the matched filter <em class="y">${b.toFixed(1)} dB</em> (${(b - a).toFixed(1)} dB better)` : "");
  });
}

// --- 1c. When to look: an eye diagram and Gardner's early/late check ---------------------------------------------------------
{
  const sym = symbols(400, 11), tx = shape(sym), nz = noise(tx.length, 0.08, 4), y = matched(Float64Array.from(tx, (v, i) => v + nz[i]));
  const s = new Scene(el("s-timing"), (g, w, h) => {
    const off = val("tm-o"), L = 20, R = w - 20, mid = (h - 20) / 2, amp = (h - 40) * 0.38;
    const X = (u: number) => L + ((u + 1) / 2) * (R - L), Y = (v: number) => mid - v * amp; // u: −1 … +1 symbol around a middle
    line(g, L, mid, R, mid, C.grid, 1);
    g.strokeStyle = "rgba(88,196,221,0.25)"; g.lineWidth = 1.2;
    for (let k = 10; k < 150; k++) {
      g.beginPath();
      for (let j = -SPS; j <= SPS; j++) { const v = y[centerMf(k) + j]; j === -SPS ? g.moveTo(X(j / SPS), Y(v)) : g.lineTo(X(j / SPS), Y(v)); }
      g.stroke();
    }
    line(g, X(0), 10, X(0), h - 30, C.green, 1, [3, 4]); label(g, "the middle", X(0), h - 16, C.green, "center", 11);
    line(g, X(off), 10, X(off), h - 30, C.yellow, 2.5); label(g, "you sample here", X(off), 22, C.yellow, off > 0.2 ? "right" : off < -0.2 ? "left" : "center", 11);
    line(g, X(off - 0.5), mid - 8, X(off - 0.5), mid + 8, C.pink, 2); label(g, "halfway", X(off - 0.5), mid + 22, C.pink, "center", 10);
  }, 260, { animated: false, label: "An eye diagram: every symbol's stretch of the filtered signal overlaid, with the chosen sampling moment" });
  controls(s, ["tm-o"], () => {
    const off = val("tm-o"), e = gardner(y, sym, off);
    el("tm-oo").textContent = off === 0 ? "at the middle" : `${Math.abs(off).toFixed(2)} symbol ${off < 0 ? "early" : "late"}`;
    el("r-timing").innerHTML = `SNR here <em class="y">${snrAt(y, sym, centerMf, off).toFixed(1)} dB</em> (at the middle: ${snrAt(y, sym, centerMf, 0).toFixed(1)} dB) · Gardner's error <em class="p">${e >= 0 ? "+" : ""}${e.toFixed(2)}</em>: ` +
      (Math.abs(e) < 0.03 ? "on time" : e > 0 ? "early, so sample a little later" : "late, so sample a little earlier");
  });
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

(window as unknown as { blipContext: () => unknown }).blipContext = () => ({ page: "Radio course chapter 21: digital radio from weather satellites (Meteor-M style LRPT): passes and Doppler, symbols and the matched filter, eye diagrams and Gardner timing recovery, QPSK, Es/N0, the 4th-power trick and the Costas loop" });
