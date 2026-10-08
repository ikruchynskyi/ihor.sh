// "My SDR": the dongle on the server, streamed over plain HTTP by server.ts. Same shape as RtlSdr,
// so the live pipeline doesn't care which one it's fed by.

const MIN_CHUNK = 64 * 1024; // network reads arrive in odd sizes; regroup into ~32 ms blocks at 1 MS/s

export class RemoteSdr {
  tunerName = "";
  sampleRate = 0;
  centerFrequency = 0;
  private abort = new AbortController();

  static async connect(): Promise<RemoteSdr> {
    const r = await fetch("/api/state");
    if (!r.ok) throw new Error("No SDR server here. Open the page from the Mac running `npm run serve`.");
    const s = await r.json();
    const sdr = new RemoteSdr();
    sdr.sampleRate = s.rate; sdr.centerFrequency = s.center;
    return sdr;
  }

  private async post(body: object) {
    const r = await fetch("/api/tune", { method: "POST", body: JSON.stringify(body) });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error);
    return s;
  }

  async setCenterFrequency(freq: number) { await this.post({ center: freq }); this.centerFrequency = freq; }
  async setGain(db: number | null) { await this.post({ gain: db }); }

  async stream(onData: (cu8: Uint8Array) => void): Promise<void> {
    const r = await fetch("/api/stream", { signal: this.abort.signal });
    if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    this.sampleRate = Number(r.headers.get("x-sample-rate")) || this.sampleRate;
    const s = await fetch("/api/state").then((x) => x.json());
    this.tunerName = s.tuner;
    const reader = r.body.getReader();
    let pending: Uint8Array[] = [], size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending.push(value); size += value.length;
        if (size < MIN_CHUNK) continue;
        const even = size & ~1; // keep I/Q pairs together
        const out = new Uint8Array(even);
        let o = 0;
        for (const p of pending) { out.set(p.subarray(0, Math.min(p.length, even - o)), o); o += p.length; }
        const rest = size - even ? [pending[pending.length - 1].subarray(-1)] : [];
        pending = rest; size = rest.length;
        onData(out);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
  }

  stop() { this.abort.abort(); }
  async close() { this.stop(); }
}
