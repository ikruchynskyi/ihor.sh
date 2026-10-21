// Run: node mesh.test.ts — a hand-built FromRadio frame through the deframer and decoder.
import assert from "node:assert/strict";
import { deframer, enc, fromRadio, mesh, meshState, pb, routeOf, hwName, clearNodes } from "./mesh.ts";

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

// Test hardware model mapping
assert.equal(hwName(9), "RAK4631 WisBlock");
assert.equal(hwName(43), "Heltec V3");
assert.equal(hwName(71), "Tracker T1000-E");
assert.equal(hwName(110), "Heltec V4");
assert.equal(hwName(255), "DIY / Custom");

// Test environmental telemetry decoding (Port 67)
const tempBuf = Buffer.alloc(4); tempBuf.writeFloatLE(22.5);
const humBuf = Buffer.alloc(4); humBuf.writeFloatLE(55.0);
const pressBuf = Buffer.alloc(4); pressBuf.writeFloatLE(1013.25);
const envProto = Buffer.concat([enc.key(1, 5), tempBuf, enc.key(2, 5), humBuf, enc.key(3, 5), pressBuf, enc.u(7, 35)]);
const telemProto = Buffer.concat([enc.u(1, Math.floor(Date.now() / 1000)), enc.bytes(3, envProto)]);
const telemData = Buffer.concat([enc.u(1, 67), enc.bytes(2, telemProto)]);
const telemPkt = Buffer.concat([enc.fixed(1, 0x1234abcd), enc.fixed(2, 0xffffffff), enc.bytes(4, telemData), enc.fixed(6, 44)]);
fromRadio(enc.bytes(2, telemPkt));
const nEnv = mesh.nodes.get(0x1234abcd);
assert(nEnv != null);
assert.equal(Math.round(nEnv.temp!), 23);
assert.equal(nEnv.humidity, 55.0);
assert.equal(Math.round(nEnv.pressure!), 1013);
assert.equal(nEnv.iaq, 35);
assert(nEnv.packets! >= 2);

// Test neighbor info decoding (Port 71)
const neighborSnr = Buffer.alloc(4); neighborSnr.writeFloatLE(6.25);
const neighborItem = Buffer.concat([enc.fixed(1, 0x55667788), enc.key(2, 5), neighborSnr]);
const niProto = Buffer.concat([enc.bytes(4, neighborItem)]);
const niData = Buffer.concat([enc.u(1, 71), enc.bytes(2, niProto)]);
const niPkt = Buffer.concat([enc.fixed(1, 0x1234abcd), enc.fixed(2, 0xffffffff), enc.bytes(4, niData), enc.fixed(6, 45)]);
fromRadio(enc.bytes(2, niPkt));
assert.equal(nEnv.neighbors?.length, 1);
assert.equal(nEnv.neighbors[0].num, 0x55667788);
assert.equal(nEnv.neighbors[0].id, "!55667788");
assert.equal(nEnv.neighbors[0].snr, 6.25);

// Test clearNodes functionality
mesh.nodes.set(7, { num: 7, id: "!00000007", long: "Our Node" });
mesh.nodes.set(123, { num: 123, id: "!0000007b", long: "Heard Node 1" });
mesh.nodes.set(456, { num: 456, id: "!000001c8", long: "Heard Node 2" });
assert.equal(mesh.nodes.size >= 3, true);

// Clear nodes keeping self (myNum = 7)
const res1 = clearNodes(true);
assert.equal(res1.ok, true);
assert(res1.cleared >= 2);
assert.equal(mesh.nodes.size, 1);
assert.equal(mesh.nodes.has(7), true);
assert.equal(mesh.nodes.has(123), false);

// Clear nodes without keeping self
const res2 = clearNodes(false);
assert.equal(res2.ok, true);
assert.equal(res2.cleared, 1);
assert.equal(mesh.nodes.size, 0);

// Test AdminMessage nodedb_reset encoding (field 100 = 1 in AdminMessage)
const adminMsg = enc.u(100, 1);
const adminParsed = pb(adminMsg);
assert.equal(adminParsed.get(100)?.[0], 1);
// Admin Data wrapper: portnum 6 (ADMIN_APP), payload adminMsg, want_response 1
const adminData = Buffer.concat([enc.u(1, 6), enc.bytes(2, adminMsg), enc.u(3, 1)]);
const dataParsed = pb(adminData);
assert.equal(dataParsed.get(1)?.[0], 6);
assert.equal(dataParsed.get(3)?.[0], 1);

// Test owner logs exposed in meshState
mesh.log.push("serial log line 1");
assert.equal(meshState(false).logs?.length ?? 0, 0);
assert(meshState(true).logs!.includes("serial log line 1"));

console.log("mesh ok");
process.exit(0);
