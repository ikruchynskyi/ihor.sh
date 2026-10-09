// EDC feed: every 3 hours, read RSS/Atom from knife, flashlight, carry and maker sources and keep each item's title,
// link, date and a short teaser (never article text) in SQLite, from day one. On top, our own analysis: the same story
// across sources grouped together, brands and categories tagged by dictionary, and trends from our archive.
// /edc/ reads it through /api/edc/feed.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const SOURCES = [
  { id: "ttak", name: "The Truth About Knives", kind: "knives", url: "https://www.thetruthaboutknives.com/feed/" },
  { id: "knr", name: "Knife Newsroom", kind: "knives", url: "https://knifenewsroom.com/feed/" },
  { id: "kinf", name: "Knife Informer", kind: "knives", url: "https://knifeinformer.com/feed/" },
  { id: "1lumen", name: "1Lumen", kind: "lights", url: "https://1lumen.com/feed/" },
  { id: "zeroair", name: "ZeroAir", kind: "lights", url: "https://zeroair.org/feed/" },
  { id: "blf", name: "Budget Light Forum", kind: "lights", url: "https://budgetlightforum.com/latest.rss" },
  { id: "carryology", name: "Carryology", kind: "carry", url: "https://www.carryology.com/feed/" },
  { id: "edcom", name: "EverydayCarry.com", kind: "carry", url: "https://everydaycarry.com/rss" },
  { id: "r-edc", name: "r/EDC", kind: "community", url: "https://www.reddit.com/r/EDC/.rss" },
  { id: "r-flashlight", name: "r/flashlight", kind: "community", url: "https://www.reddit.com/r/flashlight/.rss" },
  { id: "r-knives", name: "r/knives", kind: "community", url: "https://www.reddit.com/r/knives/.rss" },
  { id: "r-multitools", name: "r/multitools", kind: "community", url: "https://www.reddit.com/r/multitools/.rss" },
  { id: "hn-show", name: "Show HN", kind: "tools", url: "https://hnrss.org/show?points=20" },
];

// ---------- parsing ----------
// Feeds often escape their HTML (&lt;p&gt;), so entities are decoded before tags are stripped.
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[e as "amp"])
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (block: string, name: string) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
export type Item = { title: string; link: string; published: number; teaser: string };
/** RSS <item>s or Atom <entry>s → items (title, link, date, a 220-character teaser). */
export function parseFeed(xml: string): Item[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return blocks.map((b) => {
    const link = decode(tag(b, "link")) || b.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] || "";
    const when = Date.parse(decode(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")));
    const teaser = decode(tag(b, "description") || tag(b, "summary") || tag(b, "content")).replace(/submitted by .*$/i, "").slice(0, 220);
    return { title: decode(tag(b, "title")), link, published: Number.isFinite(when) ? Math.floor(when / 1000) : 0, teaser };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

// ---------- tagging: our own dictionaries ----------
export const BRANDS = ["Spyderco", "Benchmade", "Kershaw", "Zero Tolerance", "CRKT", "Civivi", "WE Knife", "Kizer", "Chris Reeve", "Buck", "Gerber", "Opinel", "Victorinox", "Leatherman", "SOG", "Cold Steel", "Ka-Bar", "Microtech", "Hinderer", "Boker", "Böker", "ESEE", "Morakniv", "Mora", "Vosteed", "Real Steel", "Olight", "Fenix", "Nitecore", "Zebralight", "Acebeam", "Wurkkos", "Sofirn", "Emisar", "Noctigon", "Hank", "Thrunite", "ThruNite", "Streamlight", "Surefire", "SureFire", "Malkoff", "Convoy", "Lumintop", "Klarus", "Imalent", "Skilhunt", "Armytek", "Rovyvon", "Knipex", "Wera", "Wiha", "Fisher", "Rotring", "Tactile Turn", "Lamy", "Ridge", "Bellroy", "Peak Design", "Aer", "Tom Bihn", "Mystery Ranch", "GoRuck", "G-Shock", "Casio", "Seiko", "Garmin", "Anker", "Flipper Zero"];
const CATS: Record<string, RegExp> = {
  knives: /\b(knife|knives|blade|folder|fixed blade|edc knife|magnacut|s30v|s35vn|m390|20cv|cpm|d2 steel|steel)\b/i,
  lights: /\b(flashlight|torch|lumens?|candela|headlamp|18650|21700|14500|emitter|led)\b/i,
  multitools: /\b(multi-?tools?|pliers|swiss army)\b/i,
  carry: /\b(bag|backpack|wallet|sling|pouch|organizer|edc kit|pocket dump|loadout)\b/i,
  pens: /\b(pen|pens|pencil|notebook|refill)\b/i,
  watches: /\b(watch|watches|g-shock)\b/i,
  tools: /\b(screwdriver|pry ?bar|bit driver|wrench|keychain tool|tape measure)\b/i,
  tech: /\b(power bank|charger|usb-c|battery|batteries|flipper)\b/i,
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RE = BRANDS.map((b) => [b, new RegExp(`(^|[^\\p{L}])${esc(b)}($|[^\\p{L}])`, "iu")] as const);
export function tags(text: string) {
  const brands = [...new Set(BRAND_RE.filter(([, re]) => re.test(text)).map(([b]) => b.replace("Böker", "Boker").replace("ThruNite", "Thrunite").replace("SureFire", "Surefire")))];
  return { brands, cats: Object.keys(CATS).filter((c) => CATS[c].test(text)) };
}

// ---------- clustering: the same story across sources ----------
const STOP = new Set("the a an and or of for to in on with by from at is are new review vs your my this that how what why best".split(" "));
const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n || 1); };
/** Greedy single-pass grouping by title overlap (≥ 0.5 Jaccard, or the same brand plus ≥ 0.34), newest first. */
export function cluster<T extends { title: string; brands: string[]; published: number; source: string }>(items: T[]) {
  const groups: { lead: T; also: T[]; w: Set<string> }[] = [];
  for (const it of [...items].sort((a, b) => b.published - a.published)) {
    const w = words(it.title);
    const g = groups.find((x) => x.lead.source !== it.source && !x.also.some((y) => y.source === it.source) && (jaccard(x.w, w) >= 0.5 || (jaccard(x.w, w) >= 0.34 && x.lead.brands.some((b) => it.brands.includes(b)))));
    if (g) g.also.push(it); else groups.push({ lead: it, also: [], w });
  }
  return groups.map(({ lead, also }) => ({ ...lead, also: also.map((a) => ({ source: a.source, link: a.link, title: a.title })) }));
}

// ---------- the archive ----------
const dir = path.join(import.meta.dirname, "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "edc.db"));
db.exec(`create table if not exists items (link text primary key, source text, title text, published int, first_seen int, teaser text, brands text, cats text);
  create table if not exists polls (source text, at int, ok int, count int, note text);`);
const insert = db.prepare("insert or ignore into items values (?, ?, ?, ?, ?, ?, ?, ?)");
const logPoll = db.prepare("insert into polls values (?, ?, ?, ?, ?)");
const now = () => Math.floor(Date.now() / 1000);

async function poll(src: (typeof SOURCES)[number]) {
  try {
    const r = await fetch(src.url, { headers: { "user-agent": "ihor.sh EDC feed (+https://ihor.sh/edc/)" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseFeed(await r.text()), at = now();
    let added = 0;
    for (const it of items) {
      const t = tags(`${it.title} ${it.teaser}`);
      added += Number(insert.run(it.link, src.id, it.title, it.published || at, at, it.teaser, t.brands.join("|"), t.cats.join("|")).changes);
    }
    logPoll.run(src.id, at, 1, added, `${items.length} in feed`);
  } catch (e) { logPoll.run(src.id, now(), 0, 0, (e as Error).message); }
}
/** One pass over every source. Reddit allows very little, so its feeds are spaced out. */
export async function pollAll() { for (const s of SOURCES) { await poll(s); await new Promise((r) => setTimeout(r, s.id.startsWith("r-") ? 60_000 : 2_000)); } }
export function startEdc() {
  setTimeout(pollAll, 30_000);
  setInterval(pollAll, 3 * 3600_000);
}

/** The page's data: grouped stories for the last `days`, brand trends (30 days vs the 30 before), and source health. */
export function edcFeed(days = 7, cat = "") {
  const since = now() - days * 86400;
  const rows = (db.prepare("select * from items where published >= ? order by published desc limit 800").all(since) as any[])
    .map((r) => ({ title: r.title, link: r.link, source: SOURCES.find((s) => s.id === r.source)?.name ?? r.source, kind: SOURCES.find((s) => s.id === r.source)?.kind ?? "", published: r.published, teaser: r.teaser, brands: r.brands ? r.brands.split("|") : [], cats: r.cats ? r.cats.split("|") : [] }))
    .filter((r) => !cat || r.cats.includes(cat) || r.kind === cat);
  const count = (from: number, to: number) => {
    const m = new Map<string, number>();
    for (const r of db.prepare("select brands from items where published >= ? and published < ? and brands != ''").all(from, to) as any[]) for (const b of r.brands.split("|")) m.set(b, (m.get(b) ?? 0) + 1);
    return m;
  };
  const t = now(), cur = count(t - 30 * 86400, t + 86400), prev = count(t - 60 * 86400, t - 30 * 86400);
  const trends = [...cur].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([brand, n]) => ({ brand, n, before: prev.get(brand) ?? 0 }));
  const first = (db.prepare("select min(first_seen) as f, count(*) as n from items").get() as any);
  const sources = SOURCES.map((s) => { const p = db.prepare("select at, ok, note from polls where source = ? order by at desc limit 1").get(s.id) as any; const n = (db.prepare("select count(*) as n from items where source = ?").get(s.id) as any).n; return { name: s.name, kind: s.kind, url: s.url.replace(/\/(feed|rss)\/?$|\/\.rss$|\/latest\.rss$/, "/"), items: n, last: p ? { at: p.at, ok: !!p.ok, note: p.note } : null }; });
  return { since: first.f, total: first.n, stories: cluster(rows), trends, sources };
}
