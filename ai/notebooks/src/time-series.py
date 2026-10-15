# %% [markdown]
# # Practice: time series and forecasting
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/time-series.html
#
# Five years of daily NYC subway ridership: find its strongest repeating period, score the seasonal naive forecast,
# build lag and calendar features for a chosen horizon, beat the baseline with boosted trees, backtest walking
# forward, and check whether a prediction interval really covers what it claims. Runs on a CPU in seconds.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pandas.tseries.holiday import USFederalHolidayCalendar
from sklearn.ensemble import HistGradientBoostingRegressor

s = pd.read_csv("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/ridership.csv", parse_dates=["date"]).set_index("date")["subway"]
print(len(s), "days,", s.index.min().date(), "to", s.index.max().date())
s["2024-09":"2024-11"].plot(figsize=(9, 3), title="Subway riders per day, fall 2024"); plt.show()

# %% [markdown]
# ## 1. The strongest repeating period
# `s.autocorr(k)` is the correlation between the series and itself shifted by `k` days. On 2023 onward (`s["2023":]`),
# set `corr1` (lag 1) and `corr7` (lag 7).

# %%
corr1 = corr7 = None
### HINT corr1 = s["2023":].autocorr(1)
### HINT corr7 = s["2023":].autocorr(7)
### BEGIN SOLUTION
corr1, corr7 = s["2023":].autocorr(1), s["2023":].autocorr(7)
### END SOLUTION
print("lag 1:", corr1, "· lag 7:", corr7)

# %%
check(lambda: corr7 > 0.8 and corr1 < 0.6, "0.83 a week apart vs 0.49 a day apart: the week is the rhythm to copy")

# %% [markdown]
# ## 2. The seasonal naive forecast
# Forecast each day as the same weekday a week before: `s.shift(7)`. Set `naive_mae`: the mean absolute error over the
# test window from October 1, 2024 (`test = s["2024-10-01":]`; select the forecast's same dates with `.loc[test.index]`).

# %%
test = s["2024-10-01":]
naive_mae = None
### HINT pred = s.shift(7).loc[test.index]
### HINT naive_mae = np.mean(np.abs(pred - test))
### BEGIN SOLUTION
naive_mae = np.mean(np.abs(s.shift(7).loc[test.index] - test))
### END SOLUTION
print("seasonal naive MAE:", naive_mae)

# %%
check(lambda: abs(naive_mae - 381_582) < 2_000, "about 382,000 riders a day: 11% of an average day, and the number to beat")

# %% [markdown]
# ## 3. Features for a forecast `horizon` days ahead
# Write `features(s, horizon)`: a DataFrame with the same index and columns `lag_h`, `lag_h7`, `lag_h14` (riders
# `horizon`, `horizon + 7`, `horizon + 14` days before: `s.shift(...)`) and `mean_week` (the 7-day average ending
# `horizon` days before: `s.shift(horizon).rolling(7).mean()`). The calendar columns (weekday, month, day of year,
# holiday) are given.

# %%
HOLIDAYS = USFederalHolidayCalendar().holidays(s.index.min(), s.index.max())
def features(s, horizon=7):
    X = pd.DataFrame(index=s.index)
    X["weekday"], X["month"], X["day_of_year"] = s.index.dayofweek, s.index.month, s.index.dayofyear
    X["holiday"] = s.index.isin(HOLIDAYS).astype(int)
    ### HINT X["lag_h"] = s.shift(horizon); X["lag_h7"] = s.shift(horizon + 7); X["lag_h14"] = s.shift(horizon + 14)
    ### HINT X["mean_week"] = s.shift(horizon).rolling(7).mean(); then return X
    ### BEGIN SOLUTION
    X["lag_h"] = s.shift(horizon)
    X["lag_h7"] = s.shift(horizon + 7)
    X["lag_h14"] = s.shift(horizon + 14)
    X["mean_week"] = s.shift(horizon).rolling(7).mean()
    ### END SOLUTION
    return X

# %%
F = features(s, 7)
check(lambda: F.loc["2024-10-15", "lag_h"] == s["2024-10-08"] and np.isclose(F.loc["2024-10-15", "mean_week"], s["2024-10-02":"2024-10-08"].mean()),
      "every feature for October 15 comes from October 8 or earlier: nothing from the week being forecast")

# %% [markdown]
# ## 4. Beat the baseline
# Train `HistGradientBoostingRegressor(random_state=0)` on 2022-01-01 to 2024-09-30 (rows where every feature exists:
# `F.notna().all(axis=1)`), predict the test window, and set `model_mae`.

# %%
ok = F.notna().all(axis=1)
train_rows = ok & (F.index >= "2022-01-01") & (F.index < "2024-10-01")
test_rows = ok & (F.index >= "2024-10-01")
model_mae = None
### HINT model = HistGradientBoostingRegressor(random_state=0).fit(F[train_rows], s[train_rows])
### HINT model_mae = np.mean(np.abs(model.predict(F[test_rows]) - s[test_rows]))
### BEGIN SOLUTION
model = HistGradientBoostingRegressor(random_state=0).fit(F[train_rows], s[train_rows])
model_mae = np.mean(np.abs(model.predict(F[test_rows]) - s[test_rows]))
### END SOLUTION
print("boosted trees MAE:", model_mae, "· seasonal naive:", naive_mae)

# %%
check(lambda: model_mae < 0.9 * naive_mae, "clearly better than last week, by a margin you can state")

# %% [markdown]
# ## 5. Walk forward
# One test window is one roll of the dice. For each `(start, end)` in `MONTHS` (given), train on everything from 2022
# up to `start` and test from `start` to `end`. Set `folds`: a list of `(start, model MAE, naive MAE)`.

# %%
MONTHS = [("2024-06-01", "2024-07-01"), ("2024-07-01", "2024-08-01"), ("2024-08-01", "2024-09-01"), ("2024-09-01", "2024-10-01"),
          ("2024-10-01", "2024-11-01"), ("2024-11-01", "2024-12-01"), ("2024-12-01", "2025-01-01")]
folds = None
### HINT folds = [] then for start, end in MONTHS: tr = ok & (F.index >= "2022-01-01") & (F.index < start); te = ok & (F.index >= start) & (F.index < end)
### HINT fit a new HistGradientBoostingRegressor on tr, then folds.append((start, model MAE on te, seasonal naive MAE on te))
### BEGIN SOLUTION
folds = []
for start, end in MONTHS:
    tr = ok & (F.index >= "2022-01-01") & (F.index < start)
    te = ok & (F.index >= start) & (F.index < end)
    m = HistGradientBoostingRegressor(random_state=0).fit(F[tr], s[tr])
    folds.append((start, np.mean(np.abs(m.predict(F[te]) - s[te])), np.mean(np.abs(s.shift(7)[te] - s[te]))))
### END SOLUTION
pd.DataFrame(folds, columns=["month", "model MAE", "naive MAE"]).round(0) if folds else None

# %%
check(lambda: len(folds) == 7 and sum(m < n for _, m, n in folds) >= 6,
      "it wins every month, by a lot in June, July and December and barely in August and October: the backtest shows where the margin is real")

# %% [markdown]
# ## 6. Does the 90% interval cover 90%?
# A simple interval: the model's prediction plus the 5th and 95th percentiles of its errors on a validation window.
# Given: errors from a model trained before July 2024, measured on July–September 2024. Set `coverage`: the share of
# test days whose real value falls inside `[pred + lo, pred + hi]`.

# %%
fit_rows = ok & (F.index >= "2022-01-01") & (F.index < "2024-07-01")
val_rows = ok & (F.index >= "2024-07-01") & (F.index < "2024-10-01")
m_val = HistGradientBoostingRegressor(random_state=0).fit(F[fit_rows], s[fit_rows])
lo, hi = np.quantile(s[val_rows] - m_val.predict(F[val_rows]), [0.05, 0.95])
pred = m_val.predict(F[test_rows])
coverage = None
### HINT inside = (s[test_rows] >= pred + lo) & (s[test_rows] <= pred + hi)
### HINT coverage = inside.mean()
### BEGIN SOLUTION
inside = (s[test_rows] >= pred + lo) & (s[test_rows] <= pred + hi)
coverage = inside.mean()
### END SOLUTION
print("claimed 90%, actual:", coverage)

# %%
check(lambda: coverage < 0.8, "well under 90%: summer's errors were calmer than the holiday season's. Build intervals from comparable seasons, and check coverage")

# %% [markdown]
# ## 7. How far ahead?
# For horizons 1, 7, 28 and 56 days, rebuild the features, train and test as in section 4, and set `maes`: the four MAEs
# in that order.

# %%
maes = None
### HINT maes = [] then for h in [1, 7, 28, 56]: Fh = features(s, h); okh = Fh.notna().all(axis=1); masks as in section 4 with okh
### HINT fit on the train mask, append the MAE on the test mask
### BEGIN SOLUTION
maes = []
for h in [1, 7, 28, 56]:
    Fh = features(s, h); okh = Fh.notna().all(axis=1)
    trh = okh & (Fh.index >= "2022-01-01") & (Fh.index < "2024-10-01"); teh = okh & (Fh.index >= "2024-10-01")
    maes.append(np.mean(np.abs(HistGradientBoostingRegressor(random_state=0).fit(Fh[trh], s[trh]).predict(Fh[teh]) - s[teh])))
### END SOLUTION
print("MAE 1, 7, 28, 56 days ahead:", np.round(maes) if maes else None)

# %%
check(lambda: maes[0] < maes[1] and maes[3] > maes[0],
      "worse the further ahead overall (227k a day ahead, 312k at 56 days), though not at every step: 28 days happened to beat 7 in this one window")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Hyndman & Athanasopoulos, "Forecasting: Principles and Practice": https://otexts.com/fpp3/
