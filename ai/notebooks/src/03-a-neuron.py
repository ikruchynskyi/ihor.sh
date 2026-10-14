# %% [markdown]
# # Practice: one neuron, on real data
# *AI from scratch, chapter 3* · lesson: https://ihor.sh/ai/03-a-neuron.html
#
# A single neuron with a sigmoid is **logistic regression**, still one of the most used models at work. Train one
# from scratch on 569 real tumor measurements, compare it with scikit-learn's, see it fail on XOR, then write it
# in PyTorch. Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

# %% [markdown]
# ## 1. The data
# The Wisconsin breast-cancer dataset (bundled with scikit-learn): 30 measurements of cell nuclei per tumor, label
# 1 = benign, 0 = malignant. Standardize the features (z-scores, probability 2) and hold out 25% for testing.

# %%
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
d = load_breast_cancer()
Xtr, Xte, ytr, yte = train_test_split(d.data, d.target, test_size=0.25, random_state=0)
mu, sd = Xtr.mean(0), Xtr.std(0)
Xtr, Xte = (Xtr - mu) / sd, (Xte - mu) / sd            # scale with the training set's numbers only
print(Xtr.shape, "benign share:", ytr.mean().round(3))

# %% [markdown]
# ## 2. The loss and its gradient
# Write `log_loss(p, y)`: the mean of $-[y \ln p + (1-y)\ln(1-p)]$, and `gradients(w, b, X, y)` returning
# $\partial L/\partial w = \frac1n X^\top(p - y)$ and $\partial L/\partial b = \text{mean}(p - y)$ with $p = \sigma(Xw + b)$.

# %%
def log_loss(p, y):
    ### BEGIN SOLUTION
    return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
    ### END SOLUTION

def gradients(w, b, X, y):
    ### BEGIN SOLUTION
    err = sigmoid(X @ w + b) - y
    return X.T @ err / len(y), err.mean()
    ### END SOLUTION

# %%
check(lambda: np.isclose(log_loss(np.array([0.9, 0.2]), np.array([1, 0])), -(np.log(0.9) + np.log(0.8)) / 2), "the average surprise at the truth")
def _num(w, b, X, y, j, h=1e-6):
    e = np.zeros_like(w); e[j] = h
    return (log_loss(sigmoid(X @ (w + e) + b), y) - log_loss(sigmoid(X @ (w - e) + b), y)) / (2 * h)
w0 = np.random.default_rng(1).normal(0, 0.1, 30)
check(lambda: np.isclose(gradients(w0, 0.0, Xtr, ytr)[0][3], _num(w0, 0.0, Xtr, ytr, 3), rtol=1e-4), "your ∂L/∂w matches a numerical check")

# %% [markdown]
# ## 3. Train it
# 500 steps of gradient descent with learning rate 0.5 from all-zero weights. Record the loss each step. Then set
# `test_acc`: the share of test tumors classified right (predict 1 when $p > 0.5$).

# %%
w, b, losses = np.zeros(30), 0.0, []
test_acc = None
### BEGIN SOLUTION
for step in range(500):
    gw, gb = gradients(w, b, Xtr, ytr)
    w, b = w - 0.5 * gw, b - 0.5 * gb
    losses.append(log_loss(sigmoid(Xtr @ w + b), ytr))
test_acc = ((sigmoid(Xte @ w + b) > 0.5) == yte).mean()
### END SOLUTION
plt.plot(losses); plt.xlabel("step"); plt.ylabel("log loss"); plt.show()
print("test accuracy:", test_acc)

# %%
check(lambda: test_acc > 0.95, "a single neuron gets over 95% of unseen tumors right")

# %% [markdown]
# ## 4. Compare with scikit-learn
# `LogisticRegression` is the same model, trained with a smarter optimizer and a little L2 regularization.
# Fit it and set `sk_acc` (its test accuracy). Which features got the biggest weights (in absolute value)?

# %%
from sklearn.linear_model import LogisticRegression
sk_acc = None
### BEGIN SOLUTION
sk = LogisticRegression(max_iter=1000).fit(Xtr, ytr)
sk_acc = sk.score(Xte, yte)
### END SOLUTION
print("scikit-learn:", sk_acc)
print("biggest weights:", list(np.array(d.feature_names)[np.argsort(-abs(w))[:5]]))

# %%
check(lambda: abs(sk_acc - test_acc) < 0.03, "within a couple of points of yours")

# %% [markdown]
# ## 5. Where one neuron fails: XOR
# Train the same neuron on the four XOR points for 2000 steps. Set `xor_acc`. One straight cut can't put opposite
# corners together (the lesson proves it), so it stays stuck around half right.

# %%
Xx = np.array([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=float); yx = np.array([0, 1, 1, 0])
xor_acc = None
### BEGIN SOLUTION
wx, bx = np.random.default_rng(0).normal(0, 0.1, 2), 0.0
for _ in range(2000):
    gw, gb = gradients(wx, bx, Xx, yx)
    wx, bx = wx - 0.5 * gw, bx - 0.5 * gb
xor_acc = ((sigmoid(Xx @ wx + bx) > 0.5) == yx).mean()
### END SOLUTION
print("XOR accuracy:", xor_acc)

# %%
check(lambda: xor_acc is not None and xor_acc <= 0.75, "at most 3 of 4: no line separates XOR")

# %% [markdown]
# ## 6. The neuron in PyTorch
# `nn.Linear(30, 1)` holds w and b; `BCEWithLogitsLoss` is the log loss with the sigmoid built in (more stable).
# Train it with `torch.optim.SGD(model.parameters(), lr=0.5)` for 500 steps: zero the gradients, compute the loss,
# `.backward()`, `.step()`. Set `torch_acc`.

# %%
import torch
from torch import nn
torch.manual_seed(0)
Xt, yt = torch.tensor(Xtr, dtype=torch.float32), torch.tensor(ytr, dtype=torch.float32)
model = nn.Linear(30, 1)
opt = torch.optim.SGD(model.parameters(), lr=0.5)
loss_fn = nn.BCEWithLogitsLoss()
### BEGIN SOLUTION
for step in range(500):
    opt.zero_grad()
    loss = loss_fn(model(Xt).squeeze(1), yt)
    loss.backward()
    opt.step()
### END SOLUTION
with torch.no_grad():
    torch_acc = ((model(torch.tensor(Xte, dtype=torch.float32)).squeeze(1) > 0).numpy() == yte).mean()
print("PyTorch:", torch_acc)

# %%
check(lambda: torch_acc > 0.95, "the same model, the same result")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 4, backprop.
