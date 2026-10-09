// Shared base maps for the site's Leaflet maps: themed dark streets (theme.css inverts them), plain light streets,
// and satellite photos (USGS, public domain, US only). Remembers the choice; follows the reader theme by default.
// Returns the layers control so a page can add its own overlays to it.
export function baseMaps(map, { credit = "", overlays = null } = {}) {
  const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>${credit ? ` · ${credit}` : ""}`;
  const bases = {
    "Dark streets": L.tileLayer(OSM, { maxZoom: 19, attribution: attr }),
    "Light streets": L.tileLayer(OSM, { maxZoom: 19, attribution: attr, className: "plain-tiles" }),
    "Satellite": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, className: "plain-tiles", attribution: `Imagery: USGS The National Map (public domain)${credit ? ` · ${credit}` : ""}` }),
  };
  let base = getComputedStyle(document.documentElement).colorScheme === "light" ? "Light streets" : "Dark streets";
  try { if (bases[localStorage.getItem("map-base")]) base = localStorage.getItem("map-base"); } catch {}
  bases[base].addTo(map);
  map.on("baselayerchange", (e) => { try { localStorage.setItem("map-base", e.name); } catch {} });
  return L.control.layers(bases, overlays, { position: "topright" }).addTo(map);
}
