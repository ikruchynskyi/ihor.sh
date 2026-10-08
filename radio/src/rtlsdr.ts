// RTL2832U driver over WebUSB: no libraries, just USB control and bulk transfers.
// Works in Chromium browsers (navigator.usb) and in Node through any WebUSB-compatible object.

import { R820T, R820T_ADDR, R828D_ADDR, CHECK_VAL, type I2C } from "./r820t.ts";

/** The slice of the WebUSB USBDevice API this driver uses. */
export interface UsbDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;
  readonly configuration: unknown;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  reset(): Promise<void>;
  controlTransferIn(setup: Setup, length: number): Promise<{ data?: DataView; status: string }>;
  controlTransferOut(setup: Setup, data: BufferSource): Promise<{ status: string }>;
  transferIn(endpoint: number, length: number): Promise<{ data?: DataView; status: string }>;
}
type Setup = { requestType: "vendor"; recipient: "device"; request: number; value: number; index: number };

/** USB IDs of RTL2832U SDR dongles (the common ones; extend as needed). */
export const USB_FILTERS = [
  { vendorId: 0x0bda, productId: 0x2838 },
  { vendorId: 0x0bda, productId: 0x2832 },
];
export const isDongle = (d: { vendorId: number; productId: number }) =>
  USB_FILTERS.some((f) => f.vendorId === d.vendorId && f.productId === d.productId);

// Register blocks addressed through USB control transfers.
const USBB = 1, SYSB = 2, IICB = 6;
// USB block registers
const USB_SYSCTL = 0x2000, USB_EPA_CTL = 0x2148, USB_EPA_MAXPKT = 0x2158;
// System block registers
const DEMOD_CTL = 0x3000, DEMOD_CTL_1 = 0x300b;

const XTAL = 28_800_000; // RTL2832U reference crystal
const BULK_ENDPOINT = 1; // 0x81
const BUFFER_BYTES = 16 * 16384; // 128 Ki samples ≈ 55 ms at 2.4 MS/s
const QUEUE = 4; // bulk transfers kept in flight so the USB bus never idles

// Default decimation FIR of the RTL2832U resampler (8 × 8-bit + 8 × 12-bit coefficients).
const FIR = [-54, -36, -41, -40, -32, -14, 14, 53, 101, 156, 215, 273, 327, 372, 404, 421];

export class RtlSdr {
  tunerName = "";
  sampleRate = 0;
  centerFrequency = 0;
  private ppm = 0;
  private tuner!: R820T;
  private streaming = false;

  private dev: UsbDevice;
  private tunerXtal = XTAL;

  private constructor(dev: UsbDevice) { this.dev = dev; }

  /** Ask the browser for a dongle (must be called from a click). */
  static async request(): Promise<RtlSdr> {
    type Usb = { requestDevice(o: object): Promise<UsbDevice>; getDevices(): Promise<UsbDevice[]> };
    const usb = (navigator as unknown as { usb?: Usb }).usb;
    if (!usb) throw new Error("This browser has no WebUSB. Use Chrome, Edge or Opera (desktop or Android).");
    const dev = await usb.requestDevice({ filters: USB_FILTERS });
    // If the dongle had to be reset, it reappears as a new device; the permission is remembered,
    // so find it again without showing the picker.
    return RtlSdr.openWithRetry(async (attempt) => attempt === 0 ? dev : (await usb.getDevices()).find(isDongle));
  }

  /** Open with `find()`, retrying (with a fresh device) when a stalled dongle had to be reset. */
  static async openWithRetry(find: (attempt: number) => Promise<UsbDevice | undefined>, tries = 3): Promise<RtlSdr> {
    for (let attempt = 0; ; attempt++) {
      const dev = await find(attempt);
      if (!dev) throw new Error("No RTL-SDR found. Is it plugged in?");
      try {
        return await RtlSdr.open(dev);
      } catch (e) {
        if (!(e as { reopen?: boolean }).reopen || attempt + 1 >= tries) throw e;
        await new Promise((r) => setTimeout(r, 600)); // give the OS time to re-enumerate it
      }
    }
  }

  static async open(dev: UsbDevice): Promise<RtlSdr> {
    const sdr = new RtlSdr(dev);
    await dev.open().catch((e: Error) => {
      throw new Error(/access denied/i.test(e.message)
        ? "Access denied. On Windows, install the WinUSB driver for the dongle with Zadig first."
        : `Couldn't open the dongle: ${e.message}`);
    });
    if (!dev.configuration) await dev.selectConfiguration(1);
    await dev.claimInterface(0).catch((e: Error) => {
      throw new Error("The dongle is in use: close other SDR programs (SDR#, GQRX, SDR++, rtl_tcp, a server SDR), " +
        `or on Linux unload the dvb_usb_rtl28xxu driver. (${e.message})`);
    });
    try {
      await sdr.init();
    } catch {
      // A dongle closed moments ago can stall its first commands. librtlsdr's fix: reset it. Some systems
      // (macOS) then re-enumerate the device, so this handle is gone: ask the caller to find it again.
      await dev.releaseInterface(0).catch(() => {});
      await dev.reset().catch(() => {});
      await dev.close().catch(() => {});
      throw Object.assign(new Error("The dongle didn't respond and was reset; reconnecting."), { reopen: true });
    }
    return sdr;
  }

  // --- raw register access ---------------------------------------------------

  private async out(value: number, index: number, bytes: number[]) {
    const r = await this.dev.controlTransferOut(
      { requestType: "vendor", recipient: "device", request: 0, value, index }, new Uint8Array(bytes));
    if (r.status !== "ok") throw new Error(`USB write ${value.toString(16)} failed: ${r.status}`);
  }

  private async in(value: number, index: number, len: number): Promise<Uint8Array> {
    const r = await this.dev.controlTransferIn(
      { requestType: "vendor", recipient: "device", request: 0, value, index }, len);
    if (r.status !== "ok" || !r.data) throw new Error(`USB read ${value.toString(16)} failed: ${r.status}`);
    return new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
  }

  private static be(val: number, len: number) { return len === 1 ? [val & 0xff] : [(val >> 8) & 0xff, val & 0xff]; }

  private writeReg(block: number, addr: number, val: number, len = 1) {
    return this.out(addr, (block << 8) | 0x10, RtlSdr.be(val, len));
  }

  /** Demodulator registers live in "pages"; every write is followed by a dummy read, as the chip expects. */
  private async demodWrite(page: number, addr: number, val: number, len = 1) {
    await this.out((addr << 8) | 0x20, 0x10 | page, RtlSdr.be(val, len));
    await this.in((0x01 << 8) | 0x20, 0x0a, 1);
  }

  private readonly i2c: I2C = {
    write: (addr, bytes) => this.out(addr, (IICB << 8) | 0x10, bytes),
    read: (addr, len) => this.in(addr, IICB << 8, len),
  };

  /** The tuner sits behind an I2C repeater in the demod; it must be opened around tuner access. */
  private repeater(on: boolean) { return this.demodWrite(1, 0x01, on ? 0x18 : 0x10); }

  private async withTuner<T>(fn: () => Promise<T>): Promise<T> {
    await this.repeater(true);
    try { return await fn(); } finally { await this.repeater(false); }
  }

  // --- setup -----------------------------------------------------------------

  private async init() {
    await this.writeReg(USBB, USB_SYSCTL, 0x09); // also our "is it alive" check
    await this.initBaseband();

    await this.repeater(true);
    try {
      const probe = async (addr: number) => {
        await this.i2c.write(addr, [0]);
        return (await this.i2c.read(addr, 1))[0] === CHECK_VAL;
      };
      let addr = 0;
      if (await probe(R820T_ADDR).catch(() => false)) { addr = R820T_ADDR; this.tunerName = "R820T"; }
      else if (await probe(R828D_ADDR).catch(() => false)) { addr = R828D_ADDR; this.tunerName = "R828D"; }
      else throw new Error("Unsupported tuner: only R820T/R820T2/R828D dongles are supported for now.");

      // R828D sticks use a 16 MHz tuner crystal, except the RTL-SDR Blog V4 (28.8 MHz).
      this.tunerXtal = addr === R828D_ADDR && !/Blog V4/i.test(this.dev.productName ?? "") ? 16e6 : XTAL;
      this.tuner = new R820T(this.i2c, this.tunerXtal, addr);

      await this.demodWrite(1, 0xb1, 0x1a); // R82xx output a low IF, so turn zero-IF mode off
      await this.demodWrite(0, 0x08, 0x4d); // only the in-phase ADC input is used
      await this.setIf(this.tuner.intFreq);
      await this.demodWrite(1, 0x15, 0x01); // the tuner inverts the spectrum; undo it
      await this.tuner.init();
    } finally {
      await this.repeater(false);
    }
  }

  private async initBaseband() {
    await this.writeReg(USBB, USB_SYSCTL, 0x09);
    await this.writeReg(USBB, USB_EPA_MAXPKT, 0x0002, 2);
    await this.writeReg(USBB, USB_EPA_CTL, 0x1002, 2);
    await this.writeReg(SYSB, DEMOD_CTL_1, 0x22); // power on the demod
    await this.writeReg(SYSB, DEMOD_CTL, 0xe8);
    await this.demodWrite(1, 0x01, 0x14); // soft reset
    await this.demodWrite(1, 0x01, 0x10);
    await this.demodWrite(1, 0x15, 0x00); // no spectrum inversion, no adjacent-channel rejection
    await this.demodWrite(1, 0x16, 0x0000, 2);
    for (let i = 0; i < 6; i++) await this.demodWrite(1, 0x16 + i, 0x00); // clear DDC shift + IF registers
    await this.setFir();
    await this.demodWrite(0, 0x19, 0x05); // SDR mode, digital AGC off
    await this.demodWrite(1, 0x93, 0xf0); // init FSM state-holding registers
    await this.demodWrite(1, 0x94, 0x0f);
    await this.demodWrite(1, 0x11, 0x00); // AGC off
    await this.demodWrite(1, 0x04, 0x00); // RF and IF AGC loops off
    await this.demodWrite(0, 0x61, 0x60); // PID filter off
    await this.demodWrite(0, 0x06, 0x80); // default ADC I/Q datapath
    await this.demodWrite(1, 0xb1, 0x1b); // zero-IF, DC cancellation, IQ estimation/compensation
    await this.demodWrite(0, 0x0d, 0x83); // no 4.096 MHz clock output on TP_CK0
  }

  /** Pack 8 signed 8-bit + 8 signed 12-bit coefficients into the 20 FIR registers. */
  private async setFir() {
    const b: number[] = FIR.slice(0, 8).map((v) => v & 0xff);
    for (let i = 8; i < 16; i += 2) {
      const v0 = FIR[i], v1 = FIR[i + 1];
      b.push((v0 >> 4) & 0xff, ((v0 << 4) | ((v1 >> 8) & 0x0f)) & 0xff, v1 & 0xff);
    }
    for (let i = 0; i < b.length; i++) await this.demodWrite(1, 0x1c + i, b[i]);
  }

  private get xtal() { return XTAL * (1 + this.ppm / 1e6); }

  /** The demod's own mixer brings the tuner's IF down to 0 Hz. */
  private async setIf(freq: number) {
    const v = -Math.floor((freq * 2 ** 22) / this.xtal) & 0x3fffff;
    await this.demodWrite(1, 0x19, (v >> 16) & 0x3f);
    await this.demodWrite(1, 0x1a, (v >> 8) & 0xff);
    await this.demodWrite(1, 0x1b, v & 0xff);
  }

  // --- public controls ---------------------------------------------------------

  /** 225 001–300 000 or 900 001–3 200 000 S/s. Returns the exact rate the resampler achieves. */
  async setSampleRate(rate: number): Promise<number> {
    if (rate <= 225_000 || rate > 3_200_000 || (rate > 300_000 && rate <= 900_000))
      throw new Error(`Sample rate ${rate} not supported (use 0.23–0.3 or 0.9–3.2 MS/s)`);
    const ratio = Math.floor((XTAL * 2 ** 22) / rate) & 0x0ffffffc;
    const real = ratio | ((ratio & 0x08000000) << 1);
    this.sampleRate = (XTAL * 2 ** 22) / real;
    await this.demodWrite(1, 0x9f, ratio >>> 16, 2);
    await this.demodWrite(1, 0xa1, ratio & 0xffff, 2);
    await this.setSampleCorrection();
    await this.demodWrite(1, 0x01, 0x14); // soft reset
    await this.demodWrite(1, 0x01, 0x10);
    return this.sampleRate;
  }

  private async setSampleCorrection() {
    const offs = Math.round((-this.ppm * 2 ** 24) / 1e6);
    await this.demodWrite(1, 0x3f, offs & 0xff);
    await this.demodWrite(1, 0x3e, (offs >> 8) & 0x3f);
  }

  async setCenterFrequency(freq: number) {
    await this.withTuner(() => this.tuner.setFrequency(freq));
    this.centerFrequency = freq;
  }

  /** Gain in dB (rounded to the tuner's steps), or null for automatic. */
  async setGain(db: number | null) {
    await this.withTuner(() => this.tuner.setGain(db === null ? null : Math.round(db * 10)));
  }

  /** Crystal error correction in parts per million (0 for TCXO dongles). */
  async setPpm(ppm: number) {
    this.ppm = ppm;
    this.tuner.xtal = this.tunerXtal * (1 + ppm / 1e6);
    await this.setSampleCorrection();
    await this.withTuner(() => this.setIf(this.tuner.intFreq));
    if (this.centerFrequency) await this.setCenterFrequency(this.centerFrequency);
  }

  // --- streaming -----------------------------------------------------------------

  /**
   * Stream raw samples (interleaved unsigned 8-bit I/Q, the same as rtl_sdr's .cu8) until stop().
   * Keeps several bulk transfers in flight and delivers them strictly in order.
   */
  async stream(onData: (cu8: Uint8Array) => void): Promise<void> {
    await this.writeReg(USBB, USB_EPA_CTL, 0x1002, 2); // flush the endpoint FIFO
    await this.writeReg(USBB, USB_EPA_CTL, 0x0000, 2);
    this.streaming = true;
    const queue = Array.from({ length: QUEUE }, () => this.dev.transferIn(BULK_ENDPOINT, BUFFER_BYTES));
    while (this.streaming) {
      const r = await queue.shift()!;
      if (this.streaming) queue.push(this.dev.transferIn(BULK_ENDPOINT, BUFFER_BYTES));
      if (r.status !== "ok" || !r.data) throw new Error(`USB bulk read failed: ${r.status}`);
      onData(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
    }
    await Promise.allSettled(queue); // let in-flight transfers finish before anyone touches the device
  }

  stop() { this.streaming = false; }

  async close() {
    this.stop();
    try {
      await this.withTuner(() => this.tuner.standby());
      await this.writeReg(SYSB, DEMOD_CTL, 0x20); // power off the demod ADCs
    } finally {
      await this.dev.releaseInterface(0).catch(() => {});
      await this.dev.close();
    }
  }
}
