// Pure helpers for the map: no DOM, no fetch, so node can test them.

const R = 6371e3; // Earth radius, m
export function distance(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** k closest items to `from`, each with `.meters`. Brute force: ~2k bikes × ~500 stops is nothing. */
export function nearest(from, items, k = 3) {
  return items
    .map((it) => ({ ...it, meters: distance(from, it) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, k);
}

/** "A57N" / "A57S" are platforms of station "A57". */
export const stationId = (stopId) => stopId.replace(/[NS]$/, "");

export function isActive(alert, nowSec) {
  const periods = alert.active_period ?? [];
  return !periods.length || periods.some((p) => (p.start ?? 0) <= nowSec && (!p.end || p.end >= nowSec));
}

const text = (t, lang) => t?.translation?.find((x) => x.language === lang)?.text ?? "";

/**
 * GTFS-rt alerts JSON → Map(stationId → [{ id, type, routes, header }]) for alerts active now.
 * Alerts with no stop_id (route-wide) are returned separately: they can't be placed on the map.
 */
export function alertsByStation(feed, nowSec) {
  const byStation = new Map(), unplaced = [];
  for (const { id, alert } of feed.entity ?? []) {
    if (!alert || !isActive(alert, nowSec)) continue;
    const ents = alert.informed_entity ?? [];
    const a = {
      id,
      type: alert["transit_realtime.mercury_alert"]?.alert_type ?? "Alert",
      routes: [...new Set(ents.map((e) => e.route_id).filter(Boolean))],
      header: text(alert.header_text, "en"),
    };
    const stations = new Set(ents.filter((e) => e.stop_id).map((e) => stationId(e.stop_id)));
    if (!stations.size) unplaced.push(a);
    for (const s of stations) byStation.has(s) ? byStation.get(s).push(a) : byStation.set(s, [a]);
  }
  return { byStation, unplaced };
}
