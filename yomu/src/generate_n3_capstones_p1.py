#!/usr/bin/env python3
"""
N3 Capstone Stories Part 1 (n3-13 through n3-17).
Each story has 34 dialogue turns, full ruby annotations, grammar, kanji, and quizzes.
"""

import json
from pathlib import Path

null = None

# =========================================================================
# STORY 1: n3-13 (34 lines) — 時差ボケと深夜のコンビニ
# Reviews: ～ばよかった, ～気味, ～っぽい, ～わけだ, ～にとって, ～さえ
# =========================================================================
story_n3_13 = {
    "id": "n3-13",
    "level": "N3",
    "unit": 13,
    "title": {
        "ja": "時差ボケと深夜のコンビニ",
        "en": "Jetlag & Midnight at the Konbini (Unit 1 Review)"
    },
    "scene": "A brightly lit convenience store in Shinjuku at 2:30 AM. Sam suffers from severe jetlag and slight chills, finding comforting hot food and practical conversation with the veteran clerk.",
    "lines": [
        {"who": "サム", "t": [["時計", "とけい", "clock"], ["を", null, "object", "p"], ["見たら", "みたら", "when looked"], ["、", null, null, "x"], ["もう", null, "already"], ["夜中", "よなか", "middle of night"], ["の", null, "of", "p"], ["二時半", "にじはん", "2:30"], ["だった", null, "was"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "When I looked at the clock, it was already 2:30 in the middle of the night."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["時差ボケ", "じさぼけ", "jetlag"], ["で", null, "due to", "p"], ["眠れない", "ねむれない", "cannot sleep"], ["わけ", null, "reason/case"], ["ですね", null, "isn't it", "p"], ["？", null, null, "x"]], "en": "Beep! So the reason you can't sleep is jetlag, right?"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["ニューヨーク", null, "New York"], ["の", null, "of", "p"], ["昼間", "ひるま", "daytime"], ["の", null, "of", "p"], ["時間", "じかん", "time"], ["だから", null, "because", "p"], ["、", null, null, "x"], ["目", "め", "eyes"], ["が", null, "subject", "p"], ["冴えて", "さえて", "wide awake"], ["眠れない", "ねむれない", "cannot sleep"], ["んだ", null, "explanatory", "p"], ["。", null, null, "x"]], "en": "Yeah, because it's daytime in New York right now, my eyes are wide awake and I can't sleep."},
        {"who": "ブリップ", "t": [["体温", "たいおん", "body temp"], ["センサー", null, "sensor"], ["が", null, "subject", "p"], ["反応", "はんのう", "reaction"], ["しています", null, "is doing"], ["！", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["少し", "すこし", "a bit"], ["熱っぽい", "ねつっぽい", "feverish"], ["ですよ", null, "you know", "p"], ["！", null, null, "x"]], "en": "My temperature sensor is reacting! Sam, you seem slightly feverish!"},
        {"who": "サム", "t": [["飛行機", "ひこうき", "airplane"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["もっと", null, "more"], ["寝ておけばよかった", "ねておけばよかった", "should have slept in advance"], ["なあ", null, "wistful", "p"], ["。", null, null, "x"], ["ちょっと", null, "a bit"], ["風邪気味", "かぜぎみ", "slight cold"], ["かも", null, "maybe"], ["しれない", null, "cannot know"], ["。", null, null, "x"]], "en": "I really should have slept more on the plane. I might have a slight touch of a cold."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["無理", "むり", "impossible/overdoing"], ["しちゃだめ", null, "must not do"], ["だよ", null, "assurance", "p"], ["！", null, null, "x"], ["コンビニ", null, "konbini"], ["で", null, "at", "p"], ["温かい", "あたたかい", "warm"], ["飲み物", "のみもの", "drink"], ["と", null, "and", "p"], ["マスク", null, "mask"], ["を", null, "object", "p"], ["買ってこよう", "かってこよう", "let's buy and bring"], ["！", null, null, "x"]], "en": "Sam, you shouldn't push yourself! Let's go to the convenience store and buy hot drinks and a mask!"},
        {"who": "サム", "t": [["こんな", null, "such a"], ["夜中", "よなか", "midnight"], ["でも", null, "even", "p"], ["、", null, null, "x"], ["お店", "おみせ", "shop"], ["が", null, "subject", "p"], ["開いて", "あいて", "open"], ["いる", null, "is"], ["の", null, "question", "p"], ["？", null, null, "x"]], "en": "Is the shop really open even at such a late hour?"},
        {"who": "ゆき", "t": [["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["コンビニ", null, "konbini"], ["は", null, "topic", "p"], ["二十四時間", "にじゅうよじかん", "24 hours"], ["開いている", "あいている", "open"], ["から", null, "because", "p"], ["、", null, null, "x"], ["外国人", "がいこくじん", "foreigner"], ["にとって", null, "for"], ["も", null, "also", "p"], ["本当に", "ほんとうに", "really"], ["便利", "べんり", "convenient"], ["なんだよ", null, "it is", "p"], ["。", null, null, "x"]], "en": "Japanese convenience stores are open 24 hours, so for foreigners too they are really convenient."},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["明かり", "あかり", "light"], ["が", null, "subject", "p"], ["ついていて", null, "is on"], ["安心", "あんしん", "relief"], ["する", null, "do"], ["ね", null, "doesn't it", "p"], ["！", null, null, "x"], ["入ってみよう", "はいってみよう", "let's try entering"], ["。", null, null, "x"]], "en": "Wow, seeing the lights on gives such peace of mind! Let's go inside."},
        {"who": "店員", "t": [["いらっしゃいませ", null, "welcome"], ["！", null, null, "x"], ["深夜", "しんや", "late night"], ["の", null, "of", "p"], ["お買い物", "おかいもの", "shopping"], ["、", null, null, "x"], ["お疲れ様", "おつかれさま", "thank you for hard work"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Welcome! Thank you for stopping by so late at night!"},
        {"who": "サム", "t": [["あのう", null, "excuse me"], ["、", null, null, "x"], ["喉", "のど", "throat"], ["が", null, "subject", "p"], ["痛くて", "いたくて", "hurts and"], ["寒気がする", "さむけがする", "feel chills"], ["んですが", null, "explanatory-polite"], ["、", null, null, "x"], ["おすすめ", null, "recommendation"], ["は", null, "topic", "p"], ["あります", null, "exists"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Excuse me, my throat hurts and I have chills; do you have any recommendations?"},
        {"who": "店員", "t": [["それなら", null, "in that case"], ["、", null, null, "x"], ["生姜湯", "しょうがゆ", "hot ginger tea"], ["と", null, "and", "p"], ["レモン", null, "lemon"], ["の", null, "of", "p"], ["ホットドリンク", null, "hot drink"], ["が", null, "subject", "p"], ["一番", "いちばん", "number one"], ["ですよ", null, "is, you know", "p"], ["。", null, null, "x"]], "en": "In that case, hot ginger drink and hot lemon drink are the absolute best."},
        {"who": "ゆき", "t": [["おでん", null, "oden"], ["も", null, "also", "p"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["大根", "だいこん", "daikon"], ["と", null, "and", "p"], ["たまご", null, "egg"], ["を", null, "object", "p"], ["食べると", "たべると", "when eat"], ["、", null, null, "x"], ["体", "からだ", "body"], ["の", null, "of", "p"], ["芯", "しん", "core"], ["から", null, "from", "p"], ["温まる", "あたたまる", "warms up"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "There's oden too! If you eat daikon and egg, you warm up from your core."},
        {"who": "サム", "t": [["湯気", "ゆげ", "steam"], ["が", null, "subject", "p"], ["立っていて", "たっていて", "rising"], ["、", null, null, "x"], ["すごく", null, "very"], ["美味しそう", "おいしそう", "looks delicious"], ["だ", null, "is"], ["！", null, null, "x"], ["おでん", null, "oden"], ["も", null, "also", "p"], ["買おう", "かおう", "let's buy"], ["。", null, null, "x"]], "en": "Steam is rising, it looks so delicious! Let's buy oden too."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ビタミン", null, "vitamin"], ["C", null, "C"], ["入り", "いり", "containing"], ["の", null, "of", "p"], ["ゼリー", null, "jelly drink"], ["も", null, "also", "p"], ["見つけました", "みつけました", "found"], ["！", null, null, "x"]], "en": "Beep! I also found jelly drinks containing Vitamin C!"},
        {"who": "店員", "t": [["風邪", "かぜ", "cold"], ["の", null, "of", "p"], ["初期", "しょき", "early stage"], ["には", null, "for", "p"], ["、", null, null, "x"], ["水分", "すいぶん", "hydration"], ["補給", "ほきゅう", "replenishment"], ["が", null, "subject", "p"], ["何より", "なにより", "above all"], ["大切", "たいせつ", "important"], ["ですから", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "In the early stages of a cold, staying hydrated is more important than anything, after all."},
        {"who": "サム", "t": [["店員", "てんいん", "clerk"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["親切", "しんせつ", "kind"], ["に", null, "adverbial", "p"], ["教えて", "おしえて", "teach"], ["くれて", null, "gave favor"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Thank you so much for explaining so kindly, shopkeeper!"},
        {"who": "店員", "t": [["旅先", "たびさき", "travel destination"], ["で", null, "at", "p"], ["体調", "たいちょう", "physical condition"], ["を", null, "object", "p"], ["崩す", "くずす", "break down"], ["と", null, "if/when", "p"], ["、", null, null, "x"], ["心細い", "こころぼそい", "helpless/lonely"], ["ものですから", null, "because naturally"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Because when you fall ill on a trip, it naturally feels so lonely."},
        {"who": "ゆき", "t": [["冷えピタ", "ひえピタ", "cooling gel sheet"], ["シート", null, "sheet"], ["も", null, "also", "p"], ["おでこ", null, "forehead"], ["に", null, "on", "p"], ["貼って", "はって", "stick"], ["おけば", null, "if stick in advance"], ["、", null, null, "x"], ["熱", "ねつ", "fever"], ["が", null, "subject", "p"], ["下がりやすい", "さがりやすい", "easy to drop"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If you put a cooling gel pad on your forehead in advance, your fever will come down more easily."},
        {"who": "サム", "t": [["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["ケア", null, "care"], ["グッズ", null, "goods"], ["は", null, "topic", "p"], ["種類", "しゅるい", "variety"], ["が", null, "subject", "p"], ["豊富", "ほうふ", "abundant"], ["なんだ", null, "explanatory"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "Japanese wellness goods have such an abundant variety, don't they!"},
        {"who": "店員", "t": [["お会計", "おかいけい", "bill/checkout"], ["は", null, "topic", "p"], ["千二百", "せんにひゃく", "1200"], ["円", "えん", "yen"], ["に", null, "to", "p"], ["なります", null, "becomes"], ["。", null, null, "x"], ["温かい", "あたたかい", "warm"], ["もの", null, "things"], ["と", null, "and", "p"], ["冷たい", "つめたい", "cold"], ["もの", null, "things"], ["、", null, null, "x"], ["袋", "ふくろ", "bag"], ["を", null, "object", "p"], ["お分け", "おわけ", "divide"], ["いたしましょう", null, "shall do (humble)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Your total is 1,200 yen. Shall I separate the hot and cold items into different bags?"},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["一緒", "いっしょ", "together"], ["で", null, "with", "p"], ["大丈夫", "だいじょうぶ", "all right"], ["です", null, "is"], ["！", null, null, "x"], ["すぐ", null, "right away"], ["宿", "やど", "inn"], ["へ", null, "to", "p"], ["戻ります", "もどります", "will return"], ["から", null, "because", "p"], ["。", null, null, "x"]], "en": "Ah, together is fine! Because we're heading right back to our lodge."},
        {"who": "店員", "t": [["かしこまりました", null, "certainly"], ["。", null, null, "x"], ["どうぞ", null, "please"], ["お大事に", "おだいじに", "take care of yourself"], ["なさって", null, "do (honorific)"], ["ください", null, "please"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Certainly. Please take very good care of yourself."},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Thank you very much!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["外", "そと", "outside"], ["の", null, "of", "p"], ["風", "かぜ", "wind"], ["は", null, "topic", "p"], ["相変わらず", "あいかわらず", "as always"], ["冷たい", "つめたい", "cold"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The outside wind is cold as ever!"},
        {"who": "ゆき", "t": [["急いで", "いそいで", "hurrying"], ["部屋", "へや", "room"], ["に", null, "to", "p"], ["帰って", "かえって", "return"], ["、", null, null, "x"], ["生姜湯", "しょうがゆ", "ginger tea"], ["を", null, "object", "p"], ["飲もう", "のもう", "let's drink"], ["！", null, null, "x"]], "en": "Let's hurry back to the room and drink the ginger tea!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["宿", "やど", "inn"], ["に", null, "at", "p"], ["着いた", "ついた", "arrived"], ["とたん", null, "as soon as"], ["、", null, null, "x"], ["ホッとした", null, "felt relieved"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah, as soon as we got back to the inn, I felt a wave of relief."},
        {"who": "ゆき", "t": [["温かい", "あたたかい", "warm"], ["おでん", null, "oden"], ["を", null, "object", "p"], ["一口", "ひとくち", "one bite"], ["食べてみて", "たべてみて", "try eating"], ["。", null, null, "x"]], "en": "Try taking a bite of the warm oden."},
        {"who": "サム", "t": [["ふうふう", null, "blowing hot food"], ["……", null, null, "x"], ["あ", null, "ah"], ["、", null, null, "x"], ["出汁", "だし", "dashi broth"], ["が", null, "subject", "p"], ["染みていて", "しみていて", "soaked in"], ["、", null, null, "x"], ["すごく", null, "very"], ["美味しい", "おいしい", "delicious"], ["！", null, null, "x"], ["生き返る", "いきかえる", "revive"], ["ようだ", null, "feels like"], ["！", null, null, "x"]], "en": "Blow blow... Ah, the dashi is soaked right through, it's so delicious! I feel like I'm coming back to life!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["生姜湯", "しょうがゆ", "ginger tea"], ["も", null, "also", "p"], ["適温", "てきおん", "suitable temp"], ["に", null, "to", "p"], ["なりました", null, "became"], ["！", null, null, "x"]], "en": "Beep! The ginger tea reached the perfect temperature too!"},
        {"who": "サム", "t": [["喉", "のど", "throat"], ["が", null, "subject", "p"], ["すっきり", null, "refreshed"], ["して", null, "did"], ["、", null, null, "x"], ["体", "からだ", "body"], ["が", null, "subject", "p"], ["ぽかぽか", null, "warm and toasty"], ["してきた", null, "started to become"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "My throat feels soothed and my whole body started feeling warm and toasty."},
        {"who": "ゆき", "t": [["これで", null, "with this"], ["朝", "あさ", "morning"], ["まで", null, "until", "p"], ["ぐっすり", null, "soundly"], ["眠れそう", "ねむれそう", "looks able to sleep"], ["だね", null, "doesn't it", "p"], ["。", null, null, "x"]], "en": "Now it looks like you'll be able to sleep soundly until morning."},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["も", null, "also", "p"], ["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["、", null, null, "x"], ["付き合って", "つきあって", "keeping company"], ["くれて", null, "gave favor"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["！", null, null, "x"]], "en": "Yuki, Blip, thank you so much for accompanying me!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["おやすみなさい", null, "good night"], ["、", null, null, "x"], ["よい", null, "good"], ["夢", "ゆめ", "dreams"], ["を", null, "object", "p"], ["！", null, null, "x"]], "en": "Beep! Good night, sweet dreams!"}
    ],
    "grammar": [
        {
            "id": "n3-review-ba-yokatta",
            "title": "Regret: ～ばよかった (Should Have Done)",
            "explain": "V-ばよかった expresses regret about an action not taken in the past ('I should have...'). For negatives: ～なければよかった ('I shouldn't have...').",
            "examples": [
                {"t": [["もっと", null, "more"], ["早く", "はやく", "early"], ["寝ればよかった", "ねればよかった", "should have slept"], ["。", null, null, "x"]], "en": "I should have gone to bed earlier."}
            ],
            "quiz": [
                {"q": "傘を持って来れ＿＿＿＿。", "hint": "I should have brought an umbrella.", "choices": ["ばよかった", "ばいい", "たらいい"], "answer": 0, "why": "〜ばよかった expresses past regret."}
            ],
            "lesson": "grammar.html?level=N3#ba-yokatta"
        },
        {
            "id": "n3-review-gimi-ppoi",
            "title": "Tendencies: ～気味 & ～っぽい",
            "explain": "Noun/Stem + 気味 (ぎみ) indicates a slight unfavorable sensation (風邪気味, 疲れ気味). Noun/Stem + っぽい indicates a strong quality/trait (熱っぽい, 怒りっぽい).",
            "examples": [
                {"t": [["最近", "さいきん", "recently"], ["少し", "すこし", "a bit"], ["風邪気味", "かぜぎみ", "slight cold"], ["です", null, "is"], ["。", null, null, "x"]], "en": "I have a slight touch of a cold recently."}
            ],
            "quiz": [
                {"q": "今日は体が重くて、少し熱＿＿＿です。", "hint": "My body is heavy today, and I feel slightly feverish.", "choices": ["っぽい", "気味", "そう"], "answer": 0, "why": "熱っぽい describes feeling feverish."}
            ],
            "lesson": "grammar.html?level=N3#gimi"
        }
    ],
    "kanji": [
        {"k": "差", "on": ["サ"], "kun": ["さ.す"], "m": "distinction, difference", "ex": [["時差", "じさ", "time difference"]]},
        {"k": "疲", "on": ["ヒ"], "kun": ["つか.れる"], "m": "exhausted, tired", "ex": [["疲れる", "つかれる", "to get tired"]]},
        {"k": "冴", "on": ["コ"], "kun": ["さ.える"], "m": "be clear, lucid", "ex": [["冴える", "さえる", "to be clear/wide awake"]]},
        {"k": "姜", "on": ["キョウ"], "kun": ["しょうが"], "m": "ginger", "ex": [["生姜湯", "しょうがゆ", "hot ginger drink"]]},
        {"k": "補", "on": ["ホ"], "kun": ["おぎな.う"], "m": "supplement, supply", "ex": [["補給", "ほきゅう", "supply/replenishment"]]},
        {"k": "富", "on": ["フ", "フウ"], "kun": ["と.む"], "m": "wealth, abundant", "ex": [["豊富", "ほうふ", "abundant"]]}
    ],
    "build": [0, 4, 11],
    "questions": [
        {
            "q": "サムさんはなぜ夜中に目が冴えていましたか。",
            "en": "Why was Sam wide awake in the middle of the night?",
            "choices": ["時差ボケで昼夜のリズムが合わないから", "コーヒーを飲みすぎたから", "部屋がうるさかったから"],
            "answer": 0
        },
        {
            "q": "コンビニの店員さんは何を勧めましたか。",
            "en": "What did the convenience store clerk recommend?",
            "choices": ["生姜湯とレモンのホットドリンク", "冷たいアイスクリーム", "辛い激辛ラーメン"],
            "answer": 0
        }
    ],
    "talk": "Describe what you usually do when you suffer from jetlag or catch a cold while traveling in Japanese."
}

# =========================================================================
# STORY 2: n3-14 (34 lines) — シェアハウス防災：台風接近
# Reviews: ～によると, ～ざるを得ない, ～しかない, ～さえ, ～にとって
# =========================================================================
story_n3_14 = {
    "id": "n3-14",
    "level": "N3",
    "unit": 14,
    "title": {
        "ja": "シェアハウス防災：台風接近",
        "en": "Typhoon Alert: Sharehouse Disaster Prep (Unit 2 Review)"
    },
    "scene": "Nakano sharehouse common lounge. News reports a massive typhoon approaching Tokyo, prompting residents to cooperate on emergency preparations.",
    "lines": [
        {"who": "ニュース", "t": [["気象庁", "きしょうちょう", "Meteorological Agency"], ["の", null, "of", "p"], ["発表", "はっぴょう", "announcement"], ["に", null, "according to", "p"], ["よると", null, "according to"], ["、", null, null, "x"], ["大型", "おおがた", "large-scale"], ["の", null, "of", "p"], ["台風", "たいふう", "typhoon"], ["が", null, "subject", "p"], ["今夜", "こんや", "tonight"], ["関東", "かんとう", "Kanto"], ["を", null, "through", "p"], ["直撃", "ちょくげき", "direct hit"], ["する", null, "do"], ["見込み", "みこみ", "prospect"], ["です", null, "is"], ["。", null, null, "x"]], "en": "According to the Meteorological Agency, a large typhoon is projected to hit Kanto directly tonight."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["ニュース", null, "news"], ["見た", "みた", "saw"], ["？", null, null, "x"], ["今夜", "こんや", "tonight"], ["の", null, "of", "p"], ["イベント", null, "event"], ["は", null, "topic", "p"], ["中止", "ちゅうし", "cancellation"], ["せざるを得ない", "せざるをえない", "cannot help but cancel"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Sam, did you see the news? We have no choice but to cancel tonight's event."},
        {"who": "サム", "t": [["残念", "ざんねん", "disappointing"], ["だけど", null, "though", "p"], ["、", null, null, "x"], ["安全", "あんぜん", "safety"], ["の", null, "of", "p"], ["ため", null, "sake"], ["には", null, "for", "p"], ["外出", "がいしゅつ", "going out"], ["を", null, "object", "p"], ["控える", "ひかえる", "refrain"], ["しかない", null, "no choice but to"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "It's disappointing, but for safety's sake, we have no choice but to refrain from going out."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["風速", "ふうそく", "wind speed"], ["四十", "よんじゅう", "40"], ["メートル", null, "meters"], ["の", null, "of", "p"], ["暴風", "ぼうふう", "violent storm wind"], ["が", null, "subject", "p"], ["吹く", "ふく", "blow"], ["恐れ", "おそれ", "fear/danger"], ["が", null, "subject", "p"], ["あります", null, "exists"], ["！", null, null, "x"]], "en": "Beep! There is danger of violent storm winds blowing at 40 meters per second!"},
        {"who": "住人", "t": [["みんな", null, "everyone"], ["、", null, null, "x"], ["ベランダ", null, "balcony"], ["の", null, "of", "p"], ["物干し竿", "ものほしざお", "laundry pole"], ["や", null, "and", "p"], ["植木鉢", "うえきばち", "flowerpot"], ["を", null, "object", "p"], ["部屋", "へや", "room"], ["に", null, "into", "p"], ["入れよう", "いれよう", "let's put in"], ["！", null, null, "x"]], "en": "Everyone, let's bring the laundry poles and potted plants from the balcony into the rooms!"},
        {"who": "サム", "t": [["僕", "ぼく", "I"], ["も", null, "also", "p"], ["手伝います", "てつだいます", "will help"], ["！", null, null, "x"], ["強風", "きょうふう", "strong wind"], ["で", null, "by", "p"], ["物が", "ものが", "things"], ["飛んだら", "とんだら", "if fly"], ["危ない", "あぶない", "dangerous"], ["ですから", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "I'll help too! Because if things blow away in strong winds, it's dangerous."},
        {"who": "ゆき", "t": [["窓ガラス", "まどがらす", "window glass"], ["に", null, "on", "p"], ["養生", "ようじょう", "protective"], ["テープ", null, "tape"], ["を", null, "object", "p"], ["貼って", "はって", "stick"], ["おこう", "おこう", "let's do in advance"], ["。", null, null, "x"], ["万が一", "まんがいち", "in the unlikely event"], ["割れても", "われても", "even if shatters"], ["破片", "はへん", "fragments"], ["が", null, "subject", "p"], ["飛び散らない", "とびちらない", "not scatter"], ["ように", null, "so that"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Let's tape the window glass with protective tape in advance. So that even if it shatters, shards won't scatter."},
        {"who": "サム", "t": [["テープ", null, "tape"], ["を", null, "object", "p"], ["米印", "こめじるし", "asterisk sign"], ["の", null, "of", "p"], ["形", "かたち", "shape"], ["に", null, "into", "p"], ["貼る", "はる", "stick"], ["ん", null, "explanatory"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "We paste the tape in an asterisk shape, right!"},
        {"who": "住人", "t": [["サム", null, "Sam"], ["くん", null, "suffix", "p"], ["、", null, null, "x"], ["よく", null, "well"], ["知っている", "しっている", "know"], ["ね", null, "don't you", "p"], ["！", null, null, "x"], ["停電", "ていでん", "blackout"], ["に", null, "for", "p"], ["備えて", "そなえて", "prepare"], ["懐中電灯", "かいちゅうでんとう", "flashlight"], ["も", null, "also", "p"], ["確認", "かくにん", "confirm"], ["しよう", "しよう", "let's do"], ["。", null, null, "x"]], "en": "Sam, you know this so well! Let's check flashlights too in preparation for power outages."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["バッテリー", null, "battery"], ["の", null, "of", "p"], ["残量", "ざんりょう", "remaining level"], ["を", null, "object", "p"], ["チェック", null, "check"], ["しました", null, "did"], ["！", null, null, "x"], ["満タン", "まんたん", "full charge"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Checked battery charge levels! They are at 100%!"},
        {"who": "ゆき", "t": [["お風呂", "おふろ", "bathtub"], ["に", null, "into", "p"], ["水", "みず", "water"], ["を", null, "object", "p"], ["溜めて", "ためて", "fill/store"], ["おこう", "おこう", "let's do in advance"], ["。", null, null, "x"], ["断水", "だんすい", "water outage"], ["した", null, "did"], ["時", "とき", "time"], ["、", null, null, "x"], ["トイレ", null, "toilet"], ["の", null, "of", "p"], ["水", "みず", "water"], ["に", null, "for", "p"], ["使える", "つかえる", "can use"], ["から", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Let's fill the bathtub with water in advance. When water cuts off, we can use it for toilet water."},
        {"who": "サム", "t": [["なるほど", null, "I see"], ["！", null, null, "x"], ["水", "みず", "water"], ["さえ", null, "even / as long as"], ["あれば", null, "if there is"], ["、", null, null, "x"], ["数日", "すうじつ", "several days"], ["は", null, "topic", "p"], ["耐えられる", "たえられる", "can endure"], ["わけだ", null, "that's why"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "I see! As long as we have water, we can endure for several days, that's why."},
        {"who": "住人", "t": [["非常食", "ひじょうしょく", "emergency food"], ["の", null, "of", "p"], ["乾パン", "かんぱん", "hard biscuits"], ["や", null, "and", "p"], ["レトルト", null, "retort pouch"], ["食品", "しょくひん", "food"], ["も", null, "also", "p"], ["リビング", null, "living room"], ["に", null, "in", "p"], ["集めました", "あつめました", "gathered"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I also gathered emergency hard biscuits and packaged meals in the living room."},
        {"who": "サム", "t": [["僕", "ぼく", "I"], ["の", null, "of", "p"], ["非常用", "ひじょうよう", "emergency"], ["ラジオ", null, "radio"], ["も", null, "also", "p"], ["持ってきました", "もってきました", "brought"], ["！", null, null, "x"], ["手回し", "てまわし", "hand-crank"], ["で", null, "by", "p"], ["発電", "はつでん", "power generation"], ["できる", null, "can do"], ["んです", null, "explanatory"], ["。", null, null, "x"]], "en": "I brought my emergency radio too! It can generate power by hand-cranking."},
        {"who": "ゆき", "t": [["すごい", null, "amazing"], ["！", null, null, "x"], ["スマホ", null, "smartphone"], ["の", null, "of", "p"], ["電波", "でんぱ", "cell signal"], ["が", null, "subject", "p"], ["途切れても", "とぎれても", "even if cut"], ["、", null, null, "x"], ["情報", "じょうほう", "information"], ["が", null, "subject", "p"], ["入る", "はいる", "comes in"], ["ね", null, "doesn't it", "p"], ["！", null, null, "x"]], "en": "Awesome! Even if phone signals drop, information can still reach us!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["雨音", "あまおと", "rain sound"], ["が", null, "subject", "p"], ["だんだん", null, "gradually"], ["激しく", "はげしく", "fiercely"], ["なってきました", null, "has become"], ["！", null, null, "x"]], "en": "Beep! The sound of rain has gradually become fierce!"},
        {"who": "住人", "t": [["川", "かわ", "river"], ["の", null, "of", "p"], ["水位", "すいい", "water level"], ["が", null, "subject", "p"], ["上がっている", "あがっている", "rising"], ["みたい", null, "seems like"], ["だから", null, "because", "p"], ["、", null, null, "x"], ["ハザード", null, "hazard"], ["マップ", null, "map"], ["を", null, "object", "p"], ["確認", "かくにん", "confirm"], ["しよう", "しよう", "let's do"], ["。", null, null, "x"]], "en": "It looks like river water levels are rising, so let's check the hazard map."},
        {"who": "サム", "t": [["この", null, "this"], ["地域", "ちいき", "area"], ["の", null, "of", "p"], ["避難所", "ひなんじょ", "evacuation shelter"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["近く", "ちかく", "nearby"], ["の", null, "of", "p"], ["小学校", "しょうがっこう", "elementary school"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "The evacuation shelter for this area is the nearby elementary school, right."},
        {"who": "ゆき", "t": [["そうだよ", null, "that's right"], ["。", null, null, "x"], ["避難", "ひなん", "evacuation"], ["勧告", "かんこく", "advisory"], ["が", null, "subject", "p"], ["出たら", "でたら", "if issued"], ["、", null, null, "x"], ["明るい", "あかるい", "bright"], ["うちに", null, "while"], ["移動", "いどう", "move"], ["した", null, "did"], ["ほう", null, "better"], ["が", null, "subject", "p"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That's right. If an evacuation advisory is issued, it's better to move while it's still daylight."},
        {"who": "サム", "t": [["暗く", "くらく", "dark"], ["なってからの", null, "after becoming"], ["避難", "ひなん", "evacuation"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["危険", "きけん", "danger"], ["が", null, "subject", "p"], ["多すぎる", "おおすぎる", "too many"], ["から", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Because evacuating after it gets dark has far too many dangers."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["一瞬", "いっしゅん", "one instant"], ["、", null, null, "x"], ["照明", "しょうめい", "lights"], ["が", null, "subject", "p"], ["消えかけました", "きえかけました", "almost went out"], ["！", null, null, "x"]], "en": "Beep! For an instant, the lights almost went out!"},
        {"who": "住人", "t": [["近く", "ちかく", "nearby"], ["に", null, "in", "p"], ["雷", "かみなり", "lightning"], ["が", null, "subject", "p"], ["落ちた", "おちた", "struck"], ["のかもしれない", null, "might have"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Lightning might have struck nearby."},
        {"who": "サム", "t": [["みんな", null, "everyone"], ["で", null, "together", "p"], ["こうして", null, "like this"], ["協力", "きょうりょく", "cooperation"], ["して", null, "do"], ["準備", "じゅんび", "preparation"], ["できる", null, "can do"], ["の", null, "nominalizer"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["心強い", "こころづよい", "reassuring"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Being able to prepare cooperatively like this together is truly reassuring."},
        {"who": "ゆき", "t": [["一人暮らし", "ひとりぐらし", "living alone"], ["だと", null, "if it were"], ["不安", "ふあん", "anxiety"], ["だけど", null, "though", "p"], ["、", null, null, "x"], ["シェアハウス", null, "sharehouse"], ["の", null, "of", "p"], ["仲間", "なかま", "friends"], ["が", null, "subject", "p"], ["いる", null, "exists"], ["から", null, "because", "p"], ["心強い", "こころづよい", "reassuring"], ["よね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Living alone would make you anxious, but having sharehouse peers is so reassuring."},
        {"who": "住人", "t": [["温かい", "あたたかい", "warm"], ["スープ", null, "soup"], ["でも", null, "or something", "p"], ["作って", "つくって", "make"], ["、", null, null, "x"], ["台風", "たいふう", "typhoon"], ["が", null, "subject", "p"], ["過ぎ去る", "すぎさる", "pass by"], ["の", null, "nominalizer"], ["を", null, "object", "p"], ["待とう", "まとう", "let's wait"], ["！", null, null, "x"]], "en": "Let's make some warm soup and wait for the typhoon to pass by!"},
        {"who": "サム", "t": [["賛成", "さんせい", "agree"], ["です", null, "polite"], ["！", null, null, "x"], ["僕", "ぼく", "I"], ["、", null, null, "x"], ["野菜", "やさい", "vegetables"], ["を", null, "object", "p"], ["切る", "きる", "cut"], ["の", null, "nominalizer"], ["を", null, "object", "p"], ["手伝います", "てつだいます", "will help"], ["！", null, null, "x"]], "en": "Agreed! I'll help cut the vegetables!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["は", null, "topic", "p"], ["タイマー", null, "timer"], ["を", null, "object", "p"], ["セット", null, "set"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! Blip will set the timer!"},
        {"who": "ゆき", "t": [["外", "そと", "outside"], ["は", null, "topic", "p"], ["嵐", "あらし", "storm"], ["だけど", null, "though", "p"], ["、", null, null, "x"], ["リビング", null, "living room"], ["は", null, "topic", "p"], ["温かい", "あたたかい", "warm"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "It's a storm outside, but the living room is so warm."},
        {"who": "サム", "t": [["防災", "ぼうさい", "disaster prevention"], ["の", null, "of", "p"], ["知識", "ちしき", "knowledge"], ["を", null, "object", "p"], ["たくさん", null, "a lot"], ["学べました", "まなべました", "could learn"], ["。", null, null, "x"]], "en": "I was able to learn a great deal of disaster preparedness knowledge."},
        {"who": "住人", "t": [["日本", "にほん", "Japan"], ["に", null, "in", "p"], ["住む", "すむ", "live"], ["上", "うえ", "in the course of"], ["で", null, "particle", "p"], ["、", null, null, "x"], ["台風", "たいふう", "typhoon"], ["や", null, "and", "p"], ["地震", "じしん", "earthquake"], ["への", null, "towards", "p"], ["備え", "そなえ", "preparation"], ["は", null, "topic", "p"], ["欠かせない", "かかせない", "indispensable"], ["から", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Because living in Japan, preparing for typhoons and earthquakes is truly indispensable."},
        {"who": "サム", "t": [["自分", "じぶん", "oneself"], ["の", null, "of", "p"], ["身", "み", "body/self"], ["を", null, "object", "p"], ["守る", "まもる", "protect"], ["ため", null, "for"], ["に", null, "for", "p"], ["、", null, null, "x"], ["いつも", null, "always"], ["意識", "いしき", "consciousness"], ["して", null, "do"], ["おきます", null, "will do in advance"], ["！", null, null, "x"]], "en": "In order to protect myself, I will always remain conscious of preparedness in advance!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["台風", "たいふう", "typhoon"], ["の", null, "of", "p"], ["中心", "ちゅうしん", "center"], ["、", null, null, "x"], ["まもなく", null, "soon"], ["通過", "つうか", "passage"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! The eye of the typhoon will pass over shortly!"},
        {"who": "ゆき", "t": [["もう少し", "もうすこし", "a bit more"], ["の", null, "of", "p"], ["辛抱", "しんぼう", "patience"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["みんな", null, "everyone"], ["で", null, "together", "p"], ["乗り切ろう", "のりきろう", "let's overcome"], ["！", null, null, "x"]], "en": "Just a little more patience! Let's get through this together!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["みんな", null, "everyone"], ["で", null, "together", "p"], ["力を", "ちからを", "strength"], ["合わせて", "あわせて", "combine"], ["乗り越えましょう", "のりこえましょう", "let's overcome together"], ["！", null, null, "x"]], "en": "Yes! Let's join forces and overcome it together!"}
    ],
    "grammar": [
        {
            "id": "n3-review-ni-yoruto",
            "title": "Information Sources: ～によると & ～によれば",
            "explain": "Noun + によると introduces an external source of information ('according to...'), ending typically in そうだ, ということだ, or 見込みだ.",
            "examples": [
                {"t": [["ニュース", null, "news"], ["に", null, "according to", "p"], ["よると", null, "according to"], ["、", null, null, "x"], ["明日", "あした", "tomorrow"], ["は", null, "topic", "p"], ["雨", "あめ", "rain"], ["だ", null, "is"], ["そう", null, "hearsay"], ["です", null, "is"], ["。", null, null, "x"]], "en": "According to the news, I hear it will rain tomorrow."}
            ],
            "quiz": [
                {"q": "天気予報＿＿＿＿、今夜は雪が降るらしい。", "hint": "According to the weather forecast, it seems it will snow tonight.", "choices": ["によると", "にとって", "につれて"], "answer": 0, "why": "によると indicates the quoted information source."}
            ],
            "lesson": "grammar.html?level=N3#ni-yoruto"
        },
        {
            "id": "n3-review-zaru-wo-enai",
            "title": "Unavoidable Action: ～ざるを得ない & ～しかない",
            "explain": "V-ない stem + ざるを得ない indicates having no choice but to do something against one's desire. V-る + しかない indicates having no other option.",
            "examples": [
                {"t": [["イベント", null, "event"], ["を", null, "object", "p"], ["中止", "ちゅうし", "cancellation"], ["せざるを得ない", "せざるをえない", "cannot help but cancel"], ["。", null, null, "x"]], "en": "We have no choice but to cancel the event."}
            ],
            "quiz": [
                {"q": "電車が止まったので、歩いて帰る＿＿＿＿。", "hint": "Since the train stopped, I had no choice but to walk home.", "choices": ["しかない", "ばかりだ", "わけがない"], "answer": 0, "why": "〜しかない indicates lack of alternatives."}
            ],
            "lesson": "grammar.html?level=N3#zaru-wo-enai"
        }
    ],
    "kanji": [
        {"k": "直", "on": ["チョク", "ジキ"], "kun": ["ただ.ちに", "なお.す"], "m": "direct, repair", "ex": [["直撃", "ちょくげき", "direct hit"]]},
        {"k": "撃", "on": ["ゲキ"], "kun": ["う.つ"], "m": "strike, hit", "ex": [["直撃", "ちょくげき", "direct hit"]]},
        {"k": "断", "on": ["ダン"], "kun": ["た.つ", "ことわ.る"], "m": "sever, cut off", "ex": [["断水", "だんすい", "water outage"]]},
        {"k": "耐", "on": ["タイ"], "kun": ["た.える"], "m": "endure, withstand", "ex": [["耐える", "たえる", "to withstand"]]},
        {"k": "勧", "on": ["カン"], "kun": ["すす.める"], "m": "advise, recommend", "ex": [["勧告", "かんこく", "advisory/recommendation"]]},
        {"k": "告", "on": ["コク"], "kun": ["つ.げる"], "m": "tell, notify", "ex": [["報告", "ほうこく", "report"], ["勧告", "かんこく", "advisory"]]}
    ],
    "build": [0, 1, 11],
    "questions": [
        {
            "q": "なぜ夜のイベントは中止せざるを得ませんでしたか。",
            "en": "Why did they have no choice but to cancel the night event?",
            "choices": ["大型台風が直撃する見込みだから", "チケットが売れなかったから", "主催者が病気になったから"],
            "answer": 0
        },
        {
            "q": "お風呂に水を溜めておいたのはなぜですか。",
            "en": "Why did they store water in the bathtub in advance?",
            "choices": ["断水した時にトイレなどの生活用水に使えるから", "お湯を沸かすため", "洗濯をするため"],
            "answer": 0
        }
    ],
    "talk": "Describe how people prepare for natural disasters such as storms or earthquakes in your home country in Japanese."
}

# =========================================================================
# STORY 3: n3-15 (34 lines) — 秋葉原ラジオセンターの職人たち
# Reviews: ～について, ～わけがない, ～ついでに, ～によると, V-るしかない
# =========================================================================
story_n3_15 = {
    "id": "n3-15",
    "level": "N3",
    "unit": 15,
    "title": {
        "ja": "秋葉原ラジオセンターの職人たち",
        "en": "The Craftsmen of Akihabara (Unit 3 Review)"
    },
    "scene": "Beneath the JR Chuo Line tracks at Akihabara Radio Center. Sam seeks out a veteran craftsman to diagnose an antique radio inductor coil.",
    "lines": [
        {"who": "サム", "t": [["この", null, "this"], ["高架下", "こうかした", "under elevated tracks"], ["の", null, "of", "p"], ["通路", "つうろ", "passageway"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["電子", "でんし", "electronic"], ["部品", "ぶひん", "parts"], ["が", null, "subject", "p"], ["ぎっしり", null, "tightly packed"], ["並んで", "ならんで", "lined up"], ["いて", null, "is"], ["すごい", null, "amazing"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "This walkway under the elevated tracks is amazing with electronic components tightly packed all over!"},
        {"who": "ゆき", "t": [["戦後", "せんご", "postwar"], ["の", null, "of", "p"], ["闇市", "やみいち", "black market"], ["の", null, "of", "p"], ["時代", "じだい", "era"], ["から", null, "from", "p"], ["続く", "つづく", "continuing"], ["老舗", "しにせ", "historic shop"], ["ばかり", null, "only"], ["なんだよ", null, "is, you know", "p"], ["。", null, null, "x"]], "en": "These are all historic shops that have been continuing since the postwar era."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["磁気", "じき", "magnetic"], ["センサー", null, "sensor"], ["が", null, "subject", "p"], ["激しく", "はげしく", "vigorously"], ["反応", "はんのう", "reaction"], ["しています", null, "is doing"], ["！", null, null, "x"]], "en": "Beep! My magnetic sensor is reacting vigorously!"},
        {"who": "職人", "t": [["いらっしゃい", null, "welcome"], ["。", null, null, "x"], ["若い", "わかい", "young"], ["人", "ひと", "people"], ["が", null, "subject", "p"], ["珍しい", "めずらしい", "unusual"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"], ["何か", "なにか", "something"], ["探し", "さがし", "looking for"], ["かい", null, "question (informal)", "p"], ["？", null, null, "x"]], "en": "Welcome. It's unusual to see young folks. Looking for something?"},
        {"who": "サム", "t": [["初めまして", "はじめまして", "nice to meet you"], ["！", null, null, "x"], ["この", null, "this"], ["昭和", "しょうわ", "Showa"], ["三十年代", "さんじゅうねんだい", "30s (1955-65)"], ["の", null, "of", "p"], ["ラジオ", null, "radio"], ["コイル", null, "coil"], ["について", null, "regarding", "p"], ["教えて", "おしえて", "teach"], ["いただきたい", null, "would like to receive"], ["んです", null, "explanatory"], ["。", null, null, "x"]], "en": "Nice to meet you! I would like to ask you about this radio coil from the 1960s."},
        {"who": "職人", "t": [["ほう", null, "oho"], ["、", null, null, "x"], ["見せて", "みせて", "show me"], ["ごらん", null, "try"], ["……", null, null, "x"], ["これ", null, "this"], ["は", null, "topic", "p"], ["貴重", "きちょう", "precious"], ["な", null, "na-particle", "p"], ["手巻き", "てまき", "hand-wound"], ["の", null, "of", "p"], ["高周波", "こうしゅうは", "high frequency"], ["コイル", null, "coil"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Oho, let me see... This is a precious hand-wound high-frequency coil."},
        {"who": "ゆき", "t": [["さすが", null, "as expected"], ["職人", "しょくにん", "master craftsman"], ["さん", null, "polite suffix", "p"], ["！", null, null, "x"], ["一目", "ひとめ", "one glance"], ["見た", "みた", "looked"], ["だけで", null, "just by"], ["分かる", "わかる", "understand"], ["んですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "As expected of a master craftsman! You could tell in just a single glance!"},
        {"who": "職人", "t": [["五十年", "ごじゅうねん", "50 years"], ["も", null, "as much as", "p"], ["この", null, "this"], ["仕事", "しごと", "work"], ["を", null, "object", "p"], ["やっていて", null, "doing"], ["、", null, null, "x"], ["分からない", "わからない", "not understand"], ["わけがない", null, "there's no way"], ["だろう", null, "right?"], ["！", null, null, "x"]], "en": "Having done this job for fifty years, there's no way I wouldn't know!"},
        {"who": "サム", "t": [["断線", "だんせん", "broken wire"], ["している", null, "is doing"], ["みたい", null, "seems like"], ["で", null, "and", "p"], ["、", null, null, "x"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["出ない", "でない", "not come out"], ["んです", null, "explanatory"], ["。", null, null, "x"], ["直す", "なおす", "repair"], ["こと", null, "matter"], ["は", null, "topic", "p"], ["できます", null, "can do"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "It seems a wire is broken, and no sound comes out. Can it be repaired?"},
        {"who": "職人", "t": [["エナメル", null, "enamel"], ["線", "せん", "wire"], ["の", null, "of", "p"], ["端", "はし", "end"], ["が", null, "subject", "p"], ["切れている", "きれている", "cut/broken"], ["だけだ", null, "only that"], ["。", null, null, "x"], ["ちょっと", null, "a moment"], ["貸して", "かして", "lend"], ["みな", null, "try"], ["。", null, null, "x"]], "en": "The tip of the enameled wire is just snapped. Lend it to me for a second."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["職人", "しょくにん", "artisan"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["手", "て", "hands"], ["の", null, "of", "p"], ["動き", "うごき", "movement"], ["が", null, "subject", "p"], ["ものすごく", null, "extremely"], ["素早い", "すばやい", "nimble/fast"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The artisan's hand movements are extraordinarily nimble!"},
        {"who": "職人", "t": [["ほら", null, "look"], ["、", null, null, "x"], ["ハンダ", null, "solder"], ["で", null, "with", "p"], ["繋ぎ直した", "つなぎなおした", "reconnected"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["テスター", null, "multimeter"], ["で", null, "with", "p"], ["導通", "どうつう", "continuity"], ["を", null, "object", "p"], ["測って", "はかって", "measure"], ["ごらん", null, "try"], ["。", null, null, "x"]], "en": "See, I reconnected it with solder. Try checking continuity with the tester."},
        {"who": "サム", "t": [["ピッ", null, "beep"], ["！", null, null, "x"], ["抵抗値", "ていこうち", "resistance value"], ["が", null, "subject", "p"], ["正常", "せいじょう", "normal"], ["に", null, "adverbial", "p"], ["戻りました", "もどりました", "returned"], ["！", null, null, "x"], ["あっという間", "あっというま", "blink of eye"], ["でした", null, "was"], ["！", null, null, "x"]], "en": "Beep! The resistance value returned to normal! It was in the blink of an eye!"},
        {"who": "ゆき", "t": [["まさに", null, "truly"], ["神業", "かみわざ", "divine skill"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "That truly is miraculous skill!"},
        {"who": "職人", "t": [["ついでに", null, "while at it"], ["、", null, null, "x"], ["酸化", "さんか", "oxidation"], ["防止", "ぼうし", "prevention"], ["の", null, "of", "p"], ["ニス", null, "varnish"], ["も", null, "also", "p"], ["塗って", "ぬって", "apply"], ["おいた", null, "did in advance"], ["から", null, "because", "p"], ["、", null, null, "x"], ["あと", null, "another"], ["三十年", "さんじゅうねん", "30 years"], ["は", null, "topic", "p"], ["持つ", "もつ", "will last"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "While I was at it, I coated it with anti-oxidation varnish in advance, so it'll last another thirty years."},
        {"who": "サム", "t": [["お礼", "おれい", "gratitude/payment"], ["は", null, "topic", "p"], ["おいくら", null, "how much"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "How much do I owe you for the repair?"},
        {"who": "職人", "t": [["若い", "わかい", "young"], ["あんた", null, "you"], ["が", null, "subject", "p"], ["古い", "ふるい", "old"], ["ラジオ", null, "radio"], ["を", null, "object", "p"], ["大切", "たいせつ", "precious"], ["に", null, "adverbial", "p"], ["してくれる", null, "gives favor"], ["ん", null, "explanatory"], ["なら", null, "if (nara)"], ["、", null, null, "x"], ["代金", "だいきん", "fee"], ["なんて", null, "things like"], ["いらない", null, "don't need"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "If a young fellow like you is taking good care of an antique radio, I don't need any fee from you."},
        {"who": "サム", "t": [["そんな", null, "such a favor"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["いい", null, "good"], ["んですか", null, "is it really", "p"], ["！？", null, null, "x"], ["感謝", "かんしゃ", "gratitude"], ["の", null, "of", "p"], ["言葉", "ことば", "words"], ["も", null, "also", "p"], ["ありません", null, "have none"], ["！", null, null, "x"]], "en": "Is that really all right!? I don't even have words to express my gratitude!"},
        {"who": "職人", "t": [["その代わり", "そのかわり", "in return"], ["、", null, null, "x"], ["いい", null, "good"], ["音", "おと", "sound"], ["を", null, "object", "p"], ["鳴らして", "ならして", "play/sound"], ["やって", null, "do for it"], ["おくれ", null, "please"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "In return, make sure you let it play beautiful sound, okay?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["必ず", "かならず", "without fail"], ["綺麗", "きれい", "beautiful"], ["な", null, "na-particle", "p"], ["音", "おと", "sound"], ["を", null, "object", "p"], ["響かせます", "ひびかせます", "will make resonate"], ["！", null, null, "x"]], "en": "Yes! I will make it resonate with beautiful sound without fail!"},
        {"who": "ゆき", "t": [["職人", "しょくにん", "artisan"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["の", null, "of", "p"], ["歴史", "れきし", "history"], ["について", null, "regarding", "p"], ["少し", "すこし", "a little"], ["聞かせて", "きかせて", "let hear"], ["いただけます", null, "can receive favor"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Craftsman, could you tell us a bit about the history of Akihabara?"},
        {"who": "職人", "t": [["ああ", null, "ah"], ["、", null, null, "x"], ["戦後", "せんご", "postwar"], ["すぐ", null, "right after"], ["は", null, "topic", "p"], ["アメリカ", null, "America"], ["軍", "ぐん", "military"], ["の", null, "of", "p"], ["放出品", "ほうしゅつひん", "surplus goods"], ["の", null, "of", "p"], ["無線機", "むせんき", "radios"], ["を", null, "object", "p"], ["分解", "ぶんかい", "disassembly"], ["して", null, "do"], ["売っていた", "うっていた", "was selling"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "Ah, right after the war, folks disassembled surplus US military radios and sold the parts."},
        {"who": "サム", "t": [["廃品", "はいひん", "waste goods"], ["を", null, "object", "p"], ["再利用", "さいりよう", "reuse"], ["して", null, "do"], ["、", null, null, "x"], ["新しい", "あたらしい", "new"], ["機械", "きかい", "machines"], ["を", null, "object", "p"], ["作った", "つくった", "made"], ["わけですね", null, "that's why, right"], ["！", null, null, "x"]], "en": "So people reused scrap materials and built brand-new devices, that's why!"},
        {"who": "職人", "t": [["そうさ", null, "that's right"], ["。", null, null, "x"], ["物", "もの", "things"], ["が", null, "subject", "p"], ["ない", null, "lacking"], ["時代", "じだい", "era"], ["だったから", null, "because was", "p"], ["、", null, null, "x"], ["工夫", "くふう", "ingenuity"], ["する", null, "do"], ["しかなかった", null, "no choice but to"], ["んだ", null, "explanatory"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Exactly. Because it was an era with no supplies, we had no choice but to use ingenuity."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ものづくり", null, "making things"], ["の", null, "of", "p"], ["原点", "げんてん", "starting point"], ["を", null, "object", "p"], ["感じます", "かんじます", "feel"], ["！", null, null, "x"]], "en": "Beep! I can feel the very starting point of craftsmanship!"},
        {"who": "サム", "t": [["部品", "ぶひん", "parts"], ["の", null, "of", "p"], ["一つ一つ", "ひとつひとつ", "each and every"], ["に", null, "in", "p"], ["、", null, null, "x"], ["人", "ひと", "people"], ["の", null, "of", "p"], ["知恵", "ちえ", "wisdom"], ["が", null, "subject", "p"], ["詰まっている", "つまっている", "is packed"], ["ん", null, "explanatory"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "In each and every component, human wisdom is packed tight, isn't it."},
        {"who": "職人", "t": [["いい", null, "good"], ["こと", null, "thing"], ["を", null, "object", "p"], ["言う", "いう", "say"], ["ね", null, "don't you", "p"], ["。", null, null, "x"], ["お前", "おまえ", "you"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["ような", null, "like"], ["若者", "わかもの", "youth"], ["が", null, "subject", "p"], ["来てくれて", "きてくれて", "come for us"], ["、", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["嬉しい", "うれしい", "glad"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "You say good things. Having a young fellow like you visit makes me glad today."},
        {"who": "ゆき", "t": [["秋葉原", "あきはばら", "Akihabara"], ["に", null, "to", "p"], ["来て", "きて", "come"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["に", null, "adverbial", "p"], ["よかったね", null, "was great", "p"], ["、", null, null, "x"], ["サム", null, "Sam"], ["！", null, null, "x"]], "en": "Coming to Akihabara was truly wonderful, wasn't it, Sam!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["教科書", "きょうかしょ", "textbook"], ["では", null, "in", "p"], ["学べない", "まなべない", "cannot learn"], ["、", null, null, "x"], ["本物", "ほんもの", "real thing"], ["の", null, "of", "p"], ["歴史", "れきし", "history"], ["に", null, "to", "p"], ["触れられました", "ふれられました", "could touch"], ["！", null, null, "x"]], "en": "Yeah! I got to touch authentic history that you can't learn in textbooks!"},
        {"who": "職人", "t": [["また", null, "again"], ["いつでも", null, "anytime"], ["顔", "かお", "face"], ["を", null, "object", "p"], ["出しな", "でしな", "show/visit"], ["。", null, null, "x"], ["お茶", "おちゃ", "tea"], ["くらい", null, "at least"], ["淹れてやる", "いれてやる", "will brew for you"], ["から", null, "because", "p"], ["な", null, "tag", "p"], ["。", null, null, "x"]], "en": "Show your face around here again anytime. I'll at least brew you some tea."},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["必ず", "かならず", "without fail"], ["また", null, "again"], ["伺います", "うかがいます", "will visit (humble)"], ["！", null, null, "x"]], "en": "Yes! I will visit again without fail!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["の", null, "of", "p"], ["絆", "きずな", "bonds"], ["が", null, "subject", "p"], ["深まりました", "ふかまりました", "deepened"], ["！", null, null, "x"]], "en": "Beep! Bonds in Akihabara have deepened!"},
        {"who": "ゆき", "t": [["じゃあ", null, "well then"], ["、", null, null, "x"], ["宿", "やど", "inn"], ["に", null, "to", "p"], ["戻って", "もどって", "return"], ["、", null, null, "x"], ["ラジオ", null, "radio"], ["を", null, "object", "p"], ["組み立てよう", "くみたてよう", "let's assemble"], ["！", null, null, "x"]], "en": "Well then, let's head back to the lodge and assemble the radio!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["今夜", "こんや", "tonight"], ["の", null, "of", "p"], ["放送", "ほうそう", "broadcast"], ["を", null, "object", "p"], ["聞く", "きく", "listen"], ["の", null, "nominalizer"], ["が", null, "subject", "p"], ["待ちきれない", "まちきれない", "can't wait"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "All right, I can't wait to listen to tonight's broadcast!"}
    ],
    "grammar": [
        {
            "id": "n3-review-ni-tsuite",
            "title": "Topic Focus: ～について & ～に関して",
            "explain": "Noun + について indicates 'about / regarding X'. Noun + に関して (にかんして) is a more formal equivalent.",
            "examples": [
                {"t": [["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["歴史", "れきし", "history"], ["について", null, "about", "p"], ["調べました", "しらべました", "investigated"], ["。", null, null, "x"]], "en": "I looked into the history of Japan."}
            ],
            "quiz": [
                {"q": "この部品＿＿＿詳しく教えてください。", "hint": "Please tell me in detail about this component.", "choices": ["について", "にとって", "につれて"], "answer": 0, "why": "について marks the topic under inquiry."}
            ],
            "lesson": "grammar.html?level=N3#ni-tsuite"
        },
        {
            "id": "n3-review-wake-ga-nai",
            "title": "Strong Denial: ～わけがない (There is No Way)",
            "explain": "Plain form + わけがない expresses speaker's conviction that something is completely impossible ('there is no reason / no way that...').",
            "examples": [
                {"t": [["知っている", "しっている", "know"], ["わけがない", null, "no way that..."], ["。", null, null, "x"]], "en": "There is no way he knows."}
            ],
            "quiz": [
                {"q": "そんな難しい試験に一日で合格できる＿＿＿＿。", "hint": "There's no way one can pass such a hard test in one day.", "choices": ["わけがない", "わけだ", "はずだ"], "answer": 0, "why": "わけがない strongly negates feasibility."}
            ],
            "lesson": "grammar.html?level=N3#wake-ga-nai"
        }
    ],
    "kanji": [
        {"k": "職", "on": ["ショク"], "kun": [], "m": "employment, trade", "ex": [["職人", "しょくにん", "artisan/craftsman"]]},
        {"k": "技", "on": ["ギ"], "kun": ["わざ"], "m": "skill, art", "ex": [["技術", "ぎじゅつ", "technology"], ["神業", "かみわざ", "miraculous skill"]]},
        {"k": "線", "on": ["セン"], "kun": [], "m": "line, wire", "ex": [["断線", "だんせん", "disconnected wire"]]},
        {"k": "測", "on": ["ソク"], "kun": ["はか.る"], "m": "fathom, measure", "ex": [["測る", "はかる", "to measure"]]},
        {"k": "抵", "on": ["テイ"], "kun": [], "m": "resist", "ex": [["抵抗", "ていこう", "resistance"]]},
        {"k": "抗", "on": ["コウ"], "kun": [], "m": "oppose, resist", "ex": [["抵抗値", "ていこうち", "resistance value"]]}
    ],
    "build": [0, 4, 7],
    "questions": [
        {
            "q": "職人さんは壊れたコイルをどうやって直しましたか。",
            "en": "How did the craftsman repair the broken coil?",
            "choices": ["切れたエナメル線をハンダで繋ぎ直した", "新しいコイルと交換した", "接着剤で固めた"],
            "answer": 0
        },
        {
            "q": "職人さんは修理代金をいくら請求しましたか。",
            "en": "How much fee did the craftsman charge for the repair?",
            "choices": ["古いラジオを大切にする若者だからとお金を取らなかった", "五千円請求した", "一万円請求した"],
            "answer": 0
        }
    ],
    "talk": "Describe a craftsman or repair specialist you met and the skills they possessed in Japanese."
}

# =========================================================================
# STORY 4: n3-16 (34 lines) — 鎌倉の実家での昼食会
# Reviews: ～させていただく, お～になる/お～する, ～おかげで/せいで
# =========================================================================
story_n3_16 = {
    "id": "n3-16",
    "level": "N3",
    "unit": 16,
    "title": {
        "ja": "鎌倉の実家での昼食会",
        "en": "Luncheon at Yuki’s Family Home (Unit 4 Review)"
    },
    "scene": "A traditional Japanese house with an engawa veranda in Kamakura. Yuki's parents invite Sam for a formal seasonal luncheon, engaging in polite Japanese manners.",
    "lines": [
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["ここ", null, "here"], ["が", null, "subject", "p"], ["鎌倉", "かまくら", "Kamakura"], ["の", null, "of", "p"], ["実家", "じっか", "parents' house"], ["だよ", null, "is", "p"], ["！", null, null, "x"]], "en": "Sam, this is my family home in Kamakura!"},
        {"who": "サム", "t": [["立派", "りっぱ", "splendid"], ["な", null, "na-particle", "p"], ["日本家屋", "にほんかおく", "Japanese house"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["庭", "にわ", "garden"], ["の", null, "of", "p"], ["松", "まつ", "pine tree"], ["の", null, "of", "p"], ["木", "き", "tree"], ["が", null, "subject", "p"], ["すごく", null, "very"], ["綺麗", "きれい", "beautiful"], ["です", null, "is"], ["。", null, null, "x"]], "en": "What a splendid traditional Japanese home! The pine tree in the garden is gorgeous."},
        {"who": "お母さん", "t": [["いらっしゃい", null, "welcome"], ["！", null, null, "x"], ["よく", null, "well"], ["お越しくださいました", "おこしくださいました", "came (honorific)"], ["！", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["どうぞ", null, "please"], ["お上がり", "おあがり", "step inside (honorific)"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Welcome! Thank you so much for coming! Sam, please step inside."},
        {"who": "サム", "t": [["お邪魔", "おじゃま", "intrusion"], ["させていただきます", null, "permit me to do (humble)"], ["！", null, null, "x"], ["お招き", "おまねき", "invitation"], ["いただき", null, "receive (humble)"], ["、", null, null, "x"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Pardon my intrusion! Thank you very much for inviting me!"},
        {"who": "お父さん", "t": [["サム", null, "Sam"], ["くん", null, "suffix", "p"], ["、", null, null, "x"], ["ゆき", "ゆき", "Yuki"], ["から", null, "from", "p"], ["話", "はなし", "talks"], ["は", null, "topic", "p"], ["よく", null, "often"], ["伺って", "うかがって", "heard (humble)"], ["おります", null, "am doing (humble)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Sam, I have heard so much about you from Yuki."},
        {"who": "サム", "t": [["これ", null, "this"], ["、", null, null, "x"], ["心ばかり", "こころばかり", "token of heart"], ["の", null, "of", "p"], ["お土産", "おみやげ", "gift"], ["で", null, "is", "p"], ["ございます", null, "is (polite)"], ["。", null, null, "x"], ["どうぞ", null, "please"], ["お召し上がり", "おめしあがり", "eat (honorific)"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Here is a small token gift. Please enjoy it."},
        {"who": "お母さん", "t": [["まあ", null, "my goodness"], ["、", null, null, "x"], ["ご丁寧に", "ごていねいに", "so politely"], ["恐れ入ります", "おそれいります", "humbled/grateful"], ["！", null, null, "x"], ["美しい", "うつくしい", "beautiful"], ["お菓子", "おかし", "sweets"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "My goodness, thank you so much for being so thoughtful! What lovely sweets."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["ご挨拶", "ごあいさつ", "greetings"], ["申し上げます", "もうしあげます", "state (humble)"], ["！", null, null, "x"]], "en": "Beep! Blip also offers formal greetings!"},
        {"who": "お父さん", "t": [["ははは", null, "hahaha"], ["、", null, null, "x"], ["愉快な", "ゆかいな", "delightful"], ["ロボット", null, "robot"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["さあ", null, "come now"], ["、", null, null, "x"], ["昼食", "ちゅうしょく", "lunch"], ["の", null, "of", "p"], ["支度", "したく", "preparation"], ["が", null, "subject", "p"], ["できました", null, "is ready"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Hahaha, what a delightful robot! Come now, lunch preparations are all set."},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["旬", "しゅん", "in season"], ["の", null, "of", "p"], ["食材", "しょくざい", "ingredients"], ["を", null, "object", "p"], ["使った", "つかった", "used"], ["和食", "わしょく", "Japanese cuisine"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["彩り", "いろどり", "coloring"], ["が", null, "subject", "p"], ["とても", null, "very"], ["鮮やか", "あざやか", "vivid"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Wow, traditional Japanese dishes using seasonal ingredients! The colors are so vivid!"},
        {"who": "お母さん", "t": [["鎌倉", "かまくら", "Kamakura"], ["の", null, "of", "p"], ["地魚", "じざかな", "local fish"], ["と", null, "and", "p"], ["地元", "じもと", "local"], ["野菜", "やさい", "vegetables"], ["を", null, "object", "p"], ["使って", "つかって", "using"], ["作りました", "つくりました", "made"], ["の", null, "explanatory", "p"], ["。", null, null, "x"]], "en": "I prepared this using Kamakura local fish and vegetables."},
        {"who": "サム", "t": [["ご馳走", "ごちそう", "feast"], ["を", null, "object", "p"], ["いただきます", null, "will receive (humble)"], ["！", null, null, "x"], ["……", null, null, "x"], ["この", null, "this"], ["煮物", "にもの", "simmered dish"], ["、", null, null, "x"], ["本当", "ほんとう", "truly"], ["に", null, "adverbial", "p"], ["美味しい", "おいしい", "delicious"], ["です", null, "is"], ["！", null, null, "x"]], "en": "I humbly receive this feast! ...This simmered dish is truly delicious!"},
        {"who": "お父さん", "t": [["サム", null, "Sam"], ["くん", null, "suffix", "p"], ["は", null, "topic", "p"], ["箸", "はし", "chopsticks"], ["の", null, "of", "p"], ["使い方", "つかいかた", "how to use"], ["も", null, "also", "p"], ["お上手", "おじょうず", "skillful (polite)"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Sam, your use of chopsticks is very skillful too."},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["が", null, "subject", "p"], ["教えてくれた", "おしえてくれた", "taught me"], ["おかげで", null, "thanks to"], ["、", null, null, "x"], ["上手に", "じょうずに", "skillfully"], ["持てる", "もてる", "can hold"], ["ように", null, "manner"], ["なりました", null, "became"], ["。", null, null, "x"]], "en": "Thanks to Yuki teaching me, I became able to hold them properly."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["は", null, "topic", "p"], ["毎日", "まいにち", "every day"], ["すごく", null, "very"], ["熱心に", "ねっしんに", "enthusiastically"], ["練習", "れんしゅう", "practice"], ["している", null, "is doing"], ["んだよ", null, "is, you know", "p"], ["。", null, null, "x"]], "en": "Sam practices enthusiastically every single day, you know."},
        {"who": "お父さん", "t": [["感心", "かんしん", "admiration"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["生活", "せいかつ", "daily life"], ["には", null, "for", "p"], ["もう", null, "already"], ["慣れた", "なれた", "got used to"], ["かい", null, "question (informal)", "p"], ["？", null, null, "x"]], "en": "I'm impressed. Have you gotten used to daily life in Japan already?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["最初", "さいしょ", "at first"], ["は", null, "topic", "p"], ["電車", "でんしゃ", "train"], ["の", null, "of", "p"], ["乗り換え", "のりかえ", "transfer"], ["で", null, "at", "p"], ["迷う", "まよう", "get lost"], ["こと", null, "matter"], ["も", null, "also", "p"], ["ありました", null, "existed"], ["が", null, "but", "p"], ["、", null, null, "x"], ["皆さん", "みなさん", "everyone"], ["の", null, "of", "p"], ["おかげで", null, "thanks to"], ["毎日", "まいにち", "every day"], ["が", null, "subject", "p"], ["楽しい", "たのしい", "fun"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Yes! At first I sometimes got lost during train transfers, but thanks to everyone, every day is delightful."},
        {"who": "お母さん", "t": [["お茶", "おちゃ", "tea"], ["の", null, "of", "p"], ["お代わり", "おかわり", "refill"], ["は", null, "topic", "p"], ["いかが", null, "how about"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Would you care for another cup of tea?"},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["いただきます", null, "will receive"], ["！", null, null, "x"], ["香り", "かおり", "fragrance"], ["が", null, "subject", "p"], ["とても", null, "very"], ["豊か", "ゆたか", "rich"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Ah, yes please! The aroma is very rich."},
        {"who": "お父さん", "t": [["庭", "にわ", "garden"], ["の", null, "of", "p"], ["縁側", "えんがわ", "veranda"], ["から", null, "from", "p"], ["、", null, null, "x"], ["季節", "きせつ", "season"], ["の", null, "of", "p"], ["花", "はな", "flowers"], ["を", null, "object", "p"], ["ご覧", "ごらん", "look (honorific)"], ["になります", null, "become"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Would you like to view the seasonal flowers from the garden veranda?"},
        {"who": "サム", "t": [["ぜひ", null, "by all means"], ["拝見", "はいけん", "view (humble)"], ["させて", null, "permit"], ["いただきます", null, "receive (humble)"], ["！", null, null, "x"]], "en": "I would love to view them by all means!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["縁側", "えんがわ", "veranda"], ["の", null, "of", "p"], ["風鈴", "ふうりん", "wind chime"], ["が", null, "subject", "p"], ["チリンチリン", null, "tinkling"], ["と", null, "with", "p"], ["鳴って", "なって", "ringing"], ["います", null, "is"], ["！", null, null, "x"]], "en": "Beep! The wind chime on the veranda is tinkling in the breeze!"},
        {"who": "ゆき", "t": [["涼しげな", "すずしげな", "refreshingly cool"], ["いい", null, "good"], ["音", "おと", "sound"], ["だね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "It's such a lovely and refreshing sound, isn't it."},
        {"who": "サム", "t": [["木造", "もくぞう", "wooden"], ["の", null, "of", "p"], ["建築", "けんちく", "architecture"], ["と", null, "and", "p"], ["自然", "しぜん", "nature"], ["が", null, "subject", "p"], ["調和", "ちょうわ", "harmony"], ["していて", null, "is doing"], ["、", null, null, "x"], ["心", "こころ", "heart"], ["が", null, "subject", "p"], ["落ち着きます", "おちつきます", "calms down"], ["。", null, null, "x"]], "en": "Wooden architecture and nature are in such harmony, it brings peace to the heart."},
        {"who": "お父さん", "t": [["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["文化", "ぶんか", "culture"], ["の", null, "of", "p"], ["良さ", "よさ", "merit"], ["を", null, "object", "p"], ["深く", "ふかく", "deeply"], ["理解", "りかい", "understanding"], ["して", null, "do"], ["くれて", null, "gave favor"], ["嬉しい", "うれしい", "glad"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I'm delighted that you understand the beauty of Japanese culture so deeply."},
        {"who": "お母さん", "t": [["また", null, "again"], ["いつでも", null, "anytime"], ["遊び", "あそび", "visit"], ["に", null, "for", "p"], ["いらしてください", null, "come (honorific)"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Please come visit us again anytime."},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"], ["温かい", "あたたかい", "warm"], ["おもてなし", null, "hospitality"], ["に", null, "for", "p"], ["心", "こころ", "heart"], ["から", null, "from", "p"], ["感謝", "かんしゃ", "gratitude"], ["申し上げます", "もうしあげます", "state (humble)"], ["。", null, null, "x"]], "en": "Thank you very much! I express my heartfelt gratitude for your warm hospitality."},
        {"who": "ゆき", "t": [["お母さん", "おかあさん", "mom"], ["、", null, null, "x"], ["美味しい", "おいしい", "delicious"], ["ご飯", "ごはん", "meal"], ["ありがとう", null, "thank you"], ["！", null, null, "x"]], "en": "Mom, thank you for the delicious meal!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["鎌倉", "かまくら", "Kamakura"], ["の", null, "of", "p"], ["歴史", "れきし", "history"], ["データ", null, "data"], ["も", null, "also", "p"], ["記録", "きろく", "recording"], ["完了", "かんりょう", "complete"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Kamakura history data recording is complete!"},
        {"who": "お父さん", "t": [["大仏", "だいぶつ", "Great Buddha"], ["へ", null, "to", "p"], ["お参り", "おまいり", "shrine/temple visit"], ["に", null, "for", "p"], ["行く", "いく", "go"], ["なら", null, "if (nara)"], ["、", null, null, "x"], ["近道", "ちかみち", "shortcut"], ["を", null, "object", "p"], ["教えてあげよう", "おしえてあげよう", "shall teach for you"], ["。", null, null, "x"]], "en": "If you are going to visit the Great Buddha, let me show you a shortcut."},
        {"who": "サム", "t": [["ぜひ", null, "by all means"], ["教えて", "おしえて", "teach"], ["いただきたい", null, "would like to receive"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "I'd love for you to show us by all means!"},
        {"who": "ゆき", "t": [["江ノ電", "えのでん", "Enoden train"], ["に", null, "on", "p"], ["乗って", "のって", "ride"], ["向かおう", "むかおう", "let's head"], ["！", null, null, "x"]], "en": "Let's take the Enoden train and head there!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Yes! Thank you so much for today!"},
        {"who": "お父さん", "t": [["気をつけて", "きをつけて", "take care"], ["行ってきなさい", "いってきなさい", "go and come back"], ["！", null, null, "x"]], "en": "Take care and have a wonderful time!"}
    ],
    "grammar": [
        {
            "id": "n3-review-sasete-itadaku",
            "title": "Humble Permission: ～させていただく",
            "explain": "Causative + いただく expresses doing an action with the other person's gracious permission (お邪魔させていただきます, 拝見させていただきます).",
            "examples": [
                {"t": [["自己紹介", "じこしょうかい", "self-introduction"], ["させて", null, "permit"], ["いただきます", null, "receive (humble)"], ["。", null, null, "x"]], "en": "Allow me to introduce myself."}
            ],
            "quiz": [
                {"q": "本日のスケジュールを説明＿＿＿＿＿。", "hint": "Allow me to explain today's schedule.", "choices": ["させていただきます", "されます", "なさいます"], "answer": 0, "why": "〜させていただきます is polite humble permission."}
            ],
            "lesson": "grammar.html?level=N3#sasete-itadaku"
        },
        {
            "id": "n3-review-okage-sei",
            "title": "Causes & Attribution: ～おかげで & ～せいで",
            "explain": "Noun の / Verb plain + おかげで attributes a positive outcome to someone or something ('thanks to...'). + せいで attributes blame or a negative outcome ('because of / due to...').",
            "examples": [
                {"t": [["先生", "せんせい", "teacher"], ["の", null, "of", "p"], ["おかげで", null, "thanks to"], ["、", null, null, "x"], ["合格", "ごうかく", "passing"], ["できました", null, "could do"], ["。", null, null, "x"]], "en": "Thanks to my teacher, I was able to pass."}
            ],
            "quiz": [
                {"q": "友達が手伝ってくれた＿＿＿、早く終わった。", "hint": "Thanks to my friend helping me, it finished early.", "choices": ["おかげで", "せいで", "ために"], "answer": 0, "why": "おかげで expresses gratitude for positive outcome."}
            ],
            "lesson": "grammar.html?level=N3#okage-de"
        }
    ],
    "kanji": [
        {"k": "招", "on": ["ショウ"], "kun": ["まね.く"], "m": "beckon, invite", "ex": [["招待", "しょうたい", "invitation"], ["お招き", "おまねき", "invitation"]]},
        {"k": "庭", "on": ["テイ"], "kun": ["にわ"], "m": "garden, yard", "ex": [["庭園", "ていえん", "garden"]]},
        {"k": "鮮", "on": ["セン"], "kun": ["あざ.やか"], "m": "vivid, fresh", "ex": [["鮮やか", "あざやか", "vivid"], ["新鮮", "しんせん", "fresh"]]},
        {"k": "彩", "on": ["サイ"], "kun": ["いろど.る"], "m": "coloring", "ex": [["彩り", "いろどり", "coloring"]]},
        {"k": "縁", "on": ["エン"], "kun": ["ふち"], "m": "edge, relation", "ex": [["縁側", "えんがわ", "veranda"]]},
        {"k": "拝", "on": ["ハイ"], "kun": ["おが.む"], "m": "worship, see (humble)", "ex": [["拝見", "はいけん", "viewing (humble)"]]}
    ],
    "build": [2, 3, 11],
    "questions": [
        {
            "q": "サムさんはなぜ箸を上手に使えるようになりましたか。",
            "en": "Why did Sam become able to use chopsticks skillfully?",
            "choices": ["ゆきさんが教えてくれたおかげで", "箸の学校に通ったから", "子供のころから使っていたから"],
            "answer": 0
        },
        {
            "q": "お父さんはサムさんたちに何を教えてくれましたか。",
            "en": "What did the father teach Sam and Yuki?",
            "choices": ["大仏への近道", "料理の作り方", "松の木の育て方"],
            "answer": 0
        }
    ],
    "talk": "Describe a time you visited someone's home and practiced polite table etiquette in Japanese."
}

# =========================================================================
# STORY 5: n3-17 (34 lines) — 夕暮れの祇園：職人との偶然の出会い
# Reviews: V-ているうちに, V-たとたん, ～に違いない, ～させていただく, お～する
# =========================================================================
story_n3_17 = {
    "id": "n3-17",
    "level": "N3",
    "unit": 17,
    "title": {
        "ja": "夕暮れの祇園：職人との偶然の出会い",
        "en": "Dusk in Gion: Meeting a Kyoto Artisan (Unit 5 Review)"
    },
    "scene": "Gion, Kyoto at dusk. A sudden rainstorm prompts Sam, Yuki, and Blip to duck into a historic bamboo craft workshop, witnessing master umbrella craftsmen.",
    "lines": [
        {"who": "ゆき", "t": [["夕暮れ", "ゆうぐれ", "dusk"], ["の", null, "of", "p"], ["祇園", "ぎおん", "Gion"], ["の", null, "of", "p"], ["石畳", "いしだたみ", "stone pavement"], ["、", null, null, "x"], ["風情", "ふぜい", "elegance/taste"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "The stone-paved alleys of Gion at dusk have such timeless elegance!"},
        {"who": "サム", "t": [["古い", "ふるい", "historic"], ["町家", "まちや", "traditional townhouse"], ["が", null, "subject", "p"], ["並んでいて", "ならんでいて", "are lined up"], ["、", null, null, "x"], ["まるで", null, "as if"], ["タイムスリップ", null, "time slip"], ["した", null, "did"], ["みたいだ", null, "seems like"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Historic townhouses are lined up, it feels as if we time-slipped!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["急", "きゅう", "sudden"], ["に", null, "adverbial", "p"], ["黒い", "くろい", "black"], ["雲", "くも", "clouds"], ["が", null, "subject", "p"], ["空", "そら", "sky"], ["を", null, "object", "p"], ["覆いました", "おおいました", "covered"], ["！", null, null, "x"]], "en": "Beep! Dark clouds suddenly covered the sky!"},
        {"who": "ゆき", "t": [["あっ", null, "ah"], ["、", null, null, "x"], ["言った", "いった", "spoke"], ["とたん", null, "just as soon as"], ["に", null, "at", "p"], ["大粒", "おおつぶ", "large drops"], ["の", null, "of", "p"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["降ってきた", "ふってきた", "came falling"], ["！", null, null, "x"]], "en": "Ah, just as you said that, large raindrops came pouring down!"},
        {"who": "サム", "t": [["あそこ", null, "over there"], ["の", null, "of", "p"], ["軒下", "のきした", "under eaves"], ["で", null, "at", "p"], ["雨宿り", "あまやどり", "shelter from rain"], ["しよう", "しよう", "let's do"], ["！", null, null, "x"], ["早く", "はやく", "quickly"], ["！", null, null, "x"]], "en": "Let's take shelter under those eaves over there! Quick!"},
        {"who": "職人", "t": [["おや", null, "oh my"], ["、", null, null, "x"], ["ずぶ濡れ", "ずぶぬれ", "soaking wet"], ["だね", null, "aren't you", "p"], ["。", null, null, "x"], ["どうぞ", null, "please"], ["、", null, null, "x"], ["中", "なか", "inside"], ["へ", null, "into", "p"], ["お入り", "おはいり", "enter (honorific)"], ["なさい", null, "do"], ["。", null, null, "x"]], "en": "Oh my, you're soaking wet. Please, come inside."},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"], ["雨宿り", "あまやどり", "rain shelter"], ["させて", null, "permit"], ["いただきます", null, "receive (humble)"], ["！", null, null, "x"]], "en": "Thank you very much! Thank you for letting us shelter from the rain!"},
        {"who": "ゆき", "t": [["わあ", null, "wow"], ["……", null, null, "x"], ["ここ", null, "here"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["和傘", "わがさ", "Japanese umbrella"], ["の", null, "of", "p"], ["工房", "こうぼう", "workshop"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Wow... is this a Japanese traditional umbrella workshop?"},
        {"who": "職人", "t": [["そうだよ", null, "that's right"], ["。", null, null, "x"], ["竹", "たけ", "bamboo"], ["と", null, "and", "p"], ["和紙", "わし", "washi paper"], ["で", null, "with", "p"], ["京和傘", "きょうわがさ", "Kyoto umbrella"], ["を", null, "object", "p"], ["作っている", "つくっている", "am making"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "That's right. I make Kyoto paper umbrellas using bamboo and washi paper."},
        {"who": "サム", "t": [["なんて", null, "what a"], ["美しい", "うつくしい", "beautiful"], ["色合い", "いろあい", "color scheme"], ["なんだ", null, "is it"], ["！", null, null, "x"], ["幾何学的", "きかがくてき", "geometric"], ["な", null, "na-particle", "p"], ["骨組み", "ほねぐみ", "framework"], ["が", null, "subject", "p"], ["見事", "みごと", "splendid"], ["です", null, "is"], ["！", null, null, "x"]], "en": "What gorgeous coloring! The geometric framework is magnificent!"},
        {"who": "職人", "t": [["竹", "たけ", "bamboo"], ["の", null, "of", "p"], ["骨", "ほね", "ribs"], ["を", null, "object", "p"], ["削っている", "けずっている", "whittling"], ["うちに", null, "while in middle of"], ["、", null, null, "x"], ["手", "て", "hands"], ["の", null, "of", "p"], ["感覚", "かんかく", "sensation"], ["で", null, "by", "p"], ["厚み", "あつみ", "thickness"], ["が", null, "subject", "p"], ["分かる", "わかる", "understand"], ["ように", null, "manner"], ["なる", null, "becomes"], ["んだ", null, "explanatory"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "While shaving the bamboo ribs, your hands come to sense the exact thickness by touch."},
        {"who": "サム", "t": [["長年", "ながねん", "many years"], ["の", null, "of", "p"], ["修業", "しゅぎょう", "training"], ["を", null, "object", "p"], ["積んだ", "つんだ", "accumulated"], ["に違いない", "にちがいない", "must surely have"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "You must surely have accumulated decades of intense training!"},
        {"who": "職人", "t": [["傘", "かさ", "umbrella"], ["を", null, "object", "p"], ["開いた", "ひらいた", "opened"], ["とたん", null, "just as soon as"], ["、", null, null, "x"], ["パッと", null, "suddenly"], ["広がる", "ひろがる", "spreads"], ["張り", "はり", "tension"], ["が", null, "subject", "p"], ["命", "いのち", "life"], ["なんだ", null, "explanatory"], ["。", null, null, "x"]], "en": "The tension that snaps open the instant the umbrella is unfolded is its very life."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["放射状", "ほうしゃじょう", "radial"], ["の", null, "of", "p"], ["美しい", "うつくしい", "beautiful"], ["骨組み", "ほねぐみ", "framework"], ["です", null, "is"], ["！", null, null, "x"], ["四十八本", "よんじゅうはっぽん", "48 ribs"], ["の", null, "of", "p"], ["竹", "たけ", "bamboo"], ["が", null, "subject", "p"], ["均等", "きんとう", "even/equal"], ["に", null, "adverbial", "p"], ["並んで", "ならんで", "lined up"], ["います", null, "is"], ["！", null, null, "x"]], "en": "Beep! Beautiful radial framework! Forty-eight bamboo ribs are aligned with perfect symmetry!"},
        {"who": "職人", "t": [["おや", null, "oh my"], ["、", null, null, "x"], ["よく", null, "well"], ["数えた", "かぞえた", "counted"], ["ね", null, "didn't you", "p"], ["！", null, null, "x"], ["機械", "きかい", "machine"], ["の", null, "of", "p"], ["目", "め", "eyes"], ["も", null, "also", "p"], ["たいした", null, "impressive"], ["もんだ", null, "thing"], ["。", null, null, "x"]], "en": "Oh, you counted well! Machine eyes are quite impressive too."},
        {"who": "ゆき", "t": [["雨", "あめ", "rain"], ["を", null, "object", "p"], ["弾く", "はじく", "repel"], ["ため", null, "in order to"], ["に", null, "for", "p"], ["、", null, null, "x"], ["油", "あぶら", "oil"], ["を", null, "object", "p"], ["塗る", "ぬる", "apply"], ["ん", null, "explanatory"], ["ですよね", null, "isn't it, right", "p"], ["？", null, null, "x"]], "en": "You coat it with oil to repel rain, right?"},
        {"who": "職人", "t": [["えごま", null, "perilla"], ["油", "あぶら", "oil"], ["を", null, "object", "p"], ["塗って", "ぬって", "apply"], ["、", null, null, "x"], ["天日", "てんぴ", "sunlight"], ["で", null, "under", "p"], ["じっくり", null, "thoroughly"], ["乾かす", "かわかす", "dry"], ["んだ", null, "explanatory"], ["。", null, null, "x"], ["そうする", null, "doing so"], ["と", null, "when/if", "p"], ["、", null, null, "x"], ["雨", "あめ", "rain"], ["の", null, "of", "p"], ["日", "ひ", "day"], ["でも", null, "even", "p"], ["水", "みず", "water"], ["を", null, "object", "p"], ["通さない", "とおさない", "not let through"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "We apply perilla oil and thoroughly sun-dry it. When you do that, it won't let water through even on rainy days."},
        {"who": "サム", "t": [["自然", "しぜん", "nature"], ["の", null, "of", "p"], ["素材", "そざい", "materials"], ["だけで", null, "only with"], ["、", null, null, "x"], ["こんなに", null, "this much"], ["機能的", "きのうてき", "functional"], ["な", null, "na-particle", "p"], ["道具", "どうぐ", "tool"], ["が", null, "subject", "p"], ["作れる", "つくれる", "can make"], ["なんて", null, "such a thing"], ["驚き", "おどろき", "surprise"], ["です", null, "is"], ["！", null, null, "x"]], "en": "It's amazing that such a functional tool can be made using only natural materials!"},
        {"who": "職人", "t": [["昔", "むかし", "old days"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["の", null, "of", "p"], ["知恵", "ちえ", "wisdom"], ["の", null, "of", "p"], ["結晶", "けっしょう", "crystallization"], ["さ", null, "particle", "p"], ["。", null, null, "x"], ["雨音", "あまおと", "rain sound"], ["が", null, "subject", "p"], ["和紙", "わし", "washi paper"], ["に", null, "on", "p"], ["当たる", "あたる", "strike"], ["時", "とき", "time"], ["の", null, "of", "p"], ["音", "おと", "sound"], ["も", null, "also", "p"], ["、", null, null, "x"], ["独特", "どくとく", "unique"], ["で", null, "and", "p"], ["風情", "ふぜい", "charm"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "It's the crystallization of ancient wisdom. The sound of rain striking washi paper is unique and charming too."},
        {"who": "サム", "t": [["どんな", null, "what kind of"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["する", null, "does"], ["んですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "What kind of sound does it make?"},
        {"who": "職人", "t": [["ビニール傘", "びにーるがさ", "plastic umbrella"], ["の", null, "of", "p"], ["バタバタ", null, "flapping"], ["した", null, "did"], ["音", "おと", "sound"], ["と", null, "with", "p"], ["違って", "ちがって", "differing"], ["、", null, null, "x"], ["トントン", null, "gentle tapping"], ["と", null, "with", "p"], ["太鼓", "たいこ", "drum"], ["の", null, "of", "p"], ["ような", null, "like"], ["優しい", "やさしい", "gentle"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["する", null, "does"], ["のさ", null, "particle", "p"], ["。", null, null, "x"]], "en": "Unlike the slapping noise of a plastic umbrella, it makes a gentle tapping sound like a small drum."},
        {"who": "ゆき", "t": [["素敵", "すてき", "lovely"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["雨", "あめ", "rain"], ["の", null, "of", "p"], ["日", "ひ", "day"], ["が", null, "subject", "p"], ["楽しみに", "たのしみに", "look forward to"], ["なる", null, "become"], ["傘", "かさ", "umbrella"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "How lovely! It's an umbrella that makes you look forward to rainy days."},
        {"who": "サム", "t": [["お話", "おはなし", "talk"], ["を", null, "object", "p"], ["伺っている", "うかがっている", "listening (humble)"], ["うちに", null, "while"], ["、", null, null, "x"], ["外", "そと", "outside"], ["の", null, "of", "p"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["小降り", "こぶり", "light rain"], ["に", null, "adverbial", "p"], ["なってきた", null, "has become"], ["みたい", null, "seems like"], ["です", null, "is"], ["。", null, null, "x"]], "en": "While listening to you speak, it seems the rain outside has turned into a drizzle."},
        {"who": "職人", "t": [["夕立", "ゆうだち", "evening shower"], ["は", null, "topic", "p"], ["通り過ぎる", "とおりすぎる", "pass by"], ["の", null, "nominalizer"], ["が", null, "subject", "p"], ["早い", "はやい", "fast"], ["から", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Evening showers pass by quickly, after all."},
        {"who": "サム", "t": [["突然", "とつぜん", "sudden"], ["お邪魔", "おじゃま", "intrusion"], ["したのに", null, "even though did"], ["、", null, null, "x"], ["親切", "しんせつ", "kindness"], ["に", null, "adverbial", "p"], ["教えて", "おしえて", "teach"], ["くださって", null, "gave favor"], ["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Even though we suddenly intruded, thank you so much for kindly showing us your craft!"},
        {"who": "職人", "t": [["いいってことよ", null, "think nothing of it"], ["。", null, null, "x"], ["雨宿り", "あまやどり", "rain shelter"], ["も", null, "also", "p"], ["何かの", "なにかの", "some kind of"], ["縁", "えん", "destiny/bond"], ["だから", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Think nothing of it. Sheltering from rain is a form of fateful connection too."},
        {"who": "ゆき", "t": [["京都", "きょうと", "Kyoto"], ["の", null, "of", "p"], ["思い出", "おもいで", "memories"], ["が", null, "subject", "p"], ["また", null, "again"], ["一つ", "ひとつ", "one"], ["増えた", "ふえた", "increased"], ["ね", null, "didn't it", "p"], ["！", null, null, "x"]], "en": "We gained yet another special Kyoto memory, didn't we!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["濡れた", "ぬれた", "wet"], ["石畳", "いしだたみ", "stone pavement"], ["に", null, "on", "p"], ["灯籠", "とうろう", "lantern"], ["の", null, "of", "p"], ["明かり", "あかり", "light"], ["が", null, "subject", "p"], ["映って", "うつって", "reflects"], ["、", null, null, "x"], ["とても", null, "very"], ["幻想的", "げんそうてき", "magical/mystical"], ["だ", null, "is"], ["。", null, null, "x"]], "en": "Yeah! Lantern lights reflect on the wet stone pavement, it's so magical."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["カメラ", null, "camera"], ["で", null, "with", "p"], ["美しい", "うつくしい", "beautiful"], ["夜景", "やけい", "night view"], ["を", null, "object", "p"], ["撮影", "さつえい", "photograph"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! Photographing the beautiful night view with my camera!"},
        {"who": "職人", "t": [["夜", "よる", "night"], ["は", null, "topic", "p"], ["冷える", "ひえる", "gets cold"], ["から", null, "because", "p"], ["、", null, null, "x"], ["風邪", "かぜ", "cold"], ["を", null, "object", "p"], ["引かない", "ひかない", "not catch"], ["ように", null, "so that"], ["気をつけて", "きをつけて", "take care"], ["お帰り", "おかえり", "return"], ["。", null, null, "x"]], "en": "It gets chilly at night, so take care not to catch cold as you head home."},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Yes! Thank you so very much!"},
        {"who": "ゆき", "t": [["さあ", null, "come now"], ["、", null, null, "x"], ["温かい", "あたたかい", "warm"], ["湯豆腐", "ゆどうふ", "boiled tofu"], ["でも", null, "or something", "p"], ["食べに", "たべに", "for eating"], ["行こう", "いこう", "let's go"], ["！", null, null, "x"]], "en": "Come now, let's go eat warm Yudofu tofu!"},
        {"who": "サム", "t": [["賛成", "さんせい", "agree"], ["！", null, null, "x"], ["京都", "きょうと", "Kyoto"], ["の", null, "of", "p"], ["夜", "よる", "night"], ["を", null, "through", "p"], ["満喫", "まんきつ", "fully enjoy"], ["しよう", "しよう", "let's do"], ["！", null, null, "x"]], "en": "Agreed! Let's fully enjoy Kyoto's night!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["美味しい", "おいしい", "delicious"], ["豆腐", "とうふ", "tofu"], ["へ", null, "to", "p"], ["出発", "しゅっぱつ", "departure"], ["進行", "しんこう", "ahead"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Full speed ahead to delicious tofu!"}
    ],
    "grammar": [
        {
            "id": "n3-review-te-iru-uchini",
            "title": "Natural Transition: ～ているうちに (While Doing...)",
            "explain": "V-ている + うちに expresses that while an ongoing action was occurring, a change naturally or unconsciously took place.",
            "examples": [
                {"t": [["話している", "はなしている", "talking"], ["うちに", null, "while in middle of"], ["、", null, null, "x"], ["仲良くなった", "なかよくなった", "became good friends"], ["。", null, null, "x"]], "en": "While talking, we became good friends."}
            ],
            "quiz": [
                {"q": "本を読んでいる＿＿＿、眠ってしまった。", "hint": "While reading a book, I fell asleep.", "choices": ["うちに", "までに", "ために"], "answer": 0, "why": "〜ているうちに expresses an unprompted change during an ongoing state."}
            ],
            "lesson": "grammar.html?level=N3#te-iru-uchini"
        },
        {
            "id": "n3-review-totan",
            "title": "Immediate Succession: ～たとたん (Just as Soon as...)",
            "explain": "V-た + とたん (に) describes an unexpected or instantaneous event that happens the moment a preceding action finishes.",
            "examples": [
                {"t": [["窓", "まど", "window"], ["を", null, "object", "p"], ["開けた", "あけた", "opened"], ["とたん", null, "just as soon as"], ["、", null, null, "x"], ["強風", "きょうふう", "strong wind"], ["が", null, "subject", "p"], ["入ってきた", "はいってきた", "entered"], ["。", null, null, "x"]], "en": "The moment I opened the window, strong wind rushed in."}
            ],
            "quiz": [
                {"q": "立ち上がっ＿＿＿、めまいがした。", "hint": "The moment I stood up, I felt dizzy.", "choices": ["たとたん", "たところ", "たばかり"], "answer": 0, "why": "〜たとたん highlights instantaneous subsequent trigger."}
            ],
            "lesson": "grammar.html?level=N3#totan"
        }
    ],
    "kanji": [
        {"k": "風", "on": ["フウ"], "kun": ["かぜ"], "m": "wind, style", "ex": [["風情", "ふぜい", "taste/atmosphere"]]},
        {"k": "情", "on": ["ジョウ"], "kun": ["なさ.け"], "m": "feeling, condition", "ex": [["風情", "ふぜい", "atmosphere"], ["感情", "かんじょう", "emotion"]]},
        {"k": "畳", "on": ["ジョウ"], "kun": ["たたみ"], "m": "tatami, fold", "ex": [["石畳", "いしだたみ", "stone pavement"]]},
        {"k": "削", "on": ["サク"], "kun": ["けず.る"], "m": "whittle, plane", "ex": [["削る", "けずる", "to shave/whittle"]]},
        {"k": "放", "on": ["ホウ"], "kun": ["はな.す"], "m": "release, emit", "ex": [["放射状", "ほうしゃじょう", "radial pattern"]]},
        {"k": "均", "on": ["キン"], "kun": [], "m": "level, equal", "ex": [["均等", "きんとう", "equality/uniformity"]]}
    ],
    "build": [0, 3, 11],
    "questions": [
        {
            "q": "職人さんは何を削っているうちに厚みが分かるようになりましたか。",
            "en": "While shaving what did the craftsman come to know the thickness by touch?",
            "choices": ["傘の竹の骨", "木の板", "鉛筆"],
            "answer": 0
        },
        {
            "q": "和傘に雨が当たる時はどんな音がしますか。",
            "en": "What kind of sound does rain make when striking a washi umbrella?",
            "choices": ["トントンと太鼓のような優しい音", "バタバタと大きな音", "カチカチと硬い音"],
            "answer": 0
        }
    ],
    "talk": "Describe a traditional craft or handmade tool you experienced in Japan."
}

def get_p1_stories():
    return [story_n3_13, story_n3_14, story_n3_15, story_n3_16, story_n3_17]

if __name__ == "__main__":
    STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    for s in get_p1_stories():
        out = STORIES_DIR / f"{s['id']}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
        print(f"Generated {out.name} ({len(s['lines'])} lines, {len(s['grammar'])} grammar points, {len(s['kanji'])} kanji)")
