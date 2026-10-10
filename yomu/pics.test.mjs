import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pic, firstSense } from "./pics.js";
assert.equal(pic("apple"), "🍎");
assert.equal(pic("to meet, to see"), "");
assert.equal(pic("cat (animal)"), "🐱");
assert.equal(pic("apple tree"), "");
assert.equal(firstSense("the station; a stop"), "station");
for (const lvl of ["n5", "n4", "n3"]) {
  const v = JSON.parse(readFileSync(new URL(`./data/vocab-${lvl}.json`, import.meta.url)));
  const n = v.filter((w) => pic(w.m)).length;
  console.log(`${lvl}: ${n} of ${v.length} words have a picture`);
  if (lvl === "n5") assert.ok(n >= 180, "N5 should have plenty of pictures");
}
console.log("pics ok");
