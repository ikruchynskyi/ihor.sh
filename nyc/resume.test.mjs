// Run: node nyc/resume.test.mjs
import assert from "node:assert/strict";
import { extract, evaluate, compare, yearsOfExperience, mentions, addedSkills, composeTailored, annotate, unwrap } from "./resume.js";

const good = `Jane Rivera
Brooklyn, NY · jane.rivera@example.com · (917) 555-0142 · linkedin.com/in/janerivera

Summary
Data engineer with 6 years building batch and streaming pipelines.

Experience
Senior Data Engineer, Acme Health — Mar 2021 – Present
• Built a Spark and Airflow pipeline processing 2 TB a day, cutting report latency from 6 hours to 40 minutes
• Migrated 120 dbt models to Snowflake, reducing warehouse cost by 35%
• Led a team of 4 engineers and mentored 2 interns
Data Engineer, Shopco — Jun 2018 – Feb 2021
• Designed Kafka event streams for 15 services handling 50k events per second
• Automated data quality checks in Python, catching 90% of bad loads before dashboards
• Reduced on-call pages by 60% by rewriting flaky ETL jobs

Education
B.S. Computer Science, CUNY Hunter College, 2018

Skills
Python, SQL, Spark, Airflow, Kafka, dbt, Snowflake, AWS, Docker`;
const x = extract(good);
assert.equal(x.email, "jane.rivera@example.com"); assert.ok(x.phone); assert.ok(x.linkedin); assert.equal(x.name, "Jane Rivera");
assert.deepEqual([...new Set(x.sections.map((s) => s.kind))], ["summary", "experience", "education", "skills"]);
assert.equal(x.bullets.length, 6); assert.ok(x.skills.includes("Snowflake"));
assert.ok(Math.abs(yearsOfExperience(x.dates) - 8.4) < 1, `years ${yearsOfExperience(x.dates)}`);
const e = evaluate(good, { kind: "pdf", pages: 1, columns: 1 });
assert.ok(e.score >= 85, `good résumé score ${e.score}: ${JSON.stringify(e.fixes)}`);

const bad = `My Journey
I was responsible for many things. I helped with the database.
Toolbox
stuff`;
const b = evaluate(bad, { kind: "pdf", columns: 2, tables: 1, headerFooterContact: true });
assert.ok(b.score < 40, `bad résumé score ${b.score}`);
assert.ok(b.fixes[0].weight >= 8, "the biggest problem comes first");

const jd = `We're hiring a Data Engineer with 5+ years of experience. You'll use Python, SQL, Spark, Kafka and Kubernetes on AWS.
Experience with Terraform and dbt is a plus. You will own pipelines, pipelines monitoring and pipelines reliability.`;
const c = compare(good, jd);
assert.ok(c.missing.includes("kubernetes") && c.missing.includes("terraform") && c.present.includes("python"), JSON.stringify(c));
assert.equal(c.wantsYears, 5);
// words on their own; filler flagged
assert.ok(mentions("Java and SQL", "java") && !mentions("JavaScript", "java") && mentions("C++, Go", "c++") && mentions("node.js", "node.js"));
const fluffy = evaluate(`${good}\n• Results-driven, detail-oriented team player passionate about leveraging cutting-edge tools`, { kind: "pdf", pages: 1 });
assert.ok(fluffy.fixes.some((f) => /Filler/.test(f.problem)), "filler is flagged");
assert.ok(!e.fixes.some((f) => /Filler/.test(f.problem)), "the good résumé has no filler");

// a tailored draft: added skills found, and removing one takes it out of every line
const t = { summary: "Data engineer with 6 years of pipelines. Runs Kubernetes clusters.", skills: ["Python", "Spark", "Kubernetes", "Terraform"],
  roles: [{ heading: "Senior Data Engineer, Acme Health — Mar 2021 – Present", bullets: [
    { text: "Built Spark pipelines on Kubernetes processing 2 TB a day", from: "Built a Spark and Airflow pipeline processing 2 TB a day, cutting report latency from 6 hours to 40 minutes" },
    { text: "Provisioned infrastructure with Terraform", from: "" }] }] };
assert.deepEqual(addedSkills(good, t, jd).map((s) => s.toLowerCase()).sort(), ["kubernetes", "terraform"]);
const all = composeTailored(good, t), honest = composeTailored(good, t, ["Kubernetes", "Terraform"]);
assert.ok(all.includes("Kubernetes") && all.includes("Terraform"));
assert.ok(!/kubernetes|terraform/i.test(honest), honest);
assert.ok(honest.startsWith("Jane Rivera") && honest.includes("cutting report latency") && honest.includes("B.S. Computer Science"), "header, original bullet and education kept");
assert.ok(honest.includes("Data engineer with 6 years of pipelines.") && !honest.includes("Runs"), "the summary sentence naming a removed skill goes");
assert.ok(compare(all, jd).coverage > compare(honest, jd).coverage);
// the editor's line notes
const notes = annotate(`Jane Rivera\njane@x.com\n\nExperience\nData Engineer, Acme — 2021 – Present\n• Responsible for the ETL jobs\n• Built a Spark pipeline processing 2 TB a day for 40 analysts\n• Leveraged synergy to deliver results-driven dashboards for my team\n\nSkills\nPython, SQL`);
assert.deepEqual(notes.map((n) => n.kind), ["contact", "contact", "blank", "head", "text", "bullet", "bullet", "bullet", "blank", "head", "text"]);
assert.ok(notes[5].issues.some((i) => i.startsWith("starts weak")) && notes[5].issues.some((i) => i.startsWith("no result")));
assert.deepEqual(notes[6].issues, [], "a strong bullet has no notes");
assert.ok(notes[7].filler.includes("synergy") && notes[7].filler.includes("results-driven") && notes[7].issues.some((i) => i.includes("I / my")));
assert.equal(notes[10].section, "skills");
// a PDF's wrapped lines joined back (the user's résumé, 2026-11-16), new entries left alone
const printed = `WORK EXPERIENCE
Adobe ( https://www.adobe.com/ ) - Full-time - New York, NY
Payment Services Customer Technical Advisor 11/2023 – present
● Guided clients through pre and post-sale processes for Adobe Payment Services, ensuring smooth
onboarding and tailored integrations
● Tackled critical issues and developed self-service tools to empower sales team and improve client
satisfaction and retention across the post-
sale lifecycle for enterprise accounts in North America
Senior Analyst, Contoso Bank — Jun 2019 – Oct 2023
● Built reports`;
const joined = unwrap(printed).split("\n");
assert.equal(joined.length, 7, joined.join(" | "));
assert.equal(joined[3], "● Guided clients through pre and post-sale processes for Adobe Payment Services, ensuring smooth onboarding and tailored integrations");
assert.ok(joined[4].endsWith("across the post-sale lifecycle for enterprise accounts in North America"), joined[4]);
assert.equal(joined[2], "Payment Services Customer Technical Advisor 11/2023 – present"); // its own line, not joined to the company
assert.equal(joined[5], "Senior Analyst, Contoso Bank — Jun 2019 – Oct 2023"); // a date range starts a new entry
assert.equal(unwrap(unwrap(printed)), unwrap(printed));
assert.equal(unwrap(good), good, "a résumé without wrapped lines is left as it is");
console.log(`resume ok: good ${e.score}, bad ${b.score}, coverage ${c.coverage}% missing ${c.missing.join(",")}`);
