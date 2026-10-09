# Compiles the compact story notation in src/n5.py (etc.) to stories/*.json + stories/index.json.
# Line notation: tokens separated by "|". 私{わたし}=I is a word with reading and gloss; ^は=topic is a particle;
# 。、？！… alone are punctuation. "who: tokens >> English".
import json, re, sys, importlib.util, pathlib

PUNCT = set("。、？！…「」")
def token(t):
    t = t.strip()
    if t and all(c in PUNCT for c in t): return [t, None, None, "x"]
    particle = t.startswith("^")
    if particle: t = t[1:]
    # 朝{あさ}ごはん: kana after the reading belongs to both the word and its reading
    m = re.fullmatch(r"([^{=]+)(?:\{([^}]*)\}([^=]*))?(?:=(.*))?", t)
    if not m: raise ValueError(f"bad token {t!r}")
    s, r, g = m.group(1) + (m.group(3) or ""), (m.group(2) + (m.group(3) or "")) if m.group(2) is not None else None, m.group(4)
    return [s, r, g, "p"] if particle else [s, r, g] if g or r else [s, r, None]
def line(text):
    who, rest = text.split(":", 1)
    jp, en = rest.split(">>")
    return {"who": who.strip(), "t": [token(x) for x in jp.split("|") if x.strip()], "en": en.strip()}
def toks(text): return [token(x) for x in text.split("|") if x.strip()]

root = pathlib.Path(__file__).parent.parent
# Story grammar → its full lesson in data/grammar.json (ids that differ; matching ids link as they are).
REF = {"plain-speech": "plain-form", "tara": "conditional-tara", "ba": "conditional-ba", "nara-to": "conditional-nara", "transitive-pairs": "transitive",
       "ageru-kureru": "ageru", "te-favor": "kureru", "sou-two": "sou-looks", "rashii-mitai": "rashii", "wa-desu": "da-desu", "ja-arimasen": "janai",
       "ko-so-a": "kosoado", "kono": "kosoado", "no-pronoun": "no", "ni-he": "ni-dest", "deshita": "datta-deshita", "to": "to-and", "kunai": "i-adj",
       "aru-iru": "existence", "ni-ga": "ni-exist", "position": "existence", "masenka": "mashou", "teiru": "te-iru", "tekudasai": "te-kudasai"}
LESSONS = {p["id"]: p["level"] for p in json.loads((root / "data" / "grammar.json").read_text())}
catalog = []
for name in sys.argv[1:]:
    spec = importlib.util.spec_from_file_location(name, root / "src" / f"{name}.py"); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    for u in mod.UNITS:
        u = dict(u)
        u["lines"] = [line(l) for l in u["lines"]]
        for g in u["grammar"]:
            g["examples"] = [{"t": toks(e[0]), "en": e[1]} for e in g["examples"]]
            ref = REF.get(g["id"], g["id"])
            if ref in LESSONS: g["lesson"] = f"grammar.html?level={LESSONS[ref]}#{ref}"
        u["kanji"] = [{"k": k[0], "on": k[1].split(","), "kun": k[2].split(","), "m": k[3], "ex": [list(x) for x in k[4]]} for k in u["kanji"]]
        (root / "stories" / f"{u['id']}.json").write_text(json.dumps(u, ensure_ascii=False, indent=1))
        catalog.append({k: u[k] for k in ("id", "level", "unit", "title")} | {"grammar": [g["title"] for g in u["grammar"]], "kanji": [k["k"] for k in u["kanji"]]})
existing = json.loads((root / "stories" / "index.json").read_text()) if (root / "stories" / "index.json").exists() else []
merged = {c["id"]: c for c in existing} | {c["id"]: c for c in catalog}
(root / "stories" / "index.json").write_text(json.dumps(sorted(merged.values(), key=lambda c: (-int(c["level"][1]), c["unit"])), ensure_ascii=False, indent=1))
print(f"{len(catalog)} units written")
