// The NYC Live Map (nyc/index.html): one module, loaded by the page after its markup.
import { nearest, alertsByStation } from "/nyc/nearest.js";
import { onDate, status } from "/nyc/free.js";
import { baseMaps } from "/maps.js";

const ALERTS = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const STATIONS = "https://data.ny.gov/resource/39hk-dx4f.json?$limit=2000";
const BIKE_INFO = "https://gbfs.citibikenyc.com/gbfs/en/station_information.json";
const BIKE_STATUS = "https://gbfs.citibikenyc.com/gbfs/en/station_status.json";
const WALK_M_PER_MIN = 80;
const MAX_BIKE_M = 1500; // beyond this a bike is no help (e.g. Staten Island has no Citi Bike)

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// times on this map are New York times, wherever the visitor is
const NYTZ = "America/New_York";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
// a JSON error from our server says what went wrong; anything else (a proxy's HTML page) says the status
const getJSON = (u) => fetch(u).then(async (r) => { const isJson = (r.headers.get("content-type") ?? "").includes("json");
  if (!r.ok) throw new Error((isJson && (await r.json().catch(() => null))?.error) || `${r.status} ${u}`); return r.json(); });

const map = L.map("map", { doubleClickZoom: false, zoomControl: false }).setView([40.73, -73.95], 12);
baseMaps(map, { credit: "MTA · Citi Bike" });
L.control.zoom({ position: "topright" }).addTo(map);
// Looking outside NYC, the feeds that cover anywhere follow the view (aircraft, weather, webcams, search, "what's here"):
// `area()` is the query for that ("" while the view is on the city).
// What you see: the panel, the city bar and the drawer cover part of the map, so "the view" is the part they don't
// (freeArea, below). Its middle and its bounds are what "here", "this area" and "the map center" mean.
const viewCenter = () => { const f = freeArea(); return map.containerPointToLatLng([(f.left + f.right) / 2, (f.top + f.bottom) / 2]); };
const viewBounds = () => { const f = freeArea(); return L.latLngBounds(map.containerPointToLatLng([f.left, f.bottom]), map.containerPointToLatLng([f.right, f.top])); };
/** Put a point in the middle of what you see, at a zoom. */
function centerInView(ll, zoom = map.getZoom()) { const f = freeArea(), size = map.getSize(); map.setView(ll, zoom, { animate: false }); map.panBy([size.x / 2 - (f.left + f.right) / 2, size.y / 2 - (f.top + f.bottom) / 2], { animate: false }); }
const viewInNyc = () => { const c = viewCenter(); return c.lat > 40.4 && c.lat < 41 && c.lng > -74.3 && c.lng < -73.6; };
const area = () => { const c = viewCenter(); return viewInNyc() ? "" : `lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`; };
let areaTimer, lastArea = "";
map.on("moveend", () => { clearTimeout(areaTimer); areaTimer = setTimeout(() => { if (area() === lastArea) return; lastArea = area(); dispatchEvent(new Event("areachange")); }, 600); });
const alertLayer = L.layerGroup(); // stations with alerts: a layer you switch on (🚨), off by default
const bikeLayer = L.layerGroup().addTo(map);

let stations = new Map(); // gtfs_stop_id → { name, lat, lon, routes }
let bikes = [];           // stations with bikes available now
let allBikes = [];        // every station with its status, for the Citi Bike layer
let byStation = new Map(), unplaced = [];
const hidden = new Set(); // alert types switched off

async function loadStations() {
  const rows = await getJSON(STATIONS);
  stations = new Map(rows.map((r) => [r.gtfs_stop_id, {
    name: r.stop_name, routes: r.daytime_routes, lat: +r.gtfs_latitude, lon: +r.gtfs_longitude,
  }]));
}

async function refresh() {
  $("status").textContent = "Loading…";
  try {
    const [feed, info, status] = await Promise.all([getJSON(ALERTS), getJSON(BIKE_INFO), getJSON(BIKE_STATUS)]);
    const st = new Map(status.data.stations.map((s) => [s.station_id, s]));
    allBikes = info.data.stations.flatMap((s) => {
      const x = st.get(s.station_id);
      return x ? [{ name: s.name, lat: s.lat, lon: s.lon, bikes: x.num_bikes_available, ebikes: x.num_ebikes_available ?? 0, docks: x.num_docks_available, renting: !!x.is_renting, returning: !!x.is_returning, reported: x.last_reported }] : [];
    });
    if (LAYERS.citibike.on) loadCitiBike(LAYERS.citibike.group);
    bikes = info.data.stations.flatMap((s) => {
      const x = st.get(s.station_id);
      if (!x || !x.is_renting || x.num_bikes_available < 1) return [];
      return [{ name: s.name, lat: s.lat, lon: s.lon, bikes: x.num_bikes_available, ebikes: x.num_ebikes_available ?? 0 }];
    });
    ({ byStation, unplaced } = alertsByStation(feed, Date.now() / 1000));
    renderTypes();
    render();
    $("status").textContent = `Subway alerts and Citi Bike as of ${new Date().toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" })}`;
  } catch (e) {
    $("status").textContent = `Failed to load: ${e.message}`;
  }
}

function renderTypes() {
  const counts = new Map();
  for (const list of byStation.values()) for (const a of list) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  $("types").innerHTML = [...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) =>
    `<label><input type="checkbox" data-t="${esc(t)}" ${hidden.has(t) ? "" : "checked"}> ${esc(t)} <span class="muted">(${n})</span></label>`).join("");
  const shownTypes = counts.size - [...counts.keys()].filter((t) => hidden.has(t)).length;
  $("typesSum").textContent = `MTA alerts at stations: ${[...counts.values()].reduce((a, b) => a + b, 0)}${shownTypes < counts.size ? ` (${counts.size - shownTypes} kind${counts.size - shownTypes > 1 ? "s" : ""} hidden)` : ""}`;
  $("types").querySelectorAll("input").forEach((el) => el.addEventListener("change", () => {
    el.checked ? hidden.delete(el.dataset.t) : hidden.add(el.dataset.t);
    render();
  }));
  $("unplacedSum").textContent = `Line-wide alerts with no station (${unplaced.length})`;
  $("unplaced").innerHTML = unplaced.map((a) => `<li><b>${esc(a.type)}</b>: ${esc(a.header)}</li>`).join("");
}

function render() {
  alertLayer.clearLayers();
  bikeLayer.clearLayers();
  for (const [id, list] of byStation) {
    const s = stations.get(id);
    const shown = list.filter((a) => !hidden.has(a.type));
    if (!s || !shown.length) continue;
    pin(s.lat, s.lon, "🚇", css("--alert"), 22 + 2 * Math.min(4, shown.length)).bindPopup(() => popup(s, shown), { maxWidth: 320 })
      .on("popupopen", async (ev) => { showBikes(s); const html = await arrivalsHtml(id); if (ev.popup.isOpen()) ev.popup.setContent(popup(s, shown) + html); })
      .on("popupclose", () => bikeLayer.clearLayers())
      .addTo(alertLayer);
  }
}

const nearBikes = (s) => nearest(s, bikes, 3).filter((b) => b.meters <= MAX_BIKE_M);

function popup(s, alerts) {
  const uniq = [...new Map(alerts.map((a) => [a.header, a])).values()];
  const near = nearBikes(s);
  return `<b>${esc(s.name)}</b> <span class="muted">${esc(s.routes)}</span>
    <ul>${uniq.map((a) => `<li><b>${esc(a.type)}</b>: ${esc(a.header)}</li>`).join("")}</ul>
    <b>Nearest Citi Bikes</b>
    <ul class="bikes">${near.length ? "" : `<li class="muted">No Citi Bike with bikes within ${MAX_BIKE_M / 1000} km</li>`}${near.map((b) => `<li>🚲 ${esc(b.name)}: ${b.bikes} bikes (${b.ebikes} e) ·
      ${Math.round(b.meters)} m, ~${Math.max(1, Math.round(b.meters / WALK_M_PER_MIN))} min walk</li>`).join("")}</ul>`;
}

function showBikes(s) {
  bikeLayer.clearLayers();
  for (const b of nearBikes(s)) {
    L.polyline([[s.lat, s.lon], [b.lat, b.lon]], { color: css("--bike"), weight: 2, dashArray: "4 4" }).addTo(bikeLayer);
    pin(b.lat, b.lon, "🚲", css("--bike")).bindTooltip(`${b.name}: ${b.bikes} bikes`).addTo(bikeLayer);
  }
}


// ---------- more layers: outages, cameras, events, restaurants, "what's here" ----------
const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: NYTZ }); // asked each time: a page left open past midnight moves on
const norm = (n) => String(n).toLowerCase().replace(/street/g, "st").replace(/avenue/g, "av").replace(/[^a-z0-9]/g, "");
// Zoomed out, a busy layer's pins group into one count, ringed in the worst severity inside; from zoom 14 each pin shows.
const clusterOf = (emoji) => (L.markerClusterGroup ? L.markerClusterGroup({ disableClusteringAtZoom: 14, maxClusterRadius: 40, showCoverageOnHover: false, chunkedLoading: true,
  iconCreateFunction: (k) => { const sev = Math.max(0, ...k.getAllChildMarkers().map((m) => m.options.sev ?? 0));
    return L.divIcon({ className: "cam-cluster", html: `<span style="border:2px solid ${SEV[sev] ?? "var(--line)"}">${emoji} ${k.getChildCount()}</span>`, iconSize: null }); } }) : L.layerGroup());
const LAYERS = {
  alerts: { grp: "go", label: "🚨 Stations with MTA alerts: click for the nearest Citi Bikes", on: false, group: alertLayer, load: () => {} },
  stations: { grp: "go", label: "🚇 All stations: click for next trains", on: false, group: L.layerGroup(), load: loadAllStations },
  trains: { grp: "go", label: "🚆 Live trains", on: false, group: L.layerGroup(), load: loadTrains },
  buses: { grp: "go", label: "🚌 Bus stops: click for next buses", on: false, group: L.layerGroup(), load: loadBusStops },
  citibike: { grp: "go", label: "🚲 Citi Bike stations", on: false, group: L.layerGroup(), load: loadCitiBike },
  ferry: { grp: "go", label: "⛴ NYC Ferry: boats + next departures", on: false, group: L.layerGroup(), load: loadFerry },
  outages: { grp: "go", label: "♿ Broken elevators & escalators", on: false, group: L.layerGroup(), load: loadOutages },
  cameras: { grp: "streets", label: "📷 Traffic cameras, live video & webcams", on: false, load: loadCameras, // 1,400 of them: grouped until zoom 15
    group: L.markerClusterGroup ? L.markerClusterGroup({ disableClusteringAtZoom: 15, maxClusterRadius: 50, showCoverageOnHover: false, chunkedLoading: true,
      iconCreateFunction: (k) => L.divIcon({ className: "cam-cluster", html: `<span>📷 ${k.getChildCount()}</span>`, iconSize: null }) }) : L.layerGroup() },
  speeds: { grp: "streets", label: "🚦 Traffic speeds (NYC DOT)", on: false, group: L.layerGroup(), load: loadSpeeds },
  photos: { grp: "streets", label: "📸 Street photos (Mapillary): zoom in, click a dot", on: false, group: L.layerGroup(), load: loadPhotos },
  c311: { grp: "streets", label: "📞 311 reports (last 48 h, in view)", on: false, group: L.layerGroup(), load: load311 },
  security: { grp: "streets", label: "🚓 Security, last 24 hours: crime, fires, police & fire alerts", on: true, group: L.layerGroup(), load: loadSecurity },
  incidents: { grp: "streets", label: "⚠ Live incidents (Notify NYC, 511NY, Waze, FloodNet, helicopters, camera checks)", on: false, group: clusterOf("⚠"), load: loadIncidents },
  closures: { grp: "streets", label: "🚧 Closures, construction & permitted street events", on: false, group: clusterOf("🚧"), load: loadClosures },
  emergency: { grp: "streets", label: "🚨 Notify NYC alerts (24 h) & weather alerts", on: false, group: L.layerGroup(), load: loadEmergency },
  floods: { grp: "streets", label: "🌊 Street flooding now (FloodNet sensors)", on: false, group: L.layerGroup(), load: loadFloodSensors },
  city: { grp: "out", label: "🏛 Free city events today", on: false, group: L.layerGroup(), load: loadCityEvents },
  popups: { grp: "out", label: "🎁 Free pop-ups today", on: false, group: L.layerGroup(), load: loadPopups },
  films: { grp: "out", label: "🎬 Film & TV shoots on now (parking held)", on: false, group: L.layerGroup(), load: loadFilmShoots },
  news: { grp: "out", label: "📰 Local news today (placed by AI from the text)", on: false, group: clusterOf("📰"), load: loadNews },
  fdny: { grp: "streets", label: "🚒 FDNY fires: the official record (~3 weeks behind)", on: false, group: L.layerGroup(), load: loadFdny },
  sales: { grp: "out", label: "🛍 Sample sales today", on: false, group: L.layerGroup(), load: loadSales },
  restrooms: { grp: "out", label: "🚻 Public restrooms (parks, libraries, transit)", on: false, group: L.layerGroup(), load: loadRestrooms },
  pops: { grp: "out", label: "🪑 Public spaces in private buildings (plazas, atriums)", on: false, group: L.layerGroup(), load: loadPops },
  radar: { grp: "sky", label: "🌧 Rain radar (NOAA, ~4 min)", on: false, group: L.layerGroup(), load: (g) => loadWms(g, "radar", "weather_radar", "base_reflectivity_mosaic", 0.6, "green → yellow → red: light → heavy rain") },
  lightning: { grp: "sky", label: "⚡ Lightning (last 15 min)", on: false, group: L.layerGroup(), load: (g) => loadWms(g, "lightning", "lightning_detection", "ldn_lightning_strike_density", 0.8, "strike density on an ~8 km grid") },
  clouds: { grp: "sky", label: "☁️ Clouds (GOES infrared)", on: false, group: L.layerGroup(), load: (g) => loadWms(g, "clouds", "satellite", "goes_longwave_imagery", 0.85, "whiter = colder, higher cloud tops", { clouds: true }) },
  aircraft: { grp: "sky", label: "✈️ Aircraft & helicopters (live)", on: false, group: L.layerGroup(), load: loadAircraft },
  ships: { grp: "go", label: "🚢 Ships in the harbor (live AIS)", on: false, group: L.layerGroup(), load: loadShips },
  storms: { grp: "sky", label: "🌀 Hurricanes & tropical storms", on: false, group: L.layerGroup(), load: loadStorms },
  iss: { grp: "sky", label: "🛰 The ISS and its next orbit", on: false, group: L.layerGroup(), load: loadIss },
  windy: { grp: "sky", label: "🌬 windy.com forecast map, under the markers", on: false, group: L.layerGroup(), load: () => {} },
};
// The legend, grouped; a group opens by itself when one of its layers is on.
const GROUPS = { go: "🚇 Getting around", streets: "🚗 Streets & 311", out: "🎟 Out & about", sky: "☁️ Sky & weather" };
const groupCount = (g) => { const n = Object.values(LAYERS).filter((l) => l.grp === g && l.on).length; const el = $(`gn-${g}`); if (el) el.textContent = n ? `(${n} on)` : ""; };
const restaurantLayer = L.layerGroup().addTo(map);
const seen = { photo: null, weather: null, aircraft: null, ships: null, trail: null, iss: null, storms: null, ferry: [], c311: null, sales: [], speeds: null, citibike: null, trip: null, arrivals: null, outages: [], cameras: 0, city: [], popups: [], restaurants: [], here: null, openCams: [], following: null, busArrivals: null, emergency: [], films: [], floods: null, incidents: null, news: [], area: null }; // what Blip can see

$("layers").innerHTML = Object.entries(GROUPS).map(([g, name]) => {
  const ks = Object.entries(LAYERS).filter(([, l]) => l.grp === g);
  return `<details class="lgrp" ${ks.some(([, l]) => l.on) ? "open" : ""}><summary>${name} <span class="muted" id="gn-${g}"></span></summary>${g === "sky" ? '<div class="muted" id="wx">Weather…</div>' : ""}
    ${ks.map(([k, l]) => `<label><input type="checkbox" data-l="${k}" ${l.on ? "checked" : ""}> ${l.label} <span class="muted" id="n-${k}"></span></label>`).join("")}</details>`;
}).join("");
Object.keys(GROUPS).forEach(groupCount);
$("layers").addEventListener("change", (e) => toggle(e.target.dataset.l, e.target.checked));
// One click for a set of layers: the preset's layers on, every other one off (windy.com stays as it is).
const PRESETS = {
  safety: ["🚓 Safety", "Crime, fires, police and fire alerts, live incidents, Notify NYC and street flooding", ["security", "incidents", "emergency", "floods"]],
  commute: ["🚆 Commute", "Live trains, stations with alerts, broken elevators, closures, traffic speeds and Citi Bike", ["trains", "alerts", "outages", "closures", "speeds", "citibike"]],
  weather: ["🌧 Weather", "Rain radar, lightning, street flooding and weather alerts", ["radar", "lightning", "floods", "emergency"]],
  tonight: ["🎟 Out tonight", "Free city events, pop-ups and sample sales today", ["city", "popups", "sales"]],
};
const presetOn = (k) => { const want = new Set(PRESETS[k][2]); return Object.entries(LAYERS).every(([n, l]) => n === "windy" || l.on === want.has(n)); };
function drawPresets() { $("presets").innerHTML = Object.entries(PRESETS).map(([k, [label, title]]) => `<button data-preset="${k}" title="${esc(title)}" aria-pressed="${presetOn(k)}">${label}</button>`).join("") + `<a href="./tonight.html" class="muted" style="align-self:center">Tonight's events →</a>`; }
async function applyPreset(k) {
  const want = new Set(PRESETS[k]?.[2] ?? []);
  if (!want.size) return;
  await Promise.all(Object.entries(LAYERS).filter(([n, l]) => n !== "windy" && l.on !== want.has(n)).map(([n]) => toggle(n, want.has(n))));
  drawBar();
}
$("presets").addEventListener("click", (e) => { const k = e.target.closest("[data-preset]")?.dataset.preset; if (k) applyPreset(k); });
drawPresets();
async function toggle(k, on) {
  const l = LAYERS[k];
  l.on = on;
  groupCount(l.grp); queueMicrotask(() => { try { drawPresets(); } catch {} }); // presets light up when their set is on, however it got there
  const cb = document.querySelector(`#layers input[data-l="${k}"]`);
  if (cb) { cb.checked = on; if (on) cb.closest("details").open = true; }
  if (k === "windy") return showWindy(on);
  if (!on) return l.group.remove();
  l.group.addTo(map);
  if (k === "buses" && map.getZoom() < 15) map.setZoom(15); // stops only show from zoom 15; moveend then loads them
  if (k === "buses") return loadBusStops(l.group).catch(() => {});
  if (!l.loaded) { l.loaded = true; await Promise.resolve(l.load(l.group)).catch((e) => { l.loaded = false; $(`n-${k}`).textContent = `(failed: ${e.message}; switch it on again to retry)`; }); } // some loaders are synchronous
}
const DOT = 1.3; // every marker a bit bigger, so they read on a phone
// A marker you can tell from the others: its layer's emoji on a disc, ringed in the color that says its state.
// (Dense layers, Citi Bike, 311, street photos and all stations, stay canvas dots: thousands of DOM pins are slow on a phone.)
const pin = (lat, lon, emoji, color, size = 24, faded = false) => L.marker([lat, lon], { keyboard: false, icon: L.divIcon({ className: `pin${faded ? " faded" : ""}`, iconSize: [size, size],
  html: `<span style="--c:${color};font-size:${Math.round(size * 0.62)}px">${emoji}</span>` }) });
const dot = (lat, lon, color, r = 6) => L.circleMarker([lat, lon], { radius: r * DOT, color, fillColor: color, fillOpacity: 0.85, weight: 1, bubblingMouseEvents: false });

// Broken elevators/escalators come by station name + lines; match them to station coordinates.
// ponytail: name match after normalizing; a few complexes with odd names stay unplaced (listed in the count).
async function loadOutages(g) {
  const d = await getJSON("/api/nyc/archive?days=1");
  const byName = new Map();
  for (const st of stations.values()) (byName.get(norm(st.name)) ?? byName.set(norm(st.name), []).get(norm(st.name))).push(st);
  let placed = 0;
  seen.outages = d.outagesNow.map((o) => ({ station: o.station, trains: o.trains, what: o.kind === "EL" ? "elevator" : "escalator", serving: o.serving, reason: o.reason }));
  for (const o of d.outagesNow) {
    const lines = String(o.trains).split("/");
    const cands = byName.get(norm(o.station)) ?? [];
    const st = cands.find((c) => lines.some((l) => String(c.routes).split(" ").includes(l))) ?? cands[0];
    if (!st) continue;
    placed++;
    pin(st.lat + 0.0004, st.lon + 0.0004, o.kind === "EL" ? "🛗" : "♿", o.kind === "EL" ? "#ff9f1c" : "#c59bff")
      .bindPopup(`<b>${esc(o.station)}</b> <span class="muted">${esc(o.trains)}</span><br>${o.kind === "EL" ? "Elevator" : "Escalator"} out: ${esc(o.serving)}<br><span class="muted">${esc(o.reason)}${o.est_return ? ` · back ~${new Date(o.est_return * 1000).toLocaleDateString([], { timeZone: NYTZ })}` : ""}</span>`).addTo(g);
  }
  $("n-outages").textContent = `(${d.outagesNow.length}, ${placed} on map)`;
}

// Traffic speeds: NYC DOT's live speed per road segment, in Google Maps' traffic colors on a dark outline so they stand
// out on any base map. Roads without a reading aren't drawn. A stale feed is drawn dashed, and the count says so.
const mph = (v) => (v >= 30 ? "#1db954" : v >= 15 ? "#ff974d" : v >= 7 ? "#f23c32" : "#a50e15");
async function loadSpeeds(g) { // each road comes in pieces: the feed has gaps (see trafficSpeeds)
  const d = await getJSON("/api/nyc/speeds");
  g.clearLayers();
  const live = d.links.filter((l) => l.ok), dash = d.stale ? "10 7" : null;
  for (const l of live) {
    L.polyline(l.segments, { color: "#000", weight: 10, opacity: 0.55, lineCap: "round", renderer: bikeCanvas, interactive: false }).addTo(g);
    L.polyline(l.segments, { color: mph(l.mph), weight: 6, opacity: 1, lineCap: "round", dashArray: dash, renderer: bikeCanvas, bubblingMouseEvents: false })
      .bindTooltip(`${esc(l.name)}: ${Math.round(l.mph)} mph`).addTo(g);
  }
  const when = new Date(d.asOf).toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" });
  $("n-speeds").innerHTML = `(${live.length} roads, ${d.stale ? `⚠ feed last updated ${when}, dashed` : `as of ${when}`})<br><span class="legend"><i style="background:#1db954"></i>30+ mph <i style="background:#ff974d"></i>15–30 <i style="background:#f23c32"></i>7–15 <i style="background:#a50e15"></i>under 7</span>`;
  seen.speeds = { asOf: d.asOf, stale: d.stale, slowest: d.links.filter((l) => l.ok).sort((a, b) => a.mph - b.mph).slice(0, 8).map((l) => `${l.name}: ${Math.round(l.mph)} mph`) };
}

// NYC Ferry: every landing with its next boats (real-time), colored by the first route due.
const boatMarkers = new Map(); // trip → marker
async function loadFerry(g) {
  const [list, boats] = await Promise.all([getJSON("/api/nyc/ferry"), getJSON("/api/nyc/boats").catch(() => [])]);
  g.clearLayers();
  boatMarkers.clear();
  for (const b of boats) boatMarkers.set(b.trip, L.marker([b.lat, b.lon], { icon: L.divIcon({ className: "", html: `<div class="boat" style="border-color:${b.color}">⛴</div>`, iconSize: [22, 22] }), zIndexOffset: 500 })
    .bindTooltip(`${esc(b.short)} ${esc(b.where)}`).bindPopup(`<b>⛴ ${esc(b.route)}</b><br>${esc(b.where)}<br><span class="muted">boat ${esc(b.boat)} · GPS ${new Date(b.seen * 1000).toLocaleTimeString([], { timeZone: NYTZ })}</span>`).addTo(g));
  for (const s of list) {
    const c = s.next[0]?.color ?? "#7f8bc4";
    pin(s.lat, s.lon, "⚓", c).bindTooltip(`⛴ ${s.name}`).bindPopup(() => `<b>⛴ ${esc(s.name)}</b>${s.accessible ? " ♿" : ""}<br>${s.next.length ? s.next.map((n) => `<span style="color:${n.color}">■</span> ${esc(n.route)}: ${boatMarkers.has(n.trip) ? `<button class="linkish" data-trip="${esc(n.trip)}" title="Where is this boat now?">${n.minutes ? n.minutes + " min" : "now"}</button>` : n.minutes ? n.minutes + " min" : "now"}`).join("<br>") : '<span class="muted">No boats in the next while</span>'}`).addTo(g);
  }
  $("n-ferry").textContent = `(${list.length} landings, ${list.filter((s) => s.next.length).length} with boats coming)`;
  seen.ferry = list.filter((s) => s.next.length).slice(0, 15).map((s) => `${s.name}: ${s.next.map((n) => `${n.short} ${n.minutes} min`).join(", ")}`);
}
setInterval(() => { if (LAYERS.ferry.on && !map.getContainer().querySelector(".leaflet-popup")) loadFerry(LAYERS.ferry.group).catch(() => {}); }, 30_000); // not under an open popup

// Citi Bike: every station colored by what you can do there right now (legend under the checkbox).
const BIKE_COLORS = { ok: "#5cff9d", few: "#ffb347", none: "#ff5c8a", off: "#7f8bc4" };
const bikeState = (b) => !b.renting ? "off" : b.bikes === 0 ? "none" : b.bikes < 3 ? "few" : "ok";
const bikeCanvas = L.canvas({ padding: 0.3 });
function loadCitiBike(g) {
  g.clearLayers();
  for (const b of allBikes) {
    const c = BIKE_COLORS[bikeState(b)];
    L.circleMarker([b.lat, b.lon], { renderer: bikeCanvas, radius: 4 * DOT, color: c, fillColor: c, fillOpacity: 0.85, weight: 1, bubblingMouseEvents: false })
      .bindPopup(() => `<b>🚲 ${esc(b.name)}</b><br>${b.renting ? `${b.bikes} bikes (${b.ebikes} electric) · ${b.docks} free docks` : "Not renting right now"}${b.returning ? "" : "<br>Not accepting returns"}<br><span class="muted">reported ${new Date(b.reported * 1000).toLocaleTimeString([], { timeZone: NYTZ })}</span>`)
      .addTo(g);
  }
  const n = (k) => allBikes.filter((b) => bikeState(b) === k).length;
  $("n-citibike").innerHTML = `(${allBikes.length})<br><span class="legend">${Object.entries({ ok: "3+ bikes", few: "1–2 bikes", none: "empty", off: "not renting" }).map(([k, t]) => `<i style="background:${BIKE_COLORS[k]}"></i>${t} ${n(k)}`).join(" ")}</span>`;
  seen.citibike = { stations: allBikes.length, withBikes: allBikes.filter((b) => b.bikes > 0).length, empty: n("none"), notRenting: n("off") };
}

// Next trains: MTA real-time arrivals through /api/nyc/arrivals, shown in a station's popup.
// MTA bullet colors by trunk line.
const ROUTE_COLOR = { A: "#0039a6", C: "#0039a6", E: "#0039a6", B: "#ff6319", D: "#ff6319", F: "#ff6319", M: "#ff6319", G: "#6cbe45", J: "#996633", Z: "#996633", L: "#a7a9ac",
  N: "#fccc0a", Q: "#fccc0a", R: "#fccc0a", W: "#fccc0a", 1: "#ee352e", 2: "#ee352e", 3: "#ee352e", 4: "#00933c", 5: "#00933c", 6: "#00933c", 7: "#b933ad", S: "#808183", GS: "#808183", FS: "#808183", H: "#808183", SI: "#0039a6" };
const bullet = (r) => `<span class="bullet" style="background:${ROUTE_COLOR[r.replace(/X$/, "")] ?? "#808183"};color:${/^[NQRW]$/.test(r) ? "#000" : "#fff"}">${esc(r.replace(/^(GS|FS|H)$/, "S"))}</span>`;
async function arrivalsHtml(id) {
  const d = await getJSON(`/api/nyc/arrivals?stop=${encodeURIComponent(id)}`).catch(() => null);
  if (!d) return `<p class="muted">No arrival times right now.</p>`;
  seen.arrivals = d;
  const dir = (x, stop) => {
    const byRoute = new Map();
    for (const t of x.trains) (byRoute.get(t.route) ?? byRoute.set(t.route, []).get(t.route)).push(t);
    return `<div class="arr-dir"><div class="arr-head">${esc(x.label)}</div>${byRoute.size ? [...byRoute].map(([r, ts]) => `<div class="arr-row">${bullet(r)}<span class="arr-times">${ts.map((t, i) => `<button class="${i ? "" : "first"}" data-trip="${esc(t.trip)}" data-stop="${stop}" title="Where is this train now?">${t.minutes ? t.minutes : "now"}</button>`).join("")}<small>min</small></span></div>`).join("") : `<div class="muted">No trains listed</div>`}</div>`;
  };
  return `<div class="arr"><div class="arr-title">Next trains <span class="muted">live · tap a time to see the train</span></div>${dir(d.north, id + "N")}${dir(d.south, id + "S")}</div>`;
}

// Where is that train or boat now? Tap a time on a board → the vehicle and the track ahead to your stop, redrawn every 15 s.
// Trains are estimated (the MTA reports only "at / heading to a station"); boats are their own GPS.
const vehicleLayer = L.layerGroup().addTo(map);
let following = null; // { trip, stop }
async function followTrain(t, fit) {
  const d = (await getJSON(`/api/nyc/trains?trip=${encodeURIComponent(t.trip)}&stop=${encodeURIComponent(t.stop)}`).catch(() => ({ trains: [] }))).trains[0];
  if (following !== t) return; // switched to another train meanwhile
  vehicleLayer.clearLayers();
  if (!d) { following = null; seen.following = null; return L.popup().setLatLng(viewCenter()).setContent("That train hasn't left its first station yet, so it has no position.").openOn(map); }
  const color = ROUTE_COLOR[d.route.replace(/X$/, "")] ?? "#808183";
  const path = d.path?.length > 1 ? L.polyline(d.path, { color, weight: 6, opacity: 0.8, dashArray: "8 6" }).addTo(vehicleLayer) : null;
  L.marker([d.lat, d.lon], { icon: L.divIcon({ className: "", html: bullet(d.route), iconSize: [22, 22] }), zIndexOffset: 1000 })
    .bindTooltip(`${esc(d.route)} to ${esc(d.to)}: ${esc(d.where)}<br><span class="muted">estimated · tap the train to stop following</span>`, { permanent: true, direction: "top", offset: [0, -12] })
    .on("click", () => { following = null; seen.following = null; vehicleLayer.clearLayers(); }).addTo(vehicleLayer);
  seen.following = { train: d.route, to: d.to, now: d.where };
  if (fit) { map.closePopup(); path ? map.fitBounds(path.getBounds(), { paddingTopLeft: [Math.max(60, $("panel").getBoundingClientRect().right - $("map").getBoundingClientRect().left + 40), 60], paddingBottomRight: [60, 60], maxZoom: 15 }) : map.setView([d.lat, d.lon], 15); }
}
document.addEventListener("click", (e) => {
  const bus = e.target.closest("button[data-bus]"), route = e.target.closest("button[data-route]");
  if (bus) return followBus((following = { stop: bus.dataset.stop, vehicle: bus.dataset.bus, route: bus.dataset.routeId }), true);
  if (route) return showBusRoute(route.dataset.route, true);
  const b = e.target.closest("button[data-trip]");
  if (b?.dataset.stop) followTrain((following = { trip: b.dataset.trip, stop: b.dataset.stop }), true);
  else if (b) { const m = boatMarkers.get(b.dataset.trip); if (m) { map.closePopup(); map.setView(m.getLatLng(), 14); m.openPopup(); } }
});
setInterval(() => following && (following.vehicle ? followBus : followTrain)(following, false), 15_000);

// Buses (MTA Bus Time): stops load for the area in view once zoomed in; a stop's popup lists the next buses.
// A bus seen from the front, in the route's color: the GPS position is the bus itself.
const busIcon = (color) => `<svg viewBox="0 0 24 26" width="32" height="34" aria-hidden="true"><rect x="3" y="1" width="18" height="19" rx="3.5" fill="${esc(color)}" stroke="#fff" stroke-width="1.5"/>
  <rect x="5.5" y="4" width="13" height="7" rx="1.2" fill="#fff" opacity=".9"/><rect x="7" y="2.2" width="10" height="1.2" rx=".6" fill="#fff" opacity=".7"/>
  <circle cx="7.5" cy="15.5" r="1.5" fill="#fff"/><circle cx="16.5" cy="15.5" r="1.5" fill="#fff"/><rect x="5" y="20" width="3.5" height="4" rx="1" fill="#222"/><rect x="15.5" y="20" width="3.5" height="4" rx="1" fill="#222"/></svg>`;
const busBullet = (r) => `<span class="bullet bus" style="background:${esc(r.color)};color:${esc(r.text ?? "#fff")}">${esc(r.name)}</span>`;
const busStopMarkers = new Map(), busCells = new Set(); // cells (0.0075° grid, as on the server) already loaded
const BUS_GRID = 0.0075;
async function loadBusStops(g) {
  if (map.getZoom() < 15) return ($("n-buses").textContent = "(zoom in to see stops)");
  const b = map.getBounds(), cells = [];
  for (let i = Math.floor(b.getSouth() / BUS_GRID); i <= Math.ceil(b.getNorth() / BUS_GRID); i++)
    for (let j = Math.floor(b.getWest() / BUS_GRID); j <= Math.ceil(b.getEast() / BUS_GRID); j++)
      if (!busCells.has(`${i},${j}`)) cells.push([i, j]);
  $("n-buses").textContent = "(loading…)";
  await Promise.all(cells.slice(0, 60).map(async ([i, j]) => {
    const list = await getJSON(`/api/nyc/bus-stops?lat=${(i * BUS_GRID).toFixed(4)}&lon=${(j * BUS_GRID).toFixed(4)}`).catch(() => null);
    if (!list) return; // not marked loaded, so the next move retries it
    busCells.add(`${i},${j}`);
    for (const st of list) {
      if (busStopMarkers.has(st.id)) continue;
      busStopMarkers.set(st.id, pin(st.lat, st.lon, "🚌", "#1c7ed6", 22)
        .bindTooltip(`🚌 ${esc(st.name)} (${st.routes.map((r) => r.name).join(", ")})`).bindPopup("Loading…", { maxWidth: 320 })
        .on("popupopen", async (ev) => ev.popup.setContent(await busStopHtml(st))).addTo(g));
    }
  }));
  $("n-buses").textContent = `(${busStopMarkers.size} stops loaded)`;
}
map.on("moveend", () => { if (LAYERS.buses.on) loadBusStops(LAYERS.buses.group).catch(() => {}); });
async function busStopHtml(st) {
  const list = await getJSON(`/api/nyc/bus-arrivals?stop=${encodeURIComponent(st.id)}`).catch(() => null);
  seen.busArrivals = list && { stop: st.name, buses: list.map((a) => `${a.route} to ${a.to}: ${a.minutes ?? "?"} min (${a.away})`) };
  const color = new Map(st.routes.map((r) => [r.id, r]));
  const rows = (list ?? []).map((a) => `<div class="arr-row">${busBullet(color.get(a.routeId) ?? { name: a.route, color: "#1c7ed6" })}<span class="arr-times">${a.lat ? `<button class="first" data-bus="${esc(a.vehicle)}" data-stop="${esc(st.id)}" data-route-id="${esc(a.routeId)}" title="Where is this bus now?">${a.minutes ? a.minutes : "now"}</button>` : `<b>${a.minutes ?? "?"}</b>`}<small>min · ${esc(a.away)}</small></span></div><div class="muted" style="margin:-2px 0 4px 30px;font-size:.8em">to ${esc(a.to.toLowerCase())}</div>`).join("");
  return `<b>🚌 ${esc(st.name)}</b> <span class="muted">${esc(st.dir ? `${st.dir}-bound` : "")}</span>
    <div style="margin:4px 0">${st.routes.map((r) => `<button class="linkish" data-route="${esc(r.id)}" title="Show the ${esc(r.name)} route: ${esc(r.long)}">${busBullet(r)}</button>`).join(" ")}</div>
    <div class="arr"><div class="arr-title">Next buses <span class="muted">live · tap a time to see the bus</span></div>${list ? rows || '<div class="muted">No buses on the way right now</div>' : '<div class="muted">Bus Time is not answering right now.</div>'}</div>`;
}
async function showBusRoute(id, fit) {
  const r = await getJSON(`/api/nyc/bus-route?route=${encodeURIComponent(id)}`);
  const line = L.polyline(r.lines, { color: r.color, weight: 5, opacity: 0.75 }).bindTooltip(`${esc(r.name)}: ${esc(r.long)}`).addTo(vehicleLayer);
  if (fit) { map.closePopup(); map.fitBounds(line.getBounds(), { paddingTopLeft: [Math.max(60, $("panel").getBoundingClientRect().right - $("map").getBoundingClientRect().left + 40), 60], paddingBottomRight: [60, 60] }); }
  return r;
}
async function followBus(f, fit) {
  const list = await getJSON(`/api/nyc/bus-arrivals?stop=${encodeURIComponent(f.stop)}`).catch(() => []);
  if (following !== f) return;
  const a = list.find((x) => x.vehicle === f.vehicle);
  vehicleLayer.clearLayers();
  if (!a?.lat) { following = null; seen.following = null; return L.popup().setLatLng(viewCenter()).setContent("That bus has passed the stop or stopped reporting.").openOn(map); }
  const r = await showBusRoute(f.route, false);
  const st = busStopMarkers.get(f.stop);
  if (st) L.circleMarker(st.getLatLng(), { radius: 8, color: r.color, weight: 3, fill: false }).addTo(vehicleLayer);
  L.marker([a.lat, a.lon], { icon: L.divIcon({ className: "", html: `<div class="veh">${busIcon(r.color)}${busBullet({ name: a.route, color: r.color })}</div>`, iconSize: [80, 34], iconAnchor: [16, 17] }), zIndexOffset: 1000 })
    .bindTooltip(`${esc(a.route)} to ${esc(a.to.toLowerCase())}: ${esc(a.away)}${a.minutes != null ? `, ~${a.minutes} min` : ""}<br><span class="muted">GPS · tap the bus to stop following</span>`, { permanent: true, direction: "top", offset: [0, -12] })
    .on("click", () => { following = null; seen.following = null; vehicleLayer.clearLayers(); }).addTo(vehicleLayer);
  seen.following = { bus: a.route, to: a.to, now: a.away };
  if (fit) { map.closePopup(); map.fitBounds(L.latLngBounds([[a.lat, a.lon], st?.getLatLng() ?? [a.lat, a.lon]]), { paddingTopLeft: [Math.max(60, $("panel").getBoundingClientRect().right - $("map").getBoundingClientRect().left + 40), 100], paddingBottomRight: [200, 80], maxZoom: 16 }); }
}

// One line or a few (show_line, #line=C, Blip): only their trains and stations, the map fitted to them. null: every line.
let lineFilter = null;
const lineKey = (r) => String(r).toUpperCase().replace(/X$/, "").replace(/^(GS|FS|H)$/, "S").replace(/^SI$/, "SIR"); // GTFS ids → the letters stations list
const onLine = (routes) => !lineFilter || String(routes).split(/[\s,/]+/).some((r) => lineFilter.has(lineKey(r)));
async function showLine(lines) {
  const want = String(lines ?? "").split(/[\s,+/&]+/).map(lineKey).filter((r) => /^([1-7ABCDEFGJLMNQRWZ]|S|SIR)$/.test(r));
  lineFilter = want.length ? new Set(want) : null;
  seen.lines = lineFilter && [...lineFilter];
  for (const k of ["stations", "trains"]) { LAYERS[k].group.clearLayers(); LAYERS[k].loaded = false; }
  stationMarkers.clear();
  await toggle("stations", true); await toggle("trains", true);
  drawBar();
  if (!lineFilter) return "every line";
  const pts = [...stations.values()].filter((s) => onLine(s.routes));
  if (pts.length) map.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lon])), { paddingTopLeft: [Math.max(40, $("panel").getBoundingClientRect().right - $("map").getBoundingClientRect().left + 30), 60], paddingBottomRight: [40, 40] });
  return `${[...lineFilter].join(", ")}: ${pts.length} stations, ${LAYERS.trains.group.getLayers().length} trains running`;
}
// Every running train, estimated the same way.
async function loadTrains(g) {
  const d = await getJSON("/api/nyc/trains"), list = d.trains.filter((t) => onLine(t.route));
  g.clearLayers();
  for (const t of list) L.marker([t.lat, t.lon], { icon: L.divIcon({ className: "", html: bullet(t.route).replace('class="bullet"', 'class="bullet sm"'), iconSize: [18, 18] }) })
    .bindTooltip(`${esc(t.route)} to ${esc(t.to)}: ${esc(t.where)}`).addTo(g);
  $("n-trains").textContent = `(${list.length}${lineFilter ? ` on the ${[...lineFilter].join(", ")}` : ""} running, estimated)`;
}
setInterval(() => { if (LAYERS.trains.on) loadTrains(LAYERS.trains.group).catch(() => {}); }, 30_000);
const stationMarkers = new Map();
async function loadAllStations(g) {
  const lineColor = lineFilter && (ROUTE_COLOR[[...lineFilter][0]] ?? "#808183");
  for (const [id, s] of stations) {
    if (!onLine(s.routes)) continue;
    const m = dot(s.lat, s.lon, lineColor || "#9aa3cf", lineColor ? 5 : 3).bindTooltip(`${s.name} (${s.routes})`).bindPopup("Loading…", { maxWidth: 300 })
      .on("popupopen", async (ev) => ev.popup.setContent(`<b>${esc(s.name)}</b> <span class="muted">${esc(s.routes)}</span>${await arrivalsHtml(id)}`)).addTo(g);
    stationMarkers.set(id, m);
  }
  $("n-stations").textContent = `(${stationMarkers.size}${lineFilter ? ` on the ${[...lineFilter].join(", ")}` : ""})`;
}

const camShown = new Set();
const camEmoji = (c) => (c.video || c.youtube ? "📹" : c.source ? "🎥" : "📷"); // live video, a webcam's still, a traffic camera's still
const camQ = (c) => (c.h >= 2160 ? "4K" : c.h >= 720 ? "HD" : c.h >= 352 ? "SD" : ""); // by the video's lines (the server reads them)
const camIcons = {};
const camIcon = (c) => { const q = camQ(c), html = camEmoji(c) + (c.video || c.youtube ? `<i class="live"></i>` : "") + (q ? `<b class="q${q === "SD" ? "" : " hd"}">${q}</b>` : "");
  return (camIcons[html] ??= L.divIcon({ className: "cam-icon", html, iconSize: [18, 18] })); };
const camMarker = (c) => L.marker([c.lat, c.lon], { icon: camIcon(c), title: c.source ? `${c.name} (${c.source}${camQ(c) ? `, ${camQ(c)}` : ""})` : c.name,
  zIndexOffset: c.h >= 720 ? 800 : c.h >= 352 ? 600 : c.video || c.youtube ? 400 : 0 }).on("click", () => openCam(c)); // the sharpest on top
async function loadCameras(g) {
  const here = await getJSON(`/api/nyc/cameras?${area()}`), list = here.filter((c) => !camShown.has(c.id));
  if (!here.length && area()) $("n-cameras").textContent = "(no webcams known around here)";
  if (!list.length) return; // all already on the map
  list.forEach((c) => camShown.add(c.id));
  seen.cameras += list.length;
  for (const c of list) camMarker(c).addTo(g);
  const n = (f) => list.filter(f).length, w = n((c) => c.source === "windy.com"), v = n((c) => c.video || c.youtube);
  $("n-cameras").innerHTML = area() ? `(${w} <a href="https://www.windy.com/webcams" target="_blank" rel="noopener">windy.com</a> webcams 🎥 around here)`
    : `(${v} live video 📹 from NYSDOT and YouTube: ${n((c) => c.h >= 720)} <b>HD</b> or 4K, ${n((c) => c.h >= 352 && c.h < 720)} SD, the rest low-res · ${list.length - w - v} traffic stills 📷 · ${w} <a href="https://www.windy.com/webcams" target="_blank" rel="noopener">windy.com</a> webcams 🎥; click to open, several at once)`;
}
addEventListener("areachange", () => { if (LAYERS.cameras.on && area()) loadCameras(LAYERS.cameras.group).catch(() => {}); });

// ---------- sky & weather, and the air (server: sky.ts) ----------
// NOAA nowCOAST map images (radar, lightning, clouds), refreshed while the layer is on. They get their own pane, so
// they sit over whichever street map is on.
// Each tile is drawn through a canvas (NOAA allows cross-origin reads), so the layer can say whether anything is in
// view, and the clouds can be made "clouds only": NOAA's infrared picture is opaque gray everywhere, warm ground included.
map.createPane("wx").style.zIndex = 350; // above the street tiles (200), under markers and lines (400+)
const CLOUD = [118, 175]; // ponytail: infrared gray (0–255) where cloud starts → fully white; tuned by eye, adjust if clear nights look cloudy
const WxLayer = L.TileLayer.WMS.extend({
  createTile(coords, done) {
    const c = document.createElement("canvas"), img = new Image();
    c.width = c.height = 256;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 256, 256), p = d.data;
      let seen = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (this.options.clouds) { const a = Math.max(0, Math.min(1, (p[i] - CLOUD[0]) / (CLOUD[1] - CLOUD[0]))); p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = 230 * a; }
        if (p[i + 3] > 20) seen++;
      }
      if (this.options.clouds) g.putImageData(d, 0, 0);
      this._seen = (this._seen ?? 0) + seen;
      done(null, c);
    };
    img.onerror = () => done(new Error("no tile"), c);
    img.src = this.getTileUrl(coords);
    return c;
  },
});
async function loadWms(g, k, svc, layer, opacity, note, extra = {}) {
  const t = new WxLayer(`https://nowcoast.noaa.gov/geoserver/observations/${svc}/ows`, { layers: layer, format: "image/png", transparent: true, opacity, pane: "wx", attribution: "NOAA nowCOAST", ...extra }).addTo(g);
  const empty = { radar: "no rain in view right now", lightning: "no lightning in view in the last 15 min", clouds: "clear skies in view" }[k];
  t.on("loading", () => (t._seen = 0));
  t.on("load", () => ($(`n-${k}`).textContent = `(${t._seen ? note : empty})`));
  setInterval(() => { if (LAYERS[k].on) t.setParams({ _t: Date.now() }); }, 4 * 60_000);
  $(`n-${k}`).textContent = "(loading…)";
}
// The weather now: under the "Sky & weather" heading, and for Blip.
const loadWx = () => getJSON(`/api/nyc/weather?${area()}`).then((w) => {
  seen.weather = w; drawBar();
  $("wx").innerHTML = `${esc(w.station)}: ${esc(w.sky || "")}${w.tempF != null ? `, ${w.tempF}°F (${w.tempC}°C)` : ""} · ${esc((w.forecast[0] ?? "").replace(/\.\s.*$/, "."))}` +
    w.alerts.map((a) => `<div class="alert">⚠ ${esc(a.event)}${a.until ? ` until ${new Date(a.until).toLocaleString([], { timeZone: NYTZ, weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</div>`).join("");
}).catch(() => ($("wx").textContent = ""));
loadWx(); addEventListener("areachange", loadWx);

// Aircraft from adsb.lol, every 10 s. Planes point where they fly; helicopters are 🚁; military in amber.
const acMarkers = new Map(), trailLayer = L.layerGroup().addTo(map);
const planeSvg = (a) => `<svg viewBox="0 0 24 24" width="22" height="22" style="transform:rotate(${a.track ?? 0}deg)"><path d="M12 2l1.6 6.5L21 13v2l-7.3-2.2-.6 5.1 2.7 1.9V21L12 20l-3.8 1v-1.2l2.7-1.9-.6-5.1L3 15v-2l7.4-4.5z" fill="${a.emergency ? "#ff3b3b" : a.military ? "#ffb347" : "#e9ecff"}" stroke="#000" stroke-width=".8"/></svg>`;
const acIcon = (a) => a.heli ? L.divIcon({ className: "acft-heli", html: "🚁", iconSize: [20, 20] }) : L.divIcon({ className: "acft", html: planeSvg(a), iconSize: [22, 22] });
const acPopup = (a) => `<b>${a.heli ? "🚁" : "✈"} ${esc(a.flight || a.reg || a.hex)}</b> <span class="muted">${esc([a.type, a.reg].filter(Boolean).join(" · "))}${a.military ? " · military" : ""}</span><br>
  ${a.altFt != null ? `${a.altFt.toLocaleString()} ft` : "altitude unknown"}${a.kts != null ? ` · ${Math.round(a.kts)} kt` : ""}${a.track != null ? ` · heading ${Math.round(a.track)}°` : ""}${a.squawk ? ` · squawk ${esc(a.squawk)}` : ""}${a.emergency ? `<br><b style="color:#ff3b3b">Emergency: ${esc(a.emergency)}</b>` : ""}
  <br><button class="linkish" data-trail="${esc(a.hex)}">Where it's been (24 h)</button>${a.heli || (a.altFt ?? 99999) < 3000 ? ` · ${camBtn(a.lat, a.lon)}` : ""} · <a href="https://adsb.lol/?icao=${esc(a.hex)}" target="_blank" rel="noopener">adsb.lol</a>`;
addEventListener("areachange", () => { if (LAYERS.aircraft.on) refreshAircraft(LAYERS.aircraft.group).catch(() => {}); });
async function refreshAircraft(g) {
  const list = await getJSON(`/api/nyc/aircraft?${area()}`), ids = new Set(list.map((a) => a.hex));
  for (const a of list) {
    let m = acMarkers.get(a.hex);
    if (!m) { m = L.marker([a.lat, a.lon], { icon: acIcon(a), zIndexOffset: 800, title: a.flight || a.reg, keyboard: false }).bindPopup(() => acPopup(m.ac), MOVING_POPUP()).on("popupopen", panIntoView).addTo(g); acMarkers.set(a.hex, m); }
    else { m.setLatLng([a.lat, a.lon]); if (m.ac.track !== a.track || m.ac.military !== a.military) m.setIcon(acIcon(a)); }
    m.ac = a; m.fix = { lat: a.lat, lon: a.lon, at: performance.now() };
  }
  for (const [hex, m] of acMarkers) if (!ids.has(hex)) { m.remove(); acMarkers.delete(hex); }
  const heli = list.filter((a) => a.heli), mil = list.filter((a) => a.military), sos = list.filter((a) => a.emergency);
  seen.aircraft = { count: list.length, helicopters: heli.map((a) => `${a.flight || a.reg || a.hex} (${a.type}) at ${a.altFt} ft near ${a.lat},${a.lon}`), military: mil.map((a) => `${a.flight || a.hex} (${a.type})`), emergencies: sos.map((a) => `${a.flight || a.hex}: ${a.emergency}`) };
  $("n-aircraft").textContent = `(${list.length}: ${heli.length} helicopters${mil.length ? `, ${mil.length} military` : ""}${sos.length ? `, ${sos.length} EMERGENCY` : ""}) · adsb.lol`;
}
// Smooth motion between the 10 s updates: each plane flies on along its heading at its speed (dead reckoning), so the
// next fix lands about where the marker already is instead of making it jump.
function glideAircraft() {
  if (LAYERS.aircraft.on) for (const m of acMarkers.values()) {
    const a = m.ac, f = m.fix; if (!f || a.kts == null || a.track == null || a.kts < 5) continue;
    const dt = Math.min(15, (performance.now() - f.at) / 1000), d = a.kts * 0.5144 * dt, rad = (a.track * Math.PI) / 180;
    m.setLatLng([f.lat + (d * Math.cos(rad)) / 111320, f.lon + (d * Math.sin(rad)) / (111320 * Math.cos((f.lat * Math.PI) / 180))]);
  }
  setTimeout(() => requestAnimationFrame(glideAircraft), 150);
}
async function loadAircraft(g) {
  await refreshAircraft(g); glideAircraft();
  setInterval(() => { if (LAYERS.aircraft.on) refreshAircraft(g).catch(() => {}); }, 10_000);
}
// Ships from AIS (aisstream.io), every 10 s: an arrow pointing the way it's heading, colored by kind; moored ones are dots.
const shipMarkers = new Map();
// Popups on things that move: Leaflet's auto-pan would run again on every move (the popup's setLatLng re-pans), fighting
// the visitor's fingers on a phone, so these pan into view once, leaving room for the popup above and the sheet below.
const phone = () => matchMedia("(max-width: 700px)").matches;
const sheetH = () => (phone() ? $("panel").offsetHeight + 16 : 0);
const MOVING_POPUP = () => ({ autoPan: false, maxWidth: Math.min(300, innerWidth - 70) });
const panIntoView = (ev) => { const half = Math.min(190, innerWidth / 2 - 6); map.panInside(ev.popup.getLatLng(), { paddingTopLeft: [half, 190], paddingBottomRight: [half, sheetH() + 40] }); }; // room for the popup's half-width each side
const SHIP_COLOR = { passenger: "#4de1ff", cargo: "#ffb347", tanker: "#fc6255", tug: "#f4d35e", "pilot boat": "#f4d35e", sailing: "#e9ecff", "pleasure craft": "#e9ecff", "high-speed craft": "#4de1ff", military: "#83c167", "search and rescue": "#ff5c8a", "law enforcement": "#ff5c8a" };
const shipMoving = (s) => (s.kts ?? 0) > 0.5 && !/moored|anchor/.test(s.status);
const shipSvg = (s) => `<svg viewBox="0 0 24 24" width="20" height="20" style="transform:rotate(${s.heading ?? s.cog ?? 0}deg)"><path d="M12 2l6 18-6-4-6 4z" fill="${SHIP_COLOR[s.kind] ?? "#9aa3cf"}" stroke="#000" stroke-width=".8"/></svg>`;
const shipIcon = (s) => shipMoving(s) ? L.divIcon({ className: "ship", html: shipSvg(s), iconSize: [20, 20] }) : L.divIcon({ className: "ship", html: `<span style="display:block;width:9px;height:9px;border-radius:50%;background:${SHIP_COLOR[s.kind] ?? "#9aa3cf"};border:1.5px solid #000"></span>`, iconSize: [9, 9] });
const shipPopup = (s) => `<b>🚢 ${esc(s.name || `MMSI ${s.mmsi}`)}</b> <span class="muted">${esc(s.kind)}${s.length ? ` · ${s.length} m` : ""}${s.callsign ? ` · ${esc(s.callsign)}` : ""}</span><br>
  ${s.kts != null ? `${s.kts} kt` : "speed unknown"}${s.heading != null || s.cog != null ? ` · heading ${s.heading ?? s.cog}°` : ""}${s.status ? ` · ${esc(s.status)}` : ""}${s.dest ? `<br>bound for <b>${esc(s.dest)}</b>` : ""}
  <br><span class="muted">seen ${s.agoS < 90 ? `${s.agoS} s` : `${Math.round(s.agoS / 60)} min`} ago</span> · ${camBtn(s.lat, s.lon)} · <a href="https://www.vesselfinder.com/?mmsi=${s.mmsi}" target="_blank" rel="noopener">VesselFinder</a>`;
async function refreshShips(g) {
  const d = await getJSON("/api/nyc/ships"), list = d.ships, ids = new Set(list.map((s) => s.mmsi));
  for (const s of list) {
    let m = shipMarkers.get(s.mmsi);
    if (!m) { m = L.marker([s.lat, s.lon], { icon: shipIcon(s), zIndexOffset: 700, title: s.name, keyboard: false }).bindPopup(() => shipPopup(m.ship), MOVING_POPUP()).on("popupopen", panIntoView).addTo(g); shipMarkers.set(s.mmsi, m); }
    else { m.setLatLng([s.lat, s.lon]); if ((m.ship.heading ?? m.ship.cog) !== (s.heading ?? s.cog) || shipMoving(m.ship) !== shipMoving(s) || m.ship.kind !== s.kind) m.setIcon(shipIcon(s)); }
    m.ship = s;
  }
  for (const [k, m] of shipMarkers) if (!ids.has(k)) { m.remove(); shipMarkers.delete(k); }
  const moving = list.filter(shipMoving), kinds = {}; for (const s of list) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  seen.ships = { count: list.length, moving: moving.slice(0, 25).map((s) => `${s.name || s.mmsi} (${s.kind}) ${s.kts} kt heading ${s.heading ?? s.cog}°${s.dest ? ` to ${s.dest}` : ""} at ${s.lat},${s.lon}`), byKind: kinds };
  $("n-ships").textContent = d.off ? "(feed not set up)" : d.warming ? "(listening… a few seconds)" : `(${list.length}: ${moving.length} moving) · AIS`;
}
async function loadShips(g) {
  await refreshShips(g);
  setInterval(() => { if (LAYERS.ships.on) refreshShips(g).catch(() => {}); }, 10_000);
}
async function showTrail(hex) {
  const d = await getJSON(`/api/nyc/trace?hex=${encodeURIComponent(hex)}`).catch(() => null);
  trailLayer.clearLayers();
  if (!d?.points.length) return;
  L.polyline(d.points.map((p) => [p[0], p[1]]), { color: "#ffb347", weight: 2.5, opacity: 0.85, dashArray: "6 4" })
    .bindTooltip(`${hex}: since ${new Date(d.points[0][3] * 1000).toLocaleString([], { timeZone: NYTZ, weekday: "short", hour: "numeric", minute: "2-digit" })}`).addTo(trailLayer);
  seen.trail = { hex, points: d.points.length, since: new Date(d.points[0][3] * 1000).toISOString() };
}

// The ISS, every 10 s, with its next orbit (split where it crosses the date line). The marker moves in place, so its
// popup, and the live video in it, stay open across the updates.
const issTrack = L.layerGroup();
let issMarker = null, issNow = null;
const ISS_VIDEO = "fO9e9jnhYK8"; // Sen's 24/7 4K livestream from cameras on the ISS
const issPopup = () => { const d = issNow; return `<b>🛰 International Space Station</b><br>${d.altKm} km up · ${d.kmh.toLocaleString()} km/h · ${d.daylight ? "in sunlight" : "in Earth's shadow"}<br><span class="muted">${d.kmFromNyc.toLocaleString()} km from NYC · dashed: the next 90 minutes</span>
  <div class="iss-live"><iframe src="https://www.youtube-nocookie.com/embed/${ISS_VIDEO}?autoplay=1&mute=1&playsinline=1" title="Live video from the ISS" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
  <span class="muted">Live from the ISS: Sen's 4K cameras · <a href="https://www.youtube.com/watch?v=${ISS_VIDEO}" target="_blank" rel="noopener">YouTube</a></span>${issPassHtml()}`; };
async function refreshIss(g) {
  const d = (issNow = await getJSON("/api/nyc/iss"));
  issTrack.clearLayers(); if (!g.hasLayer(issTrack)) issTrack.addTo(g);
  const segs = [[]];
  d.track.forEach((p, i) => { if (i && Math.abs(p[1] - d.track[i - 1][1]) > 180) segs.push([]); segs.at(-1).push(p); });
  segs.forEach((sg) => L.polyline(sg, { color: "#4de1ff", weight: 2, dashArray: "4 6", opacity: 0.8 }).addTo(issTrack));
  if (issMarker) issMarker.setLatLng([d.lat, d.lon]);
  else issMarker = L.marker([d.lat, d.lon], { icon: L.divIcon({ className: "acft-heli", html: "🛰", iconSize: [22, 22] }), zIndexOffset: 900 })
    .bindPopup(issPopup, { maxWidth: 360, minWidth: 280 }).addTo(g);
  seen.iss = { lat: d.lat, lon: d.lon, altKm: d.altKm, kmFromNyc: d.kmFromNyc, daylight: d.daylight };
  if (!refreshIss.passes || Date.now() - refreshIss.passes.at > 600e3) {
    const q = meAt ? `?lat=${meAt.lat.toFixed(2)}&lon=${meAt.lng.toFixed(2)}` : "";
    getJSON(`/api/nyc/iss-passes${q}`).then((p) => { refreshIss.passes = { at: Date.now(), p }; seen.issPasses = p.passes.slice(0, 6); }).catch(() => {});
  }
  $("n-iss").innerHTML = `(${d.kmFromNyc.toLocaleString()} km away) <button class="linkish" data-fly="${d.lat},${d.lon},3">show</button>`;
}
function issPassHtml() {
  const p = refreshIss.passes?.p; if (!p) return "";
  const vis = p.passes.filter((x) => x.visibleToEye).slice(0, 3), next = p.passes.slice(0, 3);
  return `<br><b>Over ${meAt ? "you" : "NYC"}</b>${vis.length ? `: you can see it <ul style="margin:2px 0 0 16px;padding:0">${vis.map((x) => `<li>${esc(x.rise)}, ${x.minutes} min, up to ${x.maxElevation}° · ${esc(x.path)}</li>`).join("")}</ul>` : `: no visible passes in the next 3 days (they happen only at dusk or dawn)`}
    <span class="muted">Next passes (daylight too): ${next.map((x) => `${esc(x.rise)} (${x.maxElevation}°)`).join(" · ")}</span>`;
}
async function loadIss(g) {
  await refreshIss(g);
  setInterval(() => { if (LAYERS.iss.on) refreshIss(g).catch(() => {}); }, 10_000);
}

// Tropical storms: NHC forecast cones, tracks and points (NOAA), plus each storm on the legend.
async function loadStorms(g) {
  const d = await getJSON("/api/nyc/storms");
  L.geoJSON(d.cone, { style: { color: "#ff8fab", weight: 1, fillOpacity: 0.12 } }).addTo(g);
  L.geoJSON(d.past, { style: { color: "#c9c9c9", weight: 2, dashArray: "3 5" } }).addTo(g);
  L.geoJSON(d.track, { style: { color: "#ff5c8a", weight: 2.5 } }).addTo(g);
  L.geoJSON(d.points, { pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: "#fff", weight: 1, fillColor: "#ff5c8a", fillOpacity: 0.9 })
    .bindTooltip(`${esc(f.properties.stormname ?? "")}: ${esc(f.properties.datelbl ?? "")}${f.properties.maxwind ? ` · ${f.properties.maxwind} kt` : ""}`) }).addTo(g);
  for (const st of d.storms) pin(st.lat, st.lon, "🌀", "#ff5c8a", 28).bindPopup(`<b>🌀 ${esc(st.name)}</b>: ${esc(st.kind)}, ${st.windKt} kt, ${st.pressureMb} mb<br>moving ${esc(st.moving)} · ${st.kmFromNyc.toLocaleString()} km from NYC${st.advisory ? `<br><a href="${esc(st.advisory)}" target="_blank" rel="noopener">NHC advisory</a>` : ""}`).addTo(g);
  seen.storms = d.storms.map((st) => `${st.name}: ${st.kind}, ${st.windKt} kt, ${st.kmFromNyc} km from NYC, moving ${st.moving}`);
  $("n-storms").innerHTML = d.storms.length ? d.storms.map((st) => `<button class="linkish" data-fly="${st.lat},${st.lon},5">${esc(st.name)}</button>`).join(", ") : "(none active)";
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-trail]"), f = e.target.closest("[data-fly]");
  if (t) showTrail(t.dataset.trail);
  if (f) { const [la, lo, z] = f.dataset.fly.split(",").map(Number); map.setView([la, lo], z); }
});

// windy.com's forecast map (wind, rain, temperature…) with its own legend. Its API needs its own Leaflet 1.4 map, so it
// runs in nyc/windy.html, in an iframe laid exactly under this map. While it's on, our street tiles hide and our map
// turns see-through: every marker stays visible and clickable on top, and our map drives Windy's view as it moves.
let windyFrame = null, maxZoomBefore = null, windyAt = null; // windyAt: the view Windy was last sent [lat, lon, zoom]
$("n-windy").innerHTML = `<select id="windyOverlay" aria-label="Windy forecast layer">${["wind", "rain", "temp", "clouds", "gust", "pressure", "rh", "thunder"].map((o) => `<option>${o}</option>`).join("")}</select>`;
const windyView = () => { const c = map.getCenter(); return [+c.lat.toFixed(5), +c.lng.toFixed(5), map.getZoom()]; };
const placeWindy = () => { if (!windyFrame) return; const r = $("map").getBoundingClientRect(); Object.assign(windyFrame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); };
// Windy only shows whole zoom levels, so mid-pinch (fractional zoom) its last frame is stretched and moved to match
// ours instead, and it gets the new view when the gesture settles on a whole level.
function syncWindy() {
  if (!windyFrame) return;
  if (map.getZoom() % 1 === 0) { windyAt = windyView(); windyFrame.style.transform = ""; return windyFrame.contentWindow?.postMessage({ view: windyAt }, location.origin); }
  if (!windyAt) return;
  const p = map.latLngToContainerPoint(windyAt), size = map.getSize();
  windyFrame.style.transform = `translate(${p.x - size.x / 2}px, ${p.y - size.y / 2}px) scale(${map.getZoomScale(map.getZoom(), windyAt[2])})`;
}
function showWindy(on) {
  document.body.classList.toggle("windy-on", on);
  if (!on) {
    windyFrame?.remove(); windyFrame = null;
    if (maxZoomBefore !== null) { map.setMaxZoom(maxZoomBefore); maxZoomBefore = null; }
    return;
  }
  const [la, lo, z] = windyAt = windyView();
  windyFrame = Object.assign(document.createElement("iframe"), { id: "windyFrame", title: "windy.com forecast map", tabIndex: -1, src: `/nyc/windy.html#${la},${lo},${z},${$("windyOverlay").value}` });
  document.body.prepend(windyFrame);
  placeWindy();
}
map.on("move zoom", syncWindy);
addEventListener("resize", placeWindy);
$("windyOverlay").addEventListener("change", () => windyFrame?.contentWindow.postMessage({ overlay: $("windyOverlay").value }, location.origin));
addEventListener("message", (e) => {
  if (e.origin !== location.origin || !windyFrame || e.source !== windyFrame.contentWindow) return;
  if (e.data.windyReady) {
    const [overlays, maxZoom] = e.data.windyReady;
    $("windyOverlay").innerHTML = overlays.map((o) => `<option ${o === $("windyOverlay").value ? "selected" : ""}>${o}</option>`).join("");
    // beyond Windy's deepest zoom the two maps would no longer line up, so ours stops there too while it's on
    if (maxZoom && maxZoom < map.getMaxZoom()) { maxZoomBefore = map.getMaxZoom(); map.setMaxZoom(maxZoom); }
    syncWindy();
  }
  if (e.data.windyOverlay) $("windyOverlay").value = e.data.windyOverlay;
  // if Windy couldn't follow (outside its zoom range), ours goes where Windy is, so the markers stay on the right spots
  // (only an answer to the view we're at now: a late answer about an earlier view would pull the map back mid-gesture)
  if (e.data.windyZoom != null && e.data.asked === map.getZoom() && e.data.windyZoom !== e.data.asked) map.setZoom(e.data.windyZoom, { animate: false });
});

// Street photos from Mapillary (© Mapillary contributors, CC BY-SA 4.0): dots for the photos in view once zoomed in
// (newer = greener, rings = 360° photos); a click opens the photo in a window.
const photoById = new Map();
const photoTitle = (p) => `${new Date(p.at).toLocaleDateString([], { timeZone: NYTZ, year: "numeric", month: "short" })}${p.pano ? " · 360°" : ""}${p.by ? ` · by ${p.by}` : ""} · © Mapillary, CC BY-SA`;
async function loadPhotos(g) {
  g.clearLayers();
  if (map.getZoom() < 16) return ($("n-photos").textContent = "(zoom in closer to see them)");
  const b = map.getBounds(), list = await getJSON(`/api/nyc/photos?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",")}`);
  const now = Date.now();
  for (const p of list) {
    photoById.set(p.id, p);
    const years = (now - p.at) / (365 * 864e5), c = years < 1 ? "#5cff9d" : years < 4 ? "#a8e063" : "#8a93a3";
    L.circleMarker([p.lat, p.lon], { renderer: bikeCanvas, radius: 3.5 * DOT, color: p.pano ? "#fff" : c, weight: p.pano ? 1.5 : 1, fillColor: c, fillOpacity: 0.9, bubblingMouseEvents: false })
      .bindTooltip(photoTitle(p)).on("click", () => openPhoto(p)).addTo(g);
  }
  $("n-photos").innerHTML = `(${list.length} here) · © <a href="https://www.mapillary.com" target="_blank" rel="noopener">Mapillary</a>`;
}
let photoTimer = 0;
map.on("moveend", () => { if (LAYERS.photos.on) { clearTimeout(photoTimer); photoTimer = setTimeout(() => loadPhotos(LAYERS.photos.group).catch(() => {}), 400); } });
document.addEventListener("click", (e) => { const b = e.target.closest("[data-photo]"); if (b) openPhoto(photoById.get(b.dataset.photo)); });

// Street photos open in Mapillary's own viewer (MapillaryJS 4.1.2, MIT, loaded on first use): click the arrows or use
// the arrow keys to walk, drag to look around, 360° photos in 3D, like mapillary.com. It reads Mapillary's data through
// /api/mly/ (server.ts adds the token, so no key reaches the page). An arrow on the map shows where you are and face.
const MLY = "https://cdn.jsdelivr.net/npm/mapillary-js@4.1.2/dist/mapillary";
let mlyLib = null, mly = null, mlyMarker = null;
const loadMly = () => (mlyLib ??= new Promise((ok, fail) => {
  document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${MLY}.css`, integrity: "sha384-IamMZxz60pSNzUk3cW2nl3uYUdpiDoQpLJrBoAAezEE+QaOYCVA9rfi/8Cx0x15T", crossOrigin: "anonymous" }));
  document.head.append(Object.assign(document.createElement("script"), { src: `${MLY}.js`, integrity: "sha384-1AlAxcgdzKreJ5f2K+t7SW3pEE0ek9u3lUwlZXX+v+FtEk1tWSg6DBVLb3ZKhpB+", crossOrigin: "anonymous", onload: () => ok(window.mapillary), onerror: () => { mlyLib = null; fail(new Error("viewer didn't load")); } }));
}));
function mlyHere(lat, lon, bearing) { // the arrow on the map
  const ll = [lat, lon];
  if (!mlyMarker) mlyMarker = L.marker(ll, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: "", html: `<svg viewBox="0 0 20 20" width="28" height="28" style="filter:drop-shadow(0 0 2px #000)"><path d="M10 1 17 18 10 14 3 18Z" fill="#ff5c8a" stroke="#fff" stroke-width="1.5"/></svg>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
  else mlyMarker.setLatLng(ll);
  const svg = mlyMarker.getElement()?.querySelector("svg");
  if (svg && bearing != null) svg.style.transform = `rotate(${bearing}deg)`;
  if (!map.getBounds().pad(-0.15).contains(ll)) map.panTo(ll);
}
async function openPhoto(p) {
  if (mly && document.getElementById("cam-mly")) return mly.moveTo(String(p.id)).catch(() => {});
  const cam = { id: "mly", name: photoTitle(p), image: "", page: `https://www.mapillary.com/app/?pKey=${p.id}`, source: "Mapillary", static: true };
  openCam(cam);
  cam.id = `m${p.id}`; // the window stays "cam-mly"; ✨ upscales the photo you're on
  const w = document.getElementById("cam-mly"), box = Object.assign(document.createElement("div"), { className: "mlyview" });
  w.querySelector("img").replaceWith(box);
  Object.assign(w.style, { width: `${Math.min(640, innerWidth - 20)}px`, height: `${Math.min(460, innerHeight - 100)}px` }); camsInView();
  w.querySelector("button.x").addEventListener("click", () => { mly?.remove(); mly = null; mlyMarker?.remove(); mlyMarker = null; seen.photo = null; });
  const M = await loadMly().catch(() => null);
  if (!document.body.contains(w)) return; // closed meanwhile
  if (!M) { // no viewer: the plain photo, as before
    if (!p.thumb) Object.assign(p, (await getJSON(`/api/nyc/photo-images?ids=${p.id}`).catch(() => ({})))[p.id]);
    box.innerHTML = p.thumb ? `<img alt="Street photo" src="${esc(p.thumb)}" style="width:100%;height:100%;object-fit:contain">` : `<p class="muted">The street viewer didn't load.</p>`;
    return;
  }
  mly = new M.Viewer({ container: box, imageId: String(p.id), dataProvider: new M.GraphDataProvider({ endpoint: `${location.origin}/api/mly/` }), imageTiling: false, component: { cover: false } }); // tiles: Mapillary refuses our token there; the 2048 px photos do
  new ResizeObserver(() => mly?.resize()).observe(box);
  mly.on("image", ({ image }) => {
    const q = { at: image.capturedAt, pano: image.cameraType === "spherical" || image.cameraType === "equirectangular", by: image.creatorUsername };
    cam.id = `m${image.id}`;
    w.querySelector("header b").textContent = `📸 ${photoTitle(q)}`;
    w.querySelector("header a").href = `https://www.mapillary.com/app/?pKey=${image.id}`;
    mlyHere(image.lngLat.lat, image.lngLat.lng, null);
    seen.photo = { taken: new Date(image.capturedAt).toISOString().slice(0, 10), by: image.creatorUsername, lat: image.lngLat.lat, lon: image.lngLat.lng };
  });
  mly.on("bearing", ({ bearing }) => { const ll = mlyMarker?.getLatLng(); if (ll) mlyHere(ll.lat, ll.lng, bearing); });
}

// ---------- one building: conditions from city records, owners from Who Owns What (server/nycapi.ts buildingReport) ----------
// The popup keeps the counts; "details" opens the drawer with what's behind them (each violation, complaint, filing, case).
const CLS = { C: ["immediately hazardous", "#e03131"], B: ["hazardous", "#f08c00"], A: ["non-hazardous", "#868e96"], I: ["order", "#7048e8"] };
const bbYear = (y) => y?.[0] && `${y[0].from.slice(0, 7)} – ${y[0].to.slice(0, 7)}`, bbSum = (y, k) => (y ?? []).reduce((n, x) => n + x[k], 0);
let bldgNow = null;
function buildingHtml(r) {
  if (!r?.found) return `<p class="muted">No building record found for this address.</p>`;
  bldgNow = r;
  const b = r.building, v = r.hpdOpenViolations, w = r.whoOwnsWhat, L2 = r.links, a = (u, t) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : ""), more = (sec, t) => `<button type="button" class="linkish" data-bopen="${sec}">${t}</button>`;
  const y = r.bedbugs?.latestYear, pending = (r.litigation ?? []).filter((c) => c.status === "Pending").length, aep = r.worstBuildingsProgram;
  return `<div style="margin:6px 0;padding:6px 8px;border-left:3px solid var(--line)">
    ${aep?.status === "AEP Active" ? `<div style="color:#e03131"><b>On HPD's worst-buildings list</b> since ${esc(aep.since)}</div>` : ""}
    ${b ? `<div>Built ${b.yearBuilt ?? "?"} · ${b.floors ?? "?"} floors · ${b.residentialUnits} apartments${b.totalUnits > b.residentialUnits ? ` of ${b.totalUnits} units` : ""}</div>` : ""}
    ${v ? `<div>HPD open violations: <b>${v.total}</b>${v.total ? ` <span class="muted">(<span style="color:#e03131">${v.immediatelyHazardousC} immediately hazardous</span>, ${v.hazardousB} hazardous, ${v.nonHazardousA + (v.ordersI ?? 0)} other)</span> ${more("v", "what are they?")}` : ""}</div>` : ""}
    ${r.tenantComplaintsLastYear?.length ? `<div>Tenant complaints, last 12 months: ${r.tenantComplaintsLastYear.map((c) => `${esc(c.kind.toLowerCase())} ${c.n}`).join(", ")} ${more("c", "details")}</div>` : r.tenantComplaintsLastYear ? `<div>No tenant complaints to HPD in 12 months</div>` : ""}
    ${y?.length ? `<div>Bedbugs, owner's filing for ${esc(bbYear(y))}: ${bbSum(y, "infested") ? `<b style="color:#e03131">${bbSum(y, "infested")} of ${bbSum(y, "units")} apartments</b>` : "none"} ${more("b", "history")}</div>` : ""}
    ${pending ? `<div>Housing court (HPD): <b>${pending} pending case${pending > 1 ? "s" : ""}</b> ${more("l", "details")}</div>` : ""}
    ${r.dobActiveComplaints != null ? `<div>Active DOB complaints: ${r.dobActiveComplaints}</div>` : ""}
    ${r.rats?.latest ? `<div>Rats: last inspection ${esc(r.rats.latest.date)}, ${esc(r.rats.latest.result.toLowerCase())}${r.rats.failedForRatsIn2Years ? ` · <b>${r.rats.failedForRatsIn2Years}</b> failed for rats in 2 years` : ""}</div>` : ""}
    ${w ? `<div>Owner: ${esc([...w.companies, ...w.owners.slice(0, 2)].join("; ") || b?.ownerOnTaxRolls || "?")}</div>${w.portfolio?.buildings > 1 ? `<div>Same landlord: ${w.portfolio.buildings} buildings, ${w.portfolio.units} units, ${w.portfolio.openViolations} open violations, ${w.portfolio.evictions} evictions</div>` : ""}` : b?.ownerOnTaxRolls ? `<div>Owner on tax rolls: ${esc(b.ownerOnTaxRolls)}</div>` : ""}
    <div>${more("v", "🏠 All the details")} · ${[a(L2.whoOwnsWhat, "Who Owns What"), a(L2.hpdOnline, "HPD Online"), a(L2.dobBis, "DOB BIS"), a(L2.acris, "ACRIS deeds"), a(L2.council, `Council district ${esc(r.councilDistrict ?? "")}`)].filter(Boolean).join(" · ")}</div>
    </div>`;
}
/** The drawer for one building: every open violation (what it orders fixed, where, by when), the year's complaints and what
 *  the inspector found, the bedbug filings, HPD's court cases. */
function openBuilding(r, sec = "v") {
  const ov = r.openViolations ?? [], cs = r.complaints ?? [], bb = r.bedbugs?.latestYear ?? [], lit = r.litigation ?? [], aep = r.worstBuildingsProgram, v = r.hpdOpenViolations;
  const tag = (c) => `<b style="color:${CLS[c]?.[1] ?? "inherit"}" title="Class ${esc(c)}: ${esc(CLS[c]?.[0] ?? "")}">${esc(c)}</b>`;
  showDrawer("🏠", r.address, `<div class="muted">${esc([r.neighborhood, r.building?.yearBuilt && `built ${r.building.yearBuilt}`, r.building && `${r.building.residentialUnits} apartments`].filter(Boolean).join(" · "))}</div>
    ${aep ? `<p${aep.status === "AEP Active" ? ' style="color:#e03131"' : ""}><b>HPD's Alternative Enforcement Program</b> (the city's worst-maintained buildings): ${aep.status === "AEP Active" ? `in it since ${esc(aep.since)}` : `was in it from ${esc(aep.since)} to ${esc(aep.discharged ?? "?")}`}, with ${aep.bcViolationsAtStart} B and C violations when it went in.</p>` : ""}
    <h4 id="bsec-v">Open HPD violations: ${v?.total ?? 0}</h4>
    <p class="muted">A violation is HPD's order to fix something an inspector saw. ${tag("C")} immediately hazardous (24 hours: no heat or hot water, lead paint, mold, vermin), ${tag("B")} hazardous (30 days), ${tag("A")} non-hazardous (90 days), ${tag("I")} an order (a vacate order, a program). "Open" means the owner hasn't certified the fix yet; some are years old.</p>
    ${ov.length ? `<ul>${ov.map((x) => `<li>${tag(x.cls)} ${esc(x.what)}${x.apt ? ` <span class="muted">· apt ${esc(x.apt)}</span>` : x.story ? ` <span class="muted">· floor ${esc(x.story)}</span>` : ""}<br><span class="muted">seen ${esc(x.inspected ?? "?")}${x.correctBy ? `, fix by ${esc(x.correctBy)}` : ""} · ${esc(x.status)}</span></li>`).join("")}</ul>${(v?.total ?? 0) > ov.length ? `<p class="muted">The first ${ov.length} of ${v.total}: the rest on HPD Online.</p>` : ""}` : `<p class="muted">None.</p>`}
    <h4 id="bsec-c">Tenant complaints to HPD, 12 months: ${cs.length}${cs.length === 40 ? "+" : ""}</h4>
    ${cs.length ? `<ul>${cs.map((x) => `<li>${esc(x.at)} <b>${esc(x.kind)}</b> ${esc(x.what)}${x.apt && x.apt !== "BLDG" ? ` <span class="muted">· apt ${esc(x.apt)}</span>` : ""} <span class="muted">· ${esc(x.urgency)} · ${esc(x.status)}</span>${x.found ? `<br><small class="muted">${esc(x.found)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="muted">None.</p>`}
    <h4 id="bsec-b">Bedbugs</h4>
    <p class="muted">Every November owners must file how many apartments had bedbugs in the year before, how many were treated and how many came back (one filing per building on the lot). The owner reports it; HPD doesn't inspect for it.</p>
    ${bb.length ? `<p>${esc(bbYear(bb))}: <b>${bbSum(bb, "infested")}</b> of ${bbSum(bb, "units")} apartments infested, ${bbSum(bb, "eradicated")} treated, ${bbSum(bb, "reinfested")} came back <span class="muted">(filed ${esc(bb[0].filed)})</span>; ${r.bedbugs.filings} filings on record.</p>` : `<p class="muted">No filing on record.</p>`}
    <h4 id="bsec-l">Housing court: HPD's cases against the owner</h4>
    ${lit.length ? `<ul>${lit.map((x) => `<li>${esc(x.opened)} <b>${esc(x.type)}</b> <span class="muted">· ${esc(x.status)}${x.judgement ? " · judgment against the owner" : ""}</span></li>`).join("")}</ul>` : `<p class="muted">None on record.</p>`}
    <p class="muted">${esc(r.sources)}. <a href="${esc(r.links.whoOwnsWhat)}" target="_blank" rel="noopener">Who Owns What</a> · <a href="${esc(r.links.hpdOnline)}" target="_blank" rel="noopener">HPD Online</a></p>`);
  if (sec !== "v") document.getElementById(`bsec-${sec}`)?.scrollIntoView({ block: "start" });
}
document.addEventListener("click", (e) => { const t = e.target.closest("[data-bopen]"); if (t && bldgNow) { e.stopPropagation(); openBuilding(bldgNow, t.dataset.bopen); } }, true);

// ---------- privately owned public spaces (City Planning's APOPS): plazas, atriums and arcades open to everyone ----------
async function loadPops(g) {
  const list = await getJSON("/api/nyc/pops");
  for (const x of list) pin(x.lat, x.lon, "🪑", x.indoor ? "#1971c2" : "#2f9e44", 20).bindTooltip(`🪑 ${esc(x.name)}`)
    .bindPopup(`<b>🪑 ${esc(x.name)}</b> <span class="muted">${esc(x.type)}${x.indoor ? " · indoors" : ""}</span><br>${esc(x.address)}${x.hours ? `<br>Open: ${esc(x.hours)}` : ""}${x.amenities ? `<br>${esc(x.amenities)}` : ""}<br><a href="${esc(x.url)}" target="_blank" rel="noopener">APOPS page</a><br><span class="muted">Privately owned public space: open to everyone by law. City Planning via NYC Open Data</span>`, { maxWidth: 300 }).addTo(g);
  $("n-pops").textContent = `(${list.length}, ${list.filter((x) => x.indoor).length} indoors)`;
}

// ---------- public restrooms (NYC Open Data), as a layer and in the 600 m circle ----------
let loosCache = null, camsCache = null;
const restroomMarker = (r) => { const ok = r.status === "Operational"; return pin(r.lat, r.lon, "🚻", ok ? "#2f9e44" : "#868e96", 22, !ok)
  .bindTooltip(`🚻 ${esc(r.name)}`).bindPopup(`<b>🚻 ${esc(r.name)}</b> <span class="muted">${esc(r.type)}${r.operator ? ` · ${esc(r.operator)}` : ""}</span><br>${ok ? "Open" : `<b>${esc(r.status)}</b>`}${r.open ? ` · ${esc(r.open)}` : ""}${r.hours ? ` · ${esc(r.hours)}` : ""}${r.accessibility ? `<br>${esc(r.accessibility)}` : ""}${r.kind ? ` · ${esc(r.kind)}` : ""}${r.changing ? " · 🚼 changing station" : ""}${r.website ? `<br><a href="${esc(r.website)}" target="_blank" rel="noopener">website</a>` : ""}<br><span class="muted">NYC Open Data: public restrooms</span>`, { maxWidth: 300 }); };
async function loadRestrooms(g) {
  const list = await (loosCache ??= getJSON("/api/nyc/restrooms"));
  for (const r of list) restroomMarker(r).addTo(g);
  const ok = list.filter((r) => r.status === "Operational").length;
  seen.restrooms = { total: list.length, open: ok };
  $("n-restrooms").textContent = `(${ok} open, ${list.length - ok} closed)`;
}

// ---------- within 600 m: subway stations and their alerts, bus stops, Citi Bike, cameras and restrooms around a point, on their own layer ----------
const NEAR_M = 600, nearLayer = L.layerGroup().addTo(map);
const distM = (a, b) => { const k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
let near = null;
async function nearMe(at, label = "you") {
  at = { lat: at.lat, lon: at.lon ?? at.lng };
  near = { ...at, items: [] }; nearLayer.clearLayers(); drawBar();
  $("nearBox").hidden = false; $("nearBox").textContent = "Looking around…"; $("nearOff").hidden = false;
  const circle = L.circle([at.lat, at.lon], { radius: NEAR_M, color: "#5cff9d", weight: 1.5, dashArray: "6 4", fillOpacity: 0.06, interactive: false }).addTo(nearLayer);
  map.fitBounds(circle.getBounds(), { padding: [24, 24] });
  const within = (list) => list.map((x) => ({ ...x, m: Math.round(distM(at, x)) })).filter((x) => x.m <= NEAR_M).sort((a, b) => a.m - b.m);
  // stations and bikes are already loaded; bus stops come by grid cell (the cells around the circle); cameras and restrooms once
  const cells = new Set(); for (const dl of [-0.004, 0, 0.004]) for (const dn of [-0.005, 0, 0.005]) cells.add(`${(Math.round((at.lat + dl) / BUS_GRID) * BUS_GRID).toFixed(4)},${(Math.round((at.lon + dn) / BUS_GRID) * BUS_GRID).toFixed(4)}`);
  const [stopLists, cams, loos, city] = await Promise.all([
    Promise.all([...cells].map((c) => { const [la, lo] = c.split(","); return getJSON(`/api/nyc/bus-stops?lat=${la}&lon=${lo}`).catch(() => []); })),
    (camsCache ??= getJSON("/api/nyc/cameras")).catch(() => []), (loosCache ??= getJSON("/api/nyc/restrooms")).catch(() => []),
    getJSON(`/api/nyc/around?lat=${at.lat}&lon=${at.lon}&r=${NEAR_M}`).catch(() => null), // the city's live picture here (city.ts)
  ]);
  if (near?.lat !== at.lat) return; // superseded
  const items = [], add = (kind, label, marker, meta = {}) => { marker.addTo(nearLayer); items.push({ kind, label, marker, ...meta }); };
  for (const c of city?.incidents ?? []) add("incident", `${FAM_ICON[famOf(c)]} ${esc(c.title)} <span class="muted">(likely ${Math.round((c.probability ?? 0) * 100)}%, ${c.sources.map(srcName).join(" + ")}, ${hhmm(c.starts)})</span> · ${Math.round(distM(at, c))} m`,
    L.marker([c.lat, c.lon], { icon: incIcon(c), title: c.title }).on("click", () => openDetail(c)), { inc: c });
  for (const n of (city?.news ?? []).filter((n) => n.lat != null && distM(at, n) <= Math.max(NEAR_M, 800))) add("news", `📰 ${esc(n.title)} <span class="muted">(${esc(n.outlet)}, ${hhmm(n.starts)})</span> · ${Math.round(distM(at, n))} m`,
    L.marker([n.lat, n.lon], { icon: L.divIcon({ className: "cam-icon", html: "📰", iconSize: [18, 18] }) }).bindPopup(newsPopup(n), { maxWidth: 320 }));
  for (const e of (city?.planned ?? []).filter((e) => e.lat != null)) add("planned", `🚧 ${esc(e.title)} · ${Math.round(distM(at, e))} m`,
    planPin(e).bindPopup(`<b>${esc(e.title)}</b>${e.where ? `<br>${esc(e.where)}` : ""}${e.text ? `<br><small>${esc(e.text.slice(0, 300))}</small>` : ""}`));
  for (const s of within([...stations].map(([id, x]) => ({ id, ...x })))) {
    const alerts = (byStation.get(s.id) ?? []).filter((a) => !hidden.has(a.type)), red = alerts.length > 0;
    add("subway", `🚇 ${esc(s.name)} <span class="muted">(${esc(s.routes)})</span> · ${s.m} m${red ? ` · <b style="color:var(--alert)">${alerts.length} alert${alerts.length > 1 ? "s" : ""}</b>` : ""}`,
      pin(s.lat, s.lon, "🚇", red ? css("--alert") : "#9aa3cf", red ? 26 : 22).bindTooltip(`🚇 ${esc(s.name)} (${esc(s.routes)})`).bindPopup("Loading…", { maxWidth: 320 })
        .on("popupopen", async (ev) => { if (red) showBikes(s); ev.popup.setContent((red ? popup(s, alerts) : `<b>${esc(s.name)}</b> <span class="muted">${esc(s.routes)}</span>`) + await arrivalsHtml(s.id)); }).on("popupclose", () => bikeLayer.clearLayers()), { alerts: alerts.length });
  }
  for (const st of within([...new Map(stopLists.flat().map((x) => [x.id, x])).values()]))
    add("bus", `🚌 ${esc(st.name)} <span class="muted">(${esc(st.routes.map((r) => r.name).join(", "))})</span> · ${st.m} m`, pin(st.lat, st.lon, "🚌", "#1c7ed6", 22).bindTooltip(`🚌 ${esc(st.name)}`).bindPopup("Loading…", { maxWidth: 320 }).on("popupopen", async (ev) => ev.popup.setContent(await busStopHtml(st))));
  for (const b of within(allBikes)) { const c = BIKE_COLORS[bikeState(b)]; add("bike", `🚲 ${esc(b.name)}: ${b.bikes} bikes (${b.ebikes} e), ${b.docks} docks · ${b.m} m`, pin(b.lat, b.lon, "🚲", c, 22, bikeState(b) === "off").bindTooltip(`🚲 ${esc(b.name)}`).bindPopup(`<b>🚲 ${esc(b.name)}</b><br>${b.renting ? `${b.bikes} bikes (${b.ebikes} electric) · ${b.docks} free docks` : "Not renting right now"}`)); }
  for (const c of within(cams)) add("camera", `${camEmoji(c)}${camQ(c) ? ` <b>${camQ(c)}</b>` : ""} ${esc(c.name)} · ${c.m} m`, camMarker(c), { cam: c });
  for (const r of within(loos)) add("restroom", `🚻 ${esc(r.name)} <span class="muted">(${esc(r.type)}${r.status !== "Operational" ? `, ${esc(r.status.toLowerCase())}` : ""}${r.hours ? `, ${esc(r.hours)}` : ""})</span> · ${r.m} m`, restroomMarker(r));
  near.items = items;
  const n = (k) => items.filter((i) => i.kind === k).length, withAlerts = items.filter((i) => i.alerts).length;
  const r311 = city?.reports311?.byType ?? [];
  $("nearBox").innerHTML = `<b>Within ${NEAR_M} m of ${esc(label)}:</b> ⚠ ${n("incident")} · 🚧 ${n("planned")}${n("news") ? ` · 📰 ${n("news")}` : ""} · 🚇 ${n("subway")}${withAlerts ? ` (${withAlerts} with alerts)` : ""} · 🚌 ${n("bus")} · 🚲 ${n("bike")} · 📷 ${n("camera")} · 🚻 ${n("restroom")}
    ${city?.areaWide?.length ? `<div>⛈ ${city.areaWide.map((e) => esc(e.title)).join(" · ")}</div>` : ""}${(city?.unusual ?? []).map((u) => `<div>📈 ${esc(u.text)}</div>`).join("")}
    ${r311.length ? `<div>📞 311 here, last 7 days${city.reports311.newest ? ` (published to ${new Date(city.reports311.newest).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" })})` : ""}: ${r311.map((t) => `${esc(t.type)} ${t.n}`).join(", ")}</div>` : ""}
    <ul>${items.map((i, k) => `<li data-near="${k}">${i.label}</li>`).join("") || `<li>Nothing within ${NEAR_M} m.</li>`}</ul>`;
  $("nearBox").querySelectorAll("[data-near]").forEach((li) => (li.onclick = () => { const it = items[+li.dataset.near]; if (it.cam) openCam(it.cam); else if (it.inc) openDetail(it.inc); else { map.setView(it.marker.getLatLng(), Math.max(map.getZoom(), 17)); it.marker.openPopup(); } }));
  seen.near = { center: at, radiusM: NEAR_M, counts: { incidents: n("incident"), closuresAndPermits: n("planned"), reports311LastWeek: r311, unusual: city?.unusual?.map((u) => u.text), areaWideAlerts: city?.areaWide?.map((e) => e.title), subway: n("subway"), stationsWithAlerts: withAlerts, busStops: n("bus"), citiBike: n("bike"), cameras: n("camera"), restrooms: n("restroom") }, items: items.slice(0, 40).map((i) => i.label.replace(/<[^>]+>/g, "")) };
  return $("nearBox");
}
function whereAmI() {
  if (meAt) return Promise.resolve(meAt);
  return new Promise((resolve, reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), (e) => reject(new Error(e.message)), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }) : reject(new Error("no geolocation")));
}
$("nearBtn").onclick = async () => { $("nearBox").hidden = false; $("nearBox").textContent = "Finding you…"; try { await nearMe(await whereAmI(), "you"); } catch (e) { $("nearBox").textContent = `Couldn't get your location (${e.message}). Allow location for this site, or use the map center.`; } };
$("nearHere").onclick = () => nearMe(viewCenter(), "the map center");
$("nearOff").onclick = () => { near = null; nearLayer.clearLayers(); seen.near = null; $("nearBox").hidden = true; $("nearOff").hidden = true; drawBar(); };

// "Nearest traffic camera" from anything with a place: 311 reports, events, low aircraft…
const camLists = new Map(); // per area ("" = NYC)
// The best street photo near a point (Mapillary, server/sky.ts photoNear), asked once per ~10 m spot. Every popup on a
// place, the incident drawer and "what's here" show it; a click opens the street viewer.
const photos = new Map(); // "lat,lon" → { v: photo | null (none near) | undefined (still looking), p: promise }
function photoAt(lat, lon) {
  const k = `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;
  let e = photos.get(k);
  if (!e) { e = {}; e.p = getJSON(`/api/nyc/photo-near?lat=${(+lat).toFixed(6)}&lon=${(+lon).toFixed(6)}`).catch(() => null).then((ph) => (e.v = ph ?? null)); photos.set(k, e); }
  return e;
}
const photoHtml = (ph) => ph === undefined ? "📸 looking for a street photo…" : !ph ? "No street photo within ~300 m."
  : (photoById.set(ph.id, ph), `<button class="linkish" data-photo="${esc(ph.id)}" title="Open the street view" style="display:block;width:100%;margin-top:6px"><img src="${esc(ph.thumb)}" alt="Street photo near here"></button><span class="muted">📸 ${ph.meters} m away · ${esc(photoTitle(ph))}</span>`);
const dirBtns = (lat, lon) => `<div class="here-dir"><button data-dir="tFrom" data-ll="${(+lat).toFixed(6)},${(+lon).toFixed(6)}">↱ Directions from here</button> <button data-dir="tTo" data-ll="${(+lat).toFixed(6)},${(+lon).toFixed(6)}">to here</button></div>`;
const camBtn = (lat, lon) => `<button class="linkish" data-near="${(+lat).toFixed(5)},${(+lon).toFixed(5)}">📷 nearest camera</button>`;
async function nearestCam(lat, lon) {
  const inCity = lat > 40.4 && lat < 41 && lon > -74.3 && lon < -73.6, q = inCity ? "" : `lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  if (!camLists.has(q)) camLists.set(q, await getJSON(`/api/nyc/cameras?${q}`));
  const camList = camLists.get(q), k = Math.cos((lat * Math.PI) / 180);
  if (!camList.length) return void dispatchEvent(new CustomEvent("blip:say", { detail: { text: "No camera I know of around there." } }));
  return camList.reduce((best, c) => ((c.lat - lat) ** 2 + ((c.lon - lon) * k) ** 2 < (best.lat - lat) ** 2 + ((best.lon - lon) * k) ** 2 ? c : best));
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-near]");
  if (!b) return;
  const [la, lo] = b.dataset.near.split(",").map(Number);
  const c = await nearestCam(la, lo); if (c) openCam(c);
});
// Every popup about a place (a station, a bike dock, a ferry stop, an outage, a report, a news story, a restaurant…) gets
// its street photo, directions from/to it and the nearest camera: hooked where Leaflet renders popup content, so it also
// survives a popup that fills in later. Not on moving things (their popups don't auto-pan), cameras, or outside the city.
{
  const render = L.Popup.prototype._updateContent;
  L.Popup.prototype._updateContent = function () {
    render.call(this);
    if (innerWidth < 700) { this.options.maxWidth = Math.min(this.options.maxWidth ?? 300, innerWidth - 70); this.options.autoPanPaddingBottomRight = L.point(10, ($("panel")?.offsetHeight ?? 0) + 16); } // phones: fit the screen, stay above the sheet
    const node = this._contentNode, ll = this.getLatLng?.();
    if (!node || !ll || node.querySelector(".iss-live") || this._source?.options?.icon?.options?.className === "cam-icon") return; // not on cameras, nor in space
    if (/^(Loading…|Looking up…|Couldn't|That train|That bus|No NYC address)/.test(node.textContent.trim())) return;
    const place = this.options.autoPan !== false && NYC.pad(0.2).contains(ll);
    if (place && !node.querySelector(".here-photo")) {
      const e = photoAt(ll.lat, ll.lng);
      node.insertAdjacentHTML("beforeend", `<div class="here-photo muted">${photoHtml(e.v)}</div>`);
      if (e.v === undefined) e.p.then(() => this.isOpen() && this.update()); // re-rendered with the photo in (update() re-pans too)
    }
    node.insertAdjacentHTML("beforeend", `<div class="cam-foot">${node.querySelector("[data-near]") ? "" : camBtn(ll.lat, ll.lng)}${place && !node.querySelector(".here-dir") ? dirBtns(ll.lat, ll.lng) : ""}</div>`);
  };
}

async function loadCityEvents(g) {
  const list = await getJSON(`/api/nyc/city-events?from=${nyToday()}&free=1`);
  seen.city = list.map((e) => ({ name: e.name, when: e.when, place: e.place }));
  for (const e of list.filter((e) => e.lat)) pin(e.lat, e.lon, "🏛", "#5cff9d").bindPopup(`<b>${esc(e.name)}</b><br>${esc(e.when)}<br><span class="muted">${esc(e.place)}</span><br>${esc(e.summary)}<br><a href="${esc(e.url)}" target="_blank" rel="noopener">details</a> · ${camBtn(e.lat, e.lon)}`).addTo(g);
  $("n-city").textContent = `(${list.length})`;
}

async function loadPopups(g) {
  const { events } = await getJSON("/api/nyc/events");
  // The same rule as Free NYC: on today's dates or weekdays, and not over yet.
  const list = events.map((e) => ({ ...e, on: onDate(e, nyToday(), new Date()) })).filter((e) => e.lat && e.on && status(e.on, new Date()) !== "over");
  seen.popups = list.map((e) => ({ title: e.title, category: e.category, time: [e.on.start, e.on.end].filter(Boolean).join("–"), address: e.address }));
  for (const e of list) pin(e.lat, e.lon, "🎁", "#ffd166").bindPopup(`<b>${esc(e.title)}</b><br>${esc(e.category)} · ${esc([e.on.start, e.on.end].filter(Boolean).join("–") || "all day")}<br><span class="muted">${esc(e.address)}</span><br><a href="${esc(e.url)}" target="_blank" rel="noopener">details on NYC for FREE</a> · ${camBtn(e.lat, e.lon)}`).addTo(g);
  $("n-popups").textContent = `(${list.length})`;
}

// 311: what neighbors reported lately, for the area on screen (reloads when you pan; needs a zoomed-in view).
const C311 = (t) => /noise/i.test(t) ? "#c59bff" : /heat|water|plumb/i.test(t) ? "#ff9f1c" : /park|vehicle|blocked/i.test(t) ? "#4de1ff" : /sanit|dirty|rodent|trash|litter/i.test(t) ? "#83c167" : "#ff5c8a";
async function load311(g) {
  const b = map.getBounds();
  if (b.getNorth() - b.getSouth() > 0.2 || b.getEast() - b.getWest() > 0.3) { g.clearLayers(); $("n-c311").textContent = "(zoom in to see reports)"; return; }
  const d = await getJSON(`/api/nyc/311?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => v.toFixed(4)).join(",")}`);
  g.clearLayers();
  for (const r of d.items) L.circleMarker([r.lat, r.lon], { renderer: bikeCanvas, radius: 4 * DOT, color: C311(r.type), fillColor: C311(r.type), fillOpacity: 0.8, weight: 1, bubblingMouseEvents: false })
    .bindPopup(`<b>${esc(r.type)}</b><br>${esc(r.what)}<br><span class="muted">${esc(r.address)} · ${new Date(r.at).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${esc(r.status)} (${esc(r.agency)})</span><br>${camBtn(r.lat, r.lon)}`).addTo(g);
  const top = Object.entries(d.items.reduce((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("n-c311").innerHTML = `(${d.items.length} here, data up to ${new Date(d.asOf).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric" })})<br><span class="legend"><i style="background:#c59bff"></i>noise <i style="background:#ff9f1c"></i>heat/water <i style="background:#4de1ff"></i>parking <i style="background:#83c167"></i>sanitation <i style="background:#ff5c8a"></i>other</span>`;
  seen.c311 = { inView: d.items.length, topTypes: top.map(([t, n]) => `${t}: ${n}`) };
}
map.on("moveend", () => { if (LAYERS.c311.on) load311(LAYERS.c311.group).catch(() => {}); });

async function loadSales(g) {
  const d = await getJSON(`/api/nyc/deals?date=${nyToday()}`);
  const list = d.sampleSales.filter((s) => s.lat);
  seen.sales = d.sampleSales.map((s) => ({ name: s.name, where: s.lat ? s.place : "online", until: s.end.slice(0, 10) }));
  for (const s of list) pin(s.lat, s.lon, "🛍", "#c59bff").bindPopup(`<b>🛍 ${esc(s.name)}</b><br><span class="muted">${esc(s.place)} · until ${esc(s.end.slice(0, 10))}</span><br>${esc(s.summary)}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">details on Chicmi</a> · ${camBtn(s.lat, s.lon)}`).addTo(g);
  $("n-sales").textContent = `(${list.length} on the map, ${d.sampleSales.length - list.length} online)`;
}

// ---------- the city's live picture (server/city.ts): the city bar and its lists, incidents, closures, alerts, flooding, news, areas ----------
const SEV = ["#8f96b8", "#ffb347", "#ff6b35", "#e03131"], hhmm = (t) => new Date(t * 1000).toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" });
const SOURCES = { notify: "Notify NYC", "511ny": "511NY", waze: "Waze drivers", adsb: "aircraft tracking", floodnet: "FloodNet", noaa: "NOAA", nws: "NWS", vision: "camera check", air: "air sensors", permits: "NYC permits", film: "film permits", news: "news" };
const srcName = (s) => SOURCES[s] ?? (s.startsWith("news:") ? "news" : s); // "news:<story id>": one story, one witness
const ago = (t) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t * 1000).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" }); };
const evLine = (e) => `<li><b>${esc(e.title)}</b> <span class="muted">${esc(e.outlet ?? srcName(e.source))} · ${hhmm(e.starts)}${e.ends && e.source !== "news" ? `–${hhmm(e.ends)}` : ""}</span>${e.text || e.summary ? `<br><small>${esc((e.text || e.summary).slice(0, 220))}</small>` : ""}${e.source === "news" ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">read</a>` : ""}</li>`;
function incidentPopup(c) {
  return `<b>${esc(c.title)}</b><br><span class="muted">${c.events.length} report${c.events.length > 1 ? "s" : ""} from ${c.sources.map(srcName).join(" + ")} · severity ${c.sev}/3 · since ${hhmm(c.starts)}${c.hood || c.borough ? ` · ${esc([c.hood, c.borough].filter(Boolean).join(", "))}` : ""}</span>
    ${c.rough ? `<br><span class="muted">📍 Rough place: the story names only the neighborhood (dashed circle).</span>` : ""}
    <br><b>Likely ${Math.round((c.probability ?? 0) * 100)}%</b> <span class="muted">${(c.why ?? []).map(esc).join(" + ")}${c.confidence > 1 ? ` · ${c.confidence} independent sources agree` : " · one source so far"} · <a href="./review.html" title="How each source's reliability is measured">how</a></span>
    <ul style="margin:6px 0;padding-left:16px;max-height:160px;overflow:auto">${c.events.map(evLine).join("")}</ul>
    ${c.checkedBy?.length ? `<div class="muted">👁 ${c.checkedBy.map((v) => `<a href="${esc(v.url)}">${esc(v.title)}</a> (${hhmm(v.starts)})`).join("<br>👁 ")}</div>` : ""}${camBtn(c.lat, c.lon)}`;
}
const cityMarks = new Map(), cityData = {}; // "layer|id" → marker, and each layer's last data: the lists fly to them
const mark = (layer, id, m) => (cityMarks.set(`${layer}|${id}`, m), m);
const PLAN_COLORS = { closure: "#c92a2a", construction: "#f08c00", event: "#1c7ed6", permit: "#9c36b5", film: "#d6336c" };
const planKind = (e) => (e.kind.startsWith("permit:") ? "permit" : e.kind === "film" ? "film" : e.kind.slice(5));
const PLAN_ICONS = { closure: "⛔", construction: "🚧", event: "🎪", permit: "🎪", film: "🎬" };
const planPin = (e) => pin(e.lat, e.lon, PLAN_ICONS[planKind(e)] ?? "🚧", PLAN_COLORS[planKind(e)] ?? "#868e96", 20);
// One look for incidents everywhere: the category's emoji, ringed by severity, faded by how likely it is.
const FAM_ICON = { fire: "🔥", crash: "🚗", flood: "🌊", alert: "🚨", air: "🚁", news: "📰", camera: "📷", crime: "🚓", other: "⚠️" };
const famOf = (c) => { const k = c.kind, t = c.events?.find((e) => e.topic)?.topic;
  return /fire|smoke|fdny/.test(k) || t === "fire" ? "fire" : /accident|crash|car-stopped|road:incident/.test(k) || t === "crash" ? "crash" : /flood|water/.test(k) ? "flood"
    : t === "crime" ? "crime" : k.startsWith("alert:") ? "alert" : k.startsWith("air:") ? "air" : k.startsWith("vision") ? "camera" : k.startsWith("news") ? "news" : "other"; };
const incIcon = (c) => L.divIcon({ className: `inc-icon${c.confidence > 1 ? " two" : ""}`, iconSize: [26, 26],
  html: `<span style="--sev:${SEV[c.sev]};opacity:${(0.45 + 0.55 * (c.probability ?? 0.5)).toFixed(2)}">${FAM_ICON[famOf(c)]}</span>` });
function drawIncidents(g, list, layer) {
  g.clearLayers();
  for (const c of list.filter((c) => c.rough)) L.circle([c.lat, c.lon], { radius: 700, color: SEV[c.sev], weight: 1.5, dashArray: "5 5", fillOpacity: 0.06, interactive: false }).addTo(g); // placed only at its neighborhood
  for (const c of list) mark(layer, c.id, L.marker([c.lat, c.lon], { icon: incIcon(c), title: c.title, zIndexOffset: 100 * c.sev, riseOnHover: true, sev: c.sev }).on("click", () => openDetail(c))).addTo(g);
}
async function loadIncidents(g) {
  const d = (cityData.incidents = await getJSON("/api/nyc/incidents"));
  drawIncidents(g, d.incidents, "incidents");
  if (!$("panel").querySelector('[data-tab="now"]').hidden) renderNow();
  seen.incidents = { count: d.incidents.length, serious: d.incidents.filter((c) => c.sev >= 2).map((c) => ({ title: c.title, sources: c.sources, since: hhmm(c.starts), lat: c.lat, lon: c.lon })).slice(0, 15) };
  $("n-incidents").textContent = `(${d.incidents.length}: ${d.incidents.filter((c) => c.sev >= 2).length} serious, ${d.incidents.filter((c) => c.confidence > 1).length} seen by 2+ sources, white ring)`;
}
// The map opens on these: the last 24 hours of crime, fires and police or fire alerts (not crashes, Waze reports or 311).
async function loadSecurity(g) {
  const list = (cityData.security = await getJSON("/api/nyc/security")).incidents;
  drawIncidents(g, list, "security");
  seen.security = list.slice(0, 15).map((c) => ({ title: c.title, since: hhmm(c.starts), where: c.hood ?? c.borough, likely: c.probability }));
  $("n-security").textContent = `(${list.length} in the last 24 hours${list[0] ? `, latest ${ago(list[0].starts)}` : ""})`;
}
async function loadClosures(g) {
  const d = (cityData.incidents = await getJSON("/api/nyc/incidents"));
  g.clearLayers();
  for (const e of d.planned) mark("closures", e.id, planPin(e)).bindTooltip(esc(e.title)).bindPopup(`<b>${esc(e.title)}</b><br><span class="muted">${esc(srcName(e.source))}${e.ends ? ` · until ${new Date(e.ends * 1000).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      ${e.where ? `<br>${esc(e.where)}` : ""}${e.text ? `<br><small>${esc(e.text.slice(0, 300))}</small>` : ""}<br>${camBtn(e.lat, e.lon)}`).addTo(g);
  const n = (k) => d.planned.filter((e) => planKind(e) === k).length;
  $("n-closures").innerHTML = `(<span style="color:${PLAN_COLORS.closure}">●</span> ${n("closure")} closures · <span style="color:${PLAN_COLORS.construction}">●</span> ${n("construction")} construction · <span style="color:${PLAN_COLORS.permit}">●</span> ${n("permit")} permitted · <span style="color:${PLAN_COLORS.event}">●</span> ${n("event")} special events)`;
}
const isOn = (a, now = Date.now() / 1000) => a.starts <= now && (!a.ends || a.ends > now);
const day = (t) => new Date(t * 1000).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" });
async function loadEmergency(g) {
  const d = (cityData.emergency = await getJSON("/api/nyc/emergency")), now = Date.now() / 1000;
  g.clearLayers();
  const placed = d.alerts.filter((a) => a.lat != null);
  for (const a of placed) { const on = isOn(a, now), later = a.starts > now; mark("emergency", a.id, pin(a.lat, a.lon, "🚨", on ? "#e03131" : "#868e96", on ? 26 : 22, !on)
    .bindPopup(`<b>🚨 ${esc(a.title)}</b><br><span class="muted">Notify NYC · ${later ? `planned for ${day(a.starts)}` : `${hhmm(a.starts)}${on ? " · active" : ` · ended ${hhmm(a.ends)}`}`}${a.severity ? ` · ${esc(a.severity)}` : ""}</span><p style="margin:6px 0;font-size:12px">${esc(a.text ?? "")}</p>${camBtn(a.lat, a.lon)}`)).addTo(g); }
  seen.emergency = d.alerts.slice(0, 10).map((a) => ({ what: a.title, at: a.starts > now ? `planned for ${day(a.starts)}` : hhmm(a.starts), active: isOn(a, now), text: a.text?.slice(0, 200) }));
  $("n-emergency").textContent = `(${d.alerts.filter((a) => isOn(a, now)).length} active, ${d.alerts.length} today${d.alerts.length > placed.length ? `, ${d.alerts.length - placed.length} citywide` : ""}${d.weather.length ? ` · weather: ${d.weather.map((w) => w.event).join(", ")}` : ""})`;
}
async function loadFilmShoots(g) {
  const d = await getJSON("/api/nyc/film-permits");
  g.clearLayers();
  for (const s of d.shoots.filter((s) => s.lat != null)) pin(s.lat, s.lon, "🎬", "#d6336c").bindPopup(`<b>🎬 ${esc(s.title)}</b><br><span class="muted">until ${new Date(s.ends * 1000).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><br><b>Parking held:</b><br><small style="display:block;max-height:80px;overflow:auto">${esc(s.parkingHeld)}</small>${camBtn(s.lat, s.lon)}`).addTo(g);
  seen.films = d.shoots.slice(0, 10).map((s) => s.title);
  const newest = d.newest && new Date(d.newest * 1000);
  $("n-films").textContent = `(${d.shoots.length} on now${newest && newest < Date.now() - 7 * 86400_000 ? `; the city's permit data stops at ${newest.toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" })}` : ""})`;
}
async function loadFloodSensors(g) {
  const d = (cityData.floods = await getJSON("/api/nyc/flood-sensors"));
  g.clearLayers();
  for (const f of d.sensors) {
    const mm = f.depthMm, wet = mm != null;
    mark("floods", f.id, wet ? pin(f.lat, f.lon, "💧", f.usual ? "#a5d8ff" : mm >= 305 ? "#1864ab" : mm >= 102 ? "#1c7ed6" : "#4dabf7", f.usual ? 20 : 24, !!f.usual) : dot(f.lat, f.lon, "#adb5bd", 3.5)).bindPopup(`<b>🌊 ${esc(f.name)}</b><br>${wet ? `<b>${(mm / 25.4).toFixed(1)} in of water now</b>${f.usual ? ` <span class="muted">· usual here: ${f.floodsLastYear} floods in the last year</span>` : ""}` : "Dry at the last check"} <span class="muted">(${f.type === "coastal" ? "coastal" : "rain"} sensor, ${esc(f.status)})</span><br><a href="https://dataviz.floodnet.nyc/" target="_blank" rel="noopener">FloodNet live readings</a> · ${camBtn(f.lat, f.lon)}`).addTo(g);
  }
  const wet = d.sensors.filter((f) => f.depthMm != null).length;
  seen.floods = { sensors: d.sensors.length, flooding: wet, surgeFt: d.surgeFt };
  $("n-floods").textContent = `(${wet} of ${d.sensors.length} flooding${d.checkedAt ? `; checked ${hhmm(d.checkedAt)}, ${d.raining ? "all sensors: it's raining" : "coastal ones only while dry"}` : ""}${d.surgeFt != null ? `; harbor ${d.surgeFt >= 0 ? "+" : ""}${d.surgeFt} ft vs tide` : ""})`;
}
// Today's local news: a story is pinned where its text says it happened (read by the local AI), roughly when only a neighborhood is named.
const newsPopup = (n) => `<b>📰 <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></b><br><span class="muted">${esc(n.outlet)} · ${hhmm(n.starts)}${n.outlets?.length > 1 ? ` · also ${n.also.filter((a) => a.outlet !== n.outlet).map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.outlet)}</a>`).filter((x, i, l) => l.indexOf(x) === i).join(", ")}` : ""}</span>${n.summary ? `<p style="margin:6px 0;font-size:12px">${esc(n.summary)}</p>` : ""}
  <span class="muted">Place read from the text by AI: ${esc(n.place ?? "")}${n.precision === "neighborhood" ? " (the neighborhood, roughly)" : ""}</span><br>${camBtn(n.lat, n.lon)}`;
async function loadNews(g) {
  const d = (cityData.news = await getJSON("/api/nyc/news"));
  g.clearLayers();
  for (const n of d.items.filter((n) => n.lat != null)) mark("news", n.id, L.marker([n.lat, n.lon], { icon: L.divIcon({ className: `cam-icon${n.precision === "neighborhood" ? " rough" : ""}`, html: "📰", iconSize: [18, 18] }), title: n.title }).bindPopup(newsPopup(n), { maxWidth: 320 })).addTo(g);
  seen.news = d.items.slice(0, 15).map((n) => ({ title: n.title, outlet: n.outlet, at: hhmm(n.starts), place: n.place }));
  $("n-news").textContent = `(${d.items.length} stories today from ${d.outlets} newsrooms, ${d.items.filter((n) => n.outlets?.length > 1).length} carried by several, ${d.items.filter((n) => n.lat != null).length} placed)`;
}
async function loadFdny(g) {
  const d = await getJSON("/api/nyc/fdny");
  g.clearLayers();
  for (const f of d.fires) pin(f.lat, f.lon, "🔥", f.sev >= 3 ? "#c92a2a" : f.sev === 2 ? "#f76707" : "#ffa94d", f.sev >= 2 ? 24 : 20).bindTooltip(esc(f.title))
    .bindPopup(`<b>🚒 ${esc(f.title)}</b><br><span class="muted">FDNY dispatch · ${new Date(f.starts * 1000).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · alarm box ${esc(f.box ?? "")}</span><br><small>The official record, published ~3 weeks late: <a href="${esc(f.url)}" target="_blank" rel="noopener">FDNY dispatch data</a></small>`).addTo(g);
  $("n-fdny").textContent = `(${d.fires.length} fires in the last 35 published days, through ${d.through ? new Date(d.through * 1000).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" }) : "?"}; ${d.fires.filter((f) => f.sev >= 2).length} beyond a first alarm)`;
}
const CITY_LAYERS = ["incidents", "closures", "emergency", "floods", "films", "news", "fdny"], LOADERS = { security: loadSecurity, incidents: loadIncidents, closures: loadClosures, emergency: loadEmergency, floods: loadFloodSensors, news: loadNews };
setInterval(() => { for (const [k, f] of Object.entries(LOADERS)) if (LAYERS[k].on && !map.getContainer().querySelector(".leaflet-popup")) f(LAYERS[k].group).catch(() => {}); }, 60_000);

// Marks Blip puts on the map (mark_places), cleared with the bar's ✕ Clear.
const aiMarks = L.layerGroup().addTo(map);
function markPlaces(points) {
  if (typeof points === "string") try { points = JSON.parse(points); } catch { points = []; } // a model may send the list as JSON text
  // or as {label, mapLink: "/nyc/#at=lat,lon,zoom|name"} (seen 10-29)
  points = (Array.isArray(points) ? points : []).map((p) => { const m = !Number.isFinite(+p?.lat) && String(p?.mapLink ?? "").match(/#at=(-?[\d.]+),(-?[\d.]+)/); return m ? { ...p, lat: m[1], lon: m[2] } : p; });
  const pts = (Array.isArray(points) ? points : []).filter((p) => Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && NYC.pad(0.2).contains([+p.lat, +p.lon])).slice(0, 50);
  for (const p of pts) L.marker([+p.lat, +p.lon], { icon: L.divIcon({ className: "ai-mark", html: `<span>${esc(String(p.label ?? "").slice(0, 40))}</span>`, iconSize: null }) })
    .bindPopup(`<b>${esc(String(p.label ?? ""))}</b>${p.note ? `<br>${esc(String(p.note).slice(0, 300))}` : ""}<br><span class="muted">Marked by Blip</span>`).addTo(aiMarks);
  if (pts.length) map.fitBounds(L.latLngBounds(pts.map((p) => [+p.lat, +p.lon])).pad(0.3), { maxZoom: 16 });
  drawBar();
  return `${pts.length} marked`;
}

// Places Blip links in an answer (/nyc/#at=lat,lon,zoom|label) are pinned too: no model round spent on mark_places.
addEventListener("blip:reply", (e) => {
  const pts = [...String(e.detail?.text ?? "").matchAll(/\/nyc\/#at=(-?[\d.]+),(-?[\d.]+)(?:,\d+)?(?:\|([^)\s]*))?/g)].map(([, lat, lon, label]) => ({ lat, lon, label: decodeURIComponent(label ?? "").replace(/\+/g, " ") }));
  if (pts.length > 1) markPlaces(pts);
});

// ---------- the city bar ----------
// Chips show the city's vital signs. A chip opens its list and its layer; closing the list (× or the chip again) takes
// the layer off again. Picking an item folds the list and brings the item into the part of the map you can see.
let pulseNow = null;
const CHIP_LAYER = { emergency: "emergency", weather: "emergency", incidents: "incidents", closures: "closures", floods: "floods", news: "news" };
const owned = new Set(); // layers a list switched on: they go off with it
function drawBar() {
  const p = pulseNow;
  if (!p) return;
  const open = !$("cityBrief").hidden && $("cityBrief").dataset.what;
  const chip = (act, label, title, cls = "") => `<button class="${cls}" title="${esc(title)}" data-act="${act}" aria-pressed="${open === act}">${label}</button>`;
  const hot = p.hotspots ?? [], anyOn = CITY_LAYERS.some((k) => LAYERS[k].on) || aiMarks.getLayers().length > 0 || panelMarks.getLayers().length > 0;
  const unpin = $("cityBrief").querySelector('[data-act="unpin"]');
  if (unpin) unpin.hidden = !(panelMarks.getLayers().length || owned.size);
  const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  $("cityBar").innerHTML = [
    `<button class="clock" data-act="wx" aria-pressed="${open === "wx"}" title="New York time${seen.weather ? ` · ${esc(seen.weather.station)}: ${esc(seen.weather.sky ?? "")}` : ""} · the weather, radar and lightning">🕐 ${new Date().toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" })}${seen.weather?.tempF != null ? ` <small>${seen.weather.tempF}°F</small>` : ""}</button>`,
    p.alerts ? chip("emergency", `🚨 ${n(p.alerts, "alert")}`, "Notify NYC alerts active now (the list has today's)", "hot") : "",
    p.weather.length ? chip("weather", `⛈ ${n(p.weather.length, "weather alert")}`, p.weather.join("\n"), "hot") : "",
    chip("incidents", `⚠ ${n(p.incidents, "incident")}${p.severe ? ` <small>· ${p.severe} serious</small>` : ""}`, `Today's incidents of every kind (crashes and Waze reports too) as of ${p.incidentsAt ? hhmm(p.incidentsAt) : "now"}: ${p.severe} serious, ${p.likely} likely real (70%+), ${p.corroborated} seen by 2+ independent sources`, p.severe ? "warm" : ""),
    hot.length ? chip("watch", `👁 Hotspot: ${esc(hot[0].place)}`, `Where to watch: the places where crime, fires and police alerts gathered over the last 72 hours (${hot.map((h) => h.place).join(", ")})`, hot[0].sev >= 2 ? "hot" : "warm") : "",
    chip("closures", `🚧 ${n(p.closures, "closure")}`, "Road closures, construction and permitted street events on now"),
    chip("news", `📰 ${n(p.news?.n ?? 0, "story", "stories")}`, `Today's local news: ${p.news?.n ?? 0} stories, ${p.news?.placed ?? 0} placed on the map`),
    p.flooding || Math.abs(p.surgeFt ?? 0) >= 1 ? chip("floods", `🌊 ${p.flooding ? `${p.flooding} flooding` : "Harbor"}${p.surgeFt != null ? ` <small>${p.surgeFt >= 0 ? "+" : ""}${p.surgeFt} ft</small>` : ""}`, "Street flooding now (FloodNet sensors) · harbor water at the Battery against the predicted tide (NOAA)", "warm") : "",
    p.aqi > 100 ? chip("aqi", `🌫 Air ${p.aqi}`, "US air quality index: over 100 is unhealthy for sensitive groups", "warm") : "",
    p.customersOut >= 1000 ? chip("outages", `⚡ ${p.customersOut} without power`, `Con Ed: ${p.outages} outages, ${p.customersOut} customers out`, "warm") : "",
    chip("brief", `📝 City brief <small>${p.brief ? hhmm(p.brief.at) : "…"}</small>`, "The situation brief: written by the local model from facts the code gathered, every bullet checked against its facts"),
    brief && !brief.running && !brief.seen ? chip("briefready", `✨ Brief ready`, `The brief for ${brief.label}: click to see it`, "hot") : "",
    `<button data-act="replay" aria-pressed="${!!replay}" title="Replay the last 24 or 72 hours on the map: road incidents and major accidents, Notify NYC alerts, street flooding, helicopters circling, crime and fire news">⏱ Replay</button>`,
    zones.length ? chip("zones", `⭐ My places${zoneNew() ? ` <small class="new">${zoneNew()} new</small>` : ""}`, `Your watched places (${zones.map((z) => z.name).join(", ")}): what happened there in 24 hours`, zoneNew() ? "warm" : "") : "",
    chip("area", "🔎 This area", "What's in the map's view: now, the last 24 hours, 311's week, news, cameras; the AI can brief it"),
    `<button title="Everything within ${NEAR_M} m of you: incidents, closures, news, subway, buses, Citi Bike, cameras, restrooms (click again to take it off)" data-act="around" aria-pressed="${!!near}">📍 Around me</button>`,
    lineFilter ? chip("line", `${[...lineFilter].map(bullet).join("")} ✕`, "Showing only these subway lines: click to show every line", "plain") : "",
    anyOn ? chip("clear", "✕ Clear", "Take the city layers and Blip's marks off the map", "plain") : "",
    chip("intro", "❔", "What this map shows and how to use it", "plain"),
  ].join("");
}
async function refreshPulse() { pulseNow = await getJSON("/api/nyc/pulse").catch(() => pulseNow); drawBar(); refreshZones();
  if (openedOn && openedOn === viewKey()) { openedOn = ""; cityView(); openedOn = ""; } // the bar's height is known now
  if (!$("panel").querySelector('[data-tab="now"]').hidden) { cityData.incidents = await getJSON("/api/nyc/incidents").catch(() => cityData.incidents); renderNow(); } if (!$("cityBrief").hidden && $("cityBrief").dataset.what === "brief") showPanel("brief", briefHtml()); }
const goLink = (layer, id, text) => `<a href="#" data-go="${esc(`${layer}|${id}`)}">${text}</a>`;
function showPanel(what, html) {
  const box = $("cityBrief");
  box.dataset.what = what; box.hidden = false; box.classList.remove("min");
  box.innerHTML = `<div class="ph"><div class="pt">${html.title}</div><span class="pbtn"><button class="linkish unpin" data-act="unpin" title="Take this list's markers off the map (× only closes the list)" hidden>Clear</button><button class="linkish" data-act="fold" title="Fold or unfold the list">▾</button><button class="linkish" data-act="close" title="Close the list (its markers stay until you clear them)">×</button></span></div><div class="pb">${html.body}</div>`;
  drawBar();
}
// × closes the list and leaves its markers; "Clear markers" (in the list) or the bar's ✕ Clear take them off.
function closePanel() { $("cityBrief").hidden = true; drawBar(); }
function unpinPanel() {
  panelMarks.clearLayers();
  for (const k of owned) toggle(k, false);
  owned.clear(); drawBar();
}
function clearCity() {
  for (const k of CITY_LAYERS) if (LAYERS[k].on) toggle(k, false);
  owned.clear(); aiMarks.clearLayers(); panelMarks.clearLayers(); $("cityBrief").hidden = true; if (lineFilter) showLine(""); drawBar();
}
function briefHtml() {
  const b = pulseNow?.brief;
  if (!b) return { title: "📝 Brief", body: "No brief yet: the first one is written a minute or two after the server starts." };
  return { title: `📝 NYC now <span class="muted">· ${hhmm(b.at)} · by ${esc(b.by)}</span>`, body: `<ul>${bulletsHtml(b, "brief")}</ul>
    ${b.dropped ? `<p class="muted">${b.dropped} bullet${b.dropped > 1 ? "s were" : " was"} dropped for not matching the facts.</p>` : ""}<details><summary class="muted">The facts it was given</summary><ol>${b.facts.map((f) => `<li value="${f.id.slice(1)}">${esc(f.text)}</li>`).join("")}</ol></details>` };
}
// A bullet whose facts have places is a link: it pins them (hover a fact number for the fact).
const bulletsHtml = (b, from) => { const fact = new Map(b.facts.map((f) => [f.id, f])); return b.bullets.map((x, i) => { const placed = x.facts.some((id) => fact.get(id)?.lat != null);
  return `<li>${placed ? `<a href="#" data-bullet="${from}|${i}" title="Show on the map">${esc(x.text)}</a>` : esc(x.text)} ${x.facts.map((id) => `<sup class="fact" title="${esc(fact.get(id)?.text ?? "")}">${esc(id)}</sup>`).join(" ")}</li>`; }).join(""); };
let areaBriefData = null;
function listHtml(act) {
  const p = pulseNow ?? {}, now = Date.now() / 1000, here = viewCenter();
  if (act === "emergency" || act === "weather") {
    const d = cityData.emergency ?? { alerts: [], weather: [] }, alerts = [...d.alerts.filter((a) => isOn(a, now)), ...d.alerts.filter((a) => !isOn(a, now))];
    const state = (a) => (isOn(a, now) ? "active" : a.starts > now ? `planned for ${day(a.starts)}` : "ended");
    return { title: `🚨 Notify NYC today <span class="muted">${alerts.filter((a) => isOn(a, now)).length} active · ${alerts.length} in 24 h</span>`, points: alerts.filter((a) => a.lat != null),
      body: (d.weather.length ? `<p><b>⛈ Weather alerts (NWS)</b><br>${d.weather.map((w) => `${esc(w.title)}${w.instruction ? `<br><small>${esc(w.instruction.slice(0, 240))}</small>` : ""}`).join("<br>")}</p>` : "")
        + (alerts.length ? `<ul class="rows">${alerts.map((a) => `<li>${a.lat != null ? goLink("emergency", a.id, esc(a.title)) : `${esc(a.title)} <span class="muted">(citywide)</span>`}<span class="muted">${state(a)}${a.starts <= now ? ` · ${ago(a.starts)}` : ""}${a.severity ? ` · ${esc(a.severity)}` : ""}</span><small>${esc((a.text ?? "").slice(0, 180))}</small></li>`).join("")}</ul>` : "<p>No Notify NYC alerts in the last 24 hours.</p>") };
  }
  if (act === "incidents") {
    const all = cityData.incidents?.incidents ?? [], list = all;
    return { title: `⚠ Today's incidents <span class="muted">as of ${pulseNow?.incidentsAt ? hhmm(pulseNow.incidentsAt) : "now"} · ${all.filter((c) => c.sev >= 2).length} serious · ${all.length} in all · ${all.filter((c) => (c.probability ?? 0) >= 0.7).length} likely real</span>`,
      points: list.filter((c) => c.sev >= 2).length ? list.filter((c) => c.sev >= 2) : list.slice(0, 1),
      body: `<ul class="rows">${list.slice(0, 40).map((c) => `<li><i style="background:${SEV[c.sev]}"></i>${goLink("incidents", c.id, esc(c.title))}<span class="muted">likely ${Math.round((c.probability ?? 0) * 100)}% · ${c.sources.map(srcName).join(" + ")} · ${ago(c.starts)}${c.hood || c.borough ? ` · ${esc(c.hood ?? c.borough)}` : ""}</span></li>`).join("")}</ul>${list.length > 40 ? `<p class="muted">The 40 most serious of ${list.length}; the rest are on the map.</p>` : ""}` };
  }
  if (act === "closures") {
    const list = (cityData.incidents?.planned ?? []).map((e) => ({ e, m: map.distance(here, [e.lat, e.lon]) })).sort((a, b) => a.m - b.m);
    return { title: `🚧 Closures & permitted events <span class="muted">${list.length} · nearest the map's center first</span>`, points: list.slice(0, 1).map((o) => o.e),
      body: `<ul class="rows">${list.slice(0, 30).map(({ e, m }) => `<li><i style="background:${PLAN_COLORS[planKind(e)] ?? "#868e96"}"></i>${goLink("closures", e.id, esc(e.title))}<span class="muted">${m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`}${e.ends ? ` · until ${new Date(e.ends * 1000).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span></li>`).join("")}</ul>` };
  }
  if (act === "floods") {
    const d = cityData.floods ?? { sensors: [] }, wet = d.sensors.filter((f) => f.depthMm != null).sort((a, b) => b.depthMm - a.depthMm);
    return { title: `🌊 Street flooding <span class="muted">${wet.length} of ${d.sensors.length} sensors</span>`, points: wet,
      body: `${wet.length ? `<ul class="rows">${wet.map((f) => `<li>${goLink("floods", f.id, esc(f.name))}<span class="muted">${(f.depthMm / 25.4).toFixed(1)} in</span></li>`).join("")}</ul>` : `<p>No sensor sees water on the street${d.checkedAt ? ` (checked ${hhmm(d.checkedAt)}; ${d.raining ? "all sensors, since it's raining" : "while it's dry only the coastal ones are checked"})` : ""}.</p>`}
        ${d.surgeFt != null ? `<p>Harbor water at the Battery: <b>${d.surgeFt >= 0 ? "+" : ""}${d.surgeFt} ft</b> against the predicted tide (<a href="https://tidesandcurrents.noaa.gov/stationhome.html?id=8518750" target="_blank" rel="noopener">NOAA</a>).</p>` : ""}` };
  }
  if (act === "news") {
    const d = cityData.news ?? { items: [] };
    return { title: `📰 Local news today <span class="muted">${d.items.length} stories · ${d.items.filter((n) => n.lat != null).length} placed</span>`, points: [],
      body: `<ul class="rows">${d.items.slice(0, 60).map((n) => `<li>${n.lat != null ? goLink("news", n.id, esc(n.title)) : `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>`}<span class="muted">${esc(n.outlets?.join(", ") ?? n.outlet)} · ${ago(n.starts)}${n.place ? ` · 📍 ${esc(n.place)}` : ""}</span></li>`).join("")}</ul>
        <p class="muted">Headlines from the newsrooms' own feeds; 📍 places are read from each story's text by the local AI and can be rough.</p>` };
  }
  if (act === "wx") { const w = seen.weather;
    return { title: `🌤 Weather now <span class="muted">${w ? esc(w.station) : ""}</span>`, body: w ? `<p><b>${esc(w.sky || "")}${w.tempF != null ? `, ${w.tempF}°F (${w.tempC}°C)` : ""}</b></p>${w.alerts.map((a) => `<p class="warn">⚠ ${esc(a.event)}${a.until ? ` until ${new Date(a.until).toLocaleString([], { timeZone: NYTZ, weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</p>`).join("")}
      <ul class="rows">${w.forecast.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("")}</ul><p class="actions"><button data-act="layer:radar">🌧 Rain radar</button> <button data-act="layer:lightning">⚡ Lightning</button> <button data-act="layer:windy">🌬 Wind & forecast map</button></p>` : "<p>The weather is still loading.</p>" }; }
  if (act === "aqi") return { title: `🌫 Air quality <span class="muted">${p.aqi}</span>`, body: `<p>${p.aqi <= 50 ? "Good" : p.aqi <= 100 ? "Moderate" : p.aqi <= 150 ? "Unhealthy for sensitive groups" : p.aqi <= 200 ? "Unhealthy" : "Very unhealthy or worse"} (US AQI, EPA's bands), from Open-Meteo's air quality model for NYC. <a href="https://www.airnow.gov/?city=New%20York&state=NY&country=USA" target="_blank" rel="noopener">AirNow →</a></p>` };
  if (act === "outages") return { title: `⚡ Con Ed outages <span class="muted">${p.outages}</span>`, body: `<p>${p.customersOut ?? 0} customers out in NYC and Westchester (Con Ed's outage map, updated every 15–30 minutes). <a href="https://outagemap.coned.com/" target="_blank" rel="noopener">Con Ed's map →</a></p>` };
  if (act === "watch") return { title: "👁 Hotspots <span class=\"muted\">where security news gathered, the last 72 hours</span>", body: `<ul class="rows">${(p.hotspots ?? []).map((h, i) => `<li><i style="background:${SEV[h.sev]}"></i><a href="#" data-hot="${i}">${esc(h.place)}</a><span class="muted">${h.reports} report${h.reports > 1 ? "s" : ""}: ${h.topics.map(esc).join(", ")} · latest ${ago(h.latest.starts)}</span><small>${h.latest.url ? `<a href="${esc(h.latest.url)}" target="_blank" rel="noopener">${esc(h.latest.title)}</a>` : esc(h.latest.title)}</small></li>`).join("")}</ul>
    <p class="muted">Crime and fire news and Notify NYC police and fire alerts, by neighborhood; each story counts once however many outlets carry it, follow-ups included. Places come from the stories' text (read by the local AI) and can be rough.</p>` };
  return null;
}
async function openList(act) {
  const box = $("cityBrief");
  if (!box.hidden && box.dataset.what === act) return closePanel(); // the same chip again: close
  for (const k of owned) if (k !== CHIP_LAYER[act]) toggle(k, false); // the previous list's layer goes off
  const mine = owned.has(CHIP_LAYER[act]); // still on from this list, closed with ×: still this list's to clear
  owned.clear(); if (mine) owned.add(CHIP_LAYER[act]); panelMarks.clearLayers();
  showPanel(act, { title: "Loading…", body: "" });
  if (CHIP_LAYER[act]) {
    const k = CHIP_LAYER[act], l = LAYERS[k], was = l.loaded;
    if (!l.on) owned.add(k);
    await toggle(k, true); if (was) await l.load(l.group).catch(() => {}); // fresh numbers
  }
  const h = listHtml(act);
  if (!h || box.dataset.what !== act) return;
  showPanel(act, h);
  const pts = (h.points ?? []).map((x) => L.latLng(x.lat, x.lon));
  if (pts.length && !pts.some((pt) => map.getBounds().contains(pt))) pts.length === 1 ? map.setView(pts[0], 15) : map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
}
// The part of the map not under the panel, the city bar or the zoom buttons, in map pixels: picked items go there.
function freeArea() {
  const r = map.getContainer().getBoundingClientRect(), hud = $("cityHud").getBoundingClientRect(), p = $("panel").getBoundingClientRect(), wide = p.width < r.width * 0.6;
  const f = { left: wide ? Math.max(0, p.right - r.left) + 12 : 12, top: Math.max(0, hud.bottom - r.top) + 12, right: r.width - 60, bottom: r.height - 12 };
  if (!wide && !$("panel").classList.contains("folded")) f.bottom = Math.min(f.bottom, p.top - r.top - 12); // the phone's bottom sheet
  const d = $("detail");
  if (!d.hidden) { const q = d.getBoundingClientRect(); if (wide) f.right = Math.min(f.right, q.left - r.left - 12); else f.bottom = Math.min(f.bottom, q.top - r.top - 12); } // and the drawer
  return f;
}
// Pins a panel puts on the map (the reports behind an unusual count, the places a brief's bullet is about): they go
// when the panel closes. One pin is centered in the visible part of the map; several are fitted into it.
const panelMarks = L.layerGroup().addTo(map);
function showPins(points, label) {
  panelMarks.clearLayers();
  const pts = points.filter((p) => p.lat != null), f = freeArea(), size = map.getSize();
  for (const p of pts) dot(p.lat, p.lon, "#7048e8", 6).bindPopup(`<b>${esc(p.title ?? p.text ?? "")}</b>${p.starts ? `<br><span class="muted">${new Date(p.starts * 1000).toLocaleString([], { timeZone: NYTZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>` : ""}`).addTo(panelMarks);
  if (!pts.length) return;
  const mid = [pts.reduce((a, p) => a + p.lat, 0) / pts.length, pts.reduce((a, p) => a + p.lon, 0) / pts.length];
  if (label) L.marker(mid, { icon: L.divIcon({ className: "ai-mark", html: `<span>${esc(label)}</span>`, iconSize: null }), interactive: false, zIndexOffset: 1000 }).addTo(panelMarks);
  $("cityBrief").classList.add("min"); drawBar();
  if (pts.length === 1) { map.setView(mid, Math.max(map.getZoom(), 16), { animate: false }); map.panBy([size.x / 2 - (f.left + f.right) / 2, size.y / 2 - (f.top + f.bottom) / 2], { animate: false }); }
  else map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon])), { paddingTopLeft: [f.left, f.top], paddingBottomRight: [size.x - f.right, size.y - f.bottom], maxZoom: 16 });
}
function focusOn(m) {
  $("cityBrief").classList.add("min"); // fold the list to its header
  const ll = m.getLatLng(), f = freeArea(), size = map.getSize();
  map.setView(ll, Math.max(map.getZoom(), 16), { animate: false });
  map.panBy([size.x / 2 - (f.left + f.right) / 2, size.y / 2 - (f.top + f.bottom) / 2], { animate: false });
  const pop = m.getPopup?.();
  if (pop) Object.assign(pop.options, { autoPanPaddingTopLeft: L.point(f.left, f.top), autoPanPaddingBottomRight: L.point(size.x - f.right, size.y - f.bottom) });
  const ping = L.circleMarker(ll, { radius: 24, color: "#fff", weight: 3, fill: false, className: "city-ping", interactive: false }).addTo(map);
  setTimeout(() => ping.remove(), 2600);
  m.openPopup();
}
$("cityBar").addEventListener("click", (e) => { const act = e.target.closest("[data-act]")?.dataset.act; if (act) barAct(act); });
function barAct(act) {
  if (act === "intro") return showIntro(true);
  if (act === "clear") return clearCity();
  if (act === "line") return showLine("");
  if (act === "brief") return !$("cityBrief").hidden && $("cityBrief").dataset.what === "brief" ? closePanel() : showPanel("brief", briefHtml());
  if (act === "around") { if (near) return $("nearOff").click(); showTab("explore"); return $("nearBtn").click(); } // its list is in the Nearby tab
  if (act === "replay") return replay ? closeReplay() : openReplay();
  if (act === "zones") return openZones();
  if (act === "area") return !$("cityBrief").hidden && $("cityBrief").dataset.what === "area" ? closePanel() : analyzeArea();
  if (act === "briefready") { const b = L.latLngBounds([brief.box.s, brief.box.w], [brief.box.n, brief.box.e]); map.fitBounds(b, { animate: false }); return analyzeArea(b); } // the same box: its brief shows
  openList(act);
}
// ---------- ⏱ Replay: the last 24 hours on a time scrubber (server: city.ts timeline) ----------
// At a moment the map shows what started in the 3 hours before it, older fainter; ▶ plays the day in 15-minute steps.
const replayLayer = L.layerGroup(), REPLAY_WINDOW = 3 * 3600;
let replay = null; // { events, t0, t1, t, timer }
const nyWhen = (t) => new Date(t * 1000).toLocaleString([], { timeZone: NYTZ, weekday: "short", hour: "numeric", minute: "2-digit" });
async function openReplay(hours = 24) {
  const d = await getJSON(`/api/nyc/timeline?hours=${hours}`).catch(() => null);
  if (!d || replay) return;
  const t1 = Math.floor(Date.now() / 1000), t0 = t1 - d.hours * 3600, bins = d.hours * 2, step = (t1 - t0) / bins;
  replay = { events: d.events, t0, t1, t: t1, timer: 0, hours: d.hours };
  replayLayer.addTo(map);
  const counts = Array.from({ length: bins }, (_, i) => d.events.filter((e) => e.starts >= t0 + i * step && e.starts < t0 + (i + 1) * step)), most = Math.max(1, ...counts.map((c) => c.length));
  const el = $("replay"); el.hidden = false;
  el.innerHTML = `<button class="rp-play" title="Play the day">▶</button><div class="rp-track"><svg viewBox="0 0 ${bins * 4} 24" preserveAspectRatio="none" aria-hidden="true">${counts.map((c, i) => `<rect x="${i * 4}" y="${24 - (22 * c.length) / most}" width="3" height="${(22 * c.length) / most}" fill="${SEV[Math.max(0, ...c.map((e) => e.sev))]}"/>`).join("")}</svg><input type="range" min="${t0}" max="${t1}" step="300" value="${t1}" aria-label="Moment of the last ${d.hours} hours"></div><span class="rp-at"></span><button class="rp-h linkish" title="Replay ${d.hours === 72 ? "the last 24 hours" : "the last 3 days"} instead">${d.hours === 72 ? "24 h" : "72 h"}</button><button class="rp-x linkish" title="Close the replay" aria-label="Close the replay">×</button>`;
  el.querySelector(".rp-h").onclick = () => { closeReplay(); openReplay(d.hours === 72 ? 24 : 72); };
  el.querySelector("input").oninput = (e) => { if (!replay) return; stopPlay(); showAt(+e.target.value); };
  el.querySelector(".rp-play").onclick = () => (replay.timer ? stopPlay() : play());
  el.querySelector(".rp-x").onclick = closeReplay;
  showAt(t1); drawBar();
}
function showAt(t) {
  if (!replay) return; // closed, or switching between 24 h and 72 h
  replay.t = t; replayLayer.clearLayers();
  const on = replay.events.filter((e) => e.starts <= t && e.starts > t - REPLAY_WINDOW);
  for (const e of on) L.marker([e.lat, e.lon], { title: e.title, zIndexOffset: 100 * e.sev, icon: L.divIcon({ className: "inc-icon", iconSize: [26, 26], html: `<span style="--sev:${SEV[e.sev] ?? SEV[1]};opacity:${(1 - (0.65 * (t - e.starts)) / REPLAY_WINDOW).toFixed(2)}">${FAM_ICON[e.fam] ?? FAM_ICON.other}</span>` }) })
    .bindPopup(`<b>${FAM_ICON[e.fam] ?? FAM_ICON.other} ${esc(e.title)}</b><br><span class="muted">${nyWhen(e.starts)} · ${esc(srcName(e.source))}</span>${e.url ? `<br><a href="${esc(e.url)}" target="_blank" rel="noopener">source</a>` : ""}`, { maxWidth: 300 }).addTo(replayLayer);
  const el = $("replay"); el.querySelector("input").value = t;
  el.querySelector(".rp-at").innerHTML = `<b>${t >= replay.t1 - 60 ? "Now" : nyWhen(t)}</b><br><span class="muted">${on.length} in the 3 hours before</span>`;
  seen.replay = { at: nyWhen(t), shownOnMap: on.slice(-15).map((e) => `${nyWhen(e.starts)}: ${e.title}`) };
}
function play() { if (replay.t >= replay.t1 - 60) replay.t = replay.t0; $("replay").querySelector(".rp-play").textContent = "⏸"; replay.timer = setInterval(() => { const t = Math.min(replay.t1, replay.t + 900 * (replay.hours / 24)); showAt(t); if (t >= replay.t1) stopPlay(); }, 350); }
function stopPlay() { if (!replay?.timer) return; clearInterval(replay.timer); replay.timer = 0; $("replay").querySelector(".rp-play").textContent = "▶"; }
function closeReplay() { stopPlay(); replay = null; replayLayer.clearLayers(); replayLayer.remove(); $("replay").hidden = true; seen.replay = null; drawBar(); }

// ---------- ⭐ My places: watch zones (home, work, a commute) kept in this browser ----------
// A zone is points with a radius: a spot (one point, 500 m) or a route (points every ~150 m along it, 300 m). What the
// replay timeline has (incidents, alerts, flooding, helicopters, crime and fire news) that lands in one is a hit; hits
// newer than the last look at the list are new, and the bar's ⭐ chip counts them.
const ZONE_KEY = "nyc.zones", ZONE_SEEN = "nyc.zonesSeen";
let tlCache = null; // the replay timeline, shared by the zones and "what's nearby" (the server caches it 2 minutes too)
const timelineNow = async () => (tlCache && Date.now() - tlCache.at < 110_000 ? tlCache.d : (tlCache = { at: Date.now(), d: await getJSON("/api/nyc/timeline") }).d);
const loadZones = () => { try { return JSON.parse(localStorage.getItem(ZONE_KEY) ?? "[]"); } catch { return []; } };
let zones = loadZones(), zoneHits = new Map(), zonesAt = 0; // zone id → its events in 24 h
const zonesSeen = () => { try { return +localStorage.getItem(ZONE_SEEN) || 0; } catch { return 0; } };
function saveZones() { try { localStorage.setItem(ZONE_KEY, JSON.stringify(zones)); } catch {} zonesAt = 0; refreshZones(); }
function addZone(name, pts, r) {
  zones.push({ id: Date.now().toString(36), name: String(name).slice(0, 60), pts: pts.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]), r });
  saveZones();
  dispatchEvent(new CustomEvent("blip:say", { detail: { text: `Watching ${name}. The ⭐ chip lights up when something happens there.`, mood: "happy" } }));
}
const inZone = (z, e) => z.pts.some(([la, lo]) => distM({ lat: la, lon: lo }, e) <= z.r);
async function refreshZones() {
  if (!zones.length) { zoneHits = new Map(); seen.zones = null; return drawBar(); }
  if (Date.now() - zonesAt < 110_000) return;
  const d = await timelineNow().catch(() => null);
  if (!d) return;
  zonesAt = Date.now();
  zoneHits = new Map(zones.map((z) => [z.id, d.events.filter((e) => inZone(z, e)).sort((a, b) => b.starts - a.starts)]));
  seen.zones = zones.map((z) => ({ name: z.name, kind: z.pts.length > 1 ? "route" : "spot", radiusM: z.r, last24h: zoneHits.get(z.id).slice(0, 8).map((e) => `${nyWhen(e.starts)}: ${e.title} (${srcName(e.source)})`) }));
  drawBar();
}
const zoneNew = () => { const t = zonesSeen(); return new Set([...zoneHits.values()].flat().filter((e) => e.starts > t).map((e) => e.id)).size; };
function zonesHtml() {
  const t = zonesSeen();
  const body = zones.length ? zones.map((z) => { const hits = zoneHits.get(z.id) ?? [];
    return `<p><a href="#" data-zone="${esc(z.id)}"><b>${z.pts.length > 1 ? "🛣" : "⭐"} ${esc(z.name)}</b></a> <span class="muted">${z.pts.length > 1 ? "route" : "spot"}, ${z.r} m · ${hits.length} in 24 h</span> <button class="linkish" data-zdel="${esc(z.id)}" title="Stop watching ${esc(z.name)}">✕</button></p>
      ${hits.length ? `<ul class="rows">${hits.slice(0, 12).map((e) => `<li><i style="background:${SEV[e.sev] ?? SEV[1]}"></i><a href="#" data-zev="${esc(z.id)}|${esc(e.id)}">${FAM_ICON[e.fam] ?? FAM_ICON.other} ${esc(e.title)}</a>${e.starts > t ? '<span class="new">new</span>' : ""}<span class="muted">${nyWhen(e.starts)} · ${esc(srcName(e.source))}</span></li>`).join("")}</ul>` : `<p class="muted">Quiet: nothing in 24 hours.</p>`}`; }).join("")
    : `<p>Keep an eye on the places that matter to you: click a spot on the map and press <b>⭐ Watch this spot</b>, or plan a trip and press <b>⭐ Watch this route</b>. They stay in this browser only.</p>`;
  return { title: `⭐ My places <span class="muted">· the last 24 hours</span>`, body: `${body}<p class="actions"><button data-zadd>⭐ Watch the map's center (500 m)</button>${zones.length ? ` <button data-zask>💬 Ask Blip about them</button>` : ""}</p>
    <p class="muted">Road incidents, Notify NYC alerts, street flooding, helicopters circling, crime and fire news. Waze's minor reports are left out.</p>` };
}
function drawZones(only) {
  for (const z of zones.filter((z) => !only || z.id === only)) (z.pts.length > 1 ? L.polyline(z.pts, { color: "#fab005", weight: 14, opacity: 0.25, interactive: false }) : L.circle(z.pts[0], { radius: z.r, color: "#fab005", weight: 2, dashArray: "6 6", fillOpacity: 0.06, interactive: false })).addTo(panelMarks);
}
function openZones() {
  if (!$("cityBrief").hidden && $("cityBrief").dataset.what === "zones") return closePanel();
  panelMarks.clearLayers(); showPanel("zones", zonesHtml()); drawZones();
  try { localStorage.setItem(ZONE_SEEN, String(Math.floor(Date.now() / 1000))); } catch {} // looked at: nothing new any more
  if (zones.length) map.fitBounds(L.latLngBounds(zones.flatMap((z) => z.pts)).pad(0.3), { maxZoom: 15 });
}
$("cityBrief").addEventListener("click", (e) => {
  const t = e.target.closest("[data-zone], [data-zev], [data-zdel], [data-zadd], [data-zask]");
  if (!t) return;
  e.preventDefault();
  if (t.dataset.zdel) { zones = zones.filter((z) => z.id !== t.dataset.zdel); saveZones(); panelMarks.clearLayers(); showPanel("zones", zonesHtml()); drawZones(); }
  if (t.hasAttribute("data-zadd")) { const c = viewCenter();
    getJSON(`/api/nyc/point?lat=${c.lat.toFixed(6)}&lon=${c.lng.toFixed(6)}`).catch(() => null).then((d) => { addZone(d?.found ? `Around ${d.address}` : `Around ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`, [[c.lat, c.lng]], 500); setTimeout(() => { panelMarks.clearLayers(); showPanel("zones", zonesHtml()); drawZones(); }, 1500); }); }
  if (t.hasAttribute("data-zask")) dispatchEvent(new CustomEvent("blip:ask", { detail: { text: "What happened in my places (my watch zones) in the last 24 hours? What matters, and is anything still going on?" } }));
  if (t.dataset.zone) { const z = zones.find((x) => x.id === t.dataset.zone); if (z) { showPins(zoneHits.get(z.id) ?? [], z.name); drawZones(z.id); if (!(zoneHits.get(z.id) ?? []).length) map.fitBounds(L.latLngBounds(z.pts).pad(0.5), { maxZoom: 16 }); } }
  if (t.dataset.zev) { const [zid, id] = t.dataset.zev.split("|"), ev = (zoneHits.get(zid) ?? []).find((x) => x.id === id); if (ev) { showPins([ev]); drawZones(zid); } }
});
// ⭐ Watch this route: the drawn trip, every ~150 m
const tripLine = () => tripLayer.getLayers().filter((l) => l instanceof L.Polyline && !(l instanceof L.Polygon)).flatMap((l) => l.getLatLngs().flat());
function watchRoute() {
  const pts = [], line = tripLine();
  for (const ll of line) if (!pts.length || distM({ lat: pts.at(-1)[0], lon: pts.at(-1)[1] }, { lat: ll.lat, lon: ll.lng }) >= 150) pts.push([ll.lat, ll.lng]);
  if (line.length) pts.push([line.at(-1).lat, line.at(-1).lng]);
  if (pts.length > 1) addZone(`${$("tFrom").value || "Start"} → ${$("tTo").value || "end"}`.slice(0, 60), pts.slice(0, 400), 300);
}
setTimeout(refreshZones, 1500);
$("tWatch").onclick = watchRoute;
new MutationObserver(() => { $("tWatch").hidden = tripLine().length < 2; }).observe($("tripOut"), { childList: true });

// The first visit (not one opened from a link) starts with what the map shows and three ways in; ❔ brings it back.
function showIntro(on) { $("intro").hidden = !on; if (!on) try { localStorage.setItem("nyc.intro", "1"); } catch {} }
$("intro").addEventListener("click", (e) => { const a = e.target.closest("[data-intro]")?.dataset.intro; if (!a) return; showIntro(false); if (a !== "close") barAct(a); });
try { if (!location.hash && !localStorage.getItem("nyc.intro")) showIntro(true); } catch {}
$("cityBrief").addEventListener("click", (e) => {
  const t = e.target, box = $("cityBrief");
  if (t.dataset.act === "close") return closePanel();
  if (t.dataset.act === "unpin") return unpinPanel();
  if (t.dataset.act === "fold") return box.classList.toggle("min");
  const go = (t.closest("[data-go]") ?? (t.closest("a, button, details") ? null : t.closest("li")?.querySelector("[data-go]")))?.dataset.go;
  if (go) { e.preventDefault(); const [layer, id] = go.split(/\|(.*)/s), c = layer === "incidents" && cityData.incidents?.incidents.find((x) => x.id === id);
    if (c) { $("cityBrief").classList.add("min"); return openDetail(c); }
    const m = cityMarks.get(go); if (m) focusOn(m); return; }
  const bullet = t.closest("[data-bullet]")?.dataset.bullet;
  if (bullet) { e.preventDefault(); const [from, i] = bullet.split("|"), b = from === "area" ? areaBriefData : pulseNow?.brief, x = b?.bullets[+i];
    if (x) showPins(b.facts.filter((f) => x.facts.includes(f.id) && f.lat != null).map((f) => ({ lat: f.lat, lon: f.lon, title: `${f.id}: ${f.text}` }))); }
  if (t.dataset.hot) { e.preventDefault(); const h = pulseNow.hotspots[+t.dataset.hot]; showPins(h.points, `${h.place}: ${h.reports} report${h.reports > 1 ? "s" : ""}`); }
  if (t.dataset.cam) { e.preventDefault(); getJSON("/api/nyc/cameras").then((l) => { const c = l.find((x) => x.id === t.dataset.cam); if (c) openCam(c); }); }
  if (t.dataset.act === "areabrief") areaBriefNow();
  if (t.dataset.act?.startsWith("layer:")) { const k = t.dataset.act.slice(6); toggle(k, !LAYERS[k].on); t.setAttribute("aria-pressed", String(LAYERS[k].on)); }
  if (t.dataset.act === "zoomarea") { centerInView(viewInNyc() ? viewCenter() : L.latLng(40.7359, -73.9911), 14); analyzeArea(); }
  if (t.dataset.act === "askblip") dispatchEvent(new CustomEvent("blip:ask", { detail: { text: `What's going on around ${box.dataset.label ?? "here"} right now, and what stands out compared with usual?` } }));
});

// ---------- the detail drawer: one incident, all of it ----------
let detailNow = null;
const ICON_FAM = (c) => FAM_ICON[famOf(c)];
function openDetail(c) {
  detailNow = c;
  const d = $("detail"), p = Math.round((c.probability ?? 0) * 100), news = c.events.filter((e) => e.source === "news"), reports = c.events.filter((e) => e.source !== "news" && e.source !== "vision");
  d.innerHTML = `<div class="dh"><span style="font-size:20px">${ICON_FAM(c)}</span><b>${esc(c.title)}</b><button class="linkish" data-dact="close" aria-label="Close">×</button></div><div class="db">
    <div class="muted">${[c.hood, c.borough].filter(Boolean).map(esc).join(", ")} · since ${hhmm(c.starts)} (${ago(c.starts)}) · severity ${c.sev}/3${c.rough ? " · 📍 rough place (the neighborhood)" : ""}</div>
    <h4>How likely it's real: ${p}%</h4><div class="meter"><i style="width:${p}%"></i></div>
    <div class="muted">${(c.why ?? []).map(esc).join(" + ")} · ${c.confidence > 1 ? `${c.confidence} independent sources agree` : "one source so far"}. <a href="./review.html">How sources are measured</a></div>
    ${reports.length ? `<h4>Reports</h4><ul>${reports.map((e) => `<li><b>${esc(srcName(e.source))}</b> ${hhmm(e.starts)}: ${esc(e.title)}${e.text ? `<br><small>${esc(e.text.slice(0, 260))}</small>` : ""}${e.url?.startsWith("http") ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">source</a>` : ""}</li>`).join("")}</ul>` : ""}
    ${news.length ? `<h4>In the news</h4><ul>${news.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a> <span class="muted">${esc(e.outlet ?? "")} ${hhmm(e.starts)}</span></li>`).join("")}</ul>` : ""}
    ${c.checkedBy?.length ? `<h4>Camera checks (local AI)</h4><ul>${c.checkedBy.map((v) => `<li>${esc(v.title)} <span class="muted">${hhmm(v.starts)}</span></li>`).join("")}</ul>` : ""}
    ${c.rough ? "" : `<div class="here-photo muted" id="dphoto">${photoHtml(photoAt(c.lat, c.lon).v)}</div>${dirBtns(c.lat, c.lon)}`}
    <div id="dcams"></div>
    <div id="drel"></div>
    <div id="dresearch"></div>
    <div class="acts"><button data-dact="research" title="Search the web for this incident; the AI reads what it finds and writes what matters, every point with its sources">📰 Research this</button><button data-dact="ask">💬 Ask Blip</button><button data-dact="near">📍 Within ${NEAR_M} m</button><button data-dact="area">🔎 This area</button></div></div>`;
  d.setAttribute("aria-label", "Incident details"); d.hidden = false;
  const f = freeArea(), size = map.getSize();
  map.setView([c.lat, c.lon], Math.max(map.getZoom(), c.rough ? 14 : 16), { animate: false });
  map.panBy([size.x / 2 - (f.left + f.right) / 2, size.y / 2 - (f.top + f.bottom) / 2], { animate: false });
  const ping = L.circleMarker([c.lat, c.lon], { radius: 26, color: "#fff", weight: 3, fill: false, className: "city-ping", interactive: false }).addTo(map);
  setTimeout(() => ping.remove(), 2600);
  if (!c.rough) { const e = photoAt(c.lat, c.lon); e.p.then(() => { const b = document.getElementById("dphoto"); if (b && detailNow === c) b.innerHTML = photoHtml(e.v); }); }
  // the nearest cameras, once the camera list is in (right after a restart it waits for the stream checks)
  (camsCache ??= getJSON("/api/nyc/cameras")).catch(() => []).then((l) => {
    const cams = l.map((k) => ({ k, m: map.distance([c.lat, c.lon], [k.lat, k.lon]) })).filter((o) => o.m <= 600 && !o.k.youtube).sort((a, b) => a.m - b.m).slice(0, 4), out = document.getElementById("dcams");
    if (out && detailNow === c && cams.length) out.innerHTML = `<h4>Cameras nearby</h4><div class="acts">${cams.map(({ k, m }) => `<button data-dcam="${esc(k.id)}">${camEmoji(k)}${camQ(k) ? ` ${camQ(k)}` : ""} ${esc(k.name)} <span class="muted">${Math.round(m)} m</span></button>`).join("")}</div>`;
  });
  relatedHtml(c.lat, c.lon, { cams: false, skip: c.id }).then((h) => { const o = document.getElementById("drel"); if (o && detailNow === c && !c.rough) o.innerHTML = `<h4 style="margin-top:14px">Within ${REL_M} m</h4>${h}`; });
  if (research.has(c.id)) researchNow(c); // researched before: show it again
  seen.incidentOpen = { title: c.title, likely: p, sources: c.sources, since: hhmm(c.starts), where: c.hood ?? c.borough, reports: reports.map((e) => e.title).slice(0, 6), news: news.map((e) => e.title) };
}
// 📰 Research: the server searches the web, reads the pages and has the model say what matters (server/city.ts researchIncident).
const research = new Map(); // incident id → its research
const cite = (r, ns) => ns.map((n) => r.sources[n - 1]).filter(Boolean).map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">[${s.n}]</a>` : `<span title="${esc(s.title)}">[${s.n}]</span>`)).join("");
const researchHtml = (r) => `<h4>📰 What the sources say${r.important ? ' <span class="new">matters now</span>' : ""}</h4>${r.summary ? `<p><b>${esc(r.summary)}</b></p>` : ""}
  ${r.points.length ? `<ul>${r.points.map((p) => `<li>${esc(p.text)} ${cite(r, p.sources)}</li>`).join("")}</ul>` : "<p class=muted>Nothing in the sources checked out.</p>"}
  ${r.unknown.length ? `<p class="muted"><b>Still unclear:</b> ${r.unknown.map(esc).join(" · ")}</p>` : ""}
  <details><summary class="muted">${r.sources.length} sources · by ${esc(r.by ?? "the AI")}${r.dropped ? ` · ${r.dropped} point${r.dropped > 1 ? "s" : ""} dropped: numbers not in its sources` : ""}</summary><ol>${r.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} <span class="muted">${esc(s.from)}</span></li>`).join("")}</ol></details>`;
async function researchNow(c) {
  const show = (html) => { const o = detailNow === c && document.getElementById("dresearch"); if (o) o.innerHTML = html; };
  if (research.has(c.id)) return show(researchHtml(research.get(c.id)));
  show('<p class="muted">📰 Searching the web… (about a minute)</p>');
  const start = await fetch("/api/nyc/incident-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id }) })
    .then(async (r) => ((r.headers.get("content-type") ?? "").includes("json") ? r.json() : { error: `The server answered ${r.status}. Try again in a minute.` })).catch((e) => ({ error: e.message }));
  let r = start.error ? start : { error: "It took too long. Try again in a minute." };
  if (start.id) for (const t0 = Date.now(); Date.now() - t0 < 4 * 60_000;) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const j = await getJSON(`/api/nyc/brief-job?id=${encodeURIComponent(start.id)}`).catch((e) => (e instanceof TypeError || /^5\d\d /.test(e.message) ? {} : { error: e.message })); // a 5xx: the site restarting
    if (j.error || j.result) { r = j.error ? { error: j.error } : j.result; break; }
    show(`<p class="muted">📰 ${esc(j.step ?? "Working…")}</p>`);
  }
  if (!r.error) { research.set(c.id, r); if (detailNow === c && seen.incidentOpen) seen.incidentOpen.research = { summary: r.summary, points: r.points.map((p) => p.text), unclear: r.unknown, sources: r.sources.map((s) => s.url || s.title) }; }
  show(r.error ? `<p>${esc(r.error)}</p>` : researchHtml(r));
}
const closeDetail = () => { $("detail").hidden = true; detailNow = null; seen.incidentOpen = null; seen.drawer = null; };
/** The drawer for anything else (a building's records…): a title and its body, the map stays where it is. */
function showDrawer(icon, title, body) {
  detailNow = null; seen.incidentOpen = null; detailSpot = null;
  const d = $("detail");
  d.innerHTML = `<div class="dh"><span style="font-size:20px">${icon}</span><b>${esc(title)}</b><button class="linkish" data-dact="close" aria-label="Close">×</button></div><div class="db">${body}</div>`;
  d.setAttribute("aria-label", title); d.hidden = false; d.scrollTop = 0;
  seen.drawer = { title, text: d.querySelector(".db").innerText.slice(0, 3000) };
}
$("detail").addEventListener("click", (e) => {
  const t = e.target.closest("[data-dact], [data-dcam]"), c = detailNow;
  if (t?.dataset.dact === "close") return closeDetail();
  if (!t || !c) return;
  if (t.dataset.dcam) return void (camsCache ?? Promise.resolve([])).then((l) => { const k = l.find((x) => x.id === t.dataset.dcam); if (k) openCam(k); });
  const a = t.dataset.dact;
  if (a === "ask") dispatchEvent(new CustomEvent("blip:ask", { detail: { text: `What do we know about "${c.title}"${c.hood ? ` in ${c.hood}` : ""}? Is it confirmed, and what else is going on around it?` } }));
  if (a === "near") { closeDetail(); nearMe(L.latLng(c.lat, c.lon), c.hood ?? c.title); }
  if (a === "area") { closeDetail(); map.setView([c.lat, c.lon], 15, { animate: false }); analyzeArea(); }
  if (a === "research") researchNow(c);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("detail").hidden) closeDetail(); });

// ---------- what's nearby: one drawer for anything on the map ----------
// Popups stay for a quick look (next trains, bikes, a camera); "▸ What's nearby" on every popup opens the drawer with
// what's around that spot: today's incidents, closures on now, today's news, the last 2 hours' alerts, flooding and
// helicopters, and cameras, within 500 m. The incident drawer gets the same.
const REL_M = 500;
let related = []; // the drawer's related items, by index, for clicks
async function relatedHtml(lat, lon, { cams = true, skip } = {}) {
  const at = { lat, lon }, near = (x) => x.lat != null && distM(at, x) <= REL_M, by = (a, b) => distM(at, a) - distM(at, b), t2h = Date.now() / 1000 - 2 * 3600;
  const [tl, camList, incs, nws] = await Promise.all([timelineNow().catch(() => null), cams ? (camsCache ??= getJSON("/api/nyc/cameras")).catch(() => []) : [],
    cityData.incidents ?? getJSON("/api/nyc/incidents").catch(() => null), cityData.news ?? getJSON("/api/nyc/news").catch(() => null)]); // all at once
  cityData.incidents ??= incs; cityData.news ??= nws;
  const inc = (cityData.incidents?.incidents ?? []).filter((c) => near(c) && c.id !== skip).sort(by).slice(0, 8);
  const closures = (cityData.incidents?.planned ?? []).filter(near).sort(by).slice(0, 6);
  const news = (cityData.news?.items ?? []).filter(near).slice(0, 6);
  const recent = (tl?.events ?? []).filter((e) => near(e) && e.starts > t2h && ["alert", "flood", "air", "fire", "crime"].includes(e.fam)).slice(-6).reverse();
  const camsNear = camList.filter((k) => near(k) && !k.youtube).sort(by).slice(0, 4);
  related = [];
  const item = (x, html, after) => `<li><a href="#" data-rel="${related.push(x) - 1}">${html}</a> ${after}</li>`, m = (x) => `<span class="muted">${Math.round(distM(at, x))} m</span>`;
  const parts = [
    inc.length && `<h4>Incidents today</h4><ul>${inc.map((c) => item({ inc: c }, `${ICON_FAM(c)} ${esc(c.title)}`, `${m(c)} <span class="muted">· ${ago(c.starts)}</span>`)).join("")}</ul>`,
    recent.length && `<h4>The last 2 hours</h4><ul>${recent.map((e) => item({ pin: e }, `${FAM_ICON[e.fam] ?? FAM_ICON.other} ${esc(e.title)}`, `${m(e)} <span class="muted">· ${nyWhen(e.starts)}</span>`)).join("")}</ul>`,
    closures.length && `<h4>Closures and street events on now</h4><ul>${closures.map((e) => item({ pin: e }, `🚧 ${esc(e.title)}`, m(e))).join("")}</ul>`,
    news.length && `<h4>In today's news</h4><ul>${news.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted">${esc(n.outlet ?? "")}${n.place ? ` · 📍 ${esc(n.place)}` : ""}</span></li>`).join("")}</ul>`,
    camsNear.length && `<h4>Cameras</h4><div class="acts">${camsNear.map((k) => `<button data-dcam="${esc(k.id)}">${camEmoji(k)} ${esc(k.name)} ${m(k)}</button>`).join("")}</div>`,
  ].filter(Boolean);
  return parts.length ? parts.join("") : `<p class="muted">Nothing reported within ${REL_M} m today${cams ? ", and no cameras" : ""}.</p>`;
}
async function openNearby(lat, lon, title) {
  showDrawer("📍", title || "This spot", `<div class="muted">Within ${REL_M} m</div><div id="drel"><p class="muted">Looking around…</p></div>
    <div class="acts"><button data-dact="near">🚇 Transit, bikes, restrooms (600 m)</button><button data-dact="area">🔎 This area</button><button data-dact="ask">💬 Ask Blip</button></div>`);
  detailSpot = { lat, lon, title };
  const html = await relatedHtml(lat, lon), out = document.getElementById("drel");
  if (out && detailSpot?.lat === lat) { out.innerHTML = html; seen.drawer = { title: `What's near ${title}`, text: out.innerText.slice(0, 2500) }; }
}
let detailSpot = null; // the spot the nearby drawer is about
$("detail").addEventListener("click", (e) => {
  const r = e.target.closest("[data-rel]"), a = e.target.closest("[data-dact]")?.dataset.dact;
  if (r) { e.preventDefault(); const x = related[+r.dataset.rel]; if (x?.inc) openDetail(x.inc); else if (x?.pin) showPins([x.pin]); return; }
  if (e.target.closest("[data-dcam]") && !detailNow) { const id = e.target.closest("[data-dcam]").dataset.dcam; (camsCache ?? Promise.resolve([])).then((l) => { const k = l.find((x) => x.id === id); if (k) openCam(k); }); return; }
  const s = !detailNow && detailSpot;
  if (!s || !a) return;
  if (a === "near") { closeDetail(); nearMe(L.latLng(s.lat, s.lon), s.title); }
  if (a === "area") { closeDetail(); map.setView([s.lat, s.lon], 15, { animate: false }); analyzeArea(); }
  if (a === "ask") dispatchEvent(new CustomEvent("blip:ask", { detail: { text: `What's going on around ${s.title} right now?` } }));
});
// every popup gets the link, again after its content changes (a station's arrivals come in later)
function nearbyFooter(pop) {
  const box = pop.getElement()?.querySelector(".leaflet-popup-content");
  if (!box || box.querySelector(".pnear") || !NYC.contains(pop.getLatLng())) return;
  const t = box.querySelector("b")?.textContent.trim().replace(/^\W+\s*/u, "").slice(0, 80) || "this spot";
  box.insertAdjacentHTML("beforeend", `<div class="pnear"><button type="button" class="linkish">▸ What's nearby</button></div>`);
  box.querySelector(".pnear button").onclick = (ev) => { ev.stopPropagation(); const ll = pop.getLatLng(); openNearby(ll.lat, ll.lng, t); };
}
map.on("popupopen", (e) => { nearbyFooter(e.popup); if (!e.popup._nearHooked) { e.popup._nearHooked = true; e.popup.on("contentupdate", () => nearbyFooter(e.popup)); } });

// ---------- the Now tab: today's incidents, ranked by what deserves attention ----------
// attention = (1 + severity) × how likely × 1.5 in its first hour; the alerts without a place on top.
let nowFilter = "security";
const NOW_FILTERS = [["security", "🚓 Security"], ["all", "Everything"], ["serious", "Serious"], ["likely", "Likely"], ["fire", "🔥 Fire"], ["crash", "🚗 Crashes"], ["crime", "🚓 Crime"], ["alert", "🚨 Alerts"], ["flood", "🌊 Flooding"]];
const nowSeenAt = () => { try { return +localStorage.getItem("nyc.nowSeen") || 0; } catch { return 0; } };
const attention = (c) => (1 + c.sev) * (c.probability ?? 0.5) * (c.starts > Date.now() / 1000 - 3600 ? 1.5 : 1);
async function renderNow() {
  if (!cityData.incidents) cityData.incidents = await getJSON("/api/nyc/incidents").catch(() => ({ incidents: [] }));
  if (!cityData.emergency) cityData.emergency = await getJSON("/api/nyc/emergency").catch(() => ({ alerts: [], weather: [] }));
  if (nowFilter === "security" && !cityData.security) cityData.security = await getJSON("/api/nyc/security").catch(() => ({ incidents: [] }));
  const seenAt = nowSeenAt(), all = [...cityData.incidents.incidents].sort((a, b) => attention(b) - attention(a));
  const list = nowFilter === "security" ? cityData.security.incidents : all.filter((c) => nowFilter === "all" || (nowFilter === "serious" ? c.sev >= 2 : nowFilter === "likely" ? (c.probability ?? 0) >= 0.7 : famOf(c) === nowFilter));
  $("nowFilters").innerHTML = NOW_FILTERS.map(([k, label]) => `<button data-nf="${k}" aria-pressed="${nowFilter === k}">${label}</button>`).join("");
  const citywide = (cityData.emergency?.alerts ?? []).filter((a) => a.lat == null && isOn(a));
  $("nowList").className = "";
  $("nowList").innerHTML = `<div class="muted">${nowFilter === "security" ? `Crime, fires and police or fire alerts in the last 24 hours, newest first · ${list.length}. Pick one for its sources and 📰 Research.` : `Today, as of ${pulseNow?.incidentsAt ? hhmm(pulseNow.incidentsAt) : "now"} (updated every 15 minutes with the <a href="#" data-nowbrief>brief</a>) · ${all.length} incidents`}</div>
    ${citywide.map((a) => `<div class="muted">🚨 ${esc(a.title)} (citywide)</div>`).join("")}
    <ul class="feed">${list.slice(0, 80).map((c) => `<li tabindex="0" data-now="${esc(c.id)}"><span class="ic">${ICON_FAM(c)}</span><span><b>${esc(c.title)}</b>${c.starts > seenAt && seenAt ? '<span class="new">new</span>' : ""}</span>
      <span class="muted">likely ${Math.round((c.probability ?? 0) * 100)}% · ${c.sources.map(srcName).join(" + ")} · ${ago(c.starts)}${c.hood || c.borough ? ` · ${esc(c.hood ?? c.borough)}` : ""}</span></li>`).join("") || `<li>Nothing like that ${nowFilter === "security" ? "in the last 24 hours" : "today"}.</li>`}</ul>`;
  seen.now = { filter: nowFilter, shown: list.length, top: list.slice(0, 8).map((c) => ({ title: c.title, likely: c.probability, where: c.hood ?? c.borough, sources: c.sources })) };
  clearTimeout(renderNow.seenTimer); renderNow.seenTimer = setTimeout(() => { try { localStorage.setItem("nyc.nowSeen", String(Math.floor(Date.now() / 1000))); } catch {} }, 8000); // looked at for 8 s: seen
}
$("nowFilters").addEventListener("click", (e) => { const k = e.target.closest("[data-nf]")?.dataset.nf; if (k) { nowFilter = k; renderNow(); } });
$("nowList").addEventListener("click", (e) => {
  if (e.target.closest("[data-nowbrief]")) { e.preventDefault(); return showPanel("brief", briefHtml()); }
  const id = e.target.closest("[data-now]")?.dataset.now, sec = nowFilter === "security", c = id && (sec ? cityData.security : cityData.incidents)?.incidents.find((x) => x.id === id);
  if (!c) return;
  if (!LAYERS[sec ? "security" : "incidents"].on) toggle(sec ? "security" : "incidents", true);
  if (matchMedia("(max-width: 700px)").matches) sheet("peek"); // the map needs the room on a phone
  openDetail(c);
});
$("nowList").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.closest("[data-now]")?.click(); });

// ---------- 🔎 This area: everything in the map's view, now and over the last 24 hours ----------
let areaNow = null;
const spark = (v, color) => { const max = Math.max(1, ...v); return `<svg viewBox="0 0 ${v.length * 4} 20" class="spark" aria-hidden="true">${v.map((x, i) => `<rect x="${i * 4}" y="${20 - (18 * x) / max}" width="3" height="${(18 * x) / max}" fill="${color}"/>`).join("")}</svg>`; };
async function analyzeArea(view) {
  const b = view ?? viewBounds(), box = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
  if (box.n - box.s > 0.5 || box.e - box.w > 0.6 || !viewInNyc()) return showPanel("area", { title: "🔎 This area", body: `<p>This works on a part of the city: the view is ${viewInNyc() ? "too big" : "outside NYC"}. Zoom in on a neighborhood, or</p><p class="actions"><button data-act="zoomarea">Zoom into the middle of the view</button></p>` });
  showPanel("area", { title: "🔎 This area", body: "Looking…" });
  const a = (areaNow = await getJSON(`/api/nyc/area?s=${box.s.toFixed(5)}&w=${box.w.toFixed(5)}&n=${box.n.toFixed(5)}&e=${box.e.toFixed(5)}`).catch((e) => ({ error: e.message })));
  if (a.error) return showPanel("area", { title: "🔎 This area", body: `<p>${esc(a.error)}</p>` });
  $("cityBrief").dataset.label = a.label;
  if (!LAYERS.incidents.on) { owned.add("incidents"); toggle("incidents", true); } // its markers, for the list's links
  const fam = { incidents: "#ff6b35", closures: "#c92a2a", news: "#40c057", events: "#1c7ed6" }, up = (r) => (r.usual && r.n >= 2 * r.usual ? " ↑" : r.n < r.usual / 2 ? " ↓" : "");
  seen.area = { label: a.label, incidentsNow: a.now.incidents.length, closuresNow: a.now.closures, startedLast24h: a.started.byFamily, reports311Week: a.reports311.week.slice(0, 8), news: a.news.slice(0, 6).map((n) => n.title), unusual: a.unusual.map((u) => u.text) };
  showPanel("area", { title: `🔎 ${esc(a.label)}${a.borough ? `, ${esc(a.borough)}` : ""}`, body: `
    <p class="actions"><button data-act="areabrief">✨ Brief this area</button> <button data-act="askblip">💬 Ask Blip</button><br><span class="muted">The brief: the local AI looks at ${Math.min(a.cameras.total, 5)} of the ${a.cameras.total} cameras here, then writes from the facts below (about a minute).</span></p><div id="areaBrief"></div>
    <p><b>Now:</b> ${a.now.incidents.length} incidents · ${a.now.closures} closures and permits · ${a.now.events} special events${a.now.flooding.length ? ` · 🌊 ${a.now.flooding.length} flooding` : ""}${a.now.alertsAreaWide.length ? `<br>⛈ ${a.now.alertsAreaWide.map((e) => esc(e.title)).join(" · ")}` : ""}</p>
    <p><b>Last 24 hours</b> <span class="muted">(by hour, oldest left)</span></p>${Object.keys(a.started.byFamily).length ? `<div class="tl">${Object.entries(a.started.byFamily).map(([k, n]) => `${spark(a.started.timeline[k], fam[k] ?? "#868e96")}<span><b>${n}</b> ${esc(k)}</span>`).join("")}</div>` : "<p>Nothing new.</p>"}
    ${a.now.incidents.length ? `<ul class="rows">${a.now.incidents.slice(0, 8).map((c) => `<li><i style="background:${SEV[c.sev]}"></i>${goLink("incidents", c.id, esc(c.title))}<span class="muted">${c.sources.map(srcName).join(" + ")} · ${ago(c.starts)}</span></li>`).join("")}</ul>` : ""}
    ${a.reports311.week.length ? `<p><b>311, the week through ${new Date(a.reports311.through).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" })}:</b> ${a.reports311.total} reports (usually ${Math.round(a.reports311.usualTotal)})<br>${a.reports311.week.slice(0, 8).map((r) => `${esc(r.type)} <b>${r.n}</b><span class="muted">/${r.usual}${up(r)}</span>`).join(" · ")}</p>` : ""}
    ${a.unusual.length ? `<p><b>📈 Unusual:</b><br>${a.unusual.slice(0, 3).map((u) => esc(u.text)).join("<br>")}</p>` : ""}
    ${a.news.length ? `<p><b>📰 Today's news here:</b></p><ul class="rows">${a.news.slice(0, 6).map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><span class="muted">${esc(n.outlet)} · ${ago(n.starts)}</span></li>`).join("")}</ul>` : ""}
    <p><b>📷 ${a.cameras.total} cameras</b>${a.cameras.video ? ` (${a.cameras.video} live video, ${a.cameras.hd} HD)` : ""}${a.cameras.best.length ? `: ${a.cameras.best.slice(0, 3).map((c) => `<a href="#" data-cam="${esc(c.id)}">${esc(c.name)}${c.h >= 720 ? " HD" : ""}</a>`).join(" · ")}` : ""}</p>
<div id="areaSafety" class="muted">🛡 Loading the official public-safety record…</div>` });
  renderBrief();
  const r = await getJSON(`/api/nyc/safety?s=${box.s.toFixed(5)}&w=${box.w.toFixed(5)}&n=${box.n.toFixed(5)}&e=${box.e.toFixed(5)}`).catch((e) => ({ error: e.message })), out = document.getElementById("areaSafety");
  if (!out || areaNow !== a) return;
  const d = (x) => (x ? new Date(x).toLocaleDateString([], { timeZone: NYTZ, month: "short", day: "numeric" }) : "?");
  seen.areaSafety = r.error ? null : r;
  out.className = "";
  out.innerHTML = r.error ? `<p class="muted">${esc(r.error)}</p>` : `<details><summary><b>🛡 Official public-safety record</b> <span class="muted">NYPD & FDNY open data, weeks to months late</span></summary>
    <p><b>911 calls (NYPD), 90 days through ${d(r.calls911.through)}:</b> ${r.calls911.byType.slice(0, 8).map((t) => `${esc(t.type.toLowerCase())} <b>${t.n}</b>`).join(" · ") || "none"}</p>
    <p><b>Crime complaints, 90 days through ${d(r.crimeComplaints.through)}:</b> ${r.crimeComplaints.byOffense.slice(0, 8).map((t) => `${esc(t.offense.toLowerCase())} <b>${t.n}</b>`).join(" · ") || "none"}</p>
    <p><b>A year through ${d(r.shootings.through)}:</b> ${r.shootings.n} shooting incidents · <b>through ${d(r.crashes.through)}:</b> ${r.crashes.n} crashes, ${r.crashes.injured} injured, ${r.crashes.killed} killed</p>
    <p><b>FDNY fires, 35 days through ${d(r.fdnyFires.through)}:</b> ${r.fdnyFires.n} (${r.fdnyFires.serious} beyond a first alarm)</p></details>`;
}
// ✨: the server runs it as a job (one look at 5 of the area's cameras, then the brief) and the page follows it. The job
// lives outside the panel: closing the panel or opening another list doesn't lose it; reopening the area shows it, and
// a "✨ Brief ready" chip appears when it finishes while the area panel isn't showing.
let brief = null; // { box, label, step, result, error, t0, running }
const sameBox = (x, y) => x && y && ["s", "w", "n", "e"].every((k) => Math.abs(x[k] - y[k]) < 1e-6);
const briefShowing = () => !$("cityBrief").hidden && $("cityBrief").dataset.what === "area" && sameBox(brief?.box, areaNow?.box);
function renderBrief() {
  const o = document.getElementById("areaBrief"), btn = document.querySelector('#cityBrief [data-act="areabrief"]');
  if (btn) btn.disabled = !!brief?.running && sameBox(brief.box, areaNow?.box);
  if (!o || !briefShowing()) return void drawBar();
  const r = brief.result;
  o.innerHTML = brief.running ? `<p class="muted">⏳ ${esc(brief.step)} <span>${Math.round((Date.now() - brief.t0) / 1000)} s</span></p>`
    : brief.error ? `<p>${esc(brief.error)}</p>`
    : `<div class="briefbox"><b>✨ Brief</b> <span class="muted">${hhmm(r.at)} · by ${esc(r.by)}${r.cameras ? ` after looking at ${r.cameras} camera${r.cameras > 1 ? "s" : ""}` : ""}</span><ul>${bulletsHtml(r, "area")}</ul>
      <p class="muted">${r.dropped ? `${r.dropped} bullet(s) dropped for not matching the facts. ` : ""}Click a bullet for its places; hover a number for its fact.</p></div>`;
  if (!brief.running) { brief.seen = true; $("cityBrief").classList.remove("min"); $("cityBrief").querySelector(".pb").scrollTop = 0; } // unfold, and show it
  drawBar();
}
async function areaBriefNow() {
  const a = areaNow;
  if (!a || (brief?.running && sameBox(brief.box, a.box))) return;
  brief = { box: a.box, label: a.label, step: "Starting…", t0: Date.now(), running: true };
  const job = brief;
  renderBrief();
  const start = await fetch("/api/nyc/area-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a.box) })
    .then(async (r) => ((r.headers.get("content-type") ?? "").includes("json") ? r.json() : { error: `The server answered ${r.status}. Try again in a minute.` })).catch((e) => ({ error: e.message }));
  let r = start.error ? start : { error: "The brief took too long. Try again in a minute." };
  if (start.id) while (Date.now() - job.t0 < 6 * 60_000) { // behind any visitors' questions
    await new Promise((ok) => setTimeout(ok, 2000));
    // a 5xx or no answer is the site restarting: keep asking (a job the restart lost answers "That brief is gone")
    const j = await getJSON(`/api/nyc/brief-job?id=${encodeURIComponent(start.id)}`).catch((e) => (e instanceof TypeError || /^5\d\d /.test(e.message) ? {} : { error: e.message }));
    if (j.error || j.result) { r = j.error ? { error: j.error } : j.result; break; }
    job.step = j.step ?? "Working…";
    if (brief === job) renderBrief();
  }
  if (brief !== job) return; // a newer brief replaced this one
  Object.assign(job, { running: false, ...(r.error ? { error: r.error } : { result: r }) });
  if (!r.error) areaBriefData = r; // a bullet's click finds its facts here
  renderBrief();
}
refreshPulse(); setInterval(refreshPulse, 60_000);

// NYSDOT's live video is HLS: Safari plays it natively, other browsers through hls.js (cdnjs, loaded on first use).
// Resolves to a function that stops the download.
let hlsLib = null;
const loadHls = () => (hlsLib ??= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement("script"), {
  src: "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.6.16/hls.min.js", integrity: "sha512-zAODd1LM+/58SazX5fct5psehCijY60y5rG0BYIzxTXot7ovEo2FhfWTV0mp4oqIef2xriyg4zlrPlmFTDcPXg==", crossOrigin: "anonymous",
  onload: () => ok(window.Hls), onerror: () => { hlsLib = null; fail(new Error("video player didn't load")); } }))));
async function playHls(v, src, onFail) {
  v.addEventListener("error", onFail, { once: true });
  setTimeout(() => v.isConnected && v.readyState < 2 && onFail(), 12_000); // nothing after 12 s: the stream is down
  if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; return () => { v.removeAttribute("src"); v.load(); }; }
  const Hls = await loadHls(), h = new Hls(); h.loadSource(src); h.attachMedia(v);
  h.on(Hls.Events.ERROR, (_, d) => d.fatal && onFail());
  return () => h.destroy();
}

// Camera windows: several can be open at once, dragged anywhere, each refreshing its picture (or playing live video).
let camZ = 1, camCount = 0, upscaled = 0;
let cvSpeaking = false;
function stopSpeaking() {
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  cvSpeaking = false;
  document.querySelectorAll(".cv-speak-btn").forEach((b) => {
    b.textContent = "🔊 Listen";
    b.classList.remove("active");
  });
}
function speakText(text, btn) {
  if (!("speechSynthesis" in window) || !text) return;
  if (cvSpeaking) {
    stopSpeaking();
    return;
  }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1.0;
  u.pitch = 1.0;
  try {
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.startsWith("en") && !v.name.includes("whisper") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel") || v.default));
    if (en) u.voice = en;
  } catch {}
  u.onstart = () => {
    cvSpeaking = true;
    if (btn) { btn.textContent = "⏹ Stop"; btn.classList.add("active"); }
  };
  u.onend = () => {
    cvSpeaking = false;
    if (btn) { btn.textContent = "🔊 Listen"; btn.classList.remove("active"); }
  };
  u.onerror = () => {
    cvSpeaking = false;
    if (btn) { btn.textContent = "🔊 Listen"; btn.classList.remove("active"); }
  };
  window.speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) {
  try { window.speechSynthesis.onvoiceschanged = () => {}; } catch {}
}
function openCam(c) {
  if (document.getElementById(`cam-${c.id}`)) return;
  if (camCount >= 8) document.querySelector(".cam")?.remove(), camCount--;
  const w = document.createElement("div");
  w.className = "cam"; w.id = `cam-${c.id}`;
  const n = camCount++;
  Object.assign(w.style, { left: `${Math.min(innerWidth - 330, 380 + (n % 4) * 30)}px`, top: `${80 + (n % 4) * 30 + Math.floor(n / 4) * 250}px`, zIndex: ++camZ });
  const frame = () => (c.static ? c.image : `${c.image}${c.image.includes("?") ? "&" : "?"}t=${Date.now()}`); // photos: signed links, no cache-buster
  w.innerHTML = `<header><b title="${esc(c.name)}${c.h ? ` (${c.w ? `${c.w}×${c.h}` : `up to ${c.h}p`})` : ""}">${c.static ? "📸" : camEmoji(c)}${camQ(c) ? ` ${camQ(c)}` : ""} ${esc(c.name)}</b>${c.page ? `<a href="${esc(c.page)}" target="_blank" rel="noopener" style="font-size:.7rem"${c.download ? ` download="${esc(c.download)}"` : ""}>${esc(c.source)}</a>` : ""}${c.upscaled ? "" : `<button class="up" aria-label="Upscale this frame with AI" title="Upscale this frame ×4 with AI (SeedVR2 on the server's Mac, about 20 s)">✨</button>`}${c.static && !c.of ? "" : `<button class="cv" aria-label="Analyze with AI Vision" title="${c.of ? "Analyze the camera's real frame now with the local vision model (not the upscaled picture: its fine details are AI guesses)" : "Analyze the frame with the local vision model"}">👁</button>`}<button class="fs" aria-label="Full screen, and back" title="Full screen (and back)">⛶</button><button class="x" aria-label="Close camera">×</button></header>${c.youtube
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.youtube)}?autoplay=1&mute=1&playsinline=1" title="Live video: ${esc(c.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : c.video ? `<video muted autoplay playsinline poster="${esc(c.image)}" aria-label="Live video: ${esc(c.name)}"></video>`
    : `<img alt="${c.static ? "Street photo" : "Live camera"}: ${esc(c.name)}" src="${esc(frame())}">`}`;
  $("cams").append(w); requestAnimationFrame(camsInView);
  if (camCount === 1 || Math.random() < 0.3) dispatchEvent(new CustomEvent("blip:say", { detail: { text: pick(["Live from " + c.name + "!", "Ooh, traffic TV.", "Wave at the camera!", "Checking " + c.name + "…"]), mood: "happy" } }));
  seen.openCams.push(c.name);
  const img = w.querySelector("img"), tick = c.static || !img ? 0 : setInterval(() => (img.src = frame()), c.refreshMs ?? 4000);
  // until it plays (or if the stream is down) the window shows the camera's latest still, and says so when it's down
  const stop = c.video && playHls(w.querySelector("video"), c.video, () => { if (!w.querySelector(".cam-note")) w.insertAdjacentHTML("beforeend", `<div class="cam-note">Live video isn't coming through right now: this is the camera's latest still.</div>`); }).catch(() => {});
  // its spot on the map, ringed and pulsing while the window is open; a click brings the window to the front
  const mark = c.lat != null && !c.static ? L.marker([+c.lat, +c.lon], { icon: L.divIcon({ className: "cam-open", html: "📷", iconSize: [28, 28] }), zIndexOffset: 1000, title: c.name, keyboard: false })
    .on("click", () => (w.style.zIndex = ++camZ)).addTo(map) : null;
  w.insertAdjacentHTML("beforeend", `<i class="grip" aria-hidden="true"></i>`); // the bottom-right corner: drag it to resize both ways
  w.querySelector("button.x").onclick = () => { stopSpeaking(); clearInterval(tick); stop?.then((f) => f?.()); mark?.remove(); w.remove(); camCount--; seen.openCams = seen.openCams.filter((x) => x !== c.name); if (document.fullscreenElement === w) document.exitFullscreen().catch(() => {}); };
  // ✨: the server upscales the camera's frame of this moment (SeedVR2, upscale.ts) and it opens in a window of its
  // own, as a data: URL (nothing is kept on the server), with a link to save it.
  const upBtn = w.querySelector("button.up");
  if (upBtn) upBtn.onclick = async () => {
    const t0 = Date.now(), tick = setInterval(() => (upBtn.textContent = `⏳ ${Math.round((Date.now() - t0) / 1000)} s`), 1000);
    upBtn.disabled = true; upBtn.textContent = "⏳";
    const d = await fetch(`/api/nyc/upscale?cam=${encodeURIComponent(c.id)}`, { method: "POST" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
    clearInterval(tick); upBtn.disabled = false; upBtn.textContent = "✨";
    if (d.error) return dispatchEvent(new CustomEvent("blip:say", { detail: { text: d.error } }));
    const n = ++upscaled, at = new Date().toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit", second: "2-digit" }), src = `data:image/jpeg;base64,${d.img}`;
    openCam({ id: `up${n}`, of: c.id, name: `✨ ${c.name} · ${at} · ×4 by AI, ${d.w}×${d.h} (fine details are AI guesses)`, image: src, static: true, upscaled: true, page: src, source: "⬇ Save", download: `${c.name.replace(/[^\w-]+/g, "_")}-${d.w}x${d.h}.jpg` });
    Object.assign(document.getElementById(`cam-up${n}`).style, { width: `${Math.min(720, innerWidth - 20)}px`, height: `${Math.min(520, innerHeight - 100)}px` });
  };
  const cvBtn = w.querySelector("button.cv");
  if (cvBtn) cvBtn.onclick = async () => {
    stopSpeaking();
    cvBtn.disabled = true; cvBtn.textContent = "⏳";
    if (w.offsetWidth < 400 && innerWidth >= 440) w.style.width = "400px";
    if (w.offsetHeight < 360 && innerHeight >= 400) w.style.height = "360px";
    const d = await getJSON(`/api/nyc/camera-inspect?id=${encodeURIComponent(c.of ?? c.id)}`).catch((e) => ({ error: e.message })); // an upscaled window asks its camera
    cvBtn.disabled = false; cvBtn.textContent = "👁";
    if (d.error) return dispatchEvent(new CustomEvent("blip:say", { detail: { text: "CV analysis failed: " + d.error } }));
    let box = w.querySelector(".cam-cv-box");
    if (!box) {
      box = Object.assign(document.createElement("div"), { className: "cam-cv-box" });
      w.append(box);
    }
    const flowClass = d.trafficFlow === "clear" || d.trafficFlow === "light" ? "flow-clear" : d.trafficFlow === "heavy" ? "flow-heavy" : d.trafficFlow === "gridlock" || d.trafficFlow === "stopped" ? "flow-gridlock" : "flow-moderate";
    const flowIcon = d.trafficFlow === "clear" || d.trafficFlow === "light" ? "🟢" : d.trafficFlow === "heavy" ? "🔴" : d.trafficFlow === "gridlock" || d.trafficFlow === "stopped" ? "🛑" : "🟡";
    const flowLabel = d.trafficFlow ? `${flowIcon} ${esc(d.trafficFlow.charAt(0).toUpperCase() + d.trafficFlow.slice(1))} Traffic` : "";
    const weatherIcon = d.weather === "rain" ? "🌧" : d.weather === "snow" ? "❄️" : d.weather === "overcast" ? "☁️" : d.weather === "fog" ? "🌫" : "☀️";
    const roadIcon = d.roadCondition === "flooded" ? "🌊" : d.roadCondition === "wet" ? "💦" : d.roadCondition === "snow_covered" ? "❄️" : "🛣️";
    const conditionLabel = (d.weather || d.roadCondition) ? `${weatherIcon} ${esc(d.weather || "")}${d.weather && d.roadCondition ? " · " : ""}${roadIcon} ${esc(d.roadCondition ? d.roadCondition.replace("_", " ") : "")}` : "";

    const objKindIcons = { car: "🚗", suv: "🚙", taxi: "🚕", bus: "🚌", truck: "🚚", bicycle: "🚲", motorcycle: "🏍️", pedestrian: "🚶", emergency_vehicle: "🚨", construction: "🚧", debris: "⚠️" };
    const chips = (Array.isArray(d.objects) ? d.objects : []).map((o) => {
      const ic = objKindIcons[o.kind] || "📍";
      const cnt = o.count && o.count > 1 ? ` ×${o.count}` : "";
      const act = o.action ? ` (${esc(o.action)})` : "";
      return `<span class="cv-chip">${ic} <b>${esc(o.label || o.kind)}</b>${cnt}${act}</span>`;
    }).join("");

    const descToRead = d.description || d.text || "";
    const hasTts = "speechSynthesis" in window;
    box.innerHTML = `
      <div class="cv-hdr">
        <div class="cv-title"><span>👁</span> <b>Qwen Vision Analysis</b>${c.of ? ` <small>of the camera's real frame now, not the upscale</small>` : ""}</div>
        <div class="cv-actions">
          ${hasTts ? `<button class="cv-speak-btn" title="Read description out loud">🔊 Listen</button>` : ""}
          <button class="cv-close-btn" title="Close" aria-label="Close CV analysis">×</button>
        </div>
      </div>
      <div class="cv-badges">
        ${flowLabel ? `<span class="cv-badge ${flowClass}">${flowLabel}</span>` : ""}
        ${conditionLabel ? `<span class="cv-badge">${conditionLabel}</span>` : ""}
        ${d.emergencyActivity ? `<span class="cv-badge alert">🚨 Emergency Activity</span>` : ""}
        ${d.smokeOrFire ? `<span class="cv-badge alert">🔥 Smoke / Fire</span>` : ""}
      </div>
      ${chips ? `<div class="cv-objects">${chips}</div>` : ""}
      <div class="cv-desc">${esc(descToRead)}</div>
    `;

    const closeBtn = box.querySelector(".cv-close-btn");
    if (closeBtn) closeBtn.onclick = () => { stopSpeaking(); box.remove(); };

    const spkBtn = box.querySelector(".cv-speak-btn");
    if (spkBtn) {
      spkBtn.onclick = () => speakText(descToRead, spkBtn);
      speakText(descToRead, spkBtn);
    }
    dispatchEvent(new CustomEvent("blip:say", { detail: { text: `Looking at ${c.name}: ${descToRead}`, mood: "happy" } }));
  };
  // Full screen (the browser's, when it allows it; otherwise the window just fills the page) and back.
  const fsBtn = w.querySelector("button.fs"), big = () => document.fullscreenElement === w || w.classList.contains("max");
  fsBtn.onclick = async () => {
    if (document.fullscreenElement === w) return document.exitFullscreen().catch(() => {});
    if (w.classList.contains("max")) { w.classList.remove("max"); fsBtn.textContent = "⛶"; return; }
    try { await w.requestFullscreen(); } catch { w.classList.add("max"); fsBtn.textContent = "⤡"; }
  };
  w.addEventListener("fullscreenchange", () => (fsBtn.textContent = document.fullscreenElement === w ? "⤡" : "⛶"));
  w.addEventListener("pointerdown", () => (w.style.zIndex = ++camZ));
  // Resize from any edge or corner: within 8 px of a border, or 18 px of a corner (both ways at once), the cursor shows the direction.
  const EDGE = 8, CORNER = 18;
  const edges = (e) => {
    if (big()) return { n: false, s: false, w: false, e: false };
    const r = w.getBoundingClientRect(), n = e.clientY - r.top, s = r.bottom - e.clientY, wl = e.clientX - r.left, er = r.right - e.clientX;
    const c = (n < CORNER || s < CORNER) && (wl < CORNER || er < CORNER), m = c ? CORNER : EDGE;
    return { n: n < m, s: s < m, w: wl < m, e: er < m };
  };
  const cursorFor = (d) => ((d.n && d.w) || (d.s && d.e) ? "nwse-resize" : (d.n && d.e) || (d.s && d.w) ? "nesw-resize" : d.n || d.s ? "ns-resize" : d.w || d.e ? "ew-resize" : "");
  w.addEventListener("pointermove", (e) => { if (!w.dataset.resizing) w.style.cursor = cursorFor(edges(e)); });
  w.addEventListener("pointerdown", (e) => {
    const d = edges(e);
    if (!(d.n || d.s || d.w || d.e)) return;
    e.preventDefault(); e.stopPropagation();
    w.style.zIndex = ++camZ;
    w.dataset.resizing = "1";
    const r0 = { x: e.clientX, y: e.clientY, left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight };
    // the listeners live on the window for the drag, so leaving the box (or a browser without pointer capture) doesn't end it
    const move = (m) => {
      const dx = m.clientX - r0.x, dy = m.clientY - r0.y;
      if (d.e) w.style.width = `${Math.max(180, r0.width + dx)}px`;
      if (d.s) w.style.height = `${Math.max(140, r0.height + dy)}px`;
      if (d.w) { const nw = Math.max(180, r0.width - dx); w.style.width = `${nw}px`; w.style.left = `${r0.left + r0.width - nw}px`; }
      if (d.n) { const nh = Math.max(140, r0.height - dy); w.style.height = `${nh}px`; w.style.top = `${r0.top + r0.height - nh}px`; }
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); delete w.dataset.resizing; camsInView(); };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  }, true); // capture: the border wins over the title bar's move handler
  const head = w.querySelector("header");
  head.ondblclick = (e) => { if (e.target.tagName !== "BUTTON") fsBtn.click(); };
  head.addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "BUTTON" || w.dataset.resizing || big()) return;
    const sx = e.clientX - w.offsetLeft, sy = e.clientY - w.offsetTop;
    const top = (document.querySelector(".ihor-hud")?.getBoundingClientRect().bottom ?? 0) + 4;
    const move = (m) => { w.style.left = `${Math.max(0, Math.min(innerWidth - 60, m.clientX - sx))}px`; w.style.top = `${Math.max(top, Math.min(innerHeight - 40, m.clientY - sy))}px`; };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  });
}

// Trip planner: route from the server (Valhalla + GeoSearch) and the traffic cameras along it, in order.
const tripLayer = L.layerGroup().addTo(map);
// Picking start/end on the map: the 📍 button arms the next map click; the point becomes a draggable marker
// (drag it to re-plan). The input shows the nearest address but the route uses the exact point.
const picked = {}, pinMarkers = {};
const stopIds = () => [...$("tStops").querySelectorAll("input")].map((i) => i.id);
const ready = () => $("tFrom").value.trim() && $("tTo").value.trim();
const replan = () => { if (ready()) $("trip").requestSubmit(); };
// The mode (Commute unless you picked another last time) and the options re-plan as soon as they change: no Plan press.
try { const m = document.querySelector(`input[name="tMode"][value="${localStorage.getItem("nyc.tripMode")}"]`); if (m) m.checked = true; } catch {}
$("trip").addEventListener("change", (e) => {
  if (e.target.name === "tMode") try { localStorage.setItem("nyc.tripMode", e.target.value); } catch {}
  if (e.target.name === "tMode" || e.target.id === "tNoFerry" || e.target.id === "tAccess") replan();
});
function pinIcon(id) {
  const n = stopIds().indexOf(id) + 1, color = id === "tFrom" ? "#5cff9d" : id === "tTo" ? "#ff5c8a" : "#ffb347";
  return L.divIcon({ className: "", html: `<div style="position:relative;font-size:26px;line-height:26px;filter:drop-shadow(0 0 2px #000);color:${color}">📍${n ? `<b class="pin-n">${n}</b>` : ""}</div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
}
let picking = null;
const setPicking = (id) => {
  picking = id;
  if (id) { showTab("trip"); fold(false); }
  document.body.classList.toggle("picking", !!id);
  $("pickHint").hidden = !id;
  document.querySelectorAll(".pick").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.for === id)));
};
$("trip").addEventListener("click", (e) => {
  const b = e.target.closest(".pick"), rm = e.target.closest("[data-rm]");
  if (b) setPicking(picking === b.dataset.for ? null : b.dataset.for);
  if (rm) removeStop(rm.dataset.rm);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && picking) setPicking(null); });
/** A start, stop or destination pin at `latlng`; the field shows `label`, or the nearest address once it's looked up. */
async function placePin(id, latlng, label) {
  showTab("trip");
  picked[id] = { lat: latlng.lat, lon: latlng.lng };
  pinMarkers[id]?.remove();
  pinMarkers[id] = L.marker(latlng, { icon: pinIcon(id), draggable: true, title: id === "tFrom" ? "Start" : id === "tTo" ? "Destination" : "Stop" }).addTo(map)
    .on("dragend", (ev) => placePin(id, ev.target.getLatLng()).then(replan));
  if (label) return void ($(id).value = picked[id].label = label);
  $(id).value = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  const d = await getJSON(`/api/nyc/point?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}`).catch(() => null);
  if (d?.found && picked[id]?.lat === latlng.lat) $(id).value = d.address || d.place;
  picked[id].label = $(id).value;
}
$("trip").addEventListener("input", (e) => {
  const id = e.target.id;
  if (!e.target.matches("input[role=combobox]")) return;
  picked[id] = null; pinMarkers[id]?.remove(); delete pinMarkers[id];
  suggestFor(e.target);
});

// Stops on the way (up to 6), in order between the start and the destination.
let stopSeq = 0;
function addStop(value = "", focus = true) {
  if (stopIds().length >= 6) return;
  const id = `tS${++stopSeq}`, row = document.createElement("label");
  row.innerHTML = `<span class="sn"></span> <span class="pickrow"><input id="${id}" placeholder="A stop on the way" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sugg"><button type="button" class="pick" data-for="${id}" title="Pick this stop on the map" aria-label="Pick this stop on the map">📍</button><button type="button" data-rm="${id}" title="Remove this stop" aria-label="Remove this stop">✕</button></span>`;
  $("tStops").append(row);
  $(id).value = value;
  renumber();
  if (focus) $(id).focus();
}
function removeStop(id) {
  $(id).closest("label").remove();
  delete picked[id]; pinMarkers[id]?.remove(); delete pinMarkers[id];
  renumber(); replan();
}
function renumber() {
  stopIds().forEach((id, i) => { $(id).closest("label").querySelector(".sn").textContent = `Stop ${i + 1}`; pinMarkers[id]?.setIcon(pinIcon(id)); });
  $("tAddStop").hidden = stopIds().length >= 6;
}
$("tAddStop").onclick = () => addStop();

// Search as you type: a dropdown of matching places (OpenStreetMap names, NYC addresses). ↑/↓ and Enter pick one.
const sugg = $("sugg"), suggCache = new Map();
let suggFor = null, suggItems = [], suggActive = -1, suggTimer = 0;
let camsList = null; // the camera list, once loaded, for the search box
/** What on the map matches the search: stations, today's incidents and security news, placed news, cameras (6 at most). */
function localMatches(q) {
  const t = q.toLowerCase(), hit = (x) => String(x ?? "").toLowerCase().includes(t), out = [], seenIds = new Set();
  for (const [id, st] of stations) if (hit(st.name)) out.push({ name: `🚇 ${st.name}`, detail: st.routes, lat: st.lat, lon: st.lon, station: id });
  for (const c of [...(cityData.security?.incidents ?? []), ...(cityData.incidents?.incidents ?? [])]) if (!seenIds.has(c.id) && hit(c.title)) { seenIds.add(c.id); out.push({ name: `${FAM_ICON[famOf(c)]} ${c.title}`, detail: [c.hood ?? c.borough, ago(c.starts)].filter(Boolean).join(" · "), lat: c.lat, lon: c.lon, inc: c }); }
  for (const n of cityData.news?.items ?? []) if (n.lat != null && hit(n.title)) out.push({ name: `📰 ${n.title}`, detail: n.outlet, lat: n.lat, lon: n.lon, news: n });
  for (const c of camsList ?? []) if (hit(c.name)) out.push({ name: `${camEmoji(c)} ${c.name}`, detail: "camera", lat: c.lat, lon: c.lon, cam: c });
  return out.slice(0, 6);
}
$("q").addEventListener("focus", () => { // what the search box looks through, fetched once on first use
  (camsCache ??= getJSON("/api/nyc/cameras")).then((l) => (camsList = l)).catch(() => {});
  if (!cityData.news) getJSON("/api/nyc/news").then((d) => (cityData.news ??= d)).catch(() => {});
  if (!cityData.incidents) getJSON("/api/nyc/incidents").then((d) => (cityData.incidents ??= d)).catch(() => {});
}, { once: true });
function suggestFor(input) {
  clearTimeout(suggTimer);
  const q = input.value.trim();
  if (q.length < 2) return hideSugg();
  const mine = input.id === "q" ? localMatches(q) : [];
  if (mine.length) showSugg(input, mine);
  suggTimer = setTimeout(async () => {
    const near = viewInNyc() ? "" : `&near=${viewCenter().lat.toFixed(2)},${viewCenter().lng.toFixed(2)}`, key = q + near;
    const list = suggCache.get(key) ?? (await getJSON(`/api/nyc/suggest?q=${encodeURIComponent(q)}${near}`).catch(() => []));
    suggCache.set(key, list);
    if (input.value.trim() === q && document.activeElement === input) showSugg(input, [...(input.id === "q" ? localMatches(q) : []), ...list]);
  }, 200);
}
function showSugg(input, list) {
  if (!list.length) return hideSugg();
  suggFor = input; suggItems = list; suggActive = -1;
  sugg.innerHTML = list.map((s, i) => `<li role="option" id="sg${i}" aria-selected="false"><b>${esc(s.name)}</b> <span class="muted">${esc([s.detail, s.kind === "address" || s.kind === "yes" ? "" : s.kind].filter(Boolean).join(" · "))}</span></li>`).join("");
  const r = input.getBoundingClientRect();
  Object.assign(sugg.style, { left: `${r.left}px`, top: `${r.bottom + 2}px`, width: `${Math.max(r.width, 280)}px` });
  sugg.hidden = false;
  input.setAttribute("aria-expanded", "true");
}
function hideSugg() {
  clearTimeout(suggTimer);
  sugg.hidden = true;
  suggFor?.setAttribute("aria-expanded", "false");
  suggFor?.removeAttribute("aria-activedescendant");
  suggFor = null;
}
async function choose(i) {
  const s = suggItems[i], id = suggFor.id;
  hideSugg();
  if (id === "q") {
    $("q").value = s.name.replace(/^\S+ /u, (m) => (s.station || s.inc || s.news || s.cam ? "" : m));
    if (s.station) { history.replaceState(null, "", `#station=${s.station}`); return focusHash(); }
    if (s.inc) return openDetail(s.inc);
    if (s.cam) { centerInView(L.latLng(s.lat, s.lon), 16); return openCam(s.cam); }
    if (s.news) { await toggle("news", true); const m = cityMarks.get(`news|${s.news.id}`); return m ? focusOn(m) : centerInView(L.latLng(s.lat, s.lon), 16); }
    return showHere(L.latLng(s.lat, s.lon), s.detail ? `${s.name}, ${s.detail}` : s.name);
  }
  await placePin(id, L.latLng(s.lat, s.lon), s.detail ? `${s.name}, ${s.detail}` : s.name);
  if (ready()) return replan();
  map.panTo([s.lat, s.lon]);
  ["tFrom", ...stopIds(), "tTo"].map((x) => $(x)).find((x) => !x.value.trim())?.focus(); // on to the next empty field
}
sugg.addEventListener("pointerdown", (e) => { e.preventDefault(); const li = e.target.closest("li"); if (li) choose([...sugg.children].indexOf(li)); }); // keeps focus in the field
const suggKeys = (e) => {
  if (sugg.hidden || e.target !== suggFor) return;
  const n = suggItems.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    suggActive = e.key === "ArrowDown" ? (suggActive + 1) % n : suggActive <= 0 ? n - 1 : suggActive - 1;
    [...sugg.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === suggActive)));
    sugg.children[suggActive].scrollIntoView({ block: "nearest" });
    suggFor.setAttribute("aria-activedescendant", `sg${suggActive}`);
  } else if (e.key === "Enter" && suggActive >= 0) { e.preventDefault(); choose(suggActive); }
  else if (e.key === "Escape") hideSugg();
};
for (const f of ["trip", "search"]) { $(f).addEventListener("keydown", suggKeys); $(f).addEventListener("focusout", (e) => { if (e.target === suggFor) hideSugg(); }); }
// The search box: type for suggestions; Enter or Go without picking one finds the best match.
$("q").addEventListener("input", (e) => suggestFor(e.target));
$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  hideSugg();
  const g = await getJSON(`/api/nyc/geocode?q=${encodeURIComponent(q)}${viewInNyc() ? "" : `&near=${viewCenter().lat.toFixed(2)},${viewCenter().lng.toFixed(2)}`}`).catch(() => null);
  if (!g) return ($("status").textContent = `Couldn't find "${q}" in NYC.`);
  showHere(L.latLng(g.lat, g.lon), g.label);
});
$("panel").addEventListener("scroll", hideSugg);
const tripEnd = (id) => (picked[id] && $(id).value === picked[id].label ? `${picked[id].lat},${picked[id].lon}` : $(id).value.trim());

// Where am I: the ◎ map button follows you with a blue dot (accuracy circle around it); 🎯 next to From
// uses that spot as the start. Location comes from the browser and never leaves it (only the start, when you plan).
const meLayer = L.layerGroup().addTo(map);
let meAt = null, meAccuracy = 0, meWanted = false, meAuto = false; // meAuto: started by the page, not a click
const meBtn = L.DomUtil.create("a");
Object.assign(meBtn, { href: "#", role: "button", textContent: "◎", title: "Show me on the map" });
meBtn.setAttribute("aria-label", "Show me on the map");
meBtn.style.fontSize = "18px";
L.DomEvent.disableClickPropagation(meBtn);
// ◎ brings you into view; pressed while you're already in the middle of it, it stops following you
meBtn.onclick = (e) => { e.preventDefault(); meAt && map.getBounds().pad(-0.3).contains(meAt) ? stopMe() : locateMe(); };
new (L.Control.extend({ onAdd: () => { const d = L.DomUtil.create("div", "leaflet-bar"); d.append(meBtn); return d; } }))({ position: "topright" }).addTo(map);
const startHere = () => placePin("tFrom", meAt).then(() => { if ($("tTo").value) $("trip").requestSubmit(); else setPicking("tTo"); });
function locateMe(asStart = false, auto = false) {
  meWanted = asStart;
  meAuto = auto;
  meBtn.style.color = "var(--accent)";
  if (meAt) { map.setView(meAt, Math.max(map.getZoom(), 16)); if (asStart) { meWanted = false; startHere(); } return; }
  map.locate({ watch: true, enableHighAccuracy: true });
}
function stopMe() { map.stopLocate(); meLayer.clearLayers(); meAt = null; meBtn.style.color = ""; }
let mapTouched = false; // dragged by hand before your position came in
map.on("dragstart", () => (mapTouched = true));
map.on("locationfound", (e) => {
  const first = !meAt;
  meAt = e.latlng; meAccuracy = e.accuracy;
  meLayer.clearLayers();
  L.circle(e.latlng, { radius: e.accuracy, color: "#1c7ed6", weight: 1, fillOpacity: 0.1, interactive: false }).addTo(meLayer);
  L.circleMarker(e.latlng, { radius: 8, color: "#fff", weight: 3, fillColor: "#1c7ed6", fillOpacity: 1, bubblingMouseEvents: false }).bindTooltip(`You are here (±${Math.round(e.accuracy)} m)`).addTo(meLayer);
  if (first && !meAuto) map.setView(e.latlng, Math.max(map.getZoom(), 16)); // on load you're a dot on the city view; ◎ comes to you
  if (meWanted) { meWanted = false; startHere(); }
});
map.on("locationerror", (e) => {
  stopMe();
  meWanted = false;
  if (meAuto) return; // denied or unavailable on load: stay quiet, the buttons still explain
  L.popup().setLatLng(viewCenter()).setContent(`Couldn't get your location: ${esc(e.message)}. Allow location for this site in the browser, or pick the start with 📍.`).openOn(map);
});
$("tHere").onclick = () => locateMe(true);
const NYC = L.latLngBounds([40.49, -74.27], [40.92, -73.68]);
locateMe(false, true); // show you on the map right away (no start set)
// The map opens on the whole city, fitted into the part nothing floats over: the God's-eye view. A link chooses its own view.
// Fitted once the page is laid out (the phone's sheet folded) and again when the city bar first fills, unless you moved it.
let openedOn = "";
const viewKey = () => `${map.getCenter().toString()}|${map.getZoom()}`;
// on a phone the whole city's width is a zoom level too far out: the dense middle (to SI's east shore and eastern Queens) fills it
function cityView() { if (location.hash) return; const f = freeArea(), size = map.getSize(); map.fitBounds(phone() ? L.latLngBounds([40.56, -74.12], [40.89, -73.76]) : NYC, { paddingTopLeft: [f.left, f.top], paddingBottomRight: [Math.max(0, size.x - f.right), Math.max(0, size.y - f.bottom)], animate: false }); openedOn = viewKey(); }

// Clear: route, pins, both fields and the result list.
$("tClear").onclick = () => {
  tripLayer.clearLayers();
  for (const id of ["tFrom", "tTo"]) { $(id).value = ""; picked[id] = null; pinMarkers[id]?.remove(); delete pinMarkers[id]; }
  for (const id of stopIds()) { $(id).closest("label").remove(); delete picked[id]; pinMarkers[id]?.remove(); delete pinMarkers[id]; }
  renumber();
  setPicking(null);
  $("tripOut").textContent = "";
  seen.trip = null;
};

$("trip").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideSugg();
  const from = tripEnd("tFrom"), to = tripEnd("tTo"), viaIds = stopIds().filter((id) => tripEnd(id));
  if (!from || !to) return;
  showTab("trip");
  $("tripOut").textContent = "Planning…";
  tripLayer.clearLayers();
  const d = await getJSON(`/api/nyc/trip?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${viaIds.map((id) => `&via=${encodeURIComponent(tripEnd(id))}`).join("")}&mode=${document.querySelector('input[name="tMode"]:checked').value}${$("tNoFerry").checked ? "&ferry=0" : ""}${$("tAccess").checked ? "&access=1" : ""}`).catch((err) => ({ error: err.message }));
  if (d.error) return ($("tripOut").innerHTML = `${esc(d.error)}${otherModes()}`);
  d.viaIds = viaIds;
  if (d.mode === "transit") return showCommute(d, 0);
  seen.trip = { from: d.from.label, to: d.to.label, stops: d.stops?.map((x) => x.label), mode: d.mode, ferry: d.usesFerry, eta: d.eta, jams: d.jams, km: d.distanceKm, minutes: d.minutes, cameras: d.cameras.map((c) => ({ cameraId: c.id, name: c.name })) };
  const line = L.polyline(d.line, { color: "#4de1ff", weight: 5, opacity: 0.85 }).addTo(tripLayer);
  // Traffic on the route (car trips): each jam painted over the line by how bad it is.
  const JAM = { 1: ["#ffd166", "slow"], 2: ["#ff9f1c", "heavy"], 3: ["#ff5c8a", "jammed"], 4: ["#b3002d", "closed or stopped"] };
  for (const j of d.jams ?? []) {
    const [color, word] = JAM[j.magnitude] ?? JAM[1];
    L.polyline(d.line.slice(j.from, j.to + 1), { color, weight: 7, opacity: 0.95, bubblingMouseEvents: false })
      .bindTooltip(`${j.kind === "ROAD_WORK" ? "Road work" : j.kind === "ROAD_CLOSURE" ? "Closure" : "Traffic"}: ${word}${j.delayMinutes ? `, +${j.delayMinutes} min` : ""}${j.kmh != null ? `, ${j.kmh} km/h` : ""}`).addTo(tripLayer);
  }
  if (!pinMarkers.tFrom) dot(d.from.lat, d.from.lon, "#5cff9d", 8).bindTooltip(`Start: ${d.from.label}`).addTo(tripLayer);
  if (!pinMarkers.tTo) dot(d.to.lat, d.to.lon, "#ff5c8a", 8).bindTooltip(`End: ${d.to.label}`).addTo(tripLayer);
  stopDots(d);
  for (const c of d.cameras) camMarker(c).addTo(tripLayer);
  map.fitBounds(line.getBounds().pad(0.1));
  const tr = d.traffic, slow = tr?.onRoute.filter((l) => l.mph < 20) ?? [];
  const trafficHtml = !tr ? "" : tr.stale ? `<div class="muted">Live speeds unavailable: NYC DOT's feed last updated ${new Date(tr.asOf).toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" })}.</div>`
    : `<div class="muted">${tr.onRoute.length} road segments with live speeds on the way${slow.length ? `; slow: ${slow.slice(0, 4).map((l) => `${esc(l.name)} ${Math.round(l.mph)} mph`).join(", ")}` : ", all moving"}.</div>`;
  $("tripOut").innerHTML = trafficHtml + (d.usesFerry ? `<div class="muted">⛴ This route includes a ferry${d.avoidFerries ? " (there's no way around it)" : ""}.</div>` : "") + `<b>${d.distanceKm} km · ~${d.minutes} min</b> ${d.mode === "drive" ? "by car" : d.mode === "bike" ? "by bike" : "on foot"} · ${d.cameras.length} cameras on the way
    ${d.jams?.length ? `<div class="legend">${d.jams.length} traffic spot${d.jams.length > 1 ? "s" : ""} on the route: <i style="background:#ffd166"></i>slow <i style="background:#ff9f1c"></i>heavy <i style="background:#ff5c8a"></i>jammed <i style="background:#b3002d"></i>stopped</div>` : d.mode === "drive" && d.eta.delayMinutes != null ? `<div class="legend"><i style="background:#4de1ff"></i>no jams on the route</div>` : ""}
    <div class="muted">${d.eta.delayMinutes != null ? `${d.eta.delayMinutes ? `${d.eta.delayMinutes} min of it is traffic; ` : "no traffic delays right now; "}${d.eta.noTrafficMinutes} min on empty roads (${esc(d.eta.source)})` : `Time from ${esc(d.eta.source)}.`}</div>
    ${d.cameras.length ? `<button id="openTrip" style="display:block;margin:6px 0">Open the first 4 cameras</button>` : ""}
    <ol style="padding-left:18px;margin:4px 0">${d.cameras.map((c, i) => `<li><a href="#" data-i="${i}">${esc(c.name)}</a> <span class="muted">km ${c.kmAlong}</span></li>`).join("")}</ol>`;
  $("tripOut").querySelectorAll("a[data-i]").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); openCam(d.cameras[+a.dataset.i]); }));
  $("openTrip")?.addEventListener("click", () => d.cameras.slice(0, 4).forEach(openCam));
});

// When one way doesn't work (or only gets close), the others are one click away; the mode change re-plans.
const MODE_NAMES = { drive: "🚗 By car", bike: "🚲 By bike", walk: "🚶 Walk", transit: "🚇 Commute" };
const otherModes = () => { const cur = document.querySelector('input[name="tMode"]:checked').value;
  return `<div class="acts" style="margin:6px 0">Try: ${Object.entries(MODE_NAMES).filter(([k]) => k !== cur).map(([k, t]) => `<button type="button" data-mode="${k}">${t}</button>`).join(" ")}</div>`; };
$("tripOut").addEventListener("click", (e) => { const m = e.target.closest("[data-mode]")?.dataset.mode; if (!m) return; const r = document.querySelector(`input[name="tMode"][value="${m}"]`); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); });
const stopDots = (d) => (d.stops ?? []).forEach((s, i) => { if (!pinMarkers[d.viaIds?.[i]]) dot(s.lat, s.lon, "#ffb347", 8).bindTooltip(`Stop ${i + 1}: ${esc(s.label)}`).addTo(tripLayer); });

// Commute (subway + bus + walking): options from Transitous; pick one to see it on the map, step by step.
const hm = (t) => new Date(t).toLocaleTimeString([], { timeZone: NYTZ, hour: "numeric", minute: "2-digit" });
const legBullet = (l) => (l.mode === "SUBWAY" ? bullet(l.route) : busBullet({ name: l.route, color: l.color ?? "#1c7ed6", text: l.text }));
const fromNow = (t) => Math.max(0, Math.round((Date.parse(t) - Date.now()) / 60000));
const legColor = (l) => (l.mode === "SUBWAY" ? ROUTE_COLOR[l.route.replace(/X$/, "")] ?? l.color : l.color) ?? "#1c7ed6";
function showCommute(d, pick) {
  tripLayer.clearLayers();
  const o = d.options[pick];
  seen.trip = { from: d.from.label, to: d.to.label, stops: d.stops?.map((x) => x.label), mode: "commute", options: d.options.map((x) => `arrive ${hm(x.arrive)} (${fromNow(x.arrive)} min from now), leave ${hm(x.depart)}, ${x.minutes} min on the way incl. ${x.waitMinutes} min waiting at stops: ${x.legs.map((l) => (l.mode === "WALK" ? `walk ${l.minutes} min` : `${l.route} ${l.from} → ${l.to}`)).join(", ")}`) };
  const lines = o.legs.map((l) => L.polyline(l.line, l.mode === "WALK" ? { color: "#9aa3cf", weight: 4, dashArray: "3 7" } : { color: legColor(l), weight: 6, opacity: 0.9 })
    .bindTooltip(l.mode === "WALK" ? `Walk ${l.minutes} min` : `${esc(l.route)} toward ${esc(l.headsign)}: ${esc(l.from)} → ${esc(l.to)}`).addTo(tripLayer));
  for (const l of o.legs.filter((x) => x.mode !== "WALK")) dot(l.line[0][0], l.line[0][1], legColor(l), 6).bindTooltip(`Board the ${esc(l.route)} at ${esc(l.from)}`).addTo(tripLayer);
  if (!pinMarkers.tFrom) dot(d.from.lat, d.from.lon, "#5cff9d", 8).bindTooltip(`Start: ${esc(d.from.label)}`).addTo(tripLayer);
  if (!pinMarkers.tTo) dot(d.to.lat, d.to.lon, "#ff5c8a", 8).bindTooltip(`End: ${esc(d.to.label)}`).addTo(tripLayer);
  stopDots(d);
  const sh = d.short; // transit only gets near one end: the rest drawn as a gap
  if (sh) lines.push(L.polyline([[sh.lat, sh.lon], sh.end === "to" ? [d.to.lat, d.to.lon] : [d.from.lat, d.from.lon]], { color: "#e03131", weight: 3, dashArray: "2 8" })
    .bindTooltip(`No subway or bus here: ${sh.meters} m in a straight line`).addTo(tripLayer));
  if (sh) seen.trip.note = sh.note;
  map.fitBounds(L.featureGroup(lines).getBounds().pad(0.1), { paddingTopLeft: [Math.max(20, $("panel").getBoundingClientRect().right - $("map").getBoundingClientRect().left + 20), 20] });
  // live: the MTA reported this train or bus's real position/time; otherwise the times are the timetable's
  const badges = (x) => { const t = x.legs.filter((l) => l.mode !== "WALK"), live = t.filter((l) => l.realTime).length;
    return `<br><span class="muted">${t.length ? (live === t.length ? "🟢 live times" : live ? `🟢 ${live} of ${t.length} legs live` : "🕒 timetable times") : ""}${x.alerts?.length ? ` · ⚠ ${x.alerts.length} alert${x.alerts.length > 1 ? "s" : ""}` : ""}${x.access ? (x.access.stepFree ? " · ♿ step-free" : ` · <span class="warn">♿ ${x.access.notes.length} issue${x.access.notes.length > 1 ? "s" : ""}</span>`) : ""}</span>`; };
  const chips = (x) => x.legs.map((l) => (l.mode === "WALK" ? `<span class="muted">🚶${l.minutes}</span>` : legBullet(l))).join(' <span class="muted">›</span> ');
  // waiting at a stop: the gap between getting there and the bus or train leaving
  const wait = (l, i) => { const g = i && l.mode !== "WALK" ? Math.round((Date.parse(l.depart) - Date.parse(o.legs[i - 1].arrive)) / 60000) : 0; return g >= 2 ? `<li class="muted">⏱ Wait ${g} min for the ${esc(l.route)}</li>` : ""; };
  const step = (l, i) => wait(l, i) + (l.mode === "WALK"
    ? `<li>🚶 Walk ${l.estimated ? "~" : ""}${l.minutes} min to ${esc(i === o.legs.length - 1 ? (sh?.end === "to" ? sh.stop : d.to.label) : o.legs[i + 1]?.from ?? "")}</li>`
    : `<li>${legBullet(l)} <b>${esc(l.route)}</b> toward ${esc(l.headsign)}<br><span class="muted">${hm(l.depart)} ${esc(l.from)} → ${hm(l.arrive)} ${esc(l.to)} · ${l.stops} stop${l.stops > 1 ? "s" : ""}, ${l.minutes} min${l.realTime ? " · live time" : ""}</span>
       ${l.trip ? `<br><button class="linkish" data-trip="${esc(l.trip)}" data-stop="${esc(l.stop)}">Where is this train now?</button>` : ""}</li>`);
  const stepAndStop = (l, i) => step(l, i) + (l.stopAfter ? `<li>📍 <b>Stop: ${esc(l.stopAfter)}</b></li>` : "");
  $("tripOut").innerHTML = (sh ? `<div class="warn">⚠ ${esc(sh.note)}</div>${otherModes()}` : "") + d.options.map((x, i) => `<button class="opt${i === pick ? " on" : ""}" data-o="${i}" aria-pressed="${i === pick}"><b>Arrive ${hm(x.arrive)}</b> · ${fromNow(x.arrive)} min from now<br><span class="muted">leave ${fromNow(x.depart) ? `in ${fromNow(x.depart)} min` : "now"} · ${x.minutes} min on the way${x.waitMinutes ? `, ${x.waitMinutes} of it waiting at stops` : ""}${x.transfers ? ` · ${x.transfers} transfer${x.transfers > 1 ? "s" : ""}` : ""}</span><br>${chips(x)}${badges(x)}</button>`).join("")
    + (o.access && !o.access.stepFree ? `<div class="warn">♿ Not step-free: ${o.access.notes.map(esc).join("; ")}</div>` : o.access ? `<div class="muted">♿ Step-free at every station on this trip, as of now.</div>` : "")
    + (o.alerts?.length ? `<details class="alerts"><summary>⚠ ${o.alerts.length} MTA alert${o.alerts.length > 1 ? "s" : ""} on these lines</summary>${o.alerts.map((a) => `<p>${a.routes.split(",").map(bullet).join("")} <b>${esc(a.type)}</b>: ${esc(a.text)}</p>`).join("")}</details>` : "")
    + `<ol class="steps">${o.legs.map(stepAndStop).join("")}</ol>${o.later.length ? `<div class="muted">Same trip later: ${o.later.map(hm).join(", ")}</div>` : ""}`
    + `<div class="muted">Routes and times: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> on MTA schedules (live where the MTA reports it). Walks marked ~ are estimated.</div>`;
  $("tripOut").querySelectorAll("button[data-o]").forEach((b) => (b.onclick = () => showCommute(d, +b.dataset.o)));
}

// Restaurant inspections: search by name, results on the map, click for the history.
const GRADE_COLOR = { A: "#4dabf7", B: "#69db7c", C: "#ffa94d" };
$("rsearch").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("rq").value.trim();
  if (q.length < 2) return;
  $("rresults").textContent = "Searching…";
  restaurantLayer.clearLayers();
  try {
    // nearest first: from you when the map knows where you are, else from the middle of the map
    const from = meAt ? { lat: meAt.lat, lon: meAt.lng, who: "you" } : { lat: viewCenter().lat, lon: viewCenter().lng, who: "the map's center" };
    const list = await getJSON(`/api/nyc/restaurants?q=${encodeURIComponent(q)}&near=${from.lat.toFixed(5)},${from.lon.toFixed(5)}`);
    const dist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
    seen.restaurants = list.slice(0, 15).map((r) => `${r.name}, ${r.address}, ${dist(r.km)} from ${from.who}`);
    $("rresults").innerHTML = list.length ? `${list.length >= 40 ? "The 40 nearest" : `${list.length} found`}, nearest to ${from.who} first` + list.slice(0, 12).map((r, i) => `<button data-i="${i}">${esc(r.name)} · <span class="muted">${esc(r.address)} · ${dist(r.km)}</span></button>`).join("") : "Nothing found.";
    const markers = list.filter((r) => r.lat).map((r) => pin(r.lat, r.lon, "🍽", "#ff5c8a").bindPopup("Loading…", { maxWidth: 340 }).on("popupopen", (ev) => showInspections(ev.popup, r)).addTo(restaurantLayer));
    if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 15 });
    $("rresults").querySelectorAll("button").forEach((b) => (b.onclick = () => { const r = list[+b.dataset.i]; map.setView([r.lat, r.lon], 16); markers.find((m) => m.getLatLng().lat === r.lat)?.openPopup(); }));
  } catch (err) { $("rresults").textContent = `Search failed: ${err.message}`; }
});
async function showInspections(popup, r) {
  const d = await getJSON(`/api/nyc/restaurant?camis=${r.camis}`).catch(() => null);
  if (!d) return popup.setContent("Couldn't load inspections.");
  const v = d.visits[0], g = d.visits.find((x) => x.grade)?.grade;
  popup.setContent(`<b>${esc(d.name)}</b> <span class="muted">${esc(d.cuisine ?? "")}</span><br><span class="muted">${esc(d.address)}</span><br>
    ${g ? `<span class="grade" style="color:${GRADE_COLOR[g] ?? "inherit"}">${esc(g)}</span>` : ""}${v ? `Last inspection ${esc(v.date)}${v.score != null ? `, score ${v.score} (lower is better)` : ""}` : "Not inspected yet"}
    ${(v?.violations ?? []).slice(0, 5).map((x) => `<p class="viol">${x.critical ? "⚠️" : "•"} ${esc(x.text)}</p>`).join("")}
    <p class="viol muted">Earlier: ${d.visits.slice(1, 5).map((x) => `${x.date} ${x.grade ?? ""} ${x.score ?? ""}`).join(" · ") || "none"}</p>`);
}

// A click, double-click or long-press (right-click too) on the map: the address and the businesses there (shops, licensed
// businesses, restaurants with grades, Google's details). A drag isn't a click, and the click that closes a popup only closes it.
let popupWasOpen = false; // the click that closes a popup only closes it
map.on("preclick", () => (popupWasOpen = !!map._popup?.isOpen()));
map.on("click", async (e) => {
  if (!picking) { if (popupWasOpen) return; if (map.getZoom() < 14) return centerInView(e.latlng, Math.min(16, map.getZoom() + 3)); showHere(e.latlng); return; }
  {
    const id = picking;
    setPicking(null);
    await placePin(id, e.latlng);
    if ($("tFrom").value && $("tTo").value) $("trip").requestSubmit();
    else if (id === "tFrom") setPicking("tTo"); // next: the destination
    return;
  }
});
map.on("dblclick contextmenu", (e) => { if (!picking) showHere(e.latlng); });
/** What's at a point: the address, the businesses there and a street photo of it (a click on the map, or a search,
 *  which also gives the place's name as `title` and moves the map there). */
let hereAt = null; // the spot the "what's here" popup is about, for its directions buttons
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-dir]");
  if (!b) return;
  const [la, lo] = (b.dataset.ll ?? "").split(",").map(Number), here = hereAt && Math.abs(hereAt.ll.lat - la) < 1e-5 && Math.abs(hereAt.ll.lng - lo) < 1e-5;
  if (!Number.isFinite(la)) return;
  const label = here ? hereAt.label : b.closest(".leaflet-popup-content, #detail")?.querySelector("b")?.textContent.trim();
  const id = b.dataset.dir, other = id === "tFrom" ? "tTo" : "tFrom";
  map.closePopup();
  await placePin(id, L.latLng(la, lo), label || undefined);
  if ($(other).value) return $("trip").requestSubmit();
  // the other end is where you are, when the browser knows it (and you're around the city); otherwise pick it on the map
  const me = await myLocation();
  if (me && NYC.pad(0.3).contains(me) && !$(other).value) { await placePin(other, me, "My location"); $("trip").requestSubmit(); }
  else if (!$(other).value) setPicking(other);
});
/** Where you are: the position the map already has, or one asked for now (10 s at most; null if refused or unknown). */
function myLocation() {
  if (meAt) return Promise.resolve(meAt);
  return new Promise((ok) => {
    const done = (v) => { map.off("locationfound", found); map.off("locationerror", fail); clearTimeout(t); ok(v); };
    const found = (e) => done(e.latlng), fail = () => done(null), t = setTimeout(() => done(null), 10_000);
    map.on("locationfound", found); map.on("locationerror", fail);
    locateMe(false, true); // quiet: no jump to you, no error popup
  });
}
async function showHere(ll, title = "") {
  if (title) map.setView(ll, Math.max(map.getZoom(), 17));
  const head = title ? `<b>📍 ${esc(title)}</b><br>` : "";
  const dir = dirBtns(ll.lat, ll.lng);
  const at = (hereAt = { ll, label: title });
  // The content is an element, not HTML text: popup.update() re-renders text content from scratch, which wiped the
  // street photo the moment it was put in; an element keeps what's added to it later (and its click handlers).
  const body = document.createElement("div"), show = (html) => { body.innerHTML = html; p.setContent(body); };
  const p = L.popup({ maxWidth: 340 }).setLatLng(ll).openOn(map);
  show(`${head}Looking up…`);
  const ph = photoAt(ll.lat, ll.lng); // alongside the address
  const d = await getJSON(`/api/nyc/point?lat=${ll.lat.toFixed(6)}&lon=${ll.lng.toFixed(6)}`).catch(() => null);
  const photoBox = `<div class="here-photo muted">${photoHtml(ph.v)}</div>`; // the first look in an area can take several seconds
  if (!d?.found) show(`${head}No NYC address found here.${dir}${photoBox}`);
  else {
  seen.here = { address: d.address, neighborhood: d.neighborhood, businesses: d.businesses.slice(0, 20).map((b) => `${b.name} (${b.kind})${b.rating ? ` ★${b.rating} from ${b.reviews} Google reviews` : ""}${b.open != null ? `, ${b.open ? "open now" : "closed now"}${b.hoursToday ? ` (today ${b.hoursToday})` : ""}` : ""}${b.website ? `, website ${b.website}` : ""}${b.phone ? `, ${b.phone}` : ""}`) };
  const list = d.businesses.slice(0, 25);
  at.label ||= d.address;
  show(`${head}<b>${esc(d.address)}</b><br><span class="muted">${esc([d.neighborhood, d.zip].filter(Boolean).join(" · "))}</span>${dir}${d.outsideNyc ? "" : `<div class="bldg"><button type="button" class="linkish" data-bldg>🏠 Building report</button> · <button type="button" class="linkish" data-zwatch>⭐ Watch this spot</button></div>`}${photoBox}
    ${list.length ? `<ul class="biz">${list.map((b, i) => `<li>${b.camis ? `<a href="#" data-i="${i}">${esc(b.name)}</a>` : esc(b.name)}${b.grade ? ` <span class="grade" style="color:${GRADE_COLOR[b.grade] ?? "inherit"}">${esc(b.grade)}</span>` : ""}${b.rating ? ` <a href="${esc(b.ratingUrl)}" target="_blank" rel="noopener" title="${b.reviews} Google reviews" style="color:#fab005;white-space:nowrap">★ ${b.rating.toFixed(1)}</a><span class="muted"> (${b.reviews.toLocaleString()})</span>` : ""}${b.open != null ? ` <span style="color:${b.open ? "#2f9e44" : "#e03131"}" title="${esc(b.hoursToday ? `Today: ${b.hoursToday}` : "")}">${b.open ? "open" : "closed"}</span>` : ""}${/^https?:\/\//.test(b.website ?? "") ? ` <a href="${esc(b.website)}" target="_blank" rel="noopener" title="${esc(b.name)}'s website">website</a>` : ""}${b.phone ? ` <a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}" class="muted">${esc(b.phone)}</a>` : ""}${b.ratingUrl ? "" : ` <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address || d.address}`)}" target="_blank" rel="noopener" class="muted" title="Find it on Google Maps">maps</a>`} <span class="muted">${esc(b.kind ?? "")}${b.address ? ` · ${esc(b.address)}` : ""}</span></li>`).join("")}</ul>
      <span class="muted">Shops: OpenStreetMap · licenses &amp; grades: NYC Open Data${list.some((b) => b.ratingUrl) ? " · ★ ratings, hours, websites: Google Maps" : ""}</span>` : `<p class="muted">No businesses listed here.</p>`}`);
  body.querySelectorAll("a[data-i]").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); showInspections(p, list[+a.dataset.i]); }));
  // the button is replaced right away: stop the click here, or Leaflet sees it land outside any popup (a map click) and closes this one
  if (body.querySelector("[data-zwatch]")) body.querySelector("[data-zwatch]").onclick = (ev) => { ev.stopPropagation(); addZone(title || d.address, [[ll.lat, ll.lng]], 500); ev.target.replaceWith("⭐ watching"); };
  if (body.querySelector("[data-bldg]")) body.querySelector("[data-bldg]").onclick = async (ev) => { ev.stopPropagation(); const box = ev.target.parentElement; box.innerHTML = `<span class="muted">Reading city records…</span>`; p.update();
    const r = await getJSON(`/api/nyc/building?q=${encodeURIComponent(d.address)}`).catch(() => null); box.innerHTML = buildingHtml(r); p.update(); seen.building = r?.found ? r : undefined; };
  }
  // the best street photo of this spot (Mapillary, within ~100 m, or ~300 m if none, looking at it); a click opens it
  await ph.p;
  const box = body.querySelector(".here-photo");
  if (box) { box.innerHTML = photoHtml(ph.v); p.update(); }
}

// What Blip can do on this page when you ask it to.
window.blipActions = {
  show_near: { label: "showed what's within 600 m", description: "Show subway stations (with their alerts), bus stops, Citi Bike docks, cameras and public restrooms within 600 m of the visitor's location, or of a point.", parameters: { lat: { type: "number", description: "optional" }, lon: { type: "number", description: "optional" } },
    run: async ({ lat, lon }) => { const at = Number(lat) && Number(lon) ? { lat: +lat, lon: +lon } : meAt ? { lat: meAt.lat, lon: meAt.lng } : null; if (!at) return; return nearMe(at, lat ? "that spot" : "you"); } },
  show_point: { label: "marked it on the map", description: "Mark a point on the map with a label and center there, e.g. a Citi Bike station or subway station you found. Use the lat/lon from a tool result.", parameters: { lat: { type: "number", description: "Latitude" }, lon: { type: "number", description: "Longitude" }, label: { type: "string", description: "What it is, shown in a popup" } },
    run: ({ lat, lon, label }) => { const ll = [Number(lat), Number(lon)]; if (!NYC.pad(0.2).contains(ll)) return; map.setView(ll, Math.max(map.getZoom(), 16)); L.popup().setLatLng(ll).setContent(esc(String(label ?? "").replace(/&amp;/g, "&"))).openOn(map); const p = map.latLngToContainerPoint(ll), r = $("map").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; } },
  show_place: { label: "moved the map", description: "Center the map on an NYC address, intersection or landmark.", parameters: { place: { type: "string", description: "Address or place" }, zoom: { type: "number", description: "11 (borough) to 18 (street), default 16" } },
    run: async ({ place, zoom }) => { const g = await getJSON(`/api/nyc/geocode?q=${encodeURIComponent(place)}`); if (g) { map.setView([g.lat, g.lon], Math.min(18, Math.max(11, Number(zoom) || 16))); L.popup().setLatLng([g.lat, g.lon]).setContent(esc(g.label)).openOn(map); const p = map.latLngToContainerPoint([g.lat, g.lon]), r = $("map").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; } } },
  open_cameras: { label: "opened cameras", description: "Open up to 4 live traffic camera windows whose name matches, e.g. 'Canal St', 'FDR', 'Atlantic Ave'.", parameters: { query: { type: "string", description: "Street or road words" } },
    run: async ({ query }) => { const q = String(query ?? "").toLowerCase(); const hits = (await getJSON("/api/nyc/cameras")).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4); hits.forEach(openCam); if (hits[0]) map.setView([hits[0].lat, hits[0].lon], 14); return document.querySelector(".cam:last-child"); } },
  set_route_point: { label: "set a point of the trip", description: "Set the trip planner's start, destination or a stop, one at a time, without planning yet: a place name or address, a lat/lon, or 'my location' (where the visitor is). Then plan_route plans it. Use this when the visitor gives the trip piece by piece ('start at Union Square', 'now the destination is JFK', 'add a stop at Trader Joe's').",
    parameters: { which: { type: "string", description: "from, to, or stop", enum: ["from", "to", "stop"] }, place: { type: "string", description: "Place name or address, or 'my location'" }, lat: { type: "number", description: "Optional, with lon, instead of a place" }, lon: { type: "number" } },
    run: async ({ which, place, lat, lon }) => {
      const id = which === "from" ? "tFrom" : which === "to" ? "tTo" : (addStop("", false), stopIds().at(-1));
      if (!id) return;
      if (Number(lat) && Number(lon)) { if (!NYC.pad(0.2).contains([+lat, +lon])) return; await placePin(id, L.latLng(+lat, +lon)); }
      else if (/^(my (current )?location|me|here|where i am|current location)$/i.test(String(place ?? "").trim())) { if (!meAt) return; await placePin(id, meAt, "My location"); }
      else { const g = await getJSON(`/api/nyc/geocode?q=${encodeURIComponent(String(place ?? ""))}`).catch(() => null); if (!g) return; await placePin(id, L.latLng(g.lat, g.lon), g.label); }
      $("tripOut").textContent = $("tFrom").value && $("tTo").value ? "Start and destination set: say 'plan it' or press Plan." : which === "from" ? "Start set. Where to?" : "Destination set. Where from?";
      map.setView(pinMarkers[id].getLatLng(), Math.max(map.getZoom(), 14));
      return pinMarkers[id] ? (() => { const p = map.latLngToContainerPoint(pinMarkers[id].getLatLng()), r = $("map").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; })() : undefined;
    } },
  pick_on_map: { label: "asked for a click on the map", description: "Let the visitor click the map to set the trip's start, destination or a new stop (when they'd rather point than name a place).", parameters: { which: { type: "string", enum: ["from", "to", "stop"] } },
    run: ({ which }) => { const id = which === "from" ? "tFrom" : which === "to" ? "tTo" : (addStop("", false), stopIds().at(-1)); if (id) setPicking(id); } },
  set_travel_mode: { label: "changed how to travel", description: "Change how the trip is made: drive, bike, walk or transit (subway + bus + walking); optionally avoid ferries or ask for step-free transit. Re-plans if a trip is already planned.",
    parameters: { mode: { type: "string", enum: ["drive", "bike", "walk", "transit"] }, avoid_ferries: { type: "boolean" }, accessible: { type: "boolean" } },
    run: ({ mode, avoid_ferries, accessible }) => { const r = document.querySelector(`input[name="tMode"][value="${mode}"]`); if (r) r.checked = true; if (avoid_ferries != null) $("tNoFerry").checked = !!avoid_ferries; if (accessible != null) $("tAccess").checked = !!accessible; replan(); } },
  plan_route: { label: "planned the route", description: "Plan the trip with the start, destination and stops already set (by the visitor or by set_route_point). The result (time, distance, cameras on the way, or the transit options) then shows in 'trip' on the next turn.", parameters: {},
    run: () => { if (!$("tFrom").value || !$("tTo").value) { $("tripOut").textContent = "Set a start and a destination first."; return; } $("trip").requestSubmit(); return $("tripOut"); } },
  clear_route: { label: "cleared the trip", description: "Clear the trip planner: start, destination, stops and the drawn route.", parameters: {}, run: () => $("tClear").click() },
  plan_trip: { label: "planned the trip", description: "Plan a trip on the map: drive, bike or walk (with the traffic cameras on the route), or transit (subway + bus + walking options with times).", parameters: { from: { type: "string", description: "Start, or 'my location' for where the visitor is" }, to: { type: "string", description: "Destination" }, mode: { type: "string", description: "drive, bike, walk or transit" }, avoid_ferries: { type: "boolean", description: "Avoid ferries" }, stops: { type: "string", description: "Optional stops on the way, in order, separated by |" }, accessible: { type: "boolean", description: "Transit: step-free routes only (wheelchair, stroller)" } },
    run: ({ from, to, mode, avoid_ferries, stops, accessible }) => { $("tClear").click(); String(stops ?? "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 6).forEach((x) => addStop(x, false)); const mine = /^(my (current )?location|me|here|where i am|current location)$/i.test(String(from ?? "").trim()) && meAt; $("tFrom").value = mine ? "" : from ?? ""; $("tTo").value = to ?? ""; if (mine) placePin("tFrom", meAt, "My location"); const r = document.querySelector(`input[name="tMode"][value="${mode}"]`); if (r) r.checked = true; $("tNoFerry").checked = !!avoid_ferries; $("tAccess").checked = !!accessible; $("trip").requestSubmit(); } },
  follow_aircraft: { label: "found the aircraft", description: "Show a live aircraft or helicopter on the map with where it's been in the last 24 h. Query: callsign, registration or hex from aircraftInView; or 'helicopter' for the nearest helicopter.", parameters: { query: { type: "string", description: "Callsign, registration, hex, or 'helicopter'" } },
    run: async ({ query }) => {
      await toggle("aircraft", true);
      const q = String(query ?? "").toLowerCase().trim(), all = [...acMarkers.values()];
      const m = q.startsWith("heli") ? all.find((x) => x.ac.heli) : all.find((x) => [x.ac.flight, x.ac.reg, x.ac.hex].some((v) => String(v).toLowerCase() === q));
      if (!m) return;
      map.setView(m.getLatLng(), 12); m.openPopup(); showTrail(m.ac.hex);
      const p = map.latLngToContainerPoint(m.getLatLng()), r = $("map").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y };
    } },
  street_photo: { label: "opened a street photo", description: "Open the nearest street-level photo (Mapillary) to a point, to see what a place looks like from the sidewalk.", parameters: { lat: { type: "number", description: "Latitude" }, lon: { type: "number", description: "Longitude" } },
    run: async ({ lat, lon }) => { const ph = await getJSON(`/api/nyc/photo-near?lat=${Number(lat)}&lon=${Number(lon)}`).catch(() => null); if (ph) { photoById.set(ph.id, ph); openPhoto(ph); map.setView([ph.lat, ph.lon], Math.max(map.getZoom(), 17)); } } },
  nearest_camera: { label: "opened the nearest camera", description: "Open the live traffic camera nearest a point (lat/lon), e.g. where a helicopter is circling or a 311 report.", parameters: { lat: { type: "number", description: "Latitude" }, lon: { type: "number", description: "Longitude" } },
    run: async ({ lat, lon }) => { const c = await nearestCam(Number(lat), Number(lon)); if (c) openCam(c); } },
  show_line: { label: "showed the line", description: "Show one subway line or a few on the map: only their live trains (estimated positions) and their stations, the map fitted to the line. lines: route letters or numbers, e.g. \"C\", \"A C E\", \"7\", \"L\", \"S\" (shuttles), \"SIR\". Empty shows every line again. Use this for \"show the C trains\", \"where are the L trains\", \"show the 7 line\".",
    parameters: { lines: { type: "string", description: "e.g. C, or A C E; empty for every line" } }, run: ({ lines }) => showLine(lines) },
  show_layer: { label: "switched a layer", description: "Turn map layers on or off. For one subway line use show_line instead. Layers: stations (next trains), trains (every train's position now, estimated), buses (bus stops with next buses, needs zoom ≥ 15), citibike, ferry (boats + next departures), outages (elevators), cameras, speeds (traffic), c311 (311 reports in view), incidents (live incidents, merged across sources), closures (road closures, construction, permitted street events), news (today's local news, placed), emergency (Notify NYC alerts), floods (street flooding now), films (film/TV shoots), photos (street-level photos, zoom ≥ 16), city (free city events), popups (free pop-ups), sales (sample sales), radar (rain radar), lightning, clouds (satellite), aircraft (planes and helicopters, live), storms (hurricanes), iss (the space station), windy (windy.com forecast map: wind, rain, temperature…, drawn under the other layers instead of the street map).", parameters: { layer: { type: "string", description: "Layer key, or several separated by spaces (\"incidents news\")" }, on: { type: "boolean", description: "true to show (default), false to hide" } },
    run: async ({ layer, on = true }) => { for (const k of String(layer ?? "").split(/[\s,+]+/).filter((k) => LAYERS[k])) await toggle(k, on !== false && on !== "false"); } },
  layer_preset: { label: "switched to a preset", description: "One click for a set of layers (every other layer goes off): safety (crime, fires, alerts, incidents, flooding), commute (live trains, stations with alerts, broken elevators, closures, traffic speeds, Citi Bike), weather (radar, lightning, flooding, weather alerts), tonight (free events, pop-ups, sample sales).", parameters: { preset: { type: "string", enum: ["safety", "commute", "weather", "tonight"], description: "Which preset" } },
    run: ({ preset }) => applyPreset(String(preset)) },
  mark_places: { label: "marked places on the map", description: "Put labeled pins on the map for several places at once (e.g. the incidents, news stories or 311 hot spots you found with explore_city_data), and fit the map to them. The visitor can clear them with ✕ Clear. Not needed for places you link with a mapLink in your answer: those are pinned already.", parameters: { points: { type: "array", description: "[{lat, lon, label, note}] up to 50; label short (≤ 40 characters)" } },
    run: ({ points, places }) => markPlaces(points ?? places) },
  analyze_area: { label: "analyzed the area", description: "Open the 🔎 This area panel for the map's current view (or after moving the map to lat/lon at a zoom): what's on now, what started in the last 24 hours, 311's week against usual, today's news there, cameras.", parameters: { lat: { type: "number", description: "Optional: center here first" }, lon: { type: "number", description: "Longitude" }, zoom: { type: "number", description: "Zoom (default 15)" } },
    run: async ({ lat, lon, zoom }) => { if (Number.isFinite(+lat) && Number.isFinite(+lon) && +lat) map.setView([+lat, +lon], +zoom || 15); await analyzeArea(); return seen.area; } },
  find_restaurant: { label: "searched restaurants", description: "Search NYC restaurant health inspections by name and show them on the map.", parameters: { name: { type: "string", description: "Restaurant name" } },
    run: ({ name }) => { $("rq").value = name ?? ""; $("rsearch").requestSubmit(); } },
  inspect_camera: { label: "inspected camera with AI vision", description: "Analyze the live image from an open or specified traffic camera using local Qwen computer vision.", parameters: { id: { type: "string", description: "Camera ID" }, prompt: { type: "string", description: "Optional question" } },
    run: async ({ id, prompt }) => {
      const targetId = id || (seen.openCams[0] && (await getJSON("/api/nyc/cameras")).find((c) => c.name === seen.openCams[0])?.id);
      if (!targetId) return "No camera specified or open.";
      const d = await getJSON(`/api/nyc/camera-inspect?id=${encodeURIComponent(targetId)}${prompt ? `&q=${encodeURIComponent(prompt)}` : ""}`);
      return d.text;
    } },
};

// What Blip sees on this page when you ask it something.
window.blipContext = () => {
  const b = map.getBounds();
  const visible = [...byStation].flatMap(([id, list]) => { const s = stations.get(id); return s && b.contains([s.lat, s.lon]) ? [{ stationId: id, station: s.name, lines: s.routes, alerts: [...new Set(list.filter((a) => !hidden.has(a.type)).map((a) => `${a.type}: ${a.header}`))].slice(0, 3) }] : []; }).filter((x) => x.alerts.length).slice(0, 25);
  const c = viewCenter(), vb = viewBounds();
  return { mapView: { lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), zoom: map.getZoom(), insideNyc: viewInNyc(), bounds: { s: +vb.getSouth().toFixed(4), w: +vb.getWest().toFixed(4), n: +vb.getNorth().toFixed(4), e: +vb.getEast().toFixed(4) }, note: "The area the visitor is looking at: questions that name no place are about it." }, map: "NYC Live Map. You can act on it for the visitor: set the trip's start/destination/stops one at a time (set_route_point), let them click a point (pick_on_map), change the mode, plan (plan_route) or plan in one go (plan_trip), clear; move the map (show_place), mark points, open cameras, switch layers, show what's within 600 m, follow aircraft. Press B opens this chat.", center: viewCenter(), zoom: map.getZoom(),
    tripForm: { from: $("tFrom").value || null, to: $("tTo").value || null, stops: stopIds().map((id) => $(id).value).filter(Boolean), mode: document.querySelector('input[name="tMode"]:checked')?.value, avoidFerries: $("tNoFerry").checked, stepFree: $("tAccess").checked, picking: picking || null },
    // ~11 m precision is plenty for "nearest bike"; it goes to the chat model with the question
    myPlaces: seen.zones ?? "none saved (the visitor can press ⭐ Watch this spot on a map click, or ⭐ Watch this route on a planned trip)",
    visitorLocation: meAt ? { lat: +meAt.lat.toFixed(4), lon: +meAt.lng.toFixed(4), accuracyMeters: Math.round(meAccuracy) } : "unknown (not shared: ask the visitor to press ◎ on the map)",
    linkFormat: "Link map things in answers with markdown so the visitor can click them: [Station name](#station=<stationId>), [label](#at=<lat>,<lon>), [address](#place=<address>), [camera name](#cam=<cameraId>), [a route](#trip=transit|Grand Central|Barclays Center) (mode first: drive, bike, walk or transit; stops between, all separated by |).", alertsInView: visible, lineWideAlerts: unplaced.slice(0, 8).map((a) => `${a.type}: ${a.header}`), hiddenAlertTypes: [...hidden],
    layersOn: Object.entries(LAYERS).filter(([, l]) => l.on).map(([k]) => k), outages: seen.outages.slice(0, 30), cameras: seen.cameras, openCameras: seen.openCams,
    freeCityEventsToday: seen.city.slice(0, 15), freePopupsToday: seen.popups.slice(0, 15), restaurantSearch: seen.restaurants, lastClickedPlace: seen.here, lastBuildingReport: seen.building && { address: seen.building.address, building: seen.building.building, hpdOpenViolations: seen.building.hpdOpenViolations, tenantComplaintsLastYear: seen.building.tenantComplaintsLastYear, rats: seen.building.rats, whoOwnsWhat: seen.building.whoOwnsWhat }, lastArrivalBoard: seen.arrivals, lastBusStop: seen.busArrivals, following: seen.following, trip: seen.trip, citiBike: seen.citibike, trafficSpeeds: seen.speeds, sampleSalesToday: seen.sales, reports311: seen.c311, ferryNextBoats: seen.ferry,
    openIncident: seen.incidentOpen, openDrawer: seen.drawer, replayMoment: seen.replay, nowFeed: seen.now, areaSafetyRecord: seen.areaSafety, newsToday: seen.news, areaAnalysis: seen.area, blipMarksOnMap: aiMarks.getLayers().length, notifyNYCToday: seen.emergency.slice(0, 10), filmShoots: seen.films.slice(0, 10), streetFlooding: seen.floods, incidentsLayer: seen.incidents, securityToday: seen.security,
    cityNow: pulseNow && { ...pulseNow, brief: pulseNow.brief?.bullets?.map((b) => b.text), unusualList: pulseNow.unusualList?.slice(0, 5).map((u) => u.text) },
    weatherNow: seen.weather && { ...seen.weather, forecast: seen.weather.forecast.slice(0, 2) }, aircraftInView: seen.aircraft, shipsInHarbor: seen.ships, within600m: seen.near, restrooms: seen.restrooms, aircraftTrail: seen.trail, streetPhotoOpen: seen.photo, iss: seen.iss, tropicalStorms: seen.storms, 
    windy: LAYERS.windy?.on ? `windy.com forecast map under the markers, showing ${$("windyOverlay")?.value}` : undefined };
};

// Popups pan into the part of the map nothing floats over (freeArea: under the city bar, beside the panel or above the
// phone's sheet, clear of the drawer), so their × is always reachable: when they open, when their photo comes in
// (update() re-pans), and after a zoom or a window resize, if the place is still in view (zoomed away from it, it's left).
function popupInView(pop = map._popup) {
  if (!pop?.isOpen() || pop.options.autoPan === false) return;
  const f = freeArea(), size = map.getSize();
  Object.assign(pop.options, { autoPanPaddingTopLeft: L.point(f.left, f.top), autoPanPaddingBottomRight: L.point(Math.max(10, size.x - f.right), Math.max(10, size.y - f.bottom)) });
  pop._adjustPan?.(); // Leaflet's own pan-into-view, with the padding above
}
map.on("popupopen", (e) => { popupInView(e.popup); setTimeout(() => popupInView(e.popup), 300); }); // and again after any setView animation
map.on("zoomend", () => { const pop = map._popup; if (pop?.isOpen() && map.getBounds().contains(pop.getLatLng())) popupInView(pop); });
// Camera and photo windows: the title bar (with its ×) stays on screen and below the site bar, and a window is never
// taller than the room under it; checked when one opens or is resized, and when the browser window changes size.
function camsInView() {
  const top = (document.querySelector(".ihor-hud")?.getBoundingClientRect().bottom ?? 0) + 4;
  for (const w of document.querySelectorAll(".cam:not(.max)")) {
    if (document.fullscreenElement === w) continue;
    const h = Math.min(w.offsetHeight, innerHeight - top - 8);
    if (h < w.offsetHeight) w.style.height = `${Math.max(140, h)}px`;
    w.style.top = `${Math.max(top, Math.min(innerHeight - 40, w.offsetTop))}px`;
    w.style.left = `${Math.max(60 - w.offsetWidth, Math.min(innerWidth - 60, w.offsetLeft))}px`;
  }
}
addEventListener("resize", () => { camsInView(); popupInView(); });
visualViewport?.addEventListener("resize", camsInView);
// The panel folds away (and starts folded on phones, where it would cover the map).
// The side panel can be dragged by its title bar (on a screen wide enough that it isn't the bottom sheet).
{
  const head = document.querySelector("#panel .phead"), panel = $("panel");
  head.style.cursor = "move"; head.title = "Drag to move the panel";
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a, input") || e.button || matchMedia("(max-width: 700px)").matches) return;
    const r = panel.getBoundingClientRect(), box = $("map").getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const move = (m) => { const x = Math.max(box.left, Math.min(box.right - 80, m.clientX - sx)), y = Math.max(box.top, Math.min(box.bottom - 60, m.clientY - sy)); Object.assign(panel.style, { left: `${x - box.left}px`, top: `${y - box.top}px` }); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    e.preventDefault();
  });
}
// Three tabs, like a maps app's panel; the last one opened is remembered in this browser.
const showTab = (t) => {
  document.querySelectorAll("#panel [data-tab]").forEach((el) => (el.tagName === "BUTTON" ? el.setAttribute("aria-selected", String(el.dataset.tab === t)) : (el.hidden = el.dataset.tab !== t)));
  try { localStorage.setItem("nyc-tab", t); } catch {}
  if (t === "now") renderNow().catch(() => {});
};
document.querySelector(".ptabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
try { showTab(localStorage.getItem("nyc-tab") || "now"); } catch { showTab("now"); }
const fold = (folded) => { $("panel").classList.toggle("folded", folded); $("fold").textContent = folded ? "▸" : "▾"; $("fold").setAttribute("aria-expanded", String(!folded)); };
// On phones the panel is a sheet at the bottom: Blip (companion.js) stands on top of it instead of on its buttons.
// (and above the incident drawer, and the replay's time bar, which sits on the sheet)
const sheetTop = () => document.documentElement.style.setProperty("--sheet-h", `${$("panel").offsetHeight}px`);
new ResizeObserver(sheetTop).observe($("panel"));
const blipFloor = () => document.documentElement.style.setProperty("--blip-floor", matchMedia("(max-width: 700px)").matches ? `${Math.max($("panel").offsetHeight, $("detail").hidden ? 0 : $("detail").offsetHeight) + ($("replay").hidden ? 0 : $("replay").offsetHeight + 6) + 8}px` : "0px");
new ResizeObserver(blipFloor).observe($("panel")); new ResizeObserver(blipFloor).observe($("detail")); new ResizeObserver(blipFloor).observe($("replay")); addEventListener("resize", blipFloor);
$("fold").addEventListener("click", () => fold(!$("panel").classList.contains("folded")));
if (matchMedia("(max-width: 700px)").matches) fold(true);
cityView();
// On phones the panel is a sheet with three heights: peek (the search row), half and nearly full. Tap the grab bar to
// step up, or drag it up or down.
const SHEETS = ["peek", "half", "full"];
function sheet(state) { fold(state === "peek"); $("panel").classList.toggle("sheet-full", state === "full"); }
const sheetNow = () => ($("panel").classList.contains("folded") ? "peek" : $("panel").classList.contains("sheet-full") ? "full" : "half");
$("grab").addEventListener("click", () => sheet(SHEETS[(SHEETS.indexOf(sheetNow()) + 1) % 3]));
$("grab").addEventListener("pointerdown", (e) => {
  const y0 = e.clientY;
  const up = (u) => { removeEventListener("pointerup", up); const dy = u.clientY - y0, i = SHEETS.indexOf(sheetNow()); if (Math.abs(dy) > 40) { u.preventDefault(); sheet(SHEETS[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]); $("grab").dataset.dragged = "1"; } };
  addEventListener("pointerup", up);
});
$("grab").addEventListener("click", (e) => { if ($("grab").dataset.dragged) { delete $("grab").dataset.dragged; e.stopImmediatePropagation(); } }, true); // a drag isn't a tap

$("refresh").addEventListener("click", refresh);
await loadStations().catch((e) => ($("status").textContent = `Stations failed: ${e.message}`));
for (const [k, l] of Object.entries(LAYERS)) if (l.on) toggle(k, true);

// Links into the map (Blip uses these in answers): #station=<GTFS id>, #at=lat,lon[,zoom][|name], #place=<address>,
// #cam=<camera id>, #trip=[mode|]from|[stop|…]to, #aircraft=<hex>, #ship=<MMSI>, #line=C (or A+C+E), and shared views #view=lat,lon,zoom,layer+layer (the 🔗 button).
async function focusHash() {
  const h = decodeURIComponent(location.hash.slice(1)), eq = h.indexOf("="), key = h.slice(0, eq), val = eq < 0 ? "" : h.slice(eq + 1);
  if (key === "line") return void showLine(val);
  if (key === "station" && stations.get(val)) {
    if (!onLine(stations.get(val).routes)) await showLine(""); // its marker isn't drawn while another line is picked
    const cb = document.querySelector('#layers input[data-l="stations"]');
    if (!LAYERS.stations.on) { cb.checked = true; await toggle("stations", true); }
    for (let i = 0; i < 100 && !stationMarkers.get(val); i++) await new Promise((r) => setTimeout(r, 100));
    if (!stationMarkers.get(val)) return;
    const s = stations.get(val);
    map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
    stationMarkers.get(val).openPopup();
  } else if (key === "at") {
    const [pt, name = ""] = val.split("|"), [lat, lon, z] = pt.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) { map.setView([lat, lon], z || 17); showHere(L.latLng(lat, lon), name); }
  } else if (key === "place" && val) {
    const g = await getJSON(`/api/nyc/geocode?q=${encodeURIComponent(val)}`).catch(() => null);
    if (g) showHere(L.latLng(g.lat, g.lon), g.label);
  } else if (key === "view") {
    // a shared view: #view=lat,lon,zoom,layer+layer (only known layers; the rest of the page as it was)
    const [lat, lon, z, ls = ""] = val.split(",");
    if (Number.isFinite(+lat) && Number.isFinite(+lon)) map.setView([+lat, +lon], Math.min(19, Math.max(3, +z || 13))); // 3: hurricanes and the ISS
    const want = new Set(ls.split("+").filter((k) => LAYERS[k]));
    if (want.size) for (const [k, l] of Object.entries(LAYERS)) if (l.on !== want.has(k)) { const cb = document.querySelector(`#layers input[data-l="${k}"]`); if (cb) cb.checked = want.has(k); await toggle(k, want.has(k)); }
  } else if (key === "aircraft") {
    blipActions.follow_aircraft.run({ query: val });
  } else if (key === "ship") {
    await toggle("ships", true);
    for (let i = 0; i < 50 && !shipMarkers.get(val); i++) await new Promise((r) => setTimeout(r, 200)); // the AIS feed may still be warming up
    const m = shipMarkers.get(val) ?? shipMarkers.get(Number(val));
    if (m) { map.setView(m.getLatLng(), 14); m.openPopup(); }
  } else if (key === "trip") {
    const parts = val.split("|").map((x) => x.trim()).filter(Boolean), mode = ["drive", "bike", "walk", "transit"].includes(parts[0]) ? parts.shift() : "drive";
    if (parts.length >= 2) { fold(false); blipActions.plan_trip.run({ from: parts[0], to: parts.at(-1), stops: parts.slice(1, -1).join("|"), mode }); }
  } else if (key === "cam") {
    const c = (await getJSON("/api/nyc/cameras")).find((x) => x.id === val);
    if (c) { map.setView([c.lat, c.lon], 16); openCam(c); }
  }
}
addEventListener("hashchange", focusHash);
// "/" jumps to the search box (as on many map and search sites), unless you're typing somewhere
addEventListener("keydown", (e) => { if (e.key === "/" && !e.target.closest?.("input, textarea, select, [contenteditable]")) { e.preventDefault(); if ($("panel").classList.contains("folded")) fold(false); $("q").focus(); } });
// A map link clicked again (in Blip's chat, say) doesn't change the hash, so no hashchange: do it anyway.
document.addEventListener("click", (e) => {
  const a = e.composedPath().find((el) => el.tagName === "A" && el.href);
  if (a && a.href === location.href && location.hash) focusHash();
});
$("share").onclick = async () => {
  const c = map.getCenter(), on = Object.entries(LAYERS).filter(([, l]) => l.on).map(([k]) => k).join("+");
  const url = `${location.origin}/nyc/#view=${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()},${on}`;
  try { await navigator.clipboard.writeText(url); $("share").textContent = "✓"; } catch { prompt("Copy this link:", url); }
  setTimeout(() => ($("share").textContent = "🔗"), 1500);
};
if (location.hash) focusHash();
await refresh();
setInterval(() => { if (!bikeLayer.getLayers().length) refresh(); }, 60_000); // skip while a popup is open
