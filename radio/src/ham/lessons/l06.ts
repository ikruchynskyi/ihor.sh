// Lesson 6: waves. The EM wave in 3D, wavelength and bands, polarization loss, multipath.
import "../ham.css";
import { C, Scene, controls, val, label, line, arrow } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const TAU = 2 * Math.PI;

// --- 1. The electromagnetic wave, in an oblique 3D view --------------------------------------------------------------------
{
  const s = new Scene(el("s-em"), (g, w, h, t) => {
    const pol = sel("em-p"), L = 40, R = w - 30, cy = h / 2, A = h * 0.3, dx = 0.55, dy = 0.35; // depth axis drawn up-right
    const P = (z: number, x: number, y: number): [number, number] => [L + z + x * A * dx, cy - y * A - x * A * dy];
    line(g, ...P(0, 0, 0), ...P(R - L, 0, 0), C.axis, 1.5);
    label(g, "direction of travel →", R, cy + 22, C.muted, "right", 11);
    const k = TAU / 230, wt = t * 3;
    const field = (z: number) => {
      const ph = k * z - wt, a = Math.cos(ph);
      if (pol === "v") return { e: [0, a], b: [a, 0] };
      if (pol === "h") return { e: [a, 0], b: [0, -a] };
      return { e: [Math.cos(ph), Math.sin(ph)], b: [Math.sin(ph), -Math.cos(ph)] }; // circular: the field rotates as it travels
    };
    for (const [key, col] of [["b", C.blue], ["e", C.yellow]] as const) {
      g.strokeStyle = col; g.lineWidth = 1; g.globalAlpha = 0.5;
      for (let z = 0; z <= R - L; z += 10) { const f = field(z)[key]; line(g, ...P(z, 0, 0), ...P(z, f[0], f[1]), col, 1); }
      g.globalAlpha = 1; g.lineWidth = 2.5; g.strokeStyle = col; g.beginPath();
      for (let z = 0; z <= R - L; z += 2) { const f = field(z)[key], [x, y] = P(z, f[0], f[1]); z ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    label(g, "electric field", L, 18, C.yellow, "left", 11); label(g, "magnetic field", L + 100, 18, C.blue, "left", 11);
    // the antenna that launched it
    const [ax, ay] = P(0, 0, 0);
    if (pol === "v") line(g, ax - 14, ay - A * 0.8, ax - 14, ay + A * 0.8, C.text, 4);
    else if (pol === "h") line(g, ...P(-14, -0.8, 0), ...P(-14, 0.8, 0), C.text, 4);
  }, 260, { label: "An electromagnetic wave: electric and magnetic fields at right angles to each other and to the direction of travel" });
  controls(s, ["em-p"]);
}

// --- 2. Wavelength and the bands ------------------------------------------------------------------------------------------------
const BANDS: [string, number, number][] = [
  ["160 m", 1.8, 2], ["80 m", 3.5, 4], ["60 m", 5.33, 5.41], ["40 m", 7, 7.3], ["30 m", 10.1, 10.15], ["20 m", 14, 14.35], ["17 m", 18.068, 18.168],
  ["15 m", 21, 21.45], ["12 m", 24.89, 24.99], ["10 m", 28, 29.7], ["6 m", 50, 54], ["2 m", 144, 148], ["1.25 m", 222, 225], ["70 cm", 420, 450],
  ["33 cm", 902, 928], ["23 cm", 1240, 1300], ["13 cm", 2300, 2450],
];
{
  const fOf = () => 10 ** ((val("la-f") / 1000) * 3.5); // 1 MHz … 3.16 GHz
  const fmtLen = (m: number) => (m >= 1 ? `${m.toFixed(m < 10 ? 2 : 1)} m` : `${(m * 100).toFixed(1)} cm`);
  const s = new Scene(el("s-lambda"), (g, w, h, t) => {
    const f = fOf(), lam = 300 / f, L = 30, R = w - 30, cy = 70, A = 34;
    // draw 2.5 wavelengths across; the ruler shows how long that is
    const span = 2.5 * lam, px = (m: number) => L + (m / span) * (R - L);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    for (let x = L; x <= R; x++) { const m = ((x - L) / (R - L)) * span, y = cy - A * Math.sin((TAU * m) / lam - t * 3); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    line(g, px(0.25 * lam), cy - A - 12, px(1.25 * lam), cy - A - 12, C.green, 2); line(g, px(0.25 * lam), cy - A - 18, px(0.25 * lam), cy - A - 6, C.green, 2); line(g, px(1.25 * lam), cy - A - 18, px(1.25 * lam), cy - A - 6, C.green, 2);
    label(g, `λ = ${fmtLen(lam)}`, px(0.75 * lam), cy - A - 18, C.green, "center", 12);
    // a 1.8 m person, to scale, if they'd be visible
    const pxPerM = (R - L) / span, ph = 1.8 * pxPerM;
    if (ph > 6 && ph < 105) { const x = R - 20, base = cy + A + 40; g.fillStyle = C.muted; g.beginPath(); g.arc(x, base - ph + ph * 0.07, ph * 0.07, 0, TAU); g.fill(); g.fillRect(x - ph * 0.06, base - ph * 0.86, ph * 0.12, ph * 0.86); label(g, "a person, to scale", x - 10, base + 12, C.muted, "right", 9); }
    // spectrum strip with HF / VHF / UHF and the ham bands
    const sy = h - 46, lp = (ff: number) => L + (Math.log10(ff) / 3.5) * (R - L);
    for (const [name, a, b, col] of [["HF", 3, 30, "#83c16733"], ["VHF", 30, 300, "#58c4dd33"], ["UHF", 300, 3000, "#e07a9f33"]] as const) {
      g.fillStyle = col; g.fillRect(lp(a), sy, lp(b) - lp(a), 22); label(g, `${name} ${a}–${b} MHz`, (lp(a) + lp(b)) / 2, sy + 15, C.text, "center", 10);
    }
    for (const [, a, b] of BANDS) { g.fillStyle = C.yellow; g.fillRect(lp(a), sy + 24, Math.max(2, lp(b) - lp(a)), 6); }
    line(g, lp(f), sy - 6, lp(f), sy + 34, C.white, 2);
    for (const ff of [1, 10, 100, 1000]) label(g, ff >= 1000 ? "1 GHz" : `${ff} MHz`, lp(ff), h - 4, C.muted, "center", 9);
  }, 280, { label: "A wave whose wavelength shrinks as frequency rises, and a strip of the radio spectrum with the amateur bands" });
  controls(s, ["la-f"], () => {
    const f = fOf(), lam = 300 / f, band = BANDS.find(([, a, b]) => f >= a * 0.97 && f <= b * 1.03);
    el("la-fo").textContent = f >= 1000 ? `${(f / 1000).toFixed(2)} GHz` : `${f.toFixed(f < 10 ? 2 : 1)} MHz`;
    const range = f < 3 ? "MF (below HF)" : f < 30 ? "HF" : f < 300 ? "VHF" : f < 3000 ? "UHF" : "SHF";
    el("r-lambda").innerHTML = `300 ÷ ${f.toFixed(f < 10 ? 2 : 1)} = <em class="g">${fmtLen(lam)}</em>. ${range}${band ? `, in the <em class="y">${band[0]}</em> amateur band` : ""}.`;
  });
}

// --- 3. Polarization loss ---------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-pol"), (g, w, h, t) => {
    const ang = (val("po-a") * Math.PI) / 180, cy = h / 2, rx = w - 90, A = h * 0.32;
    line(g, 60, cy - A, 60, cy + A, C.text, 4); label(g, "transmit: vertical", 60, h - 8, C.muted, "center", 10);
    // the vertical E field traveling across
    for (let x = 90; x < rx - 40; x += 12) { const a = Math.cos(x * 0.05 - t * 3); line(g, x, cy, x, cy - A * 0.8 * a, C.yellow, 1.5); }
    // the receiving antenna, rotated; the useful part of the field is the projection onto it
    const ex = Math.sin(ang), ey = Math.cos(ang);
    line(g, rx - ex * A, cy + ey * A, rx + ex * A, cy - ey * A, C.text, 4);
    const a = Math.cos(t * 3 - rx * 0.05) * 0.8 * A, proj = a * Math.cos(ang);
    arrow(g, rx + 30, cy, rx + 30, cy - a, C.yellow, 2);
    arrow(g, rx, cy, rx + ex * proj, cy - ey * proj, C.green, 3);
    label(g, "receive", rx, h - 8, C.muted, "center", 10);
  }, 200, { label: "A vertically polarized wave arriving at a receiving antenna turned at an angle; only the part of the field along the antenna is received" });
  controls(s, ["po-a"], () => {
    const a = val("po-a"), c = Math.cos((a * Math.PI) / 180), db = 20 * Math.log10(Math.max(1e-3, Math.abs(c)));
    el("po-ao").textContent = `${a}°`;
    el("r-pol").innerHTML = a === 0 ? `Antennas aligned: the full signal.` : a >= 89 ? `Cross-polarized: in theory nothing at all; in practice reflections leave a little, typically 20 dB or more down.` : `Received ${Math.round(c * c * 100)}% of the power: <em class="g">${db.toFixed(1)} dB</em>.`;
  });
}

// --- 4. Multipath along a street -------------------------------------------------------------------------------------------------
{
  const ROAD = 12, WALL = 40, RHO = 0.7; // meters of road shown, distance to the reflecting building, reflection strength
  const amp = (x: number, lam: number) => { const d = 2 * (WALL - x), ph = (TAU * d) / lam; return Math.hypot(1 + RHO * Math.cos(ph), RHO * Math.sin(ph)); };
  const s = new Scene(el("s-multi"), (g, w, h) => {
    const lam = 300 / Number(sel("mu-f")), pos = val("mu-x") * ROAD;
    const L = 70, R = w - 50, top = 34, road = 100, px = (m: number) => L + (m / ROAD) * (R - L);
    // scene: tower far left (off the road section), building on the right, the car on the road
    g.fillStyle = "#2a2f3a"; g.fillRect(R + 6, top - 20, 28, road - top + 30); label(g, "building", R + 20, top - 26, C.muted, "center", 9);
    line(g, L - 30, top, L - 30, road, C.text, 3); label(g, "repeater", L - 30, top - 8, C.muted, "center", 9);
    line(g, L, road + 8, R, road + 8, C.axis, 2);
    const cx = px(pos);
    g.fillStyle = C.yellow; g.fillRect(cx - 10, road - 4, 20, 10);
    line(g, L - 30, top + 6, cx, road - 4, C.green, 1.5, [4, 3]);
    line(g, L - 30, top + 6, R + 6, top + 30, C.pink, 1.5, [4, 3]); line(g, R + 6, top + 30, cx, road - 4, C.pink, 1.5, [4, 3]);
    label(g, "direct", (L + cx) / 2, top + 4, C.green, "center", 10); label(g, "reflected", R - 30, top + 46, C.pink, "right", 10);
    // signal strength along the road
    const pT = road + 30, pB = h - 22, yOf = (a: number) => pT + (-Math.max(-20, 20 * Math.log10(a / (1 + RHO))) / 20) * (pB - pT);
    line(g, L, pT, R, pT, "#1f242d", 1); line(g, L, pB, R, pB, "#1f242d", 1);
    label(g, "0 dB", L - 4, pT + 4, C.muted, "right", 9); label(g, "−20", L - 4, pB + 4, C.muted, "right", 9);
    g.strokeStyle = C.blue; g.lineWidth = 2; g.beginPath();
    for (let x = L; x <= R; x++) { const m = ((x - L) / (R - L)) * ROAD, y = yOf(amp(m, lam)); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    g.fillStyle = C.yellow; g.beginPath(); g.arc(cx, yOf(amp(pos, lam)), 5, 0, TAU); g.fill();
    label(g, `${ROAD} m of road`, R, h - 6, C.muted, "right", 9);
  }, 280, { animated: false, label: "A direct and a reflected signal adding up or cancelling along a road, with the signal strength plotted below" });
  controls(s, ["mu-x", "mu-f"], () => {
    const lam = 300 / Number(sel("mu-f")), pos = val("mu-x") * ROAD, a = amp(pos, lam), db = 20 * Math.log10(a / (1 + RHO));
    el("mu-xo").textContent = `${pos.toFixed(2)} m`;
    el("r-multi").innerHTML = `Signal here: <em class="b">${db.toFixed(1)} dB</em> compared with the best spot. Peaks and nulls repeat every <em class="y">${(lam / 2).toFixed(2)} m</em> (half a wavelength).`;
  });
}
