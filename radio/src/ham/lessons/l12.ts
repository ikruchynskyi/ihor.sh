// Lesson 12: rules. The HF band chart by license class, and a can-I-transmit-here checker.
import "../ham.css";
import { C, Scene, controls, label, line } from "../../course/anim.ts";
import { BANDS, CLASS_NAME, check, type Cls, type Kind } from "../bands.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const HF = BANDS.filter((b) => b.hi < 30);

// --- 1. The band chart ---------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-chart"), (g, w, h) => {
    const cls = sel("ch-c") as Cls, L = 64, R = w - 16, rowH = (h - 20) / HF.length;
    HF.forEach((b, i) => {
      const y = 10 + i * rowH, bh = rowH - 14, px = (f: number) => L + ((f - b.lo) / (b.hi - b.lo)) * (R - L);
      label(g, b.name, L - 8, y + bh / 2 + 4, C.text, "right", 11);
      g.fillStyle = "#1f242d"; g.fillRect(L, y, R - L, bh);
      for (const sg of b.segments) {
        const allowed = sg.classes.includes(cls), col = !allowed ? "#2a2f3a" : sg.kinds.includes("phone") ? (sg.kinds.includes("data") ? "#83c167" : C.yellow) : C.blue;
        g.fillStyle = col; g.fillRect(px(sg.lo), y, Math.max(2, px(sg.hi) - px(sg.lo)), bh);
      }
      label(g, `${b.lo.toFixed(3)}`, L, y + bh + 11, C.muted, "left", 9); label(g, `${b.hi.toFixed(3)} MHz`, R, y + bh + 11, C.muted, "right", 9);
      if (b.name === "60 m") label(g, "5 channels", (L + R) / 2, y + bh / 2 + 4, "#14171d", "center", 10);
    });
  }, 420, { animated: false, label: "The US HF amateur bands, showing which segments the chosen license class may use for CW and data or for phone" });
  controls(s, ["ch-c"], () => {
    const cls = sel("ch-c") as Cls;
    el("r-chart").innerHTML = `<span style="color:var(--blue)">■</span> CW and data · <span style="color:var(--yellow)">■</span> phone and image (plus CW) · <span style="color:var(--green)">■</span> everything · <span style="color:#5b6475">■</span> not for ${CLASS_NAME[cls]}. ${cls === "T" ? "Above 30 MHz (not shown), Technicians have everything." : "Above 30 MHz, every class has full privileges."}`;
  });
}

// --- 2. The checker --------------------------------------------------------------------------------------------------------
{
  const MODES: Record<string, { kind: Kind; lo: number; hi: number; name: string }> = { // occupied range relative to the displayed frequency, kHz
    usb: { kind: "phone", lo: 0, hi: 3, name: "USB phone" }, lsb: { kind: "phone", lo: -3, hi: 0, name: "LSB phone" }, cw: { kind: "cw", lo: -0.05, hi: 0.05, name: "CW" },
    data: { kind: "data", lo: 0, hi: 2.8, name: "USB data" }, fm: { kind: "phone", lo: -8, hi: 8, name: "FM phone" },
  };
  let result = { ok: false, why: "" };
  const s = new Scene(el("s-check"), (g, w, h) => {
    const f = Number((el("ck-f") as HTMLInputElement).value), m = MODES[sel("ck-m")], cls = sel("ck-c") as Cls;
    const band = BANDS.find((b) => f >= b.lo - 0.05 && f <= b.hi + 0.05);
    if (!band || !Number.isFinite(f)) { label(g, "enter a frequency inside an amateur band", w / 2, h / 2, C.muted, "center", 12); return; }
    // zoom to ±25 kHz around the dial (or the whole band if narrower)
    const span = Math.min(0.025, (band.hi - band.lo) / 2), lo = f - span, hi = f + span, L = 20, R = w - 20, y = 40, bh = 40;
    const px = (x: number) => L + ((x - lo) / (hi - lo)) * (R - L);
    for (const sg of band.segments) {
      const a = Math.max(lo, sg.lo), b = Math.min(hi, sg.hi); if (b <= a) continue;
      const allowed = sg.classes.includes(cls) && sg.kinds.includes(m.kind);
      g.fillStyle = allowed ? "#83c16733" : "#fc625522"; g.fillRect(px(a), y, px(b) - px(a), bh);
    }
    for (const e of [band.lo, band.hi, ...band.segments.flatMap((sg) => [sg.lo, sg.hi])]) if (e > lo && e < hi) { line(g, px(e), y - 8, px(e), y + bh + 8, C.muted, 1, [3, 3]); label(g, e.toFixed(3), px(e), y + bh + 22, C.muted, "center", 9); }
    g.fillStyle = result.ok ? C.green : C.red; g.fillRect(px(f + m.lo / 1000), y + 10, Math.max(3, px(f + m.hi / 1000) - px(f + m.lo / 1000)), bh - 20);
    line(g, px(f), y - 14, px(f), y + bh, C.yellow, 2); label(g, "dial", px(f), y - 18, C.yellow, "center", 10);
    label(g, "green background: your class may send this mode here", L, h - 6, C.muted, "left", 9);
  }, 140, { animated: false, label: "The signal you'd transmit drawn against the band segments around the displayed frequency" });
  const upd = () => {
    const f = Number((el("ck-f") as HTMLInputElement).value), m = MODES[sel("ck-m")], cls = sel("ck-c") as Cls;
    result = Number.isFinite(f) ? check(f + m.lo / 1000, f + m.hi / 1000, m.kind, cls) : { ok: false, why: "enter a frequency" };
    el("ck-out").innerHTML = `${result.ok ? "<b class='pass'>Yes.</b>" : "<b class='fail'>No:</b>"} ${m.name} at ${f.toFixed(4)} MHz occupies ${(f + m.lo / 1000).toFixed(4)}–${(f + m.hi / 1000).toFixed(4)} MHz; ${result.why}.`;
    s.redraw();
  };
  ["ck-f", "ck-m", "ck-c"].forEach((id) => el(id).addEventListener("input", upd));
  upd();
}
