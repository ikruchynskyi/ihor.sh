// Lesson 8: feed lines. Standing waves, an antenna analyzer, cable loss with mismatch, stubs, and a live Smith chart.
import "../ham.css";
import { C, Scene, controls, val, label, line, circle } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;
const swrOf = (g: number) => (g >= 0.999 ? Infinity : (1 + g) / (1 - g));
const fmtSwr = (s: number) => (Number.isFinite(s) ? `${s.toFixed(s < 10 ? 2 : 1)}:1` : "∞");
/** Reflection coefficient of a complex load on a Z0 line, as [re, im]. */
const gamma = (r: number, x: number, z0 = 50): [number, number] => { const nr = r - z0, dr = r + z0, d = dr * dr + x * x; return [(nr * dr + x * x) / d, (x * dr - nr * x) / d]; };

// --- 1. Standing waves on a mismatched line -------------------------------------------------------------------------------
{
  const zOf = () => 5 * 100 ** (val("wv-z") / 100);
  const s = new Scene(el("s-wave"), (g, w, h, t) => {
    const zl = zOf(), G = (zl - 50) / (zl + 50), L = 30, R = w - 70, cy = h / 2, A = h * 0.18;
    // line and load
    line(g, L, cy - 46, R, cy - 46, C.axis, 3); line(g, L, cy + 46, R, cy + 46, C.axis, 3);
    g.fillStyle = "#2a2f3a"; g.fillRect(R, cy - 50, 40, 100); label(g, `${zl.toFixed(0)} Ω`, R + 20, cy + 4, C.yellow, "center", 11);
    label(g, "transmitter", L, cy + 66, C.muted, "left", 10); label(g, "load (antenna)", R + 20, cy + 66, C.muted, "center", 10);
    const k = TAU / 160, wt = t * 3, N = R - L;
    // forward wave (blue) and reflected wave (pink), measured back from the load; their sum (yellow); the envelope (dashed)
    const fwd = (x: number) => Math.cos(k * x - wt), ref = (x: number) => G * Math.cos(k * (2 * N - x) - wt);
    for (const [f, col, wd] of [[fwd, "#58c4dd88", 1.5], [ref, "#e07a9f88", 1.5], [(x: number) => fwd(x) + ref(x), C.yellow, 2.5]] as const) {
      g.strokeStyle = col; g.lineWidth = wd; g.beginPath();
      for (let x = 0; x <= N; x += 2) { const y = cy - A * f(x); x ? g.lineTo(L + x, y) : g.moveTo(L + x, y); } g.stroke();
    }
    g.strokeStyle = C.green; g.lineWidth = 1.2; g.setLineDash([4, 4]);
    for (const sgn of [1, -1]) { g.beginPath(); for (let x = 0; x <= N; x += 2) { const env = Math.hypot(1 + G * Math.cos(2 * k * (N - x)), G * Math.sin(2 * k * (N - x))), y = cy - sgn * A * env; x ? g.lineTo(L + x, y) : g.moveTo(L + x, y); } g.stroke(); }
    g.setLineDash([]);
    label(g, "forward", L, 16, C.blue, "left", 10); label(g, "reflected", L + 60, 16, C.pink, "left", 10); label(g, "total", L + 125, 16, C.yellow, "left", 10); label(g, "envelope", L + 165, 16, C.green, "left", 10);
  }, 240, { label: "Forward and reflected waves on a feed line adding into a standing wave, depending on the load impedance" });
  controls(s, ["wv-z"], () => {
    const zl = zOf(), G = Math.abs((zl - 50) / (zl + 50));
    el("wv-zo").textContent = `${zl.toFixed(0)} Ω`;
    el("r-wave").innerHTML = `Γ = ${G.toFixed(2)}, SWR <em class="y">${fmtSwr(swrOf(G))}</em>, ${(G * G * 100).toFixed(0)}% of the power reflected. ${G < 0.02 ? "Matched: no reflection, a flat envelope." : ""}`;
  });
}

// --- 2. An antenna analyzer sweep ---------------------------------------------------------------------------------------------
{
  const F0 = 13, F1 = 16;
  const swrAt = (f: number, len: number) => { const f0 = 468 / len, d = (f - f0) / f0, [gr, gi] = gamma(62, 1500 * d); return swrOf(Math.hypot(gr, gi)); };
  const s = new Scene(el("s-analyzer"), (g, w, h) => {
    const len = val("an-l"), L = 46, R = w - 20, T = 16, B = h - 30;
    const px = (f: number) => L + ((f - F0) / (F1 - F0)) * (R - L), py = (sw: number) => B - ((Math.min(5, sw) - 1) / 4) * (B - T);
    g.fillStyle = "#83c16722"; g.fillRect(px(14), T, px(14.35) - px(14), B - T); label(g, "20 m band", (px(14) + px(14.35)) / 2, T + 12, C.green, "center", 10);
    for (const sw of [1, 2, 3, 5]) { line(g, L, py(sw), R, py(sw), "#1f242d", 1); label(g, `${sw}:1`, L - 4, py(sw) + 4, C.muted, "right", 9); }
    for (const f of [13, 14, 15, 16]) label(g, `${f} MHz`, px(f), B + 16, C.muted, "center", 9);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    for (let x = L; x <= R; x++) { const f = F0 + ((x - L) / (R - L)) * (F1 - F0), y = py(swrAt(f, len)); x === L ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    const f0 = 468 / len; line(g, px(f0), T, px(f0), B, C.blue, 1, [3, 3]);
  }, 220, { animated: false, label: "An antenna analyzer's SWR sweep: the dip shows where the antenna is resonant" });
  controls(s, ["an-l"], () => {
    const len = val("an-l"), f0 = 468 / len;
    el("an-lo").textContent = `${len.toFixed(1)} ft`;
    el("r-analyzer").innerHTML = `Resonant at <em class="b">${f0.toFixed(2)} MHz</em> (SWR ${swrAt(f0, len).toFixed(1)}:1 there). ${f0 < 14 ? "Too long for 20 meters: shorten it." : f0 > 14.35 ? "Too short: lengthen it." : "Inside the band."}`;
  });
}

// --- 3. Cable loss, with and without mismatch ---------------------------------------------------------------------------------------
{
  // Typical dB per 100 ft = k1·√f + k2·f (f in MHz), fitted to published figures at 100 and 400–450 MHz.
  const CABLES: Record<string, [number, number, string]> = {
    rg58: [0.455, 0.0035, "RG-58"], rg213: [0.205, 0.0015, "RG-213"], lmr400: [0.1135, 0.00065, "LMR-400"], hard: [0.0656, 0.000244, "½″ hardline"], ladder: [0.05, 0.0005, "window line"],
  };
  const fOf = () => 1.8 * (450 / 1.8) ** (val("ls-f") / 1000);
  const calc = () => {
    const [k1, k2] = CABLES[sel("ls-c")], f = fOf(), lenFt = val("ls-l"), swr = val("ls-s");
    const matched = ((k1 * Math.sqrt(f) + k2 * f) * lenFt) / 100, a = 10 ** (matched / 10), G = (swr - 1) / (swr + 1);
    const total = 10 * Math.log10((a * a - G * G) / (a * (1 - G * G))); // standard formula for loss including mismatch
    const swrIn = swrOf(G / a);
    return { f, matched, total, swr, swrIn, delivered: 100 * 10 ** (-total / 10) };
  };
  const s = new Scene(el("s-loss"), (g, w, h) => {
    const { delivered, swrIn, swr } = calc(), L = 30, R = w - 30, y = 50;
    g.fillStyle = C.blue; g.fillRect(L, y, R - L, 22); label(g, "100 W from the transmitter", L, y - 8, C.blue, "left", 11);
    const dw = ((R - L) * delivered) / 100;
    g.fillStyle = C.green; g.fillRect(L, y + 60, dw, 22); label(g, `${delivered.toFixed(1)} W radiated by the antenna`, L, y + 52, C.green, "left", 11);
    g.fillStyle = C.red; g.fillRect(L + dw, y + 60, R - L - dw, 22); if (R - L - dw > 60) label(g, "heat in the cable", R, y + 52, C.red, "right", 11);
    label(g, `SWR ${fmtSwr(swr)} at the antenna reads ${fmtSwr(swrIn)} at the transmitter`, L, h - 16, C.yellow, "left", 11);
  }, 180, { animated: false, label: "Power from the transmitter, power reaching the antenna, and power lost as heat in the cable" });
  controls(s, ["ls-c", "ls-f", "ls-l", "ls-s"], () => {
    const { f, matched, total, delivered } = calc(), [, , name] = CABLES[sel("ls-c")];
    el("ls-fo").textContent = `${f.toFixed(f < 10 ? 2 : 0)} MHz`; el("ls-lo").textContent = `${val("ls-l")} ft`; el("ls-so").textContent = `${val("ls-s")}:1`;
    el("r-loss").innerHTML = `${name}: ${(matched * 100 / val("ls-l")).toFixed(2)} dB per 100 ft here. Matched loss ${matched.toFixed(2)} dB; with this SWR <em style="color:var(--red)">${total.toFixed(2)} dB</em>, so <em class="g">${delivered.toFixed(0)}%</em> reaches the antenna.`;
  });
}

// --- 4. Stubs ----------------------------------------------------------------------------------------------------------------------
{
  const xOf = (l: number, shorted: boolean) => (shorted ? Math.tan(TAU * l) : -1 / Math.tan(TAU * l)); // in units of Z0
  const s = new Scene(el("s-stub"), (g, w, h) => {
    const shorted = checked("sb-s"), l = val("sb-l"), L = 50, R = w - 20, T = 20, B = h - 30, mid = (T + B) / 2;
    const px = (x: number) => L + (x / 0.5) * (R - L), py = (x: number) => mid - (x / (1 + Math.abs(x))) * ((B - T) / 2); // squeezes ±∞ into the box but keeps the tangent shape
    line(g, L, mid, R, mid, C.axis, 1);
    label(g, "inductive", L - 4, T + 8, C.pink, "right", 9); label(g, "capacitive", L - 4, B, C.blue, "right", 9); label(g, "0", L - 4, mid + 4, C.muted, "right", 9);
    for (const [x, s1] of [[0.125, "⅛ λ"], [0.25, "¼ λ"], [0.375, "⅜ λ"], [0.5, "½ λ"]] as const) { line(g, px(x), T, px(x), B, "#1f242d", 1); label(g, s1, px(x), B + 16, C.muted, "center", 10); }
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    let prev = 0;
    for (let x = L + 1; x <= R; x++) { const ll = ((x - L) / (R - L)) * 0.5, X = xOf(ll, shorted), y = py(X); if (x > L + 1 && Math.abs(y - prev) > (B - T) * 0.8) g.moveTo(x, y); else x === L + 1 ? g.moveTo(x, y) : g.lineTo(x, y); prev = y; }
    g.stroke();
    g.fillStyle = C.white; g.beginPath(); g.arc(px(l), py(xOf(l, shorted)), 5, 0, TAU); g.fill();
    label(g, "reactance seen at the input (squeezed so ±∞ fit)", L + 6, T - 6, C.muted, "left", 10);
  }, 240, { animated: false, label: "The reactance looking into a shorted or open stub, against its length in wavelengths" });
  controls(s, ["sb-s", "sb-l"], () => {
    const shorted = checked("sb-s"), l = val("sb-l"), X = xOf(l, shorted);
    el("sb-lo").textContent = `${l.toFixed(3)} λ`;
    const what = Math.abs(X) > 8 ? "<em class='y'>very high impedance</em> (like an open circuit)" : Math.abs(X) < 0.12 ? "<em class='y'>very low impedance</em> (like a short)" : X > 0 ? `<em class="p">inductive</em> reactance, +j${(X * 50).toFixed(0)} Ω on 50 Ω line` : `<em class="b">capacitive</em> reactance, −j${(-X * 50).toFixed(0)} Ω on 50 Ω line`;
    el("r-stub").innerHTML = `${shorted ? "Shorted" : "Open"} ${l.toFixed(3)} λ line looks like ${what}.`;
  });
}

// --- 5. The Smith chart ---------------------------------------------------------------------------------------------------------------
{
  const hd = { x: 0.5, y: 0.3, color: C.yellow }; // the load, as a reflection coefficient
  const s = new Scene(el("s-smith"), (g, w, h) => {
    const R0 = Math.min(w / 2, h / 2) - 24, cx = w / 2, cy = h / 2, P = (gr: number, gi: number): [number, number] => [cx + gr * R0, cy - gi * R0];
    g.save(); g.beginPath(); g.arc(cx, cy, R0, 0, TAU); g.clip();
    for (const r of [0.2, 0.5, 1, 2, 5]) circle(g, cx + (r / (1 + r)) * R0, cy, R0 / (1 + r), "#2f3846", 1);
    for (const x of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) circle(g, cx + R0, cy - (sg / x) * R0, R0 / x, sg > 0 ? "#3a2f3c" : "#2a3540", 1);
    g.restore();
    circle(g, cx, cy, R0, C.axis, 2); line(g, cx - R0, cy, cx + R0, cy, C.axis, 1.5);
    label(g, "0", cx - R0 + 4, cy - 4, C.muted, "left", 9); label(g, "∞", cx + R0 - 10, cy - 4, C.muted, "left", 9); label(g, "50 Ω", cx + 4, cy - 4, C.muted, "left", 9);
    label(g, "+j (inductive)", cx, cy - R0 - 6, C.pink, "center", 10); label(g, "−j (capacitive)", cx, cy + R0 + 16, C.blue, "center", 10);
    const mag = Math.hypot(hd.x, hd.y), d = val("sm-d"), ang = Math.atan2(hd.y, hd.x) - 4 * Math.PI * d;
    circle(g, cx, cy, mag * R0, C.green, 1.5);
    const [lx, ly] = P(hd.x, hd.y), [qx, qy] = P(mag * Math.cos(ang), mag * Math.sin(ang));
    g.fillStyle = C.yellow; g.beginPath(); g.arc(lx, ly, 5, 0, TAU); g.fill();
    if (d > 0) { g.fillStyle = C.blue; g.beginPath(); g.arc(qx, qy, 6, 0, TAU); g.fill(); }
  }, 360, {
    animated: false, handles: [hd], max: 0.97, label: "A Smith chart: drag the load's impedance; moving along the line rotates it around a constant-SWR circle",
    plane: (w, h) => ({ cx: w / 2, cy: h / 2, unit: Math.min(w / 2, h / 2) - 24 }), onDrag: () => upd(),
  });
  const zOfG = (gr: number, gi: number) => { const dr = (1 - gr) ** 2 + gi * gi; return [(50 * (1 - gr * gr - gi * gi)) / dr, (50 * 2 * gi) / dr]; };
  const fz = ([r, x]: number[]) => `${r.toFixed(0)} ${x >= 0 ? "+" : "−"} j${Math.abs(x).toFixed(0)} Ω`;
  function upd() {
    const mag = Math.hypot(hd.x, hd.y), d = val("sm-d"), ang = Math.atan2(hd.y, hd.x) - 4 * Math.PI * d;
    el("sm-do").textContent = `${d.toFixed(3)} λ`;
    el("r-smith").innerHTML = `Load <em class="y">${fz(zOfG(hd.x, hd.y))}</em>, SWR ${fmtSwr(swrOf(mag))}.` + (d > 0 ? ` After ${d.toFixed(3)} λ of line it looks like <em class="b">${fz(zOfG(mag * Math.cos(ang), mag * Math.sin(ang)))}</em>: same SWR, different impedance.` : "");
  }
  controls(s, ["sm-d"], upd);
}
