// Role-play scenes for Yomu: Blip plays the clerk, the passer-by, the station worker; you answer out loud (or type).
// Every answer is scored against the replies a Japanese speaker would accept, in kanji or kana, with patterns for the
// open ones ("[your name] です"). Pure data + scoring, so node can test it: node yomu/talk.test.mjs

/** Converts Hepburn/Kunrei Romaji or common English loanwords into hiragana for scoring. */
export function romajiToHiragana(str) {
  let s = String(str ?? "").toLowerCase()
    .replace(/[ōo]/g, (c) => (c === "ō" ? "ou" : c))
    .replace(/ū/g, "uu").replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ē/g, "ee")
    .replace(/credit\s*card/g, "くれじっとかーど")
    .replace(/card/g, "かーど")
    .replace(/check[- ]?in/g, "ちぇっくいん");
  s = s.replace(/([kstpczgdb])\1/g, "っ$1").replace(/tc(h[aeiou])/g, "っc$1");
  const map = [
    ["kya", "きゃ"], ["kyu", "きゅ"], ["kyo", "きょ"],
    ["sha", "しゃ"], ["shu", "しゅ"], ["sho", "しょ"],
    ["cha", "ちゃ"], ["chu", "ちゅ"], ["cho", "ちょ"],
    ["nya", "にゃ"], ["nyu", "にゅ"], ["nyo", "にょ"],
    ["hya", "ひゃ"], ["hyu", "ひゅ"], ["hyo", "ひょ"],
    ["mya", "みゃ"], ["myu", "みゅ"], ["myo", "みょ"],
    ["rya", "りゃ"], ["ryu", "りゅ"], ["ryo", "りょ"],
    ["gya", "ぎゃ"], ["gyu", "ぎゅ"], ["gyo", "ぎょ"],
    ["bya", "びゃ"], ["byu", "びゅ"], ["byo", "びょ"],
    ["pya", "ぴゃ"], ["pyu", "ぴゅ"], ["pyo", "ぴょ"],
    ["jya", "じゃ"], ["jyu", "じゅ"], ["jyo", "じょ"],
    ["sya", "しゃ"], ["syu", "しゅ"], ["syo", "しょ"],
    ["tya", "ちゃ"], ["tyu", "ちゅ"], ["tyo", "ちょ"],
    ["zya", "じゃ"], ["zyu", "じゅ"], ["zyo", "じょ"],
    ["tsu", "つ"], ["chi", "ち"], ["shi", "し"],
    ["che", "ちぇ"], ["she", "しぇ"], ["je", "じぇ"],
    ["fa", "ふぁ"], ["fi", "ふぃ"], ["fe", "ふぇ"], ["fo", "ふぉ"],
    ["ka", "か"], ["ki", "き"], ["ku", "く"], ["ke", "け"], ["ko", "こ"],
    ["sa", "さ"], ["si", "し"], ["su", "す"], ["se", "せ"], ["so", "そ"],
    ["ta", "た"], ["ti", "ち"], ["tu", "つ"], ["te", "て"], ["to", "と"],
    ["na", "な"], ["ni", "に"], ["nu", "ぬ"], ["ne", "ね"], ["no", "の"],
    ["ha", "は"], ["hi", "ひ"], ["fu", "ふ"], ["hu", "ふ"], ["he", "へ"], ["ho", "ほ"],
    ["ma", "ま"], ["mi", "み"], ["mu", "む"], ["me", "め"], ["mo", "も"],
    ["ya", "や"], ["yu", "ゆ"], ["yo", "よ"],
    ["ra", "ら"], ["ri", "り"], ["ru", "る"], ["re", "れ"], ["ro", "ろ"],
    ["wa", "わ"], ["wo", "を"],
    ["ga", "が"], ["gi", "ぎ"], ["gu", "ぐ"], ["ge", "げ"], ["go", "ご"],
    ["za", "ざ"], ["zi", "じ"], ["zu", "ず"], ["ze", "ぜ"], ["zo", "ぞ"],
    ["ji", "じ"], ["ja", "じゃ"], ["ju", "じゅ"], ["jo", "じょ"],
    ["da", "だ"], ["di", "ぢ"], ["du", "づ"], ["de", "で"], ["do", "ど"],
    ["ba", "ば"], ["bi", "び"], ["bu", "ぶ"], ["be", "べ"], ["bo", "ぼ"],
    ["pa", "ぱ"], ["pi", "ぴ"], ["pu", "ぷ"], ["pe", "ぺ"], ["po", "ぽ"],
    ["va", "ゔぁ"], ["vi", "ゔぃ"], ["vu", "ゔ"], ["ve", "ゔぇ"], ["vo", "ゔぉ"],
    ["nn", "ん"], ["n'", "ん"],
    ["a", "あ"], ["i", "い"], ["u", "う"], ["e", "え"], ["o", "お"],
    ["n(?=[^aiueoy]|$)|n(?=[^a-z])", "ん"]
  ];
  let res = "", i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [rom, kana] of map) {
      if (rom.includes("(")) {
        const m = s.slice(i).match(new RegExp("^" + rom));
        if (m) { res += kana; i += m[0].length; matched = true; break; }
      } else if (s.startsWith(rom, i)) {
        res += kana; i += rom.length; matched = true; break;
      }
    }
    if (!matched) { res += s[i]; i++; }
  }
  return res;
}

/** Katakana → hiragana, romaji → kana, full-width → half-width, no spaces or punctuation: what we compare. */
export function norm(s) {
  let str = String(s ?? "").normalize("NFKC");
  if (/[a-zA-Z]/.test(str)) str = romajiToHiragana(str);
  return str.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s、。，．,.!?！？「」『』…〜~ー\-]/g, "")
    .replace(/を/g, "お")
    .replace(/は/g, "わ")
    .toLowerCase();
}

/** Edit distance (Levenshtein), on characters. */
export function distance(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/**
 * How close an answer is to any accepted reply: { score 0–1, best, verdict }. A reply starting with "re:" is a pattern
 * (an open answer such as a name); otherwise it's compared character by character after norm().
 */
export function score(answer, accepted) {
  const a = norm(answer);
  if (!a) return { score: 0, best: accepted[0], verdict: "silent" };
  let best = { score: 0, best: accepted.find((x) => !x.startsWith("re:")) ?? "" };
  for (const r of accepted) {
    if (r.startsWith("re:")) {
      const pat = r.slice(3);
      if (new RegExp(pat).test(a) || new RegExp(pat.replace(/は/g, "わ").replace(/を/g, "お")).test(a)) {
        return { score: 1, best: answer, verdict: "great" };
      }
      continue;
    }
    const b = norm(r), s = 1 - distance(a, b) / Math.max(a.length, b.length);
    if (s > best.score) best = { score: s, best: r };
  }
  return { ...best, verdict: best.score >= 0.85 ? "great" : best.score >= 0.6 ? "close" : "again" };
}

// A scene: turns in order. "blip" lines are spoken by Blip; "you" is what you should say (goal, hints, accepted replies).
export const SCENES = [
  { id: "konbini", level: "N5", title: "At the convenience store", where: "コンビニ", desc: "Pay for a bento at a konbini: heat it up?, a bag?, how you pay.", turns: [
    {
      blip: "いらっしゃいませ。お弁当、温めますか。",
      en: "Welcome. Shall I heat up the bento?",
      goal: "Say yes, please (or no, it's fine).",
      hints: [
        { ja: "はい、お願いします", romaji: "hai, onegaishimasu", en: "Yes, please" },
        { ja: "大丈夫です", romaji: "daijoubu desu", en: "No thanks, it's fine" }
      ],
      you: ["はい、お願いします", "はいおねがいします", "お願いします", "おねがいします", "はい", "いいえ、大丈夫です", "いいえだいじょうぶです", "大丈夫です", "だいじょうぶです", "いいえ、結構です", "けっこうです"]
    },
    {
      blip: "袋はご利用ですか。",
      en: "Would you like a bag?",
      goal: "Say no, I don't need one.",
      hints: [
        { ja: "いいえ、いりません", romaji: "iie, irimasen", en: "No, I don't need one" },
        { ja: "大丈夫です", romaji: "daijoubu desu", en: "I'm good / no need" }
      ],
      you: ["いいえ、いりません", "いいえいりません", "いりません", "大丈夫です", "だいじょうぶです", "袋はいりません", "ふくろはいりません", "いらないです", "結構です", "けっこうです"]
    },
    {
      blip: "お支払いはどうなさいますか。",
      en: "How will you pay?",
      goal: "Say: by card, please.",
      hints: [
        { ja: "カードでお願いします", romaji: "kaado de onegaishimasu", en: "By card, please" },
        { ja: "現金で", romaji: "genkin de", en: "In cash" }
      ],
      you: ["カードでお願いします", "かーどでおねがいします", "カードで", "カード", "クレジットカードで", "スイカで", "現金で", "げんきんで", "キャッシュレスで"]
    },
    {
      blip: "レシートはご利用ですか。",
      en: "Do you need the receipt?",
      goal: "Say: yes, please (give it to me).",
      hints: [
        { ja: "はい、ください", romaji: "hai, kudasai", en: "Yes, please" },
        { ja: "大丈夫です", romaji: "daijoubu desu", en: "No thanks, it's fine" }
      ],
      you: ["はい、ください", "はいください", "ください", "お願いします", "おねがいします", "はい", "いりません", "大丈夫です", "だいじょうぶです"]
    },
    {
      blip: "ありがとうございました！",
      en: "Thank you very much!",
      goal: "Thank them back.",
      hints: [
        { ja: "ありがとうございます", romaji: "arigatou gozaimasu", en: "Thank you very much" },
        { ja: "どうも", romaji: "doumo", en: "Thanks" }
      ],
      you: ["ありがとうございます", "ありがとうございました", "どうもありがとうございます", "どうも", "どうもありがとう", "ありがとう"]
    },
  ] },
  { id: "michi", level: "N5", title: "Asking the way", where: "駅はどこ", desc: "Stop someone in the street and ask how to get to the station.", turns: [
    {
      goal: "Get their attention and ask where the station is.",
      hints: [
        { ja: "すみません、駅はどこですか", romaji: "sumimasen, eki wa doko desu ka", en: "Excuse me, where is the station?" }
      ],
      you: ["すみません、駅はどこですか", "すみませんえきはどこですか", "駅はどこですか", "えきはどこですか", "すみません、駅はどちらですか", "すいません、駅はどこですか", "すみません駅はどこですか"]
    },
    {
      blip: "駅ですか。この道をまっすぐ行って、二つ目の角を右に曲がってください。",
      en: "The station? Go straight along this road and turn right at the second corner.",
      goal: "Repeat it back to check: straight, then right at the second corner?",
      hints: [
        { ja: "まっすぐ行って、二つ目の角を右ですね", romaji: "massugu itte, futatsume no kado o migi desu ne", en: "Straight, then right at 2nd corner?" },
        { ja: "わかりました", romaji: "wakarimashita", en: "Understood" }
      ],
      you: ["まっすぐ行って、二つ目の角を右ですね", "まっすぐ、二つ目を右ですね", "二つ目の角を右ですね", "ふたつめのかどをみぎですね", "わかりました", "はい、わかりました"]
    },
    {
      blip: "はい、そうです。歩いて五分ぐらいですよ。",
      en: "Yes, that's it. It's about five minutes on foot.",
      goal: "Thank them.",
      hints: [
        { ja: "ありがとうございます", romaji: "arigatou gozaimasu", en: "Thank you very much" }
      ],
      you: ["ありがとうございます", "ありがとうございました", "どうもありがとうございます", "どうもありがとう", "ありがとう", "どうも"]
    },
  ] },
  { id: "resutoran", level: "N5", title: "Ordering at a restaurant", where: "レストラン", desc: "How many people, drinks, ordering, and asking for the check.", turns: [
    {
      blip: "いらっしゃいませ。何名様ですか。",
      en: "Welcome. How many people?",
      goal: "Say: two people.",
      hints: [
        { ja: "二人です", romaji: "futari desu", en: "Two people" },
        { ja: "一人です", romaji: "hitori desu", en: "One person" }
      ],
      you: ["二人です", "ふたりです", "二名です", "にめいです", "二人", "ふたり", "re:^(ひとり|一人|二人|ふたり|三人|さんにん|[一二三四1-4]名|[1-4]人)(です)?$"]
    },
    {
      blip: "お飲み物はいかがですか。",
      en: "Something to drink?",
      goal: "Ask for water.",
      hints: [
        { ja: "お水をお願いします", romaji: "omizu o onegaishimasu", en: "Water, please" },
        { ja: "水をください", romaji: "mizu o kudasai", en: "Water, please" }
      ],
      you: ["水をください", "みずをください", "お水をお願いします", "おみずおねがいします", "お水をください", "水をお願いします", "お茶をください", "ビールをください"]
    },
    {
      blip: "ご注文はお決まりですか。",
      en: "Are you ready to order?",
      goal: "Order ramen, please.",
      hints: [
        { ja: "ラーメンをお願いします", romaji: "raamen o onegaishimasu", en: "Ramen, please" },
        { ja: "ラーメンをください", romaji: "raamen o kudasai", en: "Ramen, please" }
      ],
      you: ["ラーメンをください", "らーめんをください", "ラーメンをお願いします", "らーめんをおねがいします", "ラーメンひとつ", "これをください", "これをお願いします"]
    },
    {
      blip: "以上でよろしいですか。",
      en: "Will that be all?",
      goal: "Say: yes, that's all.",
      hints: [
        { ja: "はい、以上です", romaji: "hai, ijou desu", en: "Yes, that's all" },
        { ja: "はい", romaji: "hai", en: "Yes" }
      ],
      you: ["はい、以上です", "はいいじょうです", "はい", "以上です", "はい、大丈夫です"]
    },
    {
      goal: "(Later) Ask for the check.",
      hints: [
        { ja: "お会計をお願いします", romaji: "okaikei o onegaishimasu", en: "Check, please" }
      ],
      you: ["お会計をお願いします", "おかいけいおねがいします", "すみません、お会計お願いします", "お勘定をお願いします", "チェックお願いします", "お会計をください", "お会計で"]
    },
    {
      blip: "かしこまりました。二千四百円です。",
      en: "Certainly. That's 2,400 yen.",
      goal: "Say thank you for the meal (the polite phrase after eating).",
      hints: [
        { ja: "ごちそうさまでした", romaji: "gochisousama deshita", en: "Thank you for the meal" }
      ],
      you: ["ごちそうさまでした", "ごちそうさま", "ご馳走様でした", "ごちそうさまでした、ありがとうございます"]
    },
  ] },
  { id: "jikoshoukai", level: "N5", title: "Introducing yourself", where: "はじめまして", desc: "Meet someone new: your name, where you're from, your job, how long you've studied.", turns: [
    {
      blip: "はじめまして。ブリップです。お名前は？",
      en: "Nice to meet you. I'm Blip. Your name?",
      goal: "Say nice to meet you, and your name: \"[name] です\".",
      hints: [
        { ja: "はじめまして、サムです", romaji: "hajimemashite, samu desu", en: "Nice to meet you, I'm Sam" }
      ],
      you: ["はじめまして、サムです", "はじめましてサムです", "re:^(はじめまして)?.{1,15}です$", "re:^(はじめまして)?(わたしは)?.{1,15}といいます$"]
    },
    {
      blip: "どこから来ましたか。",
      en: "Where are you from?",
      goal: "Say where you're from: \"[country] から来ました\".",
      hints: [
        { ja: "アメリカから来ました", romaji: "amerika kara kimashita", en: "I came from America" }
      ],
      you: ["アメリカから来ました", "re:^.{1,12}からきました$", "re:^.{1,12}から来ました$", "re:^.{1,12}(じん|人)です$", "re:^.{1,12}(出身|しゅっしん)です$", "re:^.{1,12}です$"]
    },
    {
      blip: "お仕事は何ですか。",
      en: "What do you do?",
      goal: "Say your job: \"[job] です\" (エンジニア, 学生…).",
      hints: [
        { ja: "エンジニアです", romaji: "enjinia desu", en: "I'm an engineer" },
        { ja: "学生です", romaji: "gakusei desu", en: "I'm a student" }
      ],
      you: ["エンジニアです", "がくせいです", "学生です", "re:^(しごとは)?.{1,12}です$"]
    },
    {
      blip: "日本語はどのくらい勉強していますか。",
      en: "How long have you been studying Japanese?",
      goal: "Say how long: \"一年ぐらいです\" (about a year).",
      hints: [
        { ja: "一年ぐらいです", romaji: "ichinen gurai desu", en: "About one year" }
      ],
      you: ["一年ぐらいです", "いちねんぐらいです", "一年です", "re:(ねん|年|かげつ|ヶ月|か月|しゅうかん|週間).*(です|ぐらい|くらい)"]
    },
    {
      blip: "そうですか！よろしくお願いします。",
      en: "I see! Nice to meet you (please treat me well).",
      goal: "Say it back.",
      hints: [
        { ja: "よろしくお願いします", romaji: "yoroshiku onegaishimasu", en: "Nice to meet you too" },
        { ja: "こちらこそ、よろしくお願いします", romaji: "kochirakoso, yoroshiku onegaishimasu", en: "Likewise, nice to meet you" }
      ],
      you: ["よろしくお願いします", "よろしくおねがいします", "こちらこそ、よろしくお願いします", "こちらこそよろしく", "こちらこそよろしくお願いします", "こちらこそ"]
    },
  ] },
  { id: "densha", level: "N4", title: "On the train platform", where: "駅のホーム", desc: "Check you're on the right platform and when the next train leaves.", turns: [
    {
      goal: "Ask a station worker: does this train go to Shibuya?",
      hints: [
        { ja: "すみません、この電車は渋谷に行きますか", romaji: "sumimasen, kono densha wa shibuya ni ikimasu ka", en: "Excuse me, does this train go to Shibuya?" }
      ],
      you: ["すみません、この電車は渋谷に行きますか", "この電車は渋谷に行きますか", "このでんしゃはしぶやにいきますか", "この電車、渋谷行きですか", "渋谷に行きますか", "渋谷まで行きますか", "しぶやにいきますか"]
    },
    {
      blip: "いいえ、渋谷行きは反対側のホームですよ。",
      en: "No, the Shibuya trains leave from the opposite platform.",
      goal: "Check: the opposite side, right? Thanks.",
      hints: [
        { ja: "反対側ですね、ありがとうございます", romaji: "hantaigawa desu ne, arigatou gozaimasu", en: "Opposite side, right? Thank you" },
        { ja: "わかりました、ありがとうございます", romaji: "wakarimashita, arigatou gozaimasu", en: "Understood, thank you" }
      ],
      you: ["反対側ですね、ありがとうございます", "はんたいがわですねありがとうございます", "反対側ですね", "わかりました、ありがとうございます", "わかりましたありがとうございます", "反対側ですか、ありがとうございます"]
    },
    {
      goal: "Ask what time the next train is.",
      hints: [
        { ja: "次の電車は何時ですか", romaji: "tsugi no densha wa nanji desu ka", en: "What time is the next train?" }
      ],
      you: ["次の電車は何時ですか", "つぎのでんしゃはなんじですか", "次の電車は何時に来ますか", "次は何時ですか", "つぎはなんじですか"]
    },
    {
      blip: "十時十五分です。あと三分ですね。",
      en: "10:15. Three more minutes.",
      goal: "Say: understood, thank you.",
      hints: [
        { ja: "わかりました、ありがとうございます", romaji: "wakarimashita, arigatou gozaimasu", en: "Understood, thank you" }
      ],
      you: ["わかりました、ありがとうございます", "わかりましたありがとうございます", "ありがとうございます", "わかりました", "どうもありがとうございます"]
    },
  ] },
  { id: "hoteru", level: "N4", title: "Checking into a hotel", where: "ホテル", desc: "Check in, hand over your passport, ask about breakfast.", turns: [
    {
      blip: "いらっしゃいませ。",
      en: "Welcome.",
      goal: "Say you'd like to check in.",
      hints: [
        { ja: "チェックインをお願いします", romaji: "chekkuin o onegaishimasu", en: "I'd like to check in, please" }
      ],
      you: ["チェックインをお願いします", "ちぇっくいんをおねがいします", "チェックインお願いします", "予約した者ですが", "チェックインしたいです", "re:^.{1,15}で(予約|よやく)しています"]
    },
    {
      blip: "パスポートを拝見してもよろしいですか。",
      en: "May I see your passport?",
      goal: "Hand it over: here you are.",
      hints: [
        { ja: "はい、どうぞ", romaji: "hai, douzo", en: "Here you are" }
      ],
      you: ["はい、どうぞ", "はいどうぞ", "どうぞ", "これです"]
    },
    {
      blip: "朝ごはんは七時から二階のレストランです。",
      en: "Breakfast is from seven, at the restaurant on the second floor.",
      goal: "Ask until what time.",
      hints: [
        { ja: "朝ごはんは何時までですか", romaji: "asagohan wa nanji made desu ka", en: "Until what time is breakfast?" },
        { ja: "何時までですか", romaji: "nanji made desu ka", en: "Until what time?" }
      ],
      you: ["何時までですか", "なんじまでですか", "朝ごはんは何時までですか", "わかりました、何時までですか", "あさごはんはなんじまでですか"]
    },
    {
      blip: "十時までです。ごゆっくりどうぞ。",
      en: "Until ten. Enjoy your stay.",
      goal: "Thank them.",
      hints: [
        { ja: "ありがとうございます", romaji: "arigatou gozaimasu", en: "Thank you very much" }
      ],
      you: ["ありがとうございます", "どうもありがとうございます", "ありがとう", "わかりました、ありがとうございます"]
    },
  ] },
];
