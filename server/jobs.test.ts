// Run: node server/jobs.test.ts (an in-memory database: never the live data/jobs.db)
process.env.JOBS_DB = ":memory:";
const assert = (await import("node:assert/strict")).default;
const { stripHtml, parseSalary, role, region, market, usPlace, sameCompany, seniority, flagsFor, dedupe, prune, refreshBoards, jobsHealth, resetLanes, jobsDb } = await import("./jobs.ts");
const { guard, match } = await import("./jobs-ai.ts");

// Greenhouse escapes its HTML twice: "&amp;mdash;" must come out as a dash, so the pay range parses (2026-11-16)
assert.equal(stripHtml("&lt;p&gt;Pay: $1&amp;mdash;$2 &amp;amp; more&amp;nbsp;now&lt;/p&gt;&lt;li&gt;A&lt;/li&gt;"), "Pay: $1—$2 & more now\n• A");
assert.deepEqual(parseSalary(stripHtml("Annual Salary:&lt;br&gt;$222,800&amp;mdash;$290,000 USD")), { min: 222800, max: 290000, period: "year" });
assert.deepEqual(parseSalary("$85,000.00 - $95,000.00 per year"), { min: 85000, max: 95000, period: "year" });
assert.deepEqual(parseSalary("pay is between $90,000 and $110,000 a year"), { min: 90000, max: 110000, period: "year" });
assert.deepEqual(parseSalary("$45/hr – $60/hr"), { min: 45, max: 60, period: "hour" });
assert.deepEqual(parseSalary("$150K-$200K"), { min: 150000, max: 200000, period: "year" });
assert.equal(parseSalary("raised $500 and $600 million"), null);
assert.deepEqual(parseSalary("The expected pay for this role will be $20.00 per hour."), { min: 20, max: 20, period: "hour" }); // one rate
assert.deepEqual(parseSalary("Base salary: $85,000 annually"), { min: 85000, max: 85000, period: "year" });
assert.equal(parseSalary("earn up to $55 an hour"), null); // a maximum isn't a rate
assert.deepEqual(parseSalary("$172,000/yr to $215,000/yr in Denver"), { min: 172000, max: 215000, period: "year" });
assert.deepEqual(parseSalary("$140,000\u2011$220,000 per year"), { min: 140000, max: 220000, period: "year" }); // a non-breaking hyphen
assert.equal(parseSalary("a $500 sign-on bonus"), null);
assert.deepEqual(parseSalary("The base pay for this position ranges from $139,100/year in our lowest geographic market up to $240,500/year in our highest geographic market."), { min: 139100, max: 240500, period: "year" }); // Amazon
assert.equal(role("Senior Data Engineer, Payments"), "data engineer");
assert.equal(role("Manager, Finance"), "manager finance");
assert.equal(region("Brooklyn, NY"), "nyc"); assert.equal(region("Remote, Manila"), null);
// places by name (places.json, GeoNames): the boroughs' neighbourhoods, the NY and CT suburbs; not upstate
assert.equal(region("Jamaica, NY"), "nyc"); assert.equal(region("Upper East Side, New York"), "nyc"); assert.equal(region("Flushing, NY; Remote"), "nyc");
assert.equal(region("Lake Success, NY"), "metro"); assert.equal(region(usPlace("New Hyde Park, New York, United States")), "metro");
assert.equal(region("Albany, NY"), null); assert.equal(region("Jamaica, VT"), null);
// places as Workday and USAJOBS write them
assert.equal(usPlace("New York New York United States"), "New York, NY"); assert.equal(usPlace("Jersey City, New Jersey"), "Jersey City, NJ");
assert.equal(usPlace("US-NY-New York"), "New York, NY"); assert.equal(usPlace("Woodbury, NY, United States"), "Woodbury, NY");
assert.equal(region(usPlace("New York New York United States")), "nyc"); assert.equal(region(usPlace("Newark-NJ-USA")), "nj");
assert.equal(region(usPlace("Princeton")), "nj"); assert.equal(region(usPlace("London")), null); assert.equal(usPlace("NY-New York"), "New York, NY"); assert.equal(region(usPlace("US-Remote")), "remote"); assert.equal(region("New York, 120 Wall Street, Song"), "nyc"); assert.equal(region("Albany, New York"), null); // PwC, Accenture
// one company under two names across platforms, and not two companies that share letters
assert.ok(sameCompany("citi", "citibank") && sameCompany("anthropiclimited", "anthropic") && sameCompany("jpmorganchase", "jpmorganchasebankna") && sameCompany("prudential", "prudentialfinancial"));
assert.ok(!sameCompany("meta", "metabolix") && !sameCompany("data", "datadog") && !sameCompany("abc", "abcbank"));
// levels: "associate" is junior only on its own
assert.equal(seniority("Associate Director, Strategy"), "director"); assert.equal(seniority("Senior Associate"), "senior"); assert.equal(seniority("Sales Associate"), "junior");
assert.equal(seniority("Junior Project Manager"), "junior"); assert.equal(seniority("Associate Product Manager"), "junior"); assert.equal(seniority("Data Engineer"), "mid");
// the crawl-time red flags
const base = { company: "Acme", region: "nyc", salary_min: 90000, posted: Math.floor(Date.now() / 1000), url: "", source: "greenhouse" };
const fl = (title: string, description: string, reposts = 0) => flagsFor({ ...base, title, description, reposts });
assert.ok(fl("Junior Analyst", "Requires 5+ years of relevant experience.").includes("entry-level title asking for 5+ years"));
assert.ok(!fl("Senior Analyst", "Requires 5+ years of relevant experience.").some((f) => f.startsWith("entry-level")));
assert.ok(fl("Engineer", "We want a rockstar who is a digital native.").some((f) => f.includes("screens people out")));
assert.ok(!fl("Engineer", "Be our product guru; recent graduates welcome; unpaid experience counts.").some((f) => /screens|unpaid/.test(f)), "common phrases don't fire");
assert.ok(fl("Engineer", "We're a family here. Work hard, play hard.").some((f) => f.startsWith("always-on")));
assert.ok(fl("Nurse", "Care for patients.", 3).includes("posted again 3 times in 6 months") && !fl("Nurse", "Care.", 1).some((f) => f.startsWith("posted again")));
// an empty market still answers in shape
const m = market({}); assert.equal(m.open, 0); assert.deepEqual(m.fields, []); assert.ok(Array.isArray(m.weeks));
// never invent: an unknown number becomes [X], a promoted verb gets a note
const g = guard("Helped with the billing migration", "Led the billing migration, cutting costs 40%", "Helped with the billing migration");
assert.ok(g.after.includes("[X]") && !g.after.includes("40") && g.notes.some((n) => n.includes('"Led"')), JSON.stringify(g));
assert.equal(guard("Cut costs 5%", "Cut costs 50%", "Cut costs 5%").after, "Cut costs [X]"); // the longer number first

// dedupe keeps employer board primary and clears stale duplicate flags cleanly
{
  const t = Math.floor(Date.now() / 1000);
  const ins = jobsDb.prepare(`insert into jobs (id, source, company, ckey, title, location, region, remote, posted, url, seniority, func, description, first_seen, last_seen, missed, closed, fp, flags)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,null,?, '[]')`);
  const fts = jobsDb.prepare("insert into jobs_fts2 (id, title, company, body) values (?,?,?,?)");
  const emb = jobsDb.prepare("insert into emb values (?, ?)");
  const vec = new Uint8Array(new Float32Array([1, 0, 0, 0]).buffer);
  ins.run("gh:acme:1", "greenhouse", "Acme", "acme", "Data Engineer", "New York, NY", "nyc", "onsite", t - 86400, "https://acme/1", "mid", "data", "Build pipelines", t - 86400, t, "00000000000000ff");
  ins.run("az:99", "adzuna", "Acme Inc", "acme", "Data Engineer", "New York, NY", "nyc", "onsite", t - 86400, "https://az/99", "mid", "data", "Build pipelines", t - 86400, t, "00000000000000ff");
  ins.run("gh:acme:2", "greenhouse", "Acme", "acme", "Staff Product Manager", "New York, NY", "nyc", "onsite", t - 86400, "https://acme/2", "staff", "product", "Product vision", t - 86400, t, "ff00000000000000");
  for (const [id, title] of [["gh:acme:1", "Data Engineer"], ["az:99", "Data Engineer"], ["gh:acme:2", "Staff Product Manager"]]) {
    fts.run(id, title, "Acme", "text"); emb.run(id, vec);
  }
  assert.equal(dedupe().dups, 1);
  assert.equal(dedupe().dups, 1, "idempotent dedupe");
  const primary = jobsDb.prepare("select dup_of, also from jobs where id = 'gh:acme:1'").get() as any;
  const dup = jobsDb.prepare("select dup_of, also from jobs where id = 'az:99'").get() as any;
  assert.equal(primary.dup_of, null); assert.equal(primary.also, "adzuna");
  assert.equal(dup.dup_of, "gh:acme:1"); assert.equal(dup.also, null);

  // prune deletes >1 year closed jobs & stale metadata while preserving <=1 year closed rows for analytics
  const insClosed = jobsDb.prepare(`insert into jobs (id, source, company, ckey, title, location, region, remote, posted, url, seniority, func, description, first_seen, last_seen, missed, closed, fp, dup_of, flags)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?, '[]')`);
  const d100 = t - 100 * 86400, d400 = t - 400 * 86400;
  insClosed.run("gh:acme:recent", "greenhouse", "Acme", "acme", "Analytics Engineer", "New York, NY", "nyc", "onsite", d100 - 10 * 86400, "https://acme/r", "mid", "data", "Analytics", d100 - 10 * 86400, d100, d100, "11", null);
  insClosed.run("gh:acme:old", "greenhouse", "Acme", "acme", "Old Engineer", "New York, NY", "nyc", "onsite", d400 - 10 * 86400, "https://acme/o", "mid", "data", "Old role", d400 - 10 * 86400, d400, d400, "22", null);
  insClosed.run("az:closeddup", "adzuna", "Acme", "acme", "Analytics Engineer", "New York, NY", "nyc", "onsite", d100 - 10 * 86400, "https://az/cd", "mid", "data", "Dup text", d100 - 10 * 86400, d100, d100, "11", "gh:acme:recent");
  for (const id of ["gh:acme:recent", "gh:acme:old", "az:closeddup"]) { fts.run(id, "Engineer", "Acme", "body"); emb.run(id, vec); }
  jobsDb.prepare("insert into runs values (?, ?, 1, 1, 'old')").run(d400, "boards");
  jobsDb.prepare("insert into runs values (?, ?, 1, 1, 'recent')").run(t - 200 * 86400, "boards");
  jobsDb.prepare("insert into adz_keys values ('k', 1, ?)").run(t - 40 * 86400);
  jobsDb.prepare("insert into adz_skip values ('s', ?)").run(t - 40 * 86400);
  jobsDb.prepare("insert into checks values ('c', ?, '{}')").run(t - 10 * 86400);

  prune();
  assert.ok(jobsDb.prepare("select 1 from jobs where id = 'gh:acme:recent'").get(), "closed <1y kept for analytics");
  assert.ok(jobsDb.prepare("select 1 from jobs_fts2 where id = 'gh:acme:recent'").get(), "closed <1y FTS kept");
  assert.equal(jobsDb.prepare("select 1 from jobs where id = 'gh:acme:old'").get(), undefined, "closed >1y deleted");
  assert.equal(jobsDb.prepare("select 1 from jobs_fts2 where id = 'gh:acme:old'").get(), undefined, "closed >1y FTS deleted");
  assert.equal(jobsDb.prepare("select 1 from jobs_fts2 where id = 'az:closeddup'").get(), undefined, "closed dup FTS cleared");
  assert.equal(jobsDb.prepare("select 1 from emb where id = 'az:99'").get(), undefined, "open dup emb cleared");
  assert.equal(jobsDb.prepare("select 1 from emb where id = 'gh:acme:recent'").get(), undefined, "closed emb cleared");
  assert.ok(jobsDb.prepare("select 1 from emb where id = 'gh:acme:1'").get(), "open unique emb kept");
  assert.equal((jobsDb.prepare("select count(*) n from runs where note = 'old'").get() as any).n, 0, "old runs pruned");
  assert.equal((jobsDb.prepare("select count(*) n from adz_keys").get() as any).n, 0);
  assert.equal((jobsDb.prepare("select count(*) n from adz_skip").get() as any).n, 0);
  assert.equal((jobsDb.prepare("select count(*) n from checks").get() as any).n, 0);
  const m2 = market({});
  assert.equal(m2.open, 2, "market counts only unique open jobs");
  assert.ok(m2.weeks.some((w) => w.closed > 0), "closed <1y still informs weekly analytics");

  // 429 cooldown in readBoard/refreshBoards stops subsequent boards on the same lane without firing more fetches
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  jobsDb.exec("delete from companies");
  jobsDb.prepare("insert into companies (ats, slug, name, added) values ('workday', 't1|5|ext', 'T1', ?)").run(t);
  jobsDb.prepare("insert into companies (ats, slug, name, added) values ('workday', 't2|5|ext', 'T2', ?)").run(t);
  globalThis.fetch = (async () => { fetchCalls++; return new Response("too many", { status: 429 }); }) as any;
  try {
    resetLanes();
    const res = await refreshBoards(["workday"], "boards-test", 1);
    assert.equal(res.boards, 2);
    assert.equal(fetchCalls, 1, "second workday board must see resting lane without calling fetch");
    const errs = jobsDb.prepare("select slug, last_err from companies order by slug").all() as any[];
    assert.match(errs[0].last_err, /429/);
    assert.match(errs[1].last_err, /HTTP 429 earlier/);
    assert.ok(jobsHealth().restingLanes.some((r) => r.lane === "workday"));
  } finally {
    globalThis.fetch = origFetch;
    resetLanes();
  }

  // fast match uses vectors() + filteredIds() + rowsByIds() inside inLine and excludes duplicates/closed jobs
  globalThis.fetch = (async () => new Response(JSON.stringify({ embeddings: [[1, 0, 0, 0]] }), { status: 200 })) as any;
  try {
    const res = await match("Senior Data Engineer based in New York City with six years of experience designing SQL and Python pipelines, warehouse modeling, streaming ingestion, and analytics systems across distributed cloud environments.", {}, false);
    assert.equal((res as any).ranked, false);
    const ids = (res as any).jobs.map((j: any) => j.id);
    assert.ok(ids.includes("gh:acme:1") && ids.includes("gh:acme:2"));
    assert.ok(!ids.includes("az:99") && !ids.includes("gh:acme:recent") && !ids.includes("gh:acme:old"));
  } finally {
    globalThis.fetch = origFetch;
  }
}
console.log("jobs ok");
