// Run: node transit.test.ts
import assert from "node:assert/strict";
import { arrivals, csv, fields } from "./transit.ts";

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
console.log("transit ok");
