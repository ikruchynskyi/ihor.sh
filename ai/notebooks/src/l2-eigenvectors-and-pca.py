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

# %% [markdown]
# ## 1. Eigenvectors, checked
# For the symmetric matrix `A`, get its eigenvalues and eigenvectors with `np.linalg.eigh` (for symmetric
# matrices; sorted ascending). Set `lams` and `vecs`. Then verify the lesson's facts: $Av = \lambda v$ for each
# column, eigenvalues add to the trace and multiply to the determinant.

# %%
A = np.array([[4.0, 1.0, 0.5], [1.0, 3.0, 0.0], [0.5, 0.0, 2.0]])
lams = vecs = None
### HINT For symmetric matrices, eigh returns sorted eigenvalues and normalized eigenvectors.
### HINT Compute eigenvalues and eigenvectors using lams, vecs = np.linalg.eigh(A).
### BEGIN SOLUTION
lams, vecs = np.linalg.eigh(A)
### END SOLUTION
print(lams)

# %%
check(lambda: all(np.allclose(A @ vecs[:, k], lams[k] * vecs[:, k]) for k in range(3)), 
      "A @ v == lambda * v must hold for every eigenvalue-eigenvector pair.")
check(lambda: np.isclose(lams.sum(), np.trace(A)) and np.isclose(lams.prod(), np.linalg.det(A)), 
      "Sum of eigenvalues equals trace(A), and product of eigenvalues equals det(A).")
check(lambda: np.allclose(vecs.T @ vecs, np.eye(3)), 
      "Eigenvectors of a symmetric matrix must form an orthonormal basis (vecs.T @ vecs == I).")

# %% [markdown]
# ## 2. Power iteration
# Write `power_iteration(A, steps)`: start from a random vector, repeat "multiply by A, divide by its length", and
# return the vector and its eigenvalue estimate $v \cdot Av$.

# %%
def power_iteration(A, steps=200):
    """Estimate the dominant eigenvector and eigenvalue of matrix A via power iteration.
    
    Args:
        A: 2D square NumPy matrix.
        steps: Number of power iterations to perform.
    Returns:
        tuple: (v, lam) where v is the normalized dominant eigenvector and lam is the Rayleigh quotient.
    """
    v = np.random.default_rng(0).random(len(A))
    ### HINT Repeat `steps` times: multiply v by A (v = A @ v).
    ### HINT Normalize v to unit norm: v = v / np.linalg.norm(v).
    ### HINT Compute Rayleigh quotient estimate v @ A @ v and return (v, eigenvalue).
    ### BEGIN SOLUTION
    for _ in range(steps):
        v = A @ v
        v = v / np.linalg.norm(v)
    return v, v @ A @ v
    ### END SOLUTION

result = power_iteration(A)
print(result)

# %%
check(lambda: np.isclose(result[1], lams[-1]), 
      "Power iteration should converge to the largest eigenvalue of A (lams[-1]).")
check(lambda: np.isclose(abs(result[0] @ vecs[:, -1]), 1), 
      "The normalized vector from power iteration should align with vecs[:, -1] (|v . v_true| == 1).")

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
### HINT Compute eigenvalues and eigenvectors using w, V = np.linalg.eig(P).
### HINT Find the index of the eigenvalue closest to 1: idx = np.argmin(abs(w - 1)).
### HINT Extract the real part of the corresponding eigenvector: v = np.real(V[:, idx]).
### HINT Normalize so it sums to 1: steady = v / v.sum().
### BEGIN SOLUTION
w, V = np.linalg.eig(P)
v = np.real(V[:, np.argmin(abs(w - 1))])
steady = v / v.sum()
### END SOLUTION
print(steady)

# %%
check(lambda: np.allclose(P @ steady, steady) and np.isclose(steady.sum(), 1), 
      "Steady state vector must satisfy P @ steady == steady and sum to 1.0.")
check(lambda: np.allclose(np.linalg.matrix_power(P, 50) @ [0, 0, 1], steady), 
      "Simulating 50 steps from any starting distribution should converge to the steady state.")

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
### HINT Center data by subtracting column means: Xc = X - X.mean(axis=0).
### HINT Compute covariance matrix np.cov(Xc, rowvar=False) and its eigenvalues/eigenvectors with np.linalg.eigh.
### HINT Sort in descending order of eigenvalue: order = np.argsort(vals)[::-1].
### HINT Set components = vecs64[:, order] and explained = vals[order] / vals.sum().
### HINT Project onto first 2 principal components: Z = Xc @ components[:, :2].
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
check(lambda: np.allclose(explained[:5], PCA(5).fit(X).explained_variance_ratio_), 
      "The top 5 explained variance ratios must match sklearn PCA(5).explained_variance_ratio_.")
check(lambda: 0.7 < explained[:10].sum() < 0.8, 
      "The top 10 principal components should capture between 70% and 80% of total variance.")

# %% [markdown]
# ## 5. Rebuild the images
# Keep only the first `k` components: project and map back, $\hat X = (X_c V_k) V_k^\top + \bar x$. Write
# `reconstruct(k)` and look at how a digit sharpens as k grows. Set `err` to the mean squared error for each k.

# %%
def reconstruct(k):
    """Reconstruct centered digit images using the first k principal components.
    
    Args:
        k: Integer number of components to retain (1 <= k <= 64).
    Returns:
        NumPy array of shape (N, 64) containing reconstructed digit images in original scale.
    """
    ### HINT Select the top k eigenvectors Vk = components[:, :k].
    ### HINT Project centered data Xc onto Vk and reconstruct: Xc @ Vk @ Vk.T.
    ### HINT Add back the original mean feature vector X.mean(axis=0).
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
    ### HINT Compute mean squared error np.mean((reconstruct(k) - X) ** 2) for each k in ks.
    ### BEGIN SOLUTION
    err = [np.mean((reconstruct(k) - X) ** 2) for k in ks]
    ### END SOLUTION
print(err)

# %%
check(lambda: all(a > b for a, b in zip(err, err[1:])) and err[-1] < 1e-20, 
      "Reconstruction MSE must decrease monotonically as k increases, reaching ~0 at k=64.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 3, a neuron.
