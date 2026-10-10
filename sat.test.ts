// Run: node sat.test.ts — SGP4 sanity on a fixed ISS element set, and the pass finder.
import assert from "node:assert/strict";
import { parseTle, sgp4, subpoint, passes } from "./sat.ts";

// ISS elements (CelesTrak, 2026-10-09); the reference subpoint below is from wheretheiss.at at the same moment
const tle = parseTle("1 25544U 98067A   26282.58333333  .00012000  00000+0  21500-3 0  9993", "2 25544  51.6300 120.0000 0005000 300.0000  60.0000 15.50000000 12345", "ISS");
const r0 = Math.hypot(...sgp4(tle, 0).r), r90 = Math.hypot(...sgp4(tle, 92.9).r);
assert.ok(r0 > 6700 && r0 < 6850, `radius ${r0}`);            // ~420 km up
assert.ok(Math.abs(r90 - r0) < 15, "nearly circular");
const a = subpoint(tle, tle.epoch), b = subpoint(tle, tle.epoch + 1440 / 15.5 * 60000);
assert.ok(Math.abs(a.lat) <= 51.7 && Math.abs(b.lat) <= 51.7, "latitude stays within the inclination");
assert.ok(a.km > 380 && a.km < 460, `altitude ${a.km}`);
const ps = passes(tle, 40.7128, -74.006, tle.epoch, 48);
assert.ok(ps.length >= 4 && ps.every((p) => p.set > p.rise && p.maxEl >= 10 && p.maxEl <= 90 && (p.set - p.rise) / 60000 < 15), `passes ${ps.length}`);
console.log(`sat ok: ${ps.length} passes over NYC in 48 h, highest ${Math.max(...ps.map((p) => p.maxEl)).toFixed(0)}°`);
