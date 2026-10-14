# %% [markdown]
# # Practice: attention, by hand and in PyTorch
# *AI from scratch, chapter 7* · lesson: https://ihor.sh/ai/07-attention.html
#
# Write scaled dot-product attention yourself and check it against PyTorch's, add the causal mask, split it into
# heads, give positions a signal, and run a real transformer layer. Every large language model is stacks of this.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

torch.manual_seed(0)

# %% [markdown]
# ## 1. Scaled dot-product attention
# Write `attention(Q, K, V, causal=False)` for tensors of shape (batch, length, d): scores $QK^\top/\sqrt{d}$,
# optionally mask out future positions with $-\infty$ (`torch.triu(..., diagonal=1)`), softmax over the last
# dimension, then multiply by V. Return (output, weights).

# %%
def attention(Q, K, V, causal=False):
    ### BEGIN SOLUTION
    scores = Q @ K.transpose(-2, -1) / math.sqrt(Q.shape[-1])
    if causal:
        L = Q.shape[-2]
        scores = scores.masked_fill(torch.triu(torch.ones(L, L, dtype=torch.bool), diagonal=1), float("-inf"))
    w = scores.softmax(-1)
    return w @ V, w
    ### END SOLUTION

Q, K, V = torch.randn(3, 5, 8, dtype=torch.float64).unbind(0)
Q, K, V = Q[None], K[None], V[None]                    # batch of 1, 5 positions, d = 8

# %%
check(lambda: torch.allclose(attention(Q, K, V)[0], F.scaled_dot_product_attention(Q, K, V)), "matches PyTorch's scaled_dot_product_attention")
check(lambda: torch.allclose(attention(Q, K, V, causal=True)[0], F.scaled_dot_product_attention(Q, K, V, is_causal=True)), "the causal version matches too")
check(lambda: torch.allclose(attention(Q, K, V, causal=True)[1].triu(1), torch.zeros(1, 5, 5, dtype=torch.float64)), "no weight on future positions")

# %% [markdown]
# ## 2. Why divide by √d?
# With random vectors, a dot product's spread grows like √d. Compute the standard deviation of the scores for
# d = 4, 64 and 1024 **without** the scaling (`q @ k` for 10,000 random pairs), and the largest softmax weight that
# typical row gets. Set `spread` (a list). Without scaling, big d makes softmax nearly one-hot and gradients vanish.

# %%
spread = None
### BEGIN SOLUTION
spread = [(torch.randn(10_000, d) * torch.randn(10_000, d)).sum(1).std().item() for d in (4, 64, 1024)]
### END SOLUTION
print(spread)

# %%
check(lambda: abs(spread[0] - 2) < 0.2 and abs(spread[2] - 32) < 2, "spread ≈ √d: 2, 8, 32")

# %% [markdown]
# ## 3. Multi-head attention
# Several smaller attentions run side by side, each free to look for something different. PyTorch's
# `nn.MultiheadAttention(embed_dim=32, num_heads=4, batch_first=True)` does the projections and the split. Run it as
# self-attention on `x` (query = key = value = x) and set `out` and `w` (it averages the heads' weights by default).

# %%
mha = nn.MultiheadAttention(embed_dim=32, num_heads=4, batch_first=True)
x = torch.randn(2, 7, 32)                               # 2 sentences, 7 tokens, 32 numbers each
out = w = None
### BEGIN SOLUTION
out, w = mha(x, x, x)
### END SOLUTION
print(out.shape if out is not None else None, w.shape if w is not None else None)

# %%
check(lambda: out.shape == (2, 7, 32) and w.shape == (2, 7, 7), "same shape out as in; one 7×7 weight table per sentence")
check(lambda: torch.allclose(w.sum(-1), torch.ones(2, 7)), "each row of weights adds to 1")

# %% [markdown]
# ## 4. Where am I? Sinusoidal positions
# Attention itself ignores order. The original transformer adds a position signal:
# $PE[p, 2i] = \sin(p / 10000^{2i/d})$, $PE[p, 2i+1] = \cos(p / 10000^{2i/d})$. Write `positions(L, d)` returning an
# (L, d) array, and look at it: slow waves on the right, fast on the left, a unique pattern per row.

# %%
def positions(L, d):
    ### BEGIN SOLUTION
    p = np.arange(L)[:, None]; i = np.arange(d // 2)[None, :]
    PE = np.zeros((L, d)); PE[:, 0::2] = np.sin(p / 10000 ** (2 * i / d)); PE[:, 1::2] = np.cos(p / 10000 ** (2 * i / d))
    return PE
    ### END SOLUTION

PE = positions(50, 64)
if PE is not None:
    plt.figure(figsize=(8, 3)); plt.imshow(PE, aspect="auto", cmap="RdBu"); plt.xlabel("dimension"); plt.ylabel("position"); plt.show()

# %%
check(lambda: PE.shape == (50, 64) and np.allclose(PE[0, 0::2], 0) and np.allclose(PE[0, 1::2], 1), "position 0 is sin 0 = 0, cos 0 = 1")
check(lambda: len({tuple(np.round(r, 6)) for r in PE}) == 50, "every position gets a different pattern")

# %% [markdown]
# ## 5. A real transformer layer
# `nn.TransformerEncoderLayer(d_model=32, nhead=4, dim_feedforward=128, batch_first=True, norm_first=True)` is the
# block from the lesson: attention + residual, MLP + residual, layer norms. Stack 3 with `nn.TransformerEncoder`,
# run `x` through with a causal mask (`nn.Transformer.generate_square_subsequent_mask(7)`), and set `y` and
# `n_params`. Then verify causality: change the **last** token of `x` and check the first six outputs don't move.

# %%
y = n_params = unchanged = None
### BEGIN SOLUTION
enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(32, 4, 128, batch_first=True, norm_first=True), num_layers=3).eval()
mask = nn.Transformer.generate_square_subsequent_mask(7)
y = enc(x, mask=mask, is_causal=True)
n_params = sum(p.numel() for p in enc.parameters())
x2 = x.clone(); x2[:, -1] += 1.0
unchanged = torch.allclose(enc(x2, mask=mask, is_causal=True)[:, :6], y[:, :6], atol=1e-5)
### END SOLUTION
print(y.shape if y is not None else None, n_params, unchanged)

# %%
check(lambda: y.shape == x.shape, "same shape in, same shape out")
check(lambda: unchanged, "with the causal mask, a later token can't change earlier outputs")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 10, where you train a tiny GPT.
