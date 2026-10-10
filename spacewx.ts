// Space weather for radio: the indexes hams read before deciding which band to try, from NOAA's Space Weather
// Prediction Center (free JSON, no key), plus plain-words band conditions worked out the way the popular
// "solar-terrestrial data" banners do: solar flux and sunspots open the high bands, a stormy K index closes them.
const BASE = "https://services.swpc.noaa.gov";
const UA = { "user-agent": "ihor.sh (+https://ihor.sh/radio/repeaters/)" };
const get = async (p: string) => { const r = await fetch(BASE + p, { headers: UA, signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`SWPC ${r.status}`); return r; };
const json = (p: string) => get(p).then((r) => r.json());

export type Propagation = Awaited<ReturnType<typeof fetchPropagation>>;
let cache: { at: number; v: Promise<any> } | null = null;
/** Everything, cached 10 minutes. Any one source failing leaves a null in its place rather than failing the lot. */
export function propagation() {
  if (!cache || Date.now() - cache.at > 10 * 60e3) cache = { at: Date.now(), v: fetchPropagation() };
  return cache.v;
}

const xrayClass = (f: number) => (f >= 1e-4 ? `X${(f / 1e-4).toFixed(1)}` : f >= 1e-5 ? `M${(f / 1e-5).toFixed(1)}` : f >= 1e-6 ? `C${(f / 1e-6).toFixed(1)}` : f >= 1e-7 ? `B${(f / 1e-7).toFixed(1)}` : `A${(f / 1e-8).toFixed(1)}`);
const settle = <T>(p: Promise<T>) => p.catch(() => null);

async function fetchPropagation() {
  const [kp, flux, scales, xray, wind, mag, daily] = await Promise.all([
    settle(json("/products/noaa-planetary-k-index.json")), settle(json("/products/summary/10cm-flux.json")), settle(json("/products/noaa-scales.json")),
    settle(json("/json/goes/primary/xrays-6-hour.json")), settle(json("/products/summary/solar-wind-speed.json")), settle(json("/products/summary/solar-wind-mag-field.json")),
    settle(get("/text/daily-solar-indices.txt").then((r) => r.text())),
  ]);
  const kps: { time: string; kp: number; a: number }[] = (kp ?? []).map((r: any) => ({ time: r.time_tag, kp: +r.Kp, a: +r.a_running })).filter((r: any) => Number.isFinite(r.kp));
  const latestK = kps.at(-1) ?? null;
  const sfi = flux?.[0]?.flux != null ? Math.round(+flux[0].flux) : null;
  // daily-solar-indices.txt: "YYYY MM DD  radio-flux  SSN  area  newReg ..." for the last 30 days
  const rows = String(daily ?? "").split("\n").filter((l) => /^\d{4} \d\d \d\d/.test(l)).map((l) => l.trim().split(/\s+/).map(Number));
  const last = rows.at(-1), ssn = last ? last[4] : null, sfi30 = rows.map((r) => r[3]).filter((v) => v > 0);
  const longWave = (xray ?? []).filter((r: any) => r.energy === "0.1-0.8nm" && r.flux > 0);
  const xNow = longWave.at(-1)?.flux ?? null, xMax = longWave.length ? Math.max(...longWave.map((r: any) => r.flux)) : null;
  const now = scales?.["0"], next = scales?.["1"];
  const scale = (o: any, k: string) => (o?.[k]?.Scale != null && o[k].Scale !== "" ? { level: +o[k].Scale, text: o[k].Text } : null);
  const k = latestK?.kp ?? 2, s = sfi ?? 100;
  // bands: good / fair / poor by day and night, from the flux (the high bands need a lit, dense ionosphere) and the K index (storms absorb and scatter)
  const storm = k >= 7 ? 2 : k >= 5 ? 1 : 0;
  const grade = (base: number, low = false) => ["poor", "fair", "good"][Math.max(0, Math.min(2, base - (low ? Math.min(1, storm) : storm)))]; // storms hurt the high bands most
  const bands = [
    { band: "80m–40m", day: grade(1, true), night: grade(2, true), why: "low bands live at night; daytime D-layer absorption" },
    { band: "30m–20m", day: grade(s >= 90 ? 2 : 1), night: grade(s >= 120 ? 2 : 1), why: "the workhorse bands; 20 m stays open after dark when flux is high" },
    { band: "17m–15m", day: grade(s >= 110 ? 2 : s >= 85 ? 1 : 0), night: grade(s >= 150 ? 1 : 0), why: "need a strong sun; mostly daytime" },
    { band: "12m–10m", day: grade(s >= 150 ? 2 : s >= 115 ? 1 : 0), night: "poor", why: "open only near solar maximum, by day" },
  ];
  const month = new Date().getMonth() + 1, esSeason = month >= 5 && month <= 8;
  const vhf = { aurora: k >= 6 ? "likely at mid-latitudes: try 6 m and 2 m CW/SSB pointed north" : k >= 5 ? "possible to the north" : "unlikely", sporadicE: esSeason ? "season (May–August): 6 m can open any afternoon" : "off-season", satellites: storm ? "fine; storms don't bother line-of-sight" : "fine" };
  const summary = `SFI ${sfi ?? "?"}, SSN ${ssn ?? "?"}, K ${latestK ? latestK.kp.toFixed(1) : "?"} (A ${latestK?.a ?? "?"}), X-ray ${xNow != null ? xrayClass(xNow) : "?"}; ` + (storm === 2 ? "a severe geomagnetic storm: HF is rough, look north for aurora." : storm === 1 ? "unsettled to stormy: the high bands suffer, low bands at night still work." : s >= 150 ? "a strong sun and a quiet field: 10 m and 15 m should be open by day." : s >= 100 ? "decent conditions: 20 m through 15 m by day, 40 m and 80 m at night." : "a quiet sun: stick to 20 m by day and 40 m/80 m at night.");
  return {
    at: new Date().toISOString(), source: "NOAA SWPC",
    sfi, sfi30day: sfi30, ssn, k: latestK ? { kp: latestK.kp, a: latestK.a, at: latestK.time } : null, kHistory: kps.slice(-16).map((r) => [r.time, r.kp]),
    xray: xNow != null ? { now: xrayClass(xNow), max6h: xrayClass(xMax!), flux: xNow } : null,
    solarWind: wind?.[0]?.proton_speed != null ? { kmPerS: +wind[0].proton_speed, bz: mag?.[0]?.bz_gsm ?? null, bt: mag?.[0]?.bt ?? null, at: wind[0].time_tag } : null,
    scales: now ? { radioBlackout: scale(now, "R"), solarRadiation: scale(now, "S"), geomagnetic: scale(now, "G"), tomorrow: next ? { geomagnetic: scale(next, "G"), rMinorProb: next.R?.MinorProb ?? null, rMajorProb: next.R?.MajorProb ?? null } : null } : null,
    bands, vhf, summary,
  };
}
