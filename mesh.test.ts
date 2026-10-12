// Run: node mesh.test.ts — a hand-built FromRadio frame through the deframer and decoder.
import assert from "node:assert/strict";
import { deframer, enc, fromRadio, mesh, meshState, pb, routeOf } from "./mesh.ts";

const snr = Buffer.alloc(4); snr.writeFloatLE(-7.5);
const data = Buffer.concat([enc.u(1, 1), enc.bytes(2, Buffer.from("hello mesh"))]);
const pkt = Buffer.concat([enc.fixed(1, 0x1234abcd), enc.fixed(2, 0xffffffff), enc.bytes(4, data), enc.fixed(6, 42), enc.key(8, 5), snr, enc.u(9, 1), enc.u(12, -90), enc.u(15, 3)]);
const msg = enc.bytes(2, pkt), frame = Buffer.concat([Buffer.from([0x94, 0xc3, 0, msg.length]), msg]);
const logs: string[] = [];
mesh.messages = []; mesh.nodes.clear(); mesh.myNum = 7;
// split across chunks, with log text around it, like a real serial line
const feed = deframer(fromRadio, (l) => logs.push(l));
feed(Buffer.concat([Buffer.from("INFO boot ok\r\n"), frame.subarray(0, 5)]));
feed(Buffer.concat([frame.subarray(5), Buffer.from("DEBUG done\n")]));
assert.deepEqual(logs, ["INFO boot ok", "DEBUG done"]);
const m = mesh.messages[0];
assert.equal(m.text, "hello mesh"); assert.equal(m.from, 0x1234abcd); assert.equal(m.snr, -7.5); assert.equal(m.rssi, -90); assert.equal(m.hops, 2);
// a direct message to us is kept, but only the owner sees it
const dm = Buffer.concat([enc.fixed(1, 0x99), enc.fixed(2, 7), enc.bytes(4, data), enc.fixed(6, 43)]);
fromRadio(enc.bytes(2, dm));
assert.equal(meshState(false).messages.length, 1); assert.equal(meshState(true).messages.length, 2);
// a traceroute reply: 7 → 0xA1 → 0xB2 (them), back 0xB2 → unknown relay → 7; SNR in quarter dB, packed or not
const u32s = (xs: number[]) => Buffer.concat(xs.map((x) => { const b = Buffer.alloc(4); b.writeUInt32LE(x); return b; }));
const rd = Buffer.concat([enc.bytes(1, u32s([0xa1])), enc.bytes(2, Buffer.concat([enc.varint(22), enc.varint(-30)])), enc.bytes(3, u32s([0xffffffff])), enc.u(4, -128), enc.u(4, 40)]);
const r = routeOf(0xb2, pb(rd));
assert.deepEqual(r.towards.map((h) => [h.id, h.snr]), [["!00000007", undefined], ["!000000a1", 5.5], ["!000000b2", -7.5]]);
assert.deepEqual(r.back!.map((h) => [h.id, h.snr]), [["!000000b2", undefined], ["?", undefined], ["!00000007", 10]]);
console.log("mesh ok");
process.exit(0);
