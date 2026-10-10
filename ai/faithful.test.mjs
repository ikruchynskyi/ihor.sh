import assert from "node:assert/strict";
import { check, faithfulness } from "./faithful.js";

const data = { station: "14 St-Union Sq", next: [{ line: "L", min: 3, at: "2026-10-10T15:15:00-04:00" }, { line: "4", min: 7 }], temp: 72.4, riders: 1250 };
const c = check("The next L is in 3 minutes (3:15 PM), then the 4 in 7. It's 72°F and 1,250 riders. Also 9 trains.", data, "When is the next train at 14 St?");
const by = Object.fromEntries(c.map((x) => [x.text, x.found]));
assert.equal(by["3"], "data");
assert.equal(by["3:15 PM"], "data");
assert.equal(by["7"], "data");
assert.equal(by["72"], "data");     // rounded from 72.4
assert.equal(by["1,250"], "data");
assert.equal(by["9"], false);       // not in the data: flagged
assert.equal(faithfulness(c), 6 / 7);
assert.equal(check("It leaves at 3:15.", data)[0].found, "data");   // no am/pm: 3:15 or 15:15
assert.equal(check("It leaves at 4:15 pm.", data)[0].found, false);
assert.equal(check("No numbers here.", data).length, 0);
assert.equal(faithfulness([]), 1);
assert.equal(check("14 St is busy", data, "is 14 St busy?")[0].found, "data");
assert.equal(check("about 80 degrees", data)[0].found, false);
assert.equal(check("Markets open 6am, close at noon", { open: "06:00" })[0].found, "data");
assert.equal(check("Markets open 7 am", { open: "06:00" })[0].found, false);
assert.equal(check("6 amazing parks", { n: 6 })[0].kind, "number");
console.log("faithful: ok");
