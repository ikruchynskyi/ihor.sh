import assert from "node:assert/strict";
import fs from "node:fs";
import { pickDailyQuiz, isWhy, yesterdayOf } from "./daily.js";

const courseData = JSON.parse(fs.readFileSync(new URL("./course.json", import.meta.url), "utf8"));
const allLessons = Object.keys(courseData).filter((l) => courseData[l]?.check?.length > 0);

// 1. Locked with fewer than 2 finished lessons
{
  const emptyState = { done: {} };
  const res0 = pickDailyQuiz(courseData, emptyState, "2026-10-15");
  assert.equal(res0.unlocked, false);
  assert.equal(res0.count, 0);

  const oneLessonState = { done: { [allLessons[0]]: { at: Date.now() } } };
  const res1 = pickDailyQuiz(courseData, oneLessonState, "2026-10-15");
  assert.equal(res1.unlocked, false);
  assert.equal(res1.count, 1);
}

// 2. Unlocked with 2 finished lessons
{
  const twoLessonsState = {
    done: {
      [allLessons[0]]: { at: Date.now() - 864e5 },
      [allLessons[1]]: { at: Date.now() }
    }
  };
  const res2 = pickDailyQuiz(courseData, twoLessonsState, "2026-10-15");
  assert.equal(res2.unlocked, true);
  assert.equal(res2.questions.length, 5);
}

// 3. Same date and state give the exact same quiz (determinism)
{
  const state = {
    done: {
      [allLessons[0]]: { at: 1000 },
      [allLessons[1]]: { at: 2000 },
      [allLessons[2]]: { at: 3000 },
      [allLessons[3]]: { at: 4000 },
      [allLessons[4]]: { at: 5000 },
      [allLessons[5]]: { at: 6000 }
    }
  };
  const q1 = pickDailyQuiz(courseData, state, "2026-10-15");
  const q2 = pickDailyQuiz(courseData, state, "2026-10-15");
  assert.deepEqual(q1, q2);
}

// 4. Different dates give different quizzes
{
  const state = {
    done: Object.fromEntries(allLessons.slice(0, 10).map((l, i) => [l, { at: Date.now() - i * 864e5 }]))
  };
  const qDayA = pickDailyQuiz(courseData, state, "2026-10-15");
  const qDayB = pickDailyQuiz(courseData, state, "2026-10-16");
  const idsA = qDayA.questions.map((q) => q.id).join(",");
  const idsB = qDayB.questions.map((q) => q.id).join(",");
  assert.notEqual(idsA, idsB, "different dates should produce different question sets or order");
}

// 5. Gap questions come first (up to 2)
{
  const state = {
    done: Object.fromEntries(allLessons.slice(0, 10).map((l, i) => [l, { at: Date.now() - i * 864e5 }])),
    gaps: {
      [`${allLessons[0]}#1`]: { lesson: allLessons[0], section: 1, label: "Gap 1" },
      [`${allLessons[1]}#2`]: { lesson: allLessons[1], section: 2, label: "Gap 2" },
      [`${allLessons[2]}#1`]: { lesson: allLessons[2], section: 1, label: "Gap 3" }
    }
  };
  const res = pickDailyQuiz(courseData, state, "2026-10-15");
  assert.equal(res.questions.length, 5);
  // At most 2 gap questions, and they must be at the start
  const gapFlags = res.questions.map((q) => q.isGap);
  assert.equal(gapFlags[0], true, "first question should be a gap question");
  assert.equal(gapFlags[1], true, "second question should be a gap question");
  assert.equal(gapFlags[2], false, "third question should not be a gap question (capped at 2)");
}

// 6. A Why question is always included
{
  for (let d = 1; d <= 28; d++) {
    const dayStr = `2026-10-${String(d).padStart(2, "0")}`;
    const state = {
      done: Object.fromEntries(allLessons.slice(0, 8).map((l, i) => [l, { at: Date.now() - i * 864e5 * 2 }]))
    };
    const res = pickDailyQuiz(courseData, state, dayStr);
    assert.equal(res.questions.length, 5);
    const hasWhy = res.questions.some((q) => isWhy(q.q));
    assert.equal(hasWhy, true, `Day ${dayStr} must include at least one Why question`);
  }
}

// 7. No lesson repeats when >= 5 finished lessons are available
{
  for (let d = 1; d <= 14; d++) {
    const dayStr = `2026-10-${String(d).padStart(2, "0")}`;
    const state = {
      done: Object.fromEntries(allLessons.slice(0, 12).map((l, i) => [l, { at: Date.now() - i * 864e5 }]))
    };
    const res = pickDailyQuiz(courseData, state, dayStr);
    assert.equal(res.questions.length, 5);
    const lessonSet = new Set(res.questions.map((q) => q.lesson));
    assert.equal(lessonSet.size, 5, `Day ${dayStr} must have 5 distinct lessons when >= 5 finished`);
  }
}

// 8. Option shuffling preserves the correct answer
{
  const state = {
    done: Object.fromEntries(allLessons.slice(0, 10).map((l, i) => [l, { at: Date.now() - i * 864e5 }]))
  };
  const res = pickDailyQuiz(courseData, state, "2026-10-15");
  for (const q of res.questions) {
    const origCheck = courseData[q.lesson].check[q.checkIndex];
    const origAnswerText = origCheck.options[origCheck.answer];
    assert.equal(q.options[q.answer], origAnswerText, `Question ${q.id} answer text must match original after shuffling`);
  }
}

// 9. Avoids repeating yesterday's questions
{
  const yesterday = "2026-10-14";
  const today = "2026-10-15";
  assert.equal(yesterdayOf(today), yesterday);

  const state = {
    done: Object.fromEntries(allLessons.slice(0, 10).map((l, i) => [l, { at: Date.now() - i * 864e5 }])),
    daily: {
      [yesterday]: {
        score: 5,
        ids: [`${allLessons[0]}#0`, `${allLessons[1]}#0`, `${allLessons[2]}#0`, `${allLessons[3]}#0`, `${allLessons[4]}#0`]
      }
    }
  };

  const res = pickDailyQuiz(courseData, state, today);
  const pickedIds = new Set(res.questions.map((q) => q.id));
  for (const yId of state.daily[yesterday].ids) {
    assert.equal(pickedIds.has(yId), false, `Question ${yId} from yesterday should not repeat today`);
  }
}

console.log("ai/daily.test.mjs: all passed");
