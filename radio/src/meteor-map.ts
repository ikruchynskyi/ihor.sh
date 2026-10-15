// Putting a Meteor picture on the map: every row carries the satellite's clock, the orbit (from the server, sat.ts)
// says where the satellite was then, and the scanner sweeps a fixed angle across the track. So a place on Earth lands
// on the row scanned when it crossed the scan plane, at the column of its angle from straight down.
import { WIDTH } from "./meteor.ts";

const DAY = 864e5, RAD = Math.PI / 180, RE = 6371;

/** How each satellite's scanner points, from MeteorDemod's settings.ini (fitted to real passes): the full sweep across
 *  the track (pixels evenly in angle), the tilt to the side (roll, + toward the satellite's right) and backward (pitch),
 *  and how far the onboard clock runs behind UTC. ponytail: yaw (M2-4: −0.3°) is left out; it turns the scan line by
 *  about one pixel at the edges. */
export interface Geometry { scanDeg: number; rollDeg: number; pitchDeg: number; clockS: number }
export const GEOMETRY: Record<string, Geometry> = {
  "meteor-m2-3": { scanDeg: 109.55, rollDeg: 0.3, pitchDeg: 0.8, clockS: 0.6 },
  "meteor-m2-4": { scanDeg: 109.5, rollDeg: 0, pitchDeg: 0.8, clockS: 0 },
};
const PLAIN: Geometry = { scanDeg: 110.6, rollDeg: 0, pitchDeg: 0, clockS: 0 };

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
  private rowDur: number; private track: number[][]; private times: number[]; private mirror: boolean; private geo: Geometry;
  /** `track`: [t, x, y, z] once a second (km, Earth-fixed); `times`: each row's time by the satellite's clock (UTC);
   *  `mirror` swaps the sides; `geo` the satellite's pointing. */
  constructor(track: number[][], times: number[], mirror = false, geo: Geometry = PLAIN) {
    this.track = track; this.times = times.map((t) => t + geo.clockS * 1000); this.mirror = mirror; this.geo = geo;
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
    const half = (this.geo.scanDeg / 2) * RAD, ang = Math.sign(dot(D, cross(V, S))) * theta - this.geo.rollDeg * RAD; // the scanner's angle, + = the satellite's right
    if (Math.abs(ang) > half) return null;
    // the picture starts at the satellite's right (MeteorDemod's geometry; it's why morning passes come out north-up)
    let x = WIDTH / 2 - (ang * WIDTH) / 2 / half;
    if (this.mirror) x = WIDTH - x;
    // pitch: the scanner leans back, so it sees a place a moment after the satellite has passed over it
    const r = Math.hypot(...S), dt = (tr[Math.min(n - 1, lo + 1)][0] - tr[Math.max(0, lo - 1)][0]) / 1000, vGround = (Math.hypot(...V) / dt) * (RE / r);
    const seen = t + ((r - RE) * Math.tan(this.geo.pitchDeg * RAD) / vGround) * 1000;
    // across rows: the row being scanned then
    const T = this.times; if (seen < T[0] || seen > T[T.length - 1] + this.rowDur) return null;
    let k = 0, top = T.length - 1; while (k < top) { const m = (k + top + 1) >> 1; if (T[m] <= seen) k = m; else top = m - 1; } // last row starting by then
    const span = k + 1 < T.length ? T[k + 1] - T[k] : this.rowDur;
    return [x, 8 * (k + Math.min(1, (seen - T[k]) / span))];
  }
}

/** Anything that places a point in the picture: a Projector, or one turned around for a north-up picture. */
export type Proj = { toPixel(lat: number, lon: number): [number, number] | null };

/** Draws polylines (flat [lon, lat, lon, lat…] arrays) onto the picture where the scanner saw them. */
export function drawLines(g: CanvasRenderingContext2D, pr: Proj, lines: number[][], color: string, width: number) {
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

/** Latitude and longitude lines every `step` degrees, as polylines for drawLines. */
export function graticule(step = 10): number[][] {
  const lines: number[][] = [];
  for (let lon = -180; lon < 180; lon += step) { const l: number[] = []; for (let lat = -85; lat <= 85; lat += 1) l.push(lon, lat); lines.push(l); }
  for (let lat = -80; lat <= 80; lat += step) { const l: number[] = []; for (let lon = -180; lon <= 180; lon += 1) l.push(lon, lat); lines.push(l); }
  return lines;
}

/** Text with a dark outline, readable on clouds and on sea. */
function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  g.lineWidth = Math.max(3, g.lineWidth); g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
}

/** City dots with names, biggest first, skipping a label that would overlap one already placed. `rows`: [name, lat, lon, capital]. */
export function drawCities(g: CanvasRenderingContext2D, pr: Proj, rows: [string, number, number, number, number][], color: string, size = 22) {
  const placed: number[][] = [];
  g.font = `600 ${size}px system-ui, sans-serif`; g.textBaseline = "middle"; g.lineJoin = "round";
  for (const [name, lat, lon, capital] of rows) {
    const p = pr.toPixel(lat, lon); if (!p) continue;
    const w = g.measureText(name).width, box = [p[0] + 9, p[1] - size / 2, p[0] + 13 + w, p[1] + size / 2];
    if (box[2] > g.canvas.width || placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    g.fillStyle = color; g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 2;
    g.beginPath(); capital ? g.rect(p[0] - 5, p[1] - 5, 10, 10) : g.arc(p[0], p[1], 5, 0, 7); g.fill(); g.stroke();
    outlined(g, name, p[0] + 11, p[1], color);
  }
}

/** The receiving station as a tilted cross. */
export function drawHome(g: CanvasRenderingContext2D, pr: Proj, lat: number, lon: number, color: string) {
  const p = pr.toPixel(lat, lon); if (!p) return false;
  g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 9; g.lineCap = "round";
  const cross = () => { g.beginPath(); g.moveTo(p[0] - 16, p[1] - 16); g.lineTo(p[0] + 16, p[1] + 16); g.moveTo(p[0] + 16, p[1] - 16); g.lineTo(p[0] - 16, p[1] + 16); g.stroke(); };
  cross(); g.strokeStyle = color; g.lineWidth = 5; cross();
  return true;
}

/** A caption at the top of the picture: which satellite, when. */
export function drawCaption(g: CanvasRenderingContext2D, lines: string[], color: string, size = 34) {
  g.font = `700 ${size}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "top"; g.lineJoin = "round";
  lines.forEach((l, i) => outlined(g, l, g.canvas.width / 2, 14 + i * (size + 8), color));
  g.textAlign = "start";
}
