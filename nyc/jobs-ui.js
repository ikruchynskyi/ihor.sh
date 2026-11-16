// Shared by the jobs pages (jobs.html, job.html, company.html, resume.html): the API, labels and formatting, the
// applications store, the red-flag check's card, and your data in your account when you're signed in.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// reCAPTCHA v3 (server.ts): a call the server wants checked answers 403 { captcha: <site key> }; Google's script loads
// then (not before), scores the visit, and the call goes once more with the token.
let rc;
const captcha = (key) => (rc ??= new Promise((ok, no) => { const s = document.createElement("script"); s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`; s.onload = () => grecaptcha.ready(ok); s.onerror = no; document.head.append(s); }))
  .then(() => grecaptcha.execute(key, { action: "jobs" }));
const fetchHuman = async (u, init = {}) => { const r = await fetch(u, init), d = r.status === 403 ? await r.clone().json().catch(() => ({})) : {};
  return d.captcha ? fetch(u, { ...init, headers: { ...init.headers, "x-recaptcha": await captcha(d.captcha) } }) : r; };
export const getJSON = (u) => fetchHuman(u).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`); return d; });
export const post = (u, body) => fetchHuman(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`); return d; });
/** A slow AI answer started as a job (server.ts startJob): poll until it's done. */
export const poll = async (id, step) => { for (;;) { await new Promise((r) => setTimeout(r, 2500)); const j = await getJSON(`/api/nyc/brief-job?id=${id}`); if (j.error) throw new Error(j.error); if (j.result) return j.result; step?.(j.step); } };
export const LABEL = {
  region: { nyc: "New York City", nj: "New Jersey", metro: "Metro (Westchester, LI, CT)", remote: "Remote (US)" },
  remote: { onsite: "On site", hybrid: "Hybrid", remote: "Remote" },
  seniority: { intern: "Intern", junior: "Entry / junior", mid: "Mid", senior: "Senior", staff: "Staff / principal", manager: "Manager / lead", director: "Director", executive: "VP / executive" },
  func: { engineering: "Engineering", data: "Data & analytics", design: "Design", product: "Product", sales: "Sales", marketing: "Marketing", finance: "Finance", legal: "Legal", people: "People / HR", support: "Customer support", operations: "Operations", health: "Health care", education: "Education", other: "Other" },
  source: { greenhouse: "Employer (Greenhouse)", lever: "Employer (Lever)", ashby: "Employer (Ashby)", workday: "Employer (Workday)", smartrecruiters: "Employer (SmartRecruiters)", workable: "Employer (Workable)", oracle: "Employer (Oracle)", eightfold: "Employer (Eightfold)", amazon: "Employer (Amazon)", custom: "Employer (own site)", nycjobs: "NYC government", usajobs: "US government (USAJOBS)", remotive: "Remotive", himalayas: "Himalayas", adzuna: "Adzuna" },
};
export const verified = (s) => ["greenhouse", "lever", "ashby", "workday", "smartrecruiters", "workable", "oracle", "eightfold", "amazon", "custom", "nycjobs", "usajobs"].includes(s);
export const money = (v, per) => (per === "hour" ? `$${Math.round(v)}/h` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);
export const pay = (r) => (r.salary_min ? `${money(r.salary_min, r.salary_period)}${r.salary_max && r.salary_max !== r.salary_min ? `–${money(r.salary_max, r.salary_period)}` : ""}${r.salary_est ? " est." : ""}` : "");
export const age = (t) => { const d = (Date.now() / 1000 - t) / 86400; return d < 1 ? "today" : d < 2 ? "yesterday" : d < 60 ? `${Math.floor(d)} days ago` : `${Math.floor(d / 30)} months ago`; };
export const jobLink = (r, text = r.title) => `<a href="/nyc/job.html?id=${encodeURIComponent(r.id)}">${esc(text)}</a>`;
export const companyLink = (name) => `<a href="/nyc/company.html?c=${encodeURIComponent(name)}">${esc(name)}</a>`;

// ---------- my applications (localStorage "jobs-tracker"; also in your account when signed in) ----------
export const TK = "jobs-tracker", SK = "jobs-saved", STAGES = ["saved", "applied", "interview", "offer", "rejected", "withdrawn"];
export const tracked = () => { try { return JSON.parse(localStorage.getItem(TK) ?? "{}"); } catch { return {}; } };
export const savedSearches = () => { try { return JSON.parse(localStorage.getItem(SK) ?? "[]"); } catch { return []; } };
const GK = "jobs-tracker-gone"; // ids removed, and when: so another device's older copy can't bring them back
const gone = () => { try { return JSON.parse(localStorage.getItem(GK) ?? "{}"); } catch { return {}; } };
/** Saves the tracker (each entry stamped when it changed, so two devices merge entry by entry) and sends it to your account. */
export function putTracked(t) {
  const before = tracked(), g = gone();
  for (const [id, e] of Object.entries(t)) { if (JSON.stringify(before[id]) !== JSON.stringify(e)) e.upd = Date.now(); delete g[id]; }
  for (const id of Object.keys(before)) if (!t[id]) g[id] = Date.now();
  try { localStorage.setItem(TK, JSON.stringify(t)); localStorage.setItem(GK, JSON.stringify(g)); } catch { return false; }
  sync("tracker", { entries: t, gone: g }); return true;
}
export function putSaved(l) { try { localStorage.setItem(SK, JSON.stringify(l)); } catch { return false; } sync("saved", l); return true; }

// ---------- your account (server/auth.ts): who you are, and your data on the server ----------
let meP;
export const me = () => (meP ??= getJSON("/api/auth/me").then((d) => d.user).catch(() => null));
const timers = {};
function sync(key, value) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => me().then((u) => u && post("/api/me/data", { key, value: JSON.stringify(value) }).catch(() => {})), 800);
}
/** Signed in: merges this browser's tracker and saved searches with your account's (newest entry wins, removals kept),
 *  stores the result in both, and returns true. Signed out: false, and nothing leaves the browser. */
export async function pullAccount() {
  const u = await me(); if (!u) return false;
  const d = await getJSON("/api/me/data").catch(() => null); if (!d) return false;
  const server = JSON.parse(d.tracker ?? "{}"), se = server.entries ?? {}, sg = server.gone ?? {}, le = tracked(), lg = gone(), entries = {}, g = {};
  const when = (e) => e.upd ?? e.saved ?? 0;
  for (const id of new Set([...Object.keys(se), ...Object.keys(sg), ...Object.keys(le), ...Object.keys(lg)])) { // the newest word on each job wins
    const entry = [se[id], le[id]].filter(Boolean).sort((a, b) => when(b) - when(a))[0], removed = Math.max(sg[id] ?? 0, lg[id] ?? 0);
    if (entry && when(entry) >= removed) entries[id] = entry; else if (removed) g[id] = removed;
  }
  try { localStorage.setItem(TK, JSON.stringify(entries)); localStorage.setItem(GK, JSON.stringify(g)); } catch {}
  const saved = [...savedSearches(), ...JSON.parse(d.saved ?? "[]")].filter((s, i, a) => s?.q && a.findIndex((x) => x.q === s.q) === i);
  try { localStorage.setItem(SK, JSON.stringify(saved)); } catch {}
  await post("/api/me/data", { key: "tracker", value: JSON.stringify({ entries, gone: g }) }).catch(() => {});
  await post("/api/me/data", { key: "saved", value: JSON.stringify(saved) }).catch(() => {});
  return true;
}

// ---------- 🔍 the red-flag check ----------
export const runCheck = async (jobId, step) => { const { id } = await post(`/api/jobs/check?id=${encodeURIComponent(jobId)}`, {}); return poll(id, step); };
export function checkHTML(r) {
  const F = new Map(r.facts.map((f) => [f.id, f.text]));
  const cite = (x) => (x.facts.length ? ` <sup title="${esc(x.facts.map((i) => `${i}: ${F.get(i)}`).join("\n"))}">[${x.facts.map(esc).join(", ")}]</sup>` : "");
  const quote = (x) => (x.quote ? `<br><span class="hint">“${esc(x.quote)}”</span>` : "");
  return `<div class="card brief" style="padding:8px 12px;margin:6px 0">${r.verdict ? `<p><b>${esc(r.verdict)}</b></p>` : ""}
    ${r.flags.length ? `<ul>${r.flags.map((f) => `<li><span class="chip${f.severity === "low" ? "" : " flag"}">${f.severity === "high" ? "⚑⚑ " : "⚑ "}${esc(f.flag)}</span> ${esc(f.why)}${cite(f)}${quote(f)}${f.ask ? `<br><span class="hint">Ask them: ${esc(f.ask)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="hint">No red flags that hold up against the facts.</p>`}
    ${r.good.length ? `<b>Good signs</b><ul>${r.good.map((g) => `<li>✓ ${esc(g.text)}${cite(g)}${quote(g)}</li>`).join("")}</ul>` : ""}
    <p class="hint">Checked by AI on ${new Date(r.at * 1000).toLocaleDateString()} from the posting and ${r.facts.length} facts from this site's record of ${esc(r.company)} (hover a [H…]). A flag that cites nothing or misquotes the posting is dropped.</p></div>`;
}
