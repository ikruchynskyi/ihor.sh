// "My SDR": the dongle on the server, streamed over plain HTTP by server.ts. Same shape as RtlSdr, so the live
// pipeline doesn't care which one it's fed by.
//
// The server's dongle captures a 2.4 MHz window shared by everyone; each listener gets a *slice* of it around their
// own frequency (240 kHz for Spectrum Lab, 1.2 MHz by default), cut out and decimated on the server. Moving inside the
// window moves only your slice; the window itself moves only when it can still cover everyone else's.

const MIN_CHUNK = 64 * 1024; // network reads arrive in odd sizes; regroup into blocks of ~64 KB

export type Band = { center: number; rate: number; half: number; gain: number | null; listeners: number; slices: { tag: string; center: number; width: number }[] };

export class RemoteSdr {
  tunerName = "";
  sampleRate = 0;
  centerFrequency = 0; // of your slice
  readonly id = Math.random().toString(36).slice(2, 12);
  private width = 1_200_000;
  private streaming = false;
  private abort = new AbortController();

  /** `width`: 240000 (one station, ~0.5 MB/s) or 1200000 (a wider look, ~2.4 MB/s). */
  static async connect(width = 1_200_000): Promise<RemoteSdr> {
    const r = await fetch("/api/state");
    if (!r.ok) throw new Error("No SDR server here. Open the page from the Mac running `npm run serve`.");
    const s = await r.json();
    const sdr = new RemoteSdr();
    sdr.width = width; sdr.sampleRate = width; sdr.centerFrequency = s.center;
    return sdr;
  }

  private async post(url: string, body: object) {
    const r = await fetch(url, { method: "POST", body: JSON.stringify(body) });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error);
    return s;
  }

  /** Where your slice is centered. While streaming, the server may refuse (the shared window can't reach it). */
  async setCenterFrequency(freq: number) {
    if (!this.streaming) { this.centerFrequency = freq; return; }
    this.centerFrequency = (await this.post("/api/slice", { id: this.id, center: freq })).center;
  }
  async setGain(db: number | null) { await this.post("/api/tune", { gain: db }); } // shared by everyone

  /** The whole window as everyone sees it: "band" (center, gain, listeners, slices) and "row" (spectrum bytes). */
  overview(on: (ev: "band" | "row", data: any) => void) {
    const es = new EventSource("/api/overview");
    es.addEventListener("band", (m) => on("band", JSON.parse((m as MessageEvent).data) as Band));
    es.addEventListener("row", (m) => on("row", Uint8Array.from(atob((m as MessageEvent).data), (c) => c.charCodeAt(0))));
    return () => es.close();
  }

  async stream(onData: (cu8: Uint8Array) => void): Promise<void> {
    const r = await fetch(`/api/stream?id=${this.id}&center=${Math.round(this.centerFrequency)}&width=${this.width}`, { signal: this.abort.signal });
    if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    this.sampleRate = Number(r.headers.get("x-sample-rate")) || this.sampleRate;
    this.centerFrequency = Number(r.headers.get("x-center")) || this.centerFrequency;
    this.streaming = true;
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
    } finally { this.streaming = false; }
  }

  stop() { this.abort.abort(); }
  async close() { this.stop(); }
}
