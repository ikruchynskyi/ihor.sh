# %% [markdown]
# # Practice: clusters and anomalies
# *AI from scratch, stage 3* · lesson: https://ihor.sh/ai/clusters-and-anomalies.html
#
# Distance at work: the stations nearest Grand Central, a kNN classifier and how to pick its k, k-means written by
# hand and by scikit-learn, a Gaussian mixture's soft memberships, and an isolation forest flagging unusual subway
# elevator outages. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)`
# and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Stations: © OpenStreetMap contributors (ODbL). Outages: this site's MTA archive.

# %%
import io, json, urllib.request
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
data = json.load(urllib.request.urlopen(DATA + "rail-stations.json"))
st = pd.DataFrame(data["rows"], columns=data["columns"])
st["x"] = (st["lon"] + 74.0) * 111.32 * np.cos(np.radians(40.75))     # km east of Manhattan
st["y"] = (st["lat"] - 40.75) * 110.57                                  # km north
X = st[["x", "y"]].values
colors = st["railroad"].map({"MNR": "tab:green", "LIRR": "tab:blue", "NJT": "tab:orange"})
plt.figure(figsize=(5, 5)); plt.scatter(st["x"], st["y"], c=colors, s=8); plt.gca().set_aspect("equal")
plt.xlabel("km east of Manhattan"); plt.ylabel("km north"); plt.show()

# %% [markdown]
# ## 1. Distances
# `km` is every station's distance from Grand Central (computed for you, with Pythagoras on the x, y kilometers). Set
# `closest` to the 5 stations with the smallest `km`: sort the table by that column and take the first five rows.

# %%
gc = st[st["name"] == "Grand Central Terminal"].iloc[0]
st["km"] = np.sqrt((st["x"] - gc["x"]) ** 2 + (st["y"] - gc["y"]) ** 2)
closest = None
### HINT .sort_values("km") puts the smallest distances first; .head(5) keeps five rows.
### HINT closest = st.sort_values("km").head(5)
### BEGIN SOLUTION
closest = st.sort_values("km").head(5)
### END SOLUTION
closest[["name", "railroad", "km"]] if closest is not None else None

# %%
check(lambda: closest["name"].iloc[0] == "Grand Central Terminal" and len(closest) == 5,
      "five rows, starting with Grand Central itself at 0 km")

# %% [markdown]
# ## 2. Neighbors vote
# Split the stations 75/25 (done for you), then fit `knn`, a `KNeighborsClassifier(n_neighbors=5)`, on the training
# stations and set `acc5` to its accuracy on the test stations: `knn.score(X_test, y_test)` gives exactly that.

# %%
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import train_test_split
Xtr, Xte, ytr, yte = train_test_split(X, st["railroad"], test_size=0.25, random_state=0, stratify=st["railroad"])
knn = acc5 = None
### HINT knn = KNeighborsClassifier(n_neighbors=5).fit(Xtr, ytr)
### HINT acc5 = knn.score(Xte, yte)
### BEGIN SOLUTION
knn = KNeighborsClassifier(n_neighbors=5).fit(Xtr, ytr)
acc5 = knn.score(Xte, yte)
### END SOLUTION
print(acc5)

# %%
check(lambda: acc5 > 0.97, "99–100%: the railroads barely overlap on the map, so neighbors almost always share one")

# %% [markdown]
# ## 3. Choosing k on harder data
# The bank calls from the features lesson (numbers only, the leaking `duration` removed): `auc_for_k(k)` fits kNN
# with k neighbors and returns its test AUC. Set `aucs` to the list of AUCs for every k in `ks`, with a list
# comprehension.

# %%
from sklearn.metrics import roc_auc_score
bank = pd.read_csv(DATA + "bank.csv")
yb = (bank["y"] == "yes").astype(int)
Xb = bank.select_dtypes("number").drop(columns="duration")
Xbtr, Xbte, ybtr, ybte = train_test_split(Xb, yb, test_size=0.25, stratify=yb, random_state=0)

def auc_for_k(k):
    model = KNeighborsClassifier(k).fit(Xbtr, ybtr)
    return roc_auc_score(ybte, model.predict_proba(Xbte)[:, 1])

ks = [1, 3, 5, 11, 25, 51, 101, 201]
aucs = None
### HINT [something(k) for k in ks] makes one value per k.
### HINT aucs = [auc_for_k(k) for k in ks]
### BEGIN SOLUTION
aucs = [auc_for_k(k) for k in ks]
### END SOLUTION
if aucs:
    plt.semilogx(ks, aucs, "o-"); plt.xlabel("k"); plt.ylabel("test AUC"); plt.show()
print(aucs)

# %%
check(lambda: aucs[0] < 0.65 and max(aucs) > 0.75,
      "k = 1 memorizes single noisy calls (AUC about 0.59); around 100 neighbors it reaches about 0.78")

# %% [markdown]
# ## 4. k-means by hand
# `kmeans(X, k)` alternates the lesson's two steps. The **assign** step is written: each point's nearest center. Write
# the **move** step: `centers` becomes, for each cluster `j`, the mean of the points labeled `j`
# (`X[labels == j].mean(axis=0)`), as one array.

# %%
def kmeans(X, k, steps=100, seed=0):
    rng = np.random.default_rng(seed)
    centers = X[rng.choice(len(X), k, replace=False)]
    for _ in range(steps):
        dist = np.linalg.norm(X[:, None, :] - centers[None, :, :], axis=2)   # (points, centers)
        labels = dist.argmin(axis=1)                                     # assign: the nearest center
        ### HINT A list comprehension over j in range(k), turned into an array with np.array(...).
        ### HINT centers = np.array([X[labels == j].mean(axis=0) for j in range(k)])
        ### BEGIN SOLUTION
        centers = np.array([X[labels == j].mean(axis=0) for j in range(k)])
        ### END SOLUTION
    return labels, centers

labels, centers = kmeans(X, 4)
my_inertia = ((X - centers[labels]) ** 2).sum()
print("inertia:", my_inertia)

# %%
from sklearn.cluster import KMeans
best = KMeans(4, n_init=10, random_state=0).fit(X).inertia_
check(lambda: my_inertia < best * 1.05, "within a few percent of scikit-learn's best of 10 starts (about 426,500 km²); without the move step the centers never move")

# %% [markdown]
# ## 5. Do clusters find the railroads?
# Fit `km = KMeans(5, n_init=10, random_state=0)` on `X`, and set `ari5` to `adjusted_rand_score(st["railroad"],
# km.labels_)`: 1 if the clusters matched the railroads exactly, about 0 for chance.

# %%
from sklearn.metrics import adjusted_rand_score
km = ari5 = None
### HINT km = KMeans(5, n_init=10, random_state=0).fit(X)
### HINT ari5 = adjusted_rand_score(st["railroad"], km.labels_)
### BEGIN SOLUTION
km = KMeans(5, n_init=10, random_state=0).fit(X)
ari5 = adjusted_rand_score(st["railroad"], km.labels_)
### END SOLUTION
if km is not None:
    plt.figure(figsize=(5, 5)); plt.scatter(st["x"], st["y"], c=km.labels_, s=8, cmap="tab10"); plt.gca().set_aspect("equal"); plt.show()
print(ari5)

# %%
check(lambda: 0.4 < ari5 < 0.6, "about 0.5: the clusters are groups of nearby stations, which only partly line up with who runs them")

# %% [markdown]
# ## 6. Soft clusters
# Fit `gm`, a `GaussianMixture(5, random_state=0, n_init=3)`, on `X`, and set `p` to `gm.predict_proba(X)`: one row
# per station, one column per blob, each row adding up to 1.

# %%
from sklearn.mixture import GaussianMixture
gm = p = None
### HINT Fit it like any scikit-learn model: GaussianMixture(...).fit(X).
### HINT gm = GaussianMixture(5, random_state=0, n_init=3).fit(X), then p = gm.predict_proba(X)
### BEGIN SOLUTION
gm = GaussianMixture(5, random_state=0, n_init=3).fit(X)
p = gm.predict_proba(X)
### END SOLUTION
if p is not None:
    unsure = np.argsort(p.max(axis=1))[:5]
    print(pd.DataFrame(p[unsure].round(2), index=st["name"].values[unsure]))

# %%
check(lambda: p.shape == (len(st), 5) and np.allclose(p.sum(axis=1), 1),
      "a (396, 5) array of probabilities, each row adding up to 1")

# %% [markdown]
# ## 7. Unusual outages
# This site's archive of subway elevator and escalator outages, with the log of how long each lasted and of the MTA's
# estimate in `F`. Fit `iso`, an `IsolationForest(contamination=0.03, random_state=0)` (it flags the 3% easiest to
# isolate), on `F`, and set `flagged` to the rows of `df` it flags: `iso.predict(F)` is −1 for those.

# %%
from sklearn.ensemble import IsolationForest
o = json.load(urllib.request.urlopen(DATA + "outages.json"))
df = pd.DataFrame(o["rows"], columns=o["columns"])
F = np.column_stack([np.log10(df["hours"]), np.log10(df["estimated"])])
iso = flagged = None
### HINT iso = IsolationForest(contamination=0.03, random_state=0).fit(F)
### HINT flagged = df[iso.predict(F) == -1] keeps the rows where the comparison is True.
### BEGIN SOLUTION
iso = IsolationForest(contamination=0.03, random_state=0).fit(F)
flagged = df[iso.predict(F) == -1]
### END SOLUTION
if flagged is not None:
    plt.scatter(F[:, 0], F[:, 1], s=8, alpha=0.5)
    plt.scatter(np.log10(flagged["hours"]), np.log10(flagged["estimated"]), s=80, facecolors="none", edgecolors="r")
    plt.xlabel("log10 actual hours"); plt.ylabel("log10 estimated hours"); plt.show()
flagged

# %%
check(lambda: 711.13 in flagged["hours"].values and 8 <= len(flagged) <= 13,
      "about 11 outages (3% of 340), including the month-long 711-hour maintenance")

# %% [markdown]
# Look at what was flagged: month-long planned maintenance (rare but right), a 2.4-minute "outage" (likely a glitch),
# repairs that took a small fraction of their estimate. The detector ranks; a person decides what each one means.
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · scikit-learn's clustering guide compares many methods side by side:
# https://scikit-learn.org/stable/modules/clustering.html
