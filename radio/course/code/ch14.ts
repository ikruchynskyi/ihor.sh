// Radio from scratch, chapter 14: writing the driver.
// Run it:  node course/code/ch14.ts
// Runs the real driver against a pretend dongle and prints everything it says, decoded.
import assert from "node:assert/strict";
import { RtlSdr } from "../../src/rtlsdr.ts";
import { recording, fakeDongle, decode, type Entry } from "../../src/course/trace.ts";

const log: Entry[] = [], phase = { name: "open" };
const sdr = await RtlSdr.open(recording(fakeDongle(), log, phase));
phase.name = "set sample rate 2.4 MS/s"; await sdr.setSampleRate(2_400_000);
phase.name = "tune to 98.45 MHz"; await sdr.setCenterFrequency(98.45e6);
phase.name = "gain 30 dB"; await sdr.setGain(30);
phase.name = "close"; await sdr.close();

const phases = [...new Set(log.map((e) => e.phase))];
for (const p of phases) {
  const es = log.filter((e) => e.phase === p);
  console.log(`\n${p}: ${es.length} control transfers`);
  for (const e of es.filter((e) => !decode(e).startsWith("dummy read")).slice(0, 6)) console.log("   " + decode(e));
  if (es.length > 6) console.log("   …");
}
const unknown = log.filter((e) => decode(e).endsWith("· ?"));
console.log(`\n${log.length} control transfers in total; ${unknown.length} without a known name`);
assert.equal(unknown.length, 0);
console.log("all checks passed");
