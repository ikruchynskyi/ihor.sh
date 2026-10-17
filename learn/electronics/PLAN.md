# Electronics from scratch: plan

The path is `learn/index.html` chapter order (1–16). The standard is the `learn-kit.js` header: questions before
answers, a gist per core idea, optional "Why …?" and "Where it breaks" boxes. Checks:
`node learn/circuit.test.mjs && node learn/lab/lab.test.mjs`, then a cold read of each changed page at 390 and 1280 px.

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

## Track B: depth and intuition (planned)
- Gap: no chapter has a gist; ch12–16 have no deeper box at all, and most chapters' boxes are formula derivations
  with no "Where it breaks". Plan: one gist per chapter after the section where its idea is seen; a "Where it breaks"
  box (numbers from code) where the chapter has none; a "Why" box where no reason is given yet. Not started.
