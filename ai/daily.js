// Pure module for the AI path's daily quiz (gamification P2, plan lane B).
// Five questions a day, deterministic per date. No DOM, no storage: tested by ai/daily.test.mjs.
import { dayOf } from "./game.js";

/** 32-bit hash of a string to seed a PRNG. */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Small, high-quality, fast 32-bit PRNG (mulberry32). */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return the "YYYY-MM-DD" string for the day before `day`. */
export function yesterdayOf(day) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Shuffle array in-place using the provided rng. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** True if question string starts with "Why" (case-insensitive). */
export const isWhy = (q) => /^\s*why\b/i.test(q);

/**
 * Pick five questions for the daily quiz.
 * @param {object} courseData - Parsed course.json ({ [lesson]: { check: [...] } })
 * @param {object} state - Learner state ({ done: { [lesson]: { at } }, gaps: { ... }, daily: { ... } })
 * @param {string} [day] - Date string "YYYY-MM-DD" (defaults to dayOf())
 * @returns {object} { unlocked: boolean, day, questions: [...] }
 */
export function pickDailyQuiz(courseData, state = {}, day = dayOf()) {
  const finishedLessons = Object.keys(state.done || {}).filter(
    (l) => courseData[l]?.check?.length > 0
  );

  if (finishedLessons.length < 2) {
    return {
      unlocked: false,
      count: finishedLessons.length,
      needed: 2,
      day
    };
  }

  const seed = hashString(day);
  const rng = mulberry32(seed);

  // Exclude questions that appeared in yesterday's quiz if recorded
  const yest = yesterdayOf(day);
  const yesterdayIds = new Set(state.daily?.[yest]?.ids || []);

  const now = Date.parse(day + "T12:00:00Z");

  // 1. Check for open gaps from finished lessons
  const openGaps = Object.values(state.gaps || {}).filter(
    (g) => g && g.lesson && finishedLessons.includes(g.lesson)
  );

  // Group gaps by lesson to avoid two gap questions from the same lesson
  const gapLessons = [...new Set(openGaps.map((g) => g.lesson))];
  shuffle(gapLessons, rng);

  const pickedQuestions = [];
  const pickedIds = new Set();
  const usedLessons = new Set();

  // Pick up to 2 gap questions
  for (const l of gapLessons) {
    if (pickedQuestions.length >= 2) break;
    const lessonGaps = openGaps.filter((g) => g.lesson === l);
    const checks = courseData[l]?.check || [];
    if (!checks.length) continue;

    // Prefer questions whose sec matches a gap's section
    const gapSections = new Set(lessonGaps.map((g) => String(g.section)));
    let matchingIndices = checks
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => gapSections.has(String(c.sec)));

    if (!matchingIndices.length) {
      matchingIndices = checks.map((c, idx) => ({ c, idx }));
    }

    // Try to avoid yesterday's questions
    const notYesterday = matchingIndices.filter(
      ({ idx }) => !yesterdayIds.has(`${l}#${idx}`)
    );
    const candidates = notYesterday.length ? notYesterday : matchingIndices;
    if (candidates.length) {
      shuffle(candidates, rng);
      const chosen = candidates[0];
      const qId = `${l}#${chosen.idx}`;
      pickedQuestions.push({
        lesson: l,
        checkIndex: chosen.idx,
        orig: chosen.c,
        isGap: true
      });
      pickedIds.add(qId);
      usedLessons.add(l);
    }
  }

  // 2. Select remaining questions to reach 5
  // Weighted toward lessons finished longest ago: weight = 1 + daysSince / 7
  // Never two from the same lesson (when finishedLessons.length >= 5)
  function getLessonWeight(l) {
    const finishedAt = state.done[l]?.at || (now - 864e5);
    const daysSince = Math.max(0, (now - finishedAt) / 864e5);
    return 1 + daysSince / 7;
  }

  let eligibleLessons = finishedLessons.filter((l) => !usedLessons.has(l));
  if (eligibleLessons.length < (5 - pickedQuestions.length)) {
    eligibleLessons = [...finishedLessons];
  }

  function sampleLesson(pool) {
    const totalWeight = pool.reduce((sum, l) => sum + getLessonWeight(l), 0);
    let r = rng() * totalWeight;
    for (const l of pool) {
      r -= getLessonWeight(l);
      if (r <= 0) return l;
    }
    return pool[pool.length - 1];
  }

  let attempts = 0;
  while (pickedQuestions.length < 5 && attempts < 100) {
    attempts++;
    let pool = finishedLessons.length >= 5
      ? eligibleLessons.filter((l) => !usedLessons.has(l))
      : eligibleLessons;

    if (!pool.length) {
      pool = [...finishedLessons];
    }

    const chosenLesson = sampleLesson(pool);
    const checks = courseData[chosenLesson]?.check || [];
    if (!checks.length) continue;

    let candidateQuestions = checks
      .map((c, idx) => ({ c, idx }))
      .filter(({ idx }) => !pickedIds.has(`${chosenLesson}#${idx}`));

    if (!candidateQuestions.length) continue;

    const freshQuestions = candidateQuestions.filter(
      ({ idx }) => !yesterdayIds.has(`${chosenLesson}#${idx}`)
    );
    const pickPool = freshQuestions.length ? freshQuestions : candidateQuestions;

    shuffle(pickPool, rng);
    const selected = pickPool[0];
    const qId = `${chosenLesson}#${selected.idx}`;

    pickedQuestions.push({
      lesson: chosenLesson,
      checkIndex: selected.idx,
      orig: selected.c,
      isGap: false
    });
    pickedIds.add(qId);
    usedLessons.add(chosenLesson);
  }

  // 3. Ensure at least one question starting with "Why"
  const hasWhy = pickedQuestions.some((item) => isWhy(item.orig.q));
  if (!hasWhy && pickedQuestions.length > 0) {
    let whyFound = null;
    const lessonsToCheck = [
      ...finishedLessons.filter((l) => !usedLessons.has(l)),
      ...finishedLessons
    ];

    for (const l of lessonsToCheck) {
      const checks = courseData[l]?.check || [];
      const whyIndices = checks
        .map((c, idx) => ({ c, idx }))
        .filter(({ c, idx }) => isWhy(c.q) && !pickedIds.has(`${l}#${idx}`));
      if (whyIndices.length) {
        shuffle(whyIndices, rng);
        whyFound = { lesson: l, checkIndex: whyIndices[0].idx, orig: whyIndices[0].c, isGap: false };
        break;
      }
    }

    if (whyFound) {
      const replaceIdx = pickedQuestions.reduceRight(
        (found, item, idx) => (found === -1 && !item.isGap ? idx : found),
        -1
      );
      const targetIdx = replaceIdx >= 0 ? replaceIdx : pickedQuestions.length - 1;
      pickedIds.delete(`${pickedQuestions[targetIdx].lesson}#${pickedQuestions[targetIdx].checkIndex}`);
      pickedQuestions[targetIdx] = whyFound;
      pickedIds.add(`${whyFound.lesson}#${whyFound.checkIndex}`);
    }
  }

  // 4. Shuffle options for each question and remap answer
  const finalQuestions = pickedQuestions.map((item) => {
    const { lesson, checkIndex, orig, isGap } = item;
    const origAnswerText = orig.options[orig.answer];
    const optionIndices = orig.options.map((_, i) => i);
    shuffle(optionIndices, rng);

    const shuffledOptions = optionIndices.map((i) => orig.options[i]);
    const newAnswer = shuffledOptions.indexOf(origAnswerText);

    return {
      id: `${lesson}#${checkIndex}`,
      lesson,
      checkIndex,
      sec: orig.sec,
      q: orig.q,
      options: shuffledOptions,
      answer: newAnswer,
      why: orig.why,
      originalAnswerText: origAnswerText,
      isGap: Boolean(isGap),
      isWhy: isWhy(orig.q)
    };
  });

  return {
    unlocked: true,
    day,
    questions: finalQuestions
  };
}
