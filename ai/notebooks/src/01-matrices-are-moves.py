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

# %% [markdown]
# ## 1. Dot products measure agreement
# Write `cosine(a, b)`: the cosine of the angle between two vectors, $\frac{a \cdot b}{\lVert a \rVert \lVert b \rVert}$
# (use `@` and `np.linalg.norm`). It's 1 for arrows pointing the same way, 0 at right angles, −1 for opposites.
# Search engines and chatbots compare text embeddings with exactly this (stage 6).

# %%
def cosine(a, b):
    """Compute the cosine similarity between two 1D vectors a and b.
    
    Formula: (a · b) / (||a|| * ||b||)
    
    Args:
        a: 1D NumPy array representing vector a.
        b: 1D NumPy array representing vector b.
    Returns:
        float: Cosine similarity in range [-1.0, 1.0].
    """
    ### HINT Compute vector dot product using a @ b.
    ### HINT Compute vector L2 magnitudes using np.linalg.norm(a) and np.linalg.norm(b).
    ### HINT Return dot product divided by (norm_a * norm_b).
    ### BEGIN SOLUTION
    return (a @ b) / (np.linalg.norm(a) * np.linalg.norm(b))
    ### END SOLUTION

# %%
check(lambda: np.isclose(cosine(np.array([1, 0]), np.array([0, 5])), 0), 
      "Perpendicular vectors (orthogonal at 90°) must have cosine similarity 0.0.")
check(lambda: np.isclose(cosine(np.array([1, 2, 3]), np.array([2, 4, 6])), 1), 
      "Parallel vectors pointing in the exact same direction must have cosine similarity 1.0.")
check(lambda: np.isclose(cosine(np.array([3, 1]), np.array([1, 2.5])), np.cos(np.radians(49.76)), atol=1e-3), 
      "Cosine between [3, 1] and [1, 2.5] should equal cos(49.76°).")

# %% [markdown]
# ## 2. A rotation matrix
# Write `rotation(degrees)`: the 2×2 matrix that turns the plane counterclockwise. Its columns are where
# $\hat\imath = (1, 0)$ and $\hat\jmath = (0, 1)$ land: $(\cos\theta, \sin\theta)$ and $(-\sin\theta, \cos\theta)$.
# Then the code below moves a small house shape with it.

# %%
def rotation(degrees):
    """Generate 2x2 counterclockwise 2D rotation matrix for a given angle in degrees.
    
    Args:
        degrees: Angle of rotation in degrees.
    Returns:
        NumPy array of shape (2, 2) [[cos(t), -sin(t)], [sin(t), cos(t)]].
    """
    t = np.radians(degrees)
    ### HINT Form 2x2 matrix with rows [cos(t), -sin(t)] and [sin(t), cos(t)].
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
check(lambda: np.allclose(rotation(90) @ [2, 1], [-1, 2]), 
      "Rotating point (2, 1) by 90 degrees CCW should result in (-1, 2).")
check(lambda: np.allclose(rotation(30) @ rotation(60), rotation(90)), 
      "Successive rotations compose by matrix multiplication: R(30) @ R(60) == R(90).")
check(lambda: np.isclose(np.linalg.det(rotation(37)), 1), 
      "Pure 2D rotations preserve area, so det(R) must equal 1.0.")

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
### HINT Transform unit square vertices by computing M @ square.
### HINT Compute transformed polygon area using polygon_area(M @ square).
### BEGIN SOLUTION
area = polygon_area(M @ square)
### END SOLUTION
print("area after the move:", area, " det:", np.linalg.det(M))

# %%
check(lambda: np.isclose(area, np.linalg.det(M)), 
      "The shoelace area of the transformed square must match the determinant np.linalg.det(M).")

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
    """Compute forward pass of a single linear layer followed by ReLU activation.
    
    Formula: ReLU(W @ X + b)
    
    Args:
        W: Weight matrix of shape (out_features, in_features).
        b: Bias column vector of shape (out_features, 1).
        X: Input batch matrix of shape (in_features, batch_size).
    Returns:
        NumPy array of shape (out_features, batch_size) after ReLU.
    """
    ### HINT Compute linear transformation: W @ X + b (NumPy broadcasts b across columns).
    ### HINT Apply ReLU activation: np.maximum(0, ...).
    ### BEGIN SOLUTION
    return np.maximum(0, W @ X + b)
    ### END SOLUTION

out = layer(W, b, X)
print(None if out is None else out.shape)

# %%
check(lambda: out.shape == (4, 5), 
      "Output shape should be (4, 5) representing 4 output neurons for 5 examples.")
check(lambda: np.allclose(out[:, 2], np.maximum(0, W @ X[:, 2] + b[:, 0])), 
      "Column 2 of the output must match evaluating example 2 individually.")
check(lambda: (out >= 0).all(), 
      "ReLU activation cannot produce negative outputs: all elements must be >= 0.")

# %% [markdown]
# ## 5. The same in PyTorch
# PyTorch's **tensors** are NumPy arrays that can live on a GPU and remember how they were computed (for training,
# stage 2). `torch.tensor` makes one; `@`, `+`, `.T` and shapes all work the same. Convert `W`, `b`, `X` to tensors
# (`torch.tensor(..., dtype=torch.float32)`), run the same layer with `relu` (`torch.relu`), and set `out_t`.

# %%
import torch
out_t = None
### HINT Convert W, b, X to PyTorch float32 tensors.
### HINT Compute out_t = torch.relu(Wt @ Xt + bt).
### BEGIN SOLUTION
Wt, bt, Xt = (torch.tensor(a, dtype=torch.float32) for a in (W, b, X))
out_t = torch.relu(Wt @ Xt + bt)
### END SOLUTION
print(out_t)

# %%
check(lambda: torch.is_tensor(out_t) and np.allclose(out_t.numpy(), out, atol=1e-5), 
      "PyTorch forward pass out_t.numpy() must match NumPy layer(W, b, X) output within 1e-5.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · For more geometric intuition, 3Blue1Brown's *Essence of Linear Algebra*
# (free videos) is the classic companion to this chapter.
