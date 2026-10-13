#!/usr/bin/env python3
"""
N3 Capstone Stories Part 2 (n3-18 through n3-22).
Each story has 34-36 dialogue turns, full ruby annotations, grammar, kanji, and quizzes.
"""

import json
from pathlib import Path

null = None

# =========================================================================
# STORY 6: n3-18 (34 lines) — 箱根の湯けむりと語り合う未来
# Reviews: ～につれて, ～ものだ, ～からこそ, ～に違いない, ～ているうちに
# =========================================================================
story_n3_18 = {
    "id": "n3-18",
    "level": "N3",
    "unit": 18,
    "title": {
        "ja": "箱根の湯けむりと語り合う未来",
        "en": "Hakone Thermal Mists & The Future (Unit 6 Review)"
    },
    "scene": "A peaceful open-air hot spring ryokan veranda overlooking misty mountains in Hakone. Sam and Yuki reflect on their Japanese learning journey and future plans.",
    "lines": [
        {"who": "サム", "t": [["露天風呂", "ろてんぶろ", "open-air bath"], ["から", null, "from", "p"], ["眺める", "ながめる", "gaze at"], ["富士山", "ふじさん", "Mt. Fuji"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["絶景", "ぜっけい", "superb view"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Mt. Fuji viewed from the open-air bath is truly a magnificent sight!"},
        {"who": "ゆき", "t": [["夕暮れ", "ゆうぐれ", "dusk"], ["が", null, "subject", "p"], ["近づく", "ちかづく", "approach"], ["につれて", null, "as progresses"], ["、", null, null, "x"], ["空", "そら", "sky"], ["の", null, "of", "p"], ["色", "いろ", "color"], ["が", null, "subject", "p"], ["茜色", "あかねいろ", "madder red"], ["に", null, "to", "p"], ["変わっていく", "かわっていく", "keeps changing"], ["ね", null, "doesn't it", "p"], ["。", null, null, "x"]], "en": "As dusk approaches, the color of the sky keeps changing into madder red, doesn't it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["湯けむり", "ゆけむり", "steam from hot spring"], ["の", null, "of", "p"], ["向こう", "むこう", "beyond"], ["に", null, "in", "p"], ["、", null, null, "x"], ["一番星", "いちばんぼし", "first star of evening"], ["が", null, "subject", "p"], ["見えました", "みえました", "could see"], ["！", null, null, "x"]], "en": "Beep! Beyond the hot spring steam, the first evening star appeared!"},
        {"who": "サム", "t": [["日本", "にほん", "Japan"], ["に", null, "to", "p"], ["来た", "きた", "came"], ["ばかり", null, "just"], ["の", null, "of", "p"], ["頃", "ころ", "time"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["看板", "かんばん", "signboard"], ["の", null, "of", "p"], ["漢字", "かんじ", "kanji"], ["さえ", null, "even"], ["読めなかった", "よめなかった", "could not read"], ["ものだ", null, "nostalgic recall"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "When I had just arrived in Japan, I used to not even be able to read kanji on signboards, you know."},
        {"who": "ゆき", "t": [["懐かしい", "なつかしい", "nostalgic"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"], ["あの", null, "that"], ["頃", "ころ", "time"], ["の", null, "of", "p"], ["サム", null, "Sam"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["切符", "きっぷ", "ticket"], ["を", null, "object", "p"], ["買う", "かう", "buy"], ["の", null, "nominalizer"], ["にも", null, "even for", "p"], ["緊張", "きんちょう", "nervous"], ["していた", null, "was doing"], ["よね", null, "right?", "p"], ["。", null, null, "x"]], "en": "How nostalgic! Back then, Sam, you used to be nervous even buying train tickets, right?"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["失敗", "しっぱい", "failure"], ["を", null, "object", "p"], ["重ねる", "かさねる", "repeat/pile up"], ["につれて", null, "as progressed"], ["、", null, null, "x"], ["少しずつ", "すこしずつ", "little by little"], ["度胸", "どきょう", "courage"], ["が", null, "subject", "p"], ["ついてきた", null, "attached/gained"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "Yeah, as I kept making mistakes, I little by little gained courage."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["語彙数", "ごいすう", "vocabulary count"], ["は", null, "topic", "p"], ["当初", "とうしょ", "beginning"], ["の", null, "of", "p"], ["五倍", "ごばい", "5 times"], ["に", null, "to", "p"], ["達しました", "たっしました", "reached"], ["！", null, null, "x"]], "en": "Beep! Sam's vocabulary count has reached five times what it was at the beginning!"},
        {"who": "ゆき", "t": [["毎日", "まいにち", "every day"], ["諦めずに", "あきらめずに", "without giving up"], ["努力", "どりょく", "effort"], ["した", null, "did"], ["からこそ", null, "precisely because"], ["、", null, null, "x"], ["ここまで", null, "up to here"], ["上達", "じょうたつ", "improvement"], ["した", null, "did"], ["んだね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Precisely because you made effort every day without giving up, you progressed this far, didn't you."},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["が", null, "subject", "p"], ["根気よく", "こんきよく", "patiently"], ["付き合って", "つきあって", "accompanied"], ["くれた", null, "gave favor"], ["おかげ", null, "thanks to"], ["に違いない", null, "must surely be"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "It must surely be thanks to you sticking with me so patiently, Yuki!"},
        {"who": "ゆき", "t": [["私も", null, "I also"], ["サム", null, "Sam"], ["と", null, "with", "p"], ["話している", "はなしている", "speaking"], ["うちに", null, "while"], ["、", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["面白さ", "おもしろさ", "fascinating aspects"], ["を", null, "object", "p"], ["再発見", "さいはっけん", "rediscovery"], ["できた", null, "could do"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "While talking with you, Sam, I too was able to rediscover how fascinating Japanese is."},
        {"who": "サム", "t": [["言葉", "ことば", "language"], ["を", null, "object", "p"], ["学ぶ", "まなぶ", "learn"], ["と", null, "when/if", "p"], ["、", null, null, "x"], ["その", null, "that"], ["国", "くに", "country"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["の", null, "of", "p"], ["心", "こころ", "heart/mind"], ["が", null, "subject", "p"], ["見えてくる", "みえてくる", "comes into view"], ["ものだ", null, "nature of things"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "When you learn a language, the heart of the people of that country comes into view, doesn't it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["温泉", "おんせん", "hot spring"], ["卵", "たまご", "egg"], ["が", null, "subject", "p"], ["出来上がりました", "できあがりました", "finished cooking"], ["！", null, null, "x"], ["黄身", "きみ", "yolk"], ["が", null, "subject", "p"], ["とろとろ", null, "soft and creamy"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The hot spring eggs are ready! The yolk is soft and creamy!"},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["美味しい", "おいしい", "delicious"], ["そう", null, "looks"], ["！", null, null, "x"], ["お塩", "おしお", "salt"], ["を", null, "object", "p"], ["少し", "すこし", "a bit"], ["振って", "ふって", "shake/sprinkle"], ["食べよう", "たべよう", "let's eat"], ["。", null, null, "x"]], "en": "Wow, looks delicious! Let's sprinkle a little salt and eat."},
        {"who": "ゆき", "t": [["源泉", "げんせん", "hot spring source"], ["の", null, "of", "p"], ["熱", "ねつ", "heat"], ["で", null, "with", "p"], ["ゆっくり", null, "slowly"], ["火", "ひ", "heat"], ["を", null, "object", "p"], ["通す", "とおす", "pass through"], ["から", null, "because", "p"], ["、", null, null, "x"], ["独特", "どくとく", "unique"], ["の", null, "of", "p"], ["柔らかさ", "やわらかさ", "softness"], ["に", null, "to", "p"], ["なる", null, "become"], ["んだよ", null, "is, you know", "p"], ["。", null, null, "x"]], "en": "Because it slowly cooks with the natural spring heat, it acquires this unique tenderness."},
        {"who": "サム", "t": [["口", "くち", "mouth"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["とろける", null, "melts"], ["よう", null, "manner"], ["だ", null, "is"], ["！", null, null, "x"], ["こんな", null, "such"], ["贅沢", "ぜいたく", "luxury"], ["、", null, null, "x"], ["ニューヨーク", null, "New York"], ["では", null, "in", "p"], ["味わえない", "あじわえない", "cannot taste"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "It feels like it melts in the mouth! Such luxury can't be tasted in New York!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["箱根", "はこね", "Hakone"], ["の", null, "of", "p"], ["地熱", "ちねつ", "geothermal heat"], ["エネルギー", null, "energy"], ["、", null, null, "x"], ["素晴らしい", "すばらしい", "wonderful"], ["活用", "かつよう", "utilization"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Hakone's geothermal energy is used wonderfully!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["これから", null, "from now on"], ["日本", "にほん", "Japan"], ["で", null, "in", "p"], ["やりたい", "やりたい", "want to do"], ["こと", null, "things"], ["は", null, "topic", "p"], ["何", "なに", "what"], ["？", null, null, "x"]], "en": "Sam, what are the things you want to do in Japan from now on?"},
        {"who": "サム", "t": [["もっと", null, "more"], ["たくさん", null, "many"], ["の", null, "of", "p"], ["地方", "ちほう", "provinces/regions"], ["を", null, "through", "p"], ["旅", "たび", "travel"], ["して", null, "do"], ["、", null, null, "x"], ["地域", "ちいき", "region"], ["の", null, "of", "p"], ["方言", "ほうげん", "dialects"], ["や", null, "and", "p"], ["伝統", "でんとう", "tradition"], ["技術", "ぎじゅつ", "craftsmanship"], ["を", null, "object", "p"], ["取材", "しゅざい", "report/gather data"], ["したい", null, "want to do"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "I want to travel across more rural regions and document local dialects and traditional crafts."},
        {"who": "ゆき", "t": [["それ", null, "that"], ["、", null, null, "x"], ["すごく", null, "very"], ["いい", null, "good"], ["目標", "もくひょう", "goal"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["東北", "とうほく", "Tohoku"], ["や", null, "and", "p"], ["九州", "きゅうしゅう", "Kyushu"], ["にも", null, "also in", "p"], ["面白い", "おもしろい", "fascinating"], ["文化", "ぶんか", "culture"], ["が", null, "subject", "p"], ["たくさん", null, "a lot"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That's a fantastic goal! In Tohoku and Kyushu too, there is so much fascinating culture."},
        {"who": "サム", "t": [["日本語", "にほんご", "Japanese"], ["が", null, "subject", "p"], ["話せる", "はなせる", "can speak"], ["からこそ", null, "precisely because"], ["、", null, null, "x"], ["地元", "じもと", "local"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["と", null, "with", "p"], ["深い", "ふかい", "deep"], ["話", "はなし", "conversations"], ["が", null, "subject", "p"], ["できる", null, "can do"], ["もんね", null, "after all", "p"], ["。", null, null, "x"]], "en": "Precisely because I can speak Japanese, I can have deep conversations with local residents, after all."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["全国", "ぜんこく", "nationwide"], ["の", null, "of", "p"], ["無線", "むせん", "radio"], ["クラブ", null, "club"], ["とも", null, "with also", "p"], ["交信", "こうしん", "communication"], ["したい", null, "want to do"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! I want to communicate with amateur radio clubs all across Japan too!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["やる気", "やるき", "motivation"], ["満々", "まんまん", "full of"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Hehe, Blip is full of enthusiasm too, isn't it!"},
        {"who": "サム", "t": [["春", "はる", "spring"], ["に", null, "in", "p"], ["なったら", "なったら", "when becomes"], ["、", null, null, "x"], ["桜", "さくら", "cherry blossoms"], ["の", null, "of", "p"], ["下", "した", "under"], ["で", null, "at", "p"], ["お花見", "おはなみ", "hanami picnic"], ["も", null, "also", "p"], ["したい", null, "want to do"], ["な", null, "wish", "p"], ["。", null, null, "x"]], "en": "When spring comes, I'd love to have a cherry blossom viewing picnic under the trees too."},
        {"who": "ゆき", "t": [["お弁当", "おべんとう", "bento"], ["を", null, "object", "p"], ["作って", "つくって", "make"], ["、", null, null, "x"], ["みんな", null, "everyone"], ["で", null, "together", "p"], ["公園", "こうえん", "park"], ["へ", null, "to", "p"], ["行こう", "いこう", "let's go"], ["！", null, null, "x"]], "en": "Let's make bento lunches and go to the park together!"},
        {"who": "サム", "t": [["季節", "きせつ", "seasons"], ["が", null, "subject", "p"], ["移り変わる", "うつりかわる", "change/shift"], ["につれて", null, "as progresses"], ["、", null, null, "x"], ["違った", "ちがった", "different"], ["楽しみ", "たのしみ", "pleasures"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["の", null, "nominalizer"], ["が", null, "subject", "p"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["魅力", "みりょく", "charm"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "As seasons shift, having different joys is the true charm of Japan, isn't it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["四季", "しき", "four seasons"], ["の", null, "of", "p"], ["データ", null, "data"], ["、", null, null, "x"], ["収集", "しゅうしゅう", "collection"], ["開始", "かいし", "start"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! Commencing collection of four-season data!"},
        {"who": "ゆき", "t": [["湯加減", "ゆかげん", "bath water temp"], ["は", null, "topic", "p"], ["どう", null, "how"], ["？", null, null, "x"], ["熱すぎない", "あつすぎない", "not too hot"], ["？", null, null, "x"]], "en": "How is the water temperature? Not too hot?"},
        {"who": "サム", "t": [["ちょうど", null, "just"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["浸かっている", "つかっている", "soaking"], ["うちに", null, "while in middle of"], ["、", null, null, "x"], ["日頃", "ひごろ", "daily"], ["の", null, "of", "p"], ["疲れ", "つかれ", "fatigue"], ["が", null, "subject", "p"], ["すっかり", null, "completely"], ["抜けていく", "ぬけていく", "drains away"], ["ようだ", null, "feels like"], ["。", null, null, "x"]], "en": "It's just right! While soaking, it feels like daily fatigue completely drains away."},
        {"who": "ゆき", "t": [["温泉", "おんせん", "hot spring"], ["は", null, "topic", "p"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["最高", "さいこう", "supreme"], ["の", null, "of", "p"], ["癒やし", "いやし", "healing"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Hot springs are Japan's supreme healing, aren't they."},
        {"who": "サム", "t": [["明日は", "あしたは", "tomorrow"], ["芦ノ湖", "あしのこ", "Lake Ashi"], ["の", null, "of", "p"], ["海賊船", "かいぞくせん", "pirate ship"], ["に", null, "on", "p"], ["乗って", "のって", "ride"], ["みよう", "みよう", "let's try"], ["！", null, null, "x"]], "en": "Tomorrow let's try riding the sightseeing pirate ship on Lake Ashi!"},
        {"who": "ゆき", "t": [["いいね", null, "sounds great"], ["！", null, null, "x"], ["晴れたら", "はれたら", "if clear"], ["、", null, null, "x"], ["湖面", "こめん", "lake surface"], ["に", null, "on", "p"], ["逆さ富士", "さかさふじ", "inverted Mt. Fuji"], ["が", null, "subject", "p"], ["映る", "うつる", "reflects"], ["かもしれない", null, "might"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Sounds great! If it's sunny, inverted Mt. Fuji might reflect on the lake surface!"},
        {"who": "サム", "t": [["それ", null, "that"], ["は", null, "topic", "p"], ["ぜひ", null, "by all means"], ["カメラ", null, "camera"], ["に", null, "in", "p"], ["収めたい", "おさめたい", "want to capture"], ["な", null, "wish", "p"], ["！", null, null, "x"]], "en": "I'd love to capture that on camera by all means!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["高解像度", "こうかいぞうど", "high resolution"], ["レンズ", null, "lens"], ["を", null, "object", "p"], ["清掃", "せいそう", "clean"], ["しておきます", "しておきます", "will do in advance"], ["！", null, null, "x"]], "en": "Beep! I will clean my high-resolution lens in advance!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["未来", "みらい", "future"], ["に", null, "towards", "p"], ["向かって", "むかって", "facing"], ["、", null, null, "x"], ["明日", "あした", "tomorrow"], ["も", null, "also", "p"], ["思いっきり", "おもいきり", "to the fullest"], ["楽しもう", "たのしもう", "let's enjoy"], ["！", null, null, "x"]], "en": "All right, facing towards the future, let's enjoy tomorrow to the absolute fullest too!"}
    ],
    "grammar": [
        {
            "id": "n3-review-ni-tsurete",
            "title": "Proportional Change: ～につれて & ～にしたがって",
            "explain": "Noun / Verb dictionary form + につれて expresses that as X changes or advances, Y changes proportionally in response.",
            "examples": [
                {"t": [["時間", "じかん", "time"], ["が", null, "subject", "p"], ["経つ", "たつ", "pass"], ["につれて", null, "as passes"], ["、", null, null, "x"], ["寒く", "さむく", "cold"], ["なってきた", null, "became"], ["。", null, null, "x"]], "en": "As time passed, it became colder."}
            ],
            "quiz": [
                {"q": "日本語が上手になる＿＿＿、会話が楽しくなった。", "hint": "As my Japanese improved, conversations became more fun.", "choices": ["につれて", "にとって", "について"], "answer": 0, "why": "〜につれて expresses proportional progression."}
            ],
            "lesson": "grammar.html?level=N3#ni-tsurete"
        },
        {
            "id": "n3-review-kara-koso",
            "title": "Strong Emphasis on Reason: ～からこそ",
            "explain": "Sentence-plain + からこそ adds powerful emphasis ('precisely because / for the very reason that...').",
            "examples": [
                {"t": [["大変", "たいへん", "tough"], ["だからこそ", null, "precisely because"], ["、", null, null, "x"], ["やりがい", null, "worthwhile"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["。", null, null, "x"]], "en": "Precisely because it's tough, it is worthwhile."}
            ],
            "quiz": [
                {"q": "苦労した＿＿＿、成功したときの喜びが大きい。", "hint": "Precisely because we struggled, the joy of succeeding is immense.", "choices": ["からこそ", "からには", "からといって"], "answer": 0, "why": "からこそ emphasizes the decisive reason."}
            ],
            "lesson": "grammar.html?level=N3#kara-koso"
        }
    ],
    "kanji": [
        {"k": "眺", "on": ["チョウ"], "kun": ["なが.める"], "m": "stare, gaze", "ex": [["眺める", "ながめる", "to view/gaze at"]]},
        {"k": "景", "on": ["ケイ"], "kun": [], "m": "scenery, view", "ex": [["絶景", "ぜっけい", "superb view"], ["景色", "けしき", "scenery"]]},
        {"k": "茜", "on": ["セン"], "kun": ["あかね"], "m": "madder red", "ex": [["茜色", "あかねいろ", "sunset red"]]},
        {"k": "勇", "on": ["ユウ"], "kun": ["いさ.む"], "m": "courage", "ex": [["勇気", "ゆうき", "courage"]]},
        {"k": "泉", "on": ["セン"], "kun": ["いずみ"], "m": "spring, fountain", "ex": [["温泉", "おんせん", "hot spring"], ["源泉", "げんせん", "source spring"]]},
        {"k": "癒", "on": ["ユ"], "kun": ["い.やす", "い.える"], "m": "healing, cure", "ex": [["癒やし", "いやし", "healing/comfort"]]}
    ],
    "build": [0, 1, 7],
    "questions": [
        {
            "q": "夕暮れが近づくにつれて空は何色に変わっていきましたか。",
            "en": "As dusk approached, into what color did the sky keep changing?",
            "choices": ["茜色（美しい夕焼け色）", "真っ黒", "濃い青色"],
            "answer": 0
        },
        {
            "q": "サムさんは将来日本で何をしたいと語りましたか。",
            "en": "What did Sam share that he wants to do in Japan in the future?",
            "choices": ["地方を旅して方言や伝統技術を取材したい", "会社を設立したい", "ずっと温泉に入っていたい"],
            "answer": 0
        }
    ],
    "talk": "Describe a place of natural beauty where you could relax and reflect on your goals in Japanese."
}

# =========================================================================
# STORY 7: n3-19 (34 lines) — 下町三社祭と神輿の熱気
# Reviews: ～たびに, ～こそ, ～ますように, ～からこそ, ～ものだ
# =========================================================================
story_n3_19 = {
    "id": "n3-19",
    "level": "N3",
    "unit": 19,
    "title": {
        "ja": "下町三社祭と神輿の熱気",
        "en": "Shitamachi Sanja Matsuri Fervor (Unit 7 Review)"
    },
    "scene": "Asakusa Senso-ji temple grounds during the grand Sanja Matsuri festival. Crowds chant in unison, food stalls line the avenues, and Sam writes a prayer on a wooden ema plaque.",
    "lines": [
        {"who": "サム", "t": [["すごい", null, "incredible"], ["人出", "ひとで", "crowd of people"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["遠く", "とおく", "distance"], ["から", null, "from", "p"], ["太鼓", "たいこ", "drums"], ["の", null, "of", "p"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["地響き", "じひびき", "earth tremor"], ["の", null, "of", "p"], ["ように", null, "like"], ["聞こえてくる", "きこえてくる", "comes audible"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Incredible crowd! The sound of taiko drums from afar can be heard rumbling like tremors in the earth!"},
        {"who": "ゆき", "t": [["これ", null, "this"], ["が", null, "subject", "p"], ["浅草", "あさくさ", "Asakusa"], ["の", null, "of", "p"], ["三社祭", "さんじゃまつり", "Sanja Matsuri"], ["だよ", null, "is", "p"], ["！", null, null, "x"], ["毎年", "まいとし", "every year"], ["この", null, "this"], ["季節", "きせつ", "season"], ["に", null, "in", "p"], ["なると", null, "when becomes"], ["、", null, null, "x"], ["下町", "したまち", "downtown"], ["中", "じゅう", "throughout"], ["が", null, "subject", "p"], ["熱気", "ねっき", "fervor"], ["に", null, "in", "p"], ["包まれる", "つつまれる", "engulfed"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "This is Asakusa's Sanja Matsuri festival! Every year when this season comes, all of Shitamachi is engulfed in electric fervor."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["音圧", "おんあつ", "sound pressure"], ["九十", "きゅうじゅう", "90"], ["デシベル", null, "decibels"], ["を", null, "object", "p"], ["計測", "けいそく", "measurement"], ["！", null, null, "x"], ["神輿", "みこし", "portable shrine"], ["が", null, "subject", "p"], ["近づいて", "ちかづいて", "approaching"], ["きます", null, "comes"], ["！", null, null, "x"]], "en": "Beep! Measuring sound pressure at 90 decibels! The portable shrine is approaching!"},
        {"who": "担ぎ手", "t": [["セイヤ", null, "heave!"], ["！", null, null, "x"], ["セイヤ", null, "heave!"], ["！", null, null, "x"], ["ソイヤ", null, "ho!"], ["！", null, null, "x"], ["ソイヤ", null, "ho!"], ["！", null, null, "x"]], "en": "Seiya! Seiya! Soiya! Soiya!"},
        {"who": "サム", "t": [["金", "きん", "gold"], ["の", null, "of", "p"], ["鳳凰", "ほうおう", "phoenix"], ["が", null, "subject", "p"], ["輝く", "かがやく", "shining"], ["巨大な", "きょだいな", "gigantic"], ["神輿", "みこし", "mikoshi shrine"], ["だ", null, "is"], ["！", null, null, "x"], ["大勢", "おおぜい", "large crowd"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["が", null, "subject", "p"], ["肩", "かた", "shoulders"], ["を", null, "object", "p"], ["組んで", "くんで", "locking together"], ["、", null, null, "x"], ["力強く", "ちからづよく", "powerfully"], ["揺らして", "ゆらして", "swaying"], ["いる", null, "is"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "A gigantic portable shrine topped with a gleaming gold phoenix! A massive crowd has locked shoulders and is powerfully swaying it back and forth!"},
        {"who": "ゆき", "t": [["神輿", "みこし", "mikoshi"], ["を", null, "object", "p"], ["激しく", "はげしく", "fiercely"], ["揺らす", "ゆらす", "shake"], ["たびに", null, "every time"], ["、", null, null, "x"], ["神様", "かみさま", "deities"], ["の", null, "of", "p"], ["力", "ちから", "power"], ["が", null, "subject", "p"], ["高まる", "たかまる", "heighten"], ["と", null, "quote", "p"], ["信じられている", "しんじられている", "is believed"], ["んだよ", null, "is, you know", "p"], ["。", null, null, "x"]], "en": "Every time they shake the mikoshi vigorously, it is believed the deities' divine power is heightened."},
        {"who": "サム", "t": [["見る", "みる", "watch"], ["たびに", null, "every time"], ["、", null, null, "x"], ["胸", "むね", "chest"], ["が", null, "subject", "p"], ["熱く", "あつく", "hot/thrilled"], ["なる", null, "becomes"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["法被", "はっぴ", "happi festival coat"], ["姿", "すがた", "appearance"], ["が", null, "subject", "p"], ["本当に", "ほんとうに", "truly"], ["かっこいい", null, "cool"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Every time I watch it, my chest heats up with excitement! Their happi festival coats look so cool!"},
        {"who": "担ぎ手", "t": [["お兄さん", "おにいさん", "young man"], ["たち", null, "plural"], ["も", null, "also", "p"], ["、", null, null, "x"], ["一緒に", "いっしょに", "together"], ["掛け声", "かけごえ", "chant"], ["を", null, "object", "p"], ["かけて", null, "raise voice"], ["くれよ", null, "please do"], ["！", null, null, "x"], ["わっしょい", null, "wasshoi!"], ["！", null, null, "x"]], "en": "You guys join in the chanting with us too! Wasshoi!"},
        {"who": "サム", "t": [["わっしょい", null, "wasshoi!"], ["！", null, null, "x"], ["わっしょい", null, "wasshoi!"], ["！", null, null, "x"]], "en": "Wasshoi! Wasshoi!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ワッショイ", null, "wasshoi"], ["！", null, null, "x"], ["リズム", null, "rhythm"], ["同調", "どうちょう", "synchronization"], ["完了", "かんりょう", "complete"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Wasshoi! Rhythm synchronization complete!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["サム", null, "Sam"], ["も", null, "also", "p"], ["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["ノリノリ", null, "getting in groove"], ["だね", null, "aren't you", "p"], ["！", null, null, "x"]], "en": "Hehe, Sam and Blip are completely in the groove!"},
        {"who": "サム", "t": [["みんな", null, "everyone"], ["で", null, "together", "p"], ["声", "こえ", "voice"], ["を", null, "object", "p"], ["合わせる", "あわせる", "join together"], ["からこそ", null, "precisely because"], ["、", null, null, "x"], ["この", null, "this"], ["一体感", "いったいかん", "sense of unity"], ["が", null, "subject", "p"], ["生まれる", "うまれる", "is born"], ["んだね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Precisely because everyone joins their voices together, this amazing sense of unity is born, isn't it!"},
        {"who": "ゆき", "t": [["これ", null, "this"], ["こそ", null, "truly / for sure"], ["、", null, null, "x"], ["何百年", "なんびゃくねん", "hundreds of years"], ["も", null, "as much as", "p"], ["受け継がれてきた", "うけつがれてきた", "handed down"], ["伝統", "でんとう", "tradition"], ["の", null, "of", "p"], ["力", "ちから", "power"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "This right here is the true power of tradition that has been handed down across hundreds of years."},
        {"who": "サム", "t": [["屋台", "やたい", "food stall"], ["の", null, "of", "p"], ["いい", null, "good"], ["におい", null, "fragrance"], ["が", null, "subject", "p"], ["漂ってきた", "ただよってきた", "wafted over"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["焼きそば", "やきそば", "fried noodles"], ["に", null, "and", "p"], ["たこ焼き", "たこやき", "takoyaki"], ["……", null, null, "x"], ["目移り", "めうつり", "distracted by choices"], ["しちゃう", null, "end up doing"], ["な", null, "exclamation", "p"], ["！", null, null, "x"]], "en": "Great smells from the food stalls are wafting over! Yakisoba, takoyaki... I can't decide what to pick!"},
        {"who": "ゆき", "t": [["お祭り", "おまつり", "festival"], ["に", null, "to", "p"], ["来たら", "きたら", "if/when come"], ["、", null, null, "x"], ["屋台", "やたい", "stall"], ["の", null, "of", "p"], ["買い食い", "かいぐい", "buying street snacks"], ["は", null, "topic", "p"], ["欠かせない", "かかせない", "indispensable"], ["ものだ", null, "nature of things"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "When you come to a festival, buying street food snacks is an indispensable tradition!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["熱々", "あつあつ", "piping hot"], ["の", null, "of", "p"], ["たこ焼き", "たこやき", "takoyaki"], ["、", null, null, "x"], ["六個", "ろっこ", "6 pieces"], ["入り", "いり", "containing"], ["を", null, "object", "p"], ["買いましょう", "かいましょう", "let's buy"], ["！", null, null, "x"]], "en": "Beep! Let's buy a six-pack of piping hot takoyaki!"},
        {"who": "サム", "t": [["ハフハフ", null, "blowing hot food"], ["……", null, null, "x"], ["外", "そと", "outside"], ["は", null, "topic", "p"], ["カリッ", null, "crispy"], ["と", null, "with", "p"], ["、", null, null, "x"], ["中", "なか", "inside"], ["は", null, "topic", "p"], ["とろり", null, "creamy gooey"], ["と", null, "with", "p"], ["していて", null, "is"], ["最高", "さいこう", "supreme"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "Huff huff... Crispy on the outside, creamy on the inside, it's supreme!"},
        {"who": "ゆき", "t": [["境内", "けいだい", "shrine grounds"], ["で", null, "at", "p"], ["絵馬", "えま", "votive plaque"], ["を", null, "object", "p"], ["書いて", "かいて", "write"], ["いかない", null, "won't do?"], ["？", null, null, "x"]], "en": "Won't you write an ema wooden prayer plaque on the shrine grounds?"},
        {"who": "サム", "t": [["絵馬", "えま", "ema plaque"], ["ですか", null, "is it", "p"], ["？", null, null, "x"], ["願い事", "ねがいごと", "wish"], ["を", null, "object", "p"], ["書く", "かく", "write"], ["板", "いた", "board"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["ぜひ", null, "by all means"], ["書きたい", "かきたい", "want to write"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "An ema plaque? The wooden board where you write your wishes! I'd love to write one by all means!"},
        {"who": "ゆき", "t": [["どんな", null, "what kind of"], ["願い事", "ねがいごと", "wish"], ["を", null, "object", "p"], ["する", null, "do"], ["の", null, "question", "p"], ["？", null, null, "x"]], "en": "What kind of wish are you going to make?"},
        {"who": "サム", "t": [["『", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["能力", "のうりょく", "ability"], ["試験", "しけん", "exam"], ["に", null, "to", "p"], ["合格", "ごうかく", "pass"], ["できますように", null, "may I pass"], ["』", null, null, "x"], ["、", null, null, "x"], ["そして", null, "and"], ["『", null, null, "x"], ["仲間", "なかま", "friends"], ["みんな", null, "everyone"], ["が", null, "subject", "p"], ["健康", "けんこう", "health"], ["で", null, "and", "p"], ["いられますように", null, "may stay"], ["』", null, null, "x"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "'May I pass the Japanese Language Proficiency Test,' and 'May all my friends stay happy and healthy!'" },
        {"who": "ゆき", "t": [["素敵", "すてき", "lovely"], ["な", null, "na-particle", "p"], ["願い事", "ねがいごと", "wishes"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["サム", null, "Sam"], ["の", null, "of", "p"], ["願い", "ねがい", "wish"], ["、", null, null, "x"], ["きっと", null, "surely"], ["叶う", "かなう", "come true"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "What wonderful wishes! Sam's wish will surely come true!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["絵馬", "えま", "ema"], ["を", null, "object", "p"], ["専用", "せんよう", "dedicated"], ["の", null, "of", "p"], ["掛け所", "かけどころ", "hanging rack"], ["に", null, "on", "p"], ["結びつけました", "むすびつけました", "tied/hung"], ["！", null, null, "x"]], "en": "Beep! Tied the ema to the dedicated hanging rack!"},
        {"who": "サム", "t": [["たくさん", null, "many"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["の", null, "of", "p"], ["祈り", "いのり", "prayers"], ["が", null, "subject", "p"], ["風", "かぜ", "wind"], ["に", null, "in", "p"], ["揺れて", "ゆれて", "swaying"], ["いて", null, "is"], ["、", null, null, "x"], ["神聖", "しんせい", "sacred"], ["な", null, "na-particle", "p"], ["気持ち", "きもち", "feeling"], ["に", null, "to", "p"], ["なる", null, "become"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "So many people's prayers are fluttering in the wind, it gives such a sacred feeling."},
        {"who": "ゆき", "t": [["神輿", "みこし", "mikoshi"], ["が", null, "subject", "p"], ["雷門", "かみなりもん", "Kaminarimon Gate"], ["を", null, "through", "p"], ["抜けていく", "ぬけていく", "passes through"], ["ところ", null, "scene/phase"], ["を", null, "object", "p"], ["見に行こう", "みにいこう", "let's go see"], ["！", null, null, "x"]], "en": "Let's go watch the mikoshi pass through Kaminarimon Gate!"},
        {"who": "サム", "t": [["赤提灯", "あかちょうちん", "red lantern"], ["の", null, "of", "p"], ["下", "した", "under"], ["を", null, "through", "p"], ["くぐる", null, "pass under"], ["神輿", "みこし", "mikoshi"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["大迫力", "だいはくりょく", "tremendous impact"], ["だろう", null, "must be"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "The mikoshi passing under the giant red lantern must be an incredible spectacle!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["担ぎ手", "かつぎて", "bearers"], ["の", null, "of", "p"], ["熱気", "ねっき", "fervor"], ["が", null, "subject", "p"], ["最高潮", "さいこうちょう", "climax"], ["に", null, "to", "p"], ["達しています", "たっしています", "is reaching"], ["！", null, null, "x"]], "en": "Beep! The bearers' fervor has reached its absolute climax!"},
        {"who": "サム", "t": [["今日", "きょう", "today"], ["この", null, "this"], ["祭り", "まつり", "festival"], ["を", null, "object", "p"], ["体験", "たいけん", "experience"], ["できて", null, "could do"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["感動", "かんどう", "deeply moved"], ["した", null, "did"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Being able to experience this festival today has moved me so deeply."},
        {"who": "ゆき", "t": [["今年", "ことし", "this year"], ["こそ", null, "for sure"], ["サム", null, "Sam"], ["に", null, "to", "p"], ["三社祭", "さんじゃまつり", "Sanja Matsuri"], ["を", null, "object", "p"], ["見せたかった", "みせたかった", "wanted to show"], ["から", null, "because", "p"], ["、", null, null, "x"], ["来られて", "こられて", "could come"], ["本当", "ほんとう", "really"], ["に", null, "adverbial", "p"], ["よかった", null, "was good"], ["！", null, null, "x"]], "en": "This year for sure I wanted to show you Sanja Matsuri, so I'm so glad we could come!"},
        {"who": "サム", "t": [["浅草", "あさくさ", "Asakusa"], ["の", null, "of", "p"], ["下町", "したまち", "downtown"], ["パワー", null, "power"], ["を", null, "object", "p"], ["身体", "からだ", "body"], ["中", "じゅう", "throughout"], ["で", null, "with", "p"], ["浴びた", "あびた", "bathed in"], ["気分", "きぶん", "feeling"], ["だ", null, "is"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "I feel like my whole body was bathed in Asakusa's downtown energy!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["エネルギー", null, "energy"], ["チャージ", null, "charge"], ["、", null, null, "x"], ["百", "ひゃく", "100"], ["パーセント", null, "percent"], ["超え", "ごえ", "exceeded"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Energy charge exceeds 100%!"},
        {"who": "ゆき", "t": [["じゃあ", null, "well then"], ["、", null, null, "x"], ["夜", "よる", "night"], ["の", null, "of", "p"], ["宮入り", "みやいり", "shrine return procession"], ["まで", null, "until", "p"], ["しっかり", null, "thoroughly"], ["見届けよう", "みとどけよう", "let's witness"], ["！", null, null, "x"]], "en": "Well then, let's witness it thoroughly all the way until the evening shrine return procession!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["最後まで", "さいごまで", "until the end"], ["応援", "おうえん", "cheering"], ["する", null, "do"], ["ぞ", null, "determination", "p"], ["！", null, null, "x"], ["わっしょい", null, "wasshoi!"], ["！", null, null, "x"]], "en": "Yeah! I'll cheer until the very end! Wasshoi!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["わっしょい", null, "wasshoi!"], ["！", null, null, "x"], ["お祭り", "おまつり", "festival"], ["最高", "さいこう", "the best"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Wasshoi! Festivals are the greatest!"}
    ],
    "grammar": [
        {
            "id": "n3-review-tabini",
            "title": "Recurring Triggers: ～たびに (Every Time That...)",
            "explain": "Noun の / Verb dictionary form + たびに indicates that every single time a particular action occurs, the same reaction or consequence follows.",
            "examples": [
                {"t": [["写真", "しゃしん", "photos"], ["を", null, "object", "p"], ["見る", "みる", "look"], ["たびに", null, "every time"], ["、", null, null, "x"], ["旅", "たび", "trip"], ["を", null, "object", "p"], ["思い出す", "おもいだす", "remember"], ["。", null, null, "x"]], "en": "Every time I look at photos, I remember the trip."}
            ],
            "quiz": [
                {"q": "神輿が揺れる＿＿＿、大きな歓声が上がった。", "hint": "Every time the portable shrine swayed, huge cheers erupted.", "choices": ["たびに", "うちに", "ついでに"], "answer": 0, "why": "〜たびに marks repetitive occurrence triggering the reaction."}
            ],
            "lesson": "grammar.html?level=N3#tabini"
        },
        {
            "id": "n3-review-masu-you-ni",
            "title": "Prayers & Wishes: ～ますように (May It Be That...)",
            "explain": "Verb ます-stem + ように expresses heartfelt prayers or wishes ('May [something desirable] happen!'). Frequently written on shrine ema.",
            "examples": [
                {"t": [["試験", "しけん", "exam"], ["に", null, "in", "p"], ["合格", "ごうかく", "pass"], ["できますように", null, "may I pass"], ["！", null, null, "x"]], "en": "May I pass the exam!"}
            ],
            "quiz": [
                {"q": "家族がみんな元気でいられ＿＿＿＿。", "hint": "May my family all stay healthy and well.", "choices": ["ますように", "るように", "たように"], "answer": 0, "why": "〜ますように is used on prayers and wishing tablets."}
            ],
            "lesson": "grammar.html?level=N3#masu-you-ni"
        }
    ],
    "kanji": [
        {"k": "祭", "on": ["サイ"], "kun": ["まつ.る", "まつり"], "m": "festival, ritual", "ex": [["祭り", "まつり", "festival"], ["祭礼", "さいれい", "festival ritual"]]},
        {"k": "輿", "on": ["コシ"], "kun": [], "m": "palanquin, shrine", "ex": [["神輿", "みこし", "portable shrine"]]},
        {"k": "鳳", "on": ["ホウ"], "kun": [], "m": "male phoenix", "ex": [["鳳凰", "ほうおう", "mythical phoenix"]]},
        {"k": "凰", "on": ["オウ"], "kun": [], "m": "female phoenix", "ex": [["鳳凰", "ほうおう", "mythical phoenix"]]},
        {"k": "祈", "on": ["キ"], "kun": ["いの.る"], "m": "pray, wish", "ex": [["祈り", "いのり", "prayer"]]},
        {"k": "潮", "on": ["チョウ"], "kun": ["しお"], "m": "tide, climax", "ex": [["最高潮", "さいこうちょう", "climax/peak"]]}
    ],
    "build": [0, 4, 11],
    "questions": [
        {
            "q": "神輿を激しく揺らすのはなぜだと信じられていますか。",
            "en": "Why is it believed that the mikoshi is shaken vigorously?",
            "choices": ["揺らすたびに神様の力が高まるから", "重さを軽くするため", "速く歩くため"],
            "answer": 0
        },
        {
            "q": "サムさんは絵馬にどんな願い事を書きましたか。",
            "en": "What wishes did Sam write on the ema plaque?",
            "choices": ["日本語能力試験の合格と仲間の健康", "新しいパソコンがほしいこと", "故郷に帰りたいこと"],
            "answer": 0
        }
    ],
    "talk": "Describe a festival or public celebration in your culture and the chants or wishes people share in Japanese."
}

# =========================================================================
# STORY 8: n3-20 (34 lines) — 居酒屋談義：東京とニューヨークの夜
# Reviews: ～に比べて, ～わけではない, ～なんか/なんて, ～たびに, ～こそ
# =========================================================================
story_n3_20 = {
    "id": "n3-20",
    "level": "N3",
    "unit": 20,
    "title": {
        "ja": "居酒屋談義：東京とニューヨークの夜",
        "en": "Izakaya Debates: Tokyo vs NYC (Unit 8 Review)"
    },
    "scene": "A bustling yakitori izakaya under the train tracks in Yurakucho. Sam, Yuki, and Ken debate the cultural, transit, and social contrasts between Tokyo and New York.",
    "lines": [
        {"who": "ケン", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["乾杯", "かんぱい", "cheers"], ["！", null, null, "x"], ["今日", "きょう", "today"], ["も", null, "also", "p"], ["一日", "いちにち", "one day"], ["お疲れ様", "おつかれさま", "good work"], ["でした", null, "was"], ["！", null, null, "x"]], "en": "Sam, cheers! Thank you for your hard work today!"},
        {"who": "サム", "t": [["乾杯", "かんぱい", "cheers"], ["！", null, null, "x"], ["この", null, "this"], ["ガード下", "がーどした", "under railway bridge"], ["の", null, "of", "p"], ["赤提灯", "あかちょうちん", "red lantern"], ["、", null, null, "x"], ["活気", "かっき", "liveliness"], ["があって", null, "has and"], ["最高", "さいこう", "supreme"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Cheers! These red lanterns under the railway bridge are so lively and wonderful!"},
        {"who": "ゆき", "t": [["焼き鳥", "やきとり", "yakitori"], ["の", null, "of", "p"], ["盛り合わせ", "もりあわせ", "platter"], ["が", null, "subject", "p"], ["来た", "きた", "came"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["タレ", null, "sweet glaze sauce"], ["と", null, "and", "p"], ["塩", "しお", "salt"], ["、", null, null, "x"], ["どっち", null, "which"], ["から", null, "from", "p"], ["食べる", "たべる", "eat"], ["？", null, null, "x"]], "en": "The yakitori platter is here! Sweet glaze or salt, which do you want to start with?"},
        {"who": "サム", "t": [["まず", null, "first"], ["塩", "しお", "salt"], ["の", null, "of", "p"], ["ネギマ", null, "chicken & leek skewer"], ["から", null, "from", "p"], ["いただきます", null, "receive"], ["！", null, null, "x"], ["……", null, null, "x"], ["香ばしくて", "こうばしくて", "aromatic grilled and"], ["ジューシー", null, "juicy"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "I'll start with the salted negima skewer! ...It's so aromatically grilled and juicy!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["炭火", "すみび", "charcoal fire"], ["の", null, "of", "p"], ["遠赤外線", "えんせきがいせん", "far-infrared rays"], ["で", null, "by", "p"], ["中まで", "なかまで", "deep inside"], ["ふっくら", null, "fluffy/plump"], ["焼けて", "やけて", "grilled"], ["います", null, "is"], ["！", null, null, "x"]], "en": "Beep! Far-infrared rays from charcoal fire grilled it to tender plumpness all the way through!"},
        {"who": "ケン", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["ニューヨーク", null, "New York"], ["に", null, "to", "p"], ["比べて", "くらべて", "compared to"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["生活", "せいかつ", "living"], ["は", null, "topic", "p"], ["どう", null, "how"], ["？", null, null, "x"]], "en": "Sam, compared to New York, how is living in Tokyo?"},
        {"who": "サム", "t": [["ニューヨーク", null, "New York"], ["に", null, "to", "p"], ["比べて", "くらべて", "compared to"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["電車", "でんしゃ", "trains"], ["は", null, "topic", "p"], ["時間", "じかん", "time"], ["どおりに", null, "punctually"], ["来る", "くる", "come"], ["から", null, "because", "p"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["感動", "かんどう", "impressed"], ["する", null, "do"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Compared to New York, Tokyo trains arrive right on schedule, so I'm truly blown away."},
        {"who": "ゆき", "t": [["でも", null, "but"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["満員", "まんいん", "packed"], ["電車", "でんしゃ", "train"], ["は", null, "topic", "p"], ["大変", "たいへん", "terrible"], ["じゃない", null, "isn't it?"], ["？", null, null, "x"]], "en": "But isn't Tokyo's packed rush-hour train ordeal exhausting?"},
        {"who": "サム", "t": [["確かに", "たしかに", "certainly"], ["混雑", "こんざつ", "congestion"], ["は", null, "topic", "p"], ["すごい", null, "intense"], ["けれど", null, "though", "p"], ["、", null, null, "x"], ["車内", "しゃない", "inside train"], ["が", null, "subject", "p"], ["静か", "しずか", "quiet"], ["な", null, "na-particle", "p"], ["の", null, "nominalizer"], ["には", null, "for", "p"], ["驚いた", "おどろいた", "was surprised"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Certainly the crowding is intense, but I was amazed by how quiet the trains are inside."},
        {"who": "ケン", "t": [["ニューヨーク", null, "New York"], ["の", null, "of", "p"], ["地下鉄", "ちかてつ", "subway"], ["は", null, "topic", "p"], ["もっと", null, "more"], ["賑やか", "にぎやか", "lively/noisy"], ["なの", null, "question", "p"], ["？", null, null, "x"]], "en": "Are New York subways much noisier?"},
        {"who": "サム", "t": [["大音量", "だいおんりょう", "loud volume"], ["で", null, "at", "p"], ["音楽", "おんがく", "music"], ["を", null, "object", "p"], ["流す", "ながす", "play"], ["人", "ひと", "people"], ["や", null, "and", "p"], ["、", null, null, "x"], ["ダンス", null, "dancing"], ["を", null, "object", "p"], ["踊り出す", "おどりだす", "start dancing"], ["人", "ひと", "people"], ["も", null, "also", "p"], ["いる", null, "exists"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "There are folks blasting music at high volume, and folks who break into dance routines on the train!"},
        {"who": "ゆき", "t": [["ええっ", null, "whaat"], ["！？", null, null, "x"], ["電車", "でんしゃ", "train"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["ダンス", null, "dance"], ["！？", null, null, "x"], ["それは", null, "that is"], ["日本", "にほん", "Japan"], ["では", null, "in", "p"], ["考えられない", "かんがえられない", "unthinkable"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Whaat!? Dancing inside the subway!? That's completely unthinkable in Japan!"},
        {"who": "サム", "t": [["でも", null, "but"], ["、", null, null, "x"], ["ニューヨーク", null, "New York"], ["の", null, "of", "p"], ["人", "ひと", "everyone"], ["みんな", null, "everyone"], ["が", null, "subject", "p"], ["騒がしい", "さわがしい", "rowdy"], ["わけではない", null, "not necessarily"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["読書", "どくしょ", "reading"], ["に", null, "in", "p"], ["没頭", "ぼっとう", "engrossed"], ["している", null, "is doing"], ["人", "ひと", "people"], ["も", null, "also", "p"], ["たくさん", null, "many"], ["いる", null, "exists"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "However, it's not the case that everyone in New York is noisy. Lots of people are deeply engrossed in reading books too."},
        {"who": "ケン", "t": [["なるほど", null, "I see"], ["！", null, null, "x"], ["ステレオタイプ", null, "stereotype"], ["だけで", null, "just by"], ["判断", "はんだん", "judgment"], ["しては", null, "if do"], ["いけない", null, "must not"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "I see! One shouldn't judge based solely on stereotypes."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["チップ", null, "tipping"], ["制度", "せいど", "system"], ["の", null, "of", "p"], ["違い", "ちがい", "difference"], ["も", null, "also", "p"], ["興味深い", "きょうみぶかい", "fascinating"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The contrast in tipping systems is fascinating too!"},
        {"who": "サム", "t": [["そうなんだ", null, "that's right"], ["！", null, null, "x"], ["日本", "にほん", "Japan"], ["では", null, "in", "p"], ["チップ", null, "tip"], ["を", null, "object", "p"], ["払わなくても", "はらわなくても", "even if not pay"], ["、", null, null, "x"], ["世界最高", "せかいさいこう", "world's best"], ["の", null, "of", "p"], ["おもてなし", null, "hospitality"], ["を", null, "object", "p"], ["受けられる", "うけられる", "can receive"], ["よね", null, "right?", "p"], ["。", null, null, "x"]], "en": "Exactly! In Japan, even without paying tips, you receive the world's finest hospitality, right?"},
        {"who": "ゆき", "t": [["アメリカ", null, "America"], ["では", null, "in", "p"], ["サービス", null, "service"], ["料", "りょう", "fee"], ["として", null, "as", "p"], ["チップ", null, "tip"], ["を", null, "object", "p"], ["二十", "にじゅう", "20"], ["パーセント", null, "percent"], ["も", null, "as much as", "p"], ["払う", "はらう", "pay"], ["んでしょう", null, "right?"], ["？", null, null, "x"]], "en": "In America, you pay as much as 20% tip as service charge, don't you?"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["最近", "さいきん", "recently"], ["は", null, "topic", "p"], ["物価", "ぶっか", "prices"], ["も", null, "also", "p"], ["上がっている", "あがっている", "rising"], ["から", null, "because", "p"], ["、", null, null, "x"], ["外食", "がいしょく", "eating out"], ["する", null, "do"], ["たびに", null, "every time"], ["財布", "さいふ", "wallet"], ["が", null, "subject", "p"], ["軽くなる", "かるくなる", "gets light"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah, because prices have risen recently too, every time you eat out your wallet gets so much lighter."},
        {"who": "ケン", "t": [["そう考えると", "そうかんがえると", "thinking like that"], ["、", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["居酒屋", "いざかや", "izakaya"], ["は", null, "topic", "p"], ["安くて", "やすくて", "cheap"], ["美味しくて", "おいしくて", "delicious"], ["最高", "さいこう", "the best"], ["だね", null, "right?", "p"], ["！", null, null, "x"]], "en": "Thinking about it that way, Japanese izakayas are cheap, delicious, and the best!"},
        {"who": "サム", "t": [["お通し", "おとおし", "table appetizer"], ["の", null, "of", "p"], ["小鉢", "こばち", "small bowl"], ["さえ", null, "even"], ["手が込んでいて", "てがこんでいて", "elaborately made"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["美味しい", "おいしい", "delicious"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Even the otooshi table appetizer is elaborately prepared and delicious!"},
        {"who": "ゆき", "t": [["深夜", "しんや", "late night"], ["に", null, "at", "p"], ["一人", "ひとり", "alone"], ["で", null, "by", "p"], ["歩ける", "あるける", "can walk"], ["治安", "ちあん", "public safety"], ["の", null, "of", "p"], ["良さ", "よさ", "merit"], ["も", null, "also", "p"], ["、", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["自慢", "じまん", "pride"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "The high safety that allows walking alone late at night is also Japan's pride."},
        {"who": "サム", "t": [["それ", null, "that"], ["は", null, "topic", "p"], ["本当に", "ほんとうに", "truly"], ["そう", null, "so"], ["思う", "おもう", "think"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["女性", "じょせい", "women"], ["や", null, "and", "p"], ["子ども", "こども", "children"], ["が", null, "subject", "p"], ["夜", "よる", "night"], ["に", null, "at", "p"], ["一人", "ひとり", "alone"], ["で", null, "by", "p"], ["歩ける", "あるける", "can walk"], ["国", "くに", "country"], ["なんて", null, "things like"], ["、", null, null, "x"], ["世界中", "せかいじゅう", "whole world"], ["探しても", "さがしても", "even if search"], ["珍しい", "めずらしい", "rare"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I truly think so! Countries where women or children can walk alone at night are rare even if you search the entire world."},
        {"who": "ケン", "t": [["当たり前", "あたりまえ", "taken for granted"], ["だと", null, "if think"], ["思っていた", "おもっていた", "was thinking"], ["けれど", null, "though", "p"], ["、", null, null, "x"], ["外国", "がいこく", "abroad"], ["と", null, "with", "p"], ["比べる", "くらべる", "compare"], ["と", null, "when/if", "p"], ["ありがたさ", null, "blessing/value"], ["が", null, "subject", "p"], ["身に染みる", "みにしみる", "sinks deep into one"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "I used to take it for granted, but when comparing with abroad, the blessing really sinks in."},
        {"who": "サム", "t": [["違う", "ちがう", "different"], ["文化", "ぶんか", "culture"], ["を", null, "object", "p"], ["知る", "しる", "know"], ["からこそ", null, "precisely because"], ["、", null, null, "x"], ["自分", "じぶん", "own"], ["の", null, "of", "p"], ["国", "くに", "country"], ["の", null, "of", "p"], ["良さ", "よさ", "merits"], ["も", null, "also", "p"], ["見えてくる", "みえてくる", "comes into view"], ["んだね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Precisely because you know different cultures, the merits of your own country come into view too."},
        {"who": "ゆき", "t": [["お互い", "おたがい", "mutual"], ["の", null, "of", "p"], ["文化", "ぶんか", "culture"], ["を", null, "object", "p"], ["尊重", "そんちょう", "respect"], ["し合える", "しあえる", "can do each other"], ["関係", "かんけい", "relationship"], ["って", null, "topic", "p"], ["、", null, null, "x"], ["素敵", "すてき", "lovely"], ["だよね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "A relationship where we can mutually respect each other's cultures is so wonderful, isn't it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["文化", "ぶんか", "cultural"], ["比較", "ひかく", "comparison"], ["の", null, "of", "p"], ["ディスカッション", null, "discussion"], ["、", null, null, "x"], ["大変", "たいへん", "very"], ["有意義", "ゆういぎ", "meaningful"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Cultural comparison discussions are extremely meaningful!"},
        {"who": "ケン", "t": [["追加", "ついか", "addition"], ["で", null, "with", "p"], ["出汁巻き", "だしまき", "dashi rolled omelet"], ["玉子", "たまご", "egg"], ["と", null, "and", "p"], ["焼きおにぎり", "やきおにぎり", "grilled rice ball"], ["を", null, "object", "p"], ["頼もう", "たのもう", "let's order"], ["か", null, "question", "p"], ["！", null, null, "x"]], "en": "Shall we order additional rolled omelet and grilled rice balls!"},
        {"who": "サム", "t": [["出汁巻き", "だしまき", "dashi rolled omelet"], ["玉子", "たまご", "egg"], ["、", null, null, "x"], ["大好き", "だいすき", "love"], ["です", null, "is"], ["！", null, null, "x"], ["ぜひ", null, "by all means"], ["食べたい", "たべたい", "want to eat"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "I love dashi rolled omelets! I'd love to have some by all means!"},
        {"who": "ゆき", "t": [["香ばしい", "こうばしい", "fragrant grilled"], ["醤油", "しょうゆ", "soy sauce"], ["の", null, "of", "p"], ["焼きおにぎり", "やきおにぎり", "grilled onigiri"], ["も", null, "also", "p"], ["外せない", "はずせない", "cannot leave out"], ["よね", null, "right?", "p"], ["！", null, null, "x"]], "en": "Soy sauce grilled onigiri can't be missed either, right!"},
        {"who": "ケン", "t": [["店員", "てんいん", "waiter"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["すみません", null, "excuse me"], ["！", null, null, "x"], ["注文", "ちゅうもん", "order"], ["を", null, "object", "p"], ["お願いします", "おねがいします", "please"], ["！", null, null, "x"]], "en": "Excuse me, waiter! We'd like to place an order!"},
        {"who": "サム", "t": [["今日", "きょう", "today"], ["は", null, "topic", "p"], ["二人", "ふたり", "two of you"], ["と", null, "with", "p"], ["本音", "ほんね", "real thoughts"], ["で", null, "with", "p"], ["語り合えて", "かたりあえて", "could discuss"], ["、", null, null, "x"], ["すごく", null, "very"], ["楽しかった", "たのしかった", "was fun"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Being able to talk frankly with the two of you today was so much fun!"},
        {"who": "ケン", "t": [["僕", "ぼく", "I"], ["も", null, "also", "p"], ["だよ", null, "is, too", "p"], ["！", null, null, "x"], ["また", null, "again"], ["いつでも", null, "anytime"], ["飲みに行こう", "のみにいこう", "let's go drink"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "Me too! Let's go out drinking again anytime!"},
        {"who": "ゆき", "t": [["次は", "つぎは", "next"], ["下町", "したまち", "downtown"], ["の", null, "of", "p"], ["もんじゃ焼き", "もんじゃやき", "monjayaki"], ["に", null, "to", "p"], ["挑戦", "ちょうせん", "challenge"], ["しよう", "しよう", "let's do"], ["！", null, null, "x"]], "en": "Next, let's try downtown monjayaki!"},
        {"who": "サム", "t": [["おっ", null, "oh"], ["、", null, null, "x"], ["望むところだ", "のぞむところだ", "bring it on"], ["！", null, null, "x"], ["ご馳走様", "ごちそうさま", "thank you for feast"], ["でした", null, "was"], ["！", null, null, "x"]], "en": "Oh, bring it on! Thank you for the wonderful meal!"}
    ],
    "grammar": [
        {
            "id": "n3-review-ni-kurabete",
            "title": "Comparisons & Contrasts: ～に比べて",
            "explain": "Noun + に比べて expresses comparison between two entities ('compared to...').",
            "examples": [
                {"t": [["去年", "きょねん", "last year"], ["に", null, "to", "p"], ["比べて", "くらべて", "compared to"], ["、", null, null, "x"], ["物価", "ぶっか", "prices"], ["が", null, "subject", "p"], ["上がった", "あがった", "rose"], ["。", null, null, "x"]], "en": "Compared to last year, prices have risen."}
            ],
            "quiz": [
                {"q": "兄＿＿＿＿、弟はおとなしい性格だ。", "hint": "Compared to the older brother, the younger brother has a quiet personality.", "choices": ["に比べて", "にとって", "について"], "answer": 0, "why": "〜に比べて contrasts two subjects."}
            ],
            "lesson": "grammar.html?level=N3#ni-kurabete"
        },
        {
            "id": "n3-review-wake-dewa-nai",
            "title": "Partial Negation: ～わけではない",
            "explain": "Plain form + わけではない expresses partial negation ('it does not necessarily mean that...').",
            "examples": [
                {"t": [["嫌い", "きらい", "dislike"], ["な", null, "na-particle", "p"], ["わけではない", null, "not that I dislike"], ["。", null, null, "x"]], "en": "It's not that I dislike it."}
            ],
            "quiz": [
                {"q": "日本語が全部わかる＿＿＿＿が、日常会話ならできる。", "hint": "It's not that I understand all Japanese, but I can do daily conversations.", "choices": ["わけではない", "わけがない", "はずがない"], "answer": 0, "why": "〜わけではない softens absolute statements to partial negation."}
            ],
            "lesson": "grammar.html?level=N3#wake-dewa-nai"
        }
    ],
    "kanji": [
        {"k": "比", "on": ["ヒ"], "kun": ["くら.べる"], "m": "compare", "ex": [["比べる", "くらべる", "to compare"], ["比較", "ひかく", "comparison"]]},
        {"k": "較", "on": ["カク"], "kun": [], "m": "contrast, compare", "ex": [["比較", "ひかく", "comparison"]]},
        {"k": "混", "on": ["コン"], "kun": ["ま.じる", "こ.む"], "m": "mix, blend, crowded", "ex": [["混雑", "こんざつ", "congestion"]]},
        {"k": "雑", "on": ["ザツ", "ゾウ"], "kun": [], "m": "miscellaneous, rough", "ex": [["混雑", "こんざつ", "crowding"]]},
        {"k": "没", "on": ["ボツ"], "kun": [], "m": "drown, sink into", "ex": [["没頭", "ぼっとう", "immersion/absorption"]]},
        {"k": "頭", "on": ["トウ", "ズ"], "kun": ["あたま"], "m": "head", "ex": [["没頭", "ぼっとう", "immersion"]]}
    ],
    "build": [0, 5, 11],
    "questions": [
        {
            "q": "サムさんはニューヨークに比べて東京の電車の何に感動しましたか。",
            "en": "Compared to New York, what was Sam impressed by regarding Tokyo trains?",
            "choices": ["時間どおりに運行されること", "電車がカラフルなこと", "車内でダンスが見られること"],
            "answer": 0
        },
        {
            "q": "三人は日本のどんなところについて語り合いましたか。",
            "en": "What aspect of Japan did the three discuss?",
            "choices": ["チップが不要で治安が良く夜でも安全なこと", "物価が高いこと", "冬がとても寒いこと"],
            "answer": 0
        }
    ],
    "talk": "Compare two cities you have lived in or visited and explain their contrasts in Japanese."
}

# =========================================================================
# STORY 9: n3-21 (34 lines) — 技術同人誌の入稿徹夜
# Reviews: V-かける/かけ, V-きる, V-続ける, ～に比べて, ～わけではない
# =========================================================================
story_n3_21 = {
    "id": "n3-21",
    "level": "N3",
    "unit": 21,
    "title": {
        "ja": "技術同人誌の入稿徹夜",
        "en": "All-Nighter for the Tech Zine (Unit 9 Review)"
    },
    "scene": "A 24-hour coworking lounge in Akihabara. Sam, Yuki, and Blip sprint overnight to finish laying out a homebrew radio zine before the 6:00 AM printing deadline.",
    "lines": [
        {"who": "サム", "t": [["印刷所", "いんさつじょ", "printing house"], ["の", null, "of", "p"], ["締め切り", "しめきり", "deadline"], ["まで", null, "until", "p"], ["、", null, null, "x"], ["あと", null, "remaining"], ["三時間", "さんじかん", "3 hours"], ["しかない", null, "only"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "There are only three hours left until the printing house deadline!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["焦らない", "あせらない", "don't panic"], ["で", null, "te-neg", "p"], ["！", null, null, "x"], ["回路図", "かいろず", "circuit schematic"], ["の", null, "of", "p"], ["ページ", null, "pages"], ["は", null, "topic", "p"], ["全部", "ぜんぶ", "all"], ["書ききった", "かききった", "finished writing completely"], ["の", null, "question", "p"], ["？", null, null, "x"]], "en": "Sam, don't panic! Did you finish drawing all the circuit schematic pages?"},
        {"who": "サム", "t": [["第七", "だいなな", "chapter 7"], ["章", "しょう", "chapter"], ["の", null, "of", "p"], ["アンテナ", null, "antenna"], ["解説", "かいせつ", "explanation"], ["が", null, "subject", "p"], ["まだ", null, "still"], ["書きかけ", "かきかけ", "half-written"], ["なんだ", null, "explanatory"], ["。", null, null, "x"], ["今", "いま", "now"], ["急いで", "いそいで", "hurrying"], ["仕上げている", "しあげている", "putting finishing touches"], ["ところ", null, "in middle of"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "The antenna explanation in Chapter 7 is still half-written. I'm rushing to finish it right now!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["文字校正", "もじこうせい", "text proofreading"], ["プログラム", null, "program"], ["を", null, "object", "p"], ["実行", "じっこう", "execution"], ["中", "ちゅう", "in progress"], ["です", null, "is"], ["！", null, null, "x"], ["誤字", "ごじ", "typos"], ["を", null, "object", "p"], ["三件", "さんけん", "3 cases"], ["検出", "けんしゅつ", "detection"], ["しました", null, "did"], ["！", null, null, "x"]], "en": "Beep! Text proofreading program running! Detected three typos!"},
        {"who": "ゆき", "t": [["さすが", null, "as expected"], ["ブリップ", null, "Blip"], ["、", null, null, "x"], ["助かる", "たすかる", "helps out"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["徹夜", "てつや", "staying up all night"], ["で", null, "due to", "p"], ["頭", "あたま", "head"], ["が", null, "subject", "p"], ["ボーッとして", null, "spacing out"], ["きた", null, "came to"], ["から", null, "because", "p"], ["、", null, null, "x"], ["見落としかけた", "みおとしかけた", "almost overlooked"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "As expected of Blip, what a lifesaver! Since staying up all night made my head foggy, I almost overlooked them."},
        {"who": "サム", "t": [["コーヒー", null, "coffee"], ["を", null, "object", "p"], ["飲みながら", "のみながら", "while drinking"], ["、", null, null, "x"], ["朝", "あさ", "morning"], ["まで", null, "until", "p"], ["集中", "しゅうちゅう", "concentration"], ["し続けよう", "しつづけよう", "let's keep doing"], ["！", null, null, "x"]], "en": "Let's keep concentrating until morning while drinking coffee!"},
        {"who": "ゆき", "t": [["この", null, "this"], ["技術", "ぎじゅつ", "technical"], ["同人誌", "どうじんし", "fanzine"], ["、", null, null, "x"], ["自作", "じさく", "homebrew"], ["無線機", "むせんき", "radio"], ["の", null, "of", "p"], ["設計", "せっけい", "design"], ["が", null, "subject", "p"], ["とても", null, "very"], ["分かりやすく", "わかりやすく", "easily understandable"], ["まとまっている", "まとまっている", "is organized"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "This technical zine organizes homebrew radio design so clearly, doesn't it!"},
        {"who": "サム", "t": [["初心者", "しょしんしゃ", "beginners"], ["でも", null, "even", "p"], ["組み立てられる", "くみたてられる", "can assemble"], ["ように", null, "so that"], ["、", null, null, "x"], ["写真", "しゃしん", "photos"], ["を", null, "object", "p"], ["ふんだんに", null, "plentifully"], ["使った", "つかった", "used"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "So that even beginners can assemble it, I used plentiful photos."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["第七", "だいなな", "chapter 7"], ["章", "しょう", "chapter"], ["の", null, "of", "p"], ["図面", "ずめん", "diagrams"], ["、", null, null, "x"], ["配置", "はいち", "layout"], ["完了", "かんりょう", "complete"], ["しました", null, "did"], ["！", null, null, "x"]], "en": "Beep! Chapter 7 diagram layout completed!"},
        {"who": "サム", "t": [["やった", null, "yay"], ["！", null, null, "x"], ["これで", null, "with this"], ["本文", "ほんぶん", "body text"], ["を", null, "object", "p"], ["全部", "ぜんぶ", "all"], ["書き終えた", "かきおえた", "finished writing"], ["ぞ", null, "determination", "p"], ["！", null, null, "x"]], "en": "Yay! With this, I finished writing all the body text!"},
        {"who": "ゆき", "t": [["表紙", "ひょうし", "cover"], ["の", null, "of", "p"], ["デザイン", null, "design"], ["の", null, "of", "p"], ["色味", "いろみ", "coloring"], ["を", null, "object", "p"], ["確認", "かくにん", "confirm"], ["しよう", "しよう", "let's do"], ["。", null, null, "x"], ["RGB", null, "RGB"], ["から", null, "from", "p"], ["CMYK", null, "CMYK"], ["に", null, "to", "p"], ["変換", "へんかん", "convert"], ["しないと", null, "must do"], ["、", null, null, "x"], ["印刷", "いんさつ", "print"], ["で", null, "in", "p"], ["色", "いろ", "color"], ["が", null, "subject", "p"], ["くすんで", null, "dull/muddy"], ["しまう", null, "ends up"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Let's check the cover design color tones. If we don't convert from RGB to CMYK, the colors will turn dull in printing."},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["危ない", "あぶない", "dangerous"], ["ところ", null, "place/situation"], ["だった", null, "was"], ["！", null, null, "x"], ["今", "いま", "now"], ["カラー", null, "color"], ["プロファイル", null, "profile"], ["を", null, "object", "p"], ["変換", "へんかん", "convert"], ["する", null, "do"], ["ね", null, "okay?", "p"], ["。", null, null, "x"]], "en": "Ah, that was a close call! I'll convert the color profile right now."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["変換", "へんかん", "conversion"], ["完了", "かんりょう", "complete"], ["！", null, null, "x"], ["青空", "あおぞら", "blue sky"], ["の", null, "of", "p"], ["鮮やかさ", "あざやかさ", "vividness"], ["が", null, "subject", "p"], ["綺麗", "きれい", "beautiful"], ["に", null, "adverbial", "p"], ["保たれています", "たもたれています", "is maintained"], ["！", null, null, "x"]], "en": "Beep! Conversion complete! The vividness of the blue sky is maintained beautifully!"},
        {"who": "ゆき", "t": [["ページ", null, "page"], ["番号", "ばんごう", "number"], ["の", null, "of", "p"], ["抜け", "ぬけ", "omission"], ["は", null, "topic", "p"], ["ない", null, "none"], ["？", null, null, "x"], ["目次", "もくじ", "table of contents"], ["と", null, "with", "p"], ["照らし合わせて", "てらしあわせて", "cross-check"], ["みて", null, "try to"], ["。", null, null, "x"]], "en": "Are there any missing page numbers? Cross-check with the table of contents."},
        {"who": "サム", "t": [["一", "いち", "1"], ["ページ", null, "page"], ["から", null, "from", "p"], ["四十八", "よんじゅうはち", "48"], ["ページ", null, "page"], ["まで", null, "until", "p"], ["、", null, null, "x"], ["全部", "ぜんぶ", "all"], ["確認", "かくにん", "confirm"], ["しきった", null, "finished thoroughly"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["狂い", "くるい", "discrepancy"], ["は", null, "topic", "p"], ["ない", null, "none"], ["！", null, null, "x"]], "en": "From page 1 to page 48, I verified everything completely! Not a single discrepancy!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["PDF", null, "PDF"], ["書き出し", "かきだし", "export"], ["を", null, "object", "p"], ["開始", "かいし", "commencement"], ["します", null, "do"], ["！", null, null, "x"], ["進行", "しんこう", "progress"], ["バー", null, "bar"], ["、", null, null, "x"], ["八十", "はちじゅう", "80"], ["パーセント", null, "percent"], ["……", null, null, "x"]], "en": "Beep! Commencing PDF export! Progress bar at 80%..."},
        {"who": "ゆき", "t": [["ドキドキ", null, "heart-pounding"], ["する", null, "does"], ["ね", null, "doesn't it", "p"], ["！", null, null, "x"], ["エラー", null, "error"], ["が", null, "subject", "p"], ["出ない", "でない", "not occur"], ["と", null, "if", "p"], ["いい", null, "good"], ["けど", null, "though", "p"], ["……", null, null, "x"]], "en": "My heart is pounding! I hope no errors occur..."},
        {"who": "ブリップ", "t": [["ピンポーン", null, "chime"], ["！", null, null, "x"], ["書き出し", "かきだし", "export"], ["、", null, null, "x"], ["無事", "ぶじ", "successful"], ["完了", "かんりょう", "complete"], ["しました", null, "did"], ["！", null, null, "x"]], "en": "Chime! Export safely and completely finished!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["！", null, null, "x"], ["印刷所", "いんさつじょ", "printing house"], ["の", null, "of", "p"], ["サーバー", null, "server"], ["に", null, "to", "p"], ["アップロード", null, "upload"], ["する", null, "do"], ["ぞ", null, "determination", "p"], ["！", null, null, "x"], ["送信", "そうしん", "transmission"], ["ボタン", null, "button"], ["を", null, "object", "p"], ["押す", "おす", "press"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "All right! Uploading to the printing house server! Pressing the submit button!"},
        {"who": "ゆき", "t": [["お願い", "おねがい", "please"], ["、", null, null, "x"], ["間に合って", "まにあって", "make it in time"], ["！", null, null, "x"]], "en": "Please, make it in time!"},
        {"who": "サム", "t": [["……", null, null, "x"], ["アップロード", null, "upload"], ["完了", "かんりょう", "complete"], ["！", null, null, "x"], ["午前", "ごぜん", "a.m."], ["五時", "ごじ", "5 o'clock"], ["四十五", "よんじゅうご", "45"], ["分", "ふん", "minutes"], ["！", null, null, "x"], ["締め切り", "しめきり", "deadline"], ["の", null, "of", "p"], ["十五", "じゅうご", "15"], ["分", "ふん", "minutes"], ["前", "まえ", "before"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "...Upload complete! 5:45 AM! Fifteen minutes before the deadline!"},
        {"who": "ゆき", "t": [["やったあ", null, "we did it!"], ["！", null, null, "x"], ["間に合った", "まにあった", "made it in time"], ["ね", null, "didn't we", "p"], ["！", null, null, "x"], ["みんな", null, "everyone"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["に", null, "adverbial", "p"], ["お疲れ様", "おつかれさま", "great job"], ["！", null, null, "x"]], "en": "We did it! We made it in time! Everyone, truly great job!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["入稿", "にゅうこう", "submission to press"], ["ステータス", null, "status"], ["、", null, null, "x"], ["『", null, null, "x"], ["受付", "うけつけ", "receipt"], ["完了", "かんりょう", "complete"], ["』", null, null, "x"], ["と", null, "quote", "p"], ["表示", "ひょうじ", "display"], ["されました", null, "was done"], ["！", null, null, "x"]], "en": "Beep! Submission status displayed as 'Receipt Complete'!"},
        {"who": "サム", "t": [["ふう", null, "phew"], ["、", null, null, "x"], ["肩", "かた", "shoulders"], ["の", null, "of", "p"], ["力", "ちから", "tension"], ["が", null, "subject", "p"], ["一気に", "いっきに", "all at once"], ["抜けた", "ぬけた", "drained away"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["諦めずに", "あきらめずに", "without giving up"], ["やりきって", null, "followed through completely"], ["よかった", null, "glad that did"], ["！", null, null, "x"]], "en": "Phew, the tension in my shoulders drained away all at once. I'm so glad we saw it through to the end without giving up!"},
        {"who": "ゆき", "t": [["窓", "まど", "window"], ["を", null, "object", "p"], ["見て", "みて", "look"], ["ごらん", null, "try"], ["。", null, null, "x"], ["東", "ひがし", "east"], ["の", null, "of", "p"], ["空", "そら", "sky"], ["が", null, "subject", "p"], ["白んで", "しらんで", "turning light"], ["きた", null, "came to"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Look out the window. The eastern sky has started lightening with dawn."},
        {"who": "サム", "t": [["朝焼け", "あさやけ", "morning glow"], ["が", null, "subject", "p"], ["秋葉原", "あきはばら", "Akihabara"], ["の", null, "of", "p"], ["街", "まち", "town"], ["を", null, "object", "p"], ["照らして", "てらして", "illuminating"], ["いて", null, "is"], ["、", null, null, "x"], ["とても", null, "very"], ["綺麗", "きれい", "beautiful"], ["だ", null, "is"], ["。", null, null, "x"]], "en": "The morning sunrise is illuminating the town of Akihabara, it's so beautiful."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["徹夜", "てつや", "all night"], ["明け", "あけ", "dawn after"], ["の", null, "of", "p"], ["朝ご飯", "あさごはん", "breakfast"], ["を", null, "object", "p"], ["提案", "ていあん", "proposal"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! Proposing post-all-nighter breakfast!"},
        {"who": "ゆき", "t": [["賛成", "さんせい", "agree"], ["！", null, null, "x"], ["駅前", "えきまえ", "station front"], ["の", null, "of", "p"], ["喫茶店", "きっさてん", "coffee shop"], ["で", null, "at", "p"], ["、", null, null, "x"], ["焼きたて", "やきたて", "freshly baked"], ["トースト", null, "toast"], ["の", null, "of", "p"], ["モーニング", null, "morning set"], ["を", null, "object", "p"], ["食べよう", "たべよう", "let's eat"], ["！", null, null, "x"]], "en": "Agreed! Let's have freshly toasted morning sets at the coffee shop in front of the station!"},
        {"who": "サム", "t": [["最高", "さいこう", "supreme"], ["の", null, "of", "p"], ["ご褒美", "ごほうび", "reward"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["僕", "ぼく", "I"], ["、", null, null, "x"], ["目玉焼き", "めだまやき", "fried egg"], ["付き", "つき", "with"], ["の", null, "of", "p"], ["セット", null, "set"], ["に", null, "on", "p"], ["する", null, "decide"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "The ultimate reward! I'll choose the set with fried eggs!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["週末", "しゅうまつ", "weekend"], ["の", null, "of", "p"], ["技術書", "ぎじゅつしょ", "tech book"], ["イベント", null, "event"], ["が", null, "subject", "p"], ["楽しみ", "たのしみ", "looking forward"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Looking forward to the tech book festival this weekend!"},
        {"who": "ゆき", "t": [["百", "ひゃく", "100"], ["部", "ぶ", "copies"], ["刷る", "する", "print"], ["から", null, "because", "p"], ["、", null, null, "x"], ["たくさん", null, "many"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["に", null, "to", "p"], ["読んでもらえたら", "よんでもらえたら", "if read for us"], ["嬉しい", "うれしい", "glad"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "We're printing a hundred copies, so we'll be thrilled if lots of people read it!"},
        {"who": "サム", "t": [["苦労", "くろう", "struggle"], ["して", null, "did"], ["作った", "つくった", "made"], ["本", "ほん", "book"], ["だからこそ", null, "precisely because"], ["、", null, null, "x"], ["大切", "たいせつ", "precious"], ["な", null, "na-particle", "p"], ["一冊", "いっさつ", "one volume"], ["に", null, "to", "p"], ["なった", null, "became"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Precisely because we struggled to create it, it became a volume we'll treasure."},
        {"who": "ゆき", "t": [["さあ", null, "come now"], ["、", null, null, "x"], ["朝ご飯", "あさごはん", "breakfast"], ["を", null, "object", "p"], ["食べて", "たべて", "eat"], ["、", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["たっぷり", null, "plenty"], ["寝よう", "ねよう", "let's sleep"], ["！", null, null, "x"]], "en": "Come now, let's eat breakfast, and sleep plenty today!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["美味しい", "おいしい", "delicious"], ["モーニング", null, "morning meal"], ["へ", null, "to", "p"], ["レッツゴー", null, "let's go"], ["！", null, null, "x"]], "en": "Yeah! Let's go get delicious breakfast!"}
    ],
    "grammar": [
        {
            "id": "n3-review-kakeru-kiru",
            "title": "Action Completion: V-かける & V-きる",
            "explain": "V-stem + かける indicates an action begun but interrupted or incomplete ('half-done / about to'). V-stem + きる indicates carrying an action through completely to the end ('thoroughly / completely').",
            "examples": [
                {"t": [["最後", "さいご", "end"], ["まで", null, "until", "p"], ["やりきった", null, "carried through to end"], ["！", null, null, "x"]], "en": "I carried it through to the end!"}
            ],
            "quiz": [
                {"q": "書き＿＿＿の手紙が机の上に置いてある。", "hint": "A half-written letter is left on the desk.", "choices": ["かけ", "きり", "つづけ"], "answer": 0, "why": "〜かけ indicates an action in an unfinished state."}
            ],
            "lesson": "grammar.html?level=N3#kakeru"
        },
        {
            "id": "n3-review-tsuzukeru",
            "title": "Continuous Effort: V-続ける (Keep Doing)",
            "explain": "Verb stem + 続ける expresses an action or state maintained continuously without stopping over a period of time.",
            "examples": [
                {"t": [["朝", "あさ", "morning"], ["まで", null, "until", "p"], ["作業", "さぎょう", "work"], ["し続けた", "しつづけた", "kept on working"], ["。", null, null, "x"]], "en": "I kept on working until morning."}
            ],
            "quiz": [
                {"q": "諦めずに努力し＿＿＿＿ことが大切です。", "hint": "It is important to keep on making effort without giving up.", "choices": ["続ける", "かける", "きる"], "answer": 0, "why": "〜続ける indicates persistent ongoing continuation."}
            ],
            "lesson": "grammar.html?level=N3#tsuzukeru"
        }
    ],
    "kanji": [
        {"k": "稿", "on": ["コウ"], "kun": [], "m": "draft, copy", "ex": [["入稿", "にゅうこう", "submitting manuscript to press"]]},
        {"k": "徹", "on": ["テツ"], "kun": [], "m": "penetrate, throughout", "ex": [["徹夜", "てつや", "staying up all night"]]},
        {"k": "刷", "on": ["サツ"], "kun": ["す.る"], "m": "print", "ex": [["印刷", "いんさつ", "printing"], ["印刷所", "いんさつじょ", "print shop"]]},
        {"k": "締", "on": ["テイ"], "kun": ["し.める"], "m": "tighten, tie", "ex": [["締め切り", "しめきり", "deadline"]]},
        {"k": "照", "on": ["ショウ"], "kun": ["て.らす", "て.る"], "m": "illuminate, compare", "ex": [["照らし合わせる", "てらしあわせる", "cross-check"]]},
        {"k": "冊", "on": ["サツ", "サク"], "kun": [], "m": "volume, book counter", "ex": [["一冊", "いっさつ", "one volume"]]}
    ],
    "build": [0, 2, 9],
    "questions": [
        {
            "q": "サムさんは締め切りの何分前にアップロードを完了しましたか。",
            "en": "How many minutes before the deadline did Sam finish uploading?",
            "choices": ["十五分前", "三十分前", "一時間前"],
            "answer": 0
        },
        {
            "q": "徹夜作業の後で三人はどこへ行くことにしましたか。",
            "en": "Where did the three decide to go after working all night?",
            "choices": ["駅前の喫茶店のモーニング朝ご飯", "ラーメン屋", "すぐに帰宅して寝る"],
            "answer": 0
        }
    ],
    "talk": "Describe a project deadline sprint or all-nighter you experienced in Japanese."
}

# =========================================================================
# STORY 10: n3-22 (36 lines) — 吹雪の山荘：命をつなぐ非常通信
# Reviews: Full N3 Master Synthesis: ～だらけ, ～にしては, ～はずだった, ～わけにはいかない, ～かわりに, ～とおりに
# =========================================================================
story_n3_22 = {
    "id": "n3-22",
    "level": "N3",
    "unit": 22,
    "title": {
        "ja": "吹雪の山荘：命をつなぐ非常通信",
        "en": "Blizzard at the Alpine Hut: Radio Relay (Unit 10 Master Review)"
    },
    "scene": "A remote mountain lodge in the Northern Alps during a blinding blizzard. Power and mobile signals cut out. Sam, Yuki, and Blip build an emergency radio repeater to save stranded climbers.",
    "lines": [
        {"who": "サム", "t": [["外", "そと", "outside"], ["は", null, "topic", "p"], ["猛吹雪", "もうふぶき", "fierce blizzard"], ["で", null, "with", "p"], ["、", null, null, "x"], ["一寸先", "いっすんさき", "an inch ahead"], ["も", null, "even", "p"], ["見えない", "みえない", "cannot see"], ["白の世界", "しろのせかい", "whiteout world"], ["だ", null, "is"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Outside is a fierce blizzard, a whiteout world where you can't even see an inch ahead!"},
        {"who": "ゆき", "t": [["今日", "きょう", "today"], ["は", null, "topic", "p"], ["晴れる", "はれる", "clear up"], ["はずだった", null, "was supposed to"], ["のに", null, "even though", "p"], ["、", null, null, "x"], ["山", "やま", "mountain"], ["の", null, "of", "p"], ["天気", "てんき", "weather"], ["は", null, "topic", "p"], ["変わりやすい", "かわりやすい", "easy to change"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Even though it was supposed to be sunny today, mountain weather changes so easily, doesn't it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["停電", "ていでん", "blackout"], ["が", null, "subject", "p"], ["発生", "はっせい", "occurrence"], ["しました", null, "did"], ["！", null, null, "x"], ["携帯電話", "けいたいでんわ", "cell phone"], ["の", null, "of", "p"], ["電波", "でんぱ", "signals"], ["も", null, "also", "p"], ["圏外", "けんがい", "out of service area"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! A blackout has occurred! Mobile phone signals are completely out of range too!"},
        {"who": "管理人", "t": [["困った", "こまった", "in trouble"], ["こと", null, "thing"], ["になった", null, "became"], ["……", null, null, "x"], ["稜線", "りょうせん", "ridge line"], ["を", null, "through", "p"], ["登っていた", "のぼっていた", "was climbing"], ["パーティー", null, "climbing party"], ["が", null, "subject", "p"], ["まだ", null, "still"], ["戻ってきていない", "もどってきていない", "has not returned"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "We're in serious trouble... The party climbing along the ridge hasn't returned yet."},
        {"who": "サム", "t": [["えっ", null, "what"], ["！？", null, null, "x"], ["この", null, "this"], ["吹雪", "ふぶき", "blizzard"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["遭難", "そうなん", "disaster/accident"], ["した", null, "did"], ["かもしれない", null, "might have"], ["んですか", null, "is it", "p"], ["！？", null, null, "x"]], "en": "What!? Could they have met with an accident in this blizzard!?"},
        {"who": "管理人", "t": [["電話", "でんわ", "phone"], ["が", null, "subject", "p"], ["通じない", "つうじない", "not connect"], ["から", null, "because", "p"], ["、", null, null, "x"], ["麓", "ふもと", "foot of mountain"], ["の", null, "of", "p"], ["救助隊", "きゅうじょたい", "rescue team"], ["に", null, "to", "p"], ["連絡", "れんらく", "contact"], ["が", null, "subject", "p"], ["取れない", "とれない", "cannot reach"], ["んだ", null, "explanatory"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Because phones don't connect, we can't reach the rescue team at the foot of the mountain."},
        {"who": "サム", "t": [["見過ごす", "みすごす", "overlook"], ["わけにはいかない", null, "cannot afford to"], ["！", null, null, "x"], ["僕", "ぼく", "I"], ["の", null, "of", "p"], ["アマチュア", null, "amateur"], ["無線機", "むせんき", "radio"], ["を", null, "object", "p"], ["使いましょう", "つかいましょう", "let's use"], ["！", null, null, "x"]], "en": "We can't just stand by and do nothing! Let's use my amateur radio!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["非常用", "ひじょうよう", "emergency"], ["バッテリー", null, "battery"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["繋いで", "つないで", "connect"], ["！", null, null, "x"]], "en": "Sam, there is an emergency battery here! Connect it!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["アンテナ", null, "antenna"], ["を", null, "object", "p"], ["屋根", "やね", "roof"], ["の", null, "of", "p"], ["高所", "こうしょ", "high place"], ["に", null, "to", "p"], ["設置", "せっち", "installation"], ["する", null, "do"], ["必要があります", "ひつようがあります", "need to do"], ["！", null, null, "x"]], "en": "Beep! We need to install the antenna at a high point on the roof!"},
        {"who": "管理人", "t": [["雪", "ゆき", "snow"], ["だらけ", null, "covered in"], ["の", null, "of", "p"], ["屋根", "やね", "roof"], ["は", null, "topic", "p"], ["滑る", "すべる", "slips"], ["から", null, "because", "p"], ["、", null, null, "x"], ["命綱", "いのちづな", "safety lifeline"], ["を", null, "object", "p"], ["つけて", null, "attach"], ["俺", "おれ", "I"], ["が", null, "subject", "p"], ["登ろう", "のぼろう", "let me climb"], ["！", null, null, "x"]], "en": "The roof covered in snow is slippery, so I'll attach a safety lifeline and climb up!"},
        {"who": "サム", "t": [["マニュアル", null, "manual"], ["の", null, "of", "p"], ["指示", "しじ", "instructions"], ["どおりに", null, "as instructed"], ["、", null, null, "x"], ["同軸", "どうじく", "coaxial"], ["ケーブル", null, "cable"], ["を", null, "object", "p"], ["窓", "まど", "window"], ["から", null, "from", "p"], ["引き込みました", "ひきこみました", "pulled inside"], ["！", null, null, "x"]], "en": "Exactly as instructed in the manual, I pulled the coaxial cable inside through the window!"},
        {"who": "ゆき", "t": [["電源", "でんげん", "power"], ["スイッチ", null, "switch"], ["、", null, null, "x"], ["オン", null, "on"], ["！", null, null, "x"]], "en": "Power switch, on!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["四百三十", "よんひゃくさんじゅう", "430"], ["メガヘルツ", null, "MHz"], ["、", null, null, "x"], ["非常", "ひじょう", "emergency"], ["周波数", "しゅうはすう", "frequency"], ["に", null, "to", "p"], ["合わせました", "あわせました", "tuned"], ["！", null, null, "x"]], "en": "Beep! Tuned to the 430 MHz emergency calling frequency!"},
        {"who": "サム", "t": [["非常", "ひじょう", "emergency"], ["通信", "つうしん", "traffic"], ["！", null, null, "x"], ["こちらは", null, "this is"], ["北アルプス", "きたあるぷす", "North Alps"], ["の", null, "of", "p"], ["山荘", "さんそう", "mountain lodge"], ["です", null, "is"], ["！", null, null, "x"], ["遭難", "そうなん", "distress"], ["者", "しゃ", "party"], ["が", null, "subject", "p"], ["発生", "はっせい", "occurred"], ["しました", null, "did"], ["！", null, null, "x"], ["応答", "おうとう", "response"], ["願います", "ねがいます", "please"], ["！", null, null, "x"]], "en": "Emergency traffic! This is Northern Alps mountain lodge! We have a distressed climbing party! Please respond!"},
        {"who": "救助隊", "t": [["ザザッ", null, "static"], ["……", null, null, "x"], ["こちら", null, "this is"], ["山岳", "さんがく", "mountain"], ["救助隊", "きゅうじょたい", "rescue team"], ["！", null, null, "x"], ["感度", "かんど", "signal readability"], ["良好", "りょうこう", "loud and clear"], ["！", null, null, "x"], ["状況", "じょうきょう", "situation"], ["を", null, "object", "p"], ["報告", "ほうこく", "report"], ["してください", null, "please"], ["！", null, null, "x"]], "en": "Crackle... This is Mountain Rescue! Reading you loud and clear! Report your situation!"},
        {"who": "ゆき", "t": [["繋がった", "つながった", "connected"], ["！", null, null, "x"], ["救助隊", "きゅうじょたい", "rescue team"], ["に", null, "to", "p"], ["声", "こえ", "voice"], ["が", null, "subject", "p"], ["届いた", "とどいた", "reached"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "It connected! Our voice reached the rescue team!"},
        {"who": "管理人", "t": [["登山者", "とざんしゃ", "climbers"], ["三名", "さんめい", "3 people"], ["、", null, null, "x"], ["東", "ひがし", "east"], ["の", null, "of", "p"], ["尾根", "おね", "ridge"], ["付近", "ふきん", "vicinity"], ["で", null, "at", "p"], ["連絡", "れんらく", "contact"], ["途絶", "とぜつ", "interrupted"], ["！", null, null, "x"], ["避難小屋", "ひなんごや", "emergency shelter"], ["の", null, "of", "p"], ["位置", "いち", "coordinates"], ["を", null, "object", "p"], ["伝えます", "つたえます", "will convey"], ["！", null, null, "x"]], "en": "Three climbers, contact lost near eastern ridge! Relaying coordinates of the emergency shelter hut!"},
        {"who": "救助隊", "t": [["了解", "りょうかい", "roger"], ["！", null, null, "x"], ["雪上車", "せつじょうしゃ", "snowcat vehicle"], ["で", null, "by", "p"], ["ただちに", null, "immediately"], ["向かいます", "むかいます", "heading out"], ["！", null, null, "x"], ["無線", "むせん", "radio"], ["を", null, "object", "p"], ["維持", "いじ", "maintain"], ["してください", null, "please"], ["！", null, null, "x"]], "en": "Roger! Deploying snowcat vehicle immediately! Please maintain radio contact!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["バッテリー", null, "battery"], ["が", null, "subject", "p"], ["切れる", "きれる", "runs out"], ["かわりに", null, "instead of"], ["、", null, null, "x"], ["手回し", "てまわし", "hand-crank"], ["発電機", "はつでんき", "generator"], ["で", null, "with", "p"], ["給電", "きゅうでん", "power supply"], ["し続けます", "しつづけます", "will keep doing"], ["！", null, null, "x"]], "en": "Yes! In place of draining batteries, I will keep supplying power with the hand-crank generator!"},
        {"who": "ゆき", "t": [["私", "わたし", "I"], ["も", null, "also", "p"], ["ハンドル", null, "handle"], ["を", null, "object", "p"], ["回す", "まわす", "turn"], ["の", null, "nominalizer"], ["を", null, "object", "p"], ["交代", "こうたい", "taking turns"], ["する", null, "do"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "I'll take turns cranking the handle too!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["発電", "はつでん", "power generation"], ["効率", "こうりつ", "efficiency"], ["、", null, null, "x"], ["最適", "さいてき", "optimal"], ["レベル", null, "level"], ["を", null, "object", "p"], ["維持", "いじ", "maintenance"], ["中", "ちゅう", "in middle of"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Power generation efficiency maintained at optimal level!"},
        {"who": "管理人", "t": [["外国人", "がいこくじん", "foreigner"], ["の", null, "of", "p"], ["若者", "わかもの", "young man"], ["にしては", null, "for a..."], ["、", null, null, "x"], ["なんて", null, "what a"], ["頼もしい", "たのもしい", "reliable"], ["んだ", null, "is"], ["！", null, null, "x"], ["感謝", "かんしゃ", "gratitude"], ["する", null, "do"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "For such a young foreigner, how remarkably reliable you are! I can't thank you enough!"},
        {"who": "サム", "t": [["人の命", "ひとのいのち", "human life"], ["が", null, "subject", "p"], ["かかっている", "かかっている", "is on the line"], ["んです", null, "explanatory"], ["から", null, "because", "p"], ["、", null, null, "x"], ["全力を尽くす", "ぜんりょくをつくす", "do best"], ["のは", null, "thing"], ["当然", "とうぜん", "natural"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Because human lives are on the line, doing our absolute best is only natural!"},
        {"who": "救助隊", "t": [["ザザッ", null, "crackle"], ["……", null, null, "x"], ["こちら", null, "this is"], ["救助隊", "きゅうじょたい", "rescue team"], ["！", null, null, "x"], ["避難小屋", "ひなんごや", "emergency shelter"], ["にて", null, "at", "p"], ["登山者", "とざんしゃ", "climbers"], ["三名", "さんめい", "3 people"], ["を", null, "object", "p"], ["発見", "はっけん", "discovery"], ["！", null, null, "x"], ["全員", "ぜんいん", "all members"], ["、", null, null, "x"], ["無事", "ぶじ", "safe"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Crackle... This is Rescue! Discovered the three climbers at the shelter hut! All members are safe!"},
        {"who": "サム", "t": [["よかった", null, "thank goodness"], ["……", null, null, "x"], ["本当", "ほんとう", "really"], ["に", null, "adverbial", "p"], ["よかった", null, "thank goodness"], ["！", null, null, "x"]], "en": "Thank goodness... Truly thank goodness!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["みんな", null, "everyone"], ["無事", "ぶじ", "safe"], ["だった", null, "was"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["無線", "むせん", "radio"], ["が", null, "subject", "p"], ["命", "いのち", "lives"], ["を", null, "object", "p"], ["救った", "すくった", "saved"], ["んだね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Sam, everyone is safe! The radio saved lives!"},
        {"who": "管理人", "t": [["あんたがた", null, "you folks"], ["の", null, "of", "p"], ["おかげだ", null, "thanks to"], ["！", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["！", null, null, "x"]], "en": "It's all thanks to you folks! Truly thank you!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["非常通信", "ひじょうつうしん", "emergency traffic"], ["任務", "にんむ", "mission"], ["、", null, null, "x"], ["完全", "かんぜん", "complete"], ["成功", "せいこう", "success"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Emergency radio communication mission, complete success!"},
        {"who": "サム", "t": [["技術", "ぎじゅつ", "technology"], ["と", null, "and", "p"], ["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["両方", "りょうほう", "both"], ["を", null, "object", "p"], ["学んできた", "まなんできた", "have learned"], ["からこそ", null, "precisely because"], ["、", null, null, "x"], ["役に立てた", "やくにたてた", "could be of use"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Precisely because I learned both technology and Japanese, I was able to be of help!"},
        {"who": "ゆき", "t": [["日本語", "にほんご", "Japanese"], ["で", null, "in", "p"], ["正確", "せいかく", "accurately"], ["に", null, "adverbial", "p"], ["情報", "じょうほう", "information"], ["を", null, "object", "p"], ["伝えられた", "つたえられた", "could convey"], ["サム", null, "Sam"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["誇らしい", "ほこらしい", "proud"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Sam, being able to accurately convey emergency details in Japanese, I am truly proud of you!"},
        {"who": "サム", "t": [["自分", "じぶん", "myself"], ["でも", null, "even", "p"], ["ここまで", null, "up to here"], ["話せる", "はなせる", "can speak"], ["ように", null, "manner"], ["なった", null, "became"], ["なんて", null, "such a thing"], ["、", null, null, "x"], ["信じられない", "しんじられない", "unbelievable"], ["くらい", null, "so much"], ["嬉しい", "うれしい", "glad"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Even to myself, having become able to speak this well makes me unbelievably happy!"},
        {"who": "管理人", "t": [["吹雪", "ふぶき", "blizzard"], ["が", null, "subject", "p"], ["止んだら", "やんだら", "when stops"], ["、", null, null, "x"], ["山荘", "さんそう", "lodge"], ["の", null, "of", "p"], ["特製", "とくせい", "special"], ["鍋", "なべ", "hotpot"], ["を", null, "object", "p"], ["ご馳走", "ごちそう", "feast/treat"], ["する", null, "do"], ["から", null, "because", "p"], ["な", null, "tag", "p"], ["！", null, null, "x"]], "en": "When the blizzard stops, I'll treat you to the mountain lodge's special hotpot feast!"},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"], ["喜んで", "よろこんで", "with pleasure"], ["いただきます", null, "receive"], ["！", null, null, "x"]], "en": "Thank you very much! We'll gladly receive it!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["N3", null, "N3 level"], ["の", null, "of", "p"], ["全マスター", "ぜんますたー", "full mastery"], ["、", null, null, "x"], ["達成", "たっせい", "achievement"], ["いたしました", null, "did (humble)"], ["！", null, null, "x"]], "en": "Beep! Full mastery of N3 achieved!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["に", null, "adverbial", "p"], ["おめでとう", null, "congratulations"], ["！", null, null, "x"], ["これからも", null, "from now on too"], ["ずっと", null, "always"], ["応援", "おうえん", "support"], ["している", null, "am doing"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Sam, congratulations so very much! I will always be cheering for you from now on too!"},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["！", null, null, "x"], ["次", "つぎ", "next"], ["の", null, "of", "p"], ["ステージ", null, "stage"], ["も", null, "also", "p"], ["、", null, null, "x"], ["全力", "ぜんりょく", "full power"], ["で", null, "with", "p"], ["進んでいく", "すすんでいく", "advance forward"], ["ぞ", null, "determination", "p"], ["！", null, null, "x"]], "en": "Thank you! Into the next stage, I will march forward with all my strength!"}
    ],
    "grammar": [
        {
            "id": "n3-review-darake",
            "title": "Covered in Unpleasant Things: ～だらけ",
            "explain": "Noun + だらけ expresses being covered in, riddled with, or full of something undesirable (雪だらけ, 泥だらけ, 間違いだらけ).",
            "examples": [
                {"t": [["部屋", "へや", "room"], ["が", null, "subject", "p"], ["ゴミ", null, "trash"], ["だらけ", null, "full of"], ["だ", null, "is"], ["。", null, null, "x"]], "en": "The room is full of garbage."}
            ],
            "quiz": [
                {"q": "雨の中を走って、服が泥＿＿＿になった。", "hint": "Running in the rain, my clothes became covered in mud.", "choices": ["だらけ", "ばかり", "ぎみ"], "answer": 0, "why": "泥だらけ denotes covered in mud."}
            ],
            "lesson": "grammar.html?level=N3#darake"
        },
        {
            "id": "n3-review-wake-ni-wa-ikanai",
            "title": "Moral / Social Obligation: ～わけにはいかない",
            "explain": "Verb dictionary form + わけにはいかない expresses that social, moral, or situational circumstances prevent one from doing something ('cannot afford to / must not'). Negative: ～ないわけにはいかない ('cannot avoid doing / must do').",
            "examples": [
                {"t": [["諦める", "あきらめる", "give up"], ["わけにはいかない", null, "cannot afford to give up"], ["。", null, null, "x"]], "en": "I cannot afford to give up."}
            ],
            "quiz": [
                {"q": "大切な約束があるから、休む＿＿＿＿。", "hint": "Because I have an important promise, I cannot afford to take the day off.", "choices": ["わけにはいかない", "わけがない", "はずがない"], "answer": 0, "why": "〜わけにはいかない expresses impossibility due to duty."}
            ],
            "lesson": "grammar.html?level=N3#wake-ni-wa-ikanai"
        }
    ],
    "kanji": [
        {"k": "吹", "on": ["スイ"], "kun": ["ふ.く"], "m": "blow, breathe", "ex": [["吹雪", "ふぶき", "blizzard"], ["猛吹雪", "もうふぶき", "fierce blizzard"]]},
        {"k": "遭", "on": ["ソウ"], "kun": ["あ.う"], "m": "encounter, meet with", "ex": [["遭難", "そうなん", "disaster/accident"]]},
        {"k": "救", "on": ["キュウ"], "kun": ["すく.う"], "m": "salvation, save, rescue", "ex": [["救助隊", "きゅうじょたい", "rescue team"]]},
        {"k": "助", "on": ["ジョ"], "kun": ["たす.ける", "たす.かる"], "m": "help, assist", "ex": [["救助", "きゅうじょ", "rescue"]]},
        {"k": "命", "on": ["メイ", "ミョウ"], "kun": ["いのち"], "m": "fate, life", "ex": [["命", "いのち", "life"], ["命綱", "いのちづな", "safety lifeline"]]},
        {"k": "綱", "on": ["コウ"], "kun": ["つな"], "m": "rope, cord", "ex": [["命綱", "いのちづな", "lifeline"]]}
    ],
    "build": [0, 6, 13],
    "questions": [
        {
            "q": "なぜ山荘から救助隊へ電話をかけることができませんでしたか。",
            "en": "Why couldn't phone calls be made from the mountain lodge to the rescue team?",
            "choices": ["吹雪による停電で携帯の電波が圏外になったから", "電話機が壊れたから", "電話番号を知らなかったから"],
            "answer": 0
        },
        {
            "q": "サムさんはどうやって遭難の状況を救助隊に伝えましたか。",
            "en": "How did Sam communicate the distress situation to the rescue team?",
            "choices": ["アマチュア無線の非常周波数を使って直接交信した", "山を走って下りた", "狼煙（のろし）を上げた"],
            "answer": 0
        }
    ],
    "talk": "Describe an emergency situation or severe weather experience and how communication tools helped in Japanese."
}

def get_p2_stories():
    return [story_n3_18, story_n3_19, story_n3_20, story_n3_21, story_n3_22]

if __name__ == "__main__":
    STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    for s in get_p2_stories():
        out = STORIES_DIR / f"{s['id']}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
        print(f"Generated {out.name} ({len(s['lines'])} lines, {len(s['grammar'])} grammar points, {len(s['kanji'])} kanji)")
