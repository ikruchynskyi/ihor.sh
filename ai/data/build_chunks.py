"""Build ai/data/course-chunks.json: every section of every live AI lesson, split into pieces with sentence embeddings.

The embeddings lesson searches these in the browser, and its notebook evaluates retrieval on them. Rerun after lessons
change (needs sentence-transformers): python3 ai/data/build_chunks.py
"""
import base64, html, json, re
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer

AI = Path(__file__).resolve().parent.parent
order = re.findall(r'<li class="card"><span class="tag">[^<]*</span><a href="\./([^"#]+\.html)"', (AI / "index.html").read_text())
chunks = []
for page in order:
    s = (AI / page).read_text()
    title = html.unescape(re.search(r"<h1>(.*?)</h1>", s, re.S).group(1))
    body = re.sub(r"<script.*?</script>|<style.*?</style>|<textarea.*?</textarea>|<pre.*?</pre>|<details.*?</details>|<canvas.*?</canvas>", " ", s, flags=re.S)
    body = re.sub(r'<div class="q".*?</div>\s*</div>', " ", body, flags=re.S)       # quiz questions aren't content
    parts = re.split(r"<h2>(.*?)</h2>", body, flags=re.S)
    for head, text in zip(parts[1::2], parts[2::2]):
        head = re.sub(r"\\\(|\\\)", "", html.unescape(re.sub(r"<[^>]+>", "", head))).strip()
        if head.lower().endswith("what to carry forward"):
            continue
        text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))).strip()
        text = re.sub(r"\\\(|\\\)|\\\[|\\\]", "", text)[:1600]
        if len(text) > 80:
            chunks.append({"page": page, "lesson": title, "section": head, "text": text})
# Embedding models read a limited window (all-MiniLM-L6-v2: 256 word pieces), and long sections blur together, so each
# section is split into overlapping pieces of about 100 words (~600 characters), each prefixed with its titles.
pieces = []
for i, c in enumerate(chunks):
    words = c["text"].split()
    for start in range(0, max(1, len(words) - 50), 50):
        pieces.append({"s": i, "text": " ".join(words[start:start + 100])})
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
E = model.encode([f"{chunks[p['s']]['lesson']}: {chunks[p['s']]['section']}. {p['text']}" for p in pieces], normalize_embeddings=True)
Q = np.round(E * 127).astype(np.int8)
out = {"about": "Sections of the AI from scratch lessons (ihor.sh/ai), split into overlapping ~100-word pieces, with all-MiniLM-L6-v2 "
                "sentence embeddings of 'lesson: section. piece' (384 numbers, unit length × 127, int8, base64, one row per piece).",
       "model": "sentence-transformers/all-MiniLM-L6-v2", "dim": int(Q.shape[1]), "sections": chunks, "pieces": pieces,
       "vectors": base64.b64encode(Q.tobytes()).decode()}
(AI / "data" / "course-chunks.json").write_text(json.dumps(out, ensure_ascii=False))
print(len(chunks), "sections,", len(pieces), "pieces, from", len(order), "lessons")
