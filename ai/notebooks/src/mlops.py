# %% [markdown]
# # Practice: MLOps
# *AI from scratch, stage 7* · lesson: https://ihor.sh/ai/mlops.html
#
# The operations side of the outage model: a drift score (PSI) between windows, a data validator that stops a broken
# batch, a champion-versus-challenger comparison on the newest days with a promotion gate, a daily prediction monitor,
# and a model card. Runs on a CPU in seconds. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check
# under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import numpy as np
import pandas as pd
from sklearn.compose import make_column_transformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

df = pd.read_csv("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/outages.csv", parse_dates=["start", "last_seen"])
f = df[df["finished"]].copy()
f["hours"] = (f["last_seen"] - f["start"]).dt.total_seconds() / 3600
f["hour"] = f["start"].dt.hour; f["n_lines"] = f["lines"].str.count("/") + 1
FEATURES = ["kind", "reason", "ada", "hour", "n_lines"]
print(len(f), "finished outages,", f["start"].min().date(), "to", f["start"].max().date())

# %% [markdown]
# ## 1. The population stability index
# `psi(ref, live, cats)` starts by computing each category's share in `ref` (`p`) and in `live` (`q`), plus a small
# floor so no share is 0. Finish it: renormalize both to add up to 1, and return `sum((q - p) * ln(q / p))`.

# %%
def psi(ref, live, cats, floor=1e-3):
    p = np.array([(ref == c).mean() for c in cats]) + floor
    q = np.array([(live == c).mean() for c in cats]) + floor
    ### HINT p, q = p / p.sum(), q / q.sum()
    ### HINT return float(np.sum((q - p) * np.log(q / p)))
    ### BEGIN SOLUTION
    p, q = p / p.sum(), q / q.sum()
    return float(np.sum((q - p) * np.log(q / p)))
    ### END SOLUTION

# %%
s = pd.Series(["a", "b", "a", "b"])
check(lambda: abs(psi(s, s, ["a", "b"])) < 1e-12 and psi(s, pd.Series(["a"] * 4), ["a", "b"]) > 1,
      "0 for identical windows, large when a category vanishes")

# %% [markdown]
# ## 2. Weekdays against weekends
# Set `weekday` and `weekend` to the outages starting Monday–Friday and Saturday–Sunday (`f["start"].dt.dayofweek` is
# 0 for Monday … 6 for Sunday), then `reason_psi`: the PSI of `"reason"` between them over all reasons.

# %%
cats = sorted(f["reason"].unique())
weekday = weekend = reason_psi = None
### HINT weekday = f[f["start"].dt.dayofweek < 5]; weekend = f[f["start"].dt.dayofweek >= 5]
### HINT reason_psi = psi(weekday["reason"], weekend["reason"], cats)
### BEGIN SOLUTION
weekday = f[f["start"].dt.dayofweek < 5]
weekend = f[f["start"].dt.dayofweek >= 5]
reason_psi = psi(weekday["reason"], weekend["reason"], cats)
### END SOLUTION
print("reason PSI, weekdays vs weekend:", reason_psi)

# %%
check(lambda: abs(reason_psi - 0.324) < 0.01, "about 0.32, over the 0.25 'real shift' line: and it's just the city's weekly rhythm")

# %% [markdown]
# ## 3. Stop a broken batch before it trains anything
# `validate(batch)` returns a list of problems (strings), empty when the batch is fine. The column check and the
# hour check are written. Add two more in the same style: `kind` must be only `"EL"` or `"ES"` (`batch["kind"].isin([...])`
# is True where a value is in the list), and no feature may be missing (`batch[FEATURES].isna()` is True where a value is
# missing; `.any().any()` asks "anywhere?"). The broken batch below (given) has three problems.

# %%
def validate(batch):
    problems = []
    missing = [c for c in FEATURES if c not in batch]
    if missing:
        return [f"missing columns: {missing}"]
    if not batch["hour"].between(0, 23).all():
        problems.append("hour out of range")
    ### HINT if not batch["kind"].isin(["EL", "ES"]).all(): problems.append("unknown kind")
    ### HINT if batch[FEATURES].isna().any().any(): problems.append("missing values")
    ### BEGIN SOLUTION
    if not batch["kind"].isin(["EL", "ES"]).all():
        problems.append("unknown kind")
    if batch[FEATURES].isna().any().any():
        problems.append("missing values")
    ### END SOLUTION
    return problems

broken = f[FEATURES].head(50).copy()
broken.loc[broken.index[:5], "hour"] = broken["hour"].head(5) * 60          # someone sent minutes instead of hours
broken.loc[broken.index[7], "kind"] = "Elevator"
broken.loc[broken.index[9], "reason"] = None
print("clean batch:", validate(f[FEATURES]), "· broken batch:", validate(broken))

# %%
check(lambda: validate(f[FEATURES]) == [] and len(validate(broken)) == 3 and validate(broken.drop(columns="hour")) != [],
      "nothing wrong with the real data; all three problems found in the broken batch; a missing column is caught first")

# %% [markdown]
# ## 4. Champion against challenger, on the newest days
# Both are trained on outages before October 12 and scored on the ones from then on (the time split of toolkit 2). The
# champion is the logistic regression; the challenger, boosted trees. Set `auc_champ` and `auc_chall`, then `promote`:
# `True` only if the challenger beats the champion by more than 0.01 (smaller gaps are noise at this size).

# %%
early, late = f[f["start"] < "2026-10-12"], f[f["start"] >= "2026-10-12"]
prep = lambda: make_column_transformer((OneHotEncoder(handle_unknown="ignore"), ["kind", "reason"]), (StandardScaler(), ["ada", "hour", "n_lines"]))
champion = make_pipeline(prep(), LogisticRegression(max_iter=2000)).fit(early[FEATURES], early["hours"] > 4)
challenger = make_pipeline(prep(), HistGradientBoostingClassifier(random_state=0)).fit(early[FEATURES], early["hours"] > 4)
auc_champ = auc_chall = promote = None
### HINT auc_champ = roc_auc_score(late["hours"] > 4, champion.predict_proba(late[FEATURES])[:, 1]); the same for challenger
### HINT promote = auc_chall > auc_champ + 0.01
### BEGIN SOLUTION
auc_champ = roc_auc_score(late["hours"] > 4, champion.predict_proba(late[FEATURES])[:, 1])
auc_chall = roc_auc_score(late["hours"] > 4, challenger.predict_proba(late[FEATURES])[:, 1])
promote = auc_chall > auc_champ + 0.01
### END SOLUTION
print("champion AUC", auc_champ, "· challenger AUC", auc_chall, "· promote:", promote)

# %%
check(lambda: 0.85 < auc_champ < 0.95 and promote == (auc_chall > auc_champ + 0.01),
      "the champion holds about 0.90 on the newest days; promotion follows the rule, not a hunch")

# %% [markdown]
# ## 5. Watch the outputs every day
# Labels arrive late, predictions don't. Set `daily`: the champion's mean predicted probability of a long outage for
# each start date of the late window (add a column of predictions, then group by `late["start"].dt.date`).

# %%
daily = None
### HINT probs = champion.predict_proba(late[FEATURES])[:, 1]
### HINT daily = pd.Series(probs, index=late.index).groupby(late["start"].dt.date).mean()
### BEGIN SOLUTION
probs = champion.predict_proba(late[FEATURES])[:, 1]
daily = pd.Series(probs, index=late.index).groupby(late["start"].dt.date).mean()
### END SOLUTION
print(daily.round(3) if daily is not None else None)

# %%
check(lambda: len(daily) >= 3 and daily.between(0, 1).all(), "one average per day: a jump here would be the earliest warning, before any outage has even ended")

# %% [markdown]
# ## 6. A model card
# Fill `card`, a dict with the keys `"intended_use"`, `"training_data"`, `"evaluation"` and `"limitations"`, each a short
# sentence of your own. The evaluation should mention the champion's AUC on the newest days.

# %%
card = None
### HINT card = {"intended_use": "...", "training_data": "...", "evaluation": f"AUC {auc_champ:.2f} on ...", "limitations": "..."}
### BEGIN SOLUTION
card = {"intended_use": "Warn riders when an elevator or escalator outage is likely to last more than 4 hours.",
        "training_data": f"{len(early)} finished NYC subway outages from the ihor.sh MTA archive, before 2026-10-12.",
        "evaluation": f"AUC {auc_champ:.2f} on {len(late)} outages from 2026-10-12 on (time split).",
        "limitations": "One week of data: seasons, holidays and new kinds of outage are unseen; weekend reasons differ from weekdays."}
### END SOLUTION
for k, v in (card or {}).items():
    print(f"{k}: {v}")

# %%
check(lambda: set(card) == {"intended_use", "training_data", "evaluation", "limitations"} and all(len(v) > 20 for v in card.values()) and "AUC" in card["evaluation"],
      "four short answers a future maintainer will be glad to find")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Google, "Rules of Machine Learning": https://developers.google.com/machine-learning/guides/rules-of-ml
