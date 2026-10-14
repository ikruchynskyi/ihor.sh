# %% [markdown]
# # Practice: matrices are moves
# *AI from scratch, chapter 1* · lesson: https://ihor.sh/ai/01-matrices-are-moves.html
#
# Vectors, dot products, matrices as moves of the plane, and a network layer, first in NumPy, then the same in
# PyTorch, which writes them almost identically. Fill in each `...` under `# YOUR CODE HERE`, then run the check
# under it (✓ = right, ✗ = not yet).

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
# ## 1. Dot products measure agreement
# Write `cosine(a, b)`: the cosine of the angle between two vectors, $\frac{a \cdot b}{\lVert a \rVert \lVert b \rVert}$
# (use `@` and `np.linalg.norm`). It's 1 for arrows pointing the same way, 0 at right angles, −1 for opposites.
# Search engines and chatbots compare text embeddings with exactly this (stage 6).

# %%
def cosine(a, b):
    ### BEGIN SOLUTION
    return (a @ b) / (np.linalg.norm(a) * np.linalg.norm(b))
    ### END SOLUTION

# %%
check(lambda: np.isclose(cosine(np.array([1, 0]), np.array([0, 5])), 0), "right angles → 0")
check(lambda: np.isclose(cosine(np.array([1, 2, 3]), np.array([2, 4, 6])), 1), "same direction → 1, whatever the lengths")
check(lambda: np.isclose(cosine(np.array([3, 1]), np.array([1, 2.5])), np.cos(np.radians(49.76)), atol=1e-3), "the lesson's a and b are about 49.8° apart")

# %% [markdown]
# ## 2. A rotation matrix
# Write `rotation(degrees)`: the 2×2 matrix that turns the plane counterclockwise. Its columns are where
# $\hat\imath = (1, 0)$ and $\hat\jmath = (0, 1)$ land: $(\cos\theta, \sin\theta)$ and $(-\sin\theta, \cos\theta)$.
# Then the code below moves a small house shape with it.

# %%
def rotation(degrees):
    t = np.radians(degrees)
    ### BEGIN SOLUTION
    return np.array([[np.cos(t), -np.sin(t)],
                     [np.sin(t),  np.cos(t)]])
    ### END SOLUTION

house = np.array([[0, 0], [2, 0], [2, 1.5], [1, 2.3], [0, 1.5], [0, 0]]).T     # points as columns: shape (2, 6)
R = rotation(30)
if R is not None:
    moved = R @ house                       # one matrix product moves every point
    plt.plot(*house, "b-", label="before"); plt.plot(*moved, "r-", label="after 30°")
    plt.axis("equal"); plt.legend(); plt.grid(alpha=0.3); plt.show()

# %%
check(lambda: np.allclose(rotation(90) @ [2, 1], [-1, 2]), "rotating (2, 1) by 90° gives (−1, 2)")
check(lambda: np.allclose(rotation(30) @ rotation(60), rotation(90)), "two rotations in a row add their angles")
check(lambda: np.isclose(np.linalg.det(rotation(37)), 1), "a rotation keeps areas: determinant 1")

# %% [markdown]
# ## 3. The determinant is the area
# The unit square has corners (0,0), (1,0), (1,1), (0,1). Move it with `M` and compute the area of the result with
# the **shoelace formula** (`polygon_area` is given). Set `area` to that, and compare with `np.linalg.det(M)`.

# %%
def polygon_area(pts):              # pts: shape (2, k), corners in order
    x, y = pts
    return 0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1))

M = np.array([[2, 1], [0.5, 1.5]])
square = np.array([[0, 1, 1, 0], [0, 0, 1, 1]])
area = None
### BEGIN SOLUTION
area = polygon_area(M @ square)
### END SOLUTION
print("area after the move:", area, " det:", np.linalg.det(M))

# %%
check(lambda: np.isclose(area, np.linalg.det(M)), "the moved square's area equals det(M) = 2.5")

# %% [markdown]
# ## 4. A layer, on a whole batch
# A layer is $Z = WX + b$ then ReLU. Put 5 examples with 3 features each in the **columns** of `X` (shape (3, 5)).
# Write `layer(W, b, X)` that returns `relu(W @ X + b)` for all of them at once; `b` has shape (4, 1) and NumPy
# **broadcasts** it across the 5 columns.

# %%
rng = np.random.default_rng(0)
W, b = rng.standard_normal((4, 3)), rng.standard_normal((4, 1))
X = rng.standard_normal((3, 5))

def layer(W, b, X):
    ### BEGIN SOLUTION
    return np.maximum(0, W @ X + b)
    ### END SOLUTION

out = layer(W, b, X)
print(None if out is None else out.shape)

# %%
check(lambda: out.shape == (4, 5), "4 units × 5 examples")
check(lambda: np.allclose(out[:, 2], np.maximum(0, W @ X[:, 2] + b[:, 0])), "column 2 is example 2 through the layer")
check(lambda: (out >= 0).all(), "ReLU leaves nothing negative")

# %% [markdown]
# ## 5. The same in PyTorch
# PyTorch's **tensors** are NumPy arrays that can live on a GPU and remember how they were computed (for training,
# stage 2). `torch.tensor` makes one; `@`, `+`, `.T` and shapes all work the same. Convert `W`, `b`, `X` to tensors
# (`torch.tensor(..., dtype=torch.float32)`), run the same layer with `torch.relu`, and set `out_t`.

# %%
import torch
out_t = None
### BEGIN SOLUTION
Wt, bt, Xt = (torch.tensor(a, dtype=torch.float32) for a in (W, b, X))
out_t = torch.relu(Wt @ Xt + bt)
### END SOLUTION
print(out_t)

# %%
check(lambda: torch.is_tensor(out_t) and np.allclose(out_t.numpy(), out, atol=1e-5), "the same numbers as NumPy")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · For more geometric intuition, 3Blue1Brown's *Essence of Linear Algebra*
# (free videos) is the classic companion to this chapter.
