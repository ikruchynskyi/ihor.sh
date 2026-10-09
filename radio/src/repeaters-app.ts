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
map.on("moveend", renderList);

const fmtOff = (o: number) => (o > 0 ? `+${o}` : `${o}`);
function popup(r: Repeater) {
  return `<b>${esc(r.callsign)}</b> <span class="muted">${esc(r.city)}</span><br>
    <span class="freq">${r.outputMHz.toFixed(4)} MHz</span> · offset ${fmtOff(r.offsetMHz)} MHz (transmit on ${r.inputMHz.toFixed(4)})<br>
    ${r.toneUp ? `Tone ${esc(r.toneUp)} Hz` : "No tone listed"} · ${esc(r.mode)}${r.network ? ` · ${esc(r.network)}${r.node ? ` node ${esc(r.node)}` : ""}` : ""}${r.operational ? "" : " · <b>not operational</b>"}${r.restriction ? ` · ${esc(r.restriction)}` : ""}<br>
    ${r.description ? `<span class="muted">${esc(r.description).replace(/\n/g, "<br>")}</span><br>` : ""}
    <a href="#" data-call="${esc(r.callsign)}">Look up ${esc(r.callsign)}</a>${r.outputMHz >= 24 && r.outputMHz <= 1766 && r.mode === "FM" ? ` · <a href="../?listen=${r.outputMHz}">Listen in Spectrum Lab</a>` : ""}`;
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
  $("count").textContent = `(${shown.length})`;
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
  const rpts = all.filter((r) => r.callsign.toUpperCase() === d.callsign);
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

all = await fetch("/api/radio/repeaters").then((r) => r.json()).catch(() => []);
render();
const q = new URLSearchParams(location.search).get("call");
if (q) lookup(q);

(window as any).blipActions = {
  lookup_callsign: { label: "looked up the callsign", description: "Look up a US callsign and show the licensee's location on this map.", parameters: { callsign: { type: "string", description: "e.g. W1AW" } }, run: ({ callsign }: { callsign: string }) => lookup(String(callsign ?? "")) },
  filter_repeaters: { label: "filtered repeaters", description: "Show only some repeater bands/modes. Bands: 10m, 6m, 2m, 1.25m, 70cm, 33cm, 23cm.", parameters: { bands: { type: "string", description: "Comma-separated bands, e.g. '2m,70cm'" }, mode: { type: "string", description: "FM, DMR, D-STAR, YSF, P25 or empty for all" } },
    run: ({ bands, mode }: { bands?: string; mode?: string }) => {
      if (bands) { on.clear(); String(bands).split(/[ ,]+/).forEach((b) => BANDS[b] && on.add(b)); document.querySelectorAll<HTMLInputElement>("#bands input").forEach((i) => (i.checked = on.has(i.dataset.b!))); }
      if (mode !== undefined) $<HTMLSelectElement>("mode").value = String(mode).toUpperCase();
      render();
    } },
};
(window as any).blipContext = () => ({ page: "Callsigns & repeaters (NYC region)", lastLookup: lastLicense, bandsShown: [...on], mode: $<HTMLSelectElement>("mode").value || "all",
  nearestRepeaters: shown.slice(0, 12).map((r) => ({ callsign: r.callsign, outputMHz: r.outputMHz, offsetMHz: r.offsetMHz, tone: r.toneUp, mode: r.mode, network: r.network, city: r.city, km: +r.km.toFixed(1) })) });
