// "Lab: try it on real radio": a small panel that streams live samples into a chapter, from the
// server's dongle (when the page is served by server.ts) or the reader's own dongle over WebUSB.
import { RtlSdr } from "../rtlsdr.ts";
import { RemoteSdr } from "../remote.ts";
import { GAINS } from "../r820t.ts";

// Tune the dongle this far below the requested frequency, so the station sits clear of the
// dongle's own spike at 0 Hz (the same trick Spectrum Lab uses).
const OFFSET = 250e3;

export interface LabOpts {
  freqMHz?: number; // starting frequency
  /** At most once per animation frame. `center`: where the dongle is tuned; `target`: the frequency the reader asked for. */
  onSamples: (cu8: Uint8Array, rate: number, center: number, target: number) => void;
  onStart?: (rate: number) => void;
  /** Deliver every chunk as it arrives (needed for audio) instead of only the newest one per frame. */
  everyChunk?: boolean;
}

/** Fills `root` with connect buttons, a frequency box and a gain menu, and streams samples. */
export function lab(root: HTMLElement, opts: LabOpts) {
  root.insertAdjacentHTML("beforeend", `
    <div class="lab-bar">
      <button data-src="server" hidden>Use the server's dongle</button>
      <button data-src="usb">Use my USB dongle</button>
      <label>Frequency <input type="number" step="0.1" value="${opts.freqMHz ?? 98.7}" class="lab-f"> MHz</label>
      <label>Gain <select class="lab-g"><option value="auto">Auto</option>${GAINS.map((g) => `<option value="${g / 10}">${(g / 10).toFixed(1)} dB</option>`).join("")}</select></label>
    </div>
    <p class="lab-status" role="status"></p>`);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const status = $(".lab-status"), fIn = $<HTMLInputElement>(".lab-f"), gIn = $<HTMLSelectElement>(".lab-g");
  const btnServer = $<HTMLButtonElement>('[data-src="server"]'), btnUsb = $<HTMLButtonElement>('[data-src="usb"]');
  gIn.value = "32.8";
  let sdr: RtlSdr | RemoteSdr | null = null, streaming: Promise<void> | null = null, pending: Uint8Array | null = null;

  fetch("/api/state").then((r) => { if (r.ok) btnServer.hidden = false; }).catch(() => {});
  if (!("usb" in navigator) || !window.isSecureContext) {
    btnUsb.disabled = true;
    btnUsb.title = window.isSecureContext ? "This browser has no WebUSB (use Chrome, Edge or Opera)" : "USB needs an https:// or localhost address";
  }
  status.textContent = "Not connected. Pick a source above.";

  const gain = () => (gIn.value === "auto" ? null : parseFloat(gIn.value));
  const target = () => parseFloat(fIn.value) * 1e6;
  const draw = () => { if (pending && sdr) opts.onSamples(pending, sdr.sampleRate, sdr.centerFrequency, target()); pending = null; if (sdr) requestAnimationFrame(draw); };

  async function start(src: "server" | "usb") {
    try {
      sdr = src === "server" ? await RemoteSdr.connect() : await RtlSdr.request();
      if (sdr instanceof RtlSdr) await sdr.setSampleRate(1_024_000);
      await sdr.setCenterFrequency(target() - OFFSET);
      await sdr.setGain(gain());
      opts.onStart?.(sdr.sampleRate);
      (src === "server" ? btnServer : btnUsb).textContent = "Stop";
      (src === "server" ? btnUsb : btnServer).disabled = true;
      status.textContent = `Live from ${src === "server" ? "the server's dongle" : "your dongle"} at ${fIn.value} MHz.`;
      streaming = sdr.stream((d) => {
        if (opts.everyChunk && sdr) opts.onSamples(d, sdr.sampleRate, sdr.centerFrequency, target());
        else pending = d;
      }).catch((e) => { status.textContent = `Stopped: ${e.message}`; });
      requestAnimationFrame(draw);
    } catch (e) {
      sdr = null;
      const m = (e as Error).message;
      status.textContent = /No device selected/i.test(m) ? "No dongle selected." : `Couldn't start: ${m}`;
    }
  }

  async function stop() {
    const s = sdr; sdr = null;
    s?.stop(); await streaming; await s?.close().catch(() => {});
    btnServer.textContent = "Use the server's dongle"; btnUsb.textContent = "Use my USB dongle";
    btnServer.disabled = false; btnUsb.disabled = !("usb" in navigator) || !window.isSecureContext;
    status.textContent = "Stopped.";
  }

  btnServer.addEventListener("click", () => (sdr ? stop() : start("server")));
  btnUsb.addEventListener("click", () => (sdr ? stop() : start("usb")));
  fIn.addEventListener("change", () => sdr?.setCenterFrequency(target() - OFFSET));
  gIn.addEventListener("change", () => sdr?.setGain(gain()));
}
