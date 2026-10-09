// Chapter 14: writing the driver. The real driver's conversation with the chips, and its source.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { RtlSdr } from "../rtlsdr.ts";
import { recording, fakeDongle, decode, type Entry } from "./trace.ts";
import { codeView } from "../codeview.ts";
import { DRIVER_NOTES } from "../notes.ts";
import driverSrc from "../rtlsdr.ts?raw";
import tunerSrc from "../r820t.ts?raw";

const el = (id: string) => document.getElementById(id)!;

/** Run the driver through a typical session and record every control transfer. */
async function session(dev: Parameters<typeof RtlSdr.open>[0]) {
  const log: Entry[] = [], phase = { name: "open" };
  const sdr = await RtlSdr.open(recording(dev, log, phase));
  phase.name = "set sample rate 2.4 MS/s"; await sdr.setSampleRate(2_400_000);
  phase.name = "tune to 98.45 MHz"; await sdr.setCenterFrequency(98.45e6);
  phase.name = "gain 30 dB"; await sdr.setGain(30);
  phase.name = "close"; await sdr.close();
  return log;
}

const KIND = (e: Entry) => (e.index >> 8 === 6 ? "tuner" : (e.value & 0xff) === 0x20 ? "demod" : (e.index >> 8) === 2 ? "system" : "usb");

function show(log: Entry[], box: HTMLElement, hideDummy: boolean) {
  const phases = [...new Set(log.map((e) => e.phase))];
  box.innerHTML = `<p class="tr-sum">${log.length} control transfers in total.</p>` + phases.map((p, i) => {
    const es = log.filter((e) => e.phase === p), shown = hideDummy ? es.filter((e) => !decode(e).startsWith("dummy read")) : es;
    return `<details class="tr-phase"${i === 0 ? " open" : ""}><summary><b>${i + 1}. ${p}</b> <span>${es.length} transfers</span></summary><ol>` +
      shown.map((e) => `<li class="tr-${KIND(e)}"><span class="tr-k">${KIND(e)}</span>${decode(e).replace(/·/, '<span class="tr-dot">·</span>')}</li>`).join("") + "</ol></details>";
  }).join("");
}

// --- 1. The trace, recorded right here from the real driver talking to a pretend dongle ------------------------------------
let fakeLog: Entry[] = [];
const hide = el("tr-hide") as HTMLInputElement;
session(fakeDongle()).then((log) => { fakeLog = log; show(log, el("trace"), hide.checked); });
hide.addEventListener("input", () => show(fakeLog, el("trace"), hide.checked));

// --- 2. The source, annotated ------------------------------------------------------------------------------------------------
codeView(el("cv-driver"), "src/rtlsdr.ts", driverSrc, DRIVER_NOTES);
codeView(el("cv-tuner"), "src/r820t.ts", tunerSrc, [
  { title: "Talking to a chip on I2C", from: "export interface I2C",
    html: "The tuner driver doesn't know about USB at all: it only needs something that can write and read bytes on I2C. The RTL2832U driver provides that (through the repeater), and the chapter's test provides a fake one. Keeping the layers apart is what makes both testable." },
  { title: "The start-up values", from: "const INIT = [",
    html: "The 27 values for registers 0x05–0x1F that every R820T driver writes first. They come from Rafael's reference code: there's no public datasheet, so the community's drivers are the documentation." },
  { title: "Per-band front-end settings", from: "const BANDS",
    html: "For each range of oscillator frequencies: the tracking filter setting (which keeps the image and far-away stations out, chapter 12) and two switches. <code>setMux</code> picks the row for the frequency you tune to." },
  { title: "The gain ladder", from: "const LNA_STEPS",
    html: "The LNA and mixer each have 16 gain steps of uneven size, in tenths of a dB, as measured by the rtl-sdr community. <code>GAINS</code> lists every total you can reach by climbing them alternately: the 29 values in the gain menus on this site." },
  { title: "Bits in reverse", from: "const NIBBLE_REV",
    html: "A quirk: the R820T sends each byte it's asked for with its bits in reverse order. This lookup table flips them back, four bits at a time." },
  { title: "The tuner object and its shadow registers", from: "export class R820T",
    html: "The chip's registers are mostly write-only, so the driver keeps a copy (a \"shadow\") of what it last wrote. To change a few bits of a register, <code>writeMask</code> takes the copy, changes those bits, and writes the whole byte back." },
  { title: "Writing and reading registers", from: "private async write(",
    html: "Writes go out in pieces of at most 7 data bytes (the RTL2832U's I2C bridge carries 8 bytes per message, including the register number). Reads always start at register 0, and come back bit-reversed." },
  { title: "Start-up", from: "async init()",
    html: "Write the start-up values, calibrate the IF filter, set the amplifiers' automatic thresholds. In the trace above, this is the \"tuner start-up\" phase." },
  { title: "Calibrating the IF filter", from: "private async setTvStandard",
    html: "The IF filter's exact width varies from chip to chip, so it's measured at start-up: tune the PLL to 56 MHz, pulse a trigger bit, read back a 4-bit calibration code, store it. If the first attempt gives a nonsense code, try once more." },
  { title: "Automatic gain thresholds", from: "private async sysFreqSel",
    html: "Thresholds for the tuner's own automatic gain, charge-pump currents, and a short settle (250 ms) with a fast AGC clock before switching to a slow one. These are the values every SDR driver uses (Rafael's \"digital TV\" profile)." },
  { title: "The PLL (chapter 12)", from: "private async setPll",
    html: "Find the divider that puts the VCO between 1.77 and 3.54 GHz, split VCO ÷ (2 × crystal) into a whole part and a 16-bit fraction, write them, wait 10 ms, check the lock bit, and raise the VCO current once if it hasn't locked. Chapter 12's calculator does exactly this arithmetic." },
  { title: "Choosing the front-end band", from: "private async setMux",
    html: "Look up the band for this oscillator frequency in <code>BANDS</code> and write its tracking-filter and switch settings." },
  { title: "Tuning", from: "async setFrequency",
    html: "The oscillator goes 3.57 MHz (the IF) above the frequency you want: set the band, set the PLL, and fail loudly if it doesn't lock. R828D chips also have two antenna inputs, switched at 345 MHz." },
  { title: "Gain", from: "async setGain",
    html: "Automatic: let the tuner's own AGC drive the LNA and mixer, with a fixed IF amplifier. Manual: switch the AGC off and climb the LNA/mixer ladder until the requested total is reached." },
  { title: "Standby", from: "async standby",
    html: "Eleven writes that power down the tuner's analog parts when the dongle is closed, so it runs cooler and draws less current." },
]);

// --- Lab: record the trace from your own dongle -------------------------------------------------------------------------------
{
  const btn = el("lb-rec") as HTMLButtonElement, status = el("lb-status"), usb = (navigator as any).usb;
  if (!usb || !isSecureContext) { btn.disabled = true; status.textContent = !usb ? "Needs a browser with WebUSB (Chrome, Edge, Opera)." : "Needs an https:// or localhost page."; }
  btn.addEventListener("click", async () => {
    try {
      const dev = await usb.requestDevice({ filters: [{ vendorId: 0x0bda, productId: 0x2838 }, { vendorId: 0x0bda, productId: 0x2832 }] });
      status.textContent = "Recording…";
      const log = await session(dev);
      status.textContent = `Recorded from ${dev.productName ?? "your dongle"}: compare with the pretend dongle above. Every write should match; the reads are your chip's real answers.`;
      show(log, el("lb-trace"), true);
    } catch (e) { status.textContent = `Couldn't record: ${(e as Error).message}`; }
  });
}
