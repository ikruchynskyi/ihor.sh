// Callsign lookup + repeater map: FCC records via the server (callook.info) and HearHam's repeater directory.
import "./ham/ham.css";
import { esc, makeMap } from "./live-map.ts";
declare const L: any;

interface Repeater {
  id: number;
  callsign: string;
  lat: number;
  lon: number;
  city: string;
  mode: string;
  outputMHz: number;
  offsetMHz: number;
  inputMHz: number;
  toneUp: string;
  toneDown: string;
  network: string;
  node: string;
  description: string;
  operational: boolean;
  restriction: string;
  band: string;
}

const BANDS: Record<string, string> = {
  "10m": "#ff5c8a",
  "6m": "#ff9f1c",
  "2m": "#5cff9d",
  "1.25m": "#c59bff",
  "70cm": "#4de1ff",
  "33cm": "#ffd166",
  "23cm": "#f4a3c0",
  other: "#9aa3cf",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// Initialize Map
const map = makeMap("map", 10);
const layer = L.layerGroup().addTo(map);
const licLayer = L.layerGroup().addTo(map);
const canvas = L.canvas({ padding: 0.3 });

let all: Repeater[] = [];
const on = new Set(["2m", "70cm", "1.25m", "6m"]);
let shown: (Repeater & { km: number })[] = [];
let lastLicense: any = null;
const picked = new Map<number, Repeater>();
const scannable = (r: Repeater) => r.mode === "FM" && r.outputMHz >= 24 && r.outputMHz <= 1766;

// Layer Visibility States
let repeatersVisible = true;
let satFocusActive = false;
let heardVisible = true;

// Dock Tabs Management
const dockTabs = $("dockTabs");
const dock = $("cockpitDock");
let currentTab = "repeaters";

function switchTab(tabName: string) {
  currentTab = tabName;
  dockTabs.querySelectorAll(".dock-tab").forEach((b) => {
    const el = b as HTMLElement;
    el.classList.toggle("active", el.dataset.tab === tabName);
  });
  document.querySelectorAll(".dock-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  });
  if (dock.classList.contains("collapsed")) {
    dock.classList.remove("collapsed");
  }
  if (tabName === "transcribe") {
    $("transcribeBadge").hidden = true;
  }
}

dockTabs.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".dock-tab") as HTMLElement | null;
  if (btn?.dataset.tab) switchTab(btn.dataset.tab);
});

// Mobile Bottom Sheet Handle
$("sheetHandle").addEventListener("click", () => {
  dock.classList.toggle("collapsed");
});

// Floating Map Toolbar & Chips Sync
function updateChipsUI() {
  const rChip = $("toggleRepeatersChip");
  if (rChip) {
    rChip.setAttribute("aria-pressed", String(repeatersVisible));
    rChip.classList.toggle("active-layer", repeatersVisible);
    rChip.innerHTML = `<span>${repeatersVisible ? "✓ 📻 Repeaters" : "✕ 📻 Repeaters"}</span>`;
  }

  const sChip = $("toggleSatChip");
  if (sChip) {
    sChip.setAttribute("aria-pressed", String(satFocusActive));
    sChip.classList.toggle("active-sat", satFocusActive);
    sChip.innerHTML = `<span>${satFocusActive ? "✓ 🛰️ Sat Mode" : "🛰️ Sat Focus"}</span>`;
  }

  const hChip = $("toggleHeardChip");
  if (hChip) {
    hChip.setAttribute("aria-pressed", String(heardVisible));
    hChip.classList.toggle("active-layer", heardVisible);
    const n = log?.heard?.length ?? 0;
    hChip.innerHTML = `<span>${heardVisible ? `✓ 📍 Heard Pins (${n})` : `✕ 📍 Heard Pins (${n})`}</span>`;
  }
}

// Band Filter Buttons & Presets
function renderBandFilters() {
  $("bands").innerHTML = Object.entries(BANDS).map(([b, c]) => {
    const isActive = on.has(b);
    return `
      <button type="button" class="band-chip ${isActive ? "active" : ""}" data-b="${b}" style="--band-c:${c};" aria-pressed="${isActive}" title="Toggle ${b} repeaters (${isActive ? "Active" : "Hidden"})">
        <span class="band-toggle-icon">${isActive ? "✓" : "+"}</span>
        <span class="swatch" style="background:${c}"></span>
        <span>${b}</span>
      </button>
    `;
  }).join("");
}
renderBandFilters();

$("bands").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-b]") as HTMLElement | null;
  if (!btn) return;
  const b = btn.dataset.b!;
  if (on.has(b)) {
    on.delete(b);
  } else {
    on.add(b);
  }
  if (!repeatersVisible) {
    repeatersVisible = true;
    updateChipsUI();
  }
  renderBandFilters();
  render();
});

$("bandPresets")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-preset]") as HTMLElement | null;
  if (!btn) return;
  const p = btn.dataset.preset;
  on.clear();
  if (p === "all") {
    Object.keys(BANDS).forEach((b) => on.add(b));
  } else if (p === "dual") {
    on.add("2m");
    on.add("70cm");
  } else if (p === "2m") {
    on.add("2m");
  } else if (p === "70cm") {
    on.add("70cm");
  }
  if (!repeatersVisible) {
    repeatersVisible = true;
    updateChipsUI();
  }
  renderBandFilters();
  render();
});

$("mode").onchange = render;
$("opOnly").onchange = render;

// Floating Map Toolbar Actions
$("toggleRepeatersChip").onclick = () => {
  repeatersVisible = !repeatersVisible;
  updateChipsUI();
  render();
};

$("toggleSatChip").onclick = () => {
  satFocusActive = !satFocusActive;
  repeatersVisible = !satFocusActive;
  updateChipsUI();
  if (satFocusActive) {
    switchTab("sats");
  }
  render();
};

$("toggleHeardChip").onclick = () => {
  heardVisible = !heardVisible;
  updateChipsUI();
  if (heardVisible) {
    for (const h of log.heard) pinHeard(h);
  } else {
    heardLayer.clearLayers();
  }
};

$("gpsMeChip").onclick = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 11);
      loadArea();
      loadSats();
    });
  }
};

// Repeaters data loading for current map view
let loadTimer: ReturnType<typeof setTimeout> | undefined;
let total = 0;

async function loadArea() {
  const b = map.getBounds();
  const d = await fetch(
    `/api/radio/repeaters?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v: number) => v.toFixed(3)).join(",")}`
  ).then((r) => r.json()).catch(() => null);
  if (!d) return;
  all = d.repeaters;
  total = d.total;
  render();
}

map.on("moveend", () => {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(loadArea, 250);
});

const fmtOff = (o: number) => (o > 0 ? `+${o}` : `${o}`);

function popup(r: Repeater) {
  return `<b>${esc(r.callsign)}</b> <span class="muted">${esc(r.city)}</span><br>
    <span class="freq">${r.outputMHz.toFixed(4)} MHz</span> · offset ${fmtOff(r.offsetMHz)} MHz (input ${r.inputMHz.toFixed(4)})<br>
    ${r.toneUp ? `Tone ${esc(r.toneUp)} Hz` : "No tone"} · ${esc(r.mode)}${r.network ? ` · ${esc(r.network)}${r.node ? ` node ${esc(r.node)}` : ""}` : ""}${r.operational ? "" : " · <b>not operational</b>"}<br>
    ${r.description ? `<span class="muted">${esc(r.description).replace(/\n/g, "<br>")}</span><br>` : ""}
    ${heardHere(r)}
    <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
      <a class="btn-chip" href="#" data-call="${esc(r.callsign)}">Look up ${esc(r.callsign)}</a>
      ${scannable(r) ? `<a class="btn-chip btn-primary" href="#" data-monitor="${r.outputMHz}|${esc(r.callsign)} ${esc(r.city)}">🎧 Listen &amp; Transcribe</a>` : ""}
    </div>`;
}

const US_CALL = /^(A[A-L]|[KNW])[A-Z]?\d[A-Z]{1,3}$/;

function heardHere(r: Repeater) {
  const other = log.heard.filter((h) => h.mhz && Math.abs(h.mhz - r.outputMHz) < 0.003 && h.call !== r.callsign);
  return other.length ? `<span class="muted">Heard here: ${other.map((h) => `<b class="call-pill" data-heardcall="${esc(h.call)}">${esc(h.call)}</b>`).join(" ")}</span><br>` : "";
}

const marks = new Map<number, any>();
let pendingRpt: number | null = null;

function render() {
  const openId = pendingRpt ?? [...marks].find(([, m]) => m.isPopupOpen())?.[0];
  layer.clearLayers();
  marks.clear();

  if (repeatersVisible) {
    const hit = (r: Repeater) => log.hits[r.outputMHz];
    for (const r of [...all].sort((a, b) => Number(!!hit(a)) - Number(!!hit(b)))) {
      if (!on.has(r.band) || ($<HTMLInputElement>("opOnly").checked && !r.operational) || ($<HTMLSelectElement>("mode").value && !r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value))) continue;
      const h = hit(r), p = picked.has(r.id);
      marks.set(
        r.id,
        L.circleMarker([r.lat, r.lon], {
          renderer: canvas,
          radius: h ? 11 : p ? 8 : 6,
          color: h || p ? "#fff" : BANDS[r.band],
          fillColor: BANDS[r.band],
          fillOpacity: h ? 1 : 0.85,
          weight: h ? 4 : p ? 2 : 1
        })
          .bindPopup(() => popup(r), { maxWidth: 320 })
          .bindTooltip(`${r.callsign} ${r.outputMHz}${h ? ` · busy at ${tfmt(h)}` : ""}`)
          .addTo(layer)
      );
    }
  }

  if (openId != null && marks.has(openId)) {
    pendingRpt = null;
    marks.get(openId).openPopup();
  }
  renderList();
}

function renderList() {
  const c = map.getCenter();
  shown = all
    .filter((r) => on.has(r.band) && (!$<HTMLInputElement>("opOnly").checked || r.operational) && (!$<HTMLSelectElement>("mode").value || r.mode.toUpperCase().includes($<HTMLSelectElement>("mode").value)))
    .map((r) => ({ ...r, km: Math.hypot((r.lat - c.lat) * 111, (r.lon - c.lng) * 84) }))
    .sort((a, b) => a.km - b.km);

  $("count").textContent = `(${shown.length}${total > all.length ? ` of ${total} near` : ""})`;

  $("list").innerHTML = shown.slice(0, 60).map((r, i) => {
    const isBusy = !!log.hits[r.outputMHz];
    return `
      <li data-i="${i}" class="${isBusy ? "busy" : ""}">
        <div class="rpt-left">
          ${scannable(r) ? `<input type="checkbox" data-pick="${i}" ${picked.has(r.id) ? "checked" : ""} aria-label="Pick ${esc(r.callsign)}">` : ""}
          <span class="swatch" style="background:${BANDS[r.band]}"></span>
          <div>
            <div style="display:flex; align-items:baseline; gap:6px;">
              <span class="rpt-call">${esc(r.callsign)}</span>
              <span class="rpt-freq">${r.outputMHz.toFixed(3)}</span>
            </div>
            <div class="rpt-meta">${esc(r.city)} · ${r.km.toFixed(1)} km · ${esc(r.mode)}${r.toneUp ? ` · ${esc(r.toneUp)} Hz` : ""}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          ${isBusy ? `<span class="telem-pill active" title="Busy at ${tfmt(log.hits[r.outputMHz])}">📶 Busy</span>` : ""}
          ${scannable(r) ? `<button type="button" class="btn-chip" data-tune="${r.outputMHz}|${esc(r.callsign)} ${esc(r.city)}">🎧</button>` : ""}
        </div>
      </li>
    `;
  }).join("");

  scanWhat();
}

$("list").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const tuneBtn = target.closest("[data-tune]") as HTMLElement | null;
  if (tuneBtn) {
    const [f, label] = tuneBtn.dataset.tune!.split("|");
    monitor({ mhz: Number(f), label }, `${Number(f).toFixed(3)} MHz`);
    return;
  }
  const pick = target.closest("input[data-pick]") as HTMLInputElement | null;
  if (pick) {
    const r = shown[Number(pick.dataset.pick)];
    pick.checked ? picked.set(r.id, r) : picked.delete(r.id);
    render();
    return;
  }
  const li = target.closest("li") as HTMLElement | null;
  if (li && li.dataset.i != null) {
    const r = shown[Number(li.dataset.i)];
    if (r) {
      map.setView([r.lat, r.lon], 13);
      L.popup().setLatLng([r.lat, r.lon]).setContent(popup(r)).openOn(map);
    }
  }
});

// Global Callsign Lookup HUD
async function lookup(call: string, flyToMap = false) {
  call = call.toUpperCase().trim();
  if (!call) return;

  $<HTMLInputElement>("call").value = call;
  const hud = $("callHud");
  const hudContent = $("hudContent");
  const hudActions = $("hudActions");
  $("hudCall").textContent = call;
  hudContent.innerHTML = '<span class="muted">Looking up FCC license…</span>';
  hudActions.innerHTML = "";
  hud.hidden = false;

  history.replaceState(null, "", `?call=${encodeURIComponent(call)}`);

  const d = await fetch(`/api/radio/callsign?call=${encodeURIComponent(call)}`)
    .then((r) => r.json())
    .catch(() => ({ found: false, note: "Lookup service unavailable." }));

  lastLicense = d;
  licLayer.clearLayers();

  if (!d.found) {
    hudContent.textContent = d.note ?? "No active US license found for this callsign.";
    return;
  }

  const near = d.lat
    ? await fetch(`/api/radio/repeaters?bbox=${d.lat - 1},${d.lon - 1.3},${d.lat + 1},${d.lon + 1.3}`)
        .then((r) => r.json())
        .catch(() => null)
    : null;
  const rpts = (near?.repeaters ?? all).filter((r: Repeater) => r.callsign.toUpperCase() === d.callsign);

  hudContent.innerHTML = `
    <b>${esc(d.name)}</b> · <span class="telem-pill active">${esc(d.type === "CLUB" ? "Club Station" : d.licenseClass || d.type || "Licensed")}</span><br>
    ${d.trustee ? `Trustee: <b>${esc(d.trustee)}</b><br>` : ""}
    Grid: <b>${esc(d.grid || "—")}</b> · Expires: ${esc(d.expires || "—")}<br>
    <span class="muted">${esc(d.address || "")}</span><br>
    ${rpts.length ? `<span class="good">Runs ${rpts.length} repeater${rpts.length > 1 ? "s" : ""} on this map.</span><br>` : ""}
  `;

  hudActions.innerHTML = `
    ${d.lat ? `<button type="button" class="btn-chip btn-primary" id="hudFlyBtn">📍 Show on Map</button>` : ""}
    <a class="btn-chip" href="${esc(d.uls)}" target="_blank" rel="noopener">FCC ULS</a>
    <a class="btn-chip" href="https://aprs.fi/#!call=${encodeURIComponent(d.callsign)}" target="_blank" rel="noopener">aprs.fi</a>
  `;

  if (d.lat) {
    const icon = L.divIcon({
      className: "",
      html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 0 2px #000)">📻</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker([d.lat, d.lon], { icon })
      .bindPopup(`<b>${esc(d.callsign)}</b><br>${esc(d.name)}<br><span class="muted">${esc(d.address)} · ${esc(d.grid)}</span>`)
      .addTo(licLayer);

    if (flyToMap) {
      map.setView([d.lat, d.lon], 11);
    }

    const flyBtn = $("hudFlyBtn");
    if (flyBtn) {
      flyBtn.onclick = () => {
        map.setView([d.lat, d.lon], 11);
      };
    }
  }
}

$("hudClose").onclick = () => {
  $("callHud").hidden = true;
};

$("callForm").addEventListener("submit", (e) => {
  e.preventDefault();
  lookup($<HTMLInputElement>("call").value, false);
});

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const callLink = target.closest("a[data-call]") as HTMLElement | null;
  const heardPill = target.closest("[data-heardcall]") as HTMLElement | null;
  const monitorLink = target.closest("a[data-monitor]") as HTMLElement | null;

  if (callLink) {
    e.preventDefault();
    lookup(callLink.dataset.call!, false);
  } else if (heardPill) {
    lookup(heardPill.dataset.heardcall!, false);
  } else if (monitorLink) {
    e.preventDefault();
    const [f, label] = monitorLink.dataset.monitor!.split("|");
    monitor({ mhz: Number(f), label }, `${Number(f).toFixed(3)} MHz`);
    map.closePopup();
  }
});

// ---------- Monitoring & Live Whisper Transcription ----------
const heardLayer = L.layerGroup().addTo(map);
const heardPins = new Map<string, any>();
let mon: any = null;
let es: EventSource | null = null;

const tfmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function pinHeard(h: any) {
  if (!h.lat || !h.lon || !heardVisible) return;
  const icon = L.divIcon({
    className: "",
    html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 0 3px #000)">📻</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
  const popupHtml = `<b>${esc(h.call)}</b> ${esc(h.name ?? "")}<br>
    <span class="muted">${esc(h.cls ?? "")} · ${esc(h.grid ?? "")}</span><br>
    Heard ${tfmt(h.at)} on ${h.mhz.toFixed(3)} MHz${h.times > 1 ? ` (${h.times}×)` : ""}<br>
    <span class="muted">“${esc(h.text)}”</span><br>
    <button class="btn-chip" data-call="${esc(h.call)}" style="margin-top:6px;">Look up</button>`;
  
  const old = heardPins.get(h.call);
  if (old) {
    old.setLatLng([h.lat, h.lon]).setPopupContent(popupHtml);
  } else {
    heardPins.set(h.call, L.marker([h.lat, h.lon], { icon, zIndexOffset: 500 }).bindPopup(popupHtml, { maxWidth: 320 }).addTo(heardLayer));
  }
}

let log: { captions: any[]; heard: any[]; hits: Record<string, string> } = { captions: [], heard: [], hits: {} };
try {
  log = JSON.parse(sessionStorage.getItem("rpt:log") || "") ?? log;
} catch {}
log.hits ??= {};
const saveLog = () => {
  try {
    sessionStorage.setItem("rpt:log", JSON.stringify(log));
  } catch {}
};

function addCaption(c: any, mhz: number, label: string) {
  if (log.captions.some((x) => x.at === c.at && x.text === c.text)) return;
  log.captions = [...log.captions, c].slice(-250);
  for (const x of c.calls ?? []) {
    if (x.found) {
      const old = log.heard.find((y) => y.call === x.call);
      log.heard = [
        ...log.heard.filter((y) => y.call !== x.call),
        { ...x, at: c.at, mhz, label, text: c.text.slice(0, 160), times: (old?.times ?? 0) + 1 }
      ];
    }
  }
  if (currentTab !== "transcribe") {
    $("transcribeBadge").hidden = false;
  }
}

function renderStatus() {
  const live = mon && mon.on && !mon.error;
  const sc = live && mon.scan;
  const sqLed = $("sqLed");
  sqLed.className = `sq-led ${mon?.open ? "open" : ""}`;

  if (live) {
    $("monMhzDisplay").textContent = `${mon.mhz.toFixed(3)} MHz`;
    const txQueue = mon.transcribing > 1 ? ` · ✍ Transcribing (${mon.transcribing} queued)` : mon.transcribing ? " · ✍ Transcribing" : "";
    $("monLabelDisplay").textContent = `${sc ? `📡 Scanning (${sc.i + 1}/${sc.list.length})` : mon.label || "Tuned"} · ${mon.open ? `Signal (${mon.snr ?? 0} dB)` : "Quiet"}${txQueue}`;
    $("telemMon").textContent = `🎧 ${mon.mhz.toFixed(3)} MHz (${mon.open ? "RX" : "Quiet"})`;
    $("telemMon").classList.add("active");
  } else {
    $("monMhzDisplay").textContent = "Idle";
    $("monLabelDisplay").textContent = "Select repeater or frequency to tune";
    $("telemMon").textContent = "🎧 SDR: Idle";
    $("telemMon").classList.remove("active");
  }

  $("monStop").hidden = !live;
  $("monStop").textContent = sc ? "Stop Scan" : "Stop";
}

function renderMon() {
  if (!mon) return;
  const live = mon.on && !mon.error;
  renderStatus();

  const audio = $<HTMLAudioElement>("monAudio");
  if (live && (audio.hidden || !audio.src)) {
    audio.hidden = false;
    audio.src = `/api/radio/monitor/audio?t=${Date.now()}`;
    audio.play().catch(() => {});
  }
  if (!live && !audio.hidden) {
    audio.hidden = true;
    audio.removeAttribute("src");
    audio.load();
  }

  $("capSum").textContent = `(${log.heard.length} stations)`;
  const caps = $("captions");
  const atEnd = caps.scrollHeight - caps.scrollTop - caps.clientHeight < 40;

  caps.innerHTML = log.captions.length
    ? log.captions.slice(-60).map((c: any) => {
        const calls = (c.calls || []).map((x: any) => `<span class="call-pill" data-heardcall="${esc(x.call)}">${esc(x.call)}</span>`).join(" ");
        return `
          <div class="cap-row">
            <span class="cap-time">${tfmt(c.at)}</span>
            ${c.mhz ? `<span class="cap-freq">${c.mhz.toFixed(3)}</span>` : ""}
            <span>${esc(c.text)}</span>
            ${calls ? ` <span style="margin-left:4px;">${calls}</span>` : ""}
          </div>
        `;
      }).join("")
    : `<p class="rpt-meta" style="padding:14px; text-align:center;">Transcripts will appear here in real time as stations transmit.</p>`;

  if (atEnd) caps.scrollTop = caps.scrollHeight;

  $("heard").innerHTML = log.heard.length
    ? log.heard.slice(-30).reverse().map((h: any) => `
        <li class="heard-chip" data-heardcall="${esc(h.call)}">
          <b>${esc(h.call)}</b> <span class="muted">${tfmt(h.at)}</span>
        </li>
      `).join("")
    : `<li class="rpt-meta">No callsigns heard yet.</li>`;

  if (heardVisible) {
    for (const h of log.heard) pinHeard(h);
  }
  updateChipsUI();
}

// Copy Transcript to clipboard
$("copyTranscriptBtn").onclick = () => {
  const text = log.captions.map((c) => {
    const calls = (c.calls || []).map((x: any) => `[${x.call}]`).join(" ");
    return `[${tfmt(c.at)}] (${c.mhz ? c.mhz.toFixed(3) : "—"} MHz) ${calls ? calls + " " : ""}${c.text}`;
  }).join("\n");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    $("copyTranscriptBtn").textContent = "✓ Copied";
    setTimeout(() => ($("copyTranscriptBtn").textContent = "📋 Copy"), 2000);
  }
};

$("capClear").onclick = () => {
  log = { captions: [], heard: [], hits: {} };
  saveLog();
  heardLayer.clearLayers();
  heardPins.clear();
  updateChipsUI();
  renderMon();
  render();
};

function watchMon() {
  es?.close();
  es = new EventSource("/api/radio/monitor/events");
  es.addEventListener("state", (m) => {
    const d = JSON.parse((m as MessageEvent).data);
    mon = { ...mon, ...d };
    if (d.on) {
      for (const c of d.captions ?? []) addCaption(c, c.mhz ?? d.mhz, c.label ?? d.label);
      const n = Object.keys(log.hits).length;
      Object.assign(log.hits, d.scan?.hits);
      saveLog();
      if (Object.keys(log.hits).length !== n) render();
    }
    renderMon();
  });
  es.addEventListener("squelch", (m) => {
    if (mon) {
      const d = JSON.parse((m as MessageEvent).data);
      mon.open = d.open;
      mon.snr = d.snr;
      renderStatus();
    }
  });
  es.addEventListener("caption", (m) => {
    const c = JSON.parse((m as MessageEvent).data);
    if (!mon) return;
    addCaption(c, c.mhz ?? mon.mhz, c.label ?? mon.label);
    saveLog();
    renderMon();
  });
  es.addEventListener("scan", (m) => {
    const d = JSON.parse((m as MessageEvent).data);
    if (!mon?.scan) return;
    mon.scan.i = d.i;
    mon.scan.round = d.round;
    mon.mhz = d.mhz;
    mon.label = d.label;
    mon.open = false;
    renderStatus();
  });
  es.addEventListener("hit", (m) => {
    const d = JSON.parse((m as MessageEvent).data);
    if (!mon?.scan) return;
    mon.scan.hits[d.mhz] = log.hits[d.mhz] = d.at;
    saveLog();
    render();
    renderStatus();
  });
}

async function monitor(body: object, what: string) {
  $("monLabelDisplay").textContent = `Tuning to ${what}…`;
  const audio = $<HTMLAudioElement>("monAudio");
  audio.hidden = false;
  audio.src = `/api/radio/monitor/audio?t=${Date.now()}`;
  audio.play().catch(() => {});

  const d = await fetch("/api/radio/monitor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then((r) => r.json()).catch((e) => ({ error: e.message }));

  if (d.error) {
    $("monLabelDisplay").textContent = `⚠ ${d.error}`;
    return;
  }
  mon = { ...mon, ...d };
  renderMon();
}

$("monForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = Number($<HTMLInputElement>("monMhz").value);
  if (f) monitor({ mhz: f, mode: $<HTMLSelectElement>("monMode").value }, `${f.toFixed(3)} MHz`);
});

$("monStop").onclick = () => {
  fetch("/api/radio/monitor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stop: true })
  }).catch(() => {});
};

// Scanner List Management
const scanList = () => (picked.size ? [...picked.values()] : shown.filter(scannable)).slice(0, 150);

function scanWhat() {
  const n = scanList().length;
  const isPicked = picked.size > 0;
  $("scanBtn").textContent = isPicked ? `📡 Scan Ticked (${n})` : `📡 Scan Visible (${n})`;
  $("scanWhat").textContent = isPicked ? `${n} selected` : `All ${n} visible FM`;
  $("unpick").style.display = isPicked ? "inline-block" : "none";
  $<HTMLButtonElement>("scanBtn").disabled = n < 1;
}

$("scanBtn").onclick = () => {
  const list = scanList();
  monitor(
    { scan: list.map((r) => ({ mhz: r.outputMHz, label: `${r.callsign} ${r.city}` })) },
    `${list.length} repeaters`
  );
};

$("unpick").onclick = () => {
  picked.clear();
  render();
};

watchMon();

// ---------- Space Weather (Propagation) ----------
let wx: any = null;

async function loadWx() {
  wx = await fetch("/api/radio/propagation").then((r) => r.json()).catch(() => null);
  if (!wx || wx.error) {
    $("wxBody").textContent = "Space weather data unavailable.";
    return;
  }
  const g = (x: string) => `<span class="${x}">${x}</span>`;
  const sc = (o: any) => (o ? `${o.level}` : "?");
  
  $("wxSum").textContent = `SFI ${wx.sfi ?? "?"} · K ${wx.k ? wx.k.kp.toFixed(1) : "?"}`;
  $("telemWx").textContent = `☀️ SFI ${wx.sfi ?? "?"} · K ${wx.k ? wx.k.kp.toFixed(1) : "?"}`;

  $("wxBody").innerHTML = `
    <p style="margin:4px 0 8px; font-weight:600;">${esc(wx.summary)}</p>
    <table class="bands">
      <tr><th>Band</th><th>Day</th><th>Night</th></tr>
      ${wx.bands.map((b: any) => `<tr title="${esc(b.why)}"><td>${esc(b.band)}</td><td>${g(b.day)}</td><td>${g(b.night)}</td></tr>`).join("")}
    </table>
    <div style="font-size:0.82rem; margin:8px 0; line-height:1.6;">
      Solar flux: <b>${wx.sfi ?? "?"}</b> · Sunspots: <b>${wx.ssn ?? "?"}</b> · K: <b>${wx.k?.kp ?? "?"}</b><br>
      ${wx.solarWind ? `Solar wind: <b>${wx.solarWind.kmPerS} km/s</b> (Bz ${wx.solarWind.bz})<br>` : ""}
      VHF: Aurora ${esc(wx.vhf.aurora)} · Sporadic-E ${esc(wx.vhf.sporadicE)}
    </div>
    <div class="kbars" title="K index past 2 days">${wx.kHistory.map(([t, k]: [string, number]) => `<i style="height:${Math.max(2, k * 4)}px" title="${t}: K ${k}"></i>`).join("")}</div>
  `;
}
loadWx();
setInterval(loadWx, 10 * 60_000);

// ---------- Amateur Satellites ----------
const satLayer = L.layerGroup().addTo(map);
const horizonLayer = L.layerGroup().addTo(map);
let sats: any = null;
let satShown: string | null = null;
let satTimer: ReturnType<typeof setInterval> | undefined;
let satMarker: any = null;
let satHome = map.getCenter();

const at = () => `lat=${satHome.lat.toFixed(2)}&lon=${satHome.lng.toFixed(2)}`;
const reachKm = (h: number, el: number) => {
  const R = 6371, e = (el * Math.PI) / 180;
  return R * (Math.acos((R * Math.cos(e)) / (R + h)) - e);
};

/** The picture / recording page for a satellite, with its settings and the place passes are computed for. */
const picUrl = (page: string) => {
  const c = map.getCenter();
  return `../${page}&lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`;
};

async function loadSats() {
  const c = (satHome = map.getCenter());
  sats = await fetch(`/api/radio/sats?lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}&hours=24`)
    .then((r) => r.json())
    .catch(() => null);

  if (!sats || sats.error) {
    $("satBody").textContent = "Satellite passes unavailable.";
    return;
  }

  const next = sats.passes.slice(0, 14);
  const local = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (next.length) {
    const sName = next[0].name.split(" ")[0];
    $("telemSat").textContent = `🛰️ ${sName} ${local(next[0].riseIso)}`;
  }

  $("satBody").innerHTML = next.map((p: any) => {
    const isHigh = p.maxElevation >= 30;
    const diffMin = Math.round((new Date(p.riseIso).getTime() - Date.now()) / 60000);
    const countdown = p.upNow ? "LIVE NOW" : diffMin > 60 ? `in ${Math.round(diffMin / 60)}h` : `in ${diffMin}m`;
    const isMeteor = p.sat?.startsWith("meteor");
    const isSstv = p.sat === "iss" || p.sat === "sonate-2";
    const recLabel = isMeteor ? "🛰️ Record Pass & Decode (Meteor)" : isSstv ? "📷 Receive SSTV Pictures" : "🎙️ Record / Decode Pictures";

    return `
      <div class="sat-pass-card ${satShown === p.sat ? "active-sat" : ""}" data-sat="${esc(p.sat)}">
        <div class="sat-pass-head">
          <span class="sat-name">${esc(p.name)}</span>
          <span class="sat-el-badge ${isHigh ? "high" : ""}">${p.maxElevation}° max</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="sat-countdown ${p.upNow ? "live" : ""}">${countdown} · ${p.minutes} min pass</span>
          <span class="sat-freqs">↓ ${esc(p.down)}</span>
        </div>
        ${p.up ? `<div class="sat-freqs" style="margin-top:2px;">↑ ${esc(p.up)}</div>` : ""}
        ${p.pictures ? `
          <div style="margin-top:8px;">
            <a href="${picUrl(p.pictures)}" class="sat-rec-btn" target="_blank" rel="noopener" onclick="event.stopPropagation()">
              ${recLabel} →
            </a>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  $("satBody").querySelectorAll("[data-sat]").forEach((el) => {
    (el as HTMLElement).onclick = () => {
      showSat((el as HTMLElement).dataset.sat!);
      // Auto-focus satellite on map and hide repeaters to make orbit crystal clear
      satFocusActive = true;
      repeatersVisible = false;
      updateChipsUI();
      render();
    };
  });

  $("satHere").onclick = loadSats;
  $("satMe").onclick = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 9);
        loadSats();
      });
    }
  };
}

async function showSat(id: string) {
  satShown = id;
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&${at()}`)
    .then((r) => r.json())
    .catch(() => null);

  if (!t || t.error) return;
  satLayer.clearLayers();
  horizonLayer.clearLayers();

  const h = t.now[2];
  L.circle(satHome, {
    radius: reachKm(h, 0) * 1000,
    color: "#fff",
    weight: 2,
    opacity: 0.85,
    dashArray: "3 7",
    fill: false
  }).bindTooltip(`Horizon for ${esc(t.sat.name)} (0° elevation)`).addTo(horizonLayer);

  L.circle(satHome, {
    radius: reachKm(h, 20) * 1000,
    color: "#10b981",
    weight: 2,
    opacity: 0.8,
    dashArray: "3 7",
    fill: true,
    fillOpacity: 0.08
  }).bindTooltip("20° Elevation (Clean signal)").addTo(horizonLayer);

  L.circleMarker(satHome, { radius: 5, color: "#000", weight: 1.5, fillColor: "#fff", fillOpacity: 1 })
    .bindTooltip("You").addTo(horizonLayer);

  const segs: number[][][] = [[]];
  for (const [la, lo] of t.track) {
    const seg = segs.at(-1)!;
    if (seg.length && Math.abs(lo - seg.at(-1)![1]) > 180) segs.push([]);
    segs.at(-1)!.push([la, lo]);
  }

  for (const seg of segs) {
    if (seg.length > 1) {
      L.polyline(seg, { color: "#000", weight: 6, opacity: 0.5 }).addTo(satLayer);
      L.polyline(seg, { color: "#ffd23f", weight: 3, opacity: 1 }).addTo(satLayer);
    }
  }

  const icon = L.divIcon({
    className: "",
    html: `<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 0 4px #000)">🛰</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  satMarker = L.marker([t.now[0], t.now[1]], { icon })
    .bindPopup(satPopup(t), { autoPan: false })
    .addTo(satLayer)
    .openPopup();

  map.setView([t.now[0], t.now[1]], 2);
  clearInterval(satTimer);
  satTimer = setInterval(() => {
    if (satShown === id) showSatQuiet(id);
  }, 5_000);
}

/** The satellite marker's popup: rebuilt on every refresh, so altitude and elevation stay current while it's open. */
function satPopup(t: any) {
  const v = t.view;
  return `<b>${esc(t.sat.name)}</b> <span class="muted">${esc(t.sat.kind)}</span><br>
       ${t.now[2]} km altitude · ${v?.aboveHorizon ? `<b class="good">Above horizon: ${v.elevation}° (${v.direction})</b>` : "Below horizon"}<br>
       ↓ ${esc(t.sat.down)}${t.sat.up ? `<br>↑ ${esc(t.sat.up)}` : ""}
       ${t.sat.pictures ? `<br><a class="sat-rec-btn" href="${picUrl(t.sat.pictures)}" target="_blank" rel="noopener" style="margin-top:8px;">🎙️ Open Satellite Recorder & Decoder →</a>` : ""}`;
}

async function showSatQuiet(id: string) {
  const t = await fetch(`/api/radio/sat-track?id=${encodeURIComponent(id)}&${at()}`).then((r) => r.json()).catch(() => null);
  if (!t || t.error || satShown !== id || !satMarker) return;
  satMarker.setLatLng([t.now[0], t.now[1]]).setPopupContent(satPopup(t));
}

loadSats();

// Boot Query Parameters
const params = new URLSearchParams(location.search);
const q = params.get("call");
const [rptId, rptAt = ""] = (params.get("rpt") ?? "").split("@");
const [rLat, rLon] = rptAt.split(",").map(Number);

if (Number.isFinite(rLat) && Number.isFinite(rLon) && rptAt) {
  map.setView([rLat, rLon], 13);
} else if (q) {
  await lookup(q, true);
}

if (rptId) pendingRpt = Number(rptId);
await loadArea();

if (params.get("sat")) {
  await showSat(params.get("sat")!);
}

// Blip pair-programmer integration
(window as any).blipActions = {
  lookup_callsign: {
    label: "looked up callsign",
    description: "Look up a US callsign and display licensee details.",
    parameters: { callsign: { type: "string" } },
    run: ({ callsign }: { callsign: string }) => lookup(String(callsign ?? ""), true)
  },
  filter_repeaters: {
    label: "filtered repeaters",
    description: "Filter repeaters by bands (2m, 70cm, etc.) or mode.",
    parameters: { bands: { type: "string" }, mode: { type: "string" } },
    run: ({ bands, mode }: { bands?: string; mode?: string }) => {
      if (bands) {
        on.clear();
        String(bands).split(/[ ,]+/).forEach((b) => BANDS[b] && on.add(b));
        renderBandFilters();
      }
      if (mode !== undefined) $<HTMLSelectElement>("mode").value = String(mode).toUpperCase();
      render();
    }
  }
};

(window as any).blipContext = () => ({
  page: "Callsigns & Repeaters Cockpit",
  lastLookup: lastLicense,
  bandsShown: [...on],
  mode: $<HTMLSelectElement>("mode").value || "all",
  scanning: mon?.on && mon.scan ? { channels: mon.scan.list.length, hits: mon.scan.hits } : undefined,
  monitoring: mon?.on ? { mhz: mon.mhz, label: mon.label, open: mon.open } : "idle",
  heardStations: log.heard.slice(-10).map((h: any) => `${h.call} (${h.mhz} MHz)`),
  activeSatellite: satShown,
  nearestRepeaters: shown.slice(0, 10).map((r) => `${r.callsign} ${r.outputMHz} MHz (${r.km.toFixed(1)} km)`)
});
