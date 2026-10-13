# Compiles Kanjium's raw accents.txt into a compact yomu/data/pitch.json mapping for Yomu.
# Covers all JLPT N5–N1 words, story tokens, and common conversational expressions.
# Run: python3 yomu/src/pitch.py
import glob, json, pathlib, urllib.request

root = pathlib.Path(__file__).parent.parent
data_dir = root / "data"

print("Fetching Kanjium accents.txt...")
url = "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt"
req = urllib.request.Request(url, headers={"User-Agent": "ihor.sh/yomu"})
raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")

accents = {}
for line in raw.strip().split("\n"):
    parts = line.split("\t")
    if len(parts) >= 3:
        w, r, p = parts[0].strip(), parts[1].strip(), parts[2].strip()
        try:
            p_nums = [int(x) for x in p.split(",") if x.isdigit()]
            if p_nums:
                accents[f"{w}|{r}"] = p_nums
                if w not in accents:
                    accents[w] = p_nums
                if r not in accents:
                    accents[r] = p_nums
        except Exception:
            pass

print(f"Total raw accent entries: {len(accents)}")

yomu_pitch = {}

# 1. JLPT N5..N1 vocabulary
for lvl in range(1, 6):
    vocab_file = data_dir / f"vocab-n{lvl}.json"
    if vocab_file.exists():
        with open(vocab_file) as f:
            for item in json.load(f):
                w, r = item["w"], item["r"]
                k = f"{w}|{r}"
                if k in accents:
                    yomu_pitch[k] = accents[k]
                elif w in accents:
                    yomu_pitch[w] = accents[w]
                elif r in accents:
                    yomu_pitch[r] = accents[r]

# 2. Story tokens
for fpath in glob.glob(str(root / "stories" / "n*.json")):
    with open(fpath) as f:
        st = json.load(f)
        for line in st.get("lines", []):
            for tok in line.get("t", []):
                s = tok[0]
                r = tok[1] if len(tok) > 1 and tok[1] else s
                k = f"{s}|{r}"
                if k in accents:
                    yomu_pitch[k] = accents[k]
                elif s in accents:
                    yomu_pitch[s] = accents[s]
                elif r in accents:
                    yomu_pitch[r] = accents[r]

out_file = data_dir / "pitch.json"
out_json = json.dumps(yomu_pitch, ensure_ascii=False, separators=(",", ":"))
out_file.write_text(out_json)
print(f"Wrote {len(yomu_pitch)} pitch accent entries to {out_file} ({len(out_json.encode('utf-8')) / 1024:.1f} KB)")
