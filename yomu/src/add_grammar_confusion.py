#!/usr/bin/env python3
"""
Adds detailed "Common Confusion & Nuance" explanations to yomu/data/grammar.json.
Addresses the most frequent learner stumbling blocks across JLPT N5 to N1.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
GRAMMAR_FILE = ROOT / "yomu" / "data" / "grammar.json"

NUANCE_DATA = {
    # N5
    "wa": "Common Confusion: は vs が. は marks the overarching topic ('as for X...') or creates contrast. が marks the specific grammatical subject pointing out new, identifying information (who/what/which one). In question words, always use が (だれが来ましたか), never だれは. In relative clauses, the subject almost always takes が.",
    "ga": "Common Confusion: が vs は. Use が when introducing new information for the first time, when answering a question ('Who did it? Yuki did: ゆきさんが'), or describing natural events as they happen (雨が降っている). Use は when discussing an already established topic or contrasting.",
    "ni-time": "Common Confusion: When to drop に. Specific clock times, days of the week, and calendar dates take に (7時に, 日曜日に). Relative time words that shift depending on when you speak (今日, あした, 毎日, 今, 来週, 去年) NEVER take に.",
    "ni-dest": "Common Confusion: に vs へ. Both indicate destination with motion verbs. へ emphasizes the directional heading or journey ('heading in the direction of Japan'), while に emphasizes the actual arrival point ('arriving at school'). In N5 they are interchangeable with 行く, 来る, and 帰る.",
    "ni-exist": "Common Confusion: に vs で for locations. に marks where something statically exists or stays (机の上に本がある, 公園に犬がいる). で marks where an active event or action takes place (公園で走る, カフェで勉強する). Rule of thumb: if an action is performed, use で; if someone/something merely exists or resides, use に.",
    "de-place": "Common Confusion: で vs に. で marks the setting of an activity (図書館で勉強する). In contrast, に is for static existence (ある/いる) or targets of arrival (駅に着く).",
    "te-kara": "Common Confusion: 〜てから vs 〜た後で. てから emphasizes direct sequential cause-and-effect ('immediately after doing A, B happens / only after doing A can B proceed'). た後で simply marks chronological order without implying that B was waiting on A.",
    "ta-ato-de": "Common Confusion: 〜た後で vs 〜てから. た後で indicates that B occurs at some point after A, but does not imply an immediate sequence or prerequisite, whereas てから strongly links the two actions.",
    "kara-reason": "Common Confusion: 〜から vs 〜ので. から is subjective, emotional, and emphasizes the speaker's personal reasoning or conviction ('Because I want to, I will!'). ので is objective, gentle, and polite, presenting the reason as an external matter-of-fact circumstance. In polite requests, apologies, and business settings, always prefer ので over から.",
    
    # N4
    "node": "Common Confusion: 〜ので vs 〜から. ので is objective, soft, and polite, making it ideal for business and making excuses without sounding self-centered. から is subjective, forceful, and clearly expresses personal perspective or commands (危ないですから、やめてください).",
    "conditional-to": "Common Confusion: The 4 Conditionals (と, ば, たら, なら). と marks natural/inevitable consequences, laws of nature, or physical mechanics ('Turn right and there is the bank'). It CANNOT be followed by the speaker's personal intention, request, or command (e.g. you cannot say 晴れると、海に行こう - use たら instead).",
    "conditional-ba": "Common Confusion: The 4 Conditionals. ば focuses on hypothetical cause-and-effect ('If you press this button, it will work'). Like と, the second clause generally cannot be a command, invitation, or request unless the verb in the first clause is non-volitional (a state or adjective).",
    "conditional-tara": "Common Confusion: The 4 Conditionals. たら is the most versatile and colloquial conditional. It means 'once X happens, then Y' or 'if X happens'. Unlike と and ば, たら CAN freely be followed by requests, commands, suggestions, and invitations (雨が降ったら、タクシーを呼びましょう).",
    "conditional-nara": "Common Confusion: The 4 Conditionals. なら takes up a topic introduced by the listener or contextual premise ('If it is X you are talking about...'). In Japanese, the action in clause B can actually happen before clause A (日本に行くなら、カメラを買いなさい = If you are going to Japan, buy a camera before you go!).",
    "sou-looks-like": "Common Confusion: 〜そうだ (appearance) vs 〜らしい vs 〜ようだ. Stem + そうだ means visual conjecture from direct appearance ('It looks delicious / looks like rain'). ようだ is subjective deduction based on sensory clues or reasoning. らしい is hearsay or quintessential representative nature ('acting like a true...').",
    "sou-hearsay": "Common Confusion: Hearsay 〜そうだ vs Appearance 〜そうだ. Verb plain form + そうだ means 'I heard that...' (雨が降るそうだ = I heard it will rain). Verb STEM + そうだ means 'looks like...' (雨が降りそうだ = It looks like it is about to rain!). The connection is completely different.",
    "you-da": "Common Confusion: 〜ようだ vs 〜らしい. ようだ expresses the speaker's own sensory deduction or likeness based on firsthand evidence. らしい expresses secondhand hearsay ('heard through the grapevine') or typicality (男らしい = manly).",
    "rashii": "Common Confusion: 〜らしい vs 〜そうだ. らしい is hearsay where the speaker doesn't know the exact source and considers it plausible. When attached to nouns (子どもらしい), it means 'behaving in a way quintessential of a child', whereas 子どものようだ means 'acting childish (even if you're an adult)'.",
    "hazu-da": "Common Confusion: 〜はずだ vs 〜に違いない. はずだ expresses an expectation based on objective evidence, logic, or schedules ('He left at 8, so he should be here by 9'). に違いない is a strong subjective conviction or gut feeling ('Judging by the smoke, that must be a fire without a doubt').",

    # N3
    "wake-niwa-ikanai": "Common Confusion: 〜わけにはいかない vs 〜ないわけにはいかない. わけにはいかない means 'cannot do so due to social, moral, or situational rules' (I want to rest, but I have a deadline so I cannot rest: 休むわけにはいかない). ないわけにはいかない (double negative) means 'I have no choice but to do it' (Everyone else is attending, so I cannot not go: 行かないわけにはいかない).",
    "wake-dewanai": "Common Confusion: 〜わけではない vs 〜のではない. わけではない means 'it doesn't mean that / not necessarily' (I can eat spicy food, but it doesn't mean I like it: 好きなわけではない).",
    "ni-yoruto": "Common Confusion: 〜によると vs 〜によって. によると strictly quotes a source of reported information ('According to the news...'). によって expresses: (1) causal agency or means ('built by architects'), or (2) dependency/variation ('differs depending on the person: 人によって違う').",
    "saichuu-ni": "Common Confusion: 〜最中に vs 〜うちに. 最中に (さいちゅうに) means right in the middle of a continuous action when an unexpected disruption interrupts it ('The power went out right in the middle of the lecture'). うちに means while a favorable condition lasts, before it changes ('Eat the soup while it is hot: 熱いうちに').",
    "uchi-ni": "Common Confusion: 〜うちに vs 〜あいだに. うちに emphasizes that time is running out or conditions will change ('Finish while it is still quiet'). あいだに simply refers to an event occurring inside a defined time window.",
    "koto-da": "Common Confusion: 〜ことだ vs 〜ものだ. ことだ is direct practical advice or admonition given to an individual ('You should study every day: 毎日勉強することだ'). ものだ expresses universal human truths, inherent nature, or nostalgic recollections ('Children ought to play outside').",
    "mono-da": "Common Confusion: 〜ものだ vs 〜ことだ. ものだ conveys inherent truth ('Humans are social creatures'), natural tendency, or nostalgic past habits ('I used to swim in that river as a child').",
    "gachi": "Common Confusion: 〜がち vs 〜気味 (ぎみ) vs 〜っぽい. がち means a repeated undesirable tendency ('tends to forget'). 気味 means a slight current bodily or emotional symptom ('feeling slightly feverish: 風邪気味'). っぽい means resemblance or tendency of personality/color ('childish: 子どもっぽい').",
    "gimi": "Common Confusion: 〜気味 (ぎみ) vs 〜がち. 気味 refers to a slight physical sensation or state (疲れ気味 = feeling a bit tired), not a recurring behavioral habit like がち.",
    "ppoi": "Common Confusion: 〜っぽい vs 〜らしい. 〜っぽい indicates an impression of similarity (childish, oily, cheap-looking), often negative. 〜らしい means having the quintessential positive traits of that group (子どもらしい = innocent and lively, as a child should be).",

    # N2 & N1
    "ni-saishite": "Common Confusion: 〜に際して vs 〜にあたって. Both mean 'on the occasion of'. に際して is used for one-time major events or formal beginnings ('on the occasion of opening the conference'). にあたって emphasizes positive preparation and proactive intent for a milestone ('in preparing for study abroad').",
    "ni-atatte": "Common Confusion: 〜にあたって vs 〜に際して. にあたって implies positive, future-oriented preparation ('as we embark on this new business venture'). に際して is more formal and neutral.",
    "dokoro-dewa-nai": "Common Confusion: 〜どころではない vs 〜わけではない. どころではない means 'far from it / circumstances make it utterly impossible' ('With finals tomorrow, I can't be playing video games!').",
    "zukume": "Common Confusion: 〜ずくめ vs 〜だらけ vs 〜まみれ. ずくめ is for entire sequences of good or bad events (幸せずくめ = full of happiness, 黒ずくめ = dressed completely in black). だらけ is for visible messes or mistakes (間違いだらけ = full of errors). まみれ is strictly for sticky or dirty coatings on surfaces (血まみれ = covered in blood, 泥まみれ = covered in mud)."
}

def main():
    with open(GRAMMAR_FILE, "r", encoding="utf-8") as f:
        grammars = json.load(f)

    updated_count = 0
    for g in grammars:
        gid = g.get("id")
        if gid in NUANCE_DATA:
            g["confusion"] = NUANCE_DATA[gid]
            updated_count += 1

    with open(GRAMMAR_FILE, "w", encoding="utf-8") as f:
        json.dump(grammars, f, ensure_ascii=False, indent=2)

    print(f"Updated {updated_count} grammar points with confusion/nuance explanations in {GRAMMAR_FILE}")

if __name__ == "__main__":
    main()
