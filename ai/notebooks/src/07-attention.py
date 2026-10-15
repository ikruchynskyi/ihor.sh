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

torch.manual_seed(0)

# %% [markdown]
# ## 1. Scaled dot-product attention
# `attention(Q, K, V, causal=False)` works on tensors of shape (batch, length, d). The scores $QK^\top/\sqrt{d}$ are
# computed for you, and so is `mask`: True above the diagonal, the positions in each token's future.
# Two steps are yours. First, when `causal`, set the masked scores to $-\infty$: `scores.masked_fill(mask, value)`
# puts `value` wherever `mask` is True, and `float("-inf")` is $-\infty$ in Python. Then take the softmax over the
# last dimension and multiply by V, returning (output, weights), as in the lesson's NumPy version.

# %%
def attention(Q, K, V, causal=False):
    """Scaled Dot-Product Attention: Softmax(Q @ K.T / sqrt(d_k)) @ V.
    
    Args:
        Q: Query tensor of shape (..., seq_len, d_k).
        K: Key tensor of shape (..., seq_len, d_k).
        V: Value tensor of shape (..., seq_len, d_v).
        causal: Boolean, if True applies upper-triangular autoregressive mask.
    Returns:
        tuple: (output, weights) where output has shape (..., seq_len, d_v) and weights has shape (..., seq_len, seq_len).
    """
    scores = Q @ K.transpose(-2, -1) / math.sqrt(Q.shape[-1])
    if causal:
        L = Q.shape[-2]
        mask = torch.triu(torch.ones(L, L, dtype=torch.bool), diagonal=1)     # True where a token would see its future
        ### HINT Use masked_fill to replace future positions with negative infinity so their softmax weight becomes 0.
        ### HINT scores = scores.masked_fill(mask, float("-inf"))
        ### BEGIN SOLUTION
        scores = scores.masked_fill(mask, float("-inf"))
        ### END SOLUTION
    ### HINT w = scores.softmax(-1) turns each row of scores into weights that add up to 1.
    ### HINT w = scores.softmax(-1), then return w @ V, w
    ### BEGIN SOLUTION
    w = scores.softmax(-1)
    return w @ V, w
    ### END SOLUTION

Q, K, V = torch.randn(3, 5, 8, dtype=torch.float64).unbind(0)
Q, K, V = Q[None], K[None], V[None]                    # batch of 1, 5 positions, d = 8

# %%
check(lambda: torch.allclose(attention(Q, K, V)[0], F.scaled_dot_product_attention(Q, K, V)), 
      "Non-causal attention must match PyTorch's F.scaled_dot_product_attention.")
check(lambda: torch.allclose(attention(Q, K, V, causal=True)[0], F.scaled_dot_product_attention(Q, K, V, is_causal=True)), 
      "Causal attention must match PyTorch's F.scaled_dot_product_attention(..., is_causal=True).")
check(lambda: torch.allclose(attention(Q, K, V, causal=True)[1].triu(1), torch.zeros(1, 5, 5, dtype=torch.float64)), 
      "Causal attention weights above the main diagonal must be strictly zero.")

# %% [markdown]
# ## 2. Why divide by √d?
# With random vectors, a dot product's spread grows like √d. Compute the standard deviation of the scores for
# d = 4, 64 and 1024 **without** the scaling (`q @ k` for 10,000 random pairs), and the largest softmax weight that
# typical row gets. Set `spread` (a list). Without scaling, big d makes softmax nearly one-hot and gradients vanish.

# %%
spread = None
### HINT 10,000 dot products of random d-long vectors: (torch.randn(10_000, d) * torch.randn(10_000, d)).sum(1)
### HINT spread = [(torch.randn(10_000, d) * torch.randn(10_000, d)).sum(1).std().item() for d in (4, 64, 1024)]
### BEGIN SOLUTION
spread = [(torch.randn(10_000, d) * torch.randn(10_000, d)).sum(1).std().item() for d in (4, 64, 1024)]
### END SOLUTION
print(spread)

# %%
check(lambda: abs(spread[0] - 2) < 0.2 and abs(spread[2] - 32) < 2, 
      "Unscaled dot product standard deviation grows as sqrt(d): ~2 for d=4, ~8 for d=64, ~32 for d=1024.")

# %% [markdown]
# ## 3. Multi-head attention
# Several smaller attentions run side by side, each free to look for something different. PyTorch's
# `nn.MultiheadAttention(embed_dim=32, num_heads=4, batch_first=True)` does the projections and the split. Run it as
# self-attention on `x` (query = key = value = x) and set `out` and `w` (it averages the heads' weights by default).

# %%
mha = nn.MultiheadAttention(embed_dim=32, num_heads=4, batch_first=True)
x = torch.randn(2, 7, 32)                               # 2 sentences, 7 tokens, 32 numbers each
out = w = None
### HINT In self-attention, query, key, and value are all the same input tensor x passed to mha.
### HINT Forward pass self-attention: out, w = mha(x, x, x).
### BEGIN SOLUTION
out, w = mha(x, x, x)
### END SOLUTION
print(out.shape if out is not None else None, w.shape if w is not None else None)

# %%
check(lambda: out.shape == (2, 7, 32) and w.shape == (2, 7, 7), 
      "MultiheadAttention output shape should match input (2, 7, 32), and attention weights shape should be (2, 7, 7).")
check(lambda: torch.allclose(w.sum(-1), torch.ones(2, 7)), 
      "Attention weights across the key dimension must sum to 1.0 for each query token.")

# %% [markdown]
# ## 4. Where am I? Sinusoidal positions
# Attention itself ignores order. The original transformer adds a position signal:
# $PE[p, 2i] = \sin(p / 10000^{2i/d})$, $PE[p, 2i+1] = \cos(p / 10000^{2i/d})$. Write `positions(L, d)` returning an
# (L, d) array, and look at it: slow waves on the right, fast on the left, a unique pattern per row.

# %%
def positions(L, d):
    """Compute sinusoidal positional encodings for sequence length L and dimension d.
    
    Formula:
        PE[pos, 2*i] = sin(pos / 10000^(2*i / d))
        PE[pos, 2*i+1] = cos(pos / 10000^(2*i / d))
        
    Args:
        L: Integer sequence length (number of positions).
        d: Integer embedding dimension (must be even).
    Returns:
        NumPy array of shape (L, d) containing positional encodings.
    """
    ### HINT Form position indices p = np.arange(L)[:, None] and dimension pairs i = np.arange(d // 2)[None, :].
    ### HINT Compute even indices with sin: PE[:, 0::2] = np.sin(p / 10000 ** (2 * i / d)).
    ### HINT Compute odd indices with cos: PE[:, 1::2] = np.cos(p / 10000 ** (2 * i / d)).
    ### BEGIN SOLUTION
    p = np.arange(L)[:, None]; i = np.arange(d // 2)[None, :]
    PE = np.zeros((L, d)); PE[:, 0::2] = np.sin(p / 10000 ** (2 * i / d)); PE[:, 1::2] = np.cos(p / 10000 ** (2 * i / d))
    return PE
    ### END SOLUTION

PE = positions(50, 64)
if PE is not None:
    plt.figure(figsize=(8, 3)); plt.imshow(PE, aspect="auto", cmap="RdBu"); plt.xlabel("dimension"); plt.ylabel("position"); plt.show()

# %%
check(lambda: PE.shape == (50, 64) and np.allclose(PE[0, 0::2], 0) and np.allclose(PE[0, 1::2], 1), 
      "PE at position 0 must have sin(0)=0 on even indices and cos(0)=1 on odd indices.")
check(lambda: len({tuple(np.round(r, 6)) for r in PE}) == 50, 
      "Each position must receive a unique encoding vector across all 50 positions.")

# %% [markdown]
# ## 5. A real transformer layer
# `nn.TransformerEncoderLayer(d_model=32, nhead=4, dim_feedforward=128, batch_first=True, norm_first=True)` is the
# block from the lesson: attention + residual, MLP + residual, layer norms. `nn.TransformerEncoder` stacks 3 of them,
# and `mask` is PyTorch's causal mask for 7 positions (−∞ above the diagonal, as in part 1). Run `x` through the stack
# with `enc(x, mask=mask, is_causal=True)` into `y`, and count its parameters into `n_params` (the lesson's
# `sum(p.numel() for p in ...parameters())`).

# %%
enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(32, 4, 128, batch_first=True, norm_first=True), num_layers=3).eval()
mask = nn.Transformer.generate_square_subsequent_mask(7)
print(mask)
y = n_params = None
### HINT y = enc(x, mask=mask, is_causal=True)
### HINT n_params = sum(p.numel() for p in enc.parameters())
### BEGIN SOLUTION
y = enc(x, mask=mask, is_causal=True)
n_params = sum(p.numel() for p in enc.parameters())
### END SOLUTION
print(y.shape if y is not None else None, n_params)

# %%
check(lambda: y.shape == x.shape, "the output has the input's shape, (2, 7, 32): one vector per token")
check(lambda: n_params == 3 * 12_704, "3 layers × 12,704 parameters (attention 4,224, MLP 8,352, two layer norms 128)")

# %% [markdown]
# Now verify the mask works: `x2` is `x` with only the **last** token changed. Run it through `enc` the same way and set
# `unchanged`: whether the first six outputs match `y`'s first six (`torch.allclose(a, b, atol=1e-5)`; `[:, :6]` takes
# the first six positions).

# %%
x2 = x.clone(); x2[:, -1] += 1.0
unchanged = None
### HINT y2 = enc(x2, mask=mask, is_causal=True), then compare y2[:, :6] with y[:, :6].
### HINT unchanged = torch.allclose(enc(x2, mask=mask, is_causal=True)[:, :6], y[:, :6], atol=1e-5)
### BEGIN SOLUTION
unchanged = torch.allclose(enc(x2, mask=mask, is_causal=True)[:, :6], y[:, :6], atol=1e-5)
### END SOLUTION
print(unchanged)

# %%
check(lambda: unchanged is True or unchanged == True, "a causal model can't let token 7 change what tokens 1 to 6 see: unchanged should be True")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 10, where you train a tiny GPT.
