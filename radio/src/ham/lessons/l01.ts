// Lesson 1: volts, amps and ohms. Electrons in a wire, Ohm's law two ways, power as area, series/parallel, AC, meters.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";
import { battery, charges, lamp, meter, resistor, wire, type Pt } from "../circuit.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const fmt = (x: number, d = 2) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));

// --- 1. Electrons in a wire ---------------------------------------------------------------------------------------------
{
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 70, ex = Array.from({ length: N }, rnd), ey = Array.from({ length: N }, rnd), home = ex.map((x, i) => [x, ey[i]]);
  let lastT = 0;
  const s = new Scene(el("s-wire"), (g, w, h, t) => {
    const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
    const v = val("w-v"), glass = checked("w-glass");
    const L = 30, R = w - 30, T = 40, B = h - 40;
    g.fillStyle = glass ? "#1d2a2e" : "#2a2218"; g.fillRect(L, T, R - L, B - T);
    label(g, glass ? "glass" : "copper", L, T - 10, C.muted);
    // atoms on a grid
    for (let x = L + 20; x < R; x += 40) for (let y = T + 20; y < B; y += 40) { g.fillStyle = "#3a4252"; g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.fill(); }
    const drift = glass ? 0 : v * 0.012;
    for (let i = 0; i < N; i++) {
      if (glass) { // bound: wiggle around a fixed home atom
        const hx = L + 20 + Math.round(home[i][0] * ((R - L - 40) / 40)) * 40, hy = T + 20 + Math.round(home[i][1] * ((B - T - 40) / 40)) * 40;
        const a = t * 9 + i * 1.7;
        g.fillStyle = C.blue; g.beginPath(); g.arc(hx + 13 * Math.cos(a), hy + 13 * Math.sin(a * 1.3), 3, 0, 2 * Math.PI); g.fill();
        continue;
      }
      ex[i] += drift * dt * 10 + (rnd() - 0.5) * 0.01; ey[i] += (rnd() - 0.5) * 0.02;
      ex[i] = ((ex[i] % 1) + 1) % 1; ey[i] = Math.min(1, Math.max(0, ey[i]));
      g.fillStyle = C.blue; g.beginPath(); g.arc(L + ex[i] * (R - L), T + 6 + ey[i] * (B - T - 12), 3, 0, 2 * Math.PI); g.fill();
    }
    // battery terminals at the ends
    label(g, "−", L - 14, (T + B) / 2 + 5, C.text, "center", 16); label(g, "+", R + 14, (T + B) / 2 + 5, C.red, "center", 16);
    if (v > 0 && !glass) { line(g, w / 2 - 60, B + 22, w / 2 + 60, B + 22, C.blue, 2); g.fillStyle = C.blue; g.beginPath(); g.moveTo(w / 2 + 66, B + 22); g.lineTo(w / 2 + 56, B + 17); g.lineTo(w / 2 + 56, B + 27); g.fill(); label(g, "electrons drift", w / 2, B + 38, C.blue, "center", 11); }
  }, 220, { label: "Free electrons in a copper wire drifting when a voltage is applied; electrons in glass stay bound" });
  controls(s, ["w-v", "w-glass"], () => {
    const v = val("w-v"), glass = checked("w-glass");
    el("w-vo").textContent = `${v} V`;
    el("r-wire").innerHTML = glass ? `Glass: the electrons are bound to their atoms. <em class="y">No current</em>, whatever the push: an insulator.`
      : v ? `Copper with ${v} V across it: the free electrons drift towards +. That drift is a <em class="b">current</em>.` : `No push: the free electrons jiggle randomly, with no overall flow. <em>No current.</em>`;
  });
}

// --- 2. Ohm's law: a circuit and its water twin ---------------------------------------------------------------------------
{
  let flow = 0, lastT = 0;
  const s = new Scene(el("s-ohm"), (g, w, h, t) => {
    const v = val("o-v"), r = val("o-r"), i = v / r, dt = Math.max(0, t - lastT); lastT = t;
    flow += i * dt * 30;
    // circuit on the left half
    const half = w < 560 ? w : w / 2, x0 = 70, x1 = half - 40, y0 = 40, y1 = h - 40;
    const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
    wire(g, loop); charges(g, loop, -flow); // electrons go from − round to +
    battery(g, x0, (y0 + y1) / 2, `${v} V`);
    resistor(g, [x1, y0 + 30], [x1, y1 - 30], C.yellow, `${r} Ω`);
    meter(g, (x0 + x1) / 2, y1, "A", `${fmt(i)} A`);
    if (w < 560) return;
    // water on the right half: tank height = voltage, pipe narrowness = resistance, stream = current
    const tx = w / 2 + 30, tw = 90, tb = h - 50, th = (v / 24) * (h - 100);
    g.strokeStyle = C.axis; g.lineWidth = 2; g.strokeRect(tx, 40, tw, tb - 40);
    g.fillStyle = "#1a8fb066"; g.fillRect(tx + 1, tb - th, tw - 2, th);
    label(g, "height = voltage", tx + tw / 2, 32, C.muted, "center", 11);
    const pw = Math.max(3, 24 * Math.sqrt(2 / r)), py = tb - 8, px1 = w - 60;
    g.fillStyle = C.axis; g.fillRect(tx + tw, py - 13, px1 - tx - tw, 26);
    g.fillStyle = C.yellow; g.fillRect(tx + tw + 30, py - 13, 60, 13 - pw / 2); g.fillRect(tx + tw + 30, py + pw / 2, 60, 13 - pw / 2);
    label(g, "narrow = resistance", tx + tw + 60, py - 20, C.yellow, "center", 11);
    const sw = Math.min(pw, 2 + i * 2.5); // the stream can't be wider than the pipe
    if (v > 0) { // water pours out of the pipe's end and falls
      g.fillStyle = "#58c4dd88"; g.fillRect(px1, py - sw / 2, 10, sw);
      g.fillStyle = "#58c4ddcc"; for (let y = py; y < h - 22; y += 10) { const k = (y - py + t * 140) % 20; if (k < 12) g.fillRect(px1 + 10, y, sw, 8); }
    }
    label(g, "stream = current", px1 + 10, h - 8, C.blue, "center", 11);
  }, 280, { label: "A battery driving current through a resistor, next to a water tank draining through a narrow pipe" });
  controls(s, ["o-v", "o-r"], () => {
    const v = val("o-v"), r = val("o-r");
    el("o-vo").textContent = `${v} V`; el("o-ro").textContent = `${r} Ω`;
    el("r-ohm").innerHTML = `I = E ÷ R = ${v} ÷ ${r} = <em class="b">${fmt(v / r)} A</em>`;
  });
}

// --- 3. Resistance is a slope -------------------------------------------------------------------------------------------
{
  // The handle lives in pixels from the graph's origin (y up); volts and amps are read off with each axis's own scale.
  const VMAX = 120, IMAX = 6, OX = 50, PAD = 36;
  const kx = (w: number) => (w - 90) / VMAX, ky = (h: number) => (h - 70) / IMAX;
  const hd = { x: NaN, y: NaN, color: C.blue };
  let V = 90, I = 3;
  const s = new Scene(el("s-line"), (g, w, h) => {
    const ox = OX, oy = h - PAD, ax = kx(w), ay = ky(h);
    if (Number.isNaN(hd.x)) { hd.x = V * ax; hd.y = I * ay; }
    for (let v = 0; v <= VMAX; v += 20) { line(g, ox + v * ax, oy, ox + v * ax, oy - IMAX * ay, "#1f242d", 1); label(g, `${v}`, ox + v * ax, oy + 16, C.muted, "center", 10); }
    for (let i = 0; i <= IMAX; i++) { line(g, ox, oy - i * ay, ox + VMAX * ax, oy - i * ay, "#1f242d", 1); label(g, `${i}`, ox - 8, oy - i * ay + 4, C.muted, "right", 10); }
    label(g, "volts →", ox + VMAX * ax, oy + 30, C.muted, "right", 11); label(g, "amps ↑", ox - 8, 14, C.muted, "left", 11);
    for (const r of [10, 100]) { const v = Math.min(VMAX, IMAX * r); line(g, ox, oy, ox + v * ax, oy - (v / r) * ay, C.axis, 1.2, [4, 4]); label(g, `${r} Ω`, ox + v * ax - 4, oy - (v / r) * ay - 6, C.muted, "right", 10); }
    const r = V / I, vEnd = Math.min(VMAX, IMAX * r);
    line(g, ox, oy, ox + vEnd * ax, oy - (vEnd / r) * ay, C.yellow, 2.5);
    label(g, `${fmt(r, 1)} Ω`, ox + vEnd * ax - 4, oy - (vEnd / r) * ay - 10, C.yellow, "right", 13);
    line(g, ox + V * ax, oy, ox + V * ax, oy - I * ay, C.blue, 1, [3, 3]); line(g, ox, oy - I * ay, ox + V * ax, oy - I * ay, C.blue, 1, [3, 3]);
    g.fillStyle = C.blue; g.beginPath(); g.arc(ox + V * ax, oy - I * ay, 6, 0, 2 * Math.PI); g.fill();
  }, 300, {
    animated: false, handles: [hd], step: 12, label: "Current versus voltage: a straight line whose steepness is set by the resistance. Drag the point.",
    plane: (w, h) => ({ cx: OX, cy: h - PAD, unit: 1 }),
    onDrag: () => {
      const c = el("s-line").querySelector("canvas")!, ax = kx(c.clientWidth), ay = ky(c.clientHeight);
      V = Math.max(1, Math.min(VMAX, Math.round(hd.x / ax))); I = Math.max(0.1, Math.min(IMAX, Math.round((hd.y / ay) * 10) / 10));
      hd.x = V * ax; hd.y = I * ay; // snap to whole volts and tenths of an amp, like exam numbers
      upd();
    },
  });
  function upd() { el("r-line").innerHTML = `${V} V and ${I} A → R = E ÷ I = <em class="y">${fmt(V / I, 1)} Ω</em>`; }
  upd(); s.redraw();
}

// --- 4. Power is a rectangle -------------------------------------------------------------------------------------------
{
  const VMAX = 15, IMAX = 12, OX = 50, PAD = 36;
  const kx = (w: number) => (Math.min(w, 620) - 90) / VMAX, ky = (h: number) => (h - 70) / IMAX;
  const hd = { x: NaN, y: NaN, color: C.yellow };
  let V = 13.8, I = 10;
  const s = new Scene(el("s-power"), (g, w, h) => {
    const ox = OX, oy = h - PAD, ax = kx(w), ay = ky(h), P = V * I;
    if (Number.isNaN(hd.x)) { hd.x = V * ax; hd.y = I * ay; }
    for (let v = 0; v <= VMAX; v += 3) { line(g, ox + v * ax, oy, ox + v * ax, oy - IMAX * ay, "#1f242d", 1); label(g, `${v}`, ox + v * ax, oy + 16, C.muted, "center", 10); }
    for (let i = 0; i <= IMAX; i += 2) { line(g, ox, oy - i * ay, ox + VMAX * ax, oy - i * ay, "#1f242d", 1); label(g, `${i}`, ox - 8, oy - i * ay + 4, C.muted, "right", 10); }
    label(g, "volts →", ox + VMAX * ax, oy + 30, C.muted, "right", 11); label(g, "amps ↑", ox - 8, 14, C.muted, "left", 11);
    g.fillStyle = "#f4d35e33"; g.fillRect(ox, oy - I * ay, V * ax, I * ay);
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.strokeRect(ox, oy - I * ay, V * ax, I * ay);
    label(g, `${fmt(P, 1)} W`, ox + (V * ax) / 2, oy - (I * ay) / 2 + 5, C.yellow, "center", 15);
    if (w > 640) { lamp(g, w - 110, h / 2 - 10, Math.min(1, P / 180)); label(g, "lamp", w - 110, h / 2 + 50, C.muted, "center", 11); }
  }, 300, {
    animated: false, handles: [hd], step: 12, label: "Power as the area of a rectangle: voltage wide by current tall. Drag the corner.",
    plane: (w, h) => ({ cx: OX, cy: h - PAD, unit: 1 }),
    onDrag: () => {
      const c = el("s-power").querySelector("canvas")!, ax = kx(c.clientWidth), ay = ky(c.clientHeight);
      V = Math.max(0.2, Math.min(VMAX, Math.round((hd.x / ax) * 5) / 5)); I = Math.max(0.5, Math.min(IMAX, Math.round((hd.y / ay) * 2) / 2));
      hd.x = V * ax; hd.y = I * ay; upd();
    },
  });
  function upd() { el("r-power").innerHTML = `P = I × E = ${I} A × ${fmt(V, 1)} V = <em class="y">${fmt(V * I, 1)} W</em>`; }
  upd(); s.redraw();
}

// --- 5. Series and parallel -------------------------------------------------------------------------------------------
{
  const E = 12;
  let f = [0, 0, 0], lastT = 0;
  const s = new Scene(el("s-series"), (g, w, h, t) => {
    const par = checked("s-par"), r1 = val("s-r1"), r2 = val("s-r2"), dt = Math.max(0, t - lastT); lastT = t;
    const x0 = 60, y0 = 40, y1 = h - 40, k = 50;
    if (!par) {
      const x1 = Math.min(w - 120, 420), i = E / (r1 + r2);
      f[0] += i * dt * k;
      const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
      wire(g, loop); charges(g, loop, -f[0]);
      resistor(g, [x0 + 80, y0], [x1 - 60, y0], C.yellow, "");
      resistor(g, [x1, y0 + 40], [x1, y1 - 40], C.pink, "");
      label(g, `R1 ${r1} Ω: ${fmt(i)} A, ${fmt(i * r1)} V`, (x0 + x1) / 2 + 10, y0 - 16, C.yellow, "center", 12);
      label(g, `R2 ${r2} Ω`, x1 + 18, (y0 + y1) / 2 - 8, C.pink, "left", 12);
      label(g, `${fmt(i)} A, ${fmt(i * r2)} V`, x1 + 18, (y0 + y1) / 2 + 10, C.pink, "left", 12);
    } else {
      const xa = Math.min(w - 220, 300), xb = xa + 130, i1 = E / r1, i2 = E / r2;
      f[0] += (i1 + i2) * dt * k; f[1] += i1 * dt * k; f[2] += i2 * dt * k;
      wire(g, [[x0, y1], [x0, y0], [xb, y0], [xb, y1]]); line(g, xa, y0, xa, y1, C.axis, 3);
      charges(g, [[x0, y1], [xa, y1]], f[0], false); charges(g, [[xa, y0], [x0, y0], [x0, y1]], f[0], false);
      charges(g, [[xa, y1], [xa, y0]], f[1], false); charges(g, [[xa, y1], [xb, y1], [xb, y0], [xa, y0]], f[2], false);
      resistor(g, [xa, y0 + 40], [xa, y1 - 40], C.yellow, "");
      resistor(g, [xb, y0 + 40], [xb, y1 - 40], C.pink, "");
      label(g, `R1 ${r1} Ω`, xa - 16, (y0 + y1) / 2 - 8, C.yellow, "right", 12); label(g, `${fmt(i1)} A, ${E} V`, xa - 16, (y0 + y1) / 2 + 10, C.yellow, "right", 12);
      label(g, `R2 ${r2} Ω`, xb + 16, (y0 + y1) / 2 - 8, C.pink, "left", 12); label(g, `${fmt(i2)} A, ${E} V`, xb + 16, (y0 + y1) / 2 + 10, C.pink, "left", 12);
    }
    battery(g, x0, (y0 + y1) / 2, `${E} V`);
  }, 260, { label: "Two resistors in series or in parallel across a 12 volt battery, with the current and voltage of each" });
  controls(s, ["s-par", "s-r1", "s-r2"], () => {
    const par = checked("s-par"), r1 = val("s-r1"), r2 = val("s-r2");
    el("s-r1o").textContent = `${r1} Ω`; el("s-r2o").textContent = `${r2} Ω`;
    const rt = par ? (r1 * r2) / (r1 + r2) : r1 + r2;
    el("r-series").innerHTML = par
      ? `Parallel: both see the full 12 V; currents add: ${fmt(E / r1)} + ${fmt(E / r2)} = ${fmt(E / rt)} A. Total resistance <em class="y">${fmt(rt, 1)} Ω</em>, less than either one.`
      : `Series: the same ${fmt(E / rt)} A flows through both; voltages add: ${fmt((E / rt) * r1)} + ${fmt((E / rt) * r2)} = 12 V. Total resistance <em class="y">${fmt(rt, 1)} Ω</em> = ${r1} + ${r2}.`;
  });
}

// --- 6. DC and AC -------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-ac"), (g, w, h, t) => {
    const ac = checked("a-ac"), f = val("a-f"), split = w < 560 ? w : w * 0.55;
    const v = (tt: number) => (ac ? Math.sin(2 * Math.PI * f * tt) : 1);
    // voltage over the last 4 seconds
    const L = 40, R = split - 20, mid = h / 2, A = h * 0.32;
    line(g, L, mid, R, mid, C.axis, 1); label(g, "+", L - 14, mid - A + 4, C.red, "center", 13); label(g, "−", L - 14, mid + A + 4, C.text, "center", 13);
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    for (let x = L; x <= R; x++) { const tt = t - ((R - x) / (R - L)) * 4, y = mid - A * v(tt); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    label(g, "voltage over the last 4 seconds", L, 16, C.muted, "left", 11); label(g, "now", R, h - 10, C.muted, "right", 10);
    if (w < 560) return;
    // electrons in a wire: DC drifts, AC rocks
    const wx = split + 20, ww = w - wx - 20, wy = mid - 22;
    g.fillStyle = "#2a2218"; g.fillRect(wx, wy, ww, 44);
    const shift = ac ? -Math.cos(2 * Math.PI * f * t) / (2 * Math.PI * f) * 40 : (t * 30) % 24;
    g.fillStyle = C.blue;
    for (let x = -24; x < ww + 24; x += 24) for (const yy of [wy + 12, wy + 32]) { const px = wx + x + shift + (yy > wy + 20 ? 12 : 0); if (px > wx && px < wx + ww) { g.beginPath(); g.arc(px, yy, 3, 0, 2 * Math.PI); g.fill(); } }
    label(g, ac ? "electrons rock back and forth" : "electrons drift one way", wx + ww / 2, wy + 66, C.blue, "center", 11);
  }, 200, { label: "Direct current is a steady push one way; alternating current reverses direction many times per second" });
  controls(s, ["a-ac", "a-f"], () => { el("a-fo").textContent = `${val("a-f")} Hz`; });
}

// --- 7. Meters -----------------------------------------------------------------------------------------------------------
{
  const msg: Record<string, string> = {
    v: `The voltmeter sits across the resistor and reads <em class="g">12.0 V</em>. Its own resistance is millions of ohms, so it takes almost no current: the circuit works as before.`,
    a: `The circuit is opened and the ammeter put in the path. All the current flows through it: <em class="g">0.12 A</em> (12 V ÷ 100 Ω). Its own resistance is tiny, so it barely changes anything.`,
    "bad-a": `An ammeter has almost no resistance, so across the resistor it's a <em style="color:var(--red)">short circuit</em>: hundreds of amps for an instant, until the meter's fuse (or the meter) burns out.`,
    "bad-v": `The voltmeter's huge resistance is now in the path: the current drops to about a millionth of an amp. The meter reads the whole 12 V and the circuit stops working.`,
  };
  let flow = 0, lastT = 0;
  const mode = () => (document.querySelector('input[name="m"]:checked') as HTMLInputElement).value;
  const s = new Scene(el("s-meter"), (g, w, h, t) => {
    const m = mode(), dt = Math.max(0, t - lastT); lastT = t;
    const speed = m === "bad-v" ? 0 : m === "bad-a" ? 12 : 1.2;
    flow += speed * dt * 40;
    const x0 = 60, x1 = Math.min(w - 170, 380), y0 = 40, y1 = h - 50, inSeries = m === "a" || m === "bad-v";
    const loop: Pt[] = [[x0, y1], [x0, y0], [x1, y0], [x1, y1]];
    wire(g, loop, true, m === "bad-a" ? C.red : C.axis); charges(g, loop, -flow);
    battery(g, x0, (y0 + y1) / 2, "12 V");
    if (m !== "bad-a") resistor(g, [x1, y0 + 30], [x1, y1 - 30], C.yellow, "");
    else resistor(g, [x1, y0 + 30], [x1, y1 - 30], C.axis, "");
    label(g, "100 Ω", x1 - 16, (y0 + y1) / 2 + 4, C.yellow, "right", 12);
    if (inSeries) {
      const mx = (x0 + x1) / 2; g.fillStyle = C.stage; g.fillRect(mx - 24, y1 - 6, 48, 12);
      meter(g, mx, y1, m === "a" ? "A" : "V", m === "a" ? "0.12 A" : "12 V", m === "a" ? C.green : C.red);
    } else {
      const mx = x1 + 80, color = m === "v" ? C.green : C.red;
      line(g, x1, y0 + 20, mx, y0 + 20, color, 1.5); line(g, mx, y0 + 20, mx, (y0 + y1) / 2 - 18, color, 1.5);
      line(g, x1, y1 - 20, mx, y1 - 20, color, 1.5); line(g, mx, y1 - 20, mx, (y0 + y1) / 2 + 18, color, 1.5);
      meter(g, mx, (y0 + y1) / 2, m === "v" ? "V" : "A", m === "v" ? "12.0 V" : "", color, "right");
      if (m === "bad-a" && Math.floor(t * 4) % 2) label(g, "⚡ fuse blows", mx, (y0 + y1) / 2 + 40, C.red, "center", 13);
    }
  }, 240, { label: "A voltmeter and an ammeter connected correctly and incorrectly in a simple circuit" });
  document.querySelectorAll('input[name="m"]').forEach((r) => r.addEventListener("change", () => { el("r-meter").innerHTML = msg[mode()]; s.redraw(); }));
  el("r-meter").innerHTML = msg.v;
}
