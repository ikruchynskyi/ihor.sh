// Meshtastic over USB serial, from scratch: the node is a LoRa mesh radio; we speak its serial API (protobuf frames
// behind a 0x94 0xC3 header), keep the node list and the public channel's chat, and let the owner send messages.
// No Meshtastic library: the few protobuf messages we need are decoded and encoded by hand below.
import { execFileSync } from "node:child_process";
import { closeSync, createReadStream, existsSync, openSync, readdirSync, readFileSync, writeFileSync, writeSync, constants } from "node:fs";
import path from "node:path";

// ---------- protobuf, just enough ----------
type Field = number | bigint | Buffer;
/** Wire-level decode: field number → every value seen (varints as numbers, 32/64-bit and length-delimited as raw bytes). */
export function pb(buf: Buffer) {
  const out = new Map<number, Field[]>();
  let i = 0;
  const varint = () => { let r = 0n, s = 0n, b; do { b = buf[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80 && i < buf.length); return r; };
  while (i < buf.length) {
    const key = Number(varint()), f = key >>> 3, wt = key & 7;
    let v: Field;
    if (wt === 0) { const n = varint(); v = n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n; }
    else if (wt === 1) { v = buf.subarray(i, i + 8); i += 8; }
    else if (wt === 2) { const n = Number(varint()); v = buf.subarray(i, i + n); i += n; }
    else if (wt === 5) { v = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`wire type ${wt}`);
    if (i > buf.length) throw new Error("truncated");
    (out.get(f) ?? out.set(f, []).get(f)!).push(v);
  }
  return out;
}
const one = (m: Map<number, Field[]>, f: number) => m.get(f)?.[0];
const num = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : undefined; };
const u32 = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return Buffer.isBuffer(v) && v.length === 4 ? v.readUInt32LE(0) : num(m, f); };
const i32 = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return Buffer.isBuffer(v) && v.length === 4 ? v.readInt32LE(0) : undefined; };
const f32 = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return Buffer.isBuffer(v) && v.length === 4 ? v.readFloatLE(0) : undefined; };
const str = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return Buffer.isBuffer(v) ? v.toString("utf8") : undefined; };
const sub = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return Buffer.isBuffer(v) ? pb(v) : undefined; };
/** An int32 field: negative values are sent as 10-byte (64-bit two's complement) varints. */
const int = (m: Map<number, Field[]>, f: number) => { const v = one(m, f); return typeof v === "bigint" ? Number(BigInt.asIntN(64, v)) : typeof v === "number" ? (v > 0x7fffffff ? v - 2 ** 32 : v) : undefined; };

export const enc = {
  varint(n: number | bigint) { const out: number[] = []; let x = BigInt(n); if (x < 0n) x += 1n << 64n; do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; out.push(b); } while (x); return Buffer.from(out); },
  key(f: number, wt: number) { return enc.varint((f << 3) | wt); },
  u(f: number, n: number) { return Buffer.concat([enc.key(f, 0), enc.varint(n)]); },
  fixed(f: number, n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return Buffer.concat([enc.key(f, 5), b]); },
  bytes(f: number, b: Buffer) { return Buffer.concat([enc.key(f, 2), enc.varint(b.length), b]); },
};

// ---------- the mesh as we know it ----------
export const PORTS: Record<number, string> = { 1: "text", 3: "position", 4: "nodeinfo", 5: "routing", 6: "admin", 67: "telemetry", 70: "traceroute", 71: "neighbors", 32: "reply", 34: "paxcounter", 65: "store-forward", 66: "range-test", 73: "map-report" };
const REGIONS = ["unset", "US", "EU_433", "EU_868", "CN", "JP", "ANZ", "KR", "TW", "RU", "IN", "NZ_865", "TH", "LORA_24", "UA_433", "UA_868", "MY_433", "MY_919", "SG_923"];
const PRESETS = ["LongFast", "LongSlow", "VeryLongSlow", "MediumSlow", "MediumFast", "ShortSlow", "ShortFast", "LongModerate", "ShortTurbo"];
export type MeshNode = { num: number; id: string; long?: string; short?: string; hw?: number; role?: number; lat?: number; lon?: number; alt?: number; posAt?: number; snr?: number; rssi?: number; heard?: number; hops?: number; battery?: number; voltage?: number; chUtil?: number; airTx?: number; uptime?: number; viaMqtt?: boolean };
export const isPublic = (m: MeshMsg) => m.to === BROADCAST;
export type MeshMsg = { id: number; from: number; to: number; channel: number; text: string; at: number; snr?: number; rssi?: number; hops?: number; mine?: boolean };
export const mesh = { connected: false, port: "", myNum: 0, region: "", preset: "", channels: [] as { index: number; name: string; role: number }[], nodes: new Map<number, MeshNode>(), messages: [] as MeshMsg[], packets: 0, lastPacket: 0, log: [] as string[],
  // what arrives, to tell "nobody chatted" from "we can't read their channel": decoded packets per app port, and
  // encrypted ones per channel hash (the byte the radio sends for a channel it has no key for)
  ports: {} as Record<string, number>, encrypted: {} as Record<string, number> };
const BROADCAST = 0xffffffff;
const hexId = (n: number) => `!${(n >>> 0).toString(16).padStart(8, "0")}`;
const node = (n: number) => mesh.nodes.get(n) ?? mesh.nodes.set(n, { num: n, id: hexId(n) }).get(n)!;
let listeners: ((ev: string, data: unknown) => void)[] = [];
export const onMesh = (fn: (ev: string, data: unknown) => void) => { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn); }; };
const emit = (ev: string, data: unknown) => listeners.forEach((fn) => fn(ev, data));

function user(n: MeshNode, u: Map<number, Field[]>) {
  n.long = str(u, 2) ?? n.long; n.short = str(u, 3) ?? n.short; n.hw = num(u, 5) ?? n.hw; n.role = num(u, 7) ?? n.role;
}
function position(n: MeshNode, p: Map<number, Field[]>) {
  const lat = i32(p, 1), lon = i32(p, 2);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return;
  n.lat = lat / 1e7; n.lon = lon / 1e7; n.alt = int(p, 3); n.posAt = (u32(p, 4) || Math.floor(Date.now() / 1000)) * 1000;
}
function metrics(n: MeshNode, d: Map<number, Field[]>) {
  n.battery = num(d, 1) ?? n.battery; n.voltage = f32(d, 2) ?? n.voltage; n.chUtil = f32(d, 3) ?? n.chUtil; n.airTx = f32(d, 4) ?? n.airTx; n.uptime = num(d, 5) ?? n.uptime;
}

/** One FromRadio message from the node. Exported for tests. */
export function fromRadio(buf: Buffer) {
  const m = pb(buf);
  const my = sub(m, 3); if (my) mesh.myNum = num(my, 1) ?? mesh.myNum;
  const ni = sub(m, 4);
  if (ni) {
    const n = node(num(ni, 1)!);
    const u = sub(ni, 2); if (u) user(n, u);
    const p = sub(ni, 3); if (p) position(n, p);
    n.snr = f32(ni, 4) ?? n.snr; n.heard = (u32(ni, 5) ?? 0) * 1000 || n.heard; n.hops = num(ni, 9) ?? n.hops; n.viaMqtt = num(ni, 8) === 1 || n.viaMqtt;
    const dm = sub(ni, 6); if (dm) metrics(n, dm);
    emit("node", n);
  }
  const cfg = sub(m, 5), lora = cfg && sub(cfg, 6);
  if (lora) { mesh.region = REGIONS[num(lora, 7) ?? 0] ?? "?"; mesh.preset = num(lora, 1) === 0 ? "custom" : PRESETS[num(lora, 2) ?? 0] ?? "?"; }
  const ch = sub(m, 10);
  if (ch) { const st = sub(ch, 2), c = { index: num(ch, 1) ?? 0, name: (st && str(st, 3)) || "", role: num(ch, 3) ?? 0 }; mesh.channels = [...mesh.channels.filter((x) => x.index !== c.index), c].sort((a, b) => a.index - b.index); }
  const pkt = sub(m, 2);
  if (pkt) packet(pkt);
  if (num(m, 7) != null) { emit("ready", null); save(); }
}

function packet(p: Map<number, Field[]>) {
  const from = u32(p, 1) ?? 0, to = u32(p, 2) ?? 0, d = sub(p, 4);
  mesh.packets++; mesh.lastPacket = Date.now();
  const n = node(from), rxTime = (u32(p, 7) ?? 0) * 1000 || Date.now(), snr = f32(p, 8), rssi = int(p, 12), hopStart = num(p, 15), hopLimit = num(p, 9);
  n.heard = rxTime; if (snr != null && snr !== 0) n.snr = snr; if (rssi) n.rssi = rssi;
  if (hopStart != null && hopLimit != null) n.hops = hopStart - hopLimit;
  if (num(p, 14) === 1) n.viaMqtt = true;
  if (!d) { const h = String(num(p, 3) ?? "?"); mesh.encrypted[h] = (mesh.encrypted[h] ?? 0) + 1; save(); return emit("node", n); } // encrypted for a channel we don't have
  const port = num(d, 1) ?? 0, payload = one(d, 2);
  mesh.ports[port] = (mesh.ports[port] ?? 0) + 1;
  const body = Buffer.isBuffer(payload) ? payload : Buffer.alloc(0);
  try {
    if (port === 1) {
      const msg: MeshMsg = { id: u32(p, 6) ?? 0, from, to, channel: num(p, 3) ?? 0, text: body.toString("utf8").slice(0, 500), at: rxTime, snr, rssi, hops: n.hops, mine: from === mesh.myNum };
      // What was sent to everyone is public; direct messages to this node are kept for the owner only.
      if (to === BROADCAST || (mesh.myNum && to === mesh.myNum)) { mesh.messages.push(msg); mesh.messages = mesh.messages.slice(-300); emit("message", msg); save(); }
    } else if (port === 3) position(n, pb(body));
    else if (port === 4) user(n, pb(body));
    else if (port === 67) { const t = pb(body), dm = sub(t, 2); if (dm) metrics(n, dm); }
  } catch {} // a malformed payload from someone's radio isn't our problem
  emit("node", n);
}

// ---------- the serial link ----------
const FILE = path.join(import.meta.dirname, "data", "mesh.json");
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { writeFileSync(FILE, JSON.stringify({ nodes: [...mesh.nodes.values()], messages: mesh.messages, myNum: mesh.myNum, ports: mesh.ports, encrypted: mesh.encrypted })); } catch {} }, 2000);
}
try { const d = JSON.parse(readFileSync(FILE, "utf8")); for (const n of d.nodes) mesh.nodes.set(n.num, n); mesh.messages = d.messages ?? []; mesh.myNum = d.myNum ?? 0; mesh.ports = d.ports ?? {}; mesh.encrypted = d.encrypted ?? {}; } catch {}

/** Frames are 0x94 0xC3, a 2-byte big-endian length, then a protobuf. Anything else on the line is the node's debug log. */
export function deframer(onFrame: (b: Buffer) => void, onLog: (line: string) => void = () => {}) {
  let buf = Buffer.alloc(0), text = "";
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const at = buf.indexOf(0x94);
      if (at < 0) { text += buf.toString("latin1"); buf = Buffer.alloc(0); break; }
      if (at > 0) { text += buf.subarray(0, at).toString("latin1"); buf = buf.subarray(at); }
      if (buf.length < 4) break;
      if (buf[1] !== 0xc3) { text += "\x94"; buf = buf.subarray(1); continue; }
      const len = buf.readUInt16BE(2);
      if (len > 512) { buf = buf.subarray(1); continue; }
      if (buf.length < 4 + len) break;
      onFrame(buf.subarray(4, 4 + len)); buf = buf.subarray(4 + len);
    }
    const lines = text.split(/\r?\n/); text = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) onLog(l.replace(/\x1b\[[0-9;]*m/g, "").trim());
  };
}
const frame = (body: Buffer) => { const h = Buffer.from([0x94, 0xc3, 0, 0]); h.writeUInt16BE(body.length, 2); return Buffer.concat([h, body]); };

let fd = -1, stream: ReturnType<typeof createReadStream> | null = null;
const send = (toRadio: Buffer) => { if (fd >= 0) writeSync(fd, frame(toRadio)); };
const findPort = () => process.env.MESH_PORT || readdirSync("/dev").filter((f) => /^cu\.(usbserial|usbmodem|SLAB_USBtoUART|wchusbserial)/.test(f)).map((f) => `/dev/${f}`)[0] || "";

export function startMesh() {
  const port = findPort();
  if (!port || !existsSync(port)) { setTimeout(startMesh, 60_000); return; }
  try {
    // macOS puts a serial port's settings back to defaults when the last handle closes, so hold it open while setting them.
    fd = openSync(port, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
    execFileSync("stty", ["-f", port, "115200", "raw", "-echo", "-hupcl", "clocal"]); // -hupcl: don't reset the board when we close
  } catch (e) { mesh.log.push(`open ${port}: ${(e as Error).message}`); setTimeout(startMesh, 60_000); return; }
  mesh.port = port;
  const feed = deframer((b) => { mesh.connected = true; try { fromRadio(b); } catch (e) { mesh.log.push(`bad frame: ${(e as Error).message}`); } },
    (l) => { mesh.log.push(l); if (mesh.log.length > 200) mesh.log = mesh.log.slice(-100); });
  stream = createReadStream("", { fd: openSync(port, constants.O_RDONLY | constants.O_NOCTTY), highWaterMark: 512 });
  stream.on("data", (c) => feed(c as Buffer));
  const restart = (why: string) => { mesh.connected = false; mesh.log.push(why); try { stream?.destroy(); closeSync(fd); } catch {} fd = -1; setTimeout(startMesh, 10_000); };
  stream.on("error", (e) => restart(`serial: ${e.message}`));
  stream.on("close", () => { if (fd >= 0) restart("serial closed"); });
  // Wake the serial API (a run of 0xC3), then ask for everything it knows.
  writeSync(fd, Buffer.alloc(32, 0xc3));
  // Opening the port can reset the board (it then boots for a few seconds), so ask again until it answers.
  const ask = (k: number) => { if (fd < 0 || mesh.connected || k > 6) return; try { writeSync(fd, Buffer.alloc(32, 0xc3)); send(enc.u(3, Math.floor(Math.random() * 1e9))); } catch {} setTimeout(() => ask(k + 1), 4000); };
  setTimeout(() => ask(0), 200);
  // A heartbeat keeps the node in API mode (it falls back to plain logs after a quiet spell).
  const beat = setInterval(() => { if (fd < 0) return clearInterval(beat); try { send(enc.bytes(7, Buffer.alloc(0))); } catch (e) { clearInterval(beat); restart(`write: ${(e as Error).message}`); } }, 60_000);
}

/** Sends text to everyone on a channel. Returns the packet id. */
export function sendText(text: string, channel = 0) {
  if (fd < 0 || !mesh.connected) throw new Error("The Meshtastic node isn't connected.");
  const t = Buffer.from(text, "utf8");
  if (!t.length || t.length > 200) throw new Error("Messages are 1–200 bytes.");
  const id = (Math.random() * 0xffffffff) >>> 0;
  const data = Buffer.concat([enc.u(1, 1), enc.bytes(2, t)]);
  const pkt = Buffer.concat([enc.fixed(2, BROADCAST), enc.u(3, channel), enc.bytes(4, data), enc.fixed(6, id)]);
  send(enc.bytes(1, pkt));
  const msg: MeshMsg = { id, from: mesh.myNum, to: BROADCAST, channel, text, at: Date.now(), mine: true };
  mesh.messages.push(msg); emit("message", msg); save();
  return id;
}

/** What the page shows: nodes heard in the last 3 days, and the chat (direct messages to this node only for the owner). */
export function meshState(owner = false) {
  const since = Date.now() - 3 * 864e5;
  return {
    connected: mesh.connected, me: mesh.myNum ? hexId(mesh.myNum) : null, myNum: mesh.myNum, region: mesh.region, preset: mesh.preset,
    channels: mesh.channels.filter((c) => c.role > 0).map((c) => ({ index: c.index, name: c.name || (c.index === 0 ? mesh.preset || "Primary" : `Channel ${c.index}`) })),
    packets: mesh.packets, lastPacket: mesh.lastPacket, ports: mesh.ports, encryptedByChannelHash: mesh.encrypted,
    nodes: [...mesh.nodes.values()].filter((n) => n.num === mesh.myNum || (n.heard ?? 0) > since).sort((a, b) => (b.heard ?? 0) - (a.heard ?? 0)),
    messages: owner ? mesh.messages : mesh.messages.filter((m) => m.to === BROADCAST), owner,
  };
}
