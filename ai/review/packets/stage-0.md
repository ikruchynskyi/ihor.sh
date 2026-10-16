# Stage 0 review packet (Start here: s1–s4)

Student: Gemini (course-student skill), 2026-10-15/16. Editor: Claude. Audit: 0 citation problems.

## Metrics

lesson | questions | right first try | hints | answers used | struggles | asks | quit points | errors
s1-what-is-ml | 4 | 4/4 | 0 | 0 | 1 | 0 | 0 | 0
s2-just-enough-code | 7 | 7/7 | 0 | 0 | 0 | 0 | 0 | 0
s3-math-warm-up | 13 | 10/13 | 0 | 0 | 1 | 0 | 0 | 0
s4-your-first-shared-model | 5 | 5/5 | 2 | 0 | 2 | 0 | 0 | 1

## Struggles and decisions

| Lesson | Struggle | Real or misread | What happened |
|---|---|---|---|
| s1 | Notebook Part 2 "a real model in five minutes" downloads ~800 MB and trains ~25 min on a CPU, nothing said optional | real | fixed in 81ee6b0: marked optional, with its real cost and how to turn on a GPU |
| s1 | §2 chart at 390 px: "km" on the 12 tick, "minutes" on the 45, loss text cut off | real | fixed in c29e04a (also plane.js text() kept inside every chart) |
| s1 | named squared error and learning rate hardest, no struggle logged | unclear | recheck on the final rerun |
| s2 | wrote 9 exercises in under 2 minutes with no hints; said "broadcasting" (never in the lesson) | student out of character | tool and skill tightened (exercise citations, "hardest" logged, real minutes); s2 to rerun |
| s3 | reading formulas aloud and turning them into code | normal difficulty | it's what s3 teaches, with worked examples; no change |
| s4 | torch.allclose "not introduced" | misread | Exercise 3's text names it and says what it does; pointed the student there |
| s4 | notebook timed out after 30 min | test setup | GPU notebooks are no longer run on the student's machine (11 notebooks) |
| s4 | Oxford's pet-photo server is slow (160–370 KB/s here: 800 MB takes 35–80 min) | real | **proposal below** |

## Proposal for the owner

**Load the Oxford-IIIT Pet photos from a fast mirror.** s1 Part 2 and the s4 notebook download them from Oxford's
server through torchvision, which ran at 160–370 KB/s from here, so the download alone can take over half an hour
on Colab or Kaggle too. Milestone 5 already loads CIFAR-10 from the Hugging Face hub. Moving both notebooks to a
Hugging Face copy of the same dataset (license: CC BY-SA 4.0, as the original) means changing their loading cells
and re-testing both versions on a GPU. Decide: switch to a mirror, or keep Oxford and warn about the download time.

## Passages changed (proofread in place)

- `ai/notebooks/src/s1-what-is-ml.py`: the intro paragraph about Part 2, and the Part 2 heading and its first
  paragraph (81ee6b0).
- `ai/s1-what-is-ml.html` §2: the chart's axis-label positions and the loss placeholder text (c29e04a).
