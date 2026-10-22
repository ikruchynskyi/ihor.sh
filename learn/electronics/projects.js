// The Part II builds (chapters 17–23): each circuit in the circuit lab's format, why every part is there, and where
// its legs go on a breadboard. Drawn and simulated by learn/build.js; learn/build.test.mjs checks that each breadboard
// joins exactly the pins its schematic joins, and the numbers the chapters quote.
//
// Parts: two-terminal ones run from a to b (a battery's or LED's a is its + or anode end); chips sit at `at`. The
// order of the list sets the names (the first resistor is R1). Grid squares, as in the lab.
const w = (a, b) => ({ type: "wire", a, b });
const gnd = (at) => ({ type: "ground", at });
const flag = (at, name) => ({ type: "flag", at, name });

// Chips as seen from above, for the pinout widget: pin → [name, what it wants in these builds].
export const CHIPS = {
  NE555: { name: "NE555", pkg: "dip8", pins: {
    1: ["GND", "Ground: the − of the supply."],
    2: ["TRIG", "Trigger: when it falls below ⅓ of VCC, the output goes high (and the discharge pin lets go). In the blinker it watches the timing capacitor."],
    3: ["OUT", "The output: near VCC or near 0 V, and strong: up to 200 mA either way. It drives the LED."],
    4: ["RESET", "Active low: pulled to 0 V it forces the output low and stops everything. Not used here, so it's tied to VCC. Left floating it can pick up noise and reset at random."],
    5: ["CONT", "Control: the ⅔ VCC threshold, brought out to a pin. Usually left alone. The datasheet's blinker leaves it open, with a note that a 0.01 µF capacitor to ground can improve operation by keeping noise off the threshold."],
    6: ["THRES", "Threshold: when it rises above ⅔ of VCC, the output goes low and the discharge pin shorts to ground. Joined to TRIG, it watches the same capacitor."],
    7: ["DISCH", "Discharge: an open-collector switch to ground, closed while the output is low. It empties the timing capacitor through R2."],
    8: ["VCC", "The supply: 4.5 V to 16 V for the NE555. A 0.1 µF ceramic capacitor from here to pin 1, right at the chip, is 'highly recommended' by its datasheet."],
  } },
};

export const P17 = {
  speed: 1,
  parts: [
    { type: "battery", a: [-3, 3], b: [-3, 6], v: 9 }, flag([-3, 3], "+9V"), gnd([-3, 6]),
    { type: "resistor", a: [5, 1], b: [5, 4], ohms: 10e3 }, flag([5, 1], "+9V"),
    { type: "resistor", a: [5, 4], b: [5, 7], ohms: 47e3 },
    w([5, 7], [5, 10]), { type: "capacitor", a: [5, 10], b: [5, 13], farads: 10e-6 }, gnd([5, 13]),
    w([5, 4], [8, 4]), w([8, 4], [8, 8]), w([8, 8], [12, 8]), // R1–R2 junction → DIS (7)
    w([5, 10], [10, 10]), w([10, 10], [10, 6]), w([10, 6], [12, 6]), w([12, 5], [12, 6]), // the capacitor → THR (6) and TRIG (2)
    { type: "timer555", at: [12, 4] },
    w([18, 5], [18, 6]), w([18, 5], [20, 5]), flag([20, 5], "+9V"), // VCC (8) and RESET (4) to +9 V
    w([18, 7], [22, 7]), { type: "resistor", a: [22, 7], b: [22, 10], ohms: 470 }, { type: "led", a: [22, 10], b: [22, 13], color: "red" }, gnd([22, 13]),
    w([18, 8], [18, 10]), gnd([18, 10]),
    w([-3, 3], [2, 3]), w([-3, 6], [2, 6]), { type: "capacitor", a: [2, 3], b: [2, 6], farads: 100e-9 }, // the bypass capacitor
  ],
  why: {
    BAT1: { name: "9 V battery", job: "The supply. The 555 runs on 4.5–16 V, so a 9 V battery is comfortably inside its range.", value: "Any 5–15 V source works and the blink rate stays the same (chapter 9: the supply cancels out of the timing). Only the LED's brightness changes.", ch: `<a href="./09-oscillators-and-timers.html">chapter 9</a>, and batteries sagging in <a href="./05-real-parts.html">chapter 5</a>` },
    R1: { name: "timing resistor", job: "Charges the capacitor from +9 V, together with R2. It also keeps pin 7 from shorting the supply: while the capacitor is being emptied, pin 7 is a switch to ground, and R1 is all that stands between +9 V and that switch.", value: "10 kΩ: 9 V / 10 kΩ = 0.9 mA through pin 7 while it discharges. The datasheet's own tests use 1 kΩ to 100 kΩ here.", without: "No charging path: the capacitor never fills, the 555 never reaches ⅔ of VCC, and the output stays high. The LED is on but never blinks.", remove: true, ch: `<a href="./09-oscillators-and-timers.html">chapter 9 §2</a>` },
    R2: { name: "timing resistor", job: "Sets how fast the capacitor charges (through R1 + R2) and how fast it empties (through R2 alone, into pin 7). Mostly R2 sets the blink rate.", value: "With R1 = 10 kΩ and C1 = 10 µF: high for 0.693 × 57 kΩ × 10 µF ≈ 0.40 s, low for 0.693 × 47 kΩ × 10 µF ≈ 0.33 s, about 1.4 blinks a second.", without: "Now nothing joins the capacitor to R1: it never charges, pins 2 and 6 stay near 0 V, below ⅓ of VCC, and the output stays high. The LED is on and never blinks. (R2 is also the only way the capacitor empties into pin 7.)", remove: true, ch: `<a href="./09-oscillators-and-timers.html">chapter 9 §2</a>` },
    C1: { name: "timing capacitor", job: "The bucket whose filling and emptying is the clock (chapter 2). Pins 2 and 6 watch its voltage go between ⅓ and ⅔ of VCC.", value: "An electrolytic: 10 µF is cheap and small that way. Its + leg goes to the pins-2/6 side, its stripe (−) to ground. Rated 16 V or more on a 9 V supply (chapter 5: half its rating or less, near enough).", without: "Nothing to charge: pins 2 and 6 swing straight to the end of the resistors and the 555 flips as fast as it can, far too fast to see. The LED just looks dimly lit.", remove: true, ch: `<a href="./02-capacitors-and-time.html">chapter 2</a>, types in <a href="./05-real-parts.html">chapter 5 §4</a>` },
    U1: { name: "NE555 timer", job: "Two comparators and a flip-flop (chapter 9). It compares the capacitor with ⅓ and ⅔ of its supply and flips its output, and its discharge switch, each time.", value: "The NE555 in an 8-pin DIP package: it fits a breadboard. The CMOS TLC555 is a drop-in that also runs from 2 V and draws less current.", ch: `<a href="./09-oscillators-and-timers.html">chapter 9 §2</a>` },
    R3: { name: "LED resistor", job: "Sets the LED's current, exactly as in chapter 1. The 555's output is a voltage source; without a resistor nothing limits the current.", value: "The output's high is about 1.7 V below VCC (datasheet), so about 7.3 V: (7.3 − 1.9) V / 470 Ω ≈ 11 mA, bright and safe.", without: "The LED connects straight to pin 3: the 555's output pushes far more than the LED's 30 mA limit. In the simulator it lights very bright (the lab's LED burns out above 30 mA); in real life the LED, or the 555, dies.", remove: false, ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §4</a>` },
    LED1: { name: "red LED", job: "The thing you see. Lit while pin 3 is high.", value: "Any color: re-size R3 for its forward voltage (chapter 1). Long leg (anode) toward R3.", ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §4</a>` },
    C2: { name: "bypass capacitor", job: "A tiny local bucket for the chip's supply (chapter 5's decoupling). Each time the 555 switches it gulps current for an instant; C2 covers the gulp so the supply at pin 8 doesn't dip.", value: "0.1 µF ceramic (marked 104), the value the datasheet names. On the schematic it can sit anywhere between +9 V and ground; on the board it goes as close to pins 8 and 1 as it can.", without: "The simulator doesn't notice: its wires have no length and no coil-like push-back. A real board does, and a 555's switching gulps are known for upsetting other chips on the same supply, and itself.", remove: true, ch: `<a href="./05-real-parts.html">chapter 5 §4</a>` },
  },
  bb: {
    cols: 24, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["T+2", "T-2"], box: [-34, 27], label: "9 V" },
      { kind: "wire", from: "T+1", to: "B+1", color: "red" }, { kind: "wire", from: "T-3", to: "B-3", color: "black" },
      { ref: "C2", kind: "cap", legs: ["T+10", "T-10"], note: "Straddling the two top rails, one column from the chip's supply wires: as close to pins 8 and 1 as a breadboard allows." },
      { ref: "U1", kind: "dip", at: 12, n: 8, label: "NE555", note: "Across the middle gap, notch to the left: pins 1–4 along row f, pins 5–8 back along row e. Each pin gets its own column of five holes." },
      { kind: "wire", from: "a12", to: "T+11", color: "red" }, // pin 8 VCC
      { kind: "wire", from: "j12", to: "B-11", color: "black" }, // pin 1 GND
      { kind: "wire", from: "j15", to: "B+15", color: "red" }, // pin 4 RESET
      { ref: "R1", kind: "res", legs: ["T+13", "a13"], note: "From the + rail straight into pin 7's column." },
      { ref: "R2", kind: "res", legs: ["b13", "b19"], note: "From pin 7's column to column 19, which a jumper joins to pin 6." },
      { kind: "wire", from: "a14", to: "a19", color: "yellow" }, // pin 6 → R2's far end
      { kind: "wire", from: "d14", to: "g13", color: "yellow" }, // pin 6 ↔ pin 2, hopping over the chip
      { ref: "C1", kind: "ecap", legs: ["h13", "B-13"], note: "+ leg in pin 2's column, striped − leg in the ground rail." },
      { ref: "R3", kind: "res", legs: ["i14", "i20"] },
      { ref: "LED1", kind: "led", legs: ["j20", "B-20"], note: "Long leg (anode, +) in R3's column, short leg in the ground rail." },
    ],
  },
};

CHIPS.LM7805 = { name: "LM7805", pkg: "to220", pins: {
  1: ["IN", "The unregulated input: at least 2 V above the 5 V output (its dropout), at most 35 V. A 0.22 µF capacitor to ground here if the regulator is far from the supply's own filter capacitor."],
  2: ["GND", "Ground, and the reference the 5 V is measured from. The metal tab is joined to this pin too. If this pin comes loose, the output rises toward the input voltage, so it must be solid."],
  3: ["OUT", "5 V, from 4.8 to 5.2 V across loads up to 1 A. A 0.1 µF capacitor here isn't needed for stability, but helps it answer sudden changes in load."],
} };
CHIPS.MCP1700 = { name: "MCP1700", pkg: "to92", pins: {
  1: ["GND", "Ground. Note the order: not the 7805's. Every regulator's pinout is its own; look it up, every time."],
  2: ["VIN", "2.3 V to 6.0 V in, and never above 6.5 V (absolute maximum). A 1 µF ceramic capacitor to ground right here."],
  3: ["VOUT", "3.3 V, up to 250 mA, with as little as 0.18 V of headroom. It needs a 1 µF ceramic capacitor to stay stable: this one isn't optional."],
} };

export const P18 = {
  speed: 0.05,
  parts: [
    { type: "battery", a: [0, 3], b: [0, 6], v: 9 }, gnd([0, 6]),
    w([0, 3], [0, 1]), { type: "diode", a: [0, 1], b: [3, 1], model: "1N4007 (rectifier)" }, w([3, 1], [5, 1]),
    { type: "capacitor", a: [4, 1], b: [4, 4], farads: 0.22e-6 }, gnd([4, 4]),
    { type: "reg7805", at: [5, 1] }, gnd([7, 3]),
    w([9, 1], [21, 1]), flag([12, 1], "+5V"),
    { type: "capacitor", a: [10, 1], b: [10, 4], farads: 0.1e-6 }, gnd([10, 4]),
    { type: "resistor", a: [14, 1], b: [14, 4], ohms: 1e3 }, { type: "led", a: [14, 4], b: [14, 7], color: "green" }, gnd([14, 7]),
    { type: "capacitor", a: [19, 1], b: [19, 4], farads: 1e-6 }, gnd([19, 4]),
    { type: "ldo1700", at: [21, 1] }, gnd([23, 3]),
    w([25, 1], [30, 1]), flag([30, 1], "+3.3V"),
    { type: "capacitor", a: [27, 1], b: [27, 4], farads: 1e-6 }, gnd([27, 4]),
  ],
  why: {
    BAT1: { name: "9 V battery (or a 9–12 V adapter)", job: "The raw supply. It sags as it empties (chapter 5), and an adapter's voltage moves with its load; the regulators turn either into exact voltages.", value: "Anything from about 7.7 V (the 7805's 5 V + 2 V dropout + the diode's 0.7 V) to the 7805's 35 V maximum, though more volts in means more heat (section 2)." },
    D1: { name: "1N4007 protection diode", job: "Reverse-polarity protection. Clip the battery on backwards and the diode blocks (chapter 4's one-way valve): nothing flows, nothing breaks.", value: "The 1N4007 takes 1 A and blocks 1000 V, plenty. Its price is the voltage it drops while conducting: about 0.7 V at this build's few milliamps, more at higher currents (its datasheet allows up to 1.1 V at 1 A). A Schottky (1N5819) loses only about 0.3 V.", without: "In the simulator, nothing changes but a little more voltage reaches the 7805. On the bench, the first battery clipped on backwards puts −9 V across every chip on the board.", remove: true, ch: `<a href="./04-diodes-and-transistors.html">chapter 4 §1</a>` },
    C1: { name: "input capacitor", job: "Keeps the 7805's input steady at high frequencies. Its datasheet measures everything with 0.22 µF on the input, and asks for it whenever the regulator is more than a few inches from the supply's own filter capacitor: a battery on long leads counts.", value: "0.22 µF ceramic (marked 224), 25 V or more.", remove: true, ch: `<a href="./05-real-parts.html">chapter 5 §4</a>` },
    U1: { name: "LM7805 5 V regulator", job: "Chapter 10's linear regulator in a TO-220 package: an op-amp and a transistor holding the output at 5 V. Whatever voltage is left over, times the current, becomes heat.", value: "Up to 1.5 A with a heatsink; 2 V dropout; 35 V maximum input; shuts itself down above 150 °C inside.", ch: `<a href="./10-power-supplies.html">chapter 10 §1</a>` },
    C2: { name: "output capacitor", job: "Helps the 7805 answer sudden changes of load (its datasheet: not needed for stability, but it helps). And it's the first bypass capacitor of everything on the 5 V rail.", value: "0.1 µF ceramic (104).", remove: true },
    R1: { name: "LED resistor", job: "Sets the power LED's current: (5 − 2.1) V / 1 kΩ ≈ 3 mA, plenty to see, and little enough not to matter in the power budget.", ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §4</a>` },
    LED1: { name: "green power LED", job: "Tells you at a glance that the 5 V rail is up. The cheapest debugging tool on the board." },
    C3: { name: "input capacitor for the MCP1700", job: "The MCP1700's datasheet asks for 1 µF ceramic at its input. It's a local bucket for the regulator, which may be far down the 5 V rail from C2.", value: "1 µF ceramic, 10 V or more.", remove: true },
    U2: { name: "MCP1700-3.3 regulator", job: "A low-dropout (LDO) linear regulator: 3.3 V out from as little as about 3.5 V in. It burns only (5 − 3.3) × I, from the 5 V rail instead of from 9 V.", value: "Fed from the 5 V rail on purpose: its input may not exceed 6.5 V (absolute maximum), so from 9 V it would be destroyed. Chaining also splits the heat between two packages.", ch: `<a href="./10-power-supplies.html">chapter 10 §1</a>` },
    C4: { name: "output capacitor for the MCP1700", job: "Required: the MCP1700 is only stable with at least 1 µF on its output, and its datasheet's whole design assumes a ceramic one.", value: "1 µF ceramic, 10 V or more.", remove: true },
  },
  bb: {
    cols: 24, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["a2", "T-2"], box: [-34, 27], label: "9 V" },
      { kind: "wire", from: "T-3", to: "B-3", color: "black" },
      { ref: "D1", kind: "diode", legs: ["b2", "b7"], note: "The banded end (the cathode) toward the regulator." },
      { ref: "U1", kind: "to220", legs: ["d7", "d8", "d9"], numbered: true, label: "7805", note: "Printed side facing you, legs down: 1 IN, 2 GND, 3 OUT, left to right." },
      { ref: "C1", kind: "cap", legs: ["e7", "e8"] },
      { kind: "wire", from: "a8", to: "T-8", color: "black" }, { kind: "wire", from: "a9", to: "T+9", color: "red" },
      { ref: "C2", kind: "cap", legs: ["T+10", "T-10"] },
      { ref: "R1", kind: "res", legs: ["T+13", "a13"] }, { ref: "LED1", kind: "led", legs: ["b13", "b15"] }, { kind: "wire", from: "a15", to: "T-15", color: "black" },
      { ref: "U2", kind: "to92", legs: ["h20", "h21", "h22"], numbered: true, label: "1700", note: "Flat face toward you, legs down: 1 GND, 2 VIN, 3 VOUT. Not the 7805's order." },
      { kind: "wire", from: "j20", to: "B-20", color: "black" }, { kind: "wire", from: "T+21", to: "g21", color: "red" }, { kind: "wire", from: "j22", to: "B+22", color: "orange" },
      { ref: "C3", kind: "cap", legs: ["i21", "i20"] },
      { ref: "C4", kind: "cap", legs: ["B+23", "B-23"] },
    ],
  },
};

CHIPS.CD4017 = { name: "CD4017B", pkg: "dip16", pins: {
  1: ["Q5", "Output 5: high during the 6th count."], 2: ["Q1", "Output 1."], 3: ["Q0", "Output 0: high after a reset. Note: Q0 is pin 3, not pin 1. Outputs are numbered by count, pins by position, and the two orders have nothing to do with each other."],
  4: ["Q2", "Output 2."], 5: ["Q6", "Output 6."], 6: ["Q7", "Output 7."], 7: ["Q3", "Output 3."],
  8: ["VSS", "Ground. CMOS chips call the negative supply VSS and the positive VDD."],
  9: ["Q8", "Output 8."], 10: ["Q4", "Output 4."], 11: ["Q9", "Output 9: after it, the count wraps around to Q0."],
  12: ["CO", "Carry out: high for the first five counts, low for the last five; a slower clock for the next counter in a chain. Unused here; outputs may be left open."],
  13: ["INH", "Clock inhibit: while it's high the count freezes. An input: it must be tied to VSS (ground) to count, never left floating."],
  14: ["CLK", "The clock: the count moves on at each rising edge. It has a Schmitt trigger inside (chapter 7's hysteresis), so a slow or noisy edge still counts once."],
  15: ["RST", "Reset: high sends the count back to Q0 and holds it there. An input: tie it to VSS to run freely."],
  16: ["VDD", "The supply: 3 to 18 V. A 0.1 µF bypass capacitor to pin 8, as for every chip."],
} };

const LEDS19 = Array.from({ length: 10 }, (_, k) => ({ type: "led", a: [30, 3 + k], b: [33, 3 + k], color: "red", nolabel: true }));
export const P19 = {
  speed: 1,
  parts: [
    { type: "battery", a: [-3, 3], b: [-3, 6], v: 9 }, flag([-3, 3], "+9V"), gnd([-3, 6]),
    { type: "resistor", a: [5, 1], b: [5, 4], ohms: 10e3 }, flag([5, 1], "+9V"),
    { type: "resistor", a: [5, 4], b: [5, 7], ohms: 68e3 },
    w([5, 7], [5, 10]), { type: "capacitor", a: [5, 10], b: [5, 13], farads: 2.2e-6 }, gnd([5, 13]),
    w([5, 4], [8, 4]), w([8, 4], [8, 8]), w([8, 8], [12, 8]),
    w([5, 10], [10, 10]), w([10, 10], [10, 6]), w([10, 6], [12, 6]), w([12, 5], [12, 6]),
    { type: "timer555", at: [12, 4] },
    w([18, 5], [18, 6]), w([18, 5], [20, 5]), flag([20, 5], "+9V"),
    w([18, 8], [18, 10]), gnd([18, 10]),
    w([18, 7], [21, 7]), w([21, 7], [21, 3]), w([21, 3], [24, 3]), // 555 OUT (3) → 4017 CLK (14)
    { type: "counter4017", at: [24, 2] },
    w([24, 4], [23, 4]), w([23, 4], [23, 6]), w([24, 5], [23, 5]), gnd([23, 6]), // RST (15) and INH (13) to ground
    flag([27, 1], "+9V"), gnd([27, 14]),
    ...LEDS19, w([33, 3], [33, 13]), { type: "resistor", a: [33, 13], b: [33, 16], ohms: 1e3 }, gnd([33, 16]),
    w([-3, 3], [2, 3]), w([-3, 6], [2, 6]), { type: "capacitor", a: [2, 3], b: [2, 6], farads: 100e-9 }, // bypass for both chips
  ],
  why: {
    BAT1: { name: "9 V battery", job: "The supply for both chips. 9 V, not 5 V, on purpose: section 4 shows why the 555's high is only a reliable 1 for the 4017 above about 7.5 V." },
    R1: { name: "timing resistor", job: "Chapter 17's R1: charges C1 and limits pin 7's current.", ch: `<a href="./17-first-build-555.html">chapter 17</a>` },
    R2: { name: "timing resistor", job: "Sets the step rate with C1: 1.44 / ((10 k + 2 × 68 k) × 2.2 µF) ≈ 4.5 steps a second, the whole row in about 2.2 s.", remove: true, without: "No clock: the 555's output stays high, the 4017 sees one rising edge and stops on Q1." },
    C1: { name: "timing capacitor", job: "The 555's timing bucket, as in chapter 17. Smaller than there (2.2 µF), so the clock runs faster.", remove: true },
    U1: { name: "NE555 timer (the clock)", job: "Makes the square wave that steps the counter. Its output, pin 3, is now another chip's input, which is the new question of this build (section 4).", ch: `<a href="./17-first-build-555.html">chapter 17</a>` },
    U2: { name: "CD4017B decade counter", job: "Counts rising edges on CLK and makes exactly one of its ten outputs high: Q0, then Q1… Q9, then Q0 again. Inside, chapter 12's flip-flops count, and gates decode the count into ten lines.", value: "The B-series CMOS part runs from 3 to 18 V, so it can share the 555's 9 V.", ch: `<a href="./12-gates-to-a-computer.html">chapter 12 §6</a>` },
    R3: { name: "shared LED resistor", job: "One resistor for all ten LEDs, from their joined cathodes to ground. It works only because exactly one output is high at a time, so exactly one LED conducts (section 6).", value: "1 kΩ: about (9 − 1.9) V / (1 kΩ + the output's own ~220 Ω) ≈ 5.8 mA, as the simulator finds.", without: "Every LED's cathode floats: no current, no light.", remove: true },
    C2: { name: "bypass capacitor", job: "The datasheets' bypass, as in chapter 17. One at each chip's supply pins is the rule on a real board.", remove: true },
    ...Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`LED${k + 1}`, { name: `LED on Q${k}`, job: `Lit while output Q${k} is high: the ${["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"][k]} of every ten clock edges.` }])),
  },
  bb: {
    cols: 30, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["T+3", "T-4"], box: [-34, 27], label: "9 V" },
      { kind: "wire", from: "T+1", to: "B+1", color: "red" },
      { ref: "C2", kind: "cap", legs: ["T+8", "T-8"] },
      { ref: "U1", kind: "dip", at: 4, n: 8, label: "NE555" },
      { kind: "wire", from: "a4", to: "T+4", color: "red" }, { kind: "wire", from: "h4", to: "T-2", color: "black" }, { kind: "wire", from: "j7", to: "B+7", color: "red" },
      { ref: "R1", kind: "res", legs: ["T+5", "a5"] }, { ref: "R2", kind: "res", legs: ["b5", "b9"] }, { kind: "wire", from: "a9", to: "a6", color: "yellow" },
      { kind: "wire", from: "d6", to: "g5", color: "yellow" },
      { ref: "C1", kind: "ecap", legs: ["c6", "T-7"] },
      { kind: "wire", from: "i6", to: "c16", color: "blue" }, // the clock: 555 pin 3 → 4017 pin 14
      { ref: "U2", kind: "dip", at: 14, n: 16, label: "CD4017B" },
      { kind: "wire", from: "a14", to: "T+14", color: "red" }, { kind: "wire", from: "a15", to: "T-15", color: "black" }, { kind: "wire", from: "a17", to: "T-17", color: "black" },
      { kind: "wire", from: "g21", to: "d22", color: "black" }, { kind: "wire", from: "a22", to: "T-22", color: "black" },
      { kind: "wire", from: "c20", to: "h23", color: "green" }, { kind: "wire", from: "b19", to: "h25", color: "green" }, { kind: "wire", from: "b21", to: "h26", color: "green" },
      { ref: "LED1", kind: "led", legs: ["j16", "B-15"] }, { ref: "LED2", kind: "led", legs: ["j15", "B-14"] }, { ref: "LED3", kind: "led", legs: ["j17", "B-16"] },
      { ref: "LED4", kind: "led", legs: ["j20", "B-20"] }, { ref: "LED5", kind: "led", legs: ["j23", "B-23"] }, { ref: "LED6", kind: "led", legs: ["j14", "B-13"] },
      { ref: "LED7", kind: "led", legs: ["j18", "B-17"] }, { ref: "LED8", kind: "led", legs: ["j19", "B-19"] }, { ref: "LED9", kind: "led", legs: ["j26", "B-26"] }, { ref: "LED10", kind: "led", legs: ["j25", "B-25"] },
      { ref: "R3", kind: "res", legs: ["B-27", "i28"], note: "Here the bottom blue rail isn't ground: it's the ten LEDs' shared cathode node, and R3 joins it to ground through the jumper from column 28. A rail is just a long strip; red and blue are only a habit." },
      { kind: "wire", from: "f28", to: "T-28", color: "black" },
    ],
  },
};

CHIPS.LM393 = { name: "LM393", pkg: "dip8", pins: {
  1: ["OUT A", "Comparator A's output: open collector. It can only pull down to ground (when IN− A is above IN+ A); otherwise it lets go and a pull-up resistor must make it high. It sinks at least 6 mA."],
  2: ["IN− A", "Comparator A's inverting input: here, the reference from the trim pot."],
  3: ["IN+ A", "Comparator A's non-inverting input: here, the light sensor's divider. Inputs work from 0 V to VCC − 1.5 V; the datasheet adds that one input may go above that as long as the other stays inside."],
  4: ["GND", "Ground."],
  5: ["IN+ B", "Comparator B, unused. Its inputs mustn't float: pin 5 goes to ground…"],
  6: ["IN− B", "…and pin 6 to +12 V, so B's IN− is always higher and its output sits still, pulled low. (Pin 6 is above the input range, which the datasheet allows because pin 5 is inside it.)"],
  7: ["OUT B", "Comparator B's output, unused: an output may be left open."],
  8: ["VCC", "2 V to 36 V. A 0.1 µF bypass capacitor to pin 4."],
} };
CHIPS.IRLZ44N = { name: "IRLZ44N", pkg: "to220", pins: {
  1: ["G", "Gate: the handle (chapter 4). Fully on at 5 V and above (0.025 Ω at 5 V); here it gets the full 12 V through the pull-up, well inside its ±16 V limit."],
  2: ["D", "Drain: the load's current comes in here, from the LED strip's − wire. The metal tab is the drain too."],
  3: ["S", "Source: to ground."],
} };

export const P20 = {
  speed: 1,
  parts: [
    { type: "battery", a: [-6, 3], b: [-6, 6], v: 12 }, flag([-6, 3], "+12V"), gnd([-6, 6]),
    { type: "resistor", a: [2, 1], b: [2, 4], ohms: 15e3 }, flag([2, 1], "+12V"),
    { type: "ldr", a: [2, 4], b: [2, 7], lux: 100 }, gnd([2, 7]),
    w([2, 4], [5, 4]), w([5, 4], [5, 5]), w([5, 5], [8, 5]), // the sensor → IN+ (3)
    { type: "pot", at: [6, 1], rot: 3, ohms: 10e3, pos: 50 }, gnd([6, 1]), flag([6, -3], "+12V"), w([8, -1], [8, 3]), // the reference → IN− (2)
    { type: "lm393", at: [8, 4] }, flag([10, 2], "+12V"), gnd([10, 6]),
    w([12, 4], [13, 4]), w([13, 4], [16, 4]),
    { type: "resistor", a: [14, 1], b: [14, 4], ohms: 10e3 }, flag([14, 1], "+12V"), // pull-up
    w([13, 4], [13, 8]), { type: "resistor", a: [13, 8], b: [10, 8], ohms: 100e3 }, w([10, 8], [5, 8]), w([5, 8], [5, 5]), // hysteresis
    { type: "nmos", at: [16, 4], model: "IRLZ44N (logic level)" }, gnd([18, 6]),
    { type: "lamp", a: [18, -1], b: [18, 2], volts: 12, watts: 12 }, flag([18, -1], "+12V"),
    w([-6, 3], [-2, 3]), w([-6, 6], [-2, 6]), { type: "capacitor", a: [-2, 3], b: [-2, 6], farads: 100e-9 },
  ],
  why: {
    BAT1: { name: "12 V adapter", job: "The supply: the LED strip needs 12 V, and the LM393 runs happily on it (2–36 V), so one supply does everything. No regulator: nothing here needs an exact voltage, because every threshold is a ratio of the same 12 V.", value: "A 12 V adapter rated for the strip's current plus a margin: 1 A strip, 1.5–2 A adapter." },
    R1: { name: "fixed divider resistor", job: "The top of chapter 1's divider; the LDR is the bottom. Their middle, the sensor voltage, rises as it gets darker.", value: "15 kΩ: the LDR's resistance at dusk (about 10 lux). Matching them puts the sensor voltage at half the supply exactly where the decision happens, where it changes fastest with light (section 2).", ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §2</a>` },
    LDR1: { name: "light sensor (GL5528 LDR)", job: "A resistor that light lowers: about 15 kΩ at dusk, 1 MΩ in the dark, a few kilohms in daylight. Drag the light slider in section 2 and watch the strip.", ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §2</a>` },
    RV1: { name: "10 kΩ trim pot (the threshold)", job: "A divider you can turn: its wiper sets the reference on IN−, so it sets how dark is dark. Every LDR differs (its datasheet allows 10–20 kΩ at 10 lux), so the threshold must be adjustable: this is the circuit's calibration knob.", value: "Middle position: 6 V, half the supply." },
    U1: { name: "LM393 comparator", job: "Chapter 7's comparator, in a chip made for the job: it answers \"is IN+ above IN−?\" Its output is open collector: a transistor that can only pull down. Above: it lets go. Below: it pulls the gate to ground.", ch: `<a href="./07-op-amps.html">chapter 7 §5</a>` },
    R2: { name: "pull-up resistor", job: "The open-collector output can't make a high by itself; R2 does, pulling the MOSFET's gate up to 12 V whenever the comparator lets go. Chapter 13's I²C pull-ups, again.", value: "10 kΩ: 1.2 mA when the comparator pulls down, well inside the 6 mA it can sink.", without: "Nothing ever lifts the gate: the comparator can pull down, but nobody pulls up. The strip never turns on.", remove: true, ch: `<a href="./13-microcontrollers-and-buses.html">chapter 13 §5</a>` },
    R3: { name: "hysteresis resistor", job: "Positive feedback, chapter 7's hysteresis: once the strip is on, R3 nudges the sensor voltage up, so it takes noticeably more light to turn it off than it took darkness to turn it on. Without it the strip flickers at dusk, as the light wavers across one exact threshold.", value: "100 kΩ: on below about 8 lux, off above about 12 (section 4).", without: "One threshold for both directions: at dusk the light wavers across it and the strip flickers.", remove: true, ch: `<a href="./07-op-amps.html">chapter 7 §5</a>` },
    Q1: { name: "IRLZ44N MOSFET", job: "The switch for the strip's amp (chapter 4). The comparator can sink a few milliamps at most; the strip wants 1 A.", value: "Fully on at 5 V on its gate (0.025 Ω), and here it gets 12 V: at 1 A it burns 1² × 0.025 = 0.025 W. Cool, no heatsink.", ch: `<a href="./04-diodes-and-transistors.html">chapter 4 §3–4</a>` },
    LP1: { name: "12 V LED strip (drawn as a lamp)", job: "The load: a 12 V LED strip with its own built-in resistors. The simulator models it as a 12 Ω load, 1 A at 12 V; check your strip's watts per meter.", value: "Its − wire goes to the MOSFET's drain, its + wire to +12 V: the MOSFET switches the ground side (\"low side\")." },
    C1: { name: "bypass capacitor", job: "The LM393's bypass. A comparator switches fast and can ring through its own supply; 0.1 µF beside it keeps that local.", remove: true },
  },
  bb: {
    cols: 30, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["T+2", "T-2"], box: [-34, 27], label: "12 V" },
      { kind: "wire", from: "T+1", to: "B+1", color: "red" }, { kind: "wire", from: "T-4", to: "B-4", color: "black" },
      { ref: "C1", kind: "cap", legs: ["T+9", "T-9"] },
      { ref: "U1", kind: "dip", at: 10, n: 8, label: "LM393" },
      { kind: "wire", from: "a10", to: "T+10", color: "red" }, { kind: "wire", from: "j13", to: "B-13", color: "black" },
      { kind: "wire", from: "a13", to: "T-13", color: "black" }, { kind: "wire", from: "a12", to: "T+11", color: "red" }, // comparator B's inputs, tied
      { ref: "R1", kind: "res", legs: ["B+13", "j12"] }, { ref: "LDR1", kind: "ldr", legs: ["i12", "B-11"] },
      { ref: "RV1", kind: "pot", legs: ["c6", "c8", "c7"], note: "Legs A, wiper, B in three neighboring columns: A (to ground) in 6, the wiper in 7, B (to +12 V) in 8." },
      { kind: "wire", from: "a6", to: "T-5", color: "black" }, { kind: "wire", from: "a8", to: "T+8", color: "red" }, { kind: "wire", from: "d7", to: "g11", color: "yellow" },
      { ref: "R2", kind: "res", legs: ["B+10", "j10"] }, { ref: "R3", kind: "res", legs: ["h10", "h12"] },
      { kind: "wire", from: "g10", to: "g20", color: "blue" },
      { ref: "Q1", kind: "to220", legs: ["h20", "h21", "h22"], label: "IRLZ44N", note: "Printed side facing you: G, D, S, left to right." },
      { kind: "wire", from: "j22", to: "B-22", color: "black" },
      { ref: "LP1", kind: "off", legs: ["T+21", "j21"], box: [560, 140], label: "LED strip" },
    ],
  },
};

CHIPS.LM386 = { name: "LM386N-1", pkg: "dip8", pins: {
  1: ["GAIN", "Gain setting. Open (with pin 8 open), the gain is 20. A 10 µF capacitor from here to pin 8 makes it 200; 1.2 kΩ in series with that capacitor, 50."],
  2: ["−IN", "The inverting input, 50 kΩ to ground inside. Unused here: grounded, as the datasheet suggests when the source is low resistance."],
  3: ["+IN", "The input, 50 kΩ to ground inside. It must stay within ±0.4 V (absolute maximum), which is one reason the volume control comes first."],
  4: ["GND", "Ground."],
  5: ["VOUT", "The output: it sits at half the supply with no signal, and swings around that. Never connect a speaker straight here: it goes through a big capacitor."],
  6: ["VS", "The supply: 4–12 V for the -1 version. A capacitor to ground close to this pin."],
  7: ["BYPASS", "An internal bias point; a 10 µF capacitor to ground here quiets supply hum (the datasheet measures its 50 dB supply rejection with one). Optional in the minimum circuit."],
  8: ["GAIN", "The other gain-setting pin (see pin 1)."],
} };

export const P21 = {
  speed: 0.005,
  parts: [
    { type: "battery", a: [-2, 8], b: [-2, 11], v: 5 }, flag([-2, 8], "+5V"), gnd([-2, 11]),
    { type: "source", a: [0, 2], b: [0, 5], wave: "sine", freq: 440, amp: 0.1 }, gnd([0, 5]),
    w([0, 2], [0, 1]), w([0, 1], [4, 1]),
    { type: "pot", at: [4, 5], rot: 3, ohms: 10e3, pos: 50 }, gnd([4, 5]), // the volume: B gets the signal, A is ground
    w([6, 3], [6, 5]), w([6, 5], [8, 5]), w([8, 3], [7, 3]), gnd([7, 3]),
    { type: "lm386", at: [8, 4], gain: 20 }, flag([10, 2], "+5V"), gnd([10, 6]),
    w([12, 4], [13, 4]), w([13, 4], [14, 4]),
    { type: "capacitor", a: [14, 4], b: [17, 4], farads: 220e-6 }, w([17, 4], [19, 4]),
    { type: "speaker", a: [19, 4], b: [19, 7], ohms: 8 }, gnd([19, 7]),
    { type: "resistor", a: [13, 4], b: [13, 7], ohms: 10 }, { type: "capacitor", a: [13, 7], b: [13, 10], farads: 47e-9 }, gnd([13, 10]),
    w([-2, 8], [3, 8]), w([-2, 11], [3, 11]), { type: "capacitor", a: [3, 8], b: [3, 11], farads: 100e-9 },
  ],
  why: {
    BAT1: { name: "the 5 V rail", job: "The supply, from chapter 18's 5 V rail (a 9 V battery's sag and resistance would make the bass thump the supply). The LM386N-1 runs on 4–12 V; more volts give more output before clipping.", ch: `<a href="./18-power-supply.html">chapter 18</a>` },
    V1: { name: "the audio input (a phone, say)", job: "The signal: here a 440 Hz tone, 0.1 V peak, standing in for a phone's headphone output. Its other wire is ground: the phone and the amplifier must share one." },
    RV1: { name: "10 kΩ volume pot", job: "A divider you turn (chapter 1): the wiper passes on a fraction of the input. It's first in line on purpose: the LM386's input may not exceed ±0.4 V (absolute maximum), and with a gain of 20 anything above about 0.09 V peak clips on 5 V anyway (section 5).", value: "10 kΩ, the datasheet's own value: low enough that the input's 50 kΩ inside barely loads it, high enough not to burden the phone. A \"log\" (audio-taper) pot sounds more even than a linear one.", ch: `<a href="./01-voltage-current-resistance.html">chapter 1 §2</a>` },
    U1: { name: "LM386N-1 power amplifier", job: "A whole small amplifier in 8 pins (chapter 16's class AB inside): gain 20 out of the box, an output that centers itself at half the supply, and enough current for a small speaker.", value: "The datasheet's typical: 325 mW into 8 Ω on 6 V, at 10% distortion. On 5 V, less (section 5).", ch: `<a href="./16-audio.html">chapter 16 §3</a>` },
    C1: { name: "output capacitor", job: "Passes the music and blocks the DC. The output sits at 2.5 V with no sound at all; the capacitor charges to that once and then passes only the wiggle, so the speaker sees the signal centered on 0 V.", value: "220 µF electrolytic, 16 V+: the datasheet draws 250 µF, which isn't a standard value. With the 8 Ω speaker it's a high-pass (section 4): 1/(2π × 8 Ω × 220 µF) ≈ 90 Hz.", without: "2.5 V of DC sits across the 8 Ω coil: about 0.31 A flows all the time, heating the coil by about 0.75 W and holding the cone pushed off-center, while the music rides on top. Replace it with a wire and watch the speaker's current.", remove: "short", ch: `<a href="./02-capacitors-and-time.html">chapter 2 §3</a>, <a href="./08-filters.html">chapter 8 §1</a>` },
    LS1: { name: "8 Ω speaker", job: "Chapter 16's coil on a cone. Small (0.5 W, 8 Ω) is plenty for this amp.", ch: `<a href="./16-audio.html">chapter 16 §4</a>` },
    R1: { name: "10 Ω (half of the output network)", job: "With C2, the 10 Ω + 0.05 µF network the datasheet draws on the output in every circuit. It keeps the amplifier's load from rising at very high frequencies, where a speaker's coil (and its leads) look less and less like 8 Ω (section 6).", remove: true },
    C2: { name: "47 nF (the other half)", job: "The datasheet's 0.05 µF; 47 nF is the nearest standard value. At audio frequencies it's nearly open (about 3.4 kΩ at 1 kHz), so it takes no music; far above audio it's nearly a short, leaving the 10 Ω as the load.", remove: true },
    C3: { name: "supply bypass capacitor", job: "The datasheet asks for a capacitor to ground close to pin 6. A power amplifier pulls its supply current in time with the music; this covers the fast part locally. A 100 µF electrolytic beside it covers the bass.", remove: true },
  },
  bb: {
    cols: 24, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["T+2", "T-2"], box: [-34, 27], label: "5 V" },
      { kind: "wire", from: "T-3", to: "B-3", color: "black" },
      { ref: "C3", kind: "cap", legs: ["T+9", "T-9"] },
      { ref: "U1", kind: "dip", at: 10, n: 8, label: "LM386" },
      { kind: "wire", from: "a12", to: "T+11", color: "red" }, { kind: "wire", from: "j13", to: "B-13", color: "black" }, { kind: "wire", from: "j11", to: "B-11", color: "black" },
      { ref: "RV1", kind: "pot", legs: ["h5", "h7", "h6"], note: "Legs A (ground), wiper, B (signal in) in columns 5, 6, 7." },
      { kind: "wire", from: "j5", to: "B-5", color: "black" }, { kind: "wire", from: "g6", to: "g12", color: "yellow" },
      { ref: "V1", kind: "off", legs: ["j7", "B-8"], box: [40, 330], label: "phone" },
      { ref: "R1", kind: "res", legs: ["c13", "c15"] }, { ref: "C2", kind: "cap", legs: ["b15", "T-15"] },
      { ref: "C1", kind: "ecap", legs: ["d13", "d18"], note: "+ leg toward the amplifier's output (it sits at 2.5 V), − toward the speaker." },
      { ref: "LS1", kind: "off", legs: ["a18", "T-17"], box: [480, 150], label: "speaker" },
    ],
  },
};

export const P22 = {
  noLab: true, // nothing to simulate: the lab has no microcontroller
  parts: [
    { type: "module", at: [0, 0], title: "ESP32 dev board", w: 7, left: [], right: ["3V3", null, "GPIO21", null, "GPIO22", null, "GND"] },
    w([7, 1], [9, 1]), flag([9, 1], "+3.3V"), w([7, 3], [9, 3]), flag([9, 3], "SDA"), w([7, 5], [9, 5]), flag([9, 5], "SCL"), w([7, 7], [9, 7]), gnd([9, 7]),
    { type: "module", at: [14, 0], title: "BME280", w: 6, left: ["VCC", null, "GND", null, null, "SCL", null, "SDA", null, "CSB", null, "SDO"], right: [] },
    w([14, 1], [12, 1]), flag([12, 1], "+3.3V"), w([14, 3], [12, 3]), gnd([12, 3]), w([14, 6], [12, 6]), flag([12, 6], "SCL"), w([14, 8], [12, 8]), flag([12, 8], "SDA"),
    w([14, 10], [12, 10]), flag([12, 10], "+3.3V"), w([14, 12], [12, 12]), gnd([12, 12]),
    { type: "module", at: [25, 0], title: "OLED 128×64", w: 7, left: ["GND", null, null, "VCC", null, "SCL", null, "SDA"], right: [] },
    w([25, 1], [23, 1]), gnd([23, 1]), w([25, 4], [23, 4]), flag([23, 4], "+3.3V"), w([25, 6], [23, 6]), flag([23, 6], "SCL"), w([25, 8], [23, 8]), flag([23, 8], "SDA"),
    flag([0, 11], "+3.3V"), { type: "resistor", a: [0, 11], b: [3, 11], ohms: 4.7e3 }, flag([3, 11], "SDA"),
    flag([0, 15], "+3.3V"), { type: "resistor", a: [0, 15], b: [3, 15], ohms: 4.7e3 }, flag([3, 15], "SCL"),
  ],
  why: {
    U1: { name: "ESP32 dev board", job: "The brains: an ESP32 module (the chip, its flash memory and an antenna under a metal can) on a board that adds a USB-to-serial chip for programming, a 3.3 V regulator fed from USB's 5 V, and two buttons. You power and program it through one USB cable.", value: "Any ESP32 board works; its 3V3 pin can also feed small modules like these two." },
    U2: { name: "BME280 breakout", job: "Temperature, humidity and air pressure in one sensor, on a small board that brings its pins out to a header. It speaks I²C (chapter 13).", value: "The bare sensor runs on 1.71–3.6 V and is destroyed above 4.25 V: power it from 3.3 V. CSB tied high selects I²C; SDO picks the address: to ground it's 0x76, to 3.3 V it's 0x77." },
    U3: { name: "128×64 OLED display", job: "A small screen with an SSD1306 driver chip on it, also on I²C, at address 0x3C (0x3D with a jumper on some boards). Two devices, two different addresses: they share the two wires." },
    R1: { name: "SDA pull-up", job: "I²C lines are open drain (chapter 13): every device can only pull them low, so a resistor pulls each one high. One pull-up per line for the whole bus.", value: "4.7 kΩ to 3.3 V: low enough for fast-mode edges on a short bus (section 4), high enough that a device pulling low sinks only 0.7 mA. Many breakouts carry their own: count them before adding these." },
    R2: { name: "SCL pull-up", job: "The same for the clock line." },
  },
  bb: {
    cols: 24, margin: 90,
    parts: [
      { ref: "U1", kind: "off", legs: ["B+1", "j20", "j22", "B-2"], box: [-44, 300], label: "ESP32", colors: ["#d33", "#36c", "#db0", "#222"], note: "The dev board sits off the breadboard on four jumper wires (3V3, GPIO21, GPIO22, GND): wide boards cover most of a breadboard's holes, so this is the easy way." },
      { kind: "wire", from: "B-3", to: "T-3", color: "black" },
      { ref: "U2", kind: "module", legs: ["a3", "a4", "a5", "a6", "a7", "a8"], label: "BME280", note: "Its header plugged into row a, one strip per pin; the little board leans over the top edge. Pin order is printed on it, and varies between sellers: wire by the labels." },
      { kind: "wire", from: "b3", to: "B+3", color: "red" }, { kind: "wire", from: "c4", to: "B-4", color: "black" },
      { kind: "wire", from: "d5", to: "g22", color: "yellow" }, { kind: "wire", from: "e6", to: "g20", color: "blue" },
      { kind: "wire", from: "b7", to: "B+7", color: "red" }, { kind: "wire", from: "c8", to: "B-8", color: "black" },
      { ref: "U3", kind: "module", legs: ["a14", "a15", "a16", "a17"], label: "OLED", color: "#1d3557", note: "Another pin order: GND first. Same rule: wire by the labels." },
      { kind: "wire", from: "b14", to: "B-14", color: "black" }, { kind: "wire", from: "c15", to: "B+15", color: "red" },
      { kind: "wire", from: "d16", to: "h22", color: "yellow" }, { kind: "wire", from: "e17", to: "h20", color: "blue" },
      { ref: "R1", kind: "res", legs: ["B+19", "i20"] }, { ref: "R2", kind: "res", legs: ["B+21", "i22"] },
    ],
  },
};

// ---------- ch23: the capstone, a thermostat fan ----------
// The whole design, drawn with modules and labels (not simulated: the boards aren't in the lab)…
export const DESIGN23 = {
  noLab: true, noSim: true,
  parts: [
    { type: "battery", a: [0, 3], b: [0, 6], v: 12 }, flag([0, 3], "+12V"), gnd([0, 6]),
    { type: "module", at: [4, 2], title: "buck 12→5 V", w: 7, left: ["VIN+", null, "VIN−"], right: ["VOUT+", null, "VOUT−"] },
    w([4, 3], [3, 3]), flag([3, 3], "+12V"), w([4, 5], [3, 5]), gnd([3, 5]), w([11, 3], [13, 3]), flag([13, 3], "+5V"), w([11, 5], [13, 5]), gnd([13, 5]),
    { type: "capacitor", a: [15, 3], b: [15, 6], farads: 470e-6 }, flag([15, 3], "+5V"), gnd([15, 6]),
    { type: "module", at: [19, 0], title: "ESP32 dev board", w: 8, left: ["5V", null, "GND"], right: ["GPIO21", null, "GPIO22", null, "GPIO25", null, "3V3"] },
    w([19, 1], [18, 1]), flag([18, 1], "+5V"), w([19, 3], [18, 3]), gnd([18, 3]),
    w([27, 1], [29, 1]), flag([29, 1], "SDA"), w([27, 3], [29, 3]), flag([29, 3], "SCL"), w([27, 5], [29, 5]), flag([29, 5], "FAN"), w([27, 7], [29, 7]), flag([29, 7], "+3.3V"),
    { type: "module", at: [21, 11], title: "BME280", w: 6, left: ["VCC", null, "GND", null, null, "SCL", null, "SDA", null, "CSB", null, "SDO"], right: [] },
    w([21, 12], [19, 12]), flag([19, 12], "+3.3V"), w([21, 14], [19, 14]), gnd([19, 14]), w([21, 17], [19, 17]), flag([19, 17], "SCL"), w([21, 19], [19, 19]), flag([19, 19], "SDA"),
    w([21, 21], [19, 21]), flag([19, 21], "+3.3V"), w([21, 23], [19, 23]), gnd([19, 23]),
    flag([2, 12], "FAN"), { type: "resistor", a: [2, 12], b: [5, 12], ohms: 100 }, w([5, 12], [8, 12]),
    { type: "resistor", a: [6, 12], b: [6, 15], ohms: 100e3 }, gnd([6, 15]),
    { type: "nmos", at: [8, 12], model: "AO3400A (2.5 V gate)" }, gnd([10, 14]),
    { type: "motor", a: [10, 7], b: [10, 10], ohms: 60, henries: 1e-3 }, flag([10, 7], "+12V"),
    { type: "diode", a: [13, 10], b: [13, 7], model: "1N5819 (Schottky)" }, w([10, 7], [13, 7]), w([10, 10], [13, 10]),
  ],
  why: {
    BAT1: { name: "12 V adapter", job: "One supply for everything: the fan needs 12 V, the rest is made from it." },
    U1: { name: "buck module, set to 5 V", job: "12 V to 5 V for the ESP32 board. A buck, not a 7805: at the ESP32's quarter-amp bursts a 7805 would burn (12 − 5) × 0.25 ≈ 1.75 W, about 95 °C above the room in a TO-220 with no heatsink (chapter 18). Most modules have a trim pot: set 5.0 V with a meter before connecting anything.", ch: `<a href="./10-power-supplies.html">chapter 10 §2</a>, <a href="./18-power-supply.html">chapter 18 §2</a>` },
    C1: { name: "bulk capacitor on 5 V", job: "Covers the ESP32's Wi-Fi bursts so the supply doesn't sag into a brown-out (chapter 22 §5).", value: "470 µF, 10 V or more." },
    U2: { name: "ESP32 dev board", job: "Reads the sensor, decides, drives the fan with PWM, could show it on a display or the web. Its 5V pin feeds its own 3.3 V regulator, whose 3V3 pin feeds the sensor.", ch: `<a href="./22-microcontroller.html">chapter 22</a>` },
    U3: { name: "BME280 breakout", job: "The temperature, on I²C at 0x76, exactly as in chapter 22. (An NTC thermistor in a divider on an ADC1 pin, chapter 11, would do too.)" },
    R1: { name: "gate resistor", job: "Limits the current the GPIO pushes into the MOSFET's gate, which is a small capacitor, at each switch: at most 3.3 V / 100 Ω = 33 mA for an instant, under the ESP32 pin's 40 mA.", value: "100 Ω." },
    R2: { name: "gate pull-down", job: "Holds the gate at 0 V while the ESP32 resets and boots, when its pins float (chapter 13): without it the fan can twitch on at every power-up.", value: "100 kΩ: weak enough that the pin barely notices it." },
    Q1: { name: "AO3400A MOSFET", job: "The fan's switch. Chosen for a 3.3 V gate: its datasheet promises under 48 mΩ at only 2.5 V, while the IRLZ44N only promises anything from 4 V up. At 0.2 A it burns 0.2² × 0.048 ≈ 2 mW.", value: "SOT-23, a tiny surface-mount part: on a breadboard, solder it to a SOT-23 adapter board first." },
    M1: { name: "12 V fan", job: "A motor, so a coil (chapters 3 and 14). This one draws about 0.2 A.", ch: `<a href="./14-motors.html">chapter 14</a>` },
    D1: { name: "flyback diode", job: "Gives the fan's coil current a path when the MOSFET switches off, every PWM cycle. Without it the drain spikes far above 12 V (chapter 4 §3).", value: "1N5819 Schottky: fast enough for 25 kHz PWM, 1 A." },
  },
};
// …and its one analog part, the fan driver, simulated, with a 3.3 V PWM standing in for GPIO25.
export const P23 = {
  speed: 0.002,
  parts: [
    { type: "battery", a: [16, 3], b: [16, 6], v: 12 }, flag([16, 3], "+12V"), gnd([16, 6]),
    { type: "source", a: [0, 7], b: [0, 10], wave: "square", freq: 1000, amp: 1.65, offset: 1.65, duty: 50 }, gnd([0, 10]),
    w([0, 7], [0, 6]), w([0, 6], [2, 6]), { type: "resistor", a: [2, 6], b: [5, 6], ohms: 100 }, w([5, 6], [7, 6]),
    { type: "resistor", a: [6, 6], b: [6, 9], ohms: 100e3 }, gnd([6, 9]),
    { type: "nmos", at: [7, 6], model: "AO3400A (2.5 V gate)" }, gnd([9, 8]),
    { type: "motor", a: [9, 1], b: [9, 4], ohms: 60, henries: 1e-3 }, flag([9, 1], "+12V"),
    { type: "diode", a: [12, 4], b: [12, 1], model: "1N5819 (Schottky)" }, w([9, 1], [12, 1]), w([9, 4], [12, 4]),
  ],
  why: {
    BAT1: { name: "12 V adapter", job: "The fan's supply." },
    V1: { name: "GPIO25 (stand-in)", job: "The ESP32's PWM pin, 0 to 3.3 V. Slowed to 1 kHz here so you can watch it; the real build uses 25 kHz, above hearing (chapter 14 §3)." },
    R1: { name: "gate resistor", job: DESIGN23.why.R1.job, remove: "short" },
    R2: { name: "gate pull-down", job: DESIGN23.why.R2.job, remove: true },
    Q1: { name: "AO3400A MOSFET", job: DESIGN23.why.Q1.job },
    M1: { name: "12 V fan (modeled as its winding: 60 Ω, 1 mH)", job: "The load: about 0.2 A at full speed; at 50% PWM, half on average." },
    D1: { name: "flyback diode", job: DESIGN23.why.D1.job, remove: true, without: "Each time the MOSFET switches off, the fan's coil forces its current on and the drain spikes far above 12 V (the simulator has no breakdown voltage, so it shows how far the coil would push; a real AO3400A would take the hit at about 30 V, and not for long)." },
  },
  bb: {
    cols: 20, margin: 70,
    parts: [
      { ref: "BAT1", kind: "off", legs: ["T+2", "T-2"], box: [-34, 27], label: "12 V" },
      { ref: "V1", kind: "off", legs: ["j3", "B-4"], box: [-34, 300], label: "GPIO25", colors: ["#36c", "#222"] },
      { kind: "wire", from: "T-3", to: "B-3", color: "black" },
      { ref: "R1", kind: "res", legs: ["i3", "i7"] }, { ref: "R2", kind: "res", legs: ["h7", "B-8"] },
      { ref: "Q1", kind: "to92", legs: ["g7", "g8", "g9"], label: "AO3400A", note: "A SOT-23 part on a 3-pin adapter board, legs in the adapter's order (here G, D, S): check yours, adapters differ." },
      { kind: "wire", from: "j9", to: "B-9", color: "black" }, { kind: "wire", from: "c8", to: "h8", color: "green" }, // the drain, across the gap to the fan's strip
      { ref: "M1", kind: "off", legs: ["T+13", "a8"], box: [330, 140], label: "fan" },
      { ref: "D1", kind: "diode", legs: ["b8", "T+8"], note: "Banded end (cathode) to +12 V: it conducts only when the fan's coil pushes the drain above the supply." },
    ],
  },
};

// ---------- ch23: the design review, one planted mistake each ----------
export const REVIEWS = [
  { title: "A power-on light", bug: ["LED1"], says: "The LED has nothing limiting its current: 9 V straight across it (chapter 1 §4). It needs a resistor in series, about (9 − 1.9) V / 10 mA ≈ 680 Ω.",
    parts: [{ type: "battery", a: [0, 3], b: [0, 6], v: 9 }, w([0, 3], [0, 1]), w([0, 1], [3, 1]), { type: "switch", a: [3, 1], b: [6, 1], closed: true }, w([6, 1], [8, 1]), { type: "led", a: [8, 1], b: [8, 4], color: "red" }, w([8, 4], [8, 6]), w([8, 6], [0, 6]), gnd([0, 6])] },
  { title: "A 3.3 V rail from a 9 V battery", bug: ["U1"], says: "The MCP1700's input is rated to 6 V, with 6.5 V as its absolute maximum (chapter 18): 9 V destroys it. Feed it from a 5 V rail, or use a regulator rated for 9 V.",
    parts: [{ type: "battery", a: [0, 2], b: [0, 5], v: 9 }, gnd([0, 5]), w([0, 2], [0, 1]), w([0, 1], [2, 1]), { type: "capacitor", a: [2, 1], b: [2, 4], farads: 1e-6 }, gnd([2, 4]), { type: "ldo1700", at: [3, 1] }, w([2, 1], [3, 1]), gnd([5, 3]), w([7, 1], [9, 1]), { type: "capacitor", a: [9, 1], b: [9, 4], farads: 1e-6 }, gnd([9, 4]), { type: "resistor", a: [13, 1], b: [13, 4], ohms: 330 }, w([9, 1], [13, 1]), gnd([13, 4])] },
  { title: "A comparator switching a lamp", bug: ["U1"], says: "The LM393's output is open collector: it can pull the gate down but nothing pulls it up (chapter 20). A 10 kΩ pull-up from the output to +12 V is missing; as drawn, the lamp never lights.",
    parts: [{ type: "battery", a: [-3, 2], b: [-3, 5], v: 12 }, flag([-3, 2], "+12V"), gnd([-3, 5]), { type: "resistor", a: [1, 1], b: [1, 4], ohms: 10e3 }, flag([1, 1], "+12V"), { type: "resistor", a: [1, 4], b: [1, 7], ohms: 4.7e3 }, gnd([1, 7]), w([1, 4], [4, 4]), w([4, 4], [4, 5]), w([4, 5], [5, 5]), { type: "lm393", at: [5, 4] }, flag([7, 2], "+12V"), gnd([7, 6]), w([5, 3], [4, 3]), w([4, 3], [4, 2]), flag([4, 2], "+12V"), w([9, 4], [11, 4]), { type: "nmos", at: [11, 4] }, gnd([13, 6]), { type: "lamp", a: [13, -1], b: [13, 2], volts: 12, watts: 5 }, flag([13, -1], "+12V")] },
  { title: "A counter on a clock", bug: ["U1"], says: "The 4017's RESET (pin 15) is connected to nothing. The simulator quietly reads an unconnected input as low, so it looks fine here; a real CMOS input floats and resets the count at random (chapters 13 and 19). Tie it to ground. A simulator is only as honest as its models.",
    parts: [{ type: "battery", a: [-3, 3], b: [-3, 6], v: 9 }, flag([-3, 3], "+9V"), gnd([-3, 6]), { type: "source", a: [0, 4], b: [0, 7], wave: "square", freq: 2, amp: 4.5, offset: 4.5 }, gnd([0, 7]), w([0, 4], [0, 3]), w([0, 3], [4, 3]), { type: "counter4017", at: [4, 2] }, flag([7, 1], "+9V"), gnd([7, 14]), w([4, 5], [3, 5]), w([3, 5], [3, 6]), gnd([3, 6]), { type: "led", a: [10, 3], b: [13, 3], color: "red" }, { type: "led", a: [10, 4], b: [13, 4], color: "green" }, w([13, 3], [13, 6]), { type: "resistor", a: [13, 6], b: [13, 9], ohms: 1e3 }, gnd([13, 9])] },
  { title: "A motor on a MOSFET", bug: ["M1", "Q1"], says: "No flyback diode across the motor. Every time the MOSFET turns off, the motor's coil current has nowhere to go and the drain spikes (chapter 4 §3, chapter 14 §2). Hover the drain while it switches. Add a diode across the motor, cathode to +12 V.",
    parts: [{ type: "battery", a: [-3, 3], b: [-3, 6], v: 12 }, flag([-3, 3], "+12V"), gnd([-3, 6]), { type: "source", a: [0, 6], b: [0, 9], wave: "square", freq: 2, amp: 2.5, offset: 2.5 }, gnd([0, 9]), w([0, 6], [0, 5]), w([0, 5], [3, 5]), { type: "nmos", at: [3, 5] }, gnd([5, 7]), { type: "motor", a: [5, 0], b: [5, 3], ohms: 6, henries: 1e-3 }, flag([5, 0], "+12V")], speed: 0.2 },
  { title: "Two sensors on one bus", bug: ["U3"], says: "Both BME280s have SDO tied to ground, so both answer at 0x76 and collide (chapter 22 §3). Tie the second one's SDO to +3.3V: it becomes 0x77.", noSim: true,
    parts: [{ type: "module", at: [0, 0], title: "ESP32", w: 6, left: [], right: ["3V3", null, "GPIO21", null, "GPIO22", null, "GND"] }, w([6, 1], [8, 1]), flag([8, 1], "+3.3V"), w([6, 3], [8, 3]), flag([8, 3], "SDA"), w([6, 5], [8, 5]), flag([8, 5], "SCL"), w([6, 7], [8, 7]), gnd([8, 7]),
      ...[13, 23].flatMap((x) => [{ type: "module", at: [x, 0], title: "BME280", w: 6, left: ["VCC", null, "GND", null, null, "SCL", null, "SDA", null, "CSB", null, "SDO"], right: [] }, w([x, 1], [x - 2, 1]), flag([x - 2, 1], "+3.3V"), w([x, 3], [x - 2, 3]), gnd([x - 2, 3]), w([x, 6], [x - 2, 6]), flag([x - 2, 6], "SCL"), w([x, 8], [x - 2, 8]), flag([x - 2, 8], "SDA"), w([x, 10], [x - 2, 10]), flag([x - 2, 10], "+3.3V"), w([x, 12], [x - 2, 12]), gnd([x - 2, 12])])] },
];
