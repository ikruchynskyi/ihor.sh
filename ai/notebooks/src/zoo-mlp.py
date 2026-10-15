# %% [markdown]
# # Practice: multilayer perceptrons on tables
# *AI from scratch, model zoo 9* · lesson: https://ihor.sh/ai/zoo-mlp.html
#
# A hidden layer by hand, then a network on the bank calls judged as a table model: how much the seed moves it, what
# unscaled columns and useless columns cost, averaging seeds, and a ridership network that fails until its target is
# scaled. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and
# `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Bank marketing: Moro, Cortez and Rita (2014), UCI, CC BY 4.0. Ridership: MTA, data.ny.gov.

# %%
import warnings
warnings.filterwarnings("ignore", category=UserWarning)
import numpy as np
import pandas as pd
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, mean_absolute_error

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
b = pd.read_csv(DATA + "bank.csv")
y = (b["y"] == "yes").astype(int).values
X = pd.get_dummies(b.drop(columns=["y", "duration"]), dtype=float)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
sc = StandardScaler().fit(Xtr)
Str, Ste = sc.transform(Xtr), sc.transform(Xte)                  # scaled copies
net = lambda seed: MLPClassifier(hidden_layer_sizes=(64,), early_stopping=True, max_iter=500, random_state=seed)
auc = lambda model, X_: roc_auc_score(yte, model.predict_proba(X_)[:, 1])
print(X.shape[1], "columns,", len(Xtr), "training calls")

# %% [markdown]
# ## 1. A hidden layer by hand
# Two points, two columns, three hidden units. Set `h` to the hidden layer's output \(\tanh(xW_1 + b_1)\) for both
# points at once: `np.tanh(x @ W1 + b1)`.

# %%
x = np.array([[0.5, -1.0], [2.0, 0.0]])
W1 = np.array([[1.0, 0.0, -1.0], [0.0, 1.0, 1.0]])
b1 = np.array([0.0, 0.5, 0.0])
h = None
### HINT x @ W1 is (2 points, 3 units); add b1 to every row, then np.tanh.
### HINT h = np.tanh(x @ W1 + b1)
### BEGIN SOLUTION
h = np.tanh(x @ W1 + b1)
### END SOLUTION
print(h)

# %%
check(lambda: h.shape == (2, 3) and np.allclose(h[0], np.tanh([0.5, -0.5, -1.5])),
      "one row per point, one column per unit; the first point's units see 0.5, −0.5 and −1.5 before tanh")

# %% [markdown]
# ## 2. The seed lottery
# Set `aucs` to the test AUC of `net(s)` (fitted on the scaled `Str`) for seeds 0 to 4, and `spread` to the biggest
# minus the smallest.

# %%
aucs = spread = None
### HINT aucs = [auc(net(s).fit(Str, ytr), Ste) for s in range(5)]
### HINT spread = max(aucs) - min(aucs)
### BEGIN SOLUTION
aucs = [auc(net(s).fit(Str, ytr), Ste) for s in range(5)]
spread = max(aucs) - min(aucs)
### END SOLUTION
print(aucs, "· spread:", spread)

# %%
check(lambda: 0.005 < spread < 0.05 and np.mean(aucs) > 0.75,
      "around 0.77 on average, but a point or two apart from seed to seed: report the spread, or average the seeds")

# %% [markdown]
# ## 3. Average the seeds
# `models` are five networks from five seeds. Set `ens_auc` to the AUC of their averaged predicted chances:
# `np.mean([m.predict_proba(Ste)[:, 1] for m in models], axis=0)`, scored with `roc_auc_score(yte, ...)`.

# %%
models = [net(s).fit(Str, ytr) for s in range(5)]
ens_auc = None
### HINT ens = np.mean([m.predict_proba(Ste)[:, 1] for m in models], axis=0)
### HINT ens_auc = roc_auc_score(yte, ens)
### BEGIN SOLUTION
ens = np.mean([m.predict_proba(Ste)[:, 1] for m in models], axis=0)
ens_auc = roc_auc_score(yte, ens)
### END SOLUTION
print("five seeds averaged:", ens_auc)

# %%
check(lambda: ens_auc >= np.mean([auc(m, Ste) for m in models]),
      "at least as good as the average single network, and it no longer depends on one lucky seed: the forest's idea, for networks")

# %% [markdown]
# ## 4. Forgetting to scale
# Set `auc_raw` to the test AUC of `net(0)` fitted on the unscaled `Xtr` (and scored on `Xte`), and `auc_trees` to
# `HistGradientBoostingClassifier(random_state=0)` on the same unscaled columns.

# %%
auc_raw = auc_trees = None
### HINT auc_raw = auc(net(0).fit(Xtr, ytr), Xte)
### HINT auc_trees = auc(HistGradientBoostingClassifier(random_state=0).fit(Xtr, ytr), Xte)
### BEGIN SOLUTION
auc_raw = auc(net(0).fit(Xtr, ytr), Xte)
auc_trees = auc(HistGradientBoostingClassifier(random_state=0).fit(Xtr, ytr), Xte)
### END SOLUTION
print("network, unscaled:", auc_raw, "· trees, unscaled:", auc_trees)

# %%
check(lambda: auc_raw < 0.75 and auc_trees > 0.75,
      "about 0.73 for the network (pdays = 999 saturates its units) and 0.76 for the trees, which only compare columns with cuts")

# %% [markdown]
# ## 5. Useless columns
# `N1`, `N2` are the scaled columns plus 100 columns of random noise. Set `auc_net_noise` and `auc_trees_noise`.
# Predict first: which model loses more?

# %%
rng = np.random.default_rng(0)
N1 = np.hstack([Str, rng.normal(size=(len(Str), 100))])
N2 = np.hstack([Ste, rng.normal(size=(len(Ste), 100))])
auc_net_noise = auc_trees_noise = None
### HINT auc_net_noise = auc(net(0).fit(N1, ytr), N2)
### HINT auc_trees_noise = auc(HistGradientBoostingClassifier(random_state=0).fit(N1, ytr), N2)
### BEGIN SOLUTION
auc_net_noise = auc(net(0).fit(N1, ytr), N2)
auc_trees_noise = auc(HistGradientBoostingClassifier(random_state=0).fit(N1, ytr), N2)
### END SOLUTION
print("network:", auc_net_noise, "(without noise", aucs[0] if aucs else None, ") · trees:", auc_trees_noise)

# %%
check(lambda: auc_trees_noise > auc_net_noise,
      "the network drops to about 0.75 (every noise column feeds every unit); the trees stay near 0.76 to 0.77 by never splitting on noise")

# %% [markdown]
# ## 6. Scale the target too
# Daily subway riders from weekday, a time trend and last week's count. `plain` is a network with scaled inputs;
# fit `TransformedTargetRegressor(model, transformer=StandardScaler())` around the same kind of network and set
# `mae_plain` and `mae_scaled` (test mean absolute error, in riders).

# %%
from sklearn.compose import TransformedTargetRegressor
r = pd.read_csv(DATA + "ridership.csv", parse_dates=["date"])
r["dow"] = r["date"].dt.dayofweek; r["t"] = (r["date"] - r["date"].min()).dt.days; r["lag7"] = r["subway"].shift(7)
r = r.dropna()
F = pd.get_dummies(r[["dow", "t", "lag7"]], columns=["dow"], dtype=float)
cut = r["date"] < "2024-01-01"
reg = lambda: make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(64,), max_iter=2000, random_state=0))
plain = reg().fit(F[cut], r["subway"][cut])
mae_plain = mean_absolute_error(r["subway"][~cut], plain.predict(F[~cut]))
mae_scaled = None
### HINT model = TransformedTargetRegressor(reg(), transformer=StandardScaler()).fit(F[cut], r["subway"][cut])
### HINT mae_scaled = mean_absolute_error(r["subway"][~cut], model.predict(F[~cut]))
### BEGIN SOLUTION
model = TransformedTargetRegressor(reg(), transformer=StandardScaler()).fit(F[cut], r["subway"][cut])
mae_scaled = mean_absolute_error(r["subway"][~cut], model.predict(F[~cut]))
### END SOLUTION
print("target as is:", round(mae_plain), "riders · target scaled:", mae_scaled, "· average day:", round(r["subway"].mean()))

# %%
check(lambda: mae_scaled < mae_plain / 5,
      "about 3.2 million as is (worse than predicting 0) and 0.26 million scaled: the output can't climb to millions from weights near 1")
