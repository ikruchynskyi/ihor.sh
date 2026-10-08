// Lesson 11: receivers and transmitters. Clickable block diagrams, noise floor, intercept point, amplifier classes, DDS.
import "../ham.css";
import { C, Scene, controls, val, label, line } from "../../course/anim.ts";

const el = (id: string) => document.getElementById(id)!;
const sel = (id: string) => (el(id) as HTMLSelectElement).value;
const TAU = 2 * Math.PI;

// --- 1. Clickable block diagrams ---------------------------------------------------------------------------------------------
const RX: [string, string][] = [
  ["Antenna", "Catches every signal around, strong and weak, wanted and not (<a href='./07-antennas.html'>lesson 7</a>)."],
  ["Preselector", "A broad filter that lets only the band you're on through, so strong signals elsewhere can't overload what follows. It also rejects the image frequency."],
  ["RF amplifier", "Boosts weak signals before the noisy mixer. Its noise figure largely sets the receiver's sensitivity."],
  ["Mixer + LO", "Multiplies the signal by the <b>local oscillator</b> (the VFO you tune), shifting the station you want to the fixed IF. It converts a signal from one frequency to another (<a href='../../course/05-moving-a-station.html'>course ch. 5</a>, <a href='../../course/12-inside-the-dongle.html#image'>ch. 12</a>)."],
  ["IF filter", "The sharp filter that gives the receiver its <b>selectivity</b>: easy to make because it works at one fixed frequency. Often crystal filters, with a choice of widths."],
  ["IF amplifier + AGC", "Most of the gain, automatically turned down for strong signals (<a href='../../course/11-numbers-to-speakers.html#agc'>course ch. 11</a>)."],
  ["Detector", "Recovers the audio: a <b>product detector</b> for SSB and CW, an <b>envelope detector</b> for AM, a <b>discriminator</b> for FM (<a href='../../course/09-fm-listening-to-the-speed.html#demod'>ch. 9</a>, <a href='../../course/10-am-ssb-and-morse.html'>ch. 10</a>)."],
  ["Audio + squelch", "Amplifies the audio for the speaker; squelch mutes it between transmissions."],
];
const TX: [string, string][] = [
  ["Microphone", "Your voice as an audio signal: the baseband. Too much mic gain distorts it."],
  ["Balanced modulator", "Mixes the audio with a carrier oscillator, leaving both sidebands and suppressing the carrier: double-sideband RF."],
  ["Sideband filter", "Keeps one sideband: now it's SSB. (DSP radios do this step and the previous one with I/Q and a Hilbert transform.)"],
  ["Mixer + VFO", "Moves the signal to the frequency you've tuned."],
  ["Driver", "Amplifies it to the level the final amplifier needs."],
  ["Power amplifier", "The final stage: tens to hundreds of watts. Must be linear for SSB (<a href='#classes'>below</a>)."],
  ["Low-pass filter", "Removes harmonics (multiples of your frequency) before they reach the antenna."],
  ["Antenna", "Through the feed line and maybe a tuner (<a href='./08-feed-lines-and-swr.html'>lesson 8</a>)."],
];
for (const [chainId, infoId, stages] of [["rx-chain", "rx-info", RX], ["tx-chain", "tx-info", TX]] as const) {
  const box = el(chainId), info = el(infoId);
  box.innerHTML = stages.map(([name], i) => `${i ? "<span aria-hidden='true'>→</span>" : ""}<button type="button" data-i="${i}" aria-pressed="false">${name}</button>`).join("");
  const pick = (i: number) => { box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i! === i))); info.innerHTML = `<b>${stages[i][0]}.</b> ${stages[i][1]}`; };
  box.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) pick(+b.dataset.i!); });
  pick(chainId === "rx-chain" ? 3 : 1);
}

// --- 2. Noise floor and bandwidth -------------------------------------------------------------------------------------------------
{
  const SIG = -125; // a weak signal, dBm
  const bwOf = () => 50 * 300 ** val("nz-b"); // 50 Hz … 15 kHz
  const floor = () => -174 + 10 * Math.log10(bwOf()) + val("nz-f");
  const s = new Scene(el("s-noise"), (g, w, h, t) => {
    const bw = bwOf(), nf = floor();
    // left: a spectrum with the filter passband
    const L = 20, R = w * 0.6, B = h - 26, T = 20, px = (f: number) => L + ((f + 8000) / 16000) * (R - L);
    g.fillStyle = "#58c4dd22"; g.fillRect(px(-bw / 2), T, Math.max(2, px(bw / 2) - px(-bw / 2)), B - T);
    let seed = Math.floor(t * 20) + 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = "#8a93a3"; g.lineWidth = 1; g.beginPath();
    for (let x = L; x <= R; x++) { const y = B - 30 - rnd() * 18; x === L ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    line(g, px(300), B - 30, px(300), B - 110, C.yellow, 3); label(g, "signal", px(300), B - 116, C.yellow, "center", 10);
    label(g, `filter ${bw >= 1000 ? (bw / 1000).toFixed(1) + " kHz" : Math.round(bw) + " Hz"} wide`, px(0), T - 4, C.blue, "center", 10);
    for (const f of [-8000, 0, 8000]) label(g, `${f / 1000} kHz`, px(f), B + 16, C.muted, "center", 9);
    // right: signal and noise power through the filter, in dBm
    const bx = w * 0.68, bw2 = 40, top = -100, bot = -160, py = (d: number) => T + ((top - d) / (top - bot)) * (B - T);
    for (const d of [-100, -120, -140, -160]) { line(g, bx - 6, py(d), w - 20, py(d), "#1f242d", 1); label(g, `${d}`, bx - 10, py(d) + 4, C.muted, "right", 9); }
    for (const [k, d, col, name] of [[0, SIG, C.yellow, "signal"], [1, nf, C.muted, "noise"]] as const) { const x = bx + k * 70; g.fillStyle = col; g.fillRect(x, py(d), bw2, B - py(d)); label(g, name, x + bw2 / 2, B + 16, col, "center", 10); }
    label(g, "dBm", bx - 10, T - 6, C.muted, "right", 9);
  }, 240, { label: "A weak signal and the noise let in by the receiver's filter: wider filters let in more noise" });
  controls(s, ["nz-b", "nz-f"], () => {
    const bw = bwOf(), nf = floor(), snr = SIG - nf;
    el("nz-bo").textContent = bw >= 1000 ? `${(bw / 1000).toFixed(1)} kHz` : `${Math.round(bw)} Hz`; el("nz-fo").textContent = `${val("nz-f")} dB`;
    el("r-noise").innerHTML = `Noise floor = −174 + 10·log₁₀(${Math.round(bw)}) + ${val("nz-f")} = <em>${nf.toFixed(1)} dBm</em>. A −125 dBm signal is ${snr >= 0 ? `<em class="g">${snr.toFixed(1)} dB above</em>` : `<em class="p">${(-snr).toFixed(1)} dB below</em>`} the noise.`;
  });
}

// --- 3. Third-order intercept ---------------------------------------------------------------------------------------------------------------
{
  const IP3 = 40, NOISE = -130, P1 = 25; // dBm: intercept, noise floor, 1 dB compression (output referred, 0 dB gain)
  const fund = (p: number) => p - 10 * Math.log10(1 + 10 ** ((p - P1 - 6) / 10)) * 0.9; // straight, then bending over
  const im3 = (p: number) => 3 * p - 2 * IP3;
  const s = new Scene(el("s-ip3"), (g, w, h) => {
    const pin = val("ip-in"), L = 50, R = w - 20, T = 16, B = h - 30;
    const px = (d: number) => L + ((d + 120) / 180) * (R - L), py = (d: number) => B - ((d + 150) / 210) * (B - T);
    for (const d of [-150, -100, -50, 0, 50]) { line(g, L, py(d), R, py(d), "#1f242d", 1); label(g, `${d}`, L - 4, py(d) + 4, C.muted, "right", 9); }
    for (const d of [-120, -80, -40, 0, 40]) label(g, `${d}`, px(d), B + 16, C.muted, "center", 9);
    label(g, "input dBm →", R, B + 28, C.muted, "right", 9); label(g, "output dBm", L + 4, T + 4, C.muted, "left", 9);
    line(g, L, py(NOISE), R, py(NOISE), C.muted, 1.5, [5, 4]); label(g, "noise floor", R, py(NOISE) - 5, C.muted, "right", 10);
    g.strokeStyle = C.blue; g.lineWidth = 2.5; g.beginPath(); for (let d = -120; d <= 60; d++) { const y = py(fund(d)); d === -120 ? g.moveTo(px(d), y) : g.lineTo(px(d), y); } g.stroke();
    line(g, px(P1), py(P1), px(IP3), py(IP3), C.blue, 1, [3, 3]);
    g.strokeStyle = C.red; g.lineWidth = 2.5; g.beginPath(); let st = false; for (let d = -120; d <= IP3; d++) { const v = im3(d); if (v < -150) continue; st ? g.lineTo(px(d), py(v)) : g.moveTo(px(d), py(v)); st = true; } g.stroke();
    g.fillStyle = C.yellow; g.beginPath(); g.arc(px(IP3), py(IP3), 5, 0, TAU); g.fill(); label(g, `IP3 = +${IP3} dBm`, px(IP3) - 6, py(IP3) - 8, C.yellow, "right", 10);
    label(g, "wanted signals (slope 1)", px(-60), py(fund(-60)) - 8, C.blue, "center", 10); label(g, "3rd-order products (slope 3)", px(0), py(im3(0)) + 18, C.red, "center", 10);
    line(g, px(pin), T, px(pin), B, C.white, 1.5, [4, 3]);
  }, 280, { animated: false, label: "Output against input for the wanted signals and their third-order intermodulation, meeting at the intercept point" });
  controls(s, ["ip-in"], () => {
    const p = val("ip-in"), i = im3(p);
    el("ip-ino").textContent = `${p} dBm`;
    el("r-ip3").innerHTML = `Signals at ${p} dBm make intermod products at <em style="color:var(--red)">${i.toFixed(0)} dBm</em>: ${i < NOISE ? "below the noise floor, so harmless." : `${(i - NOISE).toFixed(0)} dB above the noise floor: phantom signals you'll hear.`} Each 1 dB stronger input → 3 dB stronger products.`;
  });
}

// --- 4. Amplifier classes -----------------------------------------------------------------------------------------------------------------------
{
  const INFO: Record<string, [number, string]> = { // conduction angle (degrees), efficiency note
    A: [360, "conducts all the time: faithful, but 25–50% efficient"], AB: [240, "conducts for more than half: linear enough for SSB, about 50–65%"],
    B: [180, "each device conducts exactly half (push-pull pairs them): up to 78% in theory"], C: [120, "short pulses, restored to a sine by a tuned circuit: 70%+, but only for FM and CW"],
    D: [0, "fully on or fully off: 90%+, with a filter to remove the harmonics"],
  };
  const s = new Scene(el("s-class"), (g, w, h, t) => {
    const k = sel("cl-c"), [cond] = INFO[k], L = 30, R = w - 20, mid1 = h * 0.3, mid2 = h * 0.75, A = h * 0.17, ph = t * 2;
    const out = (th: number) => {
      const v = Math.sin(th);
      if (k === "A") return (1 + v) / 2;
      if (k === "D") return v > 0 ? 1 : 0;
      const c = Math.cos((cond * Math.PI) / 360); return Math.max(0, v - c) / (1 - c);
    };
    line(g, L, mid1, R, mid1, C.axis, 1); line(g, L, mid2, R, mid2, C.axis, 1);
    label(g, "input", L, mid1 - A - 6, C.green, "left", 10); label(g, "current through the transistor", L, mid2 - A - 10, C.yellow, "left", 10);
    g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath(); for (let x = L; x <= R; x++) { const th = ((x - L) / 80) - ph; x === L ? g.moveTo(x, mid1 - A * Math.sin(th)) : g.lineTo(x, mid1 - A * Math.sin(th)); } g.stroke();
    g.strokeStyle = C.yellow; g.lineWidth = 2.5; g.beginPath(); for (let x = L; x <= R; x++) { const th = ((x - L) / 80) - ph; const y = mid2 - A * 1.3 * out(th) + A * 0.65; x === L ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    if (k !== "A") { g.strokeStyle = "#ffffff33"; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); for (let x = L; x <= R; x++) { const th = ((x - L) / 80) - ph; const y = mid2 - A * 0.65 * Math.sin(th); x === L ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.setLineDash([]); label(g, "(dashed: the sine restored by the output tank or filter)", R, h - 6, C.muted, "right", 9); }
  }, 260, { label: "An input sine wave and the current through the amplifying device for amplifier classes A, AB, B, C and D" });
  controls(s, ["cl-c"], () => { const k = sel("cl-c"), [cond, note] = INFO[k]; el("r-class").innerHTML = `Class ${k}: ${k === "D" ? "a switch" : `conducts for <em class="y">${cond}°</em> of each cycle`}; ${note}.`; });
}

// --- 5. Direct digital synthesis --------------------------------------------------------------------------------------------------------------------
{
  const STEPS = 32, CLOCK = 32; // 32-step accumulator, 32 MHz clock (made-up but tidy numbers)
  const s = new Scene(el("s-dds"), (g, w, h, t) => {
    const word = val("dd-w"), n = Math.floor(t * 4); // clock ticks shown slowed down
    const cx = 80, cy = h / 2, r = Math.min(60, h / 2 - 20);
    g.strokeStyle = C.axis; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    for (let i = 0; i < STEPS; i++) { const a = (i / STEPS) * TAU; line(g, cx + Math.cos(a) * (r - 4), cy - Math.sin(a) * (r - 4), cx + Math.cos(a) * r, cy - Math.sin(a) * r, "#4a5262", 1); }
    const acc = (n * word) % STEPS, a = (acc / STEPS) * TAU;
    line(g, cx, cy, cx + Math.cos(a) * r, cy - Math.sin(a) * r, C.blue, 3);
    label(g, `phase ${acc}/${STEPS}`, cx, cy + r + 18, C.blue, "center", 10); label(g, `+${word} per tick`, cx, cy - r - 8, C.muted, "center", 10);
    // the lookup table output as a staircase over the last ticks, then smoothed
    const L = 170, R = w - 20, A = h * 0.32, cols = 48, dx = (R - L) / cols;
    line(g, L, cy, R, cy, C.axis, 1);
    g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath();
    for (let c = 0; c < cols; c++) { const tick = n - cols + 1 + c, v = Math.sin((((tick * word) % STEPS) / STEPS) * TAU), y = cy - A * Math.round(v * 8) / 8; const x = L + c * dx; c ? g.lineTo(x, y) : g.moveTo(x, y); g.lineTo(x + dx, y); }
    g.stroke();
    g.strokeStyle = C.green; g.lineWidth = 1.5; g.beginPath();
    for (let x = L; x <= R; x++) { const tick = n - cols + 1 + (x - L) / dx - 0.5, v = Math.sin(((tick * word) / STEPS) * TAU); x === L ? g.moveTo(x, cy - A * v) : g.lineTo(x, cy - A * v); }
    g.stroke();
    label(g, "lookup table → DAC (yellow steps), after the low-pass filter (green)", L, 16, C.muted, "left", 10);
  }, 220, { label: "A direct digital synthesizer: a phase accumulator, a lookup table, a DAC staircase and the filtered sine" });
  controls(s, ["dd-w"], () => {
    const word = val("dd-w"), f = (word / STEPS) * CLOCK;
    el("dd-wo").textContent = `${word}`;
    el("r-dds").innerHTML = `Output = tuning word ÷ ${STEPS} × clock = ${word}/${STEPS} × ${CLOCK} MHz = <em class="y">${f.toFixed(1)} MHz</em>. Real DDS chips use 32- or 48-bit accumulators: steps of a fraction of a hertz.`;
  });
}
