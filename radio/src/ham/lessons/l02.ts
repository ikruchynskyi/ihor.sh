// Lesson 2: prefixes, decibels, the S-meter, RMS, PEP and speech processing, sidebands at band edges.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const checked = (id: string) => (el(id) as HTMLInputElement).checked;
const PREFIX = [["p", "pico"], ["n", "nano"], ["µ", "micro"], ["m", "milli"], ["", ""], ["k", "kilo"], ["M", "mega"], ["G", "giga"]];

/** A plain decimal string for x (no exponent), trimmed. */
function plain(x: number): string {
  if (x === 0) return "0";
  const digits = Math.max(0, 12 - Math.floor(Math.log10(Math.abs(x))));
  let s = x.toFixed(Math.min(20, digits));
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}
const group = (s: string) => { const [i, f] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f.replace(/(\d{3})(?=\d)/g, "$1 ") : ""); };

// --- 1. Prefixes slide the decimal point ---------------------------------------------------------------------------------
{
  const s = new Scene(el("s-prefix"), (g, w, h) => {
    const [vs, unit] = (el("p-q") as HTMLSelectElement).value.split("|"), v = Number(vs), k = val("p-k");
    const txt = group(plain(v / 1000 ** k)), [sym, name] = PREFIX[k + 4];
    const size = txt.length > 26 ? 18 : 30;
    g.font = `600 ${size}px ui-monospace, Menlo, monospace`; g.textAlign = "center"; g.fillStyle = C.yellow;
    g.fillText(txt.length > 40 ? "(too many digits: pick a closer prefix)" : `${txt} ${sym}${unit}`, w / 2, 70);
    // the ladder of prefixes, ×1000 per step
    const L = 30, R = w - 30, y = h - 50, step = (R - L) / 7;
    line(g, L, y, R, y, C.axis, 2);
    PREFIX.forEach(([p, n], i) => {
      const x = L + i * step, on = i === k + 4;
      g.fillStyle = on ? C.yellow : C.grid; g.beginPath(); g.arc(x, y, on ? 9 : 6, 0, 2 * Math.PI); g.fill();
      label(g, p + unit, x, y - 16, on ? C.yellow : C.muted, "center", 12);
      label(g, n || "(none)", x, y + 24, on ? C.text : C.muted, "center", 10);
      if (i < 7) label(g, "×1000", x + step / 2, y + 4 - 14, "#4a5262", "center", 9);
    });
  }, 190, { animated: false, label: "A quantity written with different metric prefixes; each step moves the decimal point three places" });
  controls(s, ["p-q", "p-k"], () => {
    const [vs, unit] = (el("p-q") as HTMLSelectElement).value.split("|"), k = val("p-k"), [sym, name] = PREFIX[k + 4];
    el("p-ko").textContent = `${sym}${unit}`;
    el("r-prefix").innerHTML = `Same amount, written in ${name ? `<em class="y">${name}</em>${unit === "Hz" ? "hertz" : unit === "A" ? "amperes" : unit === "V" ? "volts" : "farads"}` : "plain units"}: <em class="y">${group(plain(Number(vs) / 1000 ** k))} ${sym}${unit}</em>.`;
  });
}

// --- 2. Decibels: hops of ×2 and ×10 -------------------------------------------------------------------------------------
const NICE = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 20, 25, 30, 40, 50, 60, 100, 120, 200, 250, 300, 400, 500, 1000];
const lgOf = (id: string) => Math.log10(NICE[val(id)]);
{
  const s = new Scene(el("s-db"), (g, w, h) => {
    const a = lgOf("d-a"), b = lgOf("d-b"), L = 40, R = w - 30, y = h - 60, px = (lg: number) => L + ((lg + 1) / 4) * (R - L);
    line(g, L, y, R, y, C.axis, 2);
    for (let d = -1; d <= 3; d++) for (const m of [1, 2, 5]) {
      const lg = d + Math.log10(m); if (lg > 3.001) continue;
      const x = px(lg); line(g, x, y - (m === 1 ? 8 : 4), x, y + (m === 1 ? 8 : 4), C.muted, 1);
      if (m === 1 || w > 600) label(g, `${+(10 ** lg).toPrecision(2)} W`, x, y + 24, m === 1 ? C.text : C.muted, "center", 10);
    }
    label(g, "watts, on a scale where every ×10 is the same distance", L, 18, C.muted, "left", 11);
    // hops of 3 dB (doublings) from a towards b
    const db = 10 * (b - a), dir = Math.sign(db), n = Math.floor(Math.abs(db) / 3 + 0.05);
    let cur = a;
    for (let i = 0; i < n; i++) {
      const nx = cur + dir * Math.log10(2), x0 = px(cur), x1 = px(nx), r = Math.abs(x1 - x0) / 2;
      g.strokeStyle = C.pink; g.lineWidth = 2; g.beginPath(); g.arc((x0 + x1) / 2, y, r, Math.PI, 2 * Math.PI); g.stroke();
      if (r > 14) label(g, dir > 0 ? "×2" : "÷2", (x0 + x1) / 2, y - r - 4, C.pink, "center", 10);
      cur = nx;
    }
    // tenfold brackets
    const tens = Math.floor(Math.abs(db) / 10 + 1e-9);
    for (let i = 0; i < tens; i++) { const x0 = px(a + dir * i), x1 = px(a + dir * (i + 1)), yy = y - 78 - i * 4; line(g, x0, yy, x1, yy, C.green, 2); line(g, x0, yy - 5, x0, yy + 5, C.green, 2); line(g, x1, yy - 5, x1, yy + 5, C.green, 2); label(g, dir > 0 ? "×10 = 10 dB" : "÷10 = −10 dB", (x0 + x1) / 2, yy - 8, C.green, "center", 10); }
    for (const [v, c] of [[a, C.blue], [b, C.yellow]] as const) { g.fillStyle = c; g.beginPath(); g.arc(px(v), y, 7, 0, 2 * Math.PI); g.fill(); }
  }, 220, { animated: false, label: "Two powers on a logarithmic scale; the decibel difference shown as doubling hops and tenfold spans" });
  const W = (lg: number) => +(10 ** lg).toPrecision(3);
  controls(s, ["d-a", "d-b"], () => {
    const a = lgOf("d-a"), b = lgOf("d-b"), db = 10 * (b - a), ratio = 10 ** (b - a);
    el("d-ao").textContent = `${W(a)} W`; el("d-bo").textContent = `${W(b)} W`;
    el("r-db").innerHTML = `<em class="b">${W(a)} W</em> → <em class="y">${W(b)} W</em>: ${ratio >= 1 ? `×${+ratio.toPrecision(3)}` : `÷${+(1 / ratio).toPrecision(3)}`} = <em class="p">${db >= 0 ? "+" : ""}${db.toFixed(1)} dB</em>${Math.abs(db) >= 2.5 ? ` (about ${Math.round(Math.abs(db) / 3)} ${Math.abs(db) >= 4.5 ? "doublings" : "doubling"}${db < 0 ? " down" : ""})` : ""}`;
  });
}

// --- 3. The S-meter ------------------------------------------------------------------------------------------------------
{
  const MIN = -127, MAX = -33, S9 = -73;
  const s = new Scene(el("s-smeter"), (g, w, h) => {
    const p = val("m-p"), cx = w / 2, cy = h - 20, r = Math.min(w / 2 - 30, h - 50);
    const ang = (dbm: number) => Math.PI + ((dbm - MIN) / (MAX - MIN)) * Math.PI;
    g.lineWidth = 6; g.strokeStyle = C.grid; g.beginPath(); g.arc(cx, cy, r, Math.PI, ang(S9)); g.stroke();
    g.strokeStyle = "#5a2a28"; g.beginPath(); g.arc(cx, cy, r, ang(S9), 2 * Math.PI); g.stroke();
    for (let sN = 1; sN <= 9; sN++) { const a = ang(S9 - (9 - sN) * 6); line(g, cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), C.text, 2); label(g, `${sN}`, cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 18) + 4, C.text, "center", 12); }
    for (const over of [20, 40]) { const a = ang(S9 + over); line(g, cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), C.red, 2); label(g, `+${over}`, cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22) + 4, C.red, "center", 12); }
    label(g, "S", cx - r - 10, cy - 10, C.muted, "center", 14);
    const a = ang(p); line(g, cx, cy, cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), C.yellow, 3);
    g.fillStyle = C.yellow; g.beginPath(); g.arc(cx, cy, 6, 0, 2 * Math.PI); g.fill();
  }, 230, { animated: false, label: "An S meter: S1 to S9 in steps of 6 dB, then decibels over S9" });
  controls(s, ["m-p"], () => {
    const p = val("m-p"), watts = 10 ** ((p - 30) / 10);
    const reading = p >= S9 ? `S9${p > S9 ? ` + ${p - S9} dB` : ""}` : `S${Math.max(0, 9 - Math.round((S9 - p) / 6))}`;
    el("m-po").textContent = `${p} dBm`;
    el("r-smeter").innerHTML = `Reads <em class="y">${reading}</em>. That's ${p} dBm, or ${watts.toExponential(1).replace("e", " × 10^")} watts${p > S9 ? `, ${+(10 ** ((p - S9) / 10)).toPrecision(2)}× the power of S9` : ""}. (Calibrated HF meters put S9 at −73 dBm, 50 microvolts into 50 Ω.)`;
  });
}

// --- 4. RMS --------------------------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-rms"), (g, w, h, t) => {
    const vp = val("r-v"), L = 40, R = w - 20, mid = h * 0.42, A = h * 0.3, pb = h - 16, pa = h * 0.3;
    line(g, L, mid, R, mid, C.axis, 1);
    const ph = t * 1.2;
    // voltage
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath();
    for (let x = L; x <= R; x++) { const y = mid - A * Math.sin(((x - L) / (R - L)) * 4 * Math.PI + ph); x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    line(g, L, mid - A, R, mid - A, C.yellow, 1, [2, 4]); label(g, `peak ${vp} V`, R, mid - A - 6, C.yellow, "right", 11);
    line(g, L, mid - A * Math.SQRT1_2, R, mid - A * Math.SQRT1_2, C.green, 1.5, [6, 4]); label(g, `RMS ${(vp * Math.SQRT1_2).toFixed(1)} V`, L + 4, mid - A * Math.SQRT1_2 - 6, C.green, "left", 11);
    // power (voltage squared), with its average at exactly half
    g.strokeStyle = C.pink; g.lineWidth = 2; g.beginPath();
    for (let x = L; x <= R; x++) { const sn = Math.sin(((x - L) / (R - L)) * 4 * Math.PI + ph), y = pb - pa * sn * sn; x === L ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    line(g, L, pb - pa / 2, R, pb - pa / 2, C.pink, 1.5, [6, 4]); label(g, "average power = half the peak power", R, pb - pa / 2 - 6, C.pink, "right", 11);
    label(g, "voltage", L, 14, C.yellow, "left", 11); label(g, "power into a resistor (always positive)", L, pb - pa - 6, C.pink, "left", 11);
  }, 300, { label: "A sine voltage, its RMS level, and the power it delivers, whose average is half its peak" });
  controls(s, ["r-v"], () => {
    const vp = val("r-v"), rms = vp * Math.SQRT1_2;
    el("r-vo").textContent = `${vp} V`;
    el("r-rms").innerHTML = `Peak <em class="y">${vp} V</em>, peak-to-peak ${2 * vp} V, RMS <em class="g">${rms.toFixed(1)} V</em>. Into 50 Ω that's ${(rms * rms / 50).toFixed(1)} W average.`;
  });
}

// --- 5. PEP and speech processing ---------------------------------------------------------------------------------------
{
  // A made-up stretch of speech envelope: syllables of different loudness with short gaps, tuned to the ~2.5:1 of real speech.
  const N = 600, voice = new Float32Array(N);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N;) { const len = 25 + Math.floor(rnd() * 50), amp = 0.55 + 0.45 * rnd() ** 1.5, gap = 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < len && i < N; k++, i++) voice[i] = amp * Math.sin((Math.PI * k) / len) ** 0.3; i += gap; }
  const peak = Math.max(...voice); voice.forEach((v, i) => (voice[i] = v / peak));
  const proc = voice.map((v) => Math.min(1, v ** 0.45)); // compression: soft parts lifted, peaks capped
  const env = () => { const m = (el("e-mode") as HTMLSelectElement).value; return m === "carrier" ? new Float32Array(N).fill(1) : m === "proc" ? proc : voice; };
  const ratio = (e: Float32Array) => { let mx = 0, sum = 0; for (const v of e) { mx = Math.max(mx, v * v); sum += v * v; } return mx / (sum / e.length); };
  const s = new Scene(el("s-pep"), (g, w, h) => {
    const e = env(), L = 20, R = w - 20, mid = h / 2, A = h * 0.4, x = (i: number) => L + (i / (N - 1)) * (R - L);
    g.strokeStyle = "#58c4dd55"; g.lineWidth = 1; g.beginPath(); // the RF wave inside the envelope, drawn as fast stripes
    for (let i = 0; i < N; i++) { g.moveTo(x(i), mid - A * e[i]); g.lineTo(x(i), mid + A * e[i]); }
    g.stroke();
    g.strokeStyle = C.blue; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < N; i++) (i ? g.lineTo(x(i), mid - A * e[i]) : g.moveTo(x(i), mid - A * e[i])); g.stroke();
    g.beginPath(); for (let i = 0; i < N; i++) (i ? g.lineTo(x(i), mid + A * e[i]) : g.moveTo(x(i), mid + A * e[i])); g.stroke();
    const avgAmp = Math.sqrt(1 / ratio(e)); // the steady envelope height that would deliver the average power
    line(g, L, mid - A, R, mid - A, C.yellow, 1.5, [6, 4]); label(g, "PEP: the strongest moment", R, mid - A - 6, C.yellow, "right", 11);
    line(g, L, mid - A * avgAmp, R, mid - A * avgAmp, C.green, 1.5, [6, 4]); label(g, "average power (as a steady envelope)", L + 4, mid - A * avgAmp - 6, C.green, "left", 11);
  }, 220, { animated: false, label: "A transmitted envelope with its peak envelope power and its average power" });
  controls(s, ["e-mode"], () => {
    const r = ratio(env()), m = (el("e-mode") as HTMLSelectElement).value;
    el("r-pep").innerHTML = `PEP to average power: <em class="y">${r.toFixed(2)} : 1</em>. ${m === "carrier" ? "A steady carrier: every moment is the peak." : m === "voice" ? "Soft sounds and pauses keep the average well below the peaks." : "Same peaks, but the soft sounds are lifted: more average power, a louder-sounding signal."} At 100 W PEP that's ${(100 / r).toFixed(0)} W average.`;
  });
}

// --- 6. Sidebands near a band edge -------------------------------------------------------------------------------------------
{
  const LO = 0, HI = 20; // the phone segment, in kHz from its lower edge
  const s = new Scene(el("s-edge"), (g, w, h) => {
    const usb = checked("g-usb"), f = val("g-f"), L = 30, R = w - 30, px = (k: number) => L + ((k + 4) / 28) * (R - L), y = h - 50;
    g.fillStyle = "#83c16722"; g.fillRect(px(LO), 30, px(HI) - px(LO), y - 30);
    line(g, px(LO), 24, px(LO), y, C.green, 2); line(g, px(HI), 24, px(HI), y, C.green, 2);
    label(g, "segment edge", px(LO), 18, C.green, "center", 10); label(g, "segment edge", px(HI), 18, C.green, "center", 10);
    line(g, L, y, R, y, C.axis, 2);
    for (let k = -4; k <= 24; k += 2) label(g, `${k}`, px(k), y + 18, C.muted, "center", 10);
    label(g, "kHz from the lower edge", R, y + 34, C.muted, "right", 10);
    const a = usb ? f : f - 3, b = usb ? f + 3 : f, out = a < LO || b > HI;
    g.fillStyle = out ? "#fc625588" : "#58c4dd88"; // the voice spectrum, sloping like a real one
    g.beginPath(); g.moveTo(px(a), y); g.lineTo(px(usb ? a + 0.3 : a), y - 70); g.lineTo(px(usb ? b : b - 0.3), y - (usb ? 30 : 70)); g.lineTo(px(b), y); g.fill();
    line(g, px(f), y - 100, px(f), y + 4, C.yellow, 2); label(g, `dial ${f} kHz`, px(f), y - 106, C.yellow, "center", 11);
  }, 220, { animated: false, label: "A 3 kHz wide sideband next to the displayed frequency, near the edges of a band segment" });
  controls(s, ["g-usb", "g-f"], () => {
    const usb = checked("g-usb"), f = val("g-f"), a = usb ? f : f - 3, b = usb ? f + 3 : f;
    el("g-fo").textContent = `${f} kHz`;
    el("r-edge").innerHTML = `${usb ? "USB" : "LSB"} occupies ${a} to ${b} kHz. ` + (a < LO ? `<em style="color:var(--red)">Part of the signal is below the segment edge.</em> Keep LSB at least 3 kHz above it.`
      : b > HI ? `<em style="color:var(--red)">Part of the signal is above the segment edge.</em> Keep USB at least 3 kHz below it.` : `<em class="g">Inside the segment.</em>`);
  });
}
