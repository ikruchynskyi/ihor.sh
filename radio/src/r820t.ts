// Rafael Micro R820T/R820T2 (and R828D) tuner, driven over the RTL2832U's I2C bridge.
// The chip has no public datasheet; register meanings follow the community-documented
// behavior (Rafael's leaked driver, as used by librtlsdr and Linux). Our own implementation.

export interface I2C {
  write(addr: number, bytes: number[]): Promise<void>;
  read(addr: number, len: number): Promise<Uint8Array>;
}

export const R820T_ADDR = 0x34;
export const R828D_ADDR = 0x74;
export const CHECK_VAL = 0x69; // register 0 reads 0x69 (raw, not bit-reversed) on all R82xx

// Power-on values for registers 0x05..0x1f.
const INIT = [
  0x83, 0x32, 0x75,
  0xc0, 0x40, 0xd6, 0x6c,
  0xf5, 0x63, 0x75, 0x68,
  0x6c, 0x83, 0x80, 0x00,
  0x0f, 0x00, 0xc0, 0x30,
  0x48, 0xcc, 0x60, 0x00,
  0x54, 0xae, 0x4a, 0xc0,
];

// RF front-end settings per LO band: [start MHz, open_d, rf_mux_ploy, tf_c (tracking filter)].
const BANDS: [number, number, number, number][] = [
  [0, 0x08, 0x02, 0xdf], [50, 0x08, 0x02, 0xbe], [55, 0x08, 0x02, 0x8b], [60, 0x08, 0x02, 0x7b],
  [65, 0x08, 0x02, 0x69], [70, 0x08, 0x02, 0x58], [75, 0x00, 0x02, 0x44], [80, 0x00, 0x02, 0x44],
  [90, 0x00, 0x02, 0x34], [100, 0x00, 0x02, 0x34], [110, 0x00, 0x02, 0x24], [120, 0x00, 0x02, 0x24],
  [140, 0x00, 0x02, 0x14], [180, 0x00, 0x02, 0x13], [220, 0x00, 0x02, 0x13], [250, 0x00, 0x02, 0x11],
  [280, 0x00, 0x02, 0x00], [310, 0x00, 0x41, 0x00], [450, 0x00, 0x41, 0x00], [588, 0x00, 0x40, 0x00],
  [650, 0x00, 0x40, 0x00],
];

// Gain steps in tenths of a dB (measured by the rtl-sdr community at 928 MHz).
const LNA_STEPS = [0, 9, 13, 40, 38, 13, 31, 22, 26, 31, 26, 14, 19, 5, 35, 13];
const MIXER_STEPS = [0, 5, 10, 10, 19, 9, 10, 25, 17, 10, 8, 16, 13, 6, 3, -8];

/** Every gain (tenths of dB) the manual LNA+mixer ladder can produce. */
export const GAINS = (() => {
  const out = [0];
  for (let i = 1, g = 0; i < 16; i++) {
    out.push((g += LNA_STEPS[i]));
    out.push((g += MIXER_STEPS[i]));
  }
  return out.slice(0, 29);
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NIBBLE_REV = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];
/** The R82xx returns read data LSB-first. */
const bitrev = (b: number) => (NIBBLE_REV[b & 0xf] << 4) | NIBBLE_REV[b >> 4];

export class R820T {
  /** Intermediate frequency the tuner outputs; the RTL2832U mixes it back down. */
  intFreq = 3_570_000;
  hasLock = false;
  private regs = new Uint8Array(0x20); // shadow copy: R82xx registers are write-mostly
  private input = -1;

  private i2c: I2C;
  private addr: number;
  /** Tuner reference crystal in Hz (ppm-corrected by the caller). */
  xtal: number;

  constructor(i2c: I2C, xtal: number, addr = R820T_ADDR) {
    this.i2c = i2c; this.xtal = xtal; this.addr = addr;
  }

  private get isR828D() { return this.addr === R828D_ADDR; }

  private async write(reg: number, bytes: number[]) {
    bytes.forEach((b, i) => (this.regs[reg + i] = b));
    // The RTL2832U I2C bridge moves at most 8 bytes per transfer: 1 register + 7 data.
    for (let i = 0; i < bytes.length; i += 7) await this.i2c.write(this.addr, [reg + i, ...bytes.slice(i, i + 7)]);
  }

  private writeReg(reg: number, val: number) { return this.write(reg, [val]); }

  private writeMask(reg: number, val: number, mask: number) {
    return this.writeReg(reg, (this.regs[reg] & ~mask) | (val & mask));
  }

  /** Reads always start at register 0. */
  private async read(len: number): Promise<number[]> {
    await this.i2c.write(this.addr, [0]);
    return [...(await this.i2c.read(this.addr, len))].map(bitrev);
  }

  async init() {
    await this.write(0x05, INIT);
    await this.setTvStandard();
    await this.sysFreqSel();
  }

  /** Program the 6 MHz IF filter and calibrate it against a 56 MHz PLL tone. */
  private async setTvStandard() {
    const hpCor = 0x6b, filtQ = 0x10, filtCalLo = 56_000_000;
    this.regs.set(INIT, 0x05);
    await this.writeMask(0x0c, 0x00, 0x0f); // init flag & xtal check result
    await this.writeMask(0x13, 49, 0x3f); // version
    await this.writeMask(0x1d, 0x00, 0x38); // LT gain test
    this.intFreq = 3_570_000;

    let calCode = 0;
    for (let i = 0; i < 2; i++) {
      await this.writeMask(0x0b, hpCor, 0x60); // filter cap
      await this.writeMask(0x0f, 0x04, 0x04); // calibration clock on
      await this.writeMask(0x10, 0x00, 0x03); // xtal cap 0 pF for the PLL
      await this.setPll(filtCalLo);
      if (!this.hasLock) throw new Error("R820T: PLL did not lock during filter calibration");
      await this.writeMask(0x0b, 0x10, 0x10); // start trigger
      await this.writeMask(0x0b, 0x00, 0x10); // stop trigger
      await this.writeMask(0x0f, 0x00, 0x04); // calibration clock off
      calCode = (await this.read(5))[4] & 0x0f;
      if (calCode && calCode !== 0x0f) break;
    }
    if (calCode === 0x0f) calCode = 0; // narrowest

    await this.writeMask(0x0a, filtQ | calCode, 0x1f);
    await this.writeMask(0x0b, hpCor, 0xef); // bandwidth, filter gain, HP corner
    await this.writeMask(0x07, 0x00, 0x80); // image negative
    await this.writeMask(0x06, 0x10, 0x30); // filter +3 dB, 6 MHz on
    await this.writeMask(0x1e, 0x60, 0x60); // channel filter extension
    await this.writeMask(0x05, 0x01, 0x80); // loop-through off
    await this.writeMask(0x1f, 0x00, 0x80); // loop-through attenuation
    await this.writeMask(0x0f, 0x00, 0x80); // filter extension widest off
    await this.writeMask(0x19, 0x60, 0x60); // RF poly filter current: min
  }

  /** LNA/mixer AGC thresholds and charge-pump currents (the "DVB-T" profile everyone uses for SDR). */
  private async sysFreqSel() {
    const mixerTop = 0x24, lnaTop = 0xe5, cpCur = 0x38, divBufCur = 0x30;
    await this.writeMask(0x1d, lnaTop, 0xc7);
    await this.writeMask(0x1c, mixerTop, 0xf8);
    await this.writeReg(0x0d, 0x53); // LNA vth 0.84 V, vtl 0.64 V
    await this.writeReg(0x0e, 0x75); // mixer vth 1.04 V, vtl 0.84 V
    this.input = 0x00;
    await this.writeMask(0x05, 0x00, 0x60); // air-in
    await this.writeMask(0x06, 0x00, 0x08); // cable2 off
    await this.writeMask(0x11, cpCur, 0x38);
    await this.writeMask(0x17, divBufCur, 0x30);
    await this.writeMask(0x0a, 0x40, 0x60); // filter current: low

    await this.writeMask(0x1d, 0x00, 0x38); // LNA top: lowest
    await this.writeMask(0x1c, 0x00, 0x04); // normal mode
    await this.writeMask(0x06, 0x00, 0x40); // pre-detect off
    await this.writeMask(0x1a, 0x30, 0x30); // AGC clock 250 Hz
    await sleep(250);
    await this.writeMask(0x1d, 0x18, 0x38); // LNA top = 3
    await this.writeMask(0x1c, mixerTop, 0x04); // discharge mode
    await this.writeMask(0x1e, 14, 0x1f); // LNA discharge current
    await this.writeMask(0x1a, 0x20, 0x30); // AGC clock 60 Hz
  }

  /** Program the PLL so the local oscillator runs at `freq` Hz. */
  private async setPll(freq: number) {
    const vcoMin = 1_770_000_000, vcoMax = 2 * vcoMin;
    const vcoPowerRef = this.isR828D ? 1 : 2;

    await this.writeMask(0x10, 0x00, 0x10); // refdiv2 off
    await this.writeMask(0x1a, 0x00, 0x0c); // PLL autotune 128 kHz
    await this.writeMask(0x12, 0x80, 0xe0); // VCO current 100

    // Smallest power-of-two divider that puts the VCO in its 1.77–3.54 GHz range.
    let mixDiv = 2, divNum = 0;
    for (; mixDiv <= 64; mixDiv <<= 1) {
      if (freq * mixDiv >= vcoMin && freq * mixDiv < vcoMax) {
        for (let d = mixDiv; d > 2; d >>= 1) divNum++;
        break;
      }
    }
    if (mixDiv > 64) throw new Error(`R820T: ${freq} Hz is out of range`);

    const vcoFineTune = ((await this.read(5))[4] & 0x30) >> 4;
    if (vcoFineTune > vcoPowerRef) divNum--;
    else if (vcoFineTune < vcoPowerRef) divNum++;
    await this.writeMask(0x10, divNum << 5, 0xe0);

    // VCO / (2·xtal) = nint + sdm/65536, rounded. Fits easily in a double (< 2^53).
    const vcoFreq = freq * mixDiv;
    const vcoDiv = Math.floor((this.xtal + 65536 * vcoFreq) / (2 * this.xtal));
    const nint = Math.floor(vcoDiv / 65536), sdm = vcoDiv % 65536;
    if (nint < 13 || nint > (this.isR828D ? 127 : 76)) throw new Error(`R820T: no PLL setting for ${freq} Hz`);

    const ni = Math.floor((nint - 13) / 4), si = nint - 4 * ni - 13;
    await this.writeReg(0x14, ni + (si << 6));
    await this.writeMask(0x12, sdm === 0 ? 0x08 : 0x00, 0x08); // power down the sigma-delta when unused
    await this.writeReg(0x16, sdm >> 8);
    await this.writeReg(0x15, sdm & 0xff);

    for (let i = 0; i < 2; i++) {
      await sleep(10);
      this.hasLock = ((await this.read(3))[2] & 0x40) !== 0;
      if (this.hasLock) break;
      await this.writeMask(0x12, 0x60, 0xe0); // no lock yet: raise VCO current
    }
    if (this.hasLock) await this.writeMask(0x1a, 0x08, 0x08); // PLL autotune 8 kHz
  }

  /** Front-end band (tracking filter, mux) for LO frequency `lo`. */
  private async setMux(lo: number) {
    const mhz = lo / 1e6;
    let i = 0;
    while (i < BANDS.length - 1 && mhz >= BANDS[i + 1][0]) i++;
    const [, openD, rfMux, tfC] = BANDS[i];
    await this.writeMask(0x17, openD, 0x08);
    await this.writeMask(0x1a, rfMux, 0xc3);
    await this.writeReg(0x1b, tfC);
    await this.writeMask(0x10, 0x00, 0x0b); // xtal cap: high, 0 pF
    await this.writeMask(0x08, 0x00, 0x3f);
    await this.writeMask(0x09, 0x00, 0x3f);
  }

  /** Tune so that RF `freq` lands at the IF. */
  async setFrequency(freq: number) {
    const lo = freq + this.intFreq;
    await this.setMux(lo);
    await this.setPll(lo);
    if (!this.hasLock) throw new Error(`R820T: PLL did not lock at ${(freq / 1e6).toFixed(3)} MHz`);
    if (this.isR828D) {
      // R828D sticks have two RF inputs; switch at 345 MHz. (RTL-SDR Blog V4 HF/notch handling not implemented.)
      const input = freq > 345e6 ? 0x00 : 0x60;
      if (input !== this.input) { this.input = input; await this.writeMask(0x05, input, 0x60); }
    }
  }

  /** Manual gain in tenths of dB (nearest step at or above), or null for the tuner's AGC. */
  async setGain(tenthsDb: number | null) {
    if (tenthsDb === null) {
      await this.writeMask(0x05, 0x00, 0x10); // LNA AGC on
      await this.writeMask(0x07, 0x10, 0x10); // mixer AGC on
      await this.writeMask(0x0c, 0x0b, 0x9f); // fixed VGA 26.5 dB
      return;
    }
    await this.writeMask(0x05, 0x10, 0x10); // LNA AGC off
    await this.writeMask(0x07, 0x00, 0x10); // mixer AGC off
    await this.writeMask(0x0c, 0x08, 0x9f); // fixed VGA 16.3 dB
    let total = 0, lna = 0, mix = 0;
    for (let i = 0; i < 15 && total < tenthsDb; i++) {
      total += LNA_STEPS[++lna];
      if (total >= tenthsDb) break;
      total += MIXER_STEPS[++mix];
    }
    await this.writeMask(0x05, lna, 0x0f);
    await this.writeMask(0x07, mix, 0x0f);
  }

  /** Put the tuner in standby (lowers power and heat). */
  async standby() {
    await this.writeReg(0x06, 0xb1);
    await this.writeReg(0x05, 0x03);
    await this.writeReg(0x07, 0x3a);
    await this.writeReg(0x08, 0x40);
    await this.writeReg(0x09, 0xc0);
    await this.writeReg(0x0a, 0x36);
    await this.writeReg(0x0c, 0x35);
    await this.writeReg(0x0f, 0x68);
    await this.writeReg(0x11, 0x03);
    await this.writeReg(0x17, 0xf4);
    await this.writeReg(0x19, 0x0c);
  }
}
