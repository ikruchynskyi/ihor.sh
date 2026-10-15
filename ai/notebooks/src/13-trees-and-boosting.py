# %% [markdown]
# # Practice: trees, forests and boosting on house prices
# *AI from scratch, chapter 13* · lesson: https://ihor.sh/ai/13-trees-and-boosting.html
#
# The models that win most tabular problems at work, on 20,640 California districts (median house value from
# income, age, rooms, location…): a linear baseline, a decision tree and its depth, a random forest, gradient
# boosting with early stopping, and what the model looks at.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# On Kaggle, turn on *Internet* in the notebook settings for the download.

# %%
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

data = fetch_california_housing(as_frame=True)
X, y = data.data, data.target                       # target: median house value in $100,000s
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=0)
mae = lambda m: mean_absolute_error(yte, m.predict(Xte))
X.head()

# %% [markdown]
# ## 1. A baseline first
# Always start with something simple to beat:
# - Set `mae_mean`: the error of predicting the training mean (`ytr.mean()`) for everyone using `mean_absolute_error`.
# - Set `mae_linear`: the error of `LinearRegression` evaluated with `mae(...)`.
# (Errors in $100k: 0.5 means $50,000 off on average.)

# %%
mae_mean = mae_linear = None
### HINT Compute MAE of predicting the training mean ytr.mean() for all test examples: np.full(len(yte), ytr.mean()).
### HINT Fit LinearRegression().fit(Xtr, ytr) and compute its test error with mae(linear_model).
### HINT mae_mean = mean_absolute_error(yte, np.full(len(yte), ytr.mean()))
### HINT mae_linear = mae(LinearRegression().fit(Xtr, ytr))
### BEGIN SOLUTION
mae_mean = mean_absolute_error(yte, np.full(len(yte), ytr.mean()))
mae_linear = mae(LinearRegression().fit(Xtr, ytr))
### END SOLUTION
print("Baseline (mean):", mae_mean, "Linear regression:", mae_linear)

# %%
check(lambda: mae_linear is not None and mae_mean is not None and mae_linear < mae_mean * 0.65, 
      "a straight line should beat guessing the average by at least 35% in mean absolute error")

# %% [markdown]
# ## 2. A tree's depth is its complexity knob
# For depths 2, 4, 6, 8, 12, 16, 24, fit `DecisionTreeRegressor(max_depth=d, random_state=0)` and record train and
# test MAE. Set `best_depth` (lowest test error). Deep trees memorize: train error → 0, test error rises.

# %%
depths = [2, 4, 6, 8, 12, 16, 24]
tree_train = tree_test = best_depth = None
### HINT Initialize tree_train = [] and tree_test = [].
### HINT For each dpt in depths, fit DecisionTreeRegressor(max_depth=dpt, random_state=0) on (Xtr, ytr).
### HINT Record train error using mean_absolute_error(ytr, t.predict(Xtr)) and test error using mae(t).
### HINT Find best_depth = depths[int(np.argmin(tree_test))].
### HINT Loop over dpt in depths and fit t = DecisionTreeRegressor(max_depth=dpt, random_state=0).fit(Xtr, ytr).
### HINT tree_train.append(mean_absolute_error(ytr, t.predict(Xtr))) and tree_test.append(mae(t)).
### HINT best_depth = depths[int(np.argmin(tree_test))].
### BEGIN SOLUTION
tree_train, tree_test = [], []
for dpt in depths:
    t = DecisionTreeRegressor(max_depth=dpt, random_state=0).fit(Xtr, ytr)
    tree_train.append(mean_absolute_error(ytr, t.predict(Xtr))); tree_test.append(mae(t))
best_depth = depths[int(np.argmin(tree_test))]
plt.plot(depths, tree_train, "o-", label="train"); plt.plot(depths, tree_test, "o-", label="test"); plt.legend(); plt.xlabel("max_depth"); plt.show()
### END SOLUTION
print("best depth:", best_depth)

# %%
check(lambda: tree_train is not None and tree_train[-1] < 0.05 and best_depth is not None and 6 <= best_depth <= 12, 
      "a 24-deep tree memorizes (train MAE under 0.05), and the best test depth should be in the sweet spot, 6 to 12")

# %% [markdown]
# ## 3. A forest of trees
# A random forest averages many deep trees, each grown on a bootstrap sample with random feature subsets: their
# mistakes partly cancel. Fit `RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=0)`; set `mae_forest`.

# %%
mae_forest = None
### HINT Fit RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=0) on (Xtr, ytr).
### HINT Compute test MAE using mae(forest).
### HINT forest = RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=0).fit(Xtr, ytr)
### HINT mae_forest = mae(forest)
### BEGIN SOLUTION
forest = RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=0).fit(Xtr, ytr)
mae_forest = mae(forest)
### END SOLUTION
print("Random forest MAE:", mae_forest)

# %%
check(lambda: mae_forest is not None and tree_test is not None and mae_forest < min(tree_test) * 0.85, 
      "the random forest should beat the best single tree by at least 15%")

# %% [markdown]
# ## 4. Gradient boosting with early stopping
# `HistGradientBoostingRegressor` is scikit-learn's fast boosting (the same family as XGBoost and LightGBM). Give it
# up to 1000 trees, `learning_rate=0.1` and `early_stopping=True`: it holds out 10% of the training data and stops
# when that stops improving. Set `mae_boost` and `n_trees` (`.n_iter_`).

# %%
mae_boost = n_trees = None
### HINT Fit HistGradientBoostingRegressor(max_iter=1000, learning_rate=0.1, early_stopping=True, random_state=0) on (Xtr, ytr).
### HINT Compute test MAE: mae_boost = mae(boost).
### HINT Record the number of trees grown before early stopping: n_trees = boost.n_iter_.
### HINT boost = HistGradientBoostingRegressor(max_iter=1000, learning_rate=0.1, early_stopping=True, random_state=0).fit(Xtr, ytr)
### HINT mae_boost, n_trees = mae(boost), boost.n_iter_
### BEGIN SOLUTION
boost = HistGradientBoostingRegressor(max_iter=1000, learning_rate=0.1, early_stopping=True, random_state=0).fit(Xtr, ytr)
mae_boost, n_trees = mae(boost), boost.n_iter_
### END SOLUTION
print("Boosting MAE:", mae_boost, "after", n_trees, "trees")

# %%
check(lambda: mae_boost is not None and mae_linear is not None and mae_boost < mae_linear * 0.65 and n_trees is not None and n_trees < 1000, 
      "boosting should beat the straight line by over 35% and stop early (fewer than 1,000 trees)")

# %% [markdown]
# ## 5. What does the model look at?
# **Permutation importance**: shuffle one column of the test set and see how much the error grows. Set
# `importance`: a dict `{feature: mean increase in error}` using `permutation_importance(boost, Xte, yte, scoring="neg_mean_absolute_error", n_repeats=3, random_state=0)`.
# Read each feature's mean error increase from `importances_mean` and visualize with `plt.barh`.

# %%
from sklearn.inspection import permutation_importance
importance = None
### HINT Run permutation_importance(boost, Xte, yte, scoring="neg_mean_absolute_error", n_repeats=3, random_state=0).
### HINT Extract r.importances_mean and pair with column names X.columns.
### HINT Sort descending by importance and store as a dict {feature: mean_error_increase}.
### HINT r = permutation_importance(boost, Xte, yte, scoring="neg_mean_absolute_error", n_repeats=3, random_state=0)
### HINT Pair feature names and importances with zip(X.columns, r.importances_mean) and sort descending.
### HINT importance = dict(sorted(zip(X.columns, r.importances_mean), key=lambda kv: -kv[1]))
### BEGIN SOLUTION
r = permutation_importance(boost, Xte, yte, scoring="neg_mean_absolute_error", n_repeats=3, random_state=0)
importance = dict(sorted(zip(X.columns, r.importances_mean), key=lambda kv: -kv[1]))
### END SOLUTION
if importance:
    plt.barh(list(importance)[::-1], list(importance.values())[::-1])
    plt.xlabel("error increase when shuffled")
    plt.show()
print(importance)

# %%
check(lambda: importance is not None and list(importance)[0] in ("MedInc", "Latitude", "Longitude"), 
      f"The most important feature ({list(importance)[0] if importance else None}) should be MedInc, Latitude, or Longitude.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Stage 3 milestone: take these tools to a real Kaggle competition.
