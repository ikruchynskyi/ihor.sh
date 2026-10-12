// A ticking line for a satellite's next pass over a place: "rises in 4:12, then up for 13 min" or "up now: sets in 7:40".
type Pass = { sat: string; name: string; riseIso: string; setIso: string; maxElevation: number; path: string };

const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h} h ${m} min` : `${m}:${String(x).padStart(2, "0")}`;
};

/** Fills `out` every second for satellite `sat` over `where`; returns a function that stops it. */
export function passClock(out: HTMLElement, sat: string, where: { lat: number; lon: number }, label: string) {
  let passes: Pass[] = [], loadedAt = 0, loading = false, stopped = false;
  const load = async () => {
    if (loading) return; loading = true;
    const d = await fetch(`/api/radio/sats?lat=${where.lat.toFixed(2)}&lon=${where.lon.toFixed(2)}&hours=48`).then((r) => r.json()).catch(() => null);
    passes = (d?.passes ?? []).filter((p: Pass) => p.sat === sat); loadedAt = Date.now(); loading = false; tick();
  };
  const tick = () => {
    if (stopped) return;
    const now = Date.now(), p = passes.find((x) => Date.parse(x.setIso) > now);
    if (now - loadedAt > 30 * 60e3 || (loadedAt && !p)) load(); // fresh orbits now and then, and after the last pass ends
    if (!loadedAt) { out.textContent = `${label}: computing…`; return; }
    if (!p) { out.textContent = `${label}: no pass at least 10° up in the next two days.`; return; }
    const rise = Date.parse(p.riseIso), set = Date.parse(p.setIso);
    out.innerHTML = rise > now
      ? `${label}: <b>${p.name}</b> rises in <b>${span(rise - now)}</b>, then up for <b>${span(set - rise)}</b> (peak ${p.maxElevation}°, ${p.path.replace(/[<&]/g, "")}).${rise - now < 120e3 ? " <b>Start recording now.</b>" : ""}`
      : `${label}: <b>${p.name} is up now</b>, sets in <b>${span(set - now)}</b> (peak ${p.maxElevation}°). <b>Recording time.</b>`;
  };
  const timer = setInterval(tick, 1000); tick();
  return () => { stopped = true; clearInterval(timer); };
}
