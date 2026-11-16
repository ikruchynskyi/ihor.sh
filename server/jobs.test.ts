// Run: node server/jobs.test.ts (an in-memory database: never the live data/jobs.db)
process.env.JOBS_DB = ":memory:";
const assert = (await import("node:assert/strict")).default;
const { stripHtml, parseSalary, role, region, market, usPlace, sameCompany, seniority, flagsFor } = await import("./jobs.ts");
const { guard } = await import("./jobs-ai.ts");

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
assert.equal(role("Senior Data Engineer, Payments"), "data engineer");
assert.equal(role("Manager, Finance"), "manager finance");
assert.equal(region("Brooklyn, NY"), "nyc"); assert.equal(region("Remote, Manila"), null);
// places as Workday and USAJOBS write them
assert.equal(usPlace("New York New York United States"), "New York, NY"); assert.equal(usPlace("Jersey City, New Jersey"), "Jersey City, NJ");
assert.equal(usPlace("US-NY-New York"), "New York, NY"); assert.equal(usPlace("Woodbury, NY, United States"), "Woodbury, NY");
assert.equal(region(usPlace("New York New York United States")), "nyc"); assert.equal(region(usPlace("Newark-NJ-USA")), "nj");
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
console.log("jobs ok");
