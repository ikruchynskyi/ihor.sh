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
assert.ok(!readingMatches("nomu", "食べる", "たべる"));
console.log("typed answers ok");

// pitch accent morae
import { splitMorae } from "./lib.js";
assert.deepEqual(splitMorae("とうきょう"), ["と", "う", "きょ", "う"]);
assert.deepEqual(splitMorae("たべる"), ["た", "べ", "る"]);
assert.deepEqual(splitMorae("がっこう"), ["が", "っ", "こ", "う"]);
assert.deepEqual(splitMorae("きしゃ"), ["き", "しゃ"]);
// audio playback
import { stopAudio, speak, storyAudioUrl, wordAudioUrl, getWordAudioManifest, state } from "./lib.js";
assert.doesNotThrow(() => stopAudio());
assert.ok(storyAudioUrl("n5-01", 2).includes("?v="), "storyAudioUrl includes cache-busting version");
assert.ok(storyAudioUrl("n5-01", 2, true).includes("_slow.mp3"), "storyAudioUrl includes _slow suffix when isSlow is true");
assert.equal(wordAudioUrl("nonexistent_word_12345"), null);
assert.equal(state.settings.slow, false);
console.log("audio playback ok");

// knowledge gaps & daily quiz
import { recordGap, getActiveGaps, clearGap, saveDailyQuizResult, getDailyQuizResult } from "./lib.js";
const testGap = { id: "test:wa-ga", title: "は vs が", category: "Particles", level: "N5", link: "/yomu/grammar.html", why: "は marks topic, が marks subject" };
recordGap(testGap, false); // missed question
let active = getActiveGaps();
assert.ok(active.some((g) => g.id === "test:wa-ga" && g.missCount === 1));

recordGap(testGap, true); // 1 correct
recordGap(testGap, true); // 2 correct -> resolved
active = getActiveGaps();
assert.ok(!active.some((g) => g.id === "test:wa-ga"));

recordGap(testGap, false); // reopened on miss
assert.ok(getActiveGaps().some((g) => g.id === "test:wa-ga"));
clearGap("test:wa-ga");
assert.ok(!getActiveGaps().some((g) => g.id === "test:wa-ga"));

saveDailyQuizResult("2026-10-14", { level: "N5", score: 4, total: 5, gaps: ["test:wa-ga"] });
const qRes = getDailyQuizResult("2026-10-14");
assert.equal(qRes.score, 4);
assert.equal(qRes.total, 5);
assert.equal(qRes.level, "N5");
console.log("knowledge gaps & daily quiz ok");

// progress is saved under the "yomu" key (a missing KEY once made every save throw, silently)
import { save } from "./lib.js";
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; } };
state.xp = 7; save();
assert.equal(JSON.parse(localStorage.s.yomu ?? "{}").xp, 7, "progress must be saved under the 'yomu' key");
console.log("progress saving ok");
