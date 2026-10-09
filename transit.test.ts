// Run: node transit.test.ts
import assert from "node:assert/strict";
import { arrivals, csv, fields, vehicles, walkBack } from "./transit.ts";

// protobuf: field 1 varint 150 → 08 96 01; field 2 string "hi" → 12 02 68 69
assert.deepEqual(fields(Uint8Array.from([0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69])).map(([k, v]) => [k, v instanceof Uint8Array ? [...v] : v]), [[1, 150], [2, [0x68, 0x69]]]);
// one GTFS-rt entity: trip(id "T", route "A"), stop_time_update(stop "A27N", arrival.time 1700000000)
const enc = (field: number, bytes: number[]) => [(field << 3) | 2, bytes.length, ...bytes];
const str = (x: string) => [...x].map((c) => c.charCodeAt(0));
const varint = (n: number) => { const b = []; while (n > 127) { b.push((n % 128) | 128); n = Math.floor(n / 128); } b.push(n); return b; };
const trip = [...enc(1, str("T")), ...enc(5, str("A"))];
const stu = [...enc(2, [0x10, ...varint(1700000000)]), ...enc(4, str("A27N"))];
const feed = Uint8Array.from(enc(2, enc(3, [...enc(1, trip), ...enc(2, stu)])));
assert.deepEqual(arrivals(feed), [{ route: "A", stop: "A27N", time: 1700000000, trip: "T" }]);
// csv with quotes
assert.deepEqual(csv('stop_id,stop_name\n4,"Hunters Point, South"\n"8",B'), [{ stop_id: "4", stop_name: "Hunters Point, South" }, { stop_id: "8", stop_name: "B" }]);
// vehicle: trip "T", position (lat 40.5f, lon -74f as float32), status 1 (stopped at), stop "A27N"
const f32 = (field: number, x: number) => [(field << 3) | 5, ...new Uint8Array(Float32Array.of(x).buffer)];
const vp = [...enc(1, enc(1, str("T"))), ...enc(2, [...f32(1, 40.5), ...f32(2, -74)]), 0x20, 1, ...enc(7, str("A27N"))];
assert.deepEqual(vehicles(Uint8Array.from(enc(2, enc(4, vp)))), [{ trip: "T", route: "", stop: "A27N", status: 1, time: 0, lat: 40.5, lon: -74 }]);
// walking back 0.5 km along a 1 km north-south line lands halfway
const line: [number, number][] = [[40.7, -74], [40.7 + 1000 / 111195, -74]];
const back = walkBack(line, 1, 500);
assert.ok(Math.abs(back.at[0] - (40.7 + 500 / 111195)) < 1e-6 && back.i === 0);
assert.deepEqual(walkBack(line, 1, 5000).at, line[0]);
console.log("transit ok");
