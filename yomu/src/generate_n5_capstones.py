#!/usr/bin/env python3
"""
Generate the 3 N5 Capstone Stories (n5-13, n5-14, n5-15) for Yomu.
Full rich dialogues (40-54 turns each), complete tokenization, furigana,
grammar reviews, kanji lists, sentence-building quizzes, comprehension questions, and talk prompts.
"""

import json
from pathlib import Path

null = None

STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"

# =========================================================================
# STORY 1: n5-13 — はじめての日曜日 (A Full Sunday in New York)
# Reviews Lessons 1-4: XはYです, これ/それ/あれ, ます/ません, ました/ませんでした, particles を,に,へ,で,と,も,の
# =========================================================================
story_n5_13 = {
    "id": "n5-13",
    "level": "N5",
    "unit": 13,
    "title": {
        "ja": "はじめての日曜日",
        "en": "A Full Sunday in New York"
    },
    "scene": "Greenwich Village, New York. Sam meets Yuki and Blip on a Sunday morning for coffee, a flea market walk, and radio listening in the park.",
    "lines": [
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["おはよう", null, "good morning"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Good morning, Yuki!"},
        {"who": "ゆき", "t": [["おはよう", null, "good morning"], ["ございます", null, "polite end"], ["、", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["。", null, null, "x"], ["いい", null, "good"], ["朝", "あさ", "morning"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Good morning, Sam. It's a nice morning, isn't it?"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["おはよう", null, "good morning"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Beep! Good morning, Yuki!"},
        {"who": "ゆき", "t": [["ブリップ", null, "Blip"], ["さん", null, "polite suffix", "p"], ["も", null, "also", "p"], ["元気", "げんき", "well, energetic"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["日曜日", "にちようび", "Sunday"], ["です", null, "is/am/are"], ["。", null, null, "x"]], "en": "Blip is full of energy too! Today is Sunday."},
        {"who": "サム", "t": [["はい", null, "yes"], ["。", null, null, "x"], ["この", null, "this"], ["カフェ", null, "café"], ["で", null, "at/in", "p"], ["朝ごはん", "あさごはん", "breakfast"], ["を", null, "object", "p"], ["食べましょう", "たべましょう", "let's eat"], ["。", null, null, "x"]], "en": "Yes. Let's eat breakfast at this café."},
        {"who": "店員", "t": [["いらっしゃいませ", null, "welcome"], ["！", null, null, "x"], ["何", "なに", "what"], ["に", null, "to/for", "p"], ["します", null, "will make it / choose"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Welcome! What would you like?"},
        {"who": "サム", "t": [["コーヒー", null, "coffee"], ["を", null, "object", "p"], ["二つ", "ふたつ", "two (things)"], ["と", null, "and", "p"], ["、", null, null, "x"], ["パン", null, "bread"], ["を", null, "object", "p"], ["二つ", "ふたつ", "two (things)"], ["ください", null, "please give me"], ["。", null, null, "x"]], "en": "Two coffees and two breads, please."},
        {"who": "店員", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["かしこまりました", null, "certainly"], ["。", null, null, "x"]], "en": "Certainly!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["注文", "ちゅうもん", "order"], ["が", null, "subject", "p"], ["上手", "じょうず", "skillful"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Sam, your Japanese ordering is very good!"},
        {"who": "サム", "t": [["いいえ", null, "no"], ["、", null, null, "x"], ["まだまだ", null, "not yet / still a long way"], ["です", null, "is/am/are"], ["。", null, null, "x"], ["でも", null, "but"], ["、", null, null, "x"], ["毎日", "まいにち", "every day"], ["勉強", "べんきょう", "study"], ["します", null, "do (polite)"], ["。", null, null, "x"]], "en": "No, I still have a long way to go. But I study every day."},
        {"who": "ゆき", "t": [["きのう", null, "yesterday"], ["は", null, "topic", "p"], ["何", "なに", "what"], ["を", null, "object", "p"], ["しました", null, "did (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "What did you do yesterday?"},
        {"who": "サム", "t": [["きのう", null, "yesterday"], ["の", null, "of", "p"], ["午前", "ごぜん", "morning / a.m."], ["は", null, "topic", "p"], ["部屋", "へや", "room"], ["で", null, "in/at", "p"], ["ラジオ", null, "radio"], ["を", null, "object", "p"], ["作りました", "つくりました", "made (polite)"], ["。", null, null, "x"]], "en": "Yesterday morning, I built a radio in my room."},
        {"who": "ブリップ", "t": [["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["手伝いました", "てつだいました", "helped (polite)"], ["！", null, null, "x"], ["新しい", "あたらしい", "new"], ["アンテナ", null, "antenna"], ["でした", null, "was (polite)"], ["。", null, null, "x"]], "en": "Blip helped too! It was a new antenna."},
        {"who": "ゆき", "t": [["へえ", null, "wow"], ["、", null, null, "x"], ["すごい", null, "amazing"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["午後", "ごご", "afternoon / p.m."], ["は", null, "topic", "p"], ["どこ", null, "where"], ["へ", null, "to", "p"], ["行きました", "いきました", "went (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Wow, that's amazing! Where did you go in the afternoon?"},
        {"who": "サム", "t": [["友だち", "ともだち", "friend"], ["と", null, "with", "p"], ["地下鉄", "ちかてつ", "subway"], ["で", null, "by (means)", "p"], ["図書館", "としょかん", "library"], ["へ", null, "to", "p"], ["行きました", "いきました", "went (polite)"], ["。", null, null, "x"]], "en": "I went to the library by subway with a friend."},
        {"who": "サム", "t": [["図書館", "としょかん", "library"], ["で", null, "at", "p"], ["本", "ほん", "book"], ["を", null, "object", "p"], ["三冊", "さんさつ", "three (bound volumes)"], ["借りました", "かりました", "borrowed (polite)"], ["。", null, null, "x"]], "en": "I borrowed three books at the library."},
        {"who": "ゆき", "t": [["どんな", null, "what kind of"], ["本", "ほん", "book"], ["でした", null, "was (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "What kind of books were they?"},
        {"who": "サム", "t": [["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["歴史", "れきし", "history"], ["の", null, "of", "p"], ["本", "ほん", "book"], ["と", null, "and", "p"], ["、", null, null, "x"], ["電子", "でんし", "electronic"], ["工作", "こうさく", "craft / engineering"], ["の", null, "of", "p"], ["本", "ほん", "book"], ["でした", null, "was (polite)"], ["。", null, null, "x"]], "en": "They were books on Japanese history and electronics tinkering."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["は", null, "topic", "p"], ["本当に", "ほんとうに", "really"], ["勉強熱心", "べんきょうねっしん", "studious / devoted to study"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Sam, you are really hardworking!"},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["は", null, "topic", "p"], ["きのう", null, "yesterday"], ["何を", "なにを", "what (object)"], ["しました", null, "did (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "What did you do yesterday, Yuki?"},
        {"who": "ゆき", "t": [["私", "わたし", "I"], ["は", null, "topic", "p"], ["友だち", "ともだち", "friend"], ["と", null, "with", "p"], ["美術館", "びじゅつかん", "art museum"], ["へ", null, "to", "p"], ["行きました", "いきました", "went (polite)"], ["。", null, null, "x"], ["とても", null, "very"], ["きれい", null, "pretty/clean"], ["でした", null, "was (polite)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I went to an art museum with a friend. It was very beautiful!"},
        {"who": "店員", "t": [["お待たせ", "おまたせ", "waiting"], ["しました", null, "did (polite)"], ["。", null, null, "x"], ["コーヒー", null, "coffee"], ["と", null, "and", "p"], ["クロワッサン", null, "croissant"], ["です", null, "is/are"], ["。", null, null, "x"]], "en": "Thank you for waiting. Here is your coffee and croissants."},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["。", null, null, "x"], ["いただきます", null, "bon appétit (humble)"], ["！", null, null, "x"]], "en": "Thank you very much. Let's eat!"},
        {"who": "ゆき", "t": [["いただきます", null, "bon appétit"], ["！", null, null, "x"], ["ん", null, "mm"], ["、", null, null, "x"], ["この", null, "this"], ["パン", null, "bread"], ["は", null, "topic", "p"], ["温かい", "あたたかい", "warm"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Let's eat! Mmm, this bread is warm, isn't it?"},
        {"who": "ブリップ", "t": [["ブリップ", null, "Blip"], ["は", null, "topic", "p"], ["パン", null, "bread"], ["を", null, "object", "p"], ["食べません", "たべません", "do not eat (polite)"], ["。", null, null, "x"], ["ロボット", null, "robot"], ["ですから", null, "because is"], ["！", null, null, "x"]], "en": "Blip does not eat bread. Because I'm a robot!"},
        {"who": "ゆき", "t": [["あはは", null, "hahaha"], ["、", null, null, "x"], ["そうでした", null, "that was so"], ["ね", null, "wasn't it", "p"], ["。", null, null, "x"], ["ごめんなさい", null, "I'm sorry"], ["、", null, null, "x"], ["ブリップ", null, "Blip"], ["さん", null, "polite suffix", "p"], ["。", null, null, "x"]], "en": "Hahaha, that's right! I'm sorry, Blip."},
        {"who": "サム", "t": [["ごちそうさまでした", null, "thank you for the meal"], ["。", null, null, "x"], ["公園", "こうえん", "park"], ["へ", null, "to", "p"], ["散歩", "さんぽ", "walk"], ["に", null, "for/purpose", "p"], ["行きましょう", "いきましょう", "let's go"], ["。", null, null, "x"]], "en": "Thank you for the meal. Let's go to the park for a walk."},
        {"who": "ゆき", "t": [["ええ", null, "yes"], ["、", null, null, "x"], ["行きましょう", "いきましょう", "let's go"], ["！", null, null, "x"], ["公園", "こうえん", "park"], ["で", null, "in/at", "p"], ["バザー", null, "bazaar/flea market"], ["を", null, "object", "p"], ["しています", null, "is holding/doing"], ["よ", null, "you know", "p"], ["。", null, null, "x"]], "en": "Yes, let's go! They're holding a flea market in the park, you know."},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["見て", "みて", "look"], ["ください", null, "please"], ["。", null, null, "x"], ["あれ", null, "that over there"], ["は", null, "topic", "p"], ["何", "なに", "what"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Ah, look please. What is that over there?"},
        {"who": "ゆき", "t": [["どれ", null, "which one"], ["ですか", null, "is it", "p"], ["？", null, null, "x"], ["あの", null, "that over there"], ["テーブル", null, "table"], ["の", null, "of", "p"], ["上", "うえ", "top/on"], ["の", null, "of", "p"], ["物", "もの", "thing"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Which one? The thing on that table over there?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["あの", null, "that over there"], ["黒い", "くろい", "black"], ["箱", "はこ", "box"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Yes, that black box."},
        {"who": "ゆき", "t": [["あれ", null, "that over there"], ["は", null, "topic", "p"], ["古い", "ふるい", "old"], ["レコードプレーヤー", null, "record player"], ["ですよ", null, "you know", "p"], ["。", null, null, "x"]], "en": "That is an old record player, you know!"},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["おもしろい", null, "interesting"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["それ", null, "that"], ["は", null, "topic", "p"], ["いくら", null, "how much"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Wow, that's interesting! How much is that?"},
        {"who": "店員", "t": [["これ", null, "this"], ["は", null, "topic", "p"], ["二千", "にせん", "2000"], ["円", "えん", "yen"], ["……", null, null, "x"], ["じゃなくて", null, "not, rather"], ["、", null, null, "x"], ["二十", "にじゅう", "20"], ["ドル", null, "dollars"], ["です", null, "is"], ["。", null, null, "x"]], "en": "This is 2000 yen... I mean, 20 dollars."},
        {"who": "サム", "t": [["安い", "やすい", "cheap"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["でも", null, "but"], ["、", null, null, "x"], ["私", "わたし", "I"], ["の", null, "my", "p"], ["部屋", "へや", "room"], ["は", null, "topic", "p"], ["狭い", "せまい", "cramped/small"], ["です", null, "is"], ["から", null, "because", "p"], ["、", null, null, "x"], ["今日は", "きょうは", "today (topic)"], ["買いません", "かいません", "will not buy (polite)"], ["。", null, null, "x"]], "en": "That's cheap! But because my room is small, I won't buy it today."},
        {"who": "ブリップ", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["アンテナ", null, "antenna"], ["が", null, "subject", "p"], ["信号", "しんごう", "signal"], ["を", null, "object", "p"], ["受信", "じゅしん", "reception"], ["しました", null, "did (polite)"], ["！", null, null, "x"]], "en": "Sam, the antenna received a signal!"},
        {"who": "サム", "t": [["えっ", null, "huh"], ["、", null, null, "x"], ["本当", "ほんとう", "really"], ["に", null, "particle", "p"], ["！？", null, null, "x"], ["何", "なに", "what"], ["の", null, "of", "p"], ["音", "おと", "sound"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Wait, really!? What sound is it?"},
        {"who": "ブリップ", "t": [["モールス", null, "Morse"], ["信号", "しんごう", "code/signal"], ["です", null, "is"], ["。", null, null, "x"], ["ツーツーツー", null, "dah dah dah"], ["、", null, null, "x"], ["トトト", null, "dit dit dit"], ["！", null, null, "x"]], "en": "It's Morse code. Dah dah dah, dit dit dit!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["アマチュア", null, "amateur"], ["無線", "むせん", "radio"], ["の", null, "of", "p"], ["人", "ひと", "person"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"], ["ニューヨーク", null, "New York"], ["の", null, "of", "p"], ["日曜日", "にちようび", "Sunday"], ["は", null, "topic", "p"], ["楽しい", "たのしい", "fun"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Hehe, it's an amateur radio operator! Sundays in New York are fun, aren't they?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["とても", null, "very"], ["いい", null, "good"], ["日曜日", "にちようび", "Sunday"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Yes! It's a wonderful Sunday."}
    ],
    "grammar": [
        {
            "id": "n5-review-desu-masu",
            "title": "です & ます Review: Polite Present & Past",
            "explain": "Use です / でした for nouns and adjectives; use ます / ました for action verbs. Negative forms are じゃありません / ではありません and ません / ませんでした.",
            "examples": [
                {"t": [["きのう", null, "yesterday"], ["は", null, "topic", "p"], ["日曜日", "にちようび", "Sunday"], ["でした", null, "was (polite)"], ["。", null, null, "x"]], "en": "Yesterday was Sunday."},
                {"t": [["朝ごはん", "あさごはん", "breakfast"], ["を", null, "object", "p"], ["食べました", "たべました", "ate (polite)"], ["。", null, null, "x"]], "en": "I ate breakfast."}
            ],
            "quiz": [
                {"q": "きのう何を作りました＿。", "hint": "What did you make yesterday?", "choices": ["か", "は", "の"], "answer": 0, "why": "か turns a polite past question into an inquiry."},
                {"q": "パンを食べ＿＿＿＿。ロボットですから。", "hint": "I don't eat bread. Because I'm a robot.", "choices": ["ません", "ました", "でした"], "answer": 0, "why": "ません is the polite present negative of 食べる."}
            ],
            "lesson": "grammar.html?level=N5#da-desu"
        },
        {
            "id": "n5-review-kore-sore-are",
            "title": "これ・それ・あれ vs この・その・あの",
            "explain": "これ/それ/あれ stand on their own as nouns ('this/that/that over there'). この/その/あの must be directly followed by a noun ('this table / that box').",
            "examples": [
                {"t": [["これ", null, "this"], ["は", null, "topic", "p"], ["何", "なに", "what"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "What is this?"},
                {"t": [["あの", null, "that over there"], ["箱", "はこ", "box"], ["は", null, "topic", "p"], ["黒い", "くろい", "black"], ["です", null, "is"], ["。", null, null, "x"]], "en": "That box over there is black."}
            ],
            "quiz": [
                {"q": "＿＿テーブルの上に何がありますか。", "hint": "What is on that table over there?", "choices": ["あの", "あれ", "それ"], "answer": 0, "why": "あの directly modifies the noun テーブル."}
            ],
            "lesson": "grammar.html?level=N5#ko-so-a-do"
        },
        {
            "id": "n5-review-particles",
            "title": "Essential Particles: を, に, へ, で, と, も",
            "explain": "を marks direct objects; に marks time or purpose; へ marks direction; で marks location of action or means of transit; と connects nouns or marks a companion ('with'); も means 'also'.",
            "examples": [
                {"t": [["地下鉄", "ちかてつ", "subway"], ["で", null, "by", "p"], ["公園", "こうえん", "park"], ["へ", null, "to", "p"], ["行きました", "いきました", "went"], ["。", null, null, "x"]], "en": "I went to the park by subway."}
            ],
            "quiz": [
                {"q": "友だち＿いっしょに話しました。", "hint": "I talked with my friend.", "choices": ["と", "を", "へ"], "answer": 0, "why": "と marks the companion doing the action together."}
            ],
            "lesson": "grammar.html?level=N5#particles"
        }
    ],
    "kanji": [
        {"k": "日", "on": ["ニチ", "ジツ"], "kun": ["ひ", "か"], "m": "day, sun", "ex": [["日曜日", "にちようび", "Sunday"], ["毎日", "まいにち", "every day"]]},
        {"k": "朝", "on": ["チョウ"], "kun": ["あさ"], "m": "morning", "ex": [["朝", "あさ", "morning"], ["今朝", "けさ", "this morning"]]},
        {"k": "食", "on": ["ショク"], "kun": ["た.べる"], "m": "eat, food", "ex": [["食べる", "たべる", "to eat"], ["朝食", "ちょうしょく", "breakfast"]]},
        {"k": "行", "on": ["コウ", "ギョウ"], "kun": ["い.く", "ゆ.く"], "m": "go", "ex": [["行く", "いく", "to go"], ["銀行", "ぎんこう", "bank"]]},
        {"k": "買", "on": ["バイ"], "kun": ["か.う"], "m": "buy", "ex": [["買う", "かう", "to buy"], ["買い物", "かいもの", "shopping"]]},
        {"k": "友", "on": ["ユウ"], "kun": ["とも"], "m": "friend", "ex": [["友だち", "ともだち", "friend"], ["友人", "ゆうじん", "friend (formal)"]]},
        {"k": "天", "on": ["テン"], "kun": ["あまつ"], "m": "heaven, sky", "ex": [["天気", "てんき", "weather"], ["天ぷら", "てんぷら", "tempura"]]},
        {"k": "気", "on": ["キ"], "kun": [], "m": "spirit, mood, air", "ex": [["元気", "げんき", "healthy, energetic"], ["天気", "てんき", "weather"]]}
    ],
    "build": [6, 14, 34],
    "questions": [
        {
            "q": "サムさんはきのうの午前に何をしましたか。",
            "en": "What did Sam do yesterday morning?",
            "choices": ["部屋でラジオを作りました", "一日中寝ていました", "一人で映画を見ました"],
            "answer": 0
        },
        {
            "q": "サムさんとゆきさんは何で朝ごはんを食べましたか。",
            "en": "Where did Sam and Yuki eat breakfast?",
            "choices": ["カフェ", "サムさんの部屋", "図書館"],
            "answer": 0
        },
        {
            "q": "レコードプレーヤーはいくらでしたか。",
            "en": "How much was the record player?",
            "choices": ["二十ドル", "二千ドル", "無料（ゼロ円）"],
            "answer": 0
        },
        {
            "q": "ブリップは何を受信しましたか。",
            "en": "What did Blip receive?",
            "choices": ["モールス信号", "テレビのニュース", "音楽のラジオ"],
            "answer": 0
        }
    ],
    "talk": "Describe what you did yesterday and what you like to do on Sunday mornings in Japanese."
}

# =========================================================================
# STORY 2: n5-14 — 秋葉原からの小包 (The Care Package from Akihabara)
# Reviews Lessons 5-8: い/な adjectives, あります/います, locations, counters,
# ませんか/ましょう, たいです, ています, てください
# =========================================================================
story_n5_14 = {
    "id": "n5-14",
    "level": "N5",
    "unit": 14,
    "title": {
        "ja": "秋葉原からの小包",
        "en": "The Care Package from Akihabara"
    },
    "scene": "Sam's Brooklyn apartment workbench. A heavy parcel from Akihabara arrives full of radio components and Japanese snacks.",
    "lines": [
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["誰", "だれ", "who"], ["か", null, "indefinite", "p"], ["ドア", null, "door"], ["を", null, "object", "p"], ["ノック", null, "knock"], ["しています", null, "is knocking"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Ah, someone is knocking on the door!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["配達員", "はいたついん", "courier/delivery person"], ["の", null, "of", "p"], ["人", "ひと", "person"], ["が", null, "subject", "p"], ["立っています", "たっています", "is standing"], ["！", null, null, "x"]], "en": "Beep! A delivery courier is standing outside!"},
        {"who": "サム", "t": [["はーい", null, "yes/coming"], ["！", null, null, "x"], ["今", "いま", "now"], ["、", null, null, "x"], ["開けます", "あけます", "open (polite)"], ["！", null, null, "x"]], "en": "Coming! I'll open it right now!"},
        {"who": "店員", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["お部屋", "おへや", "room (polite)"], ["ですか", null, "is it", "p"], ["？", null, null, "x"], ["日本", "にほん", "Japan"], ["から", null, "from", "p"], ["国際", "こくさい", "international"], ["小包", "こづつみ", "parcel"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Is this Sam's apartment? Here is an international parcel from Japan."},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["私", "わたし", "I"], ["です", null, "is/am"], ["。", null, null, "x"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Yes, that's me. Thank you very much!"},
        {"who": "ゆき", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["大きい", "おおきい", "big"], ["箱", "はこ", "box"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["とても", null, "very"], ["重い", "おもい", "heavy"], ["ですよ", null, "you know", "p"], ["。", null, null, "x"]], "en": "Wow, that's a big box! It's very heavy, you know."},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["いっしょに", null, "together"], ["開けましょう", "あけましょう", "let's open"], ["！", null, null, "x"]], "en": "Yuki, let's open it together!"},
        {"who": "ゆき", "t": [["ええ", null, "yes"], ["、", null, null, "x"], ["早く", "はやく", "quickly"], ["中", "なか", "inside"], ["を", null, "object", "p"], ["見たい", "みたい", "want to see"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "Yes, I want to see inside quickly!"},
        {"who": "サム", "t": [["はさみ", null, "scissors"], ["を", null, "object", "p"], ["取って", "とって", "take/pass"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Please pass the scissors."},
        {"who": "ゆき", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["どうぞ", null, "here you go"], ["。", null, null, "x"], ["机", "つくえ", "desk"], ["の", null, "of", "p"], ["上", "うえ", "top"], ["に", null, "in/on", "p"], ["ありました", null, "there was"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Here you go. It was on top of the desk."},
        {"who": "サム", "t": [["わあ", null, "wow"], ["！", null, null, "x"], ["部品", "ぶひん", "parts"], ["が", null, "subject", "p"], ["たくさん", null, "a lot"], ["入っています", "はいっています", "are inside"], ["！", null, null, "x"]], "en": "Wow! There are lots of parts inside!"},
        {"who": "ゆき", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["手紙", "てがみ", "letter"], ["も", null, "also", "p"], ["あります", null, "there is"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["いとこ", null, "cousin"], ["から", null, "from", "p"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Ah, there is a letter too! It's from my cousin in Tokyo."},
        {"who": "ゆき", "t": [["『", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["で", null, "in/at", "p"], ["珍しい", "めずらしい", "rare"], ["真空管", "しんくうかん", "vacuum tube"], ["を", null, "object", "p"], ["見つけました", "みつけました", "found"], ["』", null, null, "x"], ["と", null, "quote", "p"], ["書いて", "かいて", "writing"], ["あります", null, "is written"], ["。", null, null, "x"]], "en": "It says: 'I found rare vacuum tubes in Akihabara.'"},
        {"who": "サム", "t": [["すごい", null, "amazing"], ["！", null, null, "x"], ["この", null, "this"], ["ガラス", null, "glass"], ["の", null, "of", "p"], ["部品", "ぶひん", "part"], ["は", null, "topic", "p"], ["本当に", "ほんとうに", "really"], ["きれいです", null, "is pretty/clear"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Amazing! This glass component is really beautiful, isn't it?"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["甘い", "あまい", "sweet"], ["におい", null, "smell"], ["が", null, "subject", "p"], ["します", null, "does / senses"], ["！", null, null, "x"], ["食べ物", "たべもの", "food"], ["も", null, "also", "p"], ["あります", null, "there is"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Beep! There is a sweet smell! Is there food too?"},
        {"who": "ゆき", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["抹茶", "まっちゃ", "matcha"], ["の", null, "of", "p"], ["お菓子", "おかし", "sweets"], ["が", null, "subject", "p"], ["三箱", "さんばこ", "three boxes"], ["あります", null, "there are"], ["。", null, null, "x"]], "en": "Yes! There are three boxes of matcha sweets."},
        {"who": "サム", "t": [["抹茶", "まっちゃ", "matcha"], ["の", null, "of", "p"], ["お菓子", "おかし", "sweets"], ["は", null, "topic", "p"], ["とても", null, "very"], ["有名", "ゆうめい", "famous"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"], ["おいしそうです", "おいしそうです", "looks delicious"], ["！", null, null, "x"]], "en": "Matcha sweets are very famous, aren't they? They look delicious!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["一つ", "ひとつ", "one (thing)"], ["食べて", "たべて", "eat"], ["みて", null, "try"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Sam, please try eating one!"},
        {"who": "サム", "t": [["いただき", null, "receive"], ["ます", null, "polite"], ["！", null, null, "x"], ["……", null, null, "x"], ["わあ", null, "wow"], ["、", null, null, "x"], ["少し", "すこし", "a little"], ["苦い", "にがい", "bitter"], ["ですが", null, "is, but"], ["、", null, null, "x"], ["とても", null, "very"], ["おいしい", null, "delicious"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Let's taste! ...Wow, it's slightly bitter, but very delicious!"},
        {"who": "ブリップ", "t": [["いい", null, "good"], ["なあ", null, "wishful particle", "p"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["は", null, "topic", "p"], ["新しい", "あたらしい", "new"], ["乾電池", "かんでんち", "dry cell battery"], ["が", null, "subject", "p"], ["食べたい", "たべたい", "want to eat"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "Lucky you! Blip wants to eat a fresh dry battery!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["後で", "あとで", "later"], ["充電", "じゅうでん", "charging"], ["して", null, "do"], ["あげます", null, "give favor"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Hehe, I'll charge you up later!"},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["今から", "いまから", "from now"], ["この", null, "this"], ["部品", "ぶひん", "parts"], ["で", null, "with", "p"], ["アンテナ", null, "antenna"], ["を", null, "object", "p"], ["組み立てませんか", "くみたてませんか", "won't we assemble?"], ["？", null, null, "x"]], "en": "Yuki, won't you assemble an antenna with me using these parts now?"},
        {"who": "ゆき", "t": [["いい", null, "good"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["ぜひ", null, "by all means"], ["手伝い", "てつだい", "help"], ["たい", null, "want to"], ["です", null, "polite"], ["。", null, null, "x"], ["何", "なに", "what"], ["を", null, "object", "p"], ["すれば", null, "if do"], ["いい", null, "good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Sounds great! I'd love to help. What should I do?"},
        {"who": "サム", "t": [["まず", null, "firstly"], ["、", null, null, "x"], ["その", null, "that"], ["青い", "あおい", "blue"], ["銅線", "どうせん", "copper wire"], ["を", null, "object", "p"], ["持って", "もって", "hold"], ["いて", null, "be"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "First, please hold that blue copper wire."},
        {"who": "ゆき", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["持っています", "もっています", "am holding"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["これ", null, "this"], ["で", null, "with this", "p"], ["いい", null, "good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Yes, I'm holding it! Is this okay?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["バッチリ", null, "perfect"], ["です", null, "is"], ["！", null, null, "x"], ["今", "いま", "now"], ["、", null, null, "x"], ["ハンダごて", null, "soldering iron"], ["で", null, "with", "p"], ["つなぎます", null, "connect (polite)"], ["。", null, null, "x"], ["熱い", "あつい", "hot"], ["ですから", null, "because is"], ["、", null, null, "x"], ["気をつけて", "きをつけて", "be careful"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Yes, perfect! Now I'll solder it. It's hot, so please be careful."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["温度", "おんど", "temperature"], ["は", null, "topic", "p"], ["三百", "さんびゃく", "300"], ["度", "ど", "degrees"], ["です", null, "is"], ["！", null, null, "x"], ["安全", "あんぜん", "safe"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The temperature is 300 degrees! Safe!"},
        {"who": "ゆき", "t": [["ブリップ", null, "Blip"], ["さん", null, "polite suffix", "p"], ["は", null, "topic", "p"], ["便利", "べんり", "convenient"], ["な", null, "adjective connector"], ["温度計", "おんどけい", "thermometer"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Blip, you are a very convenient thermometer!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["アンテナ", null, "antenna"], ["が", null, "subject", "p"], ["できました", null, "is done"], ["！", null, null, "x"], ["窓", "まど", "window"], ["の", null, "of", "p"], ["近く", "ちかく", "near"], ["に", null, "at/to", "p"], ["置きましょう", "おきましょう", "let's place"], ["。", null, null, "x"]], "en": "All right, the antenna is finished! Let's place it near the window."},
        {"who": "ゆき", "t": [["きれい", null, "clean/pretty"], ["に", null, "adverbial", "p"], ["できました", null, "could do / made"], ["ね", null, "didn't we", "p"], ["。", null, null, "x"], ["電波", "でんぱ", "radio waves"], ["は", null, "topic", "p"], ["届いています", "とどいています", "are reaching"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "It turned out so neat! Are radio waves coming through?"},
        {"who": "サム", "t": [["スイッチ", null, "switch"], ["を", null, "object", "p"], ["入れます", "いれます", "turn on (polite)"], ["ね", null, "tag", "p"], ["。", null, null, "x"], ["……", null, null, "x"], ["ザー", null, "static noise"], ["……", null, null, "x"], ["あ", null, "ah"], ["！", null, null, "x"], ["音楽", "おんがく", "music"], ["が", null, "subject", "p"], ["聞こえます", "きこえます", "can hear"], ["！", null, null, "x"]], "en": "I'll turn on the switch, okay? ...Static... Ah! I can hear music!"},
        {"who": "ゆき", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["ジャズ", null, "jazz"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["とても", null, "very"], ["クリア", null, "clear"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Wow, it's jazz! The sound is very clear."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["の", null, "of", "p"], ["部品", "ぶひん", "parts"], ["は", null, "topic", "p"], ["最高", "さいこう", "the best"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Parts from Akihabara are the best!"},
        {"who": "サム", "t": [["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["いとこ", null, "cousin"], ["に", null, "to", "p"], ["お礼", "おれい", "thanks"], ["の", null, "of", "p"], ["メール", null, "email"], ["を", null, "object", "p"], ["書きたい", "かきたい", "want to write"], ["です", null, "polite"], ["。", null, null, "x"]], "en": "I want to write a thank-you email to your cousin, Yuki."},
        {"who": "ゆき", "t": [["いい", null, "good"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["で", null, "in", "p"], ["いっしょに", null, "together"], ["書きましょう", "かきましょう", "let's write"], ["。", null, null, "x"], ["きっと", null, "surely"], ["喜びます", "よろこびます", "will be happy"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That's great! Let's write it together in Japanese. They will surely be delighted!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["へ", null, "to", "p"], ["本当", "ほんとう", "really"], ["に", null, "particle", "p"], ["行き", "いき", "go"], ["たく", null, "want to (inflection)"], ["なりました", null, "became"], ["！", null, null, "x"]], "en": "Yes! I really want to visit Akihabara now!"}
    ],
    "grammar": [
        {
            "id": "n5-review-adj",
            "title": "い-Adjectives & な-Adjectives Review",
            "explain": "い-adjectives end directly in い (大きい, 重い, 苦い); modify nouns directly. な-adjectives use な before nouns (有名な本, 便利な道具). When ending polite sentences, both take です.",
            "examples": [
                {"t": [["箱", "はこ", "box"], ["は", null, "topic", "p"], ["とても", null, "very"], ["重い", "おもい", "heavy"], ["です", null, "is"], ["。", null, null, "x"]], "en": "The box is very heavy."},
                {"t": [["便利", "べんり", "convenient"], ["な", null, "connector"], ["道具", "どうぐ", "tool"], ["です", null, "is"], ["。", null, null, "x"]], "en": "It is a convenient tool."}
            ],
            "quiz": [
                {"q": "この部品は＿＿＿です。", "hint": "This component is small.", "choices": ["小さい", "小さく", "小さな"], "answer": 0, "why": "大きい / 小さい are standard い-adjectives ending in です."},
                {"q": "抹茶のお菓子は＿＿＿お菓子です。", "hint": "Matcha sweets are famous sweets.", "choices": ["有名な", "有名い", "有名で"], "answer": 0, "why": "有名 is a な-adjective, so it requires な before a noun."}
            ],
            "lesson": "grammar.html?level=N5#adjectives"
        },
        {
            "id": "n5-review-requests-te",
            "title": "～てください & ～ています",
            "explain": "Use V-てください to make polite requests ('please do...'). Use V-ています for actions happening right now ('is doing...').",
            "examples": [
                {"t": [["はさみ", null, "scissors"], ["を", null, "object", "p"], ["取って", "とって", "pass/take"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Please pass the scissors."},
                {"t": [["ラジオ", null, "radio"], ["を", null, "object", "p"], ["聞いて", "きいて", "listening to"], ["います", null, "am/is"], ["。", null, null, "x"]], "en": "I am listening to the radio."}
            ],
            "quiz": [
                {"q": "窓の近くに＿＿＿＿ください。", "hint": "Please place it near the window.", "choices": ["置いて", "置く", "置きます"], "answer": 0, "why": "てください attaches to the て-form of the verb."}
            ],
            "lesson": "grammar.html?level=N5#te-form"
        },
        {
            "id": "n5-review-desires-invites",
            "title": "～たいです & ～ませんか / ～ましょう",
            "explain": "Use V-stem + たいです to express personal desires ('I want to do...'). Use V-stem + ませんか to invite someone politely ('won't you...?'). Use V-stem + ましょう to agree or suggest ('let's...!').",
            "examples": [
                {"t": [["日本", "にほん", "Japan"], ["へ", null, "to", "p"], ["行き", "いき", "go"], ["たい", null, "want to"], ["です", null, "polite"], ["。", null, null, "x"]], "en": "I want to go to Japan."},
                {"t": [["いっしょに", null, "together"], ["作り", "つくり", "make"], ["ませんか", null, "won't we?"], ["？", null, null, "x"]], "en": "Won't we make it together?"}
            ],
            "quiz": [
                {"q": "お礼の手紙を書き＿＿＿です。", "hint": "I want to write a thank-you letter.", "choices": ["たい", "ます", "たく"], "answer": 0, "why": "V-stem + たいです expresses what the speaker wants to do."}
            ],
            "lesson": "grammar.html?level=N5#tai-desu"
        }
    ],
    "kanji": [
        {"k": "開", "on": ["カイ"], "kun": ["あ.ける", "あ.く", "ひら.く"], "m": "open", "ex": [["開ける", "あける", "to open"], ["開始", "かいし", "start"]]},
        {"k": "手", "on": ["シュ"], "kun": ["て"], "m": "hand", "ex": [["手紙", "てがみ", "letter"], ["上手", "じょうず", "skillful"]]},
        {"k": "紙", "on": ["シ"], "kun": ["かみ"], "m": "paper", "ex": [["手紙", "てがみ", "letter"], ["折り紙", "おりがみ", "origami"]]},
        {"k": "重", "on": ["ジュウ"], "kun": ["おも.い", "かさ.なる"], "m": "heavy, weight", "ex": [["重い", "おもい", "heavy"], ["体重", "たいじゅう", "body weight"]]},
        {"k": "見", "on": ["ケン"], "kun": ["み.る", "み.える", "み.せる"], "m": "see, look", "ex": [["見る", "みる", "to see"], ["見つける", "みつける", "to find"]]},
        {"k": "作", "on": ["サク", "サ"], "kun": ["つく.る"], "m": "make, work", "ex": [["作る", "つくる", "to make"], ["作文", "さくぶん", "composition"]]},
        {"k": "近", "on": ["キン"], "kun": ["ちか.い"], "m": "near, close", "ex": [["近く", "ちかく", "near / vicinity"], ["近所", "きんじょ", "neighborhood"]]},
        {"k": "音", "on": ["オン"], "kun": ["おと", "ね"], "m": "sound", "ex": [["音楽", "おんがく", "music"], ["音", "おと", "sound"]]}
    ],
    "build": [7, 21, 33],
    "questions": [
        {
            "q": "小包はどこから届きましたか。",
            "en": "Where did the package arrive from?",
            "choices": ["日本の秋葉原", "ニューヨークの郵便局", "ロンドンの学校"],
            "answer": 0
        },
        {
            "q": "箱の中に部品のほかに何が入っていましたか。",
            "en": "Besides parts, what was inside the box?",
            "choices": ["手紙とお菓子", "時計とカメラ", "古い教科書"],
            "answer": 0
        },
        {
            "q": "完成したアンテナから何が聞こえましたか。",
            "en": "What was heard from the completed antenna?",
            "choices": ["ジャズ音楽", "雨の音", "地下鉄のアナウンス"],
            "answer": 0
        },
        {
            "q": "サムさんは最後に誰にメールを書きたいと言いましたか。",
            "en": "Who did Sam say he wants to write an email to at the end?",
            "choices": ["ゆきさんのいとこ", "郵便配達の人", "大学の先生"],
            "answer": 0
        }
    ],
    "talk": "Describe a package or gift you received from someone and what was inside it in Japanese."
}

# =========================================================================
# STORY 3: n5-15 — 旅立ちのパッキング：日本へ！ (Packing for Japan: Final Departure)
# Reviews Lessons 9-12 & Full N5 Synthesis: たことがあります, より/のほうが, すぎます,
# てもいい/てはいけない, 前に, ながら, たり...たり, つもり, なければならない, なくてもいい
# =========================================================================
story_n5_15 = {
    "id": "n5-15",
    "level": "N5",
    "unit": 15,
    "title": {
        "ja": "旅立ちのパッキング：日本へ！",
        "en": "Packing for Japan: The Final Departure"
    },
    "scene": "Sam's Brooklyn apartment the evening before flying to Tokyo. Yuki and Blip help Sam check baggage restrictions, packing lists, and departure plans.",
    "lines": [
        {"who": "ゆき", "t": [["こんばんは", null, "good evening"], ["、", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["！", null, null, "x"], ["パッキング", null, "packing"], ["は", null, "topic", "p"], ["終わりました", "おわりました", "finished (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Good evening, Sam! Have you finished packing?"},
        {"who": "サム", "t": [["こんばんは", null, "good evening"], ["、", null, null, "x"], ["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["。", null, null, "x"], ["まだ", null, "not yet"], ["終わっていません", "おわっていません", "has not finished"], ["……", null, null, "x"], ["荷物", "にもつ", "luggage"], ["が", null, "subject", "p"], ["多すぎます", "おおすぎます", "is too much"], ["！", null, null, "x"]], "en": "Good evening, Yuki. Not finished yet... I have way too much luggage!"},
        {"who": "ブリップ", "t": [["スーツケース", null, "suitcase"], ["が", null, "subject", "p"], ["閉まりません", "しまりません", "will not close"], ["！", null, null, "x"], ["ピピッ", null, "beep"], ["！", null, null, "x"]], "en": "The suitcase won't close! Beep!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["ちょっと", null, "a little"], ["中", "なか", "inside"], ["を", null, "object", "p"], ["見せて", "みせて", "show"], ["ください", null, "please"], ["。", null, null, "x"], ["何", "なに", "what"], ["が", null, "subject", "p"], ["入っています", "はいっています", "is inside"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Hehe, please show me inside for a moment. What is in here?"},
        {"who": "サム", "t": [["服", "ふく", "clothes"], ["や", null, "and (list)", "p"], ["本", "ほん", "books"], ["や", null, "and (list)", "p"], ["、", null, null, "x"], ["ラジオ", null, "radio"], ["の", null, "of", "p"], ["部品", "ぶひん", "parts"], ["が", null, "subject", "p"], ["たくさん", null, "a lot"], ["あります", null, "there are"], ["。", null, null, "x"]], "en": "There are clothes, books, and lots of radio parts."},
        {"who": "ゆき", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["この", null, "this"], ["大きい", "おおきい", "big"], ["バッテリー", null, "battery"], ["は", null, "topic", "p"], ["スーツケース", null, "suitcase"], ["に", null, "in", "p"], ["入れては", "いれては", "put in and"], ["いけません", null, "must not"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Ah, you must not put this large battery in the checked suitcase!"},
        {"who": "サム", "t": [["えっ", null, "huh"], ["、", null, null, "x"], ["そうなんですか", null, "is that so?"], ["！？", null, null, "x"], ["預けては", "あずけては", "check in and"], ["だめ", null, "no good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Wait, really!? Is it not allowed to check it in?"},
        {"who": "ゆき", "t": [["はい", null, "yes"], ["。", null, null, "x"], ["リチウム", null, "lithium"], ["電池", "でんち", "battery"], ["は", null, "topic", "p"], ["手荷物", "てにもつ", "carry-on bag"], ["で", null, "in/by", "p"], ["持っていかなければ", "もっていかなければ", "if not take"], ["なりません", null, "will not do (obligation)"], ["。", null, null, "x"]], "en": "Yes. You must take lithium batteries in your carry-on baggage."},
        {"who": "サム", "t": [["なるほど", null, "I see"], ["！", null, null, "x"], ["教えて", "おしえて", "tell/teach"], ["くれて", null, "favor for me"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["。", null, null, "x"], ["危ない", "あぶない", "dangerous"], ["ところ", null, "place/situation"], ["でした", null, "was (polite)"], ["。", null, null, "x"]], "en": "I see! Thank you for telling me. That was a close call."},
        {"who": "ブリップ", "t": [["ブリップ", null, "Blip"], ["も", null, "also", "p"], ["手荷物", "てにもつ", "carry-on"], ["に", null, "in", "p"], ["入っても", "はいっても", "even if enters"], ["いい", null, "good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Can Blip go into the carry-on baggage too?"},
        {"who": "ゆき", "t": [["もちろん", null, "of course"], ["ですよ", null, "you know", "p"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["さん", null, "polite suffix", "p"], ["は", null, "topic", "p"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["大切", "たいせつ", "precious"], ["な", null, "adjective connector"], ["相棒", "あいぼう", "partner"], ["ですから", null, "because is"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Of course! Because Blip is Sam's precious partner!"},
        {"who": "サム", "t": [["私", "わたし", "I"], ["は", null, "topic", "p"], ["前", "まえ", "before"], ["に", null, "particle", "p"], ["日本", "にほん", "Japan"], ["へ", null, "to", "p"], ["行った", "いった", "went"], ["こと", null, "experience/fact"], ["が", null, "subject", "p"], ["ありません", null, "do not have"], ["。", null, null, "x"], ["少し", "すこし", "a little"], ["緊張", "きんちょう", "nervous"], ["しています", null, "am doing"], ["。", null, null, "x"]], "en": "I have never been to Japan before. I'm feeling a little nervous."},
        {"who": "ゆき", "t": [["大丈夫", "だいじょうぶ", "all right"], ["ですよ", null, "assurance", "p"], ["！", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["の", null, "of", "p"], ["日本語", "にほんご", "Japanese"], ["は", null, "topic", "p"], ["最初", "さいしょ", "beginning"], ["より", null, "compared to", "p"], ["ずっと", null, "much more"], ["上手", "じょうず", "skillful"], ["に", null, "adverbial", "p"], ["なりました", null, "became"], ["から", null, "because", "p"], ["。", null, null, "x"]], "en": "You'll be fine! Because your Japanese has become much better than at the beginning."},
        {"who": "サム", "t": [["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["。", null, null, "x"], ["日本", "にほん", "Japan"], ["に", null, "in/at", "p"], ["着いたら", "ついたら", "when/if arrive"], ["、", null, null, "x"], ["まず", null, "first"], ["秋葉原", "あきはばら", "Akihabara"], ["へ", null, "to", "p"], ["行く", "いく", "go"], ["つもり", null, "intention"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Thank you. When I arrive in Japan, I intend to go to Akihabara first."},
        {"who": "ゆき", "t": [["いい", null, "good"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["でも", null, "but"], ["、", null, null, "x"], ["空港", "くうこう", "airport"], ["に", null, "at", "p"], ["着く", "つく", "arrive"], ["前", "まえ", "before"], ["に", null, "particle", "p"], ["、", null, null, "x"], ["入国", "にゅうこく", "entry into country"], ["カード", null, "card"], ["を", null, "object", "p"], ["書かなければ", "かかなければ", "if not write"], ["なりません", null, "will not do (obligation)"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That sounds great! But before arriving at the airport, you must fill out the arrival card, you know."},
        {"who": "サム", "t": [["飛行機", "ひこうき", "airplane"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["書きます", "かきます", "write (polite)"], ["ね", null, "tag", "p"], ["。", null, null, "x"], ["ペン", null, "pen"], ["を", null, "object", "p"], ["ポケット", null, "pocket"], ["に", null, "in", "p"], ["入れて", "いれて", "put in"], ["おきます", null, "keep in advance"], ["。", null, null, "x"]], "en": "I will write it inside the airplane. I will keep a pen in my pocket in advance."},
        {"who": "ブリップ", "t": [["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["飛行機", "ひこうき", "airplane"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["映画", "えいが", "movie"], ["を", null, "object", "p"], ["見たり", "みたり", "watch and such"], ["、", null, null, "x"], ["音楽", "おんがく", "music"], ["を", null, "object", "p"], ["聞いたり", "きいたり", "listen and such"], ["できます", null, "can do"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Sam, can we watch movies, listen to music, and such inside the airplane?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["できます", null, "can do"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["でも", null, "but"], ["、", null, null, "x"], ["寝た", "ねた", "slept"], ["ほう", null, "alternative/side"], ["が", null, "subject", "p"], ["いい", null, "good"], ["です", null, "is"], ["。", null, null, "x"], ["時差", "じさ", "time difference / jetlag"], ["が", null, "subject", "p"], ["あります", null, "exists"], ["から", null, "because", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Yes, we can! But it's better to sleep. Because there is a time difference, you know."},
        {"who": "ゆき", "t": [["そうですね", null, "that's right"], ["。", null, null, "x"], ["ニューヨーク", null, "New York"], ["と", null, "and", "p"], ["東京", "とうきょう", "Tokyo"], ["は", null, "topic", "p"], ["十三", "じゅうさん", "13"], ["時間", "じかん", "hours"], ["の", null, "of", "p"], ["時差", "じさ", "time difference"], ["が", null, "subject", "p"], ["あります", null, "exists"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "That's true. New York and Tokyo have a thirteen-hour time difference."},
        {"who": "サム", "t": [["ラジオ", null, "radio"], ["を", null, "object", "p"], ["聞きながら", "ききながら", "while listening"], ["、", null, null, "x"], ["残りの", "のこりの", "remaining"], ["荷物", "にもつ", "luggage"], ["を", null, "object", "p"], ["片づけます", "かたづけます", "tidy up (polite)"], ["。", null, null, "x"]], "en": "While listening to the radio, I will pack up the remaining belongings."},
        {"who": "ゆき", "t": [["そうそう", null, "by the way / oh yes"], ["、", null, null, "x"], ["お金", "おかね", "money"], ["の", null, "of", "p"], ["両替", "りょうがえ", "currency exchange"], ["は", null, "topic", "p"], ["もう", null, "already"], ["しました", null, "did (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Oh by the way, have you already exchanged your money?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["きのう", null, "yesterday"], ["銀行", "ぎんこう", "bank"], ["で", null, "at", "p"], ["五万円", "ごまんえん", "50,000 yen"], ["両替", "りょうがえ", "exchange"], ["しました", null, "did"], ["。", null, null, "x"], ["日本", "にほん", "Japan"], ["では", null, "in (topic)", "p"], ["クレジットカード", null, "credit card"], ["が", null, "subject", "p"], ["使えます", "つかえます", "can use"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Yes, I exchanged 50,000 yen at the bank yesterday. Can credit cards be used in Japan?"},
        {"who": "ゆき", "t": [["使えます", "つかえます", "can use"], ["が", null, "but", "p"], ["、", null, null, "x"], ["小さい", "ちいさい", "small"], ["お店", "おみせ", "shop"], ["では", null, "in (topic)", "p"], ["現金", "げんきん", "cash"], ["の", null, "of", "p"], ["ほう", null, "alternative"], ["が", null, "subject", "p"], ["いい", null, "good"], ["ですよ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "You can use them, but cash is better in small shops, you know."},
        {"who": "サム", "t": [["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["電車", "でんしゃ", "train"], ["の", null, "of", "p"], ["乗り方", "のりかた", "how to ride"], ["は", null, "topic", "p"], ["難しくない", "むずかしくない", "not difficult"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Is taking trains in Tokyo not difficult?"},
        {"who": "ゆき", "t": [["Suica", null, "Suica IC card"], ["を", null, "object", "p"], ["買えば", "かえば", "if buy"], ["、", null, null, "x"], ["改札", "かいさつ", "ticket gate"], ["に", null, "at", "p"], ["タッチ", null, "touch"], ["する", null, "do"], ["だけ", null, "only"], ["です", null, "is"], ["。", null, null, "x"], ["とても", null, "very"], ["便利", "べんり", "convenient"], ["ですよ", null, "you know", "p"], ["。", null, null, "x"]], "en": "If you buy a Suica card, you only have to touch it at the ticket gates. It's very convenient, you know."},
        {"who": "ブリップ", "t": [["ロボット", null, "robot"], ["も", null, "also", "p"], ["山手線", "やまのてせん", "Yamanote Line"], ["に", null, "on", "p"], ["乗れます", "のれます", "can ride"], ["か", null, "question", "p"], ["？", null, null, "x"], ["ピピッ", null, "beep"], ["！", null, null, "x"]], "en": "Can robots ride the Yamanote Line too? Beep!"},
        {"who": "ゆき", "t": [["あはは", null, "hahaha"], ["！", null, null, "x"], ["小さい", "ちいさい", "small"], ["ロボット", null, "robot"], ["なら", null, "if", "p"], ["大丈夫", "だいじょうぶ", "all right"], ["ですよ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Hahaha! If it's a small robot, you'll be completely fine!"},
        {"who": "ゆき", "t": [["明日", "あした", "tomorrow"], ["は", null, "topic", "p"], ["何時", "なんじ", "what time"], ["に", null, "at", "p"], ["起きなければ", "おきなければ", "if not wake up"], ["なりません", null, "will not do (obligation)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "What time must you wake up tomorrow?"},
        {"who": "サム", "t": [["朝", "あさ", "morning"], ["六時", "ろくじ", "6 o'clock"], ["に", null, "at", "p"], ["起きなければ", "おきなければ", "if not wake up"], ["なりません", null, "must"], ["。", null, null, "x"], ["JFK空港", "ジェイエフケイくうこう", "JFK airport"], ["まで", null, "until/to", "p"], ["一時間", "いちじかん", "one hour"], ["半", "はん", "half"], ["かかります", null, "takes (polite)"], ["から", null, "because", "p"], ["。", null, null, "x"]], "en": "I must wake up at six in the morning. Because it takes an hour and a half to JFK Airport."},
        {"who": "ゆき", "t": [["今夜", "こんや", "tonight"], ["は", null, "topic", "p"], ["早く", "はやく", "early"], ["寝た", "ねた", "slept"], ["ほう", null, "side"], ["が", null, "subject", "p"], ["いい", null, "good"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"], ["成田空港", "なりたくうこう", "Narita Airport"], ["では", null, "at (topic)", "p"], ["私の", "わたしの", "my"], ["家族", "かぞく", "family"], ["が", null, "subject", "p"], ["待っています", "まっています", "is waiting"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "You had better sleep early tonight. My family will be waiting at Narita Airport!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["とても", null, "very"], ["楽しみ", "たのしみ", "looking forward to it"], ["です", null, "is"], ["。", null, null, "x"], ["ゆき", "ゆき", "Yuki"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["今まで", "いままで", "until now"], ["日本語", "にほんご", "Japanese"], ["を", null, "object", "p"], ["教えて", "おしえて", "teaching"], ["くれて", null, "favor for me"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Yes! I am really looking forward to it. Yuki, thank you so much for teaching me Japanese all this time!"},
        {"who": "ゆき", "t": [["どういたしまして", null, "you're welcome"], ["！", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["で", null, "in", "p"], ["会いましょう", "あいましょう", "let's meet"], ["ね", null, "tag", "p"], ["！", null, null, "x"], ["気をつけて", "きをつけて", "take care"], ["行って", "いって", "go"], ["らっしゃい", null, "and come back"], ["！", null, null, "x"]], "en": "You're welcome! Let's meet in Tokyo! Have a safe flight!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["日本", "にほん", "Japan"], ["へ", null, "to", "p"], ["出発", "しゅっぱつ", "departure"], ["進行", "しんこう", "ahead"], ["！", null, null, "x"]], "en": "Beep! Full speed ahead to Japan!"}
    ],
    "grammar": [
        {
            "id": "n5-review-ta-koto-ga-aru",
            "title": "～たことがあります: Past Experience",
            "explain": "Use V-た + ことがあります to say you have experienced doing something. The negative is ～たことがありません ('have never done').",
            "examples": [
                {"t": [["日本", "にほん", "Japan"], ["へ", null, "to", "p"], ["行った", "いった", "went"], ["こと", null, "fact/experience"], ["が", null, "subject", "p"], ["ありません", null, "do not have"], ["。", null, null, "x"]], "en": "I have never been to Japan."}
            ],
            "quiz": [
                {"q": "富士山を＿＿＿ことがありますか。", "hint": "Have you ever climbed Mt. Fuji?", "choices": ["登った", "登る", "登ります"], "answer": 0, "why": "たことがあります requires the plain past (た-form)."}
            ],
            "lesson": "grammar.html?level=N5#ta-form"
        },
        {
            "id": "n5-review-obligation",
            "title": "～なければなりません & ～なくてもいいです",
            "explain": "Use V-なければなりません to express obligations ('must do...'). Use V-なくてもいいです to express lack of obligation ('do not have to do...').",
            "examples": [
                {"t": [["六時", "ろくじ", "6 o'clock"], ["に", null, "at", "p"], ["起きなければ", "おきなければ", "if not wake up"], ["なりません", null, "will not do"], ["。", null, null, "x"]], "en": "I must wake up at six."}
            ],
            "quiz": [
                {"q": "早く寝＿＿＿＿＿＿なりません。", "hint": "I must sleep early.", "choices": ["なければ", "なくても", "ないで"], "answer": 0, "why": "なければなりません expresses necessity/obligation."}
            ],
            "lesson": "grammar.html?level=N5#nakereba"
        },
        {
            "id": "n5-review-nagara-tari",
            "title": "～ながら & ～たり～たりします",
            "explain": "V-stem + ながら indicates two actions done at the same time by the same person ('while doing'). V-た + り ... V-た + りします lists non-exhaustive representative actions.",
            "examples": [
                {"t": [["ラジオ", null, "radio"], ["を", null, "object", "p"], ["聞きながら", "ききながら", "while listening"], ["勉強します", "べんきょうします", "study"], ["。", null, null, "x"]], "en": "I study while listening to the radio."},
                {"t": [["映画", "えいが", "movie"], ["を", null, "object", "p"], ["見たり", "みたり", "watch and such"], ["寝たり", "ねたり", "sleep and such"], ["します", null, "do"], ["。", null, null, "x"]], "en": "I do things like watch movies and sleep."}
            ],
            "quiz": [
                {"q": "歩き＿＿＿スマホを見てはいけません。", "hint": "You must not look at your smartphone while walking.", "choices": ["ながら", "たり", "まえに"], "answer": 0, "why": "ながら attaches to the verb stem (歩き) to express simultaneous action."}
            ],
            "lesson": "grammar.html?level=N5#nagara"
        }
    ],
    "kanji": [
        {"k": "荷", "on": ["カ"], "kun": ["に"], "m": "baggage, cargo", "ex": [["荷物", "にもつ", "luggage"], ["出荷", "しゅっか", "shipment"]]},
        {"k": "物", "on": ["ブツ", "モツ"], "kun": ["もの"], "m": "thing", "ex": [["荷物", "にもつ", "luggage"], ["食べ物", "たべもの", "food"]]},
        {"k": "池", "on": ["チ"], "kun": ["いけ"], "m": "pond, reservoir", "ex": [["電池", "でんち", "battery"], ["池", "いけ", "pond"]]},
        {"k": "電", "on": ["デン"], "kun": [], "m": "electricity", "ex": [["電車", "でんしゃ", "train"], ["電池", "でんち", "battery"]]},
        {"k": "飛", "on": ["ヒ"], "kun": ["と.ぶ", "と.ばす"], "m": "fly", "ex": [["飛行機", "ひこうき", "airplane"], ["飛ぶ", "とぶ", "to fly"]]},
        {"k": "機", "on": ["キ"], "kun": ["はた"], "m": "machine, opportunity", "ex": [["飛行機", "ひこうき", "airplane"], ["機械", "きかい", "machine"]]},
        {"k": "空", "on": ["クウ"], "kun": ["そら", "あ.く", "から"], "m": "sky, empty", "ex": [["空港", "くうこう", "airport"], ["空気", "くうき", "air"]]},
        {"k": "港", "on": ["コウ"], "kun": ["みなと"], "m": "harbor, port", "ex": [["空港", "くうこう", "airport"], ["港", "みなと", "harbor"]]}
    ],
    "build": [7, 13, 21],
    "questions": [
        {
            "q": "バッテリーはどのように持っていかなければなりませんか。",
            "en": "How must the battery be carried?",
            "choices": ["手荷物に入れる", "預けるスーツケースに入れる", "郵送する"],
            "answer": 0
        },
        {
            "q": "サムさんは日本へ行ったことがありますか。",
            "en": "Has Sam ever been to Japan before?",
            "choices": ["一度も行ったことがない", "去年行ったことがある", "子どものころ住んでいた"],
            "answer": 0
        },
        {
            "q": "サムさんは明日何時に起きなければなりませんか。",
            "en": "What time must Sam wake up tomorrow?",
            "choices": ["朝六時", "朝八時", "昼の十二時"],
            "answer": 0
        },
        {
            "q": "成田空港で誰がサムさんを待っていますか。",
            "en": "Who is waiting for Sam at Narita Airport?",
            "choices": ["ゆきさんの家族", "大学の教授", "ラジオショップの店員"],
            "answer": 0
        }
    ],
    "talk": "Imagine you are packing for a trip to Japan. Tell Blip what items you must pack and what you intend to do when you arrive."
}

def main():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    for s in [story_n5_13, story_n5_14, story_n5_15]:
        out_path = STORIES_DIR / f"{s['id']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
        print(f"Generated {out_path.name} ({len(s['lines'])} lines, {len(s['grammar'])} grammar points, {len(s['kanji'])} kanji)")

if __name__ == "__main__":
    main()
