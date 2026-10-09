// Run: node mesh.test.ts — a hand-built FromRadio frame through the deframer and decoder.
import assert from "node:assert/strict";
import { deframer, enc, fromRadio, mesh, meshState } from "./mesh.ts";

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
console.log("mesh ok");
process.exit(0);
