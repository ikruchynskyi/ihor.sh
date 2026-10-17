// The antenna lab's formulas (ham/handbook/antennas.html), shared with antenna-math.test.ts, which checks them against
// textbook values. Frequencies in MHz, distances in meters unless the name says km, powers in dB.

export const C_MS = 299_792_458;
/** Free-space wavelength, meters. */
export const wavelength = (mhz: number) => C_MS / (mhz * 1e6);

/** Far-field pattern of a thin center-fed wire `lenWl` wavelengths long, at angle `th` from the wire (radians), as a
 *  field strength (not normalized). The standard result for a sinusoidal current distribution. */
export function wirePattern(lenWl: number, th: number) {
  const s = Math.sin(th), k = Math.PI * lenWl;
  if (Math.abs(s) < 1e-9) return 0;
  return (Math.cos(k * Math.cos(th)) - Math.cos(k)) / s;
}
/** Peak directivity of that wire in dBi, by integrating its pattern over the whole sphere. */
export function wireDirectivityDbi(lenWl: number) {
  let peak = 0, sum = 0; const n = 4000;
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5) * Math.PI) / n, p = wirePattern(lenWl, th) ** 2;
    peak = Math.max(peak, p); sum += p * Math.sin(th) * (Math.PI / n);
  }
  return 10 * Math.log10((2 * peak) / sum); // D = 4π·peak / ∫∫p dΩ = 2·peak / ∫p sinθ dθ
}

/** Effective aperture: the area of the passing wave an antenna of this gain collects, m². */
export const apertureM2 = (gainDbi: number, mhz: number) => (10 ** (gainDbi / 10) * wavelength(mhz) ** 2) / (4 * Math.PI);

/** Free-space path loss in dB between two isotropic antennas. */
export const fsplDb = (km: number, mhz: number) => 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.45;
/** Received power, dBm (Friis): transmitter dBm + both gains − path loss − other losses. */
export const receivedDbm = (txDbm: number, gtDbi: number, grDbi: number, km: number, mhz: number, lossDb = 0) => txDbm + gtDbi + grDbi - fsplDb(km, mhz) - lossDb;
/** The receiver's noise floor, dBm, in a bandwidth, with a noise figure (room-temperature noise, ham lesson 11). */
export const noiseFloorDbm = (bwHz: number, nfDb: number) => -174 + 10 * Math.log10(bwHz) + nfDb;
export const dbmToWatts = (dbm: number) => 10 ** (dbm / 10) / 1000;

/** A dish's gain, dBi, for a diameter (m) and an efficiency (0–1, typically 0.5–0.65). */
export const dishGainDbi = (diaM: number, mhz: number, eff = 0.55) => 10 * Math.log10(eff * ((Math.PI * diaM) / wavelength(mhz)) ** 2);
/** A dish's half-power beamwidth, degrees (the usual 70 λ/D rule of thumb). */
export const dishBeamwidthDeg = (diaM: number, mhz: number) => (70 * wavelength(mhz)) / diaM;

/** Radius of the first Fresnel zone, m, at a point d1 km from one end and d2 km from the other. */
export const fresnelM = (d1km: number, d2km: number, mhz: number) => Math.sqrt((wavelength(mhz) * d1km * 1000 * d2km * 1000) / ((d1km + d2km) * 1000));

/** Signal lost between two linear antennas whose polarizations differ by `deg`, dB (capped: real paths rarely do worse). */
export const polLossDb = (deg: number) => Math.min(30, -20 * Math.log10(Math.max(1e-9, Math.abs(Math.cos((deg * Math.PI) / 180)))));
/** Linear receiving a circular wave (or the reverse): half the power, whatever the angle. */
export const LINEAR_VS_CIRCULAR_DB = 10 * Math.log10(2);

/** Trimming: the length that moves a measured resonance to the target (resonance scales as 1/length). */
export const trimmed = (lengthNow: number, fMeasured: number, fTarget: number) => lengthNow * (fMeasured / fTarget);

/** Starting lengths for common builds, meters. "End effect": a real wire resonates about 5% short of free space. */
export function cutList(mhz: number) {
  const q = wavelength(mhz) / 4;
  return {
    dipoleLeg: 0.95 * q,           // each half of a center-fed half-wave dipole (the "468 ÷ MHz" rule, in meters)
    groundPlaneWhip: 0.95 * q,     // the vertical of a quarter-wave ground plane
    groundPlaneRadial: 1.0 * q,    // each radial (slope them down ~45° for about 50 Ω)
    vDipoleLeg: 0.97 * q,          // each leg of a 120° V-dipole (the 137 MHz weather-satellite design: 53 cm legs)
    fiveEighthsWhip: 0.95 * 2.5 * q, // a 5/8-wave whip, which needs a matching coil at its base
  };
}

/** A horizontal half-wave dipole `hWl` wavelengths above a large, perfect reflector (image theory): gain in dBi at an
 *  elevation (degrees), broadside to the wire. Free-space dipole for comparison: 2.15 dBi. */
export function dipoleOverReflectorDbi(hWl: number, elevDeg: number) {
  const TAU = 2 * Math.PI, n = 300;
  const p = (th: number, ph: number) => { // th from straight up, ph from the wire
    const c = Math.sin(th) * Math.cos(ph), s = Math.sqrt(Math.max(1e-12, 1 - c * c));
    return ((Math.cos((Math.PI / 2) * c) / s) * 2 * Math.sin(TAU * hWl * Math.cos(th))) ** 2; // the image is inverted
  };
  let sum = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < 2 * n; j++) {
    const th = ((i + 0.5) * Math.PI) / 2 / n, ph = ((j + 0.5) * TAU) / (2 * n);
    sum += p(th, ph) * Math.sin(th) * (Math.PI / 2 / n) * (TAU / (2 * n));
  }
  return 10 * Math.log10((4 * Math.PI * p(((90 - elevDeg) * Math.PI) / 180, Math.PI / 2)) / sum);
}
