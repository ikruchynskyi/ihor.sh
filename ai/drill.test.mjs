import assert from "node:assert/strict";
import fs from "node:fs";
import { slug, extractSections, buildDrill, renderCheckpointQ } from "./drill.js";

// 1. Slug generator
assert.equal(slug("1. Rules you write vs rules you learn"), "rules-you-write-vs-rules-you-learn");
assert.equal(slug("3. Logarithms: counting…"), "logarithms-counting");
assert.equal(slug("Why \\(a\\) and \\(b\\)?"), "why-a-and-b");

// 2. Mock lesson HTML testing section boundaries and gist
const mockHtml = `
<!doctype html>
<html>
<body>
<main>
  <h1>Test Lesson</h1>
  <h2>1. First section</h2>
  <p class="gist">The first idea in one sentence.</p>
  <div class="q" data-answer="a">
    <p>Question in section 1</p>
    <ul><li data-k="a">Choice A</li><li data-k="b">Choice B</li></ul>
    <div class="why">Because A is right.</div>
  </div>

  <h2>2. Second section</h2>
  <p>No gist here.</p>
  <div class="q" data-answer="b">
    <p>Question in section 2</p>
    <ul><li data-k="a">Choice A</li><li data-k="b">Choice B</li></ul>
    <div class="why">Because B is right.</div>
  </div>

  <h2>3. Third section</h2>
  <p class="gist">The third idea.</p>
</main>
</body>
</html>
`;

const sections = extractSections(mockHtml);
assert.equal(sections.length, 3);
assert.equal(sections[0].id, "first-section");
assert.equal(sections[0].gist, "The first idea in one sentence.");
assert.equal(sections[0].qBlocks.length, 1);
assert.equal(sections[1].id, "second-section");
assert.equal(sections[1].gist, null);
assert.equal(sections[1].qBlocks.length, 1);
assert.equal(sections[2].id, "third-section");
assert.equal(sections[2].gist, "The third idea.");
assert.equal(sections[2].qBlocks.length, 0);

// 3. Drill extraction with checkpoint questions and neighbor fallback
const mockCheck = [
  { q: "Check 1 for sec 1", options: ["A", "B"], answer: 0, why: "Sec 1 check", sec: 1 },
  { q: "Check 2 for sec 2", options: ["A", "B"], answer: 1, why: "Sec 2 check", sec: 2 },
  { q: "Check 3 for sec 3", options: ["A", "B"], answer: 0, why: "Sec 3 check", sec: 3 },
  { q: "Check 4 for sec 3", options: ["A", "B"], answer: 1, why: "Sec 3 check", sec: 3 }
];

// Drill for section 1:
// Has 1 inline question + 1 check question (sec: 1) = 2.
// Needs at least 3, so falls back to neighbor sec 2 ("Check 2 for sec 2") -> 3 questions total!
const drill1 = buildDrill(mockHtml, "first-section", mockCheck);
assert.equal(drill1.found, true);
assert.equal(drill1.sectionIndex, 1);
assert.equal(drill1.gist, "The first idea in one sentence.");
assert.equal(drill1.questions.length, 3);
assert.equal(drill1.questions[0].kind, "inline");
assert.equal(drill1.questions[1].kind, "checkpoint");
assert.equal(drill1.questions[2].kind, "neighbor-checkpoint");

// Drill for section 3 (has 0 inline questions + 2 check questions = 2, falls back to neighbor sec 2) -> 3 questions!
const drill3 = buildDrill(mockHtml, "third-section", mockCheck);
assert.equal(drill3.questions.length, 3);

// 4. Test with real lesson HTML from course
const realHtml = fs.readFileSync(new URL("./s1-what-is-ml.html", import.meta.url), "utf8");
const courseData = JSON.parse(fs.readFileSync(new URL("./course.json", import.meta.url), "utf8"));
const realCheck = courseData["s1-what-is-ml.html"]?.check || [];

const realDrill = buildDrill(realHtml, "rules-you-write-vs-rules-you-learn", realCheck);
assert.equal(realDrill.found, true);
assert.ok(realDrill.questions.length >= 3, "Real drill must collect at least 3 questions");
assert.ok(realDrill.gist, "Must extract gist from section 1");

console.log("ai/drill.test.mjs: all passed");
