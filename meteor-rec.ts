// The server's Meteor pass recorder: schedules and serves. Every 20 minutes it computes the next 48 hours of Meteor-M2 3
// and M2 4 passes over the radio server's place and sets a timer for each one that spends a minute or more in the part of
// the sky the antenna hears (WINDOW); a minute
// before the satellite rises it starts radio/scripts/meteor-record.ts as its own process (so decoding never slows the
// site), which takes the server's dongle until the satellite sets. After a restart mid-pass it records the rest.
// Products live in data/meteor/<id>/ (git-ignored); /api/meteor/passes lists them, /api/meteor/file serves them.
import { spawn } from "node:child_process";
import { existsSync, createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type http from "node:http";
import { tleFor, passes, look, site, type Tle } from "./sat.ts";

const DIR = path.join(import.meta.dirname, "data", "meteor"), SCRIPT = path.join(import.meta.dirname, "radio", "scripts", "meteor-record.ts");
const SATS = [{ id: "meteor-m2-3", catnr: 57166, freq: 137.9 }, { id: "meteor-m2-4", catnr: 59051, freq: 137.9 }];
const HOME = { lat: 40.73, lon: -73.95 }, LEAD_MS = 60_000;
// Where the balcony's V-dipole hears Meteor: the first three passes (2026-10-15/16) only ever had signal with the
// satellite north (azimuth ~350–35°) at 25–55° up; overhead and the southern sky gave nothing, and a 42° pass through the
// south and west gave no frames. So a pass is worth recording for its minutes in this window, not for its peak (user,
// 2026-10-16; was "peaks at 40° or more"). ponytail: fixed box from 3 passes, widen az/el as more passes show signal.
const WINDOW = { minEl: 20, maxEl: 60, azFrom: 315, azTo: 45, minutes: 1 };
type Planned = { sat: string; freq: number; rise: number; set: number; maxEl: number; northMin: number };

/** Minutes of a pass the satellite spends inside WINDOW (sampled every 10 s). */
export function windowMinutes(tle: Tle, rise: number, set: number) {
  const here = site(HOME.lat, HOME.lon); let n = 0;
  for (let t = rise; t < set; t += 10_000) { const { el, az } = look(tle, t, here); if (el >= WINDOW.minEl && el <= WINDOW.maxEl && (az >= WINDOW.azFrom || az <= WINDOW.azTo)) n++; }
  return n / 6;
}
const timers = new Map<string, NodeJS.Timeout>();
let upcoming: Planned[] = [], running: { pid: number; sat: string; until: number } | null = null;

function startRecorder(p: Planned) {
  if (running && Date.now() < running.until + 60_000) { console.log(`meteor: ${p.sat} skipped, ${running.sat} is still recording`); return; }
  const id = `${new Date(p.rise).toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${p.sat}`;
  // `running` doesn't survive a restart, and a restart mid-pass re-plans that pass: a second recorder would take over
  // the radio stream and start raw.cu8 over (2026-10-16 19:21: two restarts cost the pass its first 7 minutes).
  if (existsSync(path.join(DIR, id))) { console.log(`meteor: ${id} already recorded or recording`); return; }
  const child = spawn(process.execPath, [SCRIPT, "--sat", p.sat, "--freq", String(p.freq), "--until", String(p.set), "--max-el", p.maxEl.toFixed(0), "--id", id], { detached: true, stdio: "ignore" });
  child.unref(); // keeps running if the site server restarts
  running = { pid: child.pid ?? 0, sat: p.sat, until: p.set };
  console.log(`meteor: recording ${p.sat} (peak ${p.maxEl.toFixed(0)}°) as ${id}, pid ${child.pid}`);
}

async function plan() {
  const next: Planned[] = [];
  for (const s of SATS) {
    const tle = await tleFor(s.catnr).catch(() => null); if (!tle) continue;
    for (const p of passes(tle, HOME.lat, HOME.lon, Date.now() - 20 * 60e3, 48, WINDOW.minEl)) {
      const northMin = windowMinutes(tle, p.rise, p.set);
      if (northMin >= WINDOW.minutes && p.set > Date.now()) next.push({ sat: s.id, freq: s.freq, rise: p.rise, set: p.set, maxEl: p.maxEl, northMin });
    }
  }
  upcoming = next.sort((a, b) => a.rise - b.rise);
  for (const p of upcoming) {
    const key = `${p.sat}@${Math.round(p.rise / 60e3)}`; if (timers.has(key)) continue;
    timers.set(key, setTimeout(() => startRecorder(p), Math.max(0, p.rise - LEAD_MS - Date.now()))); // in progress already: start now
  }
}

export function startMeteorRecorder() {
  plan().catch((e) => console.log(`meteor: planning failed: ${(e as Error).message}`));
  setInterval(() => plan().catch(() => {}), 20 * 60e3);
}

/** The page's naming (meteor-app.ts reads satellite, start and sample rate back from it): sat-freq-YYYY-MM-DDHHMM-rate. */
const rawName = (id: string) => { const m = id.match(/^(\d{4})(\d{2})(\d{2})(\d{4})-(.+)$/); return m ? `${m[5]}-137.9MHz-${m[1]}-${m[2]}-${m[3]}${m[4]}-240000sps.cu8` : `${id}-240000sps.cu8`; };

/** GET /api/meteor/passes and /api/meteor/file?id=…&f=…; returns false when the URL isn't one of them. */
export function meteorApi(url: URL, res: http.ServerResponse): boolean {
  if (url.pathname === "/api/meteor/passes") {
    const recorded = existsSync(path.join(DIR, "index.json")) ? JSON.parse(readFileSync(path.join(DIR, "index.json"), "utf8")) : [];
    const now = running && Date.now() < running.until + 60_000 ? running : null;
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ window: WINDOW, home: HOME, recording: now && { sat: now.sat, until: now.until }, upcoming: upcoming.filter((p) => p.set > Date.now()), recorded }));
    return true;
  }
  if (url.pathname === "/api/meteor/file") {
    const id = String(url.searchParams.get("id")), f = String(url.searchParams.get("f"));
    if (!/^[\w-]{1,80}$/.test(id) || !/^(meta\.json|thumb\.png|ch6[4-9]\.png|raw\.cu8|log\.txt)$/.test(f)) { res.writeHead(400).end(); return true; }
    const file = path.join(DIR, id, f);
    if (!existsSync(file)) { res.writeHead(404).end(); return true; }
    const type = f.endsWith(".png") ? "image/png" : f.endsWith(".json") ? "application/json" : f.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    res.writeHead(200, { "content-type": type, "content-length": statSync(file).size, "cache-control": f === "meta.json" ? "no-cache" : "public, max-age=86400",
      ...(f === "raw.cu8" ? { "content-disposition": `attachment; filename="${rawName(id)}"` } : {}) });
    createReadStream(file).pipe(res);
    return true;
  }
  return false;
}
