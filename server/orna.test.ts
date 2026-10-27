// Run: node orna.test.ts — the bot's own reference values for the proof math, plus date handling.
import assert from "node:assert/strict";
import { baseRate, nextOccurrence, proofsNeeded, MATERIALS, plan } from "./orna.ts";

assert.equal(baseRate(10, "legendary"), 115); assert.equal(baseRate(5, "common"), 50); assert.equal(baseRate(7, "rare"), 75);
assert.equal(baseRate(10, "  Legendary  "), 115); assert.equal(baseRate(5, "mythic"), 50);
assert.equal(proofsNeeded(500, "Agony", 115), 575); assert.equal(proofsNeeded(500, "Towers", 115), 115000);
const t = new Date("2026-10-09T00:00:00Z");
assert.equal(nextOccurrence("October 9", t)!.toISOString().slice(0, 10), "2026-10-09", "today counts");
assert.equal(nextOccurrence("October 8", t)!.toISOString().slice(0, 10), "2027-10-08", "passed → next year");
assert.equal(nextOccurrence("January 3", t)!.toISOString().slice(0, 10), "2027-01-03");
assert.equal(nextOccurrence("February 29", t)!.toISOString().slice(0, 10), "2028-02-29", "leap year jump");
assert.equal(nextOccurrence("february 29", t)!.toISOString().slice(0, 10), "2028-02-29", "case-tolerant");
assert.equal(nextOccurrence("", t), null); assert.equal(nextOccurrence("Smarch 3", t), null);
assert.deepEqual(MATERIALS["Adamantine"], { tier: 4, rarity: "rare", uk: "Адамантій" });

// Ukrainian search resolution must match the intended material, not a prefix variant in the forecast sheet:
assert.equal((await plan("ортаніт", 100)).material, "Ortanite");
assert.equal((await plan("камінь", 100)).material, "Stone");
assert.equal((await plan("руніт", 100)).material, "Runestone");
assert.equal((await plan("душа", 100)).material, "Soul");
assert.equal((await plan("сталь", 100)).material, "Steel");
assert.equal((await plan("акваліт", 100)).material, "Waterstone");
assert.equal((await plan("Клятий ортаніт", 100)).material, "Cursed Ortanite");
assert.equal((await plan("Cursed Ortanite", 100)).material, "Cursed Ortanite");

console.log("orna ok");
