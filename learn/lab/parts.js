// Circuit Lab parts: what each part is, where its pins are, how it becomes solver elements, and how it's drawn.
//
// Two kinds of geometry:
//  · two-terminal parts (and wires) have two grid points, a and b, like a stick you lay down;
//  · multi-pin parts (ICs, transistors, ground, probes) sit at a grid point `at`, turned by rot × 90°, with pins at fixed
//    grid offsets from it.
// stamp(p, ctx) turns a part into elements for learn/circuit.js: ctx.pin(k) is pin k's node, ctx.node() a fresh internal
// node, ctx.add(element, { main, sign }) adds one (main: it carries the part's current a → b, for the meter and the
// dots), ctx.behave(fn) runs fn(v, t, dt) after every step (behavioral ICs read the last voltages there), ctx.free(k)
// tells whether pin k is wired to nothing.

const BJTS = { "2N3904 (NPN)": { is: 6.7e-15, bf: 200, br: 1 }, "2N2222 (NPN)": { is: 1.4e-14, bf: 150, br: 6 }, "BC547 (NPN)": { is: 1.8e-14, bf: 300, br: 1 }, "TIP31 (NPN, power)": { is: 1e-12, bf: 50, br: 1 }, "2N3906 (PNP)": { is: 1.4e-15, bf: 180, br: 4, pnp: true } };
export const COL = { stage: "#14171d", grid: "#262b35", wire: "#8f98a8", text: "#d7dde5", sel: "#f4d35e", dot: "#f4d35e", blue: "#58c4dd", red: "#fc6255", green: "#83c167", dim: "#4a5262", body: "#1f2530" };
export const PROBE_COLORS = ["#f4d35e", "#58c4dd", "#fc6255", "#83c167"];
export const LEDS = { red: [1.9, "#ff4b3e"], yellow: [2.0, "#ffd23e"], green: [2.1, "#3ddc84"], blue: [3.0, "#4d7cff"], white: [3.1, "#f5f5ff"] };
const VT = 0.025852;
export const ledModel = (color) => ({ is: 0.01 / Math.exp(LEDS[color][0] / (2 * VT)), n: 2 }); // 10 mA at its rated voltage
export const DIODES = { "1N4148 (signal)": { is: 2.5e-9, n: 1.8 }, "1N4007 (rectifier)": { is: 7e-9, n: 1.9 }, "1N5819 (Schottky)": { is: 3e-6, n: 1.1 } };

// ---------- number formatting and parsing ----------
const PREFIX = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
export function si(x, unit = "", digits = 3) {
  if (!Number.isFinite(x)) return "—";
  if (Math.abs(x) < 1e-12) return `0 ${unit}`.trim();
  const [m, p] = PREFIX.find(([m]) => Math.abs(x) >= m * 0.9995) ?? PREFIX.at(-1);
  return `${+(x / m).toPrecision(digits)} ${p}${unit}`;
}
/** "4.7k", "100n", "2.2 µF", "1M", "0.5" → a number. NaN if it isn't one. */
export function parseSI(s) {
  const m = String(s).trim().replace(",", ".").match(/^(-?[\d.]+(?:e-?\d+)?)\s*([GMkKmuµnp]?)/);
  if (!m) return NaN;
  return +m[1] * ({ G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, "µ": 1e-6, n: 1e-9, p: 1e-12 }[m[2]] ?? 1);
}

// ---------- the part list ----------
// fields: what the inspector lets you change: [prop, label, kind ("si" | "num" | "select" | "range"), unit or options, min, max]
export const PARTS = {
  wire: { name: "Wire", cat: "Basic", two: true, len: 0, desc: "Joins points. A part's pin landing in the middle of a wire connects there too (a T-junction, drawn with a dot).",
    stamp() {} }, // wires are handled by the engine (split at T-junctions)
  ground: { name: "Ground", cat: "Basic", pins: [[0, 0]], desc: "The 0 V reference. Every ground symbol is the same node; probes and meters measure against it. Without one, the first source's − terminal is 0 V.", stamp() {} },
  battery: { name: "Battery", cat: "Sources", two: true, len: 3, props: { v: 9 }, fields: [["v", "voltage", "si", "V", 0.1, 48]], desc: "A steady push. Real batteries have a little resistance inside (here 0.1 Ω), so a short circuit gives amps, not infinity. Long line = +.", chapter: "01-voltage-current-resistance.html",
    stamp(p, c) { const mid = c.node(); c.add({ type: "V", a: mid, b: c.pin(1), volts: p.v }); c.add({ type: "R", a: mid, b: c.pin(0), ohms: 0.1 }, { main: true, sign: -1 }); } },
  source: { name: "Signal source", cat: "Sources", two: true, len: 3, props: { wave: "sine", freq: 60, amp: 12, offset: 0, duty: 50 },
    fields: [["wave", "waveform", "select", ["sine", "square", "triangle", "sawtooth"]], ["freq", "frequency", "si", "Hz", 0.01, 1e6], ["amp", "amplitude (peak)", "si", "V", 0, 400], ["offset", "DC offset", "num", "V", -50, 50], ["duty", "duty cycle (square)", "num", "%", 1, 99]],
    desc: "A function generator or an AC supply: sine, square, triangle or sawtooth, swinging ± amplitude around the offset. 12 V peak at 60 Hz is a small mains transformer's output. 1 Ω inside.", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { const mid = c.node(); c.add({ type: "V", a: mid, b: c.pin(1), volts: (t) => p.offset + p.amp * wave(p.wave, p.freq * t, p.duty / 100) }); c.add({ type: "R", a: mid, b: c.pin(0), ohms: 1 }, { main: true, sign: -1 }); } },
  resistor: { name: "Resistor", cat: "Passive", two: true, len: 3, props: { ohms: 1000, watts: 0.25 }, fields: [["ohms", "resistance", "si", "Ω", 0.01, 1e9], ["watts", "power rating", "select", [0.125, 0.25, 0.5, 1, 2, 5]]],
    desc: "Limits current: I = V / R. Turns the energy into heat, P = I²R; it glows red past its power rating.", chapter: "01-voltage-current-resistance.html",
    stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: Math.max(1e-3, p.ohms) }, { main: true }); } },
  pot: { name: "Potentiometer", cat: "Passive", pins: [[0, 0], [4, 0], [2, 2]], pinNames: ["A", "B", "wiper"], props: { ohms: 10000, pos: 50 }, fields: [["ohms", "total resistance", "si", "Ω", 1, 1e7], ["pos", "wiper position", "range", "%", 0, 100]],
    desc: "A resistor with a sliding tap: a voltage divider you turn by hand. A–wiper is pos × R, wiper–B the rest.", chapter: "01-voltage-current-resistance.html",
    stamp(p, c) { const r = Math.max(1, p.ohms), f = Math.min(0.999, Math.max(0.001, p.pos / 100)); c.add({ type: "R", a: c.pin(0), b: c.pin(2), ohms: r * f }, { main: true }); c.add({ type: "R", a: c.pin(2), b: c.pin(1), ohms: r * (1 - f) }); } },
  capacitor: { name: "Capacitor", cat: "Passive", two: true, len: 3, props: { farads: 100e-6 }, fields: [["farads", "capacitance", "si", "F", 1e-12, 1]],
    desc: "Stores charge: Q = C·V. Its voltage can't jump, so it smooths and delays (τ = R·C). Passes AC, blocks DC.", chapter: "02-capacitors-and-time.html",
    stamp(p, c) { c.add({ type: "C", a: c.pin(0), b: c.pin(1), farads: Math.max(1e-12, p.farads), v0: c.memory.capV.get(p.id) ?? 0 }, { main: true, cap: true }); } },
  inductor: { name: "Inductor", cat: "Passive", two: true, len: 3, props: { henries: 10e-3, ohms: 0.5 }, fields: [["henries", "inductance", "si", "H", 1e-9, 10], ["ohms", "wire resistance", "si", "Ω", 0.001, 1000]],
    desc: "A coil: its current can't jump (V = L·dI/dt). Cut its current suddenly and the voltage spikes. With a capacitor it rings at f = 1/(2π√LC).", chapter: "03-coils-and-resonance.html",
    stamp(p, c) { const mid = c.node(); c.add({ type: "L", a: c.pin(0), b: mid, henries: Math.max(1e-9, p.henries), i0: c.memory.indI.get(p.id) ?? 0 }, { main: true, ind: true }); c.add({ type: "R", a: mid, b: c.pin(1), ohms: Math.max(1e-3, p.ohms) }); } },
  switch: { name: "Switch", cat: "Basic", two: true, len: 3, props: { closed: false }, desc: "Click it to flip it.", stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: p.closed ? 1e-3 : 1e10 }, { main: true }); } },
  switch2: { name: "Two-way switch", cat: "Basic", pins: [[0, 0], [3, -1], [3, 1]], pinNames: ["common", "A", "B"], props: { closed: false },
    desc: "Click it to move the common contact from A (top) to B (bottom) and back, never touching both: charge something from one side, then hand it to the other.",
    stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: p.closed ? 1e10 : 1e-3 }, { main: true }); c.add({ type: "R", a: c.pin(0), b: c.pin(2), ohms: p.closed ? 1e-3 : 1e10 }, { main: true }); } },
  button: { name: "Push button", cat: "Basic", two: true, len: 3, props: { closed: false }, desc: "Closed only while you hold it down (press and hold on it).", stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: p.closed ? 1e-3 : 1e10 }, { main: true }); } },
  diode: { name: "Diode", cat: "Semiconductors", two: true, len: 3, props: { model: "1N4007 (rectifier)" }, fields: [["model", "type", "select", Object.keys(DIODES)]],
    desc: "A one-way valve: current flows from the triangle to the bar once there's about 0.6 V across it (0.3 V for a Schottky).", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { c.add({ type: "D", a: c.pin(0), b: c.pin(1), ...(DIODES[p.model] ?? DIODES["1N4007 (rectifier)"]) }, { main: true }); } },
  zener: { name: "Zener diode", cat: "Semiconductors", two: true, len: 3, props: { bv: 5.1 }, fields: [["bv", "Zener voltage", "si", "V", 1, 200]],
    desc: "A diode built to conduct backwards at a set voltage: put it the wrong way round with a resistor and it holds that voltage, a simple regulator.", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { c.add({ type: "D", a: c.pin(0), b: c.pin(1), is: 1e-14, n: 1, bv: p.bv }, { main: true }); } },
  led: { name: "LED", cat: "Semiconductors", two: true, len: 3, props: { color: "red" }, fields: [["color", "color", "select", Object.keys(LEDS)]],
    desc: "A diode that glows. It needs its forward voltage (red ≈1.9 V, blue ≈3 V) before anything flows, and a resistor to limit the current: above 30 mA it burns out.", chapter: "01-voltage-current-resistance.html",
    stamp(p, c) { if (p.dead) c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: 1e10 }, { main: true }); else c.add({ type: "D", a: c.pin(0), b: c.pin(1), ...ledModel(p.color) }, { main: true }); } },
  lamp: { name: "Lamp", cat: "Output", two: true, len: 3, props: { volts: 12, watts: 1.2 }, fields: [["volts", "rated voltage", "si", "V", 1, 240], ["watts", "rated power", "si", "W", 0.01, 100]],
    desc: "A filament bulb: a resistor that glows, R = V²/P at its rating. (Real filaments have less resistance when cold.)",
    stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: (p.volts * p.volts) / Math.max(1e-3, p.watts) }, { main: true }); } },
  motor: { name: "DC motor", cat: "Output", two: true, len: 3, props: { ohms: 6, henries: 1e-3 }, fields: [["ohms", "winding resistance", "si", "Ω", 0.1, 1000], ["henries", "winding inductance", "si", "H", 1e-6, 1]],
    desc: "A coil that spins: modeled as its winding's resistance and inductance (the speed shown follows the current). Switch one off without a flyback diode and watch the spike.", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { const mid = c.node(); c.add({ type: "R", a: c.pin(0), b: mid, ohms: Math.max(0.1, p.ohms) }, { main: true }); c.add({ type: "L", a: mid, b: c.pin(1), henries: p.henries, i0: c.memory.indI.get(p.id) ?? 0 }, { ind: true }); } },
  ammeter: { name: "Ammeter", cat: "Meters", two: true, len: 3, props: { ch: "off" }, fields: [["ch", "show on the scope", "select", ["off", 1, 2, 3, 4]]], desc: "Put it in series (break the loop and let the current go through it). It reads the current from its + end to its − end, and drops almost no voltage. Pick a scope channel to draw its current over time (a current probe).",
    stamp(p, c) { c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: 1e-3 }, { main: true }); } },
  probe: { name: "Scope probe", cat: "Meters", pins: [[0, 0]], props: { ch: 1 }, fields: [["ch", "scope channel", "select", [1, 2, 3, 4]]],
    desc: "Touch it to a point: the oscilloscope below draws that point's voltage (against ground) over time, with Vpp, RMS, average and frequency.", stamp() {} },
  nmos: { name: "N-MOSFET", cat: "Semiconductors", pins: [[0, 0], [2, -2], [2, 2]], pinNames: ["gate", "drain", "source"], props: { vth: 2, k: 10, model: "IRLZ44N (logic level)" },
    fields: [["model", "type", "select", ["IRLZ44N (logic level)", "IRF540N (standard)", "2N7000 (small signal)"]]],
    desc: "A switch worked by voltage: gate above the source by more than the threshold, and current flows drain → source. Logic-level ones switch fully on from 3.3–5 V.", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { const m = { "IRLZ44N (logic level)": { vth: 1.5, k: 30 }, "IRF540N (standard)": { vth: 3.5, k: 15 }, "2N7000 (small signal)": { vth: 2.1, k: 0.3 } }[p.model] ?? { vth: p.vth, k: p.k };
      c.add({ type: "M", a: c.pin(1), b: c.pin(2), g: c.pin(0), ...m }, { main: true }); c.add({ type: "R", a: c.pin(0), b: c.pin(2), ohms: 1e9 }); } },
  bjt: { name: "Transistor (BJT)", cat: "Semiconductors", pins: [[0, 0], [2, -2], [2, 2]], pinNames: ["base", "collector", "emitter"], props: { model: "2N3904 (NPN)" }, fields: [["model", "type", "select", Object.keys(BJTS)]],
    desc: "A current amplifier: a small current into the base (about 0.65 V above the emitter) lets β times more flow collector → emitter (NPN). Fully on it drops only ~0.1 V (saturated); a PNP works upside down, from the positive side.", chapter: "04-diodes-and-transistors.html",
    stamp(p, c) { c.add({ type: "Q", a: c.pin(1), b: c.pin(2), g: c.pin(0), ...(BJTS[p.model] ?? BJTS["2N3904 (NPN)"]) }, { main: true }); } },
  transformer: { name: "Transformer", cat: "Passive", pins: [[0, 0], [0, 3], [4, 0], [4, 3]], pinNames: ["primary 1", "primary 2", "secondary 1", "secondary 2"], props: { ratio: 0.1, lm: 1 },
    fields: [["ratio", "turns ratio (secondary : primary)", "select", [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]], ["lm", "primary inductance", "si", "H", 0.001, 100]],
    desc: "Two coils on one core: AC on the primary appears on the secondary times the turns ratio (0.1 turns 120 V into 12 V), and the current goes the other way (the primary draws 0.1× the secondary's current). DC doesn't pass: the primary is just a coil to it.", chapter: "03-coils-and-resonance.html",
    stamp(p, c) {
      // an ideal transformer plus its magnetizing inductance: secondary = n·(primary voltage), primary draws n·(secondary current) (one step behind)
      const [p1, p2, s1, s2] = [0, 1, 2, 3].map((k) => c.pin(k)), mid = c.node(), n = p.ratio, s = { vp: 0, is: 0 };
      c.add({ type: "L", a: p1, b: p2, henries: p.lm, i0: c.memory.indI.get(p.id) ?? 0 }, { ind: true });
      c.add({ type: "I", a: p1, b: p2, get amps() { return n * s.is; } });
      c.add({ type: "V", a: mid, b: s2, get volts() { return n * s.vp; } }); c.add({ type: "R", a: mid, b: s1, ohms: 0.05 }, { main: true, sign: -1 });
      c.behave((v) => { s.vp = v[p1] - v[p2]; s.is = (v[mid] - v[s1]) / 0.05; });
      c.state(p.id, s);
    } },
  dff: { name: "D flip-flop", cat: "Logic", pins: [[0, 1], [0, 3], [4, 1], [4, 3]], pinNames: ["D", "CLK", "Q", "Q̄"], props: { vdd: 5 },
    desc: "Remembers one bit: at each rising edge of CLK, Q copies D and holds it until the next edge (Q̄ is its opposite). Chain them for counters and shift registers.", chapter: "12-gates-to-a-computer.html",
    stamp(p, c) {
      const [d, clk, q, qb] = [0, 1, 2, 3].map((k) => c.pin(k)), s = { q: false, clk: false }, dq = c.node(), dqb = c.node();
      for (const k of [d, clk]) c.add({ type: "R", a: k, b: 0, ohms: 1e6 });
      c.add({ type: "V", a: dq, b: 0, volts: () => (s.q ? p.vdd : 0) }); c.add({ type: "R", a: dq, b: q, ohms: 25 }, { main: true, sign: -1 });
      c.add({ type: "V", a: dqb, b: 0, volts: () => (s.q ? 0 : p.vdd) }); c.add({ type: "R", a: dqb, b: qb, ohms: 25 });
      c.behave((v) => { const hi = v[clk] > p.vdd / 2; if (hi && !s.clk) s.q = v[d] > p.vdd / 2; s.clk = hi; });
      c.state(p.id, s);
    } },
  counter4017: { name: "4017 decade counter", cat: "Logic", pins: [[0, 1], [0, 2], ...Array.from({ length: 10 }, (_, k) => [6, k + 1])], pinNames: ["CLK", "RST", ...Array.from({ length: 10 }, (_, k) => `Q${k}`)], props: { vdd: 5 },
    desc: "Counts clock pulses from 0 to 9 and lights one output at a time: Q0, Q1… Q9, then Q0 again. RST high sends it back to Q0. With a 555 on CLK and LEDs on the outputs: a running light.", chapter: "12-gates-to-a-computer.html",
    stamp(p, c) {
      const clk = c.pin(0), rst = c.pin(1), s = { n: 0, clk: false };
      c.add({ type: "R", a: clk, b: 0, ohms: 1e6 }); c.add({ type: "R", a: rst, b: 0, ohms: 1e6 });
      for (let k = 0; k < 10; k++) { const drv = c.node(); c.add({ type: "V", a: drv, b: 0, volts: () => (s.n === k ? p.vdd : 0) }); c.add({ type: "R", a: drv, b: c.pin(k + 2), ohms: 25 }, k === 0 ? { main: true, sign: -1 } : {}); }
      c.behave((v) => { const hi = v[clk] > p.vdd / 2; if (v[rst] > p.vdd / 2) s.n = 0; else if (hi && !s.clk) s.n = (s.n + 1) % 10; s.clk = hi; });
      c.state(p.id, s);
    } },
  opamp: { name: "Op-amp", cat: "ICs", optional: [3, 4], pins: [[0, -1], [0, 1], [4, 0], [2, -2], [2, 2]], pinNames: ["−in", "+in", "out", "V+", "V−"], props: {},
    desc: "Amplifies the difference between its inputs about 100,000 times, limited by its supply. With feedback (output wired back to −in through a resistor) it does exactly what the resistors say. Leave V+/V− unwired for ±15 V.",
    stamp(p, c) {
      const el = { type: "OA", p: c.pin(1), n: c.pin(0), o: c.pin(2), gain: 1e5 };
      if (c.free(3)) el.vp = 13.5; else el.vpNode = c.pin(3);
      if (c.free(4)) el.vn = -13.5; else el.vnNode = c.pin(4);
      c.add(el, { main: true }); c.add({ type: "R", a: c.pin(0), b: c.pin(1), ohms: 1e9 });
    } },
  timer555: { name: "555 timer", cat: "ICs", optional: [2, 5], pins: [[0, 1], [0, 2], [0, 3], [0, 4], [6, 1], [6, 2], [6, 3], [6, 4]], pinNames: ["2 TRIG", "6 THR", "5 CTRL", "7 DIS", "8 VCC", "4 RESET", "3 OUT", "1 GND"], props: {},
    desc: "The classic timer. Inside: three 5 kΩ resistors make ⅓ and ⅔ of VCC; when TRIG drops below ⅓ the output goes high, when THR rises above ⅔ it goes low and DIS shorts to ground. With two resistors and a capacitor it blinks at f = 1.44 / ((R1 + 2R2)·C).",
    stamp(p, c) {
      const [trig, thr, ctrl, dis, vcc, rst, out, gnd] = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => c.pin(k)), third = c.node(), drv = c.node(), s = { q: false, vcc: 0 };
      c.add({ type: "R", a: vcc, b: ctrl, ohms: 5000 }); c.add({ type: "R", a: ctrl, b: third, ohms: 5000 }); c.add({ type: "R", a: third, b: gnd, ohms: 5000 });
      c.add({ type: "R", a: rst, b: vcc, ohms: 100e3 }); // an unwired RESET reads high
      c.add({ type: "V", a: drv, b: gnd, volts: () => (s.q ? Math.max(0, s.vcc - 1.7) : 0.05) }); c.add({ type: "R", a: drv, b: out, ohms: 10 }, { main: true, sign: -1 });
      c.add({ type: "R", a: dis, b: gnd, get ohms() { return s.q ? 1e9 : 10; } });
      c.behave((v) => {
        s.vcc = v[vcc] - v[gnd];
        if (v[rst] - v[gnd] < 0.7) s.q = false;
        else if (v[trig] < v[third]) s.q = true;          // the trigger wins over the threshold, as in the real chip
        else if (v[thr] > v[ctrl]) s.q = false;
      });
      c.state(p.id, s);
    } },
  reg7805: { name: "7805 regulator", cat: "ICs", pins: [[0, 0], [4, 0], [2, 2]], pinNames: ["IN", "OUT", "GND"], props: { vout: 5 }, fields: [["vout", "output (78xx)", "select", [3.3, 5, 9, 12]]],
    desc: "Holds its output at 5 V (or 3.3, 9, 12) as long as the input is at least 2 V higher: the difference times the current turns into heat. Needs capacitors on both sides in real life.",
    stamp(p, c) {
      const [vin, vout, gnd] = [0, 1, 2].map((k) => c.pin(k)), drv = c.node(), s = { set: 0, iout: 0 };
      c.add({ type: "V", a: drv, b: gnd, volts: () => s.set }); c.add({ type: "R", a: drv, b: vout, ohms: 0.05 }, { main: true, sign: -1 });
      c.add({ type: "I", a: vin, b: gnd, get amps() { return Math.max(0, s.iout) + 0.005; } }); // the input supplies the output's current, plus 5 mA for itself
      c.behave((v, r) => { s.set = Math.max(0, Math.min(p.vout, v[vin] - v[gnd] - 2)); s.iout = (s.set - (v[vout] - v[gnd])) / 0.05; });
      c.state(p.id, s);
    } },
  ...Object.fromEntries([["and", "AND", (a, b) => a && b], ["nand", "NAND", (a, b) => !(a && b)], ["or", "OR", (a, b) => a || b], ["nor", "NOR", (a, b) => !(a || b)], ["xor", "XOR", (a, b) => a !== b]].map(([k, name, fn]) => [k, {
    name: `${name} gate`, cat: "Logic", pins: [[0, -1], [0, 1], [4, 0]], pinNames: ["A", "B", "Y"], props: { vdd: 5 }, gate: k,
    desc: `Digital logic (5 V CMOS): inputs above 2.5 V are 1, below are 0. ${name}: ${{ and: "1 only if both are 1", nand: "0 only if both are 1 (you can build anything from these)", or: "1 if either is 1", nor: "0 if either is 1", xor: "1 if they differ" }[k]}. Unwired inputs read 0.`,
    stamp(p, c) { gateStamp(p, c, [0, 1], 2, (x) => fn(x[0], x[1])); } }])),
  not: { name: "NOT gate", cat: "Logic", pins: [[0, 0], [3, 0]], pinNames: ["A", "Y"], props: { vdd: 5 }, gate: "not", desc: "An inverter: output is the opposite of the input.", stamp(p, c) { gateStamp(p, c, [0], 1, (x) => !x[0]); } },
};
function gateStamp(p, c, ins, out, fn) {
  const drv = c.node(), s = { y: fn(ins.map(() => false)) };
  for (const k of ins) c.add({ type: "R", a: c.pin(k), b: 0, ohms: 1e6 }); // inputs: high impedance, unwired = low
  c.add({ type: "V", a: drv, b: 0, volts: () => (s.y ? p.vdd : 0) }); c.add({ type: "R", a: drv, b: c.pin(out), ohms: 25 }, { main: true, sign: -1 });
  c.behave((v) => { s.y = !!fn(ins.map((k) => v[c.pin(k)] > p.vdd / 2)); });
  c.state(p.id, s);
}
export function wave(kind, cycles, duty = 0.5) {
  const ph = cycles - Math.floor(cycles);
  if (kind === "square") return ph < duty ? 1 : -1;
  if (kind === "triangle") return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
  if (kind === "sawtooth") return 2 * ph - 1;
  return Math.sin(2 * Math.PI * cycles);
}

// ---------- geometry ----------
const turn = ([x, y], rot) => { for (let k = 0; k < ((rot % 4) + 4) % 4; k++) [x, y] = [-y, x]; return [x, y]; };
/** Grid points of a part's pins, in order. */
export function pins(p) {
  const d = PARTS[p.type];
  if (d.two) return [p.a, p.b];
  return d.pins.map((o) => { const [dx, dy] = turn(o, p.rot ?? 0); return [p.at[0] + dx, p.at[1] + dy]; });
}
/** Move a part by (dx, dy) grid squares. */
export function shift(p, dx, dy) { if (PARTS[p.type].two) { p.a = [p.a[0] + dx, p.a[1] + dy]; p.b = [p.b[0] + dx, p.b[1] + dy]; } else p.at = [p.at[0] + dx, p.at[1] + dy]; }
/** Rotate a part 90° clockwise around its first pin. */
export function rotate(p) {
  if (PARTS[p.type].two) { const [ax, ay] = p.a, dx = p.b[0] - ax, dy = p.b[1] - ay; p.b = [ax - dy, ay + dx]; }
  else p.rot = ((p.rot ?? 0) + 1) % 4;
}
/** Distance (grid squares) from a point to a part, for clicking on it. */
export function distTo(p, [x, y]) {
  const d = PARTS[p.type];
  if (d.two) { const [ax, ay] = p.a, [bx, by] = p.b, l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)); return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))); }
  const ps = pins(p), xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)) * (ps.length === 1 ? 1 : 0.9) + (ps.length === 1 ? Math.hypot(x - ps[0][0], y - ps[0][1]) * 0.5 : 0);
}

// ---------- drawing ----------
// g is set up so 1 unit = one grid square, origin at the part. st: { amps, sel, glow, pinV, t, ... }.
export function draw(g, p, st) {
  const d = PARTS[p.type], line = st.sel ? COL.sel : COL.wire;
  g.save();
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = line; g.lineWidth = 0.1;
  const L = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const text = (s, x, y, size = 0.42, color = st.sel ? COL.sel : COL.text, align = "center") => { g.save(); g.fillStyle = color; g.font = `${size}px ui-monospace, Menlo, monospace`; g.textAlign = align; g.textBaseline = "middle"; g.fillText(s, x, y); g.restore(); };
  if (d.two) {
    const [ax, ay] = p.a, [bx, by] = p.b, len = Math.hypot(bx - ax, by - ay), m = len / 2;
    const ang = Math.atan2(by - ay, bx - ax);
    g.translate(ax, ay); g.rotate(ang);
    // Labels stay horizontal on screen, beside the part: left/right of a vertical one, above/below a horizontal one.
    const label = (s, y = -0.62) => {
      const dx = -y * Math.sin(ang), dy = y * Math.cos(ang), side = Math.abs(dx) > Math.abs(dy);
      g.save(); g.translate(m, y); g.rotate(-ang); text(s, side ? Math.sign(dx) * 0.1 : 0, 0, 0.42, undefined, side ? (dx > 0 ? "left" : "right") : "center"); g.restore();
    };
    switch (p.type) {
      case "wire": L(0, 0, len, 0); break;
      case "resistor": {
        L(0, 0, m - 0.8, 0); L(m + 0.8, 0, len, 0);
        g.beginPath(); for (let k = 0; k <= 8; k++) g.lineTo(m - 0.8 + k * 0.2, k === 0 || k === 8 ? 0 : k % 2 ? 0.28 : -0.28); g.stroke();
        if (st.heat > 0) { g.fillStyle = `rgba(252,98,85,${Math.min(0.6, st.heat)})`; g.beginPath(); g.arc(m, 0, 0.7, 0, 7); g.fill(); }
        label(si(p.ohms, "Ω")); break;
      }
      case "battery": { L(0, 0, m - 0.17, 0); L(m + 0.2, 0, len, 0); g.strokeStyle = COL.text; L(m - 0.17, -0.55, m - 0.17, 0.55); g.lineWidth = 0.2; L(m + 0.2, -0.3, m + 0.2, 0.3); text("+", m - 0.6, -0.4, 0.4); label(si(p.v, "V"), 0.95); break; }
      case "source": {
        L(0, 0, m - 0.6, 0); L(m + 0.6, 0, len, 0); g.strokeStyle = COL.text; g.beginPath(); g.arc(m, 0, 0.6, 0, 7); g.stroke();
        g.beginPath(); for (let k = 0; k <= 20; k++) { const x = -0.38 + (k / 20) * 0.76; g.lineTo(m + x, -0.25 * wave(p.wave, k / 20, p.duty / 100)); } g.stroke();
        text("+", -0.0 + 0.35, -0.35, 0.35); label(`${si(p.amp, "V")} ${si(p.freq, "Hz")}`, 1.05); break;
      }
      case "capacitor": { L(0, 0, m - 0.17, 0); L(m + 0.17, 0, len, 0); g.strokeStyle = COL.text; g.lineWidth = 0.13; L(m - 0.17, -0.5, m - 0.17, 0.5); L(m + 0.17, -0.5, m + 0.17, 0.5); label(si(p.farads, "F")); break; }
      case "inductor": { L(0, 0, m - 0.9, 0); L(m + 0.9, 0, len, 0); g.beginPath(); for (let k = 0; k < 4; k++) g.arc(m - 0.675 + k * 0.45, 0, 0.225, Math.PI, 0); g.stroke(); label(si(p.henries, "H")); break; }
      case "switch": case "button": {
        L(0, 0, m - 0.5, 0); L(m + 0.5, 0, len, 0); g.fillStyle = COL.text; for (const x of [m - 0.5, m + 0.5]) { g.beginPath(); g.arc(x, 0, 0.12, 0, 7); g.fill(); }
        g.strokeStyle = COL.text;
        if (p.type === "switch") L(m - 0.5, 0, m + 0.5, p.closed ? 0 : -0.5);
        else { const y = p.closed ? -0.12 : -0.4; L(m - 0.55, y, m + 0.55, y); L(m, y, m, y - 0.35); }
        label(p.type === "switch" ? (p.closed ? "on" : "off") : "push", 0.6); break;
      }
      case "diode": case "zener": case "led": {
        L(0, 0, m - 0.35, 0); L(m + 0.35, 0, len, 0);
        if (p.type === "led" && st.glow > 0.02) { const r = 0.6 + st.glow; const grd = g.createRadialGradient(m, 0, 0.05, m, 0, r); grd.addColorStop(0, LEDS[p.color][1]); grd.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = 0.3 + 0.7 * st.glow; g.fillStyle = grd; g.beginPath(); g.arc(m, 0, r, 0, 7); g.fill(); g.globalAlpha = 1; }
        g.fillStyle = p.type === "led" ? (p.dead ? "#333" : LEDS[p.color][1]) : COL.text; g.strokeStyle = COL.text; g.lineWidth = 0.07;
        g.beginPath(); g.moveTo(m - 0.35, -0.38); g.lineTo(m - 0.35, 0.38); g.lineTo(m + 0.35, 0); g.closePath(); g.fill(); g.stroke();
        g.lineWidth = 0.1; g.beginPath();
        if (p.type === "zener") { g.moveTo(m + 0.2, -0.5); g.lineTo(m + 0.35, -0.38); g.lineTo(m + 0.35, 0.38); g.lineTo(m + 0.5, 0.5); } else { g.moveTo(m + 0.35, -0.38); g.lineTo(m + 0.35, 0.38); }
        g.stroke();
        if (p.type === "led") { g.lineWidth = 0.05; g.strokeStyle = LEDS[p.color][1]; L(m + 0.1, -0.5, m + 0.4, -0.8); L(m + 0.3, -0.45, m + 0.6, -0.75); }
        if (p.dead) { g.fillStyle = "rgba(170,170,170,.5)"; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(m - 0.15 + k * 0.17, -0.65 - k * 0.25 + Math.sin(st.t * 3 + k) * 0.07, 0.17 + k * 0.03, 0, 7); g.fill(); } }
        label(p.type === "led" ? (p.dead ? "burnt" : p.color) : p.type === "zener" ? `${si(p.bv, "V")} Z` : p.model.split(" ")[0], 0.85);
        break;
      }
      case "lamp": {
        L(0, 0, m - 0.5, 0); L(m + 0.5, 0, len, 0);
        if (st.glow > 0.02) { const grd = g.createRadialGradient(m, 0, 0.05, m, 0, 0.6 + st.glow); grd.addColorStop(0, "#fff3b0"); grd.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = 0.25 + 0.75 * st.glow; g.fillStyle = grd; g.beginPath(); g.arc(m, 0, 0.6 + st.glow, 0, 7); g.fill(); g.globalAlpha = 1; }
        g.strokeStyle = COL.text; g.beginPath(); g.arc(m, 0, 0.5, 0, 7); g.stroke(); L(m - 0.35, -0.35, m + 0.35, 0.35); L(m - 0.35, 0.35, m + 0.35, -0.35);
        label(`${si(p.volts, "V")} ${si(p.watts, "W")}`, 0.95); break;
      }
      case "motor": {
        L(0, 0, m - 0.6, 0); L(m + 0.6, 0, len, 0); g.strokeStyle = COL.text; g.beginPath(); g.arc(m, 0, 0.6, 0, 7); g.stroke();
        g.save(); g.translate(m, 0); g.rotate(st.spin ?? 0); g.fillStyle = COL.blue; for (let k = 0; k < 3; k++) { g.rotate((2 * Math.PI) / 3); g.fillRect(-0.06, 0, 0.12, 0.45); } g.restore();
        text("M", m, 0, 0.35, COL.text); label("motor", 0.95); break;
      }
      case "ammeter": {
        L(0, 0, m - 0.55, 0); L(m + 0.55, 0, len, 0); g.fillStyle = COL.body; g.strokeStyle = COL.green; g.beginPath(); g.arc(m, 0, 0.55, 0, 7); g.fill(); g.stroke();
        text("A", m, 0, 0.45, COL.green); text("+", 0.3, -0.35, 0.35); label(si(st.amps ?? 0, "A"), -0.85); break;
      }
    }
    g.restore();
    return;
  }
  // multi-pin parts: origin at `at`, turned by rot
  g.translate(p.at[0], p.at[1]); g.rotate(((p.rot ?? 0) * Math.PI) / 2);
  const flipText = (p.rot ?? 0) === 2; // keep IC labels readable upside down
  const T = (s, x, y, size, color, align) => { g.save(); g.translate(x, y); g.rotate(-((p.rot ?? 0) * Math.PI) / 2); text(s, 0, 0, size, color, align); g.restore(); };
  switch (p.type) {
    case "ground": L(0, 0, 0, 0.5); for (const [w, y] of [[0.5, 0.5], [0.32, 0.68], [0.14, 0.86]]) L(-w, y, w, y); break;
    case "probe": { const c = PROBE_COLORS[(p.ch - 1) % 4]; g.strokeStyle = c; g.fillStyle = c; L(0, 0, 0.6, -0.6); g.beginPath(); g.arc(0, 0, 0.13, 0, 7); g.fill(); g.fillRect(0.5, -1.1, 0.75, 0.55); T(`${p.ch}`, 0.875, -0.82, 0.42, COL.stage); break; }
    case "switch2": {
      L(0, 0, 1, 0); L(2, -1, 3, -1); L(2, 1, 3, 1); g.fillStyle = COL.text; for (const [x, y] of [[1, 0], [2, -1], [2, 1]]) { g.beginPath(); g.arc(x, y, 0.12, 0, 7); g.fill(); }
      g.strokeStyle = COL.text; L(1, 0, 1.95, p.closed ? 0.9 : -0.9);
      T("A", 2.2, -1.45, 0.34, COL.dim); T("B", 2.2, 1.75, 0.34, COL.dim); break;
    }
    case "pot": {
      L(0, 0, 1.2, 0); L(2.8, 0, 4, 0); g.beginPath(); for (let k = 0; k <= 8; k++) g.lineTo(1.2 + k * 0.2, k === 0 || k === 8 ? 0 : k % 2 ? 0.28 : -0.28); g.stroke();
      const x = 1.2 + 1.6 * (p.pos / 100); L(2, 2, 2, 1.2); L(2, 1.2, x, 1.2); L(x, 1.2, x, 0.45); g.fillStyle = line; g.beginPath(); g.moveTo(x, 0.35); g.lineTo(x - 0.15, 0.6); g.lineTo(x + 0.15, 0.6); g.fill();
      T(si(p.ohms, "Ω"), 2, -0.65, 0.4); break;
    }
    case "bjt": {
      const pnp = /PNP/.test(p.model);
      L(0, 0, 1.1, 0); g.strokeStyle = COL.text; g.lineWidth = 0.15; L(1.1, -0.6, 1.1, 0.6); g.lineWidth = 0.1; g.strokeStyle = line;
      L(1.1, -0.3, 2, -0.9); L(2, -0.9, 2, -2); L(1.1, 0.3, 2, 0.9); L(2, 0.9, 2, 2);
      g.strokeStyle = COL.dim; g.beginPath(); g.arc(1.5, 0, 0.95, 0, 7); g.stroke();
      { // the emitter arrow: out of the transistor for NPN, into it for PNP
        const [x0, y0, x1, y1] = pnp ? [2, 0.9, 1.3, 0.45] : [1.3, 0.45, 2, 0.9], a = Math.atan2(y1 - y0, x1 - x0); g.fillStyle = line; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 0.3 * Math.cos(a - 0.5), y1 - 0.3 * Math.sin(a - 0.5)); g.lineTo(x1 - 0.3 * Math.cos(a + 0.5), y1 - 0.3 * Math.sin(a + 0.5)); g.fill(); }
      T("B", -0.2, -0.35, 0.32, COL.dim); T("C", 2.35, -1.6, 0.32, COL.dim); T("E", 2.35, 1.6, 0.32, COL.dim); T(p.model.split(" ")[0], 3.1, 0, 0.32, COL.dim, "left"); break;
    }
    case "transformer": {
      L(0, 0, 1, 0); L(0, 3, 1, 3); L(3, 0, 4, 0); L(3, 3, 4, 3); L(1, 0, 1, 0.3); L(1, 2.7, 1, 3); L(3, 0, 3, 0.3); L(3, 2.7, 3, 3);
      for (const [x, dir] of [[1, 1], [3, -1]]) { g.beginPath(); for (let k = 0; k < 4; k++) g.arc(x, 0.6 + k * 0.6, 0.3, -Math.PI / 2, Math.PI / 2, dir < 0); g.stroke(); }
      g.strokeStyle = COL.text; L(1.85, 0.2, 1.85, 2.8); L(2.15, 0.2, 2.15, 2.8);
      T(`${p.ratio >= 1 ? `1:${p.ratio}` : `${Math.round(1 / p.ratio)}:1`}`, 2, -0.45, 0.34); break;
    }
    case "dff": case "counter4017": {
      const big = p.type === "counter4017", h = big ? 11 : 4, w = big ? 6 : 4;
      for (const [x, y] of pins(p).map(([px, py]) => [px - p.at[0], py - p.at[1]])) L(x, y, x < w / 2 ? 1 : w - 1, y);
      g.fillStyle = COL.body; g.strokeStyle = st.sel ? COL.sel : COL.text; g.fillRect(1, 0.3, w - 2, h - 0.6); g.strokeRect(1, 0.3, w - 2, h - 0.6);
      const names = PARTS[p.type].pinNames;
      pins(p).forEach(([px, py], k) => { const x = px - p.at[0], y = py - p.at[1]; T(names[k], x < w / 2 ? 1.15 : w - 1.15, y, 0.3, COL.text, x < w / 2 ? "left" : "right"); });
      if (big) T("4017", w / 2, h / 2 + 0.6, 0.5, COL.blue); else { if (!flipText) T("D FF", 2, 2, 0.4, COL.blue); if (st.q != null) T(`Q=${st.q ? 1 : 0}`, 2, 2.7, 0.3, st.q ? COL.green : COL.dim); }
      if (big && st.n != null) T(`count ${st.n}`, w / 2, h / 2 + 1.4, 0.32, COL.green);
      break;
    }
    case "nmos": {
      L(0, 0, 1.1, 0); g.strokeStyle = COL.text; L(1.1, -0.7, 1.1, 0.7); g.lineWidth = 0.13; for (const y of [-0.55, 0, 0.55]) L(1.4, y - 0.18, 1.4, y + 0.18);
      g.lineWidth = 0.1; g.strokeStyle = line; L(1.4, -0.55, 2, -0.55); L(2, -0.55, 2, -2); L(1.4, 0.55, 2, 0.55); L(2, 0.55, 2, 2); L(1.4, 0, 2, 0); L(2, 0, 2, 0.55);
      g.fillStyle = line; g.beginPath(); g.moveTo(1.45, 0); g.lineTo(1.75, -0.15); g.lineTo(1.75, 0.15); g.fill();
      if (st.on) { g.fillStyle = "rgba(131,193,103,.25)"; g.fillRect(1.25, -0.8, 0.35, 1.6); }
      T("G", -0.2, -0.35, 0.32, COL.dim); T("D", 2.35, -1.6, 0.32, COL.dim); T("S", 2.35, 1.6, 0.32, COL.dim); T(p.model.split(" ")[0], 3.2, 0, 0.32, COL.dim, "left"); break;
    }
    case "opamp": {
      L(0, -1, 0.5, -1); L(0, 1, 0.5, 1); L(3.5, 0, 4, 0); L(2, -2, 2, -0.75); L(2, 2, 2, 0.75);
      g.fillStyle = COL.body; g.strokeStyle = st.sel ? COL.sel : COL.text; g.beginPath(); g.moveTo(0.5, -1.5); g.lineTo(0.5, 1.5); g.lineTo(3.5, 0); g.closePath(); g.fill(); g.stroke();
      T("−", 0.85, -1, 0.5); T("+", 0.85, 1, 0.5); break;
    }
    case "timer555": {
      for (let k = 1; k <= 4; k++) { L(0, k, 1, k); L(5, k, 6, k); }
      g.fillStyle = COL.body; g.strokeStyle = st.sel ? COL.sel : COL.text; g.fillRect(1, 0.3, 4, 4.4); g.strokeRect(1, 0.3, 4, 4.4);
      ["TRIG", "THR", "CTRL", "DIS"].forEach((s, k) => T(s, 1.15, k + 1, 0.32, COL.text, "left")); ["VCC", "RST", "OUT", "GND"].forEach((s, k) => T(s, 4.85, k + 1, 0.32, COL.text, "right"));
      T("555", 3, 2.5, 0.55, COL.blue); if (st.q != null) T(st.q ? "out: HIGH" : "out: low", 3, 3.3, 0.3, st.q ? COL.green : COL.dim); break;
    }
    case "reg7805": {
      L(0, 0, 1, 0); L(3, 0, 4, 0); L(2, 2, 2, 1);
      g.fillStyle = COL.body; g.strokeStyle = st.sel ? COL.sel : COL.text; g.fillRect(1, -1, 2, 2); g.strokeRect(1, -1, 2, 2);
      T(`78${String(p.vout).replace(".", "")}`.replace("783.3", "LD33"), 2, -0.35, 0.36, COL.blue); T("IN", 1.15, 0.4, 0.26, COL.text, "left"); T("OUT", 2.85, 0.4, 0.26, COL.text, "right"); T("GND", 2, 0.75, 0.24); break;
    }
    case "and": case "nand": case "or": case "nor": case "xor": case "not": {
      const two = p.type !== "not", end = two ? 4 : 3, y = st.y;
      g.fillStyle = COL.body; g.strokeStyle = st.sel ? COL.sel : COL.text;
      if (two) { L(0, -1, 1, -1); L(0, 1, 1, 1); }
      else L(0, 0, 0.8, 0);
      g.beginPath();
      if (p.type === "and" || p.type === "nand") { g.moveTo(1, -1.3); g.lineTo(2.1, -1.3); g.arc(2.1, 0, 1.3, -Math.PI / 2, Math.PI / 2); g.lineTo(1, 1.3); g.closePath(); }
      else if (p.type === "not") { g.moveTo(0.8, -0.8); g.lineTo(0.8, 0.8); g.lineTo(2.3, 0); g.closePath(); }
      else { g.moveTo(0.9, -1.3); g.quadraticCurveTo(2.6, -1.3, 3.4, 0); g.quadraticCurveTo(2.6, 1.3, 0.9, 1.3); g.quadraticCurveTo(1.6, 0, 0.9, -1.3); }
      g.fill(); g.stroke();
      if (p.type === "xor") { g.beginPath(); g.moveTo(0.6, -1.3); g.quadraticCurveTo(1.3, 0, 0.6, 1.3); g.stroke(); }
      const bubble = ["nand", "nor", "not"].includes(p.type), tip = p.type === "not" ? 2.3 : p.type === "and" || p.type === "nand" ? 3.4 : 3.4;
      if (bubble) { g.beginPath(); g.arc(tip + 0.15, 0, 0.15, 0, 7); g.stroke(); }
      g.strokeStyle = line; L(tip + (bubble ? 0.3 : 0), 0, end, 0);
      if (y != null) { g.fillStyle = y ? COL.green : COL.dim; g.beginPath(); g.arc(end - 0.35, -0.3, 0.12, 0, 7); g.fill(); }
      T(p.type.toUpperCase(), two ? 1.9 : 1.3, 0, 0.3, COL.dim); break;
    }
  }
  g.restore();
}
