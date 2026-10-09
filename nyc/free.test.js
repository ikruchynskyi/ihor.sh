// Run: node free.test.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onDay, onDate, status, timeLabel } from "./free.js";

const rules = JSON.parse(readFileSync(new URL("./free.json", import.meta.url)));
const names = (d) => onDay(rules, d).map((x) => x.name);

// Fri 2026-10-02 is the 1st Friday: MoMA + Frick First Friday + Whitney + BBG morning.
const firstFri = names(new Date(2026, 9, 2));
for (const n of ["MoMA", "The Frick Collection: First Friday", "Whitney Museum", "Brooklyn Botanic Garden"]) assert.ok(firstFri.includes(n), n);
// Fri 2026-10-09 is the 2nd Friday: no MoMA.
assert.ok(!names(new Date(2026, 9, 9)).includes("MoMA"));
// Frick First Friday is skipped in September (2026-09-04 is the 1st Friday).
assert.ok(!names(new Date(2026, 8, 4)).includes("The Frick Collection: First Friday"));
// Whitney second Sunday (2026-10-11) is all day; first Sunday (10-04) is not.
assert.ok(names(new Date(2026, 9, 11)).includes("Whitney Museum"));
assert.ok(!names(new Date(2026, 9, 4)).includes("Whitney Museum"));
// BBG winter pay-what-you-wish on a weekday in January, with the per-window price.
const bbg = onDay(rules, new Date(2027, 0, 12)).find((x) => x.name === "Brooklyn Botanic Garden");
assert.equal(bbg.price, "Pay what you wish");
// "always" rules show up every day.
assert.ok(names(new Date(2026, 9, 13)).includes("Staten Island Ferry"));

const at = (h, m = 0) => new Date(2026, 9, 2, h, m);
const moma = { start: "16:00", end: "20:00" };
assert.equal(status(moma, at(15)), "later");
assert.equal(status(moma, at(16)), "now");
assert.equal(status(moma, at(20)), "over");
assert.equal(status({ start: null, end: "12:00" }, at(9)), "now");
assert.equal(status({ start: null, end: null }, at(9)), "allday");
assert.equal(timeLabel({ start: null, end: "11:00" }), "until 11:00");

// Every rule is well-formed: has a source and a checked date, and places have coordinates.
for (const r of rules) {
  assert.ok(r.url && r.checked, r.name);
  if (r.kind !== "perk") assert.ok(Number.isFinite(r.lat) && Number.isFinite(r.lon), r.name);
}
console.log("free ok");
// Feed events: weekly recurrence and listed occurrences decide the day, not just the date range.
const weekly = { start_date: "2026-10-01", end_date: "2026-10-31", recurring_days: "Thu", start_time: "18:00", end_time: "20:00" };
assert.deepEqual(onDate(weekly, "2026-10-08", new Date(2026, 9, 8)), { start: "18:00", end: "20:00" });
assert.equal(onDate(weekly, "2026-10-09", new Date(2026, 9, 9)), null);
const listed = { start_date: "2026-10-01", end_date: "2026-10-31", occurrences: "2026-10-03|12:00|14:00", start_time: "", end_time: "" };
assert.deepEqual(onDate(listed, "2026-10-03", new Date(2026, 9, 3)), { start: "12:00", end: "14:00" });
assert.equal(onDate(listed, "2026-10-04", new Date(2026, 9, 4)), null);
console.log("onDate ok");
