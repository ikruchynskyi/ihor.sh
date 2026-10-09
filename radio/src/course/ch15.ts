// Chapter 15: the network source. Odd-sized chunks, bandwidth, channelizing, and a live measurement.
import "./course.css";
import "../../../learn-kit.js"; // questions, runnable code and math (shared with the other courses)
import { C, Scene, controls, val, line, label } from "./anim.ts";
import { synth, DEMO_SIGNALS, avgSpectrum } from "../dsp.ts";

const el = (id: string) => document.getElementById(id)!;
const FS = 1.024e6;

// --- 1. Keeping I/Q pairs together ---------------------------------------------------------------------------------------
{
  // The demo band as dongle bytes, cut into network packets of random sizes (some odd).
  const x = synth(FS, 0.05, DEMO_SIGNALS), bytes = Uint8Array.from(x, (v) => Math.max(0, Math.min(255, Math.round(127.5 + v * 127.5))));
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const packets: Uint8Array[] = [];
  for (let s = 0; s < bytes.length;) { const n = 1000 + Math.floor(rnd() * 8000); packets.push(bytes.subarray(s, s + n)); s += n; }
  const odd = packets.filter((p) => p.length % 2).length;
  const s = new Scene(el("s-pairs"), (g, w, h) => {
    const keep = (el("pr-keep") as HTMLInputElement).checked;
    let iq: Float32Array;
    if (keep) iq = Float32Array.from(bytes, (v) => (v - 127.5) / 127.5); // regrouped: every pair intact
    else { // each packet decoded on its own, as if its first byte were always an I
      const parts = packets.map((p) => Float32Array.from(p.subarray(0, p.length & ~1), (v) => (v - 127.5) / 127.5));
      iq = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { iq.set(p, o); o += p.length; }
    }
    const sp = avgSpectrum(iq, 512, 24), top = Math.max(...sp), L = 12, R = w - 12, T = 16, B = h - 24;
    const px = (i: number) => L + (i / 511) * (R - L), py = (v: number) => B - ((Math.max(top - 70, v) - (top - 70)) / 74) * (B - T);
    g.strokeStyle = keep ? C.blue : C.red; g.lineWidth = 1.6; g.beginPath(); sp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
    for (const [f, name] of [[200e3, "FM"], [-150e3, "AM"], [350e3, "tone"]] as const) {
      const xx = L + ((f / FS) + 0.5) * (R - L); label(g, name, xx, T + 2, C.text, "center", 11);
      if (!keep) label(g, "ghost", L + ((-f / FS) + 0.5) * (R - L), T + 2, C.red, "center", 11);
    }
    label(g, "−512 kHz", L, h - 6, C.muted, "left", 10); label(g, "0", (L + R) / 2, h - 6, C.muted, "center", 10); label(g, "+512 kHz", R, h - 6, C.muted, "right", 10);
  }, 230, { animated: false, label: "The demo band received over a network, with or without keeping I/Q pairs together" });
  controls(s, ["pr-keep"], () => {
    el("r-pairs").innerHTML = (el("pr-keep") as HTMLInputElement).checked
      ? `Every I stays with its Q: the three stations, and nothing else.`
      : `${odd} of the ${packets.length} packets had an odd length, so the packet after each one started with a Q byte that was read as an I. Swapping I and Q mirrors the spectrum (chapter 1: the up and sideways shadows change places), so every station grows a <em style="color:var(--red)">ghost</em> on the opposite side.`;
  });
}

// --- 2. The bandwidth ladder ------------------------------------------------------------------------------------------------
const LADDER: [string, number, string][] = [
  ["whole band, 2.4 MS/s, 8-bit", 4.8e6, "what the dongle sends over USB"],
  ["whole band, 1.024 MS/s, 8-bit", 2.048e6, "what this site's server sends now"],
  ["one 250 kHz slice, 8-bit", 0.5e6, "enough for one FM station, waterfall of that slice"],
  ["one 48 kHz slice, 8-bit", 96e3, "enough for AM, narrow FM, SSB"],
  ["finished audio, 48 kHz, 16-bit", 96e3, "no waterfall; can't retune locally"],
  ["compressed audio (Opus, 64 kbit/s)", 8e3, "like a phone call"],
];
{
  const s = new Scene(el("s-ladder"), (g, w, h) => {
    const n = val("ld-n"), upload = val("ld-u") * 1e6 / 8; // upload in Mbit/s → bytes/s
    const L = 230, R = w - 12, rowH = (h - 30) / LADDER.length, maxLog = Math.log10(5e7), minLog = Math.log10(5e3);
    const px = (bps: number) => L + ((Math.log10(Math.max(bps, 5e3)) - minLog) / (maxLog - minLog)) * (R - L);
    line(g, px(upload), 6, px(upload), h - 22, C.green, 2, [5, 4]); label(g, `your upload: ${val("ld-u")} Mbit/s`, px(upload), h - 8, C.green, "center", 11);
    LADDER.forEach(([name, bps], i) => {
      const y = 8 + i * rowH, total = bps * n, fits = total <= upload;
      label(g, name, L - 8, y + rowH / 2 + 4, C.text, "right", 11);
      g.fillStyle = fits ? C.blue : C.red; g.fillRect(L, y + 4, px(total) - L, rowH - 10);
      const txt = `${(total / 1e6).toFixed(total < 1e5 ? 3 : 1)} MB/s`, end = px(total);
      if (end + 60 < R) label(g, txt, end + 6, y + rowH / 2 + 4, fits ? C.muted : C.red, "left", 10);
      else label(g, txt, end - 6, y + rowH / 2 + 4, "#14171d", "right", 10); // no room on the right: write it inside the bar
    });
  }, 260, { animated: false, label: "Bandwidth needed by different ways of sending radio, times the number of listeners, compared with an upload speed" });
  controls(s, ["ld-n", "ld-u"], () => { el("ld-no").textContent = `${val("ld-n")}`; el("ld-uo").textContent = `${val("ld-u")} Mbit/s`; });
}

// --- 3. One dongle, many listeners --------------------------------------------------------------------------------------------
{
  const s = new Scene(el("s-chan"), (g, w, h) => {
    const n = val("ch-n"), sp = avgSpectrum(synth(FS, 0.02, DEMO_SIGNALS), 512, 12), top = Math.max(...sp);
    const L = 12, R = w - 12, T = 26, B = h * 0.55, px = (i: number) => L + (i / 511) * (R - L), py = (v: number) => B - ((Math.max(top - 70, v) - (top - 70)) / 74) * (B - T);
    g.strokeStyle = C.blue; g.lineWidth = 1.5; g.beginPath(); sp.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)))); g.stroke();
    label(g, "the dongle's whole band, on the server", L, 14, C.muted, "left", 11);
    const tunes = [200e3, -150e3, 350e3, -400e3, 50e3].slice(0, n), cols = [C.yellow, C.pink, C.green, C.red, C.white];
    tunes.forEach((f, k) => {
      const xx = L + ((f / FS) + 0.5) * (R - L), wd = (200e3 / FS) * (R - L);
      g.fillStyle = cols[k] + "33"; g.fillRect(xx - wd / 2, T, wd, B - T); g.strokeStyle = cols[k]; g.strokeRect(xx - wd / 2, T, wd, B - T);
      const bx = 12 + k * ((w - 24) / 5);
      line(g, xx, B, bx + 40, h - 34, cols[k], 1, [3, 3]);
      g.fillStyle = "#1e2530"; g.fillRect(bx, h - 34, (w - 24) / 5 - 8, 26);
      label(g, `listener ${k + 1}: mix, filter, decimate`, bx + 4, h - 17, cols[k], "left", 10);
    });
  }, 260, { animated: false, label: "One dongle's band with several listeners each getting their own slice" });
  controls(s, ["ch-n"], () => { el("ch-no").textContent = `${val("ch-n")}`; });
}

// --- Lab: measure this server's stream -------------------------------------------------------------------------------------------
{
  const btn = el("lb-go") as HTMLButtonElement, status = el("lb-status");
  let abort: AbortController | null = null;
  const sizes = new Map<number, number>();
  const hist = new Scene(el("s-lab"), (g, w, h) => {
    if (!sizes.size) { label(g, "press Measure: the page reads /api/stream directly with fetch()", w / 2, h / 2, C.muted, "center", 12); return; }
    const buckets = new Array(20).fill(0), max = 65536;
    for (const [sz, c] of sizes) buckets[Math.min(19, Math.floor((sz / max) * 20))] += c;
    const top = Math.max(...buckets), bw = (w - 24) / 20;
    buckets.forEach((c, i) => { const bh = (c / top) * (h - 40); g.fillStyle = C.blue; g.fillRect(12 + i * bw + 1, h - 22 - bh, bw - 2, bh); });
    label(g, "0", 12, h - 8, C.muted, "left", 10); label(g, "64 KiB+", w - 12, h - 8, C.muted, "right", 10);
    label(g, "how big each piece was, as it arrived from the network", 12, 14, C.muted, "left", 11);
  }, 180, { animated: false, label: "Histogram of the sizes of network reads" });
  fetch("/api/state").then((r) => { if (!r.ok) throw 0; }).catch(() => { btn.disabled = true; status.textContent = "This lab needs the page to be served by this site's server (npm run serve)."; });
  btn.addEventListener("click", async () => {
    if (abort) { abort.abort(); return; }
    abort = new AbortController(); btn.textContent = "Stop"; sizes.clear();
    let bytes = 0, reads = 0, odd = 0; const t0 = performance.now();
    try {
      const r = await fetch("/api/stream", { signal: abort.signal });
      const rate = Number(r.headers.get("x-sample-rate"));
      const reader = r.body!.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length; reads++; if (value.length % 2) odd++;
        sizes.set(value.length, (sizes.get(value.length) ?? 0) + 1);
        const secs = (performance.now() - t0) / 1000;
        status.innerHTML = `${reads} reads · ${(bytes / 1e6).toFixed(1)} MB · <em class="y">${(bytes / secs / 1e6).toFixed(2)} MB/s</em> (expected ${(rate * 2 / 1e6).toFixed(2)}) · <em style="color:var(--red)">${odd}</em> reads had an odd length (an I without its Q)`;
        if (reads % 8 === 0) hist.redraw();
      }
    } catch (e) { if ((e as Error).name !== "AbortError") status.textContent = `Stopped: ${(e as Error).message}`; }
    abort = null; btn.textContent = "Measure"; hist.redraw();
  });
}
