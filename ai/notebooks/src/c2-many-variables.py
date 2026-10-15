# %% [markdown]
# # Practice: gradients, Jacobians and backprop by hand
# *AI from scratch, calculus 2* · lesson: https://ihor.sh/ai/c2-many-variables.html
#
# The MSE gradient for any number of features, Jacobians computed by PyTorch and by formula, and a two-layer
# backward pass written by hand and checked against autograd.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import torch

# %% [markdown]
# ## 1. The MSE gradient, vectorized
# For a linear model $\hat y = Xw$ with loss $L = \frac1n \lVert Xw - y\rVert^2$, the gradient is
# $\nabla L = \frac2n X^\top (Xw - y)$. Write `mse_grad(X, w, y)`, then use it to train on the diabetes data
# (10 features plus an intercept column) with 2000 steps of gradient descent, learning rate 0.2.

# %%
from sklearn.datasets import load_diabetes
d = load_diabetes()
X = np.column_stack([(d.data - d.data.mean(0)) / d.data.std(0), np.ones(len(d.data))])   # standardized + intercept
y = d.target

def mse_grad(X, w, y):
    """Vectorized gradient of Mean Squared Error with respect to weights w.
    
    Formula: ∇L = (2 / n) * X^T @ (X @ w - y)
    
    Args:
        X: Feature matrix of shape (n_samples, n_features).
        w: Weight vector of shape (n_features,).
        y: Target vector of shape (n_samples,).
    Returns:
        Gradient vector of shape (n_features,).
    """
    ### HINT Compute model predictions y_pred = X @ w.
    ### HINT Compute residuals residual = y_pred - y.
    ### HINT Compute gradient (2 / len(y)) * X.T @ residual.
    ### BEGIN SOLUTION
    return 2 / len(y) * X.T @ (X @ w - y)
    ### END SOLUTION

w = np.zeros(X.shape[1])
### HINT Loop for 2000 iterations.
### HINT In each step, compute grad = mse_grad(X, w, y).
### HINT Update w = w - 0.2 * grad.
### BEGIN SOLUTION
for _ in range(2000):
    w = w - 0.2 * mse_grad(X, w, y)
### END SOLUTION
print("MSE:", np.mean((X @ w - y) ** 2))

# %%
w_exact = np.linalg.lstsq(X, y, rcond=None)[0]
check(lambda: mse_grad(X, np.zeros(11), y).shape == (11,), 
      "mse_grad should return a vector with shape (11,), one gradient per feature/weight.")
check(lambda: np.allclose(w, w_exact, atol=0.1), 
      "After 2000 steps with lr=0.2, w should closely match the exact least-squares solution w_exact.")

# %% [markdown]
# Try learning rate 0.5: it blows up. The loss surface's steepest curvature here is about 8, and calculus 3's rule says
# the step must stay under 2/8 ≈ 0.25. Then try 0.05: the loss looks fine early, but the weights crawl, because two
# features (two blood-serum measurements) move almost together and make one direction of the valley nearly flat
# (a condition number of about 470).
#
# ## 2. Jacobians
# The Jacobian of $f: \mathbb{R}^n \to \mathbb{R}^m$ is the $m \times n$ matrix of every output's slope with respect
# to every input. Two you should know by heart: for $f(x) = Wx$ it's $W$ itself, and for $f(x) = \tanh(x)$
# (element by element) it's a diagonal matrix of $1 - \tanh^2 x_i$.
# Set `J_lin` and `J_tanh` with `jacobian` (`torch.autograd.functional.jacobian`), and `J_tanh_formula` with `diag` (`np.diag`).

# %%
W = torch.tensor([[1.0, 2.0, 0.5], [-1.0, 0.0, 3.0]])
x0 = torch.tensor([0.3, -0.2, 0.8])
print("W @ x0 =", W @ x0, "  torch.tanh(x0) =", torch.tanh(x0))     # the two functions, at x0
J_lin = J_tanh = J_tanh_formula = None
### HINT Compute J_lin using torch.autograd.functional.jacobian(lambda x: W @ x, x0).
### HINT Compute J_tanh using torch.autograd.functional.jacobian(torch.tanh, x0).
### HINT Compute J_tanh_formula using np.diag(1 - np.tanh(x0.numpy()) ** 2).
### BEGIN SOLUTION
J_lin = torch.autograd.functional.jacobian(lambda x: W @ x, x0)
J_tanh = torch.autograd.functional.jacobian(torch.tanh, x0)
J_tanh_formula = np.diag(1 - np.tanh(x0.numpy()) ** 2)
### END SOLUTION
print(J_lin, J_tanh, sep="\n")

# %%
check(lambda: torch.allclose(J_lin, W), 
      "The Jacobian of the linear transformation Wx with respect to x should be matrix W.")
check(lambda: np.allclose(J_tanh.numpy(), J_tanh_formula, atol=1e-6), 
      "The Jacobian of tanh should be a diagonal matrix with entries 1 - tanh(x)^2.")

# %% [markdown]
# ## 3. The chain rule through two layers (chapter 4 calls this backprop)
# A small network: $h = \tanh(W_1 x)$, $\hat y = W_2 h$, $L = (\hat y - y)^2$. Compute the gradients of $L$ with
# respect to `W1` and `W2` by hand (NumPy), going backwards:
# $g = 2(\hat y - y)$; $\partial L/\partial W_2 = g\,h^\top$; then $g_h = W_2^\top g$, through tanh
# $g_z = g_h \odot (1 - h^2)$, and $\partial L/\partial W_1 = g_z\,x^\top$ (outer products: `np.outer`).

# %%
rng = np.random.default_rng(0)
W1, W2 = rng.standard_normal((4, 3)), rng.standard_normal((1, 4))
x, y_true = np.array([0.5, -1.0, 2.0]), np.array([0.7])
h = np.tanh(W1 @ x); y_hat = W2 @ h
dW1 = dW2 = None
### HINT Compute scalar/vector error g = 2 * (y_hat - y_true).
### HINT Weight gradient for layer 2: dW2 = np.outer(g, h).
### HINT Gradient backpropagated through W2: g_h = W2.T @ g.
### HINT Gradient through tanh activation: g_z = g_h * (1 - h ** 2).
### HINT Weight gradient for layer 1: dW1 = np.outer(g_z, x).
### BEGIN SOLUTION
g = 2 * (y_hat - y_true)
dW2 = np.outer(g, h)
g_z = (W2.T @ g) * (1 - h ** 2)
dW1 = np.outer(g_z, x)
### END SOLUTION

# the same with autograd, for comparison
t1, t2 = torch.tensor(W1, requires_grad=True), torch.tensor(W2, requires_grad=True)
loss = ((t2 @ torch.tanh(t1 @ torch.tensor(x))) - torch.tensor(y_true)).pow(2).sum()
loss.backward()

# %%
check(lambda: dW2.shape == W2.shape and dW1.shape == W1.shape, 
      "Check that dW2 has shape (1, 4) and dW1 has shape (4, 3), matching W2 and W1.")
check(lambda: np.allclose(dW2, t2.grad.numpy()) and np.allclose(dW1, t1.grad.numpy()), 
      "Manual backprop gradients dW1 and dW2 should match PyTorch's t1.grad and t2.grad.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 1, Bayes.
