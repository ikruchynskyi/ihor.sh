# %% [markdown]
# # Practice: word vectors
# *AI from scratch, stage 5* · lesson: https://ihor.sh/ai/word-vectors.html
#
# Train word2vec's skip-gram with negative sampling in PyTorch on WikiText-2 (two million words of Wikipedia), look up
# nearest neighbors, then load 20,000 real GloVe vectors to solve analogies and measure the gender leanings the lesson
# shows. About a minute on a CPU. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import io, re, urllib.request
from collections import Counter
import numpy as np
import pandas as pd
import torch
from torch import nn
import torch.nn.functional as F
torch.manual_seed(0); rng = np.random.default_rng(0)

url = "https://huggingface.co/datasets/Salesforce/wikitext/resolve/main/wikitext-2-raw-v1/train-00000-of-00001.parquet"
text = " ".join(pd.read_parquet(io.BytesIO(urllib.request.urlopen(url).read()))["text"]).lower()
tokens = re.findall(r"[a-z]+", text)
counts = Counter(tokens)
print(len(tokens), "words,", len(counts), "different ones; most common:", counts.most_common(8))

# %% [markdown]
# ## 1. A vocabulary
# Keep the 5,000 most common words. Set `vocab` to their list (`counts.most_common(5000)` gives (word, count) pairs;
# keep just the words).

# %%
vocab = None
### HINT A list comprehension over counts.most_common(5000), keeping the first item of each pair.
### HINT vocab = [w for w, n in counts.most_common(5000)]
### BEGIN SOLUTION
vocab = [w for w, n in counts.most_common(5000)]
### END SOLUTION

# %%
check(lambda: len(vocab) == 5000 and vocab[0] == "the", "5,000 words, most frequent first ('the')")

# %% [markdown]
# ## 2. Center-context pairs
# `ids` (given) is the text as vocabulary ids, with very frequent words thinned out (word2vec's subsampling: "the"
# teaches little). Build `pairs`: an array of shape (n, 2) holding every (center, context) pair within 2 positions.
# For an offset `o`, the centers are `ids[2:-2]` and their contexts `ids[2 + o:len(ids) - 2 + o]`; stack them as two
# columns with `np.stack([..., ...], axis=1)` and join the four offsets -2, -1, 1, 2 with `np.concatenate`.

# %%
ix = {w: i for i, w in enumerate(vocab)} if vocab else {}
ids = np.array([ix[w] for w in tokens if w in ix])
freq = np.array([counts[w] for w in vocab]) / len(tokens) if vocab else np.ones(1)
keep = np.minimum(1, np.sqrt(1e-4 / freq[ids]) + 1e-4 / freq[ids]) if vocab else np.ones(0)
ids = ids[rng.random(len(ids)) < keep]
pairs = None
### HINT np.concatenate([np.stack([ids[2:-2], ids[2 + o:len(ids) - 2 + o]], axis=1) for o in (-2, -1, 1, 2)])
### BEGIN SOLUTION
pairs = np.concatenate([np.stack([ids[2:-2], ids[2 + o:len(ids) - 2 + o]], axis=1) for o in (-2, -1, 1, 2)])
### END SOLUTION
print(pairs.shape if pairs is not None else None, "· example:", [(vocab[a], vocab[b]) for a, b in pairs[:5]] if pairs is not None else None)

# %%
check(lambda: pairs.shape == (4 * (len(ids) - 4), 2) and pairs[0, 0] == ids[2] and pairs[0, 1] == ids[0],
      "four pairs per center word; the first is (ids[2], ids[0]), offset −2")

# %% [markdown]
# ## 3. The negative-sampling loss
# For a batch: `pos` holds each true pair's dot product \(w \cdot c\) (shape `(B,)`), and `neg` the dot products with 5
# random words (shape `(B, 5)`). Write the lesson's loss: `−[log σ(pos) + Σ log σ(−neg)]`, averaged over the batch.
# `F.logsigmoid(x)` is \(\ln \sigma(x)\), computed safely.

# %%
def sgns_loss(pos, neg):
    ### HINT F.logsigmoid(pos) is (B,); F.logsigmoid(-neg).sum(1) adds the 5 negatives of each row.
    ### HINT return -(F.logsigmoid(pos) + F.logsigmoid(-neg).sum(1)).mean()
    ### BEGIN SOLUTION
    return -(F.logsigmoid(pos) + F.logsigmoid(-neg).sum(1)).mean()
    ### END SOLUTION

# %%
check(lambda: abs(sgns_loss(torch.zeros(4), torch.zeros(4, 5)).item() - 6 * np.log(2)) < 1e-5 and sgns_loss(torch.full((4,), 10.0), torch.full((4, 5), -10.0)).item() < 1e-3,
      "with all dot products 0 every term is ln 2 (6 ln 2 ≈ 4.16); confident and right, it's near 0")

# %% [markdown]
# ## 4. Train it, and look at the neighbors
# Training is given: two passes over about 3 million pairs, in batches of 4,096, about 10 seconds. Then write
# `nearest(word, k)`: the `k` words with the highest cosine similarity to `word`, leaving the word itself out.
# `U` holds the unit-length center vectors, so a cosine is just `U @ U[ix[word]]`.

# %%
noise = torch.tensor(freq ** 0.75 / (freq ** 0.75).sum())            # word2vec draws negatives ∝ count^0.75
W, C = nn.Embedding(len(freq), 64), nn.Embedding(len(freq), 64)
nn.init.normal_(W.weight, 0, 0.1); nn.init.zeros_(C.weight)
opt = torch.optim.Adam(list(W.parameters()) + list(C.parameters()), lr=3e-3)
P = torch.tensor(pairs) if pairs is not None else torch.zeros(0, 2, dtype=torch.long)
for epoch in range(2):
    perm = torch.randperm(len(P))
    for i in range(0, len(P), 4096):
        b = P[perm[i:i + 4096]]; vw = W(b[:, 0])
        neg_ids = torch.multinomial(noise, len(b) * 5, replacement=True).view(-1, 5)
        loss = sgns_loss((vw * C(b[:, 1])).sum(1), (C(neg_ids) @ vw[:, :, None])[:, :, 0])
        if loss is None:
            break
        opt.zero_grad(); loss.backward(); opt.step()
U = F.normalize(W.weight.detach(), dim=1)

def nearest(word, k=6):
    ### HINT sims = U @ U[ix[word]]; the order from most similar is sims.argsort(descending=True)
    ### HINT Skip the first (the word itself): return [vocab[i] for i in sims.argsort(descending=True)[1:k + 1]]
    ### BEGIN SOLUTION
    sims = U @ U[ix[word]]
    return [vocab[i] for i in sims.argsort(descending=True)[1:k + 1]]
    ### END SOLUTION

for q in ["france", "three", "river", "music", "war"]:
    print(q, "→", nearest(q))

# %%
check(lambda: len(nearest("three")) == 6 and "three" not in nearest("three") and len({"two", "four", "five", "six", "seven"} & set(nearest("three"))) >= 2,
      "numbers near numbers: two, four, six… from nothing but which words stood next to which")

# %% [markdown]
# ## 5. Analogies with real GloVe vectors
# 20,000 GloVe vectors (the ones the lesson uses), as 8-bit unit vectors (given). Write `analogy(a, b, c)`: the word
# nearest to `b − a + c`, *excluding* `a`, `b` and `c` themselves. Set those three scores to −inf before taking the best.

# %%
G_URL = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
gwords = urllib.request.urlopen(G_URL + "glove-20k.txt").read().decode().split("\n")[:-1]
G = np.frombuffer(urllib.request.urlopen(G_URL + "glove-20k.bin").read(), dtype=np.int8).reshape(-1, 50).astype(np.float32)
G /= np.linalg.norm(G, axis=1, keepdims=True); gix = {w: i for i, w in enumerate(gwords)}

def analogy(a, b, c):
    v = G[gix[b]] - G[gix[a]] + G[gix[c]]
    s = G @ v
    ### HINT for w in (a, b, c): s[gix[w]] = -np.inf
    ### HINT return gwords[int(np.argmax(s))]
    ### BEGIN SOLUTION
    for w in (a, b, c):
        s[gix[w]] = -np.inf
    return gwords[int(np.argmax(s))]
    ### END SOLUTION

for a, b, c in [("man", "king", "woman"), ("paris", "france", "tokyo"), ("walk", "walked", "swim"), ("man", "doctor", "woman")]:
    print(f"{a} : {b} :: {c} : {analogy(a, b, c)}")

# %%
check(lambda: analogy("man", "king", "woman") == "queen" and analogy("paris", "france", "tokyo") == "japan",
      "queen and japan, once the three input words can't be the answer")

# %% [markdown]
# ## 6. Measure a leaning
# Set `lean` to a dict from each occupation to its projection on the unit vector from "she" to "he":
# `g = G[gix["he"]] - G[gix["she"]]`, divided by its length (`np.linalg.norm`), then `G[gix[w]] @ g`.

# %%
jobs = ["nurse", "dancer", "teacher", "doctor", "engineer", "architect", "boss", "captain"]
lean = None
### HINT g = G[gix["he"]] - G[gix["she"]]; g = g / np.linalg.norm(g)
### HINT lean = {w: float(G[gix[w]] @ g) for w in jobs}
### BEGIN SOLUTION
g = G[gix["he"]] - G[gix["she"]]
g = g / np.linalg.norm(g)
lean = {w: float(G[gix[w]] @ g) for w in jobs}
### END SOLUTION
for w, p in sorted(lean.items(), key=lambda kv: kv[1]) if lean else []:
    print(f"{w:10s} {p:+.2f}", "█" * int(abs(p) * 40))

# %%
check(lambda: lean["nurse"] < -0.2 and lean["captain"] > 0.2, "nurse about −0.33 (toward 'she'), captain about +0.35 (toward 'he'): learned from how the text used them")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Levy and Goldberg, "Neural Word Embedding as Implicit Matrix Factorization" (2014).
