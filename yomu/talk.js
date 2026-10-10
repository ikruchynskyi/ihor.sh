// Role-play scenes for Yomu: Blip plays the clerk, the passer-by, the station worker; you answer out loud (or type).
// Every answer is scored against the replies a Japanese speaker would accept, in kanji or kana, with patterns for the
// open ones ("[your name] です"). Pure data + scoring, so node can test it: node yomu/talk.test.mjs

/** Katakana → hiragana, full-width → half-width, no spaces or punctuation: what we compare. */
export function norm(s) {
  return String(s ?? "").normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s、。，．,.!?！？「」『』…〜~ー\-]/g, "").toLowerCase();
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
    if (r.startsWith("re:")) { if (new RegExp(r.slice(3)).test(a)) return { score: 1, best: answer, verdict: "great" }; continue; }
    const b = norm(r), s = 1 - distance(a, b) / Math.max(a.length, b.length);
    if (s > best.score) best = { score: s, best: r };
  }
  return { ...best, verdict: best.score >= 0.85 ? "great" : best.score >= 0.6 ? "close" : "again" };
}

// A scene: turns in order. "blip" lines are spoken by Blip; "you" is what you should say (goal in English, accepted replies).
export const SCENES = [
  { id: "konbini", level: "N5", title: "At the convenience store", where: "コンビニ", desc: "Pay for a bento at a konbini: heat it up?, a bag?, how you pay.", turns: [
    { blip: "いらっしゃいませ。お弁当、温めますか。", en: "Welcome. Shall I heat up the bento?", goal: "Say yes, please (or no, it's fine).", you: ["はい、お願いします", "はいおねがいします", "お願いします", "いいえ、大丈夫です", "いいえだいじょうぶです", "大丈夫です"] },
    { blip: "袋はご利用ですか。", en: "Would you like a bag?", goal: "Say no, I don't need one.", you: ["いいえ、いりません", "いりません", "大丈夫です", "だいじょうぶです", "袋はいりません", "ふくろはいりません"] },
    { blip: "お支払いはどうなさいますか。", en: "How will you pay?", goal: "Say: by card, please.", you: ["カードでお願いします", "かーどでおねがいします", "カードで", "クレジットカードで", "スイカで", "現金で", "げんきんで"] },
    { blip: "レシートはご利用ですか。", en: "Do you need the receipt?", goal: "Say: yes, please (give it to me).", you: ["はい、ください", "ください", "お願いします", "いりません", "大丈夫です"] },
    { blip: "ありがとうございました！", en: "Thank you very much!", goal: "Thank them back.", you: ["ありがとうございます", "どうも", "どうもありがとう", "ありがとう"] },
  ] },
  { id: "michi", level: "N5", title: "Asking the way", where: "駅はどこ", desc: "Stop someone in the street and ask how to get to the station.", turns: [
    { goal: "Get their attention and ask where the station is.", you: ["すみません、駅はどこですか", "すみませんえきはどこですか", "駅はどこですか", "えきはどこですか", "すみません、駅はどちらですか"] },
    { blip: "駅ですか。この道をまっすぐ行って、二つ目の角を右に曲がってください。", en: "The station? Go straight along this road and turn right at the second corner.", goal: "Repeat it back to check: straight, then right at the second corner?", you: ["まっすぐ行って、二つ目の角を右ですね", "まっすぐ、二つ目を右ですね", "二つ目の角を右ですね", "ふたつめのかどをみぎですね", "わかりました"] },
    { blip: "はい、そうです。歩いて五分ぐらいですよ。", en: "Yes, that's it. It's about five minutes on foot.", goal: "Thank them.", you: ["ありがとうございます", "ありがとうございました", "どうもありがとうございます"] },
  ] },
  { id: "resutoran", level: "N5", title: "Ordering at a restaurant", where: "レストラン", desc: "How many people, drinks, ordering, and asking for the check.", turns: [
    { blip: "いらっしゃいませ。何名様ですか。", en: "Welcome. How many people?", goal: "Say: two people.", you: ["二人です", "ふたりです", "二名です", "にめいです", "re:^(ひとり|一人|二人|ふたり|三人|さんにん|[一二三四1-4]名|[1-4]人)です$"] },
    { blip: "お飲み物はいかがですか。", en: "Something to drink?", goal: "Ask for water.", you: ["水をください", "みずをください", "お水をお願いします", "おみずおねがいします", "お茶をください", "ビールをください"] },
    { blip: "ご注文はお決まりですか。", en: "Are you ready to order?", goal: "Order ramen, please.", you: ["ラーメンをください", "らーめんをください", "ラーメンをお願いします", "ラーメンひとつ", "これをください", "これをお願いします"] },
    { blip: "以上でよろしいですか。", en: "Will that be all?", goal: "Say: yes, that's all.", you: ["はい、以上です", "はいいじょうです", "はい", "はい、大丈夫です"] },
    { goal: "(Later) Ask for the check.", you: ["お会計をお願いします", "おかいけいおねがいします", "すみません、お会計お願いします", "お勘定をお願いします", "チェックお願いします"] },
    { blip: "かしこまりました。二千四百円です。", en: "Certainly. That's 2,400 yen.", goal: "Say thank you for the meal (the polite phrase after eating).", you: ["ごちそうさまでした", "ごちそうさま", "ご馳走様でした"] },
  ] },
  { id: "jikoshoukai", level: "N5", title: "Introducing yourself", where: "はじめまして", desc: "Meet someone new: your name, where you're from, your job, how long you've studied.", turns: [
    { blip: "はじめまして。ブリップです。お名前は？", en: "Nice to meet you. I'm Blip. Your name?", goal: "Say nice to meet you, and your name: \"[name] です\".", you: ["はじめまして、サムです", "re:^(はじめまして)?.{1,15}です$", "re:^(はじめまして)?(わたしは)?.{1,15}といいます$"] },
    { blip: "どこから来ましたか。", en: "Where are you from?", goal: "Say where you're from: \"[country] から来ました\".", you: ["アメリカから来ました", "re:^.{1,12}からきました$", "re:^.{1,12}から来ました$", "re:^.{1,12}(じん|人)です$"] },
    { blip: "お仕事は何ですか。", en: "What do you do?", goal: "Say your job: \"[job] です\" (エンジニア, 学生…).", you: ["エンジニアです", "がくせいです", "re:^(しごとは)?.{1,12}です$"] },
    { blip: "日本語はどのくらい勉強していますか。", en: "How long have you been studying Japanese?", goal: "Say how long: \"一年ぐらいです\" (about a year).", you: ["一年ぐらいです", "いちねんぐらいです", "re:(ねん|年|かげつ|ヶ月|か月|しゅうかん|週間).*(です|ぐらい|くらい)"] },
    { blip: "そうですか！よろしくお願いします。", en: "I see! Nice to meet you (please treat me well).", goal: "Say it back.", you: ["よろしくお願いします", "よろしくおねがいします", "こちらこそ、よろしくお願いします", "こちらこそよろしく"] },
  ] },
  { id: "densha", level: "N4", title: "On the train platform", where: "駅のホーム", desc: "Check you're on the right platform and when the next train leaves.", turns: [
    { goal: "Ask a station worker: does this train go to Shibuya?", you: ["すみません、この電車は渋谷に行きますか", "この電車は渋谷に行きますか", "このでんしゃはしぶやにいきますか", "この電車、渋谷行きですか", "渋谷に行きますか"] },
    { blip: "いいえ、渋谷行きは反対側のホームですよ。", en: "No, the Shibuya trains leave from the opposite platform.", goal: "Check: the opposite side, right? Thanks.", you: ["反対側ですね、ありがとうございます", "はんたいがわですねありがとうございます", "反対側ですね", "わかりました、ありがとうございます"] },
    { goal: "Ask what time the next train is.", you: ["次の電車は何時ですか", "つぎのでんしゃはなんじですか", "次の電車は何時に来ますか", "次は何時ですか"] },
    { blip: "十時十五分です。あと三分ですね。", en: "10:15. Three more minutes.", goal: "Say: understood, thank you.", you: ["わかりました、ありがとうございます", "わかりましたありがとうございます", "ありがとうございます", "わかりました"] },
  ] },
  { id: "hoteru", level: "N4", title: "Checking into a hotel", where: "ホテル", desc: "Check in, hand over your passport, ask about breakfast.", turns: [
    { blip: "いらっしゃいませ。", en: "Welcome.", goal: "Say you'd like to check in.", you: ["チェックインをお願いします", "ちぇっくいんをおねがいします", "チェックインお願いします", "予約した者ですが", "re:^.{1,15}で(予約|よやく)しています"] },
    { blip: "パスポートを拝見してもよろしいですか。", en: "May I see your passport?", goal: "Hand it over: here you are.", you: ["はい、どうぞ", "はいどうぞ", "どうぞ"] },
    { blip: "朝ごはんは七時から二階のレストランです。", en: "Breakfast is from seven, at the restaurant on the second floor.", goal: "Ask until what time.", you: ["何時までですか", "なんじまでですか", "朝ごはんは何時までですか", "わかりました、何時までですか"] },
    { blip: "十時までです。ごゆっくりどうぞ。", en: "Until ten. Enjoy your stay.", goal: "Thank them.", you: ["ありがとうございます", "どうもありがとうございます", "ありがとう"] },
  ] },
];
