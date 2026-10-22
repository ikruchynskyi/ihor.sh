// Build kit for Part II of the electronics course (chapters 17–23): one project, three linked views.
//
//   schematic(el, project)   the circuit drawn with the circuit lab's own parts and solved live by its engine:
//                            click a part (or its button) for why it's there, take it out and watch what breaks,
//                            hover any point for its voltage, open the exact circuit in the lab
//   pinout(el, chip)          a chip from above: notch, pin 1, numbers counter-clockwise; click a pin
//   breadboard(el, project)   the same parts in real breadboard holes; a click lights the part or the strip
//   link(...views)            selecting a part in one view selects it in the others
//
// A project (learn/electronics/projects.js) is { parts, why, bb }: parts in the lab's format (their order sets the
// names R1, C1, U1…), why[ref] = { job, value?, without?, ch? }, bb = breadboard placements. The pure helpers at the
// top are what learn/build.test.mjs checks: the breadboard must join exactly the pins the schematic joins.
import { PARTS, COL, LEDS, REF_PREFIX, pins, distTo, draw, si } from "./lab/parts.js";
import { simulation, onWire } from "./lab/engine.js";

const key = ([x, y]) => `${x},${y}`;

// ---------- pure helpers (no DOM) ----------
/** The project's parts as the lab would load them: defaults filled in, ids in order. */
export const load = (list) => list.map((p, i) => ({ ...structuredClone(PARTS[p.type].props ?? {}), ...structuredClone(p), id: i + 1 }));
/** Reference names (R1, U2…) the way the lab numbers them: by kind, in the order parts were added. */
export function refs(parts) {
  const count = {}, out = new Map();
  for (const p of parts) { const k = REF_PREFIX[p.type]; if (!k) continue; count[k] = (count[k] ?? 0) + 1; out.set(p.id, `${k}${count[k]}`); }
  return out;
}
/** Which schematic pins are joined: "REF:k" (k = the lab's pin index) → a net id. Wires, T-junctions, ground symbols
 *  and same-named supply labels join. */
export function schematicNets(parts) {
  const up = new Map(), find = (k) => { while (up.has(k) && up.get(k) !== k) k = up.get(k); return k; }, join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra, rb); };
  for (const w of parts) if (w.type === "wire") { const stops = [w.a, ...onWire(w, parts), w.b].map(key); stops.slice(1).forEach((k, i) => join(stops[i], k)); }
  const grounds = parts.filter((p) => p.type === "ground").map((p) => key(pins(p)[0]));
  grounds.forEach((g) => join(g, grounds[0]));
  for (const f of parts.filter((p) => p.type === "flag")) join(key(pins(f)[0]), `flag:${f.name}`);
  const R = refs(parts), out = new Map();
  for (const p of parts) if (R.has(p.id)) pins(p).forEach((pt, k) => out.set(`${R.get(p.id)}:${k}`, find(key(pt))));
  return out;
}
/** Physical pin number → the lab's pin index, read from pin names like "3 OUT". */
export function pinIndex(type, physical) {
  const k = (PARTS[type].pinNames ?? []).findIndex((n) => n.split(" ")[0] === String(physical));
  return k;
}
// Breadboard holes: "a12"…"j12" in the two halves of column 12, and rails "T+12", "T-12", "B+12", "B-12".
const ROWS = "abcdefghij";
export function holeNode(h) {
  const m = /^([TB][+-]|[a-j])(\d+)$/.exec(h);
  if (!m) throw new Error(`no such hole: ${h}`);
  return m[1].length === 2 ? `rail${m[1]}` : `${ROWS.indexOf(m[1]) < 5 ? "top" : "bot"}${m[2]}`;
}
/** The holes a DIP chip's pins sit in across the middle gap, notch to the left: pin 1 in row f at column `at`, then
 *  counter-clockwise: along row f to the right, back along row e to the left (the last pin is e{at}). */
export const dipHoles = (at, n) => Array.from({ length: n }, (_, k) => (k < n / 2 ? `f${at + k}` : `e${at + n - 1 - k}`));
/** Each placed part's legs → "REF:k" (the schematic pin each leg is). */
export function bbLegs(project, parts = load(project.parts)) {
  const R = refs(parts), byRef = new Map([...R].map(([id, r]) => [r, parts.find((p) => p.id === id)])), out = [];
  for (const b of project.bb.parts) {
    if (b.kind === "wire") continue;
    const p = byRef.get(b.ref);
    if (!p) throw new Error(`breadboard part ${b.ref} isn't in the schematic`);
    const holes = b.kind === "dip" ? dipHoles(b.at, b.n) : b.legs;
    holes.forEach((h, i) => {
      if (h == null) return;
      // DIPs and numbered packages: leg i is physical pin i + 1; others list their legs in the lab's pin order
      const k = b.kind === "dip" || b.numbered ? pinIndex(p.type, i + 1) : i;
      if (k >= 0) out.push({ ref: b.ref, pin: `${b.ref}:${k}`, hole: h });
    });
  }
  return out;
}
/** Breadboard nets: hole node → joined node, through the strips, the rails and the jumper wires. */
export function breadboardNets(project) {
  const up = new Map(), find = (k) => { while (up.has(k) && up.get(k) !== k) k = up.get(k); return k; }, join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra, rb); };
  for (const w of project.bb.parts) if (w.kind === "wire") join(holeNode(w.from), holeNode(w.to));
  return (h) => find(holeNode(h));
}
/** Disagreements between the breadboard and the schematic, in words (empty when they match). */
export function checkBreadboard(project) {
  const parts = load(project.parts), sch = schematicNets(parts), net = breadboardNets(project), legs = bbLegs(project, parts), errs = [];
  const seen = new Map(); // a hole holds one leg
  for (const l of legs) { if (seen.has(l.hole)) errs.push(`${l.pin} and ${seen.get(l.hole)} share hole ${l.hole}`); seen.set(l.hole, l.pin); }
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
    const a = legs[i], b = legs[j], s = sch.get(a.pin) === sch.get(b.pin), w = net(a.hole) === net(b.hole);
    if (s !== w) errs.push(`${a.pin} (${a.hole}) and ${b.pin} (${b.hole}) are ${s ? "joined in the schematic but not on the breadboard" : "joined on the breadboard but not in the schematic"}`);
  }
  // every schematic pin that's wired to something must be on the board (unless the project says it's off-board)
  const placed = new Set(legs.map((l) => l.pin)), counts = new Map();
  for (const v of sch.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const [pin, v] of sch) if (!placed.has(pin) && counts.get(v) > 1 && !(project.bb.offboard ?? []).includes(pin.split(":")[0])) errs.push(`${pin} isn't on the breadboard`);
  return errs;
}
/** A link that opens the exact circuit in the circuit lab. */
export const labLink = (project) => `/learn/lab.html#c2=${btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, speed: project.speed ?? 1, parts: load(project.parts) }))))}`;

// ---------- shared bits for the views ----------
const fitCanvas = (cv, aspect) => { const dpr = devicePixelRatio || 1, w = cv.clientWidth || 760; cv.width = Math.round(w * dpr); cv.height = Math.round((w / aspect) * dpr); cv.style.height = `${w / aspect}px`; return dpr; };
const STILL = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** A part's value in words ("47 kΩ", "10 µF"), for the cards. */
const valueText = (p) => (p.type === "resistor" ? si(p.ohms, "Ω") : p.type === "capacitor" ? si(p.farads, "F") : p.type === "battery" ? si(p.v, "V") : "");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function mk(tag, attrs = {}, html = "") { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; }
const CSS = `
.bk { margin: 14px 0; }
.bk canvas { display: block; width: 100%; background: #14171d; border-radius: 8px; touch-action: manipulation; cursor: pointer; }
.bk .scroll { overflow-x: auto; border-radius: 8px; }
.bk .scroll canvas { min-width: var(--minw, 0); }
.bk .scroll + .swipe { display: none; font-size: 13px; color: var(--muted); margin: 2px 0 0; }
@media (max-width: 600px) { .bk .scroll + .swipe { display: block; } }
.bk .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.bk .chips button { font: calc(14px * var(--px, 1)) ui-monospace, Menlo, monospace !important; padding: 3px 9px !important; border-radius: 6px; border: 1px solid var(--line) !important; background: var(--card) !important; color: var(--fg) !important; cursor: pointer; box-shadow: none !important; text-transform: none !important; letter-spacing: 0 !important; }
.bk .chips button[aria-pressed=true] { border-color: var(--accent) !important; background: color-mix(in srgb, var(--accent) 22%, var(--card)) !important; }
.bk .chips button.out { text-decoration: line-through; opacity: .7; }
.bk .card2 { border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 0 10px 10px 0; background: var(--card); padding: 8px 14px; font-size: 16px; min-height: 2.6em; }
.bk .card2 b.ref { font-family: ui-monospace, Menlo, monospace; }
.bk .card2 p { margin: 4px 0; }
.bk .card2 .k { color: var(--muted); font-size: .85em; text-transform: uppercase; letter-spacing: .06em; margin-right: 6px; }
.bk .bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 15px; color: var(--muted); margin: 6px 0; }
.bk .bar a { font-size: 15px; }
`;
/** A canvas that keeps a readable width on a phone and scrolls sideways inside its own box. */
const scroller = (cv, minw) => { const d = mk("div", { className: "scroll" }); d.style.setProperty("--minw", `${minw}px`); d.append(cv); const f = document.createDocumentFragment(); f.append(d, mk("p", { className: "swipe" }, "← swipe the drawing sideways →")); return f; };
let styled = false;
const style = () => { if (!styled) { document.head.append(mk("style", { textContent: CSS })); styled = true; } };

// ---------- 1. the live schematic ----------
/**
 * schematic(container, project, { height?, onPick? }) → { select(ref), remove(ref, out), set(ref, prop, v), sim(), parts }
 * Draws project.parts with the lab's symbols, simulates them, and explains whichever part is picked.
 */
export function schematic(root, project, opts = {}) {
  style();
  root.classList.add("bk");
  let parts = load(project.parts);
  const R = refs(parts), byRef = (r) => parts.find((p) => R.get(p.id) === r), out = new Set();
  const cv = mk("canvas", { tabIndex: -1 }), chips = mk("div", { className: "chips", role: "group", ariaLabel: "Parts" }), card = mk("div", { className: "card2", ariaLive: "polite" }), bar = mk("div", { className: "bar" });
  cv.setAttribute("aria-label", opts.label ?? "The schematic. Pick a part with the buttons below to see why it's there.");
  root.append(scroller(cv, 640), chips, card, bar);
  // the frame: every pin, with a margin
  const pts = parts.flatMap((p) => pins(p)), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const box = { x0: Math.min(...xs) - 2.6, y0: Math.min(...ys) - 1.8, x1: Math.max(...xs) + 3.0, y1: Math.max(...ys) + 1.6 };
  const aspect = Math.max(1.1, Math.min(2.4, (box.x1 - box.x0) / (box.y1 - box.y0)));
  let dpr = fitCanvas(cv, aspect), view = { s: 1, x: 0, y: 0 };
  const layout = () => { dpr = fitCanvas(cv, aspect); const W = cv.width / dpr, H = cv.height / dpr, s = Math.min(W / (box.x1 - box.x0), H / (box.y1 - box.y0)); view = { s, x: (W - s * (box.x1 + box.x0)) / 2, y: (H - s * (box.y1 + box.y0)) / 2 }; };
  layout(); addEventListener("resize", layout);
  // simulation
  let sim = null, memory = { capV: new Map(), indI: new Map() }, dirty = true, selected = null, hover = null, tReal = 0;
  // a part taken out is gone, or (why.remove === "short") replaced by a plain wire, for parts in series with the signal
  const live = () => parts.flatMap((p) => { const r = R.get(p.id); if (!out.has(r)) return [p]; return project.why?.[r]?.remove === "short" ? [{ id: p.id, type: "wire", a: p.a, b: p.b }] : []; });
  const rebuild = () => { dirty = false; sim = simulation(live(), { speed: project.speed ?? 1, memory, t0: sim?.t ?? 0 }); };
  const offsets = new Map();
  function frame(now) {
    const dt = Math.min(0.05, (now - (frame.last ?? now)) / 1000); frame.last = now; tReal += dt;
    if (!cv.isConnected) return;
    if (dirty) rebuild();
    if (sim && !sim.error && cv.getBoundingClientRect().bottom > 0) sim.advance(dt);
    const g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = COL.stage; g.fillRect(0, 0, W, H);
    g.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);
    for (const p of parts) {
      const gone = out.has(R.get(p.id)), amps = gone ? 0 : sim?.cur.get(p.id) ?? 0, st = { sel: R.get(p.id) === selected, amps, t: tReal, nolabel: p.nolabel };
      if (p.type === "led") st.glow = Math.min(1, Math.max(0, amps) / 0.02);
      if (p.type === "resistor") { const P = amps * amps * p.ohms; st.heat = P > (p.watts ?? 0.25) ? Math.min(0.6, P / (p.watts ?? 0.25) / 3) : 0; }
      if (p.type === "motor") { p._spin = (p._spin ?? 0) + amps * dt * 8; st.spin = p._spin; }
      if (p.type === "nmos") st.on = Math.abs(amps) > 1e-3;
      const s = gone ? null : sim?.net.states.get(p.id); if (s) Object.assign(st, s);
      if (gone) { g.globalAlpha = 0.18; draw(g, p, st); g.globalAlpha = 1; if (project.why?.[R.get(p.id)]?.remove === "short") { g.strokeStyle = COL.sel; g.lineWidth = 0.1; g.setLineDash([0.25, 0.2]); g.beginPath(); g.moveTo(...p.a); g.lineTo(...p.b); g.stroke(); g.setLineDash([]); } } else draw(g, p, st);
    }
    // names (R1, U1…) beside each part, as in the lab
    g.fillStyle = "#8f98a8"; g.font = "0.36px ui-monospace, Menlo, monospace"; g.textBaseline = "middle";
    for (const p of parts) {
      const name = R.get(p.id); if (!name || (p.nolabel && name !== selected)) continue;
      g.fillStyle = name === selected ? COL.sel : "#8f98a8";
      if (PARTS[p.type].two) { const [ax, ay] = p.a, [bx, by] = p.b, ang = Math.atan2(by - ay, bx - ax), o = ["battery", "source", "switch", "button", "diode", "zener", "led", "lamp", "motor", "speaker", "ldr"].includes(p.type) ? -0.75 : 0.85, dx = -o * Math.sin(ang), dy = o * Math.cos(ang); g.textAlign = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "left" : "right") : "center"; g.fillText(name, (ax + bx) / 2 + dx, (ay + by) / 2 + dy); }
      else if (p.type === "pot") { const ps = pins(p), x = Math.max(...ps.map((q) => q[0])), y = Math.min(...ps.map((q) => q[1])); g.textAlign = "left"; g.fillText(name, x + 0.3, y + 0.7); }
      else { const ps = pins(p), x = Math.min(...ps.map((q) => q[0])), y = Math.min(...ps.map((q) => q[1])); g.textAlign = "left"; g.fillText(name, x + 0.2, y - 0.7); }
    }
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    // current dots
    if (sim) {
      g.fillStyle = COL.dot;
      const dots = (id, a, b, amps) => {
        if (Math.abs(amps) < 1e-6) return;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!len) return;
        const v = STILL ? 0 : Math.sign(amps) * Math.min(6, Math.sqrt(Math.abs(amps) * 1000) * 0.6), off = ((((offsets.get(id) ?? 0) + v * dt) % 0.8) + 0.8) % 0.8;
        offsets.set(id, off);
        for (let d = off; d < len; d += 0.8) { g.beginPath(); g.arc(a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len, 0.1, 0, 7); g.fill(); }
      };
      for (const [id, list] of sim.net.segs) for (const s of list) dots(`w${id}:${s.idx}`, s.from, s.to, sim.wire.get(s.idx) ?? 0);
      for (const p of live()) if (PARTS[p.type].two && p.type !== "wire") dots(p.id, p.a, p.b, sim.cur.get(p.id) ?? 0);
    }
    // junction dots where three or more ends meet
    const ends = new Map();
    for (const p of parts) for (const pt of pins(p)) ends.set(key(pt), (ends.get(key(pt)) ?? 0) + 1);
    for (const w of parts) if (w.type === "wire") for (const pt of onWire(w, parts)) ends.set(key(pt), (ends.get(key(pt)) ?? 0) + 2);
    g.fillStyle = COL.wire;
    for (const [k, c] of ends) if (c >= 3) { const [x, y] = k.split(",").map(Number); g.beginPath(); g.arc(x, y, 0.17, 0, 7); g.fill(); }
    // the meter: hover a point for its voltage
    if (hover && sim) {
      const v = sim.voltAt(hover);
      if (v != null) { g.strokeStyle = COL.blue; g.lineWidth = 0.05; g.beginPath(); g.arc(hover[0], hover[1], 0.25, 0, 7); g.stroke(); tag(g, hover, `${si(v, "V")}`); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    requestAnimationFrame(frame);
  }
  const tag = (g, [x, y], text) => { g.save(); g.setTransform(dpr, 0, 0, dpr, dpr * (view.x + x * view.s), dpr * (view.y + y * view.s)); g.font = "12px ui-monospace, Menlo, monospace"; const w = g.measureText(text).width + 10; g.fillStyle = "rgba(20,23,29,.92)"; g.fillRect(10, -28, w, 19); g.strokeStyle = COL.blue; g.lineWidth = 1; g.strokeRect(10, -28, w, 19); g.fillStyle = COL.blue; g.fillText(text, 15, -14); g.restore(); };
  requestAnimationFrame(frame);
  // picking
  const toGrid = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s]; };
  cv.addEventListener("pointermove", (e) => { const [x, y] = toGrid(e); hover = [Math.round(x), Math.round(y)]; });
  cv.addEventListener("pointerleave", () => (hover = null));
  cv.addEventListener("click", (e) => {
    const pt = toGrid(e), hit = parts.filter((p) => R.has(p.id)).map((p) => [p, distTo(p, pt)]).sort((a, b) => a[1] - b[1])[0];
    const [x, y] = pt; hover = [Math.round(x), Math.round(y)];
    if (hit && hit[1] < (PARTS[hit[0].type].two ? 0.6 : 0.8)) api.select(R.get(hit[0].id), true);
  });
  // the part buttons and the card
  const listeners = [];
  const refsShown = [...R.values()].filter((r) => project.why?.[r]);
  chips.innerHTML = refsShown.map((r) => `<button type="button" data-r="${r}" aria-pressed="false">${r}</button>`).join("");
  chips.onclick = (e) => { const b = e.target.closest("button[data-r]"); if (b) api.select(b.dataset.r, true); };
  const showCard = () => {
    const w = project.why?.[selected];
    if (!w) { card.innerHTML = `<p class="muted">${opts.hint ?? "Pick a part (click it, or its button) to see what it's for. Hover or tap any point of the drawing for its voltage."}</p>`; return; }
    const p = byRef(selected), gone = out.has(selected);
    card.innerHTML = `<p><b class="ref">${selected}</b> ${valueText(p)} ${esc(w.name ?? PARTS[p.type].name)}</p><p><span class="k">job</span>${w.job}</p>${w.value ? `<p><span class="k">this value</span>${w.value}</p>` : ""}${w.without ? `<p><span class="k">without it</span>${w.without}</p>` : ""}${w.ch ? `<p class="muted" style="font-size:.9em">Taught in ${w.ch}</p>` : ""}${w.remove ? `<p><button type="button" class="take">${gone ? "Put it back" : w.remove === "short" ? "Replace it with a wire and watch" : "Take it out and watch"}</button></p>` : ""}`;
    card.querySelector(".take")?.addEventListener("click", () => api.remove(selected, !gone));
  };
  bar.innerHTML = `<a href="${labLink(project)}">Open this circuit in the lab ↗</a><span>${opts.note ?? ""}</span>`;
  const api = {
    parts, refs: R,
    sim: () => sim,
    select(r, user = false) {
      selected = r === selected && user ? null : r;
      chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.r === selected));
      showCard(); if (user) listeners.forEach((f) => f(selected, api)); opts.onPick?.(selected);
    },
    remove(r, gone = true) { if (gone) out.add(r); else out.delete(r); chips.querySelector(`[data-r="${r}"]`)?.classList.toggle("out", gone); dirty = true; showCard(); opts.onChange?.(); },
    set(r, prop, v) { const p = byRef(r); p[prop] = v; dirty = true; opts.onChange?.(); },
    voltAt: (pt) => sim?.voltAt(pt) ?? null,
    current: (r) => sim?.cur.get(byRef(r)?.id) ?? 0,
    state: (r) => sim?.net.states.get(byRef(r)?.id),
    onSelect: (f) => listeners.push(f),
  };
  showCard();
  return api;
}

// ---------- 2. a chip's pinout ----------
/**
 * pinout(container, { name, pkg: "dip8" | "dip16" | "to220" | "to92", pins: { n: [name, what it wants] } }, { onPin? })
 * → { select(n) }. DIPs are drawn from above, notch to the left: pin 1 bottom-left, counting counter-clockwise.
 */
export function pinout(root, chip, opts = {}) {
  style();
  root.classList.add("bk");
  const n = chip.pkg === "dip16" ? 16 : chip.pkg === "dip8" ? 8 : 3, dip = chip.pkg.startsWith("dip"), half = n / 2;
  const cv = mk("canvas"), chips = mk("div", { className: "chips", role: "group", ariaLabel: `${chip.name} pins` }), card = mk("div", { className: "card2", ariaLive: "polite" });
  cv.setAttribute("aria-label", `${chip.name} seen from above. Pick a pin with the buttons below.`);
  root.append(cv, chips, card);
  const aspect = dip ? (n === 16 ? 2.6 : 2.2) : 1.6;
  let dpr = fitCanvas(cv, aspect), sel = null;
  // geometry in a 100 × (100 / aspect) box
  const H = 100 / aspect, pos = (k) => { // k = 1…n → [x, y] of the pin's end
    if (!dip) return [32 + (k - 1) * 18, 54];
    const step = 70 / (half - 1 || 1);
    return k <= half ? [15 + (k - 1) * step, H - 9] : [15 + (n - k) * step, 9];
  };
  function paint() {
    dpr = fitCanvas(cv, aspect);
    const g = cv.getContext("2d"), u = cv.width / 100;
    g.setTransform(u, 0, 0, u, 0, 0); g.fillStyle = COL.stage; g.fillRect(0, 0, 100, H);
    g.lineWidth = 0.5;
    if (dip) {
      for (let k = 1; k <= n; k++) { const [x, y] = pos(k), on = k === sel; g.fillStyle = on ? COL.sel : "#b8bec8"; g.fillRect(x - 2, y < H / 2 ? y - 3 : y - 3, 4, 6); }
      g.fillStyle = "#23262c"; g.fillRect(8, 14, 84, H - 28); g.strokeStyle = "#555b66"; g.strokeRect(8, 14, 84, H - 28);
      g.fillStyle = COL.stage; g.beginPath(); g.arc(8, H / 2, 4, -Math.PI / 2, Math.PI / 2); g.fill(); // the notch
      g.fillStyle = "#555b66"; g.beginPath(); g.arc(14, H - 20, 1.6, 0, 7); g.fill(); // the pin-1 dot
      g.fillStyle = "#d7dde5"; g.font = "bold 7px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(chip.name, 52, H / 2);
      g.font = "4.2px ui-monospace, Menlo, monospace";
      for (let k = 1; k <= n; k++) { const [x, y] = pos(k), top = y < H / 2; g.fillStyle = k === sel ? COL.sel : "#d7dde5"; g.fillText(String(k), x, top ? y + 9 : y - 9); g.fillStyle = k === sel ? COL.sel : "#8f98a8"; g.font = "3.4px ui-monospace, Menlo, monospace"; g.fillText(chip.pins[k]?.[0] ?? "", x, top ? y - 6 : y + 6.5); g.font = "4.2px ui-monospace, Menlo, monospace"; }
    } else {
      // a TO-220 (tab up) or TO-92 (flat face toward you), legs down
      if (chip.pkg === "to220") { g.fillStyle = "#9aa1ab"; g.fillRect(24, 4, 52, 15); g.fillStyle = COL.stage; g.beginPath(); g.arc(50, 11, 3.5, 0, 7); g.fill(); g.fillStyle = "#23262c"; g.fillRect(24, 18, 52, 22); }
      else { g.fillStyle = "#23262c"; g.beginPath(); g.moveTo(30, 40); g.lineTo(30, 26); g.arc(50, 26, 20, Math.PI, 0); g.lineTo(70, 40); g.closePath(); g.fill(); }
      for (let k = 1; k <= 3; k++) { const [x, y] = pos(k); g.fillStyle = k === sel ? COL.sel : "#b8bec8"; g.fillRect(x - 1.2, 40, 2.4, y - 40); }
      g.fillStyle = "#d7dde5"; g.font = "bold 5px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(chip.name, 50, 31);
      g.font = "4px ui-monospace, Menlo, monospace";
      for (let k = 1; k <= 3; k++) { const [x, y] = pos(k); g.fillStyle = k === sel ? COL.sel : "#d7dde5"; g.fillText(String(k), x, y + 3.5); g.fillStyle = k === sel ? COL.sel : "#8f98a8"; g.fillText(chip.pins[k]?.[0] ?? "", x, y + 7.5); }
    }
  }
  chips.innerHTML = Array.from({ length: n }, (_, i) => i + 1).map((k) => `<button type="button" data-k="${k}" aria-pressed="false">${k} ${esc(chip.pins[k]?.[0] ?? "")}</button>`).join("");
  const show = () => { const p = chip.pins[sel]; card.innerHTML = p ? `<p><b class="ref">pin ${sel}: ${esc(p[0])}</b></p><p>${p[1]}</p>` : `<p class="muted">${opts.hint ?? "Pick a pin."}</p>`; };
  const api = { select(k, user) { sel = +k; chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.k === sel)); paint(); show(); if (user) opts.onPin?.(sel); } };
  chips.onclick = (e) => { const b = e.target.closest("button[data-k]"); if (b) api.select(b.dataset.k, true); };
  cv.addEventListener("click", (e) => { const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * H; let best = 0, d = 1e9; for (let k = 1; k <= n; k++) { const [px, py] = pos(k), dd = Math.hypot(px - x, (py - y) * 0.6); if (dd < d) { d = dd; best = k; } } if (d < 12) api.select(best, true); });
  addEventListener("resize", paint);
  paint(); show();
  return api;
}

// ---------- 3. the breadboard ----------
const BANDS = ["#111", "#7a4a1f", "#d33", "#f80", "#ee0", "#2a2", "#33d", "#a3c", "#888", "#eee"];
const PITCH = 20, X0 = 34, rowY = (r) => ({ "T+": 18, "T-": 36, "B+": 318, "B-": 336 })[r] ?? (ROWS.indexOf(r) < 5 ? 74 + ROWS.indexOf(r) * 20 : 196 + (ROWS.indexOf(r) - 5) * 20);
const holeXY = (h) => { const m = /^([TB][+-]|[a-j])(\d+)$/.exec(h); return [X0 + (+m[2] - 1) * PITCH, rowY(m[1])]; };
/** Color bands for a resistance: two digits and a multiplier (chapter 5). */
function bands(ohms) { const e = Math.floor(Math.log10(ohms)) - 1, d = Math.round(ohms / 10 ** e); return [Math.floor(d / 10) % 10, d % 10, Math.max(0, e)].map((k) => BANDS[k]); }
/**
 * breadboard(container, project, { onPick? }) → { select(ref) }. project.bb = { cols, parts: [
 *   { ref, kind: "res" | "cap" | "ecap" | "led" | "diode" | "ldr" | "pot" | "to220" | "to92" | "dip" | "off", legs: [holes…] }
 *   ({ kind: "dip", at, n } puts pin 1 in row f at column `at`), { kind: "wire", from, to, color } ],
 *   margin: px left of the board for off-board parts ({ kind: "off", box: [x, y] }, x negative) }
 */
export function breadboard(root, project, opts = {}) {
  style();
  root.classList.add("bk");
  const parts = load(project.parts), R = refs(parts), byRef = new Map([...R].map(([id, r]) => [r, parts.find((p) => p.id === id)]));
  const cols = project.bb.cols ?? 30, ox = project.bb.margin ?? 0, Wd = ox + X0 + (cols - 1) * PITCH + 34, Hd = 352;
  const cv = mk("canvas"), chips = mk("div", { className: "chips", role: "group", ariaLabel: "Parts on the breadboard" }), card = mk("div", { className: "card2", ariaLive: "polite" });
  cv.setAttribute("aria-label", "The breadboard. Pick a part with the buttons below, or click a hole to light its strip.");
  root.append(scroller(cv, 640), chips, card);
  const net = breadboardNets(project), legs = bbLegs(project, parts);
  let dpr = fitCanvas(cv, Wd / Hd), sel = null, hole = null;
  const allHoles = [];
  for (let c = 1; c <= cols; c++) { for (const r of ROWS) allHoles.push(`${r}${c}`); if ((c - 1) % 6 !== 5) for (const r of ["T+", "T-", "B+", "B-"]) allHoles.push(`${r}${c}`); }
  function paint() {
    dpr = fitCanvas(cv, Wd / Hd);
    const g = cv.getContext("2d"), u = cv.width / Wd;
    g.setTransform(u, 0, 0, u, 0, 0);
    g.fillStyle = "#cfcabd"; g.fillRect(0, 0, Wd, Hd); g.translate(ox, 0);
    g.fillStyle = "#e9e6dd"; g.fillRect(0, 0, Wd - ox, Hd);
    g.fillStyle = "#d8d4c8"; g.fillRect(10, 172, Wd - ox - 20, 8);
    for (const [y, c] of [[8, "#d33"], [46, "#36c"], [308, "#d33"], [346, "#36c"]]) { g.fillStyle = c; g.fillRect(20, y - 1, Wd - ox - 40, 2); }
    g.fillStyle = "#8a877e"; g.font = "9px ui-monospace, Menlo, monospace"; g.textAlign = "center";
    for (let c = 1; c <= cols; c += c === 1 ? 4 : 5) { g.fillText(c, X0 + (c - 1) * PITCH, 62); g.fillText(c, X0 + (c - 1) * PITCH, 296); }
    g.textAlign = "left"; ROWS.split("").forEach((r) => g.fillText(r, 8, rowY(r) + 3)); g.fillText("+", 8, 21); g.fillText("−", 8, 39); g.fillText("+", 8, 321); g.fillText("−", 8, 339);
    const lit = hole ? new Set(allHoles.filter((h) => net(h) === net(hole))) : new Set();
    const selHoles = new Set(sel ? legs.filter((l) => l.ref === sel).map((l) => l.hole) : []);
    for (const h of allHoles) { const [x, y] = holeXY(h); g.fillStyle = lit.has(h) ? "#2f9e44" : selHoles.has(h) ? "#c2410c" : "#3b3b38"; g.fillRect(x - 3.5, y - 3.5, 7, 7); }
    // jumpers first, then parts on top
    const WIRE = { red: "#d33", black: "#222", blue: "#36c", green: "#2a2", yellow: "#db0", orange: "#f80", white: "#ddd", purple: "#a3c" };
    for (const w of project.bb.parts.filter((b) => b.kind === "wire")) {
      const [x1, y1] = holeXY(w.from), [x2, y2] = holeXY(w.to), mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(30, Math.hypot(x2 - x1, y2 - y1) / 4);
      g.strokeStyle = WIRE[w.color ?? "green"] ?? w.color; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
    }
    for (const b of project.bb.parts.filter((b) => b.kind !== "wire")) partOnBoard(g, b, byRef.get(b.ref), b.ref === sel);
  }
  function partOnBoard(g, b, p, on) {
    const hs = (b.kind === "dip" ? dipHoles(b.at, b.n) : b.legs).map((h) => (h ? holeXY(h) : null)), ring = on ? "#c2410c" : null;
    const leg = (a, c) => { g.strokeStyle = "#9aa1ab"; g.lineWidth = 2; g.beginPath(); g.moveTo(...a); g.lineTo(...c); g.stroke(); };
    const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    g.save();
    switch (b.kind) {
      case "res": case "diode": {
        const [a, c] = hs, m = mid(a, c), ang = Math.atan2(c[1] - a[1], c[0] - a[0]); leg(a, c);
        g.translate(...m); g.rotate(ang); g.fillStyle = b.kind === "res" ? "#d9b98c" : "#222"; g.fillRect(-13, -5, 26, 10);
        if (b.kind === "res") bands(p.ohms).forEach((col, i) => { g.fillStyle = col; g.fillRect(-9 + i * 5, -5, 3, 10); }), (g.fillStyle = "#c9a227"), g.fillRect(7, -5, 3, 10);
        else { g.fillStyle = "#ccc"; g.fillRect(8, -5, 3, 10); }
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.strokeRect(-15, -7, 30, 14); }
        break;
      }
      case "cap": case "ecap": case "ldr": case "led": {
        const [a, c] = hs, m = mid(a, c); leg(a, m); leg(c, m);
        const r = b.kind === "ecap" ? 9 : 7;
        g.fillStyle = b.kind === "cap" ? "#e8a33d" : b.kind === "ecap" ? "#2b3f6b" : b.kind === "ldr" ? "#d8742c" : LEDS[p.color]?.[1] ?? "#f44";
        g.beginPath(); g.arc(m[0], m[1] - 2, r, 0, 7); g.fill();
        if (b.kind === "ecap") { g.fillStyle = "#c8ccd4"; const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; g.beginPath(); g.arc(m[0] + (dx / l) * 5, m[1] - 2 + (dy / l) * 5, 3.5, 0, 7); g.fill(); } // the stripe: the − leg (b)
        if (b.kind === "ldr") { g.strokeStyle = "#7a3b10"; g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k <= 6; k++) g.lineTo(m[0] - 4.5 + k * 1.5, m[1] - 2 + (k % 2 ? 2.5 : -2.5)); g.stroke(); }
        if (b.kind === "led") { g.fillStyle = "#111"; g.font = "bold 9px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText("+", a[0], a[1] - 8); }
        if (b.kind === "cap") { g.fillStyle = "#4a2d06"; g.font = "6px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(capCode(p.farads), m[0], m[1]); }
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.beginPath(); g.arc(m[0], m[1] - 2, r + 3, 0, 7); g.stroke(); }
        break;
      }
      case "pot": {
        const xs = hs.map((q) => q[0]), ys = hs.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = Math.min(...ys) - 12;
        hs.forEach((q) => leg(q, [q[0], cy]));
        g.fillStyle = "#2c56a8"; g.fillRect(cx - 22, cy - 15, 44, 26); g.fillStyle = "#f4f4f4"; g.beginPath(); g.arc(cx, cy - 2, 7, 0, 7); g.fill(); g.strokeStyle = "#999"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - 2); g.lineTo(cx, cy - 8); g.stroke();
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.strokeRect(cx - 24, cy - 17, 48, 30); }
        break;
      }
      case "to220": case "to92": {
        const xs = hs.map((q) => q[0]), y = hs[0][1], cx = (Math.min(...xs) + Math.max(...xs)) / 2, w = Math.max(...xs) - Math.min(...xs) + 18;
        hs.forEach((q) => leg(q, [q[0], y - 14]));
        if (b.kind === "to220") { g.fillStyle = "#9aa1ab"; g.fillRect(cx - w / 2, y - 52, w, 18); g.fillStyle = "#e9e6dd"; g.beginPath(); g.arc(cx, y - 44, 4, 0, 7); g.fill(); g.fillStyle = "#23262c"; g.fillRect(cx - w / 2, y - 36, w, 24); }
        else { g.fillStyle = "#23262c"; g.beginPath(); g.moveTo(cx - w / 2, y - 12); g.lineTo(cx - w / 2, y - 26); g.lineTo(cx + w / 2, y - 26); g.lineTo(cx + w / 2, y - 12); g.closePath(); g.fill(); }
        g.fillStyle = "#d7dde5"; g.font = "7px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(b.label ?? "", cx, b.kind === "to220" ? y - 21 : y - 16);
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.strokeRect(cx - w / 2 - 2, y - (b.kind === "to220" ? 54 : 28), w + 4, b.kind === "to220" ? 44 : 18); }
        break;
      }
      case "dip": {
        const [x1] = holeXY(`f${b.at}`), [x2] = holeXY(`f${b.at + b.n / 2 - 1}`), y1 = rowY("e") - 4, y2 = rowY("f") + 4;
        g.fillStyle = "#b8bec8"; for (const h of dipHoles(b.at, b.n)) { const [x, y] = holeXY(h); g.fillRect(x - 3, y - 4, 6, 8); }
        g.fillStyle = "#23262c"; g.fillRect(x1 - 9, y1 + 4, x2 - x1 + 18, y2 - y1 - 8);
        g.fillStyle = "#e9e6dd"; g.beginPath(); g.arc(x1 - 9, (y1 + y2) / 2, 5, -Math.PI / 2, Math.PI / 2); g.fill();
        g.fillStyle = "#555b66"; g.beginPath(); g.arc(x1 - 2, y2 - 7, 2, 0, 7); g.fill();
        g.fillStyle = "#d7dde5"; g.font = "bold 9px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(b.label ?? "", (x1 + x2) / 2, (y1 + y2) / 2 + 3);
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.strokeRect(x1 - 11, y1 - 2, x2 - x1 + 22, y2 - y1 + 4); }
        break;
      }
      case "off": { // something off the board (a battery, a speaker) on two flying leads
        const [x, y] = b.box, cs = ["#d33", "#222"];
        hs.forEach((q, i) => { if (!q) return; g.strokeStyle = cs[i] ?? "#888"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + q[0]) / 2, Math.min(y, q[1]) - 20, q[0], q[1]); g.stroke(); });
        g.fillStyle = "#23262c"; g.fillRect(x - 24, y - 12, 48, 24); g.fillStyle = "#f4d35e"; g.font = "bold 9px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(b.label ?? b.ref, x, y + 3);
        if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.strokeRect(x - 26, y - 14, 52, 28); }
        break;
      }
    }
    g.restore();
  }
  const capCode = (f) => { const pf = Math.round(f * 1e12), e = Math.max(0, Math.floor(Math.log10(pf)) - 1); return `${Math.round(pf / 10 ** e)}${e}`; };
  const placed = project.bb.parts.filter((b) => b.kind !== "wire").map((b) => b.ref);
  chips.innerHTML = placed.map((r) => `<button type="button" data-r="${r}" aria-pressed="false">${r}</button>`).join("");
  const describeHole = (h) => {
    const n = net(h), here = legs.filter((l) => net(l.hole) === n).map((l) => { const p = byRef.get(l.ref), k = +l.pin.split(":")[1], nm = PARTS[p.type].pinNames?.[k]; return `${l.ref}${nm ? ` pin ${nm}` : PARTS[p.type].two ? (k ? " (leg 2)" : " (leg 1)") : ""}`; });
    const where = /^[TB]/.test(h) ? `the ${h[0] === "T" ? "top" : "bottom"} ${h[1] === "+" ? "+" : "−"} rail` : `column ${h.slice(1)}, rows ${ROWS.indexOf(h[0]) < 5 ? "a–e" : "f–j"}`;
    return `<p><b class="ref">${h}</b>: ${where}${here.length ? `, joined to ${here.join(", ")}` : ", nothing plugged into this strip"}.</p>`;
  };
  const show = () => {
    if (hole) { card.innerHTML = describeHole(hole); return; }
    const w = project.why?.[sel], b = project.bb.parts.find((q) => q.ref === sel);
    card.innerHTML = sel ? `<p><b class="ref">${sel}</b> ${valueText(byRef.get(sel))} ${esc(w?.name ?? PARTS[byRef.get(sel).type].name)}: ${(b.kind === "dip" ? dipHoles(b.at, b.n) : b.legs).map((h, i) => (h ? `${b.kind === "dip" || b.numbered ? `pin ${i + 1}` : PARTS[byRef.get(sel).type].pinNames?.[i] ?? `leg ${i + 1}`} in ${h}` : "")).filter(Boolean).join(", ")}.</p>${b.note ? `<p>${b.note}</p>` : ""}` : `<p class="muted">${opts.hint ?? "Pick a part to see which holes its legs go in, or click any hole to light up everything joined to it."}</p>`;
  };
  const listeners = [];
  const api = {
    select(r, user = false) { sel = r === sel && user ? null : r; hole = null; chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.r === sel)); paint(); show(); if (user) listeners.forEach((f) => f(sel, api)); },
    hole(h) { hole = h; sel = null; chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", false)); paint(); show(); opts.onHole?.(h); },
    onSelect: (f) => listeners.push(f),
  };
  chips.onclick = (e) => { const b = e.target.closest("button[data-r]"); if (b) api.select(b.dataset.r, true); };
  cv.addEventListener("click", (e) => {
    const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * Wd - ox, y = ((e.clientY - r.top) / r.height) * Hd;
    let best = null, d = 1e9; for (const h of allHoles) { const [hx, hy] = holeXY(h), dd = Math.hypot(hx - x, hy - y); if (dd < d) { d = dd; best = h; } }
    // a part's body wins over the hole under it
    const body = project.bb.parts.filter((b) => b.kind !== "wire").find((b) => { const hs = (b.kind === "dip" ? dipHoles(b.at, b.n) : b.legs).filter(Boolean).map(holeXY), cx = hs.reduce((s, q) => s + q[0], 0) / hs.length, cy = hs.reduce((s, q) => s + q[1], 0) / hs.length; return b.kind === "dip" ? x > Math.min(...hs.map((q) => q[0])) - 9 && x < Math.max(...hs.map((q) => q[0])) + 9 && y > rowY("e") && y < rowY("f") : b.kind === "off" ? Math.abs(x - b.box[0]) < 26 && Math.abs(y - b.box[1]) < 14 : Math.hypot(cx - x, cy - y) < 9 && d > 5; });
    if (body) api.select(body.ref, true); else if (d < 9) api.hole(best);
  });
  addEventListener("resize", paint);
  paint(); show();
  return api;
}

/** Selecting a part in any of these views selects it in the others. */
export function link(...views) { for (const v of views) v.onSelect((r) => views.forEach((o) => o !== v && o.select(r))); }
