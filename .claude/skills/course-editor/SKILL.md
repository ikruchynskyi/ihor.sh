---
name: course-editor
description: Watch the simulated student (Gemini, course-student skill) work through AI from scratch, answer its questions as the instructor, and fix the course live where it struggles (ai/PLAN.md §10). Use when asked to monitor the student, run the review as editor, or handle the review log.
---

# You are the editor and instructor

A student agent is working through the course in ai/review/run/ as a learner with only school arithmetic (its rules:
`.agents/skills/course-student/SKILL.md`). Everything it does lands in `ai/review/run/log.jsonl`. Your job: unblock
it quickly, tell real gaps from its own mistakes, fix the real ones in the course (by the guardrail), and leave the
owner a short packet per stage. **Tokens are limited.** Never read the whole log; let `watch` wake you only for what
needs you.

## Start

First read the progress table in `ai/PLAN.md` §10.7: it says which lessons are verified and what's still open.

```sh
alias L="python3 ai/review/learner.py"
L path            # a run exists? if not: L init, then tell the owner to start the student
L report          # where things stand
```

Then loop:

1. Run `python3 ai/review/learner.py watch --timeout 3000` **in the background**. It blocks until the student logs
   something that needs you, then prints those events (one JSON line each) and exits; you're notified.
2. Handle each event (below), then start `watch` again. An idle `-- nothing new` after the timeout is fine: start it again.

## Priority: content and structure

The review exists to find out whether the course's **content and structure** carry a beginner: gaps in the ledger,
steps too big, unclear explanations, missing examples, lessons in the wrong order, questions that don't test the
idea. Spend your effort there. Infrastructure (slow downloads, timeouts, the test machine, tooling) gets the
smallest fix that unblocks the student, usually a one-line note to learners in the course, and no engineering
unless the owner asks.

## Events

- **`ask`** (the student waits 5 minutes: answer first, fix later). Read only the section it's in. Answer **as the
  course's instructor**: in plain words, using only what the path has taught up to that lesson. Begin with where the
  course covers it ("Covered in §2: …") or say plainly that it doesn't ("Not covered yet: …"). A "not covered" answer
  is a gap: fix it (below), then send a second note. `L reply ask-N "…"`.
- **`struggle`** / **`quit`** / **`guess`**: decide whether it's a real gap or the student's misreading:
  - **Real:** the lesson uses something not taught earlier, skips a step, words it unclearly, or the example is
    missing. Fix it.
  - **Misreading:** the course clearly covers it where the student should have seen it. Reply with the place;
    don't change the course. But if two struggles hit the same spot, treat it as real.
  - `quit: true` and `quit` events come first: they're where real learners leave.
- **`wrong_twice`**: check that the question is unambiguous and its answer right. If so, ignore it (getting things
  wrong is learning). If not, fix the question.
- **`error`**: a code box, notebook or page failed. Reproduce it (`L run`, the page at
  `http://localhost:8080/ai/LESSON.html`, `L nbcheck`). If it's real, it's a bug: fix it. If the student wrote broken
  code, reply with a pointer, not the answer.
- **`done`**: record the lesson in the progress table in `ai/PLAN.md` §10.7 (date, result, fix commits, open items),
  commit it with your next fix or on its own, and push. That table is how the next session picks up. Every few
  lessons, run `L audit`: quotes that aren't in what the student was shown mean
  it used outside knowledge. Reply with
  `L reply note "Q3 of LESSON: your quote isn't from the course; answer again using only what it showed you"`.

## Fixing the course

Follow `.claude/skills/course-guardrail/SKILL.md` exactly. In short:
- **Fit plan first**: what's covered where, the precise gap, the earliest lesson where it belongs (fix the ledger,
  not the symptom).
- **The smallest change that closes the gap.** Never fix by giving away a quiz answer, and never add knowledge the
  path hasn't earned.
- `npm run check` stays at 0/0; `python3 ai/notebooks/lint.py --depth`; a notebook you touched passes both ways.
- **One fix per commit**, pushed. The message names the struggle ("student, s3 §2: ∇ used before it was taught")
  and what you verified.
- Then tell the student: `L reply note "fixed: re-read §N of LESSON"`. Its next log says whether it worked; if
  not, the fix wasn't enough.
- Bigger than a section (restructuring a lesson, moving content between lessons, dropping a topic): don't do it
  live. Write it into the stage packet as a proposal for the owner, and tell the student to carry on.

Never edit the student's files (`ai/review/run/`), and never give it answers to exercises: hints and pointers only.

## Stage packets (for the owner's proofreading)

When the student finishes a stage (`done` on the stage's last lesson in `L path`), write
`ai/review/packets/stage-N.md` and commit it:
- the `L report` rows for the stage,
- each struggle as one line: what, real or misread, and the fix commit (or why not),
- before/after excerpts of every passage you changed, so the owner can proofread them in place,
- proposals that need the owner's decision,
- the `L audit` result.

## Calibration (the first stage-0 run only)

To check that the student really flags gaps, plant three in a scratch copy of the course:
`cp -r ai /tmp/calib-ai`. Then, in `/tmp/calib-ai`:
- use a symbol one lesson early,
- delete a worked example,
- make one question need an untaught step.

Tell the student to restart with `COURSE_ROOT=/tmp/calib-ai` (text only: `B` shows the real site). It must log all
three. If it misses one, tighten its skill's rules before the real run.

## Finish

After the last lesson: final `L report` and `L audit` into `ai/review/packets/summary.md`. Archive the run
(`mv ai/review/run ai/review/run-$(date +%F)`). Recommend a fresh full rerun if many fixes landed (ai/PLAN.md §10.5).
