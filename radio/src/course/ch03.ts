// Chapter 3: taking snapshots. Sampling, aliasing, Nyquist, and 8-bit measurements.
import "./course.css";
import { C, TAU, Scene, controls, val, arrow, circle, dot, line, label } from "./anim.ts";
import { captureBytes, CAPTURE } from "./data/capture.ts";
import { lab } from "./lab.ts";

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Wrap a number of turns to the "short way round": (−0.5, 0.5]. */
const wrap = (turns: number) => turns - Math.round(turns);

/** A wheel with one painted spoke at `turns` (counter-clockwise, in turns). */
function wheel(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, turns: number, color = C.blue, alpha = 1) {
  g.globalAlpha = alpha;
  const a = turns * TAU;
  arrow(g, cx, cy, cx + R * Math.cos(a), cy - R * Math.sin(a), color, 3);
  g.globalAlpha = 1;
}

// --- Hook: the wagon wheel ------------------------------------------------------------------
{
  const CAM = 4, CYCLE = 24, TOP = 6; // 4 photos per second; speed ramps 0 → 6 turns/s over 24 s
  const speed = (τ: number) => (TOP * τ) / CYCLE;
  const turnsAt = (τ: number) => (TOP * τ * τ) / (2 * CYCLE); // running total of the speed
  new Scene(el("s-hook"), (g, w, h, t) => {
    const τ = still ? 15.5 : t % CYCLE;
    const R = Math.min(h * 0.32, w * 0.16), cy = h * 0.46, lx = w * 0.25, rx = w * 0.75;
    for (const x of [lx, rx]) { circle(g, x, cy, R + 6, C.grid, 2); dot(g, x, cy, C.grid, 4); }
    wheel(g, lx, cy, R, turnsAt(τ));
    const k = Math.floor(τ * CAM);
    for (let back = 4; back >= 0; back--) { // the last few photos, fading
      if (k - back < 0) continue;
      wheel(g, rx, cy, R, turnsAt((k - back) / CAM), back ? C.muted : C.yellow, back ? 0.5 - back * 0.1 : 1);
    }
    const real = speed(τ), seen = wrap(real / CAM) * CAM;
    label(g, "what's really happening", lx, h - 34, C.text, "center");
    label(g, `${real.toFixed(1)} turns/s`, lx, h - 14, C.blue, "center");
    label(g, "through a camera: 4 photos/s", rx, h - 34, C.text, "center");
    label(g, Math.abs(seen) < 0.15 ? "looks frozen" : `looks like ${Math.abs(seen).toFixed(1)} turns/s ${seen > 0 ? "↺" : "↻ backwards"}`, rx, h - 14, C.yellow, "center");
  }, 300, { label: "A wheel speeding up, next to the same wheel as seen by a camera taking 4 photos per second" });
}

// --- 1. A film strip: photos can't tell the long way from the short way ----------------------
{
  const FRAMES = 8;
  const s = new Scene(el("s-strip"), (g, w, h) => {
    const r = val("st-r"), cell = (w - 16) / FRAMES, R = Math.min(cell * 0.36, h * 0.2), cy = 26 + R;
    for (let k = 0; k < FRAMES; k++) {
      const cx = 8 + cell * (k + 0.5);
      g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(8 + cell * k + 2, 8, cell - 4, 2 * R + 36);
      circle(g, cx, cy, R, "#2c3442", 1);
      wheel(g, cx, cy, R * 0.9, r * k, C.yellow);
      label(g, `photo ${k}`, cx, 2 * R + 38, C.muted, "center", 11);
    }
    // below: one wheel with every photo's position numbered, and the "short way" between them
    const R2 = Math.min(h - (2 * R + 70), w * 0.3) / 2 - 8, cx2 = w / 2, cy2 = 2 * R + 60 + R2 + 10;
    circle(g, cx2, cy2, R2, C.grid, 1.5);
    const seen = wrap(r);
    for (let k = 0; k < FRAMES; k++) {
      const a = r * k * TAU, x = cx2 + R2 * Math.cos(a), y = cy2 - R2 * Math.sin(a);
      dot(g, x, y, k === 0 ? C.white : C.yellow, 5);
      label(g, String(k), cx2 + (R2 + 16) * Math.cos(a), cy2 - (R2 + 16) * Math.sin(a) + 4, C.text, "center", 12);
    }
    // the apparent motion: a short arc from photo 0 to photo 1
    if (Math.abs(seen) > 0.01) {
      g.strokeStyle = C.pink; g.lineWidth = 3; g.beginPath();
      g.arc(cx2, cy2, R2 * 0.75, 0, -seen * TAU, seen > 0); g.stroke();
    }
    label(g, "pink: how the photos seem to move from 0 to 1", 12, h - 10, C.pink, "left", 12);
  }, 380, { animated: false, label: "Eight photos of a spinning arrow, and where each photo caught it on the wheel" });
  controls(s, ["st-r"], () => {
    const r = val("st-r"), seen = wrap(r);
    el("st-ro").textContent = `${r.toFixed(2)} turns`;
    el("r-strip").innerHTML = `Really turns <em class="b">${r.toFixed(2)}</em> between photos. The photos look like <em class="p">${Math.abs(seen) < 0.005 ? "no movement at all" : `${Math.abs(seen).toFixed(2)} turns ${seen > 0 ? "forward ↺" : "backward ↻"}`}</em>.`;
  });
}

// --- 2. The folding graph: Nyquist, seen -------------------------------------------------------
{
  const s = new Scene(el("s-fold"), (g, w, h) => {
    const x = val("fo-x"), one = (el("fo-one") as HTMLInputElement).checked;
    const L = 46, Rm = 16, T = 18, B = h - 40, X0 = -1.5, X1 = 1.5;
    const px = (v: number) => L + ((v - X0) / (X1 - X0)) * (w - L - Rm);
    const py = (v: number) => T + ((0.55 - v) / 1.1) * (B - T);
    // the zone that comes through honestly
    g.fillStyle = "rgba(131,193,103,0.12)";
    g.fillRect(px(one ? 0 : -0.5), T, px(0.5) - px(one ? 0 : -0.5), B - T);
    line(g, L, py(0), w - Rm, py(0), C.axis, 1); line(g, px(0), T, px(0), B, C.axis, 1);
    for (const v of [-1.5, -1, -0.5, 0.5, 1, 1.5]) label(g, String(v), px(v), B + 16, C.muted, "center", 11);
    label(g, "real speed (turns per photo) →", w - Rm, B + 32, C.muted, "right", 12);
    label(g, "+0.5", L - 6, py(0.5) + 4, C.muted, "right", 11); label(g, "−0.5", L - 6, py(-0.5) + 4, C.muted, "right", 11);
    label(g, "how it looks", 6, T + 4, C.muted, "left", 11);
    // the curve
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    let prev = NaN;
    for (let i = 0; i <= 900; i++) {
      const v = X0 + ((X1 - X0) * i) / 900, a = one ? Math.abs(wrap(v)) : wrap(v);
      if (!one && Math.abs(a - prev) > 0.5) g.moveTo(px(v), py(a)); else if (i) g.lineTo(px(v), py(a)); else g.moveTo(px(v), py(a));
      prev = a;
    }
    g.stroke();
    const a = one ? Math.abs(wrap(x)) : wrap(x);
    line(g, px(x), B, px(x), py(a), C.blue, 1.5, [4, 4]); line(g, px(x), py(a), L, py(a), C.pink, 1.5, [4, 4]);
    dot(g, px(x), py(a), C.white, 6);
  }, 320, { animated: false, label: "Graph: real speed against how it looks in the photos" });
  controls(s, ["fo-x", "fo-one"], () => {
    const x = val("fo-x"), one = (el("fo-one") as HTMLInputElement).checked, a = one ? Math.abs(wrap(x)) : wrap(x);
    el("fo-xo").textContent = `${x.toFixed(2)}`;
    const honest = one ? x >= 0 && x <= 0.5 : x > -0.5 && x <= 0.5;
    el("r-fold").innerHTML = `Real: <em class="b">${x.toFixed(2)}</em> turns per photo → looks like <em class="p">${a.toFixed(2)}</em>. ` +
      (honest ? "Inside the green zone, the photos tell the truth." : "Outside the green zone: a different speed is pretending to be this one.");
  });
}

// --- 3. Game: freeze the wheel --------------------------------------------------------------------
{
  let secret = 0, frozen = false, wins = 0;
  const newWheel = () => { secret = 1.5 + Math.random() * 2.5; frozen = false; el("r-freeze").textContent = "Slide the camera speed until the wheel in the photos stands still."; };
  const s = new Scene(el("s-freeze"), (g, w, h, t) => {
    const cam = val("fz-c"), R = Math.min(h * 0.36, w * 0.18), cy = h / 2;
    const lx = w * 0.28, rx = w * 0.72;
    for (const x of [lx, rx]) circle(g, x, cy, R + 6, C.grid, 2);
    // left: the real wheel is hidden in a blur (it's too fast to follow), right: the photos
    g.fillStyle = "rgba(88,196,221,0.10)"; g.beginPath(); g.arc(lx, cy, R, 0, TAU); g.fill();
    label(g, "spinning (too fast to follow)", lx, cy + R + 28, C.muted, "center", 12);
    const k = Math.floor(t * cam);
    for (let back = 4; back >= 0; back--) {
      if (k - back < 0) continue;
      const turns = (secret * (k - back)) / cam;
      wheel(g, rx, cy, R, turns, back ? C.muted : C.yellow, back ? 0.5 - back * 0.1 : 1);
    }
    label(g, `camera: ${cam.toFixed(2)} photos/s`, rx, cy + R + 28, C.yellow, "center", 12);
    const ratio = secret / cam, off = Math.abs(ratio - Math.round(ratio));
    if (!frozen && Math.round(ratio) >= 1 && off < 0.012) {
      frozen = true; wins++;
      el("r-freeze").textContent = `Frozen! The wheel spins ${secret.toFixed(2)} turns/s, so between your photos it makes exactly ${Math.round(ratio)} whole turn${Math.round(ratio) > 1 ? "s" : ""} and every photo looks the same. Mechanics use this trick (a "timing light") to see spinning engine parts stand still.`;
      el("fz-score").textContent = `${wins} frozen`;
    }
  }, 280, { label: "Game: adjust the camera speed until a spinning wheel looks frozen in the photos" });
  controls(s, ["fz-c"], () => { el("fz-co").textContent = `${val("fz-c").toFixed(2)}/s`; });
  el("fz-new").addEventListener("click", () => { newWheel(); s.redraw(); });
  newWheel();
}

// --- 4. A ruler with 256 marks: 8-bit measurements -------------------------------------------------
{
  const s = new Scene(el("s-bits"), (g, w, h) => {
    const bits = val("bi-b"), amp = val("bi-a"), levels = 2 ** bits, step = 2 / (levels - 1);
    const L = 14, top = 14, mid = h * 0.36, half = h * 0.28;
    const py = (v: number) => mid - v * half;
    // full scale band and the measuring marks
    g.fillStyle = "rgba(252,98,85,0.08)"; g.fillRect(L, top, w - 2 * L, py(1) - top); g.fillRect(L, py(-1), w - 2 * L, py(-1.3) - py(-1));
    if (levels <= 64) for (let i = 0; i < levels; i++) line(g, L, py(-1 + i * step), w - L, py(-1 + i * step), "#262c36", 1);
    line(g, L, py(1), w - L, py(1), C.red, 1, [5, 4]); line(g, L, py(-1), w - L, py(-1), C.red, 1, [5, 4]);
    const n = 120, q = (v: number) => Math.max(-1, Math.min(1, Math.round((v + 1) / step) * step - 1));
    const sig = (i: number) => amp * Math.sin((TAU * 2.3 * i) / n) + 0.25 * amp * Math.sin((TAU * 11 * i) / n);
    // the true signal, and what the 8-bit-style ruler records
    g.strokeStyle = C.blue; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 600; i++) { const v = sig((i / 600) * n), x = L + ((w - 2 * L) * i) / 600; i ? g.lineTo(x, py(v)) : g.moveTo(x, py(v)); }
    g.stroke();
    for (let i = 0; i < n; i++) dot(g, L + ((w - 2 * L) * (i + 0.5)) / n, py(q(sig(i + 0.5))), C.yellow, 2.6);
    // the error: what the ruler got wrong, magnified 5×
    const ey = h * 0.82;
    line(g, L, ey, w - L, ey, C.grid, 1);
    g.strokeStyle = C.pink; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < n; i++) { const x = L + ((w - 2 * L) * (i + 0.5)) / n, e = q(sig(i + 0.5)) - sig(i + 0.5); i ? g.lineTo(x, ey - e * half * 5) : g.moveTo(x, ey - e * half * 5); }
    g.stroke();
    label(g, "error (× 5)", L + 4, h - 8, C.pink, "left", 12);
    label(g, "clipping zone", w - L - 4, top + 12, C.red, "right", 11);
  }, 340, { animated: false, label: "A wave measured with a ruler that has a limited number of marks, and the measuring error" });
  controls(s, ["bi-b", "bi-a"], () => {
    const bits = val("bi-b"), amp = val("bi-a");
    el("bi-bo").textContent = `${bits} bit${bits > 1 ? "s" : ""} (${2 ** bits} marks)`;
    el("bi-ao").textContent = `${Math.round(amp * 100)}% of full scale`;
    // measure the signal-to-error ratio of a long sine at this setting
    const levels = 2 ** bits, step = 2 / (levels - 1); let ps = 0, pe = 0;
    for (let i = 0; i < 20000; i++) {
      const v = amp * Math.sin(i * 0.0123), r = Math.max(-1, Math.min(1, Math.round((v + 1) / step) * step - 1));
      ps += v * v; pe += (r - v) ** 2;
    }
    const snr = 10 * Math.log10(ps / pe);
    el("r-bits").innerHTML = `Signal is <em class="y">${snr.toFixed(0)} dB</em> stronger than the measuring error` +
      (amp > 1 ? ' · <em style="color:var(--red)">clipping: the tops are cut off</em>' : amp < 4 * step ? " · the signal barely spans a few marks" : "");
  });
}

// --- 5. Real samples from the dongle on the Mac mini -------------------------------------------------
{
  const bytes = captureBytes();
  // zoom on the ring itself (where the dots are dense), straight to the right of the center
  const radii = []; for (let i = 0; i < bytes.length; i += 2) radii.push(Math.hypot(bytes[i] - 127.5, bytes[i + 1] - 127.5));
  radii.sort((a, b) => a - b);
  const zr = Math.round(radii[radii.length >> 1]), Z = 7; // zoom window: ±7 marks around (zr, 0)
  new Scene(el("s-real"), (g, w, h) => {
    const side = Math.min(h - 30, w * 0.5), cx = side / 2 + 10, cy = (h - 14) / 2, sc = side / 2 / 128;
    g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(cx - 128 * sc, cy - 128 * sc, 256 * sc, 256 * sc);
    line(g, cx - 128 * sc, cy, cx + 128 * sc, cy, C.axis, 1); line(g, cx, cy - 128 * sc, cx, cy + 128 * sc, C.axis, 1);
    g.fillStyle = C.blue;
    for (let i = 0; i < bytes.length; i += 2) g.fillRect(cx + (bytes[i] - 127.5) * sc - 1, cy - (bytes[i + 1] - 127.5) * sc - 1, 2, 2);
    g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.strokeRect(cx + (zr - Z) * sc, cy - Z * sc, 2 * Z * sc, 2 * Z * sc);
    label(g, "all 4000 samples", cx, h - 4, C.muted, "center", 12);
    // right: the zoomed window, with the ruler's marks drawn as faint lines
    const zx = side + 40, zw = w - zx - 12, zs = Math.min(zw, h - 40) / (2 * Z), zcx = zx + zw / 2, zcy = (h - 14) / 2;
    for (let m = -Z; m <= Z; m++) {
      line(g, zcx + (m - 0.5) * zs, zcy - Z * zs, zcx + (m - 0.5) * zs, zcy + Z * zs, "#1e232c", 1);
      line(g, zcx - Z * zs, zcy + (m - 0.5) * zs, zcx + Z * zs, zcy + (m - 0.5) * zs, "#1e232c", 1);
    }
    g.strokeStyle = C.yellow; g.strokeRect(zcx - Z * zs, zcy - Z * zs, 2 * Z * zs, 2 * Z * zs);
    g.fillStyle = C.yellow;
    for (let i = 0; i < bytes.length; i += 2) {
      const dx = bytes[i] - 127.5 - zr, dy = bytes[i + 1] - 127.5;
      if (Math.abs(dx) < Z && Math.abs(dy) < Z) { g.beginPath(); g.arc(zcx + dx * zs, zcy - dy * zs, 3, 0, TAU); g.fill(); }
    }
    label(g, "zoomed into the yellow box", zcx, h - 4, C.yellow, "center", 12);
  }, 360, { animated: false, label: "4000 real samples from the dongle form a fuzzy ring; a zoomed view shows they sit on a grid" });
  let lo = 255, hi = 0; for (const b of bytes) { lo = Math.min(lo, b); hi = Math.max(hi, b); }
  el("r-real").innerHTML = `${bytes.length / 2} real samples (${(bytes.length / 2 / CAPTURE.rate * 1000).toFixed(1)} ms of radio), recorded at ${CAPTURE.center / 1e6} MHz. ` +
    `Bytes range from <em class="y">${lo}</em> to <em class="y">${hi}</em>: this gain setting uses ${hi - lo + 1} of the 256 marks.`;
}

// --- Lab: the same picture, live from a real dongle ------------------------------------------------------
{
  let live: Uint8Array | null = null;
  const s = new Scene(el("s-lab"), (g, w, h) => {
    const side = Math.min(h - 20, w * 0.45), cx = side / 2 + 10, cy = h / 2, sc = side / 2 / 128;
    g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(cx - 128 * sc, cy - 128 * sc, 256 * sc, 256 * sc);
    line(g, cx - 128 * sc, cy, cx + 128 * sc, cy, C.axis, 1); line(g, cx, cy - 128 * sc, cx, cy + 128 * sc, C.axis, 1);
    const hx = side + 40, hw = w - hx - 12, hb = h - 34;
    line(g, hx, hb, hx + hw, hb, C.axis, 1);
    label(g, "0", hx, hb + 14, C.muted, "left", 11); label(g, "byte value", hx + hw / 2, hb + 14, C.muted, "center", 11); label(g, "255", hx + hw, hb + 14, C.muted, "right", 11);
    if (!live) { label(g, "connect a dongle below to see live samples", w / 2, 24, C.muted, "center", 13); return; }
    g.fillStyle = C.blue;
    const n = Math.min(live.length, 8000);
    for (let i = 0; i < n; i += 2) g.fillRect(cx + (live[i] - 127.5) * sc - 1, cy - (live[i + 1] - 127.5) * sc - 1, 2, 2);
    const hist = new Uint32Array(256); for (const b of live) hist[b]++;
    const max = Math.max(...hist);
    for (let v = 0; v < 256; v++) {
      if (!hist[v]) continue;
      const bh = (hist[v] / max) * (hb - 16);
      g.fillStyle = v === 0 || v === 255 ? C.red : C.yellow;
      g.fillRect(hx + (v / 256) * hw, hb - bh, Math.max(1, hw / 256), bh);
    }
  }, 300, { animated: false, label: "Live samples from a dongle as dots, and a histogram of their byte values" });
  lab(el("lab3"), {
    freqMHz: 98.7,
    onSamples: (cu8) => {
      live = cu8; s.redraw();
      let lo = 255, hi = 0, clip = 0;
      for (const b of cu8) { if (b < lo) lo = b; if (b > hi) hi = b; if (b === 0 || b === 255) clip++; }
      el("r-lab").innerHTML = `Using <em class="y">${hi - lo + 1}</em> of the 256 marks (bytes ${lo}–${hi})` +
        ` · clipped: <em style="color:var(--red)">${((100 * clip) / cu8.length).toFixed(2)}%</em>`;
    },
  });
}
