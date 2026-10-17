// Checks the antenna lab's formulas against known values. Run: node src/ham/antenna-math.test.ts
import assert from "node:assert/strict";
import * as A from "./antenna-math.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
near(A.wavelength(300), 0.9993, 0.001, "300 MHz is about 1 m");
near(A.wireDirectivityDbi(0.5), 2.15, 0.02, "half-wave dipole");
near(A.wireDirectivityDbi(0.01), 1.76, 0.02, "very short dipole");
near(A.wireDirectivityDbi(1.0), 3.82, 0.05, "full-wave wire");
near(A.wireDirectivityDbi(1.25), 5.16, 0.05, "1.25-wave wire (extended double Zepp)");
near(A.apertureM2(2.15, 137.5), 0.62, 0.01, "a dipole's capture area at 137.5 MHz");
near(A.fsplDb(1, 100), 72.45, 0.01, "1 km at 100 MHz");
near(A.fsplDb(830, 137.9), 133.6, 0.1, "a satellite straight overhead at 830 km, 137.9 MHz");
near(A.noiseFloorDbm(1, 0), -174, 1e-9, "−174 dBm in one hertz");
near(A.noiseFloorDbm(150e3, 1.1), -121.1, 0.1, "a 150 kHz channel behind a 1.1 dB amplifier");
near(A.dishGainDbi(1, 10000, 0.55), 37.8, 0.1, "1 m dish at 10 GHz, 55% efficient");
near(A.dishBeamwidthDeg(1, 10000), 2.1, 0.05, "its beamwidth");
near(A.fresnelM(5, 5, 2400), 17.32 * Math.sqrt((5 * 5) / (2.4 * 10)), 0.05, "first Fresnel zone, middle of a 10 km 2.4 GHz link (the 17.32 rule of thumb)");
near(A.polLossDb(0), 0, 1e-9, "aligned"); near(A.polLossDb(45), 3.01, 0.01, "45°"); near(A.polLossDb(90), 30, 1e-9, "crossed (capped)");
near(A.LINEAR_VS_CIRCULAR_DB, 3.01, 0.01, "linear vs circular");
near(A.trimmed(1.0, 140.2, 137.5), 1.0196, 0.0001, "resonating 2.7 MHz high: lengthen 2%");
near(A.cutList(137.5).vDipoleLeg, 0.529, 0.002, "V-dipole leg at 137.5 MHz: the 53 cm design");
near(A.cutList(146).dipoleLeg * 2 * 3.2808, 468 / 146, 0.02, "the 468 rule, in feet");
console.log("antenna math: every formula matches its known value");
