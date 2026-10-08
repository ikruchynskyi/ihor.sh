// Radio from scratch, chapter 15: the network source.
// Run it:  node course/code/ch15.ts      (part 3 measures this site's server if it's running on this computer)
import assert from "node:assert/strict";
import { powerSpectrum } from "../../src/dsp.ts";

const TAU = 2 * Math.PI, fs = 1_024_000, N = 4096;

// 1. A single station at +200 kHz, as bytes. Swap I and Q in every other packet: a ghost appears at −200 kHz.
const bytes = new Uint8Array(2 * N);
for (let k = 0; k < N; k++) { bytes[2 * k] = Math.round(127.5 + 100 * Math.cos((TAU * 200e3 * k) / fs)); bytes[2 * k + 1] = Math.round(127.5 + 100 * Math.sin((TAU * 200e3 * k) / fs)); }
const decode = (keepPairs: boolean) => {
  const out = new Float32Array(2 * N);
  for (let k = 0; k < N; k++) {
    const swap = !keepPairs && Math.floor(k / 256) % 2 === 1; // every other 512-byte packet started on a Q byte
    out[2 * k] = (bytes[2 * k + (swap ? 1 : 0)] - 127.5) / 127.5; out[2 * k + 1] = (bytes[2 * k + (swap ? 0 : 1)] - 127.5) / 127.5;
  }
  return powerSpectrum(out, 0, N);
};
const bin = (f: number) => Math.round((f / fs) * N + N / 2);
for (const keep of [true, false]) {
  const sp = decode(keep);
  console.log(`${keep ? "pairs kept together" : "pairs split       "}: station ${sp[bin(200e3)].toFixed(1)} dB, mirror at −200 kHz ${sp[bin(-200e3)].toFixed(1)} dB`);
}
assert.ok(decode(false)[bin(-200e3)] > decode(true)[bin(-200e3)] + 40);

// 2. Bandwidth: what different ways of sending cost, for 10 listeners, vs a 20 Mbit/s home upload (2.5 MB/s).
for (const [name, bps] of [["whole band 1.024 MS/s", 2.048e6], ["250 kHz slice, 8-bit", 0.5e6], ["48 kHz slice, 8-bit", 96e3], ["Opus audio", 8e3]] as const)
  console.log(`${name.padEnd(22)} × 10 listeners = ${(bps * 10 / 1e6).toFixed(2).padStart(6)} MB/s ${bps * 10 <= 2.5e6 ? "fits" : "does NOT fit"} in 2.5 MB/s`);

// 3. The real server, if it's here: rate, read sizes, and how often a read splits an I/Q pair.
try {
  const r = await fetch("http://localhost:8073/api/stream", { signal: AbortSignal.timeout(4000) });
  const rate = Number(r.headers.get("x-sample-rate")), reader = r.body!.getReader();
  let total = 0, reads = 0, odd = 0, first = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (!first) first = performance.now(); total += value.length; reads++; if (value.length % 2) odd++; } } catch { /* timeout ends it */ }
  const secs = (performance.now() - first) / 1000;
  console.log(`server: ${reads} reads, average ${(total / reads / 1024).toFixed(1)} KiB, ${(total / secs / 1e6).toFixed(2)} MB/s (expected ${(rate * 2 / 1e6).toFixed(2)}), ${odd} reads of odd length`);
} catch { console.log("server: not running here, skipped"); }
console.log("all checks passed");
