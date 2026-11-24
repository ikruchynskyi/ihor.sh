// Jobs: real, open jobs in New York City, the metro around it (New Jersey included) and remote in the US.
// The source of truth for a job is its employer's own applicant tracking system (Greenhouse, Lever, Ashby): one request
// per company returns every open job, so every company is re-read hourly and a job missing twice in a row is closed.
// NYC's own jobs come from the city's open data. Adzuna adds breadth (daily sweeps), minus gig ads and reposts; a
// listing found only there stays while Adzuna still lists it. Remote boards (Remotive, Himalayas) add remote-US roles.
// Everything is deduplicated (company + title + area, then a fingerprint of the description), and flagged with reasons.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { yearsAsked } from "../nyc/resume.js";
import { PLAIN, jobPostingLd } from "./bigtech.ts";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.JOBS_DB ?? path.join(dir, "jobs.db"), { timeout: 5000 }); // tests: JOBS_DB=:memory:
db.exec("pragma journal_mode = delete; pragma synchronous = normal;");
db.exec(`
  create table if not exists companies (ats text, slug text, name text, added int, last_ok int, last_err text, open int, primary key (ats, slug));
  create table if not exists jobs (id text primary key, source text, company text, ckey text, title text, location text, region text, remote text,
    salary_min real, salary_max real, salary_period text, salary_est int, posted int, url text, department text, employment text, seniority text,
    func text, description text, first_seen int, last_seen int, missed int default 0, closed int, fp text, dup_of text, flags text, also text);
  create index if not exists jobs_open on jobs (closed, dup_of);
  create index if not exists jobs_ck on jobs (ckey, closed); -- an employer's jobs: reposts, report cards, the red-flag check
  -- the market's scans read these without walking each description's overflow pages (372 → 294 ms on 50k jobs)
  create index if not exists jobs_mk on jobs (dup_of, closed, posted, first_seen, ckey, title, func, seniority, region, remote, source, salary_min, salary_max, salary_period, salary_est, flags, company, id);
  create virtual table if not exists jobs_fts2 using fts5(id unindexed, title, company, body, tokenize = 'porter unicode61'); -- porter: engineers = engineer
  create table if not exists runs (at int, what text, ok int, n int, note text);
  create table if not exists probed (ckey text primary key, at int, found text);
  create table if not exists directory (ats text, slug text, name text, ck text, primary key (ats, slug)); -- employers' board addresses from public lists (refreshDirectory), candidates for discover()
  create index if not exists directory_ck on directory (ck);
  create table if not exists emb (id text primary key, v blob);
  create table if not exists adz_keys (k text primary key, n int, at int); -- Adzuna ads per company + title (30 days): reposts across runs
  create table if not exists adz_skip (id text primary key, at int); -- Adzuna ads left out (gig, repost), so a later sweep knows them
  create table if not exists guides (at int primary key, body text);
  create table if not exists company_info (ck text primary key, at int, body text); -- the company card (company.ts): business, stock, news, pay, AI overview, made daily
  create table if not exists checks (id text primary key, at int, body text); -- red-flag checks (jobs-ai.ts checkJob): a day each, made overnight for fresh jobs -- the weekly hiring context (jobs-ai.ts refreshGuidance)
`);
const now = () => Math.floor(Date.now() / 1000);
const UA = { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)", accept: "application/json" };
const env = (k: string) => process.env[k] ?? "";
// Workday's Cloudflare answers this container 429 but the Mac 200 (same address; 2026-11-16), so Workday's and Oracle's
// boards go through the host bridge's /fetch relay (host.ts, those hosts only)
const VIA_MAC = /^https:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com|wd\d+\.myworkdaysite\.com|[a-z0-9-]+\.fa(\.[a-z0-9-]+)?\.oraclecloud\.com)\//;
const getJson = async (u: string, ms = 30_000, body?: object, sig?: AbortSignal) => {
  const baseSignal = AbortSignal.timeout(ms + (process.env.HOST_BRIDGE && VIA_MAC.test(u) ? 5000 : 0));
  const signal = sig ? AbortSignal.any([baseSignal, sig]) : baseSignal;
  if (process.env.HOST_BRIDGE && VIA_MAC.test(u)) {
    const r = await fetch(`${process.env.HOST_BRIDGE}/fetch`, { method: "POST", body: JSON.stringify({ url: u, body }), signal }), d: any = await r.json().catch(() => ({}));
    if (!r.ok || d.status !== 200) throw new Error(`HTTP ${d.status ?? r.status}`);
    return JSON.parse(d.body);
  } const r = await fetch(u, { method: body ? "POST" : "GET", headers: body ? { ...UA, "content-type": "application/json" } : UA, body: body && JSON.stringify(body), signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<any>; };
// Workday's Cloudflare answered 429 to every board after a burst (2026-11-16): requests to one platform go one at a time
// at most every `ms` (all its boards share the slot), and a 429 rests that platform for an hour.
// Each run also has a request budget per platform (BUDGET; passed per run): a board that hits it, or a 429, keeps
// what it read so far and stops, and the next try is simply the next scheduled run (user, 2026-11-16: no retries).
const nextSlot = new Map<string, number>(), resting = new Map<string, number>(), spentRun = new Map<string, number>(), BUDGET: Record<string, number> = { workday: 2000, oracle: 3000, amazon: 60, eightfold: 1000, smartrecruiters: 3000 }; // SmartRecruiters: 1000 → 3000 with the boards the lists found (2026-11-23)
// Workday's Cloudflare also turned the Mac away after sustained requests 1.5 s apart (2026-11-16): one every 3 s, once a day
const WD_PACE = 3000; // a day's run (user: daily is fine for the fullest view)
// A lane is a platform behind one front door (every Workday board shares Cloudflare's), or one employer's own host
// (Oracle: each bank's own); lanes run in parallel, and each keeps its own pace and its own budget for the run.
const pace = async (lane: string, ms: number, spent = spentRun, signal?: AbortSignal) => {
  const ats = lane.split(":")[0];
  const check = () => {
    if (signal?.aborted) throw new Error(signal.reason instanceof Error ? signal.reason.message : "aborted");
    if ((resting.get(lane) ?? 0) > Date.now()) throw new Error(`HTTP 429 earlier: ${lane} rests until ${new Date(resting.get(lane)!).toISOString().slice(11, 16)} UTC`);
  };
  check();
  const used = (spent.get(lane) ?? 0) + 1; spent.set(lane, used);
  if (BUDGET[ats] && used > BUDGET[ats]) throw new Error(`this run's ${BUDGET[ats]} requests are used`);
  const t = Math.max(Date.now(), (nextSlot.get(lane) ?? 0) + ms); nextSlot.set(lane, t);
  const wait = t - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  check();
};
const note429 = (lane: string, e: unknown) => {
  const msg = (e as Error).message;
  if (/HTTP 429\b/.test(msg)) resting.set(lane, Date.now() + 3600_000);
  return msg;
};
export const resetLanes = () => { nextSlot.clear(); resting.clear(); spentRun.clear(); };
// Browser crawls on the Mac run one at a time, so serialize callers here before their HTTP request timeouts start ticking.
let crawlChain = Promise.resolve();
const withCrawlBridge = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = crawlChain.then(fn, fn);
  crawlChain = p.then(() => {}, () => {});
  return p;
};
const laneOf = (ats: string, slug: string) => (ats === "oracle" || ats === "eightfold" ? `${ats}:${slug.split("|")[0]}` : ats);

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
// Places in New York and Connecticut within 60 km of Manhattan by name (places.json, from GeoNames: scripts/places.py):
// "Jamaica, NY" and "Harlem, NY" are the city, "Lake Success, NY" the metro; the lists above knew half of them.
const PLACES: Record<string, Record<string, string>> = JSON.parse(readFileSync(path.join(import.meta.dirname, "places.json"), "utf8"));
const placeRegion = (parts: string[]) => {
  for (const x of parts) { const m = usPlace(x).match(/^\s*([^,]+?),\s*(NY|CT)\b/i), r = m && PLACES[m[2].toUpperCase()]?.[m[1].trim().toLowerCase()]; if (r) return r; }
  return null;
};
export function region(loc: string, remoteHint = false): string | null {
  const l = loc ?? "", parts = l.split(/;|\|/);
  if (NYC.test(l) || parts.some((x) => NYC_BARE.test(x) || NYC_BARE.test(x.split(",")[0]))) return "nyc"; // Accenture: "New York, 120 Wall Street, Song"
  if (NJ.test(l)) return "nj";
  if (METRO.test(l)) return "metro";
  const near = placeRegion(parts); if (near) return near;
  const remote = remoteHint || /\bremote\b|anywhere|work from home|distributed/i.test(l);
  // US-remote only when it says so (US, a state), or names no place at all ("Remote"); "Remote, Manila" is not
  const rest = l.replace(/\b(remote|anywhere|work from home|wfh|distributed|hybrid|fully|100%|global|worldwide)\b|[^a-z]+/gi, "");
  if (remote && !NON_US.test(l) && (US_REMOTE.test(l) || rest === "")) return "remote";
  return null;
}
const ST: Record<string, string> = { "new york": "NY", "new jersey": "NJ", connecticut: "CT" };
/** Places as Workday and USAJOBS write them ("New York New York United States", "Jersey City, New Jersey", "US-NY-New
 *  York", "Newark-NJ-USA") in the shape region() reads ("New York, NY"). */
const BARE_TOWN: Record<string, string> = { princeton: "Princeton, NJ", skillman: "Skillman, NJ", "middle village": "Queens, NY" }; // Bloomberg writes its offices' towns alone
export const usPlace = (s: string) => {
  const bare = BARE_TOWN[String(s ?? "").trim().toLowerCase()]; if (bare) return bare;
  const st = String(s ?? "").trim().match(/^([A-Z]{2})-(?![A-Z]{2}-)(\S.*)$/); if (st) return st[1] === "US" ? `${st[2]}, US` : `${st[2]}, ${st[1]}`; // PwC: "NY-New York", "US-Remote"
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
/** Pay in text: a range ("$120,000 – $150,000", "$150K-$200K", "$45/hr – $60/hr", "$85,000.00 - $95,000.00", "$172,000/yr
 *  to $215,000/yr", "between $90,000 and $110,000"), or one figure with its period ("$20.00 per hour", "$85,000 a year":
 *  NYC's law allows a single rate; "up to $55 an hour" is only a maximum, so it isn't read). Annual or hourly, sanity-checked. */
export function parseSalary(text: string): { min: number; max: number; period: "year" | "hour" } | null {
  const N = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)", HOUR = "(?:\\/\\s?(?:hr|hour)|per hour|an hour)", YEAR = "(?:\\/\\s?(?:yr|year)|per year|a year|annually|per annum)";
  const t = text.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/between\s+(\$\s?[\d,.]+\s?[kK]?)\s+and\s+/gi, "$1 - ")
    .replace(/\bfrom\s+(\$\s?[\d,.]+\s?[kK]?)(\s*\/\s?(?:year|yr|hour|hr))?[^$]{0,80}?\bup to\s+(?=\$)/gi, "$1$2 - "); // Amazon: "from $139,100/year in our lowest … up to $240,500/year"
  const n = (s: string, k?: string) => parseFloat(s.replace(/,/g, "")) * (k ? 1000 : 1);
  const sane = (lo: number, hi: number, hourly: boolean) => (hourly ? lo < 7 || hi > 600 : lo < 15000 || hi > 2_000_000) ? null : { min: lo, max: hi, period: (hourly ? "hour" : "year") as "hour" | "year" };
  const m = t.match(new RegExp(`\\$\\s?${N}\\s?([kK])?\\s*(?:${HOUR}|${YEAR})?\\s*(?:-|to)\\s*\\$?\\s?${N}\\s?([kK])?(\\s*(?:${HOUR}|hourly))?`));
  if (m) { const a = n(m[1], m[2]), b = n(m[3], m[4] ?? m[2]); return sane(Math.min(a, b), Math.max(a, b), !!m[5] || (b < 500 && !m[4])); }
  const one = t.match(new RegExp(`(up to\\s*)?\\$\\s?${N}\\s?([kK])?\\s*(${HOUR}|hourly|${YEAR})`, "i"));
  if (!one || one[1]) return null;
  const v = n(one[2], one[3]); return sane(v, v, !new RegExp(YEAR, "i").test(one[4]));
}
// "associate" alone is junior, but not in "Associate Director" or "Senior Associate" (it was, before 2026-11-16)
export const seniority = (t: string) => /\bintern(ship)?\b|co-?op\b/i.test(t) ? "intern" : /\b(junior|jr\.?|entry[- ]level|graduate|new grad|apprentice|associate (product|project|program) manager)\b/i.test(t) ? "junior"
  : /\b(vp|vice president|chief|head of|cto|cfo|ceo|coo|svp|evp)\b/i.test(t) ? "executive" : /\bdirector\b/i.test(t) ? "director"
  : /\b(manager|lead|supervisor)\b/i.test(t) ? "manager" : /\b(staff|principal|distinguished|architect)\b/i.test(t) ? "staff"
  : /\b(senior|sr\.?|iii|iv)\b/i.test(t) ? "senior" : /\b(associate|entry)\b/i.test(t) ? "junior" : "mid";
/** The level from the title, or, when the title has no level word (most of "mid"), from the years of experience the posting asks for. */
export const levelOf = (title: string, desc = "") => { const s = seniority(title); if (s !== "mid" || /\b(mid|ii|2)\b/i.test(title)) return s;
  const y = yearsAsked(desc); return y == null ? s : y <= 1 ? "junior" : y <= 4 ? "mid" : y <= 7 ? "senior" : "staff"; };
const FUNCS: [string, RegExp][] = [["engineering", /engineer|developer|devops|sre\b|software|platform|infrastructure|security|qa\b|test automation|firmware|mobile|ios|android/i],
  ["data", /data|analytics|analyst|machine learning|\bml\b|\bai\b|scientist|quant/i], ["design", /design|ux|ui\b|creative|art director/i], ["product", /product manager|product owner|\bpm\b|program manager/i],
  ["sales", /sales|account executive|business development|\bbdr\b|\bsdr\b|account manager/i], ["marketing", /marketing|growth|brand|content|seo|communications|\bpr\b|social media/i],
  ["finance", /financ|accountant|accounting|controller|tax|audit|assurance|treasury|fp&a|investment|trader|trading|portfolio|risk advisory|transaction services|valuation|\bdeals\b/i], ["legal", /legal|counsel|attorney|paralegal|compliance/i],
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
// wording that screens people out (age, national origin, insider jargon) and always-on culture: phrases measured on
// 13,476 open jobs (2026-11-16) to fire rarely and mean it ("guru", "recent graduates" and "unpaid" were too common to)
const CODED = /\b(digital natives?|young (and|&) (energetic|dynamic)|young(er)? team|youthful|native (english|spanish) speakers?|rock ?stars?|ninjas?|crush(ing)? it)\b/i;
const ALWAYS_ON = /\b(we('| a)re (like )?a family|work hard,? play hard|thick skin|available 24\/7|available (at all times|around the clock))\b/i;
export function flagsFor(j: { company: string; title: string; description: string; region: string | null; salary_min: number | null; posted: number | null; url: string; source: string; first_seen?: number; reposts?: number }) {
  const f: string[] = [], text = `${j.title}\n${j.description}`, age = (now() - (j.posted ?? j.first_seen ?? now())) / 86400;
  if (age > 60) f.push(`open ${Math.round(age)} days`);
  if (/evergreen|talent (pool|community|network)|general (application|interest)|future (opportunities|openings)|always (hiring|looking)/i.test(text)) f.push("evergreen / talent-pool posting");
  // only when we read the posting itself (a list-only source like Meta's gives no text to find pay in)
  if (j.region !== "remote" && j.salary_min == null && j.source !== "adzuna" && j.description.length >= 300) f.push("no salary range (NYC law requires one)");
  if (/telegram|whatsapp|signal app|text us at|send your (bank|ssn)|check deposit|purchase (your own )?equipment|upfront (fee|payment)|training fee/i.test(text)) f.push("scam signs (chat apps, upfront money)");
  if (/@(gmail|yahoo|hotmail|outlook|aol)\.com/i.test(text)) f.push("personal email to apply");
  if (STAFFING.test(j.company)) f.push("staffing agency, not the employer");
  if (/commission[- ]only|100% commission|uncapped commission|unlimited (earning|income) potential|free (licensing|training).*(insurance|life)|life insurance agent|financial (freedom|independence)|be your own boss|(mlm|network marketing)/i.test(text)) f.push("commission-only or agent-recruiting ad");
  if (j.salary_min != null && (j as any).salary_max != null && (j as any).salary_max > 4 * j.salary_min) f.push("very wide pay range");
  const years = yearsAsked(j.description);
  if (years != null && years >= 3 && ["intern", "junior"].includes(seniority(j.title))) f.push(`entry-level title asking for ${years}+ years`);
  const coded = j.description.match(CODED)?.[0]; if (coded) f.push(`wording that screens people out ("${coded.toLowerCase()}")`);
  const always = j.description.match(ALWAYS_ON)?.[0]; if (always) f.push(`always-on culture wording ("${always.toLowerCase()}")`);
  if ((j.reposts ?? 0) >= 2) f.push(`posted again ${j.reposts} times in 6 months`);
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
/** How many other days this employer posted this title in this area in the last 6 months and took it down again (from
 *  its own boards and the government's: Adzuna listings expire on our clock, not the employer's). */
const repostQ = db.prepare("select count(distinct date(coalesce(posted, first_seen), 'unixepoch')) n from jobs where ckey = ? and lower(title) = lower(?) and region = ? and closed is not null and closed > ? and source != 'adzuna' and id != ?");
const reposts = (ck: string, title: string, reg: string, id: string) => (repostQ.get(ck, title.trim(), reg, now() - 180 * 86400, id) as any).n as number;
// 2026-11-16: "$200,000&mdash;$265,000" (see stripHtml) and two more pay formats went unread, so ~1,700 open jobs showed no pay
// and a "no salary" flag. Unchanged jobs are never read again, so stored ones are repaired here (a few ms per start).
const repaired = db.prepare("update jobs set description = ?, salary_min = ?, salary_max = ?, salary_period = ?, flags = ? where id = ?");
batch(() => { for (const r of db.prepare("select * from jobs where closed is null and salary_min is null and description like '%$%'").all() as any[]) {
  const d = entities(r.description), sal = parseSalary(d);
  if (sal || d !== r.description) repaired.run(d, sal?.min ?? null, sal?.max ?? null, sal?.period ?? null, JSON.stringify(flagsFor({ ...r, description: d, salary_min: sal?.min ?? null, salary_max: sal?.max ?? null, reposts: reposts(r.ckey, r.title, r.region, r.id) })), r.id);
} });
// 2026-11-16, once: every job's level again (the "associate" fix) and open jobs' flags with the new checks
if (!db.prepare("select 1 from runs where what = 'migrate-flags-2'").get()) batch(() => {
  const lv = db.prepare("update jobs set seniority = ? where id = ?"), fl = db.prepare("update jobs set flags = ? where id = ?");
  for (const r of db.prepare("select id, title, seniority from jobs").all() as any[]) { const s = seniority(r.title); if (s !== r.seniority) lv.run(s, r.id); }
  for (const r of db.prepare("select * from jobs where closed is null").all() as any[]) fl.run(JSON.stringify(flagsFor({ ...r, reposts: reposts(r.ckey, r.title, r.region, r.id) })), r.id);
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "migrate-flags-2", 1, 0, "");
});
db.prepare("delete from companies where ats = 'workday' and slug = 'pwc|3|Global_Experienced_Careers'").run(); // PwC's global site: 3 New York jobs; its US one has them
// 2026-11-16, once: Bloomberg's jobs were all stored as New York (its search ignores the place): read each page again
if (!db.prepare("select 1 from runs where what = 'migrate-bloomberg-place'").get()) { db.prepare("update jobs set description = '' where id like 'cu:bloomberg:%' and closed is null").run(); db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "migrate-bloomberg-place", 1, 0, ""); }
// 2026-11-20, once: a "mid" job by default (no level word in its title) takes its level from the years it asks for
if (!db.prepare("select 1 from runs where what = 'migrate-levels-years'").get()) batch(() => {
  const lv = db.prepare("update jobs set seniority = ? where id = ?");
  for (const r of db.prepare("select id, title, description from jobs where closed is null and seniority = 'mid'").all() as any[]) { const s = levelOf(r.title, r.description ?? ""); if (s !== "mid") lv.run(s, r.id); }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "migrate-levels-years", 1, 0, "");
});
// 2026-11-16: amazon.jobs names each job's legal entity ("Amazon.com Services LLC", "Amazon Web Services, Inc."…), which split Amazon into a dozen employers here
db.exec("update jobs set company = 'Amazon', ckey = 'amazon' where source = 'amazon' and company != 'Amazon'; update companies set name = 'Amazon' where ats = 'amazon'");
function save(j: In) {
  const reg = j.regionHint ?? region(j.location, j.isRemote);
  if (!reg) return false;
  const desc = j.description.slice(0, 20000), t = now(), fp = simhash(desc), prev = known.get(j.id) as any;
  if (prev && prev.closed == null && prev.fp === fp && prev.title === j.title.trim() && prev.location === j.location.slice(0, 200) && prev.url === j.url) { touch.run(t, j.id); return true; }
  const given = j.salary && j.salary.min > 0 ? j.salary : null, sal = given ?? parseSalary(desc);
  const posted = j.posted ? Math.floor(j.posted / 1000) : null;
  const row = { company: j.company, title: j.title, description: desc, region: reg, salary_min: sal?.min ?? null, salary_max: sal?.max ?? null, posted, url: j.url, source: j.source, first_seen: t, reposts: reposts(ckey(j.company), j.title, reg, j.id) };
  upsert.run(j.id, j.source, j.company, ckey(j.company), j.title.trim(), j.location.slice(0, 200), reg, remoteType(j.location, desc, j.remoteHint ?? (j.isRemote ? "remote" : "")),
    sal?.min ?? null, sal?.max ?? null, sal?.period ?? null, j.salaryEst ? 1 : 0, posted, j.url, j.department ?? "", j.employment ?? "", levelOf(j.title, desc), func(j.title, j.department), desc, t, t, fp, JSON.stringify(flagsFor(row)));
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
const PREFIX: Record<string, string> = { greenhouse: "gh", lever: "lv", ashby: "ab", smartrecruiters: "sr", workable: "wk", workday: "wd", oracle: "or", amazon: "amz", eightfold: "ef", custom: "cu" }; // job ids are <prefix>:<slug>:<id>
// Workday boards can't be found from a company's name (the host, number and site differ), so these are listed by hand:
// big NYC-area employers whose boards answered on 2026-11-16. slug = tenant|wdN|site.
const WORKDAY: [string, string][] = [["citi|5|2", "Citi"], ["ms|5|External", "Morgan Stanley"], ["pfizer|1|PfizerCareers", "Pfizer"], ["mastercard|1|CorporateCareers", "Mastercard"], ["nasdaq|1|Global_External_Site", "Nasdaq"],
  ["spgi|5|SPGI_Careers", "S&P Global"], ["jj|5|JJ", "Johnson & Johnson"], ["msd|5|SearchJobs", "Merck"], ["bristolmyerssquibb|5|BMS", "Bristol Myers Squibb"], ["pru|5|Careers", "Prudential"], ["blackstone|1|Blackstone_Careers", "Blackstone"],
  ["att|1|ATTGeneral", "AT&T"], ["salesforce|12|External_Career_Site", "Salesforce"], ["verizon|12|verizon-careers", "Verizon"], ["nvidia|5|NVIDIAExternalCareerSite", "NVIDIA"], ["target|5|targetcareers", "Target"],
  ["adobe|5|external_experienced", "Adobe"], ["capitalone|12|Capital_One", "Capital One"], ["visa|5|Visa", "Visa"], // the last three found from their careers pages
  // big employers with many remote US jobs, the Big 4's PwC and audit firms among them (user, 2026-11-16)
  ["pwc|3|US_Experienced_Careers", "PwC"], ["rsm|1|RSMCareers", "RSM"], ["accenture|103|AccentureCareers", "Accenture"], ["bah|1|BAH_Jobs", "Booz Allen Hamilton"], ["fmr|1|FidelityCareers", "Fidelity Investments"],
  ["ghr|1|Lateral-US", "Bank of America"], ["wf|1|WellsFargoJobs", "Wells Fargo"], ["vanguard|5|vanguard_external", "Vanguard"], ["tiaa|1|Search", "TIAA"], ["cigna|5|cignacareers", "Cigna"],
  ["travelers|5|External", "Travelers"], ["fis|5|SearchJobs", "FIS"]];
// Big NYC employers on their own systems, verified 2026-11-16: Oracle Recruiting Cloud (host|site) and amazon.jobs
const ORACLE: [string, string][] = [["jpmc.fa.oraclecloud.com|CX_1001", "JPMorgan Chase"], ["eofe.fa.us2.oraclecloud.com|BNY-Careers", "BNY"], ["eeho.fa.us2.oraclecloud.com|CX_45001", "Oracle"], ["ehzq.fa.us2.oraclecloud.com|CX_1", "Grant Thornton"]];
for (const [slug, name] of ORACLE) db.prepare("insert or ignore into companies (ats, slug, name, added) values ('oracle', ?, ?, ?)").run(slug, name, now());
db.prepare("insert or ignore into companies (ats, slug, name, added) values ('amazon', 'amazon', 'Amazon', ?)").run(now());
const EIGHTFOLD: [string, string][] = [["explore.jobs.netflix.net|netflix.com|v2", "Netflix"], ["apply.careers.microsoft.com|microsoft.com|pcsx", "Microsoft"], ["paypal.eightfold.ai|paypal.com|pcsx", "PayPal"]]; // host|domain|API flavor
// Big employers with no public ATS API, read from their own career sites (bigtech.ts in here; crawl.ts on the Mac)
const CUSTOM: [string, string][] = [["google", "Google"], ["goldman", "Goldman Sachs"], ["blackrock", "BlackRock"], ["moodys", "Moody's"], ["meta", "Meta"], ["apple", "Apple"], ["bloomberg", "Bloomberg"], ["deloitte", "Deloitte"], ["ey", "EY"], ["intuit", "Intuit"], ["unitedhealth", "UnitedHealth Group"]];
for (const [slug, name] of CUSTOM) db.prepare("insert or ignore into companies (ats, slug, name, added) values ('custom', ?, ?, ?)").run(slug, name, now());
for (const [slug, name] of EIGHTFOLD) db.prepare("insert or ignore into companies (ats, slug, name, added) values ('eightfold', ?, ?, ?)").run(slug, name, now());
// Well-rated tech and trading firms whose boards answered with NYC or remote jobs (2026-11-16; Adzuna rarely lists them)
const MORE: [string, string][] = [["greenhouse", "anthropic"], ["greenhouse", "gitlab"], ["greenhouse", "doordashusa"], ["ashby", "openai"], ["greenhouse", "thenewyorktimes"], ["greenhouse", "zscaler"], ["greenhouse", "reddit"], ["greenhouse", "databricks"], ["ashby", "harvey"], ["lever", "palantir"], ["ashby", "perplexity"], ["ashby", "supabase"], ["greenhouse", "fivetran"], ["ashby", "snowflake"], ["greenhouse", "scaleai"], ["greenhouse", "toast"], ["ashby", "temporal"], ["ashby", "vanta"], ["ashby", "cohere"], ["ashby", "elevenlabs"], ["ashby", "voleon"], ["greenhouse", "gusto"], ["greenhouse", "monzo"], ["greenhouse", "sigmacomputing"], ["greenhouse", "towerresearchcapital"], ["ashby", "modal"], ["greenhouse", "adyen"], ["ashby", "writer"], ["ashby", "clickhouse"], ["ashby", "snyk"], ["greenhouse", "jumptrading"], ["greenhouse", "smartsheet"], ["greenhouse", "block"], ["greenhouse", "imc"], ["greenhouse", "flowtraders"], ["greenhouse", "collibra"], ["ashby", "iterable"], ["greenhouse", "mixpanel"], ["greenhouse", "sofi"], ["greenhouse", "salesloft"], ["greenhouse", "planetscale"], ["greenhouse", "fireblocks"], ["greenhouse", "intercom"], ["greenhouse", "netlify"], ["ashby", "clickup"], ["greenhouse", "yugabyte"], ["ashby", "character"], ["greenhouse", "klaviyo"], ["greenhouse", "akunacapital"], ["greenhouse", "starburst"], ["greenhouse", "calm"], ["smartrecruiters", "ServiceNow"]];
for (const [ats, slug] of MORE) db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now());
for (const [slug, name] of WORKDAY) db.prepare("insert or ignore into companies (ats, slug, name, added) values ('workday', ?, ?, ?)").run(slug, name, now());
for (const [ats, slug] of [["smartrecruiters", "Equinox"], ["smartrecruiters", "ServiceNow"], ["workable", "huggingface"], ["greenhouse", "cloudflare"], ["greenhouse", "toast"], ["greenhouse", "samsara"], ["ashby", "zapier"]]) db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now());
const BOARD_NAME = new Map([...WORKDAY, ...ORACLE, ...EIGHTFOLD, ...CUSTOM]);
// the families or categories big boards are asked for (user, 2026-11-16: tech, engineering, data / analysts, finance)
const WD_FAMILIES = /technolog|engineer|software|information|\bit\b|data|analy|scien|machine learning|decision|financ|accounting|treasury|risk|quant|actuar|invest|trading|cyber/i;
const FOCUS = (title: string) => ["engineering", "data", "finance"].includes(func(title));
/** Every facet value on a Workday board, nested ones too: { p: its parameter, d: what it says, id }. */
const wdFacets = (fs: any[], p = ""): { p: string; d: string; id: string }[] => (fs ?? []).flatMap((f) => (f.values ?? []).flatMap((v: any) => (v.values ? wdFacets([v], v.facetParameter ?? f.facetParameter) : [{ p: f.facetParameter ?? p, d: String(v.descriptor ?? ""), id: v.id }])));
const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, a, b) => `${a ? " " : ""}${b.toUpperCase()}`);

/** One employer board's jobs. known(id): a job stored and open already, so a board that needs a request per job for its
 *  description (SmartRecruiters, Workday) only lists it; discover() passes () => true to read the lists alone. */
async function readBoard(ats: string, slug: string, known: (id: string) => boolean = (id) => !!openIds.get(id), spent = spentRun, signal?: AbortSignal, name?: string | null): Promise<In[]> {
  // a job only listed (stored already, or discover() looking): its title rides along, so discover() can match it
  const brief = (id: string, company: string, location: string, isRemote = false, title = ""): In => ({ known: true, id, source: ats, company, title, location, isRemote, url: "", description: "" });
  if (ats === "workable") {
    const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, 30_000, undefined, signal);
    return (d.jobs ?? []).map((j: any) => ({ id: `wk:${slug}:${j.shortcode}`, source: "workable", company: d.name ?? titleCase(slug), title: j.title,
      location: (j.locations?.length ? j.locations : [j]).map((l: any) => [l.city, ST[String(l.region ?? l.state ?? "").toLowerCase()] ?? l.region ?? l.state, l.country === "United States" || l.country_code === "US" ? "" : l.country].filter(Boolean).join(", ")).join("; "),
      isRemote: !!j.telecommuting && /united states|^us$/i.test(j.country ?? j.locations?.[0]?.country ?? ""), posted: Date.parse(j.published_on ?? j.created_at), url: j.url ?? j.application_url,
      department: j.department ?? "", employment: j.employment_type ?? "", description: stripHtml(j.description ?? "") }));
  }
  if (ats === "smartrecruiters") { // its US list, each job's place checked (states come as "NY" or "New York"; remote ones anywhere in the US); a description costs one request
    const out: In[] = [], lane = laneOf(ats, slug);
    try {
    for (let off = 0; off < 2000; off += 100) {
      await pace(lane, 500, spent, signal); const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${off}&country=us`, 30_000, undefined, signal);
      for (const p of d.content ?? []) {
        const id = `sr:${slug}:${p.id}`, loc = usPlace(`${p.location?.city ?? ""}, ${p.location?.region ?? ""}`);
        if (!region(loc, !!p.location?.remote)) continue;
        if (known(id)) { out.push(brief(id, p.company?.name ?? slug, loc, false, p.name ?? "")); continue; }
        if (out.filter((j) => !j.known).length >= 100) continue; // the rest next time
        await pace(lane, 500, spent, signal); const j = await getJson(p.ref, 30_000, undefined, signal).catch((e) => { if (/429/.test(e.message)) throw e; return null; }); if (!j) continue;
        out.push({ id, source: "smartrecruiters", company: j.company?.name ?? slug, title: j.name, location: loc, remoteHint: p.location?.remote ? "remote" : p.location?.hybrid ? "hybrid" : "", posted: Date.parse(j.releasedDate), url: j.postingUrl ?? j.applyUrl,
          department: j.department?.label ?? j.function?.label ?? "", employment: j.typeOfEmployment?.label ?? "", description: stripHtml(Object.values(j.jobAd?.sections ?? {}).map((x: any) => `${x.title ?? ""}\n${x.text ?? ""}`).join("\n\n")) });
      }
      if ((d.content ?? []).length < 100) break;
    }
    } catch (e) { const msg = note429(lane, e); if (!/429|requests are used|aborted/.test(msg)) throw e; (out as any).partial = msg; (out as any).listPartial = true; } // keep what we read
    return out;
  }
  if (ats === "workday") { // a description costs one request, so Workday is asked only for what we want (user, 2026-11-16):
    // the board's own location facets in our area (whatever it names them: S&P's is Location_Region_State_Province) and its job families for technology, engineering, data and finance
    const [tenant, n, site] = slug.split("|"), base = `https://${tenant}.wd${n}.myworkdayjobs.com/wday/cxs/${tenant}/${site}`, company = BOARD_NAME.get(slug) ?? name ?? titleCase(tenant), out: In[] = [], lane = laneOf(ats, slug);
    try {
    await pace(lane, WD_PACE, spent, signal); const vals = wdFacets((await getJson(`${base}/jobs`, 30_000, { appliedFacets: {}, limit: 1, offset: 0, searchText: "" }, signal)).facets);
    const places = vals.filter((v) => /location/i.test(v.p) && !/country/i.test(v.p) && ["nyc", "nj", "metro"].includes(region(usPlace(v.d)) ?? "")).sort((a, b) => Number(b.p === "locations") - Number(a.p === "locations")), states = vals.filter((v) => /^(new york|new jersey|connecticut)$/i.test(v.d.trim()));
    const pick = states.length ? states : places; // a state's facet when there is one (Fidelity, Wells Fargo): each job's place is checked anyway
    const fams = vals.filter((v) => /family/i.test(v.p) && WD_FAMILIES.test(v.d)), famP = fams[0]?.p, famF = famP ? { [famP]: fams.filter((v) => v.p === famP).map((v) => v.id) } : {};
    // and its remote jobs in the US (user, 2026-11-16): a remote-type facet with the US, else locations that are remote US
    const rType = vals.filter((v) => /remote|workplace/i.test(v.p) && /remote|virtual/i.test(v.d) && !/hybrid|flex/i.test(v.d)), us = vals.filter((v) => /country/i.test(v.p) && /^(united states( of america)?|usa?)$/i.test(v.d.trim()));
    const rLoc = vals.filter((v) => /location/i.test(v.p) && !/country/i.test(v.p) && /remote|virtual/i.test(v.d) && region(usPlace(v.d), true) === "remote");
    const remoteF = rType.length ? { [rType[0].p]: rType.filter((v) => v.p === rType[0].p).map((v) => v.id), ...(us.length ? { [us[0].p]: [us[0].id] } : {}) } : rLoc.length ? { [rLoc[0].p]: rLoc.filter((v) => v.p === rLoc[0].p).map((v) => v.id) } : null;
    const passes: [Record<string, string[]>, boolean][] = [...(pick.length ? [[{ [pick[0].p]: pick.filter((v) => v.p === pick[0].p).map((v) => v.id), ...famF }, false] as [any, boolean]] : []), ...(remoteF ? [[{ ...remoteF, ...famF }, true] as [any, boolean]] : [])];
    for (const [facets, remote] of passes) for (let off = 0; off < 2000; off += 20) { // 20 a page is Workday's most (50 and 100 answer 400)
      await pace(lane, WD_PACE, spent, signal); const d = await getJson(`${base}/jobs`, 30_000, { appliedFacets: facets, limit: 20, offset: off, searchText: "" }, signal);
      for (const p of d.jobPostings ?? []) {
        const id = `wd:${slug}:${String(p.externalPath).split("/").pop()}`, loc = usPlace(p.locationsText ?? ""), many = /^\d+ locations$/i.test(loc);
        if ((!many && !region(loc, remote)) || (!famP && !["engineering", "data", "finance"].includes(func(p.title ?? "")))) continue; // no family facet: by title
        if (out.some((j) => j.id === id)) continue; // in both passes
        if (known(id)) { out.push(brief(id, company, many ? (remote ? "Remote, US" : "New York, NY") : loc, false, p.title ?? "")); continue; }
        if (out.filter((j) => !j.known).length >= 100) continue; // the rest next time
        await pace(lane, WD_PACE, spent, signal); const i = (await getJson(`${base}${p.externalPath}`, 30_000, undefined, signal).catch((e) => { if (/429/.test(e.message)) throw e; return null; }))?.jobPostingInfo; if (!i) continue;
        out.push({ id, source: "workday", company, title: i.title, location: [i.location, ...(i.additionalLocations ?? [])].map(usPlace).join("; "), remoteHint: i.remoteType ?? (remote ? "Remote" : ""), posted: Date.parse(i.startDate),
          url: i.externalUrl, employment: i.timeType ?? "", description: stripHtml(i.jobDescription ?? "") });
      }
      if ((d.jobPostings ?? []).length < 20) break;
    }
    } catch (e) { const msg = note429(lane, e); if (!/429|requests are used|aborted/.test(msg)) throw e; (out as any).partial = msg; (out as any).listPartial = true; } // keep what we read
    return out;
  }
  if (ats === "oracle") { // Oracle Recruiting Cloud's own REST: our area's locations and the tech, data and finance categories; a description costs one request
    const [host, site] = slug.split("|"), api = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions`, company = BOARD_NAME.get(slug) ?? name ?? host.split(".")[0], out: In[] = [], lane = laneOf(ats, slug);
    try {
      await pace(lane, 1000, spent, signal); const f = (await getJson(`${api}?onlyData=true&finder=findReqs;siteNumber=${site},facetsList=LOCATIONS%3BCATEGORIES,limit=1`, 30_000, undefined, signal)).items?.[0];
      const places = (f?.locationsFacet ?? []).filter((l: any) => ["nyc", "nj", "metro"].includes(region(String(l.Name)) ?? "")), cats = (f?.categoriesFacet ?? []).filter((c: any) => WD_FAMILIES.test(String(c.Name)));
      for (const pl of places) for (let off = 0; off < 3000; off += 25) {
        await pace(lane, 1000, spent, signal); const it = (await getJson(`${api}?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${site},locationId=${pl.Id},${cats.length ? `selectedCategoriesFacet=${cats.map((c: any) => c.Id).join("%3B")},` : ""}limit=25,offset=${off},sortBy=POSTING_DATES_DESC`, 30_000, undefined, signal)).items?.[0];
        for (const r of it?.requisitionList ?? []) {
          const id = `or:${slug}:${r.Id}`; if (!cats.length && !FOCUS(r.Title ?? "")) continue;
          if (known(id)) { out.push(brief(id, company, String(r.PrimaryLocation ?? pl.Name), false, r.Title ?? "")); continue; }
          if (out.filter((j) => !j.known).length >= 300) continue; // the rest next time
          await pace(lane, 1000, spent, signal); const d = (await getJson(`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${r.Id}%22,siteNumber=${site}`, 30_000, undefined, signal).catch((e) => { if (/429/.test(e.message)) throw e; return null; }))?.items?.[0]; if (!d) continue;
          out.push({ id, source: "oracle", company, title: d.Title ?? r.Title, location: [...new Set([r.PrimaryLocation, ...(r.secondaryLocations ?? []).map((x: any) => x.Name)].filter(Boolean))].join("; "), remoteHint: r.WorkplaceType ?? "",
            posted: Date.parse(r.PostedDate), url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`, department: r.JobFamily ?? "", employment: r.JobSchedule ?? "",
            description: stripHtml([d.ExternalDescriptionStr, d.ExternalResponsibilitiesStr, d.ExternalQualificationsStr, d.CorporateDescriptionStr].filter(Boolean).join("\n\n")) });
        }
        if ((it?.requisitionList ?? []).length < 25) break;
      }
    } catch (e) { const msg = note429(lane, e); if (!/429|requests are used|aborted/.test(msg)) throw e; (out as any).partial = msg; (out as any).listPartial = true; }
    return out;
  }
  if (ats === "custom") { // a big employer's own career site, a minute at most (plain readers here, browser ones on the Mac)
    if (signal?.aborted) throw new Error("aborted");
    // "known": stored with its text already (a job stored from a list alone gets its page read when there's time)
    const stored = (db.prepare("select id from jobs where id like ? and closed is null and length(description) >= 300").all(`cu:${slug}:%`) as any[]).map((r) => r.id.slice(`cu:${slug}:`.length));
    let r: { jobs: any[]; partial: boolean; listPartial?: boolean; listed?: string[] };
    if (PLAIN[slug]) r = await PLAIN[slug].read(Date.now() + 60_000, new Set(stored), (loc, title) => FOCUS(title) && !!region(usPlace(loc), /\bremote\b/i.test(`${loc} ${title}`)));
    else {
      if (!process.env.HOST_BRIDGE) throw new Error("the browser crawler runs on the Mac (HOST_BRIDGE)");
      r = await withCrawlBridge(async () => {
        if (signal?.aborted) throw new Error("aborted");
        const sig = signal ? AbortSignal.any([AbortSignal.timeout(90_000), signal]) : AbortSignal.timeout(90_000);
        const res = await fetch(`${process.env.HOST_BRIDGE}/crawl`, { method: "POST", body: JSON.stringify({ site: slug, known: stored }), signal: sig });
        const body = await res.json() as any; if (!res.ok) throw new Error(body?.error ?? `crawl ${res.status}`); return body;
      });
    }
    const company = BOARD_NAME.get(slug) ?? slug, out: In[] = [];
    for (const p of r.jobs) {
      const parts = usPlace(String(p.location ?? "")).split(/\s*;\s*/).map(usPlace), ours = parts.filter((x) => region(x)); // Deloitte lists 40 cities: ours, then how many more
      const id = `cu:${slug}:${p.id}`, location = parts.length > 6 && ours.length ? `${ours.join("; ")}; +${parts.length - ours.length} more` : parts.join("; ");
      if (stored.includes(String(p.id)) && !p.description) { out.push(brief(id, company, location)); continue; }
      if (!p.description && !p.location && openIds.get(id)) { out.push(brief(id, company, "New York, NY")); continue; }
      if (!region(location) || !FOCUS(p.title ?? "")) { if (p.description && location && !region(location)) db.prepare("update jobs set closed = ? where id = ? and closed is null").run(now(), id); continue; } // its page says it's elsewhere
      out.push({ id, source: "custom", company, title: String(p.title), location, url: String(p.url), posted: p.posted, department: p.department ?? "", salary: p.salary ?? null, description: stripHtml(String(p.description ?? "")) || `${p.title}. ${p.department ?? ""}` });
    }
    if (r.listed?.length) (out as any).listed = r.listed.map((pid) => `cu:${slug}:${pid}`);
    if (r.partial) (out as any).partial = "a minute's reading";
    if (r.listPartial ?? r.partial) (out as any).listPartial = true;
    return out;
  }
  if (ats === "eightfold") { // Eightfold's career API (Netflix: v2; Microsoft: pcsx): NYC, tech, data and finance titles; a description costs one request
    const [host, domain, flavor] = slug.split("|"), company = BOARD_NAME.get(slug) ?? domain.split(".")[0], out: In[] = [], pcsx = flavor === "pcsx", size = pcsx ? 10 : 100, lane = laneOf(ats, slug);
    // "New York,New York,United States of America" (v2) and "United States, New York, New York" (pcsx) as "New York, NY"
    const place = (l: string) => { const p = String(l).split(/\s*,\s*/); return usPlace(p[0] === "United States" ? `${p[2] ?? ""}, ${p[1] ?? ""}` : `${p[0]}, ${p[1] ?? ""}`); };
    try {
      for (let start = 0; start < 1500; start += size) {
        await pace(lane, 3000, spent, signal); // Microsoft's Eightfold answered 429 at one a second
        const d = await getJson(pcsx ? `https://${host}/api/pcsx/search?domain=${domain}&query=&location=${encodeURIComponent("New York, NY")}&start=${start}` : `https://${host}/api/apply/v2/jobs?domain=${domain}&location=${encodeURIComponent("New York")}&start=${start}&num=${size}`, 30_000, undefined, signal);
        const list: any[] = (pcsx ? d.data?.positions : d.positions) ?? [];
        for (const p of list) {
          const location = [...new Set((p.locations ?? []).filter((l: string) => !/multiple locations/i.test(l)).map(place))].join("; ");
          if (!region(location) || !FOCUS(p.name ?? "")) continue;
          const id = `ef:${slug}:${p.id}`;
          if (known(id)) { out.push(brief(id, company, location)); continue; }
          if (out.filter((j) => !j.known).length >= 300) continue;
          await pace(lane, 3000, spent, signal);
          const det = await getJson(pcsx ? `https://${host}/api/pcsx/position_details?position_id=${p.id}&domain=${domain}&hl=en` : `https://${host}/api/apply/v2/jobs/${p.id}?domain=${domain}`, 30_000, undefined, signal).catch((e) => { if (/429/.test(e.message)) throw e; return null; });
          const desc = pcsx ? det?.data?.jobDescription : det?.job_description; if (!desc) continue;
          out.push({ id, source: "eightfold", company, title: p.name, location, remoteHint: p.work_location_option ?? p.workLocationOption ?? "", posted: (p.t_create ?? p.postedTs ?? p.creationTs ?? 0) * 1000,
            url: p.canonicalPositionUrl ?? det?.data?.publicUrl ?? `https://${host}${p.positionUrl ?? ""}`, department: p.department ?? "", description: stripHtml(String(desc)) });
        }
        if (list.length < size) break;
      }
    } catch (e) { const msg = note429(lane, e); if (!/429|requests are used|aborted/.test(msg)) throw e; (out as any).partial = msg; (out as any).listPartial = true; }
    return out;
  }
  if (ats === "amazon") { // amazon.jobs's own search: the NYC area, newest first, descriptions included; tech, data and finance titles
    const out: In[] = [], lane = laneOf(ats, slug);
    try {
      for (let off = 0; off < 3000; off += 100) {
        await pace(lane, 1000, spent, signal); const d = await getJson(`https://www.amazon.jobs/en/search.json?normalized_location%5B%5D=New+York%2C+New+York%2C+USA&normalized_location%5B%5D=Jersey+City%2C+New+Jersey%2C+USA&result_limit=100&offset=${off}&sort=recent`, 30_000, undefined, signal);
        for (const j of d.jobs ?? []) {
          const locs = (Array.isArray(j.locations) ? j.locations : []).map((l: any) => { try { return typeof l === "string" ? JSON.parse(l).normalizedLocation ?? l : l?.normalizedLocation; } catch { return l; } }).filter(Boolean);
          const location = [...new Set([j.normalized_location, ...locs].filter(Boolean).map((x: string) => usPlace(x)))].join("; ");
          if (!region(location) || !FOCUS(j.title ?? "")) continue;
          out.push({ id: `amz:amazon:${j.id_icims ?? j.id}`, source: "amazon", company: "Amazon", title: j.title, location, posted: Date.parse(j.posted_date), url: `https://www.amazon.jobs${j.job_path}`,
            department: j.job_category ?? "", employment: j.job_schedule_type ?? "", description: stripHtml([j.description, j.basic_qualifications && `Basic qualifications:\n${j.basic_qualifications}`, j.preferred_qualifications && `Preferred qualifications:\n${j.preferred_qualifications}`].filter(Boolean).join("\n\n")) });
        }
        if ((d.jobs ?? []).length < 100) break;
      }
    } catch (e) { const msg = note429(lane, e); if (!/429|requests are used|aborted/.test(msg)) throw e; (out as any).partial = msg; (out as any).listPartial = true; }
    return out;
  }
  if (ats === "greenhouse") {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, 30_000, undefined, signal);
    return d.jobs.map((j: any) => { const desc = stripHtml(j.content ?? "");
      return { id: `gh:${slug}:${j.id}`, source: "greenhouse", company: j.company_name || titleCase(slug), title: j.title, location: [j.location?.name, ...(j.offices ?? []).map((o: any) => o.name)].filter(Boolean).join("; "),
        posted: Date.parse(j.first_published ?? j.updated_at), url: j.absolute_url, department: j.departments?.[0]?.name ?? "", description: `${desc}${/evergreen/i.test(j.requisition_id ?? "") ? "\n(requisition: evergreen)" : ""}` }; });
  }
  if (ats === "lever") {
    const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`, 30_000, undefined, signal);
    return d.map((j: any) => { const sr = j.salaryRange, desc = [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${stripHtml(l.content ?? "")}`), j.additionalPlain].filter(Boolean).join("\n\n");
      return { id: `lv:${slug}:${j.id}`, source: "lever", company: titleCase(slug), title: j.text, location: [j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean).join("; "), remoteHint: j.workplaceType,
        salary: sr?.min ? { min: sr.min, max: sr.max ?? sr.min, period: /hour/i.test(sr.interval ?? "") ? "hour" : "year" } : null, posted: j.createdAt, url: j.hostedUrl, department: j.categories?.team ?? j.categories?.department ?? "", employment: j.categories?.commitment ?? "", description: desc }; });
  }
  if (ats === "ashby") {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, 30_000, undefined, signal);
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
export async function refreshBoards(atses = ["greenhouse", "lever", "ashby", "workable"], what = "boards", workers = 6, signal?: AbortSignal) {
  const list = db.prepare(`select ats, slug, name from companies where ats in (${atses.map(() => "?").join(",")})`).all(...atses) as { ats: string; slug: string; name: string | null }[];
  const spent = new Map<string, number>();
  let n = 0, bad = 0;
  let next = 0; // a pool of `workers` boards at a time; requests within a lane still wait their turn (pace)
  const one = async ({ ats, slug, name }: { ats: string; slug: string; name: string | null }) => {
    try {
      const jobs = await readBoard(ats, slug, (id) => !!openIds.get(id), spent, signal, name), seen = new Set<string>(), partial = (jobs as any).partial as string | undefined, listPartial = (jobs as any).listPartial as boolean | undefined;
      batch(() => {
        for (const j of jobs) if (j.known ? (touch.run(now(), j.id), true) : save(j)) { seen.add(j.id); n++; }
        for (const id of ((jobs as any).listed as string[] | undefined) ?? []) if (!seen.has(id) && openIds.get(id)) { touch.run(now(), id); seen.add(id); }
        if (!listPartial) sweep(ats, seen, `${PREFIX[ats]}:${slug}:`); // a board whose list was cut short closes nothing
        db.prepare("update companies set name = coalesce(?, name), last_ok = ?, last_err = ?, open = ? where ats = ? and slug = ?").run(jobs[0]?.company ?? null, now(), partial ? `read in part (${partial})` : null, seen.size, ats, slug);
      });
    } catch (e) { bad++; note429(laneOf(ats, slug), e); db.prepare("update companies set last_err = ? where ats = ? and slug = ?").run((e as Error).message, ats, slug); }
  };
  await Promise.all(Array.from({ length: Math.min(workers, list.length) }, async () => { while (next < list.length && !signal?.aborted) await one(list[next++]); }));
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), what, bad ? 0 : 1, n, `${list.length} boards, ${bad} failed`); // failed or not, the next try is the next run
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
// evenly: NYC newest first every 4 hours, stopping at a page we already have; remote US every 6 hours. Before, one daily
// burst read the 1,000 newest (about 4 hours of the ~6,600 NYC postings a day) and dropped each a week later.
// NYC 6 sweeps a day of ADZ_NYC pages, remote 4 of ADZ_REMOTE: 6 × 10 + 4 × 3 = 72 calls a day, 2,232 in a 31-day month.
const ADZ_MONTH = Number(env("ADZUNA_MONTHLY_CALLS")) || 2300, ADZ_REMOTE = 3, ADZ_NYC = Math.max(1, Math.floor((ADZ_MONTH / 31 - 4 * ADZ_REMOTE) / 6));
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
  const done = new Set<string>(); // categories already read down to a page we had
  for (let p = 1; p <= Math.min(pages, left); p++) {
    // NYC: most pages go to IT and accounting & finance (user: the fullest view of tech and finance), a few to everything
    const cat = which === "nyc" ? (p <= Math.ceil(pages * 0.4) ? "&category=it-jobs" : p <= Math.ceil(pages * 0.7) ? "&category=accounting-finance-jobs" : "") : "";
    const page = which === "nyc" ? (p <= Math.ceil(pages * 0.4) ? p : p <= Math.ceil(pages * 0.7) ? p - Math.ceil(pages * 0.4) : p - Math.ceil(pages * 0.7)) : p;
    if (done.has(cat)) continue;
    const u = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=30&sort_by=date${which === "nyc" ? `&where=${encodeURIComponent("New York, NY")}&distance=40${cat}` : "&what=remote&where=United%20States"}&content-type=application/json`;
    let d: any; calls++; try { d = await getJson(u); } catch { break; }
    if (!d.results?.length) { done.add(cat); continue; }
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
    if (!fresh) done.add(cat); // a whole page we already had: everything older in this category is in too
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
// ---------- finding employers' own boards ----------
// The board lists of github.com/kalil0321/ats-scrapers (MIT; they fold in Latmay's CC BY career-page list): ~37k
// employers' board addresses on the platforms read here. Only the addresses are used, as candidates for discover(); each
// is checked live before it's added. Name-guessing alone found a board for 212 of 2,595 employers (2026-11-23). Weekly.
const DIR_ATS = ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "workday", "oracle"], HEAVY = new Set(["workday", "oracle"]);
/** CSV rows (quoted fields, commas and line breaks inside quotes). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
/** A listed board as readBoard() names it: Workday "tenant|N|site", Oracle "host|site", the others their slug. */
export function dirSlug(ats: string, slug: string, url: string) {
  if (ats === "workday") { const m = url.match(/^https:\/\/([a-z0-9-]+)\.wd(\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i); return m ? `${m[1].toLowerCase()}|${m[2]}|${m[3]}` : null; }
  if (ats === "oracle") { const m = url.match(/^https:\/\/([a-z0-9.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[^/]+\/sites\/([^/?#]+)/i); return m ? `${m[1].toLowerCase()}|${m[2]}` : null; }
  const s = (slug || url.replace(/\/+$/, "").split("/").pop() || "").trim();
  return /^[\w.-]+$/.test(s) ? (ats === "smartrecruiters" ? s : s.toLowerCase()) : null;
}
export async function refreshDirectory(signal?: AbortSignal) {
  const rows: [string, string, string][] = [];
  for (const ats of DIR_ATS) {
    const r = await fetch(`https://raw.githubusercontent.com/kalil0321/ats-scrapers/HEAD/ats-companies/${ats}.csv`, { headers: { "user-agent": UA["user-agent"] }, signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]) });
    if (!r.ok) throw new Error(`${ats}: HTTP ${r.status}`);
    const [head, ...lines] = csvRows(await r.text()), at = (n: string) => head.indexOf(n);
    for (const l of lines) { const name = (l[at("name")] ?? "").trim(), slug = dirSlug(ats, l[at("slug")] ?? "", l[at("url")] ?? ""); if (name && slug) rows.push([ats, slug, name]); }
  }
  if (rows.length < 10_000) throw new Error(`only ${rows.length} boards listed`); // a broken download keeps last week's
  batch(() => { db.exec("delete from directory"); const ins = db.prepare("insert or ignore into directory values (?,?,?,?)"); for (const [a, sl, n] of rows) ins.run(a, sl, n, ckey(n)); });
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "directory", 1, rows.length, `${rows.length} boards listed`);
  return rows.length;
}
// Names that post for others (job aggregators, AI-training gig work, offshore staffing): not an employer's own board
const NOT_EMPLOYER = /\b(jobgether|mindrift|toloka|pavago|weekday|crossover|outlier|data ?annotation|remotasks|alignerr|clark davis|lancesoft|cynet|bcforward|vdart|tekwissen|pyramid consulting|amnet|hireright|jobs? via)\b/i;
/** Employers seen only through Adzuna: their own board, from the board lists first, else guessed from the name. A
 *  listed board is added when it has jobs here and is that employer's (its owner's name, or a title Adzuna showed);
 *  Workday and Oracle boards go through the Mac at a slow pace, so a run tries 8 at most. Misses are retried monthly
 *  (lists only), as the lists grow. */
export async function discover(max = 400, signal?: AbortSignal) {
  if (!(db.prepare("select count(*) n from directory").get() as any).n) await refreshDirectory(signal).catch(() => {}); // before the first weekly read
  const cands = db.prepare(`select company, ckey, count(*) n, group_concat(title, char(10)) titles, (select at from probed p where p.ckey = j.ckey) prev from jobs j
    where source = 'adzuna' and closed is null and dup_of is null and ckey not in (select ckey from probed where found <> '' or at > ?)
    and ckey not in (select distinct ckey from jobs where source <> 'adzuna' and closed is null) group by ckey order by n desc limit ?`).all(now() - 30 * 86400, max) as any[];
  const spent = new Map<string, number>(), have = db.prepare("select 1 from companies where ats = ? and lower(slug) = lower(?)");
  let added = 0, tried = 0, fromList = 0, heavy = 0;
  for (const c of cands) {
    if (signal?.aborted) break;
    tried++;
    const titles = new Set(String(c.titles ?? "").split("\n").map(tkey)), skip = STAFFING.test(c.company) || NOT_EMPLOYER.test(c.company);
    const listed = skip ? [] : (db.prepare("select ats, slug, name, ck from directory where ck like ?").all(`${c.ckey.slice(0, 4)}%`) as any[]).filter((d) => sameCompany(d.ck, c.ckey))
      .sort((a, b) => Number(b.ck === c.ckey) - Number(a.ck === c.ckey) || Number(HEAVY.has(a.ats)) - Number(HEAVY.has(b.ats))).slice(0, 4);
    const guesses = skip || c.prev ? [] : [...new Set([c.ckey, c.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), c.company.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "")])]
      .filter((x) => x.length > 2).flatMap((slug) => ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"].map((ats) => ({ ats, slug, name: null, ck: "" })));
    let found = "";
    for (const d of [...listed.map((x) => ({ ...x, listed: true })), ...guesses.map((x) => ({ ...x, listed: false }))]) {
      if (found || signal?.aborted) break;
      if (have.get(d.ats, d.slug) || (HEAVY.has(d.ats) && heavy >= 8)) continue;
      if (HEAVY.has(d.ats)) heavy++;
      try {
        const jobs = await readBoard(d.ats, d.slug, () => true, spent, signal, d.name), here = jobs.filter((j) => region(j.location, j.isRemote));
        const mine = d.listed ? here.some((j) => j.title && titles.has(tkey(j.title))) || here.some((j) => sameCompany(ckey(j.company), c.ckey)) || d.ck === c.ckey
          : jobs.some((j) => ckey(j.company) === c.ckey || d.ats !== "greenhouse"); // a guessed name: as before
        if (here.length && mine) { found = `${d.ats}:${d.slug}`; if (d.listed) fromList++; db.prepare("insert or ignore into companies (ats, slug, name, added) values (?, ?, ?, ?)").run(d.ats, d.slug, d.name, now()); }
      } catch {}
    }
    db.prepare("insert or replace into probed values (?, ?, ?)").run(c.ckey, now(), found);
    if (found) added++;
  }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "discover", 1, added, `${tried} employers tried: ${added} boards added (${fromList} from the board lists)`);
  return { tried, added, fromList };
}

const pop64 = (x: bigint) => { let n = 0; while (x) { x &= x - 1n; n++; } return n; };
/** Duplicates across sources: the same title in the same area at the same company (under either of its names, so "Citi"
 *  on Workday and "Citibank" on Adzuna meet), or the same company with a near-identical description. Each cluster keeps
 *  one: the employer's own record (its board > government > remote boards > Adzuna); the others point to it and show
 *  as "also on". One transaction for changed rows only. */
export function dedupe() {
  const rank: Record<string, number> = { greenhouse: 0, lever: 0, ashby: 0, workday: 0, smartrecruiters: 0, workable: 0, oracle: 0, amazon: 0, eightfold: 0, custom: 0, nycjobs: 1, usajobs: 1, remotive: 2, himalayas: 2, adzuna: 3 };
  const raw = db.prepare("select id, source, ckey, title, region, fp, dup_of, also from jobs where closed is null").all() as any[];
  const open = raw.map((j) => { const tk = tkey(j.title); return { ...j, tk, fw: tk.split(" ")[0] ?? "", hasFp: !!j.fp, fpBig: j.fp ? BigInt(`0x${j.fp}`) : 0n }; });
  const up = open.map((_, i) => i), find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i]))), join = (a: number, b: number) => { up[find(a)] = find(b); };
  const groups = (key: (j: any) => string | null) => { const m = new Map<string, number[]>(); open.forEach((j, i) => { const k = key(j); if (k != null) (m.get(k) ?? m.set(k, []).get(k)!).push(i); }); return m.values(); };
  for (const l of groups((j) => `${j.tk}|${j.region}`)) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++)
    if (find(l[x]) !== find(l[y]) && sameCompany(open[l[x]].ckey, open[l[y]].ckey)) join(l[x], l[y]);
  for (const l of groups((j) => (j.hasFp ? `${j.ckey}|${j.fw}` : null))) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
    if (find(l[x]) === find(l[y])) continue;
    if (pop64(open[l[x]].fpBig ^ open[l[y]].fpBig) <= 6) join(l[x], l[y]);
  }
  const clusters = new Map<number, typeof open>(); open.forEach((j, i) => { const r = find(i); (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(j); });
  let dups = 0; const setDupAlso = db.prepare("update jobs set dup_of = ?, also = ? where id = ?");
  batch(() => {
    for (const c of clusters.values()) {
      if (c.length < 2) { if (c[0].dup_of !== null || c[0].also !== null) setDupAlso.run(null, null, c[0].id); continue; }
      c.sort((a, b) => (rank[a.source] ?? 3) - (rank[b.source] ?? 3) || a.id.localeCompare(b.id));
      const also = [...new Set(c.slice(1).map((d) => d.source).filter((s) => s !== c[0].source))].join(",") || null;
      if (c[0].dup_of !== null || c[0].also !== also) setDupAlso.run(null, also, c[0].id);
      for (const d of c.slice(1)) { dups++; if (d.dup_of !== c[0].id || d.also !== null) setDupAlso.run(c[0].id, null, d.id); }
    }
  });
  marketCache.clear();
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
/** What stated jobs of a field, level and place pay (middle half and median, 15 or more salaries), for jobs that state none: an estimate, marked so. */
let payTable: { at: number; m: Map<string, { p25: number; median: number; p75: number; n: number }> } | null = null;
export function payEstimate(f: string, lvl: string, reg: string) {
  if (!payTable || Date.now() - payTable.at > 3600_000) {
    const groups = new Map<string, number[]>();
    for (const r of db.prepare("select func, seniority, region, (salary_min + coalesce(salary_max, salary_min)) / 2.0 * (case when salary_period = 'hour' then 2080 else 1 end) pay from jobs where closed is null and dup_of is null and salary_min is not null and coalesce(salary_est, 0) = 0").all() as any[])
      for (const k of [`${r.func}|${r.seniority}|${r.region}`, `${r.func}|${r.seniority}|*`]) (groups.get(k) ?? groups.set(k, []).get(k)!).push(r.pay);
    const m = new Map<string, any>();
    for (const [k, l] of groups) if (l.length >= 15) { l.sort((a, b) => a - b); m.set(k, { p25: pct(l, 0.25), median: pct(l, 0.5), p75: pct(l, 0.75), n: l.length }); }
    payTable = { at: Date.now(), m };
  }
  return payTable.m.get(`${f}|${lvl}|${reg}`) ?? payTable.m.get(`${f}|${lvl}|*`) ?? null;
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
  return { total, page, rows: rows.map((r: any) => ({ ...r, flags: JSON.parse(r.flags ?? "[]"), also: r.also ? r.also.split(",") : [], est: r.salary_min == null && r.func !== "other" ? payEstimate(r.func, r.seniority, r.region) : null })), facets: { region: facet("j.region"), remote: facet("j.remote"), seniority: facet("j.seniority"), func: facet("j.func"), source: facet("j.source") } };
}
export function job(id: string) {
  const r: any = db.prepare("select * from jobs where id = ?").get(id);
  if (!r) return null;
  const co = db.prepare("select count(*) open, sum(case when flags like '%open % days%' then 1 else 0 end) old, sum(case when salary_min is null then 1 else 0 end) nosal from jobs where ckey = ? and closed is null and dup_of is null").get(r.ckey) as any;
  const closed30 = (db.prepare("select count(*) n from jobs where ckey = ? and closed > ?").get(r.ckey, now() - 30 * 86400) as any).n;
  return { ...r, fp: undefined, flags: JSON.parse(r.flags ?? "[]"), also: r.also ? r.also.split(",") : [], employer: { open: co.open, openOver60Days: co.old, withoutSalary: co.nosal, closedLast30Days: closed30 },
    est: r.salary_min == null && r.func !== "other" ? payEstimate(r.func, r.seniority, r.region) : null };
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
  // trends count employers' own systems and the government's, not aggregators: Adzuna's and the remote boards' volume follows how much of them we read (2026-11-20: +79% that wasn't hiring)
  const STEADY = `substr(j.id, 1, 3 + instr(substr(j.id, 4), ':')) not in (${late.map(() => "?").join(",")}) and j.source not in ('adzuna', 'himalayas', 'remotive')`; // "gh:slug:"; "nyc:" is never late
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
  const fromEmployers = open.filter((r) => !r.id.startsWith("az:")).length;
  return { since: start, at: t, ...summary(rows), fromEmployers,
    weeks: Array.from({ length: nW }, (_, i) => { const ago = nW - 1 - i; return { from: t - (ago + 1) * W, new: born.get(ago) ?? 0, closed: gone.get(ago) ?? 0, pay: paid.get(ago) ?? null }; }),
    fields: by((r) => r.func), levels: by((r) => r.seniority),
    companies: by((r) => r.ckey, (l) => { const o = l.filter((r) => r.closed == null);
      return { name: o[0]?.company ?? l[0].company, new30: distinct(l.filter((r) => r.t0 >= t - 30 * D)), closed30: distinct(l.filter((r) => r.gone && r.closed >= t - 30 * D)), stale: o.length ? Math.round((o.filter((r) => r.t0 < t - 60 * D).length / o.length) * 100) : 0 }; }).slice(0, 20),
    roles: by((r) => role(r.title)).filter((g) => g.key).slice(0, 20),
    grid: Object.fromEntries([...group(open, (r) => r.func)].map(([f, l]) => [f, Object.fromEntries([...group(l, (r) => r.seniority)].map(([s, m]) => [s, pays(m)] as const).filter(([, p]) => p.length >= 5).map(([s, p]) => [s, { pay: pct(p, 0.5), n: p.length }]))])) };
}

/** Jobs are kept a year after they close (the market's trends reach back that far), then deleted with their search
 *  rows. Embeddings only serve open non-duplicate jobs; closed duplicates and old run/skip tables are cleared too. */
export function prune() {
  const t = now(), old = t - 365 * 86400;
  batch(() => {
    db.prepare("delete from jobs_fts2 where id in (select id from jobs where closed < ? or (closed is not null and dup_of is not null))").run(old);
    db.prepare("delete from jobs where closed < ?").run(old);
    db.exec("delete from emb where id in (select id from jobs where closed is not null or dup_of is not null)");
    db.prepare("delete from adz_keys where at < ?").run(t - 30 * 86400);
    db.prepare("delete from adz_skip where at < ?").run(t - 30 * 86400);
    db.prepare("delete from checks where at < ?").run(t - 7 * 86400);
    db.prepare("delete from runs where at < ?").run(t - 366 * 86400);
    db.exec("insert into jobs_fts2(jobs_fts2, rank) values('merge', 500)");
  });
  marketCache.clear();
}

export const BIG = ["smartrecruiters", "workday", "oracle", "amazon", "eightfold"];
const afterIngest = (alsoPrune = false) => { dedupe(); if (alsoPrune) prune(); marketCache.clear(); };
/** The jobs radar's crons (server/cron.ts, New York time): every source at least 4 times a day, each within its limits. */
/** Hourly (cron): open jobs that no read has seen for 2 days, checked at their own page (user, 2026-11-20: are they still
 *  open?). An Adzuna ad's page answers 404 "no longer available" once it's gone; a job board's (Ashby, Lever, Greenhouse,
 *  Workable, SmartRecruiters) 404 or 410 too, or Greenhouse's "?error=true" redirect. Gone: closed. There: seen now, so it's
 *  checked again in 2 days. One page every 1.5 s, oldest first; a refusal (403, 429) ends the run until the next hour. */
const LIVE_SOURCES = ["adzuna", "ashby", "lever", "greenhouse", "workable", "smartrecruiters"];
export async function checkLiveness(budget = 800, signal?: AbortSignal, minutes = 15) { // a quarter hour of checking a run (a page takes ~2 s with the pause)
  const until = Date.now() + minutes * 60_000;
  const rows = db.prepare(`select id, url, source from jobs where closed is null and dup_of is null and last_seen < ? and source in (${LIVE_SOURCES.map(() => "?").join(",")}) and url like 'https://%' order by last_seen limit ?`).all(now() - 2 * 86400, ...LIVE_SOURCES, budget) as any[];
  const gone = db.prepare("update jobs set closed = ? where id = ? and closed is null"), there = db.prepare("update jobs set last_seen = ? where id = ?");
  let closed = 0, open = 0;
  for (const r of rows) {
    if (signal?.aborted || Date.now() > until) break;
    await new Promise((ok) => setTimeout(ok, 1500));
    const res = await fetch(r.url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res) continue;
    res.body?.cancel().catch(() => {}); // the status says it: no need for the page
    if (res.status === 403 || res.status === 429) break;
    if (res.status === 404 || res.status === 410 || /[?&]error=true/.test(res.url)) { gone.run(now(), r.id); closed++; }
    else if (res.ok) { there.run(now(), r.id); open++; }
  }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "liveness", 1, closed, `${closed + open} checked: ${closed} gone, ${open} still open`);
  return closed;
}
export const jobsTasks = (): [string, string, string, (signal: AbortSignal) => Promise<unknown>, number][] => [
  ["jobs-boards", "5 * * * *", "Greenhouse, Lever, Ashby and Workable boards and NYC's jobs (liveness); then dedupe and prune", async (s) => { await refreshBoards(undefined, "boards", 6, s); if (!s.aborted) await refreshNycJobs(); afterIngest(true); }, 30 * 60_000],
  ["jobs-adzuna-nyc", "20 */4 * * *", "Adzuna around NYC (40% IT, 30% finance, 30% everything), within its monthly calls", async () => { const r = await refreshAdzuna("nyc"); afterIngest(); return r; }, 15 * 60_000],
  ["jobs-adzuna-remote", "35 */6 * * *", "Adzuna remote US", async () => { const r = await refreshAdzuna("remote"); afterIngest(); return r; }, 10 * 60_000],
  ["jobs-remote-boards", "40 */6 * * *", "Remotive and Himalayas (a few reads a day at most)", async () => { const r = await refreshRemote(); afterIngest(); return r; }, 15 * 60_000],
  ["jobs-usajobs", "50 */6 * * *", "USAJOBS", async () => { const r = await refreshUsajobs(); afterIngest(); return r; }, 15 * 60_000],
  ["jobs-big-boards", "0 3 * * *", "the big employers' own systems (Workday, Oracle, Eightfold, Amazon, SmartRecruiters): paced lanes in parallel", async (s) => { await refreshBoards(BIG, "boards-slow", 12, s); afterIngest(); }, 90 * 60_000],
  ["jobs-custom", "15 4,9,13,17 * * *", "the career sites read in a browser or by hand (Google, Meta, Apple, Goldman, Bloomberg…): more job pages read each pass", async (s) => { await refreshBoards(["custom"], "boards-custom", 6, s); afterIngest(); }, 20 * 60_000],
  ["jobs-texts", "40 * * * *", "the text of Meta, Apple and Bloomberg jobs a crawl listed but didn't get to read (a minute of the Mac's browser)", (s) => backfillTexts(60, s), 5 * 60_000],
  ["jobs-directory", "30 4 * * 0", "the board lists: employers' board addresses for discovery (weekly)", (s) => refreshDirectory(s), 10 * 60_000],
  ["jobs-discover", "0 5 * * *", "new employer boards for Adzuna's employers: from the board lists, else by name", (s) => discover(400, s), 40 * 60_000],
  ["jobs-liveness", "25 * * * *", "jobs no read has seen for 2 days, checked at their own page (Adzuna and the job boards): gone ones close", async (s) => { const n = await checkLiveness(800, s); if (n) afterIngest(); return n; }, 20 * 60_000],
];

/** Every employer board with how its last read went (admin.html's job sources): failing, partial or empty first. */
export const jobSources = () => (db.prepare(`select ats, slug, coalesce(name, slug) name, open, last_ok, last_err, added from companies order by (coalesce(last_err, '') = '') , coalesce(open, 0) > 0, coalesce(open, 0) desc`).all() as any[])
  .map((c) => ({ ...c, stale: (db.prepare("select count(*) n from jobs where id like ? and closed is null and last_seen < ?").get(`${PREFIX[c.ats] ?? c.ats}:${c.slug}:%`, now() - 2 * 86400) as any).n }));
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
/** What this site has seen of a job and its employer, for the red-flag check (jobs-ai.ts checkJob). */
export function jobHistory(id: string) {
  const j: any = db.prepare("select * from jobs where id = ?").get(id); if (!j) return null;
  const t = now(), D = 86400, T0 = "coalesce(posted, first_seen)", one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
  const co = one(`select count(*) open, coalesce(sum(${T0} < ?), 0) old from jobs where ckey = ? and closed is null and dup_of is null`, t - 60 * D, j.ckey);
  const flow = one(`select count(distinct case when ${T0} >= ? then lower(title) end) new30, count(distinct case when ${T0} >= ? and ${T0} < ? then lower(title) end) prev30,
    coalesce(sum(closed >= ? and closed - first_seen >= ${D} and source != 'adzuna'), 0) gone30 from jobs where ckey = ? and dup_of is null`, t - 30 * D, t - 60 * D, t - 30 * D, t - 30 * D, j.ckey);
  const up = (db.prepare(`select (closed - ${T0}) / ${D}.0 d from jobs where ckey = ? and closed > ? and closed - first_seen >= ${D} and source != 'adzuna' and dup_of is null`).all(j.ckey, t - 180 * D) as any[]).map((r) => r.d).sort((a, b) => a - b);
  const same = db.prepare(`select ${T0} t0, closed from jobs where ckey = ? and lower(title) = lower(?) and region = ? and id != ? and source != 'adzuna' and (closed is null or closed > ?)`).all(j.ckey, j.title, j.region, id, t - 180 * D) as any[];
  const m = market({ func: j.func, seniority: j.seniority, region: j.region });
  return { job: { ...j, flags: JSON.parse(j.flags ?? "[]"), also: j.also ? j.also.split(",") : [] }, daysUp: Math.round((t - (j.posted ?? j.first_seen)) / D),
    employer: { open: co.open, openOver60: co.old, new30: flow.new30, prev30: flow.prev30, gone30: flow.gone30, medianDaysUp: up.length >= 5 ? pct(up, 0.5) : null, upSample: up.length },
    sameTitle: { days: new Set(same.map((r) => new Date(r.t0 * 1000).toDateString())).size, open: same.filter((r) => r.closed == null).length },
    copies: (one("select count(*) n from jobs where ckey = ? and fp = ? and closed is null and id != ?", j.ckey, j.fp, id)).n as number,
    pay: j.salary_min != null && !j.salary_est ? ((j.salary_min + (j.salary_max ?? j.salary_min)) / 2) * (j.salary_period === "hour" ? 2080 : 1) : null, market: { p25: m.p25, median: m.pay, p75: m.p75, n: m.withPay } };
}
/** A company page (nyc/company.html): the employer under any of its names, its open jobs here, how it hires, what it pays. */
export const employerKeys = (name: string) => { const ck = ckey(name); return ck ? (db.prepare("select distinct ckey from jobs where ckey like ? and closed is null").all(`${ck.slice(0, 4)}%`) as any[]).map((r) => r.ckey as string).filter((k) => sameCompany(k, ck)) : []; };
export function employer(name: string) {
  const keys = employerKeys(name);
  if (!keys.length) return null;
  const inK = `j.ckey in (${keys.map(() => "?").join(",")})`, t = now(), D = 86400;
  const rows = db.prepare(`select j.id, j.source, j.company, j.title, j.location, j.region, j.remote, j.salary_min, j.salary_max, j.salary_period, j.salary_est, j.posted, j.first_seen, j.url, j.seniority, j.func, j.flags
    from jobs j where ${inK} and j.closed is null and j.dup_of is null order by coalesce(j.posted, j.first_seen) desc`).all(...keys) as any[];
  const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...keys, ...a) as any;
  const up = (db.prepare(`select (j.closed - coalesce(j.posted, j.first_seen)) / ${D}.0 d from jobs j where ${inK} and j.closed > ? and j.closed - j.first_seen >= ${D} and j.source != 'adzuna' and j.dup_of is null`).all(...keys, t - 180 * D) as any[]).map((r) => r.d).sort((a, b) => a - b);
  const pays = rows.filter((r) => r.salary_min != null && !r.salary_est).map((r) => ((r.salary_min + (r.salary_max ?? r.salary_min)) / 2) * (r.salary_period === "hour" ? 2080 : 1)).sort((a, b) => a - b);
  const boards = db.prepare(`select ats, slug, open, last_ok from companies where ${keys.map(() => "replace(lower(coalesce(name, slug)), ' ', '') like ?").join(" or ")}`).all(...keys.map((k: string) => `%${k}%`)) as any[];
  return { name: rows[0]?.company ?? name, open: rows.length, jobs: rows.slice(0, 200).map((r) => ({ ...r, flags: JSON.parse(r.flags ?? "[]") })),
    new30: one(`select count(*) n from jobs j where ${inK} and coalesce(j.posted, j.first_seen) >= ? and j.dup_of is null`, t - 30 * D).n,
    gone30: one(`select count(*) n from jobs j where ${inK} and j.closed >= ? and j.closed - j.first_seen >= ${D} and j.source != 'adzuna' and j.dup_of is null`, t - 30 * D).n,
    stated: rows.length ? Math.round((pays.length / rows.length) * 100) : 0, // % of open jobs whose posting gives pay
    stale: rows.length ? Math.round((rows.filter((r) => (r.posted ?? r.first_seen) < t - 60 * D).length / rows.length) * 100) : 0,
    medianDaysUp: up.length >= 5 ? Math.round(pct(up, 0.5)!) : null, pay: pays.length >= 5 ? { p25: pct(pays, 0.25), median: pct(pays, 0.5), p75: pct(pays, 0.75), n: pays.length } : null,
    fields: Object.entries(rows.reduce((m: any, r) => ((m[r.func] = (m[r.func] ?? 0) + 1), m), {})).sort((a: any, b: any) => b[1] - a[1]),
    boards: boards.map((b) => ({ ats: b.ats, open: b.open, checked: b.last_ok })), verified: rows.filter((r) => r.source !== "adzuna").length,
    weeks: Array.from({ length: 26 }, (_, i) => one(`select count(*) n from jobs j where ${inK} and coalesce(j.posted, j.first_seen) >= ? and coalesce(j.posted, j.first_seen) < ? and j.dup_of is null`, t - (26 - i) * 7 * D, t - (25 - i) * 7 * D).n as number) }; // new postings a week, oldest first
}
/** What an employer's own open postings here say about the work (the company card's scorecard): where it's done, office
 *  days, on-call, travel, leave and time off; each with the share of postings that say it and a quote. */
export function postingSignals(name: string) {
  const keys = employerKeys(name), rows = keys.length ? db.prepare(`select remote, description d from jobs where ckey in (${keys.map(() => "?").join(",")}) and closed is null and dup_of is null and length(description) >= 300`).all(...keys) as any[] : [];
  if (rows.length < 3) return null;
  const pct = (n: number) => Math.round((n / rows.length) * 100), share = (re: RegExp) => pct(rows.filter((r) => re.test(r.d)).length);
  const quote = (re: RegExp) => { for (const r of rows) { const m = re.exec(r.d); if (m) { // the clause around it: "participate in an on-call rotation"
    const a = Math.max(0, r.d.lastIndexOf("\n", m.index) + 1, ...[". ", "; ", "• "].map((p) => r.d.lastIndexOf(p, m.index) + p.length).filter((i) => i > 0 && i <= m.index)), b = r.d.slice(m.index).search(/[.;\n•]/);
    const from = a >= m.index - 90 ? a : r.d.indexOf(" ", m.index - 90) + 1, q = (from > a ? "…" : "") + r.d.slice(from, b < 0 ? m.index + 120 : m.index + Math.min(b, 120)).replace(/\s+/g, " ").trim(); return q.length > m[0].length + 4 ? q : m[0]; } } return null; };
  const said = (re: RegExp) => { const n = share(re); return n ? { pct: n, quote: quote(re) } : null; };
  const where = { hybrid: pct(rows.filter((r) => r.remote === "hybrid").length), remote: pct(rows.filter((r) => r.remote === "remote").length) }; // "onsite" is also "didn't say"
  const leave = rows.flatMap((r) => [...r.d.matchAll(/(\d{1,2})\s*(?:\+\s*)?weeks?\s+(?:of\s+)?(?:fully\s+)?(?:paid\s+)?(?:parental|maternity|paternity|family|caregiver|baby bonding)\s+leave/gi)].map((m) => ({ w: Number(m[1]), q: m[0] })));
  const most = leave.sort((a, b) => b.w - a.w)[0];
  return { n: rows.length, where, officeDays: said(/\b(?:[1-5]|two|three|four|five)\s+days?\s+(?:a|per|each)\s+week\s+(?:in|at|from)\s+(?:the\s+|our\s+)?(?:office|on[- ]?site)/i),
    onCall: said(/\bon[- ]call\b/i), travel: said(/\btravel\b[^.\n]{0,40}?\d{1,2}\s*%|\d{1,2}\s*%[^.\n]{0,25}?\btravel/i),
    leave: most ? { weeks: most.w, quote: most.q.replace(/\s+/g, " ") } : null, unlimitedPto: said(/\b(?:unlimited|flexible|open)\s+(?:pto|paid time off|vacation|time off)\b/i) };
}
export const getCompanyInfo = (name: string) => { const r = db.prepare("select at, body from company_info where ck = ?").get(ckey(name)) as any; return r ? JSON.parse(r.body) : null; };
export const saveCompanyInfo = (name: string, body: object) => db.prepare("insert or replace into company_info values (?, ?, ?)").run(ckey(name), now(), JSON.stringify(body));
/** The employers with the most open jobs here: whose cards are made each morning. */
export const topEmployers = (n = 80) => (db.prepare("select company, count(*) n from jobs where closed is null and dup_of is null group by ckey order by n desc limit ?").all(n) as any[]).map((r) => r.company as string);
/** The search page's row for each of these ids (similar jobs, search by meaning), in the order given. */
export function rowsByIds(ids: string[]) {
  if (!ids.length) return [];
  const got = new Map((db.prepare(`select j.id, j.source, j.company, j.title, j.location, j.region, j.remote, j.salary_min, j.salary_max, j.salary_period, j.salary_est, j.posted, j.first_seen, j.last_seen, j.url, j.seniority, j.func, j.flags, j.also, substr(j.description, 1, 400) snippet
    from jobs j where j.id in (${ids.map(() => "?").join(",")})`).all(...ids) as any[]).map((r) => [r.id, { ...r, flags: JSON.parse(r.flags ?? "[]"), also: r.also ? r.also.split(",") : [] }]));
  return ids.map((id) => got.get(id)).filter(Boolean);
}
/** Ids of the open jobs that pass a query's filters (no words): what search by meaning ranks. */
export const filteredIds = (qy: Query) => { const { w, args } = filters({ ...qy, q: undefined }); return new Set((db.prepare(`select j.id from jobs j where ${w}`).all(...args) as any[]).map((r) => r.id)); };
export const getCheck = (id: string) => { const r = db.prepare("select at, body from checks where id = ?").get(id) as any; return r && now() - r.at < 86400 ? JSON.parse(r.body) : null; };
export const saveCheck = (id: string, body: object) => { db.prepare("insert or replace into checks values (?, ?, ?)").run(id, now(), JSON.stringify(body)); db.prepare("delete from checks where at < ?").run(now() - 7 * 86400); };
/** Fresh jobs worth a red-flag check overnight: new in the last day, from the employer, in the NYC area, tech, data or finance. */
export const freshForChecks = (n = 120) => (db.prepare("select id from jobs where closed is null and dup_of is null and first_seen > ? and source != 'adzuna' and region in ('nyc','nj','metro') and func in ('engineering','data','finance') and id not in (select id from checks) order by first_seen desc limit ?").all(now() - 86400, n) as any[]).map((r) => r.id);
export const saveGuide = (body: object) => db.prepare("insert or replace into guides values (?, ?)").run(now(), JSON.stringify(body));
export const latestGuide = () => { const r = db.prepare("select at, body from guides order by at desc limit 1").get() as any; if (!r) return null; const { by, ...g } = JSON.parse(r.body); return { at: r.at as number, ...g }; }; // no model names on the site
/** A job opened on the site before a crawl read its text (Meta, Apple, Bloomberg render it only in a browser): read its
 *  page now, through the Mac's browser for those three and plainly for the rest, and keep it with its pay and flags. */
const reading = new Map<string, Promise<string>>();
export function readJobText(id: string) {
  const j = db.prepare("select * from jobs where id = ?").get(id) as any;
  if (!j || j.description.length >= 300 || j.source !== "custom") return Promise.resolve(j?.description ?? "");
  if (!reading.has(id)) reading.set(id, (async () => {
    const slug = id.split(":")[1]; let d = "";
    if (!PLAIN[slug] && process.env.HOST_BRIDGE) d = await withCrawlBridge(async () => {
      const r = await fetch(`${process.env.HOST_BRIDGE}/crawl`, { method: "POST", body: JSON.stringify({ page: j.url, title: j.title }), signal: AbortSignal.timeout(45_000) });
      const b = await r.json().catch(() => ({})) as any; if (!r.ok) throw new Error(b?.error ?? `crawl ${r.status}`); return String(b?.description ?? "");
    });
    else { const jp = jobPostingLd(await (await fetch(j.url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" }, signal: AbortSignal.timeout(20_000) })).text()); d = stripHtml(String(jp?.description ?? "")); }
    return applyText(j, d);
  })().finally(() => reading.delete(id)));
  return reading.get(id)!;
}
/** A job's text as read from its page: kept with the pay and flags it gives, or the job closed when the page says it's elsewhere. */
function applyText(j: any, d: string, place = d.match(/(?:^|\n)\s*Location\s*\n\s*([^\n]{2,80})/)?.[1]?.trim()) {
  if (d.length < 300) return j.description;
  if (place && !region(usPlace(place))) { db.prepare("update jobs set closed = ?, location = ? where id = ?").run(now(), place, j.id); return `${d}\n\n(This job is in ${place}, outside the New York area, so it's no longer listed here.)`; } // Bloomberg's list isn't by place
  const sal = j.salary_min == null ? parseSalary(d) : null, row = { ...j, description: d, salary_min: sal?.min ?? j.salary_min, salary_max: sal?.max ?? j.salary_max };
  db.prepare("update jobs set description = ?, salary_min = ?, salary_max = ?, salary_period = coalesce(?, salary_period), flags = ? where id = ?").run(d, row.salary_min, row.salary_max, sal?.period ?? null, JSON.stringify(flagsFor({ ...row, reposts: reposts(j.ckey, j.title, j.region, j.id) })), j.id);
  ftsDel.run(j.id); ftsAdd.run(j.id, j.title, j.company, d.slice(0, 8000));
  return d;
}
/** Hourly (cron): stored jobs from the browser-only sites (Meta, Apple, Bloomberg) whose text was never read, a minute of the Mac's browser. */
export async function backfillTexts(n = 60, signal?: AbortSignal) {
  if (!process.env.HOST_BRIDGE || signal?.aborted) return 0;
  const rows = db.prepare("select * from jobs where source = 'custom' and closed is null and length(description) < 300 and (id like 'cu:meta:%' or id like 'cu:apple:%' or id like 'cu:bloomberg:%') order by first_seen desc limit ?").all(n) as any[];
  if (!rows.length) return 0;
  const got = await withCrawlBridge(async () => {
    if (signal?.aborted) return [] as { url: string; description: string; location: string }[];
    const sig = signal ? AbortSignal.any([AbortSignal.timeout(100_000), signal]) : AbortSignal.timeout(100_000);
    const res = await fetch(`${process.env.HOST_BRIDGE}/crawl`, { method: "POST", body: JSON.stringify({ pages: rows.map((r) => ({ url: r.url, title: r.title })) }), signal: sig });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body)) throw new Error((body as any)?.error ?? `crawl ${res.status}`);
    return body as { url: string; description: string; location: string }[];
  });
  let n2 = 0; for (const g of got) { const j = rows.find((r) => r.url === g.url); if (j && g.description?.length >= 300) { applyText(j, g.description, g.location || undefined); n2++; } }
  return n2;
}
export const jobText = (id: string) => (db.prepare("select title, company, description from jobs where id = ?").get(id) as any) ?? null;
/** Database and queue diagnostics for the admin health view (no personal or secret data). */
export function jobsHealth() {
  const t = now(), staleCut = t - 7 * 86400;
  const counts = db.prepare(`select sum(closed is null) open, sum(closed is not null) closed,
    sum(closed is null and dup_of is not null) openDup, sum(closed is not null and dup_of is not null) closedDup,
    count(*) total from jobs`).get() as any;
  const needEmbedding = (db.prepare("select count(*) n from jobs j left join emb e on e.id = j.id where j.closed is null and j.dup_of is null and e.id is null").get() as any).n;
  const backfillPending = (db.prepare("select count(*) n from jobs where source = 'custom' and closed is null and length(description) < 300 and (id like 'cu:meta:%' or id like 'cu:apple:%' or id like 'cu:bloomberg:%')").get() as any).n;
  const freshForChecksPending = (db.prepare("select count(*) n from jobs where closed is null and dup_of is null and first_seen > ? and source != 'adzuna' and region in ('nyc','nj','metro') and func in ('engineering','data','finance') and id not in (select id from checks)").get(t - 86400) as any).n;
  const embOrphans = (db.prepare("select count(*) n from emb e join jobs j on j.id = e.id where j.closed is not null or j.dup_of is not null").get() as any).n;
  const failing = db.prepare("select ats, slug, name, last_ok, last_err, open from companies where last_err is not null order by ats, slug").all() as any[];
  const staleBoards = db.prepare(`select source, substr(id, 1, instr(substr(id, 4), ':') + 2) board, count(*) open, min(last_seen) oldestSeen
    from jobs where closed is null and last_seen < ? group by source, board order by oldestSeen asc limit 20`).all(staleCut) as any[];
  const ps = (db.prepare("pragma page_size").get() as any).page_size as number;
  const pc = (db.prepare("pragma page_count").get() as any).page_count as number;
  const fc = (db.prepare("pragma freelist_count").get() as any).freelist_count as number;
  const jm = (db.prepare("pragma journal_mode").get() as any).journal_mode as string;
  const restingLanes = [...resting.entries()].filter(([, until]) => until > Date.now()).map(([lane, until]) => ({ lane, until: Math.round(until / 1000) }));
  return {
    counts: { open: counts.open ?? 0, closed: counts.closed ?? 0, openDup: counts.openDup ?? 0, closedDup: counts.closedDup ?? 0, total: counts.total ?? 0 },
    queues: { needEmbedding, backfillPending, freshForChecksPending },
    orphaned: { embClosedOrDup: embOrphans },
    boards: { total: (db.prepare("select count(*) n from companies").get() as any).n, failingCount: failing.length, failing: failing.slice(0, 30), staleBoards },
    restingLanes,
    db: { sizeMb: Math.round((pc * ps) / (1024 * 1024)), freelistMb: Math.round((fc * ps) / (1024 * 1024)), journalMode: jm },
  };
}
export const jobsDb = db;
