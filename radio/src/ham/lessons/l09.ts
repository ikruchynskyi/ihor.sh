// Lesson 9: propagation. Radio horizon, an ionosphere ray tracer, the MUF over a day, and a space-weather timeline.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;
const mi = (km: number) => km * 0.6214;

// --- 1. Radio horizon --------------------------------------------------------------------------------------------------------
{
  // With the 4/3-Earth model of refraction, the drop below a tangent line is d²/2 feet at d miles: so the horizon is √(2h) ≈ 1.41√h.
  const s = new Scene(el("s-horizon"), (g, w, h) => {
    const ha = val("hz-a"), hb = val("hz-b"), da = Math.sqrt(2 * ha), db = Math.sqrt(2 * hb), D = da + db;
    // At the longest path both tower tops sit exactly on the tangent line (0 ft); the ground falls away below it.
    const L = 40, R = w - 40, top = 60, base = h - 20, kx = (R - L) / D, ky = (base - top) / Math.max(ha, hb, 1);
    const Y = (ft: number) => top - ft * ky; // ft relative to the tangent line → px
    const surf = (x: number) => -((x - da) ** 2) / 2; // effective Earth surface, ft relative to the tangent line
    g.fillStyle = "#1f2c22"; g.beginPath(); g.moveTo(L, h);
    for (let x = 0; x <= D; x += D / 200) g.lineTo(L + x * kx, Math.min(h, Y(surf(x))));
    g.lineTo(R, h); g.fill();
    line(g, L, Y(surf(0)), L, Y(surf(0) + ha), C.text, 3); line(g, R, Y(surf(D)), R, Y(surf(D) + hb), C.text, 3);
    line(g, L, Y(0), R, Y(0), C.yellow, 2, [6, 4]);
    g.fillStyle = C.yellow; g.beginPath(); g.arc(L + da * kx, Y(0), 4, 0, TAU); g.fill();
    label(g, "you", L, Y(surf(0) + ha) - 8, C.text, "center", 11); label(g, "repeater", R, Y(surf(D) + hb) - 8, C.text, "center", 11);
    label(g, "the signal just grazes the horizon here", L + da * kx, Y(0) - 10, C.yellow, "center", 10);
    label(g, "(heights hugely exaggerated)", w - 10, h - 8, C.muted, "right", 9);
  }, 230, { animated: false, label: "Two antennas on a curved Earth; the longest possible line-of-sight path just grazes the horizon" });
  controls(s, ["hz-a", "hz-b"], () => {
    const ha = val("hz-a"), hb = val("hz-b"), da = Math.sqrt(2 * ha), db = Math.sqrt(2 * hb);
    el("hz-ao").textContent = `${ha} ft`; el("hz-bo").textContent = `${hb} ft`;
    el("r-horizon").innerHTML = `Radio horizons ${da.toFixed(0)} + ${db.toFixed(0)} miles: line of sight up to about <em class="y">${(da + db).toFixed(0)} miles</em> (the visual horizon alone would give ${(1.22 * (Math.sqrt(ha) + Math.sqrt(hb))).toFixed(0)}).`;
  });
}

// --- 2. Ionosphere ray tracer --------------------------------------------------------------------------------------------------------
{
  const RE = 6371;
  /** Layers (km, critical frequency in MHz) for day/night and solar activity s (0…1). */
  const layers = (night: boolean, s: number) => night ? [{ name: "F", h: 300, fc: 3 + 3 * s }] : [{ name: "E", h: 110, fc: 3.4 }, { name: "F2", h: 330, fc: 6 + 6.5 * s }];
  const trace = (f: number, psiDeg: number, night: boolean, s: number) => {
    const psi = (psiDeg * Math.PI) / 180;
    const dayAbsorb = !night && f < 6; // the D region eats the low bands by day (a simplification: really it fades gradually)
    for (const L of layers(night, s)) {
      const sinI = (RE * Math.cos(psi)) / (RE + L.h), cosI = Math.sqrt(1 - sinI * sinI), muf = L.fc / cosI;
      if (f <= muf) { const beta = Math.PI / 2 - psi - Math.asin(sinI); return { layer: L, hop: 2 * RE * beta, muf, absorbed: dayAbsorb, escaped: false }; }
    }
    const top = layers(night, s).at(-1)!, sinI = (RE * Math.cos(psi)) / (RE + top.h);
    return { layer: top, hop: 0, muf: top.fc / Math.sqrt(1 - sinI * sinI), absorbed: dayAbsorb, escaped: true };
  };
  const s = new Scene(el("s-iono"), (g, w, h) => {
    const f = val("io-f"), psi = val("io-a"), night = checked("io-n"), sun = val("io-s"), tr = trace(f, psi, night, sun);
    const L = 20, R = w - 20, B = h - 26, maxKm = 8000, kx = (R - L) / maxKm, ky = (B - 20) / 420; // altitude 0…420 km
    const X = (km: number) => L + km * kx, Y = (alt: number) => B - alt * ky;
    g.fillStyle = night ? "#0c0f14" : "#14202c"; g.fillRect(0, 0, w, B);
    // layers
    if (!night) { g.fillStyle = "#3a2a2a66"; g.fillRect(0, Y(90), w, Y(60) - Y(90)); label(g, "D (absorbs, daytime only)", R, Y(75) + 4, "#c08080", "right", 10); }
    for (const Lr of layers(night, sun)) { g.fillStyle = Lr.name === "E" ? "#2a3a2a66" : "#2a2f4a88"; g.fillRect(0, Y(Lr.h + 30), w, 60 * ky); label(g, `${Lr.name}  (critical ${Lr.fc.toFixed(1)} MHz)`, R, Y(Lr.h) + 4, C.muted, "right", 10); }
    g.fillStyle = "#1f2c22"; g.fillRect(0, B, w, h - B);
    for (const km of [0, 2000, 4000, 6000, 8000]) label(g, `${Math.round(mi(km))} mi`, X(km), h - 8, C.muted, "center", 9);
    // the ray: straight up at the takeoff angle (in this flattened view), bouncing between ground and layer
    g.strokeStyle = tr.absorbed ? C.red : C.yellow; g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(0), Y(0));
    if (tr.absorbed) { const d = 75 / Math.tan((psi * Math.PI) / 180); g.lineTo(X(Math.min(d, maxKm)), Y(75)); }
    else if (tr.escaped) { const d = 420 / Math.tan((psi * Math.PI) / 180); g.lineTo(X(Math.min(d, maxKm)), Y(Math.min(420, Math.tan((psi * Math.PI) / 180) * maxKm))); }
    else { let x = 0; for (let k = 0; k < 6 && x < maxKm; k++) { g.lineTo(X(x + tr.hop / 2), Y(tr.layer.h)); x += tr.hop; g.lineTo(X(x), Y(0)); } }
    g.stroke();
    if (!tr.absorbed && !tr.escaped) {
      g.fillStyle = "#fc625533"; g.fillRect(X(160), B - 6, Math.max(0, X(tr.hop) - X(160)), 6); // skip zone, beyond ~100 mi of ground wave
      label(g, "skip zone", (X(160) + X(tr.hop)) / 2, B - 10, C.red, "center", 10);
    }
  }, 300, { animated: false, label: "A radio signal leaving at a chosen angle and frequency: absorbed by the D region, reflected by the E or F region in hops, or escaping into space" });
  controls(s, ["io-f", "io-a", "io-n", "io-s"], () => {
    const f = val("io-f"), psi = val("io-a"), night = checked("io-n"), sun = val("io-s"), tr = trace(f, psi, night, sun);
    el("io-fo").textContent = `${f.toFixed(1)} MHz`; el("io-ao").textContent = `${psi}°`; el("io-so").textContent = sun < 0.3 ? "low" : sun < 0.7 ? "medium" : "high";
    el("r-iono").innerHTML = tr.absorbed ? `<em style="color:var(--red)">Absorbed</em> by the daytime D region: low frequencies don't survive it. Try Night.`
      : tr.escaped ? `<em style="color:var(--red)">Escapes into space</em>: above the MUF for this angle (${tr.muf.toFixed(1)} MHz). Lower the frequency or the angle.`
      : `Reflected by the <em class="y">${tr.layer.name}</em> region: each hop is about <em class="y">${Math.round(mi(tr.hop))} miles</em>. MUF at this angle: ${tr.muf.toFixed(1)} MHz.`;
  });
}

// --- 3. MUF and LUF over a day ----------------------------------------------------------------------------------------------------------
const BANDS: [string, number][] = [["160", 1.9], ["80", 3.7], ["40", 7.15], ["30", 10.1], ["20", 14.2], ["17", 18.1], ["15", 21.2], ["12", 24.9], ["10", 28.5]];
{
  const light = (hr: number) => Math.max(0, Math.min(1, (Math.cos((TAU * (hr - 13)) / 24) + 0.3) / 1.1)); // 0 at night, 1 around 1 pm
  const muf = (hr: number, s: number) => (7 + 6 * s) + (8 + 20 * s) * light(hr);
  const luf = (hr: number) => 2 + 6 * light(hr);
  const s = new Scene(el("s-muf"), (g, w, h) => {
    const sun = val("mf-s"), now = val("mf-t"), L = 46, R = w - 16, T = 14, B = h - 26, X = (hr: number) => L + (hr / 24) * (R - L), Y = (mhz: number) => B - (Math.log(mhz / 1.5) / Math.log(40 / 1.5)) * (B - T); // log scale, so the low bands get room
    for (const [name, f] of BANDS) { line(g, L, Y(f), R, Y(f), "#1f242d", 1); label(g, `${name} m`, L - 4, Y(f) + 4, C.muted, "right", 9); }
    for (const hr of [0, 6, 12, 18, 24]) label(g, `${String(hr).padStart(2, "0")}:00`, X(hr), B + 16, C.muted, "center", 9);
    g.fillStyle = "#83c16726"; g.beginPath();
    for (let x = L; x <= R; x++) { const hr = ((x - L) / (R - L)) * 24; x === L ? g.moveTo(x, Y(muf(hr, sun))) : g.lineTo(x, Y(muf(hr, sun))); }
    for (let x = R; x >= L; x--) { const hr = ((x - L) / (R - L)) * 24; g.lineTo(x, Y(luf(hr))); }
    g.fill();
    for (const [f, col, name] of [[(hr: number) => muf(hr, sun), C.yellow, "MUF"], [luf, C.red, "LUF"]] as const) {
      g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath();
      for (let x = L; x <= R; x++) { const hr = ((x - L) / (R - L)) * 24; x === L ? g.moveTo(x, Y(f(hr))) : g.lineTo(x, Y(f(hr))); } g.stroke();
      label(g, name, R - 4, Y(f(24)) - 6, col, "right", 10);
    }
    line(g, X(now), T, X(now), B, C.white, 1.5, [4, 3]);
  }, 260, { animated: false, label: "The maximum and lowest usable frequencies over 24 hours, with the amateur bands; bands between the curves are open" });
  controls(s, ["mf-s", "mf-t"], () => {
    const sun = val("mf-s"), now = val("mf-t"), m = muf(now, sun), l = luf(now), open = BANDS.filter(([, f]) => f < m * 0.95 && f > l).map(([n]) => `${n} m`);
    el("mf-so").textContent = sun < 0.3 ? "minimum" : sun < 0.7 ? "medium" : "maximum";
    el("mf-to").textContent = `${String(Math.floor(now)).padStart(2, "0")}:${String(Math.round((now % 1) * 60)).padStart(2, "0")}`;
    el("r-muf").innerHTML = `MUF ${m.toFixed(1)} MHz, LUF ${l.toFixed(1)} MHz. Open for long distance: <em class="g">${open.join(", ") || "nothing much"}</em>. Best: the highest band just below the MUF.`;
  });
}

// --- 4. A space-weather timeline ------------------------------------------------------------------------------------------------------------
{
  const hrs = () => (val("sn-t") / 100) ** 3 * 72;
  const s = new Scene(el("s-sun"), (g, w, h) => {
    const t = hrs(), sx = 50, ex = w - 60, cy = h / 2;
    const grad = g.createRadialGradient(sx, cy, 4, sx, cy, 40); grad.addColorStop(0, "#fff3b0"); grad.addColorStop(1, "#f4d35e00"); g.fillStyle = grad; g.beginPath(); g.arc(sx, cy, 40, 0, TAU); g.fill();
    g.fillStyle = "#3a7bd5"; g.beginPath(); g.arc(ex, cy, 16, 0, TAU); g.fill(); label(g, "Earth", ex, cy + 34, C.muted, "center", 10);
    // light front (flare X-rays): 8.3 minutes to Earth
    const xl = sx + Math.min(1, t / 0.139) * (ex - sx); line(g, xl, cy - 50, xl, cy + 50, C.yellow, 2); label(g, "X-rays (light speed)", xl, cy - 56, C.yellow, "center", 10);
    // the CME cloud: ~40 hours here
    const xc = sx + Math.min(1, t / 40) * (ex - sx), r = 10 + 30 * Math.min(1, t / 40);
    g.fillStyle = "#e07a9f55"; g.beginPath(); g.arc(Math.min(xc, ex - 10), cy, r, 0, TAU); g.fill(); label(g, "CME (charged particles)", Math.min(xc, ex - 30), cy + r + 14, C.pink, "center", 10);
    if (t > 40) { g.strokeStyle = "#83c167"; g.lineWidth = 2; for (const d of [-1, 1]) { g.beginPath(); g.arc(ex, cy + d * 10, 14, d > 0 ? 0.3 : Math.PI + 0.3, d > 0 ? Math.PI - 0.3 : TAU - 0.3); g.stroke(); } }
  }, 180, { animated: false, label: "A solar eruption: flare X-rays reach Earth in about 8 minutes, the coronal mass ejection a day or two later" });
  controls(s, ["sn-t"], () => {
    const t = hrs();
    el("sn-to").textContent = t < 1 ? `${Math.round(t * 60)} min` : `${t.toFixed(0)} h`;
    el("r-sun").innerHTML = t < 0.139 ? "A flare erupts. Its X-rays are on their way at the speed of light."
      : t < 15 ? `<em class="y">Flare X-rays arrived after ~8 minutes</em>: the sunlit D region thickens, causing a sudden ionospheric disturbance; lower HF frequencies fade out first. Lasts minutes to hours.`
      : t < 40 ? "The CME is crossing space (15 hours to several days)."
      : `<em class="p">The CME hits</em>: a geomagnetic storm. K and A indices climb, HF degrades (especially at high latitudes), and auroras may reflect VHF.`;
  });
}
