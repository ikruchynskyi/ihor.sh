# Agent instructions for ihor.sh

## Courses: read the guardrail first
Before you plan, write or edit anything in a course (AI from scratch `ai/`, Radio from scratch `radio/course/`,
ham lessons `radio/ham/`, electronics `learn/electronics/`, Yomu `yomu/`), read and follow
[`.claude/skills/course-guardrail/SKILL.md`](.claude/skills/course-guardrail/SKILL.md). The short version:

- **No gaps:** use only what earlier lessons taught, and look each prerequisite up instead of recalling it.
- **See it before naming it:** a question and a picture or widget first, then words, then formulas, then code.
- **Fit it in, don't improvise:** search the course and read the hits before adding anything. Extend an existing
  lesson rather than repeat one; add a new lesson only when it can't fit in an existing one.
- **Truthful:** every number comes from code you ran or a linked source; never invent data or results.
- **Done:** the course's checks pass, a cold-learner read is clean, and the commit contains only your files.

## 2D Studio (`studio2d/`)
Local tool, not part of the site. Before you make or change characters or clips there, read
[`studio2d/AGENTS.md`](studio2d/AGENTS.md) (the `studio2d` skill).

## Everything else
See `README.md` for the layout, the deploy steps and the checks (`npm run check`). Keys live only in `.env`.
