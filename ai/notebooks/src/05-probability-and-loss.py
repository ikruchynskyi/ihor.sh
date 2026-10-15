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

# %% [markdown]
# ## 1. A softmax that never overflows
# `softmax(S, T=1)` takes a 2D array of scores (one row per example). Its first two lines are written: divide by the
# temperature T, then exponentiate after subtracting each row's max (the lesson's trick: the biggest becomes e⁰ = 1,
# so nothing overflows). Finish it: divide `E` by each row's sum, with `axis=1, keepdims=True` as in the line above.

# %%
def softmax(S, T=1.0):
    """Numerically stable softmax activation with temperature scaling.
    
    Formula: exp((S - max(S)) / T) / sum(exp((S - max(S)) / T))
    
    Args:
        S: 2D array-like of logits/scores with shape (n_samples, n_classes).
        T: Float temperature parameter (default 1.0).
    Returns:
        NumPy array of probabilities of shape (n_samples, n_classes), summing to 1 along axis 1.
    """
    S = np.asarray(S, dtype=float) / T
    E = np.exp(S - S.max(axis=1, keepdims=True))
    ### HINT E.sum(axis=1, keepdims=True) is each row's total, kept as a column so the division lines up row by row.
    ### HINT return E / E.sum(axis=1, keepdims=True)
    ### BEGIN SOLUTION
    return E / E.sum(axis=1, keepdims=True)
    ### END SOLUTION

# %%
check(lambda: np.allclose(softmax([[2, 1, -0.5]]), [[0.690, 0.254, 0.057]], atol=1e-3), 
      "softmax([[2, 1, -0.5]]) should produce probabilities ~[0.690, 0.254, 0.057].")
check(lambda: np.allclose(softmax([[1000, 999]]), [[0.731, 0.269]], atol=1e-3), 
      "Softmax must be numerically stable and avoid overflow even with large logits like 1000.")
check(lambda: softmax([[2, 1, -0.5]], T=0.1)[0, 0] > 0.99 and softmax([[2, 1, -0.5]], T=10)[0, 0] < 0.4, 
      "Low temperature (T=0.1) should concentrate probability on the top class, high T (T=10) should flatten it.")

# %% [markdown]
# ## 2. Cross-entropy and its gradient
# Write `cross_entropy(S, y)`: the mean of $-\ln p_{i, y_i}$ over the rows, and `ce_grad(S, y)`: the gradient with
# respect to the scores, $(P - Y)/n$ with Y the one-hot labels. PyTorch's `F.cross_entropy` and autograd check you.

# %%
def cross_entropy(S, y):
    """Compute multiclass cross-entropy loss from raw logits S and integer labels y.
    
    Formula: -mean(ln(P[i, y_i]))
    
    Args:
        S: 2D array of logits with shape (n_samples, n_classes).
        y: 1D array of integer class labels (0 <= y_i < n_classes).
    Returns:
        float: Mean cross-entropy loss.
    """
    ### HINT Compute predicted probabilities P = softmax(S).
    ### HINT Index true class probabilities: P[np.arange(len(y)), y].
    ### HINT Return negative mean of log probabilities: -np.mean(np.log(...)).
    ### BEGIN SOLUTION
    P = softmax(S)
    return -np.mean(np.log(P[np.arange(len(y)), y]))
    ### END SOLUTION

def ce_grad(S, y):
    """Compute gradient of cross-entropy loss with respect to input logits S.
    
    Formula: (P - Y) / n, where P = softmax(S) and Y is one-hot encoded targets.
    
    Args:
        S: 2D array of logits with shape (n_samples, n_classes).
        y: 1D array of integer class labels (shape n_samples,).
    Returns:
        NumPy array of shape (n_samples, n_classes) representing dL/dS.
    """
    ### HINT Compute predicted probabilities P = softmax(S).
    ### HINT Form one-hot matrix Y using np.eye(S.shape[1])[y].
    ### HINT Return (P - Y) / len(y).
    ### BEGIN SOLUTION
    return (softmax(S) - np.eye(S.shape[1])[y]) / len(y)
    ### END SOLUTION

S = np.random.default_rng(0).normal(size=(5, 4)); y = np.array([0, 3, 1, 1, 2])
St = torch.tensor(S, requires_grad=True)
loss_t = F.cross_entropy(St, torch.tensor(y)); loss_t.backward()

# %%
check(lambda: np.isclose(cross_entropy(S, y), loss_t.item()), 
      "Your cross_entropy(S, y) must match PyTorch's F.cross_entropy.")
check(lambda: np.allclose(ce_grad(S, y), St.grad.numpy()), 
      "ce_grad(S, y) must match PyTorch autograd St.grad ((P - Y)/n).")

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
### HINT Run 300 steps of gradient descent: Compute logits S = Xtr @ W + b. Compute gradient G = ce_grad(S, ytr). Update W -= 0.5 * Xtr.T @ G. Update b -= 0.5 * G.sum(axis=0).
### HINT Compute test accuracy: ((Xte @ W + b).argmax(axis=1) == yte).mean().
### BEGIN SOLUTION
for step in range(300):
    G = ce_grad(Xtr @ W + b, ytr)
    W -= 0.5 * Xtr.T @ G
    b -= 0.5 * G.sum(axis=0)
test_acc = ((Xte @ W + b).argmax(axis=1) == yte).mean()
### END SOLUTION
print("test accuracy:", test_acc)

# %%
check(lambda: test_acc > 0.9, 
      "Softmax regression on 8x8 digits should exceed 90% test accuracy.")

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
### HINT Run 300 training steps: opt.zero_grad(); loss_fn(model(Xt), yt).backward(); opt.step().
### HINT Inside torch.no_grad(), compute test accuracy torch_acc.
### BEGIN SOLUTION
for step in range(300):
    opt.zero_grad(); loss_fn(model(Xt), yt).backward(); opt.step()
### END SOLUTION
with torch.no_grad():
    torch_acc = (model(torch.tensor(Xte, dtype=torch.float32)).argmax(1).numpy() == yte).mean()
print("PyTorch:", torch_acc)

# %%
check(lambda: torch_acc > 0.9, 
      "PyTorch softmax regression should achieve over 90% test accuracy.")

# %% [markdown]
# ## 5. Sampling with temperature
# A language model's next-word scores. Draw 10,000 samples at T = 0.5 and at T = 2 (`rng.choice(len(words), p=...)`)
# and set `share_top_cold` and `share_top_hot`: how often the most likely word ("mat") comes out at each.

# %%
words = ["mat", "floor", "chair", "roof", "keyboard", "moon"]
logits = np.array([[3.1, 2.2, 1.6, 0.9, 1.2, -1.5]])
rng = np.random.default_rng(1)
share_top_cold = share_top_hot = None
### HINT Sample 10,000 times at T=0.5 with rng.choice(6, 10_000, p=softmax(logits, 0.5)[0]).
### HINT Compute share_top_cold as fraction where index 0 ("mat") was sampled.
### HINT Sample 10,000 times at T=2.0 with rng.choice(6, 10_000, p=softmax(logits, 2.0)[0]).
### HINT Compute share_top_hot as fraction where index 0 was sampled.
### BEGIN SOLUTION
share_top_cold = (rng.choice(6, 10_000, p=softmax(logits, 0.5)[0]) == 0).mean()
share_top_hot = (rng.choice(6, 10_000, p=softmax(logits, 2.0)[0]) == 0).mean()
### END SOLUTION
print(share_top_cold, share_top_hot)

# %%
check(lambda: share_top_cold > 0.75 and share_top_hot < 0.4, 
      "Cold temperature (T=0.5) should sample the top token > 75% of the time; hot temperature (T=2.0) drops it below 40%.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: calculus 4, integrals.
