// Scan the FM broadcast band with our driver and rank stations by signal and stereo-pilot quality.
// Usage: node scripts/fm-scan.ts   (the dongle must be free: nobody listening to the server SDR)
import { openDongle } from "./node-usb.ts";
import { avgSpectrum, receive } from "../src/dsp.ts";
import { decodeCU8 } from "../src/iq.ts";

const FS = 2_400_000, N = 4096;
const goertzel = (x: Float32Array, f: number, rate: number) => {
  const c = 2 * Math.cos((2 * Math.PI * f) / rate); let a = 0, b = 0;
  for (const v of x) { const t = v + c * a - b; b = a; a = t; }
  return a * a + b * b - c * a * b;
};

const sdr = await openDongle();
await sdr.setSampleRate(FS);
await sdr.setGain(30);
const found: { mhz: number; snr: number; pilot: number }[] = [];
for (let center = 88e6; center <= 108e6; center += 2e6) { // even-MHz centers ± odd tenths = real channels
  await sdr.setCenterFrequency(center);
  const chunks: Uint8Array[] = []; let bytes = 0;
  await sdr.stream((d) => { chunks.push(d.slice()); bytes += d.length; if (bytes > FS * 2 * 0.8) sdr.stop(); });
  const raw = new Uint8Array(bytes); let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; }
  const iq = decodeCU8(raw.subarray(FS)); // drop the first 0.25 s after retuning
  const sp = avgSpectrum(iq, N, 32), floor = Array.from(sp).sort((a, b) => a - b)[N >> 1];
  // US FM channels are on odd tenths: 88.1, 88.3, … 107.9
  for (let off = -0.9e6; off <= 0.9e6; off += 0.2e6) {
    const mhz = Math.round((center + off) / 1e5) / 10;
    if (Math.abs(off) < 0.15e6) continue; // too close to the dongle's DC spike; covered by the next center
    const i = Math.round((off / FS) * N + N / 2);
    let p = -Infinity; for (let k = i - 20; k <= i + 20; k++) p = Math.max(p, sp[k]);
    const snr = p - floor;
    if (snr < 15) continue;
    const s = receive(iq.subarray(0, 2 * FS * 0.4), FS, off, "WFM", 200e3);
    const pilot = 10 * Math.log10(goertzel(s.demod, 19e3, s.chanFs) / ((goertzel(s.demod, 17.7e3, s.chanFs) + goertzel(s.demod, 20.3e3, s.chanFs)) / 2));
    found.push({ mhz, snr, pilot });
  }
}
await sdr.close();
const uniq = [...new Map(found.sort((a, b) => a.snr - b.snr).map((f) => [f.mhz, f])).values()].sort((a, b) => b.pilot - a.pilot);
console.log("MHz     signal  pilot  verdict");
for (const f of uniq) console.log(`${f.mhz.toFixed(1).padStart(5)}  ${f.snr.toFixed(0).padStart(4)} dB ${f.pilot.toFixed(0).padStart(4)} dB  ${f.pilot > 35 ? "clear" : f.pilot > 20 ? "ok" : "noisy"}`);
