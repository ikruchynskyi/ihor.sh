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
# When positive cases are rare (here ~9%), a naive model that always predicts 0 (benign) achieves high accuracy:
# `acc_lazy = metrics.accuracy_score(yte, np.zeros_like(yte))` (~91% accuracy, but completely useless!).
#
# Now evaluate our actual logistic regression model at decision threshold 0.5:
# - Set `acc_model`: the model's accuracy at threshold 0.5 using `accuracy_score`.
# - Set `cm`: the 2×2 confusion matrix at threshold 0.5 using `confusion_matrix` (layout: `[[tn, fp], [fn, tp]]`).

# %%
# A naive baseline predicting all benign (class 0) for every test patient:
acc_lazy = metrics.accuracy_score(yte, np.zeros_like(yte))

acc_model = cm = None
### HINT Compute model accuracy at threshold 0.5 (where predicted class is scores >= 0.5) using metrics.accuracy_score(yte, scores >= 0.5).
### HINT Compute confusion matrix at threshold 0.5 using metrics.confusion_matrix(yte, scores >= 0.5).
### HINT Use metrics.accuracy_score(yte, scores >= 0.5) with predicted binary labels scores >= 0.5.
### HINT Use metrics.confusion_matrix(yte, scores >= 0.5) to produce the [[tn, fp], [fn, tp]] array.
### BEGIN SOLUTION
acc_model = metrics.accuracy_score(yte, scores >= 0.5)
cm = metrics.confusion_matrix(yte, scores >= 0.5)
### END SOLUTION
print("Model accuracy:", acc_model, "Lazy baseline:", acc_lazy)
print("Confusion matrix:\n", cm)

# %%
check(lambda: acc_lazy > 0.88, 
      f"Saying 'benign' to everyone is {acc_lazy:.1%} accurate, yet catches 0 real cancers.")
check(lambda: acc_model is not None and acc_model > 0.90, 
      f"Model accuracy ({acc_model}) should be > 0.90 at threshold 0.5.")
check(lambda: cm is not None and cm.sum() == len(yte) and cm[1].sum() == yte.sum(), 
      "Row 1 (second row) of the confusion matrix must sum to total actual malignant cases in yte.")

# %% [markdown]
# ## 2. Precision and recall across thresholds
# Write `pr_at(t)` returning `(precision, recall)` when flagging tumors with `scores >= t`.
# Use `precision_score` and `recall_score` from `sklearn.metrics` with `zero_division=0`.
# Lower thresholds catch more cases (higher recall) but raise more false alarms (lower precision).

# %%
def pr_at(t):
    """Compute precision and recall at probability threshold t.
    
    Args:
        t: float threshold in [0, 1]. Tumors with scores >= t are predicted malignant (1).
    Returns:
        tuple (precision, recall): both floats in [0, 1].
    """
    ### HINT Generate boolean array flag = scores >= t.
    ### HINT Return metrics.precision_score(yte, flag, zero_division=0), metrics.recall_score(yte, flag, zero_division=0).
    ### BEGIN SOLUTION
    flag = scores >= t
    return metrics.precision_score(yte, flag, zero_division=0), metrics.recall_score(yte, flag, zero_division=0)
    ### END SOLUTION

for t in (0.1, 0.3, 0.5, 0.7, 0.9):
    print("threshold", t, " precision, recall:", pr_at(t))

# %%
check(lambda: pr_at(0.1)[1] >= pr_at(0.9)[1] and pr_at(0.9)[0] >= pr_at(0.1)[0], 
      "Lower threshold (0.1) must achieve higher recall, while higher threshold (0.9) achieves higher precision.")

# %% [markdown]
# ## 3. ROC and precision-recall curves
# Calculate ranking performance across all possible thresholds:
# - Set `auc`: area under the ROC curve using `roc_auc_score(yte, scores)`.
# - Set `ap`: average precision (area under the PR curve) using `average_precision_score(yte, scores)`.
#
# The helper plots below show both curves. The PR curve's baseline is the dataset base rate (~9%).

# %%
auc = ap = None
### HINT Compute ROC AUC score using metrics.roc_auc_score(yte, scores).
### HINT Compute Average Precision (PR AUC) using metrics.average_precision_score(yte, scores).
### HINT auc = metrics.roc_auc_score(yte, scores)
### HINT ap = metrics.average_precision_score(yte, scores)
### BEGIN SOLUTION
auc = metrics.roc_auc_score(yte, scores)
ap = metrics.average_precision_score(yte, scores)
### END SOLUTION
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
metrics.RocCurveDisplay.from_predictions(yte, scores, ax=ax[0])
metrics.PrecisionRecallDisplay.from_predictions(yte, scores, ax=ax[1])
plt.show()
print("AUC:", auc, "AP:", ap, "base rate:", yte.mean())

# %%
check(lambda: auc is not None and auc > 0.95 and ap is not None and ap > yte.mean() * 5, 
      f"AUC ({auc}) should be > 0.95 and Average Precision ({ap}) should be far above base rate ({yte.mean():.3f}).")

# %% [markdown]
# ## 4. Choose the threshold by cost
# In clinical screening, errors have unequal costs:
# - Missing a malignant tumor (a **False Negative**, FN: `scores < t` and `yte == 1`) costs **20** units (delayed treatment).
# - An unnecessary biopsy (a **False Positive**, FP: `scores >= t` and `yte == 0`) costs **1** unit.
#
# For every threshold in `ts`, compute the total cost: `20 * FN + 1 * FP`.
# Set `best_t` to the cheapest threshold (where cost is minimized).

# %%
ts = np.linspace(0.01, 0.99, 99)
best_t = None
### HINT For each threshold t in ts, calculate false negatives FN: ((scores < t) & (yte == 1)).sum()
### HINT Calculate false positives FP: ((scores >= t) & (yte == 0)).sum()
### HINT Compute cost = 20 * FN + 1 * FP across all thresholds.
### HINT Find the threshold with minimum cost using best_t = ts[int(np.argmin(cost))].
### HINT Count FN as ((scores < t) & (yte == 1)).sum() and FP as ((scores >= t) & (yte == 0)).sum().
### HINT Total cost list: [20 * ((scores < t) & (yte == 1)).sum() + ((scores >= t) & (yte == 0)).sum() for t in ts]
### HINT Select best_t = ts[int(np.argmin(cost))].
### BEGIN SOLUTION
cost = [20 * ((scores < t) & (yte == 1)).sum() + ((scores >= t) & (yte == 0)).sum() for t in ts]
best_t = ts[int(np.argmin(cost))]
plt.plot(ts, cost); plt.xlabel("threshold"); plt.ylabel("cost"); plt.show()
### END SOLUTION
print("cheapest threshold:", best_t)

# %%
check(lambda: best_t is not None and best_t < 0.5, 
      "when missing a cancer costs 20× more than a biopsy, the best threshold moves well below 0.5")

# %% [markdown]
# ## 5. Is 0.8 really 80%?
# Calibration checks whether predicted probabilities correspond to real frequencies: when the model predicts 0.8,
# are about 80% of those cases actually malignant?
#
# Use `cross_val_predict` on `(X, y)` with 5-fold cross-validation and `method="predict_proba"` to obtain out-of-fold probabilities.
# Then compute the curve with `calibration_curve(y, oof, n_bins=5)`.
# Set `prob_true` and `prob_pred`.

# %%
from sklearn.calibration import calibration_curve
from sklearn.model_selection import cross_val_predict

prob_true = prob_pred = None
### HINT Obtain out-of-fold predicted probabilities for class 1 using cross_val_predict(..., cv=5, method="predict_proba")[:, 1].
### HINT Compute prob_true, prob_pred = calibration_curve(y, oof, n_bins=5).
### HINT Plot (prob_pred, prob_true) against the diagonal reference line [0, 1].
### HINT oof = cross_val_predict(make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)), X, y, cv=5, method="predict_proba")[:, 1]
### HINT prob_true, prob_pred = calibration_curve(y, oof, n_bins=5)
### BEGIN SOLUTION
oof = cross_val_predict(make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)), X, y, cv=5, method="predict_proba")[:, 1]
prob_true, prob_pred = calibration_curve(y, oof, n_bins=5)
plt.plot([0, 1], [0, 1], "--", color="gray"); plt.plot(prob_pred, prob_true, "o-"); plt.xlabel("predicted"); plt.ylabel("actual share"); plt.show()
### END SOLUTION
print("predicted:", prob_pred, "actual share:", prob_true)

# %%
check(lambda: prob_true is not None and len(prob_true) >= 3 and np.all(np.abs(prob_true - prob_pred) < 0.35), 
      "Logistic regression is reasonably calibrated: points (prob_pred, prob_true) lie close to the diagonal.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 4, confidence and tests.
