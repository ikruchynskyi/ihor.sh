# %% [markdown]
# # Practice: NumPy in depth
# *AI from scratch, toolkit 1* · lesson: https://ihor.sh/ai/numpy-in-depth.html
#
# Shapes, broadcasting, views, loops turned into array code, einsum and memory, on the commuter rail stations
# around New York. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import json, time, urllib.request
import numpy as np

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
data = json.load(urllib.request.urlopen(DATA + "rail-stations.json"))
names = np.array([r[0] for r in data["rows"]])
lat = np.array([r[1] for r in data["rows"]]); lon = np.array([r[2] for r in data["rows"]])
# kilometers east and north of Manhattan (40.75 N, 73.99 W): one degree of latitude is 111 km
P = np.column_stack([(lon + 73.99) * 111 * np.cos(np.radians(40.75)), (lat - 40.75) * 111])
print("stations:", len(names), " P has shape", P.shape)

# %% [markdown]
# ## 1. Predict a shape
# `P` holds one row per station and two columns (km east, km north). **Predict** the shape of `P.mean(axis=0)`
# without running it: set `guess_shape` to a tuple, like `(5,)` or `(5, 1)`.

# %%
guess_shape = None
### HINT axis=0 is used up. What's left is one number per column.
### HINT There are 2 columns.
### BEGIN SOLUTION
guess_shape = (2,)
### END SOLUTION

# %%
print("P.mean(axis=0) =", P.mean(axis=0), "shape", P.mean(axis=0).shape)
check(lambda: tuple(guess_shape) == (2,), "one mean per column: (2,), the average station's position")

# %% [markdown]
# ## 2. Standardize the columns
# Set `Ps` to `P` with each column shifted to mean 0 and scaled to spread 1: subtract the column means, divide by the
# column standard deviations (`P.std(axis=0)`, one per column). Broadcasting does the rest.

# %%
Ps = None
### HINT The means are P.mean(axis=0), shape (2,). Subtracting a (2,) from a (n, 2) works row by row.
### HINT Ps = (P - P.mean(axis=0)) / P.std(axis=0)
### BEGIN SOLUTION
Ps = (P - P.mean(axis=0)) / P.std(axis=0)
### END SOLUTION

# %%
check(lambda: Ps.shape == P.shape and np.allclose(Ps.mean(axis=0), 0) and np.allclose(Ps.std(axis=0), 1),
      "same shape as P, each column with mean 0 and standard deviation 1")

# %% [markdown]
# ## 3. Views: predict first
# `first = P[:3]` is a slice. Below, `first` gets doubled in place. **Predict:** what is `P[0, 0]` afterwards, compared
# with `before` (its value before the change)? Set `guess_ratio` to `P[0, 0] / before` as you expect it.

# %%
before = P[0, 0]
guess_ratio = None
### HINT A slice is a view: in-place changes through it reach the original.
### BEGIN SOLUTION
guess_ratio = 2
### END SOLUTION

# %%
first = P[:3]
first *= 2
print("before", before, "after", P[0, 0])
check(lambda: guess_ratio == 2, "2: first is a view of P's memory, so *= doubled P's first rows too")
first /= 2     # put P back

# %% [markdown]
# ## 4. An if on every item, without a loop
# The loop below caps each station's distance from Manhattan at 50 km and halves everything past 50 km beyond the
# cap (an odd rule, just for practice). Write the same thing without a loop as `capped`, using
# `np.where(condition, if_true, if_false)` as in the lesson.

# %%
dist = np.sqrt((P ** 2).sum(axis=1))           # km from Manhattan, one per station
looped = np.zeros(len(dist))
for i in range(len(dist)):
    looped[i] = dist[i] if dist[i] <= 50 else 50 + 0.5 * (dist[i] - 50)
capped = None
### HINT The condition is dist <= 50. If true keep dist; otherwise 50 + 0.5 * (dist - 50).
### HINT capped = np.where(dist <= 50, dist, 50 + 0.5 * (dist - 50))
### BEGIN SOLUTION
capped = np.where(dist <= 50, dist, 50 + 0.5 * (dist - 50))
### END SOLUTION

# %%
check(lambda: np.allclose(capped, looped), "the same numbers as the loop: np.where(dist <= 50, dist, 50 + 0.5 * (dist - 50))")

# %% [markdown]
# ## 5. Every pair at once
# Set `D` to the table of distances between every station and every other: `D[i, j]` is the distance from station
# `i` to station `j`, in km. Broadcast a column against a row, as the lesson's box did with `A[:, None, :]`.
# Then set `nearest` to each station's closest *other* station, using `np.argmin(..., axis=1)` (the position of the
# smallest value in each row) on `D` with its zero diagonal covered up: `D + np.eye(len(D)) * 1e9`.

# %%
D = nearest = None
### HINT diff = P[:, None, :] - P[None, :, :] has shape (n, n, 2): every pair's east and north difference.
### HINT Square, sum over axis 2, square root. Then np.argmin(D + np.eye(len(D)) * 1e9, axis=1).
### BEGIN SOLUTION
diff = P[:, None, :] - P[None, :, :]
D = np.sqrt((diff ** 2).sum(axis=2))
nearest = np.argmin(D + np.eye(len(D)) * 1e9, axis=1)
### END SOLUTION

# %%
check(lambda: D.shape == (len(P), len(P)) and np.allclose(D, D.T) and np.allclose(np.diag(D), 0)
      and nearest[0] != 0 and np.isclose(D[0, nearest[0]], np.sort(D[0])[1]),
      "an n × n symmetric table with zeros on the diagonal; nearest[i] is never i itself")
if nearest is not None:
    for i in [0, 100, 200]:
        print(names[i], "→ nearest:", names[nearest[i]], round(float(D[i, nearest[i]]), 1), "km")

# %% [markdown]
# How much faster is that than two loops? Run it and see (the loop does a tenth of the stations, then we scale up).

# %%
n = len(P); t = time.perf_counter()
slow = np.zeros((n // 10, n))
for i in range(n // 10):
    for j in range(n):
        slow[i, j] = np.sqrt(((P[i] - P[j]) ** 2).sum())
t_loop = (time.perf_counter() - t) * 10
t = time.perf_counter(); fast = np.sqrt(((P[:, None, :] - P[None, :, :]) ** 2).sum(axis=2)); t_vec = time.perf_counter() - t
print(f"two loops ≈ {t_loop:.2f} s, broadcasting {t_vec:.4f} s: about {t_loop / t_vec:.0f}× faster")

# %% [markdown]
# ## 6. einsum
# `Q` and `K` below hold 500 pairs of 16-number vectors (like attention's queries and keys). Set `dots` to the 500 dot
# products, one per row: row `i` of `Q` with row `i` of `K`. Use `np.einsum` with the right letters.

# %%
rng = np.random.default_rng(0)
Q = rng.normal(size=(500, 16)); K = rng.normal(size=(500, 16))
dots = None
### HINT Both inputs have axes i (the row) and j (the 16 numbers). Keep i, sum j away.
### HINT dots = np.einsum("ij,ij->i", Q, K)
### BEGIN SOLUTION
dots = np.einsum("ij,ij->i", Q, K)
### END SOLUTION

# %%
check(lambda: dots.shape == (500,) and np.allclose(dots, (Q * K).sum(axis=1)), "500 numbers: 'ij,ij->i' keeps i and sums j")

# %% [markdown]
# ## 7. Find the bug
# This MSE is wrong, with no error message. Find why (print some shapes), then set `mse_fixed` to the right value.

# %%
y = dist[:200]                         # 200 true distances, shape (200,)
pred = (y + 1.0).reshape(-1, 1)        # a model that's always 1 km too far, as a column (200, 1)
mse_buggy = np.mean((pred - y) ** 2)
print("buggy MSE:", mse_buggy)
mse_fixed = None
### HINT print((pred - y).shape). Every prediction is exactly 1 km off, so the right MSE is easy to know in advance.
### HINT Flatten pred with pred.ravel() before subtracting.
### BEGIN SOLUTION
mse_fixed = np.mean((pred.ravel() - y) ** 2)
### END SOLUTION

# %%
check(lambda: np.isclose(mse_fixed, 1.0), "every error is exactly 1 km, so the MSE is 1.0: (200, 1) − (200,) made a 200 × 200 table")

# %% [markdown]
# ## 8. Estimate before you allocate
# The full commuter-rail map of the whole US might have 50,000 stations. Set `gb` to the memory (in gigabytes,
# 1 GB = 10⁹ bytes) of the float64 distance table `D` for 50,000 stations. Compute it from the sizes; don't build it!

# %%
gb = None
### HINT n × n numbers, 8 bytes each (float64), divided by 1e9.
### HINT gb = 50_000 * 50_000 * 8 / 1e9
### BEGIN SOLUTION
gb = 50_000 * 50_000 * 8 / 1e9
### END SOLUTION

# %%
check(lambda: np.isclose(gb, 20), "20 GB: 2.5 billion numbers × 8 bytes. Work in chunks, or use a nearest-neighbor index")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · The NumPy user guide on broadcasting:
# https://numpy.org/doc/stable/user/basics.broadcasting.html
