// Run: node src/aprs.test.ts
import assert from "node:assert/strict";
import { AfskDemod, Stations, fcs, parseAPRS, parseAX25 } from "./aprs.ts";

// --- an encoder for the tests: AX.25 UI frame → HDLC bits → NRZI → AFSK audio ---
function addr(call: string, last: boolean) {
  const [c, ssid = "0"] = call.split("-");
  const b = [...c.padEnd(6)].map((ch) => ch.charCodeAt(0) << 1);
  return [...b, 0x60 | (Number(ssid) << 1) | (last ? 1 : 0)];
}
function ax25(src: string, dest: string, path: string[], info: string) {
  const calls = [dest, src, ...path];
  const bytes = calls.flatMap((c, i) => addr(c, i === calls.length - 1));
  const body = Uint8Array.from([...bytes, 0x03, 0xf0, ...[...info].map((c) => c.charCodeAt(0))]);
  const f = fcs(body);
  return Uint8Array.from([...body, f & 0xff, f >> 8]);
}
function afsk(frame: Uint8Array, fs: number, { noise = 0, spaceGain = 1, seed = 3 } = {}) {
  const bits: number[] = [];
  const flag = () => { for (let i = 0; i < 8; i++) bits.push((0x7e >> i) & 1); };
  for (let i = 0; i < 20; i++) flag();
  let ones = 0;
  for (const byte of frame) for (let i = 0; i < 8; i++) {
    const b = (byte >> i) & 1;
    bits.push(b);
    if (b) { if (++ones === 5) { bits.push(0); ones = 0; } } else ones = 0;
  }
  for (let i = 0; i < 4; i++) flag();
  let tone = 1, ph = 0, t = 0, r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5);
  const out: number[] = [];
  for (const b of bits) {
    if (!b) tone ^= 1; // NRZI: a 0 changes the tone
    for (const end = (t + 1) * fs / 1200; out.length < end; ) { ph += (2 * Math.PI * (tone ? 1200 : 2200)) / fs; out.push((tone ? 1 : spaceGain) * Math.sin(ph) + noise * rand()); }
    t++;
  }
  return Float32Array.from(out);
}

const FS = 48000;
const frame = ax25("N0CALL-9", "APRS", ["WIDE1-1", "WIDE2-1"], "!4044.40N/07357.60W>Blip says hi");
const roundtrip = (audio: Float32Array) => {
  const d = new AfskDemod(FS), out: Uint8Array[] = [];
  for (let i = 0; i < audio.length; i += 4096) out.push(...d.process(audio.subarray(i, i + 4096))); // in chunks, like a live stream
  return out;
};
for (const opts of [{}, { noise: 0.6 }, { spaceGain: 2 }, { spaceGain: 0.5, noise: 0.3 }]) {
  const got = roundtrip(afsk(frame, FS, opts));
  assert.equal(got.length, 1, `one frame back with ${JSON.stringify(opts)}`);
  assert.deepEqual([...got[0]], [...frame.slice(0, -2)]);
}
const corrupt = frame.slice(); corrupt[20] ^= 4;
assert.equal(roundtrip(afsk(corrupt, FS)).length, 0, "bad CRC is dropped");

// --- AX.25 + APRS ---
const f = parseAX25(frame.slice(0, -2))!;
assert.equal(f.src, "N0CALL-9"); assert.equal(f.dest, "APRS");
assert.deepEqual(f.path.map((p) => p.call), ["WIDE1-1", "WIDE2-1"]);
const p = parseAPRS(f)!;
assert.equal(p.type, "position"); assert.equal(p.lat, 40.74); assert.equal(p.lon, -73.96); assert.equal(p.symbol, "/>"); assert.equal(p.comment, "Blip says hi");
assert.equal(p.path, "WIDE1-1,WIDE2-1");

// compressed position from the APRS spec: 49°30'N 72°45'W
const c = parseAPRS({ src: "X", dest: "APRS", path: [], info: Uint8Array.from("=/5L!!<*e7>{?!", (ch) => ch.charCodeAt(0)) })!;
assert.ok(Math.abs(c.lat! - 49.5) < 1e-4 && Math.abs(c.lon! + 72.75) < 1e-4, `compressed ${c.lat} ${c.lon}`);
// weather and messages
const w = parseAPRS({ src: "W", dest: "APRS", path: [], info: Uint8Array.from("_10090556c220s004g005t077r000p000P000h50b09900", (ch) => ch.charCodeAt(0)) })!;
assert.deepEqual([w.type, w.wx!.windDir, w.wx!.tempF, w.wx!.tempC, w.wx!.humidity, w.wx!.pressure], ["weather", 220, 77, 25, 50, 990]);
const m = parseAPRS({ src: "M", dest: "APRS", path: [], info: Uint8Array.from(":N0CALL   :hello{01", (ch) => ch.charCodeAt(0)) })!;
assert.deepEqual([m.type, m.addressee, m.message], ["message", "N0CALL", "hello{01"]);

// stations
const s = new Stations(); s.add(p); s.add(p);
assert.equal(s.map.get("N0CALL-9")!.packets, 2);
console.log("aprs ok");
