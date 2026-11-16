// The company card (nyc/company.html, and a line on each job page): what the business does (Wikipedia), how it hires
// here (this site's own record), what it pays (Levels.fyi, cited and linked back as it asks), its last two weeks of news
// (Google News), and if it's public, two years of its stock (Nasdaq's quotes). An AI overview is worded from those as
// numbered facts, every line checked against them (faithful). Made daily for the biggest employers (cron), on request
// for any other.
import { llmJson, faithful } from "./llm.ts";
import { employer, saveCompanyInfo, getCompanyInfo, topEmployers } from "./jobs.ts";
import { cited } from "./jobs-ai.ts";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const get = async (u: string, headers: Record<string, string> = {}) => { const r = await fetch(u, { headers: { "user-agent": UA, ...headers }, signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
const NASDAQ = { accept: "application/json", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" };
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
/** The name as news and markets know it: "DoorDash USA" → "DoorDash", "Acme, Inc." → "Acme". */
/** "Coherent Corp." is not Cohere, "Sierra Leone Company" not Sierra: a listing or page is the employer's only when its
 *  name is the employer's plus at most corporate words. */
const SUFFIX = /^(inc|corp|corporation|co|company|holdings?|group|ltd|lp|llc|plc|nv|sa|ag|global|platforms|technolog(y|ies)|markets|com|financial|healthcare|health|international|capital|assetmanagement|communications|transportation|services|ai|the)*$/;
const named = (full: string, want: string) => full.startsWith(want) && SUFFIX.test(full.slice(want.length));
const plain = (name: string) => name.replace(/[,.]?\s+\b(USA|US|Inc|LLC|L\.P|LP|Corp|Corporation|Co|Ltd|PLC|Holdings|Group)\b\.?/gi, "").trim() || name;

// ---------- the stock: a ticker from Nasdaq's symbol search (plain US stocks whose name starts with the company's) ----------
const LISTED_AS: Record<string, string> = { google: "Alphabet", youtube: "Alphabet", instagram: "Meta Platforms", whatsapp: "Meta Platforms" };
// the big banks' names find only their notes and CDs in Nasdaq's search
const TICKER: Record<string, string> = { prudential: "PRU", jpmorganchase: "JPM", chase: "JPM", goldmansachs: "GS", morganstanley: "MS", citi: "C", citibank: "C", citigroup: "C", bankofamerica: "BAC", wellsfargo: "WFC", blackrock: "BLK", bny: "BK", capitalone: "COF", americanexpress: "AXP" };
export async function ticker(name: string) {
  if (TICKER[norm(name)]) return TICKER[norm(name)];
  const as = LISTED_AS[norm(name)] ?? name, want = norm(as);
  const d = JSON.parse(await get(`https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(as)}`, NASDAQ));
  return (d.data ?? []).find((x: any) => x.asset === "STOCKS" && /^[A-Z]{1,5}$/.test(x.symbol) && named(norm(String(x.name).split(/\s+(?:Class [A-Z]\b|Common Stock|Capital Stock|Ordinary Shares|American Depositary)/)[0]), want))?.symbol ?? null;
}
/** Two years of daily closes (weekly in the card), the last price, its 1- and 2-year change and its 52-week range. */
async function stock(sym: string) {
  const day = (d: Date) => d.toISOString().slice(0, 10), to = new Date(), from = new Date(Date.now() - 730 * 86400_000);
  const d = JSON.parse(await get(`https://api.nasdaq.com/api/quote/${sym}/historical?assetclass=stocks&fromdate=${day(from)}&todate=${day(to)}&limit=800`, NASDAQ));
  const rows = (d.data?.tradesTable?.rows ?? []).map((r: any) => ({ t: Date.parse(r.date) / 1000, c: Number(String(r.close).replace(/[$,]/g, "")) })).filter((r: any) => r.c > 0).reverse();
  if (rows.length < 50) return null;
  const last = rows.at(-1), back = (days: number) => rows.find((r: any) => r.t >= last.t - days * 86400) ?? rows[0], ch = (a: number, b: number) => Math.round((b / a - 1) * 1000) / 10;
  const year = rows.filter((r: any) => r.t >= last.t - 365 * 86400).map((r: any) => r.c);
  return { ticker: sym, last: last.c, asOf: last.t, change1y: ch(back(365).c, last.c), change2y: ch(rows[0].c, last.c), high52: Math.max(...year), low52: Math.min(...year),
    weekly: rows.filter((_: any, i: number) => i % 5 === 0 || i === rows.length - 1).map((r: any) => [r.t, r.c]) };
}

// ---------- news (Google News, two weeks) and what the business is (Wikipedia) ----------
const unxml = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
export async function news(name: string) {
  // a one-word name is also a word ("Ramp", "Block", "Mercury"): business news only, and the name capitalized in the headline
  const q = `"${name}" (company OR startup OR CEO OR funding OR raises OR valuation OR earnings OR layoffs OR hiring OR acquires OR launches OR AI) when:14d`;
  const bare = name.replace(/^The\s+/, ""), first = bare.split(/\s+/)[0], esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`\\b${esc(first.length >= 6 ? first : bare)}\\b`); // "JPMorgan" will do for JPMorgan Chase; "S&P" alone won't for S&P Global
  const x = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US%3Aen`);
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 30).map(([, it]) => {
    const tag = (t: string) => unxml(it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    const source = tag("source"); return { title: tag("title").replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""), source, url: tag("link"), at: Math.floor(Date.parse(tag("pubDate")) / 1000) };
  }).filter((n) => word.test(n.title) && n.url.startsWith("https://")).slice(0, 6); // in Google's order: by date, "Ramp Up" headlines rose above Ramp's own news
}
export async function wiki(name: string) {
  const h = { "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)" };
  const s = JSON.parse(await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${name} company`)}&srlimit=1&format=json`, h)), title = s.query?.search?.[0]?.title;
  if (!title) return null;
  const d = JSON.parse(await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, h));
  const t = norm(String(d.title ?? "").replace(/\(.*\)/, "")), n = norm(name); // the search's best page may be about something else ("NYC Dept of Health" → a soda rule)
  if (!named(t, n)) return null;
  return d.type === "standard" && d.extract ? { title: d.title, extract: String(d.extract), url: d.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` } : null;
}

// ---------- pay: Levels.fyi (its MCP server's free tools, and the LLM-readable pages its robots.txt offers agents) ----------
let lvNext = 0; // Levels.fyi throttles a burst and a busy hour: a call every 4 s at most
const lvPace = async () => { const wait = lvNext - Date.now(); lvNext = Math.max(Date.now(), lvNext) + 4000; if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };
async function levelsTool(tool: string, args: object) {
  const call = async (method: string, params: object, id: number) => { await lvPace(); const t = await (await fetch("https://mcp.levels.fyi/", { method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "ihor.sh jobs (+https://ihor.sh/nyc/jobs.html)" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).text();
    const line = t.split("\n").find((l) => l.startsWith("data: ")); return JSON.parse(line ? line.slice(6) : t); };
  const r = await call("tools/call", { name: tool, arguments: args }, 1), text = r.result?.content?.map((c: any) => c.text).join("\n") ?? "";
  try { return JSON.parse(text); } catch { return null; } // a "sign in to use this" answer isn't data
}
const FAMILY: Record<string, string[]> = { engineering: ["software-engineer"], data: ["data-scientist", "data-analyst"], product: ["product-manager"], finance: ["financial-analyst", "investment-banker"], design: ["product-designer"] };
/** The company's pay on Levels.fyi for the job families it hires most for here: median total pay and each level's (US),
 *  next to the NYC market's median for the family (all companies). */
export async function levels(name: string, fields: [string, number][]) {
  const slug = (await levelsTool("search-companies", { searchText: name, limit: 1 }))?.[0]?.slug; if (!slug) return null;
  const families = fields.flatMap(([f]) => FAMILY[f] ?? []).slice(0, 3), out: any[] = [];
  for (const f of families) {
    await lvPace(); const md = await get(`https://www.levels.fyi/companies/${slug}/salaries/${f}.md`, { "user-agent": "Claude-User" }).catch(() => "");
    const median = Number(md.match(/Median Total Compensation:\s*\$([\d,]+)/)?.[1]?.replace(/,/g, "") ?? 0);
    if (!median) continue;
    const lv = [...md.matchAll(/^\|\s*([^|\n]+?)\s*\|\s*\$([\d,]+)\s*\|\s*$/gm)].map(([, l, v]) => ({ level: l, pay: Number(v.replace(/,/g, "")) })).filter((x) => !/^level$/i.test(x.level)).slice(0, 10);
    const nyc = (await levelsTool("get-salary-percentiles", { jobFamilySlug: f, locationSlugs: ["new-york-city-area"] }).catch(() => null))?.locations?.[0]?.medianTotalCompensation ?? null;
    out.push({ family: f, median, levels: lv, nycMarket: nyc, url: `https://www.levels.fyi/companies/${slug}/salaries/${f}` });
  }
  return out.length ? { slug, families: out } : null;
}

/** The Market tab's Levels.fyi part: each job family's NYC median total pay, and the US's top-paying companies for it
 *  with how many jobs each has open here. Made each morning with the cards. */
export async function levelsMarket() {
  const out: any[] = [];
  for (const f of ["software-engineer", "data-scientist", "data-analyst", "product-manager", "product-designer", "financial-analyst"]) {
    const nyc = (await levelsTool("get-salary-percentiles", { jobFamilySlug: f, locationSlugs: ["new-york-city-area"] }).catch(() => null))?.locations?.[0]?.medianTotalCompensation ?? null;
    const top = ((await levelsTool("search-top-companies", { jobFamilySlug: f, countrySlug: "united-states" }).catch(() => null))?.companies ?? []) as any[];
    out.push({ family: f, nycMedian: nyc, url: `https://www.levels.fyi/t/${f}/locations/new-york-city-area`,
      top: top.slice(0, 15).map((c) => ({ name: String(c.name), pay: Number(c.totalCompensation), open: employer(String(c.name))?.open ?? 0 })) });
  }
  saveCompanyInfo(LEVELS_MARKET, { at: Math.floor(Date.now() / 1000), families: out });
  return out;
}
export const LEVELS_MARKET = "levels.fyi market";

// ---------- the card ----------
const k$ = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`), day = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const FAMILY_NAME: Record<string, string> = { "software-engineer": "software engineers", "data-scientist": "data scientists", "data-analyst": "data analysts", "product-manager": "product managers", "financial-analyst": "financial analysts", "investment-banker": "investment bankers", "product-designer": "product designers" };
/** Gathers the facts, has the model word an overview from them (each line checked), and stores the card (the page shows its date). */
export async function companyCard(name: string) {
  const e = employer(name); if (!e) throw new Error("No open jobs from that employer here.");
  const before = getCompanyInfo(e.name); // what it does and its pay by level change slowly: kept when today's read fails
  const nm = plain(e.name), [w, n, sym] = await Promise.all([wiki(nm).catch(() => before?.wiki ?? null), news(nm).catch(() => []), ticker(nm).catch(() => null)]);
  const [st, lv] = await Promise.all([sym ? stock(sym).catch(() => null) : null, levels(nm, e.fields as [string, number][]).catch(() => null).then((x) => x ?? before?.levels ?? null)]);
  const F: { id: string; text: string }[] = [], add = (text: string) => { F.push({ id: `F${F.length + 1}`, text }); };
  if (w) add(`About ${e.name} (Wikipedia): ${w.extract.split(/(?<=\.)\s+/).slice(0, 3).join(" ")}`);
  add(`On this site ${e.name} has ${e.open} open jobs in the NYC area and remote US; ${e.new30} were posted and ${e.gone30} taken down in the last 30 days; ${e.stale}% of its open jobs have been up over 60 days.`);
  const wk = e.weeks as number[]; if (wk.length >= 8) add(`Its new postings over the last 4 weeks: ${wk.slice(-4).reduce((a, b) => a + b, 0)}; the 4 weeks before: ${wk.slice(-8, -4).reduce((a, b) => a + b, 0)}.`);
  if (e.fields.length) add(`Its open jobs here by field: ${e.fields.slice(0, 4).map(([f, c]) => `${f} ${c}`).join(", ")}.`);
  if (e.pay) add(`Stated pay on its open jobs here: median ${k$(e.pay.median)} a year, middle half ${k$(e.pay.p25)} to ${k$(e.pay.p75)}.`);
  if (st) add(`Its stock (${st.ticker}) closed at $${st.last.toFixed(2)} on ${day(st.asOf)}: ${st.change1y >= 0 ? "up" : "down"} ${Math.abs(st.change1y)}% in a year and ${st.change2y >= 0 ? "up" : "down"} ${Math.abs(st.change2y)}% in two; its 52-week range is $${st.low52.toFixed(2)} to $${st.high52.toFixed(2)}.`);
  for (const f of lv?.families ?? []) add(`Levels.fyi: ${FAMILY_NAME[f.family] ?? f.family} at ${e.name} report a median total pay of ${k$(f.median)} (US, all levels)${f.levels.length ? `, from ${k$(f.levels[0].pay)} at ${f.levels[0].level} to ${k$(f.levels.at(-1).pay)} at ${f.levels.at(-1).level}` : ""}${f.nycMarket ? `; the NYC median for the job, all companies, is ${k$(f.nycMarket)}` : ""}.`);
  for (const x of n.slice(0, 5)) add(`News (${x.source}, ${day(x.at)}): ${x.title}`);
  const byId = new Map(F.map((f) => [f.id, f.text])), item = { type: "object", required: ["text", "facts"], properties: { text: { type: "string" }, facts: { type: "array", items: { type: "string" } } } };
  const out = await llmJson(`You write a short, plain company profile for a job seeker in New York. Use only the numbered facts. 'business': one or two sentences on what the company does. 'hiring': one or two sentences on how it is hiring here now (numbers from this site). 'market': one or two sentences on its stock and recent news, if the facts have them, else "". 'tips': up to 3 short pieces of advice for someone applying there now (pay to expect, what's moving). Each item lists the ids of the facts it uses; copy every number exactly as its fact writes it (\"Third Quarter\" stays words, never \"Q3\"); add nothing the facts don't say. Reply as JSON.`,
    F.map((f) => `[${f.id}] ${f.text}`).join("\n"), { type: "object", required: ["business", "hiring", "market", "tips"], properties: { business: item, hiring: item, market: item, tips: { type: "array", items: item } } }, 1200).catch(() => null);
  const ok = (x: any) => { const c = cited(x); return c.text && faithful(c, byId) ? c : null; };
  const card = { name: e.name, at: Math.floor(Date.now() / 1000), wiki: w, ticker: sym, stock: st, news: n, levels: lv, weeks: wk,
    overview: out ? { business: w ? ok(out.business) : null /* no source, no "what it does" (the number check can't catch a made-up one) */, hiring: ok(out.hiring), market: ok(out.market), tips: (Array.isArray(out.tips) ? out.tips : []).map(ok).filter(Boolean).slice(0, 3) } : null, facts: F };
  saveCompanyInfo(e.name, card);
  return card;
}

const making = new Map<string, Promise<any>>(); // one card made at a time per company, however many visitors ask
export const makeCard = (name: string) => { const k = name.toLowerCase(); if (!making.has(k)) making.set(k, companyCard(name).finally(() => making.delete(k))); return making.get(k)!; };
/** The job page's line about its employer: the card without its long parts. */
export const miniCard = (name: string) => { const c = getCompanyInfo(name); return c && { at: c.at, ticker: c.ticker, stock: c.stock && { ...c.stock, weekly: undefined }, business: c.overview?.business?.text ?? null, levels: c.levels }; };
/** Each morning (cron): the cards of the employers with the most open jobs here, on the local model, done by 8. */
export async function refreshCards(n = 80) {
  let made = 0; await levelsMarket().catch(() => {});
  for (const name of topEmployers(n)) {
    if (Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" })) >= 8) break;
    if (Date.now() / 1000 - (getCompanyInfo(name)?.at ?? 0) < 12 * 3600) continue; // made today already (a rerun, or a visitor asked)
    await makeCard(name).then(() => made++).catch(() => {});
  }
  return made;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "test") { // node server/company.ts test: the name and relevance rules
  const assert = (await import("node:assert/strict")).default;
  for (const [full, want, ok] of [["Datadog, Inc.", "Datadog", 1], ["Coherent Corp.", "Cohere", 0], ["Sierra Bancorp", "Sierra", 0], ["Meta Platforms, Inc.", "Meta", 1], ["Coinbase Global, Inc.", "Coinbase", 1],
    ["Sierra Leone Company", "Sierra", 0], ["Temporal paradox", "Temporal", 0], ["Bloomberg L.P.", "Bloomberg", 1], ["Citigroup", "Citi", 1], ["The New York Times Company", "The New York Times", 1], ["Charlie Baker", "Charlie Health", 0]] as const)
    assert.equal(named(norm(full), norm(want)), !!ok, full);
  assert.equal(plain("DoorDash USA"), "DoorDash"); assert.equal(plain("Acme, Inc."), "Acme"); assert.equal(plain("Goldman Sachs"), "Goldman Sachs"); assert.equal(plain("US Bank"), "US Bank");
  console.log("company ok"); process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) { // node server/company.ts <company> (JOBS_DB pointing at a copy)
  const c = await companyCard(process.argv[2] ?? "Datadog");
  console.log(JSON.stringify({ ...c, stock: c.stock && { ...c.stock, weekly: `${c.stock.weekly.length} points` }, facts: c.facts.length }, null, 1).slice(0, 3000));
}
