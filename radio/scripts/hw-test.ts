// Dev-only: runs the browser driver (src/rtlsdr.ts) against a real dongle from Node, via the
// `usb` package's WebUSB implementation. Usage: node scripts/hw-test.ts [MHz]
import { writeFileSync } from "node:fs";
import { openDongle } from "./node-usb.ts";
import { avgSpectrum, receive } from "../src/dsp.ts";
import { decodeCU8 } from "../src/iq.ts";

const center = parseFloat(process.argv[2] ?? "98") * 1e6;
const fs = 2_400_000, seconds = 6;
const sdr = await openDongle();
console.log(`tuner ${sdr.tunerName}`);
const rate = await sdr.setSampleRate(fs);
await sdr.setCenterFrequency(center);
await sdr.setGain(30);
console.log(`rate ${rate.toFixed(1)} S/s, center ${center / 1e6} MHz`);

// Capture, and measure the real throughput while doing it.
const chunks: Uint8Array[] = [];
let bytes = 0, first = 0, firstBytes = 0, last = 0;
const t0 = performance.now();
const done = sdr.stream((d) => {
  if (!first) { first = performance.now(); firstBytes = d.length; }
  chunks.push(d.slice()); bytes += d.length; last = performance.now();
  if (bytes >= fs * 2 * (seconds + 0.5)) sdr.stop();
});
await done;
const secs = (performance.now() - t0) / 1000;
await sdr.close();
const steady = (bytes - firstBytes) / 2 / ((last - first) / 1000);
console.log(`got ${(bytes / 2 / 1e6).toFixed(2)} M samples in ${secs.toFixed(2)} s; steady state ${(steady / 1e6).toFixed(3)} MS/s (expected ${(rate / 1e6).toFixed(3)})`);

const raw = new Uint8Array(bytes);
let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; }
const skip = fs * 2 / 2; // drop the first 0.5 s (AGC/PLL settling)
const cu8 = raw.subarray(skip, skip + fs * 2 * seconds);
const file = `fm_${center / 1e6}M_${fs / 1e6}M.cu8`;
writeFileSync(file, cu8);
console.log(`saved ${file}`);

// Find the strongest station and check its 19 kHz stereo pilot after our own FM demod.
const iq = decodeCU8(cu8.buffer.slice(cu8.byteOffset, cu8.byteOffset + cu8.length));
const N = 4096, spec = avgSpectrum(iq, N, 64);
const binHz = fs / N;
let best = -1, bestDb = -Infinity;
for (let i = 0; i < N; i++) {
  const f = (i - N / 2) * binHz;
  if (Math.abs(f) < 150e3 || Math.abs(f) > 1.05e6) continue; // skip DC and band edges
  if (spec[i] > bestDb) { bestDb = spec[i]; best = f; }
}
const offset = Math.round(best / 100e3) * 100e3; // US FM channels sit on odd 100 kHz steps
const sorted = Array.from(spec).sort((a, b) => a - b);
console.log(`strongest: ${((center + offset) / 1e6).toFixed(1)} MHz, ${(bestDb - sorted[N >> 1]).toFixed(1)} dB above the noise floor`);

const s = receive(iq, fs, offset, "WFM", 200e3);
const goertzel = (x: Float32Array, f: number, rate: number) => {
  const w = (2 * Math.PI * f) / rate, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (const v of x) { const s0 = v + c * s1 - s2; s2 = s1; s1 = s0; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
};
const pilot = goertzel(s.demod, 19e3, s.chanFs);
const around = (goertzel(s.demod, 17.7e3, s.chanFs) + goertzel(s.demod, 20.3e3, s.chanFs)) / 2;
const pilotDb = 10 * Math.log10(pilot / around);
console.log(`19 kHz pilot: ${pilotDb.toFixed(1)} dB above its neighbors → ${pilotDb > 10 ? "PASS: real FM stereo decoded" : "FAIL"}`);
const pcm = Int16Array.from(s.audio, (v) => Math.max(-1, Math.min(1, v)) * 32767);
const hdr = Buffer.alloc(44), sr = Math.round(s.audioFs);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.byteLength, 4); hdr.write("WAVEfmt ", 8);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(sr, 24);
hdr.writeUInt32LE(sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.byteLength, 40);
writeFileSync(file.replace(".cu8", ".wav"), Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
console.log(`audio: ${(s.audio.length / s.audioFs).toFixed(1)} s at ${s.audioFs} Hz`);
process.exit(pilotDb > 10 ? 0 : 1);
