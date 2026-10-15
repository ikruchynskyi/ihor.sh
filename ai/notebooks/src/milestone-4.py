# %% [markdown]
# # Milestone 4: Elevator outages in pipelines & PyTorch image classifier
# *AI from scratch, milestone 4* · combine notebook for Stage 4
#
# Build two complete real-world systems:
# 1. **Tabular pipeline**: predict long NYC subway elevator and escalator outages (>6 hours) from the live archive
#    using pandas feature engineering and scikit-learn `Pipeline` + `ColumnTransformer`.
# 2. **Deep neural network**: train a PyTorch classifier with Batch Normalization, Dropout, and learning rate scheduling
#    on image digits, diagnosing training curves.
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import io, urllib.request
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.datasets import load_digits
import torch
from torch import nn
from torch.utils.data import TensorDataset, DataLoader

# Set seeds
np.random.seed(42)
torch.manual_seed(42)

# %% [markdown]
# ## 1. Loading and filtering outages
# Load the outage archive from the course data repository.
# Filter for finished incidents (`finished == True` or `'True'`), sort chronologically by `start`,
# and calculate `duration_hrs = (last_seen - start).total_seconds() / 3600.0`.
# Create binary classification target: `is_long = (duration_hrs > 6.0).astype(int)`.
# Assign the cleaned DataFrame to `df_outages`.

# %%
outages_url = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/outages.csv"
raw_csv = urllib.request.urlopen(outages_url).read().decode()
raw_df = pd.read_csv(io.StringIO(raw_csv), parse_dates=["start", "last_seen"])

### HINT df = raw_df[raw_df["finished"].astype(str) == "True"].copy().sort_values("start").reset_index(drop=True)
### HINT df["duration_hrs"] = (df["last_seen"] - df["start"]).dt.total_seconds() / 3600.0
### HINT df["is_long"] = (df["duration_hrs"] > 6.0).astype(int); df_outages = df
### BEGIN SOLUTION
df = raw_df[raw_df["finished"].astype(str) == "True"].copy().sort_values("start").reset_index(drop=True)
df["duration_hrs"] = (df["last_seen"] - df["start"]).dt.total_seconds() / 3600.0
df["is_long"] = (df["duration_hrs"] > 6.0).astype(int)
df_outages = df
### END SOLUTION

if "df_outages" in locals() and df_outages is not None:
    print(f"Cleaned completed outages: {len(df_outages)} rows. Long outages (>6h): {df_outages['is_long'].mean() * 100:.1f}%")

# %%
check(lambda: len(df_outages) > 500 and "duration_hrs" in df_outages.columns and "is_long" in df_outages.columns, "outages table is filtered to completed incidents with duration in hours and binary target is_long")

# %% [markdown]
# ## 2. Scikit-learn Pipeline with ColumnTransformer
# Split the dataset chronologically: first 75% for training, remaining 25% for testing.
# Features: `X_cols = ["kind", "reason"]`. Target: `"is_long"`.
# Build a `Pipeline` with:
# - `ColumnTransformer` with `OneHotEncoder(handle_unknown="ignore", sparse_output=False)` on `X_cols`.
# - `HistGradientBoostingClassifier(random_state=42)`.
# Fit on the training set and compute validation ROC-AUC, saving to `auc_outages`.

# %%
X_cols = ["kind", "reason"]

### HINT pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), X_cols)])
### HINT pipe = Pipeline([("pre", pre), ("model", HistGradientBoostingClassifier(random_state=42))]).fit(X_tr, y_tr)
### HINT auc_outages = float(roc_auc_score(y_te, pipe.predict_proba(X_te)[:, 1]))
### BEGIN SOLUTION
split = int(len(df_outages) * 0.75)
X_tr, y_tr = df_outages.iloc[:split][X_cols], df_outages.iloc[:split]["is_long"]
X_te, y_te = df_outages.iloc[split:][X_cols], df_outages.iloc[split:]["is_long"]

pre = ColumnTransformer([
    ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), X_cols)
])
pipe = Pipeline([
    ("pre", pre),
    ("model", HistGradientBoostingClassifier(random_state=42))
])
pipe.fit(X_tr, y_tr)
probs = pipe.predict_proba(X_te)[:, 1]
auc_outages = float(roc_auc_score(y_te, probs))
### END SOLUTION

if "auc_outages" in locals() and auc_outages is not None:
    print(f"Outages Pipeline Test ROC-AUC: {auc_outages:.3f}")

# %%
check(lambda: auc_outages > 0.65, "Scikit-learn pipeline encodes categories cleanly and achieves solid test AUC without data leakage")

# %% [markdown]
# ## 3. PyTorch image network: Batch Normalization & Dropout
# Now build a deep classifier in PyTorch on 8x8 handwritten digits.
# Build an `nn.Sequential` named `digit_model`:
# - `Linear(64, 64)`, `BatchNorm1d(64)`, `ReLU()`, `Dropout(0.2)`
# - `Linear(64, 32)`, `BatchNorm1d(32)`, `ReLU()`
# - `Linear(32, 10)`

# %%
### HINT digit_model = nn.Sequential(nn.Linear(64, 64), nn.BatchNorm1d(64), nn.ReLU(), nn.Dropout(0.2), nn.Linear(64, 32), nn.BatchNorm1d(32), nn.ReLU(), nn.Linear(32, 10))
### BEGIN SOLUTION
digit_model = nn.Sequential(
    nn.Linear(64, 64),
    nn.BatchNorm1d(64),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(64, 32),
    nn.BatchNorm1d(32),
    nn.ReLU(),
    nn.Linear(32, 10)
)
### END SOLUTION

# %%
check(lambda: isinstance(digit_model, nn.Sequential) and any(isinstance(l, nn.BatchNorm1d) for l in digit_model) and any(isinstance(l, nn.Dropout) for l in digit_model), "digit_model architecture incorporates BatchNorm1d and Dropout layers")

# %% [markdown]
# ## 4. Training PyTorch model with minibatches and scheduler
# Prepare DataLoader with batch size 64.
# Train `digit_model` using:
# - `nn.CrossEntropyLoss()`
# - `torch.optim.Adam(digit_model.parameters(), lr=0.01)`
# - `torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=40)`
# Train for 40 epochs. In test evaluation, call `digit_model.eval()` to disable Dropout.
# Store the test accuracy on `X_img_te` in `torch_acc`.

# %%
X_img, y_img = load_digits(return_X_y=True)
X_img = X_img / 16.0
n_tr = 1400
t_Xtr = torch.tensor(X_img[:n_tr], dtype=torch.float32)
t_ytr = torch.tensor(y_img[:n_tr], dtype=torch.int64)
t_Xte = torch.tensor(X_img[n_tr:], dtype=torch.float32)
t_yte = torch.tensor(y_img[n_tr:], dtype=torch.int64)

loader = DataLoader(TensorDataset(t_Xtr, t_ytr), batch_size=64, shuffle=True)

### HINT criterion = nn.CrossEntropyLoss(); opt = torch.optim.Adam(digit_model.parameters(), lr=0.01); sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=40)
### HINT for ep in range(40): digit_model.train(); ... sched.step()
### HINT digit_model.eval(); with torch.no_grad(): torch_acc = float((digit_model(t_Xte).argmax(1) == t_yte).float().mean().item())
### BEGIN SOLUTION
criterion = nn.CrossEntropyLoss()
opt = torch.optim.Adam(digit_model.parameters(), lr=0.01)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=40)

for epoch in range(40):
    digit_model.train()
    for bx, by in loader:
        opt.zero_grad()
        loss = criterion(digit_model(bx), by)
        loss.backward()
        opt.step()
    sched.step()

digit_model.eval()
with torch.no_grad():
    preds = digit_model(t_Xte).argmax(dim=1)
    torch_acc = float((preds == t_yte).float().mean().item())
### END SOLUTION

if "torch_acc" in locals() and torch_acc is not None:
    print(f"PyTorch image classifier test accuracy: {torch_acc * 100:.1f}%")

# %%
check(lambda: torch_acc > 0.92, "Deep PyTorch image network reaches > 92% accuracy with batch normalization and cosine annealing")
