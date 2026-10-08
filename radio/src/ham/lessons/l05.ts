// Lesson 5: semiconductors. The PN junction, diode curves, rectifiers and filters, regulators, the transistor as a valve.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import { lamp } from "../circuit.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const TAU = 2 * Math.PI;
const softplus = (x: number) => (x > 30 ? x : Math.log1p(Math.exp(x)));

// --- 1. The PN junction --------------------------------------------------------------------------------------------------
{
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 36, hx = Array.from({ length: N }, rnd), hy = Array.from({ length: N }, rnd), ex = Array.from({ length: N }, rnd), ey = Array.from({ length: N }, rnd);
  let lastT = 0;
  const s = new Scene(el("s-pn"), (g, w, h, t) => {
    const v = val("pn-v"), dt = Math.max(0, t - lastT); lastT = t;
    const L = 40, R = w - 40, T = 40, B = h - 40, mid = (L + R) / 2;
    const depl = v >= 0.65 ? 4 : 36 * Math.sqrt((0.7 - v) / 0.7); // half-width of the depletion region, px
    const flowing = v > 0.55, drift = flowing ? (v - 0.55) * 1.2 : 0;
    g.fillStyle = "#3a252a"; g.fillRect(L, T, mid - L, B - T); g.fillStyle = "#1f2c38"; g.fillRect(mid, T, R - mid, B - T);
    g.fillStyle = "#14171d"; g.fillRect(mid - depl, T, 2 * depl, B - T);
    label(g, "P-type (holes)", L + 6, T - 10, C.pink, "left", 12); label(g, "N-type (free electrons)", R - 6, T - 10, C.blue, "right", 12);
    if (depl > 10) { label(g, "depletion region", mid, B + 16, C.muted, "center", 10); for (let y = T + 14; y < B; y += 22) { label(g, "−", mid - depl / 2, y + 4, "#a06070", "center", 11); label(g, "+", mid + depl / 2, y + 4, "#5080a0", "center", 11); } }
    for (let i = 0; i < N; i++) {
      // holes drift right, electrons drift left when forward biased; otherwise they jiggle in their own region
      hx[i] += drift * dt * 0.5 + (rnd() - 0.5) * 0.006; ex[i] -= drift * dt * 0.5 + (rnd() - 0.5) * 0.006;
      if (flowing) { if (hx[i] > 1) hx[i] -= 1; if (ex[i] < 0) ex[i] += 1; }
      const hmax = flowing ? 1 : (mid - depl - L - 8) / (R - L), emin = flowing ? 0 : (mid + depl - L + 8) / (R - L);
      if (!flowing) { hx[i] = Math.min(hmax, Math.max(0.01, hx[i])); ex[i] = Math.max(emin, Math.min(0.99, ex[i])); }
      const hX = L + hx[i] * (R - L), eX = L + ex[i] * (R - L);
      g.strokeStyle = C.pink; g.lineWidth = 1.5; g.beginPath(); g.arc(hX, T + 8 + hy[i] * (B - T - 16), 4, 0, TAU); g.stroke();
      g.fillStyle = C.blue; g.beginPath(); g.arc(eX, T + 8 + ey[i] * (B - T - 16), 3, 0, TAU); g.fill();
    }
    label(g, "anode", L, B + 16, C.muted, "left", 10); label(g, "cathode", R, B + 16, C.muted, "right", 10);
  }, 220, { label: "A PN junction: the depletion region between P and N material narrows under forward bias and widens under reverse bias" });
  controls(s, ["pn-v"], () => {
    const v = val("pn-v");
    el("pn-vo").textContent = `${v >= 0 ? "+" : ""}${v.toFixed(2)} V`;
    el("r-pn").innerHTML = v > 0.55 ? `<b>Forward bias</b> (anode positive): the depletion region has collapsed and carriers cross: <em class="y">current flows</em>.`
      : v >= 0 ? `Below about 0.6 V the depletion region still blocks the junction: <em>almost no current</em>.`
      : `<b>Reverse bias</b>: holes and electrons are pulled away from the junction, the depletion region <em class="p">widens</em>, and nothing flows.`;
  });
}

// --- 2. Diode current against voltage -------------------------------------------------------------------------------------------
{
  const TYPES: Record<string, { vf: number; vz?: number; name: string; color: string }> = {
    si: { vf: 0.7, name: "silicon", color: C.yellow }, ge: { vf: 0.3, name: "germanium", color: C.green }, sch: { vf: 0.3, name: "Schottky", color: C.blue },
    led: { vf: 1.9, name: "red LED", color: C.red }, zen: { vf: 0.7, vz: 5.1, name: "5.1 V Zener", color: C.pink },
  };
  const I = (v: number, d: { vf: number; vz?: number }) => { // mA, with a soft knee and a 10 Ω slope once on
    let i = (0.04 * softplus((v - d.vf) / 0.04)) / 10 * 1000;
    if (d.vz !== undefined && v < 0) i -= ((0.04 * softplus((-v - d.vz) / 0.04)) / 10) * 1000;
    return i;
  };
  const s = new Scene(el("s-iv"), (g, w, h) => {
    const d = TYPES[sel("iv-t")], v = val("iv-v");
    const L = 30, R = w - 30, T = 20, B = h - 30, ox = L + (6 / 8.5) * (R - L), oy = (T + B) / 2;
    const px = (vv: number) => L + ((vv + 6) / 8.5) * (R - L), py = (ma: number) => oy - (Math.max(-100, Math.min(100, ma)) / 100) * (oy - T);
    line(g, L, oy, R, oy, C.axis, 1); line(g, ox, T, ox, B, C.axis, 1);
    for (const vv of [-6, -4, -2, 0, 1, 2]) label(g, `${vv} V`, px(vv), oy + 14, C.muted, "center", 9);
    label(g, "+100 mA", ox - 4, T + 8, C.muted, "right", 9); label(g, "−100 mA", ox - 4, B, C.muted, "right", 9);
    for (const [k, other] of Object.entries(TYPES)) if (k !== sel("iv-t")) {
      g.strokeStyle = "#ffffff18"; g.lineWidth = 1.5; g.beginPath();
      for (let xx = L; xx <= R; xx++) { const vv = -6 + ((xx - L) / (R - L)) * 8.5, y = py(I(vv, other)); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); } g.stroke();
    }
    g.strokeStyle = d.color; g.lineWidth = 2.5; g.beginPath();
    for (let xx = L; xx <= R; xx++) { const vv = -6 + ((xx - L) / (R - L)) * 8.5, y = py(I(vv, d)); xx === L ? g.moveTo(xx, y) : g.lineTo(xx, y); } g.stroke();
    g.fillStyle = C.white; g.beginPath(); g.arc(px(v), py(I(v, d)), 5, 0, TAU); g.fill();
    if (sel("iv-t") === "led") lamp(g, L + 40, T + 30, Math.min(1, Math.max(0, I(v, d) / 30)));
  }, 240, { animated: false, label: "Current against voltage for different diodes: each conducts above its own forward voltage; the Zener also conducts in reverse at its breakdown voltage" });
  controls(s, ["iv-t", "iv-v"], () => {
    const d = TYPES[sel("iv-t")], v = val("iv-v"), i = I(v, d);
    el("iv-vo").textContent = `${v.toFixed(2)} V`;
    el("r-iv").innerHTML = `${d.name} at ${v.toFixed(2)} V: <em style="color:${d.color}">${Math.abs(i) < 0.05 ? "≈ 0" : i.toFixed(1)} mA</em>. ` +
      (d.vz && v < -d.vz + 0.1 ? `Reverse breakdown: the voltage stays near ${d.vz} V whatever the current. That's what makes a Zener a reference.` : `It starts conducting around ${d.vf} V.`);
  });
}

// --- 3. Rectifier and filter ------------------------------------------------------------------------------------------------------
/** The output over three AC cycles (N points), rectified and then held up by a filter capacitor that sags between peaks. */
function supply(mode: string, cap: number, ph: number, N: number) {
  const cycles = 3, raw = (k: number) => Math.sin((k / N) * cycles * TAU - ph);
  const rect = (k: number) => { const x = raw(k); return mode === "none" ? x : mode === "half" ? Math.max(0, x) : Math.abs(x); };
  const decay = cap ? Math.exp(-1 / ((cap * 40 * N) / 600)) : 0, out = new Float32Array(N + 1);
  let vc = 0, minV = 1, maxV = 0;
  for (let k = -N; k <= N; k++) { // run one extra sweep first so the capacitor has settled
    const r = rect(k); vc = mode === "none" ? r : Math.max(r, vc * decay);
    if (k < 0) continue;
    out[k] = vc; if (k > N / 3) { minV = Math.min(minV, vc); maxV = Math.max(maxV, vc); }
  }
  return { raw, out, ripple: maxV - minV };
}
{
  const s = new Scene(el("s-rect"), (g, w, h, t) => {
    const mode = sel("rc-m"), cap = val("rc-c"), L = 30, R = w - 20, mid = h / 2 + 20, A = h * 0.33, N = R - L;
    const { raw, out } = supply(mode, cap, t * 2, N);
    line(g, L, mid, R, mid, C.axis, 1); label(g, "0 V", L - 4, mid + 4, C.muted, "right", 9);
    g.strokeStyle = "#ffffff30"; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k <= N; k++) { const y = mid - A * raw(k); k ? g.lineTo(L + k, y) : g.moveTo(L + k, y); } g.stroke();
    const col = cap && mode !== "none" ? C.green : C.yellow;
    g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); for (let k = 0; k <= N; k++) { const y = mid - A * out[k]; k ? g.lineTo(L + k, y) : g.moveTo(L + k, y); } g.stroke();
    label(g, "AC in (faint)", L, 16, C.muted, "left", 10);
    label(g, mode === "none" ? "output = AC" : cap ? "smoothed DC with ripple" : "rectified, unfiltered", R, 16, col, "right", 11);
  }, 220, { label: "AC rectified by one or two diodes, then smoothed by a filter capacitor into DC with a little ripple" });
  controls(s, ["rc-m", "rc-c"], () => {
    const mode = sel("rc-m"), cap = val("rc-c"), rip = supply(mode, cap, 0, 600).ripple;
    el("rc-co").textContent = cap ? `${cap * 1000} µF` : "none";
    el("r-rect").innerHTML = mode === "none" ? "Raw AC: it reverses every half cycle. A radio can't use it." :
      `${mode === "half" ? "Half-wave: only the positive halves (180°) get through; the gaps are long." : "Full-wave: both halves become positive bumps, two per cycle (360° used)."} ` +
      (cap ? `With the capacitor, ripple is about <em class="g">${Math.round(rip * 100)}%</em> of the peak. Bigger capacitors, smaller ripple${mode === "full" ? "" : "; full-wave would roughly halve it"}.` : "Add a filter capacitor to smooth it.");
  });
}

// --- 4. Linear vs switchmode regulation ---------------------------------------------------------------------------------------------------
{
  const VIN = 18, VOUT = 13.8;
  const s = new Scene(el("s-reg"), (g, w, h, t) => {
    const sw = checked("rg-sw"), i = val("rg-i"), pLoad = VOUT * i, pWaste = sw ? pLoad / 0.9 - pLoad : (VIN - VOUT) * i;
    const L = 30, R = Math.min(w * 0.6, w - 200), mid = h / 2;
    if (sw) { // pulses: on for a fraction VOUT/VIN of each period, averaged by the filter
      const duty = VOUT / VIN, period = 50, top = 40, base = h - 40;
      g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
      for (let x = L; x <= R; x++) { const ph = (((x - L) + t * 60) % period) / period, y = ph < duty ? top : base; x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
      const avg = base - (base - top) * duty; line(g, L, avg, R, avg, C.green, 2.5, [6, 4]);
      label(g, `pulses at ${VIN} V, on ${Math.round(duty * 100)}% of the time`, L, top - 8, C.yellow, "left", 11);
      label(g, `average after the filter: ${VOUT} V`, R, avg - 6, C.green, "right", 11);
    } else {
      label(g, `${VIN} V in`, L, mid - 30, C.yellow, "left", 12);
      g.fillStyle = "#2a2f3a"; g.fillRect(L + 70, mid - 22, 90, 44);
      const glow = Math.min(1, pWaste / 42); g.fillStyle = `rgba(252, 98, 85, ${0.15 + 0.7 * glow})`; g.fillRect(L + 70, mid - 22, 90, 44);
      label(g, "series transistor", L + 115, mid + 4, C.text, "center", 11);
      line(g, L, mid, L + 70, mid, C.axis, 3); line(g, L + 160, mid, R, mid, C.axis, 3);
      label(g, `${VOUT} V out`, R, mid - 10, C.green, "right", 12);
      label(g, `drops ${(VIN - VOUT).toFixed(1)} V × ${i} A`, L + 115, mid + 40, C.red, "center", 11);
    }
    // power bars
    const bx = w - 170, bh = h - 70, max = 10 * VIN;
    for (const [k, p, col, name] of [[0, pLoad, C.green, "to the radio"], [1, pWaste, C.red, "wasted as heat"]] as const) {
      const x = bx + k * 80; g.strokeStyle = C.axis; g.lineWidth = 1; g.strokeRect(x, 30, 36, bh);
      const fr = Math.min(1, p / max); g.fillStyle = col; g.fillRect(x, 30 + bh * (1 - fr), 36, bh * fr);
      label(g, `${p.toFixed(0)} W`, x + 18, 24, col, "center", 11); label(g, name, x + 18, h - 22, col, "center", 10);
    }
  }, 240, { label: "A linear regulator wastes the dropped voltage times the current as heat; a switching regulator chops the input into pulses and wastes little" });
  controls(s, ["rg-sw", "rg-i"], () => {
    const sw = checked("rg-sw"), i = val("rg-i"), pLoad = VOUT * i, pWaste = sw ? pLoad / 0.9 - pLoad : (VIN - VOUT) * i;
    el("rg-io").textContent = `${i} A`;
    el("r-reg").innerHTML = `${VIN} V → ${VOUT} V at ${i} A: the radio gets ${pLoad.toFixed(0)} W; the regulator wastes <em style="color:var(--red)">${pWaste.toFixed(0)} W</em> (efficiency ${Math.round((100 * pLoad) / (pLoad + pWaste))}%).${sw ? " (Assuming a typical 90%-efficient switcher.)" : ""}`;
  });
}

// --- 5. The transistor as a valve --------------------------------------------------------------------------------------------------------
{
  const BETA = 100, ISAT = 500; // mA: a 12 V lamp of 24 Ω
  const ic = (ib: number) => Math.min(ISAT, BETA * ib);
  const s = new Scene(el("s-bjt"), (g, w, h) => {
    const ib = val("bj-i"), c = ic(ib);
    // graph of collector current against base current
    const L = 50, R = Math.min(w - 170, w * 0.62), T = 20, B = h - 34;
    const px = (x: number) => L + (x / 10) * (R - L), py = (ma: number) => B - (ma / 600) * (B - T);
    line(g, L, B, R, B, C.axis, 1); line(g, L, T, L, B, C.axis, 1);
    label(g, "base current (mA) →", R, B + 26, C.muted, "right", 10); label(g, "collector current (mA)", L + 4, T - 6, C.muted, "left", 9);
    for (const x of [0, 2, 4, 6, 8, 10]) label(g, `${x}`, px(x), B + 14, C.muted, "center", 9);
    for (const y of [0, 250, 500]) label(g, `${y}`, L - 4, py(y) + 4, C.muted, "right", 9);
    g.fillStyle = "#58c4dd14"; g.fillRect(px(0), T, px(0.15) - px(0), B - T);
    g.fillStyle = "#83c16714"; g.fillRect(px(5), T, px(10) - px(5), B - T);
    label(g, "active: amplifier", px(2.5), T + 12, C.blue, "center", 10); label(g, "saturation: switch fully on", px(7.5), T + 12, C.green, "center", 10);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath(); for (let x = 0; x <= 10; x += 0.05) { const X = px(x), Y = py(ic(x)); x ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
    g.fillStyle = C.white; g.beginPath(); g.arc(px(ib), py(c), 5, 0, TAU); g.fill();
    if (w > 480) { lamp(g, w - 80, h / 2 - 10, c / ISAT); label(g, "12 V lamp in the collector", w - 80, h - 16, C.muted, "center", 10); }
  }, 240, { animated: false, label: "Collector current against base current: a straight line with slope beta, then flat once the transistor saturates" });
  controls(s, ["bj-i"], () => {
    const ib = val("bj-i"), c = ic(ib);
    el("bj-io").textContent = `${ib.toFixed(1)} mA`;
    el("r-bjt").innerHTML = ib < 0.05 ? `No base current: <em>cutoff</em>, the transistor is off.` :
      c < ISAT ? `${ib.toFixed(1)} mA in the base lets <em class="y">${c.toFixed(0)} mA</em> through the collector: ×${BETA} (beta). Active region: the output follows the input.`
      : `<em class="g">Saturated</em>: the transistor is fully on and the lamp gets all it can (${ISAT} mA). More base current changes nothing.`;
  });
}
