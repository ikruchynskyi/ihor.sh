// Antennas in practice: aperture, wire patterns, link budget, Fresnel zone, polarization, cut list and trimming, dishes.
// Every number comes from ../antenna-math.ts, which antenna-math.test.ts checks against known values.
import "../ham.css";
import "../../../../learn-kit.js"; // questions, gists, deeper boxes (shared with the courses)
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import * as A from "../antenna-math.ts";

const el = (id: string) => document.getElementById(id)!;
const num = (id: string) => parseFloat((el(id) as HTMLInputElement).value);
const TAU = 2 * Math.PI;
const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 1e4 ? 0 : 1)} km` : m >= 1 ? `${m.toFixed(m >= 100 ? 0 : 2)} m` : m >= 0.01 ? `${(m * 100).toFixed(1)} cm` : `${(m * 1000).toFixed(1)} mm`);
const fmtMHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 1e4 ? 1 : 2)} GHz` : `${f.toFixed(f >= 100 ? 0 : 1)} MHz`);
const fmtW = (dbm: number) => { const w = A.dbmToWatts(dbm); const u: [number, string][] = [[1, "W"], [1e-3, "mW"], [1e-6, "µW"], [1e-9, "nW"], [1e-12, "pW"], [1e-15, "fW"], [1e-18, "aW"]]; const [s, n] = u.find(([s]) => w >= s) ?? u.at(-1)!; return `${(w / s).toPrecision(2)} ${n}`; };

// --- 1. Effective aperture, to scale next to a person ----------------------------------------------------------------
{
  const s = new Scene(el("s-aperture"), (g, w, h) => {
    const f = 10 ** val("ap-f"), ae = A.apertureM2(val("ap-g"), f), side = Math.sqrt(ae), dip = 0.95 * A.wavelength(f) / 2;
    const sc = Math.min((h - 76) / Math.max(side, 1.8), (w - 60) / (side + 1.2)); // the person and the square side by side
    const base = h - 34, x0 = 30;
    // a person 1.8 m tall
    const ph = 1.8 * sc, px = x0 + 0.3 * sc;
    g.strokeStyle = C.muted; g.lineWidth = Math.max(1, sc * 0.06);
    g.beginPath(); g.arc(px, base - ph + ph * 0.07, ph * 0.07, 0, TAU); g.stroke();
    line(g, px, base - ph * 0.86, px, base - ph * 0.42, C.muted, g.lineWidth); line(g, px, base - ph * 0.42, px - ph * 0.12, base, C.muted, g.lineWidth); line(g, px, base - ph * 0.42, px + ph * 0.12, base, C.muted, g.lineWidth);
    line(g, px - ph * 0.18, base - ph * 0.72, px + ph * 0.18, base - ph * 0.72, C.muted, g.lineWidth);
    // the aperture, a square of the same area
    const sx = x0 + 0.9 * sc, sp = Math.max(1, side * sc);
    g.fillStyle = "rgba(244,211,94,0.25)"; g.fillRect(sx, base - sp, sp, sp); g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.strokeRect(sx, base - sp, sp, sp);
    label(g, sp < 14 ? "← the area (a speck)" : "the area it collects", sx + sp + 6, base - Math.max(sp / 2, 8), C.yellow, "left", 12);
    // the half-wave dipole's length, along the top, if it fits on the same scale
    const dlen = dip * sc, dy = 22;
    if (x0 + dlen < w - 10) { line(g, x0, dy, x0 + dlen, dy, C.blue, 3); label(g, `a half-wave dipole: ${fmtM(dip)}`, x0, dy + 16, C.blue, "left", 12); }
    else label(g, `a half-wave dipole: ${fmtM(dip)} (too long to draw on this scale)`, w - 10, dy, C.blue, "right", 12);
    line(g, 10, base, w - 10, base, C.axis, 1);
    label(g, "drawn to scale", w - 10, h - 10, C.muted, "right", 11);
  }, 280, { animated: false, label: "The area an antenna collects, drawn to scale beside a person and a half-wave dipole" });
  controls(s, ["ap-f", "ap-g"], () => {
    const f = 10 ** val("ap-f"), gdb = val("ap-g"), ae = A.apertureM2(gdb, f);
    el("ap-fo").textContent = fmtMHz(f); el("ap-go").textContent = `${gdb.toFixed(1)} dBi`;
    el("r-aperture").innerHTML = `Wavelength <em class="b">${fmtM(A.wavelength(f))}</em> · it collects <em class="y">${ae >= 0.01 ? ae.toPrecision(2) + " m²" : (ae * 1e4).toPrecision(2) + " cm²"}</em> of the wave` +
      ` (a square ${fmtM(Math.sqrt(ae))} on a side)`;
  });
}

// --- 2. A center-fed wire of any length: its pattern, seen from the side ------------------------------------------------
{
  const s = new Scene(el("s-wire"), (g, w, h) => {
    const L = val("wi-l"), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
    let peak = 0; for (let i = 1; i < 720; i++) peak = Math.max(peak, Math.abs(A.wirePattern(L, (i * Math.PI) / 720)));
    line(g, cx, cy - R * 0.25 * Math.min(1, L), cx, cy + R * 0.25 * Math.min(1, L), C.text, 4); // the wire (not to scale)
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 720; i++) { // θ from the wire (vertical here), all the way round
      const th = (i * TAU) / 720, r = (Math.abs(A.wirePattern(L, th)) / peak) * R, x = cx + r * Math.sin(th), y = cy - r * Math.cos(th);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    label(g, "wire", cx + 8, cy - R * 0.25 * Math.min(1, L) - 4, C.text, "left", 11);
    label(g, "field strength in each direction (the wire's axis is up–down)", w / 2, h - 8, C.muted, "center", 11);
  }, 300, { animated: false, label: "The radiation pattern of a center-fed wire, which grows more lobes as the wire gets longer" });
  controls(s, ["wi-l"], () => {
    const L = val("wi-l");
    el("wi-lo").textContent = `${L.toFixed(2)} λ`;
    el("r-wire").innerHTML = `Peak gain <em class="y">${A.wireDirectivityDbi(L).toFixed(2)} dBi</em> (a lossless wire)`;
  });
}

// --- 3. Link budget: a ladder of levels down to the receiver, against its noise floor -------------------------------------
{
  const P: Record<string, number[]> = { // watts, their dBi, your dBi, km, MHz, losses dB, bandwidth kHz, noise figure dB
    hand: [5, 0, 0, 10, 146, 0, 12.5, 3], repeater: [5, 0, 6, 40, 146.94, 2, 12.5, 3], wifi: [0.1, 2, 2, 0.03, 2437, 0, 20000, 6],
    sat: [5, 0, 2.15, 830, 137.9, 3, 150, 1.1], hills: [50, 12, 12, 100, 144.2, 3, 2.4, 2],
  };
  const ids = ["lb-tx", "lb-gt", "lb-gr", "lb-d", "lb-f", "lb-l", "lb-b", "lb-n"];
  const read = () => ids.map(num);
  const s = new Scene(el("s-budget"), (g, w, h) => {
    const [tx, gt, gr, km, f, loss, bw, nf] = read();
    if ([tx, km, f, bw].some((v) => !(v > 0))) { label(g, "enter positive numbers", w / 2, h / 2, C.muted, "center"); return; }
    const txDbm = 10 * Math.log10(tx * 1000), fspl = A.fsplDb(km, f), rx = A.receivedDbm(txDbm, gt, gr, km, f, loss), floor = A.noiseFloorDbm(bw * 1000, nf);
    const steps: [string, number, string][] = [["sent", txDbm, C.blue], ["+ their ant.", txDbm + gt, C.blue], ["− path", txDbm + gt - fspl, C.pink], ["+ your ant.", txDbm + gt - fspl + gr, C.blue], ["− losses", rx, C.blue]];
    const hi = Math.max(...steps.map((x) => x[1]), floor) + 10, lo = Math.min(...steps.map((x) => x[1]), floor) - 10;
    const L = 48, R = 14, T = 22, B = 36, Y = (d: number) => T + ((hi - d) / (hi - lo)) * (h - T - B), colW = (w - L - R) / steps.length;
    for (let d = Math.ceil(lo / 20) * 20; d <= hi; d += 20) { line(g, L, Y(d), w - R, Y(d), C.grid, 1); label(g, `${d}`, L - 6, Y(d) + 4, C.muted, "right", 11); }
    label(g, "dBm", L + 4, T + 2, C.muted, "left", 11);
    line(g, L, Y(floor), w - R, Y(floor), C.red, 1.5, [5, 4]); label(g, "receiver's noise floor", w - R, Y(floor) + 14, C.red, "right", 11);
    let prev = steps[0][1];
    steps.forEach(([name, v, col], i) => {
      const x = L + colW * i + colW * 0.2, bw2 = colW * 0.6;
      g.fillStyle = col; g.fillRect(x, Math.min(Y(v), Y(prev)) - 1, bw2, Math.max(2, Math.abs(Y(v) - Y(prev))));
      line(g, x, Y(v), x + bw2, Y(v), C.white, 2);
      if (i < steps.length - 1) line(g, x + bw2, Y(v), x + colW, Y(v), C.axis, 1, [2, 3]);
      label(g, name, x + bw2 / 2, h - B + 16, C.text, "center", 10);
      prev = v;
    });
  }, 300, { animated: false, label: "A link budget as a ladder of power levels in dBm, ending at the received level, compared with the noise floor" });
  const update = () => {
    const [tx, gt, gr, km, f, loss, bw, nf] = read();
    if ([tx, km, f, bw].some((v) => !(v > 0))) { el("r-budget").textContent = ""; return; }
    const txDbm = 10 * Math.log10(tx * 1000), fspl = A.fsplDb(km, f), rx = A.receivedDbm(txDbm, gt, gr, km, f, loss), floor = A.noiseFloorDbm(bw * 1000, nf), snr = rx - floor;
    el("r-budget").innerHTML = `Path loss <em class="p">${fspl.toFixed(1)} dB</em> · received <em class="b">${rx.toFixed(1)} dBm</em> (${fmtW(rx)})` +
      ` · noise floor <em style="color:var(--red)">${floor.toFixed(1)} dBm</em> · SNR <em class="y">${snr.toFixed(1)} dB</em>` +
      ` · in free space the SNR would fall to 0 dB at <b>${fmtM(km * 1000 * 10 ** (snr / 20))}</b>`;
  };
  controls(s, ids, update);
  el("lb-p").addEventListener("input", () => { P[(el("lb-p") as HTMLSelectElement).value].forEach((v, i) => ((el(ids[i]) as HTMLInputElement).value = String(v))); update(); s.redraw(); });
}

// --- 4. The first Fresnel zone over a path, with an obstacle in the middle ----------------------------------------------
{
  const s = new Scene(el("s-fresnel"), (g, w, h) => {
    const km = 10 ** val("fz-d"), f = 10 ** val("fz-f"), r = A.fresnelM(km / 2, km / 2, f), into = val("fz-o");
    const L = 40, R = w - 40, mid = h * 0.42, ry = Math.min(h * 0.3, 80);
    line(g, L, mid, L, h - 24, C.muted, 3); line(g, R, mid, R, h - 24, C.muted, 3); // two masts
    line(g, 10, h - 24, w - 10, h - 24, C.axis, 1);
    g.fillStyle = "rgba(88,196,221,0.12)"; g.strokeStyle = C.blue; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse((L + R) / 2, mid, (R - L) / 2, ry, 0, 0, TAU); g.fill(); g.stroke();
    line(g, L, mid, R, mid, C.yellow, 1.5, [6, 5]);
    const top = mid + ry - into * ry, cx = (L + R) / 2, ow = Math.max(24, (R - L) * 0.08); // the obstacle reaches `into` of the way up to the sight line
    g.fillStyle = into > 0.4 ? "rgba(252,98,85,0.6)" : "rgba(131,193,103,0.5)"; g.fillRect(cx - ow / 2, top, ow, h - 24 - top);
    label(g, "line of sight", R - 6, mid - 6, C.yellow, "right", 11);
    label(g, `Fresnel zone: ${fmtM(r)} radius (heights stretched)`, w / 2, 16, C.blue, "center", 11);
  }, 240, { animated: false, label: "The first Fresnel zone, an ellipse around the line of sight between two masts, and an obstacle reaching into it" });
  controls(s, ["fz-d", "fz-f", "fz-o"], () => {
    const km = 10 ** val("fz-d"), f = 10 ** val("fz-f"), r = A.fresnelM(km / 2, km / 2, f), into = val("fz-o"), clear = 1 - into;
    el("fz-do").textContent = `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`; el("fz-fo").textContent = fmtMHz(f); el("fz-oo").textContent = `${Math.round(into * 100)}% into the zone`;
    el("r-fresnel").innerHTML = `Zone radius at the middle: <em class="b">${fmtM(r)}</em> · clear: <em class="${clear >= 0.6 ? "g" : "p"}">${Math.round(clear * 100)}%</em> of it ${clear >= 0.6 ? "(the 60% rule is met)" : "(less than 60%: expect extra loss)"}`;
  });
}

// --- 5. Polarization: a linear or circular wave on a tilted linear antenna -----------------------------------------------
{
  const circ = () => (el("po-c") as HTMLInputElement).checked;
  const s = new Scene(el("s-pol"), (g, w, h, t) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36, a = (val("po-a") * Math.PI) / 180;
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    // the wave's electric field: up–down (linear) or turning (circular)
    const fa = circ() ? t * 2.5 : Math.PI / 2, amp = circ() ? 1 : Math.sin(t * 5);
    line(g, cx, cy, cx + R * amp * Math.cos(fa), cy - R * amp * Math.sin(fa), C.yellow, 3);
    // your antenna, tilted from vertical by the slider
    const ax = Math.sin(a), ay = Math.cos(a);
    line(g, cx - R * 1.05 * ax, cy + R * 1.05 * ay, cx + R * 1.05 * ax, cy - R * 1.05 * ay, C.blue, 5);
    label(g, "yellow: the wave's electric field · blue: your antenna", w / 2, h - 8, C.muted, "center", 11);
  }, 240, { label: "A wave's electric field, linear or rotating, and a tilted receiving antenna" });
  controls(s, ["po-a", "po-c"], () => {
    const deg = val("po-a"), loss = circ() ? A.LINEAR_VS_CIRCULAR_DB : A.polLossDb(deg);
    el("po-ao").textContent = `${deg}° from the wave's`;
    el("r-pol").innerHTML = `Signal lost to polarization: <em class="${loss < 1 ? "g" : "p"}">${loss >= 30 ? "30 dB or more" : loss.toFixed(1) + " dB"}</em>` + (circ() ? " (the same at every angle)" : "");
  });
}

// --- 6. Cut list and trimming ------------------------------------------------------------------------------------------------
{
  const show = (m: number) => `${(m * 100).toFixed(1)} cm <span class="muted">(${(m * 39.37).toFixed(1)} in)</span>`;
  const cut = () => {
    const f = num("cl-f");
    if (!(f > 0)) { el("cut-list").innerHTML = ""; return; }
    const c = A.cutList(f);
    el("cut-list").innerHTML = `<tr><th>Build</th><th>Cut</th><th></th></tr>` +
      `<tr><td>Half-wave dipole, center-fed</td><td>2 legs of</td><td class="num">${show(c.dipoleLeg)}</td></tr>` +
      `<tr><td>Quarter-wave ground plane</td><td>vertical whip</td><td class="num">${show(c.groundPlaneWhip)}</td></tr>` +
      `<tr><td></td><td>3–4 radials, sloped ~45° down, each</td><td class="num">${show(c.groundPlaneRadial)}</td></tr>` +
      `<tr><td>V-dipole for satellites, legs 120° apart</td><td>2 legs of</td><td class="num">${show(c.vDipoleLeg)}</td></tr>` +
      `<tr><td>5/8-wave whip (needs a base coil)</td><td>whip</td><td class="num">${show(c.fiveEighthsWhip)}</td></tr>`;
  };
  el("cl-f").addEventListener("input", cut); cut();
  const trim = () => {
    const l = num("tr-l"), m = num("tr-m"), t = num("tr-t");
    if (!(l > 0 && m > 0 && t > 0)) { el("r-trim").textContent = ""; return; }
    const n = A.trimmed(l, m, t), pct = (100 * (n - l)) / l;
    el("r-trim").innerHTML = `New length: <em class="y">${n.toPrecision(4)}</em> (${pct >= 0 ? "lengthen" : "shorten"} by ${Math.abs(n - l).toPrecision(2)}, ${Math.abs(pct).toFixed(1)}%)`;
  };
  ["tr-l", "tr-m", "tr-t"].forEach((id) => el(id).addEventListener("input", trim)); trim();
}

// --- 9. Dishes: gain and beamwidth from diameter and frequency -----------------------------------------------------------------
{
  const P: Record<string, number[]> = { tv: [0.6, 11700, 60], goes: [1.2, 1694.1, 55], grid: [0.6, 2437, 50], gsm: [1.0, 900, 50], eme: [3, 1296, 55] };
  const ids = ["di-d", "di-f", "di-e"];
  const s = new Scene(el("s-dish"), (g, w, h) => {
    const d = num("di-d"), f = num("di-f");
    if (!(d > 0 && f > 0)) return;
    const bw = Math.min(170, A.dishBeamwidthDeg(d, f)), cx = 70, cy = h / 2, ry = Math.min(h * 0.38, 90);
    g.strokeStyle = C.text; g.lineWidth = 3; g.beginPath(); // the dish, a parabola opening right
    for (let i = -20; i <= 20; i++) { const y = (i / 20) * ry, x = cx - (y * y) / (2.2 * ry); i === -20 ? g.moveTo(x, cy + y) : g.lineTo(x, cy + y); }
    g.stroke();
    line(g, cx - ry * 0.45, cy, cx + ry * 0.5, cy, C.muted, 1, [3, 3]); // to the feed
    g.fillStyle = C.blue; g.fillRect(cx + ry * 0.5 - 4, cy - 4, 8, 8);
    const half = ((bw / 2) * Math.PI) / 180, len = w - cx - 30;
    g.fillStyle = "rgba(244,211,94,0.18)"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + len, cy - len * Math.tan(Math.min(half, 1.4))); g.lineTo(cx + len, cy + len * Math.tan(Math.min(half, 1.4))); g.closePath(); g.fill();
    label(g, `beam ${bw.toFixed(bw < 10 ? 1 : 0)}° wide (half-power)`, cx + len, cy - 8, C.yellow, "right", 12);
  }, 220, { animated: false, label: "A dish with its feed and the width of its beam" });
  const update = () => {
    const d = num("di-d"), f = num("di-f"), e = num("di-e") / 100;
    if (!(d > 0 && f > 0 && e > 0)) { el("r-dish").textContent = ""; return; }
    el("r-dish").innerHTML = `<em class="b">${(d / A.wavelength(f)).toFixed(1)}</em> wavelengths across · gain <em class="y">${A.dishGainDbi(d, f, e).toFixed(1)} dBi</em>` +
      ` · beam <em class="y">${A.dishBeamwidthDeg(d, f).toFixed(1)}°</em> wide · it collects ${(e * Math.PI * (d / 2) ** 2).toFixed(2)} m² of the wave`;
  };
  controls(s, ids, update);
  el("di-p").addEventListener("input", () => { P[(el("di-p") as HTMLSelectElement).value].forEach((v, i) => ((el(ids[i]) as HTMLInputElement).value = String(v))); update(); s.redraw(); });
}
