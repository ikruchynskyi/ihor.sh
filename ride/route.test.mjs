// Run: node ride/route.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGPX, measure, climb, splitDays, planDays, snapToCamps, along, longestGap, sun, toGPX, meters, openAt } from "./route.js";

// a degree of latitude is ~111.2 km
assert.ok(Math.abs(meters({ lat: 40, lon: -74 }, { lat: 41, lon: -74 }) - 111195) < 50);
// GPX: track points with and without <ele>, self-closing route points
const g = parseGPX(`<gpx><trk><name>T</name><trkseg><trkpt lat="40" lon="-74"><ele>10</ele></trkpt><trkpt lat="40.01" lon="-74"></trkpt></trkseg></trk><wpt lat="40.5" lon="-74"><name>Camp</name></wpt></gpx>`);
assert.equal(g.points.length, 2); assert.equal(g.points[0].ele, 10); assert.equal(g.points[1].ele, undefined); assert.equal(g.waypoints[0].name, "Camp");
assert.equal(parseGPX(`<rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte>`).points.length, 2);
// climbing ignores wiggles inside the band, counts real hills
const hill = [0, 3, 1, 4, 2, 20, 18, 40, 10].map((ele, i) => ({ lat: 40 + i * 0.001, lon: -74, ele }));
assert.deepEqual(climb(hill), { up: 40, down: 30 });
// a straight 100 km line, flat: 60 km days → 2 days
const line = Array.from({ length: 201 }, (_, i) => ({ lat: 40 + (i * 0.5) / 111.195, lon: -74, ele: 0 }));
assert.ok(Math.abs(measure(line) - 100) < 0.1);
const days = splitDays(line, { maxKm: 60 });
assert.equal(days.length, 2); assert.ok(line[days[0][1]].km <= 60 && line[days[0][1]].km > 59);
// snap day 1's end to a camp 5 km earlier
const snapped = snapToCamps(line, days, [{ km: 55 }]);
assert.ok(Math.abs(line[snapped[0][1]].km - 55) < 0.6 && snapped[1][0] === snapped[0][1]);
// stops: one 200 m off the route at km ~50, one 5 km off
const stops = along(line, [{ lat: 40 + 50 / 111.195, lon: -74 + 0.2 / 85, name: "W" }, { lat: 40.3, lon: -73.9 }], 300);
assert.equal(stops.length, 1); assert.ok(Math.abs(stops[0].km - 50) < 0.6 && stops[0].off > 150 && stops[0].off < 250);
assert.deepEqual(longestGap([{ km: 20 }, { km: 70 }], 0, 100), { from: 20, to: 70, km: 50 });
// NYC, 2026-10-09: sunrise 7:00, sunset 18:24 EDT (UTC−4), per Open-Meteo
const s = sun(new Date(2026, 9, 9), 40.7128, -74.006), hm = (d) => d.getUTCHours() * 60 + d.getUTCMinutes() - 240;
assert.ok(Math.abs(hm(s.rise) - 7 * 60) <= 3 && Math.abs(hm(s.set) - (18 * 60 + 24)) <= 3, `${s.rise.toISOString()} ${s.set.toISOString()}`);
assert.ok(toGPX("D1", line.slice(0, 2)).includes('<trkpt lat="40.000000" lon="-74.000000"><ele>0</ele>'));
// a pinned end at km 30 is kept; the 70 km after it is split again at 60
const pinned = planDays(line, { maxKm: 60 }, [60]);
assert.equal(line[pinned[0][1]].km.toFixed(0), "30"); assert.equal(pinned.length, 3); assert.equal(pinned[1][0], 60);
// waypoints go into the GPX, with unsafe characters removed
const gpx = toGPX("Trip", line.slice(0, 2), [{ lat: 40.5, lon: -74, name: "Lunch <deli>" }]);
assert.ok(gpx.includes('<wpt lat="40.500000" lon="-74.000000"><name>Lunch deli</name></wpt>'));
// the sample route reads, measures and splits
const hud = parseGPX(readFileSync(new URL("./samples/hudson.gpx", import.meta.url), "utf8"));
const km = measure(hud.points);
assert.ok(km > 70 && km < 80, km);
console.log(`sample: ${km.toFixed(1)} km, ${climb(hud.points).up} m up, ${splitDays(hud.points, { maxKm: 45 }).length} days at 45 km`);
console.log("route ok");

// opening hours: a Friday (2026-10-09) and a Saturday, local time
const fri = (hh, mm = 0) => new Date(2026, 9, 9, hh, mm), sat = (hh, mm = 0) => new Date(2026, 9, 10, hh, mm);
assert.equal(openAt("24/7", fri(3)), true);
assert.equal(openAt("Mo-Fr 08:00-20:00; Sa 09:00-14:00; Su off", fri(19, 59)), true);
assert.equal(openAt("Mo-Fr 08:00-20:00; Sa 09:00-14:00; Su off", fri(20)), false);
assert.equal(openAt("Mo-Fr 08:00-20:00; Sa 09:00-14:00; Su off", sat(15)), false);
assert.equal(openAt("Mo-Su 08:00-12:00,13:00-18:00", sat(12, 30)), false);
assert.equal(openAt("Mo-Su 08:00-12:00,13:00-18:00", sat(13, 30)), true);
assert.equal(openAt("Fr 18:00-02:00", sat(1)), true);             // Friday night, past midnight
assert.equal(openAt("Mo-Sa 07:00-22:00; Su 08:00-20:00", sat(21)), true);
assert.equal(openAt("Sa-Mo 10:00-16:00", sat(11)), true);          // a range that wraps the week
assert.equal(openAt("Mo-Fr 06:00-sunset", fri(10)), null);         // sunset: we don't guess
assert.equal(openAt("Mo-Fr 08:00-17:00; PH off", fri(9)), true);   // holidays skipped
assert.equal(openAt("", fri(9)), null);
assert.equal(openAt("Tu-Th 09:00-17:00", fri(10)), false);         // days not named are closed (OSM rule)
console.log("opening hours ok");
