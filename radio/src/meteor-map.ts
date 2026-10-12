// Putting a Meteor picture on the map: every row carries the satellite's clock, the orbit (from the server, sat.ts)
// says where the satellite was then, and the scanner sweeps a fixed angle across the track. So a place on Earth lands
// on the row scanned when it crossed the scan plane, at the column of its angle from straight down.
import { WIDTH } from "./meteor.ts";

const HALF_SCAN = (55.3 * Math.PI) / 180; // MSU-MR: ±55.3° across the track (a 2,800 km swath), pixels evenly in angle
const DAY = 864e5;

/** A place (degrees) → Earth-fixed km (WGS84, sea level). */
export function ecef(lat: number, lon: number): number[] {
  const a = 6378.137, e2 = 0.00669437999014, la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180, N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2);
  return [N * Math.cos(la) * Math.cos(lo), N * Math.cos(la) * Math.sin(lo), N * (1 - e2) * Math.sin(la)];
}

/** The satellite's clock (ms of its day) for each row → UTC. Meteor keeps Moscow time (UTC+3); the reading nearest `ref`
 *  (when the recording was made) decides the date, and plain UTC is accepted too. null when nothing lands within 40 min. */
export function rowTimes(rowMs: number[], ref: number): number[] | null {
  const ok = rowMs.filter((m) => m > 0 && m < DAY).sort((a, b) => a - b); if (!ok.length) return null;
  const mid = ok[ok.length >> 1];
  let shift = NaN;
  for (const off of [3 * 3600e3, 0]) for (const dd of [-1, 0, 1]) {
    const s = Math.floor(ref / DAY) * DAY + dd * DAY - off; // UTC = satellite ms-of-day + s
    if (Math.abs(mid + s - ref) < 40 * 60e3 && !(Math.abs(mid + s - ref) >= Math.abs(mid + shift - ref))) shift = s;
  }
  if (Number.isNaN(shift)) return null;
  const t = rowMs.map((m) => m + shift + (m < mid - DAY / 2 ? DAY : m > mid + DAY / 2 ? -DAY : 0)); // rows past midnight
  // a damaged timestamp (far off, or going backwards) is replaced by the one before it plus a row's time
  for (let i = 0; i < t.length; i++) if (Math.abs(t[i] - (mid + shift)) > 20 * 60e3 || (i && t[i] <= t[i - 1])) t[i] = i ? t[i - 1] + 1333 : mid + shift;
  return t;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class Projector {
  private rowDur: number; private track: number[][]; private times: number[]; private mirror: boolean;
  /** `track`: [t, x, y, z] once a second (km, Earth-fixed); `times`: UTC of each row; `mirror` swaps the sides. */
  constructor(track: number[][], times: number[], mirror = false) {
    this.track = track; this.times = times; this.mirror = mirror;
    const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b);
    this.rowDur = d[d.length >> 1] || 1333;
  }

  /** A place → (x, y) in the picture, or null when the scanner never saw it. */
  toPixel(lat: number, lon: number): [number, number] | null {
    const tr = this.track, n = tr.length; if (n < 3) return null;
    const P = ecef(lat, lon), pos = (i: number) => tr[i].slice(1), vel = (i: number) => sub(pos(Math.min(n - 1, i + 1)), pos(Math.max(0, i - 1)));
    // along the track: P is ahead of the scan plane (f > 0), then behind it; find when it crosses
    const f = (i: number) => dot(sub(P, pos(i)), vel(i));
    let lo = 0, hi = n - 1; if (!(f(lo) > 0 && f(hi) < 0)) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f(m) > 0) lo = m; else hi = m; }
    const fl = f(lo), fh = f(hi), u = fl / (fl - fh), t = tr[lo][0] + u * (tr[hi][0] - tr[lo][0]);
    const S = pos(lo).map((v, k) => v + u * (pos(hi)[k] - v)), V = vel(lo), D = sub(P, S);
    if (dot(D, P) >= 0) return null; // the far side of the Earth
    const theta = Math.acos(Math.min(1, -dot(D, S) / Math.sqrt(dot(D, D) * dot(S, S))));
    if (theta > HALF_SCAN) return null;
    const side = Math.sign(dot(D, cross(V, S))) * (this.mirror ? -1 : 1); // + = the satellite's right
    const x = WIDTH / 2 + (side * theta * WIDTH) / 2 / HALF_SCAN;
    // across rows: the row being scanned at time t (rows lost in transit make the picture shorter, times keep it right)
    const T = this.times; if (t < T[0] || t > T[T.length - 1] + this.rowDur) return null;
    let r = 0, top = T.length - 1; while (r < top) { const m = (r + top + 1) >> 1; if (T[m] <= t) r = m; else top = m - 1; } // last row starting by t
    const span = r + 1 < T.length ? T[r + 1] - T[r] : this.rowDur;
    return [x, 8 * (r + Math.min(1, (t - T[r]) / span))];
  }
}

/** Draws polylines (flat [lon, lat, lon, lat…] arrays) onto the picture where the scanner saw them. */
export function drawLines(g: CanvasRenderingContext2D, pr: Projector, lines: number[][], color: string, width: number) {
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.beginPath();
  for (const l of lines) {
    let prev: [number, number] | null = null;
    for (let i = 0; i < l.length; i += 2) {
      const p = pr.toPixel(l[i + 1], l[i]);
      if (p && prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 200) g.lineTo(p[0], p[1]); else if (p) g.moveTo(p[0], p[1]);
      prev = p;
    }
  }
  g.stroke();
}
