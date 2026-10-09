// The ADS-B radar page: aircraft from our decoder on the server, live on a map.
import "./ham/ham.css";
import { HOME, connect, esc, makeMap } from "./live-map.ts";
import type { Aircraft } from "./adsb.ts";
declare const L: any;

const map = makeMap("map", 9);
const markers = new Map<string, { m: any; trail: any }>();
let planes: Aircraft[] = [];
const color = (alt?: number | null) => alt == null ? "#aaa" : alt < 5000 ? "#ffd166" : alt < 15000 ? "#ff9f1c" : alt < 30000 ? "#4de1ff" : "#c59bff";
const km = (a: Aircraft) => a.lat == null ? Infinity : Math.hypot((a.lat - HOME.lat) * 111, (a.lon! - HOME.lon) * 84);
const label = (a: Aircraft) => `${a.callsign || a.icao}${a.altitude != null ? ` · ${a.altitude.toLocaleString()} ft` : ""}${a.speed ? ` · ${a.speed} kt` : ""}`;

function render() {
  const seen = new Set<string>();
  for (const a of planes) {
    if (a.lat == null) continue;
    seen.add(a.icao);
    const html = `<div class="plane" style="color:${color(a.altitude)};transform:rotate(${(a.heading ?? 0) - 45}deg)">✈</div>`;
    const icon = L.divIcon({ className: "", html, iconSize: [20, 20], iconAnchor: [10, 10] });
    const popup = `<b>${esc(a.callsign || "(no callsign yet)")}</b> <span class="muted">${esc(a.icao)}</span><br>${a.altitude != null ? `${a.altitude.toLocaleString()} ft` : ""}${a.speed ? ` · ${a.speed} kt` : ""}${a.heading != null ? ` · heading ${a.heading}°` : ""}${a.verticalRate ? ` · ${a.verticalRate > 0 ? "climbing" : "descending"} ${Math.abs(a.verticalRate)} ft/min` : ""}<br>${a.messages} messages${a.callsign ? ` · <a href="https://www.flightaware.com/live/flight/${encodeURIComponent(a.callsign)}" target="_blank" rel="noopener">FlightAware</a>` : ""}`;
    const got = markers.get(a.icao);
    if (got) { got.m.setLatLng([a.lat, a.lon]).setIcon(icon).setPopupContent(popup).setTooltipContent(label(a)); got.trail.setLatLngs(a.track); }
    else markers.set(a.icao, { m: L.marker([a.lat, a.lon], { icon }).bindPopup(popup).bindTooltip(label(a)).addTo(map), trail: L.polyline(a.track, { color: color(a.altitude), weight: 2, opacity: 0.6 }).addTo(map) });
  }
  for (const [k, v] of markers) if (!seen.has(k)) { v.m.remove(); v.trail.remove(); markers.delete(k); }
  const sorted = [...planes].sort((a, b) => km(a) - km(b));
  document.getElementById("count")!.textContent = `${planes.length} aircraft · ${planes.filter((a) => a.lat != null).length} with positions`;
  document.getElementById("list")!.innerHTML = sorted.map((a) => `<li data-i="${a.icao}"><b>${esc(a.callsign || a.icao)}</b> <span class="muted">${a.altitude != null ? `${a.altitude.toLocaleString()} ft` : "altitude ?"}${a.speed ? ` · ${a.speed} kt` : ""}${km(a) < Infinity ? ` · ${km(a).toFixed(0)} km away` : ""}</span></li>`).join("") || `<li class="muted">No aircraft heard yet. Planes appear as their messages arrive.</li>`;
}
document.getElementById("list")!.addEventListener("click", (e) => {
  const i = (e.target as HTMLElement).closest("li")?.dataset.i, m = i && markers.get(i);
  if (m) { map.setView(m.m.getLatLng(), 11); m.m.openPopup(); }
});

// Blip spots new planes (at most one shout every 20 s).
const known = new Set<string>();
let shouted = 0;
function spot(list: Aircraft[]) {
  const fresh = list.filter((a) => !known.has(a.icao) && a.lat != null);
  list.forEach((a) => a.lat != null && known.add(a.icao));
  if (!fresh.length || Date.now() - shouted < 20_000 || known.size === fresh.length) return; // not on the first load
  shouted = Date.now();
  const a = fresh[0], p = map.latLngToContainerPoint([a.lat, a.lon]), r = document.getElementById("map")!.getBoundingClientRect();
  dispatchEvent(new CustomEvent("blip:look", { detail: { x: r.left + p.x, y: r.top + p.y, ms: 2500 } }));
  dispatchEvent(new CustomEvent("blip:say", { detail: { text: `Plane! ${a.callsign || a.icao}${a.altitude != null ? ` at ${a.altitude.toLocaleString()} ft` : ""}`, mood: "surprised" } }));
  dispatchEvent(new CustomEvent("blip:ping"));
}
connect("adsb", { aircraft: (list: Aircraft[]) => { planes = list; render(); spot(list); } });
(window as any).blipContext = () => ({ page: "ADS-B radar (aircraft over NYC from our own 1090 MHz decoder)", aircraft: planes.slice(0, 30).map((a) => ({ callsign: a.callsign, icao: a.icao, altitudeFt: a.altitude, speedKt: a.speed, heading: a.heading, verticalRate: a.verticalRate, kmFromReceiver: km(a) < Infinity ? Math.round(km(a)) : null })) });
