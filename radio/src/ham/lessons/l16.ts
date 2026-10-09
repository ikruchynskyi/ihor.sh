// Lesson 16: logic and op-amps. A gate playground with its truth table, a flip-flop divider chain, a comparator, an op-amp.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const TAU = 2 * Math.PI;

// --- 1. Logic gates --------------------------------------------------------------------------------------------------------
const GATES: Record<string, (a: boolean, b: boolean) => boolean> = {
  AND: (a, b) => a && b, OR: (a, b) => a || b, NAND: (a, b) => !(a && b), NOR: (a, b) => !(a || b), XOR: (a, b) => a !== b, XNOR: (a, b) => a === b, NOT: (a) => !a,
};
{
  const s = new Scene(el("s-gate"), (g, w, h) => {
    const name = sel("gt-g"), a = checked("gt-a"), b = checked("gt-b"), out = GATES[name](a, b), one = name === "NOT";
    const cx = w / 2, cy = h / 2, gw = 90, gh = 70, x0 = cx - gw / 2, inv = ["NAND", "NOR", "XNOR", "NOT"].includes(name), orish = ["OR", "NOR", "XOR", "XNOR"].includes(name);
    const wire = (on: boolean) => (on ? C.green : C.axis);
    // inputs
    const ys = one ? [cy] : [cy - 18, cy + 18];
    [a, b].slice(0, ys.length).forEach((v, i) => { line(g, x0 - 70, ys[i], x0 + (orish ? 14 : 0), ys[i], wire(v), 3); label(g, `${["A", "B"][i]} = ${v ? 1 : 0}`, x0 - 76, ys[i] + 4, wire(v), "right", 12); });
    // body
    g.strokeStyle = C.text; g.lineWidth = 2.5; g.beginPath();
    if (one) { g.moveTo(x0, cy - gh / 2); g.lineTo(x0 + gw - 12, cy); g.lineTo(x0, cy + gh / 2); g.closePath(); }
    else if (orish) { g.moveTo(x0, cy - gh / 2); g.quadraticCurveTo(x0 + gw * 0.6, cy - gh / 2, x0 + gw, cy); g.quadraticCurveTo(x0 + gw * 0.6, cy + gh / 2, x0, cy + gh / 2); g.quadraticCurveTo(x0 + 22, cy, x0, cy - gh / 2); if (name.startsWith("X")) { g.moveTo(x0 - 10, cy - gh / 2); g.quadraticCurveTo(x0 + 12, cy, x0 - 10, cy + gh / 2); } }
    else { g.moveTo(x0, cy - gh / 2); g.lineTo(x0 + gw / 2, cy - gh / 2); g.arc(x0 + gw / 2, cy, gh / 2, -Math.PI / 2, Math.PI / 2); g.lineTo(x0, cy + gh / 2); g.closePath(); }
    g.stroke();
    const xo = one ? x0 + gw - 12 : x0 + gw;
    if (inv) { g.beginPath(); g.arc(xo + 6, cy, 6, 0, TAU); g.stroke(); }
    line(g, xo + (inv ? 12 : 0), cy, xo + 80, cy, wire(out), 3);
    g.fillStyle = out ? C.green : "#2a2f3a"; g.beginPath(); g.arc(xo + 92, cy, 12, 0, TAU); g.fill();
    label(g, `output ${out ? 1 : 0}`, xo + 110, cy + 4, out ? C.green : C.muted, "left", 12);
    label(g, name, cx - (one ? 10 : 0), cy + gh / 2 + 18, C.muted, "center", 11);
  }, 200, { animated: false, label: "A logic gate with two switchable inputs and an output lamp" });
  controls(s, ["gt-g", "gt-a", "gt-b"], () => {
    const name = sel("gt-g"), a = checked("gt-a"), b = checked("gt-b"), one = name === "NOT";
    (el("gt-b").parentElement as HTMLElement).style.visibility = one ? "hidden" : "visible";
    const rows = one ? [[false, false], [true, false]] : [[false, false], [false, true], [true, false], [true, true]];
    el("tt").innerHTML = `<tr><th>A</th>${one ? "" : "<th>B</th>"}<th>${name}</th></tr>` + rows.map(([x, y]) => `<tr class="${x === a && (one || y === b) ? "on" : ""}"><td>${+x}</td>${one ? "" : `<td>${+y}</td>`}<td>${+GATES[name](x, y)}</td></tr>`).join("");
  });
}

// --- 2. Flip-flop divider chain ---------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-ff"), (g, w, h, t) => {
    const n = val("ff-n"), L = 90, R = w - 16, rows = n + 1, rh = (h - 20) / rows, period = (R - L) / 16, shift = (t * 40) % (period * 16);
    for (let r = 0; r < rows; r++) {
      const y = 10 + r * rh, hi = y + rh * 0.2, lo = y + rh * 0.75, div = 2 ** r;
      label(g, r === 0 ? "clock" : `÷${div}`, L - 10, (hi + lo) / 2 + 4, r === 0 ? C.yellow : C.green, "right", 11);
      g.strokeStyle = r === 0 ? C.yellow : C.green; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= R - L; x++) { const ph = ((x + shift) / (period * div)) % 1, y2 = ph < 0.5 ? hi : lo; x ? g.lineTo(L + x, y2) : g.moveTo(L + x, y2); }
      g.stroke();
    }
  }, 220, { label: "A clock and the outputs of a chain of flip-flops, each switching at half the rate of the one before" });
  controls(s, ["ff-n"], () => { const n = val("ff-n"); el("ff-no").textContent = `${n}`; el("r-ff").innerHTML = `${n} flip-flop${n > 1 ? "s" : ""}: the last output runs at 1/${2 ** n} of the clock. As a counter: ${2 ** n} states (${n} bits).`; });
}

// --- 3. Comparator with hysteresis --------------------------------------------------------------------------------------------------
{
  const N = 600;
  let seed = 4; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const input = Array.from({ length: N }, (_, i) => Math.sin((i / N) * TAU * 1.5) * 0.9 + (rnd() - 0.5) * 0.35);
  const run = (hys: number) => { let st = false, flips = 0; return { out: input.map((v) => { const nx = st ? v > -hys / 2 : v > hys / 2; if (nx !== st) flips++; st = nx; return st; }), flips }; };
  const s = new Scene(el("s-cmp"), (g, w, h) => {
    const hys = val("cm-h"), { out } = run(hys), L = 20, R = w - 20, mid = h * 0.38, A = h * 0.28, oy0 = h * 0.82, oy1 = h * 0.7, px = (i: number) => L + (i / (N - 1)) * (R - L);
    line(g, L, mid - A * (hys / 2), R, mid - A * (hys / 2), C.red, 1.2, [4, 3]); line(g, L, mid + A * (hys / 2), R, mid + A * (hys / 2), C.blue, 1.2, [4, 3]);
    label(g, hys ? "switch-on threshold" : "threshold", R, mid - A * (hys / 2) - 4, C.red, "right", 9); if (hys) label(g, "switch-off threshold", R, mid + A * (hys / 2) + 12, C.blue, "right", 9);
    g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.beginPath(); input.forEach((v, i) => (i ? g.lineTo(px(i), mid - A * v) : g.moveTo(px(i), mid - A * v))); g.stroke();
    g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath(); out.forEach((v, i) => (i ? g.lineTo(px(i), v ? oy1 : oy0) : g.moveTo(px(i), v ? oy1 : oy0))); g.stroke();
    label(g, "noisy input", L, 14, C.yellow, "left", 10); label(g, "comparator output", L, oy1 - 8, C.green, "left", 10);
  }, 240, { animated: false, label: "A noisy signal into a comparator: without hysteresis the output chatters at each crossing; with it, the output switches cleanly" });
  controls(s, ["cm-h"], () => { const hys = val("cm-h"), { flips } = run(hys); el("cm-ho").textContent = hys ? `${hys.toFixed(2)}` : "none"; el("r-cmp").innerHTML = `The output switched <em class="${flips > 4 ? "p" : "g"}">${flips} times</em> for 3 real crossings.`; });
}

// --- 4. The inverting op-amp -------------------------------------------------------------------------------------------------------
{
  const RAIL = 12;
  const s = new Scene(el("s-op"), (g, w, h) => {
    const r1 = Number(sel("op-1")), rf = Number(sel("op-f")), vin = val("op-v"), cap = checked("op-c"), gain = -rf / r1, vout = Math.max(-RAIL, Math.min(RAIL, gain * vin));
    // schematic
    const ox = Math.min(w * 0.42, 260), oy = h * 0.42;
    g.strokeStyle = C.text; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ox - 40, oy - 40); g.lineTo(ox + 30, oy); g.lineTo(ox - 40, oy + 40); g.closePath(); g.stroke();
    label(g, "−", ox - 34, oy - 12, C.text, "left", 14); label(g, "+", ox - 34, oy + 22, C.text, "left", 14);
    line(g, 20, oy - 18, ox - 40, oy - 18, C.axis, 2); label(g, `R1 ${r1 >= 1000 ? r1 / 1000 + "k" : r1}`, 70, oy - 26, C.yellow, "center", 11);
    line(g, ox - 60, oy - 18, ox - 60, oy - 70, C.axis, 2); line(g, ox - 60, oy - 70, ox + 60, oy - 70, C.axis, 2); line(g, ox + 60, oy - 70, ox + 60, oy, C.axis, 2); line(g, ox + 30, oy, ox + 90, oy, C.axis, 2);
    label(g, `RF ${rf / 1000}k${cap ? " ∥ C" : ""}`, ox, oy - 78, C.pink, "center", 11);
    line(g, ox - 40, oy + 18, ox - 60, oy + 18, C.axis, 2); line(g, ox - 60, oy + 18, ox - 60, oy + 40, C.axis, 2); label(g, "⏚", ox - 60, oy + 56, C.muted, "center", 14);
    label(g, `in ${vin.toFixed(2)} V`, 20, oy - 2, C.yellow, "left", 11); label(g, `out ${vout.toFixed(2)} V`, ox + 94, oy + 4, Math.abs(gain * vin) > RAIL ? C.red : C.green, "left", 12);
    // frequency response
    const L = ox + 40, R = w - 16, T = h * 0.7, B = h - 12;
    if (R - L > 120) {
      label(g, "gain vs frequency", L, T - 4, C.muted, "left", 9);
      g.strokeStyle = C.pink; g.lineWidth = 2; g.beginPath();
      for (let x = L; x <= R; x++) { const f = 10 ** ((x - L) / (R - L) * 4), mag = cap ? 1 / Math.sqrt(1 + (f / 100) ** 2) : 1, y = B - (B - T) * mag; x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke(); label(g, cap ? "low-pass" : "flat", R, T + 10, C.pink, "right", 9);
    }
  }, 240, { animated: false, label: "An inverting op-amp amplifier whose gain is set by two resistors, with its output voltage and frequency response" });
  controls(s, ["op-1", "op-f", "op-v", "op-c"], () => {
    const r1 = Number(sel("op-1")), rf = Number(sel("op-f")), vin = val("op-v"), gain = rf / r1, ideal = -gain * vin, clipped = Math.abs(ideal) > RAIL;
    el("op-vo").textContent = `${vin.toFixed(2)} V`;
    el("r-op").innerHTML = `Gain −RF/R1 = −${+gain.toFixed(1)}; output ${clipped ? `would be ${ideal.toFixed(1)} V, but <em style="color:var(--red)">clips at the ±${RAIL} V supply</em>` : `<em class="g">${ideal.toFixed(2)} V</em>`}.`;
  });
}
