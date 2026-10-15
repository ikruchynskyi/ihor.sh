# %% [markdown]
# # Practice: pandas and scikit-learn
# *AI from scratch, toolkit 2* · lesson: https://ihor.sh/ai/pandas-and-sklearn.html
#
# Five weeks of NYC subway elevator and escalator outages: load, look, filter, group, merge, then a pipeline that
# predicts which outages will last more than 4 hours, scored with a time split and tuned with a grid search.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import numpy as np
import pandas as pd

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
df = pd.read_csv(DATA + "outages.csv", parse_dates=["start", "estimated_end", "last_seen"])
print(df.shape)
df.info()
df.head()

# %% [markdown]
# ## 1. Count something
# `kind` is `"EL"` for elevators and `"ES"` for escalators. Set `n_el` to the number of elevator outages: a
# comparison gives a True/False column, and `.sum()` counts the Trues.

# %%
n_el = None
### HINT (df["kind"] == "EL") is a column of True/False.
### HINT n_el = (df["kind"] == "EL").sum()
### BEGIN SOLUTION
n_el = (df["kind"] == "EL").sum()
### END SOLUTION
print(n_el)

# %%
check(lambda: n_el == df["kind"].value_counts()["EL"], "the number of rows with kind == 'EL' (value_counts agrees)")

# %% [markdown]
# ## 2. How long each outage lasted
# The finished outages, with their length in hours (given), then your filter: set `long_ada` to the elevator
# outages (`kind == "EL"`) at accessible stations (`ada == 1`) that lasted more than 4 hours. Each condition in
# brackets, joined with `&`.

# %%
f = df[df["finished"]].copy()
f["hours"] = (f["last_seen"] - f["start"]).dt.total_seconds() / 3600
long_ada = None
### HINT Three conditions: (f["kind"] == "EL"), (f["ada"] == 1), (f["hours"] > 4).
### HINT long_ada = f[(f["kind"] == "EL") & (f["ada"] == 1) & (f["hours"] > 4)]
### BEGIN SOLUTION
long_ada = f[(f["kind"] == "EL") & (f["ada"] == 1) & (f["hours"] > 4)]
### END SOLUTION
print(len(long_ada) if long_ada is not None else None, "long elevator outages at accessible stations")

# %%
check(lambda: len(long_ada) == ((f["kind"] == "EL") & (f["ada"] == 1) & (f["hours"] > 4)).sum() and long_ada["hours"].min() > 4,
      "rows where all three hold: (cond) & (cond) & (cond)")

# %% [markdown]
# ## 3. A column from a date
# Add a column `weekday` to `f` with the day's name of each outage's start. Dates have a `.dt` part, like text has
# `.str`; the name of the day is `f["start"].dt.day_name()`. Then `busiest_day` is the most common one
# (`.value_counts().idxmax()` gives the most frequent value).

# %%
busiest_day = None
### HINT f["weekday"] = f["start"].dt.day_name()
### HINT busiest_day = f["weekday"].value_counts().idxmax()
### BEGIN SOLUTION
f["weekday"] = f["start"].dt.day_name()
busiest_day = f["weekday"].value_counts().idxmax()
### END SOLUTION
print(busiest_day)

# %%
check(lambda: "weekday" in f and busiest_day == f["start"].dt.day_name().value_counts().idxmax(),
      "f['weekday'] holds day names; the most common one is the busiest day")

# %% [markdown]
# ## 4. Group and summarize
# Set `med` to the median hours per reason: group by `"reason"`, take the `"hours"` column, then `.median()`.
# **Before you run it, predict:** will "Cleaning" or "Maintenance" have the longer median?

# %%
med = None
### HINT f.groupby("reason")["hours"] then a summary.
### HINT med = f.groupby("reason")["hours"].median()
### BEGIN SOLUTION
med = f.groupby("reason")["hours"].median()
### END SOLUTION
print(med.sort_values().round(2) if med is not None else None)

# %%
check(lambda: np.isclose(med["Cleaning"], f.loc[f["reason"] == "Cleaning", "hours"].median()) and med["Maintenance"] > med["Cleaning"],
      "one median per reason; cleaning is quick (under an hour), maintenance takes hours")

# %% [markdown]
# ## 5. Several summaries per station
# Set `by_station` to a table with one row per station and two columns: `outages` (how many) and `median_hours`.
# Use `.agg` with names you choose, as in the lesson: `agg(outages=("hours", "size"), median_hours=("hours", "median"))`.
# Then sort it by `outages`, most first.

# %%
by_station = None
### HINT Group by "station", then .agg(...) with the two named summaries.
### HINT Finish with .sort_values("outages", ascending=False)
### BEGIN SOLUTION
by_station = f.groupby("station").agg(outages=("hours", "size"), median_hours=("hours", "median")).sort_values("outages", ascending=False)
### END SOLUTION
by_station.head() if by_station is not None else None

# %%
check(lambda: list(by_station.columns) == ["outages", "median_hours"] and by_station["outages"].iloc[0] == f["station"].value_counts().iloc[0]
      and by_station["outages"].sum() == len(f),
      "columns outages and median_hours, sorted with the busiest station first; the counts add up to every finished outage")

# %% [markdown]
# ## 6. Find the bug: a merge that multiplies
# Someone made a table of station boroughs, then merged it onto the outages. Run it: the row count goes *up*.
# Find why, then set `fixed` to the merge done right, with the same number of rows as `f`.

# %%
boro = pd.DataFrame({"station": ["34 St-Herald Sq", "34 St-Herald Sq", "72 St", "Grand Central-42 St"],
                     "borough": ["Manhattan", "Manhattan", "Manhattan", "Manhattan"]})
merged = f.merge(boro, on="station", how="left")
print("rows before:", len(f), " after:", len(merged))
fixed = None
### HINT print(boro): one station is listed twice, so its outages each match two rows.
### HINT Remove the repeat first: boro.drop_duplicates(), then merge with validate="many_to_one" to make pandas check.
### BEGIN SOLUTION
fixed = f.merge(boro.drop_duplicates(), on="station", how="left", validate="many_to_one")
### END SOLUTION

# %%
check(lambda: len(fixed) == len(f) and "borough" in fixed, "as many rows as f: each outage matches at most one borough row")

# %% [markdown]
# ## 7. A pipeline, scored on the future
# Predict whether an outage lasts more than 4 hours. The features and the preprocessing are given. Set `auc` to the
# mean AUC of `model` under `cross_val_score` with `cv=TimeSeriesSplit(n_splits=5)` and `scoring="roc_auc"`.

# %%
from sklearn.compose import make_column_transformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, TimeSeriesSplit, GridSearchCV

g = f.sort_values("start").copy()
g["hour"] = g["start"].dt.hour
g["n_lines"] = g["lines"].str.count("/") + 1
X = g[["kind", "reason", "ada", "hour", "n_lines"]]
y = (g["hours"] > 4).astype(int)
prep = make_column_transformer((OneHotEncoder(handle_unknown="ignore"), ["kind", "reason"]), (StandardScaler(), ["ada", "hour", "n_lines"]))
model = make_pipeline(prep, LogisticRegression(max_iter=2000))
print("base rate of long outages:", y.mean().round(3))
auc = None
### HINT Use cross_val_score with TimeSeriesSplit(n_splits=5) and scoring="roc_auc" to evaluate honest time splits.
### HINT scores = cross_val_score(model, X, y, cv=TimeSeriesSplit(n_splits=5), scoring="roc_auc"), then their mean.
### BEGIN SOLUTION
auc = cross_val_score(model, X, y, cv=TimeSeriesSplit(n_splits=5), scoring="roc_auc").mean()
### END SOLUTION
print("time-split AUC:", auc)

# %%
check(lambda: 0.8 < auc < 0.97, "about 0.9: the reason for an outage says a lot about how long it lasts")

# %% [markdown]
# ## 8. Tune it
# Search the penalty strength `C` over `[0.01, 0.1, 1, 10, 100]` with `GridSearchCV`, the same time split and
# scoring. In a pipeline, the setting is named `"logisticregression__C"` (step name, two underscores, setting).
# Set `best_C` to the winner (`grid.best_params_["logisticregression__C"]`).

# %%
best_C = None
### HINT grid = GridSearchCV(model, {"logisticregression__C": [0.01, 0.1, 1, 10, 100]}, cv=TimeSeriesSplit(n_splits=5), scoring="roc_auc")
### HINT grid.fit(X, y), then best_C = grid.best_params_["logisticregression__C"]
### BEGIN SOLUTION
grid = GridSearchCV(model, {"logisticregression__C": [0.01, 0.1, 1, 10, 100]}, cv=TimeSeriesSplit(n_splits=5), scoring="roc_auc")
grid.fit(X, y)
best_C = grid.best_params_["logisticregression__C"]
### END SOLUTION
print("best C:", best_C)

# %%
check(lambda: best_C in [0.01, 0.1, 1, 10, 100] and best_C == GridSearchCV(model, {"logisticregression__C": [0.01, 0.1, 1, 10, 100]},
      cv=TimeSeriesSplit(n_splits=5), scoring="roc_auc").fit(X, y).best_params_["logisticregression__C"],
      "the C with the best mean time-split AUC")

# %% [markdown]
# The grid's best score is a little optimistic: it was used to choose. Keep the newest outages untouched as a
# final test when the archive grows.
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · Kaggle Learn's Pandas course: https://www.kaggle.com/learn/pandas
