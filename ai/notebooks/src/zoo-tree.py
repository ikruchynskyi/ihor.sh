# %% [markdown]
# # Practice: decision trees
# *AI from scratch, model zoo 5* · lesson: https://ihor.sh/ai/zoo-tree.html
#
# 10,000 bank calls: Gini by hand, a tree's rules printed, how much a tree changes when the data does, two trees from
# two halves that disagree, leaf size and pruning chosen on validation data, and a first taste of averaging trees.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Bank marketing data: Moro, Cortez and Rita (2014), UCI Machine Learning Repository, CC BY 4.0.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
b = pd.read_csv(DATA + "bank.csv")
y = (b["y"] == "yes").astype(int).values
X = pd.get_dummies(b.drop(columns=["y", "duration"]), dtype=float)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
auc = lambda model: roc_auc_score(yte, model.predict_proba(Xte)[:, 1])
print(X.shape[1], "columns after one-hot;", len(Xtr), "training calls")

# %% [markdown]
# ## 1. Gini by hand
# A box holds the class shares in `p`. Set `gini` to \(1 - \sum_k p_k^2\). Predict first: is a 90/10 box purer
# (lower) than a 60/40 one?

# %%
p = np.array([0.9, 0.1])
gini = None
### HINT (p ** 2).sum() is the sum of the squared shares.
### HINT gini = 1 - (p ** 2).sum()
### BEGIN SOLUTION
gini = 1 - (p ** 2).sum()
### END SOLUTION
print(gini)

# %%
check(lambda: abs(gini - 0.18) < 1e-9, "1 − (0.81 + 0.01) = 0.18, much purer than 60/40's 0.48")

# %% [markdown]
# ## 2. Print the model
# Fit `t`, a `DecisionTreeClassifier(max_depth=2, random_state=0)`, on the training calls. Its rules print below.

# %%
t = None
### HINT DecisionTreeClassifier(max_depth=2, random_state=0).fit(Xtr, ytr)
### BEGIN SOLUTION
t = DecisionTreeClassifier(max_depth=2, random_state=0).fit(Xtr, ytr)
### END SOLUTION
print(export_text(t, feature_names=list(X.columns)) if t is not None else None)

# %%
check(lambda: X.columns[t.tree_.feature[0]] == "nr.employed" and t.get_n_leaves() == 4,
      "four leaves, and the first question is about nr.employed (the economy's employment figure)")

# %% [markdown]
# ## 3. How much does a tree move?
# `bootstrap_preds(depth)` grows 20 trees of that depth on 20 resamples of the training calls and returns their
# predicted chances for the test calls, shape (20, calls). `spread(depth)` is the average, over calls, of how much
# the 20 predictions for a call differ (their standard deviation). Set `spreads` to `spread(d)` for each `d` in
# `depths` (None means no limit).

# %%
def bootstrap_preds(depth):
    out = []
    for seed in range(20):
        rows = np.random.default_rng(seed).integers(0, len(Xtr), len(Xtr))
        out.append(DecisionTreeClassifier(max_depth=depth, random_state=0).fit(Xtr.iloc[rows], ytr[rows]).predict_proba(Xte)[:, 1])
    return np.array(out)

spread = lambda depth: bootstrap_preds(depth).std(axis=0).mean()
depths = [3, 6, 10, None]
spreads = None
### HINT spreads = [spread(d) for d in depths]
### BEGIN SOLUTION
spreads = [spread(d) for d in depths]
### END SOLUTION
print(spreads)

# %%
check(lambda: spreads[0] < 0.05 and spreads[-1] > 0.15 and all(a < b for a, b in zip(spreads, spreads[1:])),
      "about 0.03 at depth 3, 0.05, 0.10, and 0.22 unlimited: the deeper the tree, the more it reflects its particular sample")

# %% [markdown]
# ## 4. Two halves, two trees
# Grow one unlimited tree on the first half of the training calls and one on the second half, and set `disagree` to
# the share of test calls where their predictions (`.predict`) differ.

# %%
h = len(Xtr) // 2
disagree = None
### HINT a = DecisionTreeClassifier(random_state=0).fit(Xtr.iloc[:h], ytr[:h]).predict(Xte), and c the same with [h:]
### HINT disagree = (a != c).mean()
### BEGIN SOLUTION
a = DecisionTreeClassifier(random_state=0).fit(Xtr.iloc[:h], ytr[:h]).predict(Xte)
c = DecisionTreeClassifier(random_state=0).fit(Xtr.iloc[h:], ytr[h:]).predict(Xte)
disagree = (a != c).mean()
### END SOLUTION
print(disagree)

# %%
check(lambda: 0.12 < disagree < 0.25,
      "about 19%: each tree says yes to about 350 calls, but often not the same ones")

# %% [markdown]
# ## 5. Leaf size
# Set `leaf_aucs` to the test AUC (`auc(model)`) of an unlimited-depth tree for each `min_samples_leaf` in `leaves`.

# %%
leaves = [1, 10, 50, 200]
leaf_aucs = None
### HINT auc(DecisionTreeClassifier(min_samples_leaf=n, random_state=0).fit(Xtr, ytr)) for one n
### HINT leaf_aucs = [auc(DecisionTreeClassifier(min_samples_leaf=n, random_state=0).fit(Xtr, ytr)) for n in leaves]
### BEGIN SOLUTION
leaf_aucs = [auc(DecisionTreeClassifier(min_samples_leaf=n, random_state=0).fit(Xtr, ytr)) for n in leaves]
### END SOLUTION
print(leaf_aucs)

# %%
check(lambda: leaf_aucs[0] < 0.66 and leaf_aucs[-1] > 0.75,
      "0.62 with 1-call leaves, 0.77 with leaves of at least 200 calls: each leaf's answer is an average, and averages of 1 are noise")

# %% [markdown]
# ## 6. Pruning, chosen on validation data
# Split off validation calls (done for you). `alphas` are the pruning strengths to try. Set `val_aucs` to each one's
# validation AUC, then `best` to the alpha with the highest one: `alphas[int(np.argmax(val_aucs))]`.

# %%
Xa, Xv, ya, yv = train_test_split(Xtr, ytr, test_size=0.3, stratify=ytr, random_state=1)
alphas = [0, 1e-4, 3e-4, 1e-3, 3e-3]
val_auc = lambda a: roc_auc_score(yv, DecisionTreeClassifier(ccp_alpha=a, random_state=0).fit(Xa, ya).predict_proba(Xv)[:, 1])
val_aucs = best = None
### HINT val_aucs = [val_auc(a) for a in alphas]
### HINT best = alphas[int(np.argmax(val_aucs))]
### BEGIN SOLUTION
val_aucs = [val_auc(a) for a in alphas]
best = alphas[int(np.argmax(val_aucs))]
### END SOLUTION
pruned = DecisionTreeClassifier(ccp_alpha=best, random_state=0).fit(Xa, ya) if best is not None else None
print(val_aucs, "best:", best, "· leaves:", pruned.get_n_leaves() if pruned else None, "· test AUC:", auc(pruned) if pruned else None)

# %%
check(lambda: best == 1e-3 and pruned.get_n_leaves() < 20,
      "alpha = 0.001: about 11 leaves instead of 746, test AUC about 0.77 instead of 0.60")

# %% [markdown]
# ## 7. A taste of the next page: average the noise away
# Exercise 3's 20 unlimited trees disagree a lot. Set `one_auc` to the test AUC of the first one alone
# (`roc_auc_score(yte, P[0])`) and `avg_auc` to the AUC of their average (`P.mean(axis=0)`).

# %%
P = bootstrap_preds(None)
one_auc = avg_auc = None
### HINT one_auc = roc_auc_score(yte, P[0])
### HINT avg_auc = roc_auc_score(yte, P.mean(axis=0))
### BEGIN SOLUTION
one_auc = roc_auc_score(yte, P[0])
avg_auc = roc_auc_score(yte, P.mean(axis=0))
### END SOLUTION
print("one tree:", one_auc, "· average of 20:", avg_auc)

# %%
check(lambda: avg_auc > one_auc + 0.08,
      "about 0.60 alone and 0.73 averaged: their mistakes are partly independent, so they cancel. That's a random forest's core idea")
