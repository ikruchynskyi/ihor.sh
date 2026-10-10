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
    <a href="#" data-call="${esc(r.callsign)}">Look up ${esc(r.callsign)}</a>${r.outputMHz >= 24 && r.outputMHz <= 1766 && r.mode === "FM" ? ` · <a href="#" data-monitor="${r.outputMHz}|${esc(r.callsign)} ${esc(r.city)}">🎧 Listen with captions</a> · <a href="../?listen=${r.outputMHz}">Spectrum Lab</a>` : ""}`;
}
function render() {
  layer.clearLayers();
  for (const r of all) {
    if (!on.has(r.band) || ($<HTMLInputElement>("opOnly").checked && !r.operational) || ($<HTMLSelectElement>("mode").value && !r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value))) continue;
    L.circleMarker([r.lat, r.lon], { renderer: canvas, radius: 6, color: BANDS[r.band], fillColor: BANDS[r.band], fillOpacity: 0.85, weight: 1 }).bindPopup(() => popup(r), { maxWidth: 320 }).bindTooltip(`${r.callsign} ${r.outputMHz}`).addTo(layer);
  }
  renderList();
}
function renderList() {
  const c = map.getCenter();
  shown = all.filter((r) => on.has(r.band) && (!$<HTMLInputElement>("opOnly").checked || r.operational) && (!$<HTMLSelectElement>("mode").value || r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value)))
    .map((r) => ({ ...r, km: Math.hypot((r.lat - c.lat) * 111, (r.lon - c.lng) * 84) })).sort((a, b) => a.km - b.km);
  $("count").textContent = `(${shown.length}${total > all.length ? ` of the nearest ${all.length}; zoom in for all ${total}` : ""})`;
  $("list").innerHTML = shown.slice(0, 60).map((r, i) => `<li data-i="${i}"><span class="swatch" style="background:${BANDS[r.band]}"></span><b>${esc(r.callsign)}</b> <span class="freq">${r.outputMHz.toFixed(3)}</span> <span class="muted">${fmtOff(r.offsetMHz)} ${r.toneUp ? `· ${esc(r.toneUp)} Hz` : ""} · ${esc(r.mode)} · ${r.km.toFixed(1)} km · ${esc(r.city)}</span></li>`).join("");
}
$("list").addEventListener("click", (e) => {
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
const capHtml = (c: any) => `<div class="cap"><time>${tfmt(c.at)}</time>${esc(c.text)}${c.calls?.length ? ` <span class="muted">·</span> ${c.calls.map(callHtml).join(" ")}` : ""}</div>`;
function pinHeard(h: any) {
  if (!h.lat || !h.lon) return;
  const icon = L.divIcon({ className: "", html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 0 3px #000)">📻</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  const popup = `<b>${esc(h.call)}</b> ${esc(h.name ?? "")}<br><span class="muted">${esc(h.cls ?? "")} · ${esc(h.grid ?? "")} · ${esc(h.city ?? "")}</span><br>heard ${tfmt(h.at)} on ${h.mhz.toFixed(3)} MHz${h.label ? ` (${esc(h.label)})` : ""}${h.times > 1 ? `, ${h.times}×` : ""}<br><span class="muted">“${esc(h.text)}”</span><br><a href="#" data-call="${esc(h.call)}">Look up</a>`;
  const old = heardPins.get(h.call);
  if (old) { old.setLatLng([h.lat, h.lon]).setPopupContent(popup); return; }
  heardPins.set(h.call, L.marker([h.lat, h.lon], { icon, zIndexOffset: 500 }).bindPopup(popup, { maxWidth: 320 }).addTo(heardLayer));
}
function renderMon() {
  if (!mon) return;
  const live = mon.on && !mon.error;
  $("monSum").textContent = live ? `${mon.mhz.toFixed(3)} MHz${mon.label ? ` · ${mon.label}` : ""}` : "";
  $("monStatus").innerHTML = mon.error ? `⚠ ${esc(mon.error)}` : live ? `<span class="sq ${mon.open ? "open" : ""}"></span>${mon.mode === "WFM" ? "Listening" : mon.open ? `Someone's transmitting${mon.snr != null ? ` (${mon.snr} dB over the noise)` : ""}` : "Quiet"} on <b>${mon.mhz.toFixed(3)} MHz</b> ${esc(mon.mode)}${mon.label ? ` · ${esc(mon.label)}` : ""} · ${mon.viewers} listening${mon.transcribing ? " · ✍ transcribing…" : ""} · <a href="../?listen=${mon.mhz}">open in Spectrum Lab</a>` : "Not listening. Pick a repeater on the map, or type a frequency.";
  $("monStop").hidden = !live;
  const audio = $<HTMLAudioElement>("monAudio");
  if (live && (audio.hidden || !audio.src)) { audio.hidden = false; audio.src = `/api/radio/monitor/audio?t=${Date.now()}`; audio.play().catch(() => {}); }
  if (!live && !audio.hidden) { audio.hidden = true; audio.removeAttribute("src"); audio.load(); }
  $("captions").innerHTML = mon.captions?.length ? mon.captions.slice(-40).map(capHtml).join("") : (live ? `<p class="muted">Captions appear here a few seconds after each transmission.</p>` : "");
  $("captions").scrollTop = $("captions").scrollHeight;
  if (mon.heard) { $("heard").innerHTML = mon.heard.slice(-30).reverse().map((h: any) => `<li data-heardcall="${esc(h.call)}"><b>${esc(h.call)}</b> ${esc(h.name ?? "")} <span class="muted">· ${tfmt(h.at)} · ${h.mhz.toFixed(3)}${h.times > 1 ? ` · ${h.times}×` : ""}</span></li>`).join("") || `<li class="muted">Nothing yet.</li>`; for (const h of mon.heard) pinHeard(h); }
}
function watchMon() {
  es?.close();
  es = new EventSource("/api/radio/monitor/events");
  es.addEventListener("state", (m) => { const d = JSON.parse((m as MessageEvent).data); mon = { ...mon, ...d, heard: d.heard ?? mon?.heard }; renderMon(); });
  es.addEventListener("squelch", (m) => { if (mon) { const d = JSON.parse((m as MessageEvent).data); mon.open = d.open; mon.snr = d.snr; renderMon(); } });
  es.addEventListener("caption", (m) => { const c = JSON.parse((m as MessageEvent).data); if (!mon) return; mon.captions = [...(mon.captions ?? []), c].slice(-60); for (const x of c.calls ?? []) if (x.found) { const h = { ...x, at: c.at, mhz: mon.mhz, label: mon.label, text: c.text.slice(0, 160), times: 1 }; mon.heard = [...(mon.heard ?? []).filter((y: any) => y.call !== h.call), h]; } renderMon(); });
}
async function monitor(mhz: number, label: string, mode = "NFM") {
  $("monStatus").textContent = `Tuning the server SDR to ${mhz.toFixed(3)} MHz…`; $<HTMLDetailsElement>("mon").open = true;
  // start the audio inside the click, while the browser still counts it as a user gesture
  const audio = $<HTMLAudioElement>("monAudio"); audio.hidden = false; audio.src = `/api/radio/monitor/audio?t=${Date.now()}`; audio.play().catch(() => {});
  const d = await fetch("/api/radio/monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mhz, label, mode }) }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  if (d.error) { $("monStatus").textContent = `⚠ ${d.error}`; return; }
  mon = { ...mon, ...d }; renderMon();
}
$("monForm").addEventListener("submit", (e) => { e.preventDefault(); const f = Number($<HTMLInputElement>("monMhz").value); if (f) monitor(f, "", $<HTMLSelectElement>("monMode").value); });
$("monStop").onclick = () => fetch("/api/radio/monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stop: true }) }).catch(() => {});
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement, m = t.closest("a[data-monitor]") as HTMLElement | null, h = t.closest("[data-heardcall]") as HTMLElement | null;
  if (m) { e.preventDefault(); const [f, label] = m.dataset.monitor!.split("|"); monitor(Number(f), label); map.closePopup(); }
  else if (h) { const pin = heardPins.get(h.dataset.heardcall!); if (pin) { map.setView(pin.getLatLng(), Math.max(map.getZoom(), 10)); pin.openPopup(); } else lookup(h.dataset.heardcall!); }
});
watchMon();

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
const satLayer = L.layerGroup().addTo(map);
let sats: any = null, satShown: string | null = null, satTimer: ReturnType<typeof setInterval> | undefined;
async function loadSats() {
  const c = map.getCenter();
  sats = await fetch(`/api/radio/sats?lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}&hours=24`).then((r) => r.json()).catch(() => null);
  if (!sats || sats.error) { $("satBody").textContent = "Couldn't compute passes right now."; return; }
  const next = sats.passes.slice(0, 14);
  $("satSum").textContent = next.length ? `next: ${next[0].name.split(" ")[0]} ${next[0].rise.split(", ").pop()}` : "";
  $("satBody").innerHTML = `<p>Passes over the map's center in the next 24 h (≥ 10° up). Click one to draw the satellite and its track.</p>
    ${next.map((p: any) => `<div class="pass" data-sat="${esc(p.sat)}"><b>${esc(p.rise.split(", ").slice(1).join(", "))}</b> ${esc(p.name)} · <b>${p.maxElevation}°</b> · ${p.minutes} min · ${esc(p.path)}<br><span class="muted">${esc(p.kind)}: ↓ ${esc(p.down)}${p.up ? ` · ↑ ${esc(p.up)}` : ""}${p.status !== "active" ? ` · ${esc(p.status)}` : ""}</span></div>`).join("")}
    <p>Where is it now?</p><div class="satbtns">${sats.satellites.map((s: any) => `<button type="button" data-sat="${esc(s.id)}" title="${esc(s.notes)}">${esc(s.name.split(" (")[0])}</button>`).join("")}</div>
    <p class="muted">Orbits from CelesTrak; status hand-kept (check <a href="https://www.amsat.org/status/" target="_blank" rel="noopener">AMSAT's status page</a> for today's reports). <button type="button" id="satHere">Recompute for this map center</button></p>`;
  $("satBody").querySelectorAll("[data-sat]").forEach((el) => ((el as HTMLElement).onclick = () => showSat((el as HTMLElement).dataset.sat!)));
  $("satHere").onclick = loadSats;
}
async function showSat(id: string) {
  satShown = id;
  const c = map.getCenter();
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`).then((r) => r.json()).catch(() => null);
  if (!t || t.error) return;
  satLayer.clearLayers();
  // the ground track, cut where it crosses the date line
  const segs: number[][][] = [[]];
  for (const [la, lo] of t.track) { const seg = segs.at(-1)!; if (seg.length && Math.abs(lo - seg.at(-1)![1]) > 180) segs.push([]); segs.at(-1)!.push([la, lo]); }
  for (const seg of segs) if (seg.length > 1) L.polyline(seg, { color: "#4de1ff", weight: 2, opacity: 0.8, dashArray: "4 6" }).addTo(satLayer);
  const icon = L.divIcon({ className: "", html: `<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 0 3px #000)">🛰</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  const v = t.view;
  L.marker([t.now[0], t.now[1]], { icon }).bindPopup(`<b>${esc(t.sat.name)}</b> <span class="muted">${esc(t.sat.kind)}</span><br>${t.now[2]} km up over ${t.now[0].toFixed(1)}°, ${t.now[1].toFixed(1)}°${v ? `<br>${v.aboveHorizon ? `<b>Above the horizon here:</b> ${v.elevation}° up, ${esc(v.direction)} (${v.azimuth}°)` : "Below the horizon here"}` : ""}<br>↓ ${esc(t.sat.down)}${t.sat.up ? `<br>↑ ${esc(t.sat.up)}` : ""}<br><span class="muted">${esc(t.sat.notes)} · ${esc(t.sat.status)}</span>`).addTo(satLayer).openPopup();
  clearInterval(satTimer);
  satTimer = setInterval(() => { if (satShown === id) showSatQuiet(id); }, 15_000);
}
async function showSatQuiet(id: string) { // move the marker along without reopening the popup
  const c = map.getCenter();
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`).then((r) => r.json()).catch(() => null);
  if (!t || t.error) return;
  satLayer.eachLayer((l: any) => { if (l.setLatLng && l.getLatLng) l.setLatLng([t.now[0], t.now[1]]); });
}
loadSats();

const q = new URLSearchParams(location.search).get("call");
if (q) await lookup(q); // moves the map; the area then loads
await loadArea();

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
  listening: mon?.on ? { mhz: mon.mhz, label: mon.label, mode: mon.mode, squelchOpen: mon.open, lastCaptions: (mon.captions ?? []).slice(-6).map((c: any) => `${tfmt(c.at)}: ${c.text}${c.calls?.length ? ` [${c.calls.map((x: any) => x.call).join(", ")}]` : ""}`), heard: (mon.heard ?? []).slice(-10).map((h: any) => `${h.call} ${h.name ?? ""} at ${tfmt(h.at)} on ${h.mhz}`) } : "off (the 🎧 panel can tune the server SDR to a repeater and caption it)",
  propagation: wx && { summary: wx.summary, sfi: wx.sfi, ssn: wx.ssn, k: wx.k?.kp, bands: wx.bands }, nextSatellitePasses: sats?.passes.slice(0, 6).map((p: any) => `${p.rise} ${p.name} ${p.maxElevation}° ${p.minutes} min, down ${p.down}`), satelliteShown: satShown,
  nearestRepeaters: shown.slice(0, 12).map((r) => ({ callsign: r.callsign, outputMHz: r.outputMHz, offsetMHz: r.offsetMHz, tone: r.toneUp, mode: r.mode, network: r.network, city: r.city, km: +r.km.toFixed(1) })) });
