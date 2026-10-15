// How a Meteor pass is going, in numbers both the page and the server's recorder use: how far the satellite's band stands
// above the noise, and whether the decoded pictures really show the Earth.
import type { Channel } from "./meteor.ts";

/** How far the satellite's band (±40 kHz) stands above the noise floor, in dB, from a spectrum (dB, 0 Hz in the middle).
 *  The floor is learned per frequency (it falls at once, and creeps up 0.1 dB a minute, so a pass doesn't erase itself),
 *  and a band beside the signal (62–74 kHz) is subtracted, so the dongle filter's shape and the floor's own wobble
 *  cancel: noise alone reads about 0 dB. The scale is compressed: Es/N0 of 1, 3 and 8 dB read about 1.9, 2.8 and 5.1;
 *  decoding takes about 2 on this meter. */
export class SignalMeter {
  db = 0; private floor: Float32Array | null = null;
  push(spec: Float32Array, fs: number) {
    const n = spec.length; if (!this.floor || this.floor.length !== n) this.floor = spec.slice();
    const fl = this.floor;
    for (let i = 0; i < n; i++) fl[i] = spec[i] < fl[i] ? fl[i] + 0.2 * (spec[i] - fl[i]) : fl[i] + 0.0002;
    const band = (f0: number, f1: number) => { let s = 0, k = 0; for (let i = 0; i < n; i++) { const f = Math.abs((i / n - 0.5) * fs); if (f >= f0 && f <= f1) { s += spec[i] - fl[i]; k++; } } return k ? s / k : 0; };
    this.db = 0.9 * this.db + 0.1 * (band(0, 40e3) - band(62e3, 74e3));
    return this.db;
  }
}

/** Does a pass's picture show the Earth? For each channel, the share of its pixels that are neither black (lost blocks
 *  and lines) nor white (saturated); the best channel counts. A real picture is at least `minStrips` strips long (50 ≈
 *  400 scan lines ≈ a minute) with over half its pixels in between. */
export function pictureQuality(channels: Map<number, Channel>, minStrips = 50) {
  let best = { apid: 0, strips: 0, share: 0 };
  for (const [apid, ch] of channels) {
    let mid = 0, all = 0;
    for (const row of ch.rows) for (let i = 0; i < row.length; i += 7) { const v = row[i]; all++; if (v > 8 && v < 247) mid++; }
    const share = all ? mid / all : 0;
    if (share * ch.rows.length > best.share * best.strips) best = { apid, strips: ch.rows.length, share };
  }
  return { ...best, ok: best.strips >= minStrips && best.share > 0.5 };
}
