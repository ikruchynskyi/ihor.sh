// What's in a street photo: Apple's text recognition on this Mac reads its signs (server/ocr.py, in ~/AI/ocr-venv), the
// lines are grouped into signs, and the signs that name something are matched with Google Places near where the photo
// was taken. The site runs in Docker (Linux), so there the reading goes through host.ts's bridge, like Whisper.
import { spawn } from "node:child_process";
import path from "node:path";

const PY = process.env.OCR_PY ?? "/Users/irishdash/AI/ocr-venv/bin/python";
const SCRIPT = path.join(import.meta.dirname, "ocr.py");
type Line = { text: string; conf: number; box: number[] };
export type Read = { w: number; h: number; gps: [number, number] | null; heading: number | null; lines: Line[] };

/** The photo's text, read here (on the Mac). */
export function readLocal(image: Buffer): Promise<Read> {
  return new Promise((ok, fail) => {
    const p = spawn(PY, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] }), out: Buffer[] = [], err: Buffer[] = [];
    const t = setTimeout(() => p.kill(), 60_000);
    p.stdout.on("data", (c) => out.push(c)); p.stderr.on("data", (c) => err.push(c));
    p.on("error", (e) => { clearTimeout(t); fail(e); }); // no venv: the feature says so, the site stays up
    p.on("close", (code) => { clearTimeout(t); try { ok(JSON.parse(Buffer.concat(out).toString())); } catch { fail(new Error(`text reader failed (${code}): ${Buffer.concat(err).toString().slice(-300)}`)); } });
    p.stdin.end(image);
  });
}
/** The photo's text: through the host bridge when this runs in Docker. */
export async function readPhoto(image: Buffer): Promise<Read> {
  if (!process.env.HOST_BRIDGE) return readLocal(image);
  const r = await fetch(`${process.env.HOST_BRIDGE}/ocr`, { method: "POST", body: image, signal: AbortSignal.timeout(70_000) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `text reader: HTTP ${r.status}`);
  return j;
}

/** Lines into signs: a line joins the one above when they overlap sideways and the gap is under a line's height. */
export function groupSigns(lines: Line[]) {
  const ls = lines.filter((l) => /[a-z]{2}/i.test(l.text)).sort((a, b) => a.box[1] - b.box[1]);
  const signs: { lines: Line[]; box: number[] }[] = [];
  for (const l of ls) {
    const [x1, y1, x2, y2] = l.box;
    const s = signs.find((g) => { const [a1, , a2, b2] = g.box, over = Math.min(a2, x2) - Math.max(a1, x1), last = g.lines.at(-1)!.box, h = Math.max(y2 - y1, last[3] - last[1]);
      const ratio = (y2 - y1) / (last[3] - last[1]); // a different size of letters is a different sign (an ad above a station board)
      return over > 0.3 * Math.min(a2 - a1, x2 - x1) && y1 - b2 < 1.5 * h && y1 >= g.box[1] && ratio < 1.6 && ratio > 1 / 1.6; });
    if (s) { s.lines.push(l); s.box = [Math.min(s.box[0], x1), s.box[1], Math.max(s.box[2], x2), Math.max(s.box[3], y2)]; }
    else signs.push({ lines: [l], box: [...l.box] });
  }
  // a sign printed twice (a station's two boards) reads once; its longest line is what to look up
  const cut = (a: string, b: string) => a.startsWith(b) || b.startsWith(a); // "Cir" is "Circle" cut short
  const fresh = (ls: Line[]) => ls.filter((l, i) => !words(l.text).every((w) => ls.slice(0, i).some((m) => words(m.text).some((v) => cut(w, v)))));
  return signs.map((s) => ({ text: fresh(s.lines).map((l) => l.text).join(" ").replace(/\s+/g, " ").trim(), query: s.lines.reduce((a, l) => (l.text.replace(/[^a-z]/gi, "").length > a.replace(/[^a-z]/gi, "").length ? l.text : a), ""), conf: Math.max(...s.lines.map((l) => l.conf)), box: s.box.map((v) => +Math.min(1, Math.max(0, v)).toFixed(4)) }));
}

// Street furniture, not places: shown, never looked up
const TRAFFIC = /^(do not enter|one way|buses? only|bus lane|no (parking|standing|stopping|turns?|right turn|left turn|entry)|stop|yield|tow.?away( zone)?|keep (right|left)|only|walk|don'?t walk|speed limit.*|exit|entrance|push|pull|open|closed)$/i;
// a cut-off word on a storefront ("phar…", "resta…"): looked up by what it most likely is
const KINDS = ["pharmacy", "museum", "restaurant", "hotel", "bank", "deli", "pizza", "pizzeria", "coffee", "cafe", "market", "supermarket", "theater", "theatre", "bakery", "grill", "library", "church", "school", "hospital", "clinic", "dental", "salon", "laundromat", "liquor", "wine", "bagels", "burger", "sushi", "diner", "fitness", "station", "apartments", "garage", "parking"];
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
const sameWord = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

/** The photo's signs, each with the place it names when one is near (within ~300 m of `at`). */
export async function photoPlaces(image: Buffer, at: { lat: number; lon: number; from: string }) {
  const { searchPlaces } = await import("./nycapi.ts"); // here, not at the top: host.ts loads this file for readLocal only
  const read = await readPhoto(image), where = read.gps ? { lat: read.gps[0], lon: read.gps[1], from: "the photo's location" } : at;
  const signs = groupSigns(read.lines).filter((s) => /[a-z]{3}/i.test(s.text) && (s.conf >= 0.5 || /[a-z]{4}/i.test(s.text))); // "FAR" at 30%: noise
  let lookups = 0;
  const items = await Promise.all(signs.map(async (s) => {
    const text = s.query.replace(/[©®™]/g, "").trim(), ws = [...new Set(words(text))];
    if (TRAFFIC.test(s.text.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim())) return { ...s, kind: "sign" };
    if (!ws.length || ws.length > 5 || lookups >= 6) return { ...s, kind: "text" }; // a slogan, a sentence: not a name
    lookups++;
    const near = (r: any) => r.results.filter((p: any) => p.km <= 0.35);
    const byName = near(await searchPlaces({ what: text, lat: where.lat, lon: where.lon, km: 0.3 }).catch(() => ({ results: [] })))
      .find((p: any) => words(p.name).some((n) => ws.some((w) => sameWord(w, n))));
    if (byName) return { ...s, kind: "place", place: byName };
    // one cut-off word ("phar…"): the nearest places of the kind it starts, as candidates, not one claimed answer
    // (at Columbus Circle the nearest pharmacy was a Walgreens; the sign was a CVS)
    const kind = ws.length === 1 ? KINDS.find((k) => k.startsWith(ws[0]) && k !== ws[0]) : undefined;
    if (kind) {
      const c = near(await searchPlaces({ what: kind, lat: where.lat, lon: where.lon, km: 0.3 }).catch(() => ({ results: [] }))).sort((a: any, b: any) => a.km - b.km).slice(0, 3);
      if (c.length) return { ...s, kind: "maybe", guess: `"${ws[0]}…" is probably a ${kind}: the nearest ones`, candidates: c };
    }
    return { ...s, kind: "text" };
  }));
  return { at: where, heading: read.heading, w: read.w, h: read.h, items };
}
