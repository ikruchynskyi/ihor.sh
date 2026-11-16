// What people do on the site, logged by the server for the admin page (admin.html; user, 2026-11-16): every page view and
// API call, who made it (a signed-in user, a guest's session, or a bot), the action's name, a short detail (a search's
// words, a company's name; never a chat's or a résumé's text), the status and the time it took. Kept in its own
// data/activity.db; data loads ("api") 14 days, page views and actions 180.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.ACTIVITY_DB ?? path.join(dir, "activity.db")); // tests: ACTIVITY_DB=:memory:
db.exec(`create table if not exists events (at int, who text, user_id text, kind text, name text, path text, detail text, status int, ms int, bot int);
  create index if not exists events_at on events (at); create index if not exists events_who on events (who, at);`);
const now = () => Math.floor(Date.now() / 1000);

// The user actions by name (anything else under /api/ is a data load, named by its path); detail: which query parameter says what was asked
const ACTIONS: [RegExp, string, string?][] = [
  [/^\/api\/ask$/, "Blip question"], [/^\/(mcp|a2a)$/, "Agent (MCP/A2A)"],
  [/^\/api\/jobs\/search$/, "Job search", "q"], [/^\/api\/jobs\/market$/, "Jobs market"], [/^\/api\/jobs\/brief$/, "Jobs AI overview"], [/^\/api\/jobs\/check$/, "Job red-flag check", "id"],
  [/^\/api\/jobs\/(tailor|match|suggest|bullet)$/, "Résumé AI"], [/^\/api\/jobs\/company-card$/, "Company card made", "c"], [/^\/api\/jobs\/company$/, "Company page", "c"],
  [/^\/api\/jobs\/job$/, "Job page", "id"], [/^\/api\/jobs\/similar$/, "Similar jobs", "id"],
  [/^\/(api\/site\/)?search$/, "Site search", "q"], [/^\/api\/nyc\/events$/, "Events search", "q"], [/^\/api\/evening\/(plan|events)$/, "Evening planner", "q"],
  [/^\/api\/nyc\/trip$/, "Trip plan"], [/^\/api\/nyc\/(area-brief|incident-brief)$/, "Area AI brief"], [/^\/api\/nyc\/camera-inspect$/, "Camera AI look"],
  [/^\/api\/nyc\/(restaurants|restaurant)$/, "Restaurant lookup", "q"], [/^\/api\/nyc\/(geocode|suggest)$/, "Place search", "q"],
  [/^\/api\/memes\/search$/, "Meme search", "q"], [/^\/api\/memegen\//, "Meme made"], [/^\/api\/yomu\/chat$/, "Yomu chat"], [/^\/api\/yomu\/(search|kanji)$/, "Yomu lookup", "q"],
  [/^\/api\/radio\/(callsign|repeaters)$/, "Radio lookup", "q"], [/^\/api\/ride\/route$/, "Ride route"], [/^\/api\/orna\/plan$/, "Orna plan"],
  [/^(\/api\/auth\/token|\/auth\/google\/callback)$/, "Sign in"], [/^\/api\/auth\/logout$/, "Sign out"], [/^\/api\/push\/subscribe$/, "Alerts on"], [/^\/api\/me\/data$/, "Account sync"],
  [/^\/api\/admin\//, "Admin"],
];
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|python|curl|wget|httpclient|go-http|java\/|scrapy|axios|node-fetch/i;
export type Hit = { method: string; path: string; query: URLSearchParams; status: number; html: boolean; ms: number; userId?: string; session?: string; ip: string; ua: string };
/** How one request is logged: a page view, a named action, a data load, or nothing (static files). */
export function classify(h: Hit) {
  const bot = BOT.test(h.ua) ? 1 : 0, who = h.userId ?? (h.session ? `g:${h.session.slice(0, 12)}` : `ip:${h.ip}`);
  const act = ACTIONS.find(([re]) => re.test(h.path));
  if (act) {
    const detail = act[2] ? String(h.query.get(act[2]) ?? "").slice(0, 120) : "";
    return { who, kind: "action", name: act[1] + (act[1] === "Events search" && h.query.get("free") === "1" ? " (free)" : "") + (act[1] === "Job search" && h.query.get("semantic") === "1" ? " (by meaning)" : ""), detail, bot };
  }
  if (h.path.startsWith("/api/")) return { who, kind: "api", name: h.path.replace(/\/[\w-]{20,}$/, "/…"), detail: "", bot };
  if (h.method === "GET" && h.html && h.status < 400) return { who, kind: "page", name: h.path, detail: "", bot };
  return null;
}
const queue: any[] = [];
export function track(h: Hit) {
  const c = classify(h); if (!c) return;
  queue.push([now(), c.who, h.userId ?? null, c.kind, c.name, h.path.slice(0, 200), c.detail, h.status, h.ms, c.bot]);
  if (queue.length > 5000) flush();
}
const ins = db.prepare("insert into events values (?,?,?,?,?,?,?,?,?,?)");
function flush() {
  if (!queue.length) return;
  const rows = queue.splice(0); db.exec("begin");
  try { for (const r of rows) ins.run(...r); db.exec("commit"); } catch { db.exec("rollback"); }
}
setInterval(flush, 5000).unref(); // a batch every 5 s: one write for a page's dozen calls
setInterval(() => { db.prepare("delete from events where (kind = 'api' and at < ?) or at < ?").run(now() - 14 * 86400, now() - 180 * 86400); }, 6 * 3600_000).unref();

/** The admin page's numbers for the last `days` days (bots apart). */
export function stats(days = 7) {
  flush();
  const since = now() - days * 86400, q = (sql: string, ...a: any[]) => db.prepare(sql).all(since, ...a) as any[];
  const human = "at >= ? and bot = 0";
  return {
    days, since,
    totals: db.prepare(`select count(distinct who) people, count(distinct case when user_id is not null then who end) members, sum(kind = 'page') pages, sum(kind = 'action') actions, sum(kind = 'api') api from events where ${human}`).get(since),
    bots: db.prepare("select count(*) n, count(distinct who) who from events where at >= ? and bot = 1").get(since),
    daily: q(`select date(at, 'unixepoch', '-5 hours') day, count(distinct who) people, sum(kind = 'page') pages, sum(kind = 'action') actions from events where ${human} group by day order by day`),
    pages: q(`select name, count(*) n, count(distinct who) people from events where ${human} and kind = 'page' group by name order by n desc limit 25`),
    actions: q(`select name, count(*) n, count(distinct who) people, sum(status >= 400) failed from events where ${human} and kind = 'action' group by name order by n desc`),
    searches: q(`select name, detail, count(*) n from events where ${human} and kind = 'action' and detail != '' and name like '%search%' group by name, detail order by n desc limit 30`),
    people: q(`select who, max(user_id) user_id, count(*) n, sum(kind = 'page') pages, sum(kind = 'action') actions, max(at) last from events where ${human} group by who order by last desc limit 100`),
  };
}
/** The latest page views and actions, everyone's or one person's. */
export function recent(who?: string, limit = 200, before = now() + 1) {
  flush();
  return db.prepare(`select at, who, user_id, kind, name, detail, status, ms, bot from events where kind != 'api' and at < ? ${who ? "and who = ?" : ""} order by at desc limit ?`).all(...(who ? [before, who, limit] : [before, limit]));
}

if (import.meta.url === `file://${process.argv[1]}`) { // ACTIVITY_DB=:memory: node server/activity.ts
  const assert = (await import("node:assert/strict")).default, base = { method: "GET", status: 200, html: false, ms: 5, ip: "x", ua: "Mozilla/5.0" };
  assert.deepEqual(classify({ ...base, path: "/api/jobs/search", query: new URLSearchParams("q=rust&semantic=1"), session: "abcdefghijklmnop" }), { who: "g:abcdefghijkl", kind: "action", name: "Job search (by meaning)", detail: "rust", bot: 0 });
  assert.equal(classify({ ...base, path: "/api/nyc/events", query: new URLSearchParams("free=1"), userId: "u1" })?.name, "Events search (free)");
  assert.equal(classify({ ...base, path: "/nyc/jobs.html", query: new URLSearchParams(), html: true })?.kind, "page");
  assert.equal(classify({ ...base, path: "/theme.css", query: new URLSearchParams() }), null);
  assert.equal(classify({ ...base, path: "/nyc/", query: new URLSearchParams(), html: true, ua: "Googlebot/2.1" })?.bot, 1);
  track({ ...base, path: "/api/ask", query: new URLSearchParams(), userId: "u1" }); track({ ...base, path: "/nyc/", query: new URLSearchParams(), html: true, session: "s1" });
  const s = stats(1); assert.equal(s.totals.people, 2); assert.equal(s.actions[0].name, "Blip question"); assert.equal(recent("u1").length, 1);
  console.log("activity ok");
}
