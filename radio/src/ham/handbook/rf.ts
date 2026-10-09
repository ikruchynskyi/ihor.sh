// RF design labs: thermal resistance, L-network matching on a Smith chart, Friis noise cascade, ideal vs real filter
// (ABCD ladder analysis), phase noise and reciprocal mixing, and predistortion of a two-tone test.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import { avgSpectrum } from "../../dsp.ts";
import { lMatch, part, type LNet } from "../match.ts";
import { smithGrid, gammaOf } from "../smith.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

// --- 1. Heat ----------------------------------------------------------------------------------------------------------------
{
  const TA = 25, JC = 0.5, CS = 0.3;
  const temps = () => { const p = val("ht-p"), sa = Number(sel("ht-s")); const sink = TA + p * sa, cas = sink + p * CS, j = cas + p * JC; return { p, sink, cas, j }; };
  const s = new Scene(el("s-heat"), (g, w, h) => {
    const { sink, cas, j } = temps(), L = 70, R = w - 30, B = h - 26, T = 16, py = (c: number) => B - ((Math.min(c, 260) - 20) / 240) * (B - T);
    line(g, L, py(150), R, py(150), C.red, 1.5, [5, 4]); label(g, "150 °C: junction limit", L + 4, py(150) - 5, C.red, "left", 10);
    for (const c of [25, 100, 150, 200, 250]) label(g, `${c} °C`, L - 6, py(c) + 4, C.muted, "right", 9);
    const steps: [string, number][] = [["air", TA], ["heat sink", sink], ["case", cas], ["junction", j]], bw = (R - L) / 4 - 16;
    steps.forEach(([name, c], i) => {
      const x = L + i * ((R - L) / 4) + 8, col = c > 150 ? C.red : c > 100 ? C.yellow : C.blue;
      g.fillStyle = col + "aa"; g.fillRect(x, py(c), bw, B - py(c)); label(g, name, x + bw / 2, B + 14, C.text, "center", 10); label(g, `${c.toFixed(0)} °C`, x + bw / 2, py(c) - 5, col, "center", 11);
    });
  }, 240, { animated: false, label: "Temperatures from the air up to a transistor junction, rising across each thermal resistance" });
  controls(s, ["ht-p", "ht-s"], () => {
    const { p, j } = temps(), sa = Number(sel("ht-s"));
    el("ht-po").textContent = `${p} W`;
    el("r-heat").innerHTML = `T<sub>j</sub> = 25 + ${p} × (${JC} + ${CS} + ${sa}) = <em class="${j > 150 ? "p" : "g"}">${j.toFixed(0)} °C</em>${j > 150 ? ": too hot. A bigger sink, a fan, or less power." : "."}`;
  });
}

// --- 2. L-network matching on the Smith chart --------------------------------------------------------------------------------------
{
  const F = 7.1e6;
  const par = (r: number, x: number, b: number): [number, number] => { const yr = r / (r * r + x * x), yi = -x / (r * r + x * x) + b, d = yr * yr + yi * yi; return [yr / d, -yi / d]; };
  const pathOf = (R: number, X: number, n: LNet) => { // impedances along the way, as each part grows from zero to its value
    const a: [number, number][] = [], b: [number, number][] = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40; if (n.shuntAtLoad) a.push(par(R, X, n.B * u)); else a.push([R, X + n.X * u]); }
    const [r1, x1] = a[a.length - 1];
    for (let k = 0; k <= 40; k++) { const u = k / 40; if (n.shuntAtLoad) b.push([r1, x1 + n.X * u]); else b.push(par(R, X + n.X, n.B * u)); }
    return [a, b];
  };
  const s = new Scene(el("s-match"), (g, w, h) => {
    const R = val("mt-r"), X = val("mt-x"), sols = lMatch(R, X), n = sols[Math.min(sols.length - 1, Number(sel("mt-s")))];
    const R0 = Math.min(w / 2, h / 2) - 26, cx = w / 2, cy = h / 2, P = ([r, x]: [number, number]) => { const [gr, gi] = gammaOf(r, x); return [cx + gr * R0, cy - gi * R0] as const; };
    smithGrid(g, cx, cy, R0);
    if (!n) return;
    const [a, b] = pathOf(R, X, n);
    for (const [pts, col] of [[a, C.yellow], [b, C.green]] as const) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); pts.forEach((z, i) => { const [x, y] = P(z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    const [lx, ly] = P([R, X]); g.fillStyle = C.red; g.beginPath(); g.arc(lx, ly, 6, 0, TAU); g.fill(); label(g, "load", lx + 8, ly - 6, C.red, "left", 10);
    g.fillStyle = C.white; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill();
  }, 360, { animated: false, label: "A Smith chart showing the path from the load impedance to 50 ohms through two matching components" });
  controls(s, ["mt-r", "mt-x", "mt-s"], () => {
    const R = val("mt-r"), X = val("mt-x"), sols = lMatch(R, X), n = sols[Math.min(sols.length - 1, Number(sel("mt-s")))];
    el("mt-ro").textContent = `${R} Ω`; el("mt-xo").textContent = `${X >= 0 ? "+" : "−"}j${Math.abs(X)} Ω`;
    if (!n) { el("r-match").textContent = "Already matched."; return; }
    const first = n.shuntAtLoad ? part("shunt", n.B, F) : part("series", n.X, F), second = n.shuntAtLoad ? part("series", n.X, F) : part("shunt", n.B, F);
    el("r-match").innerHTML = `At 7.1 MHz: from the load, first a <em class="y">${first}</em>, then a <em class="g">${second}</em>, and the transmitter sees 50 Ω. Network Q ≈ ${Math.sqrt(Math.max(R, 50) / Math.min(R, 50) - 1).toFixed(1)}.`;
  });
}

// --- 3. Noise figure cascade --------------------------------------------------------------------------------------------------------
{
  const RX = { name: "receiver", g: 60, nf: 8 };
  const stages = () => {
    const pre = { name: "preamp", g: 20, nf: val("cs-n") }, coax = { name: "coax", g: -val("cs-l"), nf: val("cs-l") };
    return checked("cs-p") ? [pre, coax, RX] : [coax, pre, RX];
  };
  const friis = (st: { g: number; nf: number }[]) => { let gain = 1; return st.map((x, i) => { const F = 10 ** (x.nf / 10), c = i === 0 ? F : (F - 1) / gain; gain *= 10 ** (x.g / 10); return c; }); };
  const s = new Scene(el("s-cascade"), (g, w, h) => {
    const st = stages(), contrib = friis(st), total = contrib.reduce((a, b) => a + b, 0), L = 30, bw = (w - 60) / st.length;
    st.forEach((x, i) => {
      const bx = L + i * bw, y = 30;
      g.fillStyle = "#2a2f3a"; g.fillRect(bx + 10, y, bw - 40, 40); label(g, x.name, bx + bw / 2 - 10, y + 18, C.text, "center", 12);
      label(g, `${x.g >= 0 ? "+" : ""}${x.g} dB, NF ${x.nf.toFixed(1)} dB`, bx + bw / 2 - 10, y + 33, C.muted, "center", 9);
      if (i < st.length - 1) line(g, bx + bw - 30, y + 20, bx + bw + 10, y + 20, C.axis, 2);
      const share = contrib[i] / total, bh = share * (h - 110);
      g.fillStyle = [C.green, C.yellow, C.pink][i]; g.fillRect(bx + 30, h - 26 - bh, bw - 80, bh);
      label(g, `${Math.round(share * 100)}% of the noise`, bx + bw / 2 - 10, h - 30 - bh, C.text, "center", 10);
    });
    label(g, "antenna →", 4, 54, C.muted, "left", 9);
  }, 230, { animated: false, label: "A receiving chain of preamp, coax and receiver, with each stage's share of the total noise" });
  controls(s, ["cs-p", "cs-l", "cs-n"], () => {
    const total = friis(stages()).reduce((a, b) => a + b, 0);
    el("cs-lo").textContent = `${val("cs-l")} dB`; el("cs-no").textContent = `${val("cs-n").toFixed(1)} dB`;
    el("r-cascade").innerHTML = `System noise figure: <em class="${10 * Math.log10(total) < 2 ? "g" : "p"}">${(10 * Math.log10(total)).toFixed(2)} dB</em>. ${checked("cs-p") ? "With the preamp first, the cable's loss hardly counts." : "The cable's loss now adds straight onto the noise figure."}`;
  });
}

// --- 4. Ideal vs real filter: an ABCD ladder ------------------------------------------------------------------------------------------
{
  type Cx = [number, number];
  const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]], mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const inv = (a: Cx): Cx => { const d = a[0] * a[0] + a[1] * a[1]; return [a[0] / d, -a[1] / d]; };
  const FC = 8.5e6, R0 = 50, G = [0.618, 1.618, 2.0, 1.618, 0.618]; // 5-element Butterworth, shunt-C first
  const parts = G.map((gk, i) => (i % 2 === 0 ? { kind: "C" as const, v: gk / (TAU * FC * R0) } : { kind: "L" as const, v: (gk * R0) / (TAU * FC) }));
  const s21 = (f: number, real: boolean, lead: number) => {
    const w = TAU * f;
    let M: [Cx, Cx, Cx, Cx] = [[1, 0], [0, 0], [0, 0], [1, 0]]; // A B C D
    for (const p of parts) {
      let Z: Cx;
      if (p.kind === "C") Z = real ? [0.05, w * lead - 1 / (w * p.v)] : [0, -1 / (w * p.v)];
      else { const zl: Cx = real ? [(w * p.v) / 150, w * p.v] : [0, w * p.v]; Z = real ? inv(add(inv(zl), [0, w * 2e-12])) : zl; }
      const E: [Cx, Cx, Cx, Cx] = p.kind === "C" ? [[1, 0], [0, 0], inv(Z), [1, 0]] : [[1, 0], Z, [0, 0], [1, 0]];
      M = [add(mul(M[0], E[0]), mul(M[1], E[2])), add(mul(M[0], E[1]), mul(M[1], E[3])), add(mul(M[2], E[0]), mul(M[3], E[2])), add(mul(M[2], E[1]), mul(M[3], E[3]))];
    }
    const den = add(add(M[0], [M[1][0] / R0, M[1][1] / R0]), add([M[2][0] * R0, M[2][1] * R0], M[3]));
    const t = inv(den); return 20 * Math.log10(2 * Math.hypot(t[0], t[1]));
  };
  const s = new Scene(el("s-sim"), (g, w, h) => {
    const real = checked("sm-p"), lead = val("sm-l") * 1e-9, L = 50, R = w - 16, T = 14, B = h - 28;
    const px = (f: number) => L + (Math.log10(f / 1e6) / 3) * (R - L), py = (d: number) => T + (-Math.max(-100, Math.min(0, d)) / 100) * (B - T);
    for (const d of [0, -20, -40, -60, -80, -100]) { line(g, L, py(d), R, py(d), "#1f242d", 1); label(g, `${d}`, L - 4, py(d) + 4, C.muted, "right", 9); }
    for (const f of [1e6, 10e6, 100e6, 1e9]) label(g, f >= 1e9 ? "1 GHz" : `${f / 1e6} MHz`, px(f), B + 16, C.muted, "center", 9);
    for (const [r, col, wd] of [[false, C.blue, 2], [true, C.red, 2.5]] as const) {
      if (r && !real) continue;
      g.strokeStyle = col; g.lineWidth = wd; g.beginPath();
      for (let x = L; x <= R; x++) { const f = 1e6 * 10 ** (((x - L) / (R - L)) * 3), y = py(s21(f, r, lead)); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    label(g, "simulated, ideal parts", L + 8, T + 10, C.blue, "left", 10); if (real) label(g, "with parasitics", L + 8, T + 24, C.red, "left", 10);
  }, 260, { animated: false, label: "Frequency response of a five-element low-pass filter with ideal parts and with realistic parasitics" });
  controls(s, ["sm-p", "sm-l"], () => {
    const lead = val("sm-l") * 1e-9;
    el("sm-lo").textContent = `${val("sm-l")} nH`;
    el("r-sim").innerHTML = `Rejection at 21.3 MHz (third harmonic of 7.1): ideal ${(-s21(21.3e6, false, lead)).toFixed(0)} dB, real ${(-s21(21.3e6, true, lead)).toFixed(0)} dB. At 146 MHz: ideal ${(-s21(146e6, false, lead)).toFixed(0)} dB, <em class="p">real ${(-s21(146e6, true, lead)).toFixed(0)} dB</em>.`;
  });
}

// --- 5. Phase noise and reciprocal mixing ---------------------------------------------------------------------------------------------
{
  const BW = 2400, FLOOR = -130; // receiver bandwidth and noise floor (dBm)
  const L = (off: number) => Math.max(-165, Number(sel("pn-o")) + 20 * Math.log10(1e4 / off)); // dBc/Hz, −20 dB/decade
  const offOf = () => 1e3 * 100 ** val("pn-d"); // 1 kHz … 100 kHz
  const s = new Scene(el("s-pn"), (g, w, h) => {
    const S = val("pn-s"), off = offOf(), Lx = 50, R = w - 16, T = 14, B = h - 28;
    const px = (f: number) => Lx + (Math.log10(f / 1e3) / 2) * (R - Lx), py = (d: number) => T + ((-40 - Math.max(-160, Math.min(-40, d))) / 120) * (B - T);
    for (const d of [-40, -80, -120, -160]) { line(g, Lx, py(d), R, py(d), "#1f242d", 1); label(g, `${d}`, Lx - 4, py(d) + 4, C.muted, "right", 9); }
    for (const f of [1e3, 1e4, 1e5]) label(g, `${f / 1e3} kHz`, px(f), B + 16, C.muted, "center", 9);
    line(g, Lx, py(FLOOR), R, py(FLOOR), C.muted, 1.5, [5, 4]); label(g, "receiver noise floor", R, py(FLOOR) - 5, C.muted, "right", 10);
    g.strokeStyle = C.pink; g.lineWidth = 2.5; g.beginPath();
    for (let x = Lx; x <= R; x++) { const f = 1e3 * 100 ** ((x - Lx) / (R - Lx)), y = py(S + L(f) + 10 * Math.log10(BW)); x === Lx ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    g.fillStyle = C.yellow; g.beginPath(); g.arc(px(off), py(S + L(off) + 10 * Math.log10(BW)), 6, 0, TAU); g.fill();
    label(g, "noise the neighbor adds in your passband, by its distance", Lx + 4, T + 4, C.pink, "left", 10);
  }, 240, { animated: false, label: "Noise added to the receiver by reciprocal mixing against the distance of a strong nearby signal" });
  controls(s, ["pn-o", "pn-s", "pn-d"], () => {
    const S = val("pn-s"), off = offOf(), n = S + L(off) + 10 * Math.log10(BW), total = 10 * Math.log10(10 ** (n / 10) + 10 ** (FLOOR / 10));
    el("pn-so").textContent = `${S} dBm`; el("pn-do").textContent = `${(off / 1e3).toFixed(1)} kHz away`;
    el("r-pn").innerHTML = `Reciprocal-mixing noise ${n.toFixed(0)} dBm against a floor of ${FLOOR}: your receiver is <em class="${total - FLOOR > 3 ? "p" : "g"}">${(total - FLOOR).toFixed(1)} dB deafer</em>.`;
  });
}

// --- 6. Predistortion of a two-tone test --------------------------------------------------------------------------------------------
{
  const FS = 16000, N = 16384;
  const pa = (r: number) => Math.tanh(r); // AM-AM compression, saturating at 1
  const pre = (r: number) => Math.atanh(Math.min(r, 0.995)) * (1 - 0.12 * r * r); // the inverse, as measured: close, never perfect
  const run = (drive: number, on: boolean) => {
    const iq = new Float32Array(2 * N);
    for (let i = 0; i < N; i++) { const env = drive * Math.abs(Math.cos((TAU * 500 * i) / FS)), sign = Math.cos((TAU * 500 * i) / FS) >= 0 ? 1 : -1; const r = on ? pre(env) : env; iq[2 * i] = sign * pa(r) + 1e-5 * Math.sin(i * 1.7); iq[2 * i + 1] = 1e-5 * Math.cos(i * 2.3); }
    return avgSpectrum(iq, 2048, 8);
  };
  const cache = new Map<string, Float32Array>();
  const get = (d: number, on: boolean) => { const k = `${d}${on}`; if (!cache.has(k)) cache.set(k, run(d, on)); return cache.get(k)!; };
  const imd = (sp: Float32Array) => { const n = sp.length, bin = (f: number) => Math.round((f / FS + 0.5) * n); return Math.max(sp[bin(500)], sp[bin(500) + 1], sp[bin(500) - 1]) - Math.max(sp[bin(1500)], sp[bin(1500) + 1], sp[bin(1500) - 1]); };
  const s = new Scene(el("s-pd"), (g, w, h) => {
    const d = val("pd-d"), on = checked("pd-on"), sp = get(d, on), n = sp.length, top = Math.max(...sp), L = 40, R = w * 0.68, T = 14, B = h - 28;
    const px = (f: number) => L + ((f + 4000) / 8000) * (R - L), py = (db: number) => T + (Math.min(80, top - db) / 80) * (B - T);
    for (const db of [0, -20, -40, -60, -80]) { line(g, L, py(top + db), R, py(top + db), "#1f242d", 1); label(g, `${db}`, L - 4, py(top + db) + 4, C.muted, "right", 9); }
    g.strokeStyle = on ? C.green : C.red; g.lineWidth = 1.6; g.beginPath(); let st = false;
    for (let i = 0; i < n; i++) { const f = (i / n - 0.5) * FS; if (Math.abs(f) > 4000) continue; st ? g.lineTo(px(f), py(sp[i])) : g.moveTo(px(f), py(sp[i])); st = true; }
    g.stroke(); label(g, "output spectrum (two tones ±500 Hz)", L, T - 2, C.muted, "left", 9);
    // transfer curves inset
    const ix = R + 30, iw = w - ix - 16, iy = T + 10, ih = B - iy, X = (v: number) => ix + (v / 1.6) * iw, Y = (v: number) => iy + ih - (v / 1.1) * ih;
    if (iw > 60) {
      g.strokeStyle = C.axis; g.lineWidth = 1; g.strokeRect(ix, iy, iw, ih);
      const curve = (f: (v: number) => number, col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let v = 0; v <= 1.6; v += 0.02) { const y = Y(Math.min(1.1, f(v))); v ? g.lineTo(X(v), y) : g.moveTo(X(v), y); } g.stroke(); };
      curve((v) => pa(v), C.red); if (on) curve((v) => pa(pre(v)), C.green);
      line(g, X(d), iy, X(d), iy + ih, C.white, 1, [3, 3]); label(g, "in → out", ix + 4, iy + 12, C.muted, "left", 9);
    }
  }, 240, { animated: false, label: "The output spectrum of a two-tone test through a compressing amplifier, with and without predistortion" });
  controls(s, ["pd-d", "pd-on"], () => {
    const d = val("pd-d"), on = checked("pd-on"), v = imd(get(d, on));
    el("pd-do").textContent = `${Math.round(d * 100)}%`;
    el("r-pd").innerHTML = `Third-order products <em class="${v > 30 ? "g" : "p"}">${v > 70 ? "more than 70" : v.toFixed(0)} dB</em> below the tones${on && d >= 1 ? " (driving into saturation: predistortion can't help past the maximum)" : ""}. Good linear amplifiers manage 30–40 dB.`;
  });
}
