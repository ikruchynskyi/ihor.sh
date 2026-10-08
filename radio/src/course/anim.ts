// A tiny animation toolkit for the course: scenes with play/pause/scrub, drawn on canvas.
// Scenes always use the same dark "stage" and colors, so a color means the same thing everywhere:
// blue = the spinning arrow, yellow = its height (sine), green = its sideways position (cosine).

export const C = {
  stage: "#14171d", grid: "#2a2f3a", axis: "#4a5262", text: "#d7dde5", muted: "#8a93a3",
  blue: "#58c4dd", yellow: "#f4d35e", green: "#83c167", red: "#fc6255", pink: "#e07a9f", white: "#ece6e2",
};
export const TAU = 2 * Math.PI;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** A flat "arrow plane": where 0 is on the canvas, and how many pixels one unit is. */
export interface Plane { cx: number; cy: number; unit: number }
export const toPx = (p: Plane, x: number, y: number): [number, number] => [p.cx + x * p.unit, p.cy - y * p.unit];
export const toWorld = (p: Plane, px: number, py: number): [number, number] => [(px - p.cx) / p.unit, (p.cy - py) / p.unit];

/** A point the reader can drag (mouse, touch, or arrow keys after tabbing to the canvas). */
export interface Handle { x: number; y: number; color: string }

export interface SceneOpts {
  animated?: boolean; // false: no play/pause bar, redraw only on input
  handles?: Handle[];
  plane?: (w: number, h: number) => Plane; // required with handles
  onDrag?: () => void;
  max?: number; // keep handles within this distance of 0
  label?: string; // accessible description of the canvas
  step?: number; // how far an arrow key moves a handle (world units; default 0.05)
}

/** A canvas that animates over time t (seconds), with play/pause and restart underneath. */
export class Scene {
  t = 0;
  playing = !reduced;
  private g!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private last = 0;
  private canvas: HTMLCanvasElement;
  private draw: Draw;
  private btn?: HTMLButtonElement;
  private opts: SceneOpts;
  private visible = true;
  private active = -1;

  constructor(root: HTMLElement, draw: Draw, height = 260, opts: SceneOpts = {}) {
    this.draw = draw;
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.style.height = `${height}px`;
    if (opts.label) { this.canvas.setAttribute("role", "img"); this.canvas.setAttribute("aria-label", opts.label); }
    root.prepend(this.canvas);
    if (opts.animated !== false) {
      const bar = document.createElement("div");
      bar.className = "scene-bar";
      this.btn = document.createElement("button");
      const reset = document.createElement("button");
      reset.textContent = "↺ Restart";
      reset.addEventListener("click", () => { this.t = 0; this.redraw(); });
      this.btn.addEventListener("click", () => { this.playing = !this.playing; this.label(); });
      bar.append(this.btn, reset);
      this.canvas.after(bar);
      this.label();
    } else this.playing = false;
    if (opts.handles?.length) this.enableDrag();
    this.resize();
    addEventListener("resize", () => this.resize());
    // Only animate while visible, so a long page stays light.
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(this.canvas);
    requestAnimationFrame((ts) => this.tick(ts));
  }

  private label() { if (this.btn) this.btn.textContent = this.playing ? "❚❚ Pause" : "▶ Play"; }

  private enableDrag() {
    const c = this.canvas, hs = this.opts.handles!;
    c.style.touchAction = "none"; // a drag on the canvas moves the point instead of scrolling
    c.tabIndex = 0;
    const plane = () => this.opts.plane!(this.w, this.h);
    const at = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const nearest = (px: number, py: number) => {
      let best = -1, bd = 26;
      hs.forEach((h, i) => { const [hx, hy] = toPx(plane(), h.x, h.y); const d = Math.hypot(hx - px, hy - py); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    const move = (i: number, x: number, y: number) => {
      const m = this.opts.max ?? Infinity, len = Math.hypot(x, y);
      if (len > m) { x *= m / len; y *= m / len; }
      hs[i].x = Math.round(x * 100) / 100; hs[i].y = Math.round(y * 100) / 100;
      this.opts.onDrag?.(); this.redraw();
    };
    c.addEventListener("pointerdown", (e) => {
      const [px, py] = at(e); this.active = nearest(px, py);
      if (this.active >= 0) { c.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    c.addEventListener("pointermove", (e) => {
      const [px, py] = at(e);
      if (this.active >= 0) move(this.active, ...toWorld(plane(), px, py));
      else c.style.cursor = nearest(px, py) >= 0 ? "grab" : "default";
    });
    c.addEventListener("pointerup", () => (this.active = -1));
    // Keyboard: arrow keys move the selected point, space switches to the next point.
    let kb = 0;
    c.addEventListener("keydown", (e) => {
      const big = this.opts.step ?? 0.05, step = e.shiftKey ? big / 5 : big, d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (e.key === " ") { kb = (kb + 1) % hs.length; e.preventDefault(); this.redraw(); return; }
      if (!d[e.key]) return;
      e.preventDefault(); move(kb, hs[kb].x + d[e.key][0], hs[kb].y + d[e.key][1]);
    });
  }

  private resize() {
    const r = devicePixelRatio || 1;
    this.w = this.canvas.clientWidth; this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * r); this.canvas.height = Math.round(this.h * r);
    this.g = this.canvas.getContext("2d")!;
    this.g.setTransform(r, 0, 0, r, 0, 0);
    this.redraw();
  }

  redraw() {
    const { g, w, h } = this;
    g.fillStyle = C.stage; g.fillRect(0, 0, w, h);
    this.draw(g, w, h, this.t);
    // Draggable points get a white ring, so it's obvious what can be grabbed.
    const p = this.opts.plane?.(w, h);
    if (p) for (const hd of this.opts.handles ?? []) {
      const [x, y] = toPx(p, hd.x, hd.y);
      circle(g, x, y, 9, C.white, 2);
    }
  }

  private tick(ts: number) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    if (this.playing && this.visible) { this.t += dt; this.redraw(); }
    requestAnimationFrame((n) => this.tick(n));
  }
}

/** Grid, axes and the unit circle of an arrow plane. */
export function grid(g: CanvasRenderingContext2D, p: Plane, w: number, h: number, unitCircle = true) {
  const [x0] = toWorld(p, 0, 0), [x1] = toWorld(p, w, 0), [, yTop] = toWorld(p, 0, 0), [, yBot] = toWorld(p, 0, h);
  for (let x = Math.ceil(x0); x <= x1; x++) { const [px] = toPx(p, x, 0); line(g, px, 0, px, h, x ? "#1f242d" : C.axis, 1); }
  for (let y = Math.ceil(yBot); y <= yTop; y++) { const [, py] = toPx(p, 0, y); line(g, 0, py, w, py, y ? "#1f242d" : C.axis, 1); }
  if (unitCircle) { g.setLineDash([4, 5]); circle(g, p.cx, p.cy, p.unit, "#3a4252", 1.2); g.setLineDash([]); }
  const [ox, oy] = toPx(p, 1, 0);
  label(g, "1", ox + 4, oy + 15, C.muted);
}

/** Hook range inputs and checkboxes up to a scene (and an optional label updater). */
export function controls(scene: Scene, ids: string[], onChange?: () => void) {
  const run = () => { onChange?.(); scene.redraw(); };
  ids.forEach((id) => document.getElementById(id)!.addEventListener("input", run));
  run();
}

export const val = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);

// --- drawing helpers ------------------------------------------------------------------------

export function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5, dash: number[] = []) {
  g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
}

export function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 3) {
  const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1), head = Math.min(12, len * 0.35);
  line(g, x1, y1, x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6, color, width);
  g.fillStyle = color; g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4));
  g.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4));
  g.closePath(); g.fill();
}

export function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string, r = 5) {
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

export function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color = C.grid, width = 1.5) {
  g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
}

export function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, color = C.muted, align: CanvasTextAlign = "left", size = 13) {
  g.fillStyle = color; g.font = `${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`; g.textAlign = align; g.fillText(s, x, y);
}

/** Plot f(τ) for τ in [t0, t1] across a box; x runs left→right with τ. */
export function curve(g: CanvasRenderingContext2D, f: (τ: number) => number, t0: number, t1: number,
  box: { x: number; y: number; w: number; h: number }, scale: number, color: string, width = 2.5) {
  g.strokeStyle = color; g.lineWidth = width; g.beginPath();
  const n = Math.max(2, Math.round(box.w));
  for (let i = 0; i <= n; i++) {
    const τ = t0 + ((t1 - t0) * i) / n, x = box.x + (box.w * i) / n, y = box.y + box.h / 2 - f(τ) * scale;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
}
