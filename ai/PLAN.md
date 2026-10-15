# AI path: parallel work plan (courses + gamification)

Written 2026-10-15 for delegation: each **lane** below is one self-contained job for one agent. Lanes in the same
wave can run at the same time; their file ownership is chosen so they don't edit the same lines. Read **sections 1–4
completely** before starting any lane, then do only your lane.

To an agent: you are working in a live website's repository. Files you save are served to the public at once
(section 2.1). Work carefully, test before you commit, and commit only your own files.

---

## 1. Context

- **Site:** `https://ihor.sh`, served by `server.ts` (Node) straight from this working tree. The AI course is
  `ai/`: about 70 lessons in an order defined by `ai/index.html` (the only place the order lives), from stage 0 (no
  code, no math) to junior ML engineer. Lessons are single HTML pages. Each has interactive canvases,
  predict-before-reveal questions, Python code boxes that run in the browser (Pyodide), "Why" and "Where it breaks"
  boxes, and a checkpoint. A practice notebook (Colab/Kaggle) goes with each lesson.
- **Key files:**

  | File | What it is |
  |---|---|
  | `ai/index.html` | the path: `<h2 class="stage" id="stage-N">` headings, each followed by a `<p class="goal">` and an `<ol class="path">` of `<li class="card">` lesson cards. Its inline script shows progress. |
  | `ai/course.json` | per lesson (`"name.html"`): `goals`, `needs`, `cards` (6 concept cards `[term, meaning]`), `check` (5 checkpoint MCQs `{q, options, answer, why, sec}`), optional `teaches` (`py:*`/`math:*` ids) |
  | `/learn-kit.js` | **shared by all courses** (AI, electronics, radio): questions (`.q`), Python code boxes (`.code`), KaTeX, `.gist`, `details.deeper`. Read its header comment. |
  | `ai/path.js` | added to every lesson: "before you start" box, gaps, checkpoint, notebook box, prev/next |
  | `ai/learn.js` | the learner's record in localStorage (`ai:learn`) **and the game API** (section 3) |
  | `ai/game.js` | the game rules as pure functions (XP table, streak, week); tested by `node ai/game.test.mjs` |
  | `ai/hud.js` | the XP / streak / week strip, `strip(el)` |
  | `ai/plane.js`, `ai/zoo.js` | canvas helpers (draggable points, graphs) and the model-zoo datasets, models and maps |
  | `ai/review.html`, `ai/glossary.html` | spaced-repetition deck (+ gap list), glossary built from course.json cards |
  | `ai/notebooks/src/NAME.py` → `build.py` → `NAME.ipynb` | notebook sources (`# %%` cells), built notebooks, `index.json` (lesson → Colab/Kaggle links) |
  | `ai/notebooks/PEDAGOGY.md` | **the teaching standard** (ledger rule + depth standard). Mandatory reading for any lane that writes lessons, questions or notebooks. |
  | `ai/notebooks/lint.py` | checks lessons and notebooks against PEDAGOGY.md; `npm run check` runs it plus `check.ts` |
  | `ai/data/` | course datasets (bank.csv, outages.csv, ridership.csv, sms-spam.tsv, rail-stations.json, …) |

- **Who else works here:** other agents edit Yomu (`yomu/`), radio (`radio/`) and server files at the same time.
  Their uncommitted changes are in the tree. **Never stage, revert, reformat or "fix" files outside your lane.**

## 2. Ground rules (every lane)

### 2.1 Workflow
1. **Live on save.** The server serves the working tree, so a half-edited shared file (`ai/index.html`,
   `learn-kit.js`, `ai/path.js`) breaks the site for everyone right away. Build new pages under new names, and make
   edits to shared files last, small and tested (section 4).
2. **Commit and push after each finished step** to `main` (no branches, no PRs): `git add <your files only>`,
   `git commit`, `git pull --rebase`, `git push`. Never `git add -A` or `git commit -a`. Never force-push.
3. **Commit messages:** a plain-English paragraph of what a learner gets, with the measured numbers. End with your
   agent's attribution line. Look at `git log` for the style.
4. **After pushing,** run `npm run check` (all OK, 0 lint errors) and `node ai/game.test.mjs`, plus your own tests.
5. **Don't edit `IDEAS.md`** (the owner's plan file, git-ignored). Report in your commit messages and your final
   message: what shipped, what's left, and anything you couldn't verify.
6. **No new dependencies, frameworks or build steps.** Plain HTML, CSS and ES modules; Python only in code boxes and
   notebooks. External scripts only if already used by the site (KaTeX is loaded by learn-kit).
7. **No keys, no external calls from pages** except this site's own `/ai/...` files. Progress stays in the browser.

### 2.2 Content standard (any lane that writes text, questions, lessons or notebooks)
- Follow `ai/notebooks/PEDAGOGY.md`. In short: an exercise asks only for what the path has already taught (syntax,
  notation) or shown (calls). Every lesson has a `<p class="gist">`, a `<details class="deeper"><summary>Why …`
  box, a "Where it breaks" box, and a course.json `check` question starting with "Why".
- **Every number you write must come from running code.** Measure it, then quote it. Several wrong guesses have
  shipped before and were only caught by recomputing. If you can't measure a claim, cut it.
- Questions: predict-before-reveal where possible; wrong options are the real misconceptions; each has a `why`.
- Style: plain, concrete, short sentences; NYC and this site's own data as examples; no hype words.
- Lesson pages: copy the head, CSS, script tags and structure of `ai/zoo-linear.html` (a recent lesson).
  `<main data-lang="python">`, `/learn-kit.js` and `/ai/path.js` module scripts, and a `window.blipContext` at the end.

### 2.3 Testing
- **JS logic:** put it in a pure module (no DOM, no storage) with a `*.test.mjs` next to it that uses
  `node:assert/strict`, as in `ai/game.test.mjs`. Run it with `node ai/x.test.mjs`.
- **Pages:** headless Chromium at 390 px and 1280 px wide. Require: no console errors, no horizontal overflow
  (`document.documentElement.scrollWidth - innerWidth === 0`), widgets respond. The local server is
  `http://127.0.0.1:8080`. Minimal checker (Python Playwright: `uv venv /tmp/pw && uv pip install --python
  /tmp/pw/bin/python playwright && /tmp/pw/bin/playwright install chromium`):
  ```python
  # usage: /tmp/pw/bin/python shot.py zoo-linear.html 390
  import sys, asyncio
  from playwright.async_api import async_playwright
  async def main(page, width):
      async with async_playwright() as p:
          b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": width, "height": 900})
          errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
          await pg.goto(f"http://127.0.0.1:8080/ai/{page}", wait_until="networkidle"); await pg.wait_for_timeout(1500)
          print("errors:", errs, "overflow:", await pg.evaluate("document.documentElement.scrollWidth - innerWidth"))
          await pg.screenshot(path=f"/tmp/{page.replace('/', '_')}-{width}.png", full_page=True); await b.close()
  asyncio.run(main(sys.argv[1], int(sys.argv[2])))
  ```
  learn-kit questions are buttons: click `li[data-k="b"] button`, not the `li`.
- **Notebooks:** they must pass with solutions and run blank (Kaggle runs them blank). Setup once:
  ```sh
  uv venv /tmp/nb && uv pip install --python /tmp/nb/bin/python numpy pandas matplotlib scikit-learn torch torchvision \
      nbconvert ipykernel xgboost lightgbm catboost scipy
  /tmp/nb/bin/python -m ipykernel install --user --name aitest
  ```
  Test one (`NAME` = the notebook stem):
  ```sh
  python3 ai/notebooks/lint.py NAME && python3 ai/notebooks/build.py && python3 ai/notebooks/build.py --solutions /tmp/sol
  for f in /tmp/sol/NAME.ipynb ai/notebooks/NAME.ipynb; do cp $f /tmp/run.ipynb
    /tmp/nb/bin/jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.kernel_name=aitest /tmp/run.ipynb
    /tmp/nb/bin/python -c "import json; nb=json.load(open('/tmp/run.ipynb')); o=''.join(''.join(x.get('text','')) for c in nb['cells'] if c['cell_type']=='code' for x in c.get('outputs',[])); print('✓', o.count('✓'), '✗', o.count('✗'))"
  done
  ```
  The solutions run must have all ✓ and no ✗; the blank run must finish with only ✗. Notebooks load data from
  `https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/` (Cloudflare blocks Python on ihor.sh), so
  **push a new data file before testing a notebook that reads it**. In given code, never use an answer variable
  outside `check(...)` unless guarded (`x if x is not None else None`), and never format answers with `{x:.3f}`.

### 2.4 Gotchas that have bitten before
- Import shared modules by exactly `/ai/learn.js`, `/ai/hud.js` and so on. The server adds `?v=` to page `<script src>`
  URLs, so a different spelling inside a module loads a second copy with separate state. Pages reach learn-kit through
  `window.learnKit`, never by importing it.
- `learn-kit.js` builds its Python bootstrap as a JS template string. After any edit there, extract that Python and
  `compile()` it: a syntax error silently breaks every code box on all three courses.
- Canvases you drag need `touch-action: none`. Wide tables go in `<div class="wide-scroll">`. Long display formulas:
  split them into two `\[ \]` lines.
- Math notation in page text must be taught by an earlier lesson (lint warns), e.g. write "the column and cut with the
  smallest …" rather than `\arg\min`.
- `ai/index.html`'s path parser counts every `<h2 class="stage">` and every `<li>` card with a link in an
  `ol.path`. New non-lesson sections (reference, games) must use a plain `<h2>` and no `ol.path`.

## 3. The game API (already shipped: `ai/learn.js`, `ai/game.js`, `ai/hud.js`)

```js
import { state, save, gain, did, XP, progress, badge, best, leeches, finish, answered, course, path, slug, dueCards } from "/ai/learn.js";
import { dayOf, nextStreak, checkpointXP } from "/ai/game.js";
import { strip } from "/ai/hud.js";
```

| Call | Does |
|---|---|
| `gain(xp, act, onceKey?)` | Adds XP, logs it under today, advances the streak, fires `ai:xp` `{xp, total, act, streak}`. With `onceKey` it pays only once ever (`"daily:2026-10-15"`, `"exam:stage-1"`). Returns the XP paid. `act` is one of `question checkpoint notebook review daily drill exam game practice`. |
| `XP` | amounts: `question 5, checkpoint 50 (+10/point above 4), notebook 30, review 2, daily 30, drill 10, exam 100, game 5, practice 3` |
| `did(onceKey)` | whether a once-only act happened |
| `progress()` | `{xp, streak, best, freezes, week, weekGoal, today: {act: count}}` |
| `badge(id, label)` | awards once and fires `ai:badge`; returns true if new. Ids: `stage-0` … `stage-7`, `zoo`, `capstone`. |
| `best(game, score)` | records a personal best (higher is better); returns true if new |
| `finish(lesson, score, cards)` | marks a lesson done, adds its cards, pays checkpoint XP once |
| `answered(lesson, sectionId, label, right)` | gap tracking: a miss opens `state.gaps[lesson#section]`; two right answers in a row there close it |
| `state` / `save()` | the raw record. **Each lane stores its own data under one top-level key it owns** (`state.daily`, `state.drills`, `state.exams`, `state.games`, `state.practice`, `state.portfolio`) and calls `save()`. Don't change other keys' shapes. |
| `strip(el)` | renders the XP / streak / week strip into `el` and keeps it current |

Rules for XP: only learning acts earn it, never clicks or time; each question, checkpoint, notebook, daily quiz and exam
pays once; games and practice cap their daily XP; nothing on the site is ever locked behind XP.

## 4. Who edits what

Each lane **creates** its own new files freely. Files that already exist are edited only by the lane listed here,
and only in the place given:

| Existing file | Lane(s) | Allowed edit |
|---|---|---|
| `ai/index.html` | B, C, D, E, F, J, H1, H2, I | B/C/F: one line each in the `#you` card script (links). D: the stage-heading loop in the inline script (badge + exam link). E/J: one new plain-`<h2>` section each, just above `<h2 class="stage" id="the-end">`. H1/H2: one lesson card each in `stage-4`. I: the `<p class="milestone">` texts. |
| `ai/course.json` | H1, H2 (new entries); K (`"practice"` fields) | Edit with a script (`json.load`, modify, `json.dump(..., indent=1, ensure_ascii=False)` + newline). Never hand-merge a conflict: re-run your script on the fresh file. |
| `ai/review.html` | C | the gaps list: a "drill it" button per gap |
| `ai/path.js` | K | one block appended at the end, between `// ---------- practice (lane K) ----------` comments |
| `ai/learn.js` | F | one function appended at the end (`testOut`) |
| `ai/plane.js`, `ai/zoo.js`, `/learn-kit.js` | L | accessibility only; zoo.js's exports must keep their signatures (E uses them) |
| existing `ai/notebooks/src/*.py` | M | hints, wording, exercise splits |
| lesson pages with game widgets (`experiments.html`, `evaluating-llms.html`, `making-nets-train.html`) | E | only their widget scripts (scores and bests) |
| root `index.html` | N | the AI world tile's script (near the `import("/ai/learn.js")` line) |
| `ai/game.js`, `ai/hud.js` | nobody | if you need a new XP act or label, say so in your report; the integrator adds it |

**To edit a shared file:** do it as the last step of your lane. Run `git pull --rebase` first, make the smallest edit,
test the page right away (it's live), then commit and push at once.

## 5. Lanes

Effort: S ≈ an hour or two of agent work, M ≈ half a day, L ≈ a day or more.

### Wave 1 (start together)

#### Lane B: the daily quiz (gamification P2), M
- **Creates:** `ai/daily.js` (pure), `ai/daily.test.mjs`, `ai/daily.html`.
- **Spec:** five questions a day, deterministic per date. Seed a small PRNG (sfc32 or mulberry32) from the date string.
  - **Source:** `course.json[lesson].check` for lessons in `state.done` (finished).
  - **Pick:** up to 2 questions from lessons with open gaps (`state.gaps` values have `lesson` and `section`; prefer
    questions whose `sec` points at that section). Fill the rest weighted toward lessons finished longest ago
    (weight = 1 + days since `state.done[l].at` / 7). Always include at least one question starting "Why". Never two
    from the same lesson, and no repeats from yesterday's quiz.
  - **Order:** shuffle the options and remap `answer`.
- **Too early:** with fewer than 2 finished lessons, show "Finish 2 lessons to unlock the daily quiz" and a link to the
  next lesson.
- **Page:** the 5 questions as learn-kit `.q` blocks (`window.learnKit.setupQuestion(q)`, as in `path.js`'s
  checkpoint), the `strip`, and a result card. The card shows the score, links back to each missed question's lesson
  section, and a share line (`AI from scratch · daily 2026-10-15 · 4/5 🟩🟩🟥🟩🟩 · 🔥 5`) with a Copy button.
- **Results:** record every first-try answer through `answered()`. To get the section id from `sec`, fetch the lesson
  page, take `main > h2` number `sec`, and pass its `slug()`. Store `state.daily[day] = {score, ids}`. On finishing,
  `gain(XP.daily, "daily", "daily:" + day)`. A finished day shows its result instead of a new quiz.
- **Index:** one line in the `#you` card: "Daily quiz: 5 questions →" or "Daily quiz ✓ 4/5".
- **Accept:**
  - `node ai/daily.test.mjs` checks: same date and state give the same quiz; different dates differ; gap questions
    come first; a Why question is always there; no lesson repeats; option shuffling keeps the right answer.
  - The page works at 390 px with no errors.
  - Finishing pays XP once; a reload shows the result.

#### Lane C: gap drills (P3), S–M
- **Creates:** `ai/drill.js` (pure question selection + test), `ai/drill.html?gap=<lesson.html>%23<section-id>`.
- **Spec:** collect the inline `.q` blocks from that lesson section: fetch the lesson HTML and take the `.q` elements
  between that `<h2 id>` and the next `<h2>`. Add the checkpoint questions whose `sec` is that section. If that's
  fewer than 3, add checkpoint questions from the neighboring sections. Show the section's gist (`p.gist` inside it)
  and a "reread the section" link first, then the questions.
- **Clearing:** two right answers in a row clear the gap (`answered()` already does this). Then
  `gain(XP.drill, "drill")` and a "Gap closed" card that links to the next open gap.
- **Edits:** a "Drill it" button per gap in `ai/review.html`; in the index `#you` card, the "N gaps to revisit" text
  links to a drill of the oldest gap.
- **Accept:** tests for the selection (section boundaries, fallback to neighbors); a test gap you create by missing a
  question is closed by its drill; no errors at 390 px.

#### Lane D: stage exams, badges and the portfolio page (P4), L, mostly content
- **Creates:** `ai/exams.json`, `ai/exam.html?stage=stage-3`, `ai/portfolio.html`, `ai/exams.test.mjs`
  (schema check: every question has q, 3–4 options, an answer in range, a why, a lesson that exists in course.json).
- **Content:** for each of `stage-0` … `stage-7` and `zoo`, write **8 new questions** that cut across the stage's
  lessons. Use transfer and "why" questions, not recall of one sentence (e.g. "your validation loss rises while
  training loss falls after you double the learning rate; which two lessons explain it?"). Each question has a
  `lesson` field. Follow PEDAGOGY.md: use only notation taught by that stage, make the wrong options real
  misconceptions, and verify every number by running code. Stage 0 is for absolute beginners: no code, no formulas.
- **Exam:** the stage's 8 questions plus 7 checkpoint questions sampled from its lessons, 15 in all; pass at 12.
  Without every stage lesson done it says so, offers "try anyway", and still awards the badge on a pass.
  - **On a pass:** `badge("stage-N", "<stage title>")` and `gain(XP.exam, "exam", "exam:stage-N")`.
  - **Results:** misses go through `answered()`; store attempts in `state.exams`.
- **Index:** each stage heading shows 🏅 when its badge is earned, plus a "stage exam" link (in the inline script's
  stage loop). Also award `badge("capstone")` when `capstone.html` is done (in the same script).
- **Portfolio page:** finished lessons with checkpoint scores, notebooks marked finished (`state.once` keys
  `notebook:*`), badges, XP and best streak. A form to add links to your own published notebooks or projects
  (`state.portfolio`). A print stylesheet. Linked from the `#you` card.
- **Accept:** the schema test passes; one exam per stage works end to end at 390 px; a badge shows on the index; the
  portfolio prints on 1–2 pages for a learner with 10 lessons done. Report every question you're unsure of.

#### Lane E: mini-games (P6), M
- **Creates:** `ai/games/which-model.html` and `ai/games/estimate.html`.
- **Which model:** uses `ai/zoo.js`. Show the probability map one of the 8 models drew on a random dataset; the
  learner picks among 4 model names. Ten rounds, a running streak, then `best("which-model", score)`. Explain after
  each answer ("boxes → a tree; axis-aligned clouds → naive Bayes").
- **Estimate:** about 40 hand-written items, each with a true value and its source lesson (ln 10 ≈ 2.3, parameters
  of a 4096 × 4096 layer, 63% of rows in a bootstrap sample, …). Within ±10% counts as right.
- **XP for both:** `gain(XP.game, "game")` per correct answer, capped at 10 rewarded answers a day
  (`state.log[dayOf()].acts.game`).
- **Existing widgets:** add a score and a personal best (`best()`) to the three widgets that are already games: the
  seed lottery (`experiments.html` §1), grade the graders (`evaluating-llms.html` §1) and the loss-curve doctor
  (`making-nets-train.html`, `.doctor`). Show "your best: N" by each.
- **Index:** a plain `<h2>Games</h2>` section above "At the end, you can" listing the games with your bests.
- **Accept:** every game works on a phone (taps, no hover-only UI); bests persist; XP caps hold; no errors.

#### Lane G: publish the notebooks on Kaggle, S (operations)
- **Pending:** 39 notebooks (every zoo notebook plus the backlog). Kaggle answered HTTP 429 all day on 2026-10-15.
- **How:** `KAGGLE_API_TOKEN` is in `.env`; the kaggle CLI is installed in the notebook venv; publish one at a time
  with `python3 ai/notebooks/build.py --kaggle NAME`, retrying every 30 minutes while it says 429.
- **Before you start:** list what's already up with `kaggle kernels list --user irishdash --page-size 100 --csv`
  (another job may have published some). Afterwards, check each with `kaggle kernels status irishdash/<slug>`; a
  run that errors on Kaggle is a bug to report (blank notebooks must run).
- **Accept:** every slug in `ai/notebooks/index.json` is published, or a report lists the ones that aren't and why.

#### Lane H1: new lesson "Data with SQL" (stage 4, after `pandas-and-sklearn.html`), M–L
- **Goal:** a junior engineer pulls training data with SQL. Cover SELECT, WHERE, GROUP BY, JOIN and window
  functions, building a training table (one row per example, features as of the prediction time), as-of joins against
  leakage, and SQL next to pandas.
- **Data:** the outage archive plus the stations, so the leakage story continues from the features lesson.
- **Mechanics:** `import sqlite3` works in page code boxes (Pyodide loads it from the import; verify in the browser).
  One widget: a query box with a live result table, or a JOIN visualizer.
- **Ships with:** the page, a notebook (sqlite3 is in Python's stdlib on Colab and Kaggle), a course.json entry
  (goals, needs, 6 cards, 5 checks with a "Why" question), and a card in `stage-4`. SQL strings aren't Python syntax,
  so no `teaches` changes.
- **Accept:** lint 0 errors, the depth standard met, notebook tests pass, no errors at 390 px.

#### Lane H2: new lesson "Your ML workbench: the command line, git and environments" (stage 4, first), M–L
- **Goal:** what a junior needs on day one: a terminal, files and paths, running scripts, virtual environments and
  pinned versions, git (commit, branch, diff, revert), and why notebooks alone don't reproduce.
- **Page:** a browser-side simulated terminal or a git-graph widget (no real shell); predict-first questions
  ("what does `git diff` show after `git add`?").
- **Notebook:** run git in Colab through a given helper `sh(cmd)` (`subprocess.run(cmd, shell=True, …)`, explained
  in a worked cell). Exercises: init a repo, commit, branch, break something, find it with diff, revert.
- **Ships with:** a course.json entry and a card at the start of `stage-4`.
- **Accept:** as H1.

#### Lane I: milestone notebooks, L
- **Spec:** one larger "combine" notebook per stage, where the learner does more and is given less. They aren't lesson
  notebooks, so `lint.py` doesn't check them: apply PEDAGOGY.md yourself and note any ledger exceptions in the
  notebook's intro. Each has hints and checks, `### BEGIN/END SOLUTION` blocks and the same test procedure.

  | Notebook | Content |
  |---|---|
  | `milestone-2.py` | a digit classifier written from scratch in NumPy (forward, backprop, SGD), then the same in PyTorch |
  | `milestone-3.py` | bank calls end to end: baseline, leak check, time-aware split, boosted trees vs logistic, threshold from costs, a short model card |
  | `milestone-4.py` | elevator outages in pandas + scikit-learn pipelines, and a small PyTorch image classifier |
  | `milestone-5.py` | fine-tune a pretrained image model on a small public dataset; precision and recall per class |
  | `milestone-6.py` | a question-answering bot over `ai/data/course-chunks.json` (retrieval + an open model or the course's own retrieval code), with an eval set that measures grounding |

- **Index:** each stage's `<p class="milestone">` links to its notebook's Colab URL
  (`https://colab.research.google.com/github/ikruchynskyi/ihor.sh/blob/main/ai/notebooks/milestone-N.ipynb`).
- **Accept:** each notebook passes the solutions/blank test on CPU in under 10 minutes (stage 5 may use a Kaggle
  GPU: put `# kaggle: gpu` in the source).

#### Lane J: reference pages, M
- **Creates:**

  | Page | Content |
  |---|---|
  | `ai/cheatsheets.html` | NumPy, pandas, scikit-learn and PyTorch: only the calls the course uses, each with a one-line example and a link to the lesson that first uses it (`python3 ai/notebooks/lint.py --ledger <lesson>` lists what's seen where) |
  | `ai/notation.html` | every math symbol on the path, its meaning in words, an example, and the lesson that teaches it (the `math:*` ids in course.json `teaches` plus `NOTATION` in lint.py) |
  | `ai/datasets.html` | every dataset the path uses (files in `ai/data/`, scikit-learn loaders, downloads in notebooks): source, license, rows, columns, and the lessons that use it. Check each license; flag unclear ones. |
  | `ai/stuck.html` | "When you're stuck": shapes that don't match, NaNs, loss not falling or exploding, suspiciously perfect scores (leakage), overfitting, Kaggle without Internet, Colab out of memory, a code box that won't run. Each problem gets its symptom, how to check, the fix, and the lesson. |

- **Index:** a plain `<h2>Reference</h2>` section above "At the end, you can" linking these and the glossary.
- **Accept:** every link resolves (script it); no errors at 390 px; tables wrapped.

#### Lane K: generated practice problems for the math, M–L
- **Creates:** `ai/practice.js` (pure generators), `ai/practice.test.mjs`, `ai/practice.html?skill=<id>`.
- **Generators:** about 20 skills from stages 0–1: mean and MSE, a dot product, matrix × vector, a 2 × 2 determinant
  and inverse, the derivative of a polynomial at a point, the chain rule with numbers, a partial derivative, one
  gradient-descent step, a log rule, softmax of 3 numbers, Bayes with a table, expectation, variance, conditional
  probability, entropy of a coin, eigenvalues of a 2 × 2 symmetric matrix, …
  - **Shape:** `(rng) → {id, lesson, prompt (KaTeX allowed), answer, tol, steps: [worked solution lines]}`.
  - **Numbers:** use friendly values (integers or one decimal).
  - **Notation:** only what the skill's lesson has taught.
- **Page:** one problem at a time with a number input. On a wrong answer, show the worked steps and a fresh problem of
  the same skill. Five right in a row means "mastered" (`state.practice[skill]`). `gain(XP.practice, "practice")`
  per right answer, capped at 20 a day.
- **Links from lessons:** add `"practice": ["skill-id", …]` to course.json entries with a script. Append one block
  at the end of `ai/path.js` that shows "Practice this: <skill> →" links when the lesson's entry has them.
- **Accept:**
  - The tests check that every generator's answer matches an independent computation for 200 seeds, that each seed
    always gives the same problem, and that the `steps` end at the answer.
  - The page works at 390 px.

#### Lane L: accessibility of the widgets, M
- **`ai/plane.js` `scene()`:** the canvas becomes focusable (`tabindex=0`) with a visible focus ring. Tab and
  Shift+Tab pick a handle; arrow keys move it (Shift for a bigger step). Add an optional text summary in an
  `aria-live` region below the canvas, set through an `onChange` callback; give the pages that use `scene()` a
  sensible default.
- **`ai/zoo.js` `map()`:** set the canvas's `aria-label` to a summary (model, accuracy).
- **Other draggable canvases:** sweep the pages for them (`grep -l pointerdown ai/*.html`). Make the most important
  ones keyboard-usable; list the rest in your report.
- **KaTeX on phones:** check that long display formulas scroll or wrap without page overflow.
- **`learn-kit.js`:** after any edit, run the bootstrap compile check from 2.4.
- **Accept:** on 5 representative pages you can drag every handle with the keyboard alone; no page overflows at 390 px
  (script over all `ai/*.html`); radio and electronics pages that use learn-kit still load without errors.

#### Lane M: cold-learner read of the stage 1–6 notebooks, M–L
- **Spec:** follow PEDAGOGY.md section 4.3 for every notebook of stages 1 to 6 (in `ai/index.html` order). Read the
  lesson page, then the notebook, as someone who knows only the path so far.
- **Fix:**
  - first hints that give the answer away (hint 1 should nudge; the last hint can be the answer),
  - exercise text that leaves the task unclear,
  - steps too big for their rung.
- **Each fixed notebook:** must still pass lint and the solutions/blank test.
- **Report:** a list of issues found, and the fixes that need an earlier lesson changed (don't change lesson pages:
  report them).

#### Lane N: XP and streak on the home page's AI tile, S
- **Spec:** the root `index.html` already imports `/ai/learn.js` for the AI world tile. Show XP, the 🔥 streak and
  "cards due" there using `progress()`. Keep the tile's layout; check the home page at 390 px with no new errors.
  Other agents work on the root page too, so keep the edit tiny.

### Wave 2 (after D is merged)

#### Lane F: placement test (P5), M
- **Creates:** `ai/placement.html`. "Already know some of this?": per stage, 10 questions from `ai/exams.json` and
  its checkpoints. 8 of 10 or better marks every lesson in the stage as tested out.
- **`learn.js`:** append `export function testOut(lessons)`. It sets
  `state.done[l] = {at, score: null, testedOut: true}` and adds the lessons' cards like `finish()`, but pays no XP.
  Then `save()`.
- **Index:** in the `#you` card, a link for new learners ("Know some ML already? Take the placement test"). Make
  sure "Continue" then skips tested-out lessons (it does if they're in `state.done`) and that path.js shows them as
  done ("tested out" instead of a score).
- **Accept:** testing out of stage 1 makes Continue point at stage 2; the review deck has stage 1's cards; no XP paid.

### After all lanes: integration (the owner or one agent)
- Read every lane's report.
- Add any requested XP acts and labels to `game.js` and `hud.js`.
- Check the index's `#you` card reads well with all the new links (daily, drill, exam, portfolio, placement), and
  tidy it.
- Run `npm run check`, all `ai/*.test.mjs` files, and the overflow script on every `ai/*.html`.
- Update IDEAS.md.

## 6. Schedule at a glance

| Wave | Lanes | Depends on |
|---|---|---|
| 1 | B, C, D, E, G, H1, H2, I, J, K, L, M, N | the game API (shipped) |
| 2 | F | D's `exams.json` |
| 3 | integration | all |

Lanes that write the most new content (D, I, H1, H2, K) are the longest. G and N are quick.

## 7. Open questions for the owner (answer before or during wave 1)
1. Daily quiz share line: keep it, or leave sharing out entirely?
2. Exams: may a learner take a stage exam before finishing the stage (the plan says yes, "try anyway")?
3. Milestone 5 needs a small public image dataset with a clear license: pick one (e.g. Oxford-IIIT Pets, CC BY-SA 4.0)?
4. SQL lesson: SQLite only, or show DuckDB too (not in Pyodide by default)?

---

## 8. Next: Guided End-to-End Capstone Project ("Personal AI Copilot & Research Partner")

An end-of-course guided hands-on capstone project that ties together the entire curriculum into a real-world, highly useful application the learner can deploy and use daily:

### 8.1 The Project
- **Application**: An autonomous, local or cloud-deployable **Personal AI Research & Second-Brain Copilot** that ingests markdown notes, PDFs, voice memos, and receipts, indexes them with SQLite and PyTorch vector embeddings, performs hybrid RAG with verifiable citation grounding, classifies item priority using cost-aware boosted trees, and serves via a monitored FastAPI web endpoint.
- **Why it matters**: Solves a real problem (personal knowledge management with zero hallucinations and full provenance) rather than scoring on an artificial benchmark.

### 8.2 Cross-Curricular Coverage
1. **Data Engineering & SQL (Stage 4)**: SQLite schema (`data-with-sql.html`) with window functions for document versioning and chunk indexing without temporal leakage.
2. **Foundations & Geometry (Stages 1–2, L1–L3, P1–P5)**: High-dimensional vector dot-products, cosine similarity, SVD/PCA 2D semantic projection map in the browser.
3. **Classic Tabular ML (Stage 3 & Model Zoo)**: Baseline heuristic vs. Logistic Regression vs. LightGBM/HistGradientBoosting on document metadata to predict urgency/category; cost-sensitive decision threshold tuning.
4. **Deep Learning in PyTorch (Stages 2, 4, 5)**: Custom neural bi-encoder / re-ranking head in PyTorch (`nn.Module`), training loop with AdamW, learning rate schedules, dropout, and batching.
5. **Multimodal Audio/Vision (Stage 5 & Electives)**: Audio voice memo transcription (Whisper pipeline) and document image/receipt OCR parser (PyTorch vision/detector).
6. **LLMs, Grounded RAG & Agents (Stage 6)**: Hybrid dense vector + BM25 sparse keyword retrieval; prompt engineering with strict citation schema (`[doc#chunk]`); automated evaluation harness measuring Citation Grounding Ratio, Context Recall@k, and Faithfulness; structured tool-calling (database query, math calculator, web retrieval).
7. **Production Serving & MLOps (Stage 7)**: Asynchronous FastAPI server with Pydantic request/response validation; latency/token budget metrics; production Model Card detailing provenance, intended use, and limitations; real-time MLOps drift monitor computing PSI (Population Stability Index) on incoming query embeddings to detect distribution shift.

### 8.3 Guided Milestones & Deliverables
- **Milestone 1**: Data Pipeline & SQLite Ingestion (chunking, token counts, metadata schema).
- **Milestone 2**: Tabular Importance Classifier (LightGBM/Logistic baseline, calibration, ROC/PR curves, cost-sensitive threshold).
- **Milestone 3**: PyTorch Embeddings & 2D SVD Semantic Map (vector indexing, similarity search).
- **Milestone 4**: Multimodal Voice/Image Ingestion (Whisper audio transcription / OCR).
- **Milestone 5**: Grounded RAG & Automated Eval Suite (citation generator, faithfulness & recall eval script).
- **Milestone 6**: FastAPI Service & Web UI (async API, streaming chat interface, Pydantic validation).
- **Milestone 7**: Production MLOps, PSI Drift & Model Card (latency tracking, embedding drift detection, structured Model Card).
- **Deliverables**: Source repository + `milestone-7.ipynb` Colab/Kaggle notebook + Hugging Face Space URL + Model Card. Unlocks the "Capstone Engineer" distinction on `ai/portfolio.html`.

