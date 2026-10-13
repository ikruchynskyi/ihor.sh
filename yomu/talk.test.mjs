// Run: node yomu/talk.test.mjs
import assert from "node:assert/strict";
import { score, norm, SCENES } from "./talk.js";
const turn = (scene, k) => SCENES.find((s) => s.id === scene).turns[k].you;
assert.equal(norm("カードで、お願いします。"), "かーどでお願いします".replace("ー", "")); // katakana → hiragana, no punctuation or long marks
assert.equal(score("はい、お願いします", turn("konbini", 0)).verdict, "great");
assert.equal(score("はいおねがいします", turn("konbini", 0)).verdict, "great");         // kana for kanji: an accepted variant
assert.equal(score("いりません", turn("konbini", 1)).verdict, "great");
assert.equal(score("カードでおねがいします", turn("konbini", 2)).verdict, "great");
assert.equal(score("すみません駅はどこですか", turn("michi", 0)).verdict, "great");
assert.equal(score("すみません駅はどこ", turn("michi", 0)).verdict, "close");            // the end is missing: close, not wrong
assert.equal(score("ラーメン", turn("resutoran", 2)).verdict, "again");
assert.equal(score("はじめましてサムです", turn("jikoshoukai", 0)).verdict, "great");    // any name, by pattern
assert.equal(score("フランスから来ました", turn("jikoshoukai", 1)).verdict, "great");
assert.equal(score("二年ぐらいです", turn("jikoshoukai", 3)).verdict, "great");
assert.equal(score("", turn("hoteru", 1)).verdict, "silent");

// Romaji input support
assert.equal(score("hai, onegaishimasu", turn("konbini", 0)).verdict, "great");
assert.equal(score("iie, irimasen", turn("konbini", 1)).verdict, "great");
assert.equal(score("ka-do de onegaishimasu", turn("konbini", 2)).verdict, "great");
assert.equal(score("card de onegaishimasu", turn("konbini", 2)).verdict, "great");
assert.equal(score("sumimasen eki wa doko desu ka", turn("michi", 0)).verdict, "great");
assert.equal(score("arigatou gozaimasu", turn("michi", 2)).verdict, "great");
assert.equal(score("futari desu", turn("resutoran", 0)).verdict, "great");
assert.equal(score("mizu o kudasai", turn("resutoran", 1)).verdict, "great");

// Turn data invariants: goals, accepted answers, and hints
for (const s of SCENES) {
  for (const t of s.turns) {
    assert.ok(t.you.length && t.goal, `${s.id}: every turn needs a goal and answers`);
    assert.ok(t.hints?.length, `${s.id}: every turn needs suggestions`);
    for (const h of t.hints) {
      assert.ok(h.ja && h.romaji && h.en, `${s.id}: hint needs ja, romaji, en`);
    }
  }
}

console.log(`talk ok: ${SCENES.length} scenes, ${SCENES.reduce((a, s) => a + s.turns.length, 0)} turns (all romaji & hints verified)`);
