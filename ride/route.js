// Route notebook core: a GPX track → distances, climbing, days, stops along the way, gaps, daylight.
// Pure functions (no DOM, no network), so node can test them: node ride/route.test.mjs

const R = 6371e3, rad = Math.PI / 180;
export const meters = (a, b) => { const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

/** GPX text → { name, points: [{ lat, lon, ele? }], waypoints: [{ lat, lon, name }] }. Track points, else route points. */
export function parseGPX(text) {
  const attr = (tag, a) => tag.match(new RegExp(`${a}="([^"]+)"`))?.[1];
  const pts = (kind) => [...text.matchAll(new RegExp(`<${kind}\\b([^>]*)>([\\s\\S]*?)</${kind}>|<${kind}\\b([^>]*)/>`, "g"))].map((m) => {
    const head = m[1] ?? m[3], body = m[2] ?? "", ele = body.match(/<ele>([^<]+)<\/ele>/)?.[1], name = body.match(/<name>([^<]+)<\/name>/)?.[1];
    return { lat: +attr(head, "lat"), lon: +attr(head, "lon"), ...(ele != null && ele.trim() !== "" ? { ele: +ele } : {}), ...(name ? { name } : {}) };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const track = pts("trkpt");
  return { name: text.match(/<name>([^<]+)<\/name>/)?.[1] ?? "Route", points: track.length ? track : pts("rtept"), waypoints: pts("wpt") };
}

/** Adds .km (distance from the start) to every point; returns total km. */
export function measure(points) {
  let d = 0;
  points.forEach((p, i) => { if (i) d += meters(points[i - 1], p); p.km = d / 1000; });
  return d / 1000;
}

/** Climbing and descent with a hysteresis band, so GPS/DEM noise (±a few m) doesn't count as hills. */
export function climb(points, band = 5) {
  let up = 0, down = 0, ref = null;
  for (const p of points) {
    if (p.ele == null) continue;
    if (ref == null) { ref = p.ele; continue; }
    if (p.ele - ref >= band) { up += p.ele - ref; ref = p.ele; }
    else if (ref - p.ele >= band) { down += ref - p.ele; ref = p.ele; }
  }
  return { up: Math.round(up), down: Math.round(down) };
}

/** Split a measured track into days: each ends when the next point would pass maxKm or maxClimb. Returns point index ranges. */
export function splitDays(points, { maxKm = 60, maxClimb = 900 } = {}) {
  const days = [];
  let start = 0;
  while (start < points.length - 1) {
    let end = start + 1;
    while (end < points.length - 1) {
      const next = points.slice(start, end + 2);
      if (points[end + 1].km - points[start].km > maxKm || climb(next).up > maxClimb) break;
      end++;
    }
    days.push([start, end]);
    start = end;
  }
  return days;
}

/** Move each day's end to a campsite/lodging near it (within `window` km of the planned end), if there is one. */
export function snapToCamps(points, days, camps, window = 8) {
  return days.map(([s, e], i) => {
    if (i === days.length - 1) return [s, e];
    const target = points[e].km, near = camps.filter((c) => Math.abs(c.km - target) <= window && c.km > points[s].km + 5).sort((a, b) => Math.abs(a.km - target) - Math.abs(b.km - target))[0];
    if (!near) return [s, e];
    const idx = points.findIndex((p) => p.km >= near.km);
    return [s, idx > s ? idx : e];
  }).map(([s, e], i, all) => [i ? all[i - 1][1] : s, e]); // each day starts where the previous ended
}

/** Place stops on the route: km along it and meters off it. Keeps those within maxOff meters. */
export function along(points, pois, maxOff) {
  const step = Math.max(1, Math.floor(points.length / 2000)); // ponytail: nearest sampled point, ~2,000 samples; fine for meters-scale offsets
  return pois.map((q) => {
    let best = Infinity, km = 0;
    for (let i = 0; i < points.length; i += step) { const d = meters(points[i], q); if (d < best) { best = d; km = points[i].km; } }
    return { ...q, km, off: Math.round(best) };
  }).filter((q) => q.off <= maxOff).sort((a, b) => a.km - b.km);
}

/** The longest stretch between kmA and kmB without any of `stops` (also counting from the day's start and to its end). */
export function longestGap(stops, kmA, kmB) {
  const marks = [kmA, ...stops.map((s) => s.km).filter((k) => k > kmA && k < kmB), kmB];
  let gap = { from: kmA, to: kmA, km: 0 };
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > gap.km) gap = { from: marks[i - 1], to: marks[i], km: marks[i] - marks[i - 1] };
  return gap;
}

/** Sunrise and sunset (local Date objects) for a date at a place: the NOAA approximation, good to a minute or two. */
export function sun(date, lat, lon) {
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2000, 0, 1, 12)) / 864e5) + 1;
  const n = day - lon / 360, M = (357.5291 + 0.98560028 * n) % 360, Mr = M * rad;
  const Cc = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr), lam = ((M + Cc + 180 + 102.9372) % 360) * rad;
  const transit = 2451545 + n + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam), decl = Math.asin(Math.sin(lam) * Math.sin(23.44 * rad));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosW < -1 || cosW > 1) return null; // polar day or night
  const w = Math.acos(cosW) / (2 * Math.PI), toDate = (jd) => new Date((jd - 2440587.5) * 864e5);
  return { rise: toDate(transit - w), set: toDate(transit + w) };
}

/** A plain GPX track from points (for exporting one day). */
export const toGPX = (name, points) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ihor.sh route notebook" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${name.replace(/[<&]/g, "")}</name><trkseg>
${points.map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.ele != null ? `<ele>${Math.round(p.ele)}</ele>` : ""}</trkpt>`).join("\n")}
</trkseg></trk></gpx>`;
