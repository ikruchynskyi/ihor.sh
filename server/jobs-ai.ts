// The AI side of jobs: résumé ↔ job matching and résumé rewrite suggestions. Embeddings are local (nomic-embed-text on
// this Mac's Ollama); the ranking and the rewriting use Blip's model (Ollama Cloud, then the local model). The résumé
// text is used for the request only: never stored, never logged.
import { needEmbedding, saveEmbedding, candidates, jobText, market, type Query } from "./jobs.ts";
import { OLLAMA, llmJson, faithful } from "./llm.ts";
import { extract, jobTerms, mentions, CLICHES } from "../nyc/resume.js";
const EMBED = "nomic-embed-text";

async function embed(texts: string[]): Promise<Float32Array[]> {
  const r = await fetch(`${OLLAMA}/api/embed`, { method: "POST", body: JSON.stringify({ model: EMBED, input: texts, truncate: true }), signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`embed ${r.status}`);
  return (await r.json()).embeddings.map((e: number[]) => { const v = Float32Array.from(e), n = Math.hypot(...v) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; });
}
const cos = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Background: embed open jobs that don't have one yet (nomic wants "search_document:" on documents). */
let embedding = false;
export async function embedJobs(max = 2000) {
  if (embedding) return 0; embedding = true; let n = 0;
  try {
    for (let batch = needEmbedding(32); batch.length && n < max; batch = needEmbedding(32)) {
      const vs = await embed(batch.map((b) => `search_document: ${b.text}`));
      batch.forEach((b, i) => saveEmbedding(b.id, vs[i])); n += batch.length;
    }
  } catch (e) { console.log("jobs embed:", (e as Error).message); } finally { embedding = false; }
  return n;
}
export function startEmbedding() { setTimeout(() => embedJobs(), 90_000); setInterval(() => embedJobs(), 30 * 60_000); }

// résumé verbs and connectives: rewording with these isn't adding facts
const COMMON = /^(assist|collab|contrib|coordin|creat|distrib|achiev|increas|improv|reduc|grow|boost|cut|reach|result|through|support|deliver|develop|design|manag|organiz|produc|launch|implem|maintain|partner|prepar|execut|handl|overs|ensur|enabl|provid|across|including|within|resulting|weekly|monthly|daily)/;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const STRONG = /\b(led|spearheaded|owned|directed|headed|managed|oversaw|architected)\b/i;
const nums = (s: string) => s.replace(/\[[^\]]*\]/g, "").match(/\d[\d,.]*%?/g) ?? [];
/** The never-invent checks on one rewritten line: a number the résumé doesn't have becomes [X]; a stronger role verb, or
 *  specific words in neither the original line nor `known` (the résumé, plus the job when tailoring), get a note. */
export function guard(before: string, after: string, resume: string, known = resume) {
  const notes: string[] = [], added = nums(after).filter((n) => !nums(before).includes(n) && !resume.includes(n)).sort((a, b) => b.length - a.length); // "50%" before "5"
  if (added.length) { after = after.replace(new RegExp(added.map((a) => a.replace(/[.%]/g, (c) => `\\${c}`)).join("|"), "g"), "[X]"); notes.push("a number your résumé doesn't have became [X]: put in your real figure"); }
  const promoted = after.match(STRONG)?.[0], b = before.toLowerCase(), k = known.toLowerCase();
  if (promoted && !b.includes(promoted.toLowerCase())) notes.push(`"${promoted}" is stronger than the original: keep it only if it's true`);
  const newWords = (after.replace(/\[[^\]]*\]/g, "").toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []).filter((w) => !b.includes(w) && !k.includes(w) && !COMMON.test(w));
  if (newWords.length > 2) notes.push(`adds details that aren't in your résumé (${newWords.slice(0, 4).join(", ")}): keep only what's true`);
  return { after, notes };
}
/** Jobs that fit a résumé: the 50 nearest by meaning (embeddings), then the 15 best re-ranked by the model, each with
 *  the requirements met (quoting the résumé) and the ones missing. Filters are the jobs page's. */
export async function match(resume: string, qy: Query, rank = true) {
  const text = clip(resume.replace(/\s+/g, " "), 6000);
  if (text.length < 200) return { error: "That résumé is too short to match (under 200 characters)." };
  const pool = candidates(qy);
  if (!pool.length) return { error: "No jobs to match yet with these filters (new jobs are indexed within half an hour)." };
  const [q] = await embed([`search_query: ${text}`]);
  const near = pool.map((j) => ({ ...j, sim: cos(q, j.v) })).sort((a, b) => b.sim - a.sim).slice(0, 50);
  const strip0 = ({ v, ...j }: any) => ({ ...j, sim: +j.sim.toFixed(3) });
  if (!rank) return { ranked: false, jobs: near.slice(0, 15).map(strip0), more: near.slice(15).map(strip0) }; // the fast answer: by meaning only
  const top = near.slice(0, 15).map((j) => ({ id: j.id, ...jobText(j.id) }));
  const schema = { type: "object", properties: { jobs: { type: "array", items: { type: "object", properties: { id: { type: "string" }, score: { type: "integer" }, has: { type: "array", items: { type: "string" } }, missing: { type: "array", items: { type: "string" } }, why: { type: "string" } }, required: ["id", "score", "has", "missing", "why"] } } }, required: ["jobs"] };
  const ranked = await llmJson(
    "You screen résumés against job postings like a careful recruiter. For each job: score 0-100 for fit; 'has': up to 4 of the job's requirements the résumé clearly meets, each quoting or paraphrasing the résumé's evidence in a few words; 'missing': up to 3 must-have requirements the résumé doesn't show; 'why': one sentence. Judge only from the texts given; never assume experience that isn't written. Reply as JSON.",
    `RÉSUMÉ:\n${clip(text, 4000)}\n\nJOBS:\n${top.map((j) => `[${j.id}] ${j.title} at ${j.company}\n${clip(String(j.description ?? "").replace(/\s+/g, " "), 900)}`).join("\n\n")}`, schema).catch(() => null);
  // gemma4 on Ollama Cloud may ignore the schema ({"0": {"job": "[id] title…", "score": 85…}}): take the items wherever they
  // are and pair each with the job whose id it mentions, so scores aren't silently lost (they were, until 2026-11-16)
  const items = (Array.isArray(ranked?.jobs) ? ranked.jobs : Object.values(ranked ?? {})).filter((x: any) => x && typeof x === "object" && Number.isFinite(Number(x.score)));
  const by = new Map<string, any>(top.map((j) => [j.id, items.find((x: any) => x.id === j.id || JSON.stringify(x).includes(j.id))] as const).filter(([, x]) => x).map(([id, x]: any) => [id, { ...x, score: Number(x.score), has: x.has ?? [], missing: x.missing ?? [], why: String(x.why ?? "") }]));
  const strip = ({ v, ...j }: any) => j;
  return { ranked: by.size > 0, jobs: near.slice(0, 15).map((j) => ({ ...strip(j), sim: +j.sim.toFixed(3), ...(by.get(j.id) ? { score: Math.max(0, Math.min(100, by.get(j.id).score)), has: by.get(j.id).has, missing: by.get(j.id).missing, why: by.get(j.id).why } : {}) })).sort((a: any, b: any) => (b.score ?? b.sim * 100) - (a.score ?? a.sim * 100)),
    more: near.slice(15).map((j) => ({ ...strip(j), sim: +j.sim.toFixed(3) })) };
}

/** Suggestions for a résumé, optionally aimed at one job: rewritten bullets (results first, numbers as [placeholders]
 *  when the résumé doesn't give them), a tailored summary from the résumé's own facts, and the job's terms worth adding
 *  only if they're true. Nothing is invented: that's in the instructions and checked below. */
export async function suggest(resume: string, bullets: string[], jobId?: string, jd?: string) {
  const job = jobId ? jobText(jobId) : jd && jd.length > 80 ? { title: "the pasted job", company: "(pasted)", description: jd } : null;
  const schema = { type: "object", properties: { bullets: { type: "array", items: { type: "object", properties: { before: { type: "string" }, after: { type: "string" }, why: { type: "string" } }, required: ["before", "after", "why"] } }, summary: { type: "string" }, terms: { type: "array", items: { type: "object", properties: { term: { type: "string" }, where: { type: "string" } }, required: ["term", "where"] } } }, required: ["bullets", "summary", "terms"] };
  const out = await llmJson(
    `You improve résumés so applicant tracking systems and recruiters read them well. Rules you never break:
- Never invent facts: no new employers, titles, tools, numbers, activities or results. Keep exactly what the original bullet says the person did; only reword it.
- Never upgrade someone's role: "helped with" or "worked on" may become "Contributed to" or "Supported", never "Led" or "Managed".
- Where a result would help but isn't given, add one placeholder for the person to fill in, written as a gap, e.g. "…, reaching [N subscribers]" or "…, cutting [X hours] a week". Don't guess what the result was about beyond what the bullet says.
- Start bullets with a past-tense verb and stay under 30 words.
- Plain wording a parser can read: no symbols, no first person.
- No filler recruiters skim past (it reads as AI-written): never write ${CLICHES.join(", ")}.
- 'summary': 2-3 sentences built only from the résumé's facts: its titles, years, skills and tools exactly as listed${job ? ". Use the job's words only where the résumé already shows them; never name a skill or tool the résumé doesn't list, and never say the person is 'seeking to leverage' skills they don't show" : ""}.
- 'terms': ${job ? "skills or words the job asks for that the résumé lacks; for each, 'where' says where it would go IF the person really has it" : "leave empty"}.
Return at most 8 bullets, the ones that gain the most. Reply as JSON.`,
    `RÉSUMÉ:\n${clip(resume, 6000)}\n\nBULLETS TO IMPROVE:\n${bullets.slice(0, 20).map((b) => `- ${b}`).join("\n")}${job ? `\n\nTARGET JOB: ${job.title} at ${job.company}\n${clip(String(job.description).replace(/\s+/g, " "), 2500)}` : ""}`, schema, 3000);
  out.bullets = (out.bullets ?? []).filter((b: any) => b.before && b.after).map((b: any) => { const g = guard(b.before, b.after, resume); return { ...b, after: g.after, why: g.notes.length ? `${b.why} ⚠ ${g.notes.join("; ")}` : b.why }; });
  // a summary sentence naming a skill the job wants but the résumé doesn't have is dropped
  if (job && out.summary) { const lacking = jobTerms(String(job.description)).skills.filter((t: string) => !mentions(resume, t)); out.summary = out.summary.split(/(?<=[.!?])\s+/).filter((sen: string) => !lacking.some((t: string) => mentions(sen, t))).join(" "); }
  return out;
}

const jobOf = (jobId?: string, jd?: string) => (jobId ? jobText(jobId) : jd && jd.length > 80 ? { title: "the pasted job", company: "(pasted)", description: jd } : null);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
/** The line in `list` most like `s` (word overlap at least half), copied exactly, or "". */
const closest = (s: string, list: string[]) => {
  const a = words(s); let best = "", score = 0;
  for (const l of list) { const b = words(l), j = [...a].filter((x) => b.has(x)).length / (new Set([...a, ...b]).size || 1); if (j > score) { score = j; best = l; } }
  return score >= 0.5 ? best : "";
};
/** The best-matching version of a résumé for one job: its own roles (heading lines copied from it), bullets reordered and
 *  reworded toward the job, a summary, and a skills list that may include the job's skills the résumé doesn't show: the
 *  page lists those for the person to remove what they don't have (resume.js composeTailored). Here: headings and
 *  original bullets are snapped to the résumé's own lines, and the guard runs on every bullet. */
export async function tailor(resume: string, jobId?: string, jd?: string) {
  const job = jobOf(jobId, jd);
  if (!job) return { error: "Pick a job first: open one from the jobs page, or paste a posting." };
  const text = clip(resume, 7000), wants = jobTerms(String(job.description)).skills;
  const schema = { type: "object", required: ["summary", "skills", "roles"], properties: { summary: { type: "string" }, skills: { type: "array", items: { type: "string" } },
    roles: { type: "array", items: { type: "object", required: ["heading", "bullets"], properties: { heading: { type: "string" }, bullets: { type: "array", items: { type: "object", required: ["text", "from"], properties: { text: { type: "string" }, from: { type: "string" } } } } } } } } };
  const out = await llmJson(`You rebuild a résumé into the strongest version for one job, for a recruiter and an applicant tracking system.
- 'roles': every job in the résumé's experience, newest first. 'heading' is that role's title/company/dates line, copied exactly from the résumé.
- 'bullets' (at most 5 per role), each {"text": the new wording, "from": the original}: the résumé's own bullets for that role, the ones that matter for this job first, reworded with the job's words where the bullet already shows the thing ("built REST services" becomes "Built REST APIs" if the job says APIs). 'from' is the original bullet, copied exactly. You may name a skill the job asks for where the original work plausibly used it: the person will remove skills they don't have, and those bullets go back to the original.
- Keep what the person did, its scope and its numbers. Never add employers, titles, dates, numbers or results; never upgrade a role ("helped" never becomes "led"). Past-tense verb first, under 30 words, no first person.
- 'skills': the résumé's skills this job uses first, then the job's other required skills and tools even if the résumé doesn't show them (the person removes the ones they lack). Short names, as the job writes them.
- 'summary': 2-3 sentences from the résumé's titles, years and strongest skills, aimed at this job.
- No filler recruiters skim past (it reads as AI-written): never write ${CLICHES.join(", ")}.
Reply as JSON.`,
    `RÉSUMÉ:\n${text}\n\nTARGET JOB: ${job.title} at ${job.company}\nSkills it names: ${wants.join(", ") || "(none we know)"}\n${clip(String(job.description).replace(/\s+/g, " "), 3000)}`, schema, 4000);
  const lines = resume.split("\n").map((l) => l.trim()).filter(Boolean), orig = extract(resume).bullets, known = `${resume}\n${job.description}`;
  const roles = (out.roles ?? []).map((r: any) => ({ heading: closest(String(r.heading ?? ""), lines),
    // gemma4 on Ollama Cloud doesn't always keep to the schema's keys ({ from, to }, { from, reworded }): the text is the other string
    bullets: (r.bullets ?? []).map((b: any) => { const from = closest(String(b.from ?? ""), orig), text = String(b.text ?? Object.entries(b ?? {}).find(([k, v]) => k !== "from" && typeof v === "string")?.[1] ?? "").trim();
      const g = guard(from, text, resume, known); return { text: g.after, from, notes: g.notes }; }).filter((b: any) => b.text) }))
    .filter((r: any) => r.heading && r.bullets.length);
  if (!roles.length) return { error: "The AI's version didn't keep your roles recognizably; try again, or use the suggestions below." };
  return { summary: guard("", String(out.summary ?? ""), resume, known).after, skills: [...new Map((out.skills ?? []).map((x: unknown) => String(x).trim()).filter(Boolean).map((x: string) => [x.toLowerCase(), x])).values()].slice(0, 30), roles, by: out._model };
}

// ---------- the market in words ----------
const FIELD: Record<string, string> = { people: "people / HR", support: "customer support", health: "health care", data: "data & analytics" };
const LEVEL: Record<string, string> = { junior: "entry / junior", mid: "mid-level", staff: "staff / principal", manager: "manager / lead", executive: "VP / executive" };
// findings from outside this site, with their sources, so advice can lean on them (each is a numbered fact like the others)
const RESEARCH = [
  "Job seekers who sent 11 to 20 applications in a quarter got interviews from 8.0% of them; those who sent 100 or more, from 2.4% (Huntr, Q3 2026, 84,753 applications)",
  "Applying to a former employer: 17.6% of applications got an interview, against 8.6% elsewhere for the same people (Huntr, Q3 2026)",
  "63% of job seekers who used AI on their résumé say it added false details such as skills, numbers or results (Huntr, Q3 2026)",
  "67% of HR leaders say AI-generated applications slowed hiring, and 65% of hiring managers say verifying skills got harder (Robert Half, March 2026)",
];
const k$ = (v: number | null) => (v == null ? "unknown" : `$${Math.round(v / 1000)}k`);
const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const vs = (c: number | null) => (c == null ? "" : `, ${Math.abs(c)}% ${c >= 0 ? "more" : "fewer"} than the weekly average of the 3 weeks before`);
/** Numbered facts about one slice of the market, by code; the model only words them. */
export function marketFacts(qy: Query) {
  const m = market(qy), F: { id: string; text: string }[] = [], add = (text: string, id = `F${F.length + 1}`) => F.push({ id, text });
  add(`${m.open} open jobs; ${m.withPay} of them state pay; median stated pay ${k$(m.pay)} a year, middle half ${k$(m.p25)} to ${k$(m.p75)}`);
  add(`${m.new7} new postings in the last 7 days${vs(m.change)}`);
  for (const w of m.weeks.slice(-4)) add(`Week of ${day(w.from)}: ${w.new} new postings, ${w.closed} taken down${w.pay ? `, median pay of the new ones ${k$(w.pay)}` : ""}`);
  for (const f of m.fields.slice(0, 8)) add(`Field ${FIELD[f.key] ?? f.key}: ${f.open} open, ${f.new7} new this week${vs(f.change)}${f.pay ? `, median pay ${k$(f.pay)}` : ""}`);
  for (const l of m.levels) add(`Level ${LEVEL[l.key] ?? l.key}: ${l.open} open, ${l.new7} new this week${vs(l.change)}${l.pay ? `, median pay ${k$(l.pay)}` : ""}`);
  for (const c of m.companies.slice(0, 10)) add(`${c.name}: ${c.open} open, ${c.new30} posted and ${c.closed30} taken down in the last 30 days, ${c.stale}% of its open jobs posted over 60 days ago${c.pay ? `, median pay ${k$(c.pay)}` : ""}`);
  for (const r of m.roles.slice(0, 8)) add(`Role "${r.key}": ${r.open} open${r.pay ? `, median pay ${k$(r.pay)}` : ""}`);
  RESEARCH.forEach((t, i) => add(t, `R${i + 1}`));
  return F;
}
const briefs = new Map<string, { at: number; p: Promise<any> }>();
/** An overview, findings and advice for one slice, worded by the model from marketFacts; any line that names a number its
 *  cited facts don't have is dropped (faithful, as in the city's briefs). One per slice an hour; a second visitor waits on the first. */
export function marketBrief(qy: Query) {
  const key = JSON.stringify(qy), hit = briefs.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.p;
  for (const [k, b] of briefs) if (Date.now() - b.at > 3600_000) briefs.delete(k);
  const scope = [qy.q && `jobs matching "${qy.q}"`, qy.func && `field ${qy.func}`, qy.seniority && `level ${qy.seniority}`, qy.region && `region ${qy.region}`, qy.remote && `work ${qy.remote}`, qy.company && `company ${qy.company}`].filter(Boolean).join(", ") || "all jobs in New York City, New Jersey, the metro and remote in the US";
  const p = (async () => {
    const F = marketFacts(qy), byId = new Map(F.map((f) => [f.id, f.text])), item = { type: "object", required: ["text", "facts"], properties: { text: { type: "string" }, facts: { type: "array", items: { type: "string" } } } };
    const out = await llmJson(`You are a labor-market analyst writing for one job seeker. The slice of the market: ${scope}. Use only the numbered facts.
'overview': two sentences on the state of this slice. 'points': 3 to 5 findings: which fields, levels, companies and roles are growing or shrinking, what they pay, which employers post a lot that sits open. 'advice': 3 to 5 concrete recommendations for someone job hunting in this slice: where to aim, which employers are hiring actively, what pay to ask for, how to apply (the R facts are research about applying).
Every item lists the ids of the facts it uses. Copy each number exactly as its fact writes it; never add a number, company, trend or cause that isn't in the facts. Plain words, no filler. Reply as JSON.`,
      F.map((f) => `[${f.id}] ${f.text}`).join("\n"), { type: "object", required: ["overview", "points", "advice"], properties: { overview: item, points: { type: "array", items: item }, advice: { type: "array", items: item } } }, 2500);
    // gemma4 on Ollama Cloud may skip the schema's { text, facts } and write "… $94k [F8]." instead: both are read the same way
    const read = (x: any) => { const raw = typeof x === "string" ? x : String(x?.text ?? ""), cited = [...raw.matchAll(/\b[FR]\d+\b/g)].map((m) => m[0]);
      return { text: raw.replace(/\s*\[[FR]\d+(?:\s*[,;]\s*[FR]\d+)*\]/g, "").trim(), facts: [...new Set([...(Array.isArray(x?.facts) ? x.facts.map(String) : []), ...cited])] }; };
    const ok = (x: { text: string; facts: string[] }) => !!x.text && faithful(x, byId), list = (l: any) => (Array.isArray(l) ? l.map(read).filter(ok).slice(0, 5) : []), ov = read(out.overview);
    const r = { overview: ok(ov) ? ov : null, points: list(out.points), advice: list(out.advice), facts: F, by: out._model };
    if (!r.overview && !r.points.length && !r.advice.length) throw new Error("The AI's overview didn't check out against the numbers; try again in a minute.");
    return r;
  })();
  briefs.set(key, { at: Date.now(), p }); p.catch(() => briefs.delete(key));
  return p;
}
