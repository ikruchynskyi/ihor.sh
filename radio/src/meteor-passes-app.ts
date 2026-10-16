// The server's recorded Meteor passes (meteor-rec.ts): what's coming, what's recording, and a report card per pass.
import "./ham/ham.css";

const el = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const when = (t: number) => new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const name = (s: string) => s.replace("meteor-m2-", "Meteor-M2 ");
const file = (id: string, f: string) => `/api/meteor/file?id=${encodeURIComponent(id)}&f=${f}`;

type Point = { t: number; el: number; snr: number; acquired: number; frames: number; rsBad: number; images: number; clarity: number; clipPct: number };

/** The five stages, judged over the whole pass, in the same words as the live page. */
function card(m: any) {
  const tl: Point[] = m.timeline ?? [], st = m.stats, best = Math.max(0, ...tl.map((p) => p.snr)), good = st.frames - st.rsBad;
  const firstLock = tl.find((p) => p.acquired), clip = st.clipPct ?? 0;
  const row = (light: string, title: string, text: string) => `<li>${light} <b>${title}:</b> ${text}</li>`;
  return [
    clip >= 0.5 ? row("🟡", "Dongle", `recorded, but ${clip.toFixed(2)}% of samples clipped: the gain was too high for this band.`) : row("🟢", "Dongle", `recorded ${Math.round((m.end - m.start) / 60e3)} minutes without overload.`),
    best >= 2 ? row("🟢", "Signal", `the satellite's band rose ${best.toFixed(1)} dB above the noise at best: enough to decode.`)
      : best >= 0.7 ? row("🟡", "Signal", `rose only ${best.toFixed(1)} dB above the noise: weak (about 2 dB is needed).`)
      : row("⚪", "Signal", `never rose above the noise (${best.toFixed(1)} dB): the antenna didn't hear the satellite (blocked, or the satellite was off).`),
    st.acquired || firstLock ? row("🟢", "Carrier", `found${firstLock ? ` at ${new Date(firstLock.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, ${firstLock.el.toFixed(0)}° up` : ""}.`) : row("⚪", "Carrier", "never found."),
    !st.frames ? row("⚪", "Data", "no frames.")
      : st.rsProven ? row(good >= st.frames / 2 ? "🟢" : "🟡", "Data", `${st.frames} frames; error correction accepted ${good} (${((100 * good) / st.frames).toFixed(0)}%), so this is genuine Meteor data.`)
      : row("🟡", "Data", `${st.frames} frames, but error correction accepted none: too noisy.`),
    m.quality?.ok ? row("🟢", "Pictures", `${m.quality.strips} strips (${Math.round(m.quality.strips * 8)} scan lines); ${(100 * m.quality.share).toFixed(0)}% of the picture is neither black nor white: it shows the Earth.`)
      : st.images ? row("🟡", "Pictures", `${m.quality?.strips ?? 0} strips, ${(100 * (m.quality?.share ?? 0)).toFixed(0)}% usable: not a real picture.`) : row("⚪", "Pictures", "none."),
  ].join("");
}

/** Elevation (gray, 0–90°), signal above noise (yellow, 0–6 dB) and frames (blue, cumulative) over the pass. */
function chart(c: HTMLCanvasElement, tl: Point[]) {
  const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = 110 * devicePixelRatio), g = c.getContext("2d")!;
  if (tl.length < 2) return;
  const t0 = tl[0].t, t1 = tl.at(-1)!.t, X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (w - 8) + 4, maxF = Math.max(1, tl.at(-1)!.frames);
  const line = (vals: number[], max: number, color: string) => { g.strokeStyle = color; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); vals.forEach((v, i) => { const x = X(tl[i].t), y = h - 6 - (Math.max(0, Math.min(max, v)) / max) * (h - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  g.fillStyle = "rgba(131,193,103,0.18)"; tl.forEach((p, i) => { if (p.acquired && i) g.fillRect(X(tl[i - 1].t), 0, X(p.t) - X(tl[i - 1].t), h); }); // carrier found
  line(tl.map((p) => p.el), 90, "#8f98a8"); line(tl.map((p) => p.snr), 6, "#f4d35e"); line(tl.map((p) => p.frames), maxF, "#58c4dd");
  g.fillStyle = "#c8ced8"; g.font = `${11 * devicePixelRatio}px ui-monospace, monospace`;
  g.fillText("elevation · signal dB · frames · green: carrier locked", 6, 13 * devicePixelRatio);
}

async function load() {
  const d = await fetch("/api/meteor/passes").then((r) => r.json());
  const w = d.window, rule = `${w.minutes} minute${w.minutes === 1 ? "" : "s"} or more in the north sky (azimuth ${w.azFrom}° to ${w.azTo}°) between ${w.minEl}° and ${w.maxEl}° up`;
  el("rule").textContent = rule;
  el("now").innerHTML = d.recording ? `🔴 <b>Recording ${name(d.recording.sat)} now</b>, until ${when(d.recording.until)}. Its report card appears below when the satellite sets.`
    : d.upcoming.length ? `Next recording: <b>${name(d.upcoming[0].sat)}</b>, ${when(d.upcoming[0].rise)}, peak ${d.upcoming[0].maxEl.toFixed(0)}°, ${d.upcoming[0].northMin.toFixed(1)} min in the north window.` : `No pass with ${rule} in the next 48 hours.`;
  el("upcoming").innerHTML = d.upcoming.map((p: any) => `<li>${when(p.rise)}–${new Date(p.set).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${name(p.sat)} · peak ${p.maxEl.toFixed(0)}° · ${p.northMin.toFixed(1)} min north</li>`).join("") || "<li class=muted>None in the next 48 hours.</li>";
  if (!d.recorded.length) { el("recorded").innerHTML = '<p class="muted">Nothing recorded yet: the first pass through the north window will show up here.</p>'; return; }
  el("recorded").innerHTML = d.recorded.map((p: any) => `
    <div class="pane pass" id="p-${esc(p.id)}">
      ${p.strips ? `<a href="./meteor.html?pass=${encodeURIComponent(p.id)}"><img src="${file(p.id, "thumb.png")}" alt="Channel preview of the ${esc(name(p.sat))} pass" loading="lazy"></a>` : '<div class="noimg">no picture</div>'}
      <div>
        <h3>${p.ok ? "🟢" : "⚪"} ${esc(name(p.sat))} · ${when(p.start)} · peak ${Number(p.maxEl).toFixed(0)}°</h3>
        <ol class="stages"><li class="muted">Loading the report card…</li></ol>
        <canvas></canvas>
        <div class="row">${p.strips ? `<a class="btn" href="./meteor.html?pass=${encodeURIComponent(p.id)}">Open in the picture maker</a>` : ""}
          ${p.rawKept ? `<a class="btn" href="${file(p.id, "raw.cu8")}" download>Raw recording for SatDump</a>` : ""}
          <a class="muted" href="${file(p.id, "log.txt")}" target="_blank" rel="noopener">recorder log</a></div>
      </div>
    </div>`).join("");
  for (const p of d.recorded.slice(0, 30)) {
    const box = document.getElementById(`p-${p.id}`)!;
    fetch(file(p.id, "meta.json")).then((r) => r.json()).then((m) => { box.querySelector(".stages")!.innerHTML = card(m); chart(box.querySelector("canvas")!, m.timeline ?? []); }).catch(() => { box.querySelector(".stages")!.innerHTML = "<li>Report card missing.</li>"; });
  }
}
load().catch((e) => { el("recorded").innerHTML = `<p>Couldn't load the passes: ${esc((e as Error).message)}</p>`; });
setInterval(() => { if (document.visibilityState === "visible" && el("now").textContent?.startsWith("🔴")) load(); }, 60_000);
