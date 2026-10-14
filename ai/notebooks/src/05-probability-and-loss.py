# %% [markdown]
# # Practice: softmax, cross-entropy and a 10-digit classifier
# *AI from scratch, chapter 5* · lesson: https://ihor.sh/ai/05-probability-and-loss.html
#
# A safe softmax, cross-entropy and its famous gradient (checked against PyTorch), softmax regression that reads
# handwritten digits, the same model in PyTorch, and sampling with temperature.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import torch
import torch.nn.functional as F

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. A softmax that never overflows
# Write `softmax(S, T=1)` for a 2D array of scores (one row per example): divide by the temperature T, subtract each
# row's max, exponentiate, divide by the row sum. Use `axis=1, keepdims=True`.

# %%
def softmax(S, T=1.0):
    ### BEGIN SOLUTION
    S = np.asarray(S, dtype=float) / T
    E = np.exp(S - S.max(axis=1, keepdims=True))
    return E / E.sum(axis=1, keepdims=True)
    ### END SOLUTION

# %%
check(lambda: np.allclose(softmax([[2, 1, -0.5]]), [[0.690, 0.254, 0.057]], atol=1e-3), "the lesson's example")
check(lambda: np.allclose(softmax([[1000, 999]]), [[0.731, 0.269]], atol=1e-3), "big scores don't overflow")
check(lambda: softmax([[2, 1, -0.5]], T=0.1)[0, 0] > 0.99 and softmax([[2, 1, -0.5]], T=10)[0, 0] < 0.4, "low T sharpens, high T flattens")

# %% [markdown]
# ## 2. Cross-entropy and its gradient
# Write `cross_entropy(S, y)`: the mean of $-\ln p_{i, y_i}$ over the rows, and `ce_grad(S, y)`: the gradient with
# respect to the scores, $(P - Y)/n$ with Y the one-hot labels. PyTorch's `F.cross_entropy` and autograd check you.

# %%
def cross_entropy(S, y):
    ### BEGIN SOLUTION
    P = softmax(S)
    return -np.mean(np.log(P[np.arange(len(y)), y]))
    ### END SOLUTION

def ce_grad(S, y):
    ### BEGIN SOLUTION
    return (softmax(S) - np.eye(S.shape[1])[y]) / len(y)
    ### END SOLUTION

S = np.random.default_rng(0).normal(size=(5, 4)); y = np.array([0, 3, 1, 1, 2])
St = torch.tensor(S, requires_grad=True)
loss_t = F.cross_entropy(St, torch.tensor(y)); loss_t.backward()

# %%
check(lambda: np.isclose(cross_entropy(S, y), loss_t.item()), "matches PyTorch's cross_entropy")
check(lambda: np.allclose(ce_grad(S, y), St.grad.numpy()), "the gradient is (P − Y)/n: what it said minus what was true")

# %% [markdown]
# ## 3. Read handwritten digits
# scikit-learn's 1,797 digit images (8×8 = 64 pixels, values 0–16). Train **softmax regression** (one linear layer:
# 10 scores) by gradient descent: `W` is (64, 10), `b` is (10,); 300 steps, learning rate 0.5, using your
# `ce_grad` (the gradient for W is $X^\top G$, for b the column sums of G). Set `test_acc`.

# %%
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
dg = load_digits()
Xtr, Xte, ytr, yte = train_test_split(dg.data / 16, dg.target, test_size=0.25, random_state=0)
W, b = np.zeros((64, 10)), np.zeros(10)
test_acc = None
### BEGIN SOLUTION
for step in range(300):
    G = ce_grad(Xtr @ W + b, ytr)
    W -= 0.5 * Xtr.T @ G
    b -= 0.5 * G.sum(axis=0)
test_acc = ((Xte @ W + b).argmax(axis=1) == yte).mean()
### END SOLUTION
print("test accuracy:", test_acc)

# %%
check(lambda: test_acc > 0.9, "a single linear layer with softmax reads over 90% of unseen digits")

# %% [markdown]
# ## 4. The same model in PyTorch
# `nn.Linear(64, 10)` + `nn.CrossEntropyLoss()` (which applies the softmax for you: pass raw scores, "logits").
# Train with SGD, lr 0.5, 300 full-batch steps. Set `torch_acc`.

# %%
from torch import nn
torch.manual_seed(0)
Xt, yt = torch.tensor(Xtr, dtype=torch.float32), torch.tensor(ytr)
model, loss_fn = nn.Linear(64, 10), nn.CrossEntropyLoss()
opt = torch.optim.SGD(model.parameters(), lr=0.5)
### BEGIN SOLUTION
for step in range(300):
    opt.zero_grad(); loss_fn(model(Xt), yt).backward(); opt.step()
### END SOLUTION
with torch.no_grad():
    torch_acc = (model(torch.tensor(Xte, dtype=torch.float32)).argmax(1).numpy() == yte).mean()
print("PyTorch:", torch_acc)

# %%
check(lambda: torch_acc > 0.9, "same model, same kind of result")

# %% [markdown]
# ## 5. Sampling with temperature
# A language model's next-word scores. Draw 10,000 samples at T = 0.5 and at T = 2 (`rng.choice(len(words), p=...)`)
# and set `share_top_cold` and `share_top_hot`: how often the most likely word ("mat") comes out at each.

# %%
words = ["mat", "floor", "chair", "roof", "keyboard", "moon"]
logits = np.array([[3.1, 2.2, 1.6, 0.9, 1.2, -1.5]])
rng = np.random.default_rng(1)
share_top_cold = share_top_hot = None
### BEGIN SOLUTION
share_top_cold = (rng.choice(6, 10_000, p=softmax(logits, 0.5)[0]) == 0).mean()
share_top_hot = (rng.choice(6, 10_000, p=softmax(logits, 2.0)[0]) == 0).mean()
### END SOLUTION
print(share_top_cold, share_top_hot)

# %%
check(lambda: share_top_cold > 0.75 and share_top_hot < 0.4, "cold sampling sticks to the favorite; hot sampling spreads out")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: calculus 4, integrals.
