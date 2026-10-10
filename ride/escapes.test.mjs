// Run: node ride/escapes.test.mjs
import assert from "node:assert/strict";
import { bikeOK, nextOK, days, inSeason, ESCAPES } from "./escapes.js";

const d = (s) => new Date(s); // local time
// the named days
const D = days(2026);
assert.equal(D.thanks, "2026-11-26"); assert.equal(D.mothers, "2026-05-10"); assert.equal(D.memorial, "2026-05-25"); assert.equal(D.friMemorial, "2026-05-22");
assert.equal(D.labor, "2026-09-07"); assert.equal(D.friLabor, "2026-09-04"); assert.equal(D.columbus, "2026-10-12"); assert.equal(D.friJuly4, "2026-07-03"); assert.equal(D.mlk, "2026-01-19");
// Metro-North: a Friday 6 pm departure is in the 4–8 pm ban; 8 pm is fine; Saturday morning is fine
assert.equal(bikeOK("MNR", "out", d("2026-10-16T18:00")).ok, false);
assert.equal(bikeOK("MNR", "out", d("2026-10-16T20:00")).ok, true);
assert.equal(bikeOK("MNR", "out", d("2026-10-17T08:00")).ok, true);
assert.equal(bikeOK("MNR", "in", d("2026-10-19T09:30")).ok, false);  // Monday, arriving 9:30
assert.equal(bikeOK("MNR", "out", d("2026-11-26T10:00")).ok, false); // Thanksgiving
assert.equal(bikeOK("MNR", "out", d("2026-09-04T13:00")).ok, false); // holiday Friday, 1 pm
assert.equal(bikeOK("MNR", "out", d("2026-10-16T18:00"), { folding: true }).ok, true);
// LIRR: 3–8 pm outbound ban, Columbus Day banned
assert.equal(bikeOK("LIRR", "out", d("2026-10-16T15:30")).ok, false);
assert.equal(bikeOK("LIRR", "out", d("2026-10-16T14:45")).ok, true);
assert.equal(bikeOK("LIRR", "in", d("2026-10-12T19:00")).ok, false); // Columbus Day
// NJ Transit: 4–7 pm weekday outbound, weekend inbound 9–noon
assert.equal(bikeOK("NJT", "out", d("2026-10-16T18:30")).ok, false);
assert.equal(bikeOK("NJT", "out", d("2026-10-16T19:00")).ok, true);
assert.equal(bikeOK("NJT", "in", d("2026-10-18T10:00")).ok, false);
assert.equal(bikeOK("NJT", "in", d("2026-10-18T13:00")).ok, true);
// the earliest Friday-evening train with a bike
assert.equal(nextOK("MNR", "out", d("2026-10-16T17:10")).getHours(), 20);
assert.equal(nextOK("NJT", "out", d("2026-10-16T17:10")).getHours(), 19);
// seasons
assert.equal(inSeason(d("2026-10-10T12:00"), "10-11", "10-31"), false);
assert.equal(inSeason(d("2026-10-10T12:00"), "04-17", "10-11"), true);
for (const e of ESCAPES) assert.ok(e.plan.length >= 2 && e.camp.season.length === 2 && e.rr);
console.log("escapes ok");
