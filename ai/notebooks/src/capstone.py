# %% [markdown]
# # Capstone: predict broken elevators, live
# *AI from scratch, stage 7* · lesson: https://ihor.sh/ai/capstone.html
#
# The whole path in one project, guided: measure the censoring trap and build labels that respect it, add features
# known at the moment of prediction, beat the board's baseline on a time split, choose a threshold from riders' costs,
# export your model in the format the live board runs, and write its card. Then keep going on your own: the lesson
# page lists the milestones and the rubric. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check
# under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import json, urllib.request
import numpy as np
import pandas as pd
from sklearn.compose import make_column_transformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
df = pd.read_csv(DATA + "outages.csv", parse_dates=["start", "estimated_end", "last_seen"]).sort_values("start").reset_index(drop=True)
df["hours"] = (df["last_seen"] - df["start"]).dt.total_seconds() / 3600     # for open outages: how long so far
print(len(df), "outages:", df["finished"].sum(), "finished,", (~df["finished"]).sum(), "still open at the snapshot")

# %% [markdown]
# ## 1. The censoring trap, measured
# Set `long_finished`: the share of finished outages that lasted over 4 hours, and `long_open`: the share of still-open
# ones that have already passed 4 hours.

# %%
long_finished = long_open = None
### HINT (df.loc[df["finished"], "hours"] > 4).mean()
### HINT and for open ones: (df.loc[~df["finished"], "hours"] > 4).mean()
### BEGIN SOLUTION
long_finished = (df.loc[df["finished"], "hours"] > 4).mean()
long_open = (df.loc[~df["finished"], "hours"] > 4).mean()
### END SOLUTION
print("finished, over 4 h:", long_finished, "· open, already over 4 h:", long_open)

# %%
check(lambda: abs(long_finished - 0.267) < 0.01 and long_open > 0.5,
      "27% vs more than half: long outages are exactly the ones most likely to still be open, so dropping open ones hides them")

# %% [markdown]
# ## 2. Labels that respect censoring
# Set `df["label"]`: 1 if the outage lasted (or has already lasted) over 4 hours, 0 if it *finished* within 4 hours, and
# missing (`np.nan`) if it's still open but under 4 hours, since nobody knows yet. Then `labeled` keeps the rows with a
# label. (`np.where(cond, a, b)` as in NumPy in depth; nest two of them.)

# %%
### HINT df["label"] = np.where(df["hours"] > 4, 1, np.where(df["finished"], 0, np.nan))
### BEGIN SOLUTION
df["label"] = np.where(df["hours"] > 4, 1, np.where(df["finished"], 0, np.nan))
### END SOLUTION
def get_labeled():
    "The rows with a label; until section 2 is done, the naive version (finished outages only) so later cells still run."
    if "label" in df:
        return df.dropna(subset=["label"])
    return df[df["finished"]].assign(label=(df["hours"] > 4).astype(float))
labeled = get_labeled()
print(len(labeled), "labeled outages, long share", labeled["label"].mean())

# %%
check(lambda: len(labeled) == len(df) - ((~df["finished"]) & (df["hours"] <= 4)).sum() and labeled["label"].mean() > long_finished,
      "open outages already past 4 hours are labeled 1 instead of thrown away: the long share goes up, closer to the truth")

# %% [markdown]
# ## 3. Features known at the start
# `n_lines` and `hour` (the start hour) are given. Add two more columns known the moment an outage begins: `weekday`
# (0 = Monday, `.dt.dayofweek`) and `station_before`: how many earlier outages the same station had in the archive,
# counted from the past only: `df.groupby("station").cumcount()` numbers each station's rows 0, 1, 2… in time order.

# %%
df["n_lines"] = df["lines"].str.count("/") + 1
df["hour"] = df["start"].dt.hour
### HINT df["weekday"] = df["start"].dt.dayofweek
### HINT df["station_before"] = df.groupby("station").cumcount()
### BEGIN SOLUTION
df["weekday"] = df["start"].dt.dayofweek
df["station_before"] = df.groupby("station").cumcount()
### END SOLUTION
labeled = get_labeled()
df[["station", "start", "hour", "weekday", "station_before"]].tail() if "station_before" in df else None

# %%
first = df.groupby("station").head(1)
check(lambda: (first["station_before"] == 0).all() and df["station_before"].max() == df["station"].value_counts().max() - 1,
      "0 for each station's first outage, counting up from there: only the past is used, so no leakage")

# %% [markdown]
# ## 4. Beat the baseline on a time split
# Train on outages starting before October 12, test on the rest. The baseline (the live board's model) uses
# `BASE = ["kind", "reason", "ada", "hour", "n_lines"]`. Fit your challenger on `MINE = BASE + ["weekday", "station_before"]`
# with boosted trees (`HistGradientBoostingClassifier`, toolkit 2 and chapter 13), and set `auc_base` and `auc_mine`.

# %%
BASE = ["kind", "reason", "ada", "hour", "n_lines"]
MINE = BASE + ["weekday", "station_before"]
train, test = labeled[labeled["start"] < "2026-10-12"], labeled[labeled["start"] >= "2026-10-12"]
onehot = lambda: OneHotEncoder(handle_unknown="ignore")
baseline = make_pipeline(make_column_transformer((onehot(), ["kind", "reason"]), (StandardScaler(), ["ada", "hour", "n_lines"])),
                         LogisticRegression(max_iter=2000)).fit(train[BASE], train["label"])
auc_base = roc_auc_score(test["label"], baseline.predict_proba(test[BASE])[:, 1])
mine = auc_mine = None
### HINT mine = make_pipeline(make_column_transformer((onehot(), ["kind", "reason"]), ("passthrough", ["ada", "hour", "n_lines", "weekday", "station_before"])), HistGradientBoostingClassifier(random_state=0))
### HINT mine.fit(train[MINE], train["label"]); auc_mine = roc_auc_score(test["label"], mine.predict_proba(test[MINE])[:, 1])
### BEGIN SOLUTION
mine = make_pipeline(make_column_transformer((onehot(), ["kind", "reason"]), ("passthrough", ["ada", "hour", "n_lines", "weekday", "station_before"])),
                     HistGradientBoostingClassifier(random_state=0))
mine.fit(train[MINE], train["label"])
auc_mine = roc_auc_score(test["label"], mine.predict_proba(test[MINE])[:, 1])
### END SOLUTION
print("baseline AUC", round(auc_base, 3), "· yours", auc_mine)

# %%
check(lambda: 0.7 < auc_mine <= 1, "a real AUC on later days. Beating the baseline isn't required here: whether you did, and by how much, is your write-up's first finding")

# %% [markdown]
# ## 5. A threshold from riders' costs
# Telling a rider "short" when the outage turns out long sends them to a dead elevator: say that costs 30 minutes.
# Telling them "long" when it's short makes them reroute for nothing: 5 minutes. Over thresholds 0.05, 0.10, … 0.95, set
# `best_t`: the one with the lowest total cost on the test outages for the baseline's probabilities `p_test`.

# %%
p_test, y_test = baseline.predict_proba(test[BASE])[:, 1], test["label"].to_numpy()
def cost(t, miss=30, false_alarm=5):
    say_long = p_test >= t
    return miss * np.sum(~say_long & (y_test == 1)) + false_alarm * np.sum(say_long & (y_test == 0))
best_t = None
### HINT thresholds = np.arange(0.05, 1.0, 0.05); best_t = thresholds[np.argmin([cost(t) for t in thresholds])]
### BEGIN SOLUTION
thresholds = np.arange(0.05, 1.0, 0.05)
best_t = thresholds[np.argmin([cost(t) for t in thresholds])]
### END SOLUTION
print("best threshold", best_t, "· cost there", cost(best_t) if best_t is not None else None, "minutes · at 0.5:", cost(0.5))

# %%
check(lambda: best_t < 0.5 and cost(best_t) <= cost(0.5), "well below 0.5: when missing a long outage costs 6× a false alarm, say 'long' early (chapter 12)")

# %% [markdown]
# ## 6. Export the baseline the way the live board runs it
# The board computes `p = sigmoid(intercept + one-hot weights + Σ weight × (x − mean) / scale)`. Write `export()`
# returning that dict from the fitted `baseline`, then check your formula against `predict_proba`. The pieces are given:
# the one-hot categories, the scaler's means and scales, and the logistic regression's coefficients.

# %%
ct, lr = baseline[0], baseline[-1]
cats = ct.named_transformers_["onehotencoder"].categories_
sc = ct.named_transformers_["standardscaler"]
coef = lr.coef_[0]
def export():
    n_kind = len(cats[0])
    ### HINT onehot = {"kind": dict(zip(cats[0], coef[:n_kind])), "reason": dict(zip(cats[1], coef[n_kind:n_kind + len(cats[1])]))}
    ### HINT numeric = {n: {"mean": m, "scale": s, "weight": w} for n, m, s, w in zip(["ada", "hour", "n_lines"], sc.mean_, sc.scale_, coef[-3:])}; return {"intercept": lr.intercept_[0], "onehot": onehot, "numeric": numeric}
    ### BEGIN SOLUTION
    onehot = {"kind": dict(zip(cats[0], coef[:n_kind])), "reason": dict(zip(cats[1], coef[n_kind:n_kind + len(cats[1])]))}
    numeric = {n: {"mean": m, "scale": s, "weight": w} for n, m, s, w in zip(["ada", "hour", "n_lines"], sc.mean_, sc.scale_, coef[-3:])}
    return {"intercept": lr.intercept_[0], "onehot": onehot, "numeric": numeric}
    ### END SOLUTION

def board_predict(m, row):
    z = m["intercept"] + m["onehot"]["kind"].get(row["kind"], 0) + m["onehot"]["reason"].get(row["reason"], 0)
    z += sum(v["weight"] * (row[n] - v["mean"]) / v["scale"] for n, v in m["numeric"].items())
    return 1 / (1 + np.exp(-z))

# %%
exported = export()
check(lambda: np.allclose([board_predict(exported, r) for _, r in test.head(20).iterrows()], baseline.predict_proba(test[BASE].head(20))[:, 1]),
      "the exported numbers give exactly sklearn's probabilities: json.dumps it and the board (or any app) can run your model")

# %% [markdown]
# ## 7. Your model card
# Fill `card` with `"intended_use"`, `"data"`, `"evaluation"`, `"threshold"` and `"limitations"`: a sentence each, using
# your numbers (AUCs, the threshold and its costs, the censoring decision).

# %%
card = None
### HINT A dict of five short strings; f-strings can put auc_base, auc_mine and best_t in.
### BEGIN SOLUTION
card = {"intended_use": "Tell riders whether an elevator or escalator outage is likely to last more than 4 hours from its start.",
        "data": f"{len(train)} labeled outages before 2026-10-12; open outages already past 4 h labeled long, open ones under 4 h left out.",
        "evaluation": f"Time split: baseline AUC {auc_base:.2f}, boosted trees with weekday and station history {auc_mine:.2f}, on {len(test)} later outages.",
        "threshold": f"{best_t:.2f}, minimizing 30 min per missed long outage and 5 min per needless reroute.",
        "limitations": "About one week of data; reasons never seen in training get no weight; probabilities shown to riders should be worded cautiously."}
### END SOLUTION
for k, v in (card or {}).items():
    print(f"{k}: {v}")

# %%
check(lambda: set(card) == {"intended_use", "data", "evaluation", "threshold", "limitations"} and all(len(v) > 20 for v in card.values()),
      "five plain sentences: now publish the service and start monitoring (milestones 5 and 6 on the lesson page)")

# %% [markdown]
# ## Next
# The rest is yours: milestones 5–7 on https://ihor.sh/ai/capstone.html (a service, a week of monitoring, the write-up).
