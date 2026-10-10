// Résumé checks that don't need AI: what an applicant tracking system (ATS) extracts from a résumé, whether its layout
// survives parsing, contact details, section headings, bullet quality, and (given a job) which of its terms are missing.
// Pure functions over text plus layout facts gathered while reading the file, so node can test them (resume.test.mjs).

const HEADINGS = {
  summary: /^(summary|professional summary|profile|about( me)?|objective|career objective)$/i,
  experience: /^((work|professional|relevant|employment) )?(experience|history)$|^employment$|^work$/i,
  education: /^education( and training)?$|^academic background$/i,
  skills: /^((technical|core|key) )?(skills|competencies|technologies|tools)( and (tools|technologies))?$|^tech stack$/i,
  projects: /^(selected |personal |side )?projects$/i,
  certifications: /^(certifications?|licenses?( and certifications?)?|credentials)$/i,
  other: /^(awards|publications|volunteer(ing)?( experience)?|languages|interests|activities|leadership)$/i,
};
const CREATIVE = /^(my journey|what i do|where i've been|toolbox|superpowers|things i've built|my story|career highlights?)$/i;
const VERBS = "achieved accelerated added advised analyzed architected automated balanced built championed closed coached collaborated completed consolidated converted coordinated created cut decreased defined delivered deployed designed developed directed doubled drove earned eliminated enabled engineered established exceeded expanded generated grew guided halved identified implemented improved increased initiated integrated introduced launched led maintained managed mentored migrated modernized negotiated optimized orchestrated organized oversaw owned partnered pioneered planned produced programmed raised reduced redesigned refactored released resolved restructured revamped saved scaled secured shipped simplified solved spearheaded standardized streamlined strengthened supervised supported taught tested trained transformed tripled troubleshot unified upgraded wrote".split(" ");
const WEAK = /^(responsible for|duties included|worked on|helped( with)?|assisted( with)?|participated in|involved in|tasked with)\b/i;
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const DATE_RANGE = new RegExp(`((?:${MONTHS})\\.?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\b(?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*((?:${MONTHS})\\.?\\s+\\d{4}|\\d{1,2}/\\d{4}|(?:19|20)\\d{2}|present|current|now)`, "gi");

/** The fields an ATS pulls out, or tries to. */
export function extract(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  const phone = text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0] ?? null;
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] ?? null;
  const urls = [...text.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|[\w-]+\.(?:dev|io|me|com))\/?[\w/-]*/gi)].map((m) => m[0]).filter((u) => !/linkedin|@/.test(u) && !email?.includes(u)).slice(0, 5);
  const location = text.match(/\b([A-Z][a-zA-Z .]+),\s*(NY|NJ|CT|PA|CA|MA|TX|IL|WA|[A-Z]{2})\b/)?.[0] ?? (/\b(new york|brooklyn|manhattan|queens|jersey city|hoboken)\b/i.exec(text)?.[0] ?? null);
  const name = lines.find((l) => /^[A-Z][a-zA-Z'’-]+(\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(l) && l.length < 40) ?? null;
  // sections: a short line that is a known heading (with or without a colon, any case)
  const sections = [], unknownHeads = [];
  lines.forEach((l, i) => {
    const h = l.replace(/[:|•\-–—]+$/g, "").trim();
    if (h.length > 40 || h.split(/\s+/).length > 5) return;
    const kind = Object.entries(HEADINGS).find(([, re]) => re.test(h))?.[0];
    if (kind) sections.push({ kind, line: i, text: h });
    else if (CREATIVE.test(h)) unknownHeads.push(h);
  });
  const dates = [...text.matchAll(DATE_RANGE)].map((m) => ({ from: m[1], to: m[2] }));
  const bullets = lines.filter((l) => /^[•\-–▪◦●*·]\s*/.test(l) || /^\d+\.\s/.test(l)).map((l) => l.replace(/^([•\-–▪◦●*·]|\d+\.)\s*/, ""));
  const skillsAt = sections.find((s) => s.kind === "skills");
  const skills = skillsAt ? lines.slice(skillsAt.line + 1, sections.find((s) => s.line > skillsAt.line)?.line ?? skillsAt.line + 12).join(", ").split(/[,;|•·]\s*/).map((s) => s.replace(/^[^:]*:\s*/, "").trim()).filter((s) => s && s.length < 40).slice(0, 60) : [];
  return { name, email, phone, linkedin, urls, location, sections, unknownHeads, dates, bullets, skills, words: text.split(/\s+/).filter(Boolean).length, lines };
}

/** Years between the earliest start and the latest end in the résumé's date ranges (a rough experience figure). */
export function yearsOfExperience(dates) {
  const y = (s) => (/present|current|now/i.test(s) ? new Date().getFullYear() + new Date().getMonth() / 12 : +(s.match(/\d{4}/)?.[0] ?? NaN) + ((/\d{1,2}\//.test(s) ? +s.split("/")[0] : 6) - 1) / 12);
  const spans = dates.map((d) => [y(d.from), y(d.to)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
  if (!spans.length) return null;
  return Math.round((Math.max(...spans.map((s) => s[1])) - Math.min(...spans.map((s) => s[0]))) * 10) / 10;
}

/**
 * The checks. layout: facts from reading the file ({ kind: "pdf"|"docx"|"txt", pages, columns, tables, textBoxes,
 * headerFooterContact, images, iconGlyphs, scanned }). Returns { score, areas: [{ area, score, max, checks }], fixes }.
 */
export function evaluate(text, layout = {}) {
  const x = extract(text), checks = [];
  const add = (area, ok, weight, msg, fix) => checks.push({ area, ok, weight, msg, fix });
  // 1. Will it parse?
  add("parsing", !layout.scanned && x.words > 120, 12, layout.scanned ? "The PDF is an image: an ATS reads no text at all." : `${x.words} words came out as text.`, layout.scanned ? "Export the résumé as a text PDF (from Word or Google Docs: File → Download → PDF), not a scan or a photo." : "Most of the résumé is missing from the extracted text: rebuild it in a plain document.");
  add("parsing", (layout.columns ?? 1) <= 1, 8, (layout.columns ?? 1) > 1 ? "Two-column layout: many ATS read across both columns line by line, mixing them up." : "One column.", "Use a single column: put skills in their own section under the experience instead of a sidebar.");
  add("parsing", !layout.tables, 5, layout.tables ? `Tables (${layout.tables}): parsers often skip or scramble them.` : "No tables.", "Replace tables with plain lines (\"Python, SQL, Spark\") and bullet points.");
  add("parsing", !layout.textBoxes, 6, layout.textBoxes ? `Text boxes (${layout.textBoxes}): their text is often dropped entirely.` : "No text boxes.", "Move the text out of text boxes into the body of the document.");
  add("parsing", !layout.headerFooterContact, 5, layout.headerFooterContact ? "Your contact details are in the page header/footer, which many ATS ignore." : "Contact details are in the body.", "Put your name, email and phone as the first lines of the body, not in the header.");
  add("parsing", !layout.iconGlyphs, 3, layout.iconGlyphs ? "Icon fonts (phone/email symbols) come out as garbage characters." : "No icon glyphs.", "Write \"Email:\" and \"Phone:\" as words, or just the values, instead of icons.");
  add("parsing", x.unknownHeads.length === 0, 4, x.unknownHeads.length ? `Creative headings ATS won't recognize: ${x.unknownHeads.join(", ")}.` : "Headings are standard.", "Use standard section names: Summary, Experience, Education, Skills, Projects, Certifications.");
  add("parsing", ["experience", "education"].every((k) => x.sections.some((s) => s.kind === k)), 6, `Sections found: ${[...new Set(x.sections.map((s) => s.kind))].join(", ") || "none"}.`, "Add clearly labeled Experience and Education sections (a line with just the heading).");
  add("parsing", !layout.kind || layout.kind === "docx" || layout.kind === "pdf", 2, `File type: ${layout.kind ?? "text"}.`, "Send a .docx or a text-based PDF.");
  // 2. Can they reach you?
  add("contact", !!x.email, 4, x.email ? `Email: ${x.email}` : "No email address found.", "Add your email address near the top.");
  add("contact", !!x.phone, 3, x.phone ? `Phone: ${x.phone}` : "No phone number found.", "Add a phone number near the top.");
  add("contact", !!x.location, 2, x.location ? `Location: ${x.location}` : "No city found: recruiters filter by location.", "Add your city and state (\"Brooklyn, NY\"), or \"Open to remote\".");
  add("contact", !!x.linkedin, 1, x.linkedin ? "LinkedIn included." : "No LinkedIn profile URL.", "Add your LinkedIn URL (linkedin.com/in/…).");
  // 3. Do the bullets sell?
  const b = x.bullets, verb = b.filter((l) => VERBS.includes(l.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ""))), weak = b.filter((l) => WEAK.test(l)), nums = b.filter((l) => /\d|%|\$/.test(l));
  const long = b.filter((l) => l.split(/\s+/).length > 35), short = b.filter((l) => l.split(/\s+/).length < 6), firstPerson = (text.match(/\b(I|my|me)\b/g) ?? []).length;
  add("content", b.length >= 6, 4, `${b.length} bullet points.`, "Describe each role in 3–6 bullet points: one achievement each.");
  add("content", b.length && verb.length / b.length >= 0.6, 6, b.length ? `${Math.round((verb.length / b.length) * 100)}% of bullets start with an action verb.` : "No bullets to check.", `Start bullets with a strong verb (Built, Led, Cut, Grew…).${weak.length ? ` Rewrite the ${weak.length} that start with "${weak[0].split(/\s+/).slice(0, 3).join(" ")}…".` : ""}`);
  add("content", b.length && nums.length / b.length >= 0.4, 8, b.length ? `${Math.round((nums.length / b.length) * 100)}% of bullets have a number (%, $, counts, time).` : "No bullets to check.", "Add a result with a number to more bullets: how much, how many, how fast. If you don't know the exact figure, a careful estimate (\"~30%\") is fine; never invent one.");
  add("content", !long.length && short.length <= b.length / 4, 3, long.length ? `${long.length} bullet${long.length > 1 ? "s" : ""} run over 35 words.` : "Bullets are a readable length.", "Keep each bullet to one or two lines (about 12–30 words).");
  add("content", firstPerson <= 2, 2, firstPerson > 2 ? `"I/my/me" appears ${firstPerson} times.` : "No first-person pronouns.", "Drop \"I\" and \"my\": résumés are written without them (\"Led the team…\", not \"I led…\").");
  add("content", x.words >= 250 && x.words <= 1100, 3, `${x.words} words${layout.pages ? ` on ${layout.pages} page${layout.pages > 1 ? "s" : ""}` : ""}.`, x.words < 250 ? "Too thin: add detail to each role (results, scope, tools)." : "Too long for most roles: cut to 1–2 pages, keeping the last 10 years in detail.");
  add("content", x.dates.length >= 2, 3, `${x.dates.length} date ranges found${yearsOfExperience(x.dates) != null ? ` (about ${yearsOfExperience(x.dates)} years from first to last)` : ""}.`, "Give every role a date range in one format, e.g. \"Mar 2021 – Present\".");
  // score per area
  const areas = ["parsing", "contact", "content"].map((area) => { const c = checks.filter((k) => k.area === area), max = c.reduce((a, k) => a + k.weight, 0), got = c.reduce((a, k) => a + (k.ok ? k.weight : 0), 0); return { area, score: got, max, checks: c }; });
  const max = areas.reduce((a, k) => a + k.max, 0), got = areas.reduce((a, k) => a + k.score, 0);
  const fixes = checks.filter((k) => !k.ok).sort((a, b) => b.weight - a.weight).map((k) => ({ area: k.area, weight: k.weight, problem: k.msg, fix: k.fix }));
  return { score: Math.round((got / max) * 100), areas, fixes, extracted: x };
}

// ---------- against a job ----------
const SKILL_WORDS = "python java javascript typescript go golang rust c\\+\\+ c# ruby php scala kotlin swift sql nosql postgresql postgres mysql mongodb redis kafka spark hadoop airflow dbt snowflake bigquery redshift databricks aws azure gcp docker kubernetes terraform ansible jenkins git linux react angular vue node\\.js node django flask fastapi spring graphql rest grpc html css tableau looker power bi excel salesforce hubspot jira figma sketch photoshop illustrator pytorch tensorflow scikit-learn pandas numpy llm nlp machine learning deep learning computer vision statistics a/b testing etl data modeling data warehousing ci/cd microservices agile scrum product management seo sem crm gaap cpa cfa sox hipaa gdpr".split(" ");
const STOP = new Set("the and for with you our are will this that from have your their about who what when where which while into than then them they team work working role roles years year experience experiences strong ability able skills skill including include includes using use used new well other more most also across within based such each both must should would could can may help helping make making build building join etc job jobs company companies business businesses people world best great good highly high level levels plus preferred required requirements responsibilities qualifications minimum bonus benefits salary range equal opportunity employer".split(" "));
/** What a job asks for: known skills and tools found in it, plus its frequent specific words, and the years it wants. */
export function jobTerms(jd) {
  const t = ` ${jd.toLowerCase()} `;
  const skills = SKILL_WORDS.filter((s) => new RegExp(`[^a-z0-9]${s}[^a-z0-9]`).test(t)).map((s) => s.replace(/\\/g, ""));
  const counts = new Map();
  for (const w of jd.match(/\b[A-Za-z][A-Za-z+#.-]{2,}\b/g) ?? []) { const k = w.toLowerCase(); if (STOP.has(k) || skills.includes(k)) continue; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const frequent = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
  const years = +(jd.match(/(\d{1,2})\+?\s*(?:-\s*\d+\s*)?years?(?:\s+of)?(?:\s+\w+){0,4}\s+experience/i)?.[1] ?? NaN);
  return { skills, frequent, years: Number.isFinite(years) ? years : null };
}
/** Which of a job's terms the résumé has, literally (many ATS match exact words), and the years it asks for. */
export function compare(resumeText, jd) {
  const r = ` ${resumeText.toLowerCase()} `, j = jobTerms(jd), has = (w) => new RegExp(`[^a-z0-9]${w.replace(/[.+#]/g, (c) => `\\${c}`)}[^a-z0-9]`).test(r);
  const present = j.skills.filter(has), missing = j.skills.filter((s) => !has(s)), freqMissing = j.frequent.filter((w) => !has(w));
  const yrs = yearsOfExperience(extract(resumeText).dates);
  const coverage = j.skills.length ? Math.round((present.length / j.skills.length) * 100) : null;
  return { coverage, present, missing, frequentMissing: freqMissing, wantsYears: j.years, haveYears: yrs,
    advice: [
      missing.length ? `Missing skills the job names: ${missing.join(", ")}. Add the ones you really have, in the words the posting uses (in Skills and in a bullet that shows them used).` : null,
      freqMissing.length ? `Words the posting repeats that your résumé doesn't use: ${freqMissing.slice(0, 8).join(", ")}.` : null,
      j.years && yrs != null && yrs < j.years ? `The job asks for ${j.years}+ years; your dates span about ${yrs}. If you have more relevant time (school projects, freelance), list it.` : null,
    ].filter(Boolean) };
}
