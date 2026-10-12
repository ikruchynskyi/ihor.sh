// Run: node yomu/lib.test.mjs
import assert from "node:assert/strict";
import { romaji, toHiragana, toKatakana, renderTokens, similarity } from "./lib.js";

const cases = { "ありがとう": "arigatou", "きって": "kitte", "まっちゃ": "matcha", "しんぶん": "shinbun", "きんえん": "kin'en", "こんや": "kon'ya",
  "コーヒー": "koohii", "ニューヨーク": "nyuuyooku", "ちょっと": "chotto", "じゅぎょう": "jugyou", "ファイル": "fairu", "パーティー": "paatii", "がっこう": "gakkou" };
for (const [k, r] of Object.entries(cases)) assert.equal(romaji(k), r, k);
assert.equal(romaji("は", true), "wa"); assert.equal(romaji("を", true), "o"); assert.equal(romaji("へ", true), "e"); assert.equal(romaji("は"), "ha");
assert.equal(toHiragana("カタカナ"), "かたかな"); assert.equal(toKatakana("ひらがな"), "ヒラガナ");
const line = [["私", "わたし", "I"], ["は", null, "topic", "p"], ["学生", "がくせい", "student"], ["です", null, "is"], ["。", null, null, "x"]];
assert.match(renderTokens(line, { script: "kanji", furigana: "all" }), /<ruby>私<rt>わたし<\/rt><\/ruby>/);
assert.doesNotMatch(renderTokens(line, { script: "kanji", furigana: "unknown" }, { 私: true }), /<rt>わたし/);
assert.match(renderTokens(line, { script: "romaji" }), /watashi.*wa.*gakusei.*desu.*\./);
assert.equal(similarity("わたしはがくせいです", "私は学生です".replace(/私/, "わたし").replace(/学生/, "がくせい")), 1);
console.log("yomu lib ok");
import { ruby } from "./lib.js";
assert.equal(ruby("食べる", "たべる"), "<ruby>食<rt>た</rt></ruby>べる");
assert.equal(ruby("お茶", "おちゃ"), "お<ruby>茶<rt>ちゃ</rt></ruby>");
const ex = [["肉", "にく", null], ["は", null, null, "p"], ["食", "た", null], ["べません", null, null], ["。", null, null, "x"]];
assert.equal(renderTokens(ex, { script: "romaji" }).replace(/<[^>]+>/g, ""), "niku wa tabemasen.");
assert.equal(renderTokens([["学生", "がくせい", null], ["です", null, null]], { script: "romaji" }).replace(/<[^>]+>/g, ""), "gakusei desu");
console.log("yomu ruby/romaji ok");

// typed answers
import { meaningMatches, readingMatches } from "./lib.js";
assert.ok(meaningMatches("eat", "to eat, to have a meal"));
assert.ok(meaningMatches("to eat", "to eat, to have a meal"));
assert.ok(meaningMatches("have a meal", "to eat, to have a meal"));
assert.ok(meaningMatches("languge", "language"), "one-letter typo");
assert.ok(meaningMatches("developing", "developing (film)"));
assert.ok(!meaningMatches("drink", "to eat, to have a meal"));
assert.ok(!meaningMatches("a", "to eat"));
assert.ok(readingMatches("たべる", "食べる", "たべる") && readingMatches("食べる", "食べる", "たべる") && readingMatches("TABERU", "食べる", "たべる"));
assert.ok(readingMatches("tookyou", "東京", "とうきょう") && readingMatches("tokyo", "東京", "とうきょう") && readingMatches("toukyou", "東京", "とうきょう"));
assert.ok(readingMatches("sinbun", "新聞", "しんぶん") && readingMatches("shinbun", "新聞", "しんぶん") && readingMatches("タベル", "食べる", "たべる"));
assert.ok(!readingMatches("nomu", "食べる", "たべる"));
console.log("typed answers ok");
