// Runs every course chapter's script and reports. Usage: npm run course-check   (HW=1 also runs the ones needing a dongle)
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const needsDongle = new Set(["ch13.ts"]);
let failed = 0;
for (const f of readdirSync("course/code").filter((f) => /^ch\d+\.ts$/.test(f)).sort()) {
  if (needsDongle.has(f) && !process.env.HW) { console.log(`- ${f}: skipped (needs a dongle; run with HW=1)`); continue; }
  try {
    const out = execFileSync("node", [`course/code/${f}`], { encoding: "utf8", timeout: 120_000 });
    console.log(`✓ ${f}${out.includes("all checks passed") ? "" : " (finished, no final check line)"}`);
  } catch (e) { failed++; console.log(`✗ ${f}\n${String((e as { stdout?: string }).stdout ?? "").slice(-400)}${String((e as Error).message).slice(0, 300)}`); }
}
console.log(failed ? `${failed} failed` : "all chapter scripts pass");
process.exit(failed ? 1 : 0);
