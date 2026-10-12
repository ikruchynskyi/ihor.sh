// The Meshtastic page: nodes our USB node has heard, on a map and in a list, and the channel chat, live from the server.
import "./ham/ham.css";
import { ago, esc, makeMap } from "./live-map.ts";
declare const L: any;

type Node = { num: number; id: string; long?: string; short?: string; role?: number; lat?: number; lon?: number; alt?: number; posAt?: number; snr?: number; rssi?: number; heard?: number; hops?: number; battery?: number; voltage?: number; chUtil?: number; airTx?: number; uptime?: number; viaMqtt?: boolean };
type Msg = { id: number; from: number; to: number; channel: number; text: string; at: number; snr?: number; rssi?: number; hops?: number; mine?: boolean };
type State = { connected: boolean; me: string | null; myNum: number; region: string; preset: string; channels: { index: number; name: string }[]; packets: number; nodes: Node[]; messages: Msg[]; owner: boolean; ports?: Record<string, number>; encryptedByChannelHash?: Record<string, number> };

const $ = (id: string) => document.getElementById(id)!;
const ROLES = ["client", "client (muted)", "router", "router + client", "repeater", "tracker", "sensor", "TAK", "client (hidden)", "lost and found", "TAK tracker", "router (late)"];
const map = makeMap("map", 11);
const nodes = new Map<number, Node>(), markers = new Map<number, any>(), links = L.layerGroup().addTo(map), traceLayer = L.layerGroup().addTo(map);
let S: State | null = null, tab = "0", fitted = false;

const name = (n?: Node) => (n ? n.long || n.short || n.id : "?");
const color = (n: Node) => (n.num === S?.myNum ? "#ff5c8a" : n.viaMqtt ? "#8f98a8" : n.hops === 0 ? "#5cff9d" : (n.hops ?? 9) <= 2 ? "#f4d35e" : "#4de1ff");
const km = (a: Node, b: Node) => { const r = Math.PI / 180, h = Math.sin(((b.lat! - a.lat!) * r) / 2) ** 2 + Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(((b.lon! - a.lon!) * r) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
function details(n: Node) {
  const me = S && nodes.get(S.myNum), far = me?.lat != null && n.lat != null && n !== me ? `${km(me, n).toFixed(1)} km away · ` : "";
  return [
    `${far}${n.hops === 0 ? "heard directly" : n.hops != null ? `${n.hops} hop${n.hops === 1 ? "" : "s"} away` : ""}${n.viaMqtt ? " (via the internet, MQTT)" : ""}`,
    [n.snr != null && `SNR ${n.snr.toFixed(1)} dB`, n.rssi != null && `RSSI ${n.rssi} dBm`].filter(Boolean).join(" · "),
    [n.battery != null && (n.battery > 100 ? "on external power" : `battery ${n.battery}%`), n.voltage && `${n.voltage.toFixed(2)} V`, n.chUtil != null && `channel ${n.chUtil.toFixed(0)}% busy`].filter(Boolean).join(" · "),
    [n.role != null && ROLES[n.role], n.alt != null && `${n.alt} m up`, n.heard && `last heard ${ago(n.heard)}`].filter(Boolean).join(" · "),
  ].filter(Boolean).join("<br>");
}
function upsert(n: Node) {
  nodes.set(n.num, n);
  if (n.lat == null) return;
  const icon = L.divIcon({ className: "", html: `<span class="badge" style="background:${color(n)}">${esc(n.short || n.id.slice(-4))}</span>`, iconSize: null, iconAnchor: [14, 9] });
  const popup = `<b>${esc(name(n))}</b> <span class="muted">${esc(n.id)}</span><br>${details(n)}${traceButton(n)}`;
  const m = markers.get(n.num);
  if (m) m.setLatLng([n.lat, n.lon]).setIcon(icon).setPopupContent(popup);
  else markers.set(n.num, L.marker([n.lat, n.lon], { icon, title: name(n) }).bindPopup(popup).addTo(map));
}
// Lines from our node to the ones it hears directly (no relay), labeled with the signal.
function drawLinks() {
  links.clearLayers();
  const me = S && nodes.get(S.myNum);
  if (me?.lat == null) return;
  for (const n of nodes.values()) if (n !== me && n.hops === 0 && n.lat != null && !n.viaMqtt)
    L.polyline([[me.lat, me.lon], [n.lat, n.lon]], { color: "#5cff9d", weight: 2, opacity: 0.6, dashArray: "4 6" }).bindTooltip(`${esc(name(n))}: SNR ${n.snr?.toFixed(1) ?? "?"} dB`).addTo(links);
}
/** Show a node: on the map if it has shared a position, else its entry in the node list. */
function focus(num: number) {
  const n = nodes.get(num), m = markers.get(num);
  if (n?.lat != null) { map.setView([n.lat, n.lon], Math.max(map.getZoom(), 13)); m?.openPopup(); return; }
  tab = "nodes"; renderTabs();
  const li = $("nodes").querySelector(`li[data-num="${num}"]`) as HTMLElement | null;
  li?.scrollIntoView({ block: "center" }); li?.classList.add("flash"); setTimeout(() => li?.classList.remove("flash"), 1600);
  if (!li) dispatchEvent(new CustomEvent("blip:say", { detail: { text: `${name(n)} hasn't been heard in the last 3 days.`, mood: "think" } }));
}

// ---------- traceroute (the owner's: it transmits) ----------
type Hop = { num: number; id: string; name?: string; snr?: number };
const traceButton = (n: Node) => (S?.owner && n.num !== S.myNum ? `<br><button type="button" data-trace="${n.num}" title="Ask the mesh which nodes carry a message to ${esc(name(n))} and back (transmits; one every 30 s)">📡 Traceroute</button>` : "");
async function startTrace(num: number) {
  $("trace").hidden = false; $("trace").innerHTML = `📡 Tracing the route to <b>${esc(name(nodes.get(num)))}</b>… (up to a minute)`;
  try { await post("/api/mesh/traceroute", { num }); }
  catch (e) { $("trace").textContent = `📡 ${(e as Error).message}`; }
}
const hopText = (h: Hop) => `<b data-num="${h.num}">${esc(h.name || h.id)}</b>${h.snr != null ? ` <span class="muted">${h.snr.toFixed(2)} dB</span>` : ""}`;
function showTrace(t: { to: number; error?: string; towards?: Hop[]; back?: Hop[] | null }) {
  traceLayer.clearLayers();
  const box = $("trace"); box.hidden = false;
  if (t.error) { box.innerHTML = `📡 ${esc(name(nodes.get(t.to)))}: ${esc(t.error)}`; return; }
  // each leg between nodes we know the position of, labeled with the SNR the receiving end heard it at
  const draw = (path: Hop[], color: string, dash?: string) => {
    for (let i = 1; i < path.length; i++) {
      const a = nodes.get(path[i - 1].num), b = nodes.get(path[i].num);
      if (a?.lat == null || b?.lat == null) continue;
      L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color, weight: 4, opacity: 0.85, dashArray: dash }).bindTooltip(`${esc(name(a))} → ${esc(name(b))}${path[i].snr != null ? `: SNR ${path[i].snr!.toFixed(2)} dB` : ""}`).addTo(traceLayer);
    }
  };
  draw(t.towards!, "#ffb347"); if (t.back) draw(t.back, "#c59bff", "6 6");
  const where = [...t.towards!, ...(t.back ?? [])].map((h) => nodes.get(h.num)).filter((n) => n?.lat != null).map((n) => [n!.lat, n!.lon]);
  if (where.length > 1) map.fitBounds(where, { padding: [40, 40], maxZoom: 14 });
  const missing = t.towards!.filter((h) => nodes.get(h.num)?.lat == null).length;
  box.innerHTML = `📡 <b>Route to ${esc(name(nodes.get(t.to)))}</b>, ${t.towards!.length - 2} hop${t.towards!.length === 3 ? "" : "s"} between:<br><span style="color:#ffb347">→</span> ${t.towards!.map(hopText).join(" → ")}` +
    (t.back ? `<br><span style="color:#c59bff">←</span> ${t.back.map(hopText).join(" → ")}` : "") +
    `<br><span class="muted">SNR: how far above the noise each node heard the one before. ${missing ? `${missing} node${missing > 1 ? "s" : ""} on the way ${missing > 1 ? "haven't" : "hasn't"} shared a position, so ${missing > 1 ? "their legs aren't" : "its legs aren't"} drawn.` : ""}</span> <button type="button" id="traceClear">Clear</button>`;
}

function renderInfo() {
  if (!S) return;
  $("live").textContent = S.connected ? "● LIVE" : "NODE OFFLINE"; $("live").className = S.connected ? "on" : "";
  $("info").textContent = `${S.me ?? "no node"}${S.region ? ` · ${S.region} ${S.preset}` : ""} · ${nodes.size} nodes · ${S.packets} packets since start`;
}
function renderTabs() {
  if (!S) return;
  const chans = S.channels.length ? S.channels : [{ index: 0, name: "Primary" }];
  const t = [...chans.map((c) => [String(c.index), `# ${c.name}`]), ...(S.owner ? [["dm", "✉ Direct"]] : []), ["nodes", `Nodes (${nodes.size})`]];
  $("tabs").innerHTML = t.map(([k, label]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${esc(label)}</button>`).join("");
  $("nodes").hidden = tab !== "nodes"; $("chat").hidden = tab === "nodes";
  ($("send") as HTMLFormElement).hidden = !S.owner || tab === "nodes" || tab === "dm";
}
function renderChat() {
  if (!S) return;
  const list = S.messages.filter((m) => (tab === "dm" ? m.to !== 0xffffffff : m.to === 0xffffffff && String(m.channel) === tab));
  const box = $("chat"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = list.length ? list.map((m) => {
    const n = nodes.get(m.from);
    return `<li class="${m.mine ? "mine" : ""} ${m.to !== 0xffffffff ? "dm" : ""}"><b data-num="${m.from}">${esc(name(n))}</b> <span class="muted">${new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${m.hops != null && !m.mine ? ` · ${m.hops} hop${m.hops === 1 ? "" : "s"}` : ""}${m.snr ? ` · SNR ${m.snr.toFixed(1)}` : ""}</span><div class="t">${esc(m.text)}</div></li>`;
  }).join("") : "";
  // Nothing from anyone else yet: say what the node does hear, so a quiet chat doesn't look broken.
  if (tab !== "dm" && !list.some((m) => !m.mine)) box.innerHTML += `<li class="muted">${quietNote()}</li>`;
  if (atBottom) box.scrollTop = box.scrollHeight;
}
function quietNote() {
  const p = S!.ports ?? {}, heard = Object.values(p).reduce((a, v) => a + v, 0), text = p["1"] ?? 0;
  const hour = S!.nodes.filter((n) => n.num !== S!.myNum && n.snr != null && Date.now() - (n.heard ?? 0) < 3600e3).map((n) => n.snr!).sort((a, b) => a - b);
  const snr = hour.length ? hour[hour.length >> 1] : null;
  if (!heard) return "No messages yet on this channel. They show up here the moment the node hears one.";
  const kinds = [["3", "positions"], ["4", "node infos"], ["67", "telemetry"]].filter(([k]) => p[k]).map(([k, w]) => `${p[k]} ${w}`).join(", ");
  return `No chat heard yet. The node has decoded ${heard} packets on this channel (${kinds}${text ? `, ${text} text` : ""}); people chat far less often than radios report their position and battery.` +
    (snr != null && snr < -12 ? ` It also hears the mesh weakly: a median SNR of ${snr.toFixed(1)} dB, close to LongFast's limit of about −17.5 dB, so it catches only part of the traffic (an antenna by a window helps most).` : "");
}
function renderNodes() {
  const list = [...nodes.values()].sort((a, b) => (b.heard ?? 0) - (a.heard ?? 0));
  $("nodes").innerHTML = list.map((n) => `<li data-num="${n.num}"><span class="badge" style="background:${color(n)}">${esc(n.short || n.id.slice(-4))}</span> <b>${esc(name(n))}</b>${n.lat == null ? ' <span class="muted">(no position)</span>' : ""}<br><span class="muted">${details(n)}</span>${traceButton(n)}</li>`).join("");
}
function renderAll() { renderInfo(); renderTabs(); renderChat(); renderNodes(); drawLinks(); }

$("tabs").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (b) { tab = b.dataset.tab!; renderTabs(); renderChat(); } });
document.addEventListener("click", (e) => { // traceroute buttons live in popups and the node list
  const t = (e.target as HTMLElement).closest("[data-trace]") as HTMLElement | null;
  if (t) { e.stopPropagation(); startTrace(+t.dataset.trace!); return; }
  if ((e.target as HTMLElement).id === "traceClear") { traceLayer.clearLayers(); $("trace").hidden = true; }
}, true);
$("nodes").addEventListener("click", (e) => { const li = (e.target as HTMLElement).closest("li"); if (li?.dataset.num) focus(+li.dataset.num); });
$("chat").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("[data-num]") as HTMLElement | null; if (b) focus(+b.dataset.num!); });
$("trace").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("[data-num]") as HTMLElement | null; if (b) focus(+b.dataset.num!); });

// ---------- live ----------
let es: EventSource;
function listen() {
  es?.close();
  es = new EventSource("/api/mesh/events");
  es.addEventListener("state", (e) => {
    S = JSON.parse((e as MessageEvent).data);
    nodes.clear(); S!.nodes.forEach(upsert); renderAll();
    if (!fitted && markers.size) { map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.15), { maxZoom: 13 }); fitted = true; }
  });
  es.addEventListener("node", (e) => { const n = JSON.parse((e as MessageEvent).data); upsert(n); renderInfo(); renderNodes(); drawLinks(); });
  es.addEventListener("message", (e) => {
    const m: Msg = JSON.parse((e as MessageEvent).data);
    if (!S || S.messages.some((x) => x.id === m.id && x.from === m.from)) return;
    S.messages.push(m); renderChat();
    if (!m.mine) dispatchEvent(new CustomEvent("blip:say", { detail: { text: `${name(nodes.get(m.from))} on the mesh: ${m.text.slice(0, 80)}`, mood: "happy", hop: 4 } }));
  });
  es.addEventListener("traceroute", (e) => showTrace(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("ready", () => fetch("/api/mesh/state").then((r) => r.json()).then((d) => { S = d; renderAll(); }).catch(() => {}));
  es.onerror = () => { $("live").textContent = "RECONNECTING…"; $("live").className = ""; };
}
listen();

// ---------- owner ----------
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`); return d; });
$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await post("/api/mesh/owner", { key: ($("key") as HTMLInputElement).value.trim() }); ($("key") as HTMLInputElement).value = ""; $("ownerMsg").textContent = "Signed in."; listen(); }
  catch (err) { $("ownerMsg").textContent = (err as Error).message; }
});
$("logout").onclick = async () => { await post("/api/mesh/owner", { key: "logout" }).catch(() => {}); listen(); };
const ownerUI = () => { ($("login") as HTMLElement).hidden = !!S?.owner; $("logout").hidden = !S?.owner; };
// (the owner's traceroute buttons appear with the next state, which re-renders the popups and the list)
setInterval(ownerUI, 1000);
$("send").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("msg") as HTMLInputElement, text = input.value.trim();
  if (!text) return;
  try { await post("/api/mesh/send", { text, channel: Number(tab) || 0 }); input.value = ""; }
  catch (err) { dispatchEvent(new CustomEvent("blip:say", { detail: { text: (err as Error).message, mood: "think" } })); }
});

(window as any).blipContext = () => ({
  page: "Meshtastic mesh map and chat (LoRa, heard by our node on USB)", node: S?.me, region: S && `${S.region} ${S.preset}`, connected: S?.connected,
  nodes: [...nodes.values()].slice(0, 30).map((n) => ({ name: name(n), id: n.id, hops: n.hops, snr: n.snr, battery: n.battery, heard: n.heard && ago(n.heard) })),
  recentChat: S?.messages.filter((m) => m.to === 0xffffffff).slice(-10).map((m) => `${name(nodes.get(m.from))}: ${m.text}`),
});
