# %% [markdown]
# # Practice: systems, rank and least squares
# *AI from scratch, linear algebra 1* · lesson: https://ihor.sh/ai/l1-systems-and-inverses.html
#
# Solving equations with NumPy, spotting rank problems in a real dataset, and fitting linear regression exactly,
# three ways, on scikit-learn's diabetes data (442 patients, 10 measurements, a disease-progression score).
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np

# %% [markdown]
# ## 1. Solve a system
# Three friends' café receipts: 2 coffees + 1 bagel + 1 juice = \$14; 1 coffee + 3 bagels = \$9;
# 2 bagels + 2 juices = \$16. The receipts are set up below as matrix `A` and bill vector `b`.
# Solve the system with `np.linalg.solve` into `prices` (coffee, bagel, juice).

# %%
A = np.array([[2, 1, 1], [1, 3, 0], [0, 2, 2]])
b = np.array([14, 9, 16])
prices = None
### HINT Solve the linear system A @ prices = b using np.linalg.solve(A, b).
### BEGIN SOLUTION
prices = np.linalg.solve(A, b)
### END SOLUTION
print("Prices (coffee, bagel, juice):", prices)

# %%
check(lambda: prices is not None and np.allclose(A @ prices, b), 
      "The computed prices must satisfy the receipt equations A @ prices == b.")
check(lambda: prices is not None and np.allclose(prices, [3, 2, 6]), 
      "Expected prices: coffee = $3, bagel = $2, juice = $6.")

# %% [markdown]
# ## 2. Rank: which equations count?
# `np.linalg.matrix_rank` counts independent rows (= independent columns). Set `r1` and `r2` to the ranks of the
# two matrices below using `matrix_rank`. Then: can `B` be inverted? Set `invertible` to `True` or `False`.

# %%
Amat = np.array([[1, 2, 3], [0, 1, 4], [5, 6, 0]])
B = np.array([[1, 2, 3], [2, 4, 6], [1, 0, 1]])
r1 = r2 = invertible = None
### HINT Compute matrix rank of Amat using np.linalg.matrix_rank(Amat).
### HINT Compute matrix rank of B using np.linalg.matrix_rank(B).
### HINT Set invertible = (r2 == 3) (a 3x3 matrix is invertible if and only if its rank is 3).
### BEGIN SOLUTION
r1 = np.linalg.matrix_rank(Amat)
r2 = np.linalg.matrix_rank(B)
invertible = r2 == 3
### END SOLUTION
print("Rank Amat:", r1, "Rank B:", r2, "B invertible:", invertible)

# %%
check(lambda: (r1, r2) == (3, 2), 
      "Amat has 3 linearly independent rows (rank 3); B has row 2 = 2 * row 1 (rank 2).")
check(lambda: invertible is False or invertible == False, 
      "Matrix B has rank 2 < 3, so its determinant is 0 and it cannot be inverted (invertible = False).")

# %% [markdown]
# ## 3. Least squares
# Load the data. `X` is 442 × 10; add a column of 1s for the intercept.

# %%
from sklearn.datasets import load_diabetes
data = load_diabetes()
X = np.column_stack([data.data, np.ones(len(data.data))])
y = data.target
print(X.shape, y.shape, data.feature_names)

# %% [markdown]
# Fit $w$ using linear algebra formulas:
# - `w_normal`: solve the normal equations $X^\top X w = X^\top y$ using `solve` (`np.linalg.solve`)
# - `w_lstsq`: `lstsq` (`np.linalg.lstsq(X, y, rcond=None)[0]`, more careful about rounding: uses SVD)

# %%
from sklearn.linear_model import LinearRegression
w_normal = w_lstsq = None
### HINT Solve normal equations: np.linalg.solve(X.T @ X, X.T @ y).
### HINT Solve with lstsq: np.linalg.lstsq(X, y, rcond=None)[0].
### BEGIN SOLUTION
w_normal = np.linalg.solve(X.T @ X, X.T @ y)
w_lstsq = np.linalg.lstsq(X, y, rcond=None)[0]
### END SOLUTION
lr = LinearRegression().fit(data.data, y)
w_sklearn = np.append(lr.coef_, lr.intercept_)
print("Normal equations weights:\n", w_normal)

# %%
check(lambda: w_normal is not None and w_lstsq is not None and np.allclose(w_normal, w_lstsq) and np.allclose(w_lstsq, w_sklearn), 
      "All three approaches (normal equations, lstsq, sklearn LinearRegression) should produce identical weights.")
check(lambda: w_lstsq is not None and np.isclose(np.mean((X @ w_lstsq - y) ** 2), 2859.7, atol=1), 
      "The mean squared error on training features should be approximately 2860.")

# %% [markdown]
# ## 4. A twin column breaks it
# Add a column that's an exact mix of two others (`bmi + bp`). Compute `rank_twin` with `matrix_rank` and `cond_twin`, the
# **condition number** of $X^\top X$ using `cond` (`np.linalg.cond`): how much rounding errors get magnified. A huge number
# means "nearly singular": the weights stop meaning anything.
# Then fix it the regularization way: add $\lambda I$ to $X^\top X$ before solving using `eye` (`np.eye(Xt.shape[1])`).
# Set `w_ridge` with $\lambda = 1$ and `cond_ridge` for the fixed matrix.

# %%
Xt = np.column_stack([X, X[:, 2] + X[:, 3]])
rank_twin = cond_twin = w_ridge = cond_ridge = None
### HINT Compute rank of Xt with np.linalg.matrix_rank(Xt).
### HINT Compute condition number of Xt.T @ Xt with np.linalg.cond(Xt.T @ Xt).
### HINT Regularize G = Xt.T @ Xt + 1.0 * np.eye(Xt.shape[1]).
### HINT Solve G @ w_ridge = Xt.T @ y and compute cond_ridge = np.linalg.cond(G).
### BEGIN SOLUTION
rank_twin = np.linalg.matrix_rank(Xt)
cond_twin = np.linalg.cond(Xt.T @ Xt)
G = Xt.T @ Xt + 1.0 * np.eye(Xt.shape[1])
w_ridge = np.linalg.solve(G, Xt.T @ y)
cond_ridge = np.linalg.cond(G)
### END SOLUTION
print("rank", rank_twin, "of", Xt.shape[1], " cond", cond_twin, "→", cond_ridge)

# %%
check(lambda: rank_twin == 11, 
      "Xt has 12 columns but only 11 independent dimensions (since column 12 is collinear with 2 + 3).")
check(lambda: cond_twin is not None and cond_twin > 1e12, 
      "Collinear features cause Xt.T @ Xt to become nearly singular with condition number > 1e12.")
check(lambda: cond_ridge is not None and cond_ridge < 1e4 and np.isfinite(w_ridge).all(), 
      "Adding lambda * I (Ridge regularization) restores stability and drops the condition number below 1e4.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 2, gradients.
