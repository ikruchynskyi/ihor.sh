# %% [markdown]
# # Practice: SVD, rotate, stretch, rotate
# *AI from scratch, linear algebra 3* · lesson: https://ihor.sh/ai/l3-svd.html
#
# Take matrices apart into rotations and stretches, rebuild them layer by layer, compress a photo, do PCA with one
# SVD, solve least squares with the pseudo-inverse, and count what LoRA saves. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import base64, json, urllib.request
import numpy as np
import matplotlib.pyplot as plt

A = np.array([[2, 1],
              [0.5, 1.5]])
print(A)

# %% [markdown]
# ## 1. Take a matrix apart
# `np.linalg.svd(A)` returns three things: `U`, the singular values `S` (biggest first) and `Vt` ($V^\top$). Set all
# three for the lesson's matrix `A`.

# %%
U = S = Vt = None
### HINT It returns the three in that order, so unpack them in one line, as with np.linalg.eigh in linear algebra 2.
### HINT U, S, Vt = np.linalg.svd(A)
### BEGIN SOLUTION
U, S, Vt = np.linalg.svd(A)
### END SOLUTION
print(S)

# %%
check(lambda: np.allclose(S, [2.558, 0.977], atol=1e-3), "the stretches are σ₁ ≈ 2.558 and σ₂ ≈ 0.977")
check(lambda: np.allclose(U @ np.diag(S) @ Vt, A), "U @ np.diag(S) @ Vt should give back A")

# %% [markdown]
# ## 2. How stretched is the ellipse?
# Set `cond`, the condition number: the biggest singular value over the smallest.

# %%
cond = None
### HINT S[0] is the biggest, S[-1] the smallest.
### HINT cond = S[0] / S[-1]
### BEGIN SOLUTION
cond = S[0] / S[-1]
### END SOLUTION
print(cond)

# %%
check(lambda: np.isclose(cond, np.linalg.cond(A)), "σ₁ / σ₂ ≈ 2.62, the same as np.linalg.cond(A)")

# %% [markdown]
# ## 3. One layer
# The SVD writes `A` as a sum of layers $\sigma_i u_i v_i^\top$: column `i` of `U` times row `i` of `Vt`, scaled by
# `S[i]`. Set `layer1`, the first layer, with `np.outer(u, v)` (every entry of u times every entry of v, a matrix).

# %%
layer1 = None
### HINT The first layer uses S[0], U[:, 0] (a column) and Vt[0] (a row).
### HINT layer1 = S[0] * np.outer(U[:, 0], Vt[0])
### BEGIN SOLUTION
layer1 = S[0] * np.outer(U[:, 0], Vt[0])
### END SOLUTION
print(layer1.round(3) if layer1 is not None else None)

# %%
check(lambda: layer1.shape == (2, 2) and np.linalg.matrix_rank(layer1) == 1, "a single layer has rank 1: every row is a multiple of the same row")
check(lambda: np.allclose(layer1 + S[1] * np.outer(U[:, 1], Vt[1]), A), "the two layers add up to A")

# %% [markdown]
# ## 4. How many layers does a photo need?
# The lesson's photo of Grace Hopper, 300 × 256 brightnesses. The cell takes its SVD (`S` is now the photo's 256
# singular values). A layer's **energy** is $\sigma_i^2$. Set `energy`: the running share of the total energy held by the
# first 1, 2, 3, … layers (`np.cumsum` adds up as it goes), and `k95`: the fewest layers holding at least 95%.

# %%
d = json.load(urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/hopper.json"))
img = np.frombuffer(base64.b64decode(d["pixels_b64"]), dtype=np.uint8).reshape(d["height"], d["width"]).astype(float)
U, S, Vt = np.linalg.svd(img, full_matrices=False)
energy = k95 = None
### HINT energy = np.cumsum(S ** 2) / np.sum(S ** 2): it rises from the first layer's share to 1.
### HINT energy >= 0.95 is False, …, then True; np.argmax finds the first True (its index, from 0), so add 1 for a count.
### BEGIN SOLUTION
energy = np.cumsum(S ** 2) / np.sum(S ** 2)
k95 = np.argmax(energy >= 0.95) + 1
### END SOLUTION
print(k95)

# %%
check(lambda: np.isclose(energy[-1], 1) and np.isclose(energy[19], 0.968, atol=1e-3), "energy ends at 1; the first 20 layers hold 0.968")
check(lambda: energy[k95 - 1] >= 0.95 > energy[k95 - 2], "k95 layers reach 95%, one fewer doesn't")

# %% [markdown]
# Now rebuild the photo from its first `k95` layers into `approx`, as in the lesson: the first `k` columns of `U`, times
# the first `k` singular values, times the first `k` rows of `Vt`. Set `share`: the numbers stored (`k` columns of `U`,
# `k` rows of `Vt`, `k` singular values) over the photo's `img.size`.

# %%
approx = share = None
k = k95
### HINT approx = (U[:, :k] * S[:k]) @ Vt[:k]
### HINT share = k * (img.shape[0] + img.shape[1] + 1) / img.size
### BEGIN SOLUTION
approx = (U[:, :k] * S[:k]) @ Vt[:k]
share = k * (img.shape[0] + img.shape[1] + 1) / img.size
### END SOLUTION
if approx is not None:
    fig, axes = plt.subplots(1, 2, figsize=(6, 3.5))
    axes[0].imshow(img, cmap="gray", vmin=0, vmax=255); axes[0].set_title("original"); axes[0].axis("off")
    axes[1].imshow(approx, cmap="gray", vmin=0, vmax=255); axes[1].set_title(f"{k} layers"); axes[1].axis("off")
    plt.show()
print(share)

# %%
check(lambda: np.allclose(approx, (U[:, :k95] * S[:k95]) @ Vt[:k95]) and np.linalg.matrix_rank(approx) == k95, "approx should have rank k95")
check(lambda: np.isclose(share, k95 * 557 / 76800), "each layer stores 300 + 256 + 1 = 557 numbers out of 76,800")

# %% [markdown]
# ## 5. PCA with one SVD
# On the wine data (standardized, as in the lesson), take the SVD of `X` and set `variances`: each component's variance,
# $\sigma^2 / (n - 1)$. The rows of `Vt` are then the components.

# %%
from sklearn.datasets import load_wine
from sklearn.decomposition import PCA
X = load_wine().data
X = (X - X.mean(0)) / X.std(0)
n = len(X)
variances = None
### HINT U, S, Vt = np.linalg.svd(X, full_matrices=False), then square S and divide by n - 1.
### HINT variances = S ** 2 / (n - 1)
### BEGIN SOLUTION
U, S, Vt = np.linalg.svd(X, full_matrices=False)
variances = S ** 2 / (n - 1)
### END SOLUTION
print(variances[:3].round(3) if variances is not None else None)

# %%
check(lambda: np.allclose(variances[:3], PCA(3).fit(X).explained_variance_), "the first three should match scikit-learn's PCA(3).explained_variance_")
check(lambda: np.allclose(abs(Vt[:3]), abs(PCA(3).fit(X).components_)), "and the first three rows of Vt its components (up to sign)")

# %% [markdown]
# ## 6. Least squares by the pseudo-inverse
# Fit a line `y ≈ w[0]·x + w[1]` through the five points: set `w` with `np.linalg.pinv(Xl) @ y`, as in the lesson.

# %%
x = np.array([0, 1, 2, 3, 4.0]); y = np.array([1.1, 2.9, 5.2, 7.1, 8.8])
Xl = np.column_stack([x, np.ones(5)])
w = None
### HINT Xl has a column of x and a column of ones, so w is (slope, intercept).
### HINT w = np.linalg.pinv(Xl) @ y
### BEGIN SOLUTION
w = np.linalg.pinv(Xl) @ y
### END SOLUTION
print(w)

# %%
check(lambda: np.allclose(w, np.linalg.lstsq(Xl, y, rcond=None)[0]), "the same as np.linalg.lstsq: slope 1.95, intercept 1.12")

# %% [markdown]
# ## 7. What LoRA saves
# A layer's weight matrix is `d × d` with `d = 4096`. Full fine-tuning trains all of it; LoRA trains two thin matrices,
# `d × r` and `r × d`, with `r = 16`. Set `full`, `lora` (the two counts) and `ratio` (`lora / full`).

# %%
d, r = 4096, 16
full = lora = ratio = None
### HINT full = d * d; lora = 2 * d * r
### HINT ratio = lora / full
### BEGIN SOLUTION
full = d * d
lora = 2 * d * r
ratio = lora / full
### END SOLUTION
print(full, lora, ratio)

# %%
check(lambda: full == 16_777_216 and lora == 131_072, "16.8 million against 131 thousand")
check(lambda: np.isclose(ratio, 1 / 128), "under 1%: 2r/d = 1/128")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Gilbert Strang's MIT 18.06 lectures cover the SVD in depth, free online.
