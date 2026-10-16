// The server's recorded Meteor passes (meteor-rec.ts): what's coming, what's recording, and a report card per pass.
import "./ham/ham.css";
import { ecef } from "./meteor-map.ts";

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
    best >= 3.5 ? row("🟢", "Signal", `the satellite's band rose ${best.toFixed(1)} dB above the noise at best: enough to decode.`)
      : best >= 0.7 ? row("🟡", "Signal", `rose only ${best.toFixed(1)} dB above the noise: too weak for clean frames (about 3.5 dB is needed).`)
      : row("⚪", "Signal", `never rose above the noise (${best.toFixed(1)} dB): the antenna didn't hear the satellite (blocked, or the satellite was off).`),
    st.acquired || firstLock ? row("🟢", "Carrier", `found${firstLock ? ` at ${new Date(firstLock.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, ${firstLock.el.toFixed(0)}° up` : ""}.`) : row("⚪", "Carrier", "never found."),
    !st.frames ? row("⚪", "Data", "no frames.")
      : st.rsProven ? row(good >= st.frames / 2 ? "🟢" : "🟡", "Data", `${st.frames} frames; error correction accepted ${good} (${((100 * good) / st.frames).toFixed(0)}%), so this is genuine Meteor data.`)
      : row("🟡", "Data", `${st.frames} frames, but error correction accepted none: too noisy.`),
    m.quality?.ok ? row("🟢", "Pictures", `${m.quality.strips} strips (${Math.round(m.quality.strips * 8)} scan lines); ${(100 * m.quality.share).toFixed(0)}% of the picture is neither black nor white: it shows the Earth.`)
      : st.images ? row("🟡", "Pictures", `${m.quality?.strips ?? 0} strips, ${(100 * (m.quality?.share ?? 0)).toFixed(0)}% usable: not a real picture.`) : row("⚪", "Pictures", "none."),
  ].join("");
}

/** Elevation (gray, 0–90°), signal above noise (yellow, 0–6 dB) and frames (blue, cumulative) over the pass; `at`, a
 *  time to mark with a cursor line. */
function chart(c: HTMLCanvasElement, tl: Point[], at?: number) {
  const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = 110 * devicePixelRatio), g = c.getContext("2d")!;
  if (tl.length < 2) return;
  const t0 = tl[0].t, t1 = tl.at(-1)!.t, X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (w - 8) + 4, maxF = Math.max(1, tl.at(-1)!.frames);
  const line = (vals: number[], max: number, color: string) => { g.strokeStyle = color; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); vals.forEach((v, i) => { const x = X(tl[i].t), y = h - 6 - (Math.max(0, Math.min(max, v)) / max) * (h - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  g.fillStyle = "rgba(131,193,103,0.18)"; tl.forEach((p, i) => { if (p.acquired && i) g.fillRect(X(tl[i - 1].t), 0, X(p.t) - X(tl[i - 1].t), h); }); // carrier found
  line(tl.map((p) => p.el), 90, "#8f98a8"); line(tl.map((p) => p.snr), 6, "#f4d35e"); line(tl.map((p) => p.frames), maxF, "#58c4dd");
  g.fillStyle = "#c8ced8"; g.font = `${11 * devicePixelRatio}px ui-monospace, monospace`;
  const label = "elevation · signal dB · frames · green: carrier locked";
  g.fillText(g.measureText(label).width < w - 12 ? label : "elev · signal · frames · green: lock", 6, 13 * devicePixelRatio); // a phone: the short one
  if (at !== undefined) { g.fillStyle = "#fff"; g.fillRect(X(at) - devicePixelRatio / 2, 0, devicePixelRatio, h); }
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/** Where the satellite was, seen from home, from its Earth-fixed position (km): elevation, azimuth, and the point under it. */
function seen(p: number[], home: { lat: number; lon: number }) {
  const h = ecef(home.lat, home.lon), d = [p[0] - h[0], p[1] - h[1], p[2] - h[2]], la = (home.lat * Math.PI) / 180, lo = (home.lon * Math.PI) / 180;
  const sl = Math.sin(la), cl = Math.cos(la), so = Math.sin(lo), co = Math.cos(lo);
  const south = sl * co * d[0] + sl * so * d[1] - cl * d[2], east = -so * d[0] + co * d[1], up = cl * co * d[0] + cl * so * d[1] + sl * d[2];
  const az = ((Math.atan2(east, -south) * 180) / Math.PI + 360) % 360;
  return { el: (Math.asin(up / Math.hypot(...d)) * 180) / Math.PI, az, dir: COMPASS[Math.round(az / 22.5) % 16],
    lat: (Math.atan2(p[2], Math.hypot(p[0], p[1])) * 180) / Math.PI, lon: (Math.atan2(p[1], p[0]) * 180) / Math.PI }; // geocentric: close enough for "over where"
}

let world: Promise<{ coast: number[][] }> | null = null; // Natural Earth coastlines (the picture maker's), loaded on first use

/** The pass on a small map: coastlines, the ground track colored by the signal heard at each moment (gray: nothing,
 *  brighter yellow: stronger), and home. Drawn once; `dot` adds the satellite and the line of sight for one moment. */
function passMap(orbit: number[][], tl: Point[], home: { lat: number; lon: number }, coast: number[][]) {
  const W = 296, H = 170, dpr = devicePixelRatio, base = document.createElement("canvas"); base.width = W * dpr; base.height = H * dpr;
  const g = base.getContext("2d")!; g.scale(dpr, dpr);
  const sub = orbit.map(([, x, y, z]) => [(Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI]);
  const lats = [...sub.map((p) => p[0]), home.lat], lons = [...sub.map((p) => p[1]), home.lon];
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2, k = Math.cos((mid * Math.PI) / 180);
  const la0 = Math.min(...lats) - 2, la1 = Math.max(...lats) + 2, lo0 = Math.min(...lons) - 2, lo1 = Math.max(...lons) + 2;
  const s = Math.min(W / ((lo1 - lo0) * k), H / (la1 - la0)); // equal scale both ways, centered
  const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
  const px = (lat: number, lon: number): [number, number] => [W / 2 + (lon - cx) * k * s, H / 2 - (lat - cy) * s];
  g.fillStyle = "#0b1020"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#56607a"; g.lineWidth = 0.8; g.beginPath();
  for (const l of coast) { let on = false; for (let i = 0; i < l.length; i += 2) { const [x, y] = px(l[i + 1], l[i]), inside = x > -20 && x < W + 20 && y > -20 && y < H + 20; if (inside && on) g.lineTo(x, y); else if (inside) g.moveTo(x, y); on = inside; } }
  g.stroke();
  const snrAt = (t: number) => tl.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)).snr;
  g.lineWidth = 3; g.lineCap = "round";
  for (let i = 1; i < sub.length; i += 5) { // a segment every 5 s, colored by the signal then
    const v = Math.max(0, Math.min(1, snrAt(orbit[i][0]) / 4)), [x0, y0] = px(sub[i - 1][0], sub[i - 1][1]), [x1, y1] = px(sub[Math.min(sub.length - 1, i + 4)][0], sub[Math.min(sub.length - 1, i + 4)][1]);
    g.strokeStyle = v < 0.18 ? "#4b5263" : `hsl(48, 95%, ${35 + 30 * v}%)`; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  const [hx, hy] = px(home.lat, home.lon);
  g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1.5; g.beginPath(); g.rect(hx - 3.5, hy - 3.5, 7, 7); g.fill(); g.stroke();
  g.fillStyle = "#c8ced8"; g.font = "10px ui-monospace, monospace"; g.fillText("home", hx + 6, hy + 3);
  return {
    W, H,
    dot(c: HTMLCanvasElement, t: number) {
      c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
      const d = c.getContext("2d")!; d.drawImage(base, 0, 0); d.scale(dpr, dpr);
      const i = Math.max(0, Math.min(sub.length - 1, orbit.findIndex((o) => o[0] >= t))), [x, y] = px(sub[i][0], sub[i][1]);
      d.strokeStyle = "rgba(255,255,255,0.6)"; d.setLineDash([3, 3]); d.lineWidth = 1; d.beginPath(); d.moveTo(hx, hy); d.lineTo(x, y); d.stroke(); d.setLineDash([]);
      d.fillStyle = "#fff"; d.strokeStyle = "#000"; d.lineWidth = 2; d.beginPath(); d.arc(x, y, 5, 0, 7); d.fill(); d.stroke();
    },
  };
}

/** Drag (or hover) across a pass's chart: a cursor line, and a note and a small map of where the satellite was and what
 *  the radio got then. */
function scrub(c: HTMLCanvasElement, tip: HTMLElement, m: any, home: { lat: number; lon: number }) {
  const tl: Point[] = m.timeline ?? []; if (tl.length < 2) return;
  let orbit: number[][] | null = null, map: ReturnType<typeof passMap> | null = null, last: PointerEvent | null = null, started = false;
  const start = () => { // the orbit (every second, Earth-fixed km) and the coastlines, once
    started = true; world ??= fetch("./data/world-lines.json").then((r) => r.json());
    Promise.all([fetch(`/api/radio/sat-ecef?id=${m.sat}&from=${tl[0].t}&to=${tl.at(-1)!.t}`).then((r) => r.json()), world])
      .then(([o, w]) => { orbit = o.points ?? []; if (orbit!.length) map = passMap(orbit!, tl, home, w.coast); if (last && !tip.hidden) show(last); }).catch(() => {});
  };
  const show = (e: PointerEvent) => {
    last = e; if (!started) start();
    const r = c.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left - 4 / devicePixelRatio) / (r.width - 8 / devicePixelRatio)));
    const t = tl[0].t + f * (tl.at(-1)!.t - tl[0].t), p = tl.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    const o = orbit?.length ? orbit.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a)) : null, s = o ? seen(o.slice(1), home) : null;
    chart(c, tl, t);
    tip.innerHTML = `<b>${new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</b> · `
      + (s ? `${s.el.toFixed(0)}° up, ${s.dir} (${s.az.toFixed(0)}°)<br>over ${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? "N" : "S"} ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? "E" : "W"} · ` : `${p.el.toFixed(0)}° up<br>`)
      + `signal ${p.snr.toFixed(1)} dB · ${p.frames} frames${p.acquired ? " · locked" : ""}` + (map ? "<canvas></canvas>" : "");
    if (map) map.dot(tip.querySelector("canvas")!, t);
    tip.hidden = false; tip.style.left = `${Math.min(r.width - tip.offsetWidth, Math.max(0, e.clientX - r.left - tip.offsetWidth / 2))}px`;
  };
  c.addEventListener("pointermove", show); c.addEventListener("pointerdown", show);
  c.addEventListener("pointerleave", () => { tip.hidden = true; chart(c, tl); });
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
        <div class="chartbox"><canvas></canvas><div class="tip" hidden></div></div>
        <div class="row">${p.strips ? `<a class="btn" href="./meteor.html?pass=${encodeURIComponent(p.id)}">Open in the picture maker</a>` : ""}
          ${p.rawKept ? `<a class="btn" href="${file(p.id, "raw.cu8")}" download>Raw recording for SatDump</a>` : ""}
          <a class="muted" href="${file(p.id, "log.txt")}" target="_blank" rel="noopener">recorder log</a></div>
      </div>
    </div>`).join("");
  for (const p of d.recorded.slice(0, 30)) {
    const box = document.getElementById(`p-${p.id}`)!;
    fetch(file(p.id, "meta.json")).then((r) => r.json()).then((m) => { box.querySelector(".stages")!.innerHTML = card(m); chart(box.querySelector("canvas")!, m.timeline ?? []); scrub(box.querySelector("canvas")!, box.querySelector(".tip")!, m, d.home); }).catch(() => { box.querySelector(".stages")!.innerHTML = "<li>Report card missing.</li>"; });
  }
}
load().catch((e) => { el("recorded").innerHTML = `<p>Couldn't load the passes: ${esc((e as Error).message)}</p>`; });
setInterval(() => { if (document.visibilityState === "visible" && el("now").textContent?.startsWith("🔴")) load(); }, 60_000);
