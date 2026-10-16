// Run: node yomu/quiz.test.mjs
import assert from "node:assert/strict";
import {
  createRng,
  rngShuffle,
  generateDailyQuiz,
  generateGapsQuiz,
  buildQuestionFromGap,
  formatQuizShareText
} from "./quiz.js";

// 1. PRNG determinism
const rngA = createRng("2026-10-14:N5");
const rngB = createRng("2026-10-14:N5");
const valA = [rngA(), rngA(), rngA()];
const valB = [rngB(), rngB(), rngB()];
assert.deepEqual(valA, valB, "Identical seed produces identical sequence");

const rngDiff = createRng("2026-10-15:N5");
assert.notEqual(rngA(), rngDiff(), "Different date produces different sequence");

// 2. Daily quiz generation across levels
for (const lvl of ["N5", "N4", "N3", "N2", "N1"]) {
  const qs = await generateDailyQuiz("2026-10-14", lvl);
  assert.equal(qs.length, 5, `${lvl} daily quiz must have 5 questions`);
  for (const q of qs) {
    assert.ok(q.id, `${lvl}: question needs id`);
    assert.ok(q.prompt, `${lvl}: question needs prompt`);
    assert.ok(q.choices.length >= 3, `${lvl}: question needs >= 3 choices`);
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.choices.length, `${lvl}: correctIndex in range`);
    assert.equal(q.choices[q.correctIndex], q.correctAnswerText, `${lvl}: correctIndex matches correctAnswerText`);
    assert.ok(q.why, `${lvl}: question needs explanation why`);
    assert.ok(q.link, `${lvl}: question needs link`);
  }
}
console.log("daily quiz generation across all levels ok");

// 3. Gap question generation
const mockGap = {
  id: "g:da-desu",
  title: "N だ / です",
  category: "Grammar",
  level: "N5",
  link: "/yomu/grammar.html?level=N5#da-desu",
  why: "だ and です express state of being",
  sampleQ: "私は学生です。"
};

const gapQuiz = await generateGapsQuiz([mockGap], "N5");
assert.equal(gapQuiz.length, 5, "gap quiz has 5 questions");
const gapQ = gapQuiz.find((q) => q.id === "g:da-desu");
assert.ok(gapQ, "gap quiz includes targeted question for the active gap");
assert.equal(gapQ.isGapRecap, true);
console.log("gap quiz generation ok");

// 4. Share text formatting
const share = formatQuizShareText("2026-10-14", "N5", 5, 5, 3);
assert.match(share, /2026-10-14/);
assert.match(share, /🟩🟩🟩🟩🟩/);
assert.match(share, /満点/);
assert.match(share, /3 day streak/);
console.log("share text formatting ok");

console.log("all quiz.test.mjs tests passed!");
