// Run: node server/places.test.ts (no network, no live DB)
import assert from "node:assert/strict";
const { openNow } = await import("./nycapi.ts");
// Mon–Fri 9:00–17:00 and Saturday 22:00 → Sunday 02:00 (past midnight at the end of the week)
const week = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } })).concat([{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }]);
const ny = (s: string) => new Date(`${s}-04:00`); // EDT
assert.equal(openNow(week, ny("2026-10-28T10:00:00")), true);  // Wednesday 10 am
assert.equal(openNow(week, ny("2026-10-28T17:00:00")), false); // closes at 5
assert.equal(openNow(week, ny("2026-11-01T01:30:00")), true);  // Sunday 1:30 am, Saturday's late opening
assert.equal(openNow(week, ny("2026-11-01T12:00:00")), false);
assert.equal(openNow([{ open: { day: 0, hour: 0, minute: 0 } }], ny("2026-10-28T03:00:00")), true); // open 24 hours
assert.equal(openNow(undefined), null);
console.log("places ok");
