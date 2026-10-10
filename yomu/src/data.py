# Builds the complete JLPT N5–N1 kanji and vocabulary decks (yomu/data/*.json) so learners can study every item,
# not only the ones the stories use. Run: python3 yomu/src/data.py
# Sources (attributed on the hub page):
#   kanji:      KANJIDIC (EDRDG, CC BY-SA 4.0) + Jonathan Waller's JLPT levels, via github.com/davidluzgouveia/kanji-data
#   vocabulary: github.com/jamsinclair/open-anki-jlpt-decks (JLPT lists by Jonathan Waller, JMdict glosses)
import csv, io, json, pathlib, re, urllib.request

root = pathlib.Path(__file__).parent.parent / "data"
get = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ihor.sh"}), timeout=60).read().decode()
LEVELS = (5, 4, 3, 2, 1)

vocab = {}
for n in LEVELS:
    rows = csv.DictReader(io.StringIO(get(f"https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n{n}.csv")))
    vocab[n] = [{"w": r["expression"], "r": r["reading"], "m": r["meaning"]} for r in rows if r["expression"]]
    (root / f"vocab-n{n}.json").write_text(json.dumps(vocab[n], ensure_ascii=False, separators=(",", ":")))

data = json.loads(get("https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"))
kanji = []
for k, v in data.items():
    n = v.get("jlpt_new")
    if n not in LEVELS: continue
    # Example words: the commonest words at this level or easier that use the kanji.
    ex = [w for lvl in LEVELS[:LEVELS.index(n) + 1] for w in vocab[lvl] if k in w["w"] and w["w"] != w["r"]][:4]
    kanji.append({"k": k, "n": n, "s": v["strokes"], "f": v.get("freq") or 9999, "m": [m for m in v["meanings"] if "radical" not in m.lower()][:4],
                  "on": v["readings_on"][:4], "kun": v["readings_kun"][:5], "ex": [[w["w"], w["r"], w["m"].split(",")[0]] for w in ex]})
kanji.sort(key=lambda x: (-x["n"], x["f"]))
(root / "kanji.json").write_text(json.dumps(kanji, ensure_ascii=False, separators=(",", ":")))
print({f"N{n}": {"kanji": sum(1 for x in kanji if x["n"] == n), "words": len(vocab[n])} for n in LEVELS})
