// Audio out as one continuous stream: an AudioWorklet keeps a ring buffer with a cushion, resamples continuously
// from the radio's rate to the sound card's, and plays up to 0.5% fast or slow to hold the cushion steady (the radio's
// clock and the sound card's never agree). Then volume and a soft limiter. Spectrum Lab and course chapter 19 use it.
//
// Each chunk used to be its own AudioBufferSource, resampled on its own: a seam every ~50 ms, and gaps whenever the
// network hiccuped, which made voices sound robotic.

const PLAYER = `
class Player extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(1 << 19); this.w = 0; this.r = 0; this.rate = sampleRate; this.cushion = 4800; this.on = false; this.fade = 0;
    this.port.onmessage = ({ data: d }) => {
      if (d.rate !== this.rate || d.reset) { this.rate = d.rate; this.w = this.r = 0; this.on = false; } // new rate: start over
      if (!d.a) return;
      this.cushion = d.cushion * d.rate;
      const M = this.ring.length - 1;
      for (let i = 0; i < d.a.length; i++) this.ring[(this.w + i) & M] = d.a[i];
      this.w += d.a.length;
      if (this.w - this.r > 4 * this.cushion + d.a.length) this.r = this.w - this.cushion; // far behind: skip ahead
    };
  }
  process(_, outputs) {
    const out = outputs[0][0], M = this.ring.length - 1, have = this.w - this.r;
    if (!this.on && have >= this.cushion) this.on = true;
    if (!this.on) return true;
    const step = (this.rate / sampleRate) * (1 + Math.max(-0.005, Math.min(0.005, (0.01 * (have - this.cushion)) / this.cushion)));
    for (let i = 0; i < out.length; i++) {
      if (this.w - this.r < 2) { this.on = false; this.fade = 0; break; } // ran dry: refill the cushion first
      const k = Math.floor(this.r), f = this.r - k;
      this.fade = Math.min(1, this.fade + 1 / 256); // ~5 ms fade-in after a gap
      out[i] = this.fade * (this.ring[k & M] * (1 - f) + this.ring[(k + 1) & M] * f);
      this.r += step;
    }
    return true;
  }
}
registerProcessor("player", Player);`;
// ponytail: linear interpolation in the resampler; fine for voice, a polyphase filter if WFM music ever sounds gritty.

export interface StreamOut {
  ctx: AudioContext;
  player: AudioWorkletNode; // post { a: Float32Array, rate, cushion (s) }, or { reset: true, rate: 0 }
  vol: GainNode; // gain = 10^(dB/20) / 4: the ¼ is undone by the limiter's tanh(4x)
  rec: MediaStreamAudioDestinationNode; // what you hear, for MediaRecorder
}

/** Call from a click (browsers only allow sound after one): the AudioContext is created before the first await. */
export async function streamOut(): Promise<StreamOut> {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([PLAYER], { type: "text/javascript" })));
  const player = new AudioWorkletNode(ctx, "player", { outputChannelCount: [1] });
  // Volume, then a soft limiter: ×¼ into tanh(4x) is unity for normal levels and rounds off peaks instead of clipping.
  const vol = new GainNode(ctx, { gain: 0.25 });
  const limiter = new WaveShaperNode(ctx, { oversample: "2x", curve: Float32Array.from({ length: 1025 }, (_, i) => Math.tanh(4 * (i / 512 - 1))) });
  const rec = ctx.createMediaStreamDestination();
  player.connect(vol).connect(limiter).connect(ctx.destination);
  limiter.connect(rec);
  return { ctx, player, vol, rec };
}
