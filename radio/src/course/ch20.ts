// Chapter 20: how analog TV worked. A spot scanning a picture, one line of composite video, the vertical interval and
// interlace, color as a spinning arrow on the subcarrier, the comb filter, what fits in a dongle's capture, and a live
// lab: an NTSC transmitter and receiver (src/ntsc.ts) with your picture or webcam, a bandwidth knob and noise.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, TAU, Scene, controls, val, label, line, arrow, circle, dot } from "./anim.ts";
import { FS, LINE, FRAME, ACT0, ACT_N, encodeFrame, channel, decodeFrame, testCard } from "../ntsc.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const us = (samples: number) => (samples / FS) * 1e6;

// a small picture for the scanning scene: a sun over hills
const PIC = (x: number, y: number) => { const sun = Math.hypot(x - 0.7, y - 0.3) < 0.14, hill = y > 0.62 + 0.12 * Math.sin(x * 7); return sun ? [255, 214, 90] : hill ? [70, 150, 80] : [80 + 100 * y, 130 + 80 * y, 220]; };

// --- 1. Scanning ---------------------------------------------------------------------------------------------------------
{
  const ROWS = 30, COLS = 40;
  const s = new Scene(el("s-scan"), (g, w, h, t) => {
    const speed = 2 ** val("sc-v"), inter = checked("sc-i"), size = Math.min(h - 30, (w - 40) * 0.75), cw = (size * 4) / 3 / COLS, ch = size / ROWS, X0 = (w - cw * COLS) / 2, Y0 = 10;
    const total = ROWS * COLS, pos = (t * speed * 40) % total, persist = Math.max(1, 0.35 * total * (speed / 64));
    const order = (k: number) => { const r = Math.floor(k / COLS), c = k % COLS; const row = inter ? (r < ROWS / 2 ? 2 * r : 2 * (r - ROWS / 2) + 1) : r; return [row, c]; };
    for (let k = 0; k < total; k++) {
      const age = (pos - k + total) % total, fade = Math.max(0, 1 - age / persist);
      if (fade <= 0) continue;
      const [r, c] = order(k), [R, G, B] = PIC((c + 0.5) / COLS, (r + 0.5) / ROWS);
      g.fillStyle = `rgba(${R},${G},${B},${fade})`; g.fillRect(X0 + c * cw, Y0 + r * ch, cw, ch - (speed < 8 ? 1 : 0));
    }
    const [r, c] = order(Math.floor(pos)); dot(g, X0 + (c + 0.5) * cw, Y0 + (r + 0.5) * ch, C.white, 4);
    el("r-scan").innerHTML = speed >= 64 ? `Fast enough that your eye holds the whole picture: real TV drew <em class="y">15,734 lines a second</em>.` : `The spot paints ${inter ? "every other line, then goes back for the ones in between" : "one line after another"}. Speed it up.`;
  }, 300, { label: "A bright spot drawing a picture line by line, faster and faster" });
  controls(s, ["sc-v", "sc-i"], () => (el("sc-vo").textContent = `×${2 ** val("sc-v")}`));
}

// The test card, encoded once, for the waveform scenes.
const CW = 320, card = testCard(CW, 480), frame = encodeFrame(card, CW, 480);
const lineOf = (row: number) => { const l = row % 2 ? 285 + (row - 1) / 2 : 22 + row / 2; return frame.subarray((l - 1) * LINE, l * LINE); };

// --- 2. One line ---------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-line"), (g, w, h) => {
    const row = Math.round(val("ln-r")), x = lineOf(row), L = 70, R = w - 24, T = 30, B = h - 40;
    const X = (k: number) => L + (k / LINE) * (R - L), Y = (v: number) => B - ((v + 45) / 180) * (B - T);
    for (const [v, name] of [[-40, "sync −40"], [0, "blank 0"], [7.5, ""], [100, "white 100"]] as const) { line(g, L, Y(v), R, Y(v), "#1f242d", 1); if (name) label(g, name, L - 4, Y(v) + 4, C.muted, "right", 9); }
    const zones: [number, number, string, string][] = [[0, 67, "sync", C.pink], [76, 112, "burst", C.yellow], [ACT0, ACT0 + ACT_N, "picture", C.blue]];
    for (const [a, b, name, col] of zones) { g.fillStyle = col + "22"; g.fillRect(X(a), T - 14, X(b) - X(a), B - T + 14); label(g, name, (X(a) + X(b)) / 2, T - 3, col, "center", 11); }
    g.strokeStyle = C.green; g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k < LINE; k++) (k ? g.lineTo(X(k), Y(x[k])) : g.moveTo(X(k), Y(x[k]))); g.stroke();
    for (const [k, t] of [[0, "0"], [67, "4.7 µs"], [ACT0, "9.4"], [LINE, "63.6 µs"]] as const) label(g, t, X(k), B + 16, C.muted, "center", 10);
    // the picture row itself, under the trace
    for (let px = 0; px < CW; px++) { const o = (row * CW + px) * 4; g.fillStyle = `rgb(${card[o]},${card[o + 1]},${card[o + 2]})`; g.fillRect(X(ACT0 + (px / CW) * ACT_N), B + 22, (X(ACT0 + ACT_N) - X(ACT0)) / CW + 1, 10); }
    el("r-line").innerHTML = `Row ${row}: one line lasts <em>${us(LINE).toFixed(2)} µs</em>, ${us(ACT_N).toFixed(1)} µs of it picture. ${row < 300 ? "The color bars ride on the brightness as a fast wiggle: that's the color subcarrier (section 4)." : row < 375 ? "The gray ramp: brightness rises steadily from black to white, with no color wiggle at all." : "The fine stripes get finer to the right: the fastest the signal has to swing."}`;
  }, 280, { animated: false, label: "One line of composite video: the sync pulse, the color burst, and the picture's brightness" });
  controls(s, ["ln-r"], () => (el("ln-ro").textContent = String(Math.round(val("ln-r")))));
}

// --- 3. The vertical interval: where each field starts ---------------------------------------------------------------------
{
  const s = new Scene(el("s-vsync"), (g, w, h) => {
    const f2 = sel("vs-f") === "2", l0 = f2 ? 261 : 524, lines = 10, L = 10, R = w - 10, rowH = (h - 20) / 2;
    const start = f2 ? (l0 - 1) * LINE : (l0 - 1) * LINE, n = lines * LINE;
    // field 1's vsync is at the frame's start: show the end of the previous frame (lines 524, 525) then 1..8
    const at = (k: number) => frame[(start + k) % FRAME];
    for (let half = 0; half < 2; half++) {
      const y0 = 10 + half * rowH, k0 = (half * n) / 2, k1 = k0 + n / 2, X = (k: number) => L + ((k - k0) / (k1 - k0)) * (R - L), Y = (v: number) => y0 + rowH - 18 - ((v + 40) / 140) * (rowH - 30);
      g.strokeStyle = C.green; g.lineWidth = 1.2; g.beginPath();
      for (let k = k0; k < k1; k += 2) (k > k0 ? g.lineTo(X(k), Y(at(k))) : g.moveTo(X(k), Y(at(k)))); g.stroke();
      for (let l = Math.ceil(k0 / LINE); l * LINE < k1; l++) { const ln = ((l0 - 1 + l) % 525) + 1; line(g, X(l * LINE), y0 + 4, X(l * LINE), y0 + rowH - 14, "#2a2f3a", 1); label(g, `line ${ln}`, X(l * LINE) + 3, y0 + 12, C.muted, "left", 9); }
    }
    el("r-vsync").innerHTML = f2 ? `Field 2: the broad pulses start <em class="y">halfway through line 263</em>. That half line shifts every line of this field down by half a line's height: it lands between field 1's lines.` : `Field 1: the broad pulses (long dips to sync level, every half line) start <em class="y">exactly at line 1</em>. The receiver sees a long dip and knows: a new field, start at the top.`;
  }, 260, { animated: false, label: "The vertical sync: broad pulses that mark the start of each field" });
  controls(s, ["vs-f"]);
  el("vs-f").addEventListener("change", () => s.redraw());
}

// --- 4. Color on a spinning arrow ------------------------------------------------------------------------------------------
{
  const handle = { x: 0.3, y: 0.35, color: C.white };
  const plane = (w: number, h: number) => ({ cx: Math.min(150, w * 0.22), cy: h / 2, unit: Math.min(110, h * 0.4) });
  const toRGB = (y: number, u: number, v: number) => { const r = y + v / 0.877, b = y + u / 0.492, gg = (y - 0.299 * r - 0.114 * b) / 0.587; return [r, gg, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)); };
  const s = new Scene(el("s-color"), (g, w, h, t) => {
    const p = plane(w, h), Yl = val("cl-y"), u = handle.x * 0.45, v = handle.y * 0.45, [r, gg, b] = toRGB(Yl, u, v);
    // the hue wheel under the plane
    for (let a = 0; a < 360; a += 6) { const rad = (a * Math.PI) / 180, [rr, g2, bb] = toRGB(0.5, 0.45 * Math.cos(rad), 0.45 * Math.sin(rad)); g.strokeStyle = `rgb(${rr},${g2},${bb})`; g.lineWidth = 8; g.beginPath(); g.arc(p.cx, p.cy, p.unit + 8, -rad - 0.06, -rad + 0.06); g.stroke(); }
    circle(g, p.cx, p.cy, p.unit, "#3a4252", 1);
    line(g, p.cx - p.unit, p.cy, p.cx + p.unit, p.cy, C.axis, 1); line(g, p.cx, p.cy - p.unit, p.cx, p.cy + p.unit, C.axis, 1);
    label(g, "B−Y", p.cx + p.unit + 14, p.cy + 4, C.muted, "left", 10); label(g, "R−Y", p.cx + 4, p.cy - p.unit - 14, C.muted, "left", 10);
    arrow(g, p.cx, p.cy, p.cx - p.unit * 0.45, p.cy, C.yellow, 2); label(g, "burst", p.cx - p.unit * 0.45, p.cy + 16, C.yellow, "center", 10);
    arrow(g, p.cx, p.cy, p.cx + handle.x * p.unit, p.cy - handle.y * p.unit, C.blue, 3);
    // the swatch and the signal: brightness plus the arrow's shadow, spinning at 3.58 MHz
    const sx = p.cx + p.unit + 50; g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(sx, 20, 60, 60); label(g, "this color", sx, 96, C.muted, "left", 10);
    const L = sx + 80, R = w - 10, mid = h / 2 + 30, sc = 70, amp = Math.hypot(u, v), ph = Math.atan2(v, u);
    line(g, L, mid - (0.075 + 0.925 * Yl) * sc, R, mid - (0.075 + 0.925 * Yl) * sc, C.muted, 1, [4, 4]);
    g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= R - L; i++) { const th = (i / 22) * TAU + t * 3, y = 0.075 + 0.925 * (Yl + amp * Math.sin(th + ph)); i ? g.lineTo(L + i, mid - y * sc) : g.moveTo(L, mid - y * sc); }
    g.stroke(); label(g, "brightness (dashed) + color wiggle", L, mid + 30, C.muted, "left", 10);
    const hue = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
    el("r-color").innerHTML = `Angle <em class="b">${hue.toFixed(0)}°</em> from the B−Y axis is the hue; length <em class="b">${(amp / 0.45).toFixed(2)}</em> is the saturation. ${amp < 0.03 ? "No arrow, no color: gray." : "A TV measures the angle against the burst, which is always sent at 180°."}`;
  }, 280, { handles: [handle], plane, max: 1, onDrag: () => {}, label: "A color as an arrow: its angle is the hue and its length the saturation, carried by a 3.58 MHz wave" });
  controls(s, ["cl-y"]);
}

// --- 5. The comb filter -------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-comb"), (g, w, h) => {
    const row = 60, a = lineOf(row), b = lineOf(row - 2), k0 = ACT0 + 200, k1 = k0 + 120, L = 60, R = w - 10, rowH = (h - 10) / 4;
    const tr = (i: number, name: string, f: (k: number) => number, col: string) => {
      const y0 = 8 + i * rowH, Y = (v: number) => y0 + rowH / 2 - (v - 50) * (rowH / 160);
      label(g, name, 6, y0 + rowH / 2 + 4, col, "left", 10);
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); for (let k = k0; k <= k1; k++) { const x = L + ((k - k0) / (k1 - k0)) * (R - L); k > k0 ? g.lineTo(x, Y(f(k))) : g.moveTo(x, Y(f(k))); } g.stroke();
    };
    tr(0, "this line", (k) => a[k], C.green); tr(1, "line above", (k) => b[k], C.blue);
    tr(2, "sum ÷ 2", (k) => (a[k] + b[k]) / 2, C.white); tr(3, "diff ÷ 2", (k) => 50 + (a[k] - b[k]) / 2, C.yellow);
    el("r-comb").innerHTML = `Each line holds <em>227.5</em> subcarrier cycles, so the wiggle comes back upside down on the next line. Add two lines: the color cancels, <em>brightness</em> stays. Subtract: brightness cancels, <em class="y">color</em> stays.`;
  }, 280, { animated: false, label: "Two neighboring lines, their sum (brightness) and difference (color)" });
}

// --- 6. What fits in the dongle's capture ---------------------------------------------------------------------------------
{
  const s = new Scene(el("s-rf"), (g, w, h) => {
    const cap = parseFloat(sel("rf-w")), at = val("rf-c"), L = 20, R = w - 20, B = h - 40, T = 30, X = (f: number) => L + ((f + 0.5) / 7) * (R - L);
    // a 6 MHz channel, with frequencies relative to its bottom edge: video carrier +1.25, color +4.83, sound +5.75
    g.fillStyle = "rgba(88,196,221,0.18)"; g.beginPath(); g.moveTo(X(0.5), B); g.lineTo(X(1.0), B - 40); g.lineTo(X(1.25), T); g.lineTo(X(1.5), B - 70); g.lineTo(X(5.45), B - 60); g.lineTo(X(5.5), B); g.closePath(); g.fill();
    line(g, X(1.25), B, X(1.25), T - 6, C.blue, 3); label(g, "picture carrier", X(1.25), T - 10, C.blue, "center", 10);
    line(g, X(4.83), B, X(4.83), B - 90, C.pink, 3); label(g, "color 3.58 MHz up", X(4.83), B - 96, C.pink, "center", 10);
    line(g, X(5.75), B, X(5.75), B - 70, C.green, 3); label(g, "sound (FM)", X(5.75), B - 76, C.green, "center", 10);
    line(g, X(0), B, X(6), B, C.axis, 1); for (let f = 0; f <= 6; f++) label(g, `${f}`, X(f), B + 16, C.muted, "center", 10); label(g, "MHz above the channel's edge", X(3), B + 32, C.muted, "center", 10);
    const lo = at - cap / 2, hi = at + cap / 2; g.strokeStyle = C.yellow; g.lineWidth = 2; g.strokeRect(X(lo), T + 18, X(hi) - X(lo), B - T - 18);
    label(g, `dongle: ${cap} MHz`, X(lo) + 4, T + 32, C.yellow, "left", 11);
    const has = (f: number) => f >= lo && f <= hi, video = Math.max(0, hi - 1.25);
    el("r-rf").innerHTML = `${has(1.25) ? `Picture carrier inside: <em class="b">${video.toFixed(1)} MHz</em> of the picture's detail fits (the full signal needs 4.2).` : `<em>No picture carrier</em>: nothing to decode.`} ${has(4.83) && has(1.25) ? "Color fits." : "<em>Color's subcarrier is outside: black and white.</em>"} ${has(5.75) ? "Sound fits." : "Sound is outside."}`;
  }, 230, { animated: false, label: "An analog TV channel's spectrum and the part a dongle can capture" });
  controls(s, ["rf-c"]); el("rf-w").addEventListener("change", () => s.redraw());
}

// --- Lab: transmitter → channel → receiver ---------------------------------------------------------------------------------
{
  const W = 400, H = 480, out = el("lab-out") as HTMLCanvasElement, src = el("lab-src") as HTMLCanvasElement, wave = el("lab-wave") as HTMLCanvasElement;
  out.width = W; out.height = H; src.width = W; src.height = H;
  const og = out.getContext("2d")!, sg = src.getContext("2d", { willReadFrequently: true })!;
  let video: HTMLVideoElement | null = null, img: HTMLImageElement | null = null, frameNo = 0, prev: Float32Array = new Float32Array(FRAME), busy = false;
  const stopCam = () => { (video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); video = null; };
  const draw = () => {
    if (video) sg.drawImage(video, 0, 0, W, H);
    else if (img) { sg.fillStyle = "#000"; sg.fillRect(0, 0, W, H); const k = Math.max(W / img.width, H / img.height); sg.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); }
    else sg.putImageData(new ImageData(testCard(W, H), W, H), 0, 0);
  };
  const run = () => {
    if (busy) return; busy = true;
    const t0 = performance.now(); draw();
    const rgba = sg.getImageData(0, 0, W, H).data, n0 = frameNo * FRAME, f = encodeFrame(rgba, W, H, { color: checked("lab-color"), n0 });
    const stream = new Float32Array(2 * LINE + FRAME); stream.set(prev.subarray(FRAME - 2 * LINE)); stream.set(f, 2 * LINE); prev = f;
    const bw = parseFloat(sel("lab-bw")) * 1e6, rx = channel(stream, bw, val("lab-n"), frameNo + 1), d = decodeFrame(rx, W, { n0: n0 - 2 * LINE });
    og.putImageData(new ImageData(d.rgba, W, H), 0, 0);
    // a waveform monitor of one line (the middle of the picture), as received
    const wg = wave.getContext("2d")!, ww = (wave.width = wave.clientWidth * devicePixelRatio), wh = (wave.height = 120 * devicePixelRatio), off = 2 * LINE + (22 + 120 - 1) * LINE;
    wg.fillStyle = C.stage; wg.fillRect(0, 0, ww, wh); wg.strokeStyle = C.green; wg.lineWidth = devicePixelRatio; wg.beginPath();
    for (let k = 0; k < LINE; k++) { const x = (k / LINE) * ww, y = wh - ((rx[off + k] + 45) / 180) * wh; k ? wg.lineTo(x, y) : wg.moveTo(x, y); } wg.stroke();
    el("lab-r").innerHTML = `fields ${d.fields.join(" + ") || "none found"} · burst ${d.burst.toFixed(1)} IRE → <em class="${d.color ? "g" : "y"}">${d.color ? "color" : "black and white (color killer)"}</em> · sync jitter ${d.lineJitter.toFixed(2)} samples · ${(performance.now() - t0).toFixed(0)} ms a frame here (real TV: 33 ms)`;
    frameNo++; busy = false;
  };
  let timer = 0;
  const loop = () => { clearTimeout(timer); run(); if (video || checked("lab-run")) timer = window.setTimeout(loop, 60); };
  el("lab-pick").addEventListener("change", () => {
    const k = sel("lab-pick"); stopCam(); img = null;
    if (k === "cam") navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }).then((s) => { video = document.createElement("video"); video.srcObject = s; video.muted = true; video.play(); video.onplaying = loop; }).catch((e) => (el("lab-r").textContent = `no camera: ${(e as Error).message}`));
    else if (k === "file") (el("lab-file") as HTMLInputElement).click();
    else loop();
  });
  el("lab-file").addEventListener("change", () => { const fl = (el("lab-file") as HTMLInputElement).files?.[0]; if (!fl) return; img = new Image(); img.onload = loop; img.src = URL.createObjectURL(fl); });
  for (const id of ["lab-bw", "lab-n", "lab-color", "lab-run"]) el(id).addEventListener("input", loop);
  el("lab-no").textContent = String(val("lab-n"));
  el("lab-n").addEventListener("input", () => (el("lab-no").textContent = String(val("lab-n"))));
  loop();
}

(window as unknown as { blipContext: () => unknown }).blipContext = () => ({ page: "Radio course chapter 20: analog TV (NTSC): scanning, a line of composite video, vertical sync and interlace, color subcarrier as a spinning arrow, comb filter, what fits in a dongle, and a live NTSC transmitter/receiver lab", labBandwidthMHz: sel("lab-bw"), labNoise: val("lab-n") });
