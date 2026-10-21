// Meshtastic over USB serial, from scratch: the node is a LoRa mesh radio; we speak its serial API (protobuf frames
// behind a 0x94 0xC3 header), keep the node list and the public channel's chat, and let the owner send messages.
// No Meshtastic library: the few protobuf messages we need are decoded and encoded by hand below.
import { execFileSync } from "node:child_process";
import { closeSync, createReadStream, existsSync, openSync, readdirSync, readFileSync, writeFileSync, writeSync, constants } from "node:fs";
import net from "node:net";
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
export const HARDWARE_MODELS: Record<number, string> = {
  0: "Unset",
  1: "TLora V2", 2: "TLora V1", 3: "TLora V2.1", 4: "T-Beam", 5: "Heltec V2.0",
  6: "T-Beam V0.7", 7: "T-Echo", 8: "TLora V1.1", 9: "RAK4631 WisBlock", 10: "Heltec V2.1",
  11: "Heltec V1", 12: "T-Beam S3 Core", 13: "RAK11200", 14: "Nano G1", 15: "TLora V2.1-1.8",
  16: "TLora T3-S3", 17: "Nano G1 Explorer", 18: "Nano G2 Ultra", 19: "LoRa Type", 20: "wiphone",
  21: "Wio WM1110", 22: "RAK2560 Solar", 23: "Heltec HRU-3601", 24: "Heltec Wireless Bridge", 25: "Station G1",
  26: "RAK11310", 27: "Makerfabs Tracker", 28: "Makerfabs", 29: "CanaryOne", 30: "RP2040 LoRa",
  31: "Station G2", 32: "LoRa Relay V1", 33: "T-Echo Plus", 36: "nRF52 Unknown", 37: "Portduino",
  38: "Android Sim", 39: "DIY V1", 40: "nRF52840 Dongle", 41: "Disaster Radio V3", 42: "M5Stack",
  43: "Heltec V3", 44: "Heltec WSL V3", 45: "BetaFPV 2400 TX", 46: "BetaFPV 900 Nano", 47: "RPi Pico",
  48: "Heltec Wireless Tracker", 49: "Heltec Wireless Paper", 50: "T-Deck", 51: "T-Watch S3", 52: "Picomputer S3",
  53: "Heltec HT-CT62", 54: "EByte ESP32-S3", 55: "ESP32-S3 Pico", 56: "Chatter 2", 57: "Heltec Paper V1.0",
  58: "Heltec Tracker V1.0", 59: "unPhone", 60: "TD-LORAC", 61: "CDEBYTE EoRa-S3", 62: "TWC Mesh V4",
  63: "nRF52 ProMicro DIY", 64: "Bandit Nano", 65: "Heltec Capsule V3", 66: "Vision Master T190", 67: "Vision Master E213",
  68: "Vision Master E290", 69: "Heltec T114", 70: "SenseCAP Indicator", 71: "Tracker T1000-E", 72: "RAK3172",
  73: "Wio-E5", 74: "Bandit 900", 75: "ME25LS01", 76: "RP2040 RFM95", 77: "M5Stack CoreBasic",
  78: "M5Stack Core2", 79: "RPi Pico 2", 80: "M5Stack CoreS3", 81: "Seeed Xiao S3", 82: "MS24SF1",
  83: "TLora C6", 84: "WisMesh Tap", 85: "Routastic", 86: "Mesh-Tab", 87: "MeshLink",
  88: "Xiao nRF52 Kit", 89: "ThinkNode M1", 90: "ThinkNode M2", 91: "T-ETH-Elite", 92: "Heltec HRI-3621",
  93: "Muzi Base", 94: "Heltec Mesh Pocket", 95: "Seeed Solar Node", 96: "NomadStar Meteor Pro", 97: "CrowPanel",
  98: "Link 32", 99: "Wio Tracker L1", 100: "Wio Tracker L1 E-Ink", 101: "Muzi R1 Neo", 102: "T-Deck Pro",
  103: "TLora Pager", 104: "M5Stack Reserved", 105: "WisMesh Tag", 106: "RAK3312", 107: "ThinkNode M5",
  108: "Heltec MeshSolar", 109: "T-Echo Lite", 110: "Heltec V4", 111: "M5Stack C6L", 112: "Cardputer Adv",
  113: "Heltec Wireless Tracker V2", 114: "T-Watch Ultra", 115: "ThinkNode M3", 116: "WisMesh Tap V2", 117: "RAK3401",
  118: "RAK6421", 119: "ThinkNode M4", 120: "ThinkNode M6", 121: "Meshstick 1262", 122: "T-Beam 1W",
  123: "T5 S3 ePaper Pro", 124: "T-Beam BPF", 125: "Mini ePaper S3", 126: "T-Display S3 Pro", 127: "Heltec T096",
  128: "Mesh Tracker X1", 129: "ThinkNode M7", 130: "ThinkNode M8", 131: "ThinkNode M9", 132: "Heltec V4 R8",
  133: "Heltec T1", 134: "Station G3", 135: "T-Impulse Plus", 136: "T-Echo Card", 137: "Wio Tracker L2",
  255: "DIY / Custom",
};
export const hwName = (hw?: number) => (hw != null ? HARDWARE_MODELS[hw] ?? `Model ${hw}` : undefined);
const REGIONS = ["unset", "US", "EU_433", "EU_868", "CN", "JP", "ANZ", "KR", "TW", "RU", "IN", "NZ_865", "TH", "LORA_24", "UA_433", "UA_868", "MY_433", "MY_919", "SG_923"];
const PRESETS = ["LongFast", "LongSlow", "VeryLongSlow", "MediumSlow", "MediumFast", "ShortSlow", "ShortFast", "LongModerate", "ShortTurbo"];
export type MeshNode = {
  num: number; id: string; long?: string; short?: string; hw?: number; hwModel?: string; role?: number;
  lat?: number; lon?: number; alt?: number; posAt?: number; snr?: number; rssi?: number; heard?: number;
  hops?: number; battery?: number; voltage?: number; chUtil?: number; airTx?: number; uptime?: number;
  viaMqtt?: boolean; packets?: number;
  // Environmental telemetry
  temp?: number; humidity?: number; pressure?: number; gasRes?: number; iaq?: number; lux?: number;
  windSpeed?: number; windDir?: number;
  // Air quality
  pm25?: number; co2?: number;
  // Neighbors
  neighbors?: { num: number; id: string; snr?: number }[];
};
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
  n.long = str(u, 2) ?? n.long; n.short = str(u, 3) ?? n.short; n.hw = num(u, 5) ?? n.hw;
  if (n.hw != null) n.hwModel = hwName(n.hw);
  n.role = num(u, 7) ?? n.role;
}
function position(n: MeshNode, p: Map<number, Field[]>) {
  const lat = i32(p, 1), lon = i32(p, 2);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return;
  n.lat = lat / 1e7; n.lon = lon / 1e7; n.alt = int(p, 3); n.posAt = (u32(p, 4) || Math.floor(Date.now() / 1000)) * 1000;
}
function metrics(n: MeshNode, d: Map<number, Field[]>) {
  n.battery = num(d, 1) ?? n.battery; n.voltage = f32(d, 2) ?? n.voltage; n.chUtil = f32(d, 3) ?? n.chUtil; n.airTx = f32(d, 4) ?? n.airTx; n.uptime = num(d, 5) ?? n.uptime;
}
function envMetrics(n: MeshNode, em: Map<number, Field[]>) {
  n.temp = f32(em, 1) ?? n.temp; n.humidity = f32(em, 2) ?? n.humidity; n.pressure = f32(em, 3) ?? n.pressure;
  n.gasRes = f32(em, 4) ?? n.gasRes; n.iaq = num(em, 7) ?? n.iaq; n.lux = f32(em, 9) ?? n.lux;
  n.windDir = num(em, 11) ?? n.windDir; n.windSpeed = f32(em, 12) ?? n.windSpeed;
}
function airMetrics(n: MeshNode, am: Map<number, Field[]>) {
  n.pm25 = num(am, 2) ?? n.pm25; n.co2 = f32(am, 13) ?? num(am, 13) ?? n.co2;
}
function neighborInfo(n: MeshNode, ni: Map<number, Field[]>) {
  const list = ni.get(4) ?? [];
  const neighbors: { num: number; id: string; snr?: number }[] = [];
  for (const item of list) {
    if (!Buffer.isBuffer(item)) continue;
    const nm = pb(item), idNum = u32(nm, 1);
    if (!idNum) continue;
    neighbors.push({ num: idNum, id: hexId(idNum), snr: f32(nm, 2) });
  }
  if (neighbors.length) n.neighbors = neighbors;
}

/** One FromRadio message from the node. Exported for tests. */
export function fromRadio(buf: Buffer) {
  const m = pb(buf);
  const my = sub(m, 3); if (my) { mesh.myNum = num(my, 1) ?? mesh.myNum; gotMyInfo = true; }
  const ni = sub(m, 4);
  if (ni) {
    const n = node(num(ni, 1)!);
    const u = sub(ni, 2); if (u) user(n, u);
    const p = sub(ni, 3); if (p) position(n, p);
    n.snr = f32(ni, 4) ?? n.snr; n.heard = (u32(ni, 5) ?? 0) * 1000 || n.heard; n.hops = num(ni, 9) ?? n.hops; n.viaMqtt = num(ni, 8) === 1 || n.viaMqtt;
    if (n.hw != null) n.hwModel = hwName(n.hw);
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
  n.packets = (n.packets ?? 0) + 1;
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
    else if (port === 67) {
      const t = pb(body), dm = sub(t, 2), em = sub(t, 3), am = sub(t, 5);
      if (dm) metrics(n, dm);
      if (em) envMetrics(n, em);
      if (am) airMetrics(n, am);
    } else if (port === 70 && trace && (u32(d, 6) === trace.id || from === trace.to)) traced(from, pb(body));
    else if (port === 71) neighborInfo(n, pb(body));
  } catch {} // a malformed payload from someone's radio isn't our problem
  emit("node", n);
}

// ---------- the serial link ----------
const FILE = path.join(import.meta.dirname, "..", "data", "mesh.json");
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { writeFileSync(FILE, JSON.stringify({ nodes: [...mesh.nodes.values()], messages: mesh.messages, ports: mesh.ports, encrypted: mesh.encrypted })); } catch {} }, 2000);
}
try {
  const d = JSON.parse(readFileSync(FILE, "utf8"));
  for (const n of d.nodes) {
    if (n.hw != null && !n.hwModel) n.hwModel = hwName(n.hw);
    mesh.nodes.set(n.num, n);
  }
  mesh.messages = d.messages ?? []; mesh.ports = d.ports ?? {}; mesh.encrypted = d.encrypted ?? {};
} catch {}

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

let fd = -1, stream: ReturnType<typeof createReadStream> | null = null, sock: net.Socket | null = null;
const writeRaw = (b: Buffer) => { if (sock && !sock.destroyed) sock.write(b); else if (fd >= 0) writeSync(fd, b); };
const send = (toRadio: Buffer) => writeRaw(frame(toRadio));
export const findMeshPort = () => process.env.MESH_PORT || readdirSync("/dev").filter((f) => /^cu\.(usbserial|usbmodem|SLAB_USBtoUART|wchusbserial)/.test(f)).map((f) => `/dev/${f}`)[0] || "";

let gotMyInfo = false;
export function startMesh() {
  const feed = deframer((b) => { mesh.connected = true; try { fromRadio(b); } catch (e) { mesh.log.push(`bad frame: ${(e as Error).message}`); } },
    (l) => { mesh.log.push(l); if (mesh.log.length > 200) mesh.log = mesh.log.slice(-100); });
  if (process.env.MESH_HOST) {
    const [host, portStr] = process.env.MESH_HOST.split(":");
    const s = net.connect(Number(portStr) || 8076, host || "127.0.0.1");
    let closed = false;
    const restart = (why: string) => { if (closed) return; closed = true; mesh.connected = false; mesh.log.push(why); try { s.destroy(); } catch {} if (sock === s) sock = null; setTimeout(startMesh, 15_000); };
    s.on("connect", () => {
      sock = s; mesh.port = `tcp://${process.env.MESH_HOST}`;
      writeRaw(Buffer.alloc(32, 0xc3));
      gotMyInfo = false;
      const ask = (k: number) => { if (sock !== s || gotMyInfo || k > 10) return; try { writeRaw(Buffer.alloc(32, 0xc3)); send(enc.u(3, Math.floor(Math.random() * 1e9))); } catch {} setTimeout(() => ask(k + 1), 4000); };
      setTimeout(() => ask(0), 200);
      const beat = setInterval(() => { if (sock !== s) return clearInterval(beat); try { send(enc.bytes(7, Buffer.alloc(0))); } catch (e) { clearInterval(beat); restart(`write: ${(e as Error).message}`); } }, 60_000);
    });
    s.on("data", (c) => feed(c as Buffer));
    s.on("error", (e) => restart(`serial bridge: ${e.message}`));
    s.on("close", () => restart("serial bridge closed"));
    return;
  }
  const port = findMeshPort();
  if (!port || !existsSync(port)) { setTimeout(startMesh, 60_000); return; }
  try {
    // macOS puts a serial port's settings back to defaults when the last handle closes, so hold it open while setting them.
    fd = openSync(port, constants.O_RDWR | constants.O_NOCTTY | constants.O_NONBLOCK);
    execFileSync("stty", ["-f", port, "115200", "raw", "-echo", "-hupcl", "clocal"]); // -hupcl: don't reset the board when we close
  } catch (e) { mesh.log.push(`open ${port}: ${(e as Error).message}`); setTimeout(startMesh, 60_000); return; }
  mesh.port = port;
  stream = createReadStream("", { fd: openSync(port, constants.O_RDONLY | constants.O_NOCTTY), highWaterMark: 512 });
  stream.on("data", (c) => feed(c as Buffer));
  const restart = (why: string) => { mesh.connected = false; mesh.log.push(why); try { stream?.destroy(); closeSync(fd); } catch {} fd = -1; setTimeout(startMesh, 10_000); };
  stream.on("error", (e) => restart(`serial: ${e.message}`));
  stream.on("close", () => { if (fd >= 0) restart("serial closed"); });
  // Wake the serial API (a run of 0xC3), then ask for everything it knows.
  writeRaw(Buffer.alloc(32, 0xc3));
  // Opening the port can reset the board (it then boots for a few seconds), so ask again until it says who it is (any
  // other traffic doesn't count: a board that was swapped must report its own node number, not the last one's).
  gotMyInfo = false;
  const ask = (k: number) => { if (fd < 0 || gotMyInfo || k > 10) return; try { writeRaw(Buffer.alloc(32, 0xc3)); send(enc.u(3, Math.floor(Math.random() * 1e9))); } catch {} setTimeout(() => ask(k + 1), 4000); };
  setTimeout(() => ask(0), 200);
  // A heartbeat keeps the node in API mode (it falls back to plain logs after a quiet spell).
  const beat = setInterval(() => { if (fd < 0) return clearInterval(beat); try { send(enc.bytes(7, Buffer.alloc(0))); } catch (e) { clearInterval(beat); restart(`write: ${(e as Error).message}`); } }, 60_000);
}

/** Sends text to everyone on a channel, or directly to a single node. Returns the packet id. */
export function sendText(text: string, channel = 0, to = BROADCAST) {
  if ((fd < 0 && !sock) || !mesh.connected) throw new Error("The Meshtastic node isn't connected.");
  const t = Buffer.from(text, "utf8");
  if (!t.length || t.length > 200) throw new Error("Messages are 1–200 bytes.");
  const id = (Math.random() * 0xffffffff) >>> 0;
  const data = Buffer.concat([enc.u(1, 1), enc.bytes(2, t)]);
  const pkt = Buffer.concat([enc.fixed(2, to), enc.u(3, channel), enc.bytes(4, data), enc.fixed(6, id)]);
  send(enc.bytes(1, pkt));
  const msg: MeshMsg = { id, from: mesh.myNum, to, channel, text, at: Date.now(), mine: true };
  mesh.messages.push(msg); emit("message", msg); save();
  return id;
}

/** Sends AdminMessage (port 6) with nodedb_reset = 1 (field 100) to the radio over serial. */
export function resetNodeDb() {
  if ((fd < 0 && !sock) || !mesh.connected) throw new Error("The Meshtastic node isn't connected.");
  const id = (Math.random() * 0xffffffff) >>> 0;
  const adminMsg = enc.u(100, 1);
  const data = Buffer.concat([enc.u(1, 6), enc.bytes(2, adminMsg), enc.u(3, 1)]);
  const pkt = Buffer.concat([enc.fixed(2, mesh.myNum || BROADCAST), enc.u(3, 0), enc.bytes(4, data), enc.fixed(6, id)]);
  send(enc.bytes(1, pkt));
  return id;
}

/** Clears the node database on the server and tells the connected radio to clear its NodeDB. */
export function clearNodes(keepSelf = true) {
  const prevCount = mesh.nodes.size;
  const selfNode = mesh.myNum ? mesh.nodes.get(mesh.myNum) : undefined;
  mesh.nodes.clear();
  if (keepSelf && selfNode) {
    mesh.nodes.set(mesh.myNum, selfNode);
  }
  try {
    writeFileSync(FILE, JSON.stringify({ nodes: [...mesh.nodes.values()], messages: mesh.messages, ports: mesh.ports, encrypted: mesh.encrypted }));
  } catch {}

  let hardwareReset = false;
  if ((fd >= 0 || sock) && mesh.connected) {
    try {
      resetNodeDb();
      hardwareReset = true;
    } catch (e) {
      mesh.log.push(`clearNodes radio reset: ${(e as Error).message}`);
    }
  }
  emit("ready", null);
  return { ok: true, cleared: prevCount - (keepSelf && selfNode ? 1 : 0), hardwareReset };
}

// ---------- traceroute: which nodes carry a packet to another node and back ----------
// A packet on TRACEROUTE_APP (70) asking for a response; every node that relays it adds its number and the SNR it heard
// it at (RouteDiscovery: route, snr_towards; on the way back route_back, snr_back). Nodes whose firmware doesn't take
// part show up as 0xFFFFFFFF, and an SNR of −128 means unknown. It transmits, so the server lets only the owner ask.
const UNKNOWN = 0xffffffff, TRACE_HOPS = 5;
let trace: { id: number; to: number; since: number; timer: ReturnType<typeof setTimeout> } | null = null;
export type Hop = { num: number; id: string; name?: string; snr?: number };
/** A repeated field, packed (one blob) or one value at a time: fixed32 node numbers, or int32 varints (SNR × 4). */
function packed(m: Map<number, Field[]>, f: number, kind: "u32" | "int") {
  return (m.get(f) ?? []).flatMap((v): number[] => {
    if (!Buffer.isBuffer(v)) return [typeof v === "bigint" ? Number(BigInt.asIntN(64, v)) : v > 0x7fffffff && kind === "int" ? v - 2 ** 32 : v];
    if (kind === "u32") return Array.from({ length: v.length >> 2 }, (_, i) => v.readUInt32LE(4 * i));
    const out: number[] = [];
    for (let i = 0; i < v.length; ) { let r = 0n, s = 0n, b; do { b = v[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80 && i < v.length); out.push(Number(BigInt.asIntN(64, r))); }
    return out;
  });
}
const hop = (num: number, snr?: number): Hop => ({ num, id: num === UNKNOWN ? "?" : hexId(num), name: num === UNKNOWN ? "unknown relay" : mesh.nodes.get(num)?.long ?? mesh.nodes.get(num)?.short, snr: snr == null || snr === -128 ? undefined : snr / 4 });
/** A RouteDiscovery reply from `from` as the two paths, us → them and them → us, each hop with the SNR it was heard at. */
export function routeOf(from: number, rd: Map<number, Field[]>) {
  const route = packed(rd, 1, "u32"), snrT = packed(rd, 2, "int"), back = packed(rd, 3, "u32"), snrB = packed(rd, 4, "int");
  return { towards: [mesh.myNum, ...route, from].map((n, i) => (i ? hop(n, snrT[i - 1]) : hop(n))),
    back: snrB.length || back.length ? [from, ...back, mesh.myNum].map((n, i) => (i ? hop(n, snrB[i - 1]) : hop(n))) : null };
}
function traced(from: number, rd: Map<number, Field[]>) {
  if (!trace) return;
  clearTimeout(trace.timer); trace = null;
  emit("traceroute", { to: from, at: Date.now(), ...routeOf(from, rd) });
}
/** Ask the mesh for the route to node `to`. The answer comes as a "traceroute" event (or one with an error after a minute). */
export function traceroute(to: number) {
  if ((fd < 0 && !sock) || !mesh.connected) throw new Error("The Meshtastic node isn't connected.");
  if (!(to > 0 && to < UNKNOWN) || to === mesh.myNum) throw new Error("Pick another node to trace.");
  if (trace) throw new Error("A traceroute is already waiting for its answer.");
  const id = (Math.random() * 0xffffffff) >>> 0;
  const data = Buffer.concat([enc.u(1, 70), enc.bytes(2, Buffer.alloc(0)), enc.u(3, 1)]); // an empty RouteDiscovery, want_response
  send(enc.bytes(1, Buffer.concat([enc.fixed(2, to), enc.u(3, 0), enc.bytes(4, data), enc.fixed(6, id), enc.u(9, TRACE_HOPS)])));
  trace = { id, to, since: Date.now(), timer: setTimeout(() => { trace = null; emit("traceroute", { to, at: Date.now(), error: "No answer within a minute: the node may be out of reach, asleep, or the reply got lost." }); }, 60_000) };
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
    tracing: owner && trace ? { to: trace.to, since: trace.since } : null, // a traceroute waiting for its answer (the owner's page shows it)
    logs: owner ? mesh.log.slice(-100) : [],
  };
}
