// Satellites overhead: SGP4 (the near-Earth model of Spacetrack Report #3, the one TLEs are made for) from scratch,
// TEME → Earth-fixed via sidereal time, look angles from a place, and passes: rise, highest point, set, and whether
// you can see it (the satellite in sunlight while your sky is dark). Good to a few km over a few days: plenty for
// "when do I look up". The ISS's elements come from CelesTrak, refreshed every 6 hours.

const XKE = 0.0743669161, CK2 = 5.413080e-4, CK4 = 0.62098875e-6, A30 = 2.53881e-6, QOMS2T = 1.88027916e-9, S0 = 1.01222928, RE = 6378.135, TAU = 2 * Math.PI;

export type Tle = { name: string; epoch: number; n0: number; e0: number; i0: number; node0: number; w0: number; m0: number; bstar: number };

/** Two-line elements → numbers (angles in radians, mean motion in radians a minute, epoch as ms since 1970). */
export function parseTle(l1: string, l2: string, name = ""): Tle {
  const f = (s: string, a: number, b: number) => parseFloat(s.slice(a, b));
  const yy = f(l1, 18, 20), day = f(l1, 20, 32), year = yy < 57 ? 2000 + yy : 1900 + yy;
  const bstar = parseFloat(`${l1[53] === "-" ? "-" : ""}0.${l1.slice(54, 59).trim()}e${l1.slice(59, 61)}`);
  const d = Math.PI / 180;
  return { name, epoch: Date.UTC(year, 0, 1) + (day - 1) * 864e5, bstar, i0: f(l2, 8, 16) * d, node0: f(l2, 17, 25) * d, e0: parseFloat(`0.${l2.slice(26, 33)}`), w0: f(l2, 34, 42) * d, m0: f(l2, 43, 51) * d, n0: (f(l2, 52, 63) * TAU) / 1440 };
}

/** Position (km) and velocity (km/s) in the TEME frame, `tsince` minutes after the elements' epoch. */
export function sgp4(el: Tle, tsince: number) {
  const { n0, e0, i0, node0, w0, m0, bstar } = el;
  const cosi = Math.cos(i0), sini = Math.sin(i0), th2 = cosi * cosi, x3thm1 = 3 * th2 - 1, eosq = e0 * e0, betao2 = 1 - eosq, betao = Math.sqrt(betao2);
  // the "un-Kozai'd" mean motion and semi-major axis
  const a1 = (XKE / n0) ** (2 / 3), del1 = (1.5 * CK2 * x3thm1) / (a1 * a1 * betao * betao2);
  const ao = a1 * (1 - del1 * (0.5 * (2 / 3) + del1 * (1 + (134 / 81) * del1))), delo = (1.5 * CK2 * x3thm1) / (ao * ao * betao * betao2);
  const xnodp = n0 / (1 + delo), aodp = ao / (1 - delo);
  // atmosphere: below 156 km perigee the density parameters change
  let s4 = S0, qoms24 = QOMS2T; const perigee = (aodp * (1 - e0) - 1) * RE;
  if (perigee < 156) { s4 = perigee <= 98 ? 20 : perigee - 78; qoms24 = ((120 - s4) / RE) ** 4; s4 = s4 / RE + 1; }
  const pinvsq = 1 / (aodp * aodp * betao2 * betao2), tsi = 1 / (aodp - s4), eta = aodp * e0 * tsi, etasq = eta * eta, eeta = e0 * eta, psisq = Math.abs(1 - etasq);
  const coef = qoms24 * tsi ** 4, coef1 = coef / psisq ** 3.5;
  const c2 = coef1 * xnodp * (aodp * (1 + 1.5 * etasq + eeta * (4 + etasq)) + ((0.75 * CK2 * tsi) / psisq) * x3thm1 * (8 + 3 * etasq * (8 + etasq)));
  const c1 = bstar * c2, c3 = e0 > 1e-4 ? (coef * tsi * A30 * xnodp * sini) / (CK2 * e0) : 0, x1mth2 = 1 - th2;
  const c4 = 2 * xnodp * coef1 * aodp * betao2 * (eta * (2 + 0.5 * etasq) + e0 * (0.5 + 2 * etasq) - ((2 * CK2 * tsi) / (aodp * psisq)) * (-3 * x3thm1 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * w0)));
  const c5 = 2 * coef1 * aodp * betao2 * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
  const th4 = th2 * th2, temp1 = 3 * CK2 * pinvsq * xnodp, temp2 = temp1 * CK2 * pinvsq, temp3 = 1.25 * CK4 * pinvsq * pinvsq * xnodp;
  const xmdot = xnodp + 0.5 * temp1 * betao * x3thm1 + 0.0625 * temp2 * betao * (13 - 78 * th2 + 137 * th4);
  const omgdot = -0.5 * temp1 * (1 - 5 * th2) + 0.0625 * temp2 * (7 - 114 * th2 + 395 * th4) + temp3 * (3 - 36 * th2 + 49 * th4);
  const xnodot = -temp1 * cosi + (0.5 * temp2 * (4 - 19 * th2) + 2 * temp3 * (3 - 7 * th2)) * cosi;
  const omgcof = bstar * c3 * Math.cos(w0), xmcof = e0 > 1e-4 ? -(2 / 3) * coef * bstar / eeta : 0, xnodcf = 3.5 * betao2 * (-temp1 * cosi) * c1, t2cof = 1.5 * c1;
  const xlcof = (0.125 * A30 * sini * (3 + 5 * cosi)) / (1 + cosi), aycof = 0.25 * A30 * sini, delmo = (1 + eta * Math.cos(m0)) ** 3, sinmo = Math.sin(m0), x7thm1 = 7 * th2 - 1;
  const simple = perigee < 220; // very low orbits drop the higher drag terms
  const d2 = 4 * aodp * tsi * c1 * c1, temp = (d2 * tsi * c1) / 3, d3 = (17 * aodp + s4) * temp, d4 = 0.5 * temp * aodp * tsi * (221 * aodp + 31 * s4) * c1;
  const t3cof = d2 + 2 * c1 * c1, t4cof = 0.25 * (3 * d3 + c1 * (12 * d2 + 10 * c1 * c1)), t5cof = 0.2 * (3 * d4 + 12 * c1 * d3 + 6 * d2 * d2 + 15 * c1 * c1 * (2 * d2 + c1 * c1));
  // secular gravity and drag
  const t = tsince, xmdf = m0 + xmdot * t, omgadf = w0 + omgdot * t, xnoddf = node0 + xnodot * t;
  let omega = omgadf, xmp = xmdf; const tsq = t * t, xnode = xnoddf + xnodcf * tsq; // drag turns the node a little more each orbit
  let tempa = 1 - c1 * t, tempe = bstar * c4 * t, templ = t2cof * tsq;
  if (!simple) {
    const delomg = omgcof * t, delm = xmcof * ((1 + eta * Math.cos(xmdf)) ** 3 - delmo), tmp = delomg + delm;
    xmp = xmdf + tmp; omega = omgadf - tmp;
    const tcube = tsq * t, tfour = t * tcube;
    tempa = tempa - d2 * tsq - d3 * tcube - d4 * tfour; tempe = tempe + bstar * c5 * (Math.sin(xmp) - sinmo); templ = templ + t3cof * tcube + tfour * (t4cof + t * t5cof);
  }
  const a = aodp * tempa * tempa, e = e0 - tempe, xl = xmp + omega + xnode + xnodp * templ;
  // long-period periodics
  const beta = Math.sqrt(1 - e * e), xn = XKE / a ** 1.5, axn = e * Math.cos(omega), tmpL = 1 / (a * beta * beta);
  const xll = tmpL * xlcof * axn, aynl = tmpL * aycof, xlt = xl + xll, ayn = e * Math.sin(omega) + aynl;
  // Kepler's equation
  const capu = (((xlt - xnode) % TAU) + TAU) % TAU; let epw = capu, sinepw = 0, cosepw = 1;
  for (let k = 0; k < 10; k++) { sinepw = Math.sin(epw); cosepw = Math.cos(epw); const f = capu - ayn * cosepw + axn * sinepw - epw, df = 1 - ayn * sinepw - axn * cosepw, d = f / df; epw += Math.abs(d) > 0.95 ? Math.sign(d) * 0.95 : d; if (Math.abs(d) < 1e-12) break; }
  const ecose = axn * cosepw + ayn * sinepw, esine = axn * sinepw - ayn * cosepw, elsq = axn * axn + ayn * ayn, pl = a * (1 - elsq), r = a * (1 - ecose);
  const rdot = (XKE * Math.sqrt(a) * esine) / r, rfdot = (XKE * Math.sqrt(pl)) / r, betal = Math.sqrt(1 - elsq), t3 = esine / (1 + betal);
  const cosu = (a / r) * (cosepw - axn + ayn * t3), sinu = (a / r) * (sinepw - ayn - axn * t3), u = Math.atan2(sinu, cosu), sin2u = 2 * sinu * cosu, cos2u = 2 * cosu * cosu - 1;
  // short-period periodics
  const tp1 = CK2 / pl, tp2 = tp1 / pl;
  const rk = r * (1 - 1.5 * tp2 * betal * x3thm1) + 0.5 * tp1 * x1mth2 * cos2u, uk = u - 0.25 * tp2 * x7thm1 * sin2u, xnodek = xnode + 1.5 * tp2 * cosi * sin2u, xinck = i0 + 1.5 * tp2 * cosi * sini * cos2u;
  const rdotk = rdot - xn * tp1 * x1mth2 * sin2u, rfdotk = rfdot + xn * tp1 * (x1mth2 * cos2u + 1.5 * x3thm1);
  const sinuk = Math.sin(uk), cosuk = Math.cos(uk), sinik = Math.sin(xinck), cosik = Math.cos(xinck), sinnok = Math.sin(xnodek), cosnok = Math.cos(xnodek);
  const xmx = -sinnok * cosik, xmy = cosnok * cosik, ux = xmx * sinuk + cosnok * cosuk, uy = xmy * sinuk + sinnok * cosuk, uz = sinik * sinuk;
  const vx = xmx * cosuk - cosnok * sinuk, vy = xmy * cosuk - sinnok * sinuk, vz = sinik * cosuk;
  return { r: [rk * ux * RE, rk * uy * RE, rk * uz * RE], v: [((rdotk * ux + rfdotk * vx) * RE) / 60, ((rdotk * uy + rfdotk * vy) * RE) / 60, ((rdotk * uz + rfdotk * vz) * RE) / 60] };
}

/** Greenwich mean sidereal time (radians) at a time (ms since 1970). */
export function gmst(ms: number) {
  const d = ms / 864e5 + 2440587.5 - 2451545, T = d / 36525;
  return ((((280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000) % 360) + 360) % 360) * (Math.PI / 180);
}
const toEcef = (r: number[], ms: number) => { const g = gmst(ms), c = Math.cos(g), s = Math.sin(g); return [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]]; };
/** A place (degrees, km above sea level) → Earth-fixed km (WGS84). */
export function site(lat: number, lon: number, h = 0) {
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f), la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180, N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2);
  return { la, lo, xyz: [(N + h) * Math.cos(la) * Math.cos(lo), (N + h) * Math.cos(la) * Math.sin(lo), (N * (1 - e2) + h) * Math.sin(la)] };
}
/** Where the satellite is seen from a place: elevation and azimuth (degrees), range (km). */
export function look(el: Tle, ms: number, s: ReturnType<typeof site>) {
  const p = toEcef(sgp4(el, (ms - el.epoch) / 60000).r, ms), d = [p[0] - s.xyz[0], p[1] - s.xyz[1], p[2] - s.xyz[2]];
  const sl = Math.sin(s.la), cl = Math.cos(s.la), so = Math.sin(s.lo), co = Math.cos(s.lo);
  const south = sl * co * d[0] + sl * so * d[1] - cl * d[2], east = -so * d[0] + co * d[1], up = cl * co * d[0] + cl * so * d[1] + sl * d[2], range = Math.hypot(...d);
  return { el: (Math.asin(up / range) * 180) / Math.PI, az: ((Math.atan2(east, -south) * 180) / Math.PI + 360) % 360, range, ecef: p };
}
/** The point under the satellite (degrees) and its height (km). */
export function subpoint(el: Tle, ms: number) {
  const p = toEcef(sgp4(el, (ms - el.epoch) / 60000).r, ms), lon = (Math.atan2(p[1], p[0]) * 180) / Math.PI, rxy = Math.hypot(p[0], p[1]);
  let lat = Math.atan2(p[2], rxy); const e2 = 0.00669437999014; // iterate for geodetic latitude
  for (let k = 0; k < 5; k++) { const N = 6378.137 / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); lat = Math.atan2(p[2] + N * e2 * Math.sin(lat), rxy); }
  const N = 6378.137 / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return { lat: (lat * 180) / Math.PI, lon, km: rxy / Math.cos(lat) - N };
}

/** The Sun's direction in the Earth-fixed frame (unit vector), good to a fraction of a degree. */
export function sunEcef(ms: number) {
  const n = ms / 864e5 + 2440587.5 - 2451545, L = (280.46 + 0.9856474 * n) * (Math.PI / 180), g = (357.528 + 0.9856003 * n) * (Math.PI / 180);
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180), eps = (23.439 - 4e-7 * n) * (Math.PI / 180);
  const eci = [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
  return toEcef(eci, ms);
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export type Pass = { rise: number; peak: number; set: number; maxEl: number; riseAz: number; setAz: number; peakAz: number; visible: boolean; magnitudeHint: string };
const compass = (az: number) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(az / 22.5) % 16];
export { compass };

/** Passes over a place in the next `hours`, each with rise/peak/set times and whether it's visible to the eye. */
export function passes(el: Tle, lat: number, lon: number, from = Date.now(), hours = 72, minEl = 10): Pass[] {
  const s = site(lat, lon), out: Pass[] = [], step = 30_000, end = from + hours * 3600e3;
  const elAt = (t: number) => look(el, t, s).el;
  const edge = (a: number, b: number) => { for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if ((elAt(m) > 0) === (elAt(a) > 0)) a = m; else b = m; } return (a + b) / 2; };
  let prev = elAt(from), t = from;
  while (t < end) {
    const nt = t + step, e = elAt(nt);
    if (prev <= 0 && e > 0) {
      const rise = edge(t, nt); let set = nt, peak = nt, maxEl = e;
      for (let u = nt; u < nt + 30 * 60e3; u += 10_000) { const x = elAt(u); if (x > maxEl) { maxEl = x; peak = u; } if (x <= 0) { set = edge(u - 10_000, u); break; } }
      if (maxEl >= minEl) {
        // visible: the satellite is lit by the Sun (outside Earth's shadow cylinder) while the Sun is ≥ 6° below the horizon
        let visible = false;
        for (let u = rise; u <= set; u += 20_000) {
          const L = look(el, u, s), sun = sunEcef(u), sunEl = (Math.asin(dot(sun, [Math.cos(s.la) * Math.cos(s.lo), Math.cos(s.la) * Math.sin(s.lo), Math.sin(s.la)])) * 180) / Math.PI;
          const p = L.ecef, along = dot(p, sun), perp = Math.sqrt(Math.max(0, dot(p, p) - along * along)), lit = along > 0 || perp > 6371;
          if (L.el > 10 && lit && sunEl < -6) { visible = true; break; }
        }
        out.push({ rise, peak, set, maxEl, riseAz: look(el, rise, s).az, peakAz: look(el, peak, s).az, setAz: look(el, set, s).az, visible, magnitudeHint: maxEl > 60 ? "very bright, nearly overhead" : maxEl > 35 ? "bright" : "low in the sky" });
      }
      t = set + step; prev = elAt(t); continue;
    }
    prev = e; t = nt;
  }
  return out;
}

/** Passes for people: New York times, directions in words, the elevation, and whether to look (the visible ones). */
export async function issPasses(lat = 40.7128, lon = -74.006, hours = 72) {
  const tle = await issTle(), t = (ms: number) => new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { from: { lat: +lat.toFixed(3), lon: +lon.toFixed(3) }, elementsAgeHours: +((Date.now() - tle.epoch) / 3600e3).toFixed(1),
    passes: passes(tle, lat, lon, Date.now(), hours).map((p) => ({ rise: t(p.rise), riseIso: new Date(p.rise).toISOString(), minutes: Math.round((p.set - p.rise) / 60000), maxElevation: Math.round(p.maxEl),
      path: `${compass(p.riseAz)} → ${compass(p.peakAz)} (highest) → ${compass(p.setAz)}`, visibleToEye: p.visible, note: p.visible ? `Look ${compass(p.riseAz)} at ${t(p.rise).split(", ").pop()}: ${p.magnitudeHint}` : "in daylight or Earth's shadow: not visible" })) };
}

let cache: { at: number; tle: Tle } | null = null;
/** The ISS's latest elements from CelesTrak (cached 6 h). */
export async function issTle(): Promise<Tle> {
  if (cache && Date.now() - cache.at < 6 * 3600e3) return cache.tle;
  const r = await fetch("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle", { headers: { "user-agent": "ihor.sh (+https://ihor.sh/nyc/)" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`CelesTrak ${r.status}`);
  const [name, l1, l2] = (await r.text()).trim().split(/\r?\n/).map((x) => x.trim());
  cache = { at: Date.now(), tle: parseTle(l1, l2, name) };
  return cache.tle;
}
