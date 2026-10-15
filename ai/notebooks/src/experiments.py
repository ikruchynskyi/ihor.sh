# %% [markdown]
# # Practice: experiments you can trust
# *AI from scratch, toolkit 6* · lesson: https://ihor.sh/ai/experiments.html
#
# Make a PyTorch run repeat exactly, measure the seed lottery, log runs and compare two settings over several seeds
# with a test, fingerprint a dataset, and save a model together with the story of how it was made.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import hashlib, json, random, time, urllib.request
import numpy as np
import pandas as pd
import torch
from torch import nn
import torch.nn.functional as F
from scipy import stats
from sklearn.datasets import load_digits

X, y = load_digits(return_X_y=True)
X = torch.tensor(X / 16, dtype=torch.float32); y = torch.tensor(y)
split = torch.randperm(len(X), generator=torch.Generator().manual_seed(0))
tr, te = split[:1260], split[1260:]

# %% [markdown]
# ## 1. Seed everything
# `set_seed(seed)` seeds Python's `random` already. Add the other two: NumPy (`np.random.seed`) and PyTorch
# (`torch.manual_seed`).

# %%
def set_seed(seed):
    random.seed(seed)
    ### HINT Two more calls, each given seed.
    ### HINT np.random.seed(seed) and torch.manual_seed(seed), one per line
    ### BEGIN SOLUTION
    np.random.seed(seed)
    torch.manual_seed(seed)
    ### END SOLUTION

# %%
def train(hidden=16, lr=0.01, epochs=60, seed=0):
    "A small network on the digits, trained in minibatches of 64 shuffled by the seed. Returns (model, test accuracy)."
    set_seed(seed)
    model = nn.Sequential(nn.Linear(64, hidden), nn.ReLU(), nn.Linear(hidden, 10))
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    for epoch in range(epochs):
        order = torch.randperm(len(tr))
        for i in range(0, len(tr), 64):
            idx = tr[order[i:i + 64]]
            opt.zero_grad(); F.cross_entropy(model(X[idx]), y[idx]).backward(); opt.step()
    with torch.no_grad():
        return model, (model(X[te]).argmax(1) == y[te]).float().mean().item()

m1, a1 = train(seed=3); m2, a2 = train(seed=3)
print("seed 3 twice:", a1, a2)
check(lambda: torch.equal(m1[0].weight, m2[0].weight) and a1 == a2, "the same seed gives exactly the same weights and accuracy")

# %% [markdown]
# ## 2. The seed lottery
# Train the default model with seeds 0 to 7 and set `accs` to the list of their test accuracies (`train(seed=s)[1]`).
# **Before running, estimate** the gap between the best and the worst seed, in accuracy points.

# %%
accs = None
### HINT A list comprehension over range(8).
### HINT accs = [train(seed=s)[1] for s in range(8)]
### BEGIN SOLUTION
accs = [train(seed=s)[1] for s in range(8)]
### END SOLUTION
print(np.round(accs, 3) if accs is not None else None)

# %%
check(lambda: len(accs) == 8 and max(accs) - min(accs) > 0.003, "eight different accuracies from one setting: that spread is the noise any comparison must beat")
if accs is not None:
    print("spread:", round(100 * (max(accs) - min(accs)), 1), "points between the best and worst seed")

# %% [markdown]
# ## 3. Log every run
# `log_run(config, **metrics)` appends one JSON line to `LOG` (given). Log 5 seeds of two settings, `hidden=16` and
# `hidden=32`: for each, call `train(hidden=h, seed=s)` and `log_run({"hidden": h, "seed": s}, test_acc=acc)`.
# Then `runs` (given) turns the log into a table.

# %%
LOG = []
def log_run(config, **metrics):
    LOG.append(json.dumps({"time": time.strftime("%H:%M:%S"), **config, **metrics}))

### HINT Two loops: for h in [16, 32]: and inside it for s in range(5):
### HINT Inside: acc = train(hidden=h, seed=s)[1], then log_run({"hidden": h, "seed": s}, test_acc=acc)
### BEGIN SOLUTION
for h in [16, 32]:
    for s in range(5):
        acc = train(hidden=h, seed=s)[1]
        log_run({"hidden": h, "seed": s}, test_acc=acc)
### END SOLUTION
runs = pd.DataFrame([json.loads(line) for line in LOG])
runs.groupby("hidden")["test_acc"].agg(["mean", "std", "count"]) if len(runs) else runs

# %%
check(lambda: len(runs) == 10 and set(runs["hidden"]) == {16, 32} and runs.groupby("hidden").size().tolist() == [5, 5],
      "10 rows: 5 seeds for each of the two settings")

# %% [markdown]
# ## 4. Is 32 better than 16, beyond luck?
# Compare the two groups of 5 accuracies with Welch's t-test from Probability 4:
# `stats.ttest_ind(a, b, equal_var=False)`. Set `p` to its p-value.

# %%
p = None
### HINT a = runs[runs["hidden"] == 16]["test_acc"], and b the same for 32.
### HINT p = stats.ttest_ind(a, b, equal_var=False).pvalue
### BEGIN SOLUTION
a = runs[runs["hidden"] == 16]["test_acc"]
b = runs[runs["hidden"] == 32]["test_acc"]
p = stats.ttest_ind(a, b, equal_var=False).pvalue
### END SOLUTION
print("p =", p)

# %%
check(lambda: 0 <= p <= 1 and np.isclose(p, stats.ttest_ind(runs[runs["hidden"] == 16]["test_acc"], runs[runs["hidden"] == 32]["test_acc"], equal_var=False).pvalue),
      "Welch's test on the two groups of five; with one run each there would be nothing to test at all")

# %% [markdown]
# ## 5. Fingerprint the data
# Set `fp` to the first 16 characters of the SHA-256 hash of the outages file's bytes:
# `hashlib.sha256(data).hexdigest()[:16]`.

# %%
data = urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/outages.csv").read()
fp = None
### HINT fp = hashlib.sha256(data).hexdigest()[:16]
### BEGIN SOLUTION
fp = hashlib.sha256(data).hexdigest()[:16]
### END SOLUTION
print(fp)

# %%
check(lambda: fp == hashlib.sha256(data).hexdigest()[:16] and fp != hashlib.sha256(data.replace(b"Repair", b"repair", 1)).hexdigest()[:16],
      "16 hex characters; change one letter of the file and they all change")

# %% [markdown]
# ## 6. Save a model with its story
# Save `best` (trained below) as one file: a dict with its `"state_dict"`, its `"config"`, the data fingerprint
# `"data"`, and its `"metrics"`, using `torch.save(checkpoint, "best.pt")`. Then the given cell loads it into a fresh
# model and checks it predicts exactly the same.

# %%
config = {"hidden": 32, "lr": 0.01, "epochs": 60, "seed": 0}
best, best_acc = train(**config)
### HINT checkpoint = {"state_dict": best.state_dict(), "config": config, "data": fp, "metrics": {"test_acc": best_acc}}
### HINT Then torch.save(checkpoint, "best.pt")
### BEGIN SOLUTION
checkpoint = {"state_dict": best.state_dict(), "config": config, "data": fp, "metrics": {"test_acc": best_acc}}
torch.save(checkpoint, "best.pt")
### END SOLUTION

# %%
def reload(path="best.pt"):
    ck = torch.load(path)
    model = nn.Sequential(nn.Linear(64, ck["config"]["hidden"]), nn.ReLU(), nn.Linear(ck["config"]["hidden"], 10))
    model.load_state_dict(ck["state_dict"])
    return model, ck
check(lambda: torch.equal(reload()[0](X[te]).argmax(1), best(X[te]).argmax(1)) and reload()[1]["data"] == fp and reload()[1]["config"] == config,
      "the reloaded model predicts exactly as the saved one, and the file says how it was made")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Made With ML on experiment tracking: https://madewithml.com/
