// Ham radio data for the radio world: callsign lookups (FCC records via callook.info, US callsigns) and
// repeaters (HearHam's open directory, robots.txt allows; fetched once a day, kept for the NYC region).

const json = async (url: string) => {
  const r = await fetch(url, { headers: { "user-agent": "ihor.sh radio (+https://ihor.sh/radio/repeaters/)" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
};

/** FCC license record for a US callsign, or { found: false }. */
export async function callsign(call: string) {
  const c = call.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!c) return { found: false, callsign: call };
  const d: any = await json(`https://callook.info/${c}/json`);
  if (d.status !== "VALID") return { found: false, callsign: c, note: "Not in the US FCC database (callook.info covers US licenses only)." };
  const CLASS: Record<string, string> = { T: "Technician", G: "General", E: "Amateur Extra", A: "Advanced", N: "Novice", P: "Technician Plus" };
  return {
    found: true, callsign: d.current.callsign, type: d.type, licenseClass: CLASS[d.current.operClass] ?? d.current.operClass ?? "", name: d.name,
    trustee: d.trustee?.callsign ? `${d.trustee.callsign} (${d.trustee.name})` : null, address: [d.address?.line1, d.address?.line2].filter(Boolean).join(", "),
    lat: Number(d.location?.latitude) || null, lon: Number(d.location?.longitude) || null, grid: d.location?.gridsquare ?? "",
    granted: d.otherInfo?.grantDate, expires: d.otherInfo?.expiryDate, uls: d.otherInfo?.ulsUrl, previous: d.previous?.callsign || null,
  };
}

let cache: { at: number; list: Repeater[] } | null = null;
export interface Repeater {
  id: number; callsign: string; lat: number; lon: number; city: string; mode: string; outputMHz: number; offsetMHz: number; inputMHz: number;
  toneUp: string; toneDown: string; network: string; node: string; description: string; operational: boolean; restriction: string; band: string;
}
export function band(mhz: number) {
  return mhz >= 28 && mhz < 29.7 ? "10m" : mhz >= 50 && mhz < 54 ? "6m" : mhz >= 144 && mhz < 148 ? "2m" : mhz >= 219 && mhz < 225 ? "1.25m"
    : mhz >= 420 && mhz < 450 ? "70cm" : mhz >= 902 && mhz < 928 ? "33cm" : mhz >= 1240 && mhz < 1300 ? "23cm" : "other";
}
export async function repeaters() {
  if (!cache || cache.at < Date.now() - 24 * 3600_000) {
    const all: any[] = await json("https://hearham.com/api/repeaters/v1");
    const list = all.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.frequency).map((r) => {
      const out = r.frequency / 1e6, off = (r.offset ?? 0) / 1e6;
      return {
        id: r.id, callsign: r.callsign ?? "", lat: r.latitude, lon: r.longitude, city: r.city ?? "", mode: r.mode ?? "FM",
        outputMHz: +out.toFixed(4), offsetMHz: +off.toFixed(3), inputMHz: +(out + off).toFixed(4),
        toneUp: r.encode && r.encode !== "0" ? r.encode : "", toneDown: r.decode && r.decode !== "0" ? r.decode : "",
        network: r.group ?? "", node: r.internet_node ?? "", description: String(r.description ?? "").slice(0, 400),
        operational: r.operational !== 0, restriction: r.restriction ?? "", band: band(out),
      };
    });
    cache = { at: Date.now(), list };
  }
  return cache.list;
}

/** Repeaters inside a map box (worldwide), nearest to its center first, at most `limit`. */
export async function repeatersIn(s: number, w: number, n: number, e: number, limit = 2500) {
  const cLat = (s + n) / 2, cLon = (w + e) / 2, kx = Math.cos((cLat * Math.PI) / 180);
  const inBox = (await repeaters()).filter((r) => r.lat >= s && r.lat <= n && (w <= e ? r.lon >= w && r.lon <= e : r.lon >= w || r.lon <= e));
  const d = (r: Repeater) => (r.lat - cLat) ** 2 + ((r.lon - cLon) * kx) ** 2;
  return { total: inBox.length, repeaters: inBox.length > limit ? inBox.sort((a, b) => d(a) - d(b)).slice(0, limit) : inBox };
}

/** Repeaters nearest to a point (for Blip), optionally one band or mode. */
export async function repeatersNear(lat: number, lon: number, { bandName = "", mode = "", limit = 10 } = {}) {
  const kx = 111 * Math.cos((lat * Math.PI) / 180), km = (r: Repeater) => Math.hypot((r.lat - lat) * 111, (r.lon - lon) * kx);
  return (await repeaters()).filter((r) => r.operational && (!bandName || r.band === bandName) && (!mode || r.mode.toLowerCase().includes(mode.toLowerCase())))
    .map((r) => ({ ...r, km: +km(r).toFixed(1) })).sort((a, b) => a.km - b.km).slice(0, limit);
}

/** Any place in the world → coordinates (OpenStreetMap Nominatim; light use with a user agent, per its policy). */
export async function placeAnywhere(q: string) {
  const d: any[] = await json(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
  return d[0] ? { label: d[0].display_name as string, lat: Number(d[0].lat), lon: Number(d[0].lon) } : null;
}
