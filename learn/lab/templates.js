import { PARTS } from "./parts.js";

// Ready-made circuits to drop into the board (they're added to what's there, at the point you click).
// Coordinates are grid squares from the template's top-left corner. Two-terminal parts: [type, a, b, props];
// multi-pin parts: [type, at, rot, props]. A battery's or source's a is its + end; a diode's a is its anode.
// speed: a suggested simulation speed (sim seconds per real second); div: a suggested scope time/div.

const w = (a, b) => ["wire", a, b];
export const TEMPLATES = {
  led: { name: "LED + resistor (with an ammeter)", desc: "The first circuit of every kit. The ammeter reads the LED's current: (9 − 1.9) V / 470 Ω ≈ 15 mA.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 9 }], w([0, 3], [0, 1]), w([0, 1], [3, 1]), ["resistor", [3, 1], [6, 1], { ohms: 470 }], ["ammeter", [6, 1], [9, 1]], ["led", [9, 1], [9, 4], { color: "red" }], w([9, 4], [9, 7]), w([9, 7], [0, 7]), w([0, 7], [0, 6]), ["ground", [0, 7], 0]] },
  divider: { name: "Voltage divider", desc: "Two equal resistors split 5 V in half. Change one and watch the probe.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 5 }], w([0, 3], [0, 1]), w([0, 1], [6, 1]), ["resistor", [6, 1], [6, 4], { ohms: 10000 }], ["resistor", [6, 4], [6, 7], { ohms: 10000 }], w([6, 7], [0, 7]), w([0, 7], [0, 6]), ["ground", [0, 7], 0], ["probe", [6, 4], 0, { ch: 1 }]] },
  ledsShared: { name: "Two LEDs, one resistor (why it fails)", desc: "Red turns on at ≈1.9 V and holds the shared point there; blue needs ≈3 V, so it gets almost nothing. Click the blue LED to see it.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 5 }], w([0, 3], [0, 1]), w([0, 1], [2, 1]), ["resistor", [2, 1], [5, 1], { ohms: 150 }], w([5, 1], [11, 1]), ["led", [8, 1], [8, 4], { color: "red" }], ["led", [11, 1], [11, 4], { color: "blue" }], w([8, 4], [8, 7]), w([11, 4], [11, 7]), w([11, 7], [0, 7]), w([0, 7], [0, 6]), ["ground", [0, 7], 0]] },
  ledsOwn: { name: "Two LEDs, a resistor each (the fix)", desc: "Each LED gets its own resistor, sized for its own voltage: red (5 − 1.9) / 330 ≈ 9 mA, blue (5 − 3) / 150 ≈ 13 mA. Both light.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 5 }], w([0, 3], [0, 1]), w([0, 1], [8, 1]), ["resistor", [4, 1], [4, 4], { ohms: 330 }], ["led", [4, 4], [4, 7], { color: "red" }], ["resistor", [8, 1], [8, 4], { ohms: 150 }], ["led", [8, 4], [8, 7], { color: "blue" }], w([8, 7], [0, 7]), w([0, 7], [0, 6]), ["ground", [0, 7], 0]] },
  halfwave: { name: "Half-wave rectifier + smoothing", desc: "12 V AC (yellow) through one diode into a 1000 µF capacitor: DC peaking near 10.5 V (blue; the diode drops almost 1 V during the big charging gulps) with a ripple that grows with the load.", speed: 0.05, div: 5e-3,
    parts: [["source", [0, 2], [0, 5], { wave: "sine", freq: 60, amp: 12 }], w([0, 2], [0, 1]), w([0, 1], [2, 1]), ["diode", [2, 1], [5, 1], { model: "1N4007 (rectifier)" }], w([5, 1], [11, 1]), ["capacitor", [8, 1], [8, 4], { farads: 1000e-6 }], ["resistor", [11, 1], [11, 4], { ohms: 100 }], w([8, 4], [8, 6]), w([11, 4], [11, 6]), w([0, 5], [0, 6]), w([0, 6], [11, 6]), ["ground", [0, 6], 0], ["probe", [0, 1], 0, { ch: 1 }], ["probe", [11, 1], 0, { ch: 2 }]] },
  bridge: { name: "Bridge rectifier + smoothing", desc: "Four diodes use both halves of the wave: the capacitor is topped up 120 times a second, so the ripple halves. The AC source floats; ground is the DC minus.", speed: 0.05, div: 5e-3,
    parts: [["source", [2, 2], [2, 5], { wave: "sine", freq: 60, amp: 12 }], w([2, 2], [4, 2]), w([4, 2], [4, 4]), w([4, 4], [6, 4]), w([2, 5], [2, 9]), w([2, 9], [12, 9]), w([12, 9], [12, 4]), w([12, 4], [10, 4]),
      ["diode", [6, 4], [6, 1]], ["diode", [6, 7], [6, 4]], ["diode", [10, 4], [10, 1]], ["diode", [10, 7], [10, 4]], w([6, 1], [16, 1]), w([6, 7], [16, 7]),
      ["capacitor", [14, 1], [14, 4], { farads: 1000e-6 }], w([14, 4], [14, 7]), ["resistor", [16, 1], [16, 4], { ohms: 100 }], w([16, 4], [16, 7]), ["ground", [16, 7], 0], ["probe", [16, 1], 0, { ch: 1 }]] },
  lowpass: { name: "RC low-pass filter", desc: "1 kΩ and 1 µF: the cutoff is 1/(2πRC) ≈ 159 Hz. At 159 Hz the output (blue) is 71% of the input (yellow) and lags behind. Change the frequency.", speed: 0.01, div: 2e-3,
    parts: [["source", [0, 2], [0, 5], { wave: "sine", freq: 159, amp: 5 }], w([0, 2], [0, 1]), w([0, 1], [2, 1]), ["resistor", [2, 1], [5, 1], { ohms: 1000 }], w([5, 1], [9, 1]), ["capacitor", [9, 1], [9, 4], { farads: 1e-6 }], w([9, 4], [9, 6]), w([9, 6], [0, 6]), w([0, 6], [0, 5]), ["ground", [0, 6], 0], ["probe", [0, 1], 0, { ch: 1 }], ["probe", [9, 1], 0, { ch: 2 }]] },
  highpass: { name: "RC high-pass filter", desc: "Swap R and C: now only changes get through. A 50 Hz square wave comes out as spikes at each edge, decaying with τ = RC = 1 ms.", speed: 0.01, div: 5e-3,
    parts: [["source", [0, 2], [0, 5], { wave: "square", freq: 50, amp: 5 }], w([0, 2], [0, 1]), w([0, 1], [2, 1]), ["capacitor", [2, 1], [5, 1], { farads: 1e-6 }], w([5, 1], [9, 1]), ["resistor", [9, 1], [9, 4], { ohms: 1000 }], w([9, 4], [9, 6]), w([9, 6], [0, 6]), w([0, 6], [0, 5]), ["ground", [0, 6], 0], ["probe", [0, 1], 0, { ch: 1 }], ["probe", [9, 1], 0, { ch: 2 }]] },
  lc: { name: "LC tank (ringing)", desc: "The two-way switch charges the 10 µF capacitor from the battery. Flip it: the capacitor lets go into the 10 mH coil, and the energy sloshes between them at 1/(2π√LC) ≈ 503 Hz, fading as the coil's resistance takes its share. Flip it back to recharge, and ring it again.", speed: 0.001, div: 2e-3,
    parts: [["battery", [0, 3], [0, 6], { v: 5 }], w([0, 3], [0, 0]), w([0, 0], [3, 0]), ["resistor", [3, 0], [6, 0], { ohms: 10 }], w([6, 0], [9, 0]), w([9, 0], [9, 1]),
      ["switch2", [6, 2], 0, { closed: false }], ["capacitor", [6, 2], [6, 5], { farads: 10e-6 }], w([9, 3], [11, 3]), ["inductor", [11, 3], [11, 6], { henries: 10e-3, ohms: 0.5 }],
      w([6, 5], [6, 7]), w([11, 6], [11, 7]), w([11, 7], [0, 7]), w([0, 7], [0, 6]), ["ground", [0, 7], 0], ["probe", [6, 2], 0, { ch: 1 }]] },
  bjtswitch: { name: "Transistor switch (BJT)", desc: "Close the switch: a small base current (9 V through 10 kΩ, under 1 mA) turns the 2N3904 fully on, and it carries the LED's ~15 mA. That's the transistor as a switch: β = 200 times more current than it takes.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 9 }], w([0, 3], [0, 0]), w([0, 0], [10, 0]), ["switch", [4, 0], [4, 3], { closed: false }], ["resistor", [4, 3], [4, 6], { ohms: 10000 }], w([4, 6], [4, 8]), w([4, 8], [8, 8]),
      ["resistor", [10, 0], [10, 3], { ohms: 470 }], ["led", [10, 3], [10, 6], { color: "green" }], ["bjt", [8, 8], 0, { model: "2N3904 (NPN)" }], w([10, 10], [10, 11]), w([10, 11], [0, 11]), w([0, 11], [0, 6]), ["ground", [0, 11], 0],
      ["probe", [8, 8], 0, { ch: 1 }], ["probe", [10, 6], 0, { ch: 2 }]] },
  transformer: { name: "Transformer: 120 V to 12 V", desc: "Wall-socket AC (170 V peak = 120 V RMS, 60 Hz) on a 10:1 transformer gives 12 V RMS on the secondary (yellow vs blue on the scope), and the 100 Ω load draws 120 mA there but only 12 mA from the primary.", speed: 0.02, div: 5e-3,
    parts: [["source", [0, 1], [0, 4], { wave: "sine", freq: 60, amp: 170, offset: 0, duty: 50 }], w([0, 1], [3, 1]), w([0, 4], [3, 4]), ["transformer", [3, 1], 0, { ratio: 0.1, lm: 1 }],
      w([7, 1], [10, 1]), ["resistor", [10, 1], [10, 4], { ohms: 100 }], w([7, 4], [10, 4]), ["ground", [0, 4], 0], ["ground", [7, 4], 0], ["probe", [0, 1], 0, { ch: 1 }], ["probe", [7, 1], 0, { ch: 2 }]] },
  blinker: { name: "555 LED blinker", desc: "The 555 in astable mode: the capacitor (blue) charges through R1 + R2 to ⅔ of 9 V and discharges through R2 to ⅓, flipping the output (yellow) each time. f = 1.44 / ((R1 + 2·R2)·C) ≈ 1.5 Hz.", speed: 1, div: 0.2,
    parts: [["battery", [0, 3], [0, 6], { v: 9 }], w([0, 3], [0, 0]), w([0, 0], [14, 0]), ["resistor", [3, 0], [3, 3], { ohms: 1000 }], w([3, 3], [3, 5]), w([3, 5], [6, 5]), ["resistor", [3, 5], [3, 8], { ohms: 47000 }], w([3, 8], [5, 8]), w([5, 8], [5, 2]), w([5, 2], [6, 2]), w([5, 3], [6, 3]),
      ["capacitor", [3, 8], [3, 11], { farads: 10e-6 }], ["timer555", [6, 1], 0], w([12, 2], [14, 2]), w([14, 2], [14, 0]), w([12, 5], [13, 5]), w([13, 5], [13, 11]),
      w([12, 4], [16, 4]), ["resistor", [16, 4], [16, 7], { ohms: 470 }], ["led", [16, 7], [16, 10], { color: "red" }], w([16, 10], [16, 11]), w([0, 6], [0, 11]), w([0, 11], [16, 11]), ["ground", [0, 11], 0], ["probe", [12, 4], 0, { ch: 1 }], ["probe", [3, 8], 0, { ch: 2 }]] },
  inverting: { name: "Op-amp inverting amplifier", desc: "Gain = −Rf / Rin = −10 kΩ / 1 kΩ = −10: 0.5 V in (yellow) becomes 5 V out (blue), upside down. Push the input past 1.35 V and the output clips at the ±13.5 V rails.", speed: 0.0005, div: 2e-4,
    parts: [["source", [0, 2], [0, 5], { wave: "sine", freq: 1000, amp: 0.5 }], w([0, 2], [1, 2]), ["resistor", [1, 2], [4, 2], { ohms: 1000 }], w([4, 2], [8, 2]), w([6, 2], [6, 0]), ["resistor", [6, 0], [9, 0], { ohms: 10000 }], w([9, 0], [13, 0]), w([13, 0], [13, 3]), w([12, 3], [13, 3]),
      ["opamp", [8, 3], 0], w([8, 4], [8, 6]), w([0, 5], [0, 6]), w([0, 6], [8, 6]), ["ground", [0, 6], 0], ["probe", [0, 2], 0, { ch: 1 }], ["probe", [13, 3], 0, { ch: 2 }]] },
  noninverting: { name: "Op-amp non-inverting amplifier", desc: "Gain = 1 + Rf / Rg = 1 + 10k / 1k = 11, and the output stays the right way up.", speed: 0.0005, div: 2e-4,
    parts: [["source", [0, 4], [0, 7], { wave: "sine", freq: 1000, amp: 0.5 }], w([0, 4], [8, 4]), ["opamp", [8, 3], 0], w([8, 2], [7, 2]), w([7, 2], [7, 0]), ["resistor", [7, 0], [10, 0], { ohms: 10000 }], w([10, 0], [13, 0]), w([13, 0], [13, 3]), w([12, 3], [13, 3]),
      ["resistor", [7, 2], [4, 2], { ohms: 1000 }], w([4, 2], [2, 2]), ["ground", [2, 2], 0], w([0, 7], [0, 8]), ["ground", [0, 8], 0], ["probe", [0, 4], 0, { ch: 1 }], ["probe", [13, 3], 0, { ch: 2 }]] },
  supply5v: { name: "5 V regulated supply", desc: "AC → diode → 2200 µF → 7805 → a steady 5 V (blue), however much the raw DC (yellow) ripples, as long as it stays above about 7 V.", speed: 0.05, div: 5e-3,
    parts: [["source", [0, 2], [0, 5], { wave: "sine", freq: 60, amp: 12 }], w([0, 2], [0, 1]), w([0, 1], [1, 1]), ["diode", [1, 1], [4, 1]], w([4, 1], [8, 1]), ["capacitor", [6, 1], [6, 4], { farads: 2200e-6 }], ["reg7805", [8, 1], 0, { vout: 5 }], w([10, 3], [10, 6]),
      w([12, 1], [15, 1]), ["capacitor", [13, 1], [13, 4], { farads: 10e-6 }], ["resistor", [15, 1], [15, 4], { ohms: 100 }], w([0, 5], [0, 6]), w([0, 6], [15, 6]), w([6, 4], [6, 6]), w([13, 4], [13, 6]), w([15, 4], [15, 6]), ["ground", [0, 6], 0], ["probe", [8, 1], 0, { ch: 1 }], ["probe", [15, 1], 0, { ch: 2 }]] },
  motor: { name: "MOSFET motor driver (PWM + flyback)", desc: "A 0/5 V PWM signal (yellow) switches a logic-level MOSFET; the motor's average voltage follows the duty cycle. Delete the diode and watch the drain (blue) spike when it switches off.", speed: 0.005, div: 2e-3,
    parts: [["battery", [0, 3], [0, 6], { v: 12 }], w([0, 3], [0, 0]), w([0, 0], [11, 0]), ["motor", [8, 0], [8, 3]], ["diode", [11, 3], [11, 0], { model: "1N5819 (Schottky)" }], w([8, 3], [11, 3]), ["nmos", [6, 5], 0, { model: "IRLZ44N (logic level)" }],
      ["source", [3, 5], [3, 8], { wave: "square", freq: 200, amp: 2.5, offset: 2.5, duty: 50 }], w([3, 5], [6, 5]), w([8, 7], [8, 8]), w([0, 6], [0, 8]), w([0, 8], [8, 8]), ["ground", [0, 8], 0], ["probe", [6, 5], 0, { ch: 1 }], ["probe", [8, 3], 0, { ch: 2 }]] },
  zener: { name: "Zener regulator", desc: "A Zener diode, connected backwards, holds about 5.1 V; the resistor takes the rest of the 12 V. Simple, but it wastes current all the time.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 12 }], w([0, 3], [0, 1]), w([0, 1], [1, 1]), ["resistor", [1, 1], [4, 1], { ohms: 470 }], w([4, 1], [10, 1]), ["zener", [7, 4], [7, 1], { bv: 5.1 }], ["resistor", [10, 1], [10, 4], { ohms: 1000 }], w([7, 4], [7, 6]), w([10, 4], [10, 6]), w([0, 6], [10, 6]), ["ground", [0, 6], 0], ["probe", [10, 1], 0, { ch: 1 }]] },
  logic: { name: "Logic gate with two switches", desc: "Two switches feed an AND gate; the LED shows its output. Select the gate to change it to NAND, OR, NOR or XOR and fill in its truth table.", speed: 1,
    parts: [["battery", [0, 3], [0, 6], { v: 5 }], w([0, 3], [0, 0]), w([0, 0], [5, 0]), ["switch", [2, 0], [2, 3]], ["switch", [5, 0], [5, 3]], w([2, 3], [2, 4]), w([2, 4], [8, 4]), w([5, 3], [5, 6]), w([5, 6], [8, 6]), ["and", [8, 5], 0],
      ["resistor", [12, 5], [15, 5], { ohms: 330 }], ["led", [15, 5], [15, 8], { color: "green" }], w([15, 8], [15, 9]), w([0, 6], [0, 9]), w([0, 9], [15, 9]), ["ground", [0, 9], 0]] },
};

/** A template's parts, as lab parts shifted to (x, y). */
// the 555 blinker without its LED (its output at (12, 4), ground rail along y = 11), as a clock for the logic templates
const clock = () => TEMPLATES.blinker.parts.filter((q) => !(q[0] === "led" || (q[0] === "resistor" && q[1][0] === 16) || (q[0] === "wire" && (q[1][0] === 16 || q[2][0] === 16) && q[1][1] !== 11) || q[0] === "probe" || (q[0] === "wire" && q[1][0] === 12 && q[1][1] === 4)));
TEMPLATES.runlight = { name: "Running light (555 + 4017)", desc: "The 555 ticks about 1.5 times a second; each tick moves the 4017 to its next output, so the LEDs on Q0, Q2, Q4, Q6 and Q8 light one after another, then it starts over. The 330 Ω resistors keep each LED near 10 mA.", speed: 1, div: 0.2,
  // the clock goes out along y = 4 and up x = 15 (x = 14, y = 2 is the 555's supply); RST runs down x = 14 to the ground rail
  parts: [...clock(), w([12, 4], [15, 4]), w([15, 4], [15, 2]), w([15, 2], [16, 2]), w([16, 3], [14, 3]), w([14, 3], [14, 11]), ["counter4017", [16, 1], 0],
    ...[0, 2, 4, 6, 8].flatMap((q) => [["resistor", [22, q + 2], [25, q + 2], { ohms: 330 }], ["led", [25, q + 2], [28, q + 2], { color: ["red", "yellow", "green", "blue", "white"][q / 2] }]]),
    w([28, 2], [28, 13]), w([28, 13], [0, 13]), w([0, 13], [0, 11]), ["probe", [16, 2], 0, { ch: 1 }]] };
TEMPLATES.divider2 = { name: "Divide by two (D flip-flop)", desc: "Q̄ fed back to D makes the flip-flop flip at every rising clock edge: Q (blue) runs at exactly half the 555's frequency (yellow). Chain more and you have chapter 12's counter.", speed: 1, div: 0.5,
  parts: [...clock(), w([12, 4], [14, 4]), w([14, 4], [14, 6]), w([14, 6], [16, 6]), ["dff", [16, 3], 0], w([20, 6], [21, 6]), w([21, 6], [21, 8]), w([21, 8], [15, 8]), w([15, 8], [15, 4]), w([15, 4], [16, 4]),
    ["probe", [16, 6], 0, { ch: 1 }], ["probe", [20, 4], 0, { ch: 2 }]] };

export function instantiate(name, [x, y], nextId) {
  return TEMPLATES[name].parts.map(([type, p1, p2, props = {}]) => {
    const two = Array.isArray(p2);
    const base = { id: nextId(), type, ...structuredClone(PARTS[type].props ?? {}), ...props };
    return two ? { ...base, a: [p1[0] + x, p1[1] + y], b: [p2[0] + x, p2[1] + y] } : { ...base, at: [p1[0] + x, p1[1] + y], rot: p2 ?? 0 };
  });
}
