// Shared plots for the course chapters.
import { C, line, label } from "./anim.ts";

/** Draw a spectrum in dB across the band, with a MHz axis; optionally label the strongest station. */
export function spectrum(g: CanvasRenderingContext2D, w: number, h: number, sp: Float32Array, center: number, rate: number, mark: boolean | number, top = 26) {
  const n = sp.length, sorted = Array.from(sp).sort((a, b) => a - b), floor = sorted[n >> 1], peak = sorted[n - 1];
  const L = 10, R = w - 10, T = top, B = h - 28, lo = floor - 8, hi = Math.max(peak + 4, floor + 30);
  const px = (i: number) => L + (i / (n - 1)) * (R - L), py = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  g.fillStyle = "rgba(88,196,221,0.12)"; g.beginPath(); g.moveTo(px(0), B);
  sp.forEach((v, i) => g.lineTo(px(i), py(v))); g.lineTo(px(n - 1), B); g.closePath(); g.fill();
  g.strokeStyle = C.blue; g.lineWidth = 1.5; g.beginPath(); sp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
  for (let f = Math.ceil((center - rate / 2) / 1e5) * 1e5; f <= center + rate / 2; f += 1e5) {
    const x = L + ((f - (center - rate / 2)) / rate) * (R - L), major = Math.round(f / 1e5) % 2 === 1;
    line(g, x, B, x, B + (major ? 5 : 3), C.muted, 1);
    if (major && x < R - 48) label(g, (f / 1e6).toFixed(1), x, B + 18, C.muted, "center", 11);
  }
  label(g, "MHz →", R, B + 18, C.muted, "right", 11);
  if (mark === false) return;
  // the dongle's spike: mark it at the top, with a thin guide down to it
  line(g, px(n / 2), T + 4, px(n / 2), py(sp[n / 2]) - 4, C.grid, 1, [3, 3]);
  label(g, "dongle's own spike", px(n / 2), T, C.muted, "center", 11);
  if (typeof mark === "number") { // label the station the reader tuned to
    const i = Math.round(((mark - center) / rate) * n + n / 2);
    let top = i; for (let k = i - 8; k <= i + 8; k++) if (sp[k] > sp[top]) top = k;
    label(g, `${(mark / 1e6).toFixed(1)} (tuned)`, px(i), py(sp[top]) - 8, C.yellow, "center", 13);
    return;
  }
  // strongest station: highest peak away from the dongle's own spike at the center
  let best = -1;
  sp.forEach((v, i) => { if (Math.abs(i - n / 2) > n * 0.04 && (best < 0 || v > sp[best])) best = i; });
  // US FM stations sit on odd tenths of a MHz (88.1, 88.3, …): snap to the nearest one
  const tenths = (center + ((best - n / 2) / n) * rate) / 1e5;
  let k = Math.round(tenths); if (k % 2 === 0) k += tenths > k ? 1 : -1;
  label(g, `${(k / 10).toFixed(1)} FM`, px(best), py(sp[best]) - 8, C.yellow, "center", 13);
}

