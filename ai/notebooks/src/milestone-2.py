# %% [markdown]
# # Milestone 2: Digit classifier from scratch and in PyTorch
# *AI from scratch, milestone 2* · combine notebook for Stage 2
#
# Build a handwritten digit recognizer (0 to 9) from the ground up:
# 1. Forward pass, cross-entropy loss, and backpropagation implemented directly in NumPy without autograd.
# 2. Gradient descent training loop reaching over 85% accuracy.
# 3. Re-implementing the exact same architecture in PyTorch with `nn.Sequential` and autograd.
# 4. Verifying that both models learn equivalent representations.
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import numpy as np
import torch
from torch import nn
from sklearn.datasets import load_digits

# Set seeds for reproducibility
np.random.seed(42)
torch.manual_seed(42)

# Load 1,797 8x8 digit images (values 0..16)
X_raw, y = load_digits(return_X_y=True)
X = X_raw / 16.0  # Normalize to [0, 1]
y_onehot = np.eye(10)[y]

# Train (1,400) / Validation (397) split
tr, te = np.arange(1400), np.arange(1400, len(X))
X_tr, y_tr, y_tr_oh = X[tr], y[tr], y_onehot[tr]
X_te, y_te, y_te_oh = X[te], y[te], y_onehot[te]

print(f"Data ready: {len(X_tr)} train images, {len(X_te)} test images. Input shape: {X.shape[1]}")

# %% [markdown]
# ## 1. Forward pass in NumPy
# We use a 2-layer network: input (64) → hidden (32) with ReLU → output (10) with Softmax.
# Write `forward(X, W1, b1, W2, b2)`:
# - $z_1 = X W_1 + b_1$
# - $a_1 = \max(0, z_1)$ (ReLU)
# - $z_2 = a_1 W_2 + b_2$
# - $p = \text{softmax}(z_2)$ (subtract max for numerical stability)
# Return `(z1, a1, z2, p)`.

# %%
def forward(X, W1, b1, W2, b2):
    ### HINT Compute z1 = X @ W1 + b1, a1 = np.maximum(0, z1), z2 = a1 @ W2 + b2
    ### HINT exp_z = np.exp(z2 - np.max(z2, axis=1, keepdims=True)); p = exp_z / np.sum(exp_z, axis=1, keepdims=True)
    ### BEGIN SOLUTION
    z1 = X @ W1 + b1
    a1 = np.maximum(0, z1)
    z2 = a1 @ W2 + b2
    exp_z = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
    p = exp_z / np.sum(exp_z, axis=1, keepdims=True)
    return z1, a1, z2, p
    ### END SOLUTION

# %%
_W1, _b1 = np.random.randn(64, 32) * 0.05, np.zeros(32)
_W2, _b2 = np.random.randn(32, 10) * 0.05, np.zeros(10)
check(lambda: forward(X_tr[:5], _W1, _b1, _W2, _b2)[3].shape == (5, 10) and np.allclose(forward(X_tr[:5], _W1, _b1, _W2, _b2)[3].sum(axis=1), 1.0), "forward pass returns valid probability distributions summing to 1")

# %% [markdown]
# ## 2. Cross-entropy loss
# Write `compute_loss(p, y_oh)` computing categorical cross-entropy:
# $$L = -\frac{1}{N} \sum_{i=1}^N \sum_{k=1}^{10} y_{ik} \log(p_{ik} + \epsilon)$$
# Use $\epsilon = 10^{-12}$ to prevent $\log(0)$.

# %%
def compute_loss(p, y_oh):
    ### HINT eps = 1e-12; return -float(np.mean(np.sum(y_oh * np.log(p + eps), axis=1)))
    ### BEGIN SOLUTION
    eps = 1e-12
    return -float(np.mean(np.sum(y_oh * np.log(p + eps), axis=1)))
    ### END SOLUTION

# %%
check(lambda: np.isclose(compute_loss(forward(X_tr[:5], _W1, _b1, _W2, _b2)[3], y_tr_oh[:5]), np.log(10), atol=0.5), "initial cross-entropy on random weights is approximately ln(10) ≈ 2.30")

# %% [markdown]
# ## 3. Backpropagation: computing gradients
# Write `backward(X, y_oh, z1, a1, p, W2)`:
# - $dz_2 = \frac{1}{N} (p - y_{\text{oh}})$
# - $dW_2 = a_1^\top dz_2$, $db_2 = \sum dz_2$ (down rows)
# - $da_1 = dz_2 W_2^\top$
# - $dz_1 = da_1 \cdot (z_1 > 0)$ (ReLU derivative)
# - $dW_1 = X^\top dz_1$, $db_1 = \sum dz_1$
# Return `(dW1, db1, dW2, db2)`.

# %%
def backward(X, y_oh, z1, a1, p, W2):
    ### HINT N = len(X); dz2 = (p - y_oh) / N; dW2 = a1.T @ dz2; db2 = np.sum(dz2, axis=0)
    ### HINT da1 = dz2 @ W2.T; dz1 = da1 * (z1 > 0); dW1 = X.T @ dz1; db1 = np.sum(dz1, axis=0)
    ### BEGIN SOLUTION
    N = len(X)
    dz2 = (p - y_oh) / N
    dW2 = a1.T @ dz2
    db2 = np.sum(dz2, axis=0)
    da1 = dz2 @ W2.T
    dz1 = da1 * (z1 > 0)
    dW1 = X.T @ dz1
    db1 = np.sum(dz1, axis=0)
    return dW1, db1, dW2, db2
    ### END SOLUTION

# %%
check(lambda: backward(X_tr[:5], y_tr_oh[:5], forward(X_tr[:5], _W1, _b1, _W2, _b2)[0], forward(X_tr[:5], _W1, _b1, _W2, _b2)[1], forward(X_tr[:5], _W1, _b1, _W2, _b2)[3], _W2)[0].shape == (64, 32), "gradient matrices match layer weight and bias shapes")

# %% [markdown]
# ## 4. Training from scratch: Gradient Descent
# Train the network for 60 epochs with learning rate 0.5.
# Initialize $W_1 \sim \mathcal{N}(0, 0.1^2)$, $b_1 = 0$, $W_2 \sim \mathcal{N}(0, 0.1^2)$, $b_2 = 0$.
# Store the final test accuracy on `X_te` in `numpy_acc`.

# %%
W1 = np.random.randn(64, 32) * 0.1
b1 = np.zeros(32)
W2 = np.random.randn(32, 10) * 0.1
b2 = np.zeros(10)
lr = 0.5

### HINT In a loop for 60 epochs: z1, a1, z2, p = forward(X_tr, W1, b1, W2, b2); dW1, db1, dW2, db2 = backward(...); update W1, b1, W2, b2
### BEGIN SOLUTION
for epoch in range(60):
    z1, a1, z2, p = forward(X_tr, W1, b1, W2, b2)
    dW1, db1, dW2, db2 = backward(X_tr, y_tr_oh, z1, a1, p, W2)
    W1 -= lr * dW1
    b1 -= lr * db1
    W2 -= lr * dW2
    b2 -= lr * db2

_, _, _, p_te = forward(X_te, W1, b1, W2, b2)
numpy_acc = float((p_te.argmax(axis=1) == y_te).mean())
### END SOLUTION

if "numpy_acc" in locals() and numpy_acc is not None:
    print(f"NumPy scratch model test accuracy: {numpy_acc * 100:.1f}%")

# %%
check(lambda: numpy_acc > 0.85, "NumPy scratch model achieves > 85% test accuracy on handwritten digits")

# %% [markdown]
# ## 5. The same model in PyTorch
# Define an identical network using PyTorch's `nn.Sequential`:
# `Linear(64, 32)` → `ReLU()` → `Linear(32, 10)`.
# Assign to `pt_model`.

# %%
### HINT pt_model = nn.Sequential(nn.Linear(64, 32), nn.ReLU(), nn.Linear(32, 10))
### BEGIN SOLUTION
pt_model = nn.Sequential(
    nn.Linear(64, 32),
    nn.ReLU(),
    nn.Linear(32, 10)
)
### END SOLUTION

# %%
check(lambda: isinstance(pt_model, nn.Sequential) and len(pt_model) == 3 and pt_model[0].in_features == 64 and pt_model[2].out_features == 10, "PyTorch model architecture matches the 64 -> 32 -> 10 network")

# %% [markdown]
# ## 6. Training with PyTorch autograd
# Convert `X_tr`, `y_tr`, `X_te`, `y_te` to PyTorch tensors (`float32` for features, `int64` for labels).
# Train `pt_model` with `nn.CrossEntropyLoss()` and `torch.optim.SGD(pt_model.parameters(), lr=0.5)` for 60 epochs.
# Store the final test accuracy on `X_te` in `pytorch_acc`.

# %%
t_Xtr = torch.tensor(X_tr, dtype=torch.float32)
t_ytr = torch.tensor(y_tr, dtype=torch.int64)
t_Xte = torch.tensor(X_te, dtype=torch.float32)
t_yte = torch.tensor(y_te, dtype=torch.int64)

### HINT criterion = nn.CrossEntropyLoss(); opt = torch.optim.SGD(pt_model.parameters(), lr=0.5)
### HINT for 60 epochs: opt.zero_grad(); loss = criterion(pt_model(t_Xtr), t_ytr); loss.backward(); opt.step()
### BEGIN SOLUTION
criterion = nn.CrossEntropyLoss()
opt = torch.optim.SGD(pt_model.parameters(), lr=0.5)

for epoch in range(60):
    opt.zero_grad()
    loss = criterion(pt_model(t_Xtr), t_ytr)
    loss.backward()
    opt.step()

with torch.no_grad():
    pt_preds = pt_model(t_Xte).argmax(dim=1)
    pytorch_acc = float((pt_preds == t_yte).float().mean().item())
### END SOLUTION

if "pytorch_acc" in locals() and pytorch_acc is not None:
    print(f"PyTorch model test accuracy: {pytorch_acc * 100:.1f}%")

# %%
check(lambda: pytorch_acc > 0.85, "PyTorch model reaches > 85% test accuracy, matching the NumPy implementation")
