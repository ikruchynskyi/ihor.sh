# %% [markdown]
# # Practice: convexity and constraints
# *AI from scratch, calculus 5* · lesson: https://ihor.sh/ai/c5-convexity-and-constraints.html
#
# Test functions and losses for bowls, watch a network's loss fail the test, make a flat bottom unique with an L2
# penalty, find PCA's direction as the best point on a circle, and let lasso pick features. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import numpy as np
import warnings; warnings.filterwarnings("ignore")
from sklearn.datasets import load_diabetes
from sklearn.preprocessing import StandardScaler

d = load_diabetes()
X = StandardScaler().fit_transform(d.data); y = (d.target - d.target.mean()) / d.target.std()
n = len(X)

# %% [markdown]
# ## 1. One chord
# For $f(x) = x^4 - 2x^2$, is the curve at the midpoint 0 on or below the chord from $-1$ to $1$? Set `below_chord` to
# that comparison: $f(0) \le \tfrac12\big(f(-1) + f(1)\big)$.

# %%
f = lambda x: x ** 4 - 2 * x ** 2
below_chord = None
### HINT A comparison with <= gives True or False; the chord at the midpoint is the average of the two ends.
### HINT below_chord = f(0) <= (f(-1) + f(1)) / 2
### BEGIN SOLUTION
below_chord = f(0) <= (f(-1) + f(1)) / 2
### END SOLUTION
print(f(0), (f(-1) + f(1)) / 2, below_chord)

# %%
check(lambda: below_chord == False, "f(0) = 0 sits above the chord's −1: a bump between two valleys, so not convex")

# %% [markdown]
# ## 2. A chord test on a grid
# Write `bends_up(f, xs)`: True if, at every inside point of the evenly spaced grid `xs`, the curve is on or below the
# chord from its left neighbour to its right neighbour. That's `f(xs[1:-1]) <= (f(xs[:-2]) + f(xs[2:])) / 2` for every
# point (allow `1e-12` for rounding); `np.all` says whether all of an array is True.

# %%
def bends_up(f, xs):
    ### HINT xs[:-2] are the left neighbours, xs[1:-1] the middles, xs[2:] the right neighbours.
    ### HINT return np.all(f(xs[1:-1]) <= (f(xs[:-2]) + f(xs[2:])) / 2 + 1e-12)
    ### BEGIN SOLUTION
    return np.all(f(xs[1:-1]) <= (f(xs[:-2]) + f(xs[2:])) / 2 + 1e-12)
    ### END SOLUTION

xs = np.linspace(-3, 3, 601)
for name, g in [("x²", lambda x: x ** 2), ("|x|", np.abs), ("eˣ", np.exp), ("x⁴ − 2x²", f), ("sin x", np.sin)]:
    print(name, bends_up(g, xs))

# %%
check(lambda: bends_up(lambda x: x ** 2, xs) and bends_up(np.abs, xs) and bends_up(np.exp, xs), "x², |x| (corner and all) and eˣ pass")
check(lambda: bends_up(f, xs) == False and bends_up(np.sin, xs) == False, "x⁴ − 2x² and sin x fail somewhere")

# %% [markdown]
# ## 3. Is linear regression a bowl?
# The squared-error loss of linear regression has the same Hessian everywhere, $2X^\top X / n$. Set `H` to it and
# `smallest` to its smallest eigenvalue (`np.linalg.eigvalsh` returns them sorted, smallest first).

# %%
H = smallest = None
### HINT H = 2 * X.T @ X / n
### HINT smallest = np.linalg.eigvalsh(H)[0]
### BEGIN SOLUTION
H = 2 * X.T @ X / n
smallest = np.linalg.eigvalsh(H)[0]
### END SOLUTION
print(smallest)

# %%
check(lambda: H.shape == (10, 10) and smallest >= 0, "every eigenvalue is ≥ 0: a bowl (the smallest is about 0.017, a thin one)")

# %% [markdown]
# ## 4. A flat bottom, and the fix
# Add a twin column (body-mass index again, `X[:, 2]`) and the bowl gets a flat direction. Set `H_twin` for the new
# data `Xt`, and `H_ridge`: the same plus the curvature an L2 penalty with $\lambda = 0.1$ adds, $2\lambda I$
# (`np.eye(11)` is the 11×11 identity).

# %%
Xt = np.column_stack([X, X[:, 2]])
lam = 0.1
H_twin = H_ridge = None
### HINT H_twin is built like H, from Xt.
### HINT H_twin = 2 * Xt.T @ Xt / n; H_ridge = H_twin + 2 * lam * np.eye(11)
### BEGIN SOLUTION
H_twin = 2 * Xt.T @ Xt / n
H_ridge = H_twin + 2 * lam * np.eye(11)
### END SOLUTION
if H_twin is not None:
    print("smallest eigenvalue with the twin:", np.linalg.eigvalsh(H_twin)[0], "· with the penalty:", np.linalg.eigvalsh(H_ridge)[0])

# %%
check(lambda: abs(np.linalg.eigvalsh(H_twin)[0]) < 1e-9, "the twin column makes a flat direction: eigenvalue 0")
check(lambda: np.isclose(np.linalg.eigvalsh(H_ridge)[0], 0.2), "the penalty lifts every eigenvalue by 2λ = 0.2: one single best point")

# %% [markdown]
# ## 5. A network fails the test
# The cell trains a small network (10 inputs, 8 hidden neurons, 1 output) and defines `loss` for its weights. Relabel
# the hidden neurons with `perm` (column `j` of `W1`, entry `j` of `b1` and row `j` of `W2` all move together): set
# `W1p`, `b1p`, `W2p` with `perm` as the index, as in the lesson.

# %%
from sklearn.neural_network import MLPRegressor
net = MLPRegressor(hidden_layer_sizes=(8,), activation="tanh", max_iter=3000, random_state=0).fit(X, y)
W1, W2 = net.coefs_; b1, b2 = net.intercepts_
loss = lambda W1, b1, W2: np.mean((np.tanh(X @ W1 + b1) @ W2 + b2 - y[:, None]) ** 2)
perm = np.roll(np.arange(8), 1)
W1p = b1p = W2p = None
### HINT Columns of W1: W1[:, perm]. Entries of b1 and rows of W2: b1[perm], W2[perm].
### HINT W1p, b1p, W2p = W1[:, perm], b1[perm], W2[perm]
### BEGIN SOLUTION
W1p, b1p, W2p = W1[:, perm], b1[perm], W2[perm]
### END SOLUTION
if W1p is not None:
    print("original:", loss(W1, b1, W2), "relabeled:", loss(W1p, b1p, W2p), "halfway:", loss((W1 + W1p) / 2, (b1 + b1p) / 2, (W2 + W2p) / 2))

# %%
check(lambda: np.isclose(loss(W1p, b1p, W2p), loss(W1, b1, W2)) and not np.allclose(W1p, W1), "different weights, the same network, the same loss")
check(lambda: loss((W1 + W1p) / 2, (b1 + b1p) / 2, (W2 + W2p) / 2) > loss(W1, b1, W2) + 0.1, "halfway is worse (about 0.85 against 0.48): equal ends with a bump between, so not a bowl")

# %% [markdown]
# ## 6. PCA as the best point on a circle
# Among all directions of length 1, which has the most variance $u^\top \Sigma u$? The cell makes 3,600 unit
# directions `U` (one per row) and the covariance `S` of two features. Set `var`, the variance along each row
# (`np.sum((U @ S) * U, axis=1)`: row by row, $u^\top \Sigma u$), and `best`, the row with the largest one.

# %%
two = X[:, [2, 8]]                                      # body-mass index and s5
S = np.cov(two, rowvar=False)
th = np.linspace(0, np.pi, 3600, endpoint=False)
U = np.column_stack([np.cos(th), np.sin(th)])
var = best = None
### HINT var = np.sum((U @ S) * U, axis=1)
### HINT best = U[np.argmax(var)]
### BEGIN SOLUTION
var = np.sum((U @ S) * U, axis=1)
best = U[np.argmax(var)]
### END SOLUTION
print(best)

# %%
lams, vecs = np.linalg.eigh(S)
check(lambda: abs(abs(best @ vecs[:, -1]) - 1) < 1e-5, "the best direction is S's top eigenvector (up to sign): the Lagrange condition Σu = μu")
check(lambda: np.isclose(var.max(), lams[-1], rtol=1e-5), "and the most variance equals the top eigenvalue")

# %% [markdown]
# ## 7. Lasso picks features
# Fit `Lasso(alpha=0.1)` to `X`, `y` as `lasso`, and set `kept`: the names in `d.feature_names` whose weight in
# `lasso.coef_` isn't zero.

# %%
from sklearn.linear_model import Lasso
lasso = kept = None
### HINT lasso = Lasso(alpha=0.1).fit(X, y)
### HINT kept = [name for name, w in zip(d.feature_names, lasso.coef_) if w != 0]
### BEGIN SOLUTION
lasso = Lasso(alpha=0.1).fit(X, y)
kept = [name for name, w in zip(d.feature_names, lasso.coef_) if w != 0]
### END SOLUTION
print(kept)

# %%
check(lambda: sorted(kept) == ["bmi", "bp", "s3", "s5"], "lasso keeps 4 of 10: bmi, bp, s3 and s5; the other six weights are exactly 0")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Boyd and Vandenberghe's "Convex Optimization" (free from Stanford) for much more.
