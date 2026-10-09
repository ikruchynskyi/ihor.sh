// Run: npm test  (node strips the TS types itself, no test framework)
import assert from "node:assert/strict";
import { powerSpectrum, firLowpass, freqResponse, receive, synth, Receiver, Squelch } from "./dsp.ts";
import { decodeCU8, parseName } from "./iq.ts";

const peakBin = (x: Float32Array) => x.reduce((best, v, i) => (v > x[best] ? i : best), 0);

// A tone at +fs/8 lands 1/8 of the way right of center.
{
  const n = 1024, fs = 1024;
  const iq = synth(fs, n / fs, [{ kind: "USB", offset: 128 - 1, tone: 1, amp: 1 }], 0);
  assert.equal(peakBin(powerSpectrum(iq, 0, n)), n / 2 + 128);
}

// Low-pass: passband ~0 dB, stopband well below -40 dB.
{
  const h = firLowpass(0.1, 0.05);
  const r = freqResponse(h, 1000); // index p ↔ p/1000 - 0.5 cycles/sample
  assert.ok(Math.abs(r[500]) < 0.1, `DC gain ${r[500]}`);
  assert.ok(r[500 + 200] < -40, `stopband ${r[700]}`);
}

// Each synthetic signal demodulates back to its tone.
{
  const fs = 1.024e6;
  const iq = synth(fs, 0.25, [
    { kind: "FM", offset: 200e3, tone: 1000, amp: 0.5 },
    { kind: "AM", offset: -150e3, tone: 600, amp: 0.4 },
    { kind: "USB", offset: 350e3, tone: 800, amp: 0.3 },
  ]);
  for (const [offset, mode, bw, tone] of [
    [200e3, "WFM", 200e3, 1000],
    [-150e3, "AM", 10e3, 600],
    [350e3, "USB", 2.8e3, 800],
  ] as const) {
    const { audio, audioFs } = receive(iq, fs, offset, mode, bw);
    // Count zero crossings in the second half (skip filter warm-up).
    const tail = audio.subarray(audio.length >> 1);
    let crossings = 0;
    for (let i = 1; i < tail.length; i++) if (tail[i - 1] < 0 !== tail[i] < 0) crossings++;
    const est = (crossings / 2) * (audioFs / tail.length);
    assert.ok(Math.abs(est - tone) < tone * 0.05, `${mode}: got ${est.toFixed(1)} Hz, want ${tone}`);
  }
}

// Streaming: odd-sized chunks give exactly the same audio as one whole buffer (no edge clicks).
{
  const fs = 1.024e6;
  const iq = synth(fs, 0.1, [{ kind: "FM", offset: 200e3, tone: 1000, amp: 0.5 }]);
  for (const mode of ["WFM", "AM", "USB"] as const) {
    const whole = new Receiver(fs, 200e3, mode, mode === "USB" ? 2.8e3 : 200e3).process(iq).audio;
    const r = new Receiver(fs, 200e3, mode, mode === "USB" ? 2.8e3 : 200e3);
    const parts: number[] = [];
    for (let s = 0; s < iq.length; s += 2 * 12_345) parts.push(...r.process(iq.subarray(s, s + 2 * 12_345)).audio);
    assert.equal(parts.length, whole.length, `${mode} length`);
    assert.ok(parts.every((v, i) => v === whole[i]), `${mode}: chunked output differs`);
  }
}

// Squelch: closed on weak noise, opens on a signal, stays open through a small dip (hysteresis), closes on noise.
{
  const sq = new Squelch(-30);
  const chunk = (amp: number) => { const x = new Float32Array(2000); for (let i = 0; i < x.length; i++) x[i] = amp * (Math.random() * 2 - 1); return x; };
  // uniform noise of amplitude a has power 2a²/3 (I and Q): 0.005 → −48 dB, 0.2 → −16 dB, 0.031 → −32 dB
  for (let i = 0; i < 5; i++) assert.equal(sq.update(chunk(0.005)), false);   // noise only: stays closed
  for (let i = 0; i < 5; i++) sq.update(chunk(0.2));                            // a signal: opens
  assert.equal(sq.open, true);
  for (let i = 0; i < 10; i++) sq.update(chunk(0.031));                         // −32 dB: below the threshold but within 3 dB
  assert.equal(sq.open, true, "hysteresis keeps it open");
  for (let i = 0; i < 10; i++) sq.update(chunk(0.005));
  assert.equal(sq.open, false);
}

// cu8 decode and file-name parsing.
{
  const d = decodeCU8(new Uint8Array([0, 255, 127, 128]).buffer);
  assert.ok(Math.abs(d[0] + 1) < 1e-6 && Math.abs(d[1] - 1) < 1e-6 && Math.abs(d[2]) < 0.01);
  assert.deepEqual(parseName("fm_100.3M_2.4M.cu8"), { center: 100.3e6, rate: 2.4e6 });
  assert.deepEqual(parseName("gqrx_20240101_120000_100300000_2400000_fc.raw"), { center: 100.3e6, rate: 2.4e6 });
}

console.log("dsp ok");
// CW: a keyed carrier through the CW receiver and the signal decoder reads its text
{
  const { synth: syn, Receiver: Rx } = await import("./dsp.ts");
  const { CwSignalDecoder } = await import("./cw.ts");
  const fsT = 1.024e6, iqT = syn(fsT, 9, [{ kind: "CW", offset: 120e3, tone: 0, amp: 0.3, text: "CQ DE TEST", wpm: 20 }, { kind: "CW", offset: 121.5e3, tone: 0, amp: 0.3, text: "EEEEEE", wpm: 25 }], 0.05);
  const rx = new Rx(fsT, 120e3, "CW", 500), d = new CwSignalDecoder();
  for (let i = 0; i < iqT.length; i += 2 * 65536) { const o = rx.process(iqT.subarray(i, i + 2 * 65536)); d.process(o.env!, o.envFs); }
  const words = d.dec.text.trim().split(/\s+/);
  if (!d.dec.text.includes("DE TEST")) throw new Error(`CW decode: "${d.dec.text}"`);
  if (Math.abs(d.wpm - 20) > 4) throw new Error(`CW speed ${d.wpm}`);
  console.log("cw receive ok:", words.slice(0, 6).join(" "), `(${d.wpm.toFixed(1)} WPM)`);
}
