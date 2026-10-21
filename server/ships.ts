// Ships in New York Harbor, live from AIS (aisstream.io, key in .env as AISSTREAM_KEY). One WebSocket feeds a table of
// vessels inside a box around the harbor; it's opened on the first request and closed again after ten quiet minutes.
import { km } from "./sky.ts";

export type Ship = { mmsi: number; name: string; kind: string; type: number; lat: number; lon: number; kts: number | null; heading: number | null; cog: number | null; status: string; dest: string; callsign: string; length: number | null; seen: number };

const BOX = [[40.38, -74.35], [40.98, -73.55]]; // SW, NE corners: the harbor, the rivers, the Sound's west end
const IDLE_MS = 10 * 60_000, STALE_MS = 30 * 60_000;
// AIS ship-type codes (ITU-R M.1371), grouped
const KINDS: [number, number, string][] = [[30, 30, "fishing"], [31, 32, "tug"], [33, 33, "dredger"], [34, 34, "diving"], [35, 35, "military"], [36, 36, "sailing"], [37, 37, "pleasure craft"], [40, 49, "high-speed craft"],
  [50, 50, "pilot boat"], [51, 51, "search and rescue"], [52, 52, "tug"], [53, 53, "port tender"], [54, 54, "anti-pollution"], [55, 55, "law enforcement"], [58, 58, "medical"], [60, 69, "passenger"], [70, 79, "cargo"], [80, 89, "tanker"], [90, 99, "other"]];
const STATUS: Record<number, string> = { 0: "under way", 1: "at anchor", 2: "not under command", 3: "restricted manoeuvrability", 4: "constrained by draught", 5: "moored", 6: "aground", 7: "fishing", 8: "under way (sailing)", 14: "AIS-SART", 15: "" };
export const shipKind = (t: number) => KINDS.find(([a, b]) => t >= a && t <= b)?.[2] ?? (t ? "vessel" : "unknown");

const ships = new Map<number, Ship>();
let ws: WebSocket | null = null, lastAsked = 0, openedAt = 0, retryMs = 2_000;

function connect() {
  const key = process.env.AISSTREAM_KEY;
  if (!key || ws) return;
  const sock = new WebSocket("wss://stream.aisstream.io/v0/stream");
  sock.binaryType = "arraybuffer"; // aisstream sends binary frames
  ws = sock; openedAt = Date.now();
  sock.onopen = () => { retryMs = 2_000; sock.send(JSON.stringify({ APIKey: key, BoundingBoxes: [BOX], FilterMessageTypes: ["PositionReport", "ShipStaticData"] })); };
  sock.onmessage = (ev) => {
    try {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)), meta = m.MetaData ?? {}, mmsi = Number(meta.MMSI);
      if (!mmsi) return;
      const s = ships.get(mmsi) ?? { mmsi, name: "", kind: "unknown", type: 0, lat: meta.latitude, lon: meta.longitude, kts: null, heading: null, cog: null, status: "", dest: "", callsign: "", length: null, seen: 0 };
      s.name = String(meta.ShipName ?? s.name).trim() || s.name; s.seen = Date.now();
      if (m.MessageType === "PositionReport") {
        const r = m.Message.PositionReport;
        s.lat = +Number(r.Latitude ?? meta.latitude).toFixed(5); s.lon = +Number(r.Longitude ?? meta.longitude).toFixed(5);
        s.kts = r.Sog != null && r.Sog < 102.3 ? +r.Sog.toFixed(1) : null; s.cog = r.Cog != null && r.Cog < 360 ? +r.Cog.toFixed(0) : null;
        s.heading = r.TrueHeading != null && r.TrueHeading < 360 ? r.TrueHeading : null; s.status = STATUS[r.NavigationalStatus] ?? "";
      } else if (m.MessageType === "ShipStaticData") {
        const d = m.Message.ShipStaticData;
        s.type = d.Type ?? s.type; s.kind = shipKind(s.type); s.dest = String(d.Destination ?? "").replace(/[^A-Za-z0-9 .,'&/-]/g, " ").replace(/\s+/g, " ").trim(); if (s.dest.length < 3 || /^(NULL|UNKNOWN|N\/A)$/i.test(s.dest)) s.dest = ""; s.callsign = String(d.CallSign ?? "").trim();
        const dim = d.Dimension; s.length = dim ? (dim.A ?? 0) + (dim.B ?? 0) || null : s.length;
      }
      ships.set(mmsi, s);
    } catch {}
  };
  const gone = () => { if (ws === sock) ws = null; if (Date.now() - lastAsked < IDLE_MS) { setTimeout(connect, retryMs); retryMs = Math.min(60_000, retryMs * 2); } };
  sock.onclose = gone; sock.onerror = () => sock.close();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of ships) if (now - s.seen > STALE_MS) ships.delete(k);
  if (ws && now - lastAsked > IDLE_MS) { ws.close(); ws = null; ships.clear(); } // nobody's watching: hang up
}, 30_000);

/** Every vessel heard in the last 30 minutes, with how long ago; `warming` while the feed has just been opened. */
export function shipsNow() {
  lastAsked = Date.now();
  if (!process.env.AISSTREAM_KEY) return { ships: [] as Ship[], warming: false, off: true };
  connect();
  const now = Date.now();
  return { ships: [...ships.values()].map((s) => ({ ...s, agoS: Math.round((now - s.seen) / 1000) })).sort((a, b) => a.agoS - b.agoS), warming: ships.size < 5 && now - openedAt < 20_000, off: false };
}
/** The nearest ships to a point, with the distance. */
export function shipsNear(lat: number, lon: number, n = 15) {
  return shipsNow().ships.map((s) => ({ ...s, kmAway: +km({ lat, lon }, s).toFixed(1) })).sort((a, b) => a.kmAway - b.kmAway).slice(0, n);
}
