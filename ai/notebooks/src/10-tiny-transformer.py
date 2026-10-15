# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: build a GPT in PyTorch
# *AI from scratch, chapter 10* · lesson: https://ihor.sh/ai/10-tiny-transformer.html
#
# The same kind of model as chapter 10's in-page transformer, written the way it's done at work: a character-level
# GPT trained on NYC subway station names, that then invents new ones. You write the pieces: the tokenizer, a causal
# self-attention head, the model, the training step and the sampler. (Andrej Karpathy's "Let's build GPT" video and
# nanoGPT repository go much further along the same road.)
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import math, urllib.request
import torch
from torch import nn
import torch.nn.functional as F

device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(0)
names = urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/stations.txt").read().decode().split("\n")
names = [n for n in names if n]
print(len(names), "station names, e.g.", names[:5])

# %% [markdown]
# ## 1. A tokenizer
# Characters are the tokens. `chars` is the vocabulary: "." (the end-of-name token) at index 0, then every other
# character in the names, sorted. Build `stoi` ("string to integer"), the dictionary from each character to its index
# (`enumerate(chars)` gives the pairs (0, "."), (1, " "), ...). Then write `encode(s)` → list of ids and
# `decode(ids)` → string.

# %%
chars = ["."] + sorted(set("".join(names)) - {"."})
print(len(chars), "tokens:", "".join(chars))
stoi = None
### HINT A dictionary comprehension: {key: value for ... in ...}, here with i, c from enumerate(chars).
### HINT stoi = {c: i for i, c in enumerate(chars)}
### BEGIN SOLUTION
stoi = {c: i for i, c in enumerate(chars)}
### END SOLUTION
def encode(s):
    """Convert input string s into a list of integer token IDs.
    
    Args:
        s: Input string.
    Returns:
        list of int: Sequence of character token IDs.
    """
    ### HINT Look up each character c in stoi dictionary.
    ### BEGIN SOLUTION
    return [stoi[c] for c in s]
    ### END SOLUTION

def decode(ids):
    """Convert a sequence of token IDs back into a string.
    
    Args:
        ids: Iterable of integer token IDs.
    Returns:
        str: Reconstructed text string.
    """
    ### HINT Join corresponding characters from chars list for each token id.
    ### BEGIN SOLUTION
    return "".join(chars[i] for i in ids)
    ### END SOLUTION

# %%
check(lambda: chars[0] == "." and decode(encode("Times Sq-42 St")) == "Times Sq-42 St", 
      "Special token '.' must be index 0, and decode(encode(name)) must perfectly reconstruct the string.")

# %% [markdown]
# ## 2. Training examples
# Each name becomes "." + name + "." and every position predicts the next character. With a context of `block` = 16,
# make `X` (inputs) and `Y` (targets, shifted by one) by sliding a window over each padded name. Given below.

# %%
block = 16
def windows():
    X, Y = [], []
    for n in names:
        ids = [0] * block + encode(n) + [0]            # pad on the left with "." so the start of a name has context
        for i in range(block, len(ids)):
            X.append(ids[i - block:i]); Y.append(ids[i - block + 1:i + 1])
    return torch.tensor(X), torch.tensor(Y)
X, Y = windows() if stoi and encode(names[0]) is not None else (None, None)   # (after exercises 1–3)
print(None if X is None else X.shape)

# %% [markdown]
# ## 3. A causal self-attention head, and the model
# Write `Head.forward`: keys, queries, values from the input (shape (B, T, C)), scores $QK^\top/\sqrt{d}$ masked so a
# position sees only itself and earlier ones, softmax, then weights @ values. The model around it (given) is
# embeddings + positions → 3 blocks of [multi-head attention, MLP] with residuals and layer norms → next-char scores.

# %%
class Head(nn.Module):
    def __init__(self, n_embd, d):
        super().__init__()
        self.q, self.k, self.v = (nn.Linear(n_embd, d, bias=False) for _ in range(3))
        self.register_buffer("mask", torch.tril(torch.ones(block, block, dtype=torch.bool)))
    def forward(self, x):
        """Compute single-head causal self-attention over sequence x.
        
        Args:
            x: Input tensor of shape (batch_size, seq_len, n_embd).
        Returns:
            torch.Tensor: Output activations of shape (batch_size, seq_len, d).
        """
        T = x.shape[1]
        ### HINT Project inputs x to queries q, keys k, and values v.
        ### HINT Compute scaled attention scores: (q @ k.transpose(-2, -1)) / sqrt(d).
        ### HINT Apply causal triangular mask: masked_fill(~self.mask[:T, :T], -inf).
        ### HINT Softmax across the key dimension and multiply by values v.
        ### BEGIN SOLUTION
        q, k, v = self.q(x), self.k(x), self.v(x)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(k.shape[-1])
        att = att.masked_fill(~self.mask[:T, :T], float("-inf")).softmax(-1)
        return att @ v
        ### END SOLUTION

class Block(nn.Module):
    def __init__(self, n_embd, n_head):
        super().__init__()
        self.heads = nn.ModuleList(Head(n_embd, n_embd // n_head) for _ in range(n_head))
        self.proj, self.ln1, self.ln2 = nn.Linear(n_embd, n_embd), nn.LayerNorm(n_embd), nn.LayerNorm(n_embd)
        self.mlp = nn.Sequential(nn.Linear(n_embd, 4 * n_embd), nn.GELU(), nn.Linear(4 * n_embd, n_embd))
    def forward(self, x):
        x = x + self.proj(torch.cat([h(self.ln1(x)) for h in self.heads], -1))
        return x + self.mlp(self.ln2(x))

class GPT(nn.Module):
    def __init__(self, vocab, n_embd=64, n_head=4, n_layer=3):
        super().__init__()
        self.tok, self.pos = nn.Embedding(vocab, n_embd), nn.Embedding(block, n_embd)
        self.blocks = nn.Sequential(*[Block(n_embd, n_head) for _ in range(n_layer)])
        self.ln, self.out = nn.LayerNorm(n_embd), nn.Linear(n_embd, vocab)
    def forward(self, idx):
        x = self.tok(idx) + self.pos(torch.arange(idx.shape[1], device=idx.device))
        return self.out(self.ln(self.blocks(x)))

head = Head(8, 4)
xh = torch.randn(1, 5, 8)
yh = head(xh)
xh2 = xh.clone(); xh2[0, -1] += 1

# %%
check(lambda: yh.shape == (1, 5, 4), 
      "Head forward pass should output shape (1, 5, 4) for input with batch=1, T=5, d=4.")
check(lambda: torch.allclose(head(xh2)[0, :4], yh[0, :4]), 
      "Causal mask must prevent modifications at token 5 from influencing tokens 1 through 4.")

# %% [markdown]
# ## 4. Train it
# Write the training step, the loop from Training in PyTorch: a random batch of 64 windows is drawn for you; compute
# the loss, cross-entropy of `model(xb)` (shape (B, T, vocab)) against `yb`, flattening both (`.view(-1, vocab)` and
# `.view(-1)`: one row per position), then zero grads, backward, step, and append `loss.item()` to `losses`.
# 800 steps with AdamW (lr 3e-3) take about a minute on a CPU. A model that knew nothing would score ln(vocab) ≈ 4.

# %%
model = GPT(len(chars) if chars else 2).to(device)
opt = torch.optim.AdamW(model.parameters(), lr=3e-3)
losses = []
if X is not None:
    for step in range(800):
        i = torch.randint(0, len(X), (64,))                  # 64 random window numbers
        xb, yb = X[i].to(device), Y[i].to(device)
        ### HINT loss = F.cross_entropy(model(xb).view(-1, len(chars)), yb.view(-1))
        ### HINT Then the three lines from Training in PyTorch: opt.zero_grad(), loss.backward(), opt.step().
        ### HINT And losses.append(loss.item()) so the check can see the curve.
        ### BEGIN SOLUTION
        loss = F.cross_entropy(model(xb).view(-1, len(chars)), yb.view(-1))
        opt.zero_grad(); loss.backward(); opt.step()
        losses.append(loss.item())
        ### END SOLUTION
print("final loss:", sum(losses[-100:]) / 100 if losses else None, " (knowing nothing:", math.log(len(chars)) if chars else None, ")")

# %%
check(lambda: len(losses) == 800 and sum(losses[-100:]) / 100 < 1.2, 
      "800 steps of AdamW should drop average training loss below 1.2 (baseline ~4.2).")

# %% [markdown]
# ## 5. Invent new stations
# Write `sample(temperature)`: start from 16 "." tokens, repeatedly take the model's scores for the last position,
# divide by the temperature, softmax, draw a character with `torch.multinomial`, append it, and stop at "." (or 30
# characters). Return the name. How do low and high temperatures change the names?

# %%
@torch.no_grad()
def sample(temperature=1.0):
    """Autoregressively sample a new station name from the character GPT model.
    
    Args:
        temperature: Sampling temperature (higher = more creative/random, lower = more conservative).
    Returns:
        str: Generated station name.
    """
    ### HINT Keep two lists: ctx = [0] * block (what the model sees) and out = [] (the name so far); loop at most 30 times.
    ### HINT The scores for the next character: model(torch.tensor([ctx[-block:]], device=device))[0, -1] / temperature
    ### HINT nxt = torch.multinomial(logits.softmax(-1), 1).item() draws one id; stop when it's 0, else append it to both lists.
    ### HINT After the loop: return decode(out)
    ### BEGIN SOLUTION
    ctx, out = [0] * block, []
    for _ in range(30):
        logits = model(torch.tensor([ctx[-block:]], device=device))[0, -1] / temperature
        nxt = torch.multinomial(logits.softmax(-1), 1).item()
        if nxt == 0: break
        out.append(nxt); ctx.append(nxt)
    return decode(out)
    ### END SOLUTION

for t in (0.5, 1.0, 1.5):
    print(t, [sample(t) for _ in range(6)])

# %%
fresh = [sample(0.8) for _ in range(30)]
check(lambda: all(isinstance(s, str) for s in fresh) and sum(s not in names for s in fresh) >= 10, 
      "The generator should invent plausible novel names not already in the dataset.")

# %% [markdown]
# **Memorizing vs inventing.** There are only 379 names. Train for 3,000 steps instead of 800 and the loss keeps
# falling, but the samples turn into real station names: the model has memorized its training set (chapter 11's
# overfitting). The fix at work: hold out some names as a validation set, watch the validation loss, and stop when
# it stops improving. Try it: split `names` 90/10, build windows for each, and print both losses every 100 steps.
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 8, agents.
