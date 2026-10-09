// The APRS map page: stations and packets from our modem on the server, live.
import "./ham/ham.css";
import { ago, connect, esc, makeMap } from "./live-map.ts";
import type { Packet, Station } from "./aprs.ts";
declare const L: any;

const map = makeMap("map", 9);
const stations = new Map<string, Station>();
const markers = new Map<string, { m: any; trail: any }>();
let log: Packet[] = [];
// A few common APRS symbols ("/" table); everything else gets a dot.
const SYM: Record<string, string> = { "/>": "🚗", "/-": "🏠", "/_": "🌦", "/[": "🚶", "/k": "🚚", "/v": "🚐", "/b": "🚲", "/Y": "⛵", "/s": "🚤", "/'": "✈", "/O": "🎈", "/#": "📡", "\\#": "📡", "/&": "📶", "\\&": "📶", "/r": "📡", "/y": "🏠", "/j": "🚙", "/u": "🚛", "/<": "🏍", "/a": "🚑", "/f": "🚒", "/U": "🚌", "/=": "🚂", "/R": "🚐", "/+": "✚", "\\n": "🔺" };
const sym = (s: string) => SYM[s] ?? (s?.[0] === "\\" ? "◆" : "●");

function describe(st: Station) {
  const wx = st.wx ? ` · ${[st.wx.tempF != null && `${st.wx.tempF}°F`, st.wx.humidity != null && `${st.wx.humidity}% rh`, st.wx.windSpeed != null && `wind ${st.wx.windSpeed} mph`, st.wx.pressure != null && `${st.wx.pressure} mbar`].filter(Boolean).join(", ")}` : "";
  return `${st.speed ? `${st.speed} km/h · ` : ""}${st.altitude != null ? `${st.altitude} m · ` : ""}${esc(st.comment || st.status)}${wx}`;
}
function upsert(st: Station) {
  stations.set(st.callsign, st);
  if (st.lat == null) return;
  const icon = L.divIcon({ className: "", html: `<div class="sym">${sym(st.symbol)}</div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
  const popup = `<b>${esc(st.callsign)}</b> <a href="https://aprs.fi/info/a/${encodeURIComponent(st.callsign)}" target="_blank" rel="noopener">aprs.fi</a><br>${describe(st)}<br><span class="muted">${st.packets} packets · last ${ago(st.lastSeen)}</span>`;
  const got = markers.get(st.callsign);
  if (got) { got.m.setLatLng([st.lat, st.lon]).setIcon(icon).setPopupContent(popup); got.trail.setLatLngs(st.track); }
  else markers.set(st.callsign, { m: L.marker([st.lat, st.lon], { icon, title: st.callsign }).bindPopup(popup).bindTooltip(st.callsign).addTo(map), trail: L.polyline(st.track, { color: "#ff5c8a", weight: 2, opacity: 0.6 }).addTo(map) });
}
function renderLists() {
  const list = [...stations.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  document.getElementById("count")!.textContent = `${list.length} stations · ${log.length} packets`;
  document.getElementById("stations")!.innerHTML = list.map((s) => `<li data-c="${esc(s.callsign)}">${sym(s.symbol)} <b>${esc(s.callsign)}</b> <span class="muted">${ago(s.lastSeen)}</span><br><span class="muted">${describe(s)}</span></li>`).join("") || `<li class="muted">Nothing heard yet. Stations beacon every few minutes.</li>`;
  document.getElementById("log")!.innerHTML = [...log].reverse().slice(0, 100).map((p) => `<li><b>${esc(p.from)}</b> → ${esc(p.to)} <span class="muted">${esc(p.type)} · ${ago(p.time)}${p.path ? ` · via ${esc(p.path)}` : ""}</span><br><code>${esc(p.raw)}</code></li>`).join("");
}
document.getElementById("stations")!.addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest("li")?.dataset.c, m = c && markers.get(c);
  if (m) { map.setView(m.m.getLatLng(), 12); m.m.openPopup(); }
});
for (const [b, show] of [["tStations", "stations"], ["tLog", "log"]] as const) document.getElementById(b)!.onclick = () => {
  for (const [b2, s2] of [["tStations", "stations"], ["tLog", "log"]]) { document.getElementById(b2)!.setAttribute("aria-pressed", String(b2 === b)); document.getElementById(s2)!.hidden = s2 !== show; }
};

connect("aprs", {
  snapshot: (d: { stations: Station[]; log: Packet[] }) => { d.stations.forEach(upsert); log = d.log; renderLists(); },
  packet: (d: { packet: Packet; station: Station }) => {
    log.push(d.packet); if (log.length > 300) log.shift(); upsert(d.station); renderLists();
    dispatchEvent(new CustomEvent("blip:ping")); // every packet heard makes Blip's antenna flash
    if (d.packet.type === "weather" && d.station.wx?.tempF != null && Math.random() < 0.5)
      dispatchEvent(new CustomEvent("blip:say", { detail: { text: `${d.packet.from} says it's ${d.station.wx.tempF}°F out there.`, mood: "happy" } }));
  },
});
setInterval(renderLists, 30_000); // keep "x min ago" fresh
(window as any).blipContext = () => ({ page: "APRS map (packet radio on 144.39 MHz from our own modem)", stations: [...stations.values()].slice(-30).map((s) => ({ callsign: s.callsign, type: s.type, lat: s.lat, lon: s.lon, comment: s.comment, weather: s.wx, lastSeen: s.lastSeen })), lastPackets: log.slice(-10).map((p) => p.raw) });
(window as any).blipActions = {
  focus_station: { label: "found the station", description: "Center the APRS map on a station by callsign and open its details.", parameters: { callsign: { type: "string", description: "e.g. W2LRC or N0CALL-9" } },
    run: ({ callsign }: { callsign: string }) => { const m = markers.get(String(callsign ?? "").toUpperCase().trim()); if (m) { map.setView(m.m.getLatLng(), 12); m.m.openPopup(); const p = map.latLngToContainerPoint(m.m.getLatLng()), r = document.getElementById("map")!.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; } } },
};
