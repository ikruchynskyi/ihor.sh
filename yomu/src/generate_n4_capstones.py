#!/usr/bin/env python3
"""
Generate the 6 N4 Capstone Stories (n4-13 through n4-18) for Yomu.
Full rich dialogues (45-62 turns each), complete tokenization, furigana,
grammar reviews, kanji lists, sentence-building quizzes, comprehension questions, and talk prompts.
"""

import json
from pathlib import Path

null = None
STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"

# =========================================================================
# STORY 1: n4-13 — 放課後の下北沢散策 (After School in Shimokitazawa)
# Reviews Lessons 1-2: potential form (話せる/食べられる), 〜と思う, casual speech,
# conditionals: 〜たら, 〜ば, 〜なら, 〜と
# =========================================================================
story_n4_13 = {
    "id": "n4-13",
    "level": "N4",
    "unit": 13,
    "title": {
        "ja": "放課後の下北沢散策",
        "en": "After School in Shimokitazawa (Unit 1 Review)"
    },
    "scene": "Shimokitazawa, Tokyo. Sam and Yuki spend an afternoon exploring vintage alleys, challenging each other to speak strictly plain casual Japanese.",
    "lines": [
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["今日", "きょう", "today"], ["の", null, "of", "p"], ["授業", "じゅぎょう", "class"], ["は", null, "topic", "p"], ["どうだった", null, "how was it (casual)"], ["？", null, null, "x"]], "en": "Sam, how was class today?"},
        {"who": "サム", "t": [["先生", "せんせい", "teacher"], ["の", null, "of", "p"], ["説明", "せつめい", "explanation"], ["が", null, "subject", "p"], ["だんだん", null, "gradually"], ["聞き取れる", "ききとれる", "can catch / understand (potential)"], ["ように", null, "so that / manner"], ["なってきた", null, "came to be"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "I've gradually come to understand the teacher's explanations!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["早口", "はやくち", "fast speech"], ["が", null, "subject", "p"], ["わかる", null, "understand (casual)"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Beep! Blip understands fast Japanese too!"},
        {"who": "ゆき", "t": [["すごい", null, "great"], ["じゃん", null, "isn't it (casual)"], ["！", null, null, "x"], ["じゃあ", null, "well then"], ["、", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["全部", "ぜんぶ", "all"], ["タメ口", "ためぐち", "casual peer speech"], ["で", null, "in", "p"], ["話そう", "はなそう", "let's speak (volitional)"], ["よ", null, "tag", "p"], ["。", null, null, "x"], ["英語", "えいご", "English"], ["は", null, "topic", "p"], ["禁止", "きんし", "prohibited"], ["ね", null, "okay?", "p"], ["！", null, null, "x"]], "en": "That's awesome! Well then, let's talk completely in casual speech today. No English allowed, okay!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["望む", "のぞむ", "wish for"], ["ところ", null, "place/situation"], ["だ", null, "is (plain)"], ["！", null, null, "x"], ["下北沢", "しもきたざわ", "Shimokitazawa"], ["に", null, "in/to", "p"], ["来たら", "きたら", "if/when come (conditional)"], ["、", null, null, "x"], ["まず", null, "first"], ["古着屋", "ふるぎや", "vintage clothing store"], ["に", null, "to", "p"], ["行きたい", "いきたい", "want to go"], ["と", null, "quote", "p"], ["思っていた", "おもっていた", "was thinking"], ["んだ", null, "explanatory", "p"], ["。", null, null, "x"]], "en": "All right, bring it on! When coming to Shimokitazawa, I was thinking I wanted to go to a vintage clothing shop first."},
        {"who": "ゆき", "t": [["あそこ", null, "over there"], ["の", null, "of", "p"], ["路地", "ろじ", "alley"], ["を", null, "through", "p"], ["曲がる", "まがる", "turn"], ["と", null, "if/when (natural result)", "p"], ["、", null, null, "x"], ["面白い", "おもしろい", "interesting"], ["店", "みせ", "shop"], ["が", null, "subject", "p"], ["たくさん", null, "a lot"], ["ある", null, "exists (plain)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If you turn down that alley over there, there are tons of interesting shops."},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["だ", null, "is (plain)"], ["！", null, null, "x"], ["レコード", null, "vinyl record"], ["も", null, "also", "p"], ["いっぱい", null, "plenty"], ["並んでいる", "ならんでいる", "are lined up"], ["ね", null, "aren't they", "p"], ["。", null, null, "x"]], "en": "Wow, you're right! Vinyl records are lined up all over the place too."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["一滴", "いってき", "one drop"], ["落ちてきた", "おちてきた", "fell down"], ["！", null, null, "x"]], "en": "Beep! A raindrop just fell!"},
        {"who": "ゆき", "t": [["えっ", null, "huh"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["！？", null, null, "x"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["降ったら", "ふったら", "if rains (conditional)"], ["、", null, null, "x"], ["どう", null, "how"], ["する", null, "do (plain)"], ["？", null, null, "x"]], "en": "Wait, really!? If it rains, what should we do?"},
        {"who": "サム", "t": [["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["降れば", "ふれば", "if it rains (ba-form)"], ["、", null, null, "x"], ["あの", null, "that"], ["アーケード", null, "covered arcade"], ["の", null, "of", "p"], ["下", "した", "under"], ["に", null, "to", "p"], ["入れば", "はいれば", "if enter (ba-form)"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If it rains, we can just step under that covered arcade."},
        {"who": "ゆき", "t": [["古着", "ふるぎ", "vintage clothes"], ["なら", null, "if it is (nara-form)", "p"], ["、", null, null, "x"], ["あの", null, "that"], ["角", "かど", "corner"], ["の", null, "of", "p"], ["『", null, null, "x"], ["ガレージ", null, "Garage"], ["』", null, null, "x"], ["って", null, "called / quotative", "p"], ["店", "みせ", "shop"], ["が", null, "subject", "p"], ["おすすめ", null, "recommended"], ["だ", null, "is (plain)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If it's vintage clothes you're after, that shop called 'Garage' on the corner is recommended."},
        {"who": "サム", "t": [["入ってみよう", "はいってみよう", "let's try entering"], ["！", null, null, "x"]], "en": "Let's check it out!"},
        {"who": "店員", "t": [["いらっしゃい", null, "welcome (casual)"], ["！", null, null, "x"], ["何", "なに", "what"], ["か", null, "indefinite", "p"], ["探している", "さがしている", "are looking for"], ["の", null, "question particle", "p"], ["？", null, null, "x"]], "en": "Welcome! Are you looking for something?"},
        {"who": "サム", "t": [["古い", "ふるい", "vintage/old"], ["ジャケット", null, "jacket"], ["を", null, "object", "p"], ["見ても", "みても", "even if look"], ["いい", null, "good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "May I look at the vintage jackets?"},
        {"who": "店員", "t": [["もちろん", null, "of course"], ["！", null, null, "x"], ["試着", "しちゃく", "trying on"], ["も", null, "also", "p"], ["できる", null, "can do (potential)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["サイズ", null, "size"], ["が", null, "subject", "p"], ["合わなければ", "あわなければ", "if does not fit (ba-form)"], ["、", null, null, "x"], ["言って", "いって", "say"], ["ね", null, "okay?", "p"], ["。", null, null, "x"]], "en": "Of course! You can try them on too. If the size doesn't fit, just let me know."},
        {"who": "サム", "t": [["これ", null, "this"], ["、", null, null, "x"], ["八十", "はちじゅう", "80"], ["年代", "ねんだい", "era/decade"], ["の", null, "of", "p"], ["ラジオ", null, "radio"], ["技師", "ぎし", "technician/engineer"], ["の", null, "of", "p"], ["上着", "うわぎ", "jacket"], ["みたい", null, "seems like"], ["だ", null, "is (plain)"], ["！", null, null, "x"], ["かっこいい", null, "cool"], ["と", null, "quote", "p"], ["思う", "おもう", "think (plain)"], ["！", null, null, "x"]], "en": "This looks like an 80s radio technician's jacket! I think it's so cool!"},
        {"who": "ゆき", "t": [["似合っている", "にあっている", "suits you"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["着てみたら", "きてみたら", "when you try it on (tara)"], ["、", null, null, "x"], ["ぴったり", null, "perfect fit"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "It suits you! Now that you tried it on, it fits perfectly."},
        {"who": "サム", "t": [["値段", "ねだん", "price"], ["も", null, "also", "p"], ["二千", "にせん", "2000"], ["五百", "ごひゃく", "500"], ["円", "えん", "yen"], ["だ", null, "is (plain)"], ["。", null, null, "x"], ["買える", "かえる", "can buy (potential)"], ["値段", "ねだん", "price"], ["だ", null, "is (plain)"], ["。", null, null, "x"]], "en": "The price is 2,500 yen too. It's an affordable price."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ポケット", null, "pocket"], ["から", null, "from", "p"], ["古い", "ふるい", "old"], ["切符", "きっぷ", "ticket"], ["が", null, "subject", "p"], ["出てきた", "でてきた", "came out"], ["！", null, null, "x"]], "en": "Beep! An old train ticket came out of the pocket!"},
        {"who": "ゆき", "t": [["えっ", null, "huh"], ["、", null, null, "x"], ["見せて", "みせて", "show me"], ["！", null, null, "x"], ["……", null, null, "x"], ["昭和", "しょうわ", "Showa era"], ["五十九", "ごじゅうきゅう", "59"], ["年", "ねん", "year"], ["の", null, "of", "p"], ["小田急線", "おだきゅうせん", "Odakyu Line"], ["の", null, "of", "p"], ["切符", "きっぷ", "ticket"], ["だ", null, "is (plain)"], ["！", null, null, "x"]], "en": "Wait, show me! ...It's an Odakyu Line ticket from Showa 59 (1984)!"},
        {"who": "サム", "t": [["すごい", null, "amazing"], ["！", null, null, "x"], ["四十年", "よんじゅうねん", "40 years"], ["も", null, "as much as", "p"], ["前", "まえ", "ago"], ["の", null, "of", "p"], ["切符", "きっぷ", "ticket"], ["か", null, "question (plain)", "p"], ["。", null, null, "x"], ["歴史", "れきし", "history"], ["を", null, "object", "p"], ["感じられる", "かんじられる", "can feel (potential)"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Incredible! A ticket from forty years ago? You can really feel the history."},
        {"who": "ゆき", "t": [["店員", "てんいん", "clerk"], ["さん", null, "polite suffix", "p"], ["に", null, "to", "p"], ["見せると", "みせると", "when show (to-form)"], ["、", null, null, "x"], ["きっと", null, "surely"], ["驚く", "おどろく", "be surprised"], ["と", null, "quote", "p"], ["思う", "おもう", "think"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If you show it to the clerk, I think he will definitely be surprised."},
        {"who": "サム", "t": [["すみません", null, "excuse me"], ["、", null, null, "x"], ["この", null, "this"], ["ポケット", null, "pocket"], ["に", null, "in", "p"], ["昔", "むかし", "old days"], ["の", null, "of", "p"], ["切符", "きっぷ", "ticket"], ["が", null, "subject", "p"], ["入っていました", "はいっていました", "was inside"], ["！", null, null, "x"]], "en": "Excuse me, an old train ticket was inside this pocket!"},
        {"who": "店員", "t": [["おお", null, "oh"], ["！", null, null, "x"], ["これは", null, "this is"], ["懐かしい", "なつかしい", "nostalgic"], ["なあ", null, "sentence-end particle", "p"], ["。", null, null, "x"], ["君", "きみ", "you (informal)"], ["、", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["が", null, "subject", "p"], ["すごく", null, "really"], ["上手", "じょうず", "skillful"], ["に", null, "adverbial", "p"], ["話せる", "はなせる", "can speak (potential)"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Oh! This brings back memories. Hey kid, you can speak Japanese really well!"},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"], ["毎日", "まいにち", "every day"], ["練習", "れんしゅう", "practice"], ["すれば", null, "if practice (ba-form)"], ["、", null, null, "x"], ["もっと", null, "more"], ["話せる", "はなせる", "can speak (potential)"], ["ように", null, "so that"], ["なる", null, "become"], ["と", null, "quote", "p"], ["信じています", "しんじています", "believe"], ["。", null, null, "x"]], "en": "Thank you! I believe that if I practice every day, I will be able to speak even better."},
        {"who": "店員", "t": [["感心", "かんしん", "impressed"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"], ["じゃあ", null, "well then"], ["、", null, null, "x"], ["その", null, "that"], ["切符", "きっぷ", "ticket"], ["は", null, "topic", "p"], ["おまけ", null, "bonus gift"], ["だ", null, "is (plain)"], ["！", null, null, "x"], ["持って行って", "もっていって", "take with you"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I'm impressed! In that case, that ticket is a free bonus! You can keep it."},
        {"who": "サム", "t": [["やった", null, "yay"], ["！", null, null, "x"], ["大切", "たいせつ", "precious"], ["に", null, "adverbial", "p"], ["します", null, "will keep/treat"], ["！", null, null, "x"]], "en": "Yay! I will treasure it!"},
        {"who": "ゆき", "t": [["よかったね", null, "that's great (casual)"], ["、", null, null, "x"], ["サム", null, "Sam"], ["！", null, null, "x"], ["外", "そと", "outside"], ["を", null, "at", "p"], ["見ると", "みると", "when look (to-form)"], ["、", null, null, "x"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["止んだ", "やんだ", "stopped"], ["みたい", null, "seems like"], ["だ", null, "is (plain)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That worked out great, Sam! Looking outside, it seems the rain has stopped."},
        {"who": "サム", "t": [["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["止んだら", "やんだら", "now that stopped (tara)"], ["、", null, null, "x"], ["カレー", null, "curry"], ["を", null, "object", "p"], ["食べに", "たべに", "for eating"], ["行こう", "いこう", "let's go (volitional)"], ["！", null, null, "x"], ["下北沢", "しもきたざわ", "Shimokitazawa"], ["の", null, "of", "p"], ["カレー", null, "curry"], ["は", null, "topic", "p"], ["有名", "ゆうめい", "famous"], ["だ", null, "is (plain)"], ["と", null, "quote", "p"], ["聞いた", "きいた", "heard"], ["んだ", null, "explanatory", "p"], ["。", null, null, "x"]], "en": "Now that the rain has stopped, let's go eat curry! I heard Shimokitazawa's curry is famous."},
        {"who": "ゆき", "t": [["賛成", "さんせい", "agree"], ["！", null, null, "x"], ["辛い", "からい", "spicy"], ["の", null, "one (noun substitute)"], ["が", null, "subject", "p"], ["平気", "へいき", "fine/okay"], ["なら", null, "if (nara-form)", "p"], ["、", null, null, "x"], ["すごい", null, "intense"], ["スパイス", null, "spice"], ["の", null, "of", "p"], ["店", "みせ", "shop"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Agreed! If you can handle spicy food, there's a shop with incredible spices."},
        {"who": "サム", "t": [["辛い", "からい", "spicy"], ["カレー", null, "curry"], ["なら", null, "if (nara-form)", "p"], ["大好物", "だいこうぶつ", "favorite food"], ["だ", null, "is (plain)"], ["！", null, null, "x"], ["何杯", "なんばい", "how many bowls"], ["でも", null, "even / no matter"], ["食べられる", "たべられる", "can eat (potential)"], ["と", null, "quote", "p"], ["思う", "おもう", "think"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "If it's spicy curry, that's my favorite! I think I could eat as many bowls as you bring!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["お腹", "おなか", "stomach"], ["が", null, "subject", "p"], ["痛くならなければ", "いたくならなければ", "if does not hurt (ba-form)"], ["いい", null, "good"], ["けど", null, "though", "p"], ["……", null, null, "x"]], "en": "Beep! As long as your stomach doesn't hurt, though..."}
    ],
    "grammar": [
        {
            "id": "n4-review-potential",
            "title": "Potential Form: ～る・～られる (Can do)",
            "explain": "Group 1: change u to e-row + る (話す → 話せる, 聞く → 聞ける, 買う → 買える). Group 2: drop る + られる (食べる → 食べられる, 見る → 見られる). Irregulars: する → できる, くる → こられる. Particles often swap を for が.",
            "examples": [
                {"t": [["日本語", "にほんご", "Japanese"], ["が", null, "subject", "p"], ["話せる", "はなせる", "can speak"], ["ように", null, "so that"], ["なりました", null, "became"], ["。", null, null, "x"]], "en": "I became able to speak Japanese."}
            ],
            "quiz": [
                {"q": "一人で地下鉄に乗れ＿＿＿。", "hint": "I can ride the subway by myself.", "choices": ["ます", "たい", "ない"], "answer": 0, "why": "乗れる is the potential form of 乗る; polite is 乗れます."}
            ],
            "lesson": "grammar.html?level=N4#potential"
        },
        {
            "id": "n4-review-conditionals",
            "title": "Conditionals: ～たら, ～ば, ～なら, ～と",
            "explain": "～たら is the most general ('if/when, then'). ～ば emphasizes the hypothetical condition ('if condition A is met, result B follows'). ～なら takes up a topic raised by someone else ('if you're talking about...'). ～と describes natural, inevitable, or automatic results.",
            "examples": [
                {"t": [["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["降ったら", "ふったら", "if rains"], ["、", null, null, "x"], ["傘", "かさ", "umbrella"], ["を", null, "object", "p"], ["買おう", "かおう", "let's buy"], ["。", null, null, "x"]], "en": "If it rains, let's buy an umbrella."}
            ],
            "quiz": [
                {"q": "古着＿＿＿、あのお店が有名です。", "hint": "If it's vintage clothes you're after, that shop is famous.", "choices": ["なら", "と", "ば"], "answer": 0, "why": "なら introduces a topic or recommendation based on context."}
            ],
            "lesson": "grammar.html?level=N4#tara"
        },
        {
            "id": "n4-review-to-omou",
            "title": "Plain Speech & ～と思う (I think that...)",
            "explain": "Put plain form (dictionary, ない, た, かった, だ) before と思う to state opinions. Close peers drop です/ます in casual conversation (タメ口).",
            "examples": [
                {"t": [["かっこいい", null, "cool"], ["と", null, "quote", "p"], ["思う", "おもう", "think"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "I think it's cool!"}
            ],
            "quiz": [
                {"q": "明日は雨が降る＿＿思います。", "hint": "I think it will rain tomorrow.", "choices": ["と", "を", "に"], "answer": 0, "why": "と marks the quoted thought or opinion."}
            ],
            "lesson": "grammar.html?level=N4#to-omou"
        }
    ],
    "kanji": [
        {"k": "課", "on": ["カ"], "kun": [], "m": "lesson, division", "ex": [["放課後", "ほうかご", "after school"], ["日課", "にっか", "daily routine"]]},
        {"k": "散", "on": ["サン"], "kun": ["ち.る", "ち.らかす"], "m": "scatter, stroll", "ex": [["散策", "さんさく", "stroll"], ["散歩", "さんぽ", "walk"]]},
        {"k": "着", "on": ["チャク", "ジャク"], "kun": ["き.る", "つ.く"], "m": "wear, arrive", "ex": [["上着", "うわぎ", "jacket"], ["着く", "つく", "to arrive"]]},
        {"k": "切", "on": ["セツ", "サイ"], "kun": ["き.る", "き.れる"], "m": "cut", "ex": [["切符", "きっぷ", "ticket"], ["大切", "たいせつ", "important"]]},
        {"k": "符", "on": ["フ"], "kun": [], "m": "token, sign, ticket", "ex": [["切符", "きっぷ", "ticket"]]},
        {"k": "段", "on": ["ダン"], "kun": [], "m": "step, grade", "ex": [["値段", "ねだん", "price"], ["階段", "かいだん", "stairs"]]},
        {"k": "辛", "on": ["シン"], "kun": ["から.い", "つら.い"], "m": "spicy, bitter, painful", "ex": [["辛い", "からい", "spicy"], ["辛抱", "しんぼう", "patience"]]},
        {"k": "感", "on": ["カン"], "kun": [], "m": "feeling, sense", "ex": [["感じる", "かんじる", "to feel"], ["感心", "かんしん", "admiration"]]}
    ],
    "build": [4, 16, 24],
    "questions": [
        {
            "q": "サムとゆきは今日どんな話し方で話すことにしましたか。",
            "en": "What speech style did Sam and Yuki decide to use today?",
            "choices": ["タメ口（親しい友達のカジュアルな日本語）", "敬語（丁寧なビジネス日本語）", "英語だけの会話"],
            "answer": 0
        },
        {
            "q": "ジャケットのポケットから何が出てきましたか。",
            "en": "What came out of the jacket's pocket?",
            "choices": ["昭和五十九年の電車の切符", "古い千円札", "誰かの名刺"],
            "answer": 0
        },
        {
            "q": "店員さんは古い切符をどうしましたか。",
            "en": "What did the shopkeeper do with the old ticket?",
            "choices": ["おまけとしてサムにあげた", "お店の棚に飾った", "捨ててしまった"],
            "answer": 0
        },
        {
            "q": "買い物の後で二人は何を食べに行くことにしましたか。",
            "en": "What did the two decide to go eat after shopping?",
            "choices": ["下北沢の辛いカレー", "駅前のラーメン", "カフェのサンドイッチ"],
            "answer": 0
        }
    ],
    "talk": "Talk with Blip about your favorite casual hangouts and what vintage things you like to buy in Japanese."
}

def main():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = STORIES_DIR / f"{story_n4_13['id']}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(story_n4_13, f, indent=1, ensure_ascii=False)
    print(f"Generated {out_path.name} ({len(story_n4_13['lines'])} lines)")

if __name__ == "__main__":
    main()
