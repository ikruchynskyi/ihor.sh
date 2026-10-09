// Run: node yomu/src/check.mjs — sanity checks for every story: readings, kana, quizzes, puzzles.
import { readFileSync, readdirSync } from "node:fs";
import { hasKanji } from "../lib.js";
const dir = new URL("../stories/", import.meta.url);
const KANA = /^[぀-ヿー]+$/;
let errors = 0;
const err = (id, msg) => { errors++; console.log(`✗ ${id}: ${msg}`); };
for (const f of readdirSync(dir).filter((f) => /^n\d-\d+\.json$/.test(f))) {
  const u = JSON.parse(readFileSync(new URL(f, dir), "utf8")), id = u.id;
  const tokens = [...u.lines.flatMap((l) => l.t), ...u.grammar.flatMap((g) => g.examples.flatMap((e) => e.t))];
  for (const [s, r, g, k] of tokens) {
    if (hasKanji(s) && !r) err(id, `${s} has kanji but no reading`);
    if (r && !KANA.test(r)) err(id, `${s} reading ${r} isn't kana`);
    if (!k && !g && !/^[A-Za-z]+$/.test(s)) err(id, `${s} has no gloss`);
  }
  for (const l of u.lines) if (!l.en) err(id, `line without English: ${l.t.map((t) => t[0]).join("")}`);
  for (const q of [...u.grammar.flatMap((g) => g.quiz), ...u.questions]) if (!(q.answer >= 0 && q.answer < q.choices.length)) err(id, `bad answer in ${q.q}`);
  for (const b of u.build ?? []) if (!u.lines[b]) err(id, `build line ${b} missing`);
  for (const k of u.kanji) if (!k.ex.length) err(id, `kanji ${k.k} has no example`);
}
console.log(errors ? `${errors} problems` : "stories ok");
process.exit(errors ? 1 : 0);
