// Run: node src/adsb.test.ts — example messages from "The 1090 Megahertz Riddle" (mode-s.org).
import assert from "node:assert/strict";
import { Tracker, crcRemainder, decode, demodulate, globalPosition, hexBytes, localPosition, toHex } from "./adsb.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// CRC: intact messages leave no remainder; one flipped bit does
const ident = hexBytes("8D4840D6202CC371C32CE0576098");
assert.equal(crcRemainder(ident), 0);
const broken = ident.slice(); broken[6] ^= 0x10;
assert.notEqual(crcRemainder(broken), 0);

// Identification
assert.deepEqual(decode(ident), { icao: "4840D6", tc: 4, kind: "ident", callsign: "KLM1023", category: 0 });

// Airborne position: an even/odd pair → 52.25720, 3.91937 at 38,000 ft
const even = decode(hexBytes("8D40621D58C382D690C8AC2863A7")), odd = decode(hexBytes("8D40621D58C386435CC412692AD6"));
assert.ok(even.kind === "position" && odd.kind === "position");
assert.equal(even.altitude, 38000);
assert.equal(even.odd, false); assert.equal(odd.odd, true);
const g = globalPosition(even, odd, false)!;
near(g.lat, 52.2572, 1e-4, "global lat"); near(g.lon, 3.91937, 1e-4, "global lon");
const l = localPosition(false, even.latCpr, even.lonCpr, 52.258, 3.918);
near(l.lat, 52.2572, 1e-4, "local lat"); near(l.lon, 3.91937, 1e-4, "local lon");

// Velocity: 159 kt, heading 182.88°, descending 832 ft/min
const v = decode(hexBytes("8D485020994409940838175B284F"));
assert.ok(v.kind === "velocity");
near(v.speed, 159.2, 0.1, "speed"); near(v.heading, 182.88, 0.01, "heading"); assert.equal(v.verticalRate, -832);

// Demodulation: encode a message as pulses at 2 MS/s, hide it in noise, find it again.
function pulses(msg: Uint8Array, at: number, total: number, noise = 0.05) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = Float32Array.from({ length: total }, () => rand() * noise);
  for (const s of [0, 2, 7, 9]) m[at + s] += 1; // preamble
  for (let b = 0; b < 112; b++) m[at + 16 + 2 * b + ((msg[b >> 3] >> (7 - (b & 7))) & 1 ? 0 : 1)] += 1;
  return m;
}
const found = demodulate(pulses(ident, 1234, 5000));
assert.equal(found.length, 1);
assert.equal(toHex(found[0]), "8D4840D6202CC371C32CE0576098");
assert.equal(demodulate(pulses(broken, 100, 1000)).length, 0, "a corrupted message is rejected by the CRC");

// Tracker: callsign + position + speed end up on one aircraft
const t = new Tracker(52.25, 3.9);
t.add(hexBytes("8D40621D58C382D690C8AC2863A7"));
const a = t.add(hexBytes("8D40621D58C386435CC412692AD6"));
assert.equal(a.icao, "40621D"); assert.equal(a.altitude, 38000);
near(a.lat!, 52.26578, 1e-3, "tracked lat");
assert.equal(t.current(Date.now() + 120_000).length, 0, "forgotten after a minute of silence");

console.log("adsb ok");
