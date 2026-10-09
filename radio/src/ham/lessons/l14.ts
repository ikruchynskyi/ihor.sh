// Lesson 14: safety. MPE limits by frequency (47 CFR 1.1310), a safe-distance calculator (OET-65), and a GFCI.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

/** Maximum permissible exposure, power density in mW/cm², f in MHz (47 CFR 1.1310 Table 1). */
export const mpe = (f: number, controlled: boolean) => controlled
  ? (f < 3 ? 100 : f < 30 ? 900 / (f * f) : f < 300 ? 1 : f < 1500 ? f / 300 : 5)
  : (f < 1.34 ? 100 : f < 30 ? 180 / (f * f) : f < 300 ? 0.2 : f < 1500 ? f / 1500 : 1);

// --- 1. The MPE curve ------------------------------------------------------------------------------------------------------
{
  const BANDS: [string, number][] = [["160", 1.9], ["80", 3.8], ["40", 7.2], ["20", 14.2], ["10", 28.4], ["6", 50], ["2", 146], ["70cm", 440], ["23cm", 1296], ["13cm", 2400]];
  const s = new Scene(el("s-mpe"), (g, w, h) => {
    const ctl = checked("mp-c"), L = 56, R = w - 16, T = 16, B = h - 30;
    const px = (f: number) => L + (Math.log10(f / 1) / Math.log10(3000)) * (R - L), py = (d: number) => T + ((2 - Math.log10(d)) / 3) * (B - T); // 100 … 0.1 mW/cm²
    for (const d of [100, 10, 1, 0.1]) { line(g, L, py(d), R, py(d), "#1f242d", 1); label(g, `${d}`, L - 4, py(d) + 4, C.muted, "right", 9); }
    for (const f of [1, 10, 100, 1000]) label(g, f >= 1000 ? "1 GHz" : `${f} MHz`, px(f), B + 16, C.muted, "center", 9);
    label(g, "mW/cm²", L - 4, T - 4, C.muted, "right", 9);
    g.fillStyle = "#fc625518"; g.fillRect(px(30), T, px(300) - px(30), B - T); label(g, "most restrictive", (px(30) + px(300)) / 2, T + 12, C.red, "center", 10);
    for (const [ctrl, col] of [[false, C.yellow], [true, C.blue]] as const) {
      g.strokeStyle = ctrl === ctl ? col : col + "44"; g.lineWidth = ctrl === ctl ? 2.5 : 1.5; g.beginPath();
      for (let x = L; x <= R; x++) { const f = 10 ** (((x - L) / (R - L)) * Math.log10(3000)), y = py(Math.min(100, mpe(f, ctrl))); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    for (const [name, f] of BANDS) { const y = py(Math.min(100, mpe(f, ctl))); g.fillStyle = C.white; g.beginPath(); g.arc(px(f), y, 3, 0, TAU); g.fill(); label(g, name, px(f), y - 7, C.text, "center", 9); }
  }, 260, { animated: false, label: "FCC maximum permissible exposure limits against frequency, lowest between 30 and 300 MHz" });
  controls(s, ["mp-c"], () => {
    const ctl = checked("mp-c");
    el("r-mpe").innerHTML = `${ctl ? "Controlled" : "General population (uncontrolled)"} limits: ${mpe(14.2, ctl).toFixed(2)} mW/cm² on 20 m, <em class="${ctl ? "b" : "y"}">${mpe(50, ctl).toFixed(1)} mW/cm²</em> on 6 and 2 m, ${mpe(440, ctl).toFixed(2)} on 70 cm. Averaged over ${ctl ? "6" : "30"} minutes.`;
  });
}

// --- 2. Safe distance ------------------------------------------------------------------------------------------------------------
{
  const calc = () => {
    const p = val("ds-p"), gdb = val("ds-g"), f = Number(sel("ds-f")), duty = Number(sel("ds-m")), on = val("ds-t");
    const eirp = p * 1000 * 10 ** (gdb / 10) * duty * on; // average mW
    const dist = (ctl: boolean) => Math.sqrt((2.56 * eirp) / (4 * Math.PI * mpe(f, ctl))) / 100; // m (OET-65 with ground reflection)
    return { eirp, dc: dist(true), du: dist(false) };
  };
  const s = new Scene(el("s-dist"), (g, w, h) => {
    const { dc, du } = calc(), L = 40, cy = h / 2 + 10, maxM = Math.max(du * 1.25, 5), k = (w - L - 20) / maxM;
    g.fillStyle = "#fc625522"; g.beginPath(); g.arc(L, cy, du * k, -Math.PI / 2, Math.PI / 2); g.fill();
    g.fillStyle = "#58c4dd33"; g.beginPath(); g.arc(L, cy, dc * k, -Math.PI / 2, Math.PI / 2); g.fill();
    line(g, L, cy - 60, L, cy + 60, C.text, 3); label(g, "antenna", L, cy + 76, C.muted, "center", 10);
    line(g, L, cy, L + du * k, cy, C.red, 1.5, [4, 3]); label(g, `general public: ${du.toFixed(1)} m (${(du * 3.28).toFixed(0)} ft)`, L + du * k + 6, cy - 4, C.red, du * k > w - 200 ? "right" : "left", 11);
    line(g, L, cy + 20, L + dc * k, cy + 20, C.blue, 1.5, [4, 3]); label(g, `controlled: ${dc.toFixed(1)} m`, L + dc * k + 6, cy + 24, C.blue, "left", 11);
    // a 1.8 m person at the uncontrolled boundary, for scale
    const ph = 1.8 * k; if (ph > 4 && ph < h - 30) { const x = L + du * k; g.fillStyle = C.muted; g.fillRect(x - ph * 0.06, cy + 40 - ph * 0.86, ph * 0.12, ph * 0.86); }
    for (let m = 0; m <= maxM; m += maxM > 20 ? 5 : 1) label(g, `${m}`, L + m * k, h - 6, C.muted, "center", 9);
  }, 220, { animated: false, label: "Minimum distances from the antenna for controlled and general-population exposure limits" });
  controls(s, ["ds-p", "ds-g", "ds-f", "ds-m", "ds-t"], () => {
    const { eirp, dc, du } = calc();
    el("ds-po").textContent = `${val("ds-p")} W`; el("ds-go").textContent = `${val("ds-g")} dBi`; el("ds-to").textContent = `${Math.round(val("ds-t") * 100)}% of the time`;
    el("r-dist").innerHTML = `Average EIRP ${(eirp / 1000).toFixed(1)} W. Keep the public at least <em style="color:var(--red)">${du.toFixed(1)} m</em> away, yourself at least <em class="b">${dc.toFixed(1)} m</em>.`;
  });
}

// --- 3. GFCI ---------------------------------------------------------------------------------------------------------------------
{
  const LOAD = 5000, TRIP = 5; // mA load current; trip threshold (US Class A GFCIs trip around 4–6 mA)
  const s = new Scene(el("s-gfci"), (g, w, h, t) => {
    const leak = val("gf-l"), tripped = leak >= TRIP, hot = tripped ? 0 : LOAD + leak, neu = tripped ? 0 : LOAD;
    const L = 40, R = w - 120, yh = 50, yn = 110, flow = tripped ? 0 : t * 60;
    g.fillStyle = tripped ? "#fc625544" : "#83c16733"; g.fillRect(L, 30, 70, 100); label(g, tripped ? "TRIPPED" : "GFCI", L + 35, 84, tripped ? C.red : C.green, "center", 12);
    line(g, L + 70, yh, R, yh, C.text, 3); line(g, L + 70, yn, R, yn, "#d7dde5aa", 3);
    label(g, `hot (black): ${(hot / 1000).toFixed(3)} A`, L + 80, yh - 8, C.text, "left", 11); label(g, `neutral (white): ${(neu / 1000).toFixed(3)} A`, L + 80, yn + 18, C.muted, "left", 11);
    g.fillStyle = "#2a2f3a"; g.fillRect(R, 30, 80, 100); label(g, "radio", R + 40, 84, C.text, "center", 11);
    if (!tripped) for (let x = L + 80 + (flow % 24); x < R; x += 24) { g.fillStyle = C.yellow; g.beginPath(); g.arc(x, yh, 3, 0, TAU); g.fill(); g.beginPath(); g.arc(R - (x - L - 80), yn, 3, 0, TAU); g.fill(); }
    if (leak > 0) {
      const px = R + 40, py = 160; line(g, px, 130, px, py, C.red, 2, [3, 3]);
      g.fillStyle = C.pink; g.beginPath(); g.arc(px, py + 10, 8, 0, TAU); g.fill(); g.fillRect(px - 6, py + 18, 12, 30);
      label(g, `${leak} mA through a person to ground`, px - 14, py + 40, C.red, "right", 11);
    }
  }, 230, { label: "A ground fault circuit interrupter comparing hot and neutral current and cutting power when some leaks to ground" });
  controls(s, ["gf-l"], () => {
    const leak = val("gf-l");
    el("gf-lo").textContent = `${leak} mA`;
    el("r-gfci").innerHTML = leak === 0 ? "All the current that goes out on the hot wire comes back on the neutral: nothing leaks." : leak < TRIP ? `A ${leak} mA difference: below the ~5 mA trip point (and barely perceptible).` : `<em style="color:var(--red)">Tripped</em>: ${leak} mA wasn't coming back on the neutral, so the GFCI cut the power within about 1/40 of a second.`;
  });
}
