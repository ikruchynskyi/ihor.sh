import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const exams = JSON.parse(fs.readFileSync(new URL("./exams.json", import.meta.url), "utf8"));
const course = JSON.parse(fs.readFileSync(new URL("./course.json", import.meta.url), "utf8"));

const REQUIRED_STAGES = [
  "stage-0",
  "stage-1",
  "stage-2",
  "stage-3",
  "stage-4",
  "zoo",
  "stage-5",
  "stage-6",
  "stage-7"
];

describe("ai/exams.json schema and validity", () => {
  it("contains all 9 required stages", () => {
    for (const stage of REQUIRED_STAGES) {
      assert.ok(exams[stage], `Missing stage: ${stage}`);
      assert.equal(Array.isArray(exams[stage]), true, `${stage} should be an array`);
      assert.equal(exams[stage].length, 8, `${stage} must have exactly 8 questions`);
    }
  });

  it("every question conforms to the required schema and references existing lessons", () => {
    let totalQuestions = 0;
    for (const [stageId, list] of Object.entries(exams)) {
      list.forEach((q, idx) => {
        totalQuestions++;
        const prefix = `[${stageId} Q${idx + 1}]`;

        assert.ok(q.q && typeof q.q === "string" && q.q.trim().length > 10, `${prefix} missing valid q string`);
        assert.ok(Array.isArray(q.options), `${prefix} options must be an array`);
        assert.ok(q.options.length >= 3 && q.options.length <= 4, `${prefix} options must have 3 or 4 items, got ${q.options.length}`);
        
        q.options.forEach((opt, optIdx) => {
          assert.ok(opt && typeof opt === "string" && opt.trim().length > 0, `${prefix} option ${optIdx} is empty`);
        });

        assert.equal(typeof q.answer, "number", `${prefix} answer must be a number`);
        assert.ok(q.answer >= 0 && q.answer < q.options.length, `${prefix} answer ${q.answer} out of bounds (options length: ${q.options.length})`);

        assert.ok(q.why && typeof q.why === "string" && q.why.trim().length > 10, `${prefix} why must be an explanatory string`);

        assert.ok(q.lesson && typeof q.lesson === "string", `${prefix} missing lesson`);
        assert.ok(course[q.lesson], `${prefix} lesson '${q.lesson}' does not exist in course.json`);
      });
    }
    assert.equal(totalQuestions, 72, "Total questions must be exactly 72 (9 stages * 8 questions)");
  });
});
