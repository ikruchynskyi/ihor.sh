# Electronics Part II (ch. 17–23): student review, run 2 (Gemini), 2026-10-22

Run 1 was batch-answered and doesn't count (ai/PLAN.md §10.7). Run 2 ran with the tightened tools
(7d13507, be7cbe6): quotes can't be options, answers ≥ 15 s apart, a question needs its section's widget first,
`done` needs every widget section and ≥ 1 min per question.

| lesson | questions | right first try | struggles | wall min |
|---|---|---|---|---|
| 17 | 7 | 6 + 1 open | 1 | 7 |
| 18 | 5 | 4 + 1 open | 1 | 5 |
| 19 | 5 | 5 | 1 | 5 |
| 20 | 4 | 4 | 1 | 5 |
| 21 | 4 | 4 | 1 | 4 |
| 22 | 5 | 5 | 1 | 5 |
| 23 | 8 | 3 + 5 open | 1 | 8 |

`L audit`: 0 citation problems.

## Struggles

- ch17 §2, RST (pin 4) tied high with nothing saying what reset does: **real**. Fixed in 75c5b82.
- ch18, the two regulators' opposite pinouts: misread. §3 teaches it and §9 tests it.
- ch19, the 4017's scattered pin numbers: misread. That's §2's point.
- ch20, open collector and hysteresis: not tested. The student answered before using §4's widget. The tool now prevents that (be7cbe6).
- ch21, 2.5 V bias and C1: misread. That's §2's point, and the student answered it correctly.
- ch22, strapping pins and parallel pull-ups: misread. §2 teaches strapping pins; ch1 §3 teaches resistors in parallel, linked from "Before you start".
- ch23, balancing a whole design: the chapter's purpose. Not a gap.

The ch17 and ch18 struggles were logged mid-lesson. The other five were filed automatically by the tool, from each chapter's "hardest" note.

## Changed passages

- ch17 §2, before the RST question: "One pin does nothing in this build: pin 4, RST (reset). Pulled low, it stops the
  555 and holds its output low, whatever the timing pins say; this blinker never wants that."
  "Before you start" adds: "floating inputs from chapter 13 §2".
- ch23 review #2: the 330 Ω load moved two columns right, so its "R1" no longer prints over C2's "1 µF" (b7ce712).

## For the owner

- The student did the minimum the tools allowed. It finished most chapters near the time floor, and its observations
  repeat the lesson's text instead of saying what it saw. Six right-first-try chapters is weak evidence
  that the chapters work. A human read of ch20 §4 (hysteresis) and ch23 §1 (the review) would tell more than another run.
- Tooling, not content: each `B do` opens a fresh page. So multi-step widget state, like ch23's "n of 6 found"
  counter, doesn't carry between calls, and the student saw "0 of 6" after finding several. Note only.
