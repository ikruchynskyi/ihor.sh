// The Meshtastic page: nodes our USB node has heard, on a map and in a list, and the channel chat, live from the server.
import "./ham/ham.css";
import { ago, esc, makeMap } from "./live-map.ts";
declare const L: any;

type Node = {
  num: number; id: string; long?: string; short?: string; hw?: number; hwModel?: string; role?: number;
  lat?: number; lon?: number; alt?: number; posAt?: number; snr?: number; rssi?: number; heard?: number;
  hops?: number; battery?: number; voltage?: number; chUtil?: number; airTx?: number; uptime?: number;
  viaMqtt?: boolean; packets?: number;
  temp?: number; humidity?: number; pressure?: number; gasRes?: number; iaq?: number; lux?: number;
  windSpeed?: number; windDir?: number; pm25?: number; co2?: number;
  neighbors?: { num: number; id: string; snr?: number }[];
};
type Msg = { id: number; from: number; to: number; channel: number; text: string; at: number; snr?: number; rssi?: number; hops?: number; mine?: boolean };
type State = {
  tracing?: { to: number; since: number } | null;
  connected: boolean; me: string | null; myNum: number; region: string; preset: string;
  channels: { index: number; name: string }[]; packets: number; lastPacket?: number;
  nodes: Node[]; messages: Msg[]; owner: boolean;
  ports?: Record<string, number>; encryptedByChannelHash?: Record<string, number>;
  logs?: string[];
};

const $ = (id: string) => document.getElementById(id)!;
const ROLES = ["client", "client (muted)", "router", "router + client", "repeater", "tracker", "sensor", "TAK", "client (hidden)", "lost and found", "TAK tracker", "router (late)", "router"];
const map = makeMap("map", 11);
const nodes = new Map<number, Node>(), markers = new Map<number, any>(), links = L.layerGroup().addTo(map), traceLayer = L.layerGroup().addTo(map);
let S: State | null = null, tab = "0", fitted = false;
let sortBy = "heard"; try { sortBy = localStorage.getItem("mesh:sort") || "heard"; } catch {}
let searchFilter = "";
let activePill = "all";
let selectedDm: number | null = null;

const name = (n?: Node) => (n ? n.long || n.short || n.id : "?");
const color = (n: Node) => (n.num === S?.myNum ? "#ff5c8a" : n.viaMqtt ? "#8f98a8" : n.hops === 0 ? "#5cff9d" : (n.hops ?? 9) <= 2 ? "#f4d35e" : "#4de1ff");
const km = (a: Node, b: Node) => { const r = Math.PI / 180, h = Math.sin(((b.lat! - a.lat!) * r) / 2) ** 2 + Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(((b.lon! - a.lon!) * r) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const sigClass = (snr?: number) => (snr == null ? "" : snr >= 0 ? "sig-good" : snr >= -10 ? "sig-fair" : "sig-weak");
const formatUptime = (s?: number) => {
  if (s == null) return "";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function details(n: Node) {
  const me = S && nodes.get(S.myNum), far = me?.lat != null && n.lat != null && n !== me ? `${km(me, n).toFixed(1)} km away · ` : "";
  const hw = n.hwModel || (n.hw != null ? `Model ${n.hw}` : "");
  const sig = n.snr != null ? `<span class="${sigClass(n.snr)}">SNR ${n.snr.toFixed(1)} dB</span>` : "";
  const rssi = n.rssi != null ? `RSSI ${n.rssi} dBm` : "";
  const pkts = n.packets != null && n.packets > 1 ? `${n.packets} pkts` : "";
  const sigLine = [sig, rssi, pkts].filter(Boolean).join(" · ");

  const pwr = [
    n.battery != null && (n.battery > 100 ? "⚡ external power" : `🔋 ${n.battery}%`),
    n.voltage != null && `${n.voltage.toFixed(2)} V`,
    n.chUtil != null && `channel ${n.chUtil.toFixed(0)}% busy`,
    n.airTx != null && n.airTx > 0 && `airtime ${n.airTx.toFixed(1)}%`,
  ].filter(Boolean).join(" · ");

  const env = [
    n.temp != null && `🌡️ ${n.temp.toFixed(1)}°C (${(n.temp * 1.8 + 32).toFixed(1)}°F)`,
    n.humidity != null && `💧 ${n.humidity.toFixed(0)}%`,
    n.pressure != null && `🧭 ${n.pressure.toFixed(1)} hPa`,
    n.iaq != null && `🍃 IAQ ${n.iaq}`,
    n.lux != null && `☀️ ${n.lux.toFixed(0)} lx`,
    n.co2 != null && `💨 CO₂ ${n.co2.toFixed(0)} ppm`,
    n.pm25 != null && `🌫️ PM2.5 ${n.pm25}`,
  ].filter(Boolean).join(" · ");

  const roleText = n.role != null ? (ROLES[n.role] || (n.role === 12 ? "router" : undefined)) : undefined;
  const meta = [
    hw && `<span class="hw-badge">${esc(hw)}</span>`,
    roleText,
    n.alt != null && `${n.alt} m up`,
    n.uptime != null && `up ${formatUptime(n.uptime)}`,
    n.heard && `heard ${ago(n.heard)}`,
  ].filter(Boolean).join(" · ");

  const nbr = n.neighbors?.length ? `<span class="muted">👥 ${n.neighbors.length} direct neighbor${n.neighbors.length === 1 ? "" : "s"}</span>` : "";

  return [
    `${far}${n.hops === 0 ? "heard directly" : n.hops != null ? `${n.hops} hop${n.hops === 1 ? "" : "s"} away` : ""}${n.viaMqtt ? " (via MQTT)" : ""}`,
    sigLine,
    pwr,
    env,
    meta,
    nbr,
  ].filter(Boolean).join("<br>");
}

function upsert(n: Node) {
  nodes.set(n.num, n);
  if (n.lat == null) return;
  const icon = L.divIcon({ className: "", html: `<span class="badge" style="background:${color(n)}">${esc(n.short || n.id.slice(-4))}</span>`, iconSize: null, iconAnchor: [14, 9] });
  const popup = `<b>${esc(name(n))}</b> <span class="muted">${esc(n.id)}</span>${n.hwModel ? ` <span class="hw-badge">${esc(n.hwModel)}</span>` : ""}<br>${details(n)}<div class="node-actions">${traceButton(n)}${dmButton(n)}</div>`;
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

function openDM(num: number) {
  tab = "dm";
  selectedDm = num;
  renderTabs();
  renderChat();
  ($("msg") as HTMLInputElement)?.focus();
}

// ---------- traceroute (the owner's: it transmits) ----------
type Hop = { num: number; id: string; name?: string; snr?: number };
const traceButton = (n: Node) => (S?.owner && n.num !== S.myNum ? `<button type="button" data-trace="${n.num}" ${tracing ? "disabled" : ""} title="Ask the mesh which nodes carry a message to ${esc(name(n))} and back (transmits; one every 30 s)">${tracing?.to === n.num ? "📡 Tracing…" : "📡 Trace"}</button>` : "");
const dmButton = (n: Node) => (S?.owner && n.num !== S.myNum ? `<button type="button" data-dm="${n.num}" title="Send a direct message to ${esc(name(n))}">✉ DM</button>` : "");

let tracing: { to: number; since: number } | null = null, traceTick: ReturnType<typeof setInterval> | undefined, pulse: any = null;
function setTracing(t: { to: number; since: number } | null) {
  tracing = t; clearInterval(traceTick); pulse?.remove(); pulse = null;
  document.querySelectorAll<HTMLButtonElement>("[data-trace]").forEach((b) => { b.disabled = !!t; b.textContent = t && +b.dataset.trace! === t.to ? "📡 Tracing…" : "📡 Trace"; });
  if (!t) return;
  const n = nodes.get(t.to);
  if (n?.lat != null) pulse = L.circleMarker([n.lat, n.lon], { radius: 18, color: "#ffb347", weight: 3, fill: false, className: "tracing-ring" }).addTo(map);
  const box = $("trace"), show = () => { const s = Math.round((Date.now() - t.since) / 1000); box.innerHTML = `<span class="spin" aria-hidden="true"></span> 📡 Tracing route to <b data-num="${t.to}">${esc(name(n))}</b>… ${s} s <span class="muted">(timeout 60 s)</span>`; };
  box.hidden = false; show(); traceTick = setInterval(show, 1000);
}
async function startTrace(num: number) {
  setTracing({ to: num, since: Date.now() });
  try { await post("/api/mesh/traceroute", { num }); }
  catch (e) { setTracing(null); $("trace").hidden = false; $("trace").textContent = `📡 ${(e as Error).message}`; }
}
const hopText = (h: Hop) => `<b data-num="${h.num}">${esc(h.name || h.id)}</b>${h.snr != null ? ` <span class="muted">${h.snr.toFixed(2)} dB</span>` : ""}`;
function showTrace(t: { to: number; error?: string; towards?: Hop[]; back?: Hop[] | null }) {
  setTracing(null);
  traceLayer.clearLayers();
  const box = $("trace"); box.hidden = false;
  if (t.error) { box.innerHTML = `📡 ${esc(name(nodes.get(t.to)))}: ${esc(t.error)}`; return; }
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
    `<br><span class="muted">SNR: signal above noise for each hop. ${missing ? `${missing} relay node${missing > 1 ? "s" : ""} on the path ${missing > 1 ? "have" : "has"} no GPS coordinates.` : ""}</span> <button type="button" id="traceClear">Clear</button>`;
}

function renderInfo() {
  if (!S) return;
  $("live").textContent = S.connected ? "● LIVE" : "NODE OFFLINE"; $("live").className = S.connected ? "on" : "";
  $("info").textContent = `${S.me ?? "no node"}${S.region ? ` · ${S.region} ${S.preset}` : ""} · ${nodes.size} nodes · ${S.packets} packets`;
}

function renderTraffic() {
  if (!S) return;
  const p = S.ports ?? {}, enc = S.encryptedByChannelHash ?? {};
  const encTotal = Object.values(enc).reduce((a, b) => a + b, 0);
  const stats = [
    { label: "Decoded", count: S.packets },
    { label: "Text", count: p["1"] ?? 0 },
    { label: "Position", count: p["3"] ?? 0 },
    { label: "Node Info", count: p["4"] ?? 0 },
    { label: "Telemetry", count: p["67"] ?? 0 },
    { label: "Encrypted", count: encTotal },
  ];
  const box = $("trafficStats");
  if (box) {
    box.innerHTML = stats.map((s) => `<div class="stat-card"><b>${s.count}</b><span>${esc(s.label)}</span></div>`).join("");
  }
}

function renderDmTargetSelect() {
  const sel = $("dmTarget") as HTMLSelectElement;
  if (!sel) return;
  const list = [...nodes.values()].filter((n) => n.num !== S?.myNum).sort((a, b) => name(a).localeCompare(name(b)));
  const cur = selectedDm ? String(selectedDm) : "";
  sel.innerHTML = `<option value="">Select recipient…</option>` +
    list.map((n) => `<option value="${n.num}" ${String(n.num) === cur ? "selected" : ""}>${esc(name(n))} (${esc(n.id)})${n.hwModel ? ` · ${esc(n.hwModel)}` : ""}</option>`).join("");
}

function renderTabs() {
  if (!S) return;
  const chans = S.channels.length ? S.channels : [{ index: 0, name: "Primary" }];
  const t = [...chans.map((c) => [String(c.index), `# ${c.name}`]), ...(S.owner ? [["dm", "✉ Direct"]] : []), ["nodes", `Nodes (${nodes.size})`]];
  $("tabs").innerHTML = t.map(([k, label]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${esc(label)}</button>`).join("");
  $("nodes").hidden = tab !== "nodes";
  $("nodeFilters").hidden = tab !== "nodes";
  $("chat").hidden = tab === "nodes";

  const isDm = tab === "dm";
  $("dmBar").hidden = !isDm || !S.owner;
  if (isDm && S.owner) renderDmTargetSelect();

  const canSend = S.owner && tab !== "nodes" && (!isDm || !!selectedDm);
  ($("send") as HTMLFormElement).hidden = !canSend;
  if (canSend) {
    const input = $("msg") as HTMLInputElement;
    input.placeholder = isDm && selectedDm ? `Direct message to ${name(nodes.get(selectedDm))}…` : "Message everyone on this channel…";
  }
}

function renderChat() {
  if (!S) return;
  const isDm = tab === "dm";
  let list = S.messages;
  if (isDm) {
    list = selectedDm
      ? S.messages.filter((m) => (m.to === selectedDm && m.from === S!.myNum) || (m.from === selectedDm && (m.to === S!.myNum || m.to !== 0xffffffff)))
      : S.messages.filter((m) => m.to !== 0xffffffff);
  } else {
    list = S.messages.filter((m) => m.to === 0xffffffff && String(m.channel) === tab);
  }
  const box = $("chat"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = list.length ? list.map((m) => {
    const n = nodes.get(m.from);
    return `<li class="${m.mine ? "mine" : ""} ${m.to !== 0xffffffff ? "dm" : ""}"><b data-num="${m.from}">${esc(name(n))}</b> <span class="muted">${new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${m.hops != null && !m.mine ? ` · ${m.hops} hop${m.hops === 1 ? "" : "s"}` : ""}${m.snr ? ` · SNR ${m.snr.toFixed(1)}` : ""}</span><div class="t">${esc(m.text)}</div></li>`;
  }).join("") : "";

  if (!isDm && !list.some((m) => !m.mine)) {
    box.innerHTML += `<li class="muted">${quietNote()}</li>`;
  } else if (isDm && !list.length) {
    box.innerHTML = `<li class="muted">${selectedDm ? `No direct messages exchanged with ${esc(name(nodes.get(selectedDm)))} yet.` : "Select a node above to view or send direct messages."}</li>`;
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function quietNote() {
  const p = S!.ports ?? {}, heard = Object.values(p).reduce((a, v) => a + v, 0), text = p["1"] ?? 0;
  const hour = S!.nodes.filter((n) => n.num !== S!.myNum && n.snr != null && Date.now() - (n.heard ?? 0) < 3600e3).map((n) => n.snr!).sort((a, b) => a - b);
  const snr = hour.length ? hour[hour.length >> 1] : null;
  if (!heard) return "No messages yet on this channel. They show up here the moment the node hears one.";
  const kinds = [["3", "positions"], ["4", "node infos"], ["67", "telemetry"]].filter(([k]) => p[k]).map(([k, w]) => `${p[k]} ${w}`).join(", ");
  return `No chat heard yet. Decoded ${heard} packets on this channel (${kinds}${text ? `, ${text} text` : ""}); radios broadcast telemetry and positions regularly.` +
    (snr != null && snr < -12 ? ` Weak mesh reception: median SNR ${snr.toFixed(1)} dB (near LongFast's −17.5 dB limit). An external antenna helps.` : "");
}

function getFilteredNodes(): Node[] {
  const hopsVal = (n: Node) => (n.num === S?.myNum ? -1 : n.viaMqtt ? 98 : n.hops ?? 99);
  const byHeard = (a: Node, b: Node) => (b.heard ?? 0) - (a.heard ?? 0);
  const byHops = (a: Node, b: Node) => hopsVal(a) - hopsVal(b) || byHeard(a, b);
  const bySnr = (a: Node, b: Node) => ((b.snr ?? -99) - (a.snr ?? -99)) || byHeard(a, b);
  const byName = (a: Node, b: Node) => name(a).localeCompare(name(b));

  let list = [...nodes.values()];
  if (activePill === "direct") list = list.filter((n) => n.hops === 0 && !n.viaMqtt && n.num !== S?.myNum);
  else if (activePill === "map") list = list.filter((n) => n.lat != null && n.lon != null);
  else if (activePill === "sensors") list = list.filter((n) => n.temp != null || n.humidity != null || n.pressure != null || n.iaq != null || n.battery != null);

  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    list = list.filter((n) => name(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || (n.short && n.short.toLowerCase().includes(q)) || (n.hwModel && n.hwModel.toLowerCase().includes(q)));
  }

  if (sortBy === "hops") list.sort(byHops);
  else if (sortBy === "snr") list.sort(bySnr);
  else if (sortBy === "name") list.sort(byName);
  else list.sort(byHeard);

  return list;
}

function renderNodes() {
  const list = getFilteredNodes();
  const allCount = nodes.size;
  const directCount = [...nodes.values()].filter((n) => n.hops === 0 && !n.viaMqtt && n.num !== S?.myNum).length;
  const mapCount = [...nodes.values()].filter((n) => n.lat != null && n.lon != null).length;
  const sensorCount = [...nodes.values()].filter((n) => n.temp != null || n.humidity != null || n.pressure != null || n.iaq != null || n.battery != null).length;

  $("countAll").textContent = String(allCount);
  $("countDirect").textContent = String(directCount);
  $("countMap").textContent = String(mapCount);
  $("countSensors").textContent = String(sensorCount);
  $("nodeCountText").textContent = list.length === allCount ? `${allCount} nodes heard` : `Showing ${list.length} of ${allCount} nodes`;

  $("nodes").innerHTML = list.map((n) => {
    return `<li data-num="${n.num}">
      <span class="badge" style="background:${color(n)}">${esc(n.short || n.id.slice(-4))}</span>
      <b>${esc(name(n))}</b>
      ${n.hwModel ? ` <span class="hw-badge">${esc(n.hwModel)}</span>` : ""}
      ${n.lat == null ? ' <span class="muted">(no position)</span>' : ""}
      <br><span class="muted">${details(n)}</span>
      <div class="node-actions">${traceButton(n)}${dmButton(n)}</div>
    </li>`;
  }).join("");
}

function renderLogs() {
  if (!S?.owner) return;
  const logs = S.logs ?? [];
  const logEl = $("serialLogs"), countEl = $("logCount");
  if (logEl) {
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    logEl.textContent = logs.length ? logs.join("\n") : "(no serial logs recorded yet)";
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }
  if (countEl) countEl.textContent = String(logs.length);
}

function renderAll() {
  renderInfo();
  renderTraffic();
  renderTabs();
  renderChat();
  renderNodes();
  renderLogs();
  drawLinks();
}

function applyState(st: State) {
  S = st;
  nodes.clear();
  markers.forEach((m) => m.remove());
  markers.clear();
  links.clearLayers();
  traceLayer.clearLayers();
  S.nodes.forEach(upsert);
  renderAll();
  if (S.tracing && !tracing) setTracing(S.tracing);
  if (!fitted && markers.size) {
    try { map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.15), { maxZoom: 13 }); } catch {}
    fitted = true;
  }
}

// ---------- UI event wiring ----------
$("tabs").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) { tab = b.dataset.tab!; renderTabs(); renderChat(); }
});

document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest("[data-trace]") as HTMLElement | null;
  if (t) { e.stopPropagation(); startTrace(+t.dataset.trace!); return; }
  const dm = (e.target as HTMLElement).closest("[data-dm]") as HTMLElement | null;
  if (dm) { e.stopPropagation(); openDM(+dm.dataset.dm!); return; }
  if ((e.target as HTMLElement).id === "traceClear") { traceLayer.clearLayers(); $("trace").hidden = true; }
}, true);

($("sort") as HTMLSelectElement).value = sortBy;
$("sort").addEventListener("change", () => {
  sortBy = ($("sort") as HTMLSelectElement).value;
  try { localStorage.setItem("mesh:sort", sortBy); } catch {}
  renderNodes();
});

$("nodeSearch").addEventListener("input", (e) => {
  searchFilter = (e.target as HTMLInputElement).value.trim();
  renderNodes();
});

$("filterPills").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".pill") as HTMLElement | null;
  if (!btn?.dataset.filter) return;
  activePill = btn.dataset.filter;
  document.querySelectorAll("#filterPills .pill").forEach((p) => p.classList.toggle("active", p === btn));
  renderNodes();
});

$("dmTarget").addEventListener("change", () => {
  const val = ($("dmTarget") as HTMLSelectElement).value;
  selectedDm = val ? Number(val) : null;
  renderTabs();
  renderChat();
});

$("nodes").addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest("li");
  if (li?.dataset.num && !(e.target as HTMLElement).closest("button")) focus(+li.dataset.num);
});
$("chat").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-num]") as HTMLElement | null;
  if (b) focus(+b.dataset.num!);
});
$("trace").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-num]") as HTMLElement | null;
  if (b) focus(+b.dataset.num!);
});

// ---------- live stream ----------
let es: EventSource;
function listen() {
  es?.close();
  es = new EventSource("/api/mesh/events");
  es.addEventListener("state", (e) => applyState(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("node", (e) => {
    const n = JSON.parse((e as MessageEvent).data);
    upsert(n);
    renderInfo();
    renderNodes();
    renderTraffic();
    drawLinks();
  });
  es.addEventListener("message", (e) => {
    const m: Msg = JSON.parse((e as MessageEvent).data);
    if (!S || S.messages.some((x) => x.id === m.id && x.from === m.from)) return;
    S.messages.push(m); renderChat();
    if (!m.mine) dispatchEvent(new CustomEvent("blip:say", { detail: { text: `${name(nodes.get(m.from))} on the mesh: ${m.text.slice(0, 80)}`, mood: "happy", hop: 4 } }));
  });
  es.addEventListener("traceroute", (e) => showTrace(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("ready", () => fetch("/api/mesh/state").then((r) => r.json()).then(applyState).catch(() => {}));
  es.onerror = () => { $("live").textContent = "RECONNECTING…"; $("live").className = ""; };
}
listen();

// ---------- owner actions ----------
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`); return d; });

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await post("/api/mesh/owner", { key: ($("key") as HTMLInputElement).value.trim() });
    ($("key") as HTMLInputElement).value = "";
    $("ownerMsg").textContent = "Signed in as node owner.";
    listen();
  } catch (err) { $("ownerMsg").textContent = (err as Error).message; }
});

$("logout").onclick = async () => {
  await post("/api/mesh/owner", { key: "logout" }).catch(() => {});
  listen();
};

$("clearNodesBtn").addEventListener("click", async () => {
  const count = nodes.size;
  if (!confirm(`Clear all ${count} nodes from the list?\n\nThis removes heard nodes from the server database and resets the connected radio's local NodeDB.`)) return;
  const btn = $("clearNodesBtn") as HTMLButtonElement;
  btn.disabled = true;
  $("ownerMsg").textContent = "Clearing node database…";
  try {
    const res = await post("/api/mesh/clear-nodes", { keepSelf: true });
    $("ownerMsg").textContent = `Cleared ${res.cleared ?? 0} node(s).${res.hardwareReset ? " Radio NodeDB reset over serial." : ""}`;
    const st = await fetch("/api/mesh/state").then((r) => r.json());
    applyState(st);
  } catch (err) {
    $("ownerMsg").textContent = `Clear failed: ${(err as Error).message}`;
  } finally {
    btn.disabled = false;
  }
});

const ownerUI = () => {
  ($("login") as HTMLElement).hidden = !!S?.owner;
  ($("ownerControls") as HTMLElement).hidden = !S?.owner;
};
setInterval(ownerUI, 1000);

$("send").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("msg") as HTMLInputElement, text = input.value.trim();
  if (!text) return;
  const isDm = tab === "dm";
  const to = isDm ? selectedDm : undefined;
  if (isDm && !to) return;
  try {
    await post("/api/mesh/send", { text, channel: isDm ? 0 : (Number(tab) || 0), to });
    input.value = "";
  } catch (err) {
    dispatchEvent(new CustomEvent("blip:say", { detail: { text: (err as Error).message, mood: "think" } }));
  }
});

(window as any).blipContext = () => ({
  page: "Meshtastic mesh map and chat (LoRa, heard by our node on USB)", node: S?.me, region: S && `${S.region} ${S.preset}`, connected: S?.connected,
  nodes: [...nodes.values()].slice(0, 30).map((n) => ({ name: name(n), id: n.id, hw: n.hwModel, hops: n.hops, snr: n.snr, battery: n.battery, temp: n.temp, heard: n.heard && ago(n.heard) })),
  recentChat: S?.messages.filter((m) => m.to === 0xffffffff).slice(-10).map((m) => `${name(nodes.get(m.from))}: ${m.text}`),
});
