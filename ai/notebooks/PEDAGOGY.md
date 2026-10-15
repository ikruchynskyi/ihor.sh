# How AI from scratch teaches: the standard for lessons and notebooks

## The failure this prevents

A learner finished Start 1 (what a model is, in pictures) and opened its notebook. The first exercise asked them to
write a NumPy function, and the next one asked for gradient formulas. Nothing on the path had taught either yet.
Each exercise made sense *for its topic*. None made sense *for that learner at that point*.

That is the general failure, and it isn't about one notebook. **An exercise was written from the topic, not from
what the learner knows when they reach it.** Everything below follows from one rule:

> **The ledger rule.** An exercise may only ask for what the path has already taught (syntax, notation) or shown
> (functions, methods, patterns), plus at most a small, named new step.

An author who knows the material can't see the gap, because the gap is in the reader's head, not in the text.
So the rule is checked by a program that keeps that ledger (`lint.py`) and by a learner-eyed review. Neither is
left to the author's sense of "this is easy".

## 1. The learner's ledger

At any point on the path, a learner holds three kinds of knowledge:

| Kind | Example | Where it comes from |
|---|---|---|
| **Taught** syntax and notation | `for`, `def`, `if`, `with`; Σ, ∂, ‖x‖ | A lesson that explains it in words and code. It's declared in `course.json` as `"teaches"`, and the linter checks that the lesson actually uses it. |
| **Seen** calls and patterns | `np.mean`, `.backward()`, `df.groupby` | Code the learner has run: lesson code boxes, earlier notebooks, and cells above in this notebook |
| **Concepts** | MSE, a gradient, overfitting | The lesson goals and cards in `course.json` |

What the learner has *seen* is not what they have been *taught*. Seeing `def predict(...)` once in a demo box
doesn't mean someone can write a function. **Syntax and notation count only when a lesson has taught them.**
A call or method counts once it has appeared in code the learner has run, because the pattern sits right there
to imitate.

## 2. The rules

1. **Within the ledger.** A solution uses only taught syntax and seen calls. If an exercise needs something new,
   either teach it first (in the lesson, or in a worked cell just above with an explanation) or name it in the
   exercise text with what it does. Allow **at most two** named new calls per exercise.
2. **Notation before use.** A notebook or lesson uses only math notation that this lesson or an earlier one
   teaches. A symbol introduced in passing ("don't worry about this") hasn't been taught.
3. **A ramp, not a cliff.** Every notebook climbs the same ladder, and **the first exercise is always the smallest step**:
   1. *Run*: run a worked cell and read its output.
   2. *Predict*: say what a cell will print before running it (`guess = ...`, a number or a choice).
   3. *Modify*: change a value (a knob, a learning rate, a size) and observe what happens.
   4. *Complete*: fill one line or expression inside code that is otherwise given.
   5. *Write*: write a short function or loop that follows a pattern shown earlier.
   6. *Combine*: put several known steps together on new data.

   An exercise may climb only one rung above the previous one. Each stage also caps how far up it goes:

   | Stage | Highest rung | Longest solution |
   |---|---|---|
   | 0, Start here | Run, predict and modify in Start 1. Complete and write only after Start 2 teaches Python. | 3 lines |
   | 1, The math | Write | 6 lines |
   | 2, How a network learns | Write | 8 lines |
   | 3 and later | Combine | 10 lines |

   Anything longer gets split into steps, or more of it is given.
4. **One new idea per exercise.** If an exercise needs a new concept *and* a new call *and* new syntax, it's three
   exercises, or two of the three are given.
5. **A way forward for a stuck learner.** Every exercise has at least one hint (`### HINT ...`), ordered from a nudge
   to nearly the answer. Each one is shown on demand by `hint(n)`, and `answer(n)` shows the solution. Never leave a
   learner with no move except quitting.
6. **Checks that diagnose.** Every exercise is followed by `check(...)` with a message that says *what* is wrong
   or what the right value looks like ("should be about 19 minutes: 2.6 × 5 + 6"), not just "wrong". A check
   never crashes the notebook (`check` catches errors and explains them).
7. **Worked before asked.** Show the shape of a solution before asking for one like it: worked example, then
   one with a blank, then one from scratch. This is the *fading* order. If the notebook's lesson page has no worked
   example of a pattern, the notebook shows one before the exercise.
8. **Concepts after their lesson.** A notebook practices its own lesson and the ones before it. A preview of a
   later topic is fine as *run and watch*, labeled as a preview, and never as an exercise.

## 3. Writing it (notebook source format)

```python
# %% [markdown]
# ## 2. The error of one ride
# The model predicted 19 minutes and the ride took 22. Set `err` to prediction minus truth.

# %%
### HINT Subtract: what the model said, minus what really happened.
### HINT 19 - 22
### BEGIN SOLUTION
err = 19 - 22
### END SOLUTION
print(err)

# %%
check(lambda: err == -3, "prediction − truth = 19 − 22 = −3 (negative: the model guessed too low)")
```

`build.py` numbers the exercises and turns each one into `# YOUR CODE HERE (stuck? hint(2), then answer(2))` and
`...`. It moves the hints and an encoded copy of the solution into a helpers cell at the top, and passes the
exercise number to its checks. Don't define `check` in a notebook.

## 4. How to verify a lesson or notebook (before it ships)

1. `python3 ai/notebooks/lint.py NAME`: zero errors. It enforces rules 1, 2, 3 (size and first step), 5 and
   the presence of 6, from the ledger built along the path in `ai/index.html` order.
2. `tnb NAME`: the solution version passes every check, and the blank version runs top to bottom with only ✗.
3. **The cold-learner read.** This is the part no program does. Read the lesson page, then the notebook, as
   someone who knows *only* the ledger up to this point. For every exercise ask:
   - Could I start without guessing what's wanted?
   - Have I seen something shaped like the answer?
   - If I'm stuck, does `hint(1)` get me moving?

   Any "no" is a bug, as real as a failing test.
4. Fix the ledger, not the symptom. If an exercise needs something the path never teaches, the fix is usually
   in an earlier lesson. Teach it there, add it to `"teaches"`, and every later exercise benefits.

## 5. When a learner reports "I was lost here"

Treat it like a failing test. Find what the exercise required that their ledger lacked, and add a linter rule
or ledger entry that would have caught it. If no program could have caught it, add the question to the
cold-learner read. Then fix every exercise the new rule flags, not only the one that was reported.

## 6. Depth: intuition first, then why, never at the cost of simplicity

The ledger rule keeps the path from jumping ahead. The depth rule keeps it from staying shallow. A learner who can
run `np.linalg.svd` but can't say why the circle always becomes an ellipse has a recipe, not understanding, and
recipes don't transfer to the next problem. So every core idea goes one level deeper than "what and how", to
"why it's true" and "when it stops being true". It does that **in layers, so the main read stays as simple as
before.**

### The five layers of a core idea

| Layer | Where | Example (SVD) |
|---|---|---|
| 1. **See it** | main text: a widget or picture | drag the columns, and the circle becomes an ellipse |
| 2. **Say it** | main text: `<p class="gist">`, one sentence a learner can repeat | "Every matrix is rotate, stretch, rotate." |
| 3. **Why it's true** | `<details class="deeper"><summary>Why …?</summary>` | ‖Ax‖² = xᵀAᵀAx, so the axes are AᵀA's eigenvectors |
| 4. **Where it breaks** | `<details class="deeper"><summary>Where it breaks</summary>` | σ₂ = 0 flattens the ellipse; σ₁ = σ₂ makes the axes not unique |
| 5. **Where AI uses it** | main text | LoRA, recommenders, PCA |

Rules for the deeper boxes:
- **Optional, never a prerequisite.** Nothing after a box (a question, a code box, the notebook) needs what's in it.
  A learner who never opens one still finishes the lesson.
- **A sketch, not a proof.** Small steps, one line each, each with its reason in words ("because U is a rotation,
  it doesn't change lengths"). 4 to 8 steps. If it needs more, the lesson is missing a smaller idea.
- **The ledger rule applies inside them.** Only notation already taught (lint.py checks the box text too).
- **"Where it breaks" is concrete:** a counterexample with numbers, an extreme case, or the assumption that fails,
  plus what people do about it.

### Intuition drills (in lessons and notebooks)

Intuition is a prediction that turns out right. It grows by predicting, being wrong, and seeing why. So:
- **Predict, then reveal.** Before a widget or code box shows the answer, a `.q` asks for a guess. The miss is the lesson.
- **Extreme cases.** Push a knob to 0 and to infinity: what must happen? (A singular value to 0, a learning rate to 10.)
- **Estimate before computing.** A random guess over 10 classes has loss ln 10 ≈ 2.3; a 4096 × 4096 layer is 16.8 M
  numbers. A learner who estimates first catches their own bugs.
- **Four views of one idea:** picture, words, formula, code, side by side, each pointing at the same thing.
- **Check theory numerically.** A derivation is something you can test: rebuild A from U, Σ, Vᵀ; compare a gradient
  with a finite difference. Notebooks do this often, since the check is the code.
- **Why questions.** Each lesson's quiz in `course.json` has at least one question starting "Why", with the real
  misconceptions as the wrong options.

### Checking it

`lint.py` ends with a depth line, and `lint.py --depth` lists each lesson still missing a gist, a "Why" box, a
"Where it breaks" box or a "Why" question. It's a to-do list, not an error. New lessons ship with all four; existing
ones get them as they're touched (stage 1 first).
