// HackRF (One, Pro) driver over WebUSB: no libraries, the vendor requests libhackrf sends, and bulk reads.
// It presents the same face as RtlSdr (sampleRate, setCenterFrequency, setGain, stream of .cu8 bytes…), so the
// server and the pages don't care which radio is plugged in. Receive only: this driver never transmits.

import type { UsbDevice } from "./rtlsdr.ts";

export const HACKRF_FILTERS = [{ vendorId: 0x1d50, productId: 0x6089 }]; // HackRF One and HackRF Pro
export const isHackRf = (d: { vendorId: number; productId: number }) => HACKRF_FILTERS.some((f) => f.vendorId === d.vendorId && f.productId === d.productId);

// vendor requests (libhackrf's hackrf.c)
const SET_TRANSCEIVER_MODE = 1, SAMPLE_RATE_SET = 6, BASEBAND_FILTER_BANDWIDTH_SET = 7, BOARD_ID_READ = 14, VERSION_STRING_READ = 15, SET_FREQ = 16, AMP_ENABLE = 17, SET_LNA_GAIN = 19, SET_VGA_GAIN = 20;
const MODE_OFF = 0, MODE_RECEIVE = 1;
const BULK_ENDPOINT = 1; // 0x81
const BUFFER_BYTES = 262_144; // libhackrf's transfer size: 128 Ki samples, 55 ms at 2.4 MS/s
const QUEUE = 4;
// the baseband filter's steps (libhackrf's list), Hz
const FILTERS = [1_750_000, 2_500_000, 3_500_000, 5_000_000, 5_500_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000, 12_000_000, 14_000_000, 15_000_000, 20_000_000, 24_000_000, 28_000_000];
const BOARDS: Record<number, string> = { 2: "HackRF One", 4: "HackRF One", 5: "HackRF Pro" };

export class HackRf {
  tunerName = "HackRF";
  readonly minRate = 2_000_000; // lower rates (the APRS decoder's 1.024 MS/s) are asked for in multiples of themselves
  filter = 0; // the baseband filter's bandwidth, Hz (two-sided)
  lna = 0; vga = 0; amp = false;
  sampleRate = 0;
  centerFrequency = 0;
  private streaming = false;
  private dev: UsbDevice;
  private constructor(dev: UsbDevice) { this.dev = dev; }

  static async open(dev: UsbDevice): Promise<HackRf> {
    await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    await dev.claimInterface(0);
    const h = new HackRf(dev);
    const board = await h.in(BOARD_ID_READ, 0, 0, 1).then((d) => d.getUint8(0)).catch(() => -1);
    const version = await h.in(VERSION_STRING_READ, 0, 0, 255).then((d) => new TextDecoder().decode(d).replace(/\0.*$/, "")).catch(() => "");
    h.tunerName = `${BOARDS[board] ?? dev.productName ?? "HackRF"}${version ? ` (${version})` : ""}`;
    await h.out(SET_TRANSCEIVER_MODE, MODE_OFF);
    await h.setAmp(false); // off until asked for: NYC's FM and TV transmitters would overload it
    return h;
  }

  private async out(request: number, value: number, index = 0, data: BufferSource = new Uint8Array(0)) {
    const r = await this.dev.controlTransferOut({ requestType: "vendor", recipient: "device", request, value, index }, data);
    if (r.status !== "ok") throw new Error(`HackRF request ${request} failed: ${r.status}`);
  }
  private async in(request: number, value: number, index: number, length: number) {
    const r = await this.dev.controlTransferIn({ requestType: "vendor", recipient: "device", request, value, index }, length);
    if (r.status !== "ok" || !r.data) throw new Error(`HackRF request ${request} failed: ${r.status}`);
    return r.data;
  }
  private static le32(...xs: number[]) { const b = new DataView(new ArrayBuffer(4 * xs.length)); xs.forEach((x, i) => b.setUint32(4 * i, x, true)); return b; }

  /** 2–20 MS/s (whole Hz). The baseband filter: `filter` Hz (rounded down to a step, at most the rate), or by
   *  default the widest step under ¾ of the rate, against aliasing. */
  async setSampleRate(rate: number, filter?: number): Promise<number> {
    if (!(rate >= 2e6 && rate <= 20e6)) throw new Error(`Sample rate ${rate} not supported (use 2–20 MS/s)`);
    await this.out(SAMPLE_RATE_SET, 0, 0, HackRf.le32(Math.round(rate), 1));
    const bw = [...FILTERS].reverse().find((f) => f <= Math.min(filter ?? 0.75 * rate, rate)) ?? FILTERS[0];
    await this.out(BASEBAND_FILTER_BANDWIDTH_SET, bw & 0xffff, bw >>> 16);
    this.filter = bw;
    return (this.sampleRate = Math.round(rate));
  }

  async setCenterFrequency(freq: number) {
    freq = Math.round(freq);
    await this.out(SET_FREQ, 0, 0, HackRf.le32(Math.floor(freq / 1e6), freq % 1e6));
    this.centerFrequency = freq;
  }

  /** Gain in dB on the RTL-SDR's scale (0–50), split between the LNA (8 dB steps) and the baseband VGA (2 dB steps);
   *  null (the RTL's automatic gain; the HackRF has none) picks a middle setting. */
  async setGain(db: number | null) {
    const g = db ?? 35;
    await this.setGains(8 * Math.round((g * 0.8) / 8), 2 * Math.round((g * 0.8) / 2));
  }
  /** The IF gains themselves: LNA 0–40 dB in 8 dB steps, baseband VGA 0–62 dB in 2 dB steps (clamped and rounded). */
  async setGains(lna: number, vga: number) {
    lna = Math.max(0, Math.min(40, 8 * Math.round(lna / 8))); vga = Math.max(0, Math.min(62, 2 * Math.round(vga / 2)));
    if ((await this.in(SET_LNA_GAIN, 0, lna, 1)).getUint8(0) !== 1) throw new Error(`HackRF refused LNA gain ${lna}`);
    if ((await this.in(SET_VGA_GAIN, 0, vga, 1)).getUint8(0) !== 1) throw new Error(`HackRF refused VGA gain ${vga}`);
    this.lna = lna; this.vga = vga;
  }
  /** The 14 dB RF amp in front of everything. The server decides when it may be on (never near strong broadcast). */
  async setAmp(on: boolean) { await this.out(AMP_ENABLE, on ? 1 : 0); this.amp = on; }

  async setPpm(_ppm: number) {} // a TCXO on the Pro; nothing to correct

  /** Stream samples as interleaved unsigned 8-bit I/Q (.cu8, like the RTL-SDR; the HackRF sends signed bytes) until stop(). */
  async stream(onData: (cu8: Uint8Array) => void): Promise<void> {
    await this.out(SET_TRANSCEIVER_MODE, MODE_RECEIVE);
    this.streaming = true;
    const queue = Array.from({ length: QUEUE }, () => this.dev.transferIn(BULK_ENDPOINT, BUFFER_BYTES));
    try {
      while (this.streaming) {
        const r = await queue.shift()!;
        if (this.streaming) queue.push(this.dev.transferIn(BULK_ENDPOINT, BUFFER_BYTES));
        if (r.status !== "ok" || !r.data) throw new Error(`USB bulk read failed: ${r.status}`);
        const b = new Uint8Array(r.data.buffer.slice(r.data.byteOffset, r.data.byteOffset + r.data.byteLength)), w = new Uint32Array(b.buffer, 0, b.length >> 2);
        for (let i = 0; i < w.length; i++) w[i] ^= 0x80808080; // signed → offset binary: s + 128 = s XOR 0x80
        for (let i = w.length << 2; i < b.length; i++) b[i] ^= 0x80;
        onData(b);
      }
    } finally {
      this.streaming = false;
      await Promise.allSettled(queue); // in-flight reads reject once one fails; awaited, so that can't crash Node
      await this.out(SET_TRANSCEIVER_MODE, MODE_OFF).catch(() => {});
    }
  }

  stop() { this.streaming = false; }

  async close() {
    this.stop();
    try { await this.out(SET_TRANSCEIVER_MODE, MODE_OFF); }
    finally { await this.dev.releaseInterface(0).catch(() => {}); await this.dev.close(); }
  }
}
