// ADS-B: what aircraft transponders broadcast on 1090 MHz, decoded from raw dongle samples.
// At 2 MS/s one bit is 1 µs = 2 samples, sent as pulse position: a pulse in the first half is 1, in the second 0.
// Each message: an 8 µs preamble, then 112 bits (DF17/18 "extended squitter"), the last 24 a CRC.
// Reference: Junzi Sun, "The 1090 Megahertz Riddle" (mode-s.org), whose example messages are our tests.

/** |I/Q|² per sample from cu8 bytes. Squared is enough: PPM only compares samples with each other. */
export function magnitude(cu8: Uint8Array): Float32Array {
  const out = new Float32Array(cu8.length >> 1);
  for (let i = 0, j = 0; j < out.length; i += 2, j++) {
    const a = cu8[i] - 127.5, b = cu8[i + 1] - 127.5;
    out[j] = a * a + b * b;
  }
  return out;
}

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

/** CRC-24 remainder of the whole message (data + parity): 0 means the message arrived intact. */
export function crcRemainder(msg: Uint8Array, bits = msg.length * 8) {
  let r = 0;
  for (let i = 0; i < bits; i++) {
    r = (r << 1) | ((msg[i >> 3] >> (7 - (i & 7))) & 1);
    if (r & 0x1000000) r ^= 0x1fff409;
  }
  return r & 0xffffff;
}

/** Find 112-bit messages that pass the CRC in a block of magnitudes at 2 MS/s. */
export function demodulate(m: Float32Array): Uint8Array[] {
  const found: Uint8Array[] = [];
  const msg = new Uint8Array(14);
  for (let i = 0; i + 16 + 224 < m.length; i++) {
    // Preamble: pulses at 0, 1, 3.5 and 4.5 µs → samples 0, 2, 7, 9; quiet in between.
    const p = m;
    if (!(p[i] > p[i + 1] && p[i + 1] < p[i + 2] && p[i + 2] > p[i + 3] && p[i + 3] < p[i] && p[i + 4] < p[i] && p[i + 5] < p[i] && p[i + 6] < p[i]
      && p[i + 7] > p[i + 8] && p[i + 8] < p[i + 9] && p[i + 9] > p[i + 6])) continue;
    const high = (p[i] + p[i + 2] + p[i + 7] + p[i + 9]) / 6;
    if (p[i + 4] >= high || p[i + 5] >= high || p[i + 11] >= high || p[i + 12] >= high || p[i + 13] >= high || p[i + 14] >= high) continue;
    msg.fill(0);
    for (let b = 0; b < 112; b++) if (p[i + 16 + 2 * b] > p[i + 17 + 2 * b]) msg[b >> 3] |= 0x80 >> (b & 7);
    const df = msg[0] >> 3;
    if ((df === 17 || df === 18) && crcRemainder(msg) === 0) { found.push(msg.slice()); i += 16 + 224 - 1; }
  }
  return found;
}

// ---------- message fields ----------
const CHARS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";
/** Bits [from, from+len) of the message, counting from 1 like the specs do. */
function bits(msg: Uint8Array, from: number, len: number) {
  let v = 0;
  for (let i = from - 1; i < from - 1 + len; i++) v = v * 2 + ((msg[i >> 3] >> (7 - (i & 7))) & 1);
  return v;
}

export type Message =
  | { icao: string; tc: number; kind: "ident"; callsign: string; category: number }
  | { icao: string; tc: number; kind: "position"; altitude: number | null; odd: boolean; latCpr: number; lonCpr: number }
  | { icao: string; tc: number; kind: "velocity"; speed: number; heading: number; verticalRate: number }
  | { icao: string; tc: number; kind: "other" };

export function decode(msg: Uint8Array): Message {
  const icao = toHex(msg.subarray(1, 4));
  const tc = bits(msg, 33, 5);
  if (tc >= 1 && tc <= 4) {
    let callsign = "";
    for (let k = 0; k < 8; k++) callsign += CHARS[bits(msg, 41 + 6 * k, 6)];
    return { icao, tc, kind: "ident", callsign: callsign.replace(/[# ]+$/, "").replace(/#/g, ""), category: bits(msg, 38, 3) };
  }
  if (tc >= 9 && tc <= 18) {
    const a = bits(msg, 41, 12), q = (a >> 4) & 1;
    // Q=1: 25 ft steps, the Q bit removed from the middle of the field. (Q=0 is Gillham code, rare: skipped.)
    const altitude = q ? ((((a >> 5) << 4) | (a & 0xf)) * 25 - 1000) : null;
    return { icao, tc, kind: "position", altitude, odd: bits(msg, 54, 1) === 1, latCpr: bits(msg, 55, 17) / 131072, lonCpr: bits(msg, 72, 17) / 131072 };
  }
  if (tc === 19 && (bits(msg, 38, 3) === 1 || bits(msg, 38, 3) === 2)) {
    const supersonic = bits(msg, 38, 3) === 2 ? 4 : 1;
    const vew = (bits(msg, 47, 10) - 1) * supersonic * (bits(msg, 46, 1) ? -1 : 1);
    const vns = (bits(msg, 58, 10) - 1) * supersonic * (bits(msg, 57, 1) ? -1 : 1);
    const vr = (bits(msg, 70, 9) - 1) * 64 * (bits(msg, 69, 1) ? -1 : 1);
    const heading = ((Math.atan2(vew, vns) * 180) / Math.PI + 360) % 360;
    return { icao, tc, kind: "velocity", speed: Math.hypot(vew, vns), heading, verticalRate: vr };
  }
  return { icao, tc, kind: "other" };
}

// ---------- CPR positions ----------
/** Number of longitude zones at a latitude (the NL function of the CPR spec). */
export function NL(lat: number) {
  const a = Math.abs(lat);
  if (a === 0) return 59;
  if (a === 87) return 2;
  if (a > 87) return 1;
  return Math.floor((2 * Math.PI) / Math.acos(1 - (1 - Math.cos(Math.PI / 30)) / Math.cos((Math.PI / 180) * a) ** 2));
}
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Position from one message and a reference point within 180 NM (our receiver), the "local decode". */
export function localPosition(odd: boolean, latCpr: number, lonCpr: number, refLat: number, refLon: number) {
  const dLat = 360 / (odd ? 59 : 60);
  const j = Math.floor(refLat / dLat) + Math.floor(mod(refLat, dLat) / dLat - latCpr + 0.5);
  const lat = dLat * (j + latCpr);
  const ni = NL(lat) - (odd ? 1 : 0), dLon = ni > 0 ? 360 / ni : 360;
  const m = Math.floor(refLon / dLon) + Math.floor(mod(refLon, dLon) / dLon - lonCpr + 0.5);
  return { lat, lon: dLon * (m + lonCpr) };
}

/** Position from an even/odd message pair (no reference needed); `latestOdd` says which arrived last. */
export function globalPosition(even: { latCpr: number; lonCpr: number }, odd: { latCpr: number; lonCpr: number }, latestOdd: boolean) {
  const j = Math.floor(59 * even.latCpr - 60 * odd.latCpr + 0.5);
  let latE = (360 / 60) * (mod(j, 60) + even.latCpr), latO = (360 / 59) * (mod(j, 59) + odd.latCpr);
  if (latE >= 270) latE -= 360;
  if (latO >= 270) latO -= 360;
  if (NL(latE) !== NL(latO)) return null; // the pair straddles a zone boundary: wait for the next one
  const lat = latestOdd ? latO : latE;
  const nl = NL(lat), ni = Math.max(nl - (latestOdd ? 1 : 0), 1);
  const m = Math.floor(even.lonCpr * (nl - 1) - odd.lonCpr * nl + 0.5);
  let lon = (360 / ni) * (mod(m, ni) + (latestOdd ? odd.lonCpr : even.lonCpr));
  if (lon >= 180) lon -= 360;
  return { lat, lon };
}

// ---------- tracking ----------
export interface Aircraft {
  icao: string; callsign?: string; lat?: number; lon?: number; altitude?: number | null; speed?: number; heading?: number;
  verticalRate?: number; messages: number; seen: number; track: [number, number][];
}

/** Keeps the state of every aircraft heard, from its messages. Positions use our location as the CPR reference. */
export class Tracker {
  planes = new Map<string, Aircraft>();
  refLat: number; refLon: number;
  constructor(refLat: number, refLon: number) { this.refLat = refLat; this.refLon = refLon; }

  /** Feed one valid message; returns the updated aircraft. */
  add(msg: Uint8Array, now = Date.now()): Aircraft {
    const d = decode(msg);
    const a = this.planes.get(d.icao) ?? { icao: d.icao, messages: 0, seen: now, track: [] };
    this.planes.set(d.icao, a);
    a.messages++; a.seen = now;
    if (d.kind === "ident") a.callsign = d.callsign;
    if (d.kind === "velocity") Object.assign(a, { speed: Math.round(d.speed), heading: Math.round(d.heading), verticalRate: d.verticalRate });
    if (d.kind === "position") {
      a.altitude = d.altitude;
      const p = localPosition(d.odd, d.latCpr, d.lonCpr, a.lat ?? this.refLat, a.lon ?? this.refLon);
      // ponytail: local decode only; a wrong fix beyond ~180 NM of the reference is dropped by the range check.
      if (Math.abs(p.lat - this.refLat) < 4 && Math.abs(p.lon - this.refLon) < 5) {
        a.lat = +p.lat.toFixed(5); a.lon = +p.lon.toFixed(5);
        a.track.push([a.lat, a.lon]);
        if (a.track.length > 60) a.track.shift();
      }
    }
    return a;
  }

  /** Aircraft heard in the last `maxAgeMs`; older ones are forgotten. */
  current(now = Date.now(), maxAgeMs = 60_000) {
    for (const [k, a] of this.planes) if (now - a.seen > maxAgeMs) this.planes.delete(k);
    return [...this.planes.values()];
  }
}

export { hexBytes };
