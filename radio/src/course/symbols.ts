// Chapter 21's symbols, pulses, matched filter and timing, in one place for the page's widgets and course/code/ch21.ts:
// ±1 symbols (one shadow, I, so the pictures stay readable), each sent as a root-raised-cosine bump (src/lrpt.ts's rrc),
// noise added, then optionally the matched filter (the same bump as filter weights, chapter 6).
import { rrc } from "../lrpt.ts";

export const SPS = 8; // samples per symbol in these pictures (the real receiver uses 4)
export const PULSE = rrc(0.6, 8, SPS); // unit energy: Σ h² = 1
const SPAN = PULSE.length;

export function symbols(n: number, seed = 5) { let s = seed; return Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647 < 0.5 ? -1 : 1)); }
/** The transmitted samples: each symbol's bump, overlapping its neighbors. Symbol k's bump peaks at sample k·SPS + (SPAN−1)/2. */
export function shape(sym: number[]) {
  const out = new Float64Array(sym.length * SPS + SPAN);
  sym.forEach((a, k) => { for (let j = 0; j < SPAN; j++) out[k * SPS + j] += a * PULSE[j]; });
  return out;
}
export function noise(n: number, sigma: number, seed = 9) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Float64Array.from({ length: n }, () => sigma * Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r()));
}
export function matched(x: Float64Array) { // convolve with the pulse (it's symmetric, so no flip needed)
  const out = new Float64Array(x.length + SPAN);
  for (let n = 0; n < x.length; n++) if (x[n]) for (let j = 0; j < SPAN; j++) out[n + j] += x[n] * PULSE[j];
  return out;
}
/** Where symbol k's middle is: in the transmitted samples, and after the matched filter (one more pulse later). */
export const centerTx = (k: number) => k * SPS + (SPAN - 1) / 2;
export const centerMf = (k: number) => k * SPS + (SPAN - 1);
const at = (x: Float64Array, t: number) => { const i = Math.floor(t), f = t - i; return x[i] * (1 - f) + x[i + 1] * f; };

/** SNR at the symbol middles, dB: symbol value² over everything else, sampled at `offset` symbols from the middle. */
export function snrAt(y: Float64Array, sym: number[], center: (k: number) => number, offset = 0) {
  let ps = 0, pe = 0, g = 0, gg = 0;
  for (let k = 8; k < sym.length - 8; k++) { const v = at(y, center(k) + offset * SPS); g += v * sym[k]; gg++; }
  const scale = g / gg; // the symbol's height at this moment
  for (let k = 8; k < sym.length - 8; k++) { const v = at(y, center(k) + offset * SPS); ps += scale * scale; pe += (v - scale * sym[k]) ** 2; }
  return 10 * Math.log10(ps / pe);
}
/** Gardner's timing error, averaged: (previous symbol − this one) × the sample halfway between them. Negative: late. */
export function gardner(y: Float64Array, sym: number[], offset: number) {
  let e = 0, n = 0;
  for (let k = 9; k < sym.length - 8; k++) {
    const t = centerMf(k) + offset * SPS, prev = at(y, t - SPS), cur = at(y, t), mid = at(y, t - SPS / 2);
    e += (prev - cur) * mid; n++;
  }
  return e / n;
}
