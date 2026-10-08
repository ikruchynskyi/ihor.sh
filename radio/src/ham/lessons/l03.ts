// Lesson 3: capacitors and inductors. Charging curves, the inductive kick, reactance vs frequency, the impedance arrow,
// transformers, and where a coil's field goes.
import "../ham.css";
import { C, Scene, controls, val, label, line, arrow } from "../../course/anim.ts";
import { battery, charges, resistor, wire, type Pt } from "../circuit.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const fmt = (x: number, d = 1) => x.toFixed(d);

/** A small time plot of a 0…1 quantity against time in units of the time constant, with the 63% mark. */
function tauPlot(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, curve: (k: number) => number, now: number, color: string, name: string) {
  line(g, x0, y0 + h, x0 + w, y0 + h, C.axis, 1); line(g, x0, y0, x0, y0 + h, C.axis, 1);
  for (let k = 1; k <= 5; k++) { const x = x0 + (k / 5) * w; line(g, x, y0 + h, x, y0 + h + 4, C.muted, 1); label(g, `${k}τ`, x, y0 + h + 16, C.muted, "center", 10); }
  line(g, x0, y0 + h * (1 - 0.632), x0 + w, y0 + h * (1 - 0.632), C.muted, 1, [3, 4]); label(g, "63%", x0 - 4, y0 + h * (1 - 0.632) + 4, C.muted, "right", 10);
  g.strokeStyle = "#ffffff22"; g.lineWidth = 1.5; g.beginPath();
  for (let i = 0; i <= 100; i++) { const k = (i / 100) * 5, x = x0 + (k / 5) * w, y = y0 + h * (1 - curve(k)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath();
  const end = Math.min(5, now);
  for (let i = 0; i <= 100; i++) { const k = (i / 100) * end, x = x0 + (k / 5) * w, y = y0 + h * (1 - curve(k)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  label(g, name, x0 + 4, y0 - 6, color, "left", 11);
}

// --- 1. Charging a capacitor ---------------------------------------------------------------------------------------------
{
  let t0 = 0, v0 = 0, on = true, lastT = 0, flow = 0;
  const tau = () => val("c-r") * val("c-c") * 0.1; // kΩ × (100 µF) → seconds
  const vAt = (t: number) => { const k = (t - t0) / tau(); return on ? 1 - (1 - v0) * Math.exp(-k) : v0 * Math.exp(-k); };
  const s = new Scene(el("s-cap"), (g, w, h, t) => {
    const dt = Math.max(0, t - lastT); lastT = t;
    const v = vAt(t), i = on ? 1 - v : -v; flow += i * dt * 60;
    const x0 = 60, x1 = Math.min(w * 0.42, 260), y0 = 40, y1 = h - 40, cy = (y0 + y1) / 2;
    const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
    wire(g, loop); charges(g, loop, -flow);
    if (on) battery(g, x0, cy, "9 V"); else { g.fillStyle = C.stage; g.fillRect(x0 - 12, cy - 14, 24, 28); line(g, x0, cy - 14, x0, cy + 14, C.axis, 3); label(g, "shorted", x0 - 14, cy + 4, C.muted, "right", 11); }
    resistor(g, [x0 + 40, y0], [x1 - 40, y0], C.yellow, "");
    // the capacitor: two plates on the right side, charge shown as + and − signs
    g.fillStyle = C.stage; g.fillRect(x1 - 12, cy - 12, 24, 24);
    line(g, x1 - 22, cy - 7, x1 + 22, cy - 7, C.blue, 4); line(g, x1 - 22, cy + 7, x1 + 22, cy + 7, C.blue, 4);
    const n = Math.round(v * 6);
    for (let k = 0; k < n; k++) { label(g, "+", x1 - 20 + k * 8, cy - 13, C.red, "left", 11); label(g, "−", x1 - 20 + k * 8, cy + 24, C.text, "left", 11); }
    label(g, `${fmt(v * 9)} V`, x1 + 28, cy + 4, C.blue, "left", 12);
    // the charging curve
    const px = Math.max(x1 + 90, w * 0.5), pw = w - px - 20;
    tauPlot(g, px, 30, pw, h - 70, on ? (k) => 1 - (1 - v0) * Math.exp(-k) : (k) => v0 * Math.exp(-k), (t - t0) / tau(), C.blue, "capacitor voltage");
  }, 240, { label: "A capacitor charging through a resistor, with its voltage rising along a curve marked in time constants" });
  controls(s, ["c-r", "c-c"], () => {
    el("c-ro").textContent = `${val("c-r")} kΩ`; el("c-co").textContent = `${val("c-c") * 100} µF`;
    el("r-cap").innerHTML = `Time constant τ = R × C = ${val("c-r")} kΩ × ${val("c-c") * 100} µF = <em class="b">${fmt(tau())} s</em>. After 1τ: 63.2% full; after 5τ: over 99%.`;
  });
  el("c-sw").addEventListener("change", () => { v0 = vAt(lastT); t0 = lastT; on = checked("c-sw"); });
}

// --- 2. An inductor's flywheel -------------------------------------------------------------------------------------------
{
  let t0 = 0, i0 = 0, on = true, lastT = 0, flow = 0, sparkUntil = -1;
  const tau = () => val("i-l") * 0.25;
  const iAt = (t: number) => { const k = (t - t0) / tau(); return on ? 1 - (1 - i0) * Math.exp(-k) : i0 * Math.exp(-k * 12); };
  const s = new Scene(el("s-ind"), (g, w, h, t) => {
    const dt = Math.max(0, t - lastT); lastT = t;
    const i = iAt(t); flow += i * dt * 60;
    const x0 = 60, x1 = Math.min(w * 0.42, 260), y0 = 40, y1 = h - 40, cy = (y0 + y1) / 2;
    const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
    wire(g, loop); charges(g, loop, -flow);
    battery(g, x0, cy, "12 V");
    resistor(g, [x0 + 50, y1], [x1 - 50, y1], C.yellow, "4 Ω");
    // switch on the top wire
    const sx = (x0 + x1) / 2; g.fillStyle = C.stage; g.fillRect(sx - 18, y0 - 6, 36, 12);
    if (on) line(g, sx - 16, y0, sx + 16, y0, C.text, 3); else line(g, sx - 16, y0, sx + 12, y0 - 18, C.text, 3);
    if (t < sparkUntil && Math.floor(t * 20) % 2) label(g, "⚡", sx + 10, y0 - 12, C.yellow, "center", 22);
    // the coil, with its magnetic field growing with current
    g.fillStyle = C.stage; g.fillRect(x1 - 14, cy - 36, 28, 72);
    g.strokeStyle = C.pink; g.lineWidth = 2.5;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x1, cy - 28 + k * 14, 7, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    for (let r = 1; r <= 3; r++) { g.strokeStyle = `rgba(224, 122, 159, ${0.5 * i})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x1, cy, 20 + r * 14 * i + 4, 40 + r * 10 * i, 0, 0, 2 * Math.PI); g.stroke(); }
    const px = Math.max(x1 + 110, w * 0.5), pw = w - px - 20;
    tauPlot(g, px, 30, pw, h - 70, on ? (k) => 1 - (1 - i0) * Math.exp(-k) : (k) => i0 * Math.exp(-k * 12), (t - t0) / tau(), C.pink, "current through the coil");
  }, 240, { label: "An inductor: current builds up gradually when the switch closes, and a spark jumps when it opens" });
  controls(s, ["i-l"], () => {
    el("i-lo").textContent = `${val("i-l")} H`;
    el("r-ind").innerHTML = `Time constant L ÷ R with a 4 Ω resistor: <em class="p">${fmt(tau(), 2)} s</em>. More inductance, a heavier flywheel, a slower rise.`;
  });
  el("i-sw").addEventListener("change", () => { i0 = iAt(lastT); t0 = lastT; on = checked("i-sw"); if (!on && i0 > 0.1) sparkUntil = lastT + 0.6; });
}

// --- 3. Reactance against frequency ---------------------------------------------------------------------------------------
{
  // Normalized so both reactances are 100 Ω at the crossing frequency f0 = 1 MHz.
  const F0 = 1e6, X0 = 100;
  const fOf = () => F0 * 10 ** (val("x-f") * 2 - 1); // 100 kHz … 10 MHz
  const s = new Scene(el("s-react"), (g, w, h, t) => {
    const f = fOf(), xl = X0 * (f / F0), xc = X0 * (F0 / f);
    // left: current amplitude through each part (same AC voltage)
    const split = w < 560 ? 0 : w * 0.38, L = 20, midL = h * 0.32, midC = h * 0.72, A = h * 0.16;
    if (split) {
      const il = Math.min(1, X0 / xl / 3), ic = Math.min(1, X0 / xc / 3);
      for (const [mid, amp, col, name] of [[midL, il, C.pink, "current through the coil"], [midC, ic, C.blue, "current through the capacitor"]] as const) {
        line(g, L, mid, split - 10, mid, C.axis, 1);
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
        for (let x = L; x < split - 10; x++) { const y = mid - A * amp * Math.sin((x - L) * 0.08 * (0.4 + val("x-f")) - t * 4); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.stroke(); label(g, name, L, mid - A - 6, col, "left", 11);
      }
    }
    // right: log-log plot of both reactances
    const PL = split + 50, PR = w - 20, PT = 20, PB = h - 34;
    const px = (ff: number) => PL + ((Math.log10(ff / F0) + 1) / 2) * (PR - PL), py = (x: number) => PB - ((Math.log10(x / X0) + 1) / 2) * (PB - PT);
    line(g, PL, PB, PR, PB, C.axis, 1); line(g, PL, PT, PL, PB, C.axis, 1);
    for (const [ff, s1] of [[1e5, "100 kHz"], [1e6, "1 MHz"], [1e7, "10 MHz"]] as const) label(g, s1, px(ff), PB + 16, C.muted, "center", 10);
    for (const [x, s1] of [[10, "10 Ω"], [100, "100 Ω"], [1000, "1 kΩ"]] as const) label(g, s1, PL - 4, py(x) + 4, C.muted, "right", 10);
    line(g, px(1e5), py(10), px(1e7), py(1000), C.pink, 2.5); label(g, "XL (coil)", px(4e6) + 8, py(400) + 16, C.pink, "left", 11);
    line(g, px(1e5), py(1000), px(1e7), py(10), C.blue, 2.5); label(g, "XC (capacitor)", px(4e6) + 8, py(25) - 10, C.blue, "left", 11);
    line(g, px(f), PT, px(f), PB, C.yellow, 1.5, [4, 4]);
    g.fillStyle = C.pink; g.beginPath(); g.arc(px(f), py(xl), 5, 0, 2 * Math.PI); g.fill();
    g.fillStyle = C.blue; g.beginPath(); g.arc(px(f), py(xc), 5, 0, 2 * Math.PI); g.fill();
    label(g, "resonance", px(F0), py(X0) - 12, C.yellow, "center", 10);
  }, 260, { label: "Inductive reactance rising and capacitive reactance falling with frequency, crossing at resonance" });
  controls(s, ["x-f"], () => {
    const f = fOf(), xl = X0 * (f / F0), xc = X0 * (F0 / f);
    el("x-fo").textContent = f >= 1e6 ? `${(f / 1e6).toFixed(2)} MHz` : `${(f / 1e3).toFixed(0)} kHz`;
    el("r-react").innerHTML = `X<sub>L</sub> = <em class="p">${xl.toFixed(0)} Ω</em>, X<sub>C</sub> = <em class="b">${xc.toFixed(0)} Ω</em>. ${Math.abs(xl - xc) < 8 ? "Equal: resonance." : xl > xc ? "The coil opposes more: it's above resonance." : "The capacitor opposes more: it's below resonance."}`;
  });
}

// --- 4. The impedance arrow -----------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-phase"), (g, w, h, t) => {
    const r = val("z-r"), xl = val("z-l"), xc = val("z-c"), x = xl - xc, zmag = Math.hypot(r, x), ang = Math.atan2(x, r);
    // arrows on the left
    const ox = 50, oy = h / 2, k = Math.min((w * 0.45 - 70) / 1000, (h / 2 - 14) / 1000);
    line(g, 20, oy, w * 0.48, oy, C.axis, 1); line(g, ox, 14, ox, h - 14, C.axis, 1);
    if (r) arrow(g, ox, oy, ox + r * k, oy, C.yellow, 3);
    if (xl) arrow(g, ox + r * k, oy, ox + r * k, oy - xl * k, C.pink, 3);
    if (xc) arrow(g, ox + r * k, oy - xl * k, ox + r * k, oy - xl * k + xc * k, C.blue, 3);
    if (zmag > 0) arrow(g, ox, oy, ox + r * k, oy - x * k, C.white, 3);
    label(g, "R", ox + (r * k) / 2, oy + 16, C.yellow, "center", 12);
    label(g, "Z", ox + (r * k) / 2 - 10, oy - (x * k) / 2 - 8, C.white, "center", 13);
    if (zmag > 0) { g.strokeStyle = C.green; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, oy, 28, Math.min(0, -ang), Math.max(0, -ang)); g.stroke(); }
    // voltage and current waves on the right
    const L = w * 0.52, R = w - 16, A = h * 0.18;
    line(g, L, oy, R, oy, C.axis, 1);
    for (const [ph, col, name, amp] of [[ang, C.yellow, "voltage", 1], [0, C.green, "current", 0.7]] as const) {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      for (let xx = L; xx <= R; xx++) { const y = oy - A * amp * Math.sin((xx - L) * 0.035 - t * 2 + ph); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); }
      g.stroke(); label(g, name, L + (name === "voltage" ? 0 : 70), 16, col, "left", 11);
    }
  }, 340, { label: "Resistance and reactance as arrows at right angles adding up to the impedance arrow; voltage and current waves shifted by its angle" });
  controls(s, ["z-r", "z-l", "z-c"], () => {
    const r = val("z-r"), xl = val("z-l"), xc = val("z-c"), x = xl - xc, deg = (Math.atan2(x, r) * 180) / Math.PI;
    el("z-ro").textContent = `${r} Ω`; el("z-lo").textContent = `${xl} Ω`; el("z-co").textContent = `${xc} Ω`;
    el("r-phase").innerHTML = `Net reactance ${x >= 0 ? "+" : ""}${x} Ω. Impedance <em>${Math.hypot(r, x).toFixed(0)} Ω</em> at <em class="g">${Math.abs(deg).toFixed(1)}°</em>: ${Math.abs(deg) < 0.05 ? "voltage and current in step (purely resistive)." : deg > 0 ? "<b>voltage leads</b> current (inductive)." : "<b>voltage lags</b> current (capacitive)."}`;
  });
}

// --- 5. A transformer -----------------------------------------------------------------------------------------------------
{
  const VIN = 120;
  const s = new Scene(el("s-xfmr"), (g, w, h, t) => {
    const n1 = val("t-n1"), n2 = val("t-n2"), ratio = n2 / n1, cx = w / 2, cy = h / 2;
    // core: a square ring
    g.strokeStyle = "#5b6475"; g.lineWidth = 16; g.strokeRect(cx - 70, cy - 70, 140, 140);
    // windings: one loop per 100 turns
    const coil = (x: number, n: number, col: string) => { g.strokeStyle = col; g.lineWidth = 2.5; for (let k = 0; k < n / 100; k++) { const y = cy - 60 + (k + 0.5) * (120 / (n / 100)); g.beginPath(); g.ellipse(x, y, 14, 4, 0, 0, 2 * Math.PI); g.stroke(); } };
    coil(cx - 70, n1, C.yellow); coil(cx + 70, n2, C.green);
    // input and output waves
    const wave = (x0: number, x1: number, amp: number, col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let x = x0; x <= x1; x++) { const y = cy - amp * Math.sin((x - x0) * 0.08 - t * 4); x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
    const scale = Math.min(70, h * 0.4) / 360;
    if (cx - 110 > 40) wave(20, cx - 100, VIN * scale, C.yellow);
    if (w - 20 > cx + 100) wave(cx + 100, w - 20, Math.min(VIN * ratio * scale, h / 2 - 10), C.green);
    label(g, `${n1} turns`, cx - 70, cy + 92, C.yellow, "center", 11); label(g, `${n2} turns`, cx + 70, cy + 92, C.green, "center", 11);
    label(g, `${VIN} V in`, 20, 18, C.yellow, "left", 12); label(g, `${+(VIN * ratio).toFixed(1)} V out`, w - 20, 18, C.green, "right", 12);
  }, 230, { label: "A transformer: the output voltage scales with the ratio of secondary to primary turns" });
  controls(s, ["t-n1", "t-n2"], () => {
    const n1 = val("t-n1"), n2 = val("t-n2"), r = n2 / n1;
    el("t-n1o").textContent = `${n1}`; el("t-n2o").textContent = `${n2}`;
    el("r-xfmr").innerHTML = `Turns ratio ${n1}:${n2}, so voltage ×<em class="g">${+r.toFixed(2)}</em> (${VIN} → ${+(VIN * r).toFixed(1)} V), current ×${+(1 / r).toFixed(2)}, and impedance ×${+(r * r).toFixed(2)} (the square of the turns ratio).`;
  });
}

// --- 6. Solenoid versus toroid ------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-core"), (g, w, h, t) => {
    const tor = checked("k-t"), cx = w / 2, cy = h / 2;
    if (!tor) {
      // straight coil: field lines loop out around it
      g.fillStyle = "#3a4252"; g.fillRect(cx - 90, cy - 18, 180, 36);
      for (let k = 0; k < 9; k++) { g.strokeStyle = C.pink; g.lineWidth = 2.5; g.beginPath(); g.ellipse(cx - 80 + k * 20, cy, 6, 24, 0, 0, 2 * Math.PI); g.stroke(); }
      for (const r of [1, 2, 3]) {
        g.strokeStyle = `rgba(88, 196, 221, ${0.7 - r * 0.15})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy, 100 + r * 36, 28 + r * 22, 0, 0, 2 * Math.PI); g.stroke();
        for (let d = 0; d < 6; d++) { const a = t * 0.8 + (d * Math.PI) / 3 + r; g.fillStyle = C.blue; g.beginPath(); g.arc(cx + (100 + r * 36) * Math.cos(a), cy - 8 + (28 + r * 22) * Math.sin(a) + 8, 3, 0, 2 * Math.PI); g.fill(); }
      }
      label(g, "the field spills out around a straight coil", cx, h - 10, C.muted, "center", 11);
    } else {
      const R = Math.min(70, h / 2 - 30);
      g.strokeStyle = "#3a4252"; g.lineWidth = 22; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * Math.PI; g.strokeStyle = C.pink; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + (R - 14) * Math.cos(a), cy + (R - 14) * Math.sin(a)); g.lineTo(cx + (R + 14) * Math.cos(a), cy + (R + 14) * Math.sin(a)); g.stroke(); }
      for (let d = 0; d < 14; d++) { const a = t * 0.8 + (d / 14) * 2 * Math.PI; g.fillStyle = C.blue; g.beginPath(); g.arc(cx + R * Math.cos(a), cy + R * Math.sin(a), 3, 0, 2 * Math.PI); g.fill(); }
      label(g, "a toroid keeps its field inside the ring", cx, h - 10, C.muted, "center", 11);
    }
  }, 260, { label: "Magnetic field lines around a straight coil spread out, while a toroid confines them inside its core" });
  controls(s, ["k-t"]);
}
