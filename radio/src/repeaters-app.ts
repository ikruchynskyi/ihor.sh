// Callsign lookup + repeater map: FCC records via the server (callook.info) and HearHam's repeater directory.
import "./ham/ham.css";
import { esc, makeMap } from "./live-map.ts";
declare const L: any;

interface Repeater { id: number; callsign: string; lat: number; lon: number; city: string; mode: string; outputMHz: number; offsetMHz: number; inputMHz: number; toneUp: string; toneDown: string; network: string; node: string; description: string; operational: boolean; restriction: string; band: string }
const BANDS: Record<string, string> = { "10m": "#ff5c8a", "6m": "#ff9f1c", "2m": "#5cff9d", "1.25m": "#c59bff", "70cm": "#4de1ff", "33cm": "#ffd166", "23cm": "#f4a3c0", other: "#9aa3cf" };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const map = makeMap("map", 10);
const layer = L.layerGroup().addTo(map), licLayer = L.layerGroup().addTo(map);
const canvas = L.canvas({ padding: 0.3 });
let all: Repeater[] = [];
const on = new Set(["2m", "70cm", "1.25m", "6m"]);
let shown: (Repeater & { km: number })[] = [], lastLicense: any = null;
const picked = new Map<number, Repeater>(); // repeaters ticked in the list for the scanner (kept while panning away)
const scannable = (r: Repeater) => r.mode === "FM" && r.outputMHz >= 24 && r.outputMHz <= 1766;

$("bands").innerHTML = Object.entries(BANDS).map(([b, c]) => `<label><input type="checkbox" data-b="${b}" ${on.has(b) ? "checked" : ""}><span class="swatch" style="background:${c}"></span>${b}</label>`).join("");
$("bands").addEventListener("change", (e) => { const b = (e.target as HTMLInputElement).dataset.b!; (e.target as HTMLInputElement).checked ? on.add(b) : on.delete(b); render(); });
$("mode").onchange = render; $("opOnly").onchange = render;
// Repeaters for the area on screen, anywhere in the world (reloaded after panning or zooming).
let loadTimer: ReturnType<typeof setTimeout> | undefined, total = 0;
async function loadArea() {
  const b = map.getBounds();
  const d = await fetch(`/api/radio/repeaters?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v: number) => v.toFixed(3)).join(",")}`).then((r) => r.json()).catch(() => null);
  if (!d) return;
  all = d.repeaters; total = d.total;
  render();
}
map.on("moveend", () => { clearTimeout(loadTimer); loadTimer = setTimeout(loadArea, 250); });

const fmtOff = (o: number) => (o > 0 ? `+${o}` : `${o}`);
function popup(r: Repeater) {
  return `<b>${esc(r.callsign)}</b> <span class="muted">${esc(r.city)}</span><br>
    <span class="freq">${r.outputMHz.toFixed(4)} MHz</span> · offset ${fmtOff(r.offsetMHz)} MHz (transmit on ${r.inputMHz.toFixed(4)})<br>
    ${r.toneUp ? `Tone ${esc(r.toneUp)} Hz` : "No tone listed"} · ${esc(r.mode)}${r.network ? ` · ${esc(r.network)}${r.node ? ` node ${esc(r.node)}` : ""}` : ""}${r.operational ? "" : " · <b>not operational</b>"}${r.restriction ? ` · ${esc(r.restriction)}` : ""}<br>
    ${r.description ? `<span class="muted">${esc(r.description).replace(/\n/g, "<br>")}</span><br>` : ""}
    ${heardHere(r)}${US_CALL.test(r.callsign) ? `<span class="lic" data-lic="${esc(r.callsign)}"></span>` : ""}
    <a href="#" data-call="${esc(r.callsign)}">Look up ${esc(r.callsign)}</a>${scannable(r) ? ` · <a href="#" data-monitor="${r.outputMHz}|${esc(r.callsign)} ${esc(r.city)}">🎧 Listen with captions</a> · <a href="../?listen=${r.outputMHz}">Spectrum Lab</a>` : ""}`;
}
// Directories go stale (clubs hand repeaters to other clubs), so the popup adds what's known now: other callsigns the
// captions heard identifying on this frequency, and a warning when the FCC has no active license for the listed call.
const US_CALL = /^(A[A-L]|[KNW])[A-Z]?\d[A-Z]{1,3}$/;
function heardHere(r: Repeater) {
  const other = log.heard.filter((h) => h.mhz && Math.abs(h.mhz - r.outputMHz) < 0.003 && h.call !== r.callsign);
  return other.length ? `<b>Heard identifying here:</b> ${other.map((h) => `${esc(h.call)} (${tfmt(h.at)})`).join(", ")}<br>` : "";
}
const licenses = new Map<string, Promise<any>>();
map.on("popupopen", (e: any) => {
  const el = e.popup.getElement()?.querySelector("[data-lic]");
  if (!el) return;
  const call = el.dataset.lic;
  if (!licenses.has(call)) licenses.set(call, fetch(`/api/radio/callsign?call=${encodeURIComponent(call)}`).then((r) => r.json()).catch(() => null));
  licenses.get(call)!.then((d) => { if (d && !d.found) el.innerHTML = `⚠ <b>No active FCC license for ${esc(call)}</b>: this listing may be out of date (the repeater may now ID under another call).<br>`; });
});
const marks = new Map<number, any>(); // repeater id → its marker
let pendingRpt: number | null = null; // a ?rpt= link's repeater, opened once the area around it has loaded
function render() {
  const openId = pendingRpt ?? [...marks].find(([, m]) => m.isPopupOpen())?.[0]; // an open popup stays open across reloads
  layer.clearLayers(); marks.clear();
  const hit = (r: Repeater) => log.hits[r.outputMHz]; // drawn last, so on top: a white ring for a repeater the scan heard busy
  for (const r of [...all].sort((a, b) => Number(!!hit(a)) - Number(!!hit(b)))) {
    if (!on.has(r.band) || ($<HTMLInputElement>("opOnly").checked && !r.operational) || ($<HTMLSelectElement>("mode").value && !r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value))) continue;
    const h = hit(r), p = picked.has(r.id);
    marks.set(r.id, L.circleMarker([r.lat, r.lon], { renderer: canvas, radius: h ? 11 : p ? 8 : 6, color: h || p ? "#fff" : BANDS[r.band], fillColor: BANDS[r.band], fillOpacity: h ? 1 : 0.85, weight: h ? 4 : p ? 2 : 1 })
      .bindPopup(() => popup(r), { maxWidth: 320 }).bindTooltip(`${r.callsign} ${r.outputMHz}${h ? ` · busy at ${tfmt(h)}` : ""}`).addTo(layer));
  }
  if (openId != null && marks.has(openId)) { pendingRpt = null; marks.get(openId).openPopup(); }
  renderList();
}
function renderList() {
  const c = map.getCenter();
  shown = all.filter((r) => on.has(r.band) && (!$<HTMLInputElement>("opOnly").checked || r.operational) && (!$<HTMLSelectElement>("mode").value || r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value)))
    .map((r) => ({ ...r, km: Math.hypot((r.lat - c.lat) * 111, (r.lon - c.lng) * 84) })).sort((a, b) => a.km - b.km);
  $("count").textContent = `(${shown.length}${total > all.length ? ` of the nearest ${all.length}; zoom in for all ${total}` : ""})`;
  $("list").innerHTML = shown.slice(0, 60).map((r, i) => `<li data-i="${i}">${scannable(r) ? `<input type="checkbox" data-pick="${i}" ${picked.has(r.id) ? "checked" : ""} aria-label="Scan ${esc(r.callsign)}" title="Scan this one">` : ""}${log.hits[r.outputMHz] ? `📶 ` : ""}<span class="swatch" style="background:${BANDS[r.band]}"></span><b>${esc(r.callsign)}</b> <span class="freq">${r.outputMHz.toFixed(3)}</span> <span class="muted">${fmtOff(r.offsetMHz)} ${r.toneUp ? `· ${esc(r.toneUp)} Hz` : ""} · ${esc(r.mode)} · ${r.km.toFixed(1)} km · ${esc(r.city)}${log.hits[r.outputMHz] ? ` · <b>busy at ${tfmt(log.hits[r.outputMHz])}</b>` : ""}</span></li>`).join("");
  scanWhat();
}
$("list").addEventListener("click", (e) => {
  const pick = (e.target as HTMLElement).closest("input[data-pick]") as HTMLInputElement | null;
  if (pick) { const r = shown[Number(pick.dataset.pick)]; pick.checked ? picked.set(r.id, r) : picked.delete(r.id); render(); return; }
  const r = shown[Number((e.target as HTMLElement).closest("li")?.dataset.i)];
  if (r) { map.setView([r.lat, r.lon], 13); L.popup().setLatLng([r.lat, r.lon]).setContent(popup(r)).openOn(map); }
});
document.addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest("a[data-call]") as HTMLElement | null;
  if (c) { e.preventDefault(); lookup(c.dataset.call!); }
});

/** FCC record for a callsign: shown in the sidebar and pinned on the map. */
async function lookup(call: string) {
  call = call.toUpperCase().trim();
  if (!call) return;
  $<HTMLInputElement>("call").value = call;
  $("lic").textContent = "Looking up…";
  history.replaceState(null, "", `?call=${encodeURIComponent(call)}`);
  const d = await fetch(`/api/radio/callsign?call=${encodeURIComponent(call)}`).then((r) => r.json()).catch(() => ({ found: false, note: "Lookup failed." }));
  lastLicense = d;
  licLayer.clearLayers();
  if (!d.found) { $("lic").textContent = d.note ?? "Not found."; return; }
  const near = d.lat ? await fetch(`/api/radio/repeaters?bbox=${d.lat - 1},${d.lon - 1.3},${d.lat + 1},${d.lon + 1.3}`).then((r) => r.json()).catch(() => null) : null;
  const rpts = (near?.repeaters ?? all).filter((r: Repeater) => r.callsign.toUpperCase() === d.callsign);
  $("lic").innerHTML = `<b>${esc(d.callsign)}</b> · ${esc(d.name)}<br>${d.type === "CLUB" ? `Club station${d.trustee ? `, trustee ${esc(d.trustee)}` : ""}` : `${esc(d.licenseClass)} license`}<br>
    ${esc(d.address)}<br>Grid ${esc(d.grid)} · expires ${esc(d.expires)}${d.previous ? ` · previously ${esc(d.previous)}` : ""}<br>
    ${rpts.length ? `Runs ${rpts.length} repeater${rpts.length > 1 ? "s" : ""} on this map. ` : ""}<a href="${esc(d.uls)}" target="_blank" rel="noopener">FCC ULS record</a> · <a href="https://aprs.fi/#!call=${encodeURIComponent(d.callsign)}" target="_blank" rel="noopener">on aprs.fi</a>`;
  if (d.lat) {
    const icon = L.divIcon({ className: "", html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 0 2px #000)">📻</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([d.lat, d.lon], { icon }).bindPopup(`<b>${esc(d.callsign)}</b><br>${esc(d.name)}<br><span class="muted">${esc(d.address)} · ${esc(d.grid)}</span><br><span class="muted">License address, often a mailing address rather than the station.</span>`).addTo(licLayer).openPopup();
    map.setView([d.lat, d.lon], 11);
  }
  return d.lat ? (() => { const p = map.latLngToContainerPoint([d.lat, d.lon]), r = $("map").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; })() : undefined;
}
$("callForm").addEventListener("submit", (e) => { e.preventDefault(); lookup($<HTMLInputElement>("call").value); });

// ---------- listening on the server SDR with captions and a callsign detector (server: monitor.ts) ----------
const heardLayer = L.layerGroup().addTo(map), heardPins = new Map<string, any>();
let mon: any = null, es: EventSource | null = null;
const tfmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const callHtml = (c: any) => `<span class="call ${c.found ? "" : "unknown"}" data-heardcall="${esc(c.call)}" title="${c.found ? esc(`${c.name ?? ""} ${c.cls ?? ""} ${c.grid ?? ""}`) : "not found in the FCC database (misheard, or not a US call)"}">${esc(c.call)}</span>`;
const capHtml = (c: any) => `<div class="cap"><time>${tfmt(c.at)}</time>${c.mhz ? `<span class="muted freq" title="${esc(c.label ?? "")}">${c.mhz.toFixed(3)}</span> ` : ""}${esc(c.text)}${c.calls?.length ? ` <span class="muted">·</span> ${c.calls.map(callHtml).join(" ")}` : ""}</div>`;
function pinHeard(h: any) {
  if (!h.lat || !h.lon) return;
  const icon = L.divIcon({ className: "", html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 0 3px #000)">📻</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  const popup = `<b>${esc(h.call)}</b> ${esc(h.name ?? "")}<br><span class="muted">${esc(h.cls ?? "")} · ${esc(h.grid ?? "")} · ${esc(h.city ?? "")}</span><br>heard ${tfmt(h.at)} on ${h.mhz.toFixed(3)} MHz${h.label ? ` (${esc(h.label)})` : ""}${h.times > 1 ? `, ${h.times}×` : ""}<br><span class="muted">“${esc(h.text)}”</span><br><a href="#" data-call="${esc(h.call)}">Look up</a>`;
  const old = heardPins.get(h.call);
  if (old) { old.setLatLng([h.lat, h.lon]).setPopupContent(popup); return; }
  heardPins.set(h.call, L.marker([h.lat, h.lon], { icon, zIndexOffset: 500 }).bindPopup(popup, { maxWidth: 320 }).addTo(heardLayer));
}
// What this tab heard while listening, kept until the tab closes (the server keeps nothing once listening stops,
// so other visitors never see it).
let log: { captions: any[]; heard: any[]; hits: Record<string, string> } = { captions: [], heard: [], hits: {} };
try { log = JSON.parse(sessionStorage.getItem("rpt:log") || "") ?? log; } catch {}
log.hits ??= {};
const saveLog = () => { try { sessionStorage.setItem("rpt:log", JSON.stringify(log)); } catch {} };
function addCaption(c: any, mhz: number, label: string) {
  if (log.captions.some((x) => x.at === c.at && x.text === c.text)) return;
  log.captions = [...log.captions, c].slice(-200);
  for (const x of c.calls ?? []) if (x.found) {
    const old = log.heard.find((y) => y.call === x.call);
    log.heard = [...log.heard.filter((y) => y.call !== x.call), { ...x, at: c.at, mhz, label, text: c.text.slice(0, 160), times: (old?.times ?? 0) + 1 }];
  }
}
function renderStatus() { // the light part, redrawn on every scanner hop
  const live = mon.on && !mon.error, sc = live && mon.scan;
  $("monSum").textContent = live ? `${sc ? "📡 " : ""}${mon.mhz.toFixed(3)} MHz${mon.label ? ` · ${mon.label}` : ""}` : "";
  $("monStatus").innerHTML = mon.error ? `⚠ ${esc(mon.error)}` : live ? `${sc ? `📡 Scanning ${sc.i + 1}/${sc.list.length} (${Object.keys(sc.hits).length} busy so far${sc.round ? `; a round takes ${sc.round} s` : ""}) · ` : ""}<span class="sq ${mon.open ? "open" : ""}"></span>${mon.mode === "WFM" ? "Listening" : mon.open ? `Someone's transmitting${mon.snr != null ? ` (${mon.snr} dB over the noise)` : ""}` : "Quiet"} on <b>${mon.mhz.toFixed(3)} MHz</b> ${esc(mon.mode)}${mon.label ? ` · ${esc(mon.label)}` : ""} · ${mon.viewers} listening${mon.transcribing ? " · ✍ transcribing…" : ""}${sc ? "" : ` · <a href="../?listen=${mon.mhz}">open in Spectrum Lab</a>`}` : "Not listening. Pick a repeater on the map, or type a frequency.";
  $("monStop").hidden = !live; $("monStop").textContent = sc ? "Stop scanning" : "Stop";
}
function renderMon() {
  if (!mon) return;
  const live = mon.on && !mon.error;
  renderStatus();
  const audio = $<HTMLAudioElement>("monAudio");
  if (live && (audio.hidden || !audio.src)) { audio.hidden = false; audio.src = `/api/radio/monitor/audio?t=${Date.now()}`; audio.play().catch(() => {}); }
  if (!live && !audio.hidden) { audio.hidden = true; audio.removeAttribute("src"); audio.load(); }
  $("capPanel").hidden = !live && !log.captions.length;
  $("capSum").textContent = `${log.captions.length} lines · ${log.heard.length} calls`;
  const caps = $("captions"), atEnd = caps.scrollHeight - caps.scrollTop - caps.clientHeight < 40; // don't yank the reader back down while they scroll up
  caps.innerHTML = log.captions.length ? log.captions.slice(-40).map(capHtml).join("") : (live ? `<p class="muted">Captions appear here a few seconds after each transmission.</p>` : "");
  if (atEnd) caps.scrollTop = caps.scrollHeight;
  { $("heard").innerHTML = log.heard.slice(-30).reverse().map((h: any) => `<li data-heardcall="${esc(h.call)}"><b>${esc(h.call)}</b> ${esc(h.name ?? "")} <span class="muted">· ${tfmt(h.at)} · ${h.mhz.toFixed(3)}${h.times > 1 ? ` · ${h.times}×` : ""}</span></li>`).join("") || `<li class="muted">Nothing yet.</li>`; for (const h of log.heard) pinHeard(h); }
}
// The captions panel floats over the map: dragged by its title bar (kept for the session), folded with ▾.
{
  const panel = $("capPanel"), head = panel.querySelector("header")!, place = (x: number, y: number) => {
    x = Math.max(0, Math.min(innerWidth - 120, x)); y = Math.max(0, Math.min(innerHeight - 40, y));
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
  };
  try { const p = JSON.parse(sessionStorage.getItem("rpt:caps") || "null"); if (p && innerWidth > 760) place(p.x, p.y); } catch {}
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button") || e.button) return;
    const r = panel.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const move = (m: PointerEvent) => place(m.clientX - sx, m.clientY - sy);
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); const q = panel.getBoundingClientRect(); try { sessionStorage.setItem("rpt:caps", JSON.stringify({ x: q.left, y: q.top })); } catch {} };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    e.preventDefault();
  });
  $("capClear").onclick = () => { log = { captions: [], heard: [], hits: {} }; saveLog(); heardLayer.clearLayers(); heardPins.clear(); renderMon(); render(); };
  $("capFold").onclick = () => { const f = panel.classList.toggle("folded"); $("capFold").textContent = f ? "▸" : "▾"; $("capFold").setAttribute("aria-expanded", String(!f)); };
}
function watchMon() {
  es?.close();
  es = new EventSource("/api/radio/monitor/events");
  es.addEventListener("state", (m) => {
    const d = JSON.parse((m as MessageEvent).data); mon = { ...mon, ...d };
    if (d.on) { for (const c of d.captions ?? []) addCaption(c, c.mhz ?? d.mhz, c.label ?? d.label); const n = Object.keys(log.hits).length; Object.assign(log.hits, d.scan?.hits); saveLog(); if (Object.keys(log.hits).length !== n) render(); }
    renderMon();
  });
  es.addEventListener("squelch", (m) => { if (mon) { const d = JSON.parse((m as MessageEvent).data); mon.open = d.open; mon.snr = d.snr; renderStatus(); } });
  es.addEventListener("caption", (m) => { const c = JSON.parse((m as MessageEvent).data); if (!mon) return; addCaption(c, c.mhz ?? mon.mhz, c.label ?? mon.label); saveLog(); renderMon(); });
  es.addEventListener("scan", (m) => { const d = JSON.parse((m as MessageEvent).data); if (!mon?.scan) return; mon.scan.i = d.i; mon.scan.round = d.round; mon.mhz = d.mhz; mon.label = d.label; mon.open = false; renderStatus(); });
  es.addEventListener("hit", (m) => { const d = JSON.parse((m as MessageEvent).data); if (!mon?.scan) return; mon.scan.hits[d.mhz] = log.hits[d.mhz] = d.at; saveLog(); render(); renderStatus(); });
}
async function monitor(body: object, what: string) {
  $("monStatus").textContent = `Tuning the server SDR to ${what}…`; $<HTMLDetailsElement>("mon").open = true;
  // start the audio inside the click, while the browser still counts it as a user gesture
  const audio = $<HTMLAudioElement>("monAudio"); audio.hidden = false; audio.src = `/api/radio/monitor/audio?t=${Date.now()}`; audio.play().catch(() => {});
  const d = await fetch("/api/radio/monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  if (d.error) { $("monStatus").textContent = `⚠ ${d.error}`; return; }
  mon = { ...mon, ...d }; renderMon();
}
$("monForm").addEventListener("submit", (e) => { e.preventDefault(); const f = Number($<HTMLInputElement>("monMhz").value); if (f) monitor({ mhz: f, mode: $<HTMLSelectElement>("monMode").value }, `${f.toFixed(3)} MHz`); });
$("monStop").onclick = () => fetch("/api/radio/monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stop: true }) }).catch(() => {});
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement, m = t.closest("a[data-monitor]") as HTMLElement | null, h = t.closest("[data-heardcall]") as HTMLElement | null;
  if (m) { e.preventDefault(); const [f, label] = m.dataset.monitor!.split("|"); monitor({ mhz: Number(f), label }, `${Number(f).toFixed(3)} MHz`); map.closePopup(); }
  else if (h) { const pin = heardPins.get(h.dataset.heardcall!); if (pin) { map.setView(pin.getLatLng(), Math.max(map.getZoom(), 10)); pin.openPopup(); } else lookup(h.dataset.heardcall!); }
});
watchMon();
// The scanner: the server SDR hops through the ticked repeaters (or every FM repeater in the list when none is ticked),
// stops on any that's busy while it's busy, and the busy ones light up on the map.
const scanList = () => (picked.size ? [...picked.values()] : shown.filter(scannable)).slice(0, 150);
function scanWhat() {
  const n = scanList().length;
  $("scanWhat").innerHTML = picked.size ? `your ${n} ticked repeater${n > 1 ? "s" : ""} · <a href="#" id="unpick">untick all</a>` : `all ${n} FM repeaters in the list (or tick ☐ the ones you want)`;
  $<HTMLButtonElement>("scanBtn").disabled = n < 2;
}
$("scanBtn").onclick = () => monitor({ scan: scanList().map((r) => ({ mhz: r.outputMHz, label: `${r.callsign} ${r.city}` })) }, `the first of ${scanList().length} repeaters`);
$("scanWhat").addEventListener("click", (e) => { if ((e.target as HTMLElement).id === "unpick") { e.preventDefault(); picked.clear(); render(); } });

// ---------- propagation: NOAA's indexes and what they mean for the bands (server: spacewx.ts) ----------
let wx: any = null;
async function loadWx() {
  wx = await fetch("/api/radio/propagation").then((r) => r.json()).catch(() => null);
  if (!wx || wx.error) { $("wxBody").textContent = "Couldn't load space weather right now."; return; }
  const g = (x: string) => `<span class="${x}">${x}</span>`, sc = (o: any) => (o ? `${o.level}` : "?");
  $("wxSum").textContent = `SFI ${wx.sfi ?? "?"} · K ${wx.k ? wx.k.kp.toFixed(1) : "?"}`;
  $("wxBody").innerHTML = `<p>${esc(wx.summary)}</p>
    <table class="bands"><tr><th>Band</th><th>Day</th><th>Night</th></tr>${wx.bands.map((b: any) => `<tr title="${esc(b.why)}"><td>${esc(b.band)}</td><td>${g(b.day)}</td><td>${g(b.night)}</td></tr>`).join("")}</table>
    <p>Solar flux <b>${wx.sfi ?? "?"}</b> · sunspots <b>${wx.ssn ?? "?"}</b> · K <b>${wx.k?.kp ?? "?"}</b> (A ${wx.k?.a ?? "?"}) · X-ray <b>${wx.xray?.now ?? "?"}</b>${wx.xray ? ` (6 h peak ${wx.xray.max6h})` : ""}${wx.solarWind ? ` · solar wind <b>${wx.solarWind.kmPerS} km/s</b>, Bz ${wx.solarWind.bz}` : ""}</p>
    <div class="kbars" title="K index, last 2 days (3-hourly)">${wx.kHistory.map(([t, k]: [string, number]) => `<i style="height:${Math.max(2, k * 4)}px" title="${t.replace("T", " ")}: K ${k}"></i>`).join("")}</div>
    ${wx.scales ? `<p>NOAA scales now: R${sc(wx.scales.radioBlackout)} S${sc(wx.scales.solarRadiation)} G${sc(wx.scales.geomagnetic)}${wx.scales.geomagnetic?.text ? ` (${esc(wx.scales.geomagnetic.text)})` : ""}${wx.scales.tomorrow ? ` · tomorrow G${sc(wx.scales.tomorrow.geomagnetic)}, flare chance ${wx.scales.tomorrow.rMinorProb ?? "?"}% (M) / ${wx.scales.tomorrow.rMajorProb ?? "?"}% (X)` : ""}</p>` : ""}
    <p>VHF: aurora ${esc(wx.vhf.aurora)} · sporadic E ${esc(wx.vhf.sporadicE)}.</p>
    <span class="muted">NOAA SWPC · ${new Date(wx.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · <a href="https://www.swpc.noaa.gov/communities/radio-communications" target="_blank" rel="noopener">about these numbers</a></span>`;
}
loadWx(); setInterval(loadWx, 10 * 60_000);

// ---------- ham satellites: the next passes over the map's center, and any bird's position and track on the map (server: sat.ts) ----------
const satLayer = L.layerGroup().addTo(map), horizonLayer = L.layerGroup().addTo(map);
let sats: any = null, satShown: string | null = null, satTimer: ReturnType<typeof setInterval> | undefined;
// The place passes are computed for: the map's center when they were computed (showing a satellite moves the map away).
let satHome = map.getCenter();
const at = () => `lat=${satHome.lat.toFixed(2)}&lon=${satHome.lng.toFixed(2)}`;
/** The picture page for a satellite, with its settings and the place passes are computed for. */
const picUrl = (page: string) => `../${page}&${at()}`;
/** How far from a place (km along the ground) a satellite `h` km up is at least `el` degrees above its horizon. */
const reachKm = (h: number, el: number) => { const R = 6371, e = (el * Math.PI) / 180; return R * (Math.acos((R * Math.cos(e)) / (R + h)) - e); };
async function loadSats() {
  const c = (satHome = map.getCenter());
  sats = await fetch(`/api/radio/sats?lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}&hours=24`).then((r) => r.json()).catch(() => null);
  if (!sats || sats.error) { $("satBody").textContent = "Couldn't compute passes right now."; return; }
  const next = sats.passes.slice(0, 14);
  const local = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString([], o); // the reader's own time zone
  $("satSum").textContent = next.length ? `next: ${next[0].name.split(" ")[0]} ${local(next[0].riseIso, { hour: "numeric", minute: "2-digit" })}` : "";
  $("satBody").innerHTML = `<p>Passes over the map's center (${c.lat.toFixed(1)}°, ${c.lng.toFixed(1)}°) in the next 24 h (≥ 10° up), in your time. Click one to draw the satellite and its track. <button type="button" id="satMe">📍 Passes over me</button></p>
    ${next.map((p: any) => `<div class="pass" data-sat="${esc(p.sat)}"><b>${esc(local(p.riseIso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</b> ${esc(p.name)} · <b>${p.maxElevation}°</b> · ${p.minutes} min${p.upNow ? " · <b>up now</b>" : ""} · ${esc(p.path)}<br><span class="muted">${esc(p.kind)}: ↓ ${esc(p.down)}${p.up ? ` · ↑ ${esc(p.up)}` : ""}${p.status !== "active" ? ` · ${esc(p.status)}` : ""}${p.pictures ? ` · <a href="${picUrl(p.pictures)}">receive its pictures →</a>` : ""}</span></div>`).join("")}
    <p>Where is it now?</p><div class="satbtns">${sats.satellites.map((s: any) => `<button type="button" data-sat="${esc(s.id)}" title="${esc(s.notes)}">${esc(s.name.split(" (")[0])}</button>`).join("")}</div>
    <p class="muted">Orbits from CelesTrak; status hand-kept (check <a href="https://www.amsat.org/status/" target="_blank" rel="noopener">AMSAT's status page</a> for today's reports). <button type="button" id="satHere">Recompute for this map center</button></p>`;
  $("satBody").querySelectorAll("[data-sat]").forEach((el) => ((el as HTMLElement).onclick = () => showSat((el as HTMLElement).dataset.sat!)));
  $("satHere").onclick = loadSats;
  $("satMe").onclick = () => navigator.geolocation?.getCurrentPosition(
    (pos) => { map.setView([pos.coords.latitude, pos.coords.longitude], 9); loadSats(); },
    () => { $("satMe").textContent = "Location not shared: move the map to where you are, then recompute"; });
}
async function showSat(id: string) {
  satShown = id;
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&${at()}`).then((r) => r.json()).catch(() => null);
  if (!t || t.error) return;
  satLayer.clearLayers(); horizonLayer.clearLayers();
  // Around the place: where this satellite is above the horizon (start recording as it crosses in) and 20° up (a clean signal)
  const h = t.now[2];
  L.circle(satHome, { radius: reachKm(h, 0) * 1000, color: "#fff", weight: 2, opacity: 0.85, dashArray: "2 7", fill: false, interactive: true })
    .bindTooltip(`Horizon for ${esc(t.sat.name)}: inside this circle it's above your horizon. Start recording as it crosses in.`, { sticky: true }).addTo(horizonLayer);
  L.circle(satHome, { radius: reachKm(h, 20) * 1000, color: "#5cff9d", weight: 2, opacity: 0.8, dashArray: "2 7", fill: true, fillOpacity: 0.05, interactive: true })
    .bindTooltip("20° above your horizon: inside this circle the signal is strong enough to decode well.", { sticky: true }).addTo(horizonLayer);
  L.circleMarker(satHome, { radius: 5, color: "#000", weight: 1.5, fillColor: "#fff", fillOpacity: 1 }).bindTooltip("You (where passes are computed)").addTo(horizonLayer);
  // the ground track, cut where it crosses the date line
  const segs: number[][][] = [[]];
  for (const [la, lo] of t.track) { const seg = segs.at(-1)!; if (seg.length && Math.abs(lo - seg.at(-1)![1]) > 180) segs.push([]); segs.at(-1)!.push([la, lo]); }
  for (const seg of segs) if (seg.length > 1) { // a dark casing under a bright line: readable over ocean and land alike
    L.polyline(seg, { color: "#000", weight: 7, opacity: 0.55 }).addTo(satLayer);
    L.polyline(seg, { color: "#ffd23f", weight: 3.5, opacity: 1 }).addTo(satLayer);
  }
  const icon = L.divIcon({ className: "", html: `<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 0 3px #000)">🛰</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  const v = t.view;
  L.marker([t.now[0], t.now[1]], { icon }).bindPopup(`<b>${esc(t.sat.name)}</b> <span class="muted">${esc(t.sat.kind)}</span><br>${t.now[2]} km up over ${t.now[0].toFixed(1)}°, ${t.now[1].toFixed(1)}°${v ? `<br>${v.aboveHorizon ? `<b>Above the horizon here:</b> ${v.elevation}° up, ${esc(v.direction)} (${v.azimuth}°)` : "Below the horizon here"}` : ""}<br>↓ ${esc(t.sat.down)}${t.sat.up ? `<br>↑ ${esc(t.sat.up)}` : ""}${t.sat.pictures ? `<br><a href="${picUrl(t.sat.pictures)}">receive its pictures →</a>` : ""}<br><span class="muted">${esc(t.sat.notes)} · ${esc(t.sat.status)}</span>`, { autoPan: false }).addTo(satLayer).openPopup();
  map.setView([t.now[0], t.now[1]], 2); // the satellite in the middle, zoomed out far enough for its track
  clearInterval(satTimer);
  satTimer = setInterval(() => { if (satShown === id) showSatQuiet(id); }, 15_000);
}
async function showSatQuiet(id: string) { // move the marker along without reopening the popup
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&${at()}`).then((r) => r.json()).catch(() => null);
  if (!t || t.error) return;
  satLayer.eachLayer((l: any) => { if (l.setLatLng && l.getLatLng) l.setLatLng([t.now[0], t.now[1]]); });
}
loadSats();

// Links in (Blip uses them): ?call=<callsign>, ?rpt=<repeater id>@<lat>,<lon> (opens that repeater), ?sat=<id> (shows that satellite).
const params = new URLSearchParams(location.search), q = params.get("call"), [rptId, rptAt = ""] = (params.get("rpt") ?? "").split("@"), [rLat, rLon] = rptAt.split(",").map(Number);
if (Number.isFinite(rLat) && Number.isFinite(rLon) && rptAt) map.setView([rLat, rLon], 13);
else if (q) await lookup(q); // moves the map; the area then loads
if (rptId) pendingRpt = Number(rptId);
await loadArea();
if (params.get("sat")) {
  await showSat(params.get("sat")!);
}

(window as any).blipActions = {
  lookup_callsign: { label: "looked up the callsign", description: "Look up a US callsign and show the licensee's location on this map.", parameters: { callsign: { type: "string", description: "e.g. W1AW" } }, run: ({ callsign }: { callsign: string }) => lookup(String(callsign ?? "")) },
  filter_repeaters: { label: "filtered repeaters", description: "Show only some repeater bands/modes. Bands: 10m, 6m, 2m, 1.25m, 70cm, 33cm, 23cm.", parameters: { bands: { type: "string", description: "Comma-separated bands, e.g. '2m,70cm'" }, mode: { type: "string", description: "FM, DMR, D-STAR, YSF, P25 or empty for all" } },
    run: ({ bands, mode }: { bands?: string; mode?: string }) => {
      if (bands) { on.clear(); String(bands).split(/[ ,]+/).forEach((b) => BANDS[b] && on.add(b)); document.querySelectorAll<HTMLInputElement>("#bands input").forEach((i) => (i.checked = on.has(i.dataset.b!))); }
      if (mode !== undefined) $<HTMLSelectElement>("mode").value = String(mode).toUpperCase();
      render();
    } },
};
(window as any).blipContext = () => ({ page: "Callsigns & repeaters (worldwide map, showing the visible area), with a propagation panel (NOAA space weather, band conditions) and the next ham-satellite passes over the map's center", lastLookup: lastLicense, bandsShown: [...on], mode: $<HTMLSelectElement>("mode").value || "all",
  scanning: mon?.on && mon.scan ? { channels: mon.scan.list.length, busySoFar: mon.scan.hits } : undefined,
  listening: mon?.on ? { mhz: mon.mhz, label: mon.label, mode: mon.mode, squelchOpen: mon.open, lastCaptions: log.captions.slice(-6).map((c: any) => `${tfmt(c.at)}: ${c.text}${c.calls?.length ? ` [${c.calls.map((x: any) => x.call).join(", ")}]` : ""}`), } : "off (the 🎧 panel can tune the server SDR to a repeater and caption it)",
  heardInThisTab: log.heard.slice(-10).map((h: any) => `${h.call} ${h.name ?? ""} at ${tfmt(h.at)} on ${h.mhz}`),
  propagation: wx && { summary: wx.summary, sfi: wx.sfi, ssn: wx.ssn, k: wx.k?.kp, bands: wx.bands }, nextSatellitePasses: sats?.passes.slice(0, 6).map((p: any) => `${p.rise} ${p.name} ${p.maxElevation}° ${p.minutes} min, down ${p.down}`), satelliteShown: satShown,
  nearestRepeaters: shown.slice(0, 12).map((r) => ({ callsign: r.callsign, outputMHz: r.outputMHz, offsetMHz: r.offsetMHz, tone: r.toneUp, mode: r.mode, network: r.network, city: r.city, km: +r.km.toFixed(1) })) });
