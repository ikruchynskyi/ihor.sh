// Workshop labs: common-mode current on coax with and without a choke balun, and a half-splitting troubleshooting game.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;

// --- 1. Balun -------------------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-balun"), (g, w, h, t) => {
    const asym = val("bl-a"), balun = checked("bl-b"), cm = balun ? asym * 0.05 : asym * 0.6; // common-mode share of the current
    const cx = w / 2, top = 40, L = Math.min(w * 0.42, 260), ph = t * 4;
    // the dipole, with current shown as moving dots whose density follows the current
    line(g, cx - L, top, cx - 8, top, C.text, 4); line(g, cx + 8, top, cx + L, top, C.text, 4);
    for (let k = 0; k < 14; k++) { const u = ((k / 14 + ph * 0.05) % 1), a = Math.cos((Math.PI / 2) * u); g.fillStyle = `rgba(88, 196, 221, ${a})`; g.beginPath(); g.arc(cx - 8 - u * (L - 8), top, 3, 0, 2 * Math.PI); g.fill(); g.beginPath(); g.arc(cx + 8 + u * (L - 8), top, 3, 0, 2 * Math.PI); g.fill(); }
    // coax going down, possibly slanted
    const bx = cx + asym * 120, by = h - 20;
    line(g, cx, top + 6, bx, by, "#5b6475", 9); line(g, cx, top + 6, bx, by, "#14171d", 3);
    if (balun) { g.fillStyle = "#3a4252"; g.fillRect(cx - 12, top + 14, 24, 30); label(g, "choke", cx + 16, top + 34, C.muted, "left", 10); }
    // common-mode current on the outside of the shield, radiating
    for (let k = 0; k < 10; k++) { const u = (k / 10 + ph * 0.05) % 1, x = cx + (bx - cx) * u, y = top + 6 + (by - top - 6) * u; g.fillStyle = `rgba(252, 98, 85, ${Math.min(1, cm * 2)})`; g.beginPath(); g.arc(x + 7, y, 3, 0, 2 * Math.PI); g.fill(); }
    if (cm > 0.1) for (let r = 1; r <= 3; r++) { const rr = ((t * 30 + r * 25) % 75) + 10; g.strokeStyle = `rgba(252, 98, 85, ${0.5 * cm * (1 - rr / 85)})`; g.lineWidth = 2; g.beginPath(); g.arc((cx + bx) / 2 + 10, (top + by) / 2, rr, -0.8, 0.8); g.stroke(); }
    label(g, "to the shack", bx, h - 4, C.muted, "center", 10);
  }, 260, { label: "A dipole fed with coax; common-mode current flows on the outside of the shield and radiates unless a choke balun blocks it" });
  controls(s, ["bl-a", "bl-b"], () => {
    const asym = val("bl-a"), balun = checked("bl-b"), cm = balun ? asym * 0.05 : asym * 0.6;
    el("bl-ao").textContent = `${Math.round(asym * 100)}%`;
    el("r-balun").innerHTML = `About <em class="${cm > 0.1 ? "p" : "g"}">${Math.round(cm * 100)}%</em> of the current runs down the outside of the shield (an illustration, not a field solution). ${balun ? "The choke blocks it." : cm > 0.1 ? "The feed line is radiating, and carrying RF back to your station." : ""}`;
  });
}

// --- 2. Troubleshooting game ---------------------------------------------------------------------------------------------------
{
  // The signal path, in order; the local oscillator is a side input that the mixer needs.
  const STAGES = ["Antenna input", "RF amp", "Mixer", "Local osc.", "IF filter", "IF amp", "Detector", "Audio amp"];
  const LO = 3, MIXER = 2, PATH = STAGES.map((_, i) => i).filter((i) => i !== LO);
  let fault = 0, probes = 0, found = false, games = 0, totalProbes = 0;
  const known = new Map<number, boolean>(); // stage → output good?
  const box = el("tb-stages"), msg = el("r-tb");
  /** What the probe shows at a stage's output: every path stage up to it must work, plus the LO once past the mixer. */
  const reads = (i: number) => i === LO ? fault !== LO : PATH.filter((k) => k <= i).every((k) => k !== fault) && (i < MIXER || fault !== LO);
  const render = () => {
    box.innerHTML = STAGES.map((n, i) => `${i && i !== LO ? "<span aria-hidden='true'>→</span>" : i === LO ? "<span aria-hidden='true'>↘</span>" : ""}<button type="button" data-i="${i}" class="${known.has(i) ? (known.get(i) ? "ok" : "bad") : ""}">${n}</button>`).join("");
    el("tb-score").textContent = games ? `average ${(totalProbes / games).toFixed(1)} probes over ${games} faults` : "";
  };
  const newFault = () => { fault = Math.floor(Math.random() * STAGES.length); probes = 0; found = false; known.clear(); render(); msg.textContent = "Signal generator connected. Where do you probe first?"; };
  box.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button"); if (!b || found) return;
    const i = +b.dataset.i!; probes++;
    const good = reads(i); known.set(i, good);
    const prev = PATH[PATH.indexOf(i) - 1];
    const inputKnownGood = i === LO || i === PATH[0] || known.get(prev) === true;
    const loKnownGood = i !== MIXER || known.get(LO) === true;
    if (!good && i === fault && inputKnownGood && loKnownGood) {
      found = true; games++; totalProbes += probes; render();
      msg.innerHTML = `<em class="g">Found it in ${probes} probe${probes > 1 ? "s" : ""}</em>: the ${STAGES[fault]} is dead${i === LO ? "" : " (its input is good, its output isn't)"}. ${probes <= 3 ? "Half-splitting pays off." : "Try starting in the middle next time."}`;
      return;
    }
    render();
    msg.innerHTML = i === LO ? (good ? "The local oscillator is running fine." : "The local oscillator has no output!")
      : good ? `Good signal after the ${STAGES[i]}: the fault is further along.`
      : `No proper signal after the ${STAGES[i]}: the fault is here or earlier${i >= MIXER ? " (or in the local oscillator the mixer needs)" : ""}.${!good && i === fault && !inputKnownGood ? " Is its input good?" : ""}`;
  });
  el("tb-new").addEventListener("click", newFault);
  newFault();
}
