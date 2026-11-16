// Run: node server/jobs.test.ts (an in-memory database: never the live data/jobs.db)
process.env.JOBS_DB = ":memory:";
const assert = (await import("node:assert/strict")).default;
const { stripHtml, parseSalary, role, region, market, usPlace, sameCompany } = await import("./jobs.ts");
const { guard } = await import("./jobs-ai.ts");

// Greenhouse escapes its HTML twice: "&amp;mdash;" must come out as a dash, so the pay range parses (2026-11-16)
assert.equal(stripHtml("&lt;p&gt;Pay: $1&amp;mdash;$2 &amp;amp; more&amp;nbsp;now&lt;/p&gt;&lt;li&gt;A&lt;/li&gt;"), "Pay: $1—$2 & more now\n• A");
assert.deepEqual(parseSalary(stripHtml("Annual Salary:&lt;br&gt;$222,800&amp;mdash;$290,000 USD")), { min: 222800, max: 290000, period: "year" });
assert.deepEqual(parseSalary("$85,000.00 - $95,000.00 per year"), { min: 85000, max: 95000, period: "year" });
assert.deepEqual(parseSalary("pay is between $90,000 and $110,000 a year"), { min: 90000, max: 110000, period: "year" });
assert.deepEqual(parseSalary("$45/hr – $60/hr"), { min: 45, max: 60, period: "hour" });
assert.deepEqual(parseSalary("$150K-$200K"), { min: 150000, max: 200000, period: "year" });
assert.equal(parseSalary("raised $500 and $600 million"), null);
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
// an empty market still answers in shape
const m = market({}); assert.equal(m.open, 0); assert.deepEqual(m.fields, []); assert.ok(Array.isArray(m.weeks));
// never invent: an unknown number becomes [X], a promoted verb gets a note
const g = guard("Helped with the billing migration", "Led the billing migration, cutting costs 40%", "Helped with the billing migration");
assert.ok(g.after.includes("[X]") && !g.after.includes("40") && g.notes.some((n) => n.includes('"Led"')), JSON.stringify(g));
assert.equal(guard("Cut costs 5%", "Cut costs 50%", "Cut costs 5%").after, "Cut costs [X]"); // the longer number first
console.log("jobs ok");
