// Run: node src/meteor.test.ts. A synthetic Meteor-M2 3/4 pass in the real format, as SatDump's "M2-x LRPT 72k" pipeline
// expects it (packets → M_PDU → VCDU → Reed-Solomon in the conventional basis → PN → ASM → NRZ-M → convolutional code →
// offset QPSK, RRC roll-off 0.5, at 204.8 kS/s like the page), with Doppler, an unknown phase, mirrored I/Q and noise,
// decoded back to pixels.
import assert from "node:assert/strict";
import { MeteorReceiver, Channel, align, composite } from "./meteor.ts";
import { synthesize, score } from "./meteor-sim.ts";

const fs = 204800;
function decode(name: string, sim: ReturnType<typeof synthesize>, finalDop: number, minBlocks: number) {
  const rx = new MeteorReceiver(fs);
  for (let i = 0; i < sim.iq.length; i += 32768) rx.push(sim.iq.subarray(i, i + 32768));
  const ch = rx.packets.channels.get(64);
  console.log(`${name}: Doppler ends at ${finalDop.toFixed(0)} Hz → measured ${rx.stats.freqHz.toFixed(0)} Hz; ${rx.stats.frames} of ${sim.frames} frames, ${rx.packets.stats.packets} packets, ${ch?.rows.length ?? 0} lines of blocks, Reed-Solomon fixed ${rx.stats.rsFixed} bytes, ${rx.stats.rsBad} frames beyond repair`);
  assert.ok(Math.abs(rx.stats.freqHz - finalDop) < 100, `${name}: frequency tracked`);
  assert.ok(ch && ch.rows.length >= 2, `${name}: picture lines`);
  const { good, checked } = score(ch.rows); // blocks never received stay 0; the first frames are lost while locking on
  assert.ok(rx.stats.rsProven && checked >= minBlocks && good === checked, `${name}: ${good} of ${checked} blocks exact`);
}
// Es/N0 = 0.256 / sigma² (a symbol's energy over the noise density): 0.30 → 4.5 dB, 0.40 → 2.0 dB, near the ~1.5–2 dB
// where the rate-½ code and Reed-Solomon stop coping. Real passes sweep about ±3.3 kHz at up to ~70 Hz/s.
decode("Q ahead, steady 2.8 kHz, 4.5 dB", synthesize({ qShift: -0.5, doppler: () => 2800, sigma: 0.3 }), 2800, 1500);
const ramp = (t: number) => 2800 - 150 * t, rampSim = synthesize({ qShift: 0.5, doppler: ramp, sigma: 0.3 }); // twice the fastest real Doppler change
decode("Q behind, Doppler falling 150 Hz/s, 4.5 dB", rampSim, ramp(rampSim.seconds), 1500);
decode("Q behind, −7 kHz (Doppler plus a cheap dongle's crystal error), 4.5 dB", synthesize({ qShift: 0.5, doppler: () => -7000, sigma: 0.3 }), -7000, 1500);
decode("Q ahead, −1.5 kHz, 2.0 dB", synthesize({ qShift: -0.5, doppler: () => -1500, sigma: 0.4 }), -1500, 1500);

// 5. Lining channels up: one shared counter, each line sent as 14 packets of APID 64, then 65, then 66, then telemetry.
// Channel 65 loses line 3 completely (it becomes a blank row); the counter wraps at 16384 in the middle.
{
  const chs = new Map([64, 65, 66].map((a) => [a, new Channel()])), px = new Uint8Array(112 * 8);
  let seq = 16384 - 100;
  for (let line = 0; line < 8; line++) for (const a of [64, 65, 66, 70]) for (let k = 0; k < 14; k++, seq++) if (a !== 70 && !(a === 65 && line === 3)) chs.get(a)!.add(k * 14, seq % 16384, px);
  assert.equal(chs.get(65)!.rows.length, 8, "the lost line is kept as a gap, so the picture keeps its shape");
  assert.ok(chs.get(65)!.rows[3].every((v) => v === 0) && chs.get(65)!.rowMs[3] === 0, "a blank row with no time");
  assert.deepEqual(align(chs.get(65)!, 65, chs.get(64)!, 64), [0, 1, 2, 3, 4, 5, 6, 7], "65 → 64 looks back");
  assert.deepEqual(align(chs.get(64)!, 64, chs.get(65)!, 65), [0, 1, 2, 3, 4, 5, 6, 7], "64 → 65 looks forward");
  assert.deepEqual(align(chs.get(64)!, 64, chs.get(66)!, 66), [0, 1, 2, 3, 4, 5, 6, 7]);
  const img = composite(chs, [65, 65, 64]);
  assert.equal(img.height, 8 * 8, "as tall as the red channel, gap included");
  console.log("channels line up across a lost line and the counter wrap");
}
console.log("all checks passed");
