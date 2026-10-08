// From raw dongle bytes to a scrolling waterfall image.
import { powerSpectrum } from "./dsp.ts";

/** Bytes (I, Q, I, Q…, 127.5 = zero) → an averaged spectrum in dB, `n` bins wide, lowest frequency first. */
export function spectrumOf(cu8: Uint8Array, n = 512, maxBlocks = 16): Float32Array {
  const iq = new Float32Array(Math.min(cu8.length, 2 * n * maxBlocks));
  for (let i = 0; i < iq.length; i++) iq[i] = (cu8[i] - 127.5) / 127.5; // bytes → numbers
  return spectrumOfIQ(iq, n, maxBlocks);
}

/** Numbers (I, Q, I, Q…) → averaged spectrum in dB: window + FFT per block, averaged as power (not dB). */
export function spectrumOfIQ(iq: Float32Array, n = 512, maxBlocks = 16): Float32Array {
  const blocks = Math.max(1, Math.min(maxBlocks, Math.floor(iq.length / 2 / n)));
  const acc = new Float32Array(n);
  for (let b = 0; b < blocks; b++) {
    const db = powerSpectrum(iq, b * n, n); // window → FFT → power in dB
    for (let i = 0; i < n; i++) acc[i] += 10 ** (db[i] / 10) / blocks;
  }
  return acc.map((p) => 10 * Math.log10(p + 1e-20));
}

/** The color scale: 0 (quiet) → black, blue, magenta, yellow → 1 (loud). */
export function heat(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  return [
    Math.round(255 * Math.min(1, t * 2)),
    Math.round(255 * Math.max(0, t * 2 - 1)),
    Math.round(255 * Math.min(1, t * 3) * (1 - Math.max(0, t * 2 - 1))),
  ];
}

/** A waterfall: each pushed spectrum becomes one row of pixels, newest on top. */
export class Waterfall {
  readonly image: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private floor = NaN;

  constructor(width: number, height = 200) {
    this.image = new OffscreenCanvas(width, height);
    this.ctx = this.image.getContext("2d")!;
  }

  /** Add one spectrum (dB per bin). `range`: how many dB above the noise floor count as "full brightness". */
  push(db: Float32Array, range = 35) {
    // 1. The noise floor: the median bin. Stations occupy a minority of the bins, so the middle value
    //    of the sorted row is noise. Smooth it over time so the colors don't flicker.
    const median = Array.from(db).sort((a, b) => a - b)[db.length >> 1];
    this.floor = Number.isNaN(this.floor) ? median : 0.9 * this.floor + 0.1 * median;
    // 2. One row of pixels: each bin's height above the floor, as a color.
    const row = new ImageData(db.length, 1);
    for (let i = 0; i < db.length; i++) {
      const [r, g, b] = heat((db[i] - this.floor) / range);
      row.data.set([r, g, b, 255], 4 * i);
    }
    // 3. Scroll: copy the whole image one pixel down onto itself, then paint the new row on top.
    this.ctx.drawImage(this.image, 0, 1);
    this.ctx.putImageData(row, 0, 0);
  }

  /** Paint onto a visible canvas, stretched to fit; no smoothing, so each bin stays a crisp column. */
  draw(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    g.imageSmoothingEnabled = false;
    g.drawImage(this.image, x, y, w, h);
  }
}
