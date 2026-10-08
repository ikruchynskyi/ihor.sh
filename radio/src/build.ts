// The developer guide's interactive parts: the waterfall pipeline, the USB streaming timeline,
// and three source viewers that load the real files.
import "./course/course.css";
import { C, Scene, controls, val, line, label, dot } from "./course/anim.ts";
import { codeView } from "./codeview.ts";
import { DRIVER_NOTES } from "./notes.ts";
import { spectrumOf, Waterfall, heat } from "./waterfall.ts";
import { fft } from "./dsp.ts";
import starterPage from "../examples/hello-dongle.html?raw";
import driverSrc from "./rtlsdr.ts?raw";
import waterfallSrc from "./waterfall.ts?raw";

const el = (id: string) => document.getElementById(id)!;
const TAU = 2 * Math.PI;

// --- The waterfall pipeline, stage by stage ------------------------------------------------------------
{
  const N = 512, wf = new Waterfall(N, 160);
  // A pretend radio band: two steady stations, one transmitter that keys on and off, and noise.
  const ph = [0, 0, 0];
  function block(b: number): Uint8Array {
    const out = new Uint8Array(2 * N), burst = b % 40 < 14;
    for (let i = 0; i < N; i++) {
      let I = 0, Q = 0;
      const tones: [number, number][] = [[-140, 0.3], [90, 0.12], ...(burst ? [[180, 0.2] as [number, number]] : [])];
      tones.forEach(([bin, a], k) => { const p = ph[k] + (TAU * bin * i) / N; I += a * Math.cos(p); Q += a * Math.sin(p); });
      I += (Math.random() - 0.5) * 0.06; Q += (Math.random() - 0.5) * 0.06;
      out[2 * i] = Math.max(0, Math.min(255, Math.round(127.5 + I * 127.5)));
      out[2 * i + 1] = Math.max(0, Math.min(255, Math.round(127.5 + Q * 127.5)));
    }
    ph[0] += 0.3; ph[1] += 1.1; ph[2] += 0.7;
    return out;
  }
  let last = -1, bytes = block(0), db = spectrumOf(bytes, N, 1);
  new Scene(el("s-pipe"), (g, w, h, t) => {
    const b = Math.floor(t * 8);
    if (b !== last) { last = b; bytes = block(b); db = spectrumOf(bytes, N, 1); wf.push(db); }
    const L = 150, R = w - 10, rows = 6, rowH = 54, gap = 10;
    const rowY = (r: number) => 8 + r * (rowH + gap);
    const names = ["1 · bytes from USB", "2 · numbers", "3 · fade in/out (window)", "4 · FFT: power", "5 · power in dB", "6 · one row of colors"];
    names.forEach((n, r) => label(g, n, 8, rowY(r) + rowH / 2 + 4, r === 5 ? C.yellow : C.text, "left", 12));
    // 1: raw bytes as bars around 127.5
    { const y = rowY(0), m = 96, bw = (R - L) / m; line(g, L, y + rowH / 2, R, y + rowH / 2, C.grid, 1);
      for (let i = 0; i < m; i++) { const v = (bytes[i] - 127.5) / 127.5; g.fillStyle = i % 2 ? C.pink : C.blue; g.fillRect(L + i * bw, y + rowH / 2, Math.max(1, bw - 1), -v * rowH / 2); } }
    // 2: numbers
    const iq = Float32Array.from(bytes, (v) => (v - 127.5) / 127.5);
    const trace = (y: number, f: (i: number) => number, col: string, count = N) => {
      g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath();
      for (let i = 0; i < count; i++) { const x = L + ((R - L) * i) / (count - 1), v = f(i); i ? g.lineTo(x, y + rowH / 2 - v * rowH / 2) : g.moveTo(x, y + rowH / 2 - v * rowH / 2); }
      g.stroke();
    };
    trace(rowY(1), (i) => iq[2 * i] * 1.6, C.blue, 128); trace(rowY(1), (i) => iq[2 * i + 1] * 1.6, C.pink, 128);
    // 3: the Hann window and the windowed I
    const win = (i: number) => 0.5 - 0.5 * Math.cos((TAU * i) / N);
    trace(rowY(2), (i) => iq[2 * i] * win(i) * 1.6, C.blue); trace(rowY(2), (i) => win(i) * 0.95, C.yellow);
    // 4 and 5: FFT power, linear then dB
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) { re[i] = iq[2 * i] * win(i); im[i] = iq[2 * i + 1] * win(i); }
    fft(re, im);
    const pow = Array.from({ length: N }, (_, i) => { const j = (i + N / 2) % N; return re[j] ** 2 + im[j] ** 2; });
    const pmax = Math.max(...pow);
    { const y = rowY(3); g.fillStyle = C.green; pow.forEach((p, i) => { const hh = (p / pmax) * (rowH - 4); g.fillRect(L + ((R - L) * i) / N, y + rowH - hh, Math.max(1, (R - L) / N), hh); }); }
    const lo = Math.min(...db), hi = Math.max(...db);
    trace(rowY(4), (i) => ((db[i] - lo) / (hi - lo)) * 2 - 1, C.green);
    // 6: the colors
    { const y = rowY(5), floor = Array.from(db).sort((a, c) => a - c)[N >> 1], bw = (R - L) / N;
      db.forEach((v, i) => { const [r, gg, bb] = heat((v - floor) / 35); g.fillStyle = `rgb(${r},${gg},${bb})`; g.fillRect(L + i * bw, y + 6, Math.ceil(bw), rowH - 12); }); }
    // 7: the waterfall, built from every row so far
    const wy = rowY(6);
    label(g, "7 · waterfall", 8, wy + 20, C.yellow, "left", 12);
    label(g, "(newest on top)", 8, wy + 38, C.muted, "left", 11);
    wf.draw(g, L, wy, R - L, h - wy - 8);
  }, 8 + 6 * 64 + 170, { label: "The waterfall pipeline: bytes, numbers, window, FFT power, decibels, colors, and the resulting waterfall" });
}

// --- USB streaming: why you ask ahead ------------------------------------------------------------------
{
  // Simulated milliseconds. The dongle's own buffer holds CAP ms of radio; each request collects CHUNK ms.
  const CAP = 25, CHUNK = 55, WINDOW = 1600;
  type Ev = { t: number; level: number; pending: boolean; busy: boolean; lost: number };
  let sim: Ev[] = [], now = 0, fifo = 0, collected = 0, pending = 0, busyUntil = 0, lost = 0, mode = "", slow = -1;
  const reset = () => { sim = []; now = 0; fifo = 0; collected = 0; pending = 0; busyUntil = 0; lost = 0; };
  const step = (dt: number, naive: boolean, work: number) => {
    for (let i = 0; i < dt; i++) {
      now++;
      const busy = now < busyUntil;
      if (naive) { if (!busy && pending === 0) pending = 1; } else pending = 4;
      fifo += 1; // the dongle produces 1 ms of radio every ms, no matter what
      if (pending > 0) { collected += fifo; fifo = 0; } // a waiting request drains the dongle's buffer
      if (fifo > CAP) { lost += fifo - CAP; fifo = CAP; } // no request waiting and the buffer is full: samples are lost
      if (collected >= CHUNK) { // a request completes: the page must process it
        collected -= CHUNK;
        if (naive) pending = 0;
        const hiccup = Math.random() < 0.15 ? 3 : 1; // now and then the page is slower (garbage collection, layout…)
        busyUntil = Math.max(busyUntil, now) + work * hiccup;
      }
      sim.push({ t: now, level: fifo / CAP, pending: pending > 0, busy, lost });
    }
    sim = sim.filter((e) => e.t > now - WINDOW);
  };
  const s = new Scene(el("s-usb"), (g, w, h) => {
    const naive = (el("us-naive") as HTMLInputElement).checked, work = val("us-work");
    if (mode !== String(naive) || slow !== work) { mode = String(naive); slow = work; reset(); }
    step(16, naive, work);
    const L = 150, R = w - 10, xOf = (t: number) => R - ((now - t) / WINDOW) * (R - L);
    const lanes = [["dongle's buffer", 20], ["request waiting", 110], ["page busy", 160]] as const;
    lanes.forEach(([n, y]) => label(g, n, 8, y + 16, C.text, "left", 12));
    // buffer level (red when full: samples being lost)
    for (const e of sim) {
      const x = xOf(e.t), full = e.level >= 1;
      g.fillStyle = full ? C.red : C.blue;
      g.fillRect(x, 20 + 70 * (1 - e.level), Math.max(1, (R - L) / WINDOW + 0.5), 70 * e.level);
      if (e.pending) { g.fillStyle = C.green; g.fillRect(x, 110, Math.max(1, (R - L) / WINDOW + 0.5), 26); }
      if (e.busy) { g.fillStyle = C.pink; g.fillRect(x, 160, Math.max(1, (R - L) / WINDOW + 0.5), 26); }
    }
    line(g, L, 20, R, 20, C.red, 1, [4, 4]); label(g, "full", R, 16, C.red, "right", 11);
    const lostTotal = sim.length ? sim[sim.length - 1].lost : 0;
    label(g, `radio lost so far: ${lostTotal.toFixed(0)} ms`, R, h - 8, lostTotal > 0 ? C.red : C.green, "right", 13);
    label(g, "time →", L, h - 8, C.muted, "left", 11);
  }, 230, { label: "A timeline of the dongle's buffer, pending USB requests and page activity" });
  controls(s, ["us-naive", "us-work"], () => { el("us-worko").textContent = `${val("us-work")} ms per chunk`; });
}

// --- Source viewers ----------------------------------------------------------------------------------
const script = starterPage.slice(starterPage.indexOf('<script type="module">') + 22, starterPage.lastIndexOf("</script>"));
codeView(el("cv-starter"), "examples/hello-dongle.html (script)", script.replace(/^\n/, ""), [
  { title: "Imports: three files from this site", from: "import { RtlSdr }", to: "import { powerSpectrum }",
    html: "<code>RtlSdr</code> is our WebUSB driver, <code>RemoteSdr</code> the same interface over HTTP from a server, and <code>powerSpectrum</code> turns samples into a spectrum (course chapter 4). No other libraries." },
  { title: "Tiny helpers and the one piece of state", from: "const $ = (id)", to: "let sdr = null",
    html: "<code>sdr</code> holds whichever source is connected. Because both sources have the same methods, the rest of the code never needs to know which one it is." },
  { title: "Choosing a source", from: "// 1. Pick a source", to: '$("server").onclick',
    html: "The USB button only works where WebUSB exists: a Chromium browser on an https:// or localhost page. The server button appears only if <code>/api/state</code> answers, i.e. the page was served by <code>server.ts</code>. <code>requestDevice()</code> (inside <code>RtlSdr.request()</code>) must run in a click handler: the browser refuses to show the USB picker otherwise." },
  { title: "Connecting and configuring", from: "async function start(open)", to: "stream();",
    html: "Open the source, then set the three things every receiver needs: <b>sample rate</b> (1.024 million I/Q pairs per second; the server picks its own), <b>center frequency</b> (in Hz) and <b>gain</b> (in dB). Each call becomes a handful of USB register writes in the driver." },
  { title: "Errors in plain words", from: "} catch (e)", to: "log(`Couldn't connect",
    html: "The driver turns the common failures into readable messages: no device selected, another program using the dongle, Windows without the WinUSB driver, an unsupported tuner." },
  { title: "Drawing at the screen's pace", from: "async function stream()", to: "requestAnimationFrame(function frame()",
    html: "Data arrives ~18 times per second at 2.4 MS/s, the screen redraws ~60 times per second, and the two aren't in step. So incoming chunks only update <code>latest</code>, and a separate <code>requestAnimationFrame</code> loop draws whatever is newest. A chunk that arrives between two frames is simply skipped for drawing (but was still received)." },
  { title: "Receiving: the stream loop", from: "await sdr.stream((chunk)", to: "first bytes:",
    html: "<code>stream()</code> calls this function with each chunk of raw bytes until <code>stop()</code>. Counting bytes from the first chunk gives the real data rate: if it's below 2 × the sample rate, samples are being lost." },
  { title: "Bytes → numbers", from: "function draw(chunk)", to: "iq[i] = (chunk[i] - 127.5)",
    html: "Each byte is one I or one Q. 127.5 means zero, so subtracting it and dividing by 127.5 gives numbers from −1 to +1 (course chapters 2 and 3)." },
  { title: "Numbers → spectrum", from: "const db = powerSpectrum",
    html: "Window, FFT, power, decibels: 1024 values, from the lowest frequency in view to the highest, the strongest stations being the largest numbers (course chapter 4)." },
  { title: "Sizing the canvas for sharp lines", from: 'const c = $("spectrum")', to: "c.width = c.clientWidth",
    html: "A canvas has its own pixel grid. Setting it to the on-screen size × <code>devicePixelRatio</code> (2 on most laptops) keeps lines crisp. The on-screen size itself comes from CSS, never from these numbers; reading them back as a size is a classic bug that makes canvases grow on every redraw." },
  { title: "Drawing the line", from: "g.strokeStyle", to: "g.stroke();",
    html: "Each value becomes one point: x across the canvas by frequency, y up the canvas by strength, mapping −100…−20 dB to bottom…top." },
]);

codeView(el("cv-driver"), "src/rtlsdr.ts", driverSrc, DRIVER_NOTES);

codeView(el("cv-waterfall"), "src/waterfall.ts", waterfallSrc, [
  { title: "Bytes → averaged spectrum", from: "export function spectrumOf",
    html: "Cut the chunk into blocks of n samples, turn each block's bytes into numbers, run window + FFT + dB (<code>powerSpectrum</code>), and average the blocks. Averaging is done on <b>power</b>, not dB: averaging logarithms would bias weak bins downward. One chunk of 2.4 MS/s data gives up to 16 blocks, which smooths the noise." },
  { title: "The color scale", from: "export function heat",
    html: "One number from 0 to 1 becomes a color: red rises over the first half, green over the second, and blue rises then falls, giving black → blue → magenta → yellow. Dark for quiet, bright for loud." },
  { title: "The waterfall object", from: "export class Waterfall",
    html: "The picture lives in an <code>OffscreenCanvas</code> exactly one pixel per frequency bin wide and one pixel per row tall, independent of the screen. It's stretched onto the visible canvas when drawn." },
  { title: "Finding the noise floor", from: "push(db: Float32Array",
    html: "To color by \"how far above the noise\", we need the noise level. Stations fill only a minority of the bins, so the <b>median</b> (the middle value of the sorted row) is noise. It's smoothed over time (90% old, 10% new) so the colors don't flicker from row to row." },
  { title: "One row of pixels", from: "// 2. One row of pixels",
    html: "Each bin's height above the floor, divided by the dB range that counts as \"full brightness\" (35 dB), goes through the color scale into an <code>ImageData</code> row: four bytes (red, green, blue, opacity) per pixel." },
  { title: "Scrolling in two lines", from: "// 3. Scroll",
    html: "Drawing the canvas onto itself one pixel lower shifts every old row down at once (the bottom row falls off the edge). Then the new row is painted at the top. No arrays to shift: the graphics hardware does the work." },
  { title: "Drawing it crisp", from: "draw(g: CanvasRenderingContext2D",
    html: "Stretching a 512-pixel-wide image onto a wider canvas would normally blur it. Turning image smoothing off keeps each frequency bin a sharp column." },
]);
