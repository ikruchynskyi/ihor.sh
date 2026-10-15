# %% [markdown]
# # Practice: XGBoost, LightGBM, CatBoost
# *AI from scratch, model zoo 7* · lesson: https://ihor.sh/ai/zoo-boosting.html
#
# Boosting for yes/no on 10,000 bank calls: the gradient and curvature of log-loss, a Newton-step leaf, XGBoost and
# LightGBM with early stopping, histograms against exact splits, a category that leaks its own label and CatBoost's
# cure, and why stumps can't learn XOR. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check
# under it; `hint(n)` and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook
# settings.
#
# Bank marketing data: Moro, Cortez and Rita (2014), UCI Machine Learning Repository, CC BY 4.0.

# %%
import subprocess, sys, time, warnings
warnings.filterwarnings("ignore", message=".*deprecated.*")     # newer LightGBM renames eval_set; older ones need it
try:
    import catboost
except ImportError:                                   # Colab doesn't ship CatBoost
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "catboost"], check=True)
    import catboost
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from sklearn.ensemble import GradientBoostingClassifier, HistGradientBoostingClassifier

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
b = pd.read_csv(DATA + "bank.csv")
y = (b["y"] == "yes").astype(int).values
raw = b.drop(columns=["y", "duration"])
cats = list(raw.select_dtypes("object").columns)
X = pd.get_dummies(raw, dtype=float)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
Xa, Xv, ya, yv = train_test_split(Xtr, ytr, test_size=0.2, stratify=ytr, random_state=1)   # validation for early stopping
auc = lambda model, X_=Xte: roc_auc_score(yte, model.predict_proba(X_)[:, 1])
print(len(Xa), "training,", len(Xv), "validation,", len(Xte), "test calls")

# %% [markdown]
# ## 1. What each row says to the next tree
# For log-loss, a row's gradient is \(g = p - y\) and its curvature \(h = p(1 - p)\). Set `g` and `h` for these four
# rows. Predict first: which row has the biggest curvature?

# %%
p = np.array([0.02, 0.5, 0.9, 0.05])
yy = np.array([1, 1, 1, 0])
g = h = None
### HINT g = p - yy, and h = p * (1 - p)
### BEGIN SOLUTION
g, h = p - yy, p * (1 - p)
### END SOLUTION
print("g:", g, "· h:", h)

# %%
check(lambda: np.allclose(g, [-0.98, -0.5, -0.1, 0.05]) and np.allclose(h, [0.0196, 0.25, 0.09, 0.0475]),
      "the first row is confidently wrong (g = −0.98) with almost no curvature; the unsure row (p = 0.5) has the most, 0.25")

# %% [markdown]
# ## 2. A Newton-step leaf
# Suppose those four rows share a leaf. Set `w` to the leaf's value \(-\sum g / (\sum h + \lambda)\) with λ = 1, and
# `w0` the same with λ = 0.

# %%
lam = 1.0
w = w0 = None
### HINT w = -g.sum() / (h.sum() + lam)
### HINT w0 = -g.sum() / h.sum()
### BEGIN SOLUTION
w = -g.sum() / (h.sum() + lam)
w0 = -g.sum() / h.sum()
### END SOLUTION
print("with λ = 1:", w, "· without:", w0)

# %%
check(lambda: abs(w - 1.087) < 0.01 and w0 > 3 * w,
      "about 1.09 with λ = 1 and 3.8 without: on a leaf of 4 rows, λ stops a huge step built on little evidence")

# %% [markdown]
# ## 3. XGBoost with early stopping
# Fit `xg = xgb.XGBClassifier(n_estimators=2000, learning_rate=0.03, max_depth=4, early_stopping_rounds=100,
# eval_metric="auc")` on `Xa, ya` with `eval_set=[(Xv, yv)]` and `verbose=False`, then set `auc_xgb = auc(xg)`.
# `auc_default` is XGBoost with its default settings, for comparison.

# %%
auc_default = auc(xgb.XGBClassifier().fit(Xtr, ytr))
xg = auc_xgb = None
### HINT xg = xgb.XGBClassifier(...).fit(Xa, ya, eval_set=[(Xv, yv)], verbose=False)
### HINT then auc_xgb = auc(xg)
### BEGIN SOLUTION
xg = xgb.XGBClassifier(n_estimators=2000, learning_rate=0.03, max_depth=4, early_stopping_rounds=100,
                       eval_metric="auc").fit(Xa, ya, eval_set=[(Xv, yv)], verbose=False)
auc_xgb = auc(xg)
### END SOLUTION
print("default:", auc_default, "· tuned with early stopping:", auc_xgb, "· stopped at round", xg.best_iteration if xg else None)

# %%
check(lambda: auc_xgb > auc_default + 0.01 and xg.best_iteration < 1000,
      "about 0.744 with defaults, 0.774 tuned, stopping near round 170 of 2,000: validation data chose the number of rounds")

# %% [markdown]
# ## 4. LightGBM, the same way
# Fit `lg = lgb.LGBMClassifier(n_estimators=2000, learning_rate=0.03, num_leaves=15, verbose=-1)` on `Xa, ya` with
# `eval_set=[(Xv, yv)]`, `eval_metric="auc"` and `callbacks=[lgb.early_stopping(100, verbose=False)]`, and set
# `auc_lgb`.

# %%
lg = auc_lgb = None
### HINT lg = lgb.LGBMClassifier(...).fit(Xa, ya, eval_set=[(Xv, yv)], eval_metric="auc", callbacks=[lgb.early_stopping(100, verbose=False)])
### HINT auc_lgb = auc(lg)
### BEGIN SOLUTION
lg = lgb.LGBMClassifier(n_estimators=2000, learning_rate=0.03, num_leaves=15, verbose=-1).fit(
    Xa, ya, eval_set=[(Xv, yv)], eval_metric="auc", callbacks=[lgb.early_stopping(100, verbose=False)])
auc_lgb = auc(lg)
### END SOLUTION
print("LightGBM:", auc_lgb, "· stopped at", lg.best_iteration_ if lg else None)

# %%
check(lambda: abs(auc_lgb - auc_xgb) < 0.02, "about 0.772, within a hair of XGBoost: same algorithm, different engineering")

# %% [markdown]
# ## 5. Histograms against exact splits
# 50,000 synthetic rows, 20 columns. Time 30 trees of scikit-learn's exact `GradientBoostingClassifier(n_estimators=30,
# max_depth=3)` and of `HistGradientBoostingClassifier(max_iter=30, max_depth=3, early_stopping=False)`, and set
# `t_exact` and `t_hist` in seconds (`t = time.time()` before, `time.time() - t` after).

# %%
rng = np.random.default_rng(0)
Z = rng.normal(size=(50_000, 20))
zy = (Z[:, 0] * Z[:, 1] + np.sin(Z[:, 2]) + 0.5 * rng.normal(size=50_000) > 0).astype(int)
t_exact = t_hist = None
### HINT t = time.time(); GradientBoostingClassifier(n_estimators=30, max_depth=3).fit(Z, zy); t_exact = time.time() - t
### HINT then the same for the histogram model
### BEGIN SOLUTION
t = time.time(); GradientBoostingClassifier(n_estimators=30, max_depth=3).fit(Z, zy); t_exact = time.time() - t
t = time.time(); HistGradientBoostingClassifier(max_iter=30, max_depth=3, early_stopping=False).fit(Z, zy); t_hist = time.time() - t
### END SOLUTION
print("exact:", t_exact, "s · histograms:", t_hist, "s")

# %%
check(lambda: t_exact > 10 * t_hist,
      "tens to hundreds of times faster: 255 bins per column instead of every distinct value as a candidate cut")

# %% [markdown]
# ## 6. A category that leaks its own label
# `branch` is a made-up category with 3,000 values, pure noise. `naive_encode` replaces it by each branch's yes-rate in
# the training rows. Fit `HistGradientBoostingClassifier(random_state=0)` on `A` (training columns plus the encoded
# branch) and set `train_auc` and `test_auc` (`roc_auc_score(ytr, m.predict_proba(A)[:, 1])` and the same on `Bt`).
# Predict first: what will the gap look like?

# %%
raw2 = raw.assign(branch=rng.integers(0, 3000, len(raw)).astype(str))
rate = pd.Series(ytr, index=Xtr.index).groupby(raw2.loc[Xtr.index, "branch"]).mean()
naive_encode = lambda idx: raw2.loc[idx, "branch"].map(rate).fillna(ytr.mean()).values
A = Xtr.assign(branch_rate=naive_encode(Xtr.index))
Bt = Xte.assign(branch_rate=naive_encode(Xte.index))
train_auc = test_auc = None
### HINT m = HistGradientBoostingClassifier(random_state=0).fit(A, ytr)
### HINT train_auc = roc_auc_score(ytr, m.predict_proba(A)[:, 1]); test_auc = roc_auc_score(yte, m.predict_proba(Bt)[:, 1])
### BEGIN SOLUTION
m = HistGradientBoostingClassifier(random_state=0).fit(A, ytr)
train_auc = roc_auc_score(ytr, m.predict_proba(A)[:, 1])
test_auc = roc_auc_score(yte, m.predict_proba(Bt)[:, 1])
### END SOLUTION
print("train:", train_auc, "· test:", test_auc)

# %%
check(lambda: train_auc > 0.98 and test_auc < 0.65,
      "about 0.997 on training and 0.56 on test: with ~2.6 calls per branch, the rate is mostly the row's own label")

# %% [markdown]
# CatBoost encodes each row's category only from rows before it in a random order, so a row never sees its own
# label. Run it with the same noise column as a category:

# %%
cb = catboost.CatBoostClassifier(verbose=0, random_seed=0).fit(raw2.loc[Xtr.index], ytr, cat_features=cats + ["branch"])
print("CatBoost, ordered statistics, test AUC:", roc_auc_score(yte, cb.predict_proba(raw2.loc[Xte.index])[:, 1]))

# %% [markdown]
# ## 7. Stumps and XOR
# 2,000 points where the class is "x and y have the same sign". Fit XGBoost with `max_depth=1` (stumps) and with
# `max_depth=2`, 300 rounds each, and set `acc_stumps` and `acc_depth2` to their test accuracy (`.score`).

# %%
P = rng.uniform(-1, 1, (2000, 2)); py = (P[:, 0] * P[:, 1] > 0).astype(int)
Ptr, Pte, pytr, pyte = train_test_split(P, py, random_state=0)
acc_stumps = acc_depth2 = None
### HINT xgb.XGBClassifier(n_estimators=300, max_depth=1).fit(Ptr, pytr).score(Pte, pyte)
### HINT the same with max_depth=2
### BEGIN SOLUTION
acc_stumps = xgb.XGBClassifier(n_estimators=300, max_depth=1).fit(Ptr, pytr).score(Pte, pyte)
acc_depth2 = xgb.XGBClassifier(n_estimators=300, max_depth=2).fit(Ptr, pytr).score(Pte, pyte)
### END SOLUTION
print("stumps:", acc_stumps, "· depth 2:", acc_depth2)

# %%
check(lambda: acc_stumps < 0.7 and acc_depth2 > 0.95,
      "stumps stay near a coin flip (a sum of one-column effects can't express 'same sign'); depth 2 gets about 99%")
