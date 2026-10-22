# Electronics from scratch: plan

The path is `learn/index.html` chapter order (1–16). The standard is the `learn-kit.js` header: questions before
answers, a gist per core idea, optional "Why …?" and "Where it breaks" boxes. Ideas from the AI course are adapted, not copied:
here a learner builds intuition by playing with circuits (widgets solved live by `circuit.js`), so chapters have **no
code boxes**. A number a code box would have shown goes in the text or a box, computed with `circuit.js` first. Checks:
`node learn/circuit.test.mjs && node learn/lab/lab.test.mjs && node learn/build.test.mjs`, then a cold read of each changed page at 390 and 1280 px.

## Track A: close the gaps (2026-10-17)
- Topic: every term a chapter uses is taught in that chapter or an earlier one, and every "chapter N" pointer is true.
- Already covered: read all 16 chapters end to end (2026-10-17); hits below are from that read and
  `grep -n -i` over `learn/electronics/*.html` for each term.
- Gaps and where each goes (all 3a, a sentence or paragraph in place, except A5, which is 3b):
  - A1 ch1 §2: "ground" and "voltage between two points" used in the divider math, never said. Taught in ch1 §2.
  - A2 ch2 §3: frequency, hertz, period used for the first time with no definition. Taught in ch2 §3.
  - A3 ch3 §1: induction. Ch14 ("chapter 3: a moving magnet in a coil induces a voltage") and ch16 (the dynamic
    mic) point back to it, but ch3 only gave \(V = L\,dI/dt\). A paragraph on why a coil pushes back, and how a moving
    magnet does the same.
  - A4 ch4 §3: the MOSFET's gate, drain and source (the page says "drain voltage" unexplained); N- and P-channel
    (ch12's CMOS inverter uses both).
  - A5 ch4 new §5: the bipolar transistor and the transistor in between on and off, as an amplifier. Ch9 §5 ("a
    transistor tops up the energy"), ch10 §1 (the linear regulator's transistor drops the extra voltage), ch11 §2 (the
    phototransistor) and ch16 §3 (class A "biased half-on", class B's "~0.6 V to turn on (chapter 4)") all lean on it;
    ch4 only taught the MOSFET as a switch and said never to run one half on. Fits ch4 because it is the transistor
    chapter; §4 already sets it up (half on is hot). New here: collector, base, emitter; \(I_C \approx \beta I_B\);
    the three regions; gain. Picture: a 2N3904 (the lab's model) with a slider and a wiggle, solved by circuit.js.
  - A6 ch5 §4: "decoupling" (used again in ch15's layout step) never explained.
  - A7 ch6 §6: "chapter 1's vectors" doesn't exist; ch2's box adds R and \(X_C\) like a right triangle. §5: "current
    sources" never taught (one clause).
  - A8 ch7 §1: a ±12 V supply (a rail below ground) is used with no word on it.
  - A9 ch12 §3: the bar, dot and plus of Boolean notation used without being read out.
  - A10 ch13 §1: hexadecimal (0x…) used throughout with no introduction (binary is ch12 §4).
  - A11 ch14 §1: τ reused for torque (ch2's τ is a time constant), ω unexplained; \(F = BI\ell\) is cited by ch16 §4 as
    "chapter 14's force" but ch14 never writes it. §4: "a potentiometer (chapter 11's sensor)", ch11 has none.
  - A12 ch16 §3, ch9 §5, ch10 §1, ch11 §2: point to ch4 §5.
- Also touches: `learn/index.html` card and the home page entry for ch4.
- Truth: the ch4 §5 numbers come from `circuit.js` (9 V, 1 kΩ, 47 kΩ, 2N3904 is 6.7e-15, β 200): active from
  about 0.6 to 2.7 V in, gain about −4 around 1.6 V, saturated at 3.3 V in with 0.17 V left across it.

## Track B: depth and intuition (built 2026-10-17)
- Gap: no chapter had a gist; ch12–16 had no deeper box at all; most boxes were derivations with no limits.
- Built: one gist per chapter, after the section where its idea has been seen. "Where it breaks" boxes where a chapter
  had no limits yet: ch2 (5τ vs a 12-bit ADC: τ ln 4096 ≈ 8.3τ), ch4 (β 100–300), ch6 (a diode breaks
  superposition: 0.37 + 1.34 ≠ 2.32 mA), ch12 (ripple carry), ch13 (UART clocks may differ by 0.5/9.5 ≈ 5.3%), ch15
  (a 10 MΩ meter on a 10 MΩ divider reads 3.00 V, not 4.5), ch16 (√2 is only for sines: a square wave gives 19.8 W, not 9.9).
  "Why" boxes where no reason was given: ch4 (gain ≈ −βR_load/R_base), ch14 (ω ≈ V/k), ch15 (an ammeter across a battery,
  5.6 A), ch16 (RMS from the average of sin²). Chapters that already explain their limits (ch1 loading and the LED, ch3
  losses, ch5, ch7 §7, ch8 stacked stages, ch9 RC vs crystal, ch10 dropout and discontinuous mode, ch11 ADC steps) got
  only a gist.
- Truth: solver numbers from circuit.js (2N3904 and silicon diode models); the rest is arithmetic shown in the box.

## Track C: no code boxes (2026-10-17)
- The owner's call: code doesn't build electronics intuition; widgets do. All 25 "Build it" code boxes were removed.
  Most repeated a widget on the same page. Their few unique points moved into the text with numbers from `circuit.js`:
  ch1 a load on a divider (3.00 V unloaded; 2.99 / 2.90 / 2.25 / 0.69 V with 1 MΩ / 100 kΩ / 10 kΩ / 1 kΩ), ch4 where the
  ripple formula fails (220 µF: 5.2 V simulated vs 8.3 V by formula), ch8 the Sallen-Key part recipe, ch11 one ADC count
  ≈ 0.02 °C near 25 °C, ch13 majority sampling in UART receivers.

## Track D: Part II, build it (planned 2026-10-21)
The owner's ask: real projects with real ICs, gradual, so that by the end a learner reads schematics and components and
designs a circuit alone: where to start, which parts to take, how to connect them, and above all why.

- Topic: after Part II a learner can take an idea to a working breadboard: split it into blocks, pick ICs from their
  datasheets, read and draw the schematic, lay it out on a breadboard, power it up with a checklist, and debug it.
- Already covered (read end to end, and `grep -il` for schematic, symbol, pin 1, notch, application circuit, open
  collector, coupling, bias, module, BOM, level, brownout, common ground, reverse polarity): ch1 dividers and LED
  resistors; ch2 RC and stored charge; ch4 rectifiers, MOSFET switch, logic-level gates, flyback; ch5 E-series,
  ratings, capacitor types, decoupling, datasheet min/max; ch7 comparators and hysteresis; ch8 RC filters; ch9 the 555;
  ch10 linear vs switching regulators and heat; ch11 sensor chains; ch12 gates and counters; ch13 GPIO, pull-ups, PWM,
  I²C open drain; ch14 motors; ch15 breadboard, meter, scope, KiCad; ch16 audio and amplifier classes. The lab has
  555, 7805, op-amp, MOSFET, BJT, 4017 and gates.
- Gap: every chapter is one idea in isolation. Nothing teaches schematic conventions (ground and supply flags, junction
  dots, reference designators, an IC drawn by function with pin numbers), DIP pin numbering, a datasheet's typical
  application circuit, choosing between real parts, connecting one chip's output to another's input (levels, unused
  inputs), open-collector outputs, coupling capacitors on a single supply, modules vs chips, pin restrictions on a
  microcontroller, power-up checks or debugging. These are the build skills, and they only make sense on a real build.
- Where it goes: 3c, new chapters 17–23 after ch16, as "Part II: build it". Not 3a/3b: each is a whole project with
  its own schematic, breadboard and checklist, and folding them into ch9–16 would double those chapters. Each project
  uses the earlier theory chapters and links back to them instead of re-teaching (ch9's 555 timing, ch10's heat
  formula, ch7's hysteresis).
- One frame for every project, so by the last one the learner runs it alone (scaffolding that fades):
  goal → blocks → choose the parts (datasheet) → the schematic, part by part ("why is this here?") → the breadboard →
  bill of materials → power up and check (expected readings) → what's wrong? (symptom → cause) → make it yours.
  Ch17 walks every step; later chapters hand steps to the learner as predict-first questions; ch23 is the learner's.
- Widgets (no code boxes, Track C), in one shared module `learn/build.js` with the projects' data in
  `learn/electronics/projects.js`:
  - a live schematic: the lab's own parts and solver (`lab/parts.js`, `lab/engine.js`), drawn read-only; click a
    part for its job, why this value, and what happens without it (re-simulated with the part removed); "open in
    the lab" carries the exact circuit;
  - a chip's pinout: the real package from above (notch, pin 1, counter-clockwise numbers); click a pin;
  - a breadboard: the same parts in real holes; clicking a part or hole lights it in both views.
  `learn/build.test.mjs` checks that every project's breadboard connects exactly the pins its schematic connects, and
  the simulated numbers quoted in the text.
- Lab additions (new parts, also in the lab palette): LDR (GL5528 curve), LM393 comparator (open collector), LM386,
  MCP1700-3.3 LDO, 8 Ω speaker. The 4017's pins get their real numbers.

### The chapters
Each "Needs" was looked up in the chapter named.

**17. Reading a schematic: a 555 blinker** (NE555)
- New: the build frame; schematic conventions (ground and supply symbols, dot = joined, crossing = not, R1/C1/U1,
  values, an IC drawn by function with pin numbers); DIP numbering (notch, dot, counter-clockwise); the datasheet's
  bypass capacitors (0.1 µF on VCC, 0.01 µF on CONT).
- Needs: 555 astable and its timing (ch9 §2), E-series (ch5 §2), LED resistor (ch1 §4), decoupling (ch5 §4),
  breadboard columns and rails (ch15 §1), voltmeter use (ch15 §2), datasheet min/max (ch5 §7).
- Widgets: live schematic; NE555 pinout; picking R1, R2, C from E12 for a target blink (checks the datasheet's
  1–100 kΩ test range for RA); breadboard.
- Truth: NE555 datasheet (TI SLFS022): VCC 4.5–16 V, ±200 mA out, 0.1 µF bypass, 0.01 µF on CONT, high output
  about 1.7 V below VCC at 100 mA. Blink rates from ch9's formula; LED current from the lab solver.
- Where it breaks: a 555 on 3.3 V is below its 4.5 V minimum (the CMOS TLC555 runs from 2 V).

**18. Power for every later build: a 5 V and 3.3 V supply** (LM7805, MCP1700-3.3)
- New: reading a typical application circuit; regulator pinouts differ (7805 TO-220: IN, GND, OUT; MCP1700 TO-92:
  GND, VIN, VOUT); reverse-polarity diode and its cost in headroom; a power LED; chaining regulators so each stays
  inside its absolute maximum.
- Needs: dropout, heat \(P = (V_{in} - V_{out})I\), θ (ch10 §1, ch5 §3), diode drop (ch4 §1), capacitor types (ch5 §4).
- Widgets: regulator chooser (input, output, current → which part, its heat and temperature); pinouts; live
  schematic; breadboard with the 5 V and 3.3 V rails.
- Truth: LM7805 datasheet (TI SNOSBT0L): 35 V in max, 2 V dropout at 1 A, 0.22 µF in and 0.1 µF out, θJA 54 °C/W
  (TO-220), thermal shutdown at 150 °C, protection diode for output capacitors over 10 µF. MCP1700 (Microchip
  20001826E): 2.3–6.0 V in, 6.5 V absolute max, 250 mA, 178 mV typical dropout, 1.6 µA quiescent, 1 µF ceramics.
- Where it breaks: the MCP1700 fed straight from 9 V (over its 6.5 V absolute maximum).

**19. Two chips talking: a 555 and a 4017 running light** (NE555, CD4017B)
- New: one chip's output as the next one's input (the 4017's input thresholds against the 555's output high); CMOS
  inputs must never float (CLOCK INHIBIT and RESET tied low); a decade counter's ten outputs taking turns; one
  resistor shared by LEDs that are never on together.
- Needs: floating inputs (ch13 §2), counting with flip-flops (ch12 §6), 1 and 0 as voltages (ch12), shared-resistor
  failure (lab template "Two LEDs, one resistor"), ch17's frame.
- Widgets: live schematic (555 + 4017 + 10 LEDs, all lab parts); CD4017 pinout (Q0 is pin 3); level check over
  supply voltage; breadboard.
- Truth: CD4017B datasheet (TI SCHS027C): 3–18 V, VIH 3.5 / 7 / 11 V at 5 / 10 / 15 V, IOH ≥ 1.6 mA at 5 V (2.5 V
  out), 2.5 MHz clock at 5 V; pinout from its terminal diagram. 555's high from ch17's source.
- Where it breaks: at 5 V the 555 promises a high of only 2.75 V at 100 mA against the 4017's 3.5 V.

**20. Sensor to switch: a dusk light** (GL5528 LDR, LM393, IRLZ44N)
- New: open-collector outputs need a pull-up; a comparator's input common-mode range (0 to VCC − 1.5 V); sizing
  hysteresis with the pull-up in the loop; choosing the divider resistor so the threshold sits where the sensor is
  steepest; a trim pot as the calibration knob.
- Needs: dividers and an LDR (ch1 §2), comparators and hysteresis (ch7 §5), logic-level MOSFET and \(I^2R\) (ch4 §3–4),
  open drain (ch13 §5), wire and supply sizing (ch5 §6).
- Widgets: LDR curve and the divider; hysteresis thresholds solved by circuit.js; live schematic; LM393 pinout;
  breadboard.
- Truth: LM393 datasheet (TI SLCS005AH): 2–36 V, open collector, sinks ≥ 6 mA at 1.5 V, common mode 0 to
  VCC − 1.5 V. IRLZ44N (Infineon): VGS(th) 1–2 V, RDS(on) 0.025 Ω at 5 V, ±16 V gate. GL5528 (Rapid 58-0134):
  10–20 kΩ at 10 lux, 1 MΩ dark, γ ≈ 0.7.

**21. Sound: an LM386 speaker amplifier** (LM386N-1)
- New: a signal riding on half the supply (the "self-centering" output) and the coupling capacitor that keeps DC out
  of the speaker; that capacitor and the speaker as a high-pass; the datasheet's 10 Ω + 0.05 µF network; gain pins;
  the input's ±0.4 V limit and why the volume pot is first.
- Needs: RC high-pass and cutoff (ch2 §3, ch8 §1), speakers and power into ohms (ch16 §4), decibels (ch16 §2),
  clipping at the rails (ch16 §3), bypass capacitors (ch5 §4, ch17).
- Widgets: output waveform with and without the output capacitor; bass cutoff against the capacitor; live schematic;
  LM386 pinout; breadboard.
- Truth: LM386 datasheet (TI SNAS545D): 4–12 V (N-1), gain 20 open / 200 with 10 µF on pins 1–8 / 50 with 1.2 kΩ +
  10 µF, minimum-parts circuit (10 k pot, 250 µF, 10 Ω + 0.05 µF), 325 mW typical at 6 V into 8 Ω (10% THD), 4 mA
  quiescent, inputs ±0.4 V.

**22. A microcontroller board: an ESP32 weather display** (ESP32 dev board, BME280, SSD1306 OLED)
- New: modules vs chips (a breakout carries its own regulator and pull-ups: read its schematic); choosing pins
  (strapping pins, input-only pins, flash pins); I²C addresses on one bus; pull-ups in parallel and the rise time
  they allow; supply peaks and brown-outs; the first test (scan the bus) and what the firmware does, in words.
- Needs: GPIO, pull-ups, I²C (ch13 §1, §2, §5), parallel resistors (ch1 §3), RC time (ch2 §1), hex (ch13 §1),
  battery budget (ch10 §4), stored charge (ch2 §2).
- Widgets: pin picker on an ESP32 dev board; I²C rise time against pull-up and bus capacitance; schematic (a chip box,
  no simulation: the lab has no microcontroller); breadboard.
- Truth: ESP32 datasheet v5.3: 2.3–3.6 V, supply 500 mA or more recommended, 240 mA transmitting, 10 µA deep sleep,
  strapping GPIO0/2/5/12/15 with their defaults, GPIO34–39 input only, 45 kΩ internal pull-ups. BME280 (Bosch
  BST-BME280-DS002): 1.71–3.6 V (4.25 V absolute), 0x76/0x77 by SDO, 3.6 µA at 1 Hz. SSD1306 (Solomon): 0x3C/0x3D.
  I²C spec (NXP UM10204): rise time ≤ 1000 ns standard, ≤ 300 ns fast mode, 3 mA at 0.4 V, ≤ 400 pF.

**23. Design your own: a thermostat fan, and a design review** (the capstone)
- New: nothing new in electronics. The learner runs the frame alone on a spec (a 12 V fan that switches on above a
  set temperature and shows it), with every decision as a predict-first question and the answer folded away; then a
  design-review game: schematics with one planted mistake each, drawn from Part II (missing pull-up, unbiased MOSFET
  gate, LDO over its absolute maximum, floating CMOS input, two devices at one I²C address, a strapping pin used as
  an input, no flyback diode, LED without a resistor).
- Needs: chapters 17–22 and ch10 (buck vs linear heat), ch14 (flyback, stall current).
- Truth: AO3400A (Alpha & Omega): RDS(on) < 48 mΩ at VGS 2.5 V, ±12 V gate, SOT-23 (needs a breakout on a
  breadboard). Heat numbers from ch10's formula and ch18's θJA.

- Also touches: `learn/index.html` (a Part II list), the home page World 6 (levels 6-17 to 6-23; the lab becomes 6-24),
  `scripts/check.ts` URLs, `README.md` (chapter count), ch16's "next" line, `lab.html` palette (new parts).
- Verified by: `node learn/circuit.test.mjs && node learn/lab/lab.test.mjs && node learn/build.test.mjs`, `npm run
  check` after deploy, each page opened at 390 and 1280 px with no console errors, and a cold read as a learner who
  finished ch16.
- Order of work: one chapter per commit (17 with the shared module first), each pushed and deployed.

### Status (2026-10-21)
- Built and deployed: chapters 17–22 (commits 212584a, 090c2b6, 8d6edbb and the deploy commit), the shared
  `learn/build.js`, `learn/build.test.mjs`, and the lab parts (LDR, LM393, LM386, MCP1700, speaker, supply/net labels,
  modules, the 4017's real pins and weak outputs, current-limited regulators, AO3400A).
- Left to do, in order:
  1. **Chapter 23, design your own** (`23-design-your-own.html`). Data is written and its breadboard checked:
     `DESIGN23` (the whole thermostat fan: 12 V adapter, buck module to 5 V, 470 µF, ESP32, BME280, AO3400A low-side
     switch with 100 Ω gate resistor, 100 kΩ pull-down and 1N5819 flyback), `P23` (the fan driver alone, simulated with
     a 1 kHz 3.3 V PWM standing in for GPIO25, with a breadboard), and `REVIEWS` (six schematics, one planted mistake
     each: LED without resistor, MCP1700 on 9 V, LM393 without pull-up, floating 4017 RESET, motor without flyback,
     two BME280s at 0x76). Still to do:
     - `build.js`: honor `noSim` (DESIGN23 and the I²C review have modules only; don't simulate or show voltages),
       and a review mode for `schematic()` (no part cards; a pick is checked against `bug` and answered with `says`).
     - The page, following the plan above: the review game first, then the spec and each decision as a predict-first
       question with the answer folded away (goal, blocks and why a microcontroller, supply: 7805 at 0.25 A from 12 V
       is ≈ 1.75 W → buck; sensor; fan switch: IRLZ44N only specified from 4 V, AO3400A < 48 mΩ at 2.5 V; gate
       pull-down for boot; gate resistor 33 mA vs the pin's 40 mA; flyback; GPIO25 for 25 kHz PWM; common ground),
       the full schematic, the live fan driver and its breadboard, the learner's own checklist, then KiCad (ch15) and
       where to go next.
     - `build.test.mjs`: P23's numbers (fan current at 50% PWM, drain clamped near 12 V + the Schottky's drop with
       D1, the spike without it) and that each review's `bug` names a real part; check the motor review's spike.
     - Register: ch22's "Coming next" line becomes a link, `learn/index.html`, the home page (6-23), `scripts/check.ts`.
  2. A cold-learner read of chapters 17–23 end to end (ideally the simulated-student review), then fix what it finds.
  3. Optional, from the reads so far: schematic text is small on wide drawings at 1280 px (the drawings scale to
     fit); a zoom or a taller layout for ch19 and ch22 would help.
