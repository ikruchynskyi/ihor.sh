# %% [markdown]
# # Milestone 3: Bank calls end-to-end
# *AI from scratch, milestone 3* · combine notebook for Stage 3
#
# Deliver an end-to-end production machine learning pipeline on direct marketing telemarketing data:
# 1. Inspect data and detect target leakage (`duration`).
# 2. Set up an honest, time-aware train/validation split.
# 3. Train a regularized logistic regression baseline with scikit-learn.
# 4. Train a modern gradient-boosted tree model (`HistGradientBoostingClassifier`).
# 5. Determine the profit-maximizing probability decision threshold from business costs.
# 6. Publish an actionable Model Card.
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import io, urllib.request
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, confusion_matrix

# Load bank marketing dataset from repository
url = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/bank.csv"
raw_text = urllib.request.urlopen(url).read().decode()
sep = ";" if ";" in raw_text.splitlines()[0] else ","
df = pd.read_csv(io.StringIO(raw_text), sep=sep)
print(f"Loaded bank records: {len(df)} rows, {len(df.columns)} columns")
print("Target breakdown:", df["y"].value_counts().to_dict())

# %% [markdown]
# ## 1. Detecting target leakage
# The feature `duration` records the length of the phone call in seconds.
# But our model must score customers *before* the sales agent dials the phone.
# If `duration = 0`, the customer never picked up (`y = 0`). If `duration = 600`, the sales pitch has already succeeded.
# Set `y = (df['y'] == 'yes').astype(int)` and create `X` by dropping both `"y"` and `"duration"`.

# %%
### HINT y = (df["y"] == "yes").astype(int); X = df.drop(columns=["y", "duration"])
### BEGIN SOLUTION
y = (df["y"] == "yes").astype(int)
X = df.drop(columns=["y", "duration"])
### END SOLUTION

# %%
check(lambda: "duration" not in X.columns and "y" not in X.columns and len(X) == len(df) and y.isin([0, 1]).all(), "X excludes both the target and the leaking duration feature")

# %% [markdown]
# ## 2. Time-aware train and validation split
# Bank marketing campaigns run across sequential calendar months.
# Split the data chronologically (first 80% for training, final 20% for validation).
# Assign `X_tr`, `X_te`, `y_tr`, `y_te`.

# %%
### HINT split = int(len(X) * 0.8); X_tr, X_te = X.iloc[:split], X.iloc[split:]; y_tr, y_te = y.iloc[:split], y.iloc[split:]
### BEGIN SOLUTION
split = int(len(X) * 0.8)
X_tr, X_te = X.iloc[:split], X.iloc[split:]
y_tr, y_te = y.iloc[:split], y.iloc[split:]
### END SOLUTION

# %%
check(lambda: len(X_tr) == int(len(df) * 0.8) and len(X_te) == len(df) - len(X_tr), "data is split chronologically into 80% train and 20% validation")

# %% [markdown]
# ## 3. Logistic Regression baseline pipeline
# Separate numeric and categorical column names:
# Build a scikit-learn `Pipeline` with `ColumnTransformer` (standardizing numeric columns and one-hot encoding categoricals)
# followed by `LogisticRegression(max_iter=1000)`.
# Fit the pipeline on `(X_tr, y_tr)` and store validation ROC-AUC in `auc_lr`.

# %%
feature_df = df.drop(columns=["y", "duration"], errors="ignore")
num_cols = list(feature_df.select_dtypes(include=[np.number]).columns)
cat_cols = list(feature_df.select_dtypes(exclude=[np.number]).columns)

### HINT pre = ColumnTransformer([('num', StandardScaler(), num_cols), ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat_cols)])
### HINT pipe_lr = Pipeline([('pre', pre), ('model', LogisticRegression(max_iter=1000))]).fit(X_tr, y_tr)
### HINT auc_lr = float(roc_auc_score(y_te, pipe_lr.predict_proba(X_te)[:, 1]))
### BEGIN SOLUTION
pre = ColumnTransformer([
    ('num', StandardScaler(), num_cols),
    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat_cols)
])
pipe_lr = Pipeline([
    ('pre', pre),
    ('model', LogisticRegression(max_iter=1000))
])
pipe_lr.fit(X_tr, y_tr)
probs_lr = pipe_lr.predict_proba(X_te)[:, 1]
auc_lr = float(roc_auc_score(y_te, probs_lr))
### END SOLUTION

if "auc_lr" in locals() and auc_lr is not None:
    print(f"Logistic Regression Validation ROC-AUC: {auc_lr:.3f}")

# %%
check(lambda: auc_lr > 0.65, "Logistic Regression achieves solid baseline discriminatory power (AUC > 0.65)")

# %% [markdown]
# ## 4. Boosted trees: HistGradientBoostingClassifier
# Train a gradient-boosted tree model using `HistGradientBoostingClassifier(random_state=42)`.
# Build a similar pipeline with `pre` and fit on `(X_tr, y_tr)`.
# Store validation ROC-AUC in `auc_gb`.

# %%
### HINT pipe_gb = Pipeline([('pre', pre), ('model', HistGradientBoostingClassifier(random_state=42))]).fit(X_tr, y_tr)
### HINT auc_gb = float(roc_auc_score(y_te, pipe_gb.predict_proba(X_te)[:, 1]))
### BEGIN SOLUTION
pipe_gb = Pipeline([
    ('pre', pre),
    ('model', HistGradientBoostingClassifier(random_state=42))
])
pipe_gb.fit(X_tr, y_tr)
probs_gb = pipe_gb.predict_proba(X_te)[:, 1]
auc_gb = float(roc_auc_score(y_te, probs_gb))
### END SOLUTION

if "auc_gb" in locals() and auc_gb is not None:
    print(f"Gradient Boosted Trees Validation ROC-AUC: {auc_gb:.3f}")

# %%
check(lambda: auc_gb > 0.65, "Gradient boosted trees achieve competitive validation AUC without target leakage")

# %% [markdown]
# ## 5. Decision threshold from business costs
# Accuracy defaults to a 0.5 probability threshold. In direct sales, costs and payoffs are asymmetric:
# - Each dialed call costs \$2.00 (sales representative time).
# - Each converted term deposit earns \$50.00 net profit.
#
# Net profit for threshold $T$:
# $$\text{Profit} = 50 \times \text{TP} - 2 \times (\text{TP} + \text{FP})$$
#
# Test thresholds from 0.02 to 0.40 in steps of 0.02.
# Store the threshold that maximizes total profit on the validation set in `best_thresh`.

# %%
best_thresh = None
best_profit = -float("inf")

### HINT For thresh in np.arange(0.02, 0.42, 0.02): preds = (probs_gb >= thresh).astype(int); tp = int(((preds == 1) & (y_te == 1)).sum()); dialed = int((preds == 1).sum()); profit = 50 * tp - 2 * dialed; if profit > best_profit: ...
### BEGIN SOLUTION
for thresh in np.arange(0.02, 0.42, 0.02):
    preds = (probs_gb >= thresh).astype(int)
    tp = int(((preds == 1) & (y_te == 1)).sum())
    dialed = int((preds == 1).sum())
    profit = 50 * tp - 2 * dialed
    if profit > best_profit:
        best_profit = profit
        best_thresh = round(float(thresh), 2)
### END SOLUTION

if "best_thresh" in locals() and best_thresh is not None:
    print(f"Optimal decision threshold: {best_thresh} (yields ${best_profit:,.2f} validation profit)")

# %%
check(lambda: best_thresh is not None and 0.02 <= best_thresh <= 0.20, "Optimal cost-aware threshold is well below the naive 0.5 default, reflecting the 50:2 reward-to-cost ratio")

# %% [markdown]
# ## 6. The Model Card
# Summarize the system in a structured dictionary `model_card`:
# - `"target"`: `"term_deposit_subscription"`
# - `"leak_prevention"`: `"duration_dropped"`
# - `"best_model"`: `"HistGradientBoosting" if auc_gb >= auc_lr else "LogisticRegression"`
# - `"chosen_threshold"`: `best_thresh`
# - `"validation_auc"`: `round(max(auc_gb, auc_lr), 3)`

# %%
### HINT model_card = {"target": "term_deposit_subscription", "leak_prevention": "duration_dropped", "best_model": ..., "chosen_threshold": best_thresh, "validation_auc": round(max(auc_gb, auc_lr), 3)}
### BEGIN SOLUTION
model_card = {
    "target": "term_deposit_subscription",
    "leak_prevention": "duration_dropped",
    "best_model": "HistGradientBoosting" if auc_gb >= auc_lr else "LogisticRegression",
    "chosen_threshold": best_thresh,
    "validation_auc": round(max(auc_gb, auc_lr), 3)
}
### END SOLUTION

if "model_card" in locals() and model_card is not None:
    print("Model Card:", model_card)

# %%
check(lambda: isinstance(model_card, dict) and model_card["leak_prevention"] == "duration_dropped" and "validation_auc" in model_card, "Model card documents target definition, leakage auditing, metric performance, and cost-calibrated decision threshold")
