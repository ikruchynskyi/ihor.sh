# %% [markdown]
# # Practice: measuring a classifier properly
# *AI from scratch, chapter 12* · lesson: https://ihor.sh/ai/12-measuring-a-model.html
#
# On a rare-event version of the breast-cancer data: why accuracy misleads, the confusion matrix, precision and
# recall across thresholds, ROC and precision-recall curves, a threshold chosen by what mistakes cost, and calibration.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn import metrics

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## The data: make the disease rare
# In the original data 37% of tumors are malignant. Screening data is far more lopsided, so keep only 1 in 6 of the
# malignant cases: about 9% positives. Label 1 = malignant (the thing we're looking for).

# %%
d = load_breast_cancer()
y_all = 1 - d.target                                   # 1 = malignant
rng = np.random.default_rng(0)
keep = (y_all == 0) | (rng.random(len(y_all)) < 1 / 6)
X, y = d.data[keep], y_all[keep]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.4, stratify=y, random_state=0)
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(Xtr, ytr)
scores = model.predict_proba(Xte)[:, 1]
print(len(y), "tumors,", y.mean().round(3), "malignant")

# %% [markdown]
# ## 1. The accuracy trap
# Set `acc_model`: the model's accuracy at threshold 0.5, and `acc_lazy`: the accuracy of a "model" that always says
# benign. Then `cm`: the confusion matrix at 0.5 (`metrics.confusion_matrix`, layout [[tn, fp], [fn, tp]]).

# %%
acc_model = acc_lazy = cm = None
### BEGIN SOLUTION
acc_model = metrics.accuracy_score(yte, scores >= 0.5)
acc_lazy = metrics.accuracy_score(yte, np.zeros_like(yte))
cm = metrics.confusion_matrix(yte, scores >= 0.5)
### END SOLUTION
print(acc_model, acc_lazy); print(cm)

# %%
check(lambda: acc_lazy > 0.88, "saying 'benign' to everyone is about 91% accurate, and useless")
check(lambda: cm.sum() == len(yte) and cm[1].sum() == yte.sum(), "row 2 of the matrix holds the real malignant cases")

# %% [markdown]
# ## 2. Precision and recall across thresholds
# Write `pr_at(t)` returning (precision, recall) when flagging scores ≥ t (use `metrics.precision_score` and
# `metrics.recall_score` with `zero_division=0`). Lower thresholds catch more cases but raise more false alarms.

# %%
def pr_at(t):
    ### BEGIN SOLUTION
    flag = scores >= t
    return metrics.precision_score(yte, flag, zero_division=0), metrics.recall_score(yte, flag, zero_division=0)
    ### END SOLUTION

for t in (0.1, 0.3, 0.5, 0.7, 0.9):
    print(t, pr_at(t))

# %%
check(lambda: pr_at(0.1)[1] >= pr_at(0.9)[1] and pr_at(0.9)[0] >= pr_at(0.1)[0], "lower threshold: more recall, less precision")

# %% [markdown]
# ## 3. ROC and precision-recall curves
# Set `auc` (`metrics.roc_auc_score`) and `ap` (average precision, `metrics.average_precision_score`, the area under
# the PR curve). Plot both curves with `metrics.RocCurveDisplay.from_predictions` and
# `metrics.PrecisionRecallDisplay.from_predictions`. The PR curve's "random" line sits at the base rate.

# %%
auc = ap = None
### BEGIN SOLUTION
auc = metrics.roc_auc_score(yte, scores)
ap = metrics.average_precision_score(yte, scores)
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
metrics.RocCurveDisplay.from_predictions(yte, scores, ax=ax[0]); metrics.PrecisionRecallDisplay.from_predictions(yte, scores, ax=ax[1])
plt.show()
### END SOLUTION
print("AUC", auc, " AP", ap, " base rate", yte.mean())

# %%
check(lambda: auc > 0.95 and ap > yte.mean() * 5, "a strong ranking: far above the base rate")

# %% [markdown]
# ## 4. Choose the threshold by cost
# Missing a malignant tumor (a false negative) costs 20 times more than an unnecessary biopsy (a false positive).
# For every threshold in `ts`, compute the total cost 20·FN + 1·FP and set `best_t` to the cheapest.

# %%
ts = np.linspace(0.01, 0.99, 99)
best_t = None
### BEGIN SOLUTION
cost = [20 * ((scores < t) & (yte == 1)).sum() + ((scores >= t) & (yte == 0)).sum() for t in ts]
best_t = ts[int(np.argmin(cost))]
plt.plot(ts, cost); plt.xlabel("threshold"); plt.ylabel("cost"); plt.show()
### END SOLUTION
print("cheapest threshold:", best_t)

# %%
check(lambda: best_t < 0.5, "when misses cost more, the best threshold moves below 0.5")

# %% [markdown]
# ## 5. Is 0.8 really 80%?
# `calibration_curve` groups predictions into bins and compares the average predicted probability with the real
# share of positives. Compute it on the **training** data from 5-fold out-of-fold scores
# (`cross_val_predict(..., method="predict_proba")`) to have enough positives, with 5 bins. Set `prob_true`,
# `prob_pred` and plot them against the diagonal.

# %%
from sklearn.calibration import calibration_curve
from sklearn.model_selection import cross_val_predict
prob_true = prob_pred = None
### BEGIN SOLUTION
oof = cross_val_predict(make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)), X, y, cv=5, method="predict_proba")[:, 1]
prob_true, prob_pred = calibration_curve(y, oof, n_bins=5)
plt.plot([0, 1], [0, 1], "--", color="gray"); plt.plot(prob_pred, prob_true, "o-"); plt.xlabel("predicted"); plt.ylabel("actual share"); plt.show()
### END SOLUTION
print(prob_pred, prob_true)

# %%
check(lambda: len(prob_true) >= 3 and np.all(np.abs(prob_true - prob_pred) < 0.35), "logistic regression is roughly calibrated: points near the diagonal")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 4, confidence and tests.
