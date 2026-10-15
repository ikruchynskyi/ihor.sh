# %% [markdown]
# # Practice: making deep nets train
# *AI from scratch, toolkit 4* · lesson: https://ihor.sh/ai/making-nets-train.html
#
# Measure a signal dying through 20 layers and save it with He initialization, write dropout yourself, catch the
# missing `model.eval()`, then build a residual block and watch it rescue a 30-layer network that can't learn at all.
# Runs on a CPU in about a minute. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from sklearn.datasets import load_digits
torch.manual_seed(0)

# %% [markdown]
# ## 1. Estimate first
# If every layer multiplies the signal's spread by 0.8, what's left after 30 layers? Set `left`.

# %%
left = None
### HINT Multiplying by 0.8 thirty times is a power.
### HINT left = 0.8 ** 30
### BEGIN SOLUTION
left = 0.8 ** 30
### END SOLUTION
print(left)

# %%
check(lambda: abs(left - 0.8 ** 30) < 1e-12, "0.8³⁰ ≈ 0.0012: about a thousandth of the signal survives")

# %% [markdown]
# ## 2. Measure it, then fix it with He initialization
# `spreads(std)` pushes a batch through 20 layers of 256 neurons with ReLU, every weight drawn with spread `std`,
# and returns the spread after each layer. Set `he` to He's spread for `n_in = 256` inputs: the square root of
# `2 / n_in` (`math.sqrt`).

# %%
def spreads(std, n=256, depth=20):
    x = torch.randn(512, n)
    out = []
    for _ in range(depth):
        layer = nn.Linear(n, n, bias=False)
        nn.init.normal_(layer.weight, mean=0.0, std=std)     # set every weight by hand
        x = F.relu(layer(x))
        out.append(x.std().item())
    return out

n_in = 256
he = None
### HINT He: variance 2 / n_in, so the spread (standard deviation) is its square root.
### HINT he = math.sqrt(2 / n_in)
### BEGIN SOLUTION
he = math.sqrt(2 / n_in)
### END SOLUTION

# %%
with torch.no_grad():
    for label, std in [("1/sqrt(n)", 1 / math.sqrt(n_in)), ("He", he)]:
        if std is not None:
            s = spreads(std)
            plt.semilogy(range(1, 21), s, "o-", label=f"{label}: layer 20 spread {s[-1]:.2g}")
plt.xlabel("layer"); plt.ylabel("spread (log scale)"); plt.legend(); plt.show()
check(lambda: abs(he - 0.0884) < 1e-3 and 0.3 < spreads(he)[-1] < 2, "√(2/256) ≈ 0.088 keeps the spread steady through all 20 layers")

# %% [markdown]
# ## 3. Write dropout
# Write `dropout(h, p)`: keep each entry with probability `1 - p` and scale the kept ones by `1 / (1 - p)`.
# `torch.rand_like(h)` gives random numbers between 0 and 1 in `h`'s shape; `(... > p).float()` turns a comparison
# into 0s and 1s.

# %%
def dropout(h, p):
    ### HINT mask = (torch.rand_like(h) > p).float() is 1 where an entry survives.
    ### HINT return h * mask / (1 - p)
    ### BEGIN SOLUTION
    mask = (torch.rand_like(h) > p).float()
    return h * mask / (1 - p)
    ### END SOLUTION

# %%
h = torch.full((100_000,), 2.0)
check(lambda: abs(dropout(h, 0.3).mean().item() - 2.0) < 0.03 and abs((dropout(h, 0.3) == 0).float().mean().item() - 0.3) < 0.01,
      "about 30% zeros, and the mean stays 2.0 because survivors become 2 / 0.7")

# %% [markdown]
# ## 4. Find the bug: the same input, different answers
# This model has dropout and batch norm. The "app" below asks it about the same digit three times and gets three
# different answers. Fix it with one call before predicting, then set `preds` to the model's three predicted classes
# (`.argmax(1)` of the output) for `x3`.

# %%
X, y = load_digits(return_X_y=True)
X = torch.tensor(X / 16, dtype=torch.float32); y = torch.tensor(y)
perm = torch.randperm(len(X), generator=torch.Generator().manual_seed(0))
tr, va = perm[:1400], perm[1400:]
model = nn.Sequential(nn.Linear(64, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.5), nn.Linear(128, 10))
opt = torch.optim.Adam(model.parameters(), lr=1e-2)
for _ in range(150):
    model.train(); opt.zero_grad(); F.cross_entropy(model(X[tr]), y[tr]).backward(); opt.step()
x3 = X[va[:1]].repeat(3, 1)                     # one digit, asked three times
with torch.no_grad():
    print("buggy app:", model(x3).softmax(1).max(1).values)   # different confidences each time: dropout is still on
preds = None
### HINT What switches dropout off and makes batch norm use its saved averages? (The lesson's section 2 question.)
### HINT model.eval() first, then inside torch.no_grad(): preds = model(x3).argmax(1)
### BEGIN SOLUTION
model.eval()
with torch.no_grad():
    preds = model(x3).argmax(1)
### END SOLUTION
print(preds)

# %%
check(lambda: not model.training and len(set(preds.tolist())) == 1 and preds[0].item() == y[va[0]].item(),
      "model.eval(): the same answer three times, and it's the right digit")

# %% [markdown]
# ## 5. A residual block
# Write the class `Residual`: in `__init__`, keep `self.f = nn.Sequential(nn.Linear(n, n), nn.ReLU(), nn.Linear(n, n))`;
# in `forward`, return the input plus `self.f` of it. (Classes and `__init__`/`forward`: the training-in-PyTorch lesson.)

# %%
class Residual(nn.Module):
    def __init__(self, n):
        super().__init__()
        ### HINT Build a 2-layer MLP sub-network with nn.Sequential: Linear(n, n) -> ReLU() -> Linear(n, n).
        ### HINT self.f = nn.Sequential(nn.Linear(n, n), nn.ReLU(), nn.Linear(n, n))
        ### BEGIN SOLUTION
        self.f = nn.Sequential(nn.Linear(n, n), nn.ReLU(), nn.Linear(n, n))
        ### END SOLUTION

    def forward(self, x):
        ### HINT y = x + f(x)
        ### HINT return x + self.f(x)
        ### BEGIN SOLUTION
        return x + self.f(x)
        ### END SOLUTION

# %%
check(lambda: Residual(8)(torch.zeros(2, 8)).shape == (2, 8) and sum(p.numel() for p in Residual(8).parameters()) == 2 * (8 * 8 + 8),
      "output shape = input shape; two 8 × 8 layers with biases inside")

# %% [markdown]
# ## 6. Thirty layers, plain and residual
# The same depth, the same optimizer, 100 full-batch steps. **Predict** before running: will the plain stack learn
# anything? Set `guess_plain_loss` to the training loss you expect it to end at (hint: the lesson's loss-curve doctor).

# %%
guess_plain_loss = None
### HINT When gradients vanish across 30 plain layers, the network fails to learn and predicts equal probabilities (1/10).
### HINT A net that learns nothing guesses uniformly over 10 digits: loss is math.log(10).
### BEGIN SOLUTION
guess_plain_loss = math.log(10)
### END SOLUTION

# %%
def deep(kind, depth=30, n=64):
    layers = [nn.Linear(64, n), nn.ReLU()]
    for _ in range(depth):
        layers += [Residual(n)] if kind == "residual" else [nn.Linear(n, n), nn.ReLU()]
    return nn.Sequential(*layers, nn.Linear(n, 10))

def run(kind):
    torch.manual_seed(0)
    m = deep(kind)
    opt = torch.optim.Adam(m.parameters(), lr=1e-3)
    losses = []
    for step in range(100):
        opt.zero_grad(); loss = F.cross_entropy(m(X[tr]), y[tr]); loss.backward(); opt.step(); losses.append(loss.item())
    with torch.no_grad():
        return losses, (m(X[va]).argmax(1) == y[va]).float().mean().item()

results = {}
for kind in ["plain", "residual"]:
    try:
        losses, acc = run(kind)
    except Exception as e:                      # a Residual that isn't written yet
        print(kind, "can't train yet:", type(e).__name__); continue
    results[kind] = (losses[-1], acc)
    plt.plot(losses, label=f"{kind}: final loss {losses[-1]:.3f}, val acc {acc:.3f}")
plt.axhline(math.log(10), ls="--", c="g", label="ln 10"); plt.xlabel("step"); plt.ylabel("training loss"); plt.legend(); plt.show()
check(lambda: abs(guess_plain_loss - results["plain"][0]) < 0.05 and results["residual"][1] > 0.9,
      "the plain stack sits at ln 10 ≈ 2.30 (nothing reaches the early layers); the residual one passes 90%")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Karpathy, "A Recipe for Training Neural Networks":
# https://karpathy.github.io/2019/04/25/recipe/
