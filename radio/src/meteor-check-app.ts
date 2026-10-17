// The Meteor station check: shows meteor-diag.ts's measurements (GET /api/meteor/check), runs a new one
// (POST /api/meteor/check/run), and lets the owner change gains, the recorder's window and its satellites.
import "./ham/ham.css";

const el = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const inp = (id: string) => el(id) as HTMLInputElement;
const C = { grid: "#2a2f3a", axis: "#4a5262", text: "#d7dde5", muted: "#8a93a3", blue: "#58c4dd", yellow: "#f4d35e", green: "#83c167", red: "#fc6255", pink: "#e07a9f" };
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], BANDS = [[0, 20], [20, 40], [40, 60], [60, 90]];
const LIGHT: Record<string, string> = { bad: "🔴", warn: "🟡", ok: "🟢", info: "🔵" };
const when = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const name = (s: string) => s.replace("meteor-m2-", "Meteor-M2 ");
let data: any = null;

function canvas(id: string) {
  const c = el(id) as HTMLCanvasElement, r = devicePixelRatio || 1, w = c.clientWidth, h = Number((c.dataset.h ??= c.getAttribute("height") ?? "200")); // the pixel height below overwrites the attribute
  c.width = w * r; c.height = h * r; c.style.height = `${h}px`;
  const g = c.getContext("2d")!; g.setTransform(r, 0, 0, r, 0, 0); g.fillStyle = "#0f1218"; g.fillRect(0, 0, w, h);
  return { g, w, h };
}
const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, color = C.muted, align: CanvasTextAlign = "left", size = 11) => { g.fillStyle = color; g.font = `${size}px ui-sans-serif, system-ui, sans-serif`; g.textAlign = align; g.fillText(s, x, y); };
const line = (g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dash: number[] = []) => { g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };

function drawSpectrum() {
  const { g, w, h } = canvas("spec"), r = data?.latest;
  if (!r?.ok || !r.rows) { text(g, r?.ok === false ? r.error : "Run a check to see the spectrum.", w / 2, h / 2, C.muted, "center", 13); return; }
  const rows: [number, number][] = r.rows, f0 = rows[0][0], f1 = rows.at(-1)![0], lo = r.ownFloor - 6, hi = Math.max(r.inBand, ...rows.map((x) => x[1])) + 6;
  const L = 40, R = 10, T = 12, B = 26, X = (f: number) => L + ((f - f0) / (f1 - f0)) * (w - L - R), Y = (d: number) => T + ((hi - d) / (hi - lo)) * (h - T - B);
  for (const c of [137.1, 137.9]) { g.fillStyle = "rgba(88,196,221,0.15)"; g.fillRect(X(c - 0.075), T, X(c + 0.075) - X(c - 0.075), h - T - B); }
  for (let d = Math.ceil((lo - r.ownFloor) / 10) * 10; r.ownFloor + d <= hi; d += 10) { line(g, L, Y(r.ownFloor + d), w - R, Y(r.ownFloor + d), C.grid); text(g, `${d >= 0 ? "+" : ""}${d}`, L - 4, Y(r.ownFloor + d) + 4, C.muted, "right"); }
  for (let f = Math.ceil(f0); f <= f1; f++) text(g, String(f), X(f), h - 8, C.muted, "center");
  line(g, L, Y(r.ownFloor), w - R, Y(r.ownFloor), C.green, 1.5, [5, 4]); text(g, "receiver's own noise", L + 4, Y(r.ownFloor) - 5, C.green);
  g.strokeStyle = C.yellow; g.lineWidth = 2; g.beginPath(); rows.forEach(([f, d], i) => (i ? g.lineTo(X(f), Y(d)) : g.moveTo(X(f), Y(d)))); g.stroke();
  for (const s of r.spurs ?? []) { const x = X(s.mhz); line(g, x, T, x, T + 14, s.inChannel ? C.red : C.pink, 2); }
  text(g, "dB above the receiver's noise · MHz", w - R, T + 10, C.muted, "right");
}

function drawSky() {
  const { g, w, h } = canvas("skymap"), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 22;
  const rad = (el: number) => R * (1 - el / 90), ang = (az: number) => ((az - 90) * Math.PI) / 180; // north up, east right
  const color = (v: number) => (v >= 3.5 ? C.green : v >= 2 ? C.yellow : v >= 1 ? "#b07a3a" : "#3a4252");
  for (const c of data?.sky ?? []) {
    const [e0, e1] = BANDS[c.band], a0 = ang(c.sector * 45 - 22.5), a1 = ang(c.sector * 45 + 22.5);
    g.fillStyle = color(c.best); g.globalAlpha = 0.85; g.beginPath(); g.arc(cx, cy, rad(e0), a0, a1); g.arc(cx, cy, rad(e1), a1, a0, true); g.closePath(); g.fill(); g.globalAlpha = 1;
    const am = ang(c.sector * 45), rm = (rad(e0) + rad(e1)) / 2; text(g, c.best.toFixed(1), cx + rm * Math.cos(am), cy + rm * Math.sin(am) + 4, "#0f1218", "center", 11);
  }
  for (const e of [0, 20, 40, 60]) { g.strokeStyle = C.axis; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rad(e), 0, 2 * Math.PI); g.stroke(); if (e) text(g, `${e}°`, cx + 3, cy - rad(e) + 12, C.muted); }
  SECTORS.forEach((s, i) => { const a = ang(i * 45); text(g, s, cx + (R + 12) * Math.cos(a), cy + (R + 12) * Math.sin(a) + 4, C.text, "center", 12); });
  const wnd = data?.settings?.window; // the recorder's window, dashed
  if (wnd) {
    const a0 = ang(wnd.azFrom), a1 = ang(wnd.azTo <= wnd.azFrom ? wnd.azTo + 360 : wnd.azTo);
    g.strokeStyle = C.blue; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.arc(cx, cy, rad(wnd.minEl), a0, a1); g.arc(cx, cy, rad(wnd.maxEl), a1, a0, true); g.closePath(); g.stroke(); g.setLineDash([]);
  }
  if (!data?.sky?.length) text(g, "No passes recorded yet.", cx, cy, C.muted, "center", 13);
}

function drawTrend() {
  const { g, w, h } = canvas("trendplot"), hs = (data?.history ?? []).filter((x: any) => x.margin !== undefined);
  if (hs.length < 2) { text(g, "The trend appears after a few automatic checks.", w / 2, h / 2, C.muted, "center", 13); return; }
  const t0 = hs[0].t, t1 = hs.at(-1).t, L = 34, R = 34, T = 12, B = 24, X = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (w - L - R);
  const Ym = (v: number) => T + (1 - v / 40) * (h - T - B), Yr = (v: number) => T + (1 - v / 40) * (h - T - B);
  for (const v of [0, 10, 20, 30, 40]) { line(g, L, Ym(v), w - R, Ym(v), C.grid); text(g, `${v}`, L - 4, Ym(v) + 4, C.yellow, "right"); text(g, `${v}`, w - R + 4, Yr(v) + 4, C.blue); }
  const plot = (k: string, Y: (v: number) => number, col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hs.forEach((p: any, i: number) => (i ? g.lineTo(X(p.t), Y(Math.min(40, p[k]))) : g.moveTo(X(p.t), Y(Math.min(40, p[k]))))); g.stroke(); };
  plot("margin", Ym, C.yellow); plot("rms", Yr, C.blue);
  text(g, when(t0), L, h - 6, C.muted); text(g, when(t1), w - R, h - 6, C.muted, "right");
  text(g, "margin, dB", L + 4, T + 10, C.yellow); text(g, "input, counts RMS", w - R - 4, T + 10, C.blue, "right");
}

function render() {
  const r = data.latest, recs: any[] = data.recommendations;
  el("status").textContent = data.busy ? `Can't check now: ${data.busy}.` : r ? `Last check: ${when(r.t)}${r.ok ? "" : " (failed)"}.` : "No check yet.";
  (el("run") as HTMLButtonElement).disabled = !!data.busy || Date.now() < data.canRunAt;
  const areas = ["Radio", "Amplifier", "Interference", "Sky", "Decoding"], worst = (a: string) => ["bad", "warn", "ok", "info"].find((l) => recs.some((x) => x.area === a && x.level === l)) ?? "info";
  el("lights").innerHTML = areas.map((a) => `<div class="light"><b>${a}</b>${LIGHT[worst(a)]} ${esc(recs.find((x) => x.area === a && x.level === worst(a))?.title ?? "–")}</div>`).join("");
  el("recommendations").innerHTML = recs.map((x) => `<div class="rec ${x.level}"><span class="area">${LIGHT[x.level]} ${esc(x.area)}</span><h3>${esc(x.title)}</h3><p style="margin:0">${esc(x.detail)}</p>${x.fix ? `<p class="fix">${esc(x.fix)}</p>` : ""}${x.learn ? `<p class="muted" style="margin:4px 0 0">${x.learn.map(([h, t]: string[]) => `<a href="${h}">${esc(t)}</a>`).join(" · ")}</p>` : ""}</div>`).join("");
  el("radio-facts").innerHTML = r?.ok ? [
    `Radio: <b>${esc(r.device || "?")}</b>, ${esc(r.gains || "")}`,
    `Input: <b>${r.rms} counts RMS</b>, ${r.clipPct}% clipped (loudest ${r.peak} of 127.5)`,
    `Amplifier margin: <b>${r.margin} dB</b> (the receiver adds ${r.added} dB of noise); passband ${r.passband ? `${r.passband[0].toFixed(1)}–${r.passband[1].toFixed(1)} MHz` : "not found"}`,
    `The recorder's 137.9 MHz slice: ${r.slice.rms} counts RMS, ${r.slice.clipPct}% clipped`,
    `Narrow peaks: ${r.spurs.length ? r.spurs.map((s: any) => `${s.mhz.toFixed(3)} MHz +${s.db} dB${s.inChannel ? " (in a Meteor channel)" : ""}`).join(", ") : "none"}`,
  ].map((s) => `<div>${s}</div>`).join("") : `<span class="muted">${esc(r?.error ?? "No measurement yet.")}</span>`;
  el("pass-table").innerHTML = `<tr><th>Pass</th><th>Peak</th><th>Best signal</th><th>Minutes ≥ 3.5</th><th>Frames corrected</th></tr>` + (data.passes.length ? data.passes.map((p: any) =>
    `<tr><td>${esc(name(p.sat))}<br><span class="muted">${when(p.start)}</span></td><td>${Math.round(p.maxEl)}°</td><td>${p.best}${p.bestAt ? ` <span class="muted">at ${esc(p.bestAt)}</span>` : ""}</td><td>${p.minutes35}</td><td>${p.good} of ${p.frames}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">No passes recorded yet.</td></tr>`);
  const s = data.settings;
  inp("w-azf").value = s.window.azFrom; inp("w-azt").value = s.window.azTo; inp("w-elmin").value = s.window.minEl; inp("w-elmax").value = s.window.maxEl; inp("w-min").value = s.window.minutes;
  inp("sat-3").checked = s.sats["meteor-m2-3"]; inp("sat-4").checked = s.sats["meteor-m2-4"];
  const m = /LNA (\d+) dB, VGA (\d+) dB/.exec(r?.gains ?? ""); if (m) { (el("lna") as HTMLSelectElement).value = m[1]; inp("vga").value = m[2]; }
  el("login").hidden = data.owner; el("controls").hidden = !data.owner;
  drawSpectrum(); drawSky(); drawTrend();
}

async function load() { data = await fetch("/api/meteor/check").then((r) => r.json()); render(); }
async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
el("run").addEventListener("click", async () => {
  (el("run") as HTMLButtonElement).disabled = true; el("status").textContent = "Measuring (about 3 seconds)…";
  try { data = await post("/api/meteor/check/run"); render(); } catch (e) { el("status").textContent = (e as Error).message; }
});
el("signin").addEventListener("click", async () => { try { await post("/api/meteor/owner", { key: inp("key").value }); inp("key").value = ""; await load(); } catch (e) { el("save-status").textContent = ""; alertLine((e as Error).message); } });
el("signout").addEventListener("click", async () => { await post("/api/meteor/owner", { key: "logout" }).catch(() => {}); await load(); });
el("save").addEventListener("click", async () => {
  el("save-status").textContent = "Saving…";
  try {
    data = await post("/api/meteor/settings", { lna: Number((el("lna") as HTMLSelectElement).value), vga: Number(inp("vga").value),
      window: { azFrom: inp("w-azf").value, azTo: inp("w-azt").value, minEl: inp("w-elmin").value, maxEl: inp("w-elmax").value, minutes: inp("w-min").value },
      sats: { "meteor-m2-3": inp("sat-3").checked, "meteor-m2-4": inp("sat-4").checked } });
    render(); el("save-status").textContent = "Saved. The recorder re-planned its passes; run a check to see the new gains.";
  } catch (e) { el("save-status").textContent = (e as Error).message; }
});
const alertLine = (m: string) => { const p = el("login"); let s = p.querySelector(".err") as HTMLElement | null; if (!s) { s = document.createElement("span"); s.className = "err muted"; p.append(s); } s.textContent = m; };
addEventListener("resize", () => data && (drawSpectrum(), drawSky(), drawTrend()));
load().catch((e) => (el("recommendations").innerHTML = `<p>Couldn't load the station check: ${esc((e as Error).message)}</p>`));
