// The AI side of jobs: résumé ↔ job matching and résumé rewrite suggestions. Embeddings are local (nomic-embed-text on
// this Mac's Ollama); the ranking and the rewriting use Blip's model (Ollama Cloud, then the local model). The résumé
// text is used for the request only: never stored, never logged.
import { needEmbedding, saveEmbedding, candidates, jobText, type Query } from "./jobs.ts";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434", EMBED = "nomic-embed-text";
const CLOUD_MODEL = process.env.BLIP_CLOUD_MODEL ?? "deepseek-v4.1-flash", LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";

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

/** One model call that must answer JSON in a schema: the cloud model first, the local one if it fails. */
async function llmJson(system: string, user: string, schema: object, maxTokens = 2500): Promise<any> {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }], key = process.env.OLLAMA_CLOUD_KEY;
  const parse = (s: string) => JSON.parse(s.replace(/^```(json)?|```$/g, "").trim());
  if (key) {
    try {
      const r = await fetch("https://ollama.com/api/chat", { method: "POST", signal: AbortSignal.timeout(90_000), headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: CLOUD_MODEL, stream: false, format: schema, options: { num_predict: maxTokens, temperature: 0.2 }, messages }) });
      if (r.ok) return parse((await r.json()).message.content);
    } catch {}
  }
  const r = await fetch(`${OLLAMA}/api/chat`, { method: "POST", signal: AbortSignal.timeout(240_000), body: JSON.stringify({ model: LOCAL_MODEL, stream: false, think: "low", format: schema, options: { num_predict: maxTokens, temperature: 0.2 }, messages }) });
  if (!r.ok) throw new Error(`model ${r.status}`);
  return parse((await r.json()).message.content);
}

// résumé verbs and connectives: rewording with these isn't adding facts
const COMMON = /^(assist|collab|contrib|coordin|creat|distrib|achiev|increas|improv|reduc|grow|boost|cut|reach|result|through|support|deliver|develop|design|manag|organiz|produc|launch|implem|maintain|partner|prepar|execut|handl|overs|ensur|enabl|provid|across|including|within|resulting|weekly|monthly|daily)/;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
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
  const by = new Map<string, any>((ranked?.jobs ?? []).map((r: any) => [r.id, r]));
  const strip = ({ v, ...j }: any) => j;
  return { ranked: !!ranked, jobs: near.slice(0, 15).map((j) => ({ ...strip(j), sim: +j.sim.toFixed(3), ...(by.get(j.id) ? { score: Math.max(0, Math.min(100, by.get(j.id).score)), has: by.get(j.id).has, missing: by.get(j.id).missing, why: by.get(j.id).why } : {}) })).sort((a: any, b: any) => (b.score ?? b.sim * 100) - (a.score ?? a.sim * 100)),
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
- 'summary': 2-3 sentences built only from the résumé's facts: its titles, years, skills and tools exactly as listed${job ? ". Use the job's words only where the résumé already shows them; never name a skill or tool the résumé doesn't list, and never say the person is 'seeking to leverage' skills they don't show" : ""}.
- 'terms': ${job ? "skills or words the job asks for that the résumé lacks; for each, 'where' says where it would go IF the person really has it" : "leave empty"}.
Return at most 8 bullets, the ones that gain the most. Reply as JSON.`,
    `RÉSUMÉ:\n${clip(resume, 6000)}\n\nBULLETS TO IMPROVE:\n${bullets.slice(0, 20).map((b) => `- ${b}`).join("\n")}${job ? `\n\nTARGET JOB: ${job.title} at ${job.company}\n${clip(String(job.description).replace(/\s+/g, " "), 2500)}` : ""}`, schema, 3000);
  // a check on "never invent": a rewritten bullet may not bring in numbers that aren't placeholders and weren't there
  const nums = (s: string) => (s.replace(/\[[^\]]*\]/g, "").match(/\d[\d,.]*%?/g) ?? []);
  out.bullets = (out.bullets ?? []).filter((b: any) => b.before && b.after).map((b: any) => {
    const added = nums(b.after).filter((n) => !nums(b.before).includes(n) && !resume.includes(n));
    return added.length ? { ...b, after: b.after.replace(new RegExp(added.map((a) => a.replace(/[.%]/g, (c) => `\\${c}`)).join("|"), "g"), "[X]"), why: `${b.why} (a number the résumé doesn't have became [X]: put in your real figure)` } : b;
  });
  // …and on the summary: a sentence naming a skill the job wants but the résumé doesn't have is dropped
  if (job && out.summary) {
    const { jobTerms } = await import("./nyc/resume.js") as any, lacking = jobTerms(String(job.description)).skills.filter((t: string) => !new RegExp(`\\b${t.replace(/[.+#]/g, (c: string) => `\\${c}`)}\\b`, "i").test(resume));
    out.summary = out.summary.split(/(?<=[.!?])\s+/).filter((sen: string) => !lacking.some((t: string) => new RegExp(`\\b${t.replace(/[.+#]/g, (c: string) => `\\${c}`)}\\b`, "i").test(sen))).join(" ");
  }
  // …and a promoted role or invented specifics get a visible warning rather than slipping through
  const STRONG = /\b(led|spearheaded|owned|directed|headed|managed|oversaw|architected)\b/i;
  out.bullets = out.bullets.map((b: any) => {
    const notes: string[] = [], before = b.before.toLowerCase();
    const promoted = b.after.match(STRONG)?.[0];
    if (promoted && !before.includes(promoted.toLowerCase())) notes.push(`"${promoted}" is stronger than the original: keep it only if it's true`);
    const newWords = (b.after.replace(/\[[^\]]*\]/g, "").toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []).filter((w: string) => !before.includes(w) && !resume.toLowerCase().includes(w) && !COMMON.test(w));
    if (newWords.length > 2) notes.push(`adds details that aren't in your résumé (${newWords.slice(0, 4).join(", ")}): keep only what's true`);
    return notes.length ? { ...b, why: `${b.why} ⚠ ${notes.join("; ")}` } : b;
  });
  return out;
}
