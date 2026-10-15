// Tests for ai/practice.js (math practice problem generators)
// Run with: node ai/practice.test.mjs

import assert from "node:assert/strict";
import { skills, generate, mulberry32, checkAnswer } from "./practice.js";

const skillIds = Object.keys(skills);
console.log(`Testing ${skillIds.length} skills across 200 seeds each...`);
assert.equal(skillIds.length, 20, "Must have exactly 20 skills");

const SEEDS_PER_SKILL = 200;

for (const id of skillIds) {
  const meta = skills[id];
  assert.ok(meta.title, `${id}: missing title`);
  assert.ok(meta.lesson, `${id}: missing lesson`);

  for (let s = 1; s <= SEEDS_PER_SKILL; s++) {
    const seed = s * 7919 + 17;
    const p1 = generate(id, mulberry32(seed));
    const p2 = generate(id, mulberry32(seed));

    // 1. Determinism
    assert.deepEqual(p1, p2, `${id}: non-deterministic output for seed ${seed}`);

    // 2. Schema
    assert.equal(p1.id, id, `${id}: wrong id`);
    assert.ok(p1.lesson.endsWith(".html"), `${id}: lesson must end with .html`);
    assert.ok(typeof p1.prompt === "string" && p1.prompt.length > 10, `${id}: prompt too short`);
    assert.ok(typeof p1.answer === "number" && !Number.isNaN(p1.answer), `${id}: answer not a number`);
    assert.ok(Array.isArray(p1.steps) && p1.steps.length >= 2, `${id}: steps must have >= 2 lines`);

    // 3. Last step references the answer
    const lastStep = p1.steps[p1.steps.length - 1];
    const ansStr = String(p1.answer);
    assert.ok(
      lastStep.includes(ansStr) || lastStep.includes(p1.answer.toFixed(1)) || lastStep.includes(p1.answer.toFixed(2)),
      `${id}: last step [${lastStep}] does not mention answer ${p1.answer}`
    );

    // 4. checkAnswer helper works
    assert.ok(checkAnswer(p1.answer, p1.answer, p1.tol), `${id}: checkAnswer failed on exact answer`);
    assert.ok(checkAnswer(p1.answer, String(p1.answer), p1.tol), `${id}: checkAnswer failed on string answer`);
    assert.ok(!checkAnswer(p1.answer, p1.answer + 5, p1.tol), `${id}: checkAnswer accepted answer + 5`);

    // 5. Independent mathematical validation per skill
    switch (id) {
      case "mean": {
        const nums = p1.prompt.match(/four numbers: \\\((\d+),\s*(\d+),\s*(\d+),\s*(-?\d+)\\\)/);
        assert.ok(nums, `mean: parse failed [${p1.prompt}]`);
        const sum = (+nums[1]) + (+nums[2]) + (+nums[3]) + (+nums[4]);
        assert.equal(p1.answer, sum / 4);
        break;
      }
      case "mse": {
        const m = p1.prompt.match(/y = \[(-?\d+),\s*(-?\d+),\s*(-?\d+)\]\\\) and model predictions \\\(\\hat\{y\} = \[(-?\d+),\s*(-?\d+),\s*(-?\d+)\]/);
        assert.ok(m, `mse: parse failed [${p1.prompt}]`);
        const y = [+m[1], +m[2], +m[3]];
        const yhat = [+m[4], +m[5], +m[6]];
        const expected = ((y[0]-yhat[0])**2 + (y[1]-yhat[1])**2 + (y[2]-yhat[2])**2) / 3;
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "dot-product": {
        const m = p1.prompt.match(/u\} = \[(-?\d+),\s*(-?\d+),\s*(-?\d+)\].*v\} = \[(-?\d+),\s*(-?\d+),\s*(-?\d+)\]/);
        assert.ok(m, `dot-product parse failed: [${p1.prompt}]`);
        const u = [+m[1], +m[2], +m[3]];
        const v = [+m[4], +m[5], +m[6]];
        const expected = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
        assert.equal(p1.answer, expected);
        break;
      }
      case "matrix-vector": {
        const m = p1.prompt.match(/pmatrix\} (-?\d+) & (-?\d+) \\\\ (-?\d+) & (-?\d+) \\end\{pmatrix\}.*pmatrix\} (-?\d+) \\\\ (-?\d+)/);
        assert.ok(m, `matrix-vector parse failed: [${p1.prompt}]`);
        const a = +m[1], b = +m[2], x = +m[5], y = +m[6];
        assert.equal(p1.answer, a * x + b * y);
        break;
      }
      case "determinant-2x2": {
        const m = p1.prompt.match(/pmatrix\} (-?\d+) & (-?\d+) \\\\ (-?\d+) & (-?\d+)/);
        assert.ok(m, `determinant parse failed: [${p1.prompt}]`);
        const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
        assert.equal(p1.answer, a * d - b * c);
        break;
      }
      case "inverse-2x2-det": {
        const m = p1.prompt.match(/A = \\begin\{pmatrix\} (-?\d+) & (-?\d+) \\\\ (-?\d+) & (-?\d+)/);
        assert.ok(m, `inverse parse failed: [${p1.prompt}]`);
        const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
        const det = a * d - b * c;
        assert.ok(Math.abs(p1.answer - d / det) < 1e-4);
        break;
      }
      case "poly-derivative": {
        const m = p1.prompt.match(/f\(x\) = (\d+)x\^2 ([+-]\s*\d+)x ([+-]\s*\d+).*f'\((-?\d+)\)/);
        assert.ok(m, `poly-derivative parse failed: [${p1.prompt}]`);
        const a = +m[1];
        const b = +(m[2].replace(/\s+/g, ""));
        const x0 = +m[4];
        assert.equal(p1.answer, 2 * a * x0 + b);
        break;
      }
      case "chain-rule": {
        const m = p1.prompt.match(/u = (\d+)x ([+-]\s*\d+).*at \\\(x = (\d+)\\\)/);
        assert.ok(m, `chain-rule parse failed: [${p1.prompt}]`);
        const a = +m[1];
        const b = +(m[2].replace(/\s+/g, ""));
        const x0 = +m[3];
        const u = a * x0 + b;
        assert.equal(p1.answer, 2 * u * a);
        break;
      }
      case "partial-derivative": {
        const m = p1.prompt.match(/f\(x, y\) = (\d+)x\^2 ([+-]\s*\d+)xy \+ (\d+)y\^2.*\(x, y\) = \((-?\d+),\s*(-?\d+)\)/);
        assert.ok(m, `partial-derivative parse failed: [${p1.prompt}]`);
        const a = +m[1];
        const b = +(m[2].replace(/\s+/g, ""));
        const x0 = +m[4], y0 = +m[5];
        assert.equal(p1.answer, 2 * a * x0 + b * y0);
        break;
      }
      case "gradient-step": {
        const m = p1.prompt.match(/w = (\d+).*\\eta = (0\.\d+).*\\nabla L = (-?\d+)/);
        assert.ok(m, `gradient-step parse failed: [${p1.prompt}]`);
        const w0 = +m[1], eta = +m[2], grad = +m[3];
        const expected = +(w0 - eta * grad).toFixed(2);
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "log-rules": {
        const m = p1.prompt.match(/\\log_2\((\d+)\) \+ \\log_2\((\d+)\)/);
        assert.ok(m, `log-rules parse failed: [${p1.prompt}]`);
        const a = +m[1], b = +m[2];
        const expected = Math.round(Math.log2(a) + Math.log2(b));
        assert.equal(p1.answer, expected);
        break;
      }
      case "softmax-3": {
        assert.ok([0.25, 0.20, 0.10].includes(p1.answer), `softmax-3 unexpected answer: ${p1.answer}`);
        break;
      }
      case "bayes-table": {
        const m = p1.prompt.match(/screening: (\d+) people.*test positive.*and (\d+) healthy people/);
        assert.ok(m, `bayes parse failed: [${p1.prompt}]`);
        const tp = +m[1], fp = +m[2];
        const expected = (tp / (tp + fp)) * 100;
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "expectation": {
        const m = p1.prompt.match(/takes values .*?\[(\d+),\s*(\d+),\s*(\d+)\]/);
        assert.ok(m, `expectation parse failed: [${p1.prompt}]`);
        const x = [+m[1], +m[2], +m[3]];
        const expected = +(x[0] * 0.2 + x[1] * 0.5 + x[2] * 0.3).toFixed(2);
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "variance": {
        const m = p1.prompt.match(/X = \[(-?\d+),\s*(-?\d+),\s*(-?\d+)\]/);
        assert.ok(m, `variance parse failed: [${p1.prompt}]`);
        const x = [+m[1], +m[2], +m[3]];
        const mean = (x[0] + x[1] + x[2]) / 3;
        const expected = ((x[0]-mean)**2 + (x[1]-mean)**2 + (x[2]-mean)**2) / 3;
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "conditional-prob": {
        const m = p1.prompt.match(/P\(A \\cap B\) = (0\.\d+).*P\(B\) = (0\.\d+)/);
        assert.ok(m, `conditional-prob parse failed: [${p1.prompt}]`);
        const pAB = +m[1], pB = +m[2];
        const expected = pAB / pB;
        assert.ok(Math.abs(p1.answer - expected) < 1e-3);
        break;
      }
      case "coin-entropy": {
        const m = p1.prompt.match(/variable has (\d+) equally likely outcomes/);
        assert.ok(m, `entropy parse failed: [${p1.prompt}]`);
        const k = +m[1];
        assert.equal(p1.answer, Math.log2(k));
        break;
      }
      case "eigenvalues-2x2": {
        const m = p1.prompt.match(/pmatrix\} (\d+) & (\d+) \\\\ (\d+) & (\d+)/);
        assert.ok(m, `eigenvalues parse failed: [${p1.prompt}]`);
        const a = +m[1], b = +m[2];
        assert.equal(p1.answer, a + b);
        break;
      }
      case "vector-norm": {
        const m = p1.prompt.match(/\\mathbf\{v\} = \[(-?\d+),\s*(-?\d+)\]/);
        assert.ok(m, `vector-norm parse failed: [${p1.prompt}]`);
        const s1 = +m[1], s2 = +m[2];
        const expected = Math.hypot(s1, s2);
        assert.ok(Math.abs(p1.answer - expected) < 1e-4);
        break;
      }
      case "cosine-similarity": {
        const m = p1.prompt.match(/u\} = \[(-?\d+),\s*(-?\d+)\].*?v\} = \[(-?\d+),\s*(-?\d+)\]/);
        assert.ok(m, `cosine-similarity parse failed: [${p1.prompt}]`);
        const u = [+m[1], +m[2]], v = [+m[3], +m[4]];
        const dot = u[0] * v[0] + u[1] * v[1];
        const expected = +(dot / (Math.hypot(...u) * Math.hypot(...v))).toFixed(2);
        assert.ok(Math.abs(p1.answer - expected) < 1e-2);
        break;
      }
    }
  }
}

console.log(`All 20 skills passed 200 random seeds (4,000 problems verified)!`);
