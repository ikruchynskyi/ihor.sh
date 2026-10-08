// Lesson 10: signals. Real spectra of synthesized CW/SSB/AM/FM, FM sidebands, splatter, intermodulation, constellations.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import { avgSpectrum } from "../../dsp.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const TAU = 2 * Math.PI;
const FS = 48000, SECS = 1.2, N = Math.round(FS * SECS);

let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };

/** A speech-like test signal: tones from 300 to 2800 Hz, rolled off, with syllable-like bursts. Returned analytic (I, Q). */
const SPEECH = (() => {
  seed = 5;
  const tones = Array.from({ length: 26 }, (_, k) => ({ f: 300 + k * 100, a: 1 / (1 + k * 0.15), p: rnd() * TAU }));
  const env = new Float32Array(N); for (let i = 0; i < N;) { const len = 2000 + Math.floor(rnd() * 5000), amp = 0.5 + 0.5 * rnd(); for (let k = 0; k < len && i < N; k++, i++) env[i] = amp * Math.sin((Math.PI * k) / len) ** 0.5; i += 300 + Math.floor(rnd() * 1500); }
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = i / FS; let r = 0, q = 0; for (const s of tones) { r += s.a * Math.cos(TAU * s.f * t + s.p); q += s.a * Math.sin(TAU * s.f * t + s.p); } re[i] = r * env[i]; im[i] = q * env[i]; }
  let pk = 0; for (const v of re) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < N; i++) { re[i] /= pk; im[i] /= pk; }
  return { re, im };
})();

/** Morse keying envelope for "CQ" at about 20 WPM with raised-cosine edges of the given rise time. */
function keying(rise: number) {
  const dot = 0.06, pattern = "-.-. --.-", on: [number, number][] = []; let t = 0.02;
  for (const c of pattern) { if (c === " ") { t += 2 * dot; continue; } const len = c === "-" ? 3 * dot : dot; on.push([t, t + len]); t += len + dot; }
  const e = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const tt = (i / FS) % (t + 0.1);
    let v = 0; for (const [a, b] of on) { if (tt >= a - rise && tt <= b + rise) { const up = Math.min(1, (tt - (a - rise)) / (2 * rise || 1e-9)), dn = Math.min(1, ((b + rise) - tt) / (2 * rise || 1e-9)); v = Math.max(v, 0.5 - 0.5 * Math.cos(Math.PI * Math.min(up, dn))); } }
    e[i] = v;
  }
  return e;
}

/** Interleave I/Q with a tiny noise floor, ready for the course's spectrum code. */
function iq(re: ArrayLike<number>, im: ArrayLike<number>) {
  seed = 9; const out = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { out[2 * i] = re[i] + 3e-4 * gauss(); out[2 * i + 1] = im[i] + 3e-4 * gauss(); }
  return out;
}

/** Draw a spectrum (dB, FFT-shifted, size n) over ±span Hz; returns the width (Hz) where it's within 30 dB of its peak. */
function plot(g: CanvasRenderingContext2D, w: number, h: number, sp: Float32Array, span: number, color = C.yellow, ticks = 4000) {
  const n = sp.length, L = 40, R = w - 16, T = 14, B = h - 26, top = Math.max(...sp);
  const px = (f: number) => L + ((f + span) / (2 * span)) * (R - L), py = (db: number) => T + (Math.min(80, top - db) / 80) * (B - T);
  for (const db of [0, -20, -40, -60, -80]) { line(g, L, py(top + db), R, py(top + db), "#1f242d", 1); label(g, `${db}`, L - 4, py(top + db) + 4, C.muted, "right", 9); }
  for (let f = -span; f <= span + 1; f += ticks) label(g, f === 0 ? "carrier" : `${f > 0 ? "+" : ""}${f / 1000}k`, px(f), B + 16, C.muted, "center", 9);
  g.strokeStyle = color; g.lineWidth = 1.6; g.beginPath(); let started = false;
  for (let i = 0; i < n; i++) { const f = (i / n - 0.5) * FS; if (f < -span || f > span) continue; const x = px(f), y = py(sp[i]); started ? g.lineTo(x, y) : g.moveTo(x, y); started = true; }
  g.stroke();
  // (A power-percentage bandwidth would be fooled by AM's big carrier, so measure the visible width instead.)
  let lo = 0; while (sp[lo] < top - 30) lo++;
  let hi = n - 1; while (sp[hi] < top - 30) hi--;
  return ((hi - lo) / n) * FS;
}

// --- 1. The modes ----------------------------------------------------------------------------------------------------------
{
  const cache: Record<string, Float32Array> = {};
  const make = (m: string) => {
    if (cache[m]) return cache[m];
    const re = new Float32Array(N), im = new Float32Array(N), a = SPEECH.re;
    if (m === "cw") { const e = keying(0.005); for (let i = 0; i < N; i++) re[i] = e[i]; }
    else if (m === "ssb") { re.set(SPEECH.re); im.set(SPEECH.im); }
    else if (m === "am") { for (let i = 0; i < N; i++) re[i] = 0.5 * (1 + 0.8 * a[i]); }
    else { let ph = 0; for (let i = 0; i < N; i++) { ph += (TAU * 5000 * a[i]) / FS; re[i] = Math.cos(ph); im[i] = Math.sin(ph); } }
    return (cache[m] = avgSpectrum(iq(re, im), 2048, 24));
  };
  let bw = 0;
  const s = new Scene(el("s-modes"), (g, w, h) => { bw = plot(g, w, h, make(sel("md-m")), 12000); }, 230, { animated: false, label: "The spectrum of a CW, SSB, AM or FM signal around its carrier" });
  controls(s, ["md-m"], () => {
    const m = sel("md-m"), names: Record<string, string> = { cw: "CW", ssb: "SSB", am: "AM", fm: "FM" };
    queueMicrotask(() => { el("r-modes").innerHTML = `${names[m]}: within 30 dB of its peak over about <em class="y">${bw >= 1000 ? (bw / 1000).toFixed(1) + " kHz" : Math.round(bw) + " Hz"}</em>.${m === "cw" ? " (Morse at 20 WPM with 5 ms edges.)" : m === "fm" ? " Its sidebands extend well beyond the audio itself." : ""}`; });
  });
}

// --- 2. FM sidebands and Carson's rule ---------------------------------------------------------------------------------------------
{
  let last = { dev: -1, fm: -1 }, spec: Float32Array = new Float32Array(0);
  const s = new Scene(el("s-fm"), (g, w, h) => {
    const dev = val("fm-d") * 1000, fm = val("fm-a") * 1000;
    if (dev !== last.dev || fm !== last.fm) {
      const re = new Float32Array(N), im = new Float32Array(N), beta = dev / fm;
      for (let i = 0; i < N; i++) { const ph = beta * Math.sin((TAU * fm * i) / FS); re[i] = Math.cos(ph); im[i] = Math.sin(ph); }
      spec = avgSpectrum(iq(re, im), 4096, 12); last = { dev, fm };
    }
    plot(g, w, h, spec, 20000, C.blue, 5000);
    const L = 40, R = w - 16, px = (f: number) => L + ((f + 20000) / 40000) * (R - L), half = dev + fm;
    g.fillStyle = "#83c16722"; g.fillRect(px(-half), 14, px(half) - px(-half), h - 40);
    line(g, px(-half), 14, px(-half), h - 26, C.green, 1.5, [4, 3]); line(g, px(half), 14, px(half), h - 26, C.green, 1.5, [4, 3]);
    label(g, `Carson: ${((2 * half) / 1000).toFixed(1)} kHz`, px(0), 26, C.green, "center", 11);
  }, 240, { animated: false, label: "The spectrum of an FM signal: sidebands spaced at the audio frequency, mostly within Carson's bandwidth" });
  controls(s, ["fm-d", "fm-a"], () => {
    const dev = val("fm-d"), fm = val("fm-a");
    el("fm-do").textContent = `±${dev} kHz`; el("fm-ao").textContent = `${fm} kHz`;
    el("r-fm").innerHTML = `Modulation index ${dev} ÷ ${fm} = <em class="b">${(dev / fm).toFixed(2)}</em>. Sidebands every ${fm} kHz; Carson's rule: 2 × (${dev} + ${fm}) = <em class="g">${2 * (dev + fm)} kHz</em>.`;
  });
}

// --- 3. Splatter, key clicks, overmodulation -----------------------------------------------------------------------------------------
{
  const cache = new Map<string, Float32Array>();
  const make = (m: string, x: number) => {
    const key = `${m}${x}`; if (cache.has(key)) return cache.get(key)!;
    const re = new Float32Array(N), im = new Float32Array(N);
    if (m === "cw") { const e = keying(0.004 * 0.008 ** x); re.set(e); } // edge half-time from 4 ms down to 32 µs
    else if (m === "am") { const depth = 0.6 + 1.2 * x; for (let i = 0; i < N; i++) re[i] = Math.min(1.25, Math.max(0, 0.5 * (1 + depth * SPEECH.re[i]))); }
    else { const drive = 0.5 + 6 * x; for (let i = 0; i < N; i++) { const t = i / FS, v = 0.5 * Math.cos(TAU * -500 * t) + 0.5 * Math.cos(TAU * 500 * t), clip = Math.tanh(drive * v) / Math.tanh(drive); re[i] = clip; } }
    const sp = avgSpectrum(iq(re, im), 2048, 24); cache.set(key, sp); return sp;
  };
  let bw = 0;
  const s = new Scene(el("s-dirty"), (g, w, h) => { bw = plot(g, w, h, make(sel("dt-m"), val("dt-x")), 12000, C.red); }, 230, { animated: false, label: "How a CW, AM or digital signal's spectrum spreads when it's pushed too hard" });
  controls(s, ["dt-m", "dt-x"], () => {
    const m = sel("dt-m"), x = val("dt-x");
    el("dt-xo").textContent = m === "cw" ? `${(8 * 0.008 ** x).toFixed(2)} ms edges` : m === "am" ? `${Math.round((0.6 + 1.2 * x) * 100)}% modulation` : `drive ×${(0.5 + 6 * x).toFixed(1)}`;
    queueMicrotask(() => {
      el("r-dirty").innerHTML = (m === "cw" ? (x > 0.7 ? "Hard keying: <em style='color:var(--red)'>key clicks</em> spread across kilohertz." : "Soft edges keep the signal narrow.")
        : m === "am" ? (0.6 + 1.2 * x > 1 ? "<em style='color:var(--red)'>Overmodulated</em>: the envelope hits zero and gets clipped; splatter widens the signal." : "Within 100% modulation: clean.")
        : (x > 0.4 ? "Overdriven: <em style='color:var(--red)'>IMD products</em> appear either side, the extra lines you'd see on a waterfall." : "Two clean tones.")) + ` Width within 30 dB of the peak: ${bw >= 1000 ? (bw / 1000).toFixed(1) + " kHz" : Math.round(bw) + " Hz"}.`;
    });
  });
}

// --- 4. Two-tone intermodulation ------------------------------------------------------------------------------------------------------
{
  const F1 = 4000, F2 = 5000; // low enough that every product up to third order stays below half the sample rate (no aliases)
  const cache = new Map<number, Float32Array>();
  const make = (k: number) => {
    if (cache.has(k)) return cache.get(k)!;
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) { const t = i / FS, x = 0.5 * Math.cos(TAU * F1 * t) + 0.5 * Math.cos(TAU * F2 * t); re[i] = x + 0.15 * k * x * x - 0.35 * k * x * x * x; }
    const sp = avgSpectrum(iq(re, im), 4096, 12); cache.set(k, sp); return sp;
  };
  const s = new Scene(el("s-imd"), (g, w, h) => {
    const sp = make(val("im-n")), n = sp.length, L = 40, R = w - 16, T = 30, B = h - 26, top = Math.max(...sp);
    const px = (f: number) => L + (f / 16000) * (R - L), py = (db: number) => T + (Math.min(90, top - db) / 90) * (B - T);
    for (const db of [0, -30, -60, -90]) { line(g, L, py(top + db), R, py(top + db), "#1f242d", 1); label(g, `${db}`, L - 4, py(top + db) + 4, C.muted, "right", 9); }
    g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.beginPath(); let st = false;
    for (let i = n / 2; i < n; i++) { const f = (i / n - 0.5) * FS; if (f > 16000) break; const x = px(f), y = py(sp[i]); st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; } g.stroke();
    const marks: [number, string, string][] = [[F1, "F1", C.text], [F2, "F2", C.text], [2 * F1 - F2, "2F1−F2", C.red], [2 * F2 - F1, "2F2−F1", C.red], [F2 - F1, "F2−F1", C.blue], [F1 + F2, "F1+F2", C.blue], [2 * F1, "2F1", C.blue], [2 * F2, "2F2", C.blue]];
    marks.forEach(([f, name, col], k) => label(g, name, px(f), 12 + (k % 2) * 12 + (col === C.red ? 0 : 0), col, "center", 9));
    for (const f of [0, 4000, 8000, 12000, 16000]) label(g, `${f / 1000} kHz`, px(f), B + 16, C.muted, "center", 9);
  }, 250, { animated: false, label: "Two tones through an overloaded amplifier: odd-order intermodulation products appear right next to them" });
  controls(s, ["im-n"], () => {
    const k = val("im-n");
    el("im-no").textContent = k ? `${Math.round(k * 100)}%` : "none";
    el("r-imd").innerHTML = k ? `Third-order products at <em style="color:var(--red)">3 and 6 kHz</em>, right beside the 4 and 5 kHz tones; second-order ones (blue) land well away, at 1, 8, 9 and 10 kHz. (Real radios do the same at MHz.)` : "A perfectly linear amplifier: just the two tones.";
  });
}

// --- 5. Constellations ------------------------------------------------------------------------------------------------------------------
{
  const POINTS: Record<string, [number, number][]> = {
    bpsk: [[-1, 0], [1, 0]],
    qpsk: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [a / Math.SQRT2, b / Math.SQRT2]),
    qam16: [-3, -1, 1, 3].flatMap((a) => [-3, -1, 1, 3].map((b) => [a / (3 * Math.SQRT2), b / (3 * Math.SQRT2)] as [number, number])),
  };
  const errRate = (pts: [number, number][], noise: number) => {
    seed = 21; let err = 0; const M = 4000;
    for (let i = 0; i < M; i++) { const k = Math.floor(rnd() * pts.length), [x, y] = pts[k], rx = x + noise * gauss(), ry = y + noise * gauss();
      let best = 0, bd = Infinity; pts.forEach(([px, py], j) => { const d = (px - rx) ** 2 + (py - ry) ** 2; if (d < bd) { bd = d; best = j; } }); if (best !== k) err++; }
    return err / M;
  };
  const s = new Scene(el("s-const"), (g, w, h, t) => {
    const pts = POINTS[sel("cs-m")], noise = val("cs-n"), cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 24;
    line(g, cx - r, cy, cx + r, cy, C.axis, 1); line(g, cx, cy - r, cx, cy + r, C.axis, 1);
    label(g, "I", cx + r + 6, cy + 4, C.green, "left", 11); label(g, "Q", cx + 4, cy - r - 4, C.yellow, "left", 11);
    seed = 1 + Math.floor(t * 8) * 13; // fresh noise a few times a second
    g.fillStyle = "#58c4dd99";
    for (let i = 0; i < 600; i++) { const [x, y] = pts[Math.floor(rnd() * pts.length)]; g.fillRect(cx + (x + noise * gauss()) * r * 0.8 - 1, cy - (y + noise * gauss()) * r * 0.8 - 1, 2, 2); }
    for (const [x, y] of pts) { g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(cx + x * r * 0.8, cy - y * r * 0.8, 5, 0, TAU); g.stroke(); }
  }, 300, { label: "A constellation diagram: received symbols scattered by noise around their ideal points" });
  controls(s, ["cs-m", "cs-n"], () => {
    const m = sel("cs-m"), pts = POINTS[m], noise = val("cs-n"), bits = Math.log2(pts.length), e = errRate(pts, noise);
    el("cs-no").textContent = noise.toFixed(2);
    el("r-const").innerHTML = `${bits} bit${bits > 1 ? "s" : ""} per symbol. With this much noise, about <em class="${e > 0.05 ? "p" : "g"}">${(e * 100).toFixed(1)}%</em> of symbols land closer to the wrong point. More points mean more data per symbol, but they need a cleaner signal.`;
  });
}
