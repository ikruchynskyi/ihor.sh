// Radio from scratch, chapter 12: inside the dongle.
// Run it:  node course/code/ch12.ts
// Checks the chapter's PLL arithmetic against the real tuner driver, using a fake I2C bus that records writes.
import assert from "node:assert/strict";
import { R820T, type I2C } from "../../src/r820t.ts";
import { pll } from "../../src/course/pllmath.ts";

const NIB = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];
const bitrev = (b: number) => (NIB[b & 0xf] << 4) | NIB[b >> 4];

// A pretend tuner chip: remembers every register write, and answers reads with "PLL locked".
function fakeTuner() {
  const regs = new Map<number, number>();
  const i2c: I2C = {
    async write(_addr, bytes) { if (bytes.length > 1) bytes.slice(1).forEach((v, i) => regs.set(bytes[0] + i, v)); },
    async read(_addr, len) {
      const status = [0x69, 0, 0x40, 0, 0x28]; // reg 2 bit 6 = locked; reg 4: VCO fine tune = 2, filter calibration = 8
      return Uint8Array.from({ length: len }, (_, i) => bitrev(status[i] ?? 0)); // the chip sends bits reversed
    },
  };
  return { regs, i2c };
}

const { regs, i2c } = fakeTuner();
const tuner = new R820T(i2c, 28.8e6);
await tuner.init();
for (const mhz of [98.45, 118.45, 162.3, 440.0, 1089.75]) {
  await tuner.setFrequency(mhz * 1e6);
  const p = pll(mhz * 1e6)!;
  const sdm = (regs.get(0x16)! << 8) | regs.get(0x15)!;
  assert.equal(regs.get(0x14), p.reg14, `${mhz}: reg 0x14`);
  assert.equal(sdm, p.sdm, `${mhz}: fraction`);
  console.log(`${String(mhz).padStart(8)} MHz: ×${String(p.mixDiv).padStart(2)}, VCO ${(p.vco / 1e9).toFixed(4)} GHz, integer ${p.nint}, fraction ${String(p.sdm).padStart(5)} → reg 0x14 = 0x${p.reg14.toString(16)}, off by ${p.error.toFixed(1).padStart(5)} Hz  (driver wrote the same)`);
}

// The tuner's range: the lowest and highest frequencies the divider choice allows.
console.log(`below ${(1.77e9 / 64 - 3.57e6) / 1e6} MHz there's no divider big enough: pll(20 MHz) = ${pll(20e6)}`);
console.log(`image of 98.45 MHz: ${(98.45 + 2 * 3.57).toFixed(2)} MHz (oscillator + 3.57 lands on the same IF)`);
console.log("all checks passed");
