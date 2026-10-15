# %% [markdown]
# # Practice: linear regression, ridge and lasso
# *AI from scratch, model zoo 1* · lesson: https://ihor.sh/ai/zoo-linear.html
#
# Five years of NYC subway ridership: the normal equation by hand, ridge's price on weights, what twin columns do to
# the weights, lasso's soft threshold and its path, a line against trees past the end of the data, and one typo
# against squared and Huber loss. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Ridership: MTA daily ridership, data.ny.gov.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression, Ridge, Lasso, HuberRegressor
from sklearn.metrics import mean_absolute_error

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
r = pd.read_csv(DATA + "ridership.csv", parse_dates=["date"])
r = r[r["date"] >= "2021-01-01"].reset_index(drop=True)
X = pd.get_dummies(r["date"].dt.dayofweek, prefix="day", drop_first=True, dtype=float)   # Tuesday…Sunday vs Monday
X.insert(0, "trend", (r["date"] - r["date"].min()).dt.days.values / 365)              # years since 2021
y = r["subway"].values / 1e6                                                            # millions of riders a day
train = (r["date"] < "2024-01-01").values
Xtr, ytr, Xte, yte = X[train], y[train], X[~train], y[~train]
plt.figure(figsize=(9, 3)); plt.plot(r["date"], y, lw=0.6); plt.ylabel("million riders"); plt.show()
print(len(Xtr), "training days (2021–2023),", len(Xte), "test days (2024 on)")

# %% [markdown]
# ## 1. The normal equation
# `A` is the training columns with a column of ones in front (for the intercept). Set `w` to the solution of
# \(A^\top A\, w = A^\top y\) with `np.linalg.solve`, as in chapter L1 and the lesson's code.

# %%
A = np.column_stack([np.ones(len(Xtr)), Xtr.values])
w = None
### HINT np.linalg.solve(M, b) solves M w = b. Here M is A.T @ A and b is A.T @ ytr.
### HINT w = np.linalg.solve(A.T @ A, A.T @ ytr)
### BEGIN SOLUTION
w = np.linalg.solve(A.T @ A, A.T @ ytr)
### END SOLUTION
print(pd.Series(w, index=["intercept"] + list(X.columns)).round(3) if w is not None else None)

# %%
lin = LinearRegression().fit(Xtr, ytr)
check(lambda: np.allclose(w, np.r_[lin.intercept_, lin.coef_]),
      "the same numbers as scikit-learn: intercept about 1.89, trend about 0.57 (million riders a day, per year)")

# %% [markdown]
# ## 2. Ridge: a price on big weights
# Ridge solves \((A^\top A + P)\,w = A^\top y\), where `P` is λ on the diagonal, except for the intercept (nobody
# penalizes the average). `P` is built for you with λ = 10. Set `w_ridge`.

# %%
lam = 10.0
P = lam * np.eye(A.shape[1]); P[0, 0] = 0
w_ridge = None
### HINT Same as exercise 1, with P added to A.T @ A.
### HINT w_ridge = np.linalg.solve(A.T @ A + P, A.T @ ytr)
### BEGIN SOLUTION
w_ridge = np.linalg.solve(A.T @ A + P, A.T @ ytr)
### END SOLUTION
print(w_ridge)

# %%
rid = Ridge(alpha=lam).fit(Xtr, ytr)
check(lambda: np.allclose(w_ridge, np.r_[rid.intercept_, rid.coef_]),
      "matches Ridge(alpha=10): every weight a little smaller than in exercise 1 (Sunday −1.06 instead of −1.15)")

# %% [markdown]
# ## 3. Twins
# `X2` is `X` plus `trend_copy`: the trend plus noise a thousandth of a year wide. Fit `LinearRegression` and
# `Ridge(alpha=1.0)` on the training rows of `X2`, and set `ols_pair` and `ridge_pair` to each model's two trend
# weights: `model.coef_[:2]` (the first two columns are the twins).

# %%
X2 = X.copy()
X2.insert(1, "trend_copy", X2["trend"] + np.random.default_rng(0).normal(0, 0.001, len(X2)))
ols_pair = ridge_pair = None
### HINT LinearRegression().fit(X2[train], ytr).coef_[:2], and the same with Ridge(alpha=1.0).
### HINT ols_pair = LinearRegression().fit(X2[train], ytr).coef_[:2]
### BEGIN SOLUTION
ols_pair = LinearRegression().fit(X2[train], ytr).coef_[:2]
ridge_pair = Ridge(alpha=1.0).fit(X2[train], ytr).coef_[:2]
### END SOLUTION
print("least squares:", ols_pair, "· ridge:", ridge_pair)

# %%
check(lambda: abs(ols_pair[0]) > 2 and ols_pair[0] * ols_pair[1] < 0 and abs(ridge_pair[0] - ridge_pair[1]) < 0.05,
      "least squares gives huge opposite weights (about 3.5 and −3.0, summing to the real 0.57); ridge splits it about evenly (0.28 each)")

# %% [markdown]
# Their sum is what predicts, so test error doesn't change. Run this to see how much the plain weights wander when
# the rows are resampled (a bootstrap), and how little ridge's do:

# %%
for name, make in [("least squares", LinearRegression), ("ridge", lambda: Ridge(alpha=1.0))]:
    ws = []
    for seed in range(20):
        rows = np.random.default_rng(seed).integers(0, train.sum(), train.sum())
        ws.append(make().fit(X2[train].iloc[rows], ytr[rows]).coef_[0])
    print(f"{name:14s} trend weight over 20 resamples: {min(ws):7.2f} to {max(ws):6.2f}")

# %% [markdown]
# ## 4. The soft threshold
# Lasso's one-weight step: shrink `z` toward zero by `t`, and stop at zero if it would cross. Write `soft(z, t)`
# returning `np.sign(z) * np.maximum(np.abs(z) - t, 0)` (it must work on arrays too).

# %%
def soft(z, t):
    ### HINT One line: return np.sign(z) * np.maximum(np.abs(z) - t, 0)
    ### BEGIN SOLUTION
    return np.sign(z) * np.maximum(np.abs(z) - t, 0)
    ### END SOLUTION

print(soft(np.array([-3.0, -0.5, 0.2, 2.0]), 1.0))

# %%
check(lambda: np.allclose(soft(np.array([-3.0, -0.5, 0.2, 2.0]), 1.0), [-2, 0, 0, 1]),
      "[-2, 0, 0, 1]: big values move 1 toward zero, small ones stop at exactly zero")

# %% [markdown]
# ## 5. The lasso path
# Add months to the columns (`Xm`, scaled so the penalty is fair). For each price in `alphas`, fit
# `Lasso(alpha=a)` and count the weights that aren't zero: set `kept` to that list, with a list comprehension.

# %%
from sklearn.preprocessing import StandardScaler
Xm = pd.concat([X, pd.get_dummies(r["date"].dt.month, prefix="month", drop_first=True, dtype=float)], axis=1)
Xms = StandardScaler().fit_transform(Xm[train])
alphas = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3]
kept = None
### HINT (Lasso(alpha=a).fit(Xms, ytr).coef_ != 0).sum() counts one model's nonzero weights.
### HINT kept = [(Lasso(alpha=a).fit(Xms, ytr).coef_ != 0).sum() for a in alphas]
### BEGIN SOLUTION
kept = [(Lasso(alpha=a).fit(Xms, ytr).coef_ != 0).sum() for a in alphas]
### END SOLUTION
print(Xm.shape[1], "columns; kept at each price:", kept)

# %%
check(lambda: kept[0] >= 15 and kept[-1] <= 4 and all(a >= b for a, b in zip(kept, kept[1:])),
      "the count only falls as the price rises: nearly all 18 columns at 0.001, only the strongest few at 0.3")

# %% [markdown]
# ## 6. Past the end of the data
# Fit a line and boosted trees on 2021–2023 (the same columns), and set `mae_line` and `mae_trees` to each one's mean
# absolute error on 2024 (`mean_absolute_error(yte, model.predict(Xte))`). Predict first: which misses more?

# %%
from sklearn.ensemble import HistGradientBoostingRegressor
mae_line = mae_trees = None
### HINT line = LinearRegression().fit(Xtr, ytr), trees = HistGradientBoostingRegressor(random_state=0).fit(Xtr, ytr)
### HINT mae_line = mean_absolute_error(yte, line.predict(Xte)), and the same for trees
### BEGIN SOLUTION
line = LinearRegression().fit(Xtr, ytr)
trees = HistGradientBoostingRegressor(random_state=0).fit(Xtr, ytr)
mae_line = mean_absolute_error(yte, line.predict(Xte))
mae_trees = mean_absolute_error(yte, trees.predict(Xte))
### END SOLUTION
print("line:", mae_line, "· trees:", mae_trees)

# %%
check(lambda: mae_line > mae_trees + 0.1,
      "the line misses by about 0.56 million a day, the trees by about 0.34: the line keeps climbing at 2021's recovery pace, the trees stay flat")

# %% [markdown]
# Here flat won because the recovery slowed. If ridership had kept climbing, the line would have won. Neither model
# knows which future you're in: past the data, choose by what you believe about the trend, then check.

# %%
if mae_line is not None:
    plt.figure(figsize=(9, 3)); plt.plot(r["date"], y, lw=0.5, color="gray")
    plt.plot(r["date"][~train], line.predict(Xte), lw=0.8, label="line"); plt.plot(r["date"][~train], trees.predict(Xte), lw=0.8, label="trees")
    plt.legend(); plt.show()

# %% [markdown]
# ## 7. One typo
# With only the first 60 days of 2021 (the line's trend from few rows), one day was typed with an extra zero: ten
# times its real ridership. Fit `LinearRegression` and `HuberRegressor(max_iter=1000)` on `Xs, ys_typo`, and set
# `trend_ols` and `trend_huber` to each one's trend weight (`.coef_[0]`). `trend_clean` is the honest answer.

# %%
Xs, ys = X.iloc[:60], y[:60]
ys_typo = ys.copy(); ys_typo[40] *= 10
trend_clean = LinearRegression().fit(Xs, ys).coef_[0]
trend_ols = trend_huber = None
### HINT LinearRegression().fit(Xs, ys_typo).coef_[0]
### HINT trend_huber = HuberRegressor(max_iter=1000).fit(Xs, ys_typo).coef_[0]
### BEGIN SOLUTION
trend_ols = LinearRegression().fit(Xs, ys_typo).coef_[0]
trend_huber = HuberRegressor(max_iter=1000).fit(Xs, ys_typo).coef_[0]
### END SOLUTION
print("clean:", trend_clean, "· least squares with the typo:", trend_ols, "· Huber with the typo:", trend_huber)

# %%
check(lambda: abs(trend_huber - trend_clean) < abs(trend_ols - trend_clean) / 3,
      "the typo drags the least-squares trend far off; Huber's grows only linearly for big misses, so it stays near the clean answer")
