// Pure module for gap drills (gamification P3, plan lane C).
// Extracts inline .q blocks and checkpoint questions for a specific lesson section.
// No DOM/storage dependencies: tested by ai/drill.test.mjs.

/** A heading's anchor: "3. Logarithms: counting…" → "logarithms-counting". */
export const slug = (text) =>
  String(text ?? "")
    .replace(/^\s*\d+\.\s*/, "")
    .toLowerCase()
    .replace(/\\\(|\\\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

/** Extract balanced <div class="q"> blocks from an HTML fragment. */
export function extractQBlocks(html) {
  const blocks = [];
  const regex = /<div\s+class="q(?:\s+[^"]*)?"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const startIdx = match.index;
    let depth = 0;
    let i = startIdx;
    while (i < html.length) {
      if (html.slice(i, i + 4).toLowerCase() === "<div") {
        depth++;
        i += 4;
      } else if (html.slice(i, i + 6).toLowerCase() === "</div>") {
        depth--;
        i += 6;
        if (depth === 0) {
          blocks.push(html.slice(startIdx, i));
          break;
        }
      } else {
        i++;
      }
    }
  }
  return blocks;
}

/** Parse sections from lesson HTML: returns list of section objects. */
export function extractSections(docHtml) {
  const mainMatch = docHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const body = mainMatch ? mainMatch[1] : docHtml;
  const parts = body.split(/(?=<h2[\s>])/i);
  const sections = [];
  let idx = 0;

  for (const part of parts) {
    const h2Match = part.match(/^<h2([^>]*)>([\s\S]*?)<\/h2>/i);
    if (!h2Match) continue;
    idx++;
    const attrs = h2Match[1];
    const rawHeading = h2Match[2].replace(/<[^>]+>/g, "").trim();
    const idMatch = attrs.match(/id="([^"]+)"/i);
    const id = idMatch ? idMatch[1] : slug(rawHeading);

    const gistMatch = part.match(/<p\s+class="gist">([\s\S]*?)<\/p>/i);
    const gist = gistMatch ? gistMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    const qBlocks = extractQBlocks(part);
    sections.push({
      id,
      headingText: rawHeading,
      idx,
      gist,
      qBlocks
    });
  }

  return sections;
}

/** Render a course.json checkpoint question object to <div class="q"> HTML. */
export function renderCheckpointQ(c, fallbackSec = 1) {
  const ansLetter = "abcde"[c.answer] ?? "a";
  const optionsHtml = (c.options || [])
    .map((o, k) => `<li data-k="${"abcde"[k]}">${o}</li>`)
    .join("");
  return `<div class="q" data-answer="${ansLetter}" data-sec="${c.sec ?? fallbackSec}" data-kind="checkpoint">
  <p>${c.q}</p>
  <ul>${optionsHtml}</ul>
  <div class="why">${c.why || ""}</div>
</div>`;
}

/**
 * Build a drill for a lesson section.
 * @param {string} lessonHtml - Raw HTML of the lesson
 * @param {string} targetSectionId - Section anchor id (or numeric index string)
 * @param {Array} courseCheck - Checkpoint questions from course.json[lesson].check
 * @returns {object} Drill configuration
 */
export function buildDrill(lessonHtml, targetSectionId, courseCheck = []) {
  const titleMatch = lessonHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const lessonTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  const sections = extractSections(lessonHtml);
  if (!sections.length) {
    return {
      found: false,
      lessonTitle,
      sectionId: targetSectionId,
      sectionTitle: targetSectionId,
      sectionIndex: 1,
      gist: null,
      questions: []
    };
  }

  // Find target section by id or 1-based index
  let targetSec = sections.find(
    (s) => s.id === targetSectionId || String(s.idx) === String(targetSectionId)
  );
  if (!targetSec) {
    targetSec = sections[0];
  }

  const secIdx = targetSec.idx;
  const questions = [];

  // 1. Inline questions from that section
  for (const block of targetSec.qBlocks) {
    questions.push({
      html: block,
      kind: "inline",
      sec: secIdx
    });
  }

  // 2. Checkpoint questions whose sec is that section
  const sectionCheckpoints = courseCheck.filter((c) => c.sec === secIdx);
  for (const c of sectionCheckpoints) {
    questions.push({
      html: renderCheckpointQ(c, secIdx),
      kind: "checkpoint",
      sec: secIdx,
      data: c
    });
  }

  // 3. If fewer than 3, add checkpoint questions from neighboring sections
  if (questions.length < 3) {
    const neighbors = courseCheck.filter(
      (c) => c.sec === secIdx - 1 || c.sec === secIdx + 1
    );
    for (const c of neighbors) {
      if (questions.length >= 3) break;
      questions.push({
        html: renderCheckpointQ(c, c.sec || secIdx),
        kind: "neighbor-checkpoint",
        sec: c.sec || secIdx,
        data: c
      });
    }
  }

  // 4. If still fewer than 3, add any other checkpoint questions from the lesson
  if (questions.length < 3) {
    const remaining = courseCheck.filter(
      (c) => !questions.some((q) => q.data && q.data.q === c.q)
    );
    for (const c of remaining) {
      if (questions.length >= 3) break;
      questions.push({
        html: renderCheckpointQ(c, c.sec || secIdx),
        kind: "fallback-checkpoint",
        sec: c.sec || secIdx,
        data: c
      });
    }
  }

  return {
    found: true,
    lessonTitle,
    sectionId: targetSec.id,
    sectionTitle: targetSec.headingText,
    sectionIndex: secIdx,
    gist: targetSec.gist,
    questions
  };
}
