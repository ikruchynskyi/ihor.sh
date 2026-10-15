# %% [markdown]
# # Practice: seq2seq and beam search
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/seq2seq.html
#
# Teach an encoder-decoder with attention to rewrite dates written six different ways ("Oct 15 2026", "15.10.2026",
# "october 15 26"…) as "2026-10-15". Write the attention step, train with teacher forcing, measure exact-match accuracy
# per format, draw where the decoder looks, and write beam search. About a minute on a CPU. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import datetime, random
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
random.seed(0); torch.manual_seed(0)
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
FORMATS = ["Month D, YYYY", "Mon D YYYY", "D Month YYYY", "M/D/YYYY", "DD.MM.YYYY", "month D YY"]
def write(d, k):
    m = MONTHS[d.month - 1]
    return [f"{m} {d.day}, {d.year}", f"{m[:3]} {d.day} {d.year}", f"{d.day} {m} {d.year}", f"{d.month}/{d.day}/{d.year}",
            f"{d.day:02d}.{d.month:02d}.{d.year}", f"{m.lower()} {d.day} {str(d.year)[2:]}"][k]
def example(rng):
    d = datetime.date(2000, 1, 1) + datetime.timedelta(days=rng.randrange(36 * 365)); k = rng.randrange(6)
    return write(d, k), d.isoformat(), k
SRC = sorted(set("".join(MONTHS) + "".join(MONTHS).lower() + "0123456789 ,./"))
TGT = list("0123456789-")
BOS, EOS = 0, 1
s2i = {c: i + 1 for i, c in enumerate(SRC)}; t2i = {c: i + 2 for i, c in enumerate(TGT)}; i2t = {i: c for c, i in t2i.items()}
rng = random.Random(0)
print([example(rng)[:2] for _ in range(4)])

# %% [markdown]
# ## 1. Characters to ids
# Write `encode(text)`: the list of source ids of its characters (`s2i[c]`; id 0 is kept for padding).

# %%
def encode(text):
    ### HINT [s2i[c] for c in text]
    ### BEGIN SOLUTION
    return [s2i[c] for c in text]
    ### END SOLUTION

# %%
check(lambda: encode("May 5") == [s2i["M"], s2i["a"], s2i["y"], s2i[" "], s2i["5"]] and 0 not in encode("12/31/2020"), "one id per character, none of them 0")

# %% [markdown]
# ## 2. The attention step
# `Seq2Seq` (given) encodes the source with a bidirectional GRU (`enc`: one 256-number vector per source character) and
# decodes with a GRU cell. Write the attention inside `step`: scores = how well the decoder state `h` matches each
# encoder vector (`(self.att(h)[:, None, :] * enc).sum(-1)`), padding positions set to −1e9 with
# `.masked_fill(~mask, -1e9)`, softmax over positions, then the context: the weighted average of `enc`.

# %%
class Seq2Seq(nn.Module):
    def __init__(self, H=128):
        super().__init__()
        self.src_emb, self.tgt_emb = nn.Embedding(len(SRC) + 1, 32), nn.Embedding(len(TGT) + 2, 32)
        self.encoder = nn.GRU(32, H, batch_first=True, bidirectional=True); self.bridge = nn.Linear(2 * H, H)
        self.cell, self.att, self.out = nn.GRUCell(32 + 2 * H, H), nn.Linear(H, 2 * H), nn.Linear(3 * H, len(TGT) + 2)
    def encode_src(self, x):
        enc, _ = self.encoder(self.src_emb(x))
        return enc, torch.tanh(self.bridge(enc.mean(1)))
    def step(self, y_prev, h, enc, mask):
        ### HINT scores = (self.att(h)[:, None, :] * enc).sum(-1).masked_fill(~mask, -1e9); weights = scores.softmax(1)
        ### HINT context = (weights[:, :, None] * enc).sum(1)
        ### BEGIN SOLUTION
        scores = (self.att(h)[:, None, :] * enc).sum(-1).masked_fill(~mask, -1e9)
        weights = scores.softmax(1)
        context = (weights[:, :, None] * enc).sum(1)
        ### END SOLUTION
        h = self.cell(torch.cat([self.tgt_emb(y_prev), context], 1), h)
        return self.out(torch.cat([h, context], 1)), h, weights

# %%
try:
    m0 = Seq2Seq(); x0 = torch.tensor([encode("May 5 2021") + [0, 0]]); e0, h0 = m0.encode_src(x0)
    lo0, _, w0 = m0.step(torch.tensor([BOS]), h0, e0, x0 > 0)
except Exception as e:                                        # sections 1 or 2 not written yet
    lo0 = w0 = None; print("not yet:", type(e).__name__)
check(lambda: lo0.shape == (1, 13) and torch.allclose(w0.sum(1), torch.ones(1)) and w0[0, -2:].max() < 1e-6,
      "13 output scores; the attention weights add to 1 and give the padding nothing")

# %% [markdown]
# ## 3. Train with teacher forcing (given)
# Each step the decoder gets the *correct* previous character, not its own guess. 1,500 batches of 64, about 40 s.

# %%
def batch(n, rng):
    ex = [example(rng) for _ in range(n)]; L = max(len(a) for a, _, _ in ex)
    x = torch.zeros(n, L, dtype=torch.long)
    for i, (a, _, _) in enumerate(ex):
        x[i, :len(a)] = torch.tensor(encode(a) or [0])
    y = torch.tensor([[t2i[c] for c in b] + [EOS] for _, b, _ in ex])
    return x, y

model = Seq2Seq(); opt = torch.optim.Adam(model.parameters(), lr=2e-3); rng = random.Random(1)
for it in range(1500):
    x, y = batch(64, rng); mask = x > 0; enc, h = model.encode_src(x); prev = torch.full((64,), BOS); loss = 0
    try:
        for j in range(y.shape[1]):
            logits, h, _ = model.step(prev, h, enc, mask); loss = loss + F.cross_entropy(logits, y[:, j]); prev = y[:, j]
    except Exception as e:
        print("attention not written yet:", type(e).__name__); break
    opt.zero_grad(); (loss / y.shape[1]).backward(); opt.step()
print("final training loss:", float(loss / y.shape[1]) if torch.is_tensor(loss) else None)

# %% [markdown]
# ## 4. Greedy decoding, and accuracy per format
# `greedy(text)` (given) writes the output one most-likely character at a time. On 600 new dates, set `per_format`: a
# dict from each format's index (0–5) to its exact-match accuracy.

# %%
@torch.no_grad()
def greedy(text, return_weights=False):
    x = torch.tensor([encode(text)]); enc, h = model.encode_src(x); prev, out, ws = torch.tensor([BOS]), "", []
    for _ in range(12):
        logits, h, w = model.step(prev, h, enc, x > 0); k = logits.argmax(1).item(); ws.append(w[0])
        if k == EOS:
            break
        out += i2t.get(k, "?"); prev = torch.tensor([k])
    return (out, torch.stack(ws)) if return_weights else out

test_rng = random.Random(123); tests = [example(test_rng) for _ in range(600)]
per_format = None
### HINT right = {k: [] for k in range(6)}; for text, target, k in tests: right[k].append(greedy(text) == target)
### HINT per_format = {k: float(np.mean(v)) for k, v in right.items()}
### BEGIN SOLUTION
right = {k: [] for k in range(6)}
for text, target, k in tests:
    right[k].append(greedy(text) == target)
per_format = {k: float(np.mean(v)) for k, v in right.items()}
### END SOLUTION
for k, acc in (per_format or {}).items():
    print(f"{FORMATS[k]:15s} {acc:.3f}")

# %%
check(lambda: np.mean(list(per_format.values())) > 0.85, "most formats near perfect; look at which one is hardest, and think about why")

# %% [markdown]
# ## 5. Where does it look?
# Run only: the attention weights while writing one date. Each row is an output character; bright cells are the
# source characters it read.

# %%
src = "October 15, 2026"
try:
    out, W = greedy(src, return_weights=True)
    plt.figure(figsize=(7, 3)); plt.imshow(W.numpy()[:len(out)], aspect="auto", cmap="viridis")
    plt.xticks(range(len(src)), list(src)); plt.yticks(range(len(out)), list(out)); plt.title(f"{src} → {out}"); plt.show()
except Exception as e:                                        # earlier sections not written yet
    print("not yet:", type(e).__name__)

# %% [markdown]
# ## 6. Beam search
# Write `beam(text, k)`: keep the `k` best partial outputs by total log-probability. Each beam is `(log_prob, chars,
# prev_id, h)`; at every step, extend each unfinished beam by its top `k` next characters (`log_softmax`), then keep the
# best `k` of all candidates. A candidate whose next id is `EOS` is finished. Return the best finished output.

# %%
@torch.no_grad()
def beam(text, k=3, max_len=12):
    x = torch.tensor([encode(text)]); enc, h = model.encode_src(x); mask = x > 0
    beams, finished = [(0.0, "", BOS, h)], []
    for _ in range(max_len):
        candidates = []
        for lp, chars, prev, hb in beams:
            logits, h2, _ = model.step(torch.tensor([prev]), hb, enc, mask)
            logp = F.log_softmax(logits[0], dim=0)
            ### HINT top = logp.topk(k); for score, idx in zip(top.values.tolist(), top.indices.tolist()):
            ### HINT if idx == EOS: finished.append((lp + score, chars)) else candidates.append((lp + score, chars + i2t[idx], idx, h2))
            ### BEGIN SOLUTION
            top = logp.topk(k)
            for score, idx in zip(top.values.tolist(), top.indices.tolist()):
                if idx == EOS:
                    finished.append((lp + score, chars))
                elif idx in i2t:
                    candidates.append((lp + score, chars + i2t[idx], idx, h2))
            ### END SOLUTION
        beams = sorted(candidates, key=lambda b: -b[0])[:k]
        if not beams:
            break
    return max(finished)[1] if finished else ""

# %%
check(lambda: beam("October 15, 2026") == "2026-10-15" and np.mean([beam(t) == g for t, g, _ in tests[:100]]) >= np.mean([greedy(t) == g for t, g, _ in tests[:100]]) - 0.02,
      "the right date, and at least as accurate as greedy: here the model is so sure that beam and greedy mostly agree; beams matter when it isn't")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Bahdanau, Cho & Bengio, "Neural Machine Translation by Jointly Learning to Align and Translate": https://arxiv.org/abs/1409.0473
