# Compiles grammar_n5/n4/n3.py into yomu/data/grammar.json: tokens with readings, the quiz blank, and choices.
# Run: python3 yomu/src/grammar.py
import json, pathlib, random, re, importlib
KANJI = r"[㐀-鿿々〆ヶ]"
TAEKIM = "https://guidetojapanese.org/learn/grammar/"

def parse(text):
    """'私{わたし}[は]学生{がくせい}です。' → (tokens, [first, last+1] of the blank, answer text)"""
    tokens, blank, inside, answer = [], [None, None], False, ""
    for m in re.finditer(rf"\[|\]|({KANJI}+)\{{([^}}]+)\}}|[^\[\]{{}}]+?(?=\[|\]|{KANJI}+\{{|$)", text):
        g = m.group(0)
        if g == "[": inside, blank[0] = True, len(tokens); continue
        if g == "]": inside, blank[1] = False, len(tokens); continue
        if m.group(1): tokens.append([m.group(1), m.group(2), None])
        else:
            if re.search(r"[{}]", g): raise ValueError(f"bad example {text!r}")
            for part in re.findall(r"[。、？！…「」『』\s]+|[^。、？！…「」『』\s]+", g):
                tokens.append([part, None, None, "x"] if re.fullmatch(r"[。、？！…「」『』\s]+", part) else [part, None, None])
        if inside: answer += m.group(1) or g
    if None in blank: raise ValueError(f"no [blank] in {text!r}")
    return particles(tokens, blank), blank, answer

def particles(tokens, blank):
    """Tag は/へ/を as particles so romaji reads them wa/e/o: a kana run ending in one, followed by more sentence,
    loses that last character to its own particle token (こんにちは excepted). Blank indices shift to match."""
    out, orig = [], blank[:]
    for i, t in enumerate(tokens):
        s, last = t[0], i == len(tokens) - 1 or tokens[i + 1][-1] == "x"
        if t[1] is None and len(t) == 3 and s[-1:] in "はへを" and s not in ("こんにちは", "こんばんは") and (len(s) == 1 or not last):
            if len(s) > 1:
                out.append([s[:-1], None, None])
                blank[0] += orig[0] > i; blank[1] += orig[1] > i
            out.append([s[-1], None, None, "p"])
        else: out.append(t)
    return out

out = []
for n in (5, 4, 3):
    mod = importlib.import_module(f"grammar_n{n}")
    for i, (pid, pattern, meaning, explain, examples, slug) in enumerate(mod.POINTS):
        exs = []
        for jp, en in examples:
            t, blank, ans = parse(jp)
            exs.append({"t": t, "blank": blank, "answer": ans, "en": en})
        out.append({"id": pid, "level": f"N{n}", "n": i + 1, "pattern": pattern, "meaning": meaning, "explain": explain, "examples": exs, "more": TAEKIM + slug})
ids = [p["id"] for p in out]
assert len(ids) == len(set(ids)), [x for x in ids if ids.count(x) > 1]
# Quiz choices: the right answer plus two answers from other points at the same level.
for p in out:
    pool = sorted({e["answer"] for q in out if q["level"] == p["level"] and q["id"] != p["id"] for e in q["examples"]})
    rnd = random.Random(p["id"])
    for e in p["examples"]:
        wrong = rnd.sample([a for a in pool if a != e["answer"] and abs(len(a) - len(e["answer"])) <= 3] or pool, 2)
        e["choices"] = rnd.sample([e["answer"], *wrong], 3)
root = pathlib.Path(__file__).parent.parent / "data"
(root / "grammar.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print({lvl: sum(1 for p in out if p["level"] == lvl) for lvl in ("N5", "N4", "N3")}, "grammar points")
