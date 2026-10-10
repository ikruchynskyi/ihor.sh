// Run: node nyc/resume.test.mjs
import assert from "node:assert/strict";
import { extract, evaluate, compare, yearsOfExperience } from "./resume.js";

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
console.log(`resume ok: good ${e.score}, bad ${b.score}, coverage ${c.coverage}% missing ${c.missing.join(",")}`);
