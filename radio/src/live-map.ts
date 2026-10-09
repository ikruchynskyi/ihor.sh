// Shared parts of the live receiver maps (APRS, ADS-B): Leaflet map, the server's event stream,
// and the "turn the receiver on" panel when the dongle is doing something else.
declare const L: any;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const ago = (t: number | string) => { const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000); return s < 90 ? `${Math.round(s)} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
export const HOME = { lat: 40.73, lon: -73.95 };

export function makeMap(id: string, zoom = 9) {
  const map = L.map(id).setView([HOME.lat, HOME.lon], zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  L.circleMarker([HOME.lat, HOME.lon], { radius: 5, color: "#ff5c8a", fillOpacity: 1 }).bindTooltip("The receiver (approximate)").addTo(map);
  return map;
}

/** Connects to /api/<name>/events; shows the offline panel (with a turn-on button) whenever the receiver isn't on. */
export function connect(name: "aprs" | "adsb", handlers: Record<string, (data: any) => void>) {
  const panel = document.getElementById("offline")!, status = document.getElementById("live")!, btn = document.getElementById("turnOn") as HTMLButtonElement, msg = document.getElementById("offMsg")!;
  const off = document.getElementById("turnOff") as HTMLButtonElement;
  const online = (on: boolean) => { panel.hidden = on; off.hidden = !on; status.textContent = on ? "● LIVE" : "OFF AIR"; status.className = on ? "on" : ""; };
  off.onclick = async () => {
    off.disabled = true;
    const r = await fetch("/api/receiver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "off" }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : { error: "The radio server is offline." };
    off.disabled = false;
    if (!r?.ok) dispatchEvent(new CustomEvent("blip:say", { detail: { text: d.error ?? "Couldn't turn it off.", mood: "think" } }));
  };
  const es = new EventSource(`/api/${name}/events`);
  // Tell the server we're still here, and that we left: otherwise a closed tab could keep counting as a viewer.
  let viewerId = "";
  es.addEventListener("hello", (e: MessageEvent) => { viewerId = JSON.parse(e.data).id; });
  setInterval(() => { if (viewerId) fetch(`/api/viewer?id=${viewerId}&action=alive`, { method: "POST" }).catch(() => {}); }, 30_000);
  addEventListener("pagehide", () => { if (viewerId) navigator.sendBeacon(`/api/viewer?id=${viewerId}&action=leave`); es.close(); });
  es.addEventListener("online", () => online(true));
  es.addEventListener("offline", (e: MessageEvent) => {
    online(false);
    const why = JSON.parse(e.data || "{}");
    msg.textContent = why.reason === "spectrum" ? "Paused: someone is listening in Spectrum Lab. This map comes back on its own when they're done." : "";
  });
  for (const [ev, fn] of Object.entries(handlers)) es.addEventListener(ev, (e: MessageEvent) => fn(JSON.parse(e.data)));
  es.onerror = () => { status.textContent = "RECONNECTING…"; status.className = ""; };
  btn.onclick = async () => {
    btn.disabled = true; msg.textContent = "Tuning the dongle…";
    const r = await fetch("/api/receiver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: name }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : { error: "The radio server is offline." };
    btn.disabled = false;
    msg.textContent = r?.ok ? "" : d.error ?? "Couldn't start it.";
    if (r?.ok) dispatchEvent(new CustomEvent("blip:say", { detail: { text: name === "adsb" ? "Radar on! Planes show up as they call in." : "Listening on 144.39! Packets every few minutes.", mood: "happy", hop: 6 } }));
  };
}
