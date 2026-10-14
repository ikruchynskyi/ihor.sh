# %% [markdown]
# # Practice: eigenvectors, Markov chains and PCA
# *AI from scratch, linear algebra 2* · lesson: https://ihor.sh/ai/l2-eigenvectors-and-pca.html
#
# Eigenvectors by NumPy and by power iteration, a Markov chain's long-run state, and PCA from scratch on
# handwritten digits: squeeze 64 numbers per image down to a handful, look at them, and rebuild the images.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. Eigenvectors, checked
# For the symmetric matrix `A`, get its eigenvalues and eigenvectors with `np.linalg.eigh` (for symmetric
# matrices; sorted ascending). Set `lams` and `vecs`. Then verify the lesson's facts: $Av = \lambda v$ for each
# column, eigenvalues add to the trace and multiply to the determinant.

# %%
A = np.array([[4.0, 1.0, 0.5], [1.0, 3.0, 0.0], [0.5, 0.0, 2.0]])
lams = vecs = None
### BEGIN SOLUTION
lams, vecs = np.linalg.eigh(A)
### END SOLUTION
print(lams)

# %%
check(lambda: all(np.allclose(A @ vecs[:, k], lams[k] * vecs[:, k]) for k in range(3)), "A v = λ v for every eigenvector")
check(lambda: np.isclose(lams.sum(), np.trace(A)) and np.isclose(lams.prod(), np.linalg.det(A)), "sum = trace, product = det")
check(lambda: np.allclose(vecs.T @ vecs, np.eye(3)), "a symmetric matrix's eigenvectors are at right angles (orthonormal)")

# %% [markdown]
# ## 2. Power iteration
# Write `power_iteration(A, steps)`: start from a random vector, repeat "multiply by A, divide by its length", and
# return the vector and its eigenvalue estimate $v \cdot Av$.

# %%
def power_iteration(A, steps=200):
    v = np.random.default_rng(0).random(len(A))
    ### BEGIN SOLUTION
    for _ in range(steps):
        v = A @ v
        v = v / np.linalg.norm(v)
    return v, v @ A @ v
    ### END SOLUTION

result = power_iteration(A)
print(result)

# %%
check(lambda: np.isclose(result[1], lams[-1]), "it finds the biggest eigenvalue")
check(lambda: np.isclose(abs(result[0] @ vecs[:, -1]), 1), "and its eigenvector (up to sign)")

# %% [markdown]
# ## 3. A Markov chain's long run
# Tomorrow's weather depends only on today's. Column j of `P` is "today is j": the chances of each weather tomorrow
# (sunny, cloudy, rainy). Find the long-run share of each: the eigenvector of `P` with eigenvalue 1, scaled to add
# up to 1. Use `np.linalg.eig` (P isn't symmetric) and pick the eigenvalue closest to 1. Set `steady`.

# %%
P = np.array([[0.7, 0.3, 0.2],
              [0.2, 0.4, 0.4],
              [0.1, 0.3, 0.4]])
steady = None
### BEGIN SOLUTION
w, V = np.linalg.eig(P)
v = np.real(V[:, np.argmin(abs(w - 1))])
steady = v / v.sum()
### END SOLUTION
print(steady)

# %%
check(lambda: np.allclose(P @ steady, steady) and np.isclose(steady.sum(), 1), "P keeps it unchanged and it adds to 1")
check(lambda: np.allclose(np.linalg.matrix_power(P, 50) @ [0, 0, 1], steady), "50 days from any start lands there (power iteration again)")

# %% [markdown]
# ## 4. PCA from scratch on handwritten digits
# 1,797 images of digits, 8×8 pixels: 64 numbers each. Do PCA yourself:
# 1. center the data (subtract each column's mean) into `Xc`
# 2. compute the 64×64 covariance matrix and its eigenvectors with `eigh`
# 3. sort them by eigenvalue, biggest first, into `components` (64 × 64, one per column) and `explained`
#    (each eigenvalue's share of the total)
# 4. project onto the first two components: `Z = Xc @ components[:, :2]`

# %%
from sklearn.datasets import load_digits
digits = load_digits()
X, y = digits.data, digits.target
Xc = components = explained = Z = None
### BEGIN SOLUTION
Xc = X - X.mean(axis=0)
vals, vecs64 = np.linalg.eigh(np.cov(Xc, rowvar=False))
order = np.argsort(vals)[::-1]
components, explained = vecs64[:, order], vals[order] / vals.sum()
Z = Xc @ components[:, :2]
### END SOLUTION
if Z is not None:
    plt.figure(figsize=(6, 5)); plt.scatter(Z[:, 0], Z[:, 1], c=y, cmap="tab10", s=6); plt.colorbar(label="digit")
    plt.title("1,797 digits, 64 numbers squeezed into 2"); plt.show()
    print("first 10 components hold", round(explained[:10].sum() * 100, 1), "% of the variance")

# %%
from sklearn.decomposition import PCA
check(lambda: np.allclose(explained[:5], PCA(5).fit(X).explained_variance_ratio_), "the same shares as scikit-learn's PCA")
check(lambda: 0.7 < explained[:10].sum() < 0.8, "10 of 64 directions hold about three quarters of the variance")

# %% [markdown]
# ## 5. Rebuild the images
# Keep only the first `k` components: project and map back, $\hat X = (X_c V_k) V_k^\top + \bar x$. Write
# `reconstruct(k)` and look at how a digit sharpens as k grows. Set `err` to the mean squared error for each k.

# %%
def reconstruct(k):
    ### BEGIN SOLUTION
    Vk = components[:, :k]
    return Xc @ Vk @ Vk.T + X.mean(axis=0)
    ### END SOLUTION

ks = [1, 5, 10, 20, 64]
err = None
if components is not None:
    fig, ax = plt.subplots(1, len(ks), figsize=(10, 2.2))
    for a, k in zip(ax, ks):
        R = reconstruct(k)
        if R is not None: a.imshow(R[0].reshape(8, 8), cmap="gray_r")
        a.set_title(f"k = {k}"); a.axis("off")
    plt.show()
    ### BEGIN SOLUTION
    err = [np.mean((reconstruct(k) - X) ** 2) for k in ks]
    ### END SOLUTION
print(err)

# %%
check(lambda: all(a > b for a, b in zip(err, err[1:])) and err[-1] < 1e-20, "error shrinks with k and vanishes with all 64")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 3, a neuron.
