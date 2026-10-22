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

**Status 2026-10-21: every lane has shipped** (B daily quiz, C gap drills, D exams/badges/portfolio, E mini-games,
F placement, G all 78/78 Kaggle notebooks published, H1 SQL, H2 workbench, I milestones 2–6, J reference pages, K practice generators, L keyboard access,
M cold-learner notebook read, N home-page XP), checked: each lane's files exist and `ai/*.test.mjs` all pass.
Lane G finished publishing all 78 of 78 notebooks to Kaggle on 2026-10-21 (including the final 18 notebooks + republished `s1-what-is-ml` v4).

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

## 7. Open questions for the owner (settled by what shipped)
1. Daily quiz share line: keep it, or leave sharing out entirely?
2. Exams: may a learner take a stage exam before finishing the stage (the plan says yes, "try anyway")?
3. Milestone 5 needs a small public image dataset with a clear license: pick one (e.g. Oxford-IIIT Pets, CC BY-SA 4.0)?
4. SQL lesson: SQLite only, or show DuckDB too (not in Pyodide by default)?

As built: (1) the daily quiz keeps its share line; (2) a stage exam can be taken early, with a note recommending the
lessons first; (3) milestone 5 uses CIFAR-10 (from the Hugging Face hub); (4) the SQL lesson is SQLite only.

---

## 9. Stanford-depth additions (revised 2026-10-15 after review): steps A–D shipped and reviewed (a00b512)

The first draft of this section (commit `9b74879`) proposed nine steps inspired by CS221, CS229, CS224U, CS231n,
CS234 and CS236. A review against the lessons as they stand found that about half of it is **already shipped**, and
several prerequisite citations were wrong. This version keeps only what is genuinely missing.

**Before planning any lesson change: open the target lesson and grep the whole of `ai/*.html` for the topic.**
The draft was written from lesson titles, not lesson contents, and that is how it re-planned existing material.

### 9.1 What the review found (don't repeat these)

**Already taught; drop from the queue:**

| Draft step | Where it already lives |
|---|---|
| 1. IoU, anchor boxes, NMS, box formats | `inside-a-detector.html` (anchors, IoU, NMS, center x, y, width, height) and `09-vision.html` §3 |
| 2. Bias-variance decomposition | `11-overfitting.html` lines 50–57: the "noise + bias² + variance" deeper box with \(\mathbb{E}[(y - \hat f)^2] = \sigma^2 + (f - \bar f)^2 + \mathbb{E}[(\hat f - \bar f)^2]\) and measured values per degree |
| 4. Cohen's kappa; faithfulness to sources | `evaluating-llms.html` §1 "Grade the graders" (kappa) and §4 "Faithfulness" |
| 5. Kernel trick, RBF kernel | `zoo-svm.html` (RBF width slider, "Why the kernel trick works" box) |
| 7. Policy gradients, REINFORCE, RLHF with PPO, reward hacking | `reinforcement-learning.html` §4 and its "Where it breaks" box; REINFORCE on CartPole is in its notebook |

**Wrong prerequisite citations (check the ledger in `course.json`, not memory):**
- \(\mathbb{E}[\cdot]\) (`math:expectation`) is taught in `c4-integrals.html`, not `p2-describing-data.html`.
- Confusion matrices are in `12-measuring-a-model.html`, not `p1-probability-and-bayes.html`.
- Python classes (`py:class`) are taught in `training-in-pytorch.html`, not `s2-just-enough-code.html`.
- "Graph concepts" are not in `c1-derivatives.html` (that lesson is about derivatives). No lesson teaches graphs yet;
  a search lesson must teach nodes, edges and neighbors itself.

**Claims to remove:**
- "NLI as a deterministic, sub-10ms hallucination checker": NLI models miss contradictions, especially over long
  passages, and the speed depends on the model and hardware. Present NLI as a cheap first filter that has its own error rate.
- "Handwritten transit digits": no such dataset exists. Use MNIST, or Omniglot (already used in `faces-and-style`).
- Mercer's theorem: it appeared in the step box but in none of the modules. Leave it out.
- "Teleprompters" is DSPy's old name; DSPy now calls them optimizers.
- Step 9 named the DPO notebook two ways (`milestone-dpo.ipynb` vs `milestone-dpo-align.py`). Notebook sources are
  `ai/notebooks/src/<lesson>.py`, built to `ai/notebooks/<lesson>.ipynb`.
- Quality gates hard-coded "all 167 OK"; that number changes whenever a page is added.

### 9.2 Ground rules
1. **The ledger rule** (`ai/notebooks/PEDAGOGY.md`): use only notation and syntax an earlier lesson in `course.json`
   teaches. Verify each prerequisite by finding the lesson whose `"teaches"` contains the key, and check that it comes earlier in the file.
2. **Depth pillar**: every lesson keeps its gist lines, a Why box, a Where-it-breaks box and a Why question.
3. **Real data where it is natural** (subway graph, city data). Don't force NYC data onto topics where it's fake.
4. **Lesson code is Python run by Pyodide; in-browser models use transformers.js.** Anything that needs a hosted
   LLM or a package Pyodide can't install belongs in the notebook, not the lesson.

### 9.3 Queue (in order)

#### Step A. New elective: search, planning and constraints (CS221)
- **New files**: `ai/search-and-planning.html`, `ai/notebooks/src/search-and-planning.py`.
- **Register it like `faces-and-style`** (commit `6788f8a`): a `course.json` entry (goals, cards, check, teaches),
  an Elective card in `ai/index.html#electives`, and an entry in `ai/notebooks/index.json`.
- **Content**: states, actions, costs; BFS → uniform-cost search (Dijkstra) → A* with an admissible heuristic
  (straight-line distance ÷ top train speed); a widget running A* on the subway graph (`ai/data/rail-stations.json`)
  that shows which nodes each method expands; minimax with α-β pruning on a small game (tic-tac-toe); a CSP with
  backtracking plus forward checking on a small scheduling problem.
- **Teach in the lesson itself**: graphs (nodes, edges, neighbors) and the priority queue (`heapq`). No earlier lesson teaches them.
- **Where it breaks**: the state space explodes; a heuristic that overestimates loses the guarantee of finding the
  shortest path; search plans in a model of the world, and the world may not match it.
- **Why it's here**: it is the only CS221 pillar with no lesson on the path.

#### Step B. DPO: extend `reinforcement-learning.html`, or make a short elective
- **Gap**: DPO appears nowhere on the path. RLHF is covered in one paragraph.
- **Content**: preference pairs \((x, y_w, y_l)\); the Bradley-Terry model (the probability one answer is preferred is
  the sigmoid of the reward difference; the sigmoid is taught in s3); the reward model plus PPO pipeline that already
  exists; then DPO, which trains the policy directly on pairs using a log-probability ratio against a frozen
  reference, with β controlling how far the policy may drift; a widget with a β slider over a handful of answer pairs.
- **Prerequisites to verify in the ledger**: sigmoid and log-probabilities (`05-probability-and-loss`), KL
  (`p5-information`), fine-tuning (`fine-tuning-and-lora`), pairwise judging (`evaluating-llms`).
- **Do not** derive PPO's clipped objective; the existing paragraph is enough for this path.
- **Notebook**: DPO loss in PyTorch on a tiny preference set (for example a small GPT-2 or a toy policy over
  canned answers). Show how far the policy moves from the reference and the accuracy on held-out pairs.

#### Step C. VAEs: a section in `diffusion.html`, or a short elective before it
- **Gap**: there are no autoencoders or VAEs. `diffusion.html` mentions an autoencoder once, in its latent diffusion bullet.
- **Content**: an autoencoder bottleneck; why a plain autoencoder's latent space has holes; the VAE: the encoder outputs
  μ and σ, sampling uses the reparameterization \(z = \mu + \sigma\epsilon\), and the loss is reconstruction plus KL to
  \(\mathcal N(0, I)\). Write the ELBO only as "reconstruction minus KL", with a one-line reason and no full derivation.
  Widget: a 2D latent grid of decoded MNIST digits.
- **Prerequisites**: normal distribution, KL (`p5-information`), training loops (`training-in-pytorch`).
- **Notebook**: a VAE on MNIST with a 2D latent space, a plot of the latent space, and interpolation between two digits.

#### Step D. Small additions to existing lessons
1. **`evaluating-llms.html`: behavioral tests (CheckList).** Add to §2: invariance tests (rephrase or rename and
   the answer must not change), directional tests (adding a fact should change the answer in a known direction),
   minimum-functionality tests. Use the existing `llm-eval.json` style of data.
2. **`evaluating-llms.html` §4: NLI as a faithfulness filter.** Entailment, neutral or contradiction between a passage and a claim;
   run a small NLI model through transformers.js if one fits the page, otherwise put it in the notebook. Show its misses.
3. **`zoo-svm.html`: a deeper box on the dual form.** The prediction depends on the data only through dot products
   \(\langle x_i, x\rangle\), and that is *why* the kernel trick (already in the lesson) works. Lagrange multipliers
   are taught in `c5-convexity-and-constraints` (earlier in the ledger). Add the concentric-rings → \(z = x^2 + y^2\)
   picture only if the existing kernel box doesn't already make the point.

#### Dropped
- **DSPy in `using-llms.html`.** It can't run in the lesson (it needs a hosted LLM and doesn't install in Pyodide), and it's a framework
  of the moment on a path about foundations. If anything, add a short Why box to §3: "choose few-shot examples by
  measuring them on a small dev set" with plain functions. Prompt optimization is just model selection.
- **A "modular NN" milestone (CS231n-style layers with backward passes).** `04-backprop.py` and `milestone-2.py`
  already write backward passes and check gradients numerically. Don't add another.

### 9.4 Done means
- `npm run check` passes (runs `lint.py` and `check.ts`): 0 errors, 0 warnings, every page OK.
- `python3 ai/notebooks/lint.py --depth` lists no lessons missing the depth standard.
- Notebooks: both versions tested, then published to Kaggle (`build.py`).
- The page works at 390 px and 1280 px wide with no horizontal scroll.
- One step per commit, pushed and deployed.

---

## 10. In-depth review: a simulated learner with only basic arithmetic (after the course is complete)

**Goal.** Before calling the path finished, prove the claim on the home page: someone who knows only school
arithmetic can get from Start 1 to the capstone using nothing but the course. An LLM plays that learner, a second
LLM is the instructor they can ask, a third keeps notes on every struggle and fixes the course, and the owner
proofreads what changed. Every struggle is treated like a failing test (PEDAGOGY.md §5).

### 10.1 Roles

| Role | Who | Sees | Does |
|---|---|---|---|
| **Learner** | Gemini with `.agents/skills/course-student` (the token-heavy role), held to a persona; it works in the browser like a visitor | only what the path has shown so far, in `ai/index.html` order: each lesson's rendered text, widget readouts, code-box output, its notebook | reads, predicts before every reveal, answers every question, runs every code box and notebook exercise, takes checkpoints and stage exams, asks the instructor when stuck, says "I'd quit here" when it would |
| **Instructor** | Claude with `.claude/skills/course-editor` (the same agent as the editor), answering only from the course | the current page and the course | answers the learner, and says for each answer whether the course already covered it (where) or not |
| **Auditor** | a script plus a small model | the learner's transcript and the cumulative text it was shown | checks every cited quote is really in what was shown (string match), and flags reasoning that uses outside knowledge |
| **Editor** | an agent following `.claude/skills/course-guardrail` | transcripts, struggle log, the repo | turns each struggle into a fit plan and a fix, then reruns the learner on the changed lesson |
| **Owner** | you | per-stage review packets | proofreads the changes, accepts or sends back |

### 10.2 The learner's persona and rules (its system prompt)
- **Knows:** whole numbers, negatives, decimals, fractions, percentages, order of operations, reading a simple
  chart, fluent English, using a browser. **Doesn't know:** algebra beyond "a letter stands for a number",
  exponents, logs, functions, any programming, any statistics or ML vocabulary.
- **Only course knowledge.** Every answer, prediction and line of code ends with a citation: the lesson, section and
  a short verbatim quote from what it was shown that justifies the step. A step it can't cite is written as a
  guess and flagged. ML knowledge from pretraining isn't allowed. Citations make that rule checkable.
- **Honest effort.** Predicts first, then checks; uses `hint(1)` before `hint(2)` before `answer(n)`; records time and
  attempts; may ask the instructor at most three times per section before writing "stuck".
- **Struggle notes** in a fixed form: `{lesson, section, kind, quote, what I expected, what happened, would I quit}`,
  where kind is one of: unknown term or symbol, step too big, unclear wording, example missing, widget confusing or
  broken, code error, question ambiguous, answer seems wrong, too long/boring.

### 10.3 Tooling (built: `ai/review/learner.py`, `browse.py`, `setup.sh`; the run in `ai/review/run/` is git-ignored, packets in `ai/review/packets/` are committed)
The two skills drive these: `learner.py` shows lessons with answers hidden, grades, runs code and notebooks, carries
questions and replies, and audits citations; `browse.py` is Playwright on the real pages (screenshots, widgets,
in-page Run, JS errors and overflow logged automatically). The design notes below are what they implement.
1. `render.py`: Playwright renders each lesson in path order to text: prose, formulas (KaTeX alt text), question
   stems and options (answers hidden until the learner commits), widget readouts at their default and after scripted
   moves, and code-box output. One file per lesson, plus the cumulative "seen so far" text for citation checks.
2. `learner.py`: runs the learner lesson by lesson with the persona, the lesson text, a memory of its own notes
   (not the full earlier text, as a real learner forgets), and tools: `ask_instructor`, `run_code` (Pyodide in the
   headless page), `answer_question`, `run_notebook_cell` (the blank notebook in a scratch Jupyter kernel).
3. `audit.py`: verifies every citation quote is a substring of the seen-so-far text; scores outside-knowledge
   leaks; computes the metrics below.
4. `report.py`: a per-stage packet (Markdown, published as a private page for the owner): struggles ranked by
   how many learners hit them and whether they'd quit, the instructor's "not covered" answers, metrics, and the
   editor's fixes with before/after excerpts.

### 10.4 Calibrating the learner first (stage 0 pilot)
Plant three known gaps in a scratch copy of stage 0: a symbol used one lesson early, a deleted worked example, and
a question whose answer needs an untaught step. The learner must flag all three, and the auditor must catch a
deliberately injected outside-knowledge answer. Tune the persona until it does. Without this check, a smart model
that quietly fills gaps would hide the very problems this review exists to find.

### 10.5 The run
1. **Readiness gate:** every lesson live; `npm run check` 0/0; `lint.py --depth` complete; every notebook passes
   both ways and is on Kaggle; the content is tagged (`review-start`).
2. **Stage by stage, in order.** Run both learners on a stage; the editor fixes its struggles (earliest lesson that
   causes them, per "fix the ledger, not the symptom"), reruns the learner on the changed lessons until each
   struggle is gone, and only then moves on: later stages build on the fixed earlier ones.
3. **Owner packet per stage:** read the changed passages in place on the site, then accept or comment.
4. **Final full rerun** from Start 1 to the capstone with a fresh learner (no notes from earlier runs): the
   metrics must meet the bar in 10.6 with nothing new found.
5. Reuse for the other courses afterwards with their own personas: Radio (school math, no electronics), Electronics
   (school math), Yomu (no Japanese; the "ledger" is JLPT level).

### 10.6 Done means (per lesson, then for the whole path)
- Zero citation failures the auditor can't resolve, and zero instructor answers marked "not covered".
- No "I'd quit here" left, and no step where the learner needed `answer(n)`.
- Checkpoint questions right on the first try ≥ 80%; every stage exam passed on the first attempt.
- Every notebook completed by the learner with at most `hint(1)` on average per exercise.
- Every fix went through the guardrail's fit plan, kept `npm run check` and `--depth` green, and the owner accepted
  the stage packet.

### 10.7 Progress (the editor updates this after every lesson; pick up from here)

Student: Gemini (`.agents/skills/course-student`). Editor: Claude (`.claude/skills/course-editor`). The live run is
`ai/review/run/` (git-ignored; `python3 ai/review/learner.py path` and `report` show it). If that folder is gone,
start a new run and skip the lessons verified below (or rerun them after big changes).

| Lesson | Verified | Result | Fixes | Open |
|---|---|---|---|---|
| s1-what-is-ml | 2026-10-15 | 4/4 questions first try, notebook 4/4 without hints, 20 min, confidence 4/5 | 81ee6b0 notebook Part 2 marked optional with its real cost; c29e04a §2 chart labels clear on a phone, plane.js text() kept inside charts | the student named squared error and learning rate as hardest but logged no struggle for them: recheck on the final rerun |
| s2-just-enough-code | 2026-10-16 (provisional) | 7/7 first try, 9 code boxes ran, notebook 9 ✓ without hints; only 4.5 real minutes (reported 25), boxes run in one burst, no struggles logged, and it said "broadcasting", a word the lesson never uses: the student answered as an expert | none to the course; tool: exercise citations required, "hardest" logged as a struggle, real minutes recorded | rerun s2 under the new rules on the final pass; zero-indexing and "arithmetic on whole arrays" named hardest |
| s3-math-warm-up | 2026-10-16 | 13/13 (10 graded first try, 3 open), notebook 11 ✓ without hints, every exercise cited (after solving), 9 real minutes | none: "reading formulas aloud and turning them into code", named hardest, is what s3 teaches with worked examples | answers came ~5 s apart: still expert speed |
| s4-your-first-shared-model | 2026-10-16 | 5/5 first try, 2 hints, 6 exercises cited; notebook not run (GPU) | none to the course; tool skips GPU notebooks | Oxford pet photos download at 160–370 KB/s: owner chose a warning, added to the s1 and s4 notebooks |
| 01-matrices-are-moves | 2026-10-16 | 7/7 first try, notebook 11 ✓ without hints, 5 exercises cited, 8 real minutes, worked section by section | none: "how basis vectors decide where every vector lands", named hardest, is the lesson's core idea with its widget | |
| l1-systems-and-inverses | next | | | |

Other courses (`COURSE=…`, run in `ai/review/run-COURSE/`; one table each, added on a course's first run):

| Course | Lesson | Verified | Result | Fixes | Open |
|---|---|---|---|---|---|
| electronics | 17–23 | 2026-10-22 | Gemini QA pass, not a logged review (it read answers from the markup; see learn/electronics/PLAN.md) | 43bb0b8 skill rules | a logged run: `COURSE=electronics L init --from 17` |
| electronics | 17–23 | 2026-10-22 | Logged run, invalid: batch-answered (ch17's 7 answers in 1 s, options quoted as reasons), all done in ~3 min | 7d13507 tools refuse batching | rerun: `COURSE=electronics L init --fresh --from 17` |
| electronics | 17 | 2026-10-22 | run 2 (Gemini): 7 min, 6/6 right first try + 1 open answer, confidence 4; one real gap (RST unexplained before its question) | 75c5b82 | — |
| electronics | 18 | 2026-10-22 | run 2: 5 min, confidence 4; hardest: the two regulators' opposite pinouts (taught in §3, tested in §9: no change) | — | — |
| electronics | 19 | 2026-10-22 | run 2: 5 min, 5/5 first try, confidence 4; hardest: the 4017's scattered pin numbers (that's §2's point: no change). It slid §4's supply to 5 and 12 V only, never hunting the threshold the challenge asks for | — | §4's challenge isn't checked by anything |


## 11. Guardrail review of the math (Start 3 and stage 1), 2026-10-22

The owner asked for the math to be easy and logical against the course guardrail. Read as the §10.2 learner (school
arithmetic, no algebra, trig or notation beyond what the path has taught): `s3-math-warm-up`, `01-matrices-are-moves`,
`l1-systems-and-inverses`, `02-gradients`, `c1-derivatives`, `c2-many-variables`, `p1-probability-and-bayes`,
`p2-describing-data`, `l2-eigenvectors-and-pca`, every section, box and code box; then a scan of the whole path, in
`index.html` order (the one the linter and the lesson links use; `course.json`'s key order means nothing), for the
first lesson using each notation. `lint.py` and `--depth` were green before: the ledger
checks that a lesson declaring a symbol *uses* it, not that the page *explains* it, which is how l1 "teaches" the
transpose without a word about it.

**What holds up.** Every lesson opens with its purpose, sections are pictures first, questions come before reveals,
the order inside stage 1 builds (moves → equations → slopes → rules → many inputs → probability → data → eigenvectors),
and s3, 02 and p1 need almost nothing.

**Gaps (all 3a: a clause or a sentence where the thing is first used; none needs a new section):**
- M1 `01` §1: "Pythagoras" used for the length, never said. Gloss it in one clause (school geometry is outside the
  persona).
- M2 `01` §2: the dot product's gist and formula lean on \(\cos\theta\); no lesson says what a cosine is, and 02, c1
  and c2 lean on it (and on sin) too. One sentence with the picture: an arrow of length 1 at angle θ; its shadow on
  the other arrow's line is \(\cos\theta\) (1 same way, 0 at right angles, −1 opposite), and its height is
  \(\sin\theta\), a wave as θ turns. Register `math:trig` in `lint.py`, taught by `01`, so no later lesson uses sin/cos
  ahead of it.
- M3 `01` box: \(W \in \mathbb{R}^{m\times n}\) with ℝ never said. Gloss: ℝ is "any number on the number line";
  \(\mathbb{R}^{m\times n}\) is a table of them, m rows by n columns.
- M4 `01` code: `b1[:, None]` unexplained; a comment.
- M5 `l1` §6: \(X^\top\) and `X.T` used, never taught. Teach it before the formula: picture (the table flipped so rows
  become columns), words (\(X^\top v\) dots every column of X with v), code (`X.T`). This is the lesson `course.json`
  credits with `math:transpose`, so c2, l2 and chapter 4 then stand on something real.
- M6 `l1` §3: "Part 4 fine-tunes ... LoRA": stage 6. And open §3 with why it matters (a duplicated column is a repeated
  equation), not only at its end.
- M7 `02` §1: \((x+h)^2 = x^2 + 2xh + h^2\) is a step the persona can't take; show the multiplication.
- M8 `c1`: \(\frac{d}{dx}\) used with only the prime taught (02); Δ never named. One clause each.
- M9 `c2`: \(|\nabla f|\) where 01 taught \(\lVert\cdot\rVert\) (make it ‖·‖); \(\nabla_w\) and "unit vector" unnamed;
  "outer product" said before it's shown. One clause each.
- M10 `p1`: "Math.random()" is JavaScript in a Python course (`rng.random()`); \(F^{-1}\) unnamed in its box.
- M11 `p2` §8: Σ, taught in s3 as "add these up", reused as the covariance matrix's name without a word; ρ unnamed.
- M12 `l2` §8 "Eigenvalues are curvature" teaches the Hessian and condition number before Calculus 3 (stage 2), and
  ends with a graded question on them: a preview used as an exercise, and the same content Calculus 3 §3 teaches in
  full (taught twice). Make §8 a short, labeled preview pointing to Calculus 3; move its one idea Calculus 3 lacks
  (the Hessian's eigenvectors are the valley's axes, its eigenvalues the curvatures along them, Linear algebra 2) and
  its question into Calculus 3 §3, where the Hessian is taught. `l2` §3: gloss "polynomial".
- Also touches: `lint.py` NOTATION (`math:trig`), `course.json` (`01` teaches `math:trig`), the notebooks only if a
  changed formula appears in them (checked by `build.py` and running both versions).
- Verified by: `npm run check`, `python3 ai/notebooks/lint.py --depth`, each changed page opened at 390 and 1280 px
  with no console errors, and a cold read of each changed passage.
- **Done 2026-10-22:** M1–M13 as planned. `01` defines cosine and sine with the shadow picture (and registers
  `math:trig`; `lint.py` now warns if any lesson uses sin/cos before it, tested by planting one in s3); `l1` teaches the
  transpose before the normal equations; `l2` §8 is a labeled preview box, its idea and question now in `c3` §3, and
  its duplicate "Condition number" card removed (c3 has one). `npm run check` and `lint.py --depth` stay 0/0 and 73/73;
  the nine changed pages render at 390 and 1280 px with no KaTeX or console errors. No notebook referenced the moved
  section.
- **Later math, reviewed 2026-10-22** (`c3`, `c4`, `p3`, `c5` in stage 2; `p4`, `p5`, `l3` in stage 3), same method,
  every number re-derived (Newton vs gradient descent, McNemar and unpaired z, the sample-size 16, 1 − 0.95²⁰, the
  LoRA share). All seven hold up; gaps fixed in place (3a): `s3` table gains \(|x|\), the absolute value (used by c1,
  c4, c5, p2, p3 with no word); `c3` reads out \(f''\), \(f^{(k)}\) and \(k!\), and its eigenvalues now point to
  Linear algebra 2, not chapter 1; `c4` reads \(x \sim p\) and "standard normal"; `p3` reads \(\mathcal N\) and credits
  "slope zero at the bottom" to chapter 2 (l1 used perpendicularity); `p4` names \(\delta\) and says chapter 8 *will*
  compare models; `l3` drops references to things chapter 1 and l1 never said (`rotation(30)`, "square-stretching
  matrix", "lstsq uses an SVD", l1's "condition number": defined in c3); `p5` says its \(\Vert\) isn't a length and
  that chapter 13 is next; `c5` names the L1 norm where first used, says its \(\mu\) isn't a mean, and points to stage
  4's "making nets train". `p3` also had a typographic minus inside a formula (a KaTeX warning) since before.
  All 73 lessons rendered headless: no KaTeX or console errors (four 404s are the live site's own APIs, absent from
  the static preview, and load on ihor.sh).
