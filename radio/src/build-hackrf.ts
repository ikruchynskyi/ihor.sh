// The HackRF Pro guide (build-hackrf.html): the sample-rate calculator, and the driver itself, annotated.
import "./course/course.css";
import { codeView, type Note } from "./codeview.ts";
import driverSrc from "./hackrf.ts?raw";

// Does this sample rate divide into the server's slices, and how wide is the window? (the same math as stages() in radio/server.ts)
const FILTERS = [1.75, 2.5, 3.5, 5, 5.5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 24, 28];
const $ = (id: string) => document.getElementById(id)!;
function chain(rate: number, width: number) {
  if (rate % width) return null;
  const out: number[] = [];
  for (let left = rate / width, f = 5; left > 1; ) if (left % f === 0) { out.push(f); left /= f; } else if (--f < 2) return null;
  return out;
}
function calc() {
  const mhz = Number(($("cRate") as HTMLInputElement).value), rate = Math.round(mhz * 1e6);
  if (!(mhz >= 2 && mhz <= 20)) return void ($("cOut").textContent = "The HackRF takes 2 to 20 MS/s.");
  const filter = [...FILTERS].reverse().find((f) => f <= 0.85 * mhz) ?? 1.75;
  const lines = [`baseband filter ${filter} MHz → usable window ${Math.min(0.9 * mhz, filter).toFixed(2)} MHz`, `USB: ${(mhz * 2).toFixed(1)} MB/s`];
  for (const w of [240_000, 1_200_000]) { const c = chain(rate, w); lines.push(`${w / 1e3} kHz slice: ${c ? `÷${rate / w} = ${c.map((f) => "÷" + f).join(" ")}` : "doesn't divide evenly ✗"}`); }
  $("cOut").textContent = lines.join("\n");
}
$("cRate").addEventListener("input", calc); calc();

const NOTES: Note[] = [
  { title: "Which devices", from: "export const HACKRF_FILTERS", html: "Great Scott Gadgets' vendor ID with the product ID the HackRF One and Pro share: one driver for both." },
  { title: "The firmware's requests", from: "// vendor requests", html: "The numbers libhackrf uses. Each is one USB control transfer; the firmware does the chip-level work the RTL-SDR driver does by hand." },
  { title: "Opening: who is it, and a safe start", from: "static async open", html: "Claim the interface, read the board ID and version string, and make sure it isn't receiving or amplifying yet: the RF amp starts off." },
  { title: "Rate, then the filter that guards it", from: "async setSampleRate", html: "8 bytes, rate and divider. Then the baseband filter, a step narrower than the rate so nothing beyond ±rate/2 folds back in." },
  { title: "Frequency in two parts", from: "async setCenterFrequency", html: "Whole megahertz and the remaining hertz, two little-endian uint32s." },
  { title: "Gains, rounded to what the chips take", from: "async setGains", html: "LNA in 8 dB steps, VGA in 2 dB steps; the device answers 1 when it accepted. The server decides when the RF amp may be on (never near strong broadcast)." },
  { title: "Streaming, and the XOR", from: "async stream", html: "Four bulk reads in flight, oldest first. Signed bytes become the RTL-SDR's unsigned .cu8 with one XOR per byte (four at a time). The <code>finally</code> settles every read still in flight, so one failed read can't crash Node." },
];
codeView($("cv-hackrf"), "src/hackrf.ts", driverSrc, NOTES);
