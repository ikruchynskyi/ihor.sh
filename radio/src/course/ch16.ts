// Chapter 16: the whole receiver. The map, a benchmark in your own browser, and what's next.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, label, line } from "./anim.ts";
import { synth, Mixer, FirDecimator, FmDemod, Deemphasis, firLowpass, Agc } from "../dsp.ts";
import { spectrumOfIQ } from "../waterfall.ts";

const el = (id: string) => document.getElementById(id)!;

// --- 1. The map: every block, its rate, its chapter ---------------------------------------------------------------------------
const BLOCKS: { name: string; rate: string; data: string; ch: string; file: string; where: string }[] = [
  { name: "antenna + tuner", rate: "radio waves", data: "", ch: "12", file: "12-inside-the-dongle.html#path", where: "hardware" },
  { name: "ADC + resampler", rate: "28.8 → 2.4 MS/s", data: "", ch: "3, 12", file: "03-taking-snapshots.html#strip", where: "hardware" },
  { name: "USB / network", rate: "2.4 MS/s", data: "4.8 MB/s", ch: "13–15", file: "13-usb-from-zero.html#bulk", where: "driver" },
  { name: "bytes → numbers", rate: "2.4 MS/s", data: "", ch: "2, 3", file: "02-arrows-as-numbers.html#code", where: "iq.ts" },
  { name: "spectrum + waterfall", rate: "~18 rows/s", data: "", ch: "4", file: "04-winding-machine.html#spectrum", where: "waterfall.ts" },
  { name: "mixer", rate: "2.4 MS/s", data: "", ch: "5", file: "05-moving-a-station.html#nco", where: "dsp.ts" },
  { name: "filter + decimate", rate: "2.4 → 0.3 MS/s", data: "", ch: "6, 7", file: "07-throwing-away-snapshots.html#skip", where: "dsp.ts" },
  { name: "FM demodulator", rate: "300 kS/s", data: "", ch: "9", file: "09-fm-listening-to-the-speed.html#demod", where: "dsp.ts" },
  { name: "de-emphasis + audio filter", rate: "300 → 50 kS/s", data: "", ch: "9, 11", file: "09-fm-listening-to-the-speed.html#deemph", where: "dsp.ts" },
  { name: "AGC + squelch", rate: "50 kS/s", data: "", ch: "11", file: "11-numbers-to-speakers.html#agc", where: "dsp.ts" },
  { name: "speakers", rate: "48 kS/s", data: "", ch: "11", file: "11-numbers-to-speakers.html#clocks", where: "Web Audio" },
];
{
  const box = el("map");
  box.innerHTML = BLOCKS.map((b, i) => `
    <a class="mp-b" href="./${b.file}">
      <span class="mp-n">${i + 1}</span><b>${b.name}</b>
      <span class="mp-r">${b.rate}${b.data ? " · " + b.data : ""}</span>
      <span class="mp-c">ch. ${b.ch} · ${b.where}</span>
    </a>${i < BLOCKS.length - 1 ? '<span class="mp-arrow" aria-hidden="true">↓</span>' : ""}`).join("");
}

// --- 2. Where the time goes: measured in this browser ---------------------------------------------------------------------------
{
  let results: [string, number][] | null = null;
  const s = new Scene(el("s-bench"), (g, w, h) => {
    if (!results) { label(g, "press Measure to time each block on one second of radio, here in your browser", w / 2, h / 2, C.muted, "center", 12); return; }
    const L = 190, R = w - 12, total = results.reduce((a, r) => a + r[1], 0), maxMs = Math.max(1000, total);
    const rowH = (h - 40) / (results.length + 1), px = (ms: number) => L + (ms / maxMs) * (R - L);
    line(g, px(1000), 6, px(1000), h - 26, C.red, 1.5, [5, 4]); label(g, "1 second: real time", px(1000), h - 10, C.red, "center", 11);
    [...results, ["total", total] as [string, number]].forEach(([name, ms], i) => {
      const y = 8 + i * rowH;
      label(g, name, L - 8, y + rowH / 2 + 4, i === results!.length ? C.yellow : C.text, "right", 11);
      g.fillStyle = i === results!.length ? C.yellow : C.blue; g.fillRect(L, y + 3, Math.max(1, px(ms) - L), rowH - 8);
      label(g, `${ms.toFixed(0)} ms`, px(ms) + 6, y + rowH / 2 + 4, C.muted, "left", 10);
    });
  }, 300, { animated: false, label: "How long each block takes to process one second of radio in this browser" });
  el("bn-go").addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true; b.textContent = "Measuring…";
    await new Promise((r) => setTimeout(r, 30));
    const FS = 2.4e6, x = synth(FS, 0.25, [{ kind: "FM", offset: 250e3, tone: 1000, amp: 0.5 }]); // a quarter second, scaled ×4
    const time = (fn: () => unknown) => { const t0 = performance.now(); fn(); return (performance.now() - t0) * 4; };
    const bytes = Uint8Array.from(x, (v) => Math.round(127.5 + v * 127.5));
    let iq!: Float32Array, mixed!: Float32Array, chan!: Float32Array, dem!: Float32Array, aud!: Float32Array;
    const taps = firLowpass(100e3 / FS, 100e3 / FS), atap = firLowpass(15e3 / 300e3, 10e3 / 300e3);
    results = [
      ["bytes → numbers", time(() => { iq = Float32Array.from(bytes, (v) => (v - 127.5) / 127.5); })],
      ["spectrum (16 FFTs per row)", time(() => { for (let r = 0; r < 18 / 4; r++) spectrumOfIQ(iq, 512, 16); })],
      ["mixer", time(() => { mixed = new Mixer(FS, 250e3).process(iq); })],
      [`filter + decimate (${taps.length} weights)`, time(() => { chan = new FirDecimator(taps, 8, 2).process(mixed); })],
      ["FM demodulator", time(() => { dem = new FmDemod().process(chan); })],
      ["de-emphasis + audio filter", time(() => { aud = new FirDecimator(atap, 6, 1).process(new Deemphasis(300e3).process(dem)); })],
      ["AGC", time(() => { new Agc(50e3).process(aud); })],
    ];
    s.redraw();
    const total = results.reduce((a, r) => a + r[1], 0);
    el("r-bench").innerHTML = `One second of radio takes <em class="y">${total.toFixed(0)} ms</em> to process here: ${(total / 10).toFixed(0)}% of this computer's time (on one core). The rest is free for drawing and everything else.`;
    b.disabled = false; b.textContent = "Measure again";
  });
}
