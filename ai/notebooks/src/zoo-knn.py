# %% [markdown]
# # Practice: k-nearest neighbors
# *AI from scratch, model zoo 3* · lesson: https://ihor.sh/ai/zoo-knn.html
#
# Handwritten digits: distances by hand, the nearest neighbors of one digit, choosing k on validation data, a useless
# column that hijacks the distance, the curse of dimensionality measured, and kNN against logistic regression when
# noise columns pile up. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import time
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

d = load_digits()
Xtr, Xte, ytr, yte = train_test_split(d.data, d.target, test_size=0.25, stratify=d.target, random_state=0)
print(Xtr.shape[0], "training digits,", Xte.shape[0], "test digits,", Xtr.shape[1], "pixels each (0 to 16)")
plt.figure(figsize=(2, 2)); plt.imshow(Xte[0].reshape(8, 8), cmap="gray_r"); plt.title(f"test digit 0: a {yte[0]}"); plt.axis("off"); plt.show()

# %% [markdown]
# ## 1. Distances to one digit
# Set `dist` to the squared distance from the first test digit `Xte[0]` to every training digit: subtract (NumPy
# broadcasts the one row against all of them), square, and sum across the pixels (`axis=1`).

# %%
dist = None
### HINT (Xtr - Xte[0]) has one row per training digit; square it and .sum(axis=1).
### HINT dist = ((Xtr - Xte[0]) ** 2).sum(axis=1)
### BEGIN SOLUTION
dist = ((Xtr - Xte[0]) ** 2).sum(axis=1)
### END SOLUTION
print(dist.shape if dist is not None else None, "· closest training digit is a", ytr[dist.argmin()] if dist is not None else None)

# %%
check(lambda: dist.shape == (len(Xtr),) and ytr[dist.argmin()] == yte[0],
      "one distance per training digit (1,347 of them), and the closest one has the same label as the test digit")

# %% [markdown]
# ## 2. The five nearest
# Set `nearest` to the positions of the 5 smallest distances: `np.argsort(dist)` sorts positions by distance, and
# `[:5]` keeps the first five. Then look at them.

# %%
nearest = None
### HINT np.argsort(dist) gives positions from nearest to farthest.
### HINT nearest = np.argsort(dist)[:5]
### BEGIN SOLUTION
nearest = np.argsort(dist)[:5]
### END SOLUTION
if nearest is not None:
    fig, ax = plt.subplots(1, 5, figsize=(6, 1.5))
    for a, i in zip(ax, nearest):
        a.imshow(Xtr[i].reshape(8, 8), cmap="gray_r"); a.set_title(ytr[i]); a.axis("off")
    plt.show()

# %%
check(lambda: len(nearest) == 5 and dist[nearest].max() <= np.sort(dist)[4],
      "the five training digits with the smallest distances: the evidence behind the vote")

# %% [markdown]
# ## 3. Choosing k
# Hold out a validation part of the training digits (done for you). Set `scores` to the validation accuracy for each
# k in `ks`: `KNeighborsClassifier(n_neighbors=k).fit(Xa, ya).score(Xv, yv)`, in a list comprehension.

# %%
Xa, Xv, ya, yv = train_test_split(Xtr, ytr, test_size=0.3, stratify=ytr, random_state=1)
ks = [1, 3, 5, 9, 15, 31, 61, 121]
scores = None
### HINT [something for k in ks], where something fits and scores one model.
### HINT scores = [KNeighborsClassifier(n_neighbors=k).fit(Xa, ya).score(Xv, yv) for k in ks]
### BEGIN SOLUTION
scores = [KNeighborsClassifier(n_neighbors=k).fit(Xa, ya).score(Xv, yv) for k in ks]
### END SOLUTION
if scores:
    plt.semilogx(ks, scores, "o-"); plt.xlabel("k"); plt.ylabel("validation accuracy"); plt.show()
print(scores)

# %%
check(lambda: max(scores) > 0.97 and scores[-1] < max(scores) - 0.02,
      "small k is near 98% on these clean digits, and by k = 121 the vote smears across classes and drops")

# %% [markdown]
# ## 4. A column that hijacks the distance
# `Xs` adds one column: a scanner serial number from 0 to 1000, which says nothing about the digit. Set `acc_raw` to
# a 3-neighbor kNN's test accuracy on it as is, and `acc_scaled` to the same with `StandardScaler()` first (a
# pipeline, as in toolkit 2).

# %%
serial = np.random.default_rng(0).uniform(0, 1000, len(d.data))
Xs = np.column_stack([d.data, serial])
Xstr, Xste, ystr, yste = train_test_split(Xs, d.target, test_size=0.25, stratify=d.target, random_state=0)
acc_raw = acc_scaled = None
### HINT acc_raw = KNeighborsClassifier(3).fit(Xstr, ystr).score(Xste, yste)
### HINT acc_scaled = make_pipeline(StandardScaler(), KNeighborsClassifier(3)).fit(Xstr, ystr).score(Xste, yste)
### BEGIN SOLUTION
acc_raw = KNeighborsClassifier(3).fit(Xstr, ystr).score(Xste, yste)
acc_scaled = make_pipeline(StandardScaler(), KNeighborsClassifier(3)).fit(Xstr, ystr).score(Xste, yste)
### END SOLUTION
print("raw:", acc_raw, "· scaled:", acc_scaled)

# %%
check(lambda: acc_raw < 0.9 and acc_scaled > 0.96,
      "about 84% raw (the serial number's differences swamp the pixels') and 97% scaled")

# %% [markdown]
# ## 5. The curse of dimensionality
# `ratio(dim)` puts 1,000 random points in a cube with `dim` columns and returns the nearest distance from a random
# query divided by the farthest. Set `ratios` to `ratio(dim)` for each `dim` in `dims`. Predict first: what happens to
# the ratio as the columns grow?

# %%
rng = np.random.default_rng(0)
def ratio(dim):
    X, q = rng.random((1000, dim)), rng.random(dim)
    dist = np.linalg.norm(X - q, axis=1)
    return dist.min() / dist.max()

dims = [2, 10, 100, 1000]
ratios = None
### HINT ratios = [ratio(dim) for dim in dims]
### BEGIN SOLUTION
ratios = [ratio(dim) for dim in dims]
### END SOLUTION
print(ratios)

# %%
check(lambda: ratios[0] < 0.1 and ratios[-1] > 0.8,
      "about 0.02 in 2 columns and 0.9 in 1,000: in many columns everything is about equally far, so 'nearest' means little")

# %% [markdown]
# ## 6. Noise columns: kNN against logistic regression
# `with_noise(extra)` returns the digits with `extra` columns of random noise added, split. For 640 noise columns,
# set `acc_knn` (3 neighbors) and `acc_lr` (`make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))`).

# %%
from sklearn.linear_model import LogisticRegression
def with_noise(extra):
    noise = np.random.default_rng(0).normal(0, 16 / 3, (len(d.data), extra))
    return train_test_split(np.hstack([d.data, noise]), d.target, test_size=0.25, stratify=d.target, random_state=0)

Ntr, Nte, ntr, nte = with_noise(640)
acc_knn = acc_lr = None
### HINT acc_knn = KNeighborsClassifier(3).fit(Ntr, ntr).score(Nte, nte)
### HINT the logistic pipeline is fitted and scored the same way
### BEGIN SOLUTION
acc_knn = KNeighborsClassifier(3).fit(Ntr, ntr).score(Nte, nte)
acc_lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Ntr, ntr).score(Nte, nte)
### END SOLUTION
print("kNN:", acc_knn, "· logistic:", acc_lr)

# %%
check(lambda: acc_knn < 0.6 and acc_lr > acc_knn + 0.25,
      "kNN about 48%, logistic about 86%: the weights learn that noise columns don't matter; a distance can't")

# %% [markdown]
# ## 7. The price of no training
# Run it: fitting kNN stores the rows, so all the work moves to prediction, and it grows with the data.

# %%
for n in [1_000, 10_000, 100_000]:
    X, yy = rng.random((n, 10)), rng.integers(0, 2, n)
    m = KNeighborsClassifier(5, algorithm="brute").fit(X, yy)
    t = time.time(); m.predict(rng.random((1000, 10))); ms = (time.time() - t) * 1000
    print(f"{n:7d} stored rows: 1,000 predictions in {ms:.1f} ms")
