// APRS: packet radio on 144.390 MHz (North America). Each packet is AX.25 sent as 1200 baud AFSK over FM:
// a 1200 Hz tone (mark) and a 2200 Hz tone (space). The chain, all our own code:
//   IQ → FM audio (dsp.ts Receiver) → tone correlators → bit clock (PLL) → NRZI → HDLC frames → CRC → AX.25 → APRS.
// The AX.25/APRS parsing is ported from ~/aprs-web (which used Direwolf for the modem).
import { Receiver } from "./dsp.ts";

// ---------- frame check: CRC-16/X.25 ----------
export function fcs(bytes: Uint8Array, len = bytes.length) {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc ^ 0xffff;
}

// ---------- modem: audio samples → AX.25 frames ----------
/** Streaming Bell 202 demodulator + HDLC deframer. Feed audio chunks, get CRC-checked frames back. */
export class AfskDemod {
  private fs: number; private n: number;
  private ph1 = 0; private ph2 = 0; private w1: number; private w2: number;
  // moving averages (one bit long) of the signal mixed with each tone
  private ring: Float32Array; private pos = 0; private sums = new Float64Array(4);
  private clock = 0; private lastD = 0; private lastTone = 0;
  private sr = 0; private ones = 0; private inFrame = false; private bits: number[] = [];

  constructor(fs: number) {
    this.fs = fs;
    this.n = Math.round(fs / 1200);
    this.ring = new Float32Array(4 * this.n);
    this.w1 = (2 * Math.PI * 1200) / fs; this.w2 = (2 * Math.PI * 2200) / fs;
  }

  process(audio: Float32Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    const { n, ring, sums } = this, step = 1200 / this.fs;
    for (let k = 0; k < audio.length; k++) {
      const x = audio[k];
      const v = [x * Math.cos(this.ph1), x * Math.sin(this.ph1), x * Math.cos(this.ph2), x * Math.sin(this.ph2)];
      this.ph1 = (this.ph1 + this.w1) % (2 * Math.PI); this.ph2 = (this.ph2 + this.w2) % (2 * Math.PI);
      const base = this.pos * 4;
      for (let c = 0; c < 4; c++) { sums[c] += v[c] - ring[base + c]; ring[base + c] = v[c]; }
      this.pos = (this.pos + 1) % n;
      const mark = Math.hypot(sums[0], sums[1]), space = Math.hypot(sums[2], sums[3]);
      // > 0: mark (1200 Hz). A plain comparison survives pre-emphasis (one tone 6 dB louder): see the tests.
      const d = mark - space;

      // Bit clock: a phase that wraps once per bit; tone changes pull it toward 0, so wraps land mid-bit.
      if ((d > 0) !== (this.lastD > 0)) this.clock *= 0.7;
      this.lastD = d;
      this.clock += step;
      if (this.clock >= 0.5) {
        this.clock -= 1;
        const tone = d > 0 ? 1 : 0;
        const bit = tone === this.lastTone ? 1 : 0; // NRZI: no change = 1
        this.lastTone = tone;
        const f = this.bit(bit);
        if (f) frames.push(f);
      }
    }
    return frames;
  }

  /** HDLC: flags 0x7E around frames, a 0 stuffed after five 1s, bytes sent LSB first. */
  private bit(b: number): Uint8Array | null {
    this.sr = ((this.sr >> 1) | (b << 7)) & 0xff;
    if (this.sr === 0x7e) {
      let frame: Uint8Array | null = null;
      const len = this.bits.length - 7; // drop the flag's first 7 bits
      if (this.inFrame && len >= 18 * 8 && len % 8 === 0) {
        const bytes = new Uint8Array(len / 8);
        for (let i = 0; i < len; i++) if (this.bits[i]) bytes[i >> 3] |= 1 << (i & 7);
        if (fcs(bytes, bytes.length - 2) === (bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8))) frame = bytes.slice(0, -2);
      }
      this.bits = []; this.ones = 0; this.inFrame = true;
      return frame;
    }
    if (!this.inFrame) return null;
    if (b) {
      if (++this.ones >= 7) { this.inFrame = false; this.bits = []; return null; } // abort
      this.bits.push(1);
    } else {
      if (this.ones === 5) { this.ones = 0; return null; } // stuffed zero
      this.ones = 0;
      this.bits.push(0);
    }
    if (this.bits.length > 3000) { this.inFrame = false; this.bits = []; }
    return null;
  }
}

// ---------- AX.25 ----------
const latin1 = (b: Uint8Array) => String.fromCharCode(...b);
function decodeAddr(buf: Uint8Array, off: number) {
  let call = "";
  for (let i = 0; i < 6; i++) { const c = (buf[off + i] >> 1) & 0x7f; if (c > 0x20) call += String.fromCharCode(c); }
  const s = buf[off + 6], ssid = (s >> 1) & 0x0f;
  return { call: ssid ? `${call.trim()}-${ssid}` : call.trim(), last: (s & 1) === 1, repeated: (s & 0x80) !== 0 };
}

export interface Frame { dest: string; src: string; path: { call: string; repeated: boolean }[]; info: Uint8Array }
export function parseAX25(buf: Uint8Array): Frame | null {
  if (buf.length < 16) return null;
  const dest = decodeAddr(buf, 0), src = decodeAddr(buf, 7);
  let off = 14;
  const path: Frame["path"] = [];
  if (!src.last) while (off + 7 <= buf.length) { const d = decodeAddr(buf, off); off += 7; path.push(d); if (d.last) break; }
  if (off >= buf.length || (buf[off++] & 0xef) !== 0x03 || off >= buf.length) return null; // UI frames only
  off++; // PID
  return { dest: dest.call, src: src.call, path, info: buf.slice(off) };
}

// ---------- APRS ----------
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const toDecDeg = (deg: number, min: number, dir: string) => round6((dir === "S" || dir === "W" ? -1 : 1) * (deg + min / 60));
export type Weather = Partial<Record<"windDir" | "windSpeed" | "windGust" | "tempF" | "tempC" | "rainHour" | "rain24h" | "rainMidnight" | "humidity" | "pressure", number>>;

function parseWeather(str: string): Weather | null {
  const data = str.replace(/^\d{8}/, ""), wx: Weather = {};
  const num = (re: RegExp) => { const m = data.match(re); return m ? parseInt(m[1]) : null; };
  const set = (k: keyof Weather, v: number | null, scale = 1) => { if (v != null && !Number.isNaN(v)) wx[k] = v / scale; };
  set("windDir", num(/c(\d{3})/)); set("windSpeed", num(/s(\d{3})/)); set("windGust", num(/g(\d{3})/)); set("tempF", num(/t(-?\d{1,3})/));
  set("rainHour", num(/r(\d{3})/), 100); set("rain24h", num(/p(\d{3})/), 100); set("rainMidnight", num(/P(\d{3})/), 100);
  const h = num(/h(\d{2})/); if (h != null) wx.humidity = h === 0 ? 100 : h;
  set("pressure", num(/b(\d{5})/), 10);
  if (wx.tempF != null) wx.tempC = Math.round((((wx.tempF - 32) * 5) / 9) * 10) / 10;
  return Object.keys(wx).length ? wx : null;
}

type Pos = { lat: number; lon: number; symTable: string; sym: string; comment: string; speed?: number; course?: number; altitude?: number };
function parseStdPos(s: string): Pos | null {
  const m = s.match(/^(\d{2})([\d ]{2}\.[\d ]+)([NS])(.)(\d{3})([\d ]{2}\.[\d ]+)([EW])(.)(.*)$/s);
  if (!m) return null;
  return { lat: toDecDeg(+m[1], +m[2].replace(/ /g, "0"), m[3]), lon: toDecDeg(+m[5], +m[6].replace(/ /g, "0"), m[7]), symTable: m[4], sym: m[8], comment: m[9] };
}
function parseCompressedPos(s: string): Pos | null {
  if (s.length < 13) return null;
  const b = (c: string) => c.charCodeAt(0) - 33;
  const lat = 90 - (b(s[1]) * 753571 + b(s[2]) * 8281 + b(s[3]) * 91 + b(s[4])) / 380926;
  const lon = -180 + (b(s[5]) * 753571 + b(s[6]) * 8281 + b(s[7]) * 91 + b(s[8])) / 190463;
  return { lat: round6(lat), lon: round6(lon), symTable: s[0], sym: s[9], comment: s.slice(13) };
}
function parseMicE(destCall: string, info: Uint8Array): Pos | null {
  const dest = destCall.split("-")[0].padEnd(6);
  if (info.length < 9) return null;
  const dc: { d: number; flag: boolean }[] = [];
  for (let i = 0; i < 6; i++) {
    const c = dest.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) dc.push({ d: c - 0x30, flag: false });
    else if (c === 0x4c) dc.push({ d: 0, flag: false });
    else if (c >= 0x41 && c <= 0x4b) dc.push({ d: c - 0x41, flag: true });
    else if (c >= 0x50 && c <= 0x5a) dc.push({ d: c - 0x50, flag: true });
    else return null;
  }
  let lat = dc[0].d * 10 + dc[1].d + (dc[2].d * 10 + dc[3].d + (dc[4].d * 10 + dc[5].d) / 100) / 60;
  if (!dc[3].flag) lat = -lat;
  let lonDeg = info[1] - 28, lonMin = info[2] - 28;
  if (dc[4].flag) lonDeg += 100;
  if (lonDeg >= 180 && lonDeg <= 189) lonDeg -= 80;
  if (lonMin >= 60) lonMin -= 60;
  let lon = lonDeg + lonMin / 60 + (info[3] - 28) / 6000;
  if (dc[5].flag) lon = -lon;
  let speed = (info[4] - 28) * 10 + Math.floor((info[5] - 28) / 10), course = ((info[5] - 28) % 10) * 100 + (info[6] - 28);
  if (speed >= 800) speed -= 800;
  if (course >= 400) course -= 400;
  let raw = latin1(info.slice(9)).replace(/^[\r\n]/, ""), altitude: number | undefined;
  const am = raw.match(/^([\x21-\x7b]{3})\}([\s\S]*)$/);
  if (am) { altitude = (am[1].charCodeAt(0) - 33) * 8281 + (am[1].charCodeAt(1) - 33) * 91 + (am[1].charCodeAt(2) - 33) - 10000; raw = am[2]; }
  return { lat: round6(lat), lon: round6(lon), symTable: String.fromCharCode(info[7]), sym: String.fromCharCode(info[8]), comment: raw.trim(), speed, course, ...(altitude != null ? { altitude } : {}) };
}

export interface Packet {
  from: string; to: string; path: string; raw: string; type: string; time: string;
  lat?: number; lon?: number; symbol?: string; comment?: string; speed?: number; course?: number; altitude?: number;
  addressee?: string; message?: string; name?: string; status?: string; wx?: Weather | null; winlink?: boolean;
}
export function parseAPRS(frame: Frame, now = new Date()): Packet | null {
  if (!frame.info.length) return null;
  const s = latin1(frame.info), type = s[0];
  const pkt: Packet = { from: frame.src, to: frame.dest, path: frame.path.map((d) => d.call + (d.repeated ? "*" : "")).join(","), raw: s, type: "unknown", time: now.toISOString() };
  let pos: Pos | null = null;
  switch (type) {
    case "!": case "=": pkt.type = "position"; pos = parseStdPos(s.slice(1)) ?? parseCompressedPos(s.slice(1)); break;
    case "/": case "@": pkt.type = "position"; pos = parseStdPos(s.slice(8)) ?? parseCompressedPos(s.slice(8)); break;
    case ":": pkt.type = "message"; pkt.addressee = s.slice(1, 10).trim(); pkt.message = s.slice(11); break;
    case ";": pkt.type = "object"; pkt.name = s.slice(1, 10).trim(); pos = parseStdPos(s.slice(18)); break;
    case ")": { pkt.type = "item"; const e = s.indexOf("!", 1); if (e > 0) { pkt.name = s.slice(1, e); pos = parseStdPos(s.slice(e + 1)); } break; }
    case ">": pkt.type = "status"; pkt.status = s.slice(1).replace(/^\d{6}[zh]\s*/, ""); break;
    case "_": pkt.type = "weather"; pkt.wx = parseWeather(s.slice(1)); break;
    case "T": pkt.type = "telemetry"; pkt.comment = s.slice(1); break;
    case "`": case "'": pkt.type = "position"; pos = parseMicE(frame.dest, frame.info); break;
    default: {
      const rest = s.slice(1), c0 = rest.charCodeAt(0);
      const table = c0 === 0x2f || c0 === 0x5c || (c0 >= 0x30 && c0 <= 0x39) || (c0 >= 0x41 && c0 <= 0x5a);
      if (rest.length >= 13 && table && [...rest.slice(1, 9)].every((c) => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 123)) {
        pos = parseCompressedPos(rest);
        if (pos) pkt.type = "position";
      }
    }
  }
  if (pos) {
    Object.assign(pkt, { lat: pos.lat, lon: pos.lon, symbol: pos.symTable + pos.sym, comment: (pos.comment || "").trim() });
    if (pos.speed != null) { pkt.speed = pos.speed; pkt.course = pos.course; }
    if (pos.altitude != null) pkt.altitude = pos.altitude;
  }
  if (frame.dest.startsWith("APWL") || frame.dest.startsWith("APRS2") || pkt.symbol === "\\W" || pkt.addressee === "WLNK-1" || pkt.addressee?.startsWith("WL2K")) pkt.winlink = true;
  return pkt;
}

// ---------- stations ----------
export interface Station {
  callsign: string; firstSeen: string; lastSeen: string; packets: number; type: string; lat: number | null; lon: number | null;
  symbol: string; comment: string; status: string; speed?: number; course?: number; altitude?: number; wx?: Weather | null; winlink: boolean;
  track: [number, number][];
}
/** Everything heard, per callsign (from aprs-web's station store). */
export class Stations {
  map = new Map<string, Station>();
  log: Packet[] = [];
  add(p: Packet): Station {
    const st = this.map.get(p.from) ?? { callsign: p.from, firstSeen: p.time, lastSeen: p.time, packets: 0, type: p.type, lat: null, lon: null, symbol: "/>", comment: "", status: "", winlink: false, track: [] };
    this.map.set(p.from, st);
    st.lastSeen = p.time; st.packets++;
    if (p.type !== "unknown") st.type = p.type;
    if (p.lat != null && p.lon != null) { st.lat = p.lat; st.lon = p.lon; st.track.push([p.lat, p.lon]); if (st.track.length > 200) st.track.shift(); }
    if (p.symbol) st.symbol = p.symbol;
    if (p.comment) st.comment = p.comment;
    if (p.status) st.status = p.status;
    if (p.winlink) st.winlink = true;
    if (p.speed != null) { st.speed = p.speed; st.course = p.course; }
    if (p.altitude != null) st.altitude = p.altitude;
    if (p.wx) st.wx = p.wx;
    this.log.push(p); if (this.log.length > 500) this.log.shift();
    return st;
  }
}

/** The whole receive chain for IQ from the dongle: tuned `offset` Hz from center, NFM, then the modem. */
export class AprsReceiver {
  private rx: Receiver; private modem: AfskDemod;
  constructor(fs: number, offset: number) {
    this.rx = new Receiver(fs, offset, "NFM", 12.5e3);
    this.modem = new AfskDemod(this.rx.audioFs);
  }
  process(iq: Float32Array): Packet[] {
    return this.modem.process(this.rx.process(iq).audio).map(parseAX25).filter((f): f is Frame => !!f).map((f) => parseAPRS(f)).filter((p): p is Packet => !!p);
  }
}
