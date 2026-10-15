import assert from "node:assert/strict";
import { nextStreak, liveStreak, checkpointXP, weekDays, exportCode, importCode, MAX_FREEZES } from "./game.js";

// streaks: consecutive days grow it, the same day doesn't, a gap resets it
let s = nextStreak(undefined, "2026-10-01");
assert.deepEqual(s, { last: "2026-10-01", days: 1, best: 1, freezes: 0 });
assert.equal(nextStreak(s, "2026-10-01"), s);
s = nextStreak(s, "2026-10-02"); assert.equal(s.days, 2);
assert.equal(nextStreak(s, "2026-10-05").days, 1);                  // two missed days, no freeze: start over
assert.equal(nextStreak(s, "2026-10-04").days, 1);                  // one missed day, no freeze: start over

// a freeze is earned on day 7 and spent on one missed day
for (let d = 3; d <= 7; d++) s = nextStreak(s, `2026-10-0${d}`);
assert.equal(s.days, 7); assert.equal(s.freezes, 1);
s = nextStreak(s, "2026-10-09");                                   // missed the 8th
assert.equal(s.days, 8); assert.equal(s.freezes, 0); assert.equal(s.best, 8);
assert.equal(nextStreak(s, "2026-10-11").days, 1);                  // missed the 10th, no freeze left

// freezes are capped
let t = { last: "2026-01-13", days: 13, best: 13, freezes: MAX_FREEZES };
assert.equal(nextStreak(t, "2026-01-14").freezes, MAX_FREEZES);

// month and year boundaries count as consecutive days
assert.equal(nextStreak({ last: "2026-12-31", days: 3, best: 3, freezes: 0 }, "2027-01-01").days, 4);
assert.equal(nextStreak({ last: "2026-02-28", days: 3, best: 3, freezes: 0 }, "2026-03-01").days, 4);

// the streak shown before studying today
assert.equal(liveStreak({ last: "2026-10-09", days: 8, freezes: 0 }, "2026-10-10"), 8);
assert.equal(liveStreak({ last: "2026-10-08", days: 8, freezes: 1 }, "2026-10-10"), 8);
assert.equal(liveStreak({ last: "2026-10-08", days: 8, freezes: 0 }, "2026-10-10"), 0);
assert.equal(liveStreak(undefined, "2026-10-10"), 0);

assert.equal(checkpointXP(4), 50); assert.equal(checkpointXP(5), 60);

// a week runs Monday to Sunday (2026-10-12 is a Monday)
const log = { "2026-10-11": { xp: 5 }, "2026-10-12": { xp: 5 }, "2026-10-14": { xp: 0 }, "2026-10-15": { xp: 12 }, "2026-10-18": { xp: 1 }, "2026-10-19": { xp: 3 } };
assert.equal(weekDays(log, "2026-10-15"), 3);
assert.equal(weekDays(log, "2026-10-18"), 3);

// progress codes round-trip, including non-ASCII text
const st = { done: { "a.html": { score: 5 } }, xp: 120, note: "café ✓" };
assert.deepEqual(importCode(exportCode(st)), st);
console.log("game.test.mjs: all passed");
