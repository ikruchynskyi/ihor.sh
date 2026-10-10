// Jobs: real, open jobs in New York City, the metro around it (New Jersey included) and remote in the US.
// The source of truth for a job is its employer's own applicant tracking system (Greenhouse, Lever, Ashby): one request
// per company returns every open job, so every company is re-read hourly and a job missing twice in a row is closed.
// NYC's own jobs come from the city's open data. Adzuna adds breadth (daily sweeps), minus gig ads and reposts; a
// listing found only there stays while Adzuna still lists it. Remote boards (Remotive, Himalayas) add remote-US roles.
// Everything is deduplicated (company + title + area, then a fingerprint of the description), and flagged with reasons.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "jobs.db"));
db.exec(`
  create table if not exists companies (ats text, slug text, name text, added int, last_ok int, last_err text, open int, primary key (ats, slug));
  create table if not exists jobs (id text primary key, source text, company text, ckey text, title text, location text, region text, remote text,
    salary_min real, salary_max real, salary_period text, salary_est int, posted int, url text, department text, employment text, seniority text,
    func text, description text, first_seen int, last_seen int, missed int default 0, closed int, fp text, dup_of text, flags text, also text);
  create index if not exists jobs_open on jobs (closed, dup_of);
  create virtual table if not exists jobs_fts2 using fts5(id unindexed, title, company, body, tokenize = 'porter unicode61'); -- porter: engineers = engineer
  create table if not exists runs (at int, what text, ok int, n int, note text);
  create table if not exists probed (ckey text primary key, at int, found text);
`);
const now = () => Math.floor(Date.now() / 1000);
const UA = { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)", accept: "application/json" };
const env = (k: string) => process.env[k] ?? "";
const getJson = async (u: string, ms = 30_000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<any>; };

// ---------- understanding a posting ----------
export const stripHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&")
  .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
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
export const remoteType = (loc: string, text: string, hint?: string) => {
  const h = (hint ?? "").toLowerCase();
  if (/remote/.test(h)) return "remote"; if (/hybrid/.test(h)) return "hybrid"; if (/on-?site|in-?office|onsite/.test(h)) return "onsite";
  if (/\bremote\b/i.test(loc)) return "remote"; if (/\bhybrid\b/i.test(loc) || /\bhybrid\b/i.test(text.slice(0, 3000))) return "hybrid";
  return "onsite";
};
/** A pay range in text: "$120,000 – $150,000", "$150K-$200K", "$45/hr – $60/hr". Annual or hourly, sanity-checked. */
export function parseSalary(text: string): { min: number; max: number; period: "year" | "hour" } | null {
  const m = text.replace(/–|—/g, "-").match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK])?\s*(?:\/\s?(?:hr|hour)|per hour|an hour)?\s*(?:-|to)\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK])?(\s*(?:\/\s?(?:hr|hour)|per hour|an hour|hourly))?/);
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
const tkey = (title: string) => title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ---------- storing ----------
type In = { regionHint?: string; id: string; source: string; company: string; title: string; location: string; remoteHint?: string; isRemote?: boolean; salary?: { min: number; max: number; period: string } | null; salaryEst?: boolean; posted?: number | null; url: string; department?: string; employment?: string; description: string };
const upsert = db.prepare(`insert into jobs (id, source, company, ckey, title, location, region, remote, salary_min, salary_max, salary_period, salary_est, posted, url, department, employment, seniority, func, description, first_seen, last_seen, missed, closed, fp, flags)
  values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,null,?,?) on conflict(id) do update set title=excluded.title, location=excluded.location, region=excluded.region, remote=excluded.remote,
  salary_min=excluded.salary_min, salary_max=excluded.salary_max, salary_period=excluded.salary_period, salary_est=excluded.salary_est, url=excluded.url, department=excluded.department,
  employment=excluded.employment, seniority=excluded.seniority, func=excluded.func, description=excluded.description, last_seen=excluded.last_seen, missed=0, closed=null, fp=excluded.fp, flags=excluded.flags`);
const ftsDel = db.prepare("delete from jobs_fts2 where id = ?"), ftsAdd = db.prepare("insert into jobs_fts2 (id, title, company, body) values (?,?,?,?)");
if (!(db.prepare("select count(*) n from jobs_fts2").get() as any).n) { // first start with the stemming index: fill it from the jobs
  for (const r of db.prepare("select id, title, company, description from jobs").all() as any[]) ftsAdd.run(r.id, r.title, r.company, String(r.description ?? "").slice(0, 8000));
  db.exec("drop table if exists jobs_fts");
}
function save(j: In) {
  const reg = j.regionHint ?? region(j.location, j.isRemote);
  if (!reg) return false;
  const desc = j.description.slice(0, 20000), t = now(), given = j.salary && j.salary.min > 0 ? j.salary : null, sal = given ?? parseSalary(desc);
  const posted = j.posted ? Math.floor(j.posted / 1000) : null;
  const row = { company: j.company, title: j.title, description: desc, region: reg, salary_min: sal?.min ?? null, salary_max: sal?.max ?? null, posted, url: j.url, source: j.source, first_seen: t };
  upsert.run(j.id, j.source, j.company, ckey(j.company), j.title.trim(), j.location.slice(0, 200), reg, remoteType(j.location, desc, j.remoteHint ?? (j.isRemote ? "remote" : "")),
    sal?.min ?? null, sal?.max ?? null, sal?.period ?? null, j.salaryEst ? 1 : 0, posted, j.url, j.department ?? "", j.employment ?? "", seniority(j.title), func(j.title, j.department), desc, t, t, simhash(desc), JSON.stringify(flagsFor(row)));
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
const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, a, b) => `${a ? " " : ""}${b.toUpperCase()}`);

async function readBoard(ats: string, slug: string): Promise<In[]> {
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

/** Re-read every company's board: new and changed jobs saved, missing ones a step closer to closed. */
export async function refreshBoards() {
  const list = db.prepare("select ats, slug from companies").all() as { ats: string; slug: string }[];
  let n = 0, bad = 0;
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(async ({ ats, slug }) => {
    try {
      const jobs = await readBoard(ats, slug), seen = new Set<string>();
      for (const j of jobs) if (save(j)) { seen.add(j.id); n++; }
      sweep(ats, seen, `${{ greenhouse: "gh", lever: "lv", ashby: "ab" }[ats]}:${slug}:`);
      db.prepare("update companies set name = ?, last_ok = ?, last_err = null, open = ? where ats = ? and slug = ?").run(jobs[0]?.company ?? null, now(), seen.size, ats, slug);
    } catch (e) { bad++; db.prepare("update companies set last_err = ? where ats = ? and slug = ?").run((e as Error).message, ats, slug); }
  }));
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "boards", bad ? 0 : 1, n, `${list.length} boards, ${bad} failed`);
  return { boards: list.length, failed: bad, jobs: n };
}

/** NYC government jobs (the city's open data; External postings only, Internal ones repeat them). */
export async function refreshNycJobs() {
  const rows = await getJson("https://data.cityofnewyork.us/resource/kpav-sd4t.json?$limit=5000&posting_type=External", 60_000), seen = new Set<string>();
  for (const r of rows) {
    const id = `nyc:${r.job_id}`, per = /hour/i.test(r.salary_frequency) ? "hour" : /day/i.test(r.salary_frequency) ? "day" : "year";
    const ok = save({ id, source: "nycjobs", company: `NYC ${titleCase(String(r.agency ?? "").toLowerCase())}`, title: r.business_title, location: `${r.work_location ?? ""}, New York, NY`,
      salary: r.salary_range_from && per !== "day" ? { min: +r.salary_range_from, max: +(r.salary_range_to ?? r.salary_range_from), period: per } : null, posted: Date.parse(r.posting_date), url: `https://cityjobs.nyc.gov/job/${r.job_id}`,
      department: r.job_category ?? "", employment: r.full_time_part_time_indicator === "P" ? "Part-time" : "Full-time",
      description: [r.job_description, r.minimum_qual_requirements && `Minimum qualifications:\n${r.minimum_qual_requirements}`, r.preferred_skills && `Preferred skills:\n${r.preferred_skills}`, r.residency_requirement].filter(Boolean).join("\n\n") });
    if (ok) seen.add(id);
  }
  sweep("nycjobs", seen, "nyc:");
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "nycjobs", 1, seen.size, "");
  return { jobs: seen.size };
}

/** Adzuna, daily: broad sweeps around NYC (40 km, so Jersey City to White Plains) and remote US. Gig ads and reposts never get in. */
export async function refreshAdzuna(pages = 20) {
  const id = env("ADZUNA_APP_ID"), key = env("ADZUNA_APP_KEY");
  if (!id || !key) return { error: "no Adzuna key" };
  let n = 0, gig = 0, repost = 0; const perCo = new Map<string, number>();
  const sweeps = [["", "New York, NY", 40], ["remote", "United States", 0]] as const;
  for (const [what, where, km] of sweeps) for (let p = 1; p <= pages; p++) {
    const u = `https://api.adzuna.com/v1/api/jobs/us/search/${p}?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=30&sort_by=date&where=${encodeURIComponent(where)}${km ? `&distance=${km}` : ""}${what ? `&what=${what}` : ""}&content-type=application/json`;
    let d: any; try { d = await getJson(u); } catch { break; }
    if (!d.results?.length) break;
    for (const r of d.results) {
      const company = r.company?.display_name ?? "", title = r.title ?? "", text = r.description ?? "";
      if (isGig(company, title, text)) { gig++; continue; }
      // a repost: the same company and title already open (from any source), or one ad copied to many towns
      const k = `${ckey(company)}|${tkey(title)}`, c = (perCo.get(k) ?? 0) + 1; perCo.set(k, c);
      if (c > 1) { repost++; continue; }
      const exists = db.prepare("select 1 from jobs where ckey = ? and lower(title) = lower(?) and closed is null and source != 'adzuna'").get(ckey(company), title);
      if (exists) { repost++; continue; }
      const area: string[] = r.location?.area ?? [], nycCounty = /^(new york|kings|queens|bronx|richmond) county$/i.test(area[2] ?? "");
      const regionHint = what === "remote" ? undefined : area[1] === "New Jersey" ? "nj" : nycCounty || /^new york( city)?$/i.test(area[2] ?? "") ? "nyc" : "metro"; // the search was within 40 km of NYC
      const ok = save({ regionHint, id: `az:${r.id}`, source: "adzuna", company, title, location: what === "remote" ? `Remote, ${r.location?.display_name ?? "United States"}` : r.location?.display_name ?? where,
        isRemote: what === "remote", salary: r.salary_min ? { min: r.salary_min, max: r.salary_max ?? r.salary_min, period: r.salary_max < 500 ? "hour" : "year" } : null, salaryEst: r.salary_is_predicted === "1" || r.salary_is_predicted === 1,
        posted: Date.parse(r.created), url: r.redirect_url, department: r.category?.label ?? "", employment: [r.contract_time, r.contract_type].filter(Boolean).join(", ").replace(/_/g, " "), description: text });
      if (ok) n++;
    }
  }
  // one ad posted to many towns: hide them all
  for (const [k, c] of perCo) if (c > 5) {
    const [ck, tk] = k.split("|");
    for (const r of db.prepare("select id, title from jobs where source = 'adzuna' and ckey = ? and closed is null").all(ck) as any[]) if (tkey(r.title) === tk) db.prepare("update jobs set closed = ? where id = ?").run(now(), r.id);
  }
  // listings Adzuna stopped showing a week ago are gone (we can't open their pages to check)
  db.prepare("update jobs set closed = ? where source = 'adzuna' and closed is null and last_seen < ?").run(now(), now() - 7 * 86400);
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "adzuna", 1, n, `${gig} gig ads and ${repost} reposts skipped`);
  return { jobs: n, gig, repost };
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
export async function discover(max = 40) {
  const cands = db.prepare("select company, ckey, count(*) n from jobs where source = 'adzuna' and closed is null and ckey not in (select ckey from probed) group by ckey order by n desc limit ?").all(max) as any[];
  let added = 0;
  for (const c of cands) {
    const slugs = [...new Set([c.ckey, c.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), c.company.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "")])].filter((x) => x.length > 2);
    let found = "";
    for (const slug of slugs) for (const ats of ["greenhouse", "lever", "ashby"]) {
      if (found || STAFFING.test(c.company)) continue;
      try { const jobs = await readBoard(ats, slug); if (jobs.some((j) => region(j.location, j.isRemote)) && jobs.some((j) => ckey(j.company) === c.ckey || ats !== "greenhouse")) found = `${ats}:${slug}`; } catch {}
    }
    db.prepare("insert or replace into probed values (?, ?, ?)").run(c.ckey, now(), found);
    if (found) { const [ats, slug] = found.split(":"); db.prepare("insert or ignore into companies (ats, slug, added) values (?, ?, ?)").run(ats, slug, now()); added++; }
  }
  db.prepare("insert into runs values (?,?,?,?,?)").run(now(), "discover", 1, added, `${cands.length} companies tried`);
  return { tried: cands.length, added };
}

/** Duplicates across sources: the same company + title + area, or the same company with a near-identical description.
 *  The employer's own record wins (ATS > city > remote boards > Adzuna); the others point to it and show as "also on". */
export function dedupe() {
  const rank: Record<string, number> = { greenhouse: 0, lever: 0, ashby: 0, nycjobs: 1, remotive: 2, himalayas: 2, adzuna: 3 };
  const open = db.prepare("select id, source, ckey, title, region, fp from jobs where closed is null").all() as any[];
  db.exec("update jobs set dup_of = null, also = null");
  const by = new Map<string, any[]>();
  for (const j of open) (by.get(j.ckey) ?? by.set(j.ckey, []).get(j.ckey)!).push(j);
  let dups = 0;
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => rank[a.source] - rank[b.source]);
    for (let i = 0; i < list.length; i++) {
      if (list[i].dup) continue;
      const also: string[] = [];
      for (let k = i + 1; k < list.length; k++) {
        const a = list[i], b = list[k];
        if (b.dup) continue;
        const same = (tkey(a.title) === tkey(b.title) && a.region === b.region) || (a.fp && b.fp && hamming(a.fp, b.fp) <= 6 && tkey(a.title).split(" ")[0] === tkey(b.title).split(" ")[0]);
        if (same) { b.dup = true; dups++; if (b.source !== a.source) also.push(b.source); db.prepare("update jobs set dup_of = ? where id = ?").run(a.id, b.id); }
      }
      if (also.length) db.prepare("update jobs set also = ? where id = ?").run([...new Set(also)].join(","), list[i].id);
    }
  }
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
export function search(qy: Query) {
  const where = ["j.closed is null", "j.dup_of is null"], args: any[] = [];
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
  // with words, best match first (title words count 10×, the company 3×, the description 1×), else newest first
  const order = qy.sort === "salary" ? "(case when j.salary_period = 'hour' then j.salary_max * 2080 else j.salary_max end) desc nulls last" : qy.sort === "newest" || !fts ? "coalesce(j.posted, j.first_seen) desc" : "bm25(jobs_fts2, 0, 10, 3, 1)";
  const w = where.join(" and "), page = Math.max(0, qy.page ?? 0);
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

/** Hourly: employer boards and city jobs (liveness), dedupe. Daily (at the first run after 6 am): Adzuna and remote boards. */
let running = false;
export async function jobsTick() {
  if (running) return; running = true;
  try {
    await refreshBoards().catch((e) => console.log("jobs boards:", e.message));
    await refreshNycJobs().catch((e) => console.log("jobs nyc:", e.message));
    const last = (db.prepare("select max(at) t from runs where what = 'adzuna'").get() as any)?.t ?? 0;
    if (now() - last > 20 * 3600) { await refreshAdzuna().catch((e) => console.log("jobs adzuna:", e.message)); await refreshRemote().catch((e) => console.log("jobs remote:", e.message)); await discover().catch((e) => console.log("jobs discover:", e.message)); }
    dedupe();
  } finally { running = false; }
}
export function startJobs() { setTimeout(jobsTick, 30_000); setInterval(jobsTick, 3600_000); }

/** A saved search as RSS: the 30 newest matches. */
export function rss(qy: Query, selfUrl: string, title: string) {
  const r = search(qy), x = (t: string) => t.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
  r.rows.sort((a: any, b: any) => (b.posted ?? b.first_seen) - (a.posted ?? a.first_seen)); // the best 30 matches, newest first
  const items = r.rows.map((j: any) => `<item><title>${x(`${j.title} at ${j.company}`)}</title><link>${x(j.url)}</link><guid isPermaLink="false">${x(j.id)}</guid><pubDate>${new Date((j.posted ?? j.first_seen) * 1000).toUTCString()}</pubDate><description>${x(`${j.location}${j.salary_min ? ` · $${Math.round(j.salary_min)}–$${Math.round(j.salary_max)} per ${j.salary_period}` : ""}${j.flags.length ? ` · flags: ${j.flags.join(", ")}` : ""}`)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(title)}</title><link>${x(selfUrl)}</link><description>Open jobs matching a saved search on ihor.sh</description>${items}</channel></rss>`;
}
