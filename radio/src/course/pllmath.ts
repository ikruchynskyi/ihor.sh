// The R820T's PLL arithmetic, written out plainly (the driver's version is setPll() in src/r820t.ts).
const IF = 3.57e6, XTAL = 28.8e6;

/** How the tuner makes its local oscillator for listening at `freq` Hz; null if out of range. */
export function pll(freq: number) {
  const lo = freq + IF; // the oscillator runs 3.57 MHz above the station
  let mixDiv = 2; // the VCO only works between 1.77 and 3.54 GHz: find the power of two that gets there
  while (mixDiv <= 64 && !(lo * mixDiv >= 1.77e9 && lo * mixDiv < 3.54e9)) mixDiv *= 2;
  if (mixDiv > 64) return null;
  const vco = lo * mixDiv, vcoDiv = Math.floor((XTAL + 65536 * vco) / (2 * XTAL)); // VCO/(2·xtal), rounded, × 65536
  const nint = Math.floor(vcoDiv / 65536), sdm = vcoDiv % 65536; // integer and 16-bit fraction
  const ni = Math.floor((nint - 13) / 4), si = nint - 4 * ni - 13; // the integer's odd split form for register 0x14
  const actual = (2 * XTAL * (nint + sdm / 65536)) / mixDiv - IF;
  return { lo, mixDiv, vco, nint, sdm, reg14: ni + (si << 6), actual, error: actual - freq };
}
