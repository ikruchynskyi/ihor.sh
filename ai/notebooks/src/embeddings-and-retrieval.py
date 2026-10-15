# %% [markdown]
# # Practice: embeddings and retrieval
# *AI from scratch, stage 6* · lesson: https://ihor.sh/ai/embeddings-and-retrieval.html
#
# Search this course's own 254 lesson sections three ways (keywords, embeddings, both), measure each with 35 test
# questions and recall@k, see what chunk size does, then build a RAG prompt and let a small open model answer from it.
# A few minutes on a CPU. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import json, subprocess, sys, urllib.request
import numpy as np
try:
    from sentence_transformers import SentenceTransformer
except ImportError:                                       # preinstalled on Colab and Kaggle; elsewhere, install it
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "sentence-transformers"]); from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
index = json.load(urllib.request.urlopen(DATA + "course-chunks.json"))
sections = index["sections"]
questions = json.load(urllib.request.urlopen(DATA + "retrieval-questions.json"))["questions"]
docs = [f"{s['lesson']}: {s['section']}. {s['text']}" for s in sections]
target = [next(i for i, s in enumerate(sections) if s["page"] == q["page"] and s["section"].startswith(f"{q['section']}.")) for q in questions]
print(len(sections), "sections ·", len(questions), "test questions, e.g.:", questions[0]["q"], "→", sections[target[0]]["section"])

# %% [markdown]
# ## 1. Keyword search
# Fit a TF-IDF vectorizer on `docs` (given) and set `kw`: a (35, 254) array of each question's similarity to each
# section. TF-IDF rows are unit length, so the dot products `Q @ D.T` are cosines; `.toarray()` makes it a NumPy array.

# %%
tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(docs)
D = tfidf.transform(docs)
kw = None
### HINT Q = tfidf.transform([q["q"] for q in questions])
### HINT kw = (Q @ D.T).toarray()
### BEGIN SOLUTION
Q = tfidf.transform([q["q"] for q in questions])
kw = (Q @ D.T).toarray()
### END SOLUTION
print(kw.shape if kw is not None else None)

# %%
check(lambda: kw.shape == (35, 254) and np.isclose(kw[0].max(), (tfidf.transform([questions[0]["q"]]) @ D.T).toarray().max()),
      "one row per question, one column per section")

# %% [markdown]
# ## 2. recall@k
# Write `recall_at(scores, k)`: the share of questions whose target section (`target[i]`) is among the `k` highest
# scores in row `i`. `np.argsort(-row)[:k]` gives the positions of the `k` largest.

# %%
def recall_at(scores, k):
    ### HINT hits = [target[i] in np.argsort(-scores[i])[:k] for i in range(len(target))]
    ### HINT return float(np.mean(hits))
    ### BEGIN SOLUTION
    hits = [target[i] in np.argsort(-scores[i])[:k] for i in range(len(target))]
    return float(np.mean(hits))
    ### END SOLUTION

print("keywords: recall@1", recall_at(kw, 1), "· @5", recall_at(kw, 5)) if kw is not None else None

# %%
check(lambda: recall_at(np.eye(254)[target], 1) == 1.0 and abs(recall_at(kw, 5) - 0.77) < 0.03,
      "a perfect scorer gets 1.0; TF-IDF finds the right section in its top 5 for about 77% of the questions")

# %% [markdown]
# ## 3. Embedding search
# Embed the 35 questions with the same model the index used, normalized to unit length (`normalize_embeddings=True`).
# The index stores one 8-bit vector per *piece* (about 100 words); a section's score is the best of its pieces. Set
# `emb` to the (35, 254) section scores: `P = Qe @ E.T` gives question-by-piece cosines; for each section `j`, take
# the max over its pieces' columns, `P[:, owner == j].max(axis=1)`.

# %%
import base64
model = SentenceTransformer(index["model"])
E = np.frombuffer(base64.b64decode(index["vectors"]), dtype=np.int8).reshape(-1, index["dim"]).astype(np.float32)
E /= np.linalg.norm(E, axis=1, keepdims=True)
owner = np.array([p["s"] for p in index["pieces"]])
Qe = model.encode([q["q"] for q in questions], normalize_embeddings=True)
emb = None
### HINT P = Qe @ E.T has shape (35, 640). Then a list of columns, one per section.
### HINT emb = np.stack([P[:, owner == j].max(axis=1) for j in range(len(sections))], axis=1)
### BEGIN SOLUTION
P = Qe @ E.T
emb = np.stack([P[:, owner == j].max(axis=1) for j in range(len(sections))], axis=1)
### END SOLUTION
print("embeddings: recall@1", recall_at(emb, 1) if emb is not None else None, "· @5", recall_at(emb, 5) if emb is not None else None)

# %%
check(lambda: emb.shape == (35, 254) and recall_at(emb, 5) > 0.7, "about 80% at k = 5, about the same as keywords overall, but right on different questions")

# %% [markdown]
# ## 4. Hybrid
# The two scores live on different scales, so standardize each row first (subtract the row's mean, divide by its
# standard deviation; `keepdims=True` keeps the shapes broadcastable), then add. Set `hyb`.

# %%
hyb = None
### HINT z = lambda S: (S - S.mean(axis=1, keepdims=True)) / S.std(axis=1, keepdims=True)
### HINT hyb = z(kw) + z(emb)
### BEGIN SOLUTION
z = lambda S: (S - S.mean(axis=1, keepdims=True)) / S.std(axis=1, keepdims=True)
hyb = z(kw) + z(emb)
### END SOLUTION
for name, S in [("keywords", kw), ("embeddings", emb), ("hybrid", hyb)]:
    if S is not None:
        print(f"{name:11s}", "  ".join(f"recall@{k} {recall_at(S, k):.2f}" for k in (1, 3, 5)))

# %%
check(lambda: recall_at(hyb, 5) > max(recall_at(kw, 5), recall_at(emb, 5)), "together they beat each alone: their mistakes are on different questions")

# %% [markdown]
# ## 5. What chunk size does
# Embed whole sections instead of pieces (each section text is cut off at the model's 256-token window anyway), and
# set `whole` to their (35, 254) scores. Compare recall@5 with the pieces in section 3.

# %%
whole = None
### HINT S_emb = model.encode(docs, normalize_embeddings=True) gives one vector per section.
### HINT whole = Qe @ S_emb.T
### BEGIN SOLUTION
S_emb = model.encode(docs, normalize_embeddings=True)
whole = Qe @ S_emb.T
### END SOLUTION
print("whole sections: recall@5", recall_at(whole, 5) if whole is not None else None, "· 100-word pieces:", recall_at(emb, 5) if emb is not None else None)

# %%
check(lambda: recall_at(whole, 5) < recall_at(emb, 5), "long sections blur (and get cut off); pieces the model reads whole match better")

# %% [markdown]
# ## 6. The RAG prompt
# Write `rag_prompt(question, k=3)`: take the `k` best sections by the hybrid score for this question (compute the
# question's keyword and embedding scores the same way as above), and return the lesson's prompt: the instruction line,
# then each passage numbered `[1]`, `[2]`… with its lesson and section and the first 500 characters of its text, then
# the question.

# %%
def scores_for(q):
    k = (tfidf.transform([q]) @ D.T).toarray()[0]
    p = model.encode([q], normalize_embeddings=True)[0] @ E.T
    e = np.array([p[owner == j].max() for j in range(len(sections))])
    return (k - k.mean()) / k.std() + (e - e.mean()) / e.std()

INSTRUCTION = "Answer the question using only the numbered passages below. Cite them like [1]. If they don't contain the answer, say you don't know."
def rag_prompt(question, k=3):
    best = np.argsort(-scores_for(question))[:k]
    ### HINT passages = [f"[{n + 1}] {sections[i]['lesson']}, \"{sections[i]['section']}\"\n{sections[i]['text'][:500]}" for n, i in enumerate(best)]
    ### HINT return INSTRUCTION + "\n\n" + "\n\n".join(passages) + "\n\nQuestion: " + question
    ### BEGIN SOLUTION
    passages = [f"[{n + 1}] {sections[i]['lesson']}, \"{sections[i]['section']}\"\n{sections[i]['text'][:500]}" for n, i in enumerate(best)]
    return INSTRUCTION + "\n\n" + "\n\n".join(passages) + "\n\nQuestion: " + question
    ### END SOLUTION

prompt = rag_prompt("Why does Adam need bias correction?")
print(prompt)

# %%
check(lambda: prompt.startswith(INSTRUCTION) and "[1]" in prompt and "[3]" in prompt and "Optimizers" in prompt and prompt.endswith("Why does Adam need bias correction?"),
      "the instruction, three numbered passages (the optimizers lesson among them), then the question")

# %% [markdown]
# ## 7. Let a small model answer from it
# Run only. SmolLM2-360M-Instruct answers from the passages (the same model as in the using-LLMs notebook). Read the
# answer against the passages: is every claim in them? Small models often get the gist and fumble the details, which
# is exactly what the next lesson's evals are for.

# %%
from transformers import AutoTokenizer, AutoModelForCausalLM
name = "HuggingFaceTB/SmolLM2-360M-Instruct"
tok, llm = AutoTokenizer.from_pretrained(name), AutoModelForCausalLM.from_pretrained(name)
if prompt is not None:
    ids = tok(tok.apply_chat_template([{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True), return_tensors="pt").input_ids
    out = llm.generate(ids, max_new_tokens=120, do_sample=False)
    print(tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True))

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Sentence Transformers documentation: https://www.sbert.net/
