# %% [markdown]
# # Practice: systems, rank and least squares
# *AI from scratch, linear algebra 1* · lesson: https://ihor.sh/ai/l1-systems-and-inverses.html
#
# Solving equations with NumPy, spotting rank problems in a real dataset, and fitting linear regression exactly,
# three ways, on scikit-learn's diabetes data (442 patients, 10 measurements, a disease-progression score).
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. Solve a system
# Three friends' café receipts: 2 coffees + 1 bagel + 1 juice = \$14; 1 coffee + 3 bagels = \$9;
# 2 bagels + 2 juices = \$16. Write the system as a matrix `A` and a vector `b`, and solve it with
# `np.linalg.solve` into `prices` (coffee, bagel, juice).

# %%
A = b = prices = None
### BEGIN SOLUTION
A = np.array([[2, 1, 1], [1, 3, 0], [0, 2, 2]])
b = np.array([14, 9, 16])
prices = np.linalg.solve(A, b)
### END SOLUTION
print(prices)

# %%
check(lambda: np.allclose(A @ prices, b), "the prices must reproduce all three receipts")
check(lambda: np.allclose(prices, [3, 2, 6]), "coffee $3, bagel $2, juice $6")

# %% [markdown]
# ## 2. Rank: which equations count?
# `np.linalg.matrix_rank` counts independent rows (= independent columns). Set `r1` and `r2` to the ranks of the
# two matrices below. Then: can `B` be inverted? Set `invertible` to `True` or `False`.

# %%
Amat = np.array([[1, 2, 3], [0, 1, 4], [5, 6, 0]])
B = np.array([[1, 2, 3], [2, 4, 6], [1, 0, 1]])
r1 = r2 = invertible = None
### BEGIN SOLUTION
r1 = np.linalg.matrix_rank(Amat)
r2 = np.linalg.matrix_rank(B)
invertible = r2 == 3
### END SOLUTION
print(r1, r2, invertible)

# %%
check(lambda: (r1, r2) == (3, 2), "A has full rank 3; in B, row 2 is twice row 1, so rank 2")
check(lambda: invertible is False or invertible == False, "rank below 3 means singular: no inverse")

# %% [markdown]
# ## 3. Least squares, three ways
# Load the data. `X` is 442 × 10; add a column of 1s for the intercept.

# %%
from sklearn.datasets import load_diabetes
data = load_diabetes()
X = np.column_stack([data.data, np.ones(len(data.data))])
y = data.target
print(X.shape, y.shape, data.feature_names)

# %% [markdown]
# Fit $w$ three ways and check they agree:
# - `w_normal`: solve the normal equations $X^\top X w = X^\top y$ with `np.linalg.solve`
# - `w_lstsq`: `np.linalg.lstsq(X, y, rcond=None)[0]` (more careful about rounding: it uses an SVD)
# - `w_sklearn`: `LinearRegression().fit(...)`, combining its `coef_` and `intercept_` into one vector like the others

# %%
from sklearn.linear_model import LinearRegression
w_normal = w_lstsq = w_sklearn = None
### BEGIN SOLUTION
w_normal = np.linalg.solve(X.T @ X, X.T @ y)
w_lstsq = np.linalg.lstsq(X, y, rcond=None)[0]
lr = LinearRegression().fit(data.data, y)
w_sklearn = np.append(lr.coef_, lr.intercept_)
### END SOLUTION
print(w_normal)

# %%
check(lambda: np.allclose(w_normal, w_lstsq) and np.allclose(w_lstsq, w_sklearn), "all three give the same weights")
check(lambda: np.isclose(np.mean((X @ w_lstsq - y) ** 2), 2859.7, atol=1), "mean squared error about 2860")

# %% [markdown]
# ## 4. A twin column breaks it
# Add a column that's an exact mix of two others (`bmi + bp`). Compute `rank_twin` and `cond_twin`, the
# **condition number** of $X^\top X$ (`np.linalg.cond`): how much rounding errors get magnified. A huge number
# means "nearly singular": the weights stop meaning anything.
# Then fix it the regularization way (chapter 11, Probability 3): add $\lambda I$ to $X^\top X$ before solving.
# Set `w_ridge` with $\lambda = 1$ and `cond_ridge` for the fixed matrix.

# %%
Xt = np.column_stack([X, X[:, 2] + X[:, 3]])
rank_twin = cond_twin = w_ridge = cond_ridge = None
### BEGIN SOLUTION
rank_twin = np.linalg.matrix_rank(Xt)
cond_twin = np.linalg.cond(Xt.T @ Xt)
G = Xt.T @ Xt + 1.0 * np.eye(Xt.shape[1])
w_ridge = np.linalg.solve(G, Xt.T @ y)
cond_ridge = np.linalg.cond(G)
### END SOLUTION
print("rank", rank_twin, "of", Xt.shape[1], " cond", cond_twin, "→", cond_ridge)

# %%
check(lambda: rank_twin == 11, "12 columns but only 11 independent")
check(lambda: cond_twin > 1e12, "nearly singular: condition number in the trillions or more")
check(lambda: cond_ridge < 1e4 and np.isfinite(w_ridge).all(), "λI makes it well-behaved again")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 2, gradients.
