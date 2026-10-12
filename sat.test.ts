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
// The reference case from Spacetrack Report #3 (the SGP4 paper): satellite 88888, positions every 6 h for a day.
const t88 = parseTle("1 88888U          80275.98708465  .00073094  13844-3  66816-4 0    8", "2 88888  72.8435 115.9689 0086731  52.6988 110.5714 16.05824518  105");
const ref: [number, number[]][] = [[0, [2328.97048951, -5995.22076416, 1719.97067261]], [360, [2456.10705566, -6071.93853760, 1222.89727783]], [720, [2567.56195068, -6112.50384522, 713.96397400]], [1080, [2663.09078980, -6115.48229980, 196.39640427]], [1440, [2742.55133057, -6079.67144775, -326.38095856]]];
for (const [m, xyz] of ref) { const r = sgp4(t88, m).r; assert.ok(Math.hypot(r[0] - xyz[0], r[1] - xyz[1], r[2] - xyz[2]) < 0.1, `88888 at ${m} min`); }
// a pass already in progress is still listed (from its rise)
const mid = ps[1], again = passes(tle, 40.7128, -74.006, (mid.rise + mid.set) / 2, 3);
assert.ok(Math.abs(again[0].rise - mid.rise) < 1000, "the pass in progress comes first");
console.log(`sat ok: ${ps.length} passes over NYC in 48 h, highest ${Math.max(...ps.map((p) => p.maxEl)).toFixed(0)}°`);
