# %% [markdown]
# # Practice: logistic regression
# *AI from scratch, model zoo 2* · lesson: https://ihor.sh/ai/zoo-logistic.html
#
# 10,000 bank calls: the sigmoid, gradient descent written by hand, odds ratios you can read, calibration checked
# group by group, a weight that runs to infinity, logistic regression against boosted trees, and a ring that a
# straight edge can't cut until you add columns. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the
# check under it; `hint(n)` and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the
# notebook settings.
#
# Bank marketing data: Moro, Cortez and Rita (2014), UCI Machine Learning Repository, CC BY 4.0.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
b = pd.read_csv(DATA + "bank.csv")
y = (b["y"] == "yes").astype(int).values
print(len(b), "calls,", y.mean().round(3), "said yes")

# %% [markdown]
# ## 1. The squash
# Set `p` to the sigmoid of `z`: \(1 / (1 + e^{-z})\), with `np.exp`. Predict first: what's \(\sigma(0)\)?

# %%
z = np.array([-4.0, -1.0, 0.0, 1.0, 4.0])
p = None
### HINT np.exp(-z) is e to the minus z, for every entry at once.
### HINT p = 1 / (1 + np.exp(-z))
### BEGIN SOLUTION
p = 1 / (1 + np.exp(-z))
### END SOLUTION
print(p)

# %%
check(lambda: np.allclose(p, [0.018, 0.269, 0.5, 0.731, 0.982], atol=1e-3),
      "0.5 at z = 0 (log-odds 0 means even odds), close to 0 and 1 at the ends, and σ(−z) = 1 − σ(z)")

# %% [markdown]
# ## 2. Gradient descent by hand
# Five scaled columns and a column of ones (`A`). The loop computes the predictions; complete the step: `w` moves
# against the gradient, `A.T @ (p - y) / len(y)`, times the learning rate `lr`.

# %%
cols = ["age", "campaign", "pdays", "previous", "euribor3m"]
A = np.column_stack([np.ones(len(b)), StandardScaler().fit_transform(b[cols])])
sigmoid = lambda z: 1 / (1 + np.exp(-z))
w, lr = np.zeros(A.shape[1]), 0.5
for step in range(3000):
    p = sigmoid(A @ w)
    ### HINT w -= lr * (the gradient)
    ### HINT w -= lr * A.T @ (p - y) / len(y)
    ### BEGIN SOLUTION
    w -= lr * A.T @ (p - y) / len(y)
    ### END SOLUTION
print(w.round(3))

# %%
sk = LogisticRegression(C=1e6, max_iter=5000).fit(A[:, 1:], y)
check(lambda: np.allclose(w, np.r_[sk.intercept_, sk.coef_[0]], atol=0.01),
      "the same weights as scikit-learn with no penalty: intercept about −2.41, euribor about −0.81")

# %% [markdown]
# At the minimum, the average prediction equals the share of yes. Run it:

# %%
print("average prediction", sigmoid(A @ w).mean().round(4), "· share of yes", y.mean().round(4))

# %% [markdown]
# ## 3. Odds ratios
# A model on four columns you can read, unscaled: whether the last campaign succeeded with this customer, whether
# they were called on a landline, how many calls this campaign, and age. Set `odds` to the odds ratios:
# \(e^{w}\) for each weight, `np.exp(m.coef_[0])`.

# %%
X = pd.get_dummies(b.drop(columns=["y", "duration"]), dtype=float)
four = ["poutcome_success", "contact_telephone", "campaign", "age"]
m = LogisticRegression(max_iter=3000).fit(X[four], y)
odds = None
### HINT np.exp applied to the weights.
### HINT odds = np.exp(m.coef_[0])
### BEGIN SOLUTION
odds = np.exp(m.coef_[0])
### END SOLUTION
pd.Series(odds, index=four).round(3) if odds is not None else None

# %%
check(lambda: 10 < odds[0] < 20 and 0.3 < odds[1] < 0.5 and 0.85 < odds[2] < 0.97,
      "about 14 for a past success (odds ×14), 0.4 for a landline, 0.92 per extra call: each call lowers the odds by about 8%")

# %% [markdown]
# ## 4. Is it calibrated?
# `d` holds each call's predicted chance and whether they said yes, sorted into ten equal groups by the prediction.
# Set `table` to each group's averages: `d.groupby("group").mean()`.

# %%
d = pd.DataFrame({"predicted": sigmoid(A @ w), "said yes": y})
d["group"] = pd.qcut(d["predicted"], 10, labels=False, duplicates="drop")
table = None
### HINT d.groupby("group") then .mean()
### HINT table = d.groupby("group").mean()
### BEGIN SOLUTION
table = d.groupby("group").mean()
### END SOLUTION
if table is not None:
    plt.plot(table["predicted"], table["said yes"], "o-"); plt.plot([0, 0.5], [0, 0.5], "k--", lw=0.8)
    plt.xlabel("average predicted chance"); plt.ylabel("share who said yes"); plt.show()
table

# %%
check(lambda: (table["predicted"] - table["said yes"]).abs().max() < 0.07,
      "every group's prediction is within a few points of what happened: the dots hug the dashed diagonal")

# %% [markdown]
# ## 5. Perfect separation
# Six points, the three on the left class 0 and the three on the right class 1. Fit `LogisticRegression(C=c,
# max_iter=100000)` for each `c` in `Cs` (bigger C, smaller penalty) and set `ws` to the list of fitted weights
# (`.coef_[0][0]`), with a list comprehension. Predict first: what happens as the penalty disappears?

# %%
xs = np.array([[-2.0], [-1.0], [-0.5], [0.5], [1.0], [2.0]])
ys = np.array([0, 0, 0, 1, 1, 1])
Cs = [1, 100, 10_000, 100_000_000]
ws = None
### HINT [LogisticRegression(C=c, max_iter=100000).fit(xs, ys).coef_[0][0] for c in Cs]
### BEGIN SOLUTION
ws = [LogisticRegression(C=c, max_iter=100000).fit(xs, ys).coef_[0][0] for c in Cs]
### END SOLUTION
print(ws)

# %%
check(lambda: all(a < b for a, b in zip(ws, ws[1:])) and ws[-1] > 10,
      "the weight keeps growing (about 1.2, 5.8, 12.7, 15.3): steeper is always a little better on separable data, so only the penalty stops it")

# %% [markdown]
# ## 6. A line against boosted trees
# Every column (categories one-hot), a 75/25 split. The scaled logistic regression is given; fit
# `HistGradientBoostingClassifier(random_state=0)` on the same split and set `auc_lr` and `auc_trees` to each one's
# test AUC (`roc_auc_score(yte, model.predict_proba(Xte)[:, 1])`).

# %%
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
lr_model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000)).fit(Xtr, ytr)
auc_lr = auc_trees = None
### HINT trees = HistGradientBoostingClassifier(random_state=0).fit(Xtr, ytr)
### HINT auc_lr = roc_auc_score(yte, lr_model.predict_proba(Xte)[:, 1]), and the same for trees
### BEGIN SOLUTION
trees = HistGradientBoostingClassifier(random_state=0).fit(Xtr, ytr)
auc_lr = roc_auc_score(yte, lr_model.predict_proba(Xte)[:, 1])
auc_trees = roc_auc_score(yte, trees.predict_proba(Xte)[:, 1])
### END SOLUTION
print("logistic:", auc_lr, "· boosted trees:", auc_trees)

# %%
check(lambda: auc_lr > 0.76 and auc_lr >= auc_trees - 0.005,
      "logistic about 0.78, the trees about 0.76: on 10,000 rows of mostly additive effects, the line ties or wins")

# %% [markdown]
# ## 7. Bending the edge with columns
# A ring around a disc (`make_circles`). Fit plain `LogisticRegression()` and a pipeline that first adds squares and
# products (`PolynomialFeatures(2)`), then set `acc_plain` and `acc_poly` to their test accuracy (`.score`).

# %%
from sklearn.datasets import make_circles
from sklearn.preprocessing import PolynomialFeatures
Xc, yc = make_circles(1000, noise=0.08, factor=0.5, random_state=0)
Xctr, Xcte, yctr, ycte = train_test_split(Xc, yc, random_state=0)
acc_plain = acc_poly = None
### HINT acc_plain = LogisticRegression().fit(Xctr, yctr).score(Xcte, ycte)
### HINT make_pipeline(PolynomialFeatures(2), LogisticRegression()) is fitted and scored the same way
### BEGIN SOLUTION
acc_plain = LogisticRegression().fit(Xctr, yctr).score(Xcte, ycte)
acc_poly = make_pipeline(PolynomialFeatures(2), LogisticRegression()).fit(Xctr, yctr).score(Xcte, ycte)
### END SOLUTION
print("plain:", acc_plain, "· with squares and products:", acc_poly)

# %%
check(lambda: acc_plain < 0.6 and acc_poly > 0.95,
      "about 50% plain (a coin flip), about 99% with x², y², xy: a straight edge in those columns is a circle on the plane")
