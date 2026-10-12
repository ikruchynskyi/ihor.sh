// Run: node yomu-dict.test.ts — the Jisho page readers on snippets shaped like jisho.org's real markup (Oct 2026).
import assert from "node:assert/strict";
import { parseKanjiPage, parseSentences, isKanji } from "./yomu-dict.ts";

const kanji = `<div class="kanji-details__main-meanings">
      word, speech, language
    </div><div class="kanji-details__stroke_count"><strong>14</strong> strokes</div>
<div class="radicals"><dl class="dictionary_entry on_yomi"><dt>Radical:</dt><dd><span title="KangXi radical 149."><span class="radical_meaning">speech</span>言 (訁)</span></dd></dl></div>
<div class="radicals"><dl class="dictionary_entry on_yomi"><dt>Parts:</dt><dd><a href="x">口</a> <a href="x">五</a> <a href="x">言</a></dd></dl></div>
<div class="kanji-details__main-readings"><dl class="dictionary_entry kun_yomi"><dt>Kun:</dt>
<dd class="kanji-details__main-readings-list" lang="ja"><a href="x">かた.る</a>&#12289; <a href="x">かた.らう</a></dd></dl>
<dl class="dictionary_entry on_yomi"><dt>On:</dt><dd class="kanji-details__main-readings-list" lang="ja"><a href="x">ゴ</a></dd></dl></div>
<div class="grade">Jōyō kanji, taught in <strong>grade 2</strong></div><div class="jlpt">JLPT level <strong>N5</strong></div>
<div class="frequency"><strong>301</strong> of 2500 most used kanji in newspapers</div>
<h2>On reading compounds</h2>
      <ul class="no-bullet"><li>   語学   【ゴガク】   study of foreign languages, linguistics </li></ul>
<h2>Kun reading compounds</h2>
      <ul class="no-bullet"><li>   語る   【かたる】   to talk about, to speak of </li></ul>`;
const k = parseKanjiPage("語", kanji);
assert.deepEqual([k.meanings, k.kun, k.on, k.parts, k.jlpt, k.grade, k.freq, k.strokes], [["word", "speech", "language"], ["かた.る", "かた.らう"], ["ゴ"], ["口", "五", "言"], "N5", "grade 2", 301, 14]);
assert.deepEqual(k.radical, { meaning: "speech", char: "言 (訁)" });
assert.deepEqual(k.onWords, [["語学", "ゴガク", "study of foreign languages, linguistics"]]);
assert.equal(parseKanjiPage("x", "<html>No results</html>").found, false);

const sentences = `<li class="entry sentence clearfix"><div class="sentence_content"><ul class="japanese_sentence japanese clearfix" lang="ja"> プリンという語は<li class="clearfix"><span class="furigana">しょう</span><span class="unlinked">生じた</span></li>と言われている。 </ul>
<div class="english_sentence clearfix"><span class="english">They say the word was born that way.</span> <span class="inline_copyright tatoeba">— Tatoeba</span></div></div><a class="light-details_link" href="x">Details ▸</a></li>`;
assert.deepEqual(parseSentences(sentences), [{ ja: [["プリンという語は"], ["生", "しょう"], ["じた"], ["と言われている。"]], en: "They say the word was born that way.", src: "tatoeba" }]);
assert.ok(isKanji("語") && isKanji("々") && !isKanji("ご") && !isKanji("語学"));
console.log("yomu-dict ok");
