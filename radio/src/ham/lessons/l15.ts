// Lesson 15: the station. Voltage drop in power leads, receiver noise tools, an oscilloscope, and interference fingerprints.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import { heat } from "../../waterfall.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

// --- 1. Voltage drop -----------------------------------------------------------------------------------------------------------
{
  const MOHM_PER_FT: Record<string, number> = { "18": 6.385, "14": 2.525, "12": 1.588, "10": 0.999, "8": 0.628 }; // copper at 20 °C
  const calc = () => { const r = (MOHM_PER_FT[sel("dr-g")] / 1000) * 2 * val("dr-l"), drop = val("dr-i") * r; return { r, drop, v: 13.8 - drop }; };
  const s = new Scene(el("s-drop"), (g, w, h) => {
    const { v } = calc(), L = 60, R = w - 120, y = h / 2;
    g.fillStyle = "#2a2f3a"; g.fillRect(10, y - 30, 70, 60); label(g, "13.8 V", 45, y + 4, C.green, "center", 12); label(g, "supply", 45, y + 46, C.muted, "center", 10);
    g.fillStyle = "#2a2f3a"; g.fillRect(R + 30, y - 30, 80, 60); label(g, `${v.toFixed(2)} V`, R + 70, y + 4, v >= 12.4 ? C.green : C.red, "center", 12); label(g, "radio", R + 70, y + 46, C.muted, "center", 10);
    const grad = g.createLinearGradient(L + 20, 0, R + 30, 0); grad.addColorStop(0, C.green); grad.addColorStop(1, v >= 12.4 ? C.yellow : C.red);
    g.strokeStyle = grad; g.lineWidth = Math.max(2, 12 - Number(sel("dr-g")) / 2 + 2); g.beginPath(); g.moveTo(80, y - 12); g.lineTo(R + 30, y - 12); g.moveTo(80, y + 12); g.lineTo(R + 30, y + 12); g.stroke();
    label(g, `${val("dr-l")} ft each way, ${val("dr-i")} A`, (L + R) / 2 + 20, y - 24, C.muted, "center", 11);
  }, 150, { animated: false, label: "A power supply feeding a radio through wires; the voltage at the radio drops with thinner, longer wires and more current" });
  controls(s, ["dr-g", "dr-l", "dr-i"], () => {
    const { r, drop, v } = calc();
    el("dr-lo").textContent = `${val("dr-l")} ft`; el("dr-io").textContent = `${val("dr-i")} A`;
    el("r-drop").innerHTML = `Round-trip resistance ${(r * 1000).toFixed(1)} mΩ × ${val("dr-i")} A = <em class="${v >= 12.4 ? "g" : "p"}">${drop.toFixed(2)} V lost</em>, ${(drop * val("dr-i")).toFixed(1)} W heating the wire. ${v >= 12.4 ? "Fine." : "Too much: most rigs want 13.8 V ± 10%."}`;
  });
}

// --- 2. Notch, noise blanker, noise reduction ---------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-rx"), (g, w, h, t) => {
    const notch = checked("rx-n"), nb = checked("rx-b"), nr = val("rx-r");
    const L = 40, R = w - 16, T = 16, B = h * 0.6, px = (f: number) => L + (f / 3000) * (R - L), py = (d: number) => B - ((d + 80) / 80) * (B - T);
    for (const d of [0, -20, -40, -60, -80]) { line(g, L, py(d), R, py(d), "#1f242d", 1); label(g, `${d}`, L - 4, py(d) + 4, C.muted, "right", 9); }
    for (const f of [0, 1000, 2000, 3000]) label(g, `${f} Hz`, px(f), B + 14, C.muted, "center", 9);
    const floor = (nb ? -62 : -42) - nr * 14;
    let seed = Math.floor(t * 6) + 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = C.yellow; g.lineWidth = 1.8; g.beginPath();
    for (let x = L; x <= R; x++) {
      const f = ((x - L) / (R - L)) * 3000, voice = f > 300 && f < 2700 ? -14 - 10 * Math.abs(f - 900) / 1800 : -90;
      const jag = nr * nr * 18 * (rnd() - 0.5) * (f > 300 && f < 2700 ? 1 : 0); // heavy NR makes the voice ragged
      let d = 10 * Math.log10(10 ** ((voice + jag) / 10) + 10 ** ((floor + 4 * (rnd() - 0.5)) / 10));
      if (Math.abs(f - 1600) < 25) d = Math.max(d, notch ? d : -6); // the carrier
      if (notch && Math.abs(f - 1600) < 60) d = Math.min(d, -70 + 30 * (Math.abs(f - 1600) / 60) ** 2 - 10);
      x === L ? g.moveTo(x, py(d)) : g.lineTo(x, py(d));
    }
    g.stroke();
    label(g, "audio passband", L + 4, T + 4, C.muted, "left", 10); if (!notch) label(g, "carrier", px(1600), py(-6) - 6, C.red, "center", 10);
    // the noise pulses over time
    const y0 = h * 0.72, y1 = h - 8;
    label(g, "impulse noise over time", L, y0 - 4, C.muted, "left", 10);
    for (let k = 0; k < 24; k++) { const x = L + ((k * 37 + t * 60) % (R - L)), hh = nb ? 3 : (y1 - y0) * 0.9; line(g, x, y1, x, y1 - hh, nb ? C.muted : C.red, 2); }
  }, 260, { label: "A receiver's audio spectrum with an SSB voice, an interfering carrier and impulse noise; notch, noise blanker and noise reduction remove them" });
  controls(s, ["rx-n", "rx-b", "rx-r"], () => {
    const notch = checked("rx-n"), nb = checked("rx-b"), nr = val("rx-r");
    el("rx-ro").textContent = nr ? `${Math.round(nr * 100)}%` : "off";
    el("r-rx").innerHTML = [notch ? "The notch has removed the carrier." : "The steady carrier whistles at 1.6 kHz.", nb ? "The noise blanker silences each click." : "Clicks raise the noise floor.", nr > 0.6 ? "<em class='p'>Noise reduction this high is distorting the voice.</em>" : nr > 0 ? "Some noise reduction lowers the hiss." : ""].join(" ");
  });
}

// --- 3. The oscilloscope ------------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-scope"), (g, w, h) => {
    const m = sel("sc-m"), k = val("sc-k"), W = Math.min(w - 20, 560), H = h - 20, X0 = (w - W) / 2, Y0 = 10, cy = Y0 + H / 2;
    g.fillStyle = "#0b1a10"; g.fillRect(X0, Y0, W, H);
    for (let i = 0; i <= 10; i++) line(g, X0 + (i * W) / 10, Y0, X0 + (i * W) / 10, Y0 + H, "#1c3324", 1);
    for (let i = 0; i <= 8; i++) line(g, X0, Y0 + (i * H) / 8, X0 + W, Y0 + (i * H) / 8, "#1c3324", 1);
    const A = H * 0.38, trace = "#7dff9b";
    const env = (u: number): number => { // u = 0…1 across the screen
      if (m === "cw" || m === "click") { const rise = m === "cw" ? 0.04 : 0.001, on = u > 0.15 && u < 0.75; const a = Math.min(1, Math.max(0, (u - 0.15) / rise)), b = Math.min(1, Math.max(0, (0.75 - u) / rise)); return on ? Math.min(0.5 - 0.5 * Math.cos(Math.PI * a), 0.5 - 0.5 * Math.cos(Math.PI * b)) : 0; }
      if (m === "two" || m === "flat") { const e = Math.abs(Math.cos(Math.PI * 3 * u)); return m === "flat" ? Math.min(e, 0.7) / 0.7 : e; }
      return 0;
    };
    g.strokeStyle = trace; g.lineWidth = 1.5;
    if (m === "ripple") { g.beginPath(); for (let x = 0; x <= W; x++) { const u = x / W, saw = ((u * 6) % 1), y = cy - A * 0.6 + (saw < 0.85 ? saw / 0.85 : (1 - saw) / 0.15) * 14; x ? g.lineTo(X0 + x, y) : g.moveTo(X0 + x, y); } g.stroke(); }
    else if (m === "probe") {
      g.beginPath(); for (let x = 0; x <= W; x++) { const u = x / W, ph = (u * 4) % 1, hi = ph < 0.5, since = hi ? ph : ph - 0.5, edge = k * Math.exp(-since * 30); const y = cy - (hi ? 1 : -1) * A * 0.7 * (1 + edge * 0.5) ; x ? g.lineTo(X0 + x, y) : g.moveTo(X0 + x, y); } g.stroke();
    } else {
      // RF: draw the fast carrier as dense vertical strokes filling the envelope
      g.beginPath(); for (let x = 0; x <= W; x += 2) { const e = env(x / W); g.moveTo(X0 + x, cy - A * e); g.lineTo(X0 + x, cy + A * e); } g.globalAlpha = 0.45; g.stroke(); g.globalAlpha = 1;
      g.beginPath(); for (let x = 0; x <= W; x++) { const y = cy - A * env(x / W); x ? g.lineTo(X0 + x, y) : g.moveTo(X0 + x, y); } g.stroke();
      g.beginPath(); for (let x = 0; x <= W; x++) { const y = cy + A * env(x / W); x ? g.lineTo(X0 + x, y) : g.moveTo(X0 + x, y); } g.stroke();
    }
  }, 240, { animated: false, label: "An oscilloscope screen showing CW keying, a two-tone test envelope, power supply ripple or a probe compensation square wave" });
  controls(s, ["sc-m", "sc-k"], () => {
    const m = sel("sc-m"), k = val("sc-k");
    el("sc-ko").textContent = m === "probe" ? (Math.abs(k) < 0.05 ? "correct" : k > 0 ? "over-compensated" : "under-compensated") : "(probe mode only)";
    const msg: Record<string, string> = {
      cw: "Gentle rise and fall: a clean, narrow CW signal.", click: "<em class='p'>Square corners</em>: these sharp edges make key clicks across the band.",
      two: "Two equal tones: smooth humps that touch zero. The transmitter is linear.", flat: "<em class='p'>Flat tops</em>: the amplifier is overdriven (flat-topping); the spectrum analyzer would show intermod products.",
      ripple: "Triggered on the AC line: a DC level with a 120 Hz sawtooth ripple from a full-wave supply (lesson 5).",
      probe: Math.abs(k) < 0.05 ? "Flat tops: the probe is compensated." : k > 0 ? "Spikes at each edge: over-compensated. Turn the probe's trimmer back." : "Rounded corners: under-compensated.",
    };
    el("r-scope").innerHTML = msg[m];
  });
}

// --- 4. Interference fingerprints on a waterfall -------------------------------------------------------------------------------------
{
  const COLS = 360, ROWS = 120;
  const make = (src: string) => {
    let seed = 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const img = new Float32Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let v = 0.12 + 0.08 * rnd();
      if (Math.abs(c - 70) < 1 && (r % 14) < 9) v = 0.9; // a CW station keying away
      if (c > 230 && c < 255 && (r % 40) < 28) v = Math.max(v, 0.45 + 0.2 * rnd()); // an SSB conversation
      if (src === "smps") { const drift = Math.sin(r / 30) * 2; if (Math.abs(((c + drift) % 36) - 18) < 0.8) v = Math.max(v, 0.75); }
      if (src === "arc" && (r % 23 < 2 || (r * 7) % 31 < 1)) v = Math.max(v, 0.55 + 0.3 * rnd());
      if (src === "net") for (const [c0, a, sp] of [[120, 6, 9], [160, 10, 5], [300, 4, 13]]) if (Math.abs(c - (c0 + a * Math.sin(r / sp))) < 1.2) v = Math.max(v, 0.7);
      if (src === "motor") v = Math.max(v, 0.18 + 0.35 * Math.max(0, Math.sin((r / ROWS) * TAU * 6)) ** 4 * (0.6 + 0.4 * rnd()));
      img[r * COLS + c] = v;
    }
    return img;
  };
  const cache = new Map<string, Float32Array>();
  const s = new Scene(el("s-noise"), (g, w, h) => {
    const src = sel("ns-s"); if (!cache.has(src)) cache.set(src, make(src));
    const data = cache.get(src)!, id = g.createImageData(COLS, ROWS);
    for (let i = 0; i < data.length; i++) { const [r, gg, b] = heat(data[i]); id.data.set([r, gg, b, 255], i * 4); }
    const off = document.createElement("canvas"); off.width = COLS; off.height = ROWS; off.getContext("2d")!.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(off, 10, 10, w - 20, h - 36);
    label(g, "frequency →", w - 12, h - 8, C.muted, "right", 10); label(g, "time ↓", 12, h - 8, C.muted, "left", 10);
  }, 260, { animated: false, label: "A simulated waterfall with a CW station, an SSB conversation and the pattern of a chosen interference source" });
  controls(s, ["ns-s"], () => {
    const msg: Record<string, string> = {
      smps: "A <em class='y'>comb of carriers</em> at regular spacing, drifting slightly together: a switch-mode power supply (chargers, LED drivers). Find it by switching breakers or with a portable radio; cure with ferrite chokes or replacement.",
      arc: "<em class='y'>Broadband bursts</em> across everything: arcing at a poor electrical connection or a power-line fault.",
      net: "<em class='y'>Unstable carriers</em> wandering at specific frequencies: computer or network equipment.",
      motor: "<em class='y'>Rhythmic roaring</em> rising and falling with the AC line: motors, dimmers, line noise. A brute-force AC line filter at the motor helps.",
    };
    el("r-noise").innerHTML = msg[sel("ns-s")] + " (Simulated; the CW and SSB signals are there for scale.)";
  });
}
