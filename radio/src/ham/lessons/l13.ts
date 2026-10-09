// Lesson 13: operating. A repeater you have to configure, phonetics, a satellite pass with Doppler, grid squares.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

// --- 1. The repeater ---------------------------------------------------------------------------------------------------------
{
  const OUT = 146.94, IN = 146.34;
  const state = () => {
    const off = Number(sel("rp-o")), tone = checked("rp-t"), rev = checked("rp-r");
    const tx = rev ? OUT : OUT + off, rx = rev ? OUT + off : OUT;
    const opens = Math.abs(tx - IN) < 1e-6 && tone;
    return { tx, rx, tone, rev, opens };
  };
  const s = new Scene(el("s-rpt"), (g, w, h, t) => {
    const st = state(), gy = h - 30;
    g.fillStyle = "#1f2c22"; g.beginPath(); g.moveTo(0, gy); g.quadraticCurveTo(w / 2, gy - 120, w, gy); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    const you = [60, gy - 20], rpt = [w / 2, gy - 60], other = [w - 60, gy - 20];
    // the people and the repeater
    g.fillStyle = C.text; g.fillRect(you[0] - 6, you[1] - 14, 12, 26); line(g, you[0], you[1] - 14, you[0], you[1] - 34, C.text, 2); label(g, "you", you[0], gy + 18, C.muted, "center", 10);
    g.fillRect(other[0] - 6, other[1] - 14, 12, 26); line(g, other[0], other[1] - 14, other[0], other[1] - 34, C.text, 2); label(g, "a friend across town", other[0], gy + 18, C.muted, "center", 10);
    line(g, rpt[0], rpt[1], rpt[0], rpt[1] - 50, C.text, 3); label(g, `repeater: in ${IN.toFixed(3)}, out ${OUT.toFixed(3)}, tone 100.0`, rpt[0], rpt[1] - 60, C.muted, "center", 10);
    // your transmission
    const ph = (t * 1.2) % 1;
    for (let k = 0; k < 3; k++) { const r = ((ph + k / 3) % 1) * 160; g.strokeStyle = `rgba(244, 211, 94, ${1 - r / 160})`; g.lineWidth = 2; g.beginPath(); g.arc(you[0], you[1] - 34, r, -1.1, 0.1); g.stroke(); }
    label(g, `you transmit ${st.tx.toFixed(3)}${st.tone ? " + tone" : ""}`, you[0] + 20, you[1] - 60, C.yellow, "left", 10);
    // the repeater relays only if you hit its input with the tone
    if (st.opens) {
      for (let k = 0; k < 3; k++) { const r = ((ph + k / 3) % 1) * 220; g.strokeStyle = `rgba(131, 193, 103, ${1 - r / 220})`; g.lineWidth = 2; g.beginPath(); g.arc(rpt[0], rpt[1] - 50, r, 0, Math.PI); g.stroke(); }
      label(g, `relayed on ${OUT.toFixed(3)}`, other[0] - 20, other[1] - 70, C.green, "right", 10);
    } else label(g, "repeater stays silent", rpt[0], rpt[1] + 24, C.red, "center", 11);
  }, 230, { label: "A handheld transmitting to a hilltop repeater, which relays the signal only on the right input frequency with the right tone" });
  controls(s, ["rp-o", "rp-t", "rp-r"], () => {
    const st = state();
    el("r-rpt").innerHTML = st.opens ? `<em class="g">You're in.</em> You transmit on the input (${IN.toFixed(3)}) with the tone, and listen on the output (${OUT.toFixed(3)}).`
      : st.rev ? `Reverse: you're now <em>listening on the input</em>, ${st.rx.toFixed(3)} MHz. If you can hear your friend there directly, try simplex.`
      : Math.abs(st.tx - IN) > 1e-6 ? `You transmit on ${st.tx.toFixed(3)} MHz, but the repeater listens on ${IN.toFixed(3)}: <em style="color:var(--red)">wrong offset</em>.`
      : `Right frequency, but <em style="color:var(--red)">no CTCSS tone</em>: the repeater's squelch stays closed.`;
  });
}

// --- 2. Phonetics -------------------------------------------------------------------------------------------------------------
{
  const NATO: Record<string, string> = { A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu", "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine", "/": "Stroke" };
  const inp = el("ph-in") as HTMLInputElement;
  const upd = () => { const words = [...inp.value.toUpperCase()].map((c) => NATO[c]).filter(Boolean); el("ph-out").textContent = words.join(" · ") || "Type letters or digits"; };
  inp.addEventListener("input", upd); upd();
}

// --- 3. A satellite pass with Doppler --------------------------------------------------------------------------------------------
{
  const H = 500, V = 7.6, F = 435e6, CK = 3e5; // km altitude, km/s, downlink Hz, km/s (flat-Earth sketch, fine for intuition)
  const passT = (el: number) => { const d = H / Math.tan((el * Math.PI) / 180); return Math.sqrt(Math.max(0, (H / Math.tan((10 * Math.PI) / 180)) ** 2 - d * d)) / V; };
  /** Doppler shift in kHz at time tt (s, 0 = closest approach) for a pass peaking at maxEl degrees. */
  const doppler = (maxEl: number, tt: number) => { const d = H / Math.tan((maxEl * Math.PI) / 180), y = V * tt, vr = (V * y) / Math.hypot(H, d, y); return (-F * vr) / CK / 1000; };
  const s = new Scene(el("s-sat"), (g, w, h, t) => {
    const maxEl = val("sa-e"), d = H / Math.tan((maxEl * Math.PI) / 180), T = passT(maxEl);
    const cx = Math.min(w * 0.28, 160), cy = h / 2, R = Math.min(cx - 20, h / 2 - 20);
    // the sky: horizon and elevation rings, north up
    for (const e of [0, 30, 60]) { g.strokeStyle = "#2a2f3a"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * (1 - e / 90), 0, TAU); g.stroke(); }
    label(g, "N", cx, cy - R - 6, C.muted, "center", 10); label(g, "S", cx, cy + R + 14, C.muted, "center", 10); label(g, "E", cx + R + 8, cy + 4, C.muted, "center", 10); label(g, "W", cx - R - 8, cy + 4, C.muted, "center", 10);
    const pos = (tt: number) => { const y = V * tt, ground = Math.hypot(d, y), elv = Math.atan2(H, ground), az = Math.atan2(d, y); const r = R * (1 - (elv * 180) / Math.PI / 90); return [cx + r * Math.sin(az), cy - r * Math.cos(az)] as const; };
    g.strokeStyle = C.blue; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); for (let tt = -T; tt <= T; tt += T / 50) { const [x, y] = pos(tt); tt === -T ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.setLineDash([]);
    const now = ((t * (T / 5)) % (2 * T)) - T; // the pass, sped up
    const [sx, sy] = pos(now); g.fillStyle = C.yellow; g.beginPath(); g.arc(sx, sy, 6, 0, TAU); g.fill();
    // Doppler over the pass
    const L = cx + R + 50, Rr = w - 16, T0 = 20, B = h - 30, dop = (tt: number) => doppler(maxEl, tt);
    const px = (tt: number) => L + ((tt + T) / (2 * T)) * (Rr - L), py = (k: number) => (T0 + B) / 2 - (k / 12) * ((B - T0) / 2);
    if (Rr - L > 60) {
      line(g, L, py(0), Rr, py(0), C.axis, 1); label(g, "+12 kHz", L - 4, py(12) + 4, C.muted, "right", 9); label(g, "−12", L - 4, py(-12) + 4, C.muted, "right", 9);
      g.strokeStyle = C.pink; g.lineWidth = 2.5; g.beginPath(); for (let x = L; x <= Rr; x++) { const tt = -T + ((x - L) / (Rr - L)) * 2 * T; x === L ? g.moveTo(x, py(dop(tt))) : g.lineTo(x, py(dop(tt))); } g.stroke();
      g.fillStyle = C.yellow; g.beginPath(); g.arc(px(now), py(dop(now)), 5, 0, TAU); g.fill();
      label(g, "Doppler shift on 435 MHz during the pass", L, 12, C.muted, "left", 10); label(g, `${(2 * T / 60).toFixed(0)} minutes`, Rr, B + 16, C.muted, "right", 9);
    }
  }, 260, { label: "A satellite crossing the sky from south to north, with its Doppler shift falling from positive to negative" });
  controls(s, ["sa-e"], () => {
    const e = val("sa-e"), T = passT(e);
    el("sa-eo").textContent = `${e}°`;
    el("r-sat").innerHTML = `A pass peaking at ${e}° lasts about <em class="y">${(2 * T / 60).toFixed(0)} minutes</em> above 10°. The 435 MHz downlink starts about ${doppler(e, -T).toFixed(0)} kHz high and ends as far low: retune as it passes, or let the tracking software do it.`;
  });
}

// --- 4. Grid squares ---------------------------------------------------------------------------------------------------------------
{
  const A = "ABCDEFGHIJKLMNOPQR", a = "abcdefghijklmnopqrstuvwx";
  const grid = (lat: number, lon: number) => {
    const x = lon + 180, y = lat + 90;
    return A[Math.floor(x / 20)] + A[Math.floor(y / 10)] + Math.floor((x % 20) / 2) + Math.floor(y % 10) + a[Math.floor((x % 2) * 12)] + a[Math.floor((y % 1) * 24)];
  };
  const upd = () => {
    const lat = Number((el("gr-lat") as HTMLInputElement).value), lon = Number((el("gr-lon") as HTMLInputElement).value);
    el("gr-out").innerHTML = Math.abs(lat) < 90 && Math.abs(lon) < 180 ? `Grid locator <b>${grid(lat, lon)}</b>: field ${grid(lat, lon).slice(0, 2)} (20° × 10°), square ${grid(lat, lon).slice(0, 4)} (2° × 1°), subsquare ${grid(lat, lon)} (5′ × 2.5′). Contests and FT8 use the first four characters.` : "Latitude −90…90, longitude −180…180.";
  };
  ["gr-lat", "gr-lon"].forEach((id) => el(id).addEventListener("input", upd)); upd();
}
