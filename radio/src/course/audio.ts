// Audio helpers for the course: play a finished sound once, or play a live stream chunk by chunk.

let shared: AudioContext | null = null;
const context = () => (shared ??= new AudioContext()); // created on first use, inside a click

/** Play samples (−1…+1) at `rate` once. Must be called from a click (browsers block sound otherwise). */
export function playOnce(samples: Float32Array, rate: number) {
  const ctx = context();
  const buf = ctx.createBuffer(1, samples.length, rate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination); src.start();
  return new Promise<void>((done) => (src.onended = () => done()));
}

/** Plays a live stream: each chunk is scheduled right after the previous one, with a small cushion. */
export class LivePlayer {
  private t = 0;
  push(samples: Float32Array, rate: number) {
    if (!samples.length) return;
    const ctx = context(), now = ctx.currentTime;
    if (this.t < now + 0.05) this.t = now + 0.15; // ran dry: rebuild a 150 ms cushion
    if (this.t > now + 0.6) return; // too far ahead (the two clocks drift apart): drop this chunk
    const buf = ctx.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(this.t);
    this.t += buf.duration;
  }
  /** How much audio is waiting to be played, in seconds. */
  get buffered() { return shared ? Math.max(0, this.t - shared.currentTime) : 0; }
}
