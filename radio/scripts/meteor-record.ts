// Records and decodes one Meteor pass on the server, started by the scheduler (meteor-rec.ts) a minute before the
// satellite rises. It asks the satellite radio (radio/server.ts on :8074, the HackRF behind the SAWbird on the V-dipole;
// the shared radio on :8073 when that one can't open) for a 240 kHz slice at the satellite's frequency, writes
// the raw 8-bit I/Q to disk (for SatDump), decodes it as it arrives with the same receiver the page uses, and when the
// satellite sets writes small products the page can show without touching the raw file: one grayscale PNG per channel,
// a thumbnail, and meta.json (each row's timing for the map, the report card, a timeline every 5 s).
// Keeps at most one raw file: the newest pass whose picture shows the Earth (pictureQuality).
//
//   node radio/scripts/meteor-record.ts --sat meteor-m2-3 --freq 137.9 --until <ms> --max-el 85 [--id ID]
//   node radio/scripts/meteor-record.ts --file pass.cu8 --fs 240000 --start <ms> --sat meteor-m2-3   (test: a recording as if live)
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { MeteorReceiver, WIDTH, type Channel } from "../src/meteor.ts";
import { spectrumOfIQ } from "../src/waterfall.ts";
import { SignalMeter, pictureQuality } from "../src/meteor-health.ts";
import { tleFor, look, site } from "../../server/sat.ts";
import { prunePasses } from "../../server/meteor-rec.ts";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const SAT = arg("sat") ?? "meteor-m2-3", FREQ = Number(arg("freq") ?? 137.9), FILE = arg("file"), FS = Number(arg("fs") ?? 240000);
const START = FILE ? Number(arg("start") ?? Date.now()) : Date.now(), UNTIL = Number(arg("until") ?? Date.now() + 16 * 60e3), MAX_EL = Number(arg("max-el") ?? 0);
const ID = arg("id") ?? `${new Date(START).toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${SAT}`;
const ROOT = path.resolve(import.meta.dirname, "../.."), DIR = path.join(ROOT, "data", "meteor"), OUT = path.join(DIR, ID);
const CATNR: Record<string, number> = { "meteor-m2-3": 57166, "meteor-m2-4": 59051 };
const HOME = { lat: 40.73, lon: -73.95 }; // the radio server's place (radio/server.ts REF)
const SDR_HOST = process.env.SDR_HOST ?? "127.0.0.1", SAT_SDR = `http://${SDR_HOST}:${process.env.SDR_SAT_PORT ?? 8074}`, SDR = `http://${SDR_HOST}:${process.env.SDR_PORT ?? 8073}`; // the satellite radio, else the shared one
mkdirSync(OUT, { recursive: true });
const log = (m: string) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); writeFileSync(path.join(OUT, "log.txt"), line + "\n", { flag: "a" }); };

const tle = await tleFor(CATNR[SAT]).catch(() => null), here = site(HOME.lat, HOME.lon);
const rx = new MeteorReceiver(FS), meter = new SignalMeter(), raw = createWriteStream(path.join(OUT, "raw.cu8"));
const timeline: Record<string, number>[] = [];
let samples = 0, clipped = 0, nextMark = 0, maxSnr = 0, rawBytes = 0;

/** One chunk of 8-bit I/Q at `now` (ms): to disk, to the decoder, and every 5 s into the timeline. */
function feed(cu8: Uint8Array, now: number) {
  raw.write(cu8); rawBytes += cu8.length;
  const x = new Float32Array(cu8.length);
  for (let i = 0; i < cu8.length; i++) { const v = cu8[i]; x[i] = (v - 127.5) / 127.5; if (v === 0 || v === 255) clipped++; }
  samples += cu8.length / 2;
  rx.push(x); maxSnr = Math.max(maxSnr, meter.push(spectrumOfIQ(x, 512, 8), FS));
  if (now >= nextMark) {
    nextMark = now + 5000;
    const st = rx.stats, el = tle ? look(tle, now, here).el : NaN;
    timeline.push({ t: now, el: +el.toFixed(1), snr: +meter.db.toFixed(2), acquired: +rx.acquired, freqHz: Math.round(st.freqHz), frames: st.frames, rsBad: st.rsBad, images: rx.packets.stats.images, clarity: st.evm > 0 ? +(-10 * Math.log10(st.evm)).toFixed(1) : 0, clipPct: +((100 * clipped) / Math.max(1, 2 * samples)).toFixed(3) });
  }
}

if (FILE) { // a recording replayed as if it were arriving live (for testing the whole chain)
  const fd = openSync(FILE, "r"), size = statSync(FILE).size, buf = Buffer.alloc(240_000 * 2 / 4);
  for (let at = 0; at < size; ) { const n = readSync(fd, buf, 0, buf.length, at); if (!n) break; at += n; feed(new Uint8Array(buf.buffer, buf.byteOffset, n & ~1).slice(), START + (1000 * at) / 2 / FS); }
  closeSync(fd);
} else {
  log(`recording ${SAT} on ${FREQ} MHz until ${new Date(UNTIL).toISOString()} (peak ${MAX_EL}°)`);
  const abort = new AbortController();
  setTimeout(() => abort.abort(), Math.max(1000, UNTIL + 30_000 - Date.now()));
  const slice = (base: string) => fetch(`${base}/api/stream?id=meteor-recorder&center=${Math.round(FREQ * 1e6)}&width=240000&boost=1`, { signal: abort.signal }).catch((e) => { log(`radio server ${base}: ${(e as Error).message}`); return null; });
  let res: Response | null = await slice(SAT_SDR);
  if (res?.ok && res.body) log("on the satellite radio (:8074)");
  else { log(`satellite radio unavailable (${res?.status ?? "no answer"}${res ? `: ${(await res.json().catch(() => ({}))).error ?? ""}` : ""}): using the shared radio`); res = null; }
  for (let attempt = 0; attempt < 4 && !res; attempt++) { // the dongle is shared: if listeners are in the way, free it (the scheduler's promise)
    const r = await slice(SDR);
    if (r?.ok && r.body) { res = r; break; }
    log(`radio busy (${r?.status ?? "no answer"}): freeing the dongle`);
    await fetch(`${SDR}/api/admin/free`, { method: "POST" }).catch(() => {});
    await new Promise((d) => setTimeout(d, 3000));
  }
  if (!res) { log("couldn't get the radio; giving up"); finish(); process.exit(1); }
  log(`streaming at ${res.headers.get("x-sample-rate")} S/s, centered ${res.headers.get("x-center")} Hz`);
  const reader = res.body!.getReader();
  let carry: Uint8Array | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      let v = value; if (carry) { const m = new Uint8Array(carry.length + v.length); m.set(carry); m.set(v, carry.length); v = m; carry = null; }
      if (v.length & 1) { carry = v.slice(-1); v = v.subarray(0, v.length - 1); } // keep I/Q pairs together
      feed(v, Date.now());
    }
  } catch (e) { if ((e as Error).name !== "AbortError") log(`stream stopped: ${(e as Error).message}`); }
}
finish();

// ---------- products ----------
/** An 8-bit grayscale PNG. */
function png(gray: Uint8Array, w: number, h: number) {
  const chunk = (type: string, data: Uint8Array) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, "ascii"); Buffer.from(data).copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const rows = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) rows.set(gray.subarray(y * w, y * w + w), y * (w + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 6 })), chunk("IEND", new Uint8Array())]);
}
function picture(ch: Channel) { const g = new Uint8Array(WIDTH * 8 * ch.rows.length); ch.rows.forEach((r, i) => g.set(r, i * WIDTH * 8)); return { g, w: WIDTH, h: ch.rows.length * 8 }; }

function finish() {
  raw.end();
  const chs = rx.packets.channels, quality = pictureQuality(chs), st = rx.stats;
  const channels: Record<number, { strips: number; rowSeq: number[]; rowMs: number[] }> = {};
  for (const [apid, ch] of chs) {
    const { g, w, h } = picture(ch);
    writeFileSync(path.join(OUT, `ch${apid}.png`), png(g, w, h));
    channels[apid] = { strips: ch.rows.length, rowSeq: ch.rowSeq, rowMs: ch.rowMs };
  }
  const best = chs.get(quality.apid);
  if (best) { // a small preview, 4× smaller each way
    const { g, w, h } = picture(best), tw = w >> 2, th = Math.max(1, h >> 2), t = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) t[y * tw + x] = g[(y * 4) * w + x * 4];
    writeFileSync(path.join(OUT, "thumb.png"), png(t, tw, th));
  }
  const end = FILE ? START + (1000 * samples) / FS : Date.now();
  const meta = {
    id: ID, sat: SAT, freqMHz: FREQ, fs: FS, start: START, end, maxEl: MAX_EL || Math.max(0, ...timeline.map((p) => p.el || 0)), home: HOME,
    stats: { ...st, acquired: rx.acquired, images: rx.packets.stats.images, packets: rx.packets.stats.packets, maxSnr: +maxSnr.toFixed(2), clipPct: +((100 * clipped) / Math.max(1, 2 * samples)).toFixed(3) },
    quality, channels, timeline, raw: { kept: true, bytes: rawBytes },
  };
  // keep three raw files at most: the newest pass whose picture shows the Earth, the newest one that doesn't (for
  // debugging the decoder on real signals), and the strongest (highest meter) so SatDump can be run on the best signal.
  // This pass keeps its raw; an older raw of the same kind is dropped unless it is the strongest.
  const index: any[] = existsSync(path.join(DIR, "index.json")) ? JSON.parse(readFileSync(path.join(DIR, "index.json"), "utf8")) : [];
  const strongest = index.filter((p) => p.rawKept && p.id !== ID).reduce((a, p) => ((p.maxSnr ?? 0) > (a.maxSnr ?? 0) ? p : a), { id: ID, maxSnr: meta.stats.maxSnr });
  for (const p of index.filter((p) => p.rawKept && p.id !== ID && p.id !== strongest.id && Boolean(p.ok) === quality.ok)) {
    rmSync(path.join(DIR, p.id, "raw.cu8"), { force: true }); p.rawKept = false;
    const mf = path.join(DIR, p.id, "meta.json"); if (existsSync(mf)) { const m = JSON.parse(readFileSync(mf, "utf8")); m.raw.kept = false; writeFileSync(mf, JSON.stringify(m)); }
  }
  writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta));
  const summary = { id: ID, sat: SAT, start: START, end, maxEl: meta.maxEl, ok: quality.ok, strips: quality.strips, share: +quality.share.toFixed(3), frames: st.frames, rsBad: st.rsBad, maxSnr: meta.stats.maxSnr, acquired: rx.acquired, channels: Object.keys(channels).map(Number), rawKept: meta.raw.kept };
  writeFileSync(path.join(DIR, "index.json"), JSON.stringify([summary, ...index.filter((p) => p.id !== ID)].sort((a, b) => b.start - a.start)));
  prunePasses(DIR);
  log(`done: ${st.frames} frames, ${rx.packets.stats.images} picture strips, picture ${quality.ok ? "shows the Earth" : "not usable"} (${quality.strips} strips, ${(100 * quality.share).toFixed(0)}% neither black nor white); raw ${meta.raw.kept ? "kept" : "deleted"}`);
}
