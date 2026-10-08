// Lesson 4: resonance and Q. The tank, the resonance curve, series vs parallel, the impedance plane, skin effect, filters.
import "../ham.css";
import { C, Scene, controls, val, label, line, arrow } from "../../course/anim.ts";
import { capacitor, inductor, ground, wire, type Pt } from "../circuit.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;
const mhz = (f: number) => (f >= 1e6 ? `${(f / 1e6).toFixed(2)} MHz` : `${(f / 1e3).toFixed(1)} kHz`);

// --- 1. The tank: energy swinging between the fields -----------------------------------------------------------------
{
  const f0 = () => 1 / (TAU * Math.sqrt(val("k-l") * 1e-6 * val("k-c") * 1e-12));
  const REF = 1 / (TAU * Math.sqrt(50e-6 * 40e-12));
  let phase = 0, lastT = 0;
  const s = new Scene(el("s-tank"), (g, w, h, t) => {
    const dt = Math.max(0, t - lastT); lastT = t;
    phase += dt * TAU * 0.45 * Math.min(3, Math.max(0.25, f0() / REF)); // slowed down ~10 million times, pitch kept relative
    const q = Math.cos(phase), i = Math.sin(phase);
    const x0 = 70, x1 = Math.min(250, w * 0.38), y0 = 40, y1 = h - 40, cy = (y0 + y1) / 2;
    const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
    wire(g, loop);
    capacitor(g, [x0, cy - 30], [x0, cy + 30], C.blue, "");
    inductor(g, [x1, cy - 36], [x1, cy + 36], C.pink, "");
    // charge on the plates, current arrows on the wire, field around the coil
    const n = Math.round(Math.abs(q) * 5), top = q > 0 ? "+" : "−", bot = q > 0 ? "−" : "+";
    for (let k = 0; k < n; k++) { label(g, top, x0 - 22 + k * 9, cy - 12, top === "+" ? C.red : C.text, "left", 11); label(g, bot, x0 - 22 + k * 9, cy + 22, bot === "+" ? C.red : C.text, "left", 11); }
    if (Math.abs(i) > 0.15) { const dir = i > 0 ? 1 : -1, mx = (x0 + x1) / 2; arrow(g, mx - 20 * dir, y0, mx + 20 * dir, y0, C.green, 2 + 2 * Math.abs(i)); }
    for (let r = 1; r <= 3; r++) { g.strokeStyle = `rgba(224, 122, 159, ${0.55 * i * i})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x1, cy, 16 + r * 12, 44 + r * 8, 0, 0, TAU); g.stroke(); }
    // energy bars
    const bx = x1 + 70, bw = 28, bh = h - 90;
    if (w > 420) {
      for (const [k, e, col, name] of [[0, q * q, C.blue, "electric (C)"], [1, i * i, C.pink, "magnetic (L)"]] as const) {
        const x = bx + k * 70; g.strokeStyle = C.axis; g.lineWidth = 1; g.strokeRect(x, 40, bw, bh);
        g.fillStyle = col; g.fillRect(x, 40 + bh * (1 - e), bw, bh * e); label(g, name, x + bw / 2, h - 30, col, "center", 10);
      }
      label(g, "energy", bx + 49, 30, C.muted, "center", 11);
    }
    // the swing analogy
    if (w > 640) {
      const px = w - 110, py = 40, L = h - 110, ang = 0.6 * q;
      line(g, px - 40, py, px + 40, py, C.axis, 3);
      const sx = px + L * Math.sin(ang), sy = py + L * Math.cos(ang);
      line(g, px, py, sx, sy, C.muted, 2); g.fillStyle = C.yellow; g.fillRect(sx - 16, sy - 4, 32, 8);
      label(g, "a swing: height ↔ speed", px, h - 14, C.muted, "center", 11);
    }
  }, 260, { label: "An LC tank circuit: energy swinging between the capacitor's electric field and the inductor's magnetic field, like a swing" });
  controls(s, ["k-l", "k-c"], () => {
    el("k-lo").textContent = `${val("k-l")} µH`; el("k-co").textContent = `${val("k-c")} pF`;
    el("r-tank").innerHTML = `f₀ = 1 ÷ (2π √(LC)) = <em class="y">${mhz(f0())}</em> (shown about ten million times slower).`;
  });
}

// --- 2. The resonance curve and Q ------------------------------------------------------------------------------------------
{
  const amp = (x: number, Q: number) => 1 / Math.sqrt(1 + Q * Q * (x - 1 / x) ** 2);
  let phase = 0, lastT = 0;
  const s = new Scene(el("s-curve"), (g, w, h, t) => {
    const Q = val("q-q"), fd = val("q-f"), dt = Math.max(0, t - lastT); lastT = t; phase += dt * TAU * 0.8 * fd;
    const L = 40, R = w < 600 ? w - 20 : w - 160, T = 20, B = h - 30, px = (x: number) => L + ((x - 0.8) / 0.4) * (R - L), py = (a: number) => B - a * (B - T);
    line(g, L, B, R, B, C.axis, 1);
    line(g, L, py(Math.SQRT1_2), R, py(Math.SQRT1_2), C.muted, 1, [3, 4]); label(g, "half power (−3 dB)", R, py(Math.SQRT1_2) - 6, C.muted, "right", 10);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    for (let xx = L; xx <= R; xx++) { const x = 0.8 + ((xx - L) / (R - L)) * 0.4, y = py(amp(x, Q)); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); }
    g.stroke();
    const half = 1 / (2 * Q); line(g, px(1 - half), py(Math.SQRT1_2), px(1 + half), py(Math.SQRT1_2), C.green, 3);
    label(g, "bandwidth = f₀ / Q", px(1), py(Math.SQRT1_2) + 16, C.green, "center", 10);
    for (const [x, s1] of [[0.8, "0.8 f₀"], [0.9, "0.9 f₀"], [1, "f₀"], [1.1, "1.1 f₀"], [1.2, "1.2 f₀"]] as const) label(g, s1, px(x), B + 16, C.muted, "center", 10);
    const a = amp(fd, Q); line(g, px(fd), B, px(fd), py(a), C.blue, 1.5, [3, 3]); g.fillStyle = C.blue; g.beginPath(); g.arc(px(fd), py(a), 5, 0, TAU); g.fill();
    if (w >= 600) { // a swing pushed at the drive frequency, swinging as much as the response
      const sx = w - 80, sy = 30, len = h - 90, ang = 0.4 * a * Math.cos(phase);
      line(g, sx - 30, sy, sx + 30, sy, C.axis, 3); const ex = sx + len * Math.sin(ang), ey = sy + len * Math.cos(ang);
      line(g, sx, sy, ex, ey, C.muted, 2); g.fillStyle = C.blue; g.fillRect(ex - 14, ey - 4, 28, 8);
      label(g, "response", sx, h - 10, C.muted, "center", 10);
    }
  }, 260, { label: "A resonance curve: the response peaks at the resonant frequency; higher Q makes it taller and narrower" });
  controls(s, ["q-q", "q-f"], () => {
    const Q = val("q-q"), fd = val("q-f"), a = amp(fd, Q);
    el("q-qo").textContent = `${Q}`; el("q-fo").textContent = `${fd.toFixed(3)} f₀`;
    el("r-curve").innerHTML = `Response at ${fd.toFixed(3)} f₀: <em class="b">${(20 * Math.log10(a)).toFixed(1)} dB</em>. Bandwidth f₀ ÷ Q = <em class="g">${(100 / Q).toFixed(2)}%</em> of f₀: at 7.1 MHz, ${(7100 / Q).toFixed(1)} kHz.`;
  });
}

// --- 3. Series vs parallel -------------------------------------------------------------------------------------------------------
{
  const X0 = 100, RS = 10, RP = 1000; // Q = 10 both ways
  const zSeries = (f: number) => Math.hypot(RS, X0 * f - X0 / f);
  const zPar = (f: number) => 1 / Math.hypot(1 / RP, f / X0 - 1 / (f * X0));
  const s = new Scene(el("s-sp"), (g, w, h) => {
    const par = checked("p-par"), f = val("p-f"), z = par ? zPar : zSeries;
    const L = 50, R = w * 0.62, T = 20, B = h - 30, px = (x: number) => L + ((x - 0.6) / 0.8) * (R - L), py = (ohm: number) => B - ((Math.log10(ohm) - 0.7) / 2.5) * (B - T);
    line(g, L, B, R, B, C.axis, 1); line(g, L, T, L, B, C.axis, 1);
    for (const o of [10, 100, 1000]) label(g, o >= 1000 ? "1 kΩ" : `${o} Ω`, L - 4, py(o) + 4, C.muted, "right", 10);
    g.strokeStyle = par ? C.pink : C.blue; g.lineWidth = 2.5; g.beginPath();
    for (let xx = L; xx <= R; xx++) { const x = 0.6 + ((xx - L) / (R - L)) * 0.8, y = Math.max(T, py(z(x))); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); }
    g.stroke(); label(g, `|Z| of the ${par ? "parallel" : "series"} circuit`, L + 6, T + 4, par ? C.pink : C.blue, "left", 11);
    line(g, px(1), T, px(1), B, C.muted, 1, [3, 4]); label(g, "f₀", px(1), B + 16, C.muted, "center", 10);
    g.fillStyle = C.yellow; g.beginPath(); g.arc(px(f), Math.max(T, py(z(f))), 5, 0, TAU); g.fill();
    // bars: current from the source, and the current sloshing inside / voltage across C
    // Bars, all for the same applied voltage: the source current (scaled to its largest value on this sweep), and either the
    // current circulating round the L–C loop (the smaller of the two branch currents) or the voltage across C.
    const iin = 1 / z(f), iMax = Math.max(1 / z(0.6), 1 / z(1.4), 1 / z(1));
    const bars: [string, number, number, string][] = par
      ? [["source current", iin / iMax, 1, C.green], ["circulating (L–C)", Math.min(f, 1 / f), 1, C.pink]]
      : [["source current", iin / iMax, 1, C.green], ["V across C (× in)", (iin * X0) / f, 10, C.blue]];
    const bx = R + 40, bw = 30, bh = h - 90;
    bars.forEach(([name, v, max, col], k) => {
      const x = bx + k * 100; if (x + bw > w) return;
      g.strokeStyle = C.axis; g.lineWidth = 1; g.strokeRect(x, 30, bw, bh);
      const fr = Math.min(1, v / max); g.fillStyle = col; g.fillRect(x, 30 + bh * (1 - fr), bw, bh * fr);
      label(g, name.split(" (")[0], x + bw / 2, h - 34, col, "center", 9); if (name.includes("(")) label(g, "(" + name.split(" (")[1], x + bw / 2, h - 22, col, "center", 9);
      label(g, max === 10 ? `${v.toFixed(1)}×` : "", x + bw / 2, 24, col, "center", 10);
    });
  }, 260, { animated: false, label: "Impedance against frequency for a series LC circuit (a dip) and a parallel LC circuit (a peak)" });
  controls(s, ["p-par", "p-f"], () => {
    const par = checked("p-par"), f = val("p-f"), z = par ? zPar(f) : zSeries(f);
    el("p-fo").textContent = `${f.toFixed(3)} f₀`;
    el("r-sp").innerHTML = `${par ? "Parallel" : "Series"} circuit at ${f.toFixed(3)} f₀: |Z| = <em class="y">${z.toFixed(0)} Ω</em>. ${Math.abs(f - 1) < 0.01 ? (par ? "At resonance: maximum impedance (≈ R), minimum current drawn, maximum current circulating inside." : "At resonance: minimum impedance (≈ R), maximum current, and the voltage across C is Q = 10 times the applied voltage.") : ""}`;
  });
}

// --- 4. The impedance plane ------------------------------------------------------------------------------------------------------
{
  const reac = () => { const kind = (el("z-kind") as HTMLSelectElement).value, f = val("z-f") * 1e6; return kind === "L18" ? TAU * f * 18e-6 : -1 / (TAU * f * (kind === "C38" ? 38e-12 : 19e-12)); };
  const s = new Scene(el("s-plane"), (g, w, h) => {
    // Same scale both ways, so angles are true; the grid is centred in the canvas.
    const M = 500, r = val("z-r"), x = reac(), k = Math.min((w - 120) / M, (h / 2 - 16) / M), ox = (w - M * k) / 2 + 20, oy = h / 2;
    for (let v = 0; v <= M; v += 100) { line(g, ox + v * k, oy - M * k, ox + v * k, oy + M * k, "#1f242d", 1); label(g, `${v}`, ox + v * k, oy + 14, C.muted, "center", 9); }
    for (let v = -M; v <= M; v += 100) { line(g, ox, oy - v * k, ox + M * k, oy - v * k, "#1f242d", 1); if (v) label(g, `${v > 0 ? "+" : "−"}j${Math.abs(v)}`, ox - 6, oy - v * k + 4, C.muted, "right", 9); }
    line(g, ox, oy, ox + M * k, oy, C.axis, 1.5); line(g, ox, oy - M * k, ox, oy + M * k, C.axis, 1.5);
    label(g, "resistance →", ox + M * k, oy - 6, C.muted, "right", 10); label(g, "inductive (+j)", ox + 6, oy - M * k + 12, C.pink, "left", 10); label(g, "capacitive (−j)", ox + 6, oy + M * k - 4, C.blue, "left", 10);
    const xc = Math.max(-M - 40, Math.min(M + 40, x));
    arrow(g, ox, oy, ox + r * k, oy - xc * k, C.yellow, 3);
    g.fillStyle = C.yellow; g.beginPath(); g.arc(ox + r * k, oy - xc * k, 5, 0, TAU); g.fill();
  }, 420, { animated: false, label: "The impedance of a resistor plus a coil or capacitor, plotted with resistance across and reactance up or down" });
  controls(s, ["z-r", "z-kind", "z-f"], () => {
    const r = val("z-r"), x = reac(), mag = Math.hypot(r, x), deg = (Math.atan2(x, r) * 180) / Math.PI;
    el("z-ro").textContent = `${r} Ω`; el("z-fo").textContent = `${val("z-f").toFixed(1)} MHz`;
    el("r-plane").innerHTML = `Reactance ${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)} Ω. Rectangular: <em class="y">${r} ${x >= 0 ? "+" : "−"} j${Math.abs(x).toFixed(0)} Ω</em>. Polar: <em class="y">${mag.toFixed(0)} Ω at ${deg.toFixed(1)}°</em>.`;
  });
}

// --- 5. Skin effect -----------------------------------------------------------------------------------------------------------------
{
  const fOf = () => 10 ** (2 + val("s-f") * 1.2); // 100 Hz … 100 MHz
  const RWIRE = 1; // mm
  const s = new Scene(el("s-skin"), (g, w, h) => {
    const f = fOf(), delta = 66 / Math.sqrt(f); // copper, mm
    const cx = w / 2, cy = h / 2, rad = Math.min(h / 2 - 16, 90);
    for (let r = rad; r > 0; r -= 1) {
      const depth = ((rad - r) / rad) * RWIRE, dens = Math.exp(-depth / delta);
      g.fillStyle = `rgba(244, 211, 94, ${0.08 + 0.9 * dens})`; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    }
    g.strokeStyle = C.axis; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke();
    label(g, "a 2 mm copper wire, end on: brightness = current", cx, h - 4, C.muted, "center", 10);
  }, 220, { animated: false, label: "Cross-section of a wire: at high frequency the current crowds into a thin layer near the surface" });
  controls(s, ["s-f"], () => {
    const f = fOf(), delta = 66 / Math.sqrt(f), ratio = delta >= RWIRE ? 1 : RWIRE / (2 * delta);
    el("s-fo").textContent = f >= 1e6 ? `${(f / 1e6).toFixed(1)} MHz` : f >= 1e3 ? `${(f / 1e3).toFixed(1)} kHz` : `${f.toFixed(0)} Hz`;
    el("r-skin").innerHTML = `Skin depth in copper: <em class="y">${delta >= 1 ? delta.toFixed(1) + " mm" : (delta * 1000).toFixed(0) + " µm"}</em>. Resistance compared with DC: about <em class="y">${ratio.toFixed(1)}×</em>.`;
  });
}

// --- 6. Pi and T networks (a static drawing) -------------------------------------------------------------------------------------------
{
  new Scene(el("s-nets"), (g, w, h) => {
    const half = w / 2, y0 = 60, y1 = h - 40;
    // Pi low-pass: C to ground, series L, C to ground
    const a = 40, b = half - 40;
    line(g, a - 20, y0, b + 20, y0, C.axis, 2.5);
    inductor(g, [a + 60, y0], [b - 60, y0], C.pink, "L");
    for (const x of [a + 30, b - 30]) { line(g, x, y0, x, y1, C.axis, 2.5); capacitor(g, [x, y0 + 20], [x, y1 - 20], C.blue, ""); ground(g, x, y1); }
    label(g, "Pi network: low-pass", (a + b) / 2, 22, C.text, "center", 12); label(g, "in", a - 20, y0 - 8, C.muted, "left", 10); label(g, "out", b + 20, y0 - 8, C.muted, "right", 10);
    // T high-pass: series C, shunt L, series C
    const c = half + 40, d = w - 40, mid = (c + d) / 2;
    line(g, c - 20, y0, d + 20, y0, C.axis, 2.5);
    capacitor(g, [c, y0], [mid - 10, y0], C.blue, ""); capacitor(g, [mid + 10, y0], [d, y0], C.blue, "");
    line(g, mid, y0, mid, y1, C.axis, 2.5); inductor(g, [mid, y0 + 20], [mid, y1 - 20], C.pink, ""); ground(g, mid, y1);
    label(g, "T network: high-pass", mid, 22, C.text, "center", 12); label(g, "in", c - 20, y0 - 8, C.muted, "left", 10); label(g, "out", d + 20, y0 - 8, C.muted, "right", 10);
  }, 200, { animated: false, label: "Schematics: a Pi-network low-pass filter and a T-network high-pass filter" });
}

// --- 7. Filter families: same number of parts, different personalities --------------------------------------------------------------------
{
  const eps2 = 10 ** 0.1 - 1, XI = 1.5; // 1 dB ripple; elliptic selectivity
  // A true 3rd-order elliptic rational function: zeros at 0, ±xz, poles at ±XI/xz, with xz chosen for equal ripple on [0, 1].
  const Rell = (x: number, xz: number) => { const xp = XI / xz; return (x * (x * x - xz * xz) * (1 - xp * xp)) / ((1 - xz * xz) * (x * x - xp * xp)); };
  let lo = 0.01, hi = 0.999;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; let m = 0; for (let i = 0; i <= 400; i++) m = Math.max(m, Math.abs(Rell((i / 400) * mid, mid))); m > 1 ? (hi = mid) : (lo = mid); }
  const XZ = (lo + hi) / 2;
  const dB = (h2: number) => 10 * Math.log10(Math.max(h2, 1e-12));
  const FAM: [string, string, (x: number) => number][] = [
    ["f-b", C.blue, (x) => dB(1 / (1 + x ** 6))],
    ["f-c", C.yellow, (x) => dB(1 / (1 + eps2 * (4 * x ** 3 - 3 * x) ** 2))],
    ["f-e", C.pink, (x) => dB(1 / (1 + eps2 * Rell(x, XZ) ** 2))],
  ];
  const cross = (f: (x: number) => number, lvl: number) => { for (let x = 0.01; x < 6; x += 0.001) if (f(x) <= lvl) return x; return NaN; };
  const s = new Scene(el("s-fam"), (g, w, h) => {
    const L = 50, R = w - 20, T = 16, B = h - 30, px = (x: number) => L + (x / 3) * (R - L), py = (d: number) => T + (-Math.max(-60, d) / 60) * (B - T);
    for (const d of [0, -20, -40, -60]) { line(g, L, py(d), R, py(d), "#1f242d", 1); label(g, `${d} dB`, L - 4, py(d) + 4, C.muted, "right", 10); }
    for (const x of [0, 1, 2, 3]) label(g, x === 1 ? "cutoff" : `${x}×`, px(x), B + 16, C.muted, "center", 10);
    for (const [id, col, f] of FAM) {
      if (!checked(id)) continue;
      g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath();
      for (let xx = L; xx <= R; xx++) { const x = ((xx - L) / (R - L)) * 3, y = py(f(x)); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); }
      g.stroke();
    }
    line(g, L, py(-3), R, py(-3), C.muted, 1, [3, 4]);
  }, 260, { animated: false, label: "Frequency response of third-order Butterworth, Chebyshev and elliptic low-pass filters" });
  controls(s, ["f-b", "f-c", "f-e"], () => {
    el("r-fam").innerHTML = FAM.filter(([id]) => checked(id)).map(([id, col, f]) => {
      const name = id === "f-b" ? "Butterworth" : id === "f-c" ? "Chebyshev" : "Elliptic", sf = cross(f, -20) / cross(f, -3);
      return `<span style="color:${col}">${name}</span>: shape factor (−20 dB ÷ −3 dB width) ${sf.toFixed(2)}`;
    }).join(" · ") + ". All three use three reactive parts.";
  });
}
