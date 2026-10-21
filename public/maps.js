// Shared base maps for the site's Leaflet maps: dark streets (theme.css inverts them, in every theme), plain light streets,
// and satellite photos (USGS, public domain, US only). Remembers the choice; follows the reader theme by default.
// Returns the layers control so a page can add its own overlays to it.
export function baseMaps(map, { credit = "", overlays = null } = {}) {
  const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>${credit ? ` · ${credit}` : ""}`;
  const bases = {
    "Dark streets": L.tileLayer(OSM, { maxZoom: 19, attribution: attr, className: "dark-tiles" }),
    "Light streets": L.tileLayer(OSM, { maxZoom: 19, attribution: attr, className: "plain-tiles" }),
    "Satellite": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, className: "plain-tiles", attribution: `Imagery: USGS The National Map (public domain)${credit ? ` · ${credit}` : ""}` }),
  };
  let saved = null;
  try { saved = bases[localStorage.getItem("map-base")] && localStorage.getItem("map-base"); } catch {}
  // reader.js sets the theme's color-scheme after the page's own script runs, so the default waits for it
  const pick = () => bases[saved || (getComputedStyle(document.documentElement).colorScheme === "light" ? "Light streets" : "Dark streets")].addTo(map);
  if (saved || document.readyState !== "loading") pick(); else addEventListener("DOMContentLoaded", pick, { once: true });
  map.on("baselayerchange", (e) => { try { localStorage.setItem("map-base", e.name); } catch {} });
  return L.control.layers(bases, overlays, { position: "topright" }).addTo(map);
}
