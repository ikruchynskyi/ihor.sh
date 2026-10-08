// Run: node nearest.test.js
import assert from "node:assert/strict";
import { distance, nearest, alertsByStation } from "./nearest.js";

// Times Square → Grand Central is ~0.9 km.
const ts = { lat: 40.75529, lon: -73.98726 }, gc = { lat: 40.751776, lon: -73.976848 };
assert.ok(Math.abs(distance(ts, gc) - 950) < 60, `got ${distance(ts, gc)}`);

const bikes = [{ id: "far", lat: 40.8, lon: -73.9 }, { id: "gc", ...gc }, { id: "here", ...ts }];
assert.deepEqual(nearest(ts, bikes, 2).map((b) => b.id), ["here", "gc"]);

const now = 1000;
const feed = { entity: [
  { id: "a", alert: { active_period: [{ start: 900, end: 1100 }], informed_entity: [{ route_id: "A", stop_id: "A57N" }, { route_id: "A", stop_id: "A57S" }, { route_id: "A", stop_id: "A55" }], header_text: { translation: [{ language: "en", text: "skip" }] }, "transit_realtime.mercury_alert": { alert_type: "Delays" } } },
  { id: "old", alert: { active_period: [{ start: 1, end: 2 }], informed_entity: [{ stop_id: "A57" }] } },
  { id: "route", alert: { informed_entity: [{ route_id: "4" }] } },
]};
const { byStation, unplaced } = alertsByStation(feed, now);
assert.deepEqual([...byStation.keys()].sort(), ["A55", "A57"]);
assert.equal(byStation.get("A57").length, 1); // N and S platforms collapse, expired alert dropped
assert.equal(byStation.get("A57")[0].type, "Delays");
assert.deepEqual(unplaced.map((a) => a.id), ["route"]);

console.log("nearest ok");
