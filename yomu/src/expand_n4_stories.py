#!/usr/bin/env python3
"""
Full Authoring & Generation Script for all 6 N4 Capstone Stories (n4-13 to n4-18).
Ensures all stories have between 32 and 36 dialogue lines, satisfying the 30-80 constraint,
with full ruby tokenization, grammar points, kanji list, quizzes, and questions.
"""

import json
from pathlib import Path

null = None
STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"

# =========================================================================
# STORY 1: n4-13 (32 lines) — 放課後の下北沢散策
# =========================================================================
from generate_n4_capstones import story_n4_13

# =========================================================================
# STORY 2: n4-14 (32 lines) — 出発前夜のトラブルと準備
# =========================================================================
story_n4_14 = {
    "id": "n4-14",
    "level": "N4",
    "unit": 14,
    "title": {
        "ja": "出発前夜のトラブルと準備",
        "en": "Pre-Trip Preparations & Mishaps (Unit 2 Review)"
    },
    "scene": "Sam's room in Tokyo on the night before traveling to Kyoto. A sudden storm blows through an open window, causing a scramble with documents, luggage, and radio parts.",
    "lines": [
        {"who": "サム", "t": [["京都", "きょうと", "Kyoto"], ["へ", null, "to", "p"], ["行く", "いく", "go"], ["こと", null, "nominalizer"], ["に", null, "to", "p"], ["した", null, "decided"], ["から", null, "because", "p"], ["、", null, null, "x"], ["しっかり", null, "thoroughly"], ["準備", "じゅんび", "preparations"], ["して", null, "do"], ["おかない", null, "not keep in advance"], ["と", null, "if", "p"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Since I decided to go to Kyoto, I have to prepare thoroughly in advance."},
        {"who": "ゆき", "t": [["新幹線", "しんかんせん", "Shinkansen"], ["の", null, "of", "p"], ["切符", "きっぷ", "ticket"], ["は", null, "topic", "p"], ["もう", null, "already"], ["買って", "かって", "bought"], ["ある", null, "exists (state)"], ["の", null, "question", "p"], ["？", null, null, "x"]], "en": "Have the bullet train tickets already been bought?"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["安く", "やすく", "cheaply"], ["乗る", "のる", "ride"], ["ため", null, "in order to"], ["に", null, "for", "p"], ["、", null, null, "x"], ["ネット", null, "internet"], ["で", null, "by/on", "p"], ["予約", "よやく", "reservation"], ["して", null, "do"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah! In order to ride cheaply, I reserved them online in advance."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["風", "かぜ", "wind"], ["が", null, "subject", "p"], ["強い", "つよい", "strong"], ["です", null, "is"], ["！", null, null, "x"], ["窓", "まど", "window"], ["が", null, "subject", "p"], ["開いた", "あいた", "opened"], ["まま", null, "left as is"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The wind is strong! The window has been left open!"},
        {"who": "ゆき", "t": [["きゃあ", null, "eek"], ["！", null, null, "x"], ["机", "つくえ", "desk"], ["の", null, "of", "p"], ["書類", "しょるい", "documents"], ["が", null, "subject", "p"], ["飛んじゃう", "とんじゃう", "end up flying away"], ["！", null, null, "x"], ["早く", "はやく", "quickly"], ["窓", "まど", "window"], ["を", null, "object", "p"], ["閉めて", "しめて", "close"], ["！", null, null, "x"]], "en": "Eek! The papers on the desk will blow away! Quick, close the window!"},
        {"who": "サム", "t": [["わあ", null, "whoa"], ["！", null, null, "x"], ["今", "いま", "now"], ["、", null, null, "x"], ["閉める", "しめる", "close"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["……", null, null, "x"], ["バタン", null, "slam"], ["！", null, null, "x"], ["ふう", null, "phew"], ["、", null, null, "x"], ["危なかった", "あぶなかった", "was close call"], ["。", null, null, "x"]], "en": "Whoa! I'll close it right now! ...Slam! Phew, that was close."},
        {"who": "ブリップ", "t": [["ああっ", null, "ah!"], ["！", null, null, "x"], ["ブリップ", null, "Blip"], ["の", null, "of", "p"], ["メモリー", null, "memory"], ["カード", null, "card"], ["が", null, "subject", "p"], ["床", "ゆか", "floor"], ["に", null, "on", "p"], ["落ちちゃいました", "おちちゃいました", "ended up falling"], ["！", null, null, "x"]], "en": "Ah! Blip's memory card ended up falling on the floor!"},
        {"who": "サム", "t": [["えっ", null, "wait"], ["！？", null, null, "x"], ["大丈夫", "だいじょうぶ", "all right"], ["！？", null, null, "x"], ["壊れて", "こわれて", "broken"], ["いない", null, "is not"], ["か", null, "whether", "p"], ["、", null, null, "x"], ["確かめて", "たしかめて", "confirm"], ["みる", null, "try to"], ["ね", null, "okay?", "p"], ["。", null, null, "x"]], "en": "Wait!? Are you okay!? Let me test and see whether it's broken or not."},
        {"who": "ゆき", "t": [["パソコン", null, "computer"], ["に", null, "into", "p"], ["差し込んで", "さしこんで", "insert"], ["みて", null, "try to"], ["。", null, null, "x"], ["データ", null, "data"], ["が", null, "subject", "p"], ["消えて", "きえて", "disappeared"], ["いたら", null, "if (tara)"], ["大変", "たいへん", "terrible"], ["だよ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Try inserting it into the computer. If the data disappeared, that would be terrible."},
        {"who": "サム", "t": [["読み込み", "よみこみ", "reading/loading"], ["中", "ちゅう", "in the middle of"], ["……", null, null, "x"], ["あ", null, "ah"], ["、", null, null, "x"], ["よかった", null, "thank goodness"], ["！", null, null, "x"], ["データ", null, "data"], ["は", null, "topic", "p"], ["無事", "ぶじ", "safe/intact"], ["だ", null, "is"], ["！", null, null, "x"], ["バックアップ", null, "backup"], ["を", null, "object", "p"], ["取って", "とって", "take"], ["おいた", null, "did in advance"], ["から", null, "because", "p"], ["、", null, null, "x"], ["安心", "あんしん", "relief"], ["した", null, "did"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Loading... Ah, thank goodness! The data is safe! Since I made a backup in advance, I feel relieved."},
        {"who": "ゆき", "t": [["充電器", "じゅうでんき", "charger"], ["や", null, "and", "p"], ["変圧器", "へんあつき", "transformer"], ["は", null, "topic", "p"], ["入れた", "いれた", "put in"], ["？", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["電圧", "でんあつ", "voltage"], ["は", null, "topic", "p"], ["百", "ひゃく", "100"], ["ボルト", null, "volts"], ["だよ", null, "is", "p"], ["。", null, null, "x"]], "en": "Did you put in the charger and transformer? Japan's voltage is 100 volts, you know."},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["アメリカ", null, "America"], ["と", null, "with", "p"], ["違う", "ちがう", "differs"], ["から", null, "because", "p"], ["、", null, null, "x"], ["ちゃんと", null, "properly"], ["確認", "かくにん", "confirmation"], ["して", null, "do"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah, because it differs from America, I checked it properly in advance."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ケーブル", null, "cable"], ["が", null, "subject", "p"], ["抜けちゃいました", "ぬけちゃいました", "unplugged accidentally"], ["！", null, null, "x"]], "en": "Beep! The cable accidentally came unplugged!"},
        {"who": "ゆき", "t": [["慌てない", "あわてない", "don't panic"], ["で", null, "te-neg", "p"], ["！", null, null, "x"], ["ポケット", null, "pocket"], ["に", null, "in", "p"], ["入れて", "いれた", "put in"], ["おけば", null, "if put in advance (ba)"], ["、", null, null, "x"], ["なくさない", null, "won't lose"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Don't panic! If you put it in the pocket in advance, you won't lose it."},
        {"who": "サム", "t": [["京都", "きょうと", "Kyoto"], ["の", null, "of", "p"], ["天気", "てんき", "weather"], ["は", null, "topic", "p"], ["どうかな", null, "how will it be?"], ["？", null, null, "x"]], "en": "I wonder how Kyoto's weather will be?"},
        {"who": "ゆき", "t": [["予報", "よほう", "forecast"], ["に", null, "according to", "p"], ["よると", null, "according to"], ["、", null, null, "x"], ["午前", "ごぜん", "morning"], ["は", null, "topic", "p"], ["雨", "あめ", "rain"], ["が", null, "subject", "p"], ["降る", "ふる", "fall"], ["みたい", null, "seems like"], ["だよ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "According to the forecast, it seems it will rain in the morning."},
        {"who": "サム", "t": [["じゃあ", null, "in that case"], ["、", null, null, "x"], ["折りたたみ", "おりたたみ", "folding"], ["傘", "かさ", "umbrella"], ["を", null, "object", "p"], ["カバン", null, "bag"], ["に", null, "in", "p"], ["入れて", "いれて", "put in"], ["おく", null, "keep in advance"], ["ね", null, "okay?", "p"], ["。", null, null, "x"]], "en": "In that case, I will put a folding umbrella in my bag in advance."},
        {"who": "ゆき", "t": [["歩きやすい", "あるきやすい", "easy to walk in"], ["靴", "くつ", "shoes"], ["を", null, "object", "p"], ["履いていった", "はいていった", "wear and go"], ["ほう", null, "better"], ["が", null, "subject", "p"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["坂道", "さかみち", "slopes/hills"], ["が", null, "subject", "p"], ["多い", "おおい", "many"], ["から", null, "because", "p"], ["。", null, null, "x"]], "en": "You'd better wear shoes that are easy to walk in. Because there are lots of slopes."},
        {"who": "サム", "t": [["きのう", null, "yesterday"], ["、", null, null, "x"], ["新しい", "あたらしい", "new"], ["スニーカー", null, "sneakers"], ["を", null, "object", "p"], ["履いてみた", "はいてみた", "tried wearing"], ["んだ", null, "explanatory", "p"], ["。", null, null, "x"], ["とても", null, "very"], ["歩きやすかった", "あるきやすかった", "was easy to walk"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Yesterday I tried wearing my new sneakers. They were very easy to walk in!"},
        {"who": "ブリップ", "t": [["ロボット", null, "robot"], ["も", null, "also", "p"], ["傘", "かさ", "umbrella"], ["が", null, "subject", "p"], ["必要", "ひつよう", "necessary"], ["ですか", null, "is it", "p"], ["？", null, null, "x"], ["ピピッ", null, "beep"], ["！", null, null, "x"]], "en": "Do robots need umbrellas too? Beep!"},
        {"who": "ゆき", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["ブリップ", null, "Blip"], ["には", null, "for", "p"], ["小さな", "ちいさな", "small"], ["レインコート", null, "raincoat"], ["を", null, "object", "p"], ["着せてあげる", "きせてあげる", "put on for you"], ["ね", null, "okay?", "p"], ["！", null, null, "x"]], "en": "Hehe, I'll put a tiny raincoat on you, Blip!"},
        {"who": "サム", "t": [["ホストファミリー", null, "host family"], ["に", null, "to", "p"], ["到着", "とうちゃく", "arrival"], ["時間", "じかん", "time"], ["を", null, "object", "p"], ["連絡", "れんらく", "contact"], ["して", null, "do"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I contacted the host family in advance with my arrival time."},
        {"who": "ゆき", "t": [["しっかり", null, "properly"], ["している", null, "doing"], ["ね", null, "aren't you", "p"], ["！", null, null, "x"], ["明日の朝", "あしたのあさ", "tomorrow morning"], ["、", null, null, "x"], ["寝坊", "ねぼう", "oversleeping"], ["しない", null, "not do"], ["ように", null, "so that"], ["目覚まし", "めざまし", "alarm"], ["を", null, "object", "p"], ["かけて", null, "set"], ["おこう", "おこう", "let's set in advance"], ["。", null, null, "x"]], "en": "You're so organized! Let's set the alarm so we don't oversleep tomorrow morning."},
        {"who": "サム", "t": [["目覚まし", "めざまし", "alarm"], ["時計", "とけい", "clock"], ["を", null, "object", "p"], ["二つ", "ふたつ", "two"], ["セット", null, "set"], ["して", null, "do"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "I set two alarm clocks in advance!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["全システム", "ぜんシステム", "all systems"], ["、", null, null, "x"], ["準備", "じゅんび", "preparations"], ["完了", "かんりょう", "complete"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! All systems, preparations complete!"},
        {"who": "ゆき", "t": [["荷物", "にもつ", "luggage"], ["は", null, "topic", "p"], ["全部", "ぜんぶ", "all"], ["スーツケース", null, "suitcase"], ["に", null, "in", "p"], ["詰めて", "つめて", "packed"], ["ある", null, "exists (state)"], ["？", null, null, "x"]], "en": "Is all the luggage packed in the suitcase?"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["鍵", "かぎ", "key"], ["も", null, "also", "p"], ["しっかり", null, "firmly"], ["かけて", null, "locked"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah! I locked it firmly in advance too."},
        {"who": "ゆき", "t": [["じゃあ", null, "well then"], ["、", null, null, "x"], ["電気", "でんき", "lights"], ["を", null, "object", "p"], ["消して", "けして", "turn off"], ["、", null, null, "x"], ["早く", "はやく", "early"], ["休もう", "やすもう", "let's rest"], ["。", null, null, "x"]], "en": "Well then, let's turn off the lights and rest early."},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["今夜", "こんや", "tonight"], ["は", null, "topic", "p"], ["ゆっくり", null, "relaxingly"], ["眠る", "ねむる", "sleep"], ["こと", null, "matter"], ["に", null, "to", "p"], ["する", null, "decide"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah, I've decided to sleep relaxingly tonight."},
        {"who": "ブリップ", "t": [["おやすみなさい", null, "good night"], ["！", null, null, "x"], ["京都", "きょうと", "Kyoto"], ["の", null, "of", "p"], ["夢", "ゆめ", "dreams"], ["を", null, "object", "p"], ["見ます", "みます", "will see"], ["！", null, null, "x"]], "en": "Good night! I'll dream of Kyoto!"},
        {"who": "ゆき", "t": [["おやすみ", null, "good night"], ["、", null, null, "x"], ["また", null, "again"], ["明日", "あした", "tomorrow"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "Good night, see you tomorrow!"},
        {"who": "サム", "t": [["おやすみなさい", null, "good night"], ["！", null, null, "x"], ["明日", "あした", "tomorrow"], ["が", null, "subject", "p"], ["楽しみ", "たのしみ", "looking forward"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "Good night! I can't wait for tomorrow!"}
    ],
    "grammar": [
        {
            "id": "n4-review-koto-ni-suru",
            "title": "～ことにする & ～ことになる (Decisions)",
            "explain": "V-る/ない + ことにする expresses personal conscious decisions. V-る/ない + ことになる expresses decisions made by circumstance or third parties.",
            "examples": [
                {"t": [["京都", "きょうと", "Kyoto"], ["へ", null, "to", "p"], ["行く", "いく", "go"], ["こと", null, "fact"], ["に", null, "to", "p"], ["しました", null, "decided"], ["。", null, null, "x"]], "en": "I decided to go to Kyoto."}
            ],
            "quiz": [
                {"q": "毎日日本語を練習する＿＿＿＿＿。", "hint": "I decided to practice Japanese every day.", "choices": ["ことにしました", "ことになりました", "ことでした"], "answer": 0, "why": "ことにする indicates speaker's active resolution."}
            ],
            "lesson": "grammar.html?level=N4#koto-ni-suru"
        },
        {
            "id": "n4-review-te-oku-shimau",
            "title": "～ておく (In Advance) & ～てしまう (Mishaps / Regret)",
            "explain": "V-ておく denotes action taken in advance. V-てしまう (casual: ちゃう) indicates accidental mishaps or regret.",
            "examples": [
                {"t": [["切符", "きっぷ", "ticket"], ["を", null, "object", "p"], ["予約", "よやく", "reserve"], ["して", null, "do"], ["おきました", null, "did in advance"], ["。", null, null, "x"]], "en": "I reserved tickets in advance."},
                {"t": [["カード", null, "card"], ["を", null, "object", "p"], ["落としちゃいました", "おとしちゃいました", "dropped accidentally"], ["！", null, null, "x"]], "en": "I accidentally dropped the card!"}
            ],
            "quiz": [
                {"q": "旅行の前に薬を買って＿＿＿。", "hint": "I bought medicine in advance before the trip.", "choices": ["おきました", "しまいました", "みました"], "answer": 0, "why": "ておく denotes preparatory action."}
            ],
            "lesson": "grammar.html?level=N4#te-oku"
        }
    ],
    "kanji": [
        {"k": "備", "on": ["ビ"], "kun": ["そな.える"], "m": "equip, prepare", "ex": [["準備", "じゅんび", "preparation"]]},
        {"k": "類", "on": ["ルイ"], "kun": [], "m": "kind, sort", "ex": [["書類", "しょるい", "documents"]]},
        {"k": "窓", "on": ["ソウ"], "kun": ["まど"], "m": "window", "ex": [["窓", "まど", "window"]]},
        {"k": "閉", "on": ["ヘイ"], "kun": ["し.める"], "m": "close", "ex": [["閉める", "しめる", "to close"]]},
        {"k": "落", "on": ["ラク"], "kun": ["お.ちる"], "m": "fall", "ex": [["落とす", "おとす", "to drop"]]},
        {"k": "消", "on": ["ショウ"], "kun": ["け.す"], "m": "extinguish", "ex": [["消す", "けす", "to turn off"]]}
    ],
    "build": [0, 3, 9],
    "questions": [
        {
            "q": "なぜ机の書類が飛びそうになりましたか。",
            "en": "Why were the documents about to fly away?",
            "choices": ["窓が開いたままだったから", "エアコンをつけたから", "部屋を走ったから"],
            "answer": 0
        },
        {
            "q": "サムさんは新幹線の切符をどうやって準備しましたか。",
            "en": "How did Sam prepare the Shinkansen tickets?",
            "choices": ["ネットで安く予約しておいた", "駅で買った", "もらった"],
            "answer": 0
        }
    ],
    "talk": "Describe what you prepare in advance before a big trip in Japanese."
}

# =========================================================================
# STORY 3: n4-15 (34 lines) — 成田空港のお出迎えと手土産
# =========================================================================
story_n4_15 = {
    "id": "n4-15",
    "level": "N4",
    "unit": 15,
    "title": {
        "ja": "成田空港のお出迎えと手土産",
        "en": "Narita Welcome & The Souvenir Exchange (Unit 3 Review)"
    },
    "scene": "Narita International Airport arrival lobby. Yuki introduces Sam to Ken, exchanging American chocolates and local railway gifts while hearing airport weather reports.",
    "lines": [
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["紹介", "しょうかい", "introduction"], ["する", null, "do"], ["ね", null, "tag", "p"], ["！", null, null, "x"], ["大学", "だいがく", "university"], ["の", null, "of", "p"], ["サークル", null, "club"], ["の", null, "of", "p"], ["友だち", "ともだち", "friend"], ["の", null, "of", "p"], ["ケン", null, "Ken"], ["君", "くん", "suffix", "p"], ["だよ", null, "is", "p"], ["！", null, null, "x"]], "en": "Sam, let me introduce you! This is Ken from my university club!"},
        {"who": "ケン", "t": [["初めまして", "はじめまして", "nice to meet you"], ["、", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["！", null, null, "x"], ["ゆき", "ゆき", "Yuki"], ["から", null, "from", "p"], ["話", "はなし", "stories"], ["を", null, "object", "p"], ["たくさん", null, "a lot"], ["聞いて", "きいて", "heard"], ["いました", null, "was"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Nice to meet you, Sam! I've heard so much about you from Yuki!"},
        {"who": "サム", "t": [["ケン", null, "Ken"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["初めまして", "はじめまして", "nice to meet you"], ["！", null, null, "x"], ["わざわざ", null, "expressly"], ["空港", "くうこう", "airport"], ["まで", null, "until/to", "p"], ["来て", "きて", "come"], ["くれて", null, "favor for me"], ["、", null, null, "x"], ["本当に", "ほんとうに", "really"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Nice to meet you, Ken! Thank you so much for taking the trouble to come to the airport for me!"},
        {"who": "サム", "t": [["これ", null, "this"], ["、", null, null, "x"], ["ニューヨーク", null, "New York"], ["の", null, "of", "p"], ["ブルックリン", null, "Brooklyn"], ["の", null, "of", "p"], ["チョコレート", null, "chocolate"], ["です", null, "is"], ["。", null, null, "x"], ["買ってきた", "かってきた", "bought and brought"], ["ので", null, "because", "p"], ["、", null, null, "x"], ["どうぞ", null, "please take"], ["！", null, null, "x"]], "en": "Here is chocolate from Brooklyn, New York. I bought and brought it, so please enjoy!"},
        {"who": "ケン", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["お土産", "おみやげ", "souvenir"], ["を", null, "object", "p"], ["いただいて", null, "receive (humble)"], ["すみません", null, "thank you"], ["！", null, null, "x"], ["すごく", null, "very"], ["おいしそう", null, "looks delicious"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Wow, thank you so much for the souvenir! It looks delicious!"},
        {"who": "ケン", "t": [["僕", "ぼく", "I"], ["からも", null, "from me too", "p"], ["プレゼント", null, "present"], ["です", null, "is"], ["。", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["路線図", "ろせんず", "route map"], ["と", null, "and", "p"], ["、", null, null, "x"], ["Suica", null, "Suica card"], ["を", null, "object", "p"], ["買ってあげます", "かってあげます", "buy for you"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I have a gift too. I'll get you a Tokyo route map and a Suica card!"},
        {"who": "サム", "t": [["親切", "しんせつ", "kind"], ["に", null, "adverbial", "p"], ["して", null, "do"], ["もらって", null, "receive favor"], ["、", null, null, "x"], ["助かります", "たすかります", "it helps me"], ["！", null, null, "x"]], "en": "You being so kind really helps me out!"},
        {"who": "アナウンス", "t": [["気象庁", "きしょうちょう", "Meteorological Agency"], ["に", null, "according to", "p"], ["よりますと", null, "according to"], ["、", null, null, "x"], ["今夜", "こんや", "tonight"], ["は", null, "topic", "p"], ["関東", "かんとう", "Kanto"], ["で", null, "in", "p"], ["雪", "ゆき", "snow"], ["が", null, "subject", "p"], ["降る", "ふる", "fall"], ["そう", null, "hearsay"], ["です", null, "is"], ["。", null, null, "x"]], "en": "According to the Meteorological Agency, I hear it will snow tonight in Kanto."},
        {"who": "ゆき", "t": [["雪", "ゆき", "snow"], ["が", null, "subject", "p"], ["降る", "ふる", "fall"], ["らしい", null, "seems/hearsay"], ["から", null, "because", "p"], ["、", null, null, "x"], ["特急", "とっきゅう", "limited express"], ["が", null, "subject", "p"], ["遅れる", "おくれる", "be delayed"], ["かもしれない", null, "might"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Since it seems it will snow, the express train might be delayed."},
        {"who": "ケン", "t": [["スカイライナー", null, "Skyliner"], ["の", null, "of", "p"], ["切符", "きっぷ", "ticket"], ["を", null, "object", "p"], ["今", "いま", "now"], ["買った", "かった", "bought"], ["ほう", null, "better"], ["が", null, "subject", "p"], ["良さそう", "よさそう", "looks good"], ["だ", null, "is"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "It looks like we'd better buy Skyliner tickets right now."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["外", "そと", "outside"], ["は", null, "topic", "p"], ["冷たい", "つめたい", "cold"], ["風", "かぜ", "wind"], ["が", null, "subject", "p"], ["吹いている", "ふいている", "blowing"], ["みたい", null, "seems like"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! It seems like a chilly wind is blowing outside!"},
        {"who": "サム", "t": [["ケン", null, "Ken"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["切符", "きっぷ", "ticket"], ["の", null, "of", "p"], ["買い方", "かいかた", "how to buy"], ["を", null, "object", "p"], ["教えて", "おしえて", "teach"], ["もらえます", null, "can receive favor"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Ken, could you show me how to buy the tickets?"},
        {"who": "ケン", "t": [["もちろん", null, "of course"], ["！", null, null, "x"], ["券売機", "けんばいき", "ticket vending machine"], ["で", null, "at", "p"], ["お金", "おかね", "money"], ["を", null, "object", "p"], ["チャージ", null, "recharge"], ["して", null, "do"], ["あげる", null, "give favor"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Of course! I will recharge the money for you at the ticket vending machine!"},
        {"who": "サム", "t": [["千円", "せんえん", "1000 yen"], ["札", "さつ", "bill"], ["を", null, "object", "p"], ["入れて", "いれて", "insert"], ["みても", null, "even if try"], ["いい", null, "good"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "May I try inserting a 1,000-yen bill?"},
        {"who": "ケン", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["そこ", null, "there"], ["に", null, "into", "p"], ["入れる", "いれる", "insert"], ["と", null, "if/when", "p"], ["、", null, null, "x"], ["画面", "がめん", "screen"], ["に", null, "on", "p"], ["金額", "きんがく", "amount"], ["が", null, "subject", "p"], ["出る", "でる", "appears"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Yeah, when you insert it there, the amount will show up on the screen."},
        {"who": "サム", "t": [["入りました", "はいりました", "went in"], ["！", null, null, "x"], ["これ", null, "this"], ["で", null, "with", "p"], ["自動改札機", "じどうかいさつき", "automatic ticket gate"], ["を", null, "through", "p"], ["通れる", "とおれる", "can pass through"], ["ん", null, "explanatory"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "It went in! With this, I can pass through the automatic gates, right!"},
        {"who": "ゆき", "t": [["ピッ", null, "beep"], ["と", null, "with", "p"], ["タッチ", null, "touch"], ["する", null, "do"], ["だけで", null, "just by"], ["いい", null, "good"], ["から", null, "because", "p"], ["、", null, null, "x"], ["すごく", null, "very"], ["便利", "べんり", "convenient"], ["だよ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "You just tap it with a beep, so it's super convenient."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["路線図", "ろせんず", "route map"], ["に", null, "on", "p"], ["駅名", "えきめい", "station names"], ["が", null, "subject", "p"], ["たくさん", null, "a lot"], ["並んで", "ならんで", "lined up"], ["います", null, "is"], ["！", null, null, "x"]], "en": "Beep! There are so many station names lined up on the route map!"},
        {"who": "ケン", "t": [["乗り換え", "のりかえ", "transfer"], ["アプリ", null, "app"], ["を", null, "object", "p"], ["入れて", "いれて", "put in"], ["おくと", null, "if keep in advance"], ["、", null, null, "x"], ["迷わない", "まよわない", "won't get lost"], ["よ", null, "assurance", "p"], ["。", null, null, "x"], ["僕", "ぼく", "I"], ["が", null, "subject", "p"], ["教えてあげよう", "おしえてあげよう", "shall teach for you"], ["。", null, null, "x"]], "en": "If you install a transit app in advance, you won't get lost. Let me teach you how."},
        {"who": "サム", "t": [["アプリ", null, "app"], ["を", null, "object", "p"], ["設定", "せってい", "setup"], ["して", null, "do"], ["もらって", null, "receive favor"], ["、", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["助かりました", "たすかりました", "was helped"], ["！", null, null, "x"]], "en": "Having you set up the app for me truly saved me!"},
        {"who": "ゆき", "t": [["電車", "でんしゃ", "train"], ["に", null, "on", "p"], ["乗る", "のる", "ride"], ["前", "まえ", "before"], ["に", null, "particle", "p"], ["、", null, null, "x"], ["展望", "てんぼう", "observation"], ["デッキ", null, "deck"], ["へ", null, "to", "p"], ["行ってみない", "いってみない", "won't try going?"], ["？", null, null, "x"]], "en": "Before getting on the train, wouldn't you like to check out the observation deck?"},
        {"who": "サム", "t": [["展望", "てんぼう", "observation"], ["デッキ", null, "deck"], ["ですか", null, "is it", "p"], ["？", null, null, "x"], ["ぜひ", null, "by all means"], ["行ってみたい", "いってみたい", "want to try going"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "The observation deck? I'd love to check it out by all means!"},
        {"who": "ケン", "t": [["飛行機", "ひこうき", "airplane"], ["の", null, "of", "p"], ["離着陸", "りちゃくりく", "takeoffs and landings"], ["が", null, "subject", "p"], ["間近", "まぢか", "up close"], ["で", null, "at", "p"], ["見られる", "みられる", "can see"], ["そう", null, "hearsay"], ["だよ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I hear you can watch airplane takeoffs and landings right up close."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["風", "かぜ", "wind"], ["が", null, "subject", "p"], ["吹いて", "ふいて", "blowing"], ["寒そう", "さむそう", "looks cold"], ["ですが", null, "although"], ["、", null, null, "x"], ["カメラ", null, "camera"], ["を", null, "object", "p"], ["起動", "きどう", "start up"], ["します", null, "do"], ["！", null, null, "x"]], "en": "Beep! It looks chilly with the wind blowing, but I am activating the camera!"},
        {"who": "サム", "t": [["わあ", null, "wow"], ["、", null, null, "x"], ["大きな", "おおきな", "big"], ["ジャンボ機", "じゃんぼき", "jumbo jet"], ["が", null, "subject", "p"], ["飛び立つ", "とびたつ", "take off"], ["ところ", null, "just about to"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "Wow, a big jumbo jet is just about to take off!"},
        {"who": "ゆき", "t": [["夕日", "ゆうひ", "evening sun"], ["が", null, "subject", "p"], ["当たって", "あたって", "shining upon"], ["、", null, null, "x"], ["金色", "きんいろ", "golden color"], ["に", null, "adverbial", "p"], ["光って", "ひかって", "shining"], ["見える", "みえる", "appears"], ["ね", null, "doesn't it", "p"], ["！", null, null, "x"]], "en": "With the sunset hitting it, it looks shining gold!"},
        {"who": "ケン", "t": [["そろそろ", null, "soon"], ["お腹", "おなか", "stomach"], ["が", null, "subject", "p"], ["空いてきた", "すいてきた", "started getting empty"], ["んじゃない", null, "isn't it?"], ["？", null, null, "x"], ["上", "うえ", "above"], ["の", null, "of", "p"], ["階", "かい", "floor"], ["へ", null, "to", "p"], ["行こう", "いこう", "let's go"], ["！", null, null, "x"]], "en": "Aren't you getting hungry by now? Let's go to the upper floor!"},
        {"who": "サム", "t": [["ラーメン屋", "らーめんや", "ramen shop"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["そう", null, "hearsay"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"], ["温かい", "あたたかい", "warm"], ["スープ", null, "soup"], ["が", null, "subject", "p"], ["飲みたい", "のみたい", "want to drink"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "I hear there's a ramen shop! I'd love to have warm soup!"},
        {"who": "ゆき", "t": [["あそこ", null, "over there"], ["の", null, "of", "p"], ["味噌", "みそ", "miso"], ["ラーメン", null, "ramen"], ["は", null, "topic", "p"], ["濃厚", "のうこう", "rich"], ["で", null, "and", "p"], ["美味しい", "おいしい", "delicious"], ["らしい", null, "hearsay/seems"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "I hear their miso ramen is rich and delicious."},
        {"who": "ケン", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["に", null, "for", "p"], ["おいしい", null, "delicious"], ["餃子", "ぎょうざ", "gyoza"], ["も", null, "also", "p"], ["奢ってあげよう", "おごってあげよう", "treat you to (volitional)"], ["！", null, null, "x"]], "en": "All right, let me treat Sam to delicious gyoza too!"},
        {"who": "サム", "t": [["そんな", null, "such a favor"], ["、", null, null, "x"], ["ご馳走", "ごちそう", "feast/treat"], ["に", null, "adverbial", "p"], ["なって", null, "become"], ["いい", null, "good"], ["んですか", null, "is it really", "p"], ["！？", null, null, "x"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"]], "en": "Can I really let you treat me like that!? Thank you so much!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["成田空港", "なりたくうこう", "Narita Airport"], ["は", null, "topic", "p"], ["美味しくて", "おいしくて", "delicious and"], ["楽しい", "たのしい", "fun"], ["場所", "ばしょ", "place"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Narita Airport is a delicious and fun place!"},
        {"who": "ゆき", "t": [["じゃあ", null, "well then"], ["、", null, null, "x"], ["お腹", "おなか", "stomach"], ["いっぱい", null, "full"], ["食べてから", "たべてから", "after eating"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["へ", null, "to", "p"], ["向かおう", "むかおう", "let's head"], ["！", null, null, "x"]], "en": "Well then, after eating our fill, let's head to Tokyo!"},
        {"who": "サム", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["旅", "たび", "journey"], ["の", null, "of", "p"], ["最高", "さいこう", "best"], ["の", null, "of", "p"], ["スタート", null, "start"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Yes! This is the best start to our Japan journey!"}
    ],
    "grammar": [
        {
            "id": "n4-review-favors",
            "title": "Giving and Receiving Favors: あげる, くれる, もらう",
            "explain": "V-てあげる: do a favor for someone. V-てくれる: someone does a favor for me. V-てもらう: receive a favor from someone.",
            "examples": [
                {"t": [["切符", "きっぷ", "ticket"], ["を", null, "object", "p"], ["買って", "かって", "bought"], ["くれました", null, "gave favor"], ["。", null, null, "x"]], "en": "He bought tickets for me."}
            ],
            "quiz": [
                {"q": "友達が空港まで迎えに来て＿＿＿＿。", "hint": "My friend came to pick me up at the airport for me.", "choices": ["くれた", "あげた", "もらった"], "answer": 0, "why": "てくれる indicates a favor done for the speaker."}
            ],
            "lesson": "grammar.html?level=N4#te-ageru"
        },
        {
            "id": "n4-review-conjecture-hearsay",
            "title": "Hearsay & Conjecture: ～そうだ, ～らしい, ～みたいだ",
            "explain": "V/Adj plain + そうだ reports hearsay ('I heard that...'). Adj stem + そうだ expresses visual impression ('looks like'). ～らしい expresses reliable inference/hearsay. ～みたいだ expresses colloquial resemblance or conjecture.",
            "examples": [
                {"t": [["雪", "ゆき", "snow"], ["が", null, "subject", "p"], ["降る", "ふる", "fall"], ["そう", null, "hearsay"], ["です", null, "is"], ["。", null, null, "x"]], "en": "I hear it will snow."}
            ],
            "quiz": [
                {"q": "天気予報によると、明日は晴れる＿＿＿です。", "hint": "According to the weather forecast, I heard it will be sunny tomorrow.", "choices": ["そう", "みたい", "らしい"], "answer": 0, "why": "〜によると pairs with 〜そうだ for reported news."}
            ],
            "lesson": "grammar.html?level=N4#sou-da"
        }
    ],
    "kanji": [
        {"k": "紹", "on": ["ショウ"], "kun": [], "m": "introduce", "ex": [["紹介", "しょうかい", "introduction"]]},
        {"k": "産", "on": ["サン"], "kun": ["う.む"], "m": "produce", "ex": [["お土産", "おみやげ", "souvenir"]]},
        {"k": "吹", "on": ["スイ"], "kun": ["ふ.く"], "m": "blow", "ex": [["吹く", "ふく", "to blow"]]},
        {"k": "札", "on": ["サツ"], "kun": ["ふだ"], "m": "bill, tag", "ex": [["千円札", "せんえんさつ", "1000-yen bill"]]},
        {"k": "額", "on": ["ガク"], "kun": ["ひたい"], "m": "amount, forehead", "ex": [["金額", "きんがく", "monetary amount"]]},
        {"k": "望", "on": ["ボウ", "モウ"], "kun": ["のぞ.む"], "m": "hope, view", "ex": [["展望", "てんぼう", "view/observation"]]}
    ],
    "build": [2, 5, 12],
    "questions": [
        {
            "q": "ケンさんはサムさんに何をプレゼントしましたか。",
            "en": "What did Ken gift to Sam?",
            "choices": ["路線図とSuicaカード", "日本茶とお菓子", "富士山の写真"],
            "answer": 0
        },
        {
            "q": "三人はラーメンを食べる前にどこへ行きましたか。",
            "en": "Where did the three go before eating ramen?",
            "choices": ["飛行機が見える展望デッキ", "お土産屋さん", "免税店"],
            "answer": 0
        }
    ],
    "talk": "Describe a gift you exchanged with a friend in Japanese."
}

# =========================================================================
# STORY 4: n4-16 (34 lines) — 下町の老舗旅館でチェックイン
# =========================================================================
story_n4_16 = {
    "id": "n4-16",
    "level": "N4",
    "unit": 16,
    "title": {
        "ja": "下町の老舗旅館でチェックイン",
        "en": "Checking into an Asakusa Ryokan (Unit 4 Review)"
    },
    "scene": "A historic traditional Japanese inn (ryokan) in Asakusa, Tokyo. The innkeeper greets Sam and Yuki with formal honorifics, guiding them through Japanese customs.",
    "lines": [
        {"who": "店員", "t": [["いらっしゃいませ", null, "welcome"], ["。", null, null, "x"], ["お待ち", "おまち", "waiting"], ["しておりました", null, "have been doing (humble)"], ["。", null, null, "x"]], "en": "Welcome! We have been eagerly expecting you."},
        {"who": "サム", "t": [["本日", "ほんじつ", "today (formal)"], ["予約", "よやく", "reservation"], ["いたしました", null, "did (humble)"], ["サム", null, "Sam"], ["と", null, "quote", "p"], ["申し", "もうし", "say (humble)"], ["ます", null, "polite"], ["。", null, null, "x"]], "en": "I am Sam, who made a reservation for today."},
        {"who": "店員", "t": [["サム", null, "Sam"], ["様", "さま", "honored guest"], ["で", null, "is/at", "p"], ["ございます", null, "is (very polite)"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"], ["お部屋", "おへや", "room (polite)"], ["の", null, "of", "p"], ["準備", "じゅんび", "preparation"], ["が", null, "subject", "p"], ["整って", "ととのって", "arranged"], ["おります", null, "exists (humble)"], ["。", null, null, "x"]], "en": "Mr. Sam, yes! Your room preparations are all in order."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["ちゃんとした", null, "proper"], ["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["挨拶", "あいさつ", "greeting"], ["が", null, "subject", "p"], ["言えた", "いえた", "could say"], ["ね", null, "didn't you", "p"], ["！", null, null, "x"]], "en": "Sam, you spoke proper Japanese greetings so well!"},
        {"who": "サム", "t": [["先生", "せんせい", "teacher"], ["に", null, "by", "p"], ["何回", "なんかい", "how many times"], ["も", null, "as much as", "p"], ["練習", "れんしゅう", "practice"], ["させられた", null, "was made to do"], ["から", null, "because", "p"], ["ね", null, "you know", "p"], ["！", null, null, "x"]], "en": "That's because my teacher made me practice it over and over!"},
        {"who": "店員", "t": [["こちら", null, "this way"], ["へ", null, "to", "p"], ["ご案内", "ごあんない", "guidance"], ["いたします", null, "do (humble)"], ["。", null, null, "x"], ["お荷物", "おにもつ", "luggage"], ["を", null, "object", "p"], ["お持ち", "おもち", "carry"], ["いたしましょう", null, "shall carry (humble)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "I will guide you this way. May I carry your luggage for you?"},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["大丈夫", "だいじょうぶ", "all right"], ["です", null, "is"], ["！", null, null, "x"], ["自分", "じぶん", "myself"], ["で", null, "by", "p"], ["持ちます", "もちます", "will carry"], ["！", null, null, "x"]], "en": "Ah, that's okay! I'll carry it myself!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["畳", "たたみ", "tatami"], ["の", null, "of", "p"], ["いい", null, "good"], ["におい", null, "fragrance"], ["が", null, "subject", "p"], ["します", null, "does"], ["！", null, null, "x"]], "en": "Beep! It smells like fresh tatami straw!"},
        {"who": "店員", "t": [["靴", "くつ", "shoes"], ["を", null, "object", "p"], ["お脱ぎ", "おぬぎ", "take off"], ["になって", null, "become (honorific)"], ["、", null, null, "x"], ["スリッパ", null, "slippers"], ["を", null, "object", "p"], ["お履き", "おはき", "wear"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Please take off your shoes and put on slippers."},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["わかりました", null, "understood"], ["。", null, null, "x"]], "en": "Yes, understood."},
        {"who": "店員", "t": [["お部屋", "おへや", "room"], ["から", null, "from", "p"], ["中庭", "なかにわ", "courtyard garden"], ["が", null, "subject", "p"], ["ご覧", "ごらん", "look (honorific)"], ["になれます", null, "can see (honorific)"], ["。", null, null, "x"], ["お茶", "おちゃ", "tea"], ["を", null, "object", "p"], ["お淹れ", "おいれ", "brew (honorific)"], ["いたしましょう", null, "shall brew (humble)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "You can view the courtyard garden from your room. Shall I brew some tea for you?"},
        {"who": "サム", "t": [["ぜひ", null, "by all means"], ["お願い", "おねがい", "request"], ["いたします", null, "do (humble)"], ["！", null, null, "x"]], "en": "Yes, please by all means!"},
        {"who": "店員", "t": [["かしこまりました", null, "certainly"], ["。", null, null, "x"], ["お茶菓子", "おちゃがし", "tea sweets"], ["も", null, "also", "p"], ["ご用意", "ごようい", "preparation"], ["いたしました", null, "did (humble)"], ["ので", null, "because", "p"], ["、", null, null, "x"], ["どうぞ", null, "please"], ["お召し上がり", "おめしあがり", "eat/drink (honorific)"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "Certainly. We have also prepared tea sweets, so please help yourselves."},
        {"who": "サム", "t": [["いただき", null, "receive (humble)"], ["ます", null, "polite"], ["！", null, null, "x"], ["とても", null, "very"], ["上品", "じょうひん", "refined"], ["な", null, "na-particle", "p"], ["味", "あじ", "flavor"], ["で", null, "and", "p"], ["おいしい", null, "delicious"], ["です", null, "is"], ["。", null, null, "x"]], "en": "Thank you for the treat! It has a very refined and delicious taste."},
        {"who": "ゆき", "t": [["抹茶", "まっちゃ", "matcha"], ["の", null, "of", "p"], ["苦味", "にがみ", "bitterness"], ["と", null, "and", "p"], ["和菓子", "わがし", "wagashi"], ["の", null, "of", "p"], ["甘さ", "あまさ", "sweetness"], ["が", null, "subject", "p"], ["よく", null, "well"], ["合っている", "あっている", "match"], ["ね", null, "don't they", "p"], ["。", null, null, "x"]], "en": "The matcha bitterness and wagashi sweetness match so well together."},
        {"who": "店員", "t": [["お気に召して", "おきにめして", "take liking to (honorific)"], ["いただけて", null, "receive favor"], ["、", null, null, "x"], ["何より", "なにより", "more than anything"], ["で", null, "at/is", "p"], ["ございます", null, "is (polite)"], ["。", null, null, "x"]], "en": "We are glad above all that you enjoy it."},
        {"who": "店員", "t": [["お風呂", "おふろ", "bath"], ["は", null, "topic", "p"], ["二階", "にかい", "second floor"], ["に", null, "on", "p"], ["ございます", null, "is (polite)"], ["。", null, null, "x"], ["いつでも", null, "anytime"], ["お入り", "おはいり", "enter"], ["になれます", null, "can enter (honorific)"], ["。", null, null, "x"]], "en": "The bath is on the second floor. You may enter anytime."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["温泉", "おんせん", "hot spring"], ["に", null, "in", "p"], ["入る", "はいる", "enter"], ["前", "まえ", "before"], ["に", null, "particle", "p"], ["、", null, null, "x"], ["体", "からだ", "body"], ["を", null, "object", "p"], ["洗わなければ", "あらわなければ", "if not wash"], ["いけない", null, "cannot be"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Sam, remember you must wash your body before entering the bath."},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["マナー", null, "manners"], ["を", null, "object", "p"], ["守って", "まもって", "observe"], ["、", null, null, "x"], ["ゆっくり", null, "relaxingly"], ["入りたい", "はいりたい", "want to enter"], ["と", null, "quote", "p"], ["思います", "おもいます", "think"], ["。", null, null, "x"]], "en": "Yeah! I'll observe Japanese manners and relax in the bath."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["浴衣", "ゆかた", "yukata robe"], ["も", null, "also", "p"], ["置いて", "おいて", "placed"], ["あります", null, "is (state)"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Beep! Yukata robes are laid out too!"},
        {"who": "店員", "t": [["お食事", "おしょくじ", "meal"], ["は", null, "topic", "p"], ["午後", "ごご", "p.m."], ["七時", "しちじ", "7 o'clock"], ["から", null, "from", "p"], ["お部屋", "おへや", "room"], ["へ", null, "to", "p"], ["お運び", "おはこび", "carry/deliver"], ["いたします", null, "do (humble)"], ["。", null, null, "x"]], "en": "We will deliver dinner to your room from 7:00 PM."},
        {"who": "サム", "t": [["部屋", "へや", "room"], ["で", null, "in", "p"], ["食べられる", "たべられる", "can eat (potential)"], ["んです", null, "explanatory"], ["ね", null, "tag", "p"], ["！", null, null, "x"], ["贅沢", "ぜいたく", "luxury"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "We can eat right in our room! That feels so luxurious!"},
        {"who": "店員", "t": [["アレルギー", null, "allergies"], ["などは", null, "such as", "p"], ["お持ち", "おもち", "have (honorific)"], ["で", null, "is", "p"], ["いらっしゃいます", null, "are (honorific)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Do you have any food allergies?"},
        {"who": "サム", "t": [["いいえ", null, "no"], ["、", null, null, "x"], ["何", "なに", "anything"], ["でも", null, "even", "p"], ["食べられます", "たべられます", "can eat (potential)"], ["！", null, null, "x"], ["楽しみ", "たのしみ", "looking forward"], ["にして", null, "look forward to"], ["おります", null, "am doing (humble)"], ["。", null, null, "x"]], "en": "No, I can eat anything! I am eagerly looking forward to it."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ロボット", null, "robot"], ["用", "よう", "for use of"], ["の", null, "of", "p"], ["充電", "じゅうでん", "charging"], ["コンセント", null, "power outlet"], ["は", null, "topic", "p"], ["ございます", null, "exists (polite)"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Beep! Does there exist a charging outlet for robot use?"},
        {"who": "店員", "t": [["ふふ", null, "chuckle"], ["、", null, null, "x"], ["床の間", "とこのま", "alcove"], ["の", null, "of", "p"], ["脇", "わき", "side"], ["に", null, "at", "p"], ["ございます", null, "exists (polite)"], ["。", null, null, "x"], ["ご自由", "ごじゆう", "freely"], ["に", null, "adverbial", "p"], ["お使い", "おつかい", "use"], ["ください", null, "please"], ["ませ", null, "polite ending", "p"], ["。", null, null, "x"]], "en": "Hehe, there is one beside the alcove. Please feel free to use it."},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["玄関", "げんかん", "entryway"], ["で", null, "at", "p"], ["靴", "くつ", "shoes"], ["の", null, "of", "p"], ["向き", "むき", "direction"], ["を", null, "object", "p"], ["揃えて", "そろえて", "align"], ["おいた", null, "did in advance"], ["？", null, null, "x"]], "en": "Sam, did you align the direction of your shoes in the entryway in advance?"},
        {"who": "サム", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["今", "いま", "now"], ["、", null, null, "x"], ["外", "そと", "outside"], ["に", null, "toward", "p"], ["向けて", "むけて", "facing"], ["揃えて", "そろえて", "align"], ["おいた", null, "did in advance"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Ah, right now I aligned them facing toward the outside in advance!"},
        {"who": "店員", "t": [["素晴らしい", "すばらしい", "splendid"], ["お心遣い", "おこころづかい", "consideration (honorific)"], ["で", null, "is", "p"], ["ございます", null, "is (polite)"], ["ね", null, "isn't it", "p"], ["。", null, null, "x"], ["感心", "かんしん", "admiration"], ["いたしました", null, "did (humble)"], ["。", null, null, "x"]], "en": "What wonderful consideration! I am very impressed."},
        {"who": "サム", "t": [["浴衣", "ゆかた", "yukata"], ["を", null, "object", "p"], ["着て", "きて", "wear"], ["、", null, null, "x"], ["浅草", "あさくさ", "Asakusa"], ["の", null, "of", "p"], ["夜", "よる", "night"], ["を", null, "through", "p"], ["散歩", "さんぽ", "stroll"], ["したい", null, "want to do"], ["な", null, "wish", "p"], ["！", null, null, "x"]], "en": "I'd love to wear the yukata and take an evening stroll around Asakusa!"},
        {"who": "ゆき", "t": [["いい", null, "good"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"], ["仲見世", "なかみせ", "Nakamise shopping street"], ["通り", "どおり", "street"], ["の", null, "of", "p"], ["ライトアップ", null, "light-up illumination"], ["が", null, "subject", "p"], ["綺麗", "きれい", "beautiful"], ["だよ", null, "is", "p"], ["！", null, null, "x"]], "en": "That sounds lovely! The lights along Nakamise Street are gorgeous!"},
        {"who": "店員", "t": [["門限", "もんげん", "curfew"], ["は", null, "topic", "p"], ["十一時", "じゅういちじ", "11 o'clock"], ["で", null, "is", "p"], ["ございます", null, "is (polite)"], ["。", null, null, "x"], ["お気をつけて", "おきをつけて", "take care (honorific)"], ["お出かけ", "おでかけ", "going out (honorific)"], ["ください", null, "please"], ["。", null, null, "x"]], "en": "The curfew is 11:00 PM. Please take care as you head out."},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["行ってまいります", "いってまいります", "we are heading out (humble)"], ["！", null, null, "x"]], "en": "Yes, we are heading out!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["浅草", "あさくさ", "Asakusa"], ["の", null, "of", "p"], ["夜", "よる", "night"], ["の", null, "of", "p"], ["探検", "たんけん", "exploration"], ["、", null, null, "x"], ["出発", "しゅっぱつ", "departure"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Night exploration of Asakusa, departing now!"}
    ],
    "grammar": [
        {
            "id": "n4-review-keigo",
            "title": "Keigo Review: 尊敬語 & 謙譲語",
            "explain": "尊敬語 raises the listener (お脱ぎになる, ご案内, お召し上がりになる), 謙譲語 lowers the speaker (申します, いたします, おります, 行ってまいります).",
            "examples": [
                {"t": [["ご案内", "ごあんない", "guidance"], ["いたします", null, "do (humble)"], ["。", null, null, "x"]], "en": "I will guide you."}
            ],
            "quiz": [
                {"q": "お名前は何とおっしゃい＿＿＿か。", "hint": "What is your honored name?", "choices": ["ます", "たい", "ない"], "answer": 0, "why": "おっしゃる is the honorific (Sonkeigo) of 言う."}
            ],
            "lesson": "grammar.html?level=N4#keigo"
        },
        {
            "id": "n4-review-causative-passive",
            "title": "Causative & Causative-Passive: ～させる & ～させられる",
            "explain": "Causative (～させる) indicates making/letting someone do something. Causative-passive (～させられる) indicates being made to do something reluctantly.",
            "examples": [
                {"t": [["先生", "せんせい", "teacher"], ["に", null, "by", "p"], ["練習", "れんしゅう", "practice"], ["させられた", null, "was made to do"], ["。", null, null, "x"]], "en": "I was made to practice by my teacher."}
            ],
            "quiz": [
                {"q": "子供の時、野菜を食べ＿＿＿＿。", "hint": "When I was a child, I was made to eat vegetables.", "choices": ["させられました", "させました", "しました"], "answer": 0, "why": "〜させられる expresses being forced or made to do something."}
            ],
            "lesson": "grammar.html?level=N4#causative-passive"
        }
    ],
    "kanji": [
        {"k": "館", "on": ["カン"], "kun": ["やかた"], "m": "building", "ex": [["旅館", "りょかん", "inn"]]},
        {"k": "畳", "on": ["ジョウ"], "kun": ["たたみ"], "m": "tatami", "ex": [["畳", "たたみ", "tatami mat"]]},
        {"k": "脱", "on": ["ダツ"], "kun": ["ぬ.ぐ"], "m": "undress", "ex": [["脱ぐ", "ぬぐ", "to take off clothes"]]},
        {"k": "菓", "on": ["カ"], "kun": [], "m": "sweets, fruit", "ex": [["お茶菓子", "おちゃがし", "tea sweets"]]},
        {"k": "品", "on": ["ヒン"], "kun": ["しな"], "m": "goods, refined", "ex": [["上品", "じょうひん", "refined/elegant"]]},
        {"k": "限", "on": ["ゲン"], "kun": ["かぎ.る"], "m": "limit", "ex": [["門限", "もんげん", "curfew"]]}
    ],
    "build": [1, 5, 8],
    "questions": [
        {
            "q": "サムさんは先生に何をさせられましたか。",
            "en": "What was Sam made to do by his teacher?",
            "choices": ["挨拶の日本語を練習させられた", "掃除をさせられた", "切符を買わされた"],
            "answer": 0
        },
        {
            "q": "旅館の門限は何時ですか。",
            "en": "What time is the inn's curfew?",
            "choices": ["十一時", "十時", "十二時"],
            "answer": 0
        }
    ],
    "talk": "Practice checking in at a Japanese inn using polite and humble expressions."
}

# =========================================================================
# STORY 5: n4-17 (34 lines) — 秋葉原ラジオセンターの電子工作対決
# =========================================================================
story_n4_17 = {
    "id": "n4-17",
    "level": "N4",
    "unit": 17,
    "title": {
        "ja": "秋葉原ラジオセンターの電子工作対決",
        "en": "The Akihabara Electronics Build Sprint (Unit 5 Review)"
    },
    "scene": "A crowded DIY maker workshop inside Akihabara Radio Center. Sam and Yuki assemble a digital radio filter against the clock.",
    "lines": [
        {"who": "サム", "t": [["今", "いま", "now"], ["、", null, null, "x"], ["ハンダづけ", null, "soldering"], ["を", null, "object", "p"], ["している", null, "doing"], ["ところ", null, "middle of"], ["だ", null, "is"], ["から", null, "because", "p"], ["、", null, null, "x"], ["ちょっと", null, "a moment"], ["待って", "まって", "wait"], ["ね", null, "okay?", "p"], ["！", null, null, "x"]], "en": "I'm right in the middle of soldering right now, so hang on a moment!"},
        {"who": "ゆき", "t": [["気をつけて", "きをつけて", "be careful"], ["ね", null, "tag", "p"], ["。", null, null, "x"], ["この", null, "this"], ["基板", "きばん", "board"], ["の", null, "of", "p"], ["線", "せん", "wires"], ["は", null, "topic", "p"], ["細くて", "ほそくて", "thin and"], ["切れやすい", "きれやすい", "easy to snap"], ["から", null, "because", "p"], ["。", null, null, "x"]], "en": "Be careful, okay? Because the traces on this circuit board are thin and easy to snap."},
        {"who": "サム", "t": [["うん", null, "yeah"], ["、", null, null, "x"], ["この", null, "this"], ["新しい", "あたらしい", "new"], ["コテ先", "こてさき", "iron tip"], ["は", null, "topic", "p"], ["細い", "ほそい", "thin"], ["ので", null, "because", "p"], ["、", null, null, "x"], ["すごく", null, "very"], ["作業", "さぎょう", "work"], ["し", null, "do"], ["やすい", null, "easy to"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "Yeah, because this new iron tip is thin, it's really easy to work with!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["電車", "でんしゃ", "train"], ["が", null, "subject", "p"], ["遅れた", "おくれた", "delayed"], ["のに", null, "even though", "p"], ["、", null, null, "x"], ["サム", null, "Sam"], ["さん", null, "polite suffix", "p"], ["は", null, "topic", "p"], ["作業", "さぎょう", "work"], ["が", null, "subject", "p"], ["速い", "はやい", "fast"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Even though the train was delayed, Sam's work is fast!"},
        {"who": "店員", "t": [["おっ", null, "oh"], ["、", null, null, "x"], ["いい", null, "good"], ["腕前", "うでまえ", "skill"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["その", null, "that"], ["ICチップ", null, "IC chip"], ["は", null, "topic", "p"], ["熱", "ねつ", "heat"], ["に", null, "to", "p"], ["弱い", "よわい", "weak"], ["から", null, "because", "p"], ["、", null, null, "x"], ["素早く", "すばやく", "quickly"], ["つけた", null, "attached"], ["ほう", null, "better"], ["が", null, "subject", "p"], ["いい", null, "good"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "Oh, nice skill! Because that IC chip is sensitive to heat, you'd better attach it quickly."},
        {"who": "サム", "t": [["アドバイス", null, "advice"], ["ありがとう", null, "thank you"], ["ございます", null, "polite end"], ["！", null, null, "x"], ["ちょうど", null, "just"], ["放熱板", "ほうねつばん", "heat sink"], ["を", null, "object", "p"], ["取り付けた", "とりつけた", "attached"], ["ところ", null, "just did"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Thank you for the advice! I just finished attaching the heat sink right now!"},
        {"who": "ゆき", "t": [["回路図", "かいろず", "circuit schematic"], ["は", null, "topic", "p"], ["見やすい", "みやすい", "easy to read"], ["？", null, null, "x"]], "en": "Is the circuit schematic easy to read?"},
        {"who": "サム", "t": [["日本語", "にほんご", "Japanese"], ["の", null, "of", "p"], ["説明", "せつめい", "explanation"], ["も", null, "also", "p"], ["とても", null, "very"], ["分かりやすい", "わかりやすい", "easy to understand"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["今から", "いまから", "from now"], ["電源", "でんげん", "power"], ["を", null, "object", "p"], ["入れる", "いれる", "turn on"], ["ところ", null, "about to"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "The Japanese instructions are very easy to understand too! I'm about to turn on the power right now!"},
        {"who": "ゆき", "t": [["あ", null, "ah"], ["、", null, null, "x"], ["LED", null, "LED light"], ["が", null, "subject", "p"], ["青く", "あおく", "blue"], ["光った", "ひかった", "lit up"], ["！", null, null, "x"]], "en": "Ah, the LED lit up in blue!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["周波数", "しゅうはすう", "frequency"], ["の", null, "of", "p"], ["ノイズ", null, "noise"], ["が", null, "subject", "p"], ["劇的に", "げきてきに", "dramatically"], ["減りました", "へりました", "decreased"], ["！", null, null, "x"]], "en": "Beep! Frequency noise decreased dramatically!"},
        {"who": "店員", "t": [["見事に", "みごとに", "splendidly"], ["成功", "せいこう", "success"], ["した", null, "did"], ["ね", null, "didn't you", "p"], ["！", null, null, "x"], ["この", null, "this"], ["フィルター", null, "filter"], ["なら", null, "if (nara)"], ["、", null, null, "x"], ["海外", "かいがい", "overseas"], ["の", null, "of", "p"], ["短波", "たんぱ", "shortwave"], ["ラジオ", null, "radio"], ["も", null, "also", "p"], ["綺麗", "きれい", "clean"], ["に", null, "adverbial", "p"], ["聞こえる", "きこえる", "can hear"], ["はずだ", null, "should"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "A splendid success! With this filter, overseas shortwave radio should sound crystal clear."},
        {"who": "サム", "t": [["スピーカー", null, "speaker"], ["を", null, "object", "p"], ["繋いで", "つないで", "connect"], ["みます", null, "try to"], ["ね", null, "tag", "p"], ["！", null, null, "x"], ["……", null, null, "x"], ["わあ", null, "wow"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["FM", null, "FM"], ["の", null, "of", "p"], ["音楽", "おんがく", "music"], ["が", null, "subject", "p"], ["クリア", null, "clear"], ["に", null, "adverbial", "p"], ["聞こえます", "きこえます", "can hear"], ["！", null, null, "x"]], "en": "I'll try connecting the speaker! ...Wow, Tokyo FM music comes through clearly!"},
        {"who": "ゆき", "t": [["苦労", "くろう", "hard work"], ["して", null, "did"], ["作った", "つくった", "made"], ["のに", null, "even though", "p"], ["、", null, null, "x"], ["あっという間に", "あっというまに", "in blink of eye"], ["完成", "かんせい", "completion"], ["した", null, "did"], ["ね", null, "didn't it", "p"], ["！", null, null, "x"]], "en": "Even though it was hard work, it felt like it finished in the blink of an eye!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ダイヤル", null, "dial"], ["を", null, "object", "p"], ["回して", "まわして", "turn"], ["みます", null, "try to"], ["！", null, null, "x"], ["他", "ほか", "other"], ["の", null, "of", "p"], ["局", "きょく", "station"], ["も", null, "also", "p"], ["探せます", "さがせます", "can search"], ["！", null, null, "x"]], "en": "Beep! I will try turning the dial! We can search for other stations too!"},
        {"who": "店員", "t": [["可変", "かへん", "variable"], ["コンデンサ", null, "capacitor"], ["を", null, "object", "p"], ["調整", "ちょうせい", "tune/adjust"], ["する", null, "do"], ["と", null, "if/when", "p"], ["、", null, null, "x"], ["遠く", "とおく", "distant place"], ["の", null, "of", "p"], ["電波", "でんぱ", "radio waves"], ["も", null, "also", "p"], ["捉えやすい", "とらえやすい", "easy to capture"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "When you adjust the variable capacitor, distant radio waves are easy to capture too."},
        {"who": "サム", "t": [["なるほど", null, "I see"], ["！", null, null, "x"], ["微妙", "びみょう", "delicate"], ["な", null, "na-particle", "p"], ["調節", "ちょうせつ", "adjustment"], ["は", null, "topic", "p"], ["ちょっと", null, "a bit"], ["難しい", "むずかしい", "difficult"], ["けれど", null, "though", "p"], ["、", null, null, "x"], ["面白い", "おもしろい", "fascinating"], ["です", null, "is"], ["！", null, null, "x"]], "en": "I see! Fine tuning is a bit difficult, but it's fascinating!"},
        {"who": "ゆき", "t": [["秋葉原", "あきはばら", "Akihabara"], ["って", null, "topic/quotative", "p"], ["、", null, null, "x"], ["昔", "むかし", "old days"], ["から", null, "from", "p"], ["ラジオ", null, "radio"], ["の", null, "of", "p"], ["部品", "ぶひん", "parts"], ["の", null, "of", "p"], ["街", "まち", "town"], ["だった", null, "was"], ["んだ", null, "explanatory"], ["よね", null, "tag", "p"], ["？", null, null, "x"]], "en": "Akihabara has been a town of radio parts since ancient times, right?"},
        {"who": "店員", "t": [["そうだよ", null, "that's right"], ["。", null, null, "x"], ["戦後", "せんご", "postwar"], ["の", null, "of", "p"], ["露店", "ろてん", "street stalls"], ["から", null, "from", "p"], ["始まって", "はじまって", "started"], ["、", null, null, "x"], ["技術者", "ぎじゅつしゃ", "technicians"], ["たち", null, "plural"], ["が", null, "subject", "p"], ["集まる", "あつまる", "gather"], ["場所", "ばしょ", "place"], ["に", null, "into", "p"], ["なった", null, "became"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "That's right. Starting from postwar open-air stalls, it became a gathering place for engineers."},
        {"who": "サム", "t": [["歴史", "れきし", "history"], ["を", null, "object", "p"], ["知る", "しる", "know"], ["と", null, "when/if", "p"], ["、", null, null, "x"], ["この", null, "this"], ["街", "まち", "town"], ["が", null, "subject", "p"], ["もっと", null, "more"], ["好き", "すき", "like"], ["に", null, "adverbial", "p"], ["なります", "なります", "become"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "When you know the history, you come to like this town even more, don't you?"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["あっち", null, "over there"], ["の", null, "of", "p"], ["棚", "たな", "shelf"], ["に", null, "on", "p"], ["珍しい", "めずらしい", "rare"], ["真空管", "しんくうかん", "vacuum tube"], ["が", null, "subject", "p"], ["並んで", "ならんで", "lined up"], ["います", null, "is"], ["！", null, null, "x"]], "en": "Beep! Rare vacuum tubes are lined up on that shelf over there!"},
        {"who": "ゆき", "t": [["本当", "ほんとう", "really"], ["だ", null, "is"], ["！", null, null, "x"], ["ガラス", null, "glass"], ["の", null, "of", "p"], ["中", "なか", "inside"], ["で", null, "in", "p"], ["オレンジ色", "おれんじいろ", "orange color"], ["に", null, "adverbial", "p"], ["光る", "ひかる", "glow"], ["部品", "ぶひん", "parts"], ["だね", null, "aren't they", "p"], ["。", null, null, "x"]], "en": "You're right! Those are parts that glow orange inside the glass."},
        {"who": "サム", "t": [["古い", "ふるい", "old"], ["技術", "ぎじゅつ", "technology"], ["なのに", null, "even though", "p"], ["、", null, null, "x"], ["温かい", "あたたかい", "warm"], ["音", "おと", "sound"], ["が", null, "subject", "p"], ["出る", "でる", "comes out"], ["そう", null, "hearsay"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"]], "en": "Even though it's old technology, I hear it produces a warm sound."},
        {"who": "店員", "t": [["オーディオ", null, "audio"], ["好き", "ずき", "lovers"], ["には", null, "for", "p"], ["今", "いま", "now"], ["でも", null, "even", "p"], ["根強い", "ねづよい", "deep-rooted"], ["人気", "にんき", "popularity"], ["が", null, "subject", "p"], ["ある", null, "exists"], ["よ", null, "assurance", "p"], ["。", null, null, "x"]], "en": "It still enjoys deep-rooted popularity among audio enthusiasts even now."},
        {"who": "サム", "t": [["今度", "こんど", "next time"], ["は", null, "topic", "p"], ["真空管", "しんくうかん", "vacuum tube"], ["アンプ", null, "amplifier"], ["を", null, "object", "p"], ["作って", "つくって", "make"], ["みたい", null, "want to try"], ["です", null, "polite"], ["！", null, null, "x"]], "en": "Next time I want to try building a vacuum tube amplifier!"},
        {"who": "ゆき", "t": [["夢", "ゆめ", "dream"], ["が", null, "subject", "p"], ["広がる", "ひろがる", "expands"], ["ね", null, "doesn't it", "p"], ["！", null, null, "x"], ["でも", null, "but"], ["、", null, null, "x"], ["まず", null, "first"], ["この", null, "this"], ["ラジオ", null, "radio"], ["を", null, "object", "p"], ["ケース", null, "case"], ["に", null, "in", "p"], ["入れないと", "いれないと", "must put into"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Your dreams keep expanding! But first, we must put this radio into its casing."},
        {"who": "サム", "t": [["そうだった", null, "that's right"], ["！", null, null, "x"], ["ネジ", null, "screw"], ["を", null, "object", "p"], ["締める", "しめる", "tighten"], ["ところ", null, "about to"], ["だ", null, "is"], ["。", null, null, "x"]], "en": "Right! I'm about to tighten the screws."},
        {"who": "店員", "t": [["ネジ山", "ねじやま", "screw thread"], ["を", null, "object", "p"], ["潰さない", "つぶさない", "not crush"], ["ように", null, "so as not to"], ["、", null, null, "x"], ["まっすぐに", null, "straight"], ["回して", "まわして", "turn"], ["ね", null, "okay?", "p"], ["。", null, null, "x"]], "en": "Turn it straight so you don't strip the screw threads."},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["慎重に", "しんちょうに", "cautiously"], ["回します", "まわします", "will turn"], ["！", null, null, "x"], ["……", null, null, "x"], ["よし", null, "all right"], ["、", null, null, "x"], ["ぴったり", null, "perfectly"], ["はまりました", null, "fitted in"], ["！", null, null, "x"]], "en": "Yes, I will turn it cautiously! ...All right, it fitted perfectly!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["ポータブル", null, "portable"], ["ラジオ", null, "radio"], ["の", null, "of", "p"], ["完成", "かんせい", "completion"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! The portable radio is complete!"},
        {"who": "ゆき", "t": [["おめでとう", null, "congratulations"], ["！", null, null, "x"], ["手のひら", "てのひら", "palm"], ["サイズ", null, "size"], ["で", null, "and", "p"], ["持ち歩きやすい", "もちあるきやすい", "easy to carry"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "Congratulations! It's palm-sized and easy to carry around!"},
        {"who": "サム", "t": [["店員", "てんいん", "clerk"], ["さん", null, "polite suffix", "p"], ["、", null, null, "x"], ["親切", "しんせつ", "kindness"], ["に", null, "adverbial", "p"], ["教えて", "おしえて", "teach"], ["くださって", null, "favor for me"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["ございました", null, "was (polite)"], ["！", null, null, "x"]], "en": "Thank you so much for kindly teaching me, shopkeeper!"},
        {"who": "店員", "t": [["どういたしまして", null, "you're welcome"], ["！", null, null, "x"], ["また", null, "again"], ["秋葉原", "あきはばら", "Akihabara"], ["へ", null, "to", "p"], ["遊び", "あそび", "play/visit"], ["に", null, "for", "p"], ["おいで", null, "come"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "You're welcome! Come visit Akihabara again!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["秋葉原", "あきはばら", "Akihabara"], ["は", null, "topic", "p"], ["ものづくり", null, "craftsmanship"], ["の", null, "of", "p"], ["ワンダーランド", null, "wonderland"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Akihabara is a wonderland of craftsmanship!"},
        {"who": "サム", "t": [["自分で", "じぶんで", "by oneself"], ["作った", "つくった", "made"], ["ラジオ", null, "radio"], ["を", null, "object", "p"], ["持って", "もって", "holding"], ["、", null, null, "x"], ["東京", "とうきょう", "Tokyo"], ["を", null, "through", "p"], ["歩く", "あるく", "walk"], ["の", null, "nominalizer"], ["が", null, "subject", "p"], ["楽しみ", "たのしみ", "looking forward"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "I'm so excited to walk around Tokyo holding a radio I built with my own hands!"}
    ],
    "grammar": [
        {
            "id": "n4-review-tokoro",
            "title": "Action Aspect: ～ところ (Phases of Action)",
            "explain": "V-るところ: about to do. V-ているところ: in the middle of doing. V-たところ: just finished doing.",
            "examples": [
                {"t": [["今", "いま", "now"], ["電源", "でんげん", "power"], ["を", null, "object", "p"], ["入れる", "いれる", "turn on"], ["ところ", null, "about to"], ["です", null, "is"], ["。", null, null, "x"]], "en": "I am about to turn on the power."}
            ],
            "quiz": [
                {"q": "今テストが終わった＿＿＿です。", "hint": "The test just this moment finished.", "choices": ["ところ", "ばかり", "やすい"], "answer": 0, "why": "たところ indicates the immediate moment after completion."}
            ],
            "lesson": "grammar.html?level=N4#tokoro"
        },
        {
            "id": "n4-review-yasui-nikui",
            "title": "Ease & Difficulty: ～やすい & ～にくい",
            "explain": "Verb stem + やすい expresses ease or high tendency ('easy to do'). Verb stem + にくい expresses difficulty or resistance ('hard to do').",
            "examples": [
                {"t": [["この", null, "this"], ["ペン", null, "pen"], ["は", null, "topic", "p"], ["書きやすい", "かきやすい", "easy to write"], ["です", null, "is"], ["。", null, null, "x"]], "en": "This pen is easy to write with."}
            ],
            "quiz": [
                {"q": "この靴は軽くて歩き＿＿＿です。", "hint": "These shoes are lightweight and easy to walk in.", "choices": ["やすい", "にくい", "ところ"], "answer": 0, "why": "やすい attaches to masu-stem to mean easy."}
            ],
            "lesson": "grammar.html?level=N4#yasui"
        }
    ],
    "kanji": [
        {"k": "板", "on": ["ハン"], "kun": ["いた"], "m": "board", "ex": [["基板", "きばん", "board"]]},
        {"k": "源", "on": ["ゲン"], "kun": ["みなもと"], "m": "source", "ex": [["電源", "でんげん", "power"]]},
        {"k": "調", "on": ["チョウ"], "kun": ["しら.べる", "ととの.う"], "m": "tune, investigate", "ex": [["調整", "ちょうせい", "adjustment"]]},
        {"k": "管", "on": ["カン"], "kun": ["くだ"], "m": "pipe, tube", "ex": [["真空管", "しんくうかん", "vacuum tube"]]},
        {"k": "温", "on": ["オン"], "kun": ["あたた.かい"], "m": "warm", "ex": [["温度", "おんど", "temperature"], ["温かい", "あたたかい", "warm"]]},
        {"k": "掌", "on": ["ショウ"], "kun": ["てのひら"], "m": "palm", "ex": [["手のひら", "てのひら", "palm of hand"]]}
    ],
    "build": [0, 4, 7],
    "questions": [
        {
            "q": "なぜ新しいコテ先は作業しやすいですか。",
            "en": "Why is the new soldering tip easy to work with?",
            "choices": ["先が細いので細かい作業がしやすいから", "軽くて冷たいから", "自動で動くから"],
            "answer": 0
        },
        {
            "q": "秋葉原は昔どんな街でしたか。",
            "en": "What kind of town was Akihabara in the old days?",
            "choices": ["戦後の露店から始まったラジオ部品の街", "港町", "農村"],
            "answer": 0
        }
    ],
    "talk": "Describe a DIY hobby or project you built and explain what tools made it easy or difficult."
}

# =========================================================================
# STORY 6: n4-18 (34 lines) — 技術コンテストの本番
# =========================================================================
story_n4_18 = {
    "id": "n4-18",
    "level": "N4",
    "unit": 18,
    "title": {
        "ja": "技術コンテストの本番",
        "en": "The Tokyo Maker Expo Presentation (Unit 6 Master Review)"
    },
    "scene": "Tokyo Big Sight exhibition hall. Sam, Yuki, and Blip present their open-source satellite radio decoder to judges at the Tokyo Maker Expo.",
    "lines": [
        {"who": "サム", "t": [["十時", "じゅうじ", "10 o'clock"], ["までに", null, "by", "p"], ["ブース", null, "booth"], ["の", null, "of", "p"], ["展示", "てんじ", "display"], ["を", null, "object", "p"], ["完成", "かんせい", "completion"], ["させなければ", null, "must complete (causative)"], ["ならない", null, "must"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "We have to finish setting up the booth display by 10 o'clock!"},
        {"who": "ゆき", "t": [["アンテナ", null, "antenna"], ["が", null, "subject", "p"], ["ちゃんと", null, "properly"], ["衛星", "えいせい", "satellite"], ["の", null, "of", "p"], ["電波", "でんぱ", "radio waves"], ["を", null, "object", "p"], ["受信", "じゅしん", "reception"], ["できる", null, "can do"], ["かどうか", null, "whether or not"], ["、", null, null, "x"], ["テスト", null, "test"], ["して", null, "do"], ["みて", null, "try"], ["。", null, null, "x"]], "en": "Try testing whether the antenna can properly receive the satellite signals or not."},
        {"who": "サム", "t": [["衛星", "えいせい", "satellite"], ["は", null, "topic", "p"], ["あと", null, "in"], ["十分", "じゅっぷん", "10 minutes"], ["で", null, "in", "p"], ["東京", "とうきょう", "Tokyo"], ["の", null, "of", "p"], ["上空", "じょうくう", "sky above"], ["を", null, "through", "p"], ["通過", "つうか", "passage"], ["する", null, "do"], ["はずだ", null, "should be"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "The satellite should pass over Tokyo in ten minutes!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["追尾", "ついび", "tracking"], ["システム", null, "system"], ["、", null, null, "x"], ["正常", "せいじょう", "normal"], ["に", null, "adverbial", "p"], ["作動", "さどう", "operation"], ["中", "ちゅう", "middle of"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Tracking system operational and running normally!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["審査員", "しんさいん", "judge"], ["の", null, "of", "p"], ["人", "ひと", "person"], ["が", null, "subject", "p"], ["来たら", "きたら", "if/when comes"], ["、", null, null, "x"], ["自信", "じしん", "confidence"], ["を", null, "object", "p"], ["持って", "もって", "hold"], ["日本語", "にほんご", "Japanese"], ["で", null, "in", "p"], ["説明", "せつめい", "explanation"], ["して", null, "do"], ["ほしい", null, "want you to"], ["な", null, "wish", "p"], ["。", null, null, "x"]], "en": "Sam, when the judges arrive, I want you to explain it with confidence in Japanese!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["前", "まえ", "before"], ["は", null, "topic", "p"], ["緊張", "きんちょう", "nervous"], ["して", null, "did"], ["話せなかった", "はなせなかった", "could not speak"], ["けど", null, "though", "p"], ["、", null, null, "x"], ["毎日", "まいにち", "every day"], ["練習", "れんしゅう", "practice"], ["する", null, "do"], ["ように", null, "make habit to"], ["している", null, "am doing"], ["から", null, "because", "p"], ["、", null, null, "x"], ["大丈夫", "だいじょうぶ", "all right"], ["だ", null, "is"], ["！", null, null, "x"]], "en": "Yeah! I used to be nervous and couldn't speak, but because I make a point of practicing every day, I'll be fine!"},
        {"who": "店員", "t": [["こんにちは", null, "hello"], ["！", null, null, "x"], ["こちらの", null, "this"], ["システム", null, "system"], ["について", null, "about", "p"], ["説明", "せつめい", "explanation"], ["して", null, "do"], ["いただけます", null, "can receive favor"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "Hello! Could you tell us about this system?"},
        {"who": "サム", "t": [["はい", null, "yes"], ["、", null, null, "x"], ["喜んで", "よろこんで", "with pleasure"], ["！", null, null, "x"], ["気象", "きしょう", "weather"], ["衛星", "えいせい", "satellite"], ["の", null, "of", "p"], ["画像", "がぞう", "image"], ["を", null, "object", "p"], ["誰", "だれ", "anyone"], ["でも", null, "even", "p"], ["簡単に", "かんたんに", "easily"], ["受信", "じゅしん", "reception"], ["できるように", null, "so that can"], ["設計", "せっけい", "design"], ["しました", null, "did"], ["。", null, null, "x"]], "en": "Yes, with pleasure! We designed it so anyone can easily receive weather satellite imagery."},
        {"who": "店員", "t": [["どのような", null, "what kind of"], ["仕組み", "しくみ", "mechanism"], ["で", null, "by", "p"], ["動いて", "うごいて", "operating"], ["いる", null, "is"], ["の", null, "nominalizer"], ["ですか", null, "is it", "p"], ["？", null, null, "x"]], "en": "Under what mechanism is it operating?"},
        {"who": "サム", "t": [["アンテナ", null, "antenna"], ["が", null, "subject", "p"], ["自動", "じどう", "automatic"], ["で", null, "by", "p"], ["衛星", "えいせい", "satellite"], ["の", null, "of", "p"], ["軌道", "きどう", "orbit"], ["を", null, "object", "p"], ["追う", "おう", "chase/track"], ["ように", null, "so that"], ["なっています", null, "is configured"], ["。", null, null, "x"]], "en": "The antenna is set up so that it automatically tracks the satellite orbit."},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["衛星", "えいせい", "satellite"], ["から", null, "from", "p"], ["の", null, "of", "p"], ["画像", "がぞう", "image"], ["を", null, "object", "p"], ["受信", "じゅしん", "reception"], ["いたしました", null, "did (humble)"], ["！", null, null, "x"]], "en": "Beep! We have received the image from the satellite!"},
        {"who": "店員", "t": [["おお", null, "oh!"], ["！", null, null, "x"], ["雲", "くも", "clouds"], ["の", null, "of", "p"], ["形", "かたち", "shape"], ["が", null, "subject", "p"], ["はっきりと", null, "clearly"], ["映って", "うつって", "projected"], ["います", null, "is"], ["ね", null, "isn't it", "p"], ["！", null, null, "x"], ["素晴らしい", "すばらしい", "wonderful"], ["！", null, null, "x"]], "en": "Oh! The shape of the clouds is projected so clearly! Wonderful!"},
        {"who": "店員", "t": [["災害", "さいがい", "disaster"], ["の", null, "of", "p"], ["時", "とき", "time"], ["にも", null, "also in", "p"], ["役立ちそう", "やくだちそう", "looks useful"], ["ですね", null, "isn't it", "p"], ["。", null, null, "x"], ["停電", "ていでん", "power outage"], ["しても", null, "even if"], ["使えます", "つかえます", "can use"], ["か", null, "question", "p"], ["？", null, null, "x"]], "en": "It looks like it would be useful during disasters too. Can it be used even during a power outage?"},
        {"who": "ゆき", "t": [["はい", null, "yes"], ["！", null, null, "x"], ["乾電池", "かんでんち", "dry-cell battery"], ["だけでも", null, "even just with", "p"], ["丸一日", "まるいちにち", "full whole day"], ["動く", "うごく", "operate"], ["ように", null, "in a way that"], ["作って", "つくって", "make"], ["あります", null, "exists (state)"], ["。", null, null, "x"]], "en": "Yes! It is built so that it can operate for a whole day on just dry-cell batteries."},
        {"who": "サム", "t": [["通信", "つうしん", "communications"], ["が", null, "subject", "p"], ["途絶えた", "とだえた", "interrupted"], ["場合", "ばあい", "case/event"], ["でも", null, "even in", "p"], ["、", null, null, "x"], ["雲", "くも", "clouds"], ["や", null, "and", "p"], ["台風", "たいふう", "typhoon"], ["の", null, "of", "p"], ["動き", "うごき", "movement"], ["が", null, "subject", "p"], ["直接", "ちょくせつ", "directly"], ["確認", "かくにん", "confirmation"], ["できる", null, "can do"], ["んです", null, "explanatory"], ["。", null, null, "x"]], "en": "Even if communications are cut off, one can directly confirm cloud and typhoon movements."},
        {"who": "店員", "t": [["実用的", "じつようてき", "practical"], ["で", null, "and", "p"], ["社会", "しゃかい", "society"], ["に", null, "to", "p"], ["貢献", "こうけん", "contribution"], ["できる", null, "can do"], ["素晴らしい", "すばらしい", "wonderful"], ["研究", "けんきゅう", "research"], ["ですね", null, "isn't it", "p"], ["！", null, null, "x"]], "en": "It is practical and makes a great contribution to society, wonderful research!"},
        {"who": "サム", "t": [["回路図", "かいろず", "circuit schematic"], ["や", null, "and", "p"], ["プログラム", null, "program"], ["は", null, "topic", "p"], ["、", null, null, "x"], ["ウェブサイト", null, "website"], ["で", null, "on", "p"], ["公開", "こうかい", "public release"], ["して", null, "do"], ["あります", null, "exists (state)"], ["。", null, null, "x"]], "en": "The circuit schematics and programs are publicly published on our website."},
        {"who": "店員", "t": [["オープンソース", null, "open source"], ["なんですね", null, "it is, right"], ["！", null, null, "x"], ["世界中", "せかいじゅう", "whole world"], ["の", null, "of", "p"], ["人", "ひと", "people"], ["が", null, "subject", "p"], ["利用", "りよう", "use"], ["できます", null, "can do"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "It's open source! That means people all around the world can use it!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["審査員", "しんさいん", "judge"], ["の", null, "of", "p"], ["方", "かた", "person (polite)"], ["が", null, "subject", "p"], ["高く", "たかく", "highly"], ["評価", "ひょうか", "evaluation"], ["して", null, "do"], ["くださいました", null, "gave favor (honorific)"], ["！", null, null, "x"]], "en": "Beep! The honored judge evaluated us very highly!"},
        {"who": "ゆき", "t": [["サム", null, "Sam"], ["、", null, null, "x"], ["大成功", "だいせいこう", "huge success"], ["だね", null, "isn't it", "p"], ["！", null, null, "x"], ["日本語", "にほんご", "Japanese"], ["が", null, "subject", "p"], ["上手に", "じょうずに", "skillfully"], ["話せる", "はなせる", "can speak"], ["ように", null, "manner"], ["なった", null, "became"], ["ね", null, "didn't you", "p"], ["！", null, null, "x"]], "en": "Sam, that was a huge success! You have truly become able to speak Japanese skillfully!"},
        {"who": "サム", "t": [["最初", "さいしょ", "at first"], ["は", null, "topic", "p"], ["単語", "たんご", "words"], ["しか", null, "only", "p"], ["言えなかった", "いえなかった", "could not say"], ["けれど", null, "though", "p"], ["、", null, null, "x"], ["今", "いま", "now"], ["は", null, "topic", "p"], ["自分の思い", "じぶんのおもい", "own thoughts"], ["を", null, "object", "p"], ["伝えられる", "つたえられる", "can convey"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "At first I could only say single words, but now I can convey my own thoughts!"},
        {"who": "ゆき", "t": [["毎日", "まいにち", "every day"], ["諦めずに", "あきらめずに", "without giving up"], ["努力", "どりょく", "effort"], ["した", null, "did"], ["成果", "せいか", "results"], ["だね", null, "aren't they", "p"], ["！", null, null, "x"]], "en": "Those are the fruits of you making effort every day without giving up!"},
        {"who": "サム", "t": [["みんな", null, "everyone"], ["の", null, "of", "p"], ["応援", "おうえん", "support"], ["の", null, "of", "p"], ["おかげ", null, "thanks to"], ["だ", null, "is"], ["よ", null, "assurance", "p"], ["！", null, null, "x"], ["本当に", "ほんとうに", "truly"], ["ありがとう", null, "thank you"], ["！", null, null, "x"]], "en": "That's all thanks to everyone's support! Truly thank you!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["次", "つぎ", "next"], ["は", null, "topic", "p"], ["N3", null, "N3 level"], ["の", null, "of", "p"], ["ステージ", null, "stage"], ["へ", null, "to", "p"], ["出発", "しゅっぱつ", "departure"], ["進行", "しんこう", "ahead"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Next, full speed ahead to the N3 stage!"},
        {"who": "ゆき", "t": [["N3", null, "N3"], ["では", null, "in", "p"], ["もっと", null, "more"], ["深い", "ふかい", "deep"], ["表現", "ひょうげん", "expressions"], ["や", null, "and", "p"], ["社会", "しゃかい", "society"], ["の", null, "of", "p"], ["ニュース", null, "news"], ["も", null, "also", "p"], ["読める", "よめる", "can read"], ["ように", null, "so that"], ["なる", null, "become"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "In N3 you'll become able to read deeper expressions and societal news too!"},
        {"who": "サム", "t": [["うん", null, "yeah"], ["！", null, null, "x"], ["日本", "にほん", "Japan"], ["の", null, "of", "p"], ["文化", "ぶんか", "culture"], ["や", null, "and", "p"], ["技術", "ぎじゅつ", "technology"], ["を", null, "object", "p"], ["もっと", null, "more"], ["深く", "ふかく", "deeply"], ["知りたい", "しりたい", "want to know"], ["んだ", null, "explanatory"], ["。", null, null, "x"]], "en": "Yeah! I want to understand Japanese culture and technology more deeply."},
        {"who": "ブリップ", "t": [["ブリップ", null, "Blip"], ["の", null, "of", "p"], ["語彙", "ごい", "vocabulary"], ["データ", null, "data"], ["も", null, "also", "p"], ["アップデート", null, "update"], ["完了", "かんりょう", "complete"], ["しました", null, "did"], ["！", null, null, "x"]], "en": "Blip's vocabulary data update is completed too!"},
        {"who": "ゆき", "t": [["頼もしい", "たのもしい", "reliable"], ["ね", null, "aren't you", "p"], ["！", null, null, "x"], ["二人", "ふたり", "two of you"], ["とも", null, "both"], ["かっこよかった", null, "were cool"], ["よ", null, "assurance", "p"], ["！", null, null, "x"]], "en": "How reliable! You both were so cool today!"},
        {"who": "サム", "t": [["コンテスト", null, "contest"], ["の", null, "of", "p"], ["賞", "しょう", "award"], ["が", null, "subject", "p"], ["取れる", "とれる", "can win"], ["かどうか", null, "whether or not"], ["、", null, null, "x"], ["夕方", "ゆうがた", "evening"], ["の", null, "of", "p"], ["発表", "はっぴょう", "announcement"], ["が", null, "subject", "p"], ["ドキドキ", null, "heart-thumping"], ["する", null, "does"], ["ね", null, "tag", "p"], ["。", null, null, "x"]], "en": "Whether we can take home a contest prize or not, the evening announcement has my heart pounding!"},
        {"who": "ゆき", "t": [["結果", "けっか", "result"], ["が", null, "subject", "p"], ["どうであれ", null, "no matter what"], ["、", null, null, "x"], ["今日", "きょう", "today"], ["は", null, "topic", "p"], ["お祝い", "おいわい", "celebration"], ["に", null, "for", "p"], ["美味しい", "おいしい", "delicious"], ["ご飯", "ごはん", "meal"], ["を", null, "object", "p"], ["食べよう", "たべよう", "let's eat"], ["！", null, null, "x"]], "en": "Whatever the result is, let's have a delicious meal today to celebrate!"},
        {"who": "ブリップ", "t": [["ピピッ", null, "beep"], ["！", null, null, "x"], ["大賛成", "だいさんせい", "completely agree"], ["です", null, "is"], ["！", null, null, "x"]], "en": "Beep! Completely agree!"},
        {"who": "サム", "t": [["よし", null, "all right"], ["、", null, null, "x"], ["もっと", null, "more"], ["上級", "じょうきゅう", "advanced"], ["の", null, "of", "p"], ["日本語", "にほんご", "Japanese"], ["を", null, "object", "p"], ["目指して", "めざして", "aiming for"], ["頑張る", "がんばる", "do best"], ["ぞ", null, "determination", "p"], ["！", null, null, "x"]], "en": "All right, aiming for more advanced Japanese, I'll do my best!"},
        {"who": "ゆき", "t": [["一緒に", "いっしょに", "together"], ["頑張ろう", "がんばろう", "let's do best"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "Let's do our best together!"},
        {"who": "サム", "t": [["おう", null, "yeah!"], ["！", null, null, "x"], ["これからも", null, "from now on too"], ["よろしく", null, "regards"], ["ね", null, "tag", "p"], ["！", null, null, "x"]], "en": "Yeah! Looking forward to working together from now on too!"}
    ],
    "grammar": [
        {
            "id": "n4-review-you-ni-suru",
            "title": "～ようにする & ～ようになる (Habits & Transitions)",
            "explain": "ようにする indicates conscious effort/habit ('make sure to'). ようになる indicates transition or achievement over time ('come to be able to').",
            "examples": [
                {"t": [["毎日", "まいにち", "every day"], ["練習", "れんしゅう", "practice"], ["する", null, "do"], ["ように", null, "make sure to"], ["しています", null, "am doing"], ["。", null, null, "x"]], "en": "I make a point of practicing every day."}
            ],
            "quiz": [
                {"q": "日本語が話せる＿＿＿なりました。", "hint": "I have come to be able to speak Japanese.", "choices": ["ように", "ために", "そうに"], "answer": 0, "why": "ようになる expresses progress over time."}
            ],
            "lesson": "grammar.html?level=N4#you-ni-naru"
        },
        {
            "id": "n4-review-ka-dou-ka",
            "title": "Embedded Questions: ～かどうか & ～か",
            "explain": "Plain clause + かどうか indicates 'whether or not'. With question words (何, いつ, どこ), attach plain clause + か.",
            "examples": [
                {"t": [["受信", "じゅしん", "reception"], ["できる", null, "can do"], ["かどうか", null, "whether or not"], ["、", null, null, "x"], ["テスト", null, "test"], ["します", null, "do"], ["。", null, null, "x"]], "en": "I will test whether it can receive."}
            ],
            "quiz": [
                {"q": "明日行く＿＿＿分かりません。", "hint": "I don't know whether I will go tomorrow or not.", "choices": ["かどうか", "ように", "ために"], "answer": 0, "why": "かどうか creates an embedded yes/no question clause."}
            ],
            "lesson": "grammar.html?level=N4#ka-dou-ka"
        }
    ],
    "kanji": [
        {"k": "展", "on": ["テン"], "kun": [], "m": "exhibit", "ex": [["展示", "てんじ", "exhibition"]]},
        {"k": "衛", "on": ["エイ"], "kun": [], "m": "defense", "ex": [["衛星", "えいせい", "satellite"]]},
        {"k": "乾", "on": ["カン"], "kun": ["かわ.く", "かわ.かす"], "m": "dry", "ex": [["乾電池", "かんでんち", "dry-cell battery"]]},
        {"k": "絶", "on": ["ゼツ"], "kun": ["た.える", "た.やす"], "m": "sever, cease", "ex": [["途絶える", "とだえる", "to cease/discontinue"]]},
        {"k": "努", "on": ["ド"], "kun": ["つと.める"], "m": "effort", "ex": [["努力", "どりょく", "effort"]]},
        {"k": "果", "on": ["カ"], "kun": ["は.たす", "は.てる"], "m": "fruit, result", "ex": [["成果", "せいか", "fruit/result"], ["結果", "けっか", "result"]]}
    ],
    "build": [0, 1, 7],
    "questions": [
        {
            "q": "ブースの準備は何時までに終わらせなければなりませんでしたか。",
            "en": "By what time did the booth preparation have to be finished?",
            "choices": ["十時まで", "十二時まで", "午後三時まで"],
            "answer": 0
        },
        {
            "q": "この受信機は停電した時でも使えますか。",
            "en": "Can this receiver be used even during a power outage?",
            "choices": ["乾電池だけで丸一日動くように作られている", "停電の時は使えない", "ソーラーパネルが絶対に必要"],
            "answer": 0
        }
    ],
    "talk": "Describe a presentation or project you showed to others in Japanese."
}

def main():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    all_stories = [story_n4_13, story_n4_14, story_n4_15, story_n4_16, story_n4_17, story_n4_18]
    for s in all_stories:
        out_path = STORIES_DIR / f"{s['id']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
        print(f"Generated {out_path.name} ({len(s['lines'])} lines, {len(s['grammar'])} grammar points, {len(s['kanji'])} kanji)")

if __name__ == "__main__":
    main()
