// NTSC analog TV in software: an encoder (picture → composite video samples) and a decoder (samples → picture) that
// finds the syncs, tells the two interlaced fields apart, flywheels through the lines, and decodes color from the burst.
// Sampled at four times the color subcarrier (14.318 MHz), the rate real TV digitizers use: one subcarrier cycle is
// exactly 4 samples and a line exactly 910, which keeps the color arithmetic simple. Levels are in IRE units:
// sync −40, blanking 0, black 7.5, white 100.
import { firLowpass } from "./dsp.ts";

export const FSC = 315e6 / 88;      // color subcarrier, 3.579545 MHz
export const FS = 4 * FSC;          // 14.318 MHz
export const LINE = 910;            // samples per line: 227.5 subcarrier cycles
export const LINES = 525;
export const FRAME = LINE * LINES;
export const LINE_RATE = FS / LINE; // 15 734.26 lines per second
export const FIELD_RATE = (2 * LINE_RATE) / LINES; // 59.94

// Where things sit in a line, in samples from the leading edge of the horizontal sync.
const SYNC = 67;                       // 4.7 µs
const BURST0 = 76, BURST1 = 112;       // 9 cycles of burst after a 0.6 µs breezeway
export const ACT0 = 135, ACT_N = 753;  // active picture: 9.4 µs after sync, 52.6 µs long
const BROAD = 388;                     // a vertical-sync pulse: low for 27.1 µs of each half line
// Active lines of each field (1-based line numbers): 240 + 240 = 480 picture rows.
const F1 = 22, F2 = 285, ROWS_PER_FIELD = 240;

const yuvOf = (r: number, g: number, b: number) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, 0.492 * (b - y), 0.877 * (r - y)]; };

/** Encode a W×H RGBA picture (H = 480 rows) to one frame of composite video. `n0` is the frame's first sample number
 *  (the subcarrier's phase runs on across frames). `color: false` sends black and white (no burst, no chroma). */
export function encodeFrame(rgba: Uint8ClampedArray, W: number, H: number, opts: { color?: boolean; n0?: number } = {}): Float32Array<ArrayBuffer> {
  const color = opts.color ?? true, n0 = opts.n0 ?? 0, out = new Float32Array(FRAME);
  const rowY = new Float32Array(W), rowU = new Float32Array(W), rowV = new Float32Array(W);
  for (let l = 1; l <= LINES; l++) {
    const base = (l - 1) * LINE;
    // vertical sync: six broad pulses, every half line. Field 1 starts on a line, field 2 half a line later.
    const half = (k: number) => (l - 1) * 2 + (k >= LINE / 2 ? 1 : 0);
    for (let k = 0; k < LINE; k++) {
      const h = half(k), inV = (h >= 0 && h < 6) || (h >= 525 && h < 531), kk = k % (LINE / 2);
      out[base + k] = inV ? (kk < BROAD ? -40 : 0) : k < SYNC ? -40 : 0;
    }
    if ((l <= 3) || (l >= 263 && l <= 266)) continue; // vsync lines carry no burst
    const th = (n: number) => (Math.PI / 2) * ((n0 + n) % 4); // the subcarrier's phase: a quarter turn per sample
    if (color) for (let k = BURST0; k < BURST1; k++) out[base + k] = -20 * Math.sin(th(base + k));
    const row = l >= F1 && l < F1 + ROWS_PER_FIELD ? 2 * (l - F1) : l >= F2 && l < F2 + ROWS_PER_FIELD ? 2 * (l - F2) + 1 : -1;
    if (row < 0 || row >= H) { for (let k = ACT0; k < ACT0 + ACT_N; k++) out[base + k] = 7.5; continue; }
    for (let x = 0; x < W; x++) { const p = (row * W + x) * 4, [y, u, v] = yuvOf(rgba[p] / 255, rgba[p + 1] / 255, rgba[p + 2] / 255); rowY[x] = y; rowU[x] = u; rowV[x] = v; }
    for (let k = 0; k < ACT_N; k++) {
      const fx = Math.min(W - 1, Math.max(0, ((k + 0.5) / ACT_N) * W - 0.5)), x = Math.floor(fx), f = fx - x, x2 = Math.min(W - 1, x + 1);
      const y = rowY[x] * (1 - f) + rowY[x2] * f, n = base + ACT0 + k;
      let s = 7.5 + 92.5 * y;
      if (color) { const u = rowU[x] * (1 - f) + rowU[x2] * f, v = rowV[x] * (1 - f) + rowV[x2] * f, t = th(n); s += 92.5 * (u * Math.sin(t) + v * Math.cos(t)); }
      out[n] = s;
    }
  }
  return out;
}

/** What a receiver keeps of the signal: a low-pass at `cutoffHz` (the video bandwidth that fits the capture), plus noise. */
export function channel(x: Float32Array, cutoffHz: number, noiseIre = 0, seed = 1): Float32Array {
  let y = x;
  if (cutoffHz < FS / 2 - 1e5) {
    const h = firLowpass(cutoffHz / FS, Math.max(0.3e6, cutoffHz * 0.15) / FS), m = (h.length - 1) >> 1, n = x.length;
    y = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < h.length; k++) { const j = i + m - k; a += h[k] * x[j < 0 ? 0 : j >= n ? n - 1 : j]; } y[i] = a; }
  }
  if (noiseIre > 0) {
    if (y === x) y = x.slice();
    let s = seed >>> 0 || 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) + 0.5) / 4294967296;
    for (let i = 0; i < y.length; i += 2) { const r = Math.sqrt(-2 * Math.log(rnd())) * noiseIre, a = 2 * Math.PI * rnd(); y[i] += r * Math.cos(a); if (i + 1 < y.length) y[i + 1] += r * Math.sin(a); }
  }
  return y;
}

export interface Decoded { rgba: Uint8ClampedArray<ArrayBuffer>; fields: number[]; burst: number; color: boolean; lineJitter: number }

/** Decode one frame's worth of composite samples to a W×480 picture. `n0`: the buffer's first sample number. */
export function decodeFrame(x: Float32Array, W: number, opts: { n0?: number; colorKiller?: number } = {}): Decoded {
  const H = 2 * ROWS_PER_FIELD, n0 = opts.n0 ?? 0, rgba = new Uint8ClampedArray(W * H * 4), n = x.length;
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  // Sync separator: smooth (a 9-sample average, 4 samples of delay), then a threshold halfway between sync and blanking.
  const sm = new Float32Array(n); { let a = 0; for (let i = 0; i < n; i++) { a += x[i] - (i >= 9 ? x[i - 9] : 0); sm[i] = a / Math.min(i + 1, 9); } }
  const TH = -20, fallAt = (i: number) => i - 4 - 1 + (sm[i - 1] - TH) / (sm[i - 1] - sm[i]); // interpolated, delay removed
  // 1. Vertical syncs: runs below the threshold longer than ~18 µs. Group the pulses of one vsync.
  const groups: number[] = []; let lowStart = -1, lastBroad = -1e9;
  for (let i = 1; i < n; i++) {
    if (sm[i] < TH && sm[i - 1] >= TH) lowStart = fallAt(i);
    if (sm[i] >= TH && sm[i - 1] < TH && lowStart >= 0) { if (i - lowStart > 250) { if (lowStart - lastBroad > 600) groups.push(lowStart); lastBroad = lowStart; } lowStart = -1; }
  }
  const fields: number[] = []; let burstSum = 0, burstCount = 0, jitter = 0, jitterN = 0;
  const lineData = new Map<number, { Y: Float32Array; U: Float32Array; V: Float32Array; s: number }>();
  for (const g of groups) {
    // 2. Which field? The last horizontal sync before the vsync is a whole line before it (field 1) or half a line (field 2).
    let prevH = -1;
    for (let i = Math.floor(g) - 20; i > Math.max(1, g - LINE - 30); i--) if (sm[i] < TH && sm[i - 1] >= TH && g - fallAt(i) > 300) { prevH = fallAt(i); break; }
    const d = prevH < 0 ? LINE : g - prevH, field = d < 0.75 * LINE ? 2 : 1;
    const T = field === 1 ? g : g - LINE / 2, l0 = field === 1 ? 1 : 263, first = field === 1 ? F1 : F2;
    fields.push(field);
    // 3. Flywheel through the field's lines: predict each sync a line after the last, and nudge toward the edge found.
    let t = T + (first - 1 - l0) * LINE, err = 0;
    for (let l = first - 1; l < first + ROWS_PER_FIELD; l++, t += LINE) {
      const lo = Math.max(2, Math.floor(t - 12)), hi = Math.min(n - 1, Math.ceil(t + 12));
      let m = -1; for (let i = lo; i <= hi; i++) if (sm[i] < TH && sm[i - 1] >= TH) { m = fallAt(i); break; }
      if (m >= 0) { const e = m - t; err = 0.7 * err + 0.3 * e; jitter += e * e; jitterN++; }
      const s = t + err;
      if (s + LINE > n || s < LINE) continue;
      // 4. Color burst: its phase is the reference every color in the line is measured against.
      let pb = 0, qb = 0, nb = 0;
      for (let k = Math.ceil(s + BURST0 + 2); k < s + BURST1 - 2; k++) { const th = (Math.PI / 2) * ((n0 + k) % 4); pb += 2 * x[k] * Math.sin(th); qb += 2 * x[k] * Math.cos(th); nb++; }
      pb /= nb; qb /= nb;
      const amp = Math.hypot(pb, qb), psi = Math.atan2(-qb, -pb), cp = Math.cos(psi), sp = Math.sin(psi);
      if (l >= first) { burstSum += amp; burstCount++; }
      // 5. Separate brightness from color with a comb filter: the subcarrier flips sign every line (227.5 cycles),
      // so the sum of two neighboring lines keeps the brightness and the difference keeps the color.
      const k0 = Math.floor(s + ACT0) - 4, K = ACT_N + 10, Y = new Float32Array(K), U = new Float32Array(K), V = new Float32Array(K), Cc = new Float32Array(K);
      const useColor = amp > (opts.colorKiller ?? 6);
      for (let j = 0; j < K; j++) { const k = k0 + j; if (useColor) { Y[j] = (x[k] + x[k - LINE]) / 2; Cc[j] = (x[k] - x[k - LINE]) / 2; } else Y[j] = x[k]; }
      if (useColor) for (let j = 0; j < K; j++) {
        // demodulate: multiply by the subcarrier and average over one cycle (4 samples), then undo the burst's rotation
        let p = 0, q = 0;
        for (let a = -2; a < 2; a++) { const jj = Math.min(K - 1, Math.max(0, j + a)), th = (Math.PI / 2) * ((n0 + k0 + jj) % 4); p += 2 * Cc[jj] * Math.sin(th); q += 2 * Cc[jj] * Math.cos(th); }
        p /= 4; q /= 4; U[j] = p * cp + q * sp; V[j] = -p * sp + q * cp;
      }
      if (l >= first) lineData.set(field === 1 ? 2 * (l - first) : 2 * (l - first) + 1, { Y, U, V, s: s + ACT0 - k0 });
    }
  }
  // 6. Pixels: sample each line at the picture's column positions, YUV → RGB.
  for (const [row, { Y, U, V, s }] of lineData) {
    if (row < 0 || row >= H) continue;
    for (let px = 0; px < W; px++) {
      const pos = s + ((px + 0.5) / W) * ACT_N - 0.5, j = Math.floor(pos), f = pos - j;
      if (j < 0 || j + 1 >= Y.length) continue;
      const y = ((Y[j] * (1 - f) + Y[j + 1] * f) - 7.5) / 92.5, u = (U[j] * (1 - f) + U[j + 1] * f) / 92.5 / 0.492, v = (V[j] * (1 - f) + V[j + 1] * f) / 92.5 / 0.877;
      const r = y + v, b = y + u, gg = (y - 0.299 * r - 0.114 * b) / 0.587, o = (row * W + px) * 4;
      rgba[o] = r * 255; rgba[o + 1] = gg * 255; rgba[o + 2] = b * 255;
    }
  }
  const burst = burstCount ? burstSum / burstCount : 0;
  return { rgba, fields, burst, color: burst > (opts.colorKiller ?? 6), lineJitter: jitterN ? Math.sqrt(jitter / jitterN) : 0 };
}

/** 75% color bars over a gray ramp and a black/white checker strip: the classic test picture. */
export function testCard(W: number, H: number): Uint8ClampedArray<ArrayBuffer> {
  const p = new Uint8ClampedArray(W * H * 4), bars = [[191, 191, 191], [191, 191, 0], [0, 191, 191], [0, 191, 0], [191, 0, 191], [191, 0, 0], [0, 0, 191]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; let c: number[];
    if (y < H * 0.62) c = bars[Math.floor((x / W) * 7)];
    else if (y < H * 0.78) { const v = Math.round((x / (W - 1)) * 255); c = [v, v, v]; }
    else { const fine = Math.floor(x / Math.max(1, Math.round(W / (8 + 56 * (x / W))))) % 2; c = fine ? [235, 235, 235] : [16, 16, 16]; }
    p[o] = c[0]; p[o + 1] = c[1]; p[o + 2] = c[2]; p[o + 3] = 255;
  }
  return p;
}

/** PSNR in dB between two RGBA pictures (only rows `from`..`to`, to skip the edges). */
export function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray, W: number, from = 4, to = 476, chans = [0, 1, 2]): number {
  let se = 0, k = 0;
  for (let y = from; y < to; y++) for (let x = 8; x < W - 8; x++) for (const c of chans) { const o = (y * W + x) * 4 + c; se += (a[o] - b[o]) ** 2; k++; }
  return 10 * Math.log10((255 * 255) / (se / k));
}

/** Brightness-only PSNR (compares Y), for black-and-white reception of a color picture. */
export function psnrLuma(a: Uint8ClampedArray, b: Uint8ClampedArray, W: number, from = 4, to = 476): number {
  let se = 0, k = 0; const Y = (p: Uint8ClampedArray, o: number) => 0.299 * p[o] + 0.587 * p[o + 1] + 0.114 * p[o + 2];
  for (let y = from; y < to; y++) for (let x = 8; x < W - 8; x++) { const o = (y * W + x) * 4; se += (Y(a, o) - Y(b, o)) ** 2; k++; }
  return 10 * Math.log10((255 * 255) / (se / k));
}
