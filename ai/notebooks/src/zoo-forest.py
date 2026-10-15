# %% [markdown]
# # Practice: random forests
# *AI from scratch, model zoo 6* · lesson: https://ihor.sh/ai/zoo-forest.html
#
# 10,000 bank calls: what a bootstrap sample holds, how the score grows with trees, the variance of an average checked
# by simulation, out-of-bag scoring, a noise column that fools built-in importance, columns per split, and what a
# forest weighs. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and
# `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Bank marketing data: Moro, Cortez and Rita (2014), UCI Machine Learning Repository, CC BY 4.0.

# %%
import pickle
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
b = pd.read_csv(DATA + "bank.csv")
y = (b["y"] == "yes").astype(int).values
X = pd.get_dummies(b.drop(columns=["y", "duration"]), dtype=float)
X["noise"] = np.random.default_rng(0).random(len(X))          # a column of pure random numbers, for section 5
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
auc = lambda model: roc_auc_score(yte, model.predict_proba(Xte)[:, 1])
print(X.shape[1], "columns,", len(Xtr), "training calls")

# %% [markdown]
# ## 1. What a bootstrap sample holds
# `rows` draws 1,000 positions with replacement from 1,000. Set `share` to the share of distinct positions it
# contains: `len(np.unique(rows)) / 1000`. Predict first: about half, about two thirds, or almost all?

# %%
rows = np.random.default_rng(0).integers(0, 1000, 1000)
share = None
### HINT np.unique(rows) keeps each position once.
### HINT share = len(np.unique(rows)) / 1000
### BEGIN SOLUTION
share = len(np.unique(rows)) / 1000
### END SOLUTION
print(share)

# %%
check(lambda: 0.6 < share < 0.66, "about 0.63 = 1 − 1/e: each tree never sees about 37% of the rows, its out-of-bag rows")

# %% [markdown]
# ## 2. More trees
# Set `aucs` to the test AUC of a forest with each number of trees in `ns`
# (`RandomForestClassifier(n, min_samples_leaf=5, n_jobs=-1, random_state=0)`).

# %%
ns = [1, 10, 50, 300]
aucs = None
### HINT auc(RandomForestClassifier(n, min_samples_leaf=5, n_jobs=-1, random_state=0).fit(Xtr, ytr)) for one n
### HINT aucs = [auc(RandomForestClassifier(n, min_samples_leaf=5, n_jobs=-1, random_state=0).fit(Xtr, ytr)) for n in ns]
### BEGIN SOLUTION
aucs = [auc(RandomForestClassifier(n, min_samples_leaf=5, n_jobs=-1, random_state=0).fit(Xtr, ytr)) for n in ns]
### END SOLUTION
print(aucs)

# %%
check(lambda: aucs[0] < 0.75 and min(aucs[2:]) > 0.77 and abs(aucs[3] - aucs[2]) < 0.01,
      "about 0.74 → 0.77 → 0.785 → 0.782: fast gains, then a plateau. More trees never overfit, they just stop helping")

# %% [markdown]
# ## 3. The variance of an average, checked
# Simulate 20,000 forests of `B` trees: each tree's prediction is a shared part plus its own part, built so each
# tree has variance `s2` and any two have correlation `rho`. `simulated` is the variance of their average. Set
# `formula` to the lesson's \(\rho\sigma^2 + \frac{1-\rho}{B}\sigma^2\) and compare.

# %%
rng = np.random.default_rng(1)
B, rho, s2 = 50, 0.3, 1.0
shared = rng.normal(0, np.sqrt(rho * s2), (20_000, 1))
own = rng.normal(0, np.sqrt((1 - rho) * s2), (20_000, B))
simulated = (shared + own).mean(axis=1).var()
formula = None
### HINT formula = rho * s2 + (1 - rho) / B * s2
### BEGIN SOLUTION
formula = rho * s2 + (1 - rho) / B * s2
### END SOLUTION
print("simulated:", simulated, "· formula:", formula)

# %%
check(lambda: abs(formula - 0.314) < 1e-9 and abs(simulated - formula) < 0.02,
      "0.314: with ρ = 0.3, fifty trees can't get below 0.3 of one tree's variance; the shared part never averages out")

# %% [markdown]
# ## 4. Out-of-bag: validation for free
# Fit `forest = RandomForestClassifier(300, min_samples_leaf=5, oob_score=True, n_jobs=-1, random_state=0)`. Then set
# `oob_auc` from its out-of-bag probabilities, `roc_auc_score(ytr, forest.oob_decision_function_[:, 1])`, and
# `test_auc` with `auc(forest)`.

# %%
forest = oob_auc = test_auc = None
### HINT forest = RandomForestClassifier(300, min_samples_leaf=5, oob_score=True, n_jobs=-1, random_state=0).fit(Xtr, ytr)
### HINT oob_auc = roc_auc_score(ytr, forest.oob_decision_function_[:, 1]); test_auc = auc(forest)
### BEGIN SOLUTION
forest = RandomForestClassifier(300, min_samples_leaf=5, oob_score=True, n_jobs=-1, random_state=0).fit(Xtr, ytr)
oob_auc = roc_auc_score(ytr, forest.oob_decision_function_[:, 1])
test_auc = auc(forest)
### END SOLUTION
print("out-of-bag:", oob_auc, "· test:", test_auc)

# %%
check(lambda: abs(oob_auc - test_auc) < 0.03,
      "0.79 out-of-bag vs 0.78 on test: an honest estimate from the training data alone")

# %% [markdown]
# ## 5. The noise column
# `imp` is the forest's built-in importance and `perm` the permutation importance on the test calls (shuffle a
# column, measure how much the AUC drops). Set `rank_imp` and `rank_perm` to the noise column's place in each (1 =
# most important): `list(imp.index).index("noise") + 1`, and the same for `perm`.

# %%
imp = pd.Series(forest.feature_importances_, X.columns).sort_values(ascending=False) if forest else None
pi = permutation_importance(forest, Xte, yte, scoring="roc_auc", n_repeats=5, random_state=0, n_jobs=-1) if forest else None
perm = pd.Series(pi.importances_mean, X.columns).sort_values(ascending=False) if forest else None
rank_imp = rank_perm = None
### HINT imp.index lists the columns from most to least important.
### HINT rank_imp = list(imp.index).index("noise") + 1, and the same with perm
### BEGIN SOLUTION
rank_imp = list(imp.index).index("noise") + 1
rank_perm = list(perm.index).index("noise") + 1
### END SOLUTION
print("noise ranks", rank_imp, "by built-in importance and", rank_perm, "by permutation, of", X.shape[1])
print(imp.head(6).round(3) if imp is not None else None)

# %%
check(lambda: rank_imp <= 10 and rank_perm > 15,
      "about 5th by built-in importance (level with age), about 23rd by permutation: random numbers offer thousands of lucky cuts")

# %% [markdown]
# ## 6. Columns per split
# Set `auc_bagging` to the test AUC with `max_features=1.0` (every column at every split: plain bagging) and
# `auc_sqrt` with `max_features="sqrt"` (8 of the 64), both with 300 trees and `min_samples_leaf=5`.

# %%
auc_bagging = auc_sqrt = None
### HINT auc(RandomForestClassifier(300, min_samples_leaf=5, max_features=1.0, n_jobs=-1, random_state=0).fit(Xtr, ytr))
### HINT the same with max_features="sqrt"
### BEGIN SOLUTION
auc_bagging = auc(RandomForestClassifier(300, min_samples_leaf=5, max_features=1.0, n_jobs=-1, random_state=0).fit(Xtr, ytr))
auc_sqrt = auc(RandomForestClassifier(300, min_samples_leaf=5, max_features="sqrt", n_jobs=-1, random_state=0).fit(Xtr, ytr))
### END SOLUTION
print("bagging:", auc_bagging, "· random columns:", auc_sqrt)

# %%
check(lambda: auc_sqrt > auc_bagging,
      "about 0.771 vs 0.782: limiting the columns at each split makes the trees differ more and stops each from chasing the luckiest cut")

# %% [markdown]
# ## 7. What a forest weighs
# Set `mb_full` to the size in megabytes of a 300-tree forest with default (1-call) leaves, `len(pickle.dumps(m)) /
# 1e6`, and `mb_leaf5` for the one from section 4 (`forest`).

# %%
mb_full = mb_leaf5 = None
### HINT m = RandomForestClassifier(300, n_jobs=-1, random_state=0).fit(Xtr, ytr); mb_full = len(pickle.dumps(m)) / 1e6
### HINT mb_leaf5 = len(pickle.dumps(forest)) / 1e6
### BEGIN SOLUTION
m = RandomForestClassifier(300, n_jobs=-1, random_state=0).fit(Xtr, ytr)
mb_full = len(pickle.dumps(m)) / 1e6
mb_leaf5 = len(pickle.dumps(forest)) / 1e6
### END SOLUTION
print("default leaves:", mb_full, "MB · leaves of 5+:", mb_leaf5, "MB")

# %%
check(lambda: mb_full > 2 * mb_leaf5 and mb_full > 20,
      "tens of megabytes (about 54 vs 18): every leaf of every tree is stored. Boosted trees on the same data weigh well under 1 MB")
