// Jobs: real, open jobs in New York City, the metro around it (New Jersey included) and remote in the US.
// The source of truth for a job is its employer's own applicant tracking system (Greenhouse, Lever, Ashby): one request
// per company returns every open job, so every company is re-read hourly and a job missing twice in a row is closed.
// NYC's own jobs come from the city's open data. Adzuna adds breadth (daily sweeps), minus gig ads and reposts; a
// listing found only there stays while Adzuna still lists it. Remote boards (Remotive, Himalayas) add remote-US roles.
// Everything is deduplicated (company + title + area, then a fingerprint of the description), and flagged with reasons.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.JOBS_DB ?? path.join(dir, "jobs.db")); // tests: JOBS_DB=:memory:
db.exec(`
  create table if not exists companies (ats text, slug text, name text, added int, last_ok int, last_err text, open int, primary key (ats, slug));
  create table if not exists jobs (id text primary key, source text, company text, ckey text, title text, location text, region text, remote text,
    salary_min real, salary_max real, salary_period text, salary_est int, posted int, url text, department text, employment text, seniority text,
    func text, description text, first_seen int, last_seen int, missed int default 0, closed int, fp text, dup_of text, flags text, also text);
  create index if not exists jobs_open on jobs (closed, dup_of);
  -- the market's scans read these without walking each description's overflow pages (372 → 294 ms on 50k jobs)
  create index if not exists jobs_mk on jobs (dup_of, closed, posted, first_seen, ckey, title, func, seniority, region, remote, source, salary_min, salary_max, salary_period, salary_est, flags, company, id);
  create virtual table if not exists jobs_fts2 using fts5(id unindexed, title, company, body, tokenize = 'porter unicode61'); -- porter: engineers = engineer
  create table if not exists runs (at int, what text, ok int, n int, note text);
  create table if not exists probed (ckey text primary key, at int, found text);
  create table if not exists emb (id text primary key, v blob);
  create table if not exists adz_keys (k text primary key, n int, at int); -- Adzuna ads per company + title (30 days): reposts across runs
  create table if not exists adz_skip (id text primary key, at int); -- Adzuna ads left out (gig, repost), so a later sweep knows them
  create table if not exists guides (at int primary key, body text); -- the weekly hiring context (jobs-ai.ts refreshGuidance)
`);
const now = () => Math.floor(Date.now() / 1000);
const UA = { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)", accept: "application/json" };
const env = (k: string) => process.env[k] ?? "";
const getJson = async (u: string, ms = 30_000, body?: object) => { const r = await fetch(u, { method: body ? "POST" : "GET", headers: body ? { ...UA, "content-type": "application/json" } : UA, body: body && JSON.stringify(body), signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<any>; };
// Workday's Cloudflare answered 429 to every board after a burst (2026-11-16): requests to one platform go one at a time
// at most every `ms` (all its boards share the slot), and a 429 rests that platform for an hour.
const nextSlot = new Map<string, number>(), resting = new Map<string, number>();
const pace = async (ats: string, ms: number) => {
  if ((resting.get(ats) ?? 0) > Date.now()) throw new Error(`HTTP 429 earlier: ${ats} rests until ${new Date(resting.get(ats)!).toISOString().slice(11, 16)} UTC`);
  const t = Math.max(Date.now(), (nextSlot.get(ats) ?? 0) + ms); nextSlot.set(ats, t); await new Promise((r) => setTimeout(r, t - Date.now()));
};
const lastAt = (what: string) => (db.prepare("select max(at) t from runs where what = ?").get(what) as any)?.t ?? 0;

// ---------- understanding a posting ----------
const ENT: Record<string, string> = { nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const entities = (s: string) => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m;
  const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
});
// Greenhouse sends HTML escaped as text, with its own entities escaped again ("&amp;mdash;"): decode, drop tags, decode again
export const stripHtml = (s: string) => entities(entities(s).replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, ""))
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
const NYC = /\b(new york,? ?(ny|n\.y\.|city)|nyc|manhattan|brooklyn|queens|bronx|staten island|long island city|astoria|williamsburg|dumbo)\b/i;
// a bare "New York" means the city when it's the whole place ("New York", "New York, United States"), not "Albany, New York"
const NYC_BARE = /^\s*new york\s*(,\s*(united states|us|usa|u\.s\.))?\s*(\(.*\))?\s*$/i;
const NJ = /\b(jersey city|hoboken|newark|weehawken|secaucus|edison|iselin|woodbridge|morristown|parsippany|paramus|hackensack|fort lee|new brunswick|piscataway|princeton|red bank|short hills|florham park|whippany|east rutherford|bayonne|elizabeth, nj|nj|new jersey)\b/i;
const METRO = /\b(white plains|yonkers|purchase|rye|tarrytown|armonk|harrison, ny|melville|garden city|hauppauge|mineola|uniondale|jericho|great neck|westbury|stamford|greenwich|norwalk|westchester|long island)\b/i;
const NON_US = /\b(philippines|manila|colombia|argentina|chile|peru|costa rica|south africa|nigeria|kenya|egypt|uae|dubai|turkey|ukraine|romania|czech|sweden|italy|switzerland|china|hong kong|taiwan|korea|vietnam|malaysia|indonesia|pakistan|new zealand|canada|uk|united kingdom|london|europe|emea|apac|latam|mexico|brazil|india|germany|france|spain|ireland|netherlands|poland|portugal|singapore|australia|japan|israel|toronto|vancouver|berlin|dublin|amsterdam|paris)\b/i;
const STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
const US_REMOTE = new RegExp(`\\b(united states|usa|us|u\\.s\\.|anywhere in the us|us-remote|north america|${STATES})\\b|,\\s*[A-Z]{2}\\b`, "i");
/** Where a job is, for our scope: "nyc", "nj", "metro", "remote" (US), or null when it's outside it. */
export function region(loc: string, remoteHint = false): string | null {
  const l = loc ?? "", parts = l.split(/;|\|/);
  if (NYC.test(l) || parts.some((x) => NYC_BARE.test(x))) return "nyc";
  if (NJ.test(l)) return "nj";
  if (METRO.test(l)) return "metro";
  const remote = remoteHint || /\bremote\b|anywhere|work from home|distributed/i.test(l);
  // US-remote only when it says so (US, a state), or names no place at all ("Remote"); "Remote, Manila" is not
  const rest = l.replace(/\b(remote|anywhere|work from home|wfh|distributed|hybrid|fully|100%|global|worldwide)\b|[^a-z]+/gi, "");
  if (remote && !NON_US.test(l) && (US_REMOTE.test(l) || rest === "")) return "remote";
  return null;
}
const ST: Record<string, string> = { "new york": "NY", "new jersey": "NJ", connecticut: "CT" };
/** Places as Workday and USAJOBS write them ("New York New York United States", "Jersey City, New Jersey", "US-NY-New
 *  York", "Newark-NJ-USA") in the shape region() reads ("New York, NY"). */
export const usPlace = (s: string) => {
  const t = String(s ?? "").replace(/[-_]+/g, " ").replace(/[,\s]+(united states( of america)?|usa|us)\s*$/i, "").trim(), us = t.match(/^us\s+(ny|nj|ct)\s+(.+)$/i);
  if (us) return `${us[2]}, ${us[1].toUpperCase()}`;
  const m = t.match(/^(.+?),?\s+(new york|new jersey|connecticut)$/i); return m ? `${m[1]}, ${ST[m[2].toLowerCase()]}` : t;
};
export const remoteType = (loc: string, text: string, hint?: string) => {
  const h = (hint ?? "").toLowerCase();
  if (/remote/.test(h)) return "remote"; if (/hybrid/.test(h)) return "hybrid"; if (/on-?site|in-?office|onsite/.test(h)) return "onsite";
  if (/\bremote\b/i.test(loc)) return "remote"; if (/\bhybrid\b/i.test(loc) || /\bhybrid\b/i.test(text.slice(0, 3000))) return "hybrid";
  return "onsite";
};
/** A pay range in text: "$120,000 – $150,000", "$150K-$200K", "$45/hr – $60/hr", "$85,000.00 - $95,000.00", "between
 *  $90,000 and $110,000". Annual or hourly, sanity-checked. */
export function parseSalary(text: string): { min: number; max: number; period: "year" | "hour" } | null {
  const N = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)", HOUR = "(?:\\/\\s?(?:hr|hour)|per hour|an hour)";
  const m = text.replace(/–|—/g, "-").replace(/between\s+(\$\s?[\d,.]+\s?[kK]?)\s+and\s+/gi, "$1 - ")
    .match(new RegExp(`\\$\\s?${N}\\s?([kK])?\\s*${HOUR}?\\s*(?:-|to)\\s*\\$?\\s?${N}\\s?([kK])?(\\s*(?:${HOUR}|hourly))?`));
  if (!m) return null;
  const n = (s: string, k?: string) => parseFloat(s.replace(/,/g, "")) * (k ? 1000 : 1);
  const a = n(m[1], m[2]), b = n(m[3], m[4] ?? m[2]), hourly = !!m[5] || (b < 500 && !m[4]);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  if (hourly ? lo < 7 || hi > 600 : lo < 15000 || hi > 2_000_000) return null;
  return { min: lo, max: hi, period: hourly ? "hour" : "year" };
}
export const seniority = (t: string) => /\bintern(ship)?\b|co-?op\b/i.test(t) ? "intern" : /\b(junior|jr\.?|entry|associate|graduate|new grad|apprentice)\b/i.test(t) ? "junior"
  : /\b(vp|vice president|chief|head of|cto|cfo|ceo|coo|svp|evp)\b/i.test(t) ? "executive" : /\bdirector\b/i.test(t) ? "director"
  : /\b(manager|lead|supervisor)\b/i.test(t) ? "manager" : /\b(staff|principal|distinguished|architect)\b/i.test(t) ? "staff"
  : /\b(senior|sr\.?|iii|iv)\b/i.test(t) ? "senior" : "mid";
const FUNCS: [string, RegExp][] = [["engineering", /engineer|developer|devops|sre\b|software|platform|infrastructure|security|qa\b|test automation|firmware|mobile|ios|android/i],
  ["data", /data|analytics|analyst|machine learning|\bml\b|\bai\b|scientist|quant/i], ["design", /design|ux|ui\b|creative|art director/i], ["product", /product manager|product owner|\bpm\b|program manager/i],
  ["sales", /sales|account executive|business development|\bbdr\b|\bsdr\b|account manager/i], ["marketing", /marketing|growth|brand|content|seo|communications|\bpr\b|social media/i],
  ["finance", /financ|accountant|accounting|controller|tax|audit|treasury|fp&a|investment|trader|trading|portfolio/i], ["legal", /legal|counsel|attorney|paralegal|compliance/i],
  ["people", /recruit|talent|people|human resources|\bhr\b/i], ["support", /support|customer success|customer service|client service|help desk/i],
  ["operations", /operations|ops\b|logistics|supply chain|procurement|facilities|office manager/i], ["health", /nurse|physician|clinical|medical|therap|pharmac|health|counselor|social worker/i],
  ["education", /teacher|instructor|tutor|education|professor/i]];
export const func = (title: string, dept = "") => FUNCS.find(([, re]) => re.test(title))?.[0] ?? FUNCS.find(([, re]) => re.test(dept))?.[0] ?? "other";

// User rule for aggregator listings: no gig ads (platform side-hustles), no reposts.
const GIG_CO = /instacart|doordash|uber|lyft|amazon flex|spark driver|shipt|grubhub|roadie|taskrabbit|gopuff|postmates|caviar|favor delivery|veho|dolly|wag!?|rover|care\.com/i;
const GIG_TEXT = /\b(be your own boss|earn cash|earn up to|sign up (today|now)|independent contractor|set your own (hours|schedule)|flexible hours.*(earn|cash)|get paid (weekly|daily|instantly)|side hustle|delivery driver|shopper)\b/i;
export const isGig = (company: string, title: string, text: string) => GIG_CO.test(company) || GIG_TEXT.test(`${title} ${text}`);
const STAFFING = /\b(robert half|insight global|teksystems|kforce|randstad|adecco|aerotek|cybercoders|hunter bond|harnham|motion recruitment|apex systems|beacon hill|jobot|collabera|hays|michael page|aston carter|actalent|vaco|creative circle|the judge group|addison group|staffing|recruitment|recruiting|talent partners)\b/i;

/** Reasons a listing deserves a second look. Each flag is shown with its reason; none of them hides a job by itself. */
export function flagsFor(j: { company: string; title: string; description: string; region: string | null; salary_min: number | null; posted: number | null; url: string; source: string; first_seen?: number }) {
  const f: string[] = [], text = `${j.title}\n${j.description}`, age = (now() - (j.posted ?? j.first_seen ?? now())) / 86400;
  if (age > 60) f.push(`open ${Math.round(age)} days`);
  if (/evergreen|talent (pool|community|network)|general (application|interest)|future (opportunities|openings)|always (hiring|looking)/i.test(text)) f.push("evergreen / talent-pool posting");
  if (j.region !== "remote" && j.salary_min == null && j.source !== "adzuna") f.push("no salary range (NYC law requires one)");
  if (/telegram|whatsapp|signal app|text us at|send your (bank|ssn)|check deposit|purchase (your own )?equipment|upfront (fee|payment)|training fee/i.test(text)) f.push("scam signs (chat apps, upfront money)");
  if (/@(gmail|yahoo|hotmail|outlook|aol)\.com/i.test(text)) f.push("personal email to apply");
  if (STAFFING.test(j.company)) f.push("staffing agency, not the employer");
  if (/commission[- ]only|100% commission|uncapped commission|unlimited (earning|income) potential|free (licensing|training).*(insurance|life)|life insurance agent|financial (freedom|independence)|be your own boss|(mlm|network marketing)/i.test(text)) f.push("commission-only or agent-recruiting ad");
  if (j.salary_min != null && (j as any).salary_max != null && (j as any).salary_max > 4 * j.salary_min) f.push("very wide pay range");
  return f;
}

// near-duplicate detection: a 64-bit SimHash of the description's word triples
const fnv = (s: string) => { let h = 0xcbf29ce484222325n; for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; } return h; };
export function simhash(text: string) {
  const w = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((x) => x.length > 2), v = new Array(64).fill(0);
  for (let i = 0; i + 2 < w.length && i < 4000; i++) { const h = fnv(`${w[i]} ${w[i + 1]} ${w[i + 2]}`); for (let b = 0; b < 64; b++) v[b] += (h >> BigInt(b)) & 1n ? 1 : -1; }
  let out = 0n; v.forEach((x, b) => { if (x > 0) out |= 1n << BigInt(b); });
  return out.toString(16).padStart(16, "0");
}
export const hamming = (a: string, b: string) => { let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (x) { x &= x - 1n; n++; } return n; };
export const ckey = (company: string) => company.toLowerCase().replace(/&/g, "and").replace(/\b(inc|llc|ltd|corp|corporation|co|company|the|group|holdings|technologies|technology|labs)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
// a title's key: "Sr. Data Engineer (Remote)" and "Senior Data Engineer" are one
const ABBR: Record<string, string> = { sr: "senior", jr: "junior", mgr: "manager", eng: "engineer", engr: "engineer", dev: "developer", assoc: "associate", asst: "assistant", admin: "administrator", rep: "representative", vp: "vice president" };
const tkey = (title: string) => title.toLowerCase().replace(/&/g, " and ").replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\b[a-z]+\b/g, (w) => ABBR[w] ?? w);
/** One company under two names: the same key, or one key that is the other plus corporate words ("citi" / "citibank",
 *  "anthropic" / "anthropiclimited"; never "meta" / "metabolix"). Only used with the same title in the same area. */
const TAIL = /^(bank|na|limited|ltd|inc|llc|plc|llp|financial|group|corporation|corp|company|co|holdings?|global|international|usa?|america|services|solutions|systems|travel|division|health|healthcare|technolog(y|ies)|labs?|partners|ag|sa|nv|gmbh)+$/;
export const sameCompany = (a: string, b: string) => { const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return a === b || (s.length >= 4 && l.startsWith(s) && TAIL.test(l.slice(s.length))); };

// ---------- storing ----------
type In = { known?: boolean; regionHint?: string; id: string; source: string; company: string; title: string; location: string; remoteHint?: string; isRemote?: boolean; salary?: { min: number; max: number; period: string } | null; salaryEst?: boolean; posted?: number | null; url: string; department?: string; employment?: string; description: string };
const upsert = db.prepare(`insert into jobs (id, source, company, ckey, title, location, region, remote, salary_min, salary_max, salary_period, salary_est, posted, url, department, employment, seniority, func, description, first_seen, last_seen, missed, closed, fp, flags)
  values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,null,?,?) on conflict(id) do update set title=excluded.title, location=excluded.location, region=excluded.region, remote=excluded.remote,
  salary_min=excluded.salary_min, salary_max=excluded.salary_max, salary_period=excluded.salary_period, salary_est=excluded.salary_est, url=excluded.url, department=excluded.department,
  employment=excluded.employment, seniority=excluded.seniority, func=excluded.func, description=excluded.description, last_seen=excluded.last_seen, missed=0, closed=null, fp=excluded.fp, flags=excluded.flags`);
const ftsDel = db.prepare("delete from jobs_fts2 where id = ?"), ftsAdd = db.prepare("insert into jobs_fts2 (id, title, company, body) values (?,?,?,?)");
if (!(db.prepare("select count(*) n from jobs_fts2").get() as any).n) { // first start with the stemming index: fill it from the jobs
  for (const r of db.prepare("select id, title, company, description from jobs").all() as any[]) ftsAdd.run(r.id, r.title, r.company, String(r.description ?? "").slice(0, 8000));
  db.exec("drop table if exists jobs_fts");
}
// A job seen again unchanged (most of them, every hour) only gets its last_seen: rewriting every row and its search
// entry, each in its own commit, kept the server's CPU at ~90% for minutes after each start and each hour (2026-11-14).
const known = db.prepare("select fp, title, location, url, closed from jobs where id = ?"), touch = db.prepare("update jobs set last_seen = ?, missed = 0 where id = ?");
/** Runs fn in one transaction (one commit for a whole board instead of one per statement). fn must not await. */
function batch<T>(fn: () => T): T {
  db.exec("begin");
  try { const out = fn(); db.exec("commit"); return out; } catch (e) { db.exec("rollback"); throw e; }
}
// 2026-11-16: "$200,000&mdash;$265,000" (see stripHtml) and two more pay formats went unread, so ~1,700 open jobs showed no pay
// and a "no salary" flag. Unchanged jobs are never read again, so stored ones are repaired here (a few ms per start).
const repaired = db.prepare("update jobs set description = ?, salary_min = ?, salary_max = ?, salary_period = ?, flags = ? where id = ?");
batch(() => { for (const r of db.prepare("select * from jobs where closed is null and salary_min is null and description like '%$%'").all() as any[]) {
  const d = entities(r.description), sal = parseSalary(d);
  if (sal || d !== r.description) repaired.run(d, sal?.min ?? null, sal?.max ?? null, sal?.period ?? null, JSON.stringify(flagsFor({ ...r, description: d, salary_min: sal?.min ?? null, salary_max: sal?.max ?? null })), r.id);
} });
function save(j: In) {
  const reg = j.regionHint ?? region(j.location, j.isRemote);
  if (!reg) return false;
  const desc = j.description.slice(0, 20000), t = now(), fp = simhash(desc), prev = known.get(j.id) as any;
  if (prev && prev.closed == null && prev.fp === fp && prev.title === j.title.trim() && prev.location === j.location.slice(0, 200) && prev.url === j.url) { touch.run(t, j.id); return true; }
  const given = j.salary && j.salary.min > 0 ? j.salary : null, sal = given ?? parseSalary(desc);
  const posted = j.posted ? Math.floor(j.posted / 1000) : null;
  const row = { company: j.company, title: j.title, description: desc, region: reg, salary_min: sal?.min ?? null, salary_max: sal?.max ?? null, posted, url: j.url, source: j.source, first_seen: t };
  upsert.run(j.id, j.source, j.company, ckey(j.company), j.title.trim(), j.location.slice(0, 200), reg, remoteType(j.location, desc, j.remoteHint ?? (j.isRemote ? "remote" : "")),
    sal?.min ?? null, sal?.max ?? null, sal?.period ?? null, j.salaryEst ? 1 : 0, posted, j.url, j.department ?? "", j.employment ?? "", seniority(j.title), func(j.title, j.department), desc, t, t, fp, JSON.stringify(flagsFor(row)));
  ftsDel.run(j.id); ftsAdd.run(j.id, j.title, j.company, desc.slice(0, 8000));
  return true;
}
/** After reading a whole source, everything of it not seen this time is one miss closer to closed (two misses close it). */
function sweep(source: string, seenIds: Set<string>, prefix: string) {
  const open = db.prepare("select id from jobs where source = ? and id like ? and closed is null").all(source, `${prefix}%`) as { id: string }[];
  for (const { id } of open) if (!seenIds.has(id)) db.prepare("update jobs set missed = missed + 1, closed = case when missed + 1 >= 2 then ? else null end where id = ?").run(now(), id);
}

// ---------- sources ----------
const SEED: [string, string][] = JSON.parse(`[["greenhouse","stripe"],["greenhouse","oscar"],["greenhouse","datadog"],["greenhouse","brex"],["greenhouse","coinbase"],["greenhouse","affirm"],["ashby","ramp"],["greenhouse","twilio"],["greenhouse","pinterest"],["greenhouse","hellofresh"],["greenhouse","instacart"],["ashby","plaid"],["greenhouse","elastic"],["greenhouse","point72"],["greenhouse","janestreet"],["greenhouse","figma"],["greenhouse","airbnb"],["ashby","notion"],["ashby","headway"],["greenhouse","ripple"],["greenhouse","justworks"],["greenhouse","robinhood"],["greenhouse","mercury"],["greenhouse","braze"],["greenhouse","chime"],["greenhouse","mongodb"],["greenhouse","via"],["greenhouse","fanduel"],["greenhouse","zocdoc"],["greenhouse","clear"],["greenhouse","vercel"],["greenhouse","hearst"],["lever","spotify"],["ashby","hex"],["greenhouse","duolingo"],["greenhouse","schonfeld"],["greenhouse","seatgeek"],["lever","ro"],["greenhouse","dropbox"],["greenhouse","gemini"],["greenhouse","okta"],["ashby","kayak"],["greenhouse","axios"],["greenhouse","betterment"],["greenhouse","talkspace"],["greenhouse","squarespace"],["ashby","amplitude"],["greenhouse","newrelic"],["greenhouse","lyft"],["greenhouse","peloton"],["lever","anchorage"],["greenhouse","taboola"],["greenhouse","attentive"],["ashby","hopper"],["ashby","lemonade"],["ashby","paxos"],["ashby","substack"],["greenhouse","ziprecruiter"],["greenhouse","voxmedia"],["greenhouse","virtu"],["greenhouse","convene"],["greenhouse","cockroachlabs"],["ashby","industrious"],["greenhouse","harrys"],["greenhouse","mejuri"],["lever","wealthfront"],["greenhouse","asana"],["lever","theathletic"],["ashby","titan"],["greenhouse","pagerduty"],["ashby","patreon"],["ashby","acorns"],["greenhouse","consensys"],["greenhouse","sweetgreen"],["ashby","capsule"],["greenhouse","discord"],["greenhouse","glossier"],["greenhouse","modernhealth"],["ashby","ledger"],["ashby","away"],["greenhouse","insider"],["ashby","brooklinen"],["greenhouse","yext"],["greenhouse","greenhouse"],["ashby","column"],["lever","nomihealth"],["greenhouse","tripadvisor"],["ashby","sonder"],["greenhouse","thirdlove"],["greenhouse","everlane"],["greenhouse","flatironhealth"],["greenhouse","airtable"],["greenhouse","a24"],["greenhouse","misfitsmarket"],["greenhouse","kickstarter"]]`);
for (const [ats, slug] of SEED) db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now());
const PREFIX: Record<string, string> = { greenhouse: "gh", lever: "lv", ashby: "ab", smartrecruiters: "sr", workable: "wk", workday: "wd" }; // job ids are <prefix>:<slug>:<id>
// Workday boards can't be found from a company's name (the host, number and site differ), so these are listed by hand:
// big NYC-area employers whose boards answered on 2026-11-16. slug = tenant|wdN|site.
const WORKDAY: [string, string][] = [["citi|5|2", "Citi"], ["ms|5|External", "Morgan Stanley"], ["pfizer|1|PfizerCareers", "Pfizer"], ["mastercard|1|CorporateCareers", "Mastercard"], ["nasdaq|1|Global_External_Site", "Nasdaq"],
  ["spgi|5|SPGI_Careers", "S&P Global"], ["jj|5|JJ", "Johnson & Johnson"], ["msd|5|SearchJobs", "Merck"], ["bristolmyerssquibb|5|BMS", "Bristol Myers Squibb"], ["pru|5|Careers", "Prudential"], ["blackstone|1|Blackstone_Careers", "Blackstone"],
  ["att|1|ATTGeneral", "AT&T"], ["salesforce|12|External_Career_Site", "Salesforce"], ["verizon|12|verizon-careers", "Verizon"], ["nvidia|5|NVIDIAExternalCareerSite", "NVIDIA"], ["target|5|targetcareers", "Target"]];
for (const [slug, name] of WORKDAY) db.prepare("insert or ignore into companies (ats, slug, name, added) values ('workday', ?, ?, ?)").run(slug, name, now());
for (const [ats, slug] of [["smartrecruiters", "Equinox"], ["workable", "huggingface"]]) db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now());
const BOARD_NAME = new Map(WORKDAY);
/** Every facet value on a Workday board, nested ones too: { p: its parameter, d: what it says, id }. */
const wdFacets = (fs: any[], p = ""): { p: string; d: string; id: string }[] => (fs ?? []).flatMap((f) => (f.values ?? []).flatMap((v: any) => (v.values ? wdFacets([v], v.facetParameter ?? f.facetParameter) : [{ p: f.facetParameter ?? p, d: String(v.descriptor ?? ""), id: v.id }])));
const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, a, b) => `${a ? " " : ""}${b.toUpperCase()}`);

/** One employer board's jobs. known(id): a job stored and open already, so a board that needs a request per job for its
 *  description (SmartRecruiters, Workday) only lists it; discover() passes () => true to read the lists alone. */
async function readBoard(ats: string, slug: string, known: (id: string) => boolean = (id) => !!openIds.get(id)): Promise<In[]> {
  const brief = (id: string, company: string, location: string, isRemote = false): In => ({ known: true, id, source: ats, company, title: "", location, isRemote, url: "", description: "" });
  if (ats === "workable") {
    const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`);
    return (d.jobs ?? []).map((j: any) => ({ id: `wk:${slug}:${j.shortcode}`, source: "workable", company: d.name ?? titleCase(slug), title: j.title,
      location: (j.locations?.length ? j.locations : [j]).map((l: any) => [l.city, ST[String(l.region ?? l.state ?? "").toLowerCase()] ?? l.region ?? l.state, l.country === "United States" || l.country_code === "US" ? "" : l.country].filter(Boolean).join(", ")).join("; "),
      isRemote: !!j.telecommuting && /united states|^us$/i.test(j.country ?? j.locations?.[0]?.country ?? ""), posted: Date.parse(j.published_on ?? j.created_at), url: j.url ?? j.application_url,
      department: j.department ?? "", employment: j.employment_type ?? "", description: stripHtml(j.description ?? "") }));
  }
  if (ats === "smartrecruiters") { // the list is filtered to NY, NJ and CT by SmartRecruiters; a description costs one request
    const out: In[] = [];
    for (const st of ["NY", "NJ", "CT"]) for (let off = 0; off < 1000; off += 100) {
      await pace(ats, 500); const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${off}&country=us&region=${st}`);
      for (const p of d.content ?? []) {
        const id = `sr:${slug}:${p.id}`, loc = `${p.location?.city ?? ""}, ${p.location?.region ?? st}`;
        if (!region(loc)) continue;
        if (known(id)) { out.push(brief(id, p.company?.name ?? slug, loc)); continue; }
        if (out.filter((j) => !j.known).length >= 100) continue; // the rest next time
        await pace(ats, 500); const j = await getJson(p.ref).catch(() => null); if (!j) continue;
        out.push({ id, source: "smartrecruiters", company: j.company?.name ?? slug, title: j.name, location: loc, remoteHint: p.location?.remote ? "remote" : p.location?.hybrid ? "hybrid" : "", posted: Date.parse(j.releasedDate), url: j.postingUrl ?? j.applyUrl,
          department: j.department?.label ?? j.function?.label ?? "", employment: j.typeOfEmployment?.label ?? "", description: stripHtml(Object.values(j.jobAd?.sections ?? {}).map((x: any) => `${x.title ?? ""}\n${x.text ?? ""}`).join("\n\n")) });
      }
      if ((d.content ?? []).length < 100) break;
    }
    return out;
  }
  if (ats === "workday") { // asked only for the board's places in our area (its own location facets); a description costs one request
    const [tenant, n, site] = slug.split("|"), base = `https://${tenant}.wd${n}.myworkdayjobs.com/wday/cxs/${tenant}/${site}`, company = BOARD_NAME.get(slug) ?? titleCase(tenant);
    await pace(ats, 1500); const vals = wdFacets((await getJson(`${base}/jobs`, 30_000, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" })).facets);
    const places = vals.filter((v) => v.p === "locations" && ["nyc", "nj", "metro"].includes(region(usPlace(v.d)) ?? "")), states = vals.filter((v) => /^(new york|new jersey|connecticut)$/i.test(v.d.trim()));
    const pick = places.length ? places : states; if (!pick.length) return [];
    const facets = { [pick[0].p]: pick.filter((v) => v.p === pick[0].p).map((v) => v.id) }, out: In[] = [];
    for (let off = 0; off < 2000; off += 20) {
      await pace(ats, 1500); const d = await getJson(`${base}/jobs`, 30_000, { appliedFacets: facets, limit: 20, offset: off, searchText: "" });
      for (const p of d.jobPostings ?? []) {
        const id = `wd:${slug}:${String(p.externalPath).split("/").pop()}`, loc = usPlace(p.locationsText ?? ""), many = /^\d+ locations$/i.test(loc);
        if (!many && !region(loc)) continue;
        if (known(id)) { out.push(brief(id, company, many ? "New York, NY" : loc)); continue; }
        if (out.filter((j) => !j.known).length >= 100) continue; // the rest next time
        await pace(ats, 1500); const i = (await getJson(`${base}${p.externalPath}`).catch((e) => { if (/429/.test(e.message)) throw e; return null; }))?.jobPostingInfo; if (!i) continue;
        out.push({ id, source: "workday", company, title: i.title, location: [i.location, ...(i.additionalLocations ?? [])].map(usPlace).join("; "), remoteHint: i.remoteType ?? "", posted: Date.parse(i.startDate),
          url: i.externalUrl, employment: i.timeType ?? "", description: stripHtml(i.jobDescription ?? "") });
      }
      if ((d.jobPostings ?? []).length < 20) break;
    }
    return out;
  }
  if (ats === "greenhouse") {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return d.jobs.map((j: any) => { const desc = stripHtml(j.content ?? "");
      return { id: `gh:${slug}:${j.id}`, source: "greenhouse", company: j.company_name || titleCase(slug), title: j.title, location: [j.location?.name, ...(j.offices ?? []).map((o: any) => o.name)].filter(Boolean).join("; "),
        posted: Date.parse(j.first_published ?? j.updated_at), url: j.absolute_url, department: j.departments?.[0]?.name ?? "", description: `${desc}${/evergreen/i.test(j.requisition_id ?? "") ? "\n(requisition: evergreen)" : ""}` }; });
  }
  if (ats === "lever") {
    const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return d.map((j: any) => { const sr = j.salaryRange, desc = [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${stripHtml(l.content ?? "")}`), j.additionalPlain].filter(Boolean).join("\n\n");
      return { id: `lv:${slug}:${j.id}`, source: "lever", company: titleCase(slug), title: j.text, location: [j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean).join("; "), remoteHint: j.workplaceType,
        salary: sr?.min ? { min: sr.min, max: sr.max ?? sr.min, period: /hour/i.test(sr.interval ?? "") ? "hour" : "year" } : null, posted: j.createdAt, url: j.hostedUrl, department: j.categories?.team ?? j.categories?.department ?? "", employment: j.categories?.commitment ?? "", description: desc }; });
  }
  if (ats === "ashby") {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
    return d.jobs.filter((j: any) => j.isListed !== false).map((j: any) => {
      const comp = j.compensation?.summaryComponents?.find((c: any) => c.compensationType === "Salary") ?? null;
      return { id: `ab:${slug}:${j.id}`, source: "ashby", company: d.organizationName ?? titleCase(slug), title: j.title, location: [j.location, ...(j.secondaryLocations ?? []).map((l: any) => l.location)].filter(Boolean).join("; "),
        remoteHint: j.workplaceType, isRemote: j.isRemote && !/hybrid|onsite/i.test(j.workplaceType ?? ""), posted: Date.parse(j.publishedAt), url: j.jobUrl, department: j.department ?? "", employment: j.employmentType ?? "",
        salary: parseSalary(j.compensation?.scrapeableCompensationSalarySummary ?? "") ?? (comp?.minValue && comp.minValue > 1000 ? { min: comp.minValue, max: comp.maxValue ?? comp.minValue, period: /hour/i.test(comp.interval ?? "") ? "hour" : "year" } : null),
        description: j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? "") }; });
  }
  return [];
}

const openIds = db.prepare("select 1 from jobs where id = ? and closed is null");
/** Re-read companies' boards (these ATSes): new and changed jobs saved, missing ones a step closer to closed. */
export async function refreshBoards(atses = ["greenhouse", "lever", "ashby", "workable"], what = "boards") {
  const list = db.prepare(`select ats, slug from companies where ats in (${atses.map(() => "?").join(",")})`).all(...atses) as { ats: string; slug: string }[];
  let n = 0, bad = 0;
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(async ({ ats, slug }) => {
    try {
      const jobs = await readBoard(ats, slug), seen = new Set<string>();
      batch(() => {
        for (const j of jobs) if (j.known ? (touch.run(now(), j.id), true) : save(j)) { seen.add(j.id); n++; }
        sweep(ats, seen, `${PREFIX[ats]}:${slug}:`);
        db.prepare("update companies set name = coalesce(?, name), last_ok = ?, last_err = null, open = ? where ats = ? and slug = ?").run(jobs[0]?.company ?? null, now(), seen.size, ats, slug);
      });
    } catch (e) { bad++; if (/HTTP 429$/.test((e as Error).message)) resting.set(ats, Date.now() + 3600_000); db.prepare("update companies set last_err = ? where ats = ? and slug = ?").run((e as Error).message, ats, slug); }
  }));
  // a run where most boards failed (a platform resting after a 429) isn't a run: the next hourly tick tries again
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), bad > list.length / 2 ? `${what}-failed` : what, bad ? 0 : 1, n, `${list.length} boards, ${bad} failed`);
  return { boards: list.length, failed: bad, jobs: n };
}

/** NYC government jobs (the city's open data; External postings only, Internal ones repeat them). */
export async function refreshNycJobs() {
  const rows = await getJson("https://data.cityofnewyork.us/resource/kpav-sd4t.json?$limit=5000&posting_type=External", 60_000), seen = new Set<string>();
  batch(() => { for (const r of rows) {
    const id = `nyc:${r.job_id}`, per = /hour/i.test(r.salary_frequency) ? "hour" : /day/i.test(r.salary_frequency) ? "day" : "year";
    const ok = save({ id, source: "nycjobs", company: `NYC ${titleCase(String(r.agency ?? "").toLowerCase())}`, title: r.business_title, location: `${r.work_location ?? ""}, New York, NY`,
      salary: r.salary_range_from && per !== "day" ? { min: +r.salary_range_from, max: +(r.salary_range_to ?? r.salary_range_from), period: per } : null, posted: Date.parse(r.posting_date), url: `https://cityjobs.nyc.gov/job/${r.job_id}`,
      department: r.job_category ?? "", employment: r.full_time_part_time_indicator === "P" ? "Part-time" : "Full-time",
      description: [r.job_description, r.minimum_qual_requirements && `Minimum qualifications:\n${r.minimum_qual_requirements}`, r.preferred_skills && `Preferred skills:\n${r.preferred_skills}`, r.residency_requirement].filter(Boolean).join("\n\n") });
    if (ok) seen.add(id);
  } sweep("nycjobs", seen, "nyc:"); });
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "nycjobs", 1, seen.size, "");
  return { jobs: seen.size };
}

// Adzuna's trial plan is 2,500 calls a month (user, 2026-11-16). ADZUNA_MONTHLY_CALLS (default 2,300, a margin) is spent
// evenly: NYC newest first every 2 hours, stopping at a page we already have; remote US every 6 hours. Before, one daily
// burst read the 1,000 newest (about 4 hours of the ~6,600 NYC postings a day) and dropped each a week later.
// NYC 12 sweeps a day of ADZ_NYC pages, remote 4 of ADZ_REMOTE: 12 × 5 + 4 × 3 = 72 calls a day, 2,232 in a 31-day month.
const ADZ_MONTH = Number(env("ADZUNA_MONTHLY_CALLS")) || 2300, ADZ_REMOTE = 3, ADZ_NYC = Math.max(1, Math.floor((ADZ_MONTH / 31 - 4 * ADZ_REMOTE) / 12));
const adzCalls = () => { const d = new Date(); return (db.prepare("select coalesce(sum(n), 0) n from runs where what = 'adzuna-calls' and at >= ?").get(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)) as any).n as number; };
const adzKey = db.prepare("select n from adz_keys where k = ?"), adzCount = db.prepare("insert into adz_keys values (?, 1, ?) on conflict(k) do update set n = n + 1");
const adzSkipped = db.prepare("select 1 from adz_skip where id = ?"), adzSkip = db.prepare("insert or ignore into adz_skip values (?, ?)");
/** One Adzuna sweep (nyc: within 40 km of NYC; remote: US), newest first. Gig ads never get in; neither do reposts: the
 *  same company and title already open from any source, or one ad copied to more than 5 towns (then all copies go). */
export async function refreshAdzuna(which: "nyc" | "remote", pages = which === "nyc" ? ADZ_NYC : ADZ_REMOTE) {
  const id = env("ADZUNA_APP_ID"), key = env("ADZUNA_APP_KEY");
  if (!id || !key) return { error: "no Adzuna key" };
  const left = ADZ_MONTH - adzCalls(); if (left <= 0) return { error: "Adzuna's monthly calls are used up" };
  let n = 0, gig = 0, repost = 0, calls = 0; const mass = new Set<string>();
  for (let p = 1; p <= Math.min(pages, left); p++) {
    const u = `https://api.adzuna.com/v1/api/jobs/us/search/${p}?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=30&sort_by=date${which === "nyc" ? `&where=${encodeURIComponent("New York, NY")}&distance=40` : "&what=remote&where=United%20States"}&content-type=application/json`;
    let d: any; calls++; try { d = await getJson(u); } catch { break; }
    if (!d.results?.length) break;
    let fresh = 0;
    batch(() => { for (const r of d.results) {
      const jid = `az:${r.id}`, company = r.company?.display_name ?? "", title = r.title ?? "", text = r.description ?? "", k = `${ckey(company)}|${tkey(title)}`;
      const prev = known.get(jid) as any, isNew = !prev && !adzSkipped.get(jid);
      if (prev?.closed || (!prev && !isNew)) continue; // one we closed (expired, or a copy we hid) or left out before
      if (isNew) {
        fresh++;
        if (isGig(company, title, text)) { gig++; adzSkip.run(jid, now()); continue; }
        const copies = (adzKey.get(k) as any)?.n ?? 0; adzCount.run(k, now());
        if (copies >= 5) { mass.add(k); repost++; adzSkip.run(jid, now()); continue; }
        if (db.prepare("select 1 from jobs where ckey = ? and lower(title) = lower(?) and closed is null and id != ?").get(ckey(company), title, jid)) { repost++; adzSkip.run(jid, now()); continue; }
      }
      const area: string[] = r.location?.area ?? [], nycCounty = /^(new york|kings|queens|bronx|richmond) county$/i.test(area[2] ?? "");
      const regionHint = which === "remote" ? undefined : area[1] === "New Jersey" ? "nj" : nycCounty || /^new york( city)?$/i.test(area[2] ?? "") ? "nyc" : "metro"; // the search was within 40 km of NYC
      if (save({ regionHint, id: jid, source: "adzuna", company, title, location: which === "remote" ? `Remote, ${r.location?.display_name ?? "United States"}` : r.location?.display_name ?? "New York, NY",
        isRemote: which === "remote", salary: r.salary_min ? { min: r.salary_min, max: r.salary_max ?? r.salary_min, period: r.salary_max < 500 ? "hour" : "year" } : null, salaryEst: r.salary_is_predicted === "1" || r.salary_is_predicted === 1,
        posted: Date.parse(r.created), url: r.redirect_url, department: r.category?.label ?? "", employment: [r.contract_time, r.contract_type].filter(Boolean).join(", ").replace(/_/g, " "), description: text }) && isNew) n++;
    } });
    if (!fresh) break; // a whole page we already had: everything older is in too
  }
  // one ad posted to many towns: hide every copy
  for (const k of mass) { const [ck, tk] = k.split("|"); for (const r of db.prepare("select id, title from jobs where source = 'adzuna' and ckey = ? and closed is null").all(ck) as any[]) if (tkey(r.title) === tk) db.prepare("update jobs set closed = ? where id = ?").run(now(), r.id); }
  // we can't open Adzuna's pages to check a job, so a listing stays 30 days from posting (Adzuna's own window), then goes
  db.prepare("update jobs set closed = ? where source = 'adzuna' and closed is null and coalesce(posted, first_seen) < ?").run(now(), now() - 30 * 86400);
  db.prepare("delete from adz_keys where at < ?").run(now() - 30 * 86400); db.prepare("delete from adz_skip where at < ?").run(now() - 30 * 86400);
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), `adzuna-${which}`, 1, n, `${calls} calls; ${gig} gig ads and ${repost} reposts skipped`);
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "adzuna-calls", 1, calls, which);
  return { jobs: n, gig, repost, calls };
}

/** Federal jobs from USAJOBS (USAJOBS_KEY and USAJOBS_EMAIL in .env): within 40 miles of NYC and 25 of Newark, and remote.
 *  Every 6 hours; a job gone from the results twice, or past its application deadline, is closed. */
export async function refreshUsajobs() {
  const key = env("USAJOBS_KEY"), email = env("USAJOBS_EMAIL");
  if (!key || !email) return { error: "no USAJOBS key" };
  const H = { Host: "data.usajobs.gov", "User-Agent": email, "Authorization-Key": key, accept: "application/json" }, items = new Map<string, any>();
  for (const q of ["LocationName=New%20York%2C%20New%20York&Radius=40", "LocationName=Newark%2C%20New%20Jersey&Radius=25", "RemoteIndicator=True"]) for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://data.usajobs.gov/api/search?${q}&ResultsPerPage=500&Page=${page}`, { headers: H, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`USAJOBS HTTP ${r.status}`);
    const got = (await r.json() as any).SearchResult?.SearchResultItems ?? [];
    for (const it of got) items.set(String(it.MatchedObjectId), it.MatchedObjectDescriptor);
    if (got.length < 500) break;
  }
  const seen = new Set<string>();
  batch(() => { for (const [mid, j] of items) {
    if (Date.parse(j.ApplicationCloseDate) < Date.now()) continue;
    const pay = (j.PositionRemuneration ?? [])[0], per = pay?.RateIntervalCode === "PH" ? "hour" : pay?.RateIntervalCode === "PA" ? "year" : null, u = j.UserArea?.Details ?? {}, id = `usa:${mid}`;
    if (save({ id, source: "usajobs", company: j.OrganizationName || j.DepartmentName, title: j.PositionTitle, location: (j.PositionLocation ?? []).map((l: any) => usPlace(l.LocationName)).join("; ") || j.PositionLocationDisplay,
      isRemote: u.RemoteIndicator === true || /remote/i.test(j.PositionLocationDisplay ?? ""), salary: per && +pay.MinimumRange ? { min: +pay.MinimumRange, max: +pay.MaximumRange || +pay.MinimumRange, period: per } : null,
      posted: Date.parse(j.PublicationStartDate), url: j.PositionURI, department: j.JobCategory?.[0]?.Name ?? "", employment: j.PositionSchedule?.[0]?.Name ?? "",
      description: [u.JobSummary, j.QualificationSummary && `Qualifications:\n${j.QualificationSummary}`, [].concat(u.MajorDuties ?? []).length && `Duties:\n${[].concat(u.MajorDuties).join("\n")}`,
        u.WhoMayApply?.Name && `Who may apply: ${u.WhoMayApply.Name}`, j.ApplicationCloseDate && `Applications close ${String(j.ApplicationCloseDate).slice(0, 10)}`].filter(Boolean).join("\n\n") })) seen.add(id);
  } sweep("usajobs", seen, "usa:"); });
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "usajobs", 1, seen.size, `${items.size} found`);
  return { jobs: seen.size };
}

/** Remote boards: Remotive and Himalayas, US-eligible only. */
export async function refreshRemote() {
  let n = 0; const seenR = new Set<string>(), seenH = new Set<string>();
  try {
    const d = await getJson("https://remotive.com/api/remote-jobs?limit=2000", 60_000);
    for (const j of d.jobs ?? []) { const loc = j.candidate_required_location ?? ""; if (!/usa|united states|worldwide|anywhere|americas|north america/i.test(loc)) continue;
      if (save({ id: `rm:${j.id}`, source: "remotive", company: j.company_name, title: j.title, location: `Remote (${loc})`, isRemote: true, posted: Date.parse(j.publication_date), url: j.url, department: j.category ?? "", employment: j.job_type ?? "", description: stripHtml(j.description ?? ""), salary: parseSalary(j.salary ?? "") })) { seenR.add(`rm:${j.id}`); n++; } }
    sweep("remotive", seenR, "rm:");
  } catch {}
  try {
    for (let off = 0; off < 1000; off += 100) {
      const d = await getJson(`https://himalayas.app/jobs/api?limit=100&offset=${off}`, 60_000); if (!d.jobs?.length) break;
      for (const j of d.jobs) { const loc = (j.locationRestrictions ?? []).join(", "); if (loc && !/united states|usa|north america|americas/i.test(loc)) continue;
        const id = `hm:${j.guid ?? j.applicationLink}`;
        if (save({ id, source: "himalayas", company: j.companyName, title: j.title, location: `Remote (${loc || "anywhere"})`, isRemote: true, posted: (j.pubDate ?? 0) * 1000, url: j.applicationLink, department: (j.categories ?? [])[0] ?? "", employment: j.employmentType ?? "", description: stripHtml(j.description ?? j.excerpt ?? ""),
          salary: j.minSalary ? { min: j.minSalary, max: j.maxSalary ?? j.minSalary, period: "year" } : null })) { seenH.add(id); n++; } }
    }
    sweep("himalayas", seenH, "hm:");
  } catch {}
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "remote", 1, n, "");
  return { jobs: n };
}

/** The employer list grows by itself: companies seen in Adzuna are tried on Greenhouse, Lever and Ashby (once each, up
 *  to `max` a day); any board that answers with NYC-area or US-remote jobs is added and read hourly from then on. */
export async function discover(max = 100) {
  const cands = db.prepare("select company, ckey, count(*) n from jobs where source = 'adzuna' and closed is null and ckey not in (select ckey from probed) group by ckey order by n desc limit ?").all(max) as any[];
  let added = 0;
  for (const c of cands) {
    const slugs = [...new Set([c.ckey, c.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), c.company.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "")])].filter((x) => x.length > 2);
    let found = "";
    for (const slug of slugs) for (const ats of ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"]) {
      if (found || STAFFING.test(c.company)) continue;
      try { const jobs = await readBoard(ats, slug, () => true); if (jobs.some((j) => region(j.location, j.isRemote)) && jobs.some((j) => ckey(j.company) === c.ckey || ats !== "greenhouse")) found = `${ats}:${slug}`; } catch {}
    }
    db.prepare("insert or replace into probed values (?, ?, ?)").run(c.ckey, now(), found);
    if (found) { const [ats, slug] = found.split(":"); db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now()); added++; }
  }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "discover", 1, added, `${cands.length} companies tried`);
  return { tried: cands.length, added };
}

/** Duplicates across sources: the same title in the same area at the same company (under either of its names, so "Citi"
 *  on Workday and "Citibank" on Adzuna meet), or the same company with a near-identical description. Each cluster keeps
 *  one: the employer's own record (its board > government > remote boards > Adzuna); the others point to it and show
 *  as "also on". One transaction for the lot (it was a commit per duplicate). */
export function dedupe() {
  const rank: Record<string, number> = { greenhouse: 0, lever: 0, ashby: 0, workday: 0, smartrecruiters: 0, workable: 0, nycjobs: 1, usajobs: 1, remotive: 2, himalayas: 2, adzuna: 3 };
  const open = db.prepare("select id, source, ckey, title, region, fp from jobs where closed is null").all() as any[];
  const up = open.map((_, i) => i), find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i]))), join = (a: number, b: number) => { up[find(a)] = find(b); };
  const groups = (key: (j: any) => string) => { const m = new Map<string, number[]>(); open.forEach((j, i) => { const k = key(j); (m.get(k) ?? m.set(k, []).get(k)!).push(i); }); return m.values(); };
  for (const l of groups((j) => `${tkey(j.title)}|${j.region}`)) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) if (sameCompany(open[l[x]].ckey, open[l[y]].ckey)) join(l[x], l[y]);
  for (const l of groups((j) => j.ckey)) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
    const a = open[l[x]], b = open[l[y]];
    if (a.fp && b.fp && tkey(a.title).split(" ")[0] === tkey(b.title).split(" ")[0] && hamming(a.fp, b.fp) <= 6) join(l[x], l[y]);
  }
  const clusters = new Map<number, any[]>(); open.forEach((j, i) => { const r = find(i); (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(j); });
  let dups = 0; const setDup = db.prepare("update jobs set dup_of = ? where id = ?"), setAlso = db.prepare("update jobs set also = ? where id = ?");
  batch(() => {
    db.exec("update jobs set dup_of = null, also = null where closed is null"); // closed ones keep theirs: the market's history counts each job once
    for (const c of clusters.values()) {
      if (c.length < 2) continue;
      c.sort((a, b) => (rank[a.source] ?? 3) - (rank[b.source] ?? 3) || a.id.localeCompare(b.id));
      for (const d of c.slice(1)) { setDup.run(c[0].id, d.id); dups++; }
      const also = [...new Set(c.slice(1).map((d) => d.source).filter((s) => s !== c[0].source))];
      if (also.length) setAlso.run(also.join(","), c[0].id);
    }
  });
  return { dups };
}

// ---------- searching ----------
export type Query = { q?: string; company?: string; exclude?: string; region?: string; remote?: string; salaryMin?: number; hideNoSalary?: boolean; days?: number; seniority?: string; func?: string; source?: string; hideFlagged?: boolean; sort?: string; page?: number; titleOnly?: boolean };
const FT = (q: string, titleOnly: boolean) => {
  // "quoted phrases", -excluded words, everything else ANDed; title-only searches the title column
  const parts = [...q.matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)].map((m) => ({ neg: !!(m[1] || m[3]), t: (m[2] ?? m[4]).replace(/["*^:()]/g, "") })).filter((p) => p.t);
  const col = titleOnly ? "title : " : "";
  const pos = parts.filter((p) => !p.neg).map((p) => `${col}"${p.t}"`), neg = parts.filter((p) => p.neg).map((p) => `NOT ${col}"${p.t}"`);
  return pos.length ? [pos.join(" AND "), ...neg].join(" ") : "";
};
/** The SQL for a query's filters, shared by search, résumé matching and the market. open = false keeps closed jobs (history). */
function filters(qy: Query, open = true) {
  const where = [open ? "j.closed is null" : "1", "j.dup_of is null"], args: any[] = [];
  let from = "jobs j";
  const fts = qy.q ? FT(qy.q, !!qy.titleOnly) : "";
  if (fts) { from = "jobs_fts2 f join jobs j on j.id = f.id"; where.push("jobs_fts2 match ?"); args.push(fts); }
  const inList = (col: string, v?: string) => { const l = (v ?? "").split(",").filter(Boolean); if (l.length) { where.push(`${col} in (${l.map(() => "?").join(",")})`); args.push(...l); } };
  inList("j.region", qy.region); inList("j.remote", qy.remote); inList("j.seniority", qy.seniority); inList("j.func", qy.func); inList("j.source", qy.source);
  if (qy.company) { where.push("j.ckey like ?"); args.push(`%${ckey(qy.company)}%`); }
  if (qy.exclude) for (const c of qy.exclude.split(",").map(ckey).filter(Boolean)) { where.push("j.ckey not like ?"); args.push(`%${c}%`); }
  if (qy.salaryMin) { where.push("(case when j.salary_period = 'hour' then j.salary_max * 2080 else j.salary_max end) >= ?"); args.push(qy.salaryMin); }
  if (qy.hideNoSalary) where.push("j.salary_min is not null and j.salary_est = 0");
  if (qy.days) { where.push("coalesce(j.posted, j.first_seen) >= ?"); args.push(now() - qy.days * 86400); }
  if (qy.hideFlagged) where.push("(j.flags is null or j.flags = '[]')");
  return { from, w: where.join(" and "), args, fts };
}
export function search(qy: Query) {
  const { from, w, args, fts } = filters(qy);
  // with words, best match first (title words count 10×, the company 3×, the description 1×), else newest first
  const order = qy.sort === "salary" ? "(case when j.salary_period = 'hour' then j.salary_max * 2080 else j.salary_max end) desc nulls last" : qy.sort === "newest" || !fts ? "coalesce(j.posted, j.first_seen) desc" : "bm25(jobs_fts2, 0, 10, 3, 1)";
  const page = Math.max(0, qy.page ?? 0);
  const total = (db.prepare(`select count(*) n from ${from} where ${w}`).get(...args) as any).n;
  const cols = "j.id, j.source, j.company, j.title, j.location, j.region, j.remote, j.salary_min, j.salary_max, j.salary_period, j.salary_est, j.posted, j.first_seen, j.last_seen, j.url, j.department, j.employment, j.seniority, j.func, j.flags, j.also, substr(j.description, 1, 400) snippet";
  let rows: any[];
  if (fts && order.startsWith("bm25") && page < 10) {
    // rerank the best 300: the whole phrase in the title first, then every word in the title, then the text score
    const words = (qy.q ?? "").replace(/-"[^"]*"|-\S+/g, "").replace(/"/g, "").toLowerCase().split(/\s+/).filter(Boolean), phrase = words.join(" ");
    const stem = (w: string) => w.replace(/(ing|ers|er|s)$/, ""), top = db.prepare(`select ${cols} from ${from} where ${w} order by ${order} limit 300`).all(...args) as any[];
    const score = (r: any, i: number) => { const t = r.title.toLowerCase(); return (t.includes(phrase) ? 1000 : 0) + (words.every((x) => t.includes(stem(x))) ? 500 : 0) - i; };
    rows = top.map((r, i) => [r, score(r, i)] as const).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(page * 30, page * 30 + 30);
  } else rows = db.prepare(`select ${cols} from ${from} where ${w} order by ${order} limit 30 offset ?`).all(...args, page * 30);
  const facet = (col: string) => Object.fromEntries((db.prepare(`select ${col} k, count(*) n from ${from} where ${w} group by ${col}`).all(...args) as any[]).map((r) => [r.k, r.n]));
  return { total, page, rows: rows.map((r: any) => ({ ...r, flags: JSON.parse(r.flags ?? "[]"), also: r.also ? r.also.split(",") : [] })), facets: { region: facet("j.region"), remote: facet("j.remote"), seniority: facet("j.seniority"), func: facet("j.func"), source: facet("j.source") } };
}
export function job(id: string) {
  const r: any = db.prepare("select * from jobs where id = ?").get(id);
  if (!r) return null;
  const co = db.prepare("select count(*) open, sum(case when flags like '%open % days%' then 1 else 0 end) old, sum(case when salary_min is null then 1 else 0 end) nosal from jobs where ckey = ? and closed is null and dup_of is null").get(r.ckey) as any;
  const closed30 = (db.prepare("select count(*) n from jobs where ckey = ? and closed > ?").get(r.ckey, now() - 30 * 86400) as any).n;
  return { ...r, fp: undefined, flags: JSON.parse(r.flags ?? "[]"), also: r.also ? r.also.split(",") : [], employer: { open: co.open, openOver60Days: co.old, withoutSalary: co.nosal, closedLast30Days: closed30 } };
}
export function stats() {
  const by = db.prepare("select source, count(*) n from jobs where closed is null and dup_of is null group by source").all();
  const runs = db.prepare("select what, max(at) at from runs group by what").all();
  const closed = (db.prepare("select count(*) n from jobs where closed > ?").get(now() - 86400) as any).n;
  return { open: (db.prepare("select count(*) n from jobs where closed is null and dup_of is null").get() as any).n, bySource: by, lastRuns: runs, closedLastDay: closed, companies: (db.prepare("select count(*) n from companies").get() as any).n };
}

// ---------- the market: what's open, what it pays, and how postings move week to week ----------
const pct = (sorted: number[], p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]) : null); // nearest rank
/** A position without its level or team: "Senior Data Engineer, Payments" → "data engineer". */
export const role = (title: string) => tkey(/^\s*\S+\s*(,| - | – | — |\||:)/.test(title) ? title : title.split(/,| - | – | — |\||:/)[0]).replace(/\b(senior|sr|junior|jr|lead|staff|principal|associate|entry level|head of|[iv]{1,3}|\d+)\b/g, " ").replace(/\s+/g, " ").trim();
const marketCache = new Map<string, ReturnType<typeof marketNow>>(); // emptied by each refresh: the jobs only change then
/** The market for a query's filters (not its date filter: time is the trends' axis). */
export function market(qy: Query) {
  const key = JSON.stringify([qy.q, qy.titleOnly, qy.region, qy.remote, qy.seniority, qy.func, qy.source, qy.company, qy.exclude, qy.salaryMin, qy.hideNoSalary, qy.hideFlagged]);
  if (!marketCache.has(key)) { if (marketCache.size > 300) marketCache.clear(); marketCache.set(key, marketNow(qy)); }
  return marketCache.get(key)!;
}
/** Open now: jobs, stated pay (yearly; hourly × 2080; Adzuna's estimates left out). Trends count distinct postings
 *  (company + title, so one job listed for five offices is one), dated by the employer's posting date, and leave out
 *  employer boards added after tracking began: their older postings would show up as growth that is only coverage.
 *  The weekly series (up to a year) is counted by SQLite; JS only reads open jobs and the last 30 days. */
function marketNow(qy: Query) {
  const t = now(), D = 86400, W = 7 * D, start = (db.prepare("select min(at) t from runs").get() as any).t ?? t;
  const late = (db.prepare("select ats, slug from companies where added > ?").all(start + D) as any[]).map((c) => `${PREFIX[c.ats]}:${c.slug}:`);
  const { from, w, args } = filters({ ...qy, days: undefined }, false);
  const T0 = "coalesce(j.posted, j.first_seen)", PAY = "(j.salary_min + coalesce(j.salary_max, j.salary_min)) / 2.0 * (case when j.salary_period = 'hour' then 2080 else 1 end)";
  const STEADY = `substr(j.id, 1, 3 + instr(substr(j.id, 4), ':')) not in (${late.map(() => "?").join(",")})`; // "gh:slug:"; "az:", "nyc:" are never late
  const GONE = "j.closed - j.first_seen >= 86400"; // closed the day it was seen = a repost we hid, not a job taken down
  const rows = (db.prepare(`select j.id, j.company, j.ckey, j.title, j.func, j.seniority, ${T0} t0, j.closed, j.closed is not null and ${GONE} gone, ${STEADY} steady,
    case when j.salary_min is not null and j.salary_est = 0 then ${PAY} end pay from ${from} where ${w} and (j.closed is null or j.closed >= ? or ${T0} >= ?)`).all(...late, ...args, t - 30 * D, t - 30 * D) as any[])
    .map((r) => ({ ...r, k: `${r.ckey}|${r.title.toLowerCase()}` }));
  const distinct = (l: any[]) => new Set(l.map((r) => r.k)).size, pays = (l: any[]) => l.map((r) => r.pay).filter((p) => p != null).sort((a, b) => a - b);
  const nW = Math.max(0, Math.min(52, Math.floor((t - start) / W))), back = Math.min(3, nW - 1);
  /** New postings in the last 7 days, and how that compares with the weekly average of the (up to) 3 weeks before. */
  const trend = (l: any[]) => { const s = l.filter((r) => r.steady), base = back > 0 ? distinct(s.filter((r) => r.t0 >= t - (back + 1) * W && r.t0 < t - W)) / back : 0;
    return { new7: distinct(l.filter((r) => r.t0 >= t - W)), change: base >= 5 ? Math.round((distinct(s.filter((r) => r.t0 >= t - W)) / base - 1) * 100) : null }; };
  const summary = (l: any[]) => { const open = l.filter((r) => r.closed == null), p = pays(open), ok = p.length >= 5; // a median of 1–4 salaries is noise
    return { open: open.length, ...trend(l), pay: ok ? pct(p, 0.5) : null, p25: ok ? pct(p, 0.25) : null, p75: ok ? pct(p, 0.75) : null, withPay: p.length }; };
  const group = (l: any[], keyOf: (r: any) => string) => { const m = new Map<string, any[]>(); for (const r of l) { const k = keyOf(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); } return m; };
  const by = (keyOf: (r: any) => string, more = (_l: any[]) => ({})) => [...group(rows, keyOf)].map(([key, l]) => ({ key, ...summary(l), ...more(l) })).filter((g) => g.open).sort((a, b) => b.open - a.open);
  // weeks back from now (0 = the last 7 days), each a full week after tracking began
  const weekly = (col: string, extra: string) => new Map((db.prepare(`select cast((? - ${col}) / ${W} as int) ago, count(distinct j.ckey || '|' || lower(j.title)) n from ${from}
    where ${w} and ${STEADY} and ${extra} and ${col} >= ? group by ago`).all(t, ...args, ...late, t - nW * W) as any[]).map((r) => [r.ago, r.n]));
  const born = weekly(T0, "1"), gone = weekly("j.closed", `j.closed is not null and ${GONE}`);
  const paid = new Map((db.prepare(`with p as (select cast((? - ${T0}) / ${W} as int) ago, ${PAY} pay from ${from} where ${w} and ${STEADY} and j.salary_min is not null and j.salary_est = 0 and ${T0} >= ?),
    r as (select ago, pay, row_number() over (partition by ago order by pay) rn, count(*) over (partition by ago) n from p) select ago, pay from r where rn = n / 2 + 1 and n >= 5`)
    .all(t, ...args, ...late, t - nW * W) as any[]).map((r) => [r.ago, Math.round(r.pay)]));
  const open = rows.filter((r) => r.closed == null);
  return { since: start, at: t, ...summary(rows),
    weeks: Array.from({ length: nW }, (_, i) => { const ago = nW - 1 - i; return { from: t - (ago + 1) * W, new: born.get(ago) ?? 0, closed: gone.get(ago) ?? 0, pay: paid.get(ago) ?? null }; }),
    fields: by((r) => r.func), levels: by((r) => r.seniority),
    companies: by((r) => r.ckey, (l) => { const o = l.filter((r) => r.closed == null);
      return { name: o[0]?.company ?? l[0].company, new30: distinct(l.filter((r) => r.t0 >= t - 30 * D)), closed30: distinct(l.filter((r) => r.gone && r.closed >= t - 30 * D)), stale: o.length ? Math.round((o.filter((r) => r.t0 < t - 60 * D).length / o.length) * 100) : 0 }; }).slice(0, 20),
    roles: by((r) => role(r.title)).filter((g) => g.key).slice(0, 20),
    grid: Object.fromEntries([...group(open, (r) => r.func)].map(([f, l]) => [f, Object.fromEntries([...group(l, (r) => r.seniority)].map(([s, m]) => [s, pays(m)] as const).filter(([, p]) => p.length >= 5).map(([s, p]) => [s, { pay: pct(p, 0.5), n: p.length }]))])) };
}

/** Jobs are kept a year after they close (the market's trends reach back that far), then deleted with their search
 *  rows. Embeddings only serve open jobs, so a closed job's goes at once (a reopened job is embedded again). */
// ponytail: a year of full-text rows is ~7 GB at today's rate (546 MB of FTS for 37 days); drop closed jobs' FTS bodies if disk gets tight
export function prune() {
  const old = now() - 365 * 86400;
  batch(() => {
    db.prepare("delete from jobs_fts2 where id in (select id from jobs where closed < ?)").run(old);
    db.prepare("delete from jobs where closed < ?").run(old);
    db.exec("delete from emb where id in (select id from jobs where closed is not null)");
  });
}

/** Every source at least 4 times a day, each within its limits: employer boards on Greenhouse, Lever, Ashby and Workable
 *  and NYC's jobs hourly (free; liveness); Adzuna NYC every 2 hours (its monthly calls); Workday, SmartRecruiters,
 *  USAJOBS, Adzuna remote, Remotive and Himalayas every 6 hours; new employer boards daily. Then dedupe and prune. */
let running = false, slowLane = false;
export async function jobsTick() {
  if (running) return; running = true;
  try {
    await refreshBoards().catch((e) => console.log("jobs boards:", e.message));
    await refreshNycJobs().catch((e) => console.log("jobs nyc:", e.message));
    const due = (what: string, h: number) => now() - lastAt(what) > h * 3600 - 300;
    if (due("adzuna-nyc", 2)) await refreshAdzuna("nyc").catch((e) => console.log("jobs adzuna:", e.message));
    // boards that cost a request per new job (SmartRecruiters, Workday), and USAJOBS: every 6 hours (two misses still close a job)
    if (due("boards-slow", 6) && !slowLane) { // paced (an hour or so): its own lane, so the hourly sources never wait on it
      slowLane = true; refreshBoards(["smartrecruiters", "workday"], "boards-slow").catch((e) => console.log("jobs boards-slow:", e.message)).finally(() => { slowLane = false; marketCache.clear(); });
    }
    if (due("usajobs", 6)) await refreshUsajobs().catch((e) => console.log("jobs usajobs:", e.message));
    if (due("adzuna-remote", 6)) await refreshAdzuna("remote").catch((e) => console.log("jobs adzuna remote:", e.message));
    if (due("remote", 6)) await refreshRemote().catch((e) => console.log("jobs remote:", e.message)); // Remotive asks for a few reads a day at most
    if (due("discover", 20)) await discover().catch((e) => console.log("jobs discover:", e.message)); // new employer boards, once a day
    dedupe(); prune();
  } finally { running = false; marketCache.clear(); }
}
export function startJobs() { setTimeout(jobsTick, 30_000); setInterval(jobsTick, 3600_000); }

/** A saved search as RSS: the 30 newest matches. */
export function rss(qy: Query, selfUrl: string, title: string) {
  const r = search(qy), x = (t: string) => t.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
  r.rows.sort((a: any, b: any) => (b.posted ?? b.first_seen) - (a.posted ?? a.first_seen)); // the best 30 matches, newest first
  const items = r.rows.map((j: any) => `<item><title>${x(`${j.title} at ${j.company}`)}</title><link>${x(j.url)}</link><guid isPermaLink="false">${x(j.id)}</guid><pubDate>${new Date((j.posted ?? j.first_seen) * 1000).toUTCString()}</pubDate><description>${x(`${j.location}${j.salary_min ? ` · $${Math.round(j.salary_min)}–$${Math.round(j.salary_max)} per ${j.salary_period}` : ""}${j.flags.length ? ` · flags: ${j.flags.join(", ")}` : ""}`)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(title)}</title><link>${x(selfUrl)}</link><description>Open jobs matching a saved search on ihor.sh</description>${items}</channel></rss>`;
}

// ---------- for matching (jobs-ai.ts): embeddings of open jobs ----------
/** Open jobs that have no embedding yet: the text that represents each. */
export const needEmbedding = (limit = 64) => (db.prepare("select j.id, j.title, j.company, j.region, j.remote, j.seniority, substr(j.description, 1, 1800) d from jobs j left join emb e on e.id = j.id where j.closed is null and j.dup_of is null and e.id is null limit ?").all(limit) as any[])
  .map((r) => ({ id: r.id, text: `${r.title} at ${r.company} (${r.region}, ${r.remote}, ${r.seniority})\n${r.d}` }));
export const saveEmbedding = (id: string, v: Float32Array) => db.prepare("insert or replace into emb values (?, ?)").run(id, new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
/** Every open job matching the filters (no text query), with its embedding, for ranking against a résumé. */
export function candidates(qy: Query) {
  const { w, args } = filters({ ...qy, q: undefined });
  return (db.prepare(`select j.id, j.title, j.company, j.region, j.remote, j.url, j.salary_min, j.salary_max, j.salary_period, j.salary_est, j.flags, j.source, j.posted, j.first_seen, e.v from jobs j join emb e on e.id = j.id where ${w}`).all(...args) as any[])
    .map((r) => ({ ...r, flags: JSON.parse(r.flags ?? "[]"), v: new Float32Array(new Uint8Array(r.v).buffer) }));
}
export const saveGuide = (body: object) => db.prepare("insert or replace into guides values (?, ?)").run(now(), JSON.stringify(body));
export const latestGuide = () => { const r = db.prepare("select at, body from guides order by at desc limit 1").get() as any; return r ? { at: r.at as number, ...JSON.parse(r.body) } : null; };
export const jobText = (id: string) => (db.prepare("select title, company, description from jobs where id = ?").get(id) as any) ?? null;
