# %% [markdown]
# # Practice: the bake-off
# *AI from scratch, model zoo 10* · lesson: https://ihor.sh/ai/zoo-which-model.html
#
# Every model in the zoo on four datasets from the course: bank calls, this site's elevator outages, handwritten
# digits and subway ridership. You'll run the bake-off, build the score table, rank the models, test whether the top
# two really differ, and make your own pick for each dataset with a reason. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck. On
# Kaggle, turn on *Internet* in the notebook settings.
#
# Bank marketing: Moro, Cortez and Rita (2014), UCI, CC BY 4.0. Outages: this site's MTA archive. Digits: UCI, via
# scikit-learn. Ridership: MTA, data.ny.gov.

# %%
import time, pickle, warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.compose import TransformedTargetRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.naive_bayes import GaussianNB
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.svm import SVC, SVR
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.metrics import roc_auc_score, accuracy_score, mean_absolute_error

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
sets = {}
# bank calls: will the customer say yes? (AUC)
b = pd.read_csv(DATA + "bank.csv"); yb = (b["y"] == "yes").astype(int).values
sets["bank calls"] = train_test_split(pd.get_dummies(b.drop(columns=["y", "duration"]), dtype=float), yb, test_size=0.25, stratify=yb, random_state=0)
# elevator outages: will it last over 4 hours? (AUC, censoring-aware labels and a time split, as in the capstone)
o = pd.read_csv(DATA + "outages.csv", parse_dates=["start", "last_seen"]).sort_values("start").reset_index(drop=True)
o["hours"] = (o["last_seen"] - o["start"]).dt.total_seconds() / 3600
o["label"] = np.where(o["hours"] > 4, 1, np.where(o["finished"], 0, np.nan))
o["n_lines"] = o["lines"].str.count("/") + 1; o["hour"] = o["start"].dt.hour; o["weekday"] = o["start"].dt.dayofweek
o["station_before"] = o.groupby("station").cumcount()
o = o.dropna(subset=["label"])
Xo = pd.get_dummies(o[["kind", "reason", "ada", "hour", "n_lines", "weekday", "station_before"]], columns=["kind", "reason"], dtype=float)
late = (o["start"] >= "2026-10-12").values
sets["elevator outages"] = (Xo[~late], Xo[late], o["label"].values[~late].astype(int), o["label"].values[late].astype(int))
# digits: which digit? (accuracy)
d = load_digits()
sets["digits"] = train_test_split(d.data, d.target, test_size=0.25, stratify=d.target, random_state=0)
# ridership: riders tomorrow, in millions (mean absolute error, lower is better; train to 2023, test 2024)
r = pd.read_csv(DATA + "ridership.csv", parse_dates=["date"])
r["t"] = (r["date"] - r["date"].min()).dt.days / 365; r["lag7"] = r["subway"].shift(7) / 1e6; r = r.dropna()
Xr = pd.concat([r[["t", "lag7"]], pd.get_dummies(r["date"].dt.dayofweek, prefix="day", dtype=float),
                pd.get_dummies(r["date"].dt.month, prefix="m", dtype=float)], axis=1)
cut = (r["date"] < "2024-01-01").values
sets["ridership"] = (Xr[cut], Xr[~cut], r["subway"].values[cut] / 1e6, r["subway"].values[~cut] / 1e6)
for name, (Xtr, Xte, ytr, yte) in sets.items():
    print(f"{name:17s} {len(Xtr):5d} training rows, {len(Xte):5d} test rows, {Xtr.shape[1]:3d} columns")

# %%
sc = lambda m: make_pipeline(StandardScaler(), m)
st = lambda m: TransformedTargetRegressor(sc(m), transformer=StandardScaler())     # scale the target too (zoo 9)
CLASSIFIERS = {
    "logistic / linear": lambda: sc(LogisticRegression(max_iter=3000)),
    "k-NN": lambda: sc(KNeighborsClassifier(15)),
    "naive Bayes": lambda: GaussianNB(),
    "tree": lambda: DecisionTreeClassifier(min_samples_leaf=20, random_state=0),
    "forest": lambda: RandomForestClassifier(300, min_samples_leaf=3, n_jobs=-1, random_state=0),
    "boosting": lambda: HistGradientBoostingClassifier(random_state=0),
    "SVM": lambda: sc(SVC(probability=True, random_state=0)),
    "MLP": lambda: sc(MLPClassifier(hidden_layer_sizes=(64,), early_stopping=True, max_iter=500, random_state=0)),
}
REGRESSORS = {
    "logistic / linear": lambda: Ridge(1.0),
    "k-NN": lambda: sc(KNeighborsRegressor(15)),
    "tree": lambda: DecisionTreeRegressor(min_samples_leaf=20, random_state=0),
    "forest": lambda: RandomForestRegressor(300, min_samples_leaf=3, n_jobs=-1, random_state=0),
    "boosting": lambda: HistGradientBoostingRegressor(random_state=0),
    "SVM": lambda: st(SVR()),
    "MLP": lambda: st(MLPRegressor(hidden_layer_sizes=(64,), max_iter=2000, random_state=0)),
}
models_for = lambda data: REGRESSORS if data == "ridership" else CLASSIFIERS

def evaluate(model, data):
    "Fit one model on one dataset; return its score, training seconds and saved size."
    Xtr, Xte, ytr, yte = sets[data]
    m = models_for(data)[model](); t = time.time(); m.fit(Xtr, ytr); secs = time.time() - t
    if data == "ridership": score = mean_absolute_error(yte, m.predict(Xte))
    elif data == "digits": score = accuracy_score(yte, m.predict(Xte))
    else: score = roc_auc_score(yte, m.predict_proba(Xte)[:, 1])
    return {"data": data, "model": model, "score": score, "seconds": secs, "kB": len(pickle.dumps(m)) / 1024}

# %% [markdown]
# ## 1. One entry
# Set `row` to `evaluate("boosting", "bank calls")` and look at what it returns.

# %%
row = None
### HINT row = evaluate("boosting", "bank calls")
### BEGIN SOLUTION
row = evaluate("boosting", "bank calls")
### END SOLUTION
row

# %%
check(lambda: 0.74 < row["score"] < 0.78 and row["kB"] > 100, "AUC about 0.76, a few hundred kB, under a second")

# %% [markdown]
# ## 2. The whole bake-off
# Fill `rows` with `evaluate(model, data)` for every dataset in `sets` and every model in `models_for(data)`: two
# `for` loops, one inside the other, appending each result. It takes a minute or so.

# %%
rows = []
### HINT for data in sets: then, inside it, for model in models_for(data): rows.append(evaluate(model, data))
### HINT for data in sets:
### HINT     for model in models_for(data):
### HINT         rows.append(evaluate(model, data))
### BEGIN SOLUTION
for data in sets:
    for model in models_for(data):
        rows.append(evaluate(model, data))
### END SOLUTION
res = pd.DataFrame(rows)
print(len(res), "results")

# %%
check(lambda: len(res) == 3 * 8 + 7, "31 results: 8 classifiers on three datasets, 7 regressors on ridership (naive Bayes doesn't predict numbers)")

# %% [markdown]
# ## 3. The score table
# Set `table` to the scores with a row per model and a column per dataset:
# `res.pivot(index="model", columns="data", values="score")`.

# %%
table = None
### HINT DataFrame.pivot(index=..., columns=..., values=...) turns long results into a grid.
### HINT table = res.pivot(index="model", columns="data", values="score")
### BEGIN SOLUTION
table = res.pivot(index="model", columns="data", values="score")
### END SOLUTION
table.round(3) if table is not None else None

# %%
check(lambda: table.shape == (8, 4) and table.loc["logistic / linear", "elevator outages"] > 0.85,
      "8 models × 4 datasets; ridership is an error (lower is better), the rest are scores (higher is better)")

# %% [markdown]
# ## 4. Average rank
# `better` flips the ridership error so that higher is better everywhere. Set `avg_rank` to each model's average rank
# over the datasets, best first: `better.rank(ascending=False).mean(axis=1).sort_values()`.

# %%
better = table.assign(ridership=-table["ridership"]) if table is not None else None
avg_rank = None
### HINT .rank(ascending=False) gives 1 to the highest score in each column.
### HINT avg_rank = better.rank(ascending=False).mean(axis=1).sort_values()
### BEGIN SOLUTION
avg_rank = better.rank(ascending=False).mean(axis=1).sort_values()
### END SOLUTION
avg_rank

# %%
check(lambda: avg_rank.index[0] == "logistic / linear" and avg_rank["boosting"] < avg_rank["tree"],
      "the plain line has the best average rank on these four small datasets; boosting is close behind and never far off")

# %% [markdown]
# ## 5. Is first really better than second?
# On the outages, logistic regression beat boosting. `diffs` will hold the AUC difference on 1,000 bootstrap
# resamples of the test outages. Set `lo, hi` to the 2.5th and 97.5th percentiles: `np.percentile(diffs, [2.5,
# 97.5])`. If the interval includes 0, one split can't tell them apart.

# %%
Xtr, Xte, ytr, yte = sets["elevator outages"]
pa = CLASSIFIERS["logistic / linear"]().fit(Xtr, ytr).predict_proba(Xte)[:, 1]
pb = CLASSIFIERS["boosting"]().fit(Xtr, ytr).predict_proba(Xte)[:, 1]
rng = np.random.default_rng(0)
diffs = []
for _ in range(1000):
    i = rng.integers(0, len(yte), len(yte))
    diffs.append(roc_auc_score(yte[i], pa[i]) - roc_auc_score(yte[i], pb[i]))
lo = hi = None
### HINT lo, hi = np.percentile(diffs, [2.5, 97.5])
### BEGIN SOLUTION
lo, hi = np.percentile(diffs, [2.5, 97.5])
### END SOLUTION
print("logistic minus boosting, 95% interval:", lo, "to", hi)

# %%
check(lambda: lo < 0 < hi, "about −0.01 to +0.05: it includes 0, so on 321 test outages the two are not clearly different")

# %% [markdown]
# ## 6. Your pick
# For each dataset, choose the model you'd ship and say why in a few words: score, but also training time, size
# (`res.pivot(index="model", columns="data", values="kB")`) and whether someone must read the model. Set `my_pick` to a
# dict from dataset name to `(model name, reason)`. There's no single right answer; the check only makes sure each
# pick is a real model with a reason.

# %%
print(res.pivot(index="model", columns="data", values="kB").round(0) if len(res) else None)
my_pick = None
### HINT my_pick = {"bank calls": ("logistic / linear", "ties the best, 4 kB, every weight is an odds ratio"), ...} with all four datasets
### BEGIN SOLUTION
my_pick = {
    "bank calls": ("logistic / linear", "best AUC, 4 kB, and each weight reads as an odds ratio"),
    "elevator outages": ("logistic / linear", "best AUC on a small time split, and readable for the people who fix elevators"),
    "digits": ("SVM", "best accuracy; distances between images mean similarity"),
    "ridership": ("SVM", "lowest error in 2024; but I'd add a seasonal-naive baseline and watch it"),
}
### END SOLUTION
pd.DataFrame(my_pick, index=["model", "why"]).T if my_pick else None

# %%
check(lambda: set(my_pick) == set(sets) and all(m in models_for(k) and len(why) > 10 for k, (m, why) in my_pick.items()),
      "a dict with all four datasets, each a model from the zoo and a reason of a few words")
