// Lesson 7: antennas. Standing waves on a dipole, lengths, patterns, ERP, phased verticals, height over ground.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

/** A polar plot of a pattern (linear field strength, any scale), in dB rings down to −30 dB. 0° points right. */
function polar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, f: (phi: number) => number, color: string, half = false) {
  const N = 720, vals = Array.from({ length: N }, (_, i) => f((i / N) * TAU)), top = Math.max(...vals, 1e-12);
  const rad = (v: number) => r * Math.max(0, 1 + (20 * Math.log10(Math.max(v / top, 1e-6))) / 30);
  for (const db of [0, -10, -20]) { g.strokeStyle = "#2a2f3a"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r * (1 + db / 30), half ? Math.PI : 0, half ? TAU : TAU); g.stroke(); label(g, `${db} dB`, cx + 4, cy - r * (1 + db / 30) - 3, "#4a5262", "left", 9); }
  line(g, cx - r, cy, cx + r, cy, "#2a2f3a", 1); if (!half) line(g, cx, cy - r, cx, cy + r, "#2a2f3a", 1); else line(g, cx, cy, cx, cy - r, "#2a2f3a", 1);
  g.strokeStyle = color; g.lineWidth = 2.5; g.fillStyle = color + "22"; g.beginPath();
  for (let i = 0; i <= N; i++) { const phi = ((i % N) / N) * TAU; if (half && phi > Math.PI) continue; const rr = rad(vals[i % N]); const x = cx + rr * Math.cos(phi), y = cy - rr * Math.sin(phi); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  if (half) g.lineTo(cx, cy); g.closePath(); g.fill(); g.stroke();
  return vals;
}
/** Beamwidth, front-to-back and front-to-side from sampled pattern values (720 points, 0° = index 0). */
function stats(vals: number[]) {
  const N = vals.length, top = Math.max(...vals), k = vals.indexOf(top), db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9) / top);
  let a = 0; while (a < N / 2 && db(vals[(k + a) % N]) > -3) a++;
  let b = 0; while (b < N / 2 && db(vals[(k - b + N) % N]) > -3) b++;
  return { dir: (k / N) * 360, bw: ((a + b) / N) * 360, fb: -db(vals[(k + N / 2) % N]), fs: -db(vals[(k + N / 4) % N]) };
}

// --- 1. Standing waves on a dipole ------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-dipole"), (g, w, h, t) => {
    const x0 = 50, x1 = w - 50, cy = h / 2, A = h * 0.32, Lw = x1 - x0, fp = val("dp-x");
    const ph = t * 2.5;
    const xs = (u: number) => x0 + (u + 0.5) * Lw; // u from −0.5 to +0.5 along the wire
    // current is cos(πu): biggest at the center, zero at the ends; voltage is |sin(πu)|, opposite in sign on the two halves
    for (const [env, inst, col, name] of [[(u: number) => Math.cos(Math.PI * u), Math.cos(ph), C.blue, "current"], [(u: number) => Math.abs(Math.sin(Math.PI * u)), Math.sin(ph), C.yellow, "voltage"]] as const) {
      g.strokeStyle = col + "55"; g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath();
      for (let i = 0; i <= 200; i++) { const u = -0.5 + i / 200, y = cy - A * env(u); i ? g.lineTo(xs(u), y) : g.moveTo(xs(u), y); } g.stroke(); g.setLineDash([]);
      g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath();
      for (let i = 0; i <= 200; i++) { const u = -0.5 + i / 200, sgn = name === "voltage" && u < 0 ? -1 : 1, y = cy - A * env(u) * inst * sgn; i ? g.lineTo(xs(u), y) : g.moveTo(xs(u), y); } g.stroke();
    }
    line(g, x0, cy, x1, cy, C.text, 4);
    const fx = xs(fp); g.fillStyle = C.green; g.beginPath(); g.arc(fx, cy, 7, 0, TAU); g.fill();
    label(g, "feed", fx, cy + 24, C.green, "center", 11);
    label(g, "current (envelope dashed)", x0, 18, C.blue, "left", 11); label(g, "voltage", x0 + 170, 18, C.yellow, "left", 11);
    label(g, "½ wavelength", (x0 + x1) / 2, h - 8, C.muted, "center", 11);
  }, 230, { label: "Current and voltage standing waves along a half-wave dipole, with a movable feed point" });
  controls(s, ["dp-x"], () => {
    const fp = val("dp-x"), c = Math.cos(Math.PI * fp), z = 73 / (c * c);
    el("dp-xo").textContent = fp ? `${Math.round(fp * 200)}% toward the end` : "center";
    el("r-dipole").innerHTML = `Feed-point impedance ≈ <em class="g">${z > 3000 ? "several thousand Ω (very high)" : Math.round(z) + " Ω"}</em>${fp === 0 ? " (about 73 Ω in free space; 50–75 Ω in practice): current is highest here." : "."}`;
  });
}

// --- 2. Antenna length calculator ---------------------------------------------------------------------------------------------
{
  const fOf = () => 1.8 * (450 / 1.8) ** (val("ln-f") / 1000);
  const s = new Scene(el("s-len"), (g, w, h) => {
    const f = fOf(), k = Number(sel("ln-t")), ft = k / f, L = 40, R = w - 40, base = h - 34;
    const scale = (R - L - 40) / Math.max(ft, 6.5); // px per foot, keeping a person visible
    const len = ft * scale;
    if (k === 468) { line(g, L, 60, L + len, 60, C.yellow, 4); g.fillStyle = C.green; g.beginPath(); g.arc(L + len / 2, 60, 5, 0, TAU); g.fill(); label(g, "feed", L + len / 2, 80, C.green, "center", 10); }
    else { line(g, L + 20, base, L + 20, base - len, C.yellow, 4); for (const d of [-1, 1]) line(g, L + 20, base, L + 20 + d * 30, base + 12, C.muted, 2); }
    // a 6-foot person for scale
    const ph = 6 * scale, px = R - 10;
    if (ph > 5) { g.fillStyle = C.muted; g.beginPath(); g.arc(px, base - ph + ph * 0.07, ph * 0.07, 0, TAU); g.fill(); g.fillRect(px - ph * 0.06, base - ph * 0.86, ph * 0.12, ph * 0.86); label(g, "6 ft person", px, base + 14, C.muted, "center", 9); }
    line(g, L, base + 2, R, base + 2, C.axis, 1);
  }, 220, { animated: false, label: "The length of a dipole or quarter-wave vertical for the chosen frequency, next to a person for scale" });
  controls(s, ["ln-f", "ln-t"], () => {
    const f = fOf(), k = Number(sel("ln-t")), ft = k / f;
    el("ln-fo").textContent = `${f.toFixed(f < 10 ? 3 : f < 100 ? 2 : 1)} MHz`;
    el("r-len").innerHTML = `${k} ÷ ${f.toFixed(f < 10 ? 3 : 2)} = <em class="y">${ft >= 10 ? ft.toFixed(1) : ft.toFixed(2)} feet</em>${ft < 4 ? ` (${(ft * 12).toFixed(1)} inches)` : ""}, or ${(ft * 0.3048).toFixed(2)} m.`;
  });
}

// --- 3. Radiation patterns ----------------------------------------------------------------------------------------------------
const YAGI: [number, number, number][] = [[-0.15, 0.8, 2.95], [0, 1, 0], [0.2, 0.65, -2.89]]; // position (λ), current, phase: fitted for ~19 dB F/B
const PATTERNS: Record<string, (phi: number) => number> = {
  dipole: (phi) => (Math.abs(Math.sin(phi)) < 1e-6 ? 0 : Math.abs(Math.cos((Math.PI / 2) * Math.cos(phi)) / Math.sin(phi))), // off the ends: a true null
  vertical: () => 1,
  yagi: (phi) => {
    let re = 0, im = 0; for (const [x, a, p] of YAGI) { const ph = TAU * x * Math.cos(phi) + p; re += a * Math.cos(ph); im += a * Math.sin(ph); }
    return Math.abs(Math.cos(phi)) < 1e-6 ? 0 : Math.hypot(re, im) * Math.abs(Math.cos((Math.PI / 2) * Math.sin(phi)) / Math.cos(phi));
  },
  loop: (phi) => Math.abs(Math.cos(phi)),
};
{
  const s = new Scene(el("s-pattern"), (g, w, h) => {
    const t = sel("pt-t"), cx = w / 2, cy = h / 2, r = Math.min(w / 2, h / 2) - 24;
    polar(g, cx, cy, r, PATTERNS[t], C.yellow);
    // the antenna itself, seen from above
    if (t === "dipole") line(g, cx - 26, cy, cx + 26, cy, C.text, 4);
    else if (t === "vertical") { g.fillStyle = C.text; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill(); }
    else if (t === "yagi") { line(g, cx - 24, cy, cx + 30, cy, C.muted, 2); for (const [x, , , len] of [[-18, 0, 0, 30], [0, 0, 0, 27], [24, 0, 0, 24]]) line(g, cx + x, cy - len / 2, cx + x, cy + len / 2, C.text, 3); label(g, "→ front", cx + r * 0.55, cy - 8, C.muted, "center", 10); }
    else line(g, cx - 20, cy, cx + 20, cy, C.pink, 5);
    label(g, "seen from above", 12, 16, C.muted, "left", 10);
  }, 340, { animated: false, label: "Azimuth radiation patterns of common antennas on a decibel polar plot" });
  controls(s, ["pt-t"], () => {
    const t = sel("pt-t"), vals = Array.from({ length: 720 }, (_, i) => PATTERNS[t]((i / 720) * TAU)), st = stats(vals);
    el("r-pattern").innerHTML = t === "vertical" ? `The same in every direction: <em class="y">omnidirectional</em> in azimuth.`
      : t === "dipole" ? `Strongest broadside (at right angles to the wire), nulls off the ends. −3 dB beamwidth of each lobe: <em class="y">${st.bw.toFixed(0)}°</em>.`
      : t === "loop" ? `Maximum in the plane of the loop, <em class="y">deep nulls broadside</em> to it (up and down here).`
      : `Main lobe forward. Beamwidth <em class="y">${st.bw.toFixed(0)}°</em>, front-to-back <em class="y">${st.fb.toFixed(0)} dB</em>, front-to-side <em class="y">${st.fs.toFixed(0)} dB</em> (this model).`;
  });
}

// --- 4. ERP / EIRP ----------------------------------------------------------------------------------------------------------------
{
  const isoBox = document.createElement("label");
  isoBox.innerHTML = `<input id="er-i" type="checkbox"> Gain in dBi (gives EIRP)`;
  el("s-erp").querySelector(".controls")!.append(isoBox);
  const s = new Scene(el("s-erp"), (g, w, h) => {
    const p = val("er-p"), loss = val("er-l"), gain = val("er-g"), net = gain - loss, out = p * 10 ** (net / 10);
    const L = 30, R = w - 30, max = Math.max(p, out) * 1.1, px = (watts: number) => L + (watts / max) * (R - L);
    const steps: [string, number, string][] = [["transmitter", p, C.blue], [`after ${loss.toFixed(1)} dB of losses`, p * 10 ** (-loss / 10), C.red], [`with ${gain.toFixed(1)} ${checked("er-i") ? "dBi" : "dBd"} of gain`, out, C.green]];
    steps.forEach(([name, watts, col], i) => {
      const yy = 24 + i * ((h - 40) / 3);
      g.fillStyle = col; g.fillRect(L, yy, px(watts) - L, 20);
      label(g, `${name}: ${watts.toFixed(0)} W`, L + 6, yy + 34, col, "left", 11);
    });
  }, 200, { animated: false, label: "Transmitter power reduced by losses and multiplied by antenna gain to give effective radiated power" });
  const upd = () => {
    const p = val("er-p"), loss = val("er-l"), gain = val("er-g"), iso = checked("er-i"), net = gain - loss, out = p * 10 ** (net / 10);
    el("er-po").textContent = `${p} W`; el("er-lo").textContent = `${loss.toFixed(1)} dB`; el("er-go").textContent = `${gain.toFixed(1)} ${iso ? "dBi" : "dBd"}`;
    el("r-erp").innerHTML = `Net ${net >= 0 ? "+" : ""}${net.toFixed(1)} dB, so ${iso ? "EIRP" : "ERP"} = ${p} × 10<sup>${(net / 10).toFixed(2)}</sup> = <em class="g">${out.toFixed(0)} W</em>${iso ? ` (ERP ${(out / 10 ** 0.215).toFixed(0)} W)` : ` (EIRP ${(out * 10 ** 0.215).toFixed(0)} W)`}.`;
    s.redraw();
  };
  ["er-p", "er-l", "er-g", "er-i"].forEach((id) => el(id).addEventListener("input", upd));
  const preset = (p: number, l: number, gn: number, iso: boolean) => { (el("er-p") as HTMLInputElement).value = `${p}`; (el("er-l") as HTMLInputElement).value = `${l}`; (el("er-g") as HTMLInputElement).value = `${gn}`; (el("er-i") as HTMLInputElement).checked = iso; upd(); };
  el("er-1").addEventListener("click", () => preset(150, 4.2, 7, false));
  el("er-2").addEventListener("click", () => preset(200, 8, 10, false));
  el("er-3").addEventListener("click", () => preset(200, 6, 7, true));
  upd();
}

// --- 5. Two phased verticals -------------------------------------------------------------------------------------------------------
{
  const af = (phi: number) => { const d = val("ph-d"), delta = (val("ph-p") * Math.PI) / 180, ph = TAU * d * Math.cos(phi) - delta; return Math.hypot(1 + Math.cos(ph), Math.sin(ph)); };
  const s = new Scene(el("s-phased"), (g, w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w / 2, h / 2) - 24, d = val("ph-d");
    polar(g, cx, cy, r, af, C.blue);
    const sep = Math.min(r * 0.6, d * 60);
    for (const x of [-sep / 2, sep / 2]) { g.fillStyle = C.text; g.beginPath(); g.arc(cx + x, cy, 5, 0, TAU); g.fill(); }
    label(g, "two verticals, seen from above (second one lags)", 12, 16, C.muted, "left", 10);
  }, 320, { animated: false, label: "The pattern of two vertical antennas depending on their spacing and the phase difference of their currents" });
  controls(s, ["ph-d", "ph-p"], () => {
    const d = val("ph-d"), p = val("ph-p");
    el("ph-do").textContent = `${d} λ`; el("ph-po").textContent = `${p}°`;
    const named = d === 0.5 && p === 0 ? "a figure-eight broadside to the pair" : d === 0.5 && p === 180 ? "a figure-eight along the line of the pair" : d === 0.25 && p === 90 ? "a cardioid: one direction, one deep null" : "";
    el("r-phased").innerHTML = named ? `<em class="b">${named}</em>.` : `Try ½ λ at 0°, ½ λ at 180°, and ¼ λ at 90°.`;
  });
}

// --- 6. Height above ground: the elevation pattern of a horizontal dipole ---------------------------------------------------------------
{
  const pat = (psi: number) => Math.abs(Math.sin(TAU * val("hg-h") * Math.sin(psi)));
  const s = new Scene(el("s-height"), (g, w, h) => {
    const cx = w / 2, cy = h - 24, r = Math.min(w / 2 - 20, h - 40);
    g.fillStyle = "#2a2218"; g.fillRect(0, cy, w, 24); label(g, "ground", 12, cy + 16, C.muted, "left", 10);
    polar(g, cx, cy, r, (phi) => (phi <= Math.PI ? pat(phi) : 0), C.yellow, true);
    label(g, "elevation pattern, broadside, seen from the side", 12, 16, C.muted, "left", 10);
  }, 260, { animated: false, label: "The elevation pattern of a horizontal dipole at different heights above ground" });
  controls(s, ["hg-h"], () => {
    const hh = val("hg-h"), take = hh >= 0.25 ? (Math.asin(1 / (4 * hh)) * 180) / Math.PI : 90;
    el("hg-ho").textContent = `${hh} λ`;
    el("r-height").innerHTML = hh < 0.25 ? `Most energy goes <em class="y">straight up</em>: an NVIS antenna, for short-range coverage.` : `Lowest lobe peaks <em class="y">${take.toFixed(0)}°</em> above the horizon. Raise it to lower the angle.`;
  });
}
