// Turning Meteor channels into finished pictures, after MeteorDemod's outputs: color composites named by channel number
// (red, green, blue), infrared shown as temperature or as a rain estimate, lost lines filled in, the scan "spread" so
// every pixel covers the same ground, and the pass redrawn on Mercator or azimuthal-equidistant maps. Pure functions on
// RGBA pictures; meteor-app.ts draws the overlays through the `toPixel` each step returns.
import { WIDTH, type Channel } from "./meteor.ts";
import type { Proj } from "./meteor-map.ts";

export type Picture = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
const RE = 6371, RAD = Math.PI / 180;

/** MSU-MR channel n is APID 63 + n: 1 visible 0.5–0.7 µm, 2 near-IR 0.7–1.1, 3 1.6–1.8, 4 3.5–4.1, 5 10.5–11.5, 6 11.5–12.5. */
export const PRESETS = [
  { id: "221", name: "Natural color (2-2-1): land green-brown, sea dark, clouds white", rgb: [65, 65, 64] },
  { id: "321", name: "False color (3-2-1): ice and snow cyan, water clouds white", rgb: [66, 65, 64] },
  { id: "125", name: "Day/IR mix (1-2-5): cold cloud tops blue", rgb: [64, 65, 68] },
  { id: "224", name: "Fog and night (2-2-4)", rgb: [65, 65, 67] },
  { id: "ir", name: "Infrared, gray (channel 5, works at night)", ir: true },
  { id: "thermal", name: "Infrared as temperature colors (cold blue, warm red)", ir: true, palette: "thermal" },
  { id: "rain", name: "Rain estimate: the coldest cloud tops in color over natural color", ir: true, palette: "rain", rgb: [65, 65, 64] },
] as const;
export type Preset = (typeof PRESETS)[number];

/** The infrared channel to use: 5 (APID 68) if sent, else 6, else 4. */
export const irApid = (have: number[]) => [68, 69, 67].find((a) => have.includes(a));
/** Can this pass make that preset? */
export function canMake(p: Preset, have: number[]) {
  return ("rgb" in p ? p.rgb.every((a) => have.includes(a)) : true) && (!("ir" in p) || irApid(have) !== undefined);
}

/** Uncalibrated temperature colors: MSU-MR's infrared bytes run bright = cold, so 255 is the coldest. */
export function thermalColor(v: number): [number, number, number] {
  const stops: [number, number, number, number][] = [[0, 120, 20, 20], [60, 230, 60, 30], [110, 250, 200, 40], [150, 60, 200, 80], [190, 40, 140, 230], [225, 120, 60, 220], [255, 255, 255, 255]];
  let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
  const [a, ...ca] = stops[i], [b, ...cb] = stops[i + 1], f = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return [0, 1, 2].map((k) => Math.round(ca[k] + f * (cb[k] - ca[k]))) as [number, number, number];
}
/** Rain estimate: cloud tops cold enough to be rain clouds (the brightest infrared) get yellow → red → magenta; else null. */
export function rainColor(v: number): [number, number, number] | null {
  if (v < 190) return null;
  const f = (v - 190) / 65;
  return f < 0.5 ? [255, Math.round(230 - 400 * f), 0] : [255, 30, Math.round(510 * (f - 0.5))];
}

/** One channel's rows as a gray plane, or null. */
function plane(ch: Channel | undefined, rowsOf: number[] | null) {
  if (!ch) return null;
  return (r: number, p: number) => { const m = rowsOf ? rowsOf[r] : r; return m >= 0 && ch.rows[m] ? ch.rows[m][p] : 0; };
}

/** The picture for a preset. `align(base, other)` lines each channel's rows up with the first one's (meteor.ts align). */
export function render(p: Preset, chs: Map<number, Channel>, align: (baseApid: number, apid: number) => number[]): Picture {
  const have = [...chs.keys()], ir = irApid(have), base = "rgb" in p ? p.rgb[0] : ir!, rows = chs.get(base)!.rows.length, n = WIDTH * 8;
  const get = (a: number) => plane(chs.get(a), a === base ? null : align(base, a));
  const data = new Uint8ClampedArray(rows * n * 4), out = (r: number, x: number, c: number[]) => { const o = (r * n + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; };
  const rgb = "rgb" in p ? p.rgb.map(get) : null, irp = ir !== undefined ? get(ir) : null;
  for (let r = 0; r < rows; r++) for (let x = 0; x < n; x++) {
    const v = irp ? irp(r, x) : 0;
    if (p.id === "ir") out(r, x, [v, v, v]);
    else if (p.id === "thermal") out(r, x, v ? thermalColor(v) : [0, 0, 0]);
    else {
      const c = rgb!.map((g) => g!(r, x)), rain = p.id === "rain" ? rainColor(v) : null;
      out(r, x, rain ?? c);
    }
  }
  return { data, width: WIDTH, height: rows * 8 };
}

/** Lost lines (all black across the picture) filled by blending the lines above and below, for gaps up to `max` lines. */
export function fillGaps(pic: Picture, max = 32) {
  const { data, width, height } = pic, blank = (y: number) => { for (let x = 4; x < width; x += 37) if (data[(y * width + x) * 4] || data[(y * width + x) * 4 + 1] || data[(y * width + x) * 4 + 2]) return false; return true; };
  for (let y = 1; y < height - 1; y++) {
    if (!blank(y) || blank(y - 1)) continue;
    let e = y; while (e < height && blank(e)) e++;
    if (e < height && e - y <= max) for (let k = y; k < e; k++) {
      const f = (k - y + 1) / (e - y + 1), a = (y - 1) * width * 4, b = e * width * 4, o = k * width * 4;
      for (let i = 0; i < width * 4; i++) data[o + i] = data[a + i] + f * (data[b + i] - data[a + i]);
    }
    y = e;
  }
  return pic;
}

/** Turned half a turn: an evening (northbound) pass, north up. */
export function rotate180(pic: Picture): Picture {
  const { data, width, height } = pic, out = new Uint8ClampedArray(data.length), px = width * height;
  for (let i = 0; i < px; i++) out.set(data.subarray(i * 4, i * 4 + 4), (px - 1 - i) * 4);
  return { data: out, width, height };
}

// ---------- spreading the scan: equal ground distance per pixel ----------
/** The scanner sweeps evenly in angle, so pixels near the edges cover far more ground (and the picture looks squeezed
 *  there). Ground distance from the track for a look angle α at height h: Re·(asin((Re+h)/Re·sin α) − α). */
export class Spread {
  readonly width: number; private half: number; private h: number; private kmPerPx: number;
  constructor(scanDeg: number, altitudeKm: number) {
    this.half = (scanDeg / 2) * RAD; this.h = altitudeKm;
    this.kmPerPx = (altitudeKm * scanDeg * RAD) / WIDTH; // at the track, where angle and ground agree
    this.width = Math.round((2 * this.ground(this.half)) / this.kmPerPx);
  }
  private ground(a: number) { return RE * (Math.asin(Math.min(1, ((RE + this.h) / RE) * Math.sin(a))) - a); }
  /** Look angle for a ground distance (inverse of `ground`, from the triangle Earth center–satellite–point). */
  private angle(s: number) { const c = s / RE; return Math.atan2(Math.sin(c), (RE + this.h) / RE - Math.cos(c)); }
  /** Raw column → spread column. */
  x(raw: number) { const a = ((raw - WIDTH / 2) / (WIDTH / 2)) * this.half, s = Math.sign(a) * this.ground(Math.abs(a)); return this.width / 2 + s / this.kmPerPx; }
  /** Spread column → raw column. */
  raw(u: number) { const s = (u - this.width / 2) * this.kmPerPx, a = Math.sign(s) * this.angle(Math.abs(s)); return WIDTH / 2 + (a / this.half) * (WIDTH / 2); }
  apply(pic: Picture): Picture {
    const W = this.width, H = pic.height, out = new Uint8ClampedArray(W * H * 4), src = pic.data, map = Float64Array.from({ length: W }, (_, u) => this.raw(u + 0.5) - 0.5);
    for (let u = 0; u < W; u++) {
      const x = map[u], x0 = Math.max(0, Math.floor(x)), x1 = Math.min(pic.width - 1, x0 + 1), f = x - x0;
      for (let y = 0; y < H; y++) { const o = (y * W + u) * 4, a = (y * pic.width + x0) * 4, b = (y * pic.width + x1) * 4; for (let k = 0; k < 4; k++) out[o + k] = src[a + k] * (1 - f) + src[b + k] * f; }
    }
    return { data: out, width: W, height: H };
  }
}

// ---------- maps ----------
export type MapKind = "mercator" | "azeq";
/** A map projection fitted around the pass: `fwd` lat/lon → map pixel, `inv` map pixel → lat/lon. About `kmPerPx` per pixel. */
export class MapView {
  width = 0; height = 0;
  private kind: MapKind; private k: number; private lat0: number; private lon0: number; private x0 = 0; private y0 = 0;
  /** `area`: places the picture covers (lat, lon), to size the map; `center` for the azimuthal map. */
  constructor(kind: MapKind, area: [number, number][], center: [number, number], kmPerPx = 2, maxSide = 2600) {
    this.kind = kind; this.lat0 = center[0] * RAD; this.lon0 = center[1] * RAD;
    this.k = kind === "mercator" ? (RE * Math.cos(this.lat0)) / kmPerPx : 1 / kmPerPx; // px per radian of longitude, or per km
    const pts = area.map(([la, lo]) => this.raw(la, lo)).filter((p): p is [number, number] => !!p);
    let [xa, xb, ya, yb] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of pts) { xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
    const shrink = Math.max(1, (xb - xa) / maxSide, (yb - ya) / maxSide); this.k /= shrink;
    this.x0 = xa / shrink; this.y0 = ya / shrink; this.width = Math.ceil((xb - xa) / shrink); this.height = Math.ceil((yb - ya) / shrink);
  }
  /** Unshifted map coordinates (y down). */
  private raw(lat: number, lon: number): [number, number] | null {
    const la = lat * RAD; let dl = lon * RAD - this.lon0; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    if (this.kind === "mercator") return Math.abs(lat) > 85 ? null : [this.k * dl, -this.k * Math.log(Math.tan(Math.PI / 4 + la / 2))];
    const cc = Math.sin(this.lat0) * Math.sin(la) + Math.cos(this.lat0) * Math.cos(la) * Math.cos(dl), c = Math.acos(Math.max(-1, Math.min(1, cc)));
    if (c > Math.PI / 2) return null;
    const kp = c < 1e-9 ? 1 : c / Math.sin(c), x = RE * kp * Math.cos(la) * Math.sin(dl), y = RE * kp * (Math.cos(this.lat0) * Math.sin(la) - Math.sin(this.lat0) * Math.cos(la) * Math.cos(dl));
    return [this.k * x, -this.k * y];
  }
  fwd(lat: number, lon: number): [number, number] | null { const p = this.raw(lat, lon); return p && [p[0] - this.x0, p[1] - this.y0]; }
  inv(u: number, v: number): [number, number] {
    const x = (u + this.x0) / this.k, y = -(v + this.y0) / this.k;
    if (this.kind === "mercator") return [(2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD, (this.lon0 + x) / RAD];
    const rho = Math.hypot(x, y), c = rho / RE;
    if (rho < 1e-9) return [this.lat0 / RAD, this.lon0 / RAD];
    const lat = Math.asin(Math.cos(c) * Math.sin(this.lat0) + (y * Math.sin(c) * Math.cos(this.lat0)) / rho);
    const lon = this.lon0 + Math.atan2(x * Math.sin(c), rho * Math.cos(this.lat0) * Math.cos(c) - y * Math.sin(this.lat0) * Math.sin(c));
    return [lat / RAD, lon / RAD];
  }
  /** The pass redrawn on this map: each map pixel looks up where the scanner saw that place (`src`: lat/lon → picture pixel).
   *  Exact lookups on an 8-pixel grid, blended in between (the mapping is smooth), exact again along the swath's edges. */
  draw(pic: Picture, src: Proj): Picture {
    const W = this.width, H = this.height, out = new Uint8ClampedArray(W * H * 4), G = 8, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1;
    const look = (u: number, v: number) => { const [la, lo] = this.inv(u, v); return src.toPixel(la, lo); };
    const grid: ([number, number] | null)[] = new Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = look(i * G, j * G);
    const put = (u: number, v: number, p: [number, number] | null) => {
      if (!p) return;
      const x = Math.round(p[0]), y = Math.round(p[1]); if (x < 0 || y < 0 || x >= pic.width || y >= pic.height) return;
      const a = (y * pic.width + x) * 4, o = (v * W + u) * 4; out[o] = pic.data[a]; out[o + 1] = pic.data[a + 1]; out[o + 2] = pic.data[a + 2]; out[o + 3] = 255;
    };
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const c = [grid[j * gw + i], grid[j * gw + i + 1], grid[(j + 1) * gw + i], grid[(j + 1) * gw + i + 1]], whole = c.every((q) => q && Math.abs(q[1] - c[0]![1]) < 40);
      if (!c.some(Boolean)) continue;
      for (let v = j * G; v < Math.min(H, (j + 1) * G); v++) for (let u = i * G; u < Math.min(W, (i + 1) * G); u++) {
        if (!whole) { put(u, v, look(u, v)); continue; }
        const fx = (u - i * G) / G, fy = (v - j * G) / G, [a, b, d, e] = c as [number, number][];
        put(u, v, [(a[0] * (1 - fx) + b[0] * fx) * (1 - fy) + (d[0] * (1 - fx) + e[0] * fx) * fy, (a[1] * (1 - fx) + b[1] * fx) * (1 - fy) + (d[1] * (1 - fx) + e[1] * fx) * fy]);
      }
    }
    for (let i = 3; i < out.length; i += 4) if (!out[i]) out[i] = 255; // outside the swath: black, not transparent
    return { data: out, width: W, height: H };
  }
}
