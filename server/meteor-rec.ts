// The server's Meteor pass recorder: schedules and serves. Every 20 minutes it computes the next 48 hours of Meteor-M2 3
// and M2 4 passes over the radio server's place and sets a timer for each one that spends a minute or more in the part of
// the sky the antenna hears (the station settings' window); a minute
// before the satellite rises it starts radio/scripts/meteor-record.ts as its own process (so decoding never slows the
// site), which takes the server's dongle until the satellite sets. After a restart mid-pass it records the rest.
// Products live in data/meteor/<id>/ (git-ignored); /api/meteor/passes lists them, /api/meteor/file serves them.
import { spawn } from "node:child_process";
import { existsSync, createReadStream, readFileSync, statSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type http from "node:http";
import { tleFor, passes, look, site, type Tle } from "./sat.ts";
import { settings, saveSettings, cleanSettings, measure, remember, history, latestSaved, passes as passStats, recommend, type RadioCheck } from "./meteor-diag.ts";

const DIR = path.join(import.meta.dirname, "..", "data", "meteor"), SCRIPT = path.join(import.meta.dirname, "..", "radio", "scripts", "meteor-record.ts");
const SATS = [{ id: "meteor-m2-3", catnr: 57166, freq: 137.9 }, { id: "meteor-m2-4", catnr: 59051, freq: 137.9 }];
const HOME = { lat: 40.73, lon: -73.95 }, LEAD_MS = 60_000;
// Where the balcony's V-dipole hears Meteor: the first three passes (2026-10-15/16) only ever had signal with the
// satellite north (azimuth ~350–35°) at 25–55° up; overhead and the southern sky gave nothing, and a 42° pass through the
// south and west gave no frames. So a pass is worth recording for its minutes in this window, not for its peak (user,
// 2026-10-16; was "peaks at 40° or more"). The owner can change the window and the satellites on the station check page
// (radio/meteor-check.html); they're kept in data/meteor/settings.json (meteor-diag.ts).
type Planned = { sat: string; freq: number; rise: number; set: number; maxEl: number; northMin: number };

/** Minutes of a pass the satellite spends inside the recorder's window (sampled every 10 s). */
export function windowMinutes(tle: Tle, rise: number, set: number) {
  const here = site(HOME.lat, HOME.lon), w = settings().window; let n = 0;
  const azIn = (az: number) => (w.azFrom <= w.azTo ? az >= w.azFrom && az <= w.azTo : az >= w.azFrom || az <= w.azTo); // a window may wrap through north
  for (let t = rise; t < set; t += 10_000) { const { el, az } = look(tle, t, here); if (el >= w.minEl && el <= w.maxEl && azIn(az)) n++; }
  return n / 6;
}
// The owner's switch: while it says why, nothing is planned or recorded and the station check doesn't run. "" records again.
export const PAUSED = "Recording is paused: wind broke the antenna's foil reflector (Oct 27).";
const timers = new Map<string, NodeJS.Timeout>();
let upcoming: Planned[] = [], running: { pid: number; sat: string; until: number } | null = null;

function startRecorder(p: Planned) {
  if (!settings().sats[p.sat]) { console.log(`meteor: ${p.sat} is switched off in the station settings`); return; }
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
  const st = settings();
  for (const s of SATS) {
    if (!st.sats[s.id]) continue;
    const tle = await tleFor(s.catnr).catch(() => null); if (!tle) continue;
    for (const p of passes(tle, HOME.lat, HOME.lon, Date.now() - 20 * 60e3, 48, st.window.minEl)) {
      const northMin = windowMinutes(tle, p.rise, p.set);
      if (northMin >= st.window.minutes && p.set > Date.now()) next.push({ sat: s.id, freq: s.freq, rise: p.rise, set: p.set, maxEl: p.maxEl, northMin });
    }
  }
  upcoming = next.sort((a, b) => a.rise - b.rise);
  for (const p of upcoming) {
    const key = `${p.sat}@${Math.round(p.rise / 60e3)}`; if (timers.has(key)) continue;
    timers.set(key, setTimeout(() => startRecorder(p), Math.max(0, p.rise - LEAD_MS - Date.now()))); // in progress already: start now
  }
}

export const PASS_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/** Prunes passes older than keepMs that do not have a usable picture (ok === true) or a kept raw file,
 *  deleting their directories and updating index.json. Also cleans up orphaned pass
 *  directories older than 2 hours. */
export function prunePasses(dir = DIR, now = Date.now(), keepMs = PASS_RETENTION_MS): { kept: number; pruned: number } {
  const indexPath = path.join(dir, "index.json");
  if (!existsSync(indexPath)) return { kept: 0, pruned: 0 };
  let list: any[] = [];
  try {
    list = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!Array.isArray(list)) return { kept: 0, pruned: 0 };
  } catch {
    return { kept: 0, pruned: 0 };
  }

  const kept: any[] = [];
  const prunedIds = new Set<string>();

  for (const p of list) {
    const isRecent = typeof p.start === "number" && (now - p.start) <= keepMs;
    if (p.ok || p.rawKept || isRecent) {
      kept.push(p);
    } else {
      prunedIds.add(p.id);
      rmSync(path.join(dir, p.id), { recursive: true, force: true });
    }
  }

  if (prunedIds.size > 0 || kept.length !== list.length) {
    writeFileSync(indexPath, JSON.stringify(kept));
  }

  // Remove orphaned pass directories older than 2 hours not in kept set
  const keptIds = new Set(kept.map((p) => p.id));
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d{12}-meteor/.test(entry.name)) continue;
      if (keptIds.has(entry.name) || prunedIds.has(entry.name)) continue;
      const passDir = path.join(dir, entry.name);
      try {
        const stat = statSync(passDir);
        if (now - stat.mtimeMs > 2 * 3600 * 1000) {
          rmSync(passDir, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch {}

  return { kept: kept.length, pruned: prunedIds.size };
}

export function startMeteorRecorder() {
  if (PAUSED) return console.log(`meteor: ${PAUSED}`);
  prunePasses();
  plan().catch((e) => console.log(`meteor: planning failed: ${(e as Error).message}`));
  setInterval(() => {
    try { prunePasses(); } catch {}
    plan().catch(() => {});
  }, 20 * 60e3);
  setInterval(() => { if (!busy()) runCheck().catch(() => {}); }, 30 * 60e3); // the station check's history: every 30 min when idle
}

// ---------- the station check (radio/meteor-check.html, meteor-diag.ts) ----------
let latest: RadioCheck | null = latestSaved(), checking: Promise<RadioCheck> | null = null, lastRun = 0;
/** Recording, or a pass starting within 5 minutes: the radio must not be touched. */
const busy = () => (running && Date.now() < running.until + 60_000 ? "a pass is being recorded" : upcoming.some((p) => p.rise - LEAD_MS - Date.now() < 5 * 60e3 && p.set > Date.now()) ? "a pass starts within 5 minutes" : "");
async function runCheck() {
  checking ??= measure().then((c) => { if (c.ok) { latest = c; remember(c); } else if (!latest?.ok) latest = c; return c; }).finally(() => (checking = null));
  lastRun = Date.now();
  return checking;
}
async function checkReport(owner: boolean) {
  const { list, sky } = await passStats(), s = settings(), past = history();
  return {
    latest, history: past.slice(-200).map(({ t, rms, clipPct, margin, inBand, ownFloor }) => ({ t, rms, clipPct, margin, inBand, ownFloor })),
    passes: list, sky, settings: s, recommendations: recommend(latest, list, sky, s, past), owner, busy: busy(),
    upcoming: upcoming.filter((p) => p.set > Date.now()).slice(0, 6), canRunAt: lastRun + 120e3,
  };
}
const send = (res: http.ServerResponse, code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
async function readJson(req: http.IncomingMessage) { let raw = ""; for await (const c of req) { raw += c; if (raw.length > 4000) throw new Error("too long"); } return JSON.parse(raw || "{}"); }

/** GET /api/meteor/check, POST /api/meteor/check/run (anyone, every 2 minutes at most), POST /api/meteor/settings (owner). */
export function meteorCheckApi(url: URL, req: http.IncomingMessage, res: http.ServerResponse, owner: boolean): boolean {
  if (url.pathname === "/api/meteor/check" && req.method === "GET") { checkReport(owner).then((r) => send(res, 200, r), (e) => send(res, 500, { error: (e as Error).message })); return true; }
  if (url.pathname === "/api/meteor/check/run" && req.method === "POST") {
    (async () => {
      const why = busy(); if (why) return send(res, 409, { error: `Not now: ${why}.` });
      if (!checking && Date.now() < lastRun + 120e3) return send(res, 429, { error: "A check ran less than two minutes ago." });
      await runCheck(); send(res, 200, await checkReport(owner));
    })().catch((e) => send(res, 500, { error: (e as Error).message }));
    return true;
  }
  if (url.pathname === "/api/meteor/settings" && req.method === "POST") {
    (async () => {
      if (!owner) return send(res, 403, { error: "Only the station's owner can change its settings." });
      const body = await readJson(req), clean = cleanSettings(body);
      if (typeof clean === "string") return send(res, 400, { error: clean });
      if (body.lna !== undefined || body.vga !== undefined) { // the HackRF's gains for the weather band, amp always off
        const why = busy(); if (why) return send(res, 409, { error: `Gains can't change now: ${why}.` });
        const r = await fetch(`http://${process.env.SDR_HOST ?? "127.0.0.1"}:${process.env.SDR_SAT_PORT ?? 8074}/api/tune`, { method: "POST", body: JSON.stringify({ center: 137.5e6, lna: Number(body.lna), vga: Number(body.vga), amp: false }) });
        if (!r.ok) return send(res, 502, { error: `The radio refused: ${(await r.json().catch(() => ({}))).error ?? r.status}` });
      }
      saveSettings(clean);
      for (const t of timers.values()) clearTimeout(t); timers.clear(); // re-plan with the new window and satellites
      await plan();
      send(res, 200, await checkReport(owner));
    })().catch((e) => send(res, 500, { error: (e as Error).message }));
    return true;
  }
  return false;
}

/** The page's naming (meteor-app.ts reads satellite, start and sample rate back from it): sat-freq-YYYY-MM-DDHHMM-rate. */
const rawName = (id: string) => { const m = id.match(/^(\d{4})(\d{2})(\d{2})(\d{4})-(.+)$/); return m ? `${m[5]}-137.9MHz-${m[1]}-${m[2]}-${m[3]}${m[4]}-240000sps.cu8` : `${id}-240000sps.cu8`; };

/** GET /api/meteor/passes and /api/meteor/file?id=…&f=…; returns false when the URL isn't one of them. */
export function meteorApi(url: URL, res: http.ServerResponse): boolean {
  if (url.pathname === "/api/meteor/passes") {
    try { prunePasses(); } catch {}
    const recorded = existsSync(path.join(DIR, "index.json")) ? JSON.parse(readFileSync(path.join(DIR, "index.json"), "utf8")) : [];
    const now = running && Date.now() < running.until + 60_000 ? running : null;
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ paused: PAUSED || null, window: settings().window, home: HOME, recording: now && { sat: now.sat, until: now.until }, upcoming: upcoming.filter((p) => p.set > Date.now()), recorded }));
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
