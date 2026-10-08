// Recording and decoding everything the driver says to the dongle. Pure code: used by chapter 14 and its script.
import type { UsbDevice } from "../rtlsdr.ts";

export interface Entry { phase: string; dir: "out" | "in"; value: number; index: number; data: number[] }

const hex = (v: number, w = 2) => "0x" + v.toString(16).padStart(w, "0");
const USB_REGS: Record<number, string> = { 0x2000: "USB_SYSCTL (USB block control)", 0x2148: "USB_EPA_CTL (sample endpoint control: 0x1002 = reset FIFO, 0x0000 = run)", 0x2158: "USB_EPA_MAXPKT (packet size)" };
const SYS_REGS: Record<number, string> = { 0x3000: "DEMOD_CTL (demodulator power/ADC)", 0x300b: "DEMOD_CTL_1 (demodulator clock/power)" };
const DEMOD: Record<string, string> = {
  "1:01": "soft reset (0x14 = reset, 0x10 = run) / I2C repeater (0x18 = on)", "1:15": "spectrum inversion", "1:16": "DDC shift / IF frequency", "1:17": "DDC shift / IF frequency",
  "1:18": "DDC shift / IF frequency", "1:19": "IF frequency (top bits)", "1:1a": "IF frequency (middle bits)", "1:1b": "IF frequency (low bits)", "0:19": "SDR mode on, digital AGC off",
  "1:93": "FSM state-holding register", "1:94": "FSM state-holding register", "1:11": "AGC off", "1:04": "RF and IF AGC loops off", "0:61": "PID filter off", "0:06": "ADC datapath: default I/Q",
  "1:b1": "zero-IF mode, DC cancellation, I/Q correction", "0:0d": "clock output off", "0:08": "ADC input: in-phase only (tuner gives a low IF)", "1:9f": "resampler ratio (high 16 bits)",
  "1:a1": "resampler ratio (low 16 bits)", "1:3e": "sample-rate correction (high)", "1:3f": "sample-rate correction (low)",
};
const TUNER: Record<number, string> = {
  0x05: "LNA (input amplifier): gain, AGC, input select", 0x06: "filter gain, cable input, pre-detect", 0x07: "mixer gain / image", 0x08: "mixer/image phase", 0x09: "mixer/image amplitude",
  0x0a: "IF filter: Q, calibration code, current", 0x0b: "IF filter: bandwidth, high-pass corner, calibration trigger", 0x0c: "VGA (IF amplifier) gain", 0x0d: "LNA AGC thresholds", 0x0e: "mixer AGC thresholds",
  0x0f: "calibration clock, filter extension", 0x10: "PLL: divider, reference doubler, crystal cap", 0x11: "PLL charge-pump current", 0x12: "VCO current, sigma-delta power", 0x13: "version",
  0x14: "PLL integer part (ni, si)", 0x15: "PLL fraction (low byte)", 0x16: "PLL fraction (high byte)", 0x17: "divider buffer current, open drain", 0x19: "RF poly-filter current",
  0x1a: "PLL autotune, RF mux / poly mux, AGC clock", 0x1b: "tracking filter band", 0x1c: "mixer top / discharge", 0x1d: "LNA top", 0x1e: "filter extension, LNA discharge", 0x1f: "loop-through attenuation",
};

/** What one control transfer means, in words. */
export function decode(e: Entry): string {
  const block = e.index >> 8, d = e.data.map((v) => hex(v)).join(" ");
  if (block === 6) { // I2C to the tuner
    if (e.dir === "in") return `tuner: read ${e.data.length} status byte${e.data.length > 1 ? "s" : ""} (${d})`;
    if (e.data.length === 1) return `tuner: "start reading at register ${hex(e.data[0])}"`;
    const reg = e.data[0], vals = e.data.slice(1);
    if (vals.length > 1) return `tuner registers ${hex(reg)}–${hex(reg + vals.length - 1)} = ${vals.map((v) => hex(v)).join(" ")} (bulk initialization)`;
    return `tuner register ${hex(reg)} = ${hex(vals[0])} · ${TUNER[reg] ?? "?"}`;
  }
  if ((e.value & 0xff) === 0x20) { // demodulator register: value = addr << 8 | 0x20, index = page (| 0x10 to write)
    const page = e.index & 0x0f, addr = e.value >> 8, key = `${page.toString(16)}:${addr.toString(16).padStart(2, "0")}`;
    if (e.dir === "in" && page === 0x0a) return "dummy read (the chip expects one after every demodulator write)";
    if (page === 1 && addr >= 0x1c && addr <= 0x2f) return `demod page 1, register ${hex(addr)} = ${d} · resampler filter coefficient ${addr - 0x1c + 1} of 20`;
    return `demod page ${page}, register ${hex(addr)} ${e.dir === "out" ? "= " + d : "→ " + d} · ${DEMOD[key] ?? "?"}`;
  }
  const names = block === 1 ? USB_REGS : block === 2 ? SYS_REGS : {};
  return `${block === 1 ? "USB" : block === 2 ? "system" : `block ${block}`} register ${hex(e.value, 4)} ${e.dir === "out" ? "= " + d : "→ " + d} · ${names[e.value] ?? "?"}`;
}

/** Wrap a real (or fake) USB device so that every control transfer is recorded into `log`, under the current phase. */
export function recording(dev: UsbDevice, log: Entry[], phase: { name: string }): UsbDevice {
  // While opening, split the trace into its natural steps by watching what's being said.
  let tunerSeen = false, tunerInit = false;
  const label = (index: number, dataLen: number, dir: "in" | "out") => {
    if (phase.name !== "open") return phase.name;
    const i2c = index >> 8 === 6;
    if (i2c && dir === "out" && dataLen > 2) tunerInit = true;
    if (i2c) tunerSeen = true;
    return tunerInit ? "tuner start-up (calibration included)" : tunerSeen ? "find the tuner and set up for it" : "RTL2832U start-up";
  };
  return new Proxy(dev, {
    get(t, k) {
      const v = (t as any)[k];
      if (k === "controlTransferOut") return async (s: any, data: BufferSource) => {
        const bytes = [...new Uint8Array(data as ArrayBuffer)];
        log.push({ phase: label(s.index, bytes.length, "out"), dir: "out", value: s.value, index: s.index, data: bytes });
        return v.call(t, s, data);
      };
      if (k === "controlTransferIn") return async (s: any, len: number) => {
        const r = await v.call(t, s, len);
        log.push({ phase: label(s.index, len, "in"), dir: "in", value: s.value, index: s.index, data: r.data ? [...new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)] : [] });
        return r;
      };
      return typeof v === "function" ? v.bind(t) : v;
    },
  }) as UsbDevice;
}

/** A pretend dongle: accepts every write and answers reads like an R820T dongle whose PLL locks. */
export function fakeDongle(): UsbDevice {
  const NIB = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];
  const rev = (b: number) => (NIB[b & 0xf] << 4) | NIB[b >> 4];
  const ok = (bytes: number[]) => ({ status: "ok", data: new DataView(new Uint8Array(bytes).buffer) });
  return {
    vendorId: 0x0bda, productId: 0x2838, productName: "pretend NESDR", configuration: {},
    async open() {}, async close() {}, async selectConfiguration() {}, async claimInterface() {}, async releaseInterface() {}, async reset() {},
    async controlTransferOut() { return { status: "ok" }; },
    async controlTransferIn(s, len) {
      if (s.index >> 8 === 6) return ok(len === 1 ? [0x69] : [0x69, 0, 0x40, 0, 0x28].slice(0, len).map((v, i) => (i ? rev(v) : v)));
      return ok(new Array(len).fill(0));
    },
    async transferIn(_ep, len) { return ok(new Array(Math.min(len, 64)).fill(128)); },
  };
}
