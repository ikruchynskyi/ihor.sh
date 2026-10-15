# %% [markdown]
# # Practice: derivatives and gradient checks
# *AI from scratch, calculus 1* · lesson: https://ihor.sh/ai/c1-derivatives.html
#
# The activation functions every network uses, their slopes, a gradient checker (the tool for catching backprop
# bugs), vanishing gradients in numbers, and PyTorch's autograd agreeing with your formulas.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt

def central(f, x, h=1e-5):
    return (f(x + h) - f(x - h)) / (2 * h)

# %% [markdown]
# ## 1. Activations and their slopes
# Write the derivatives, working on whole arrays:
# - `d_sigmoid(x)` = $\sigma(x)(1 - \sigma(x))$
# - `d_tanh(x)` = $1 - \tanh^2 x$
# - `d_relu(x)` = 1 where $x > 0$, else 0 (frameworks use 0 at exactly 0)

# %%
def sigmoid(x): return 1 / (1 + np.exp(-x))
def relu(x): return np.maximum(0, x)

def d_sigmoid(x):
    """Derivative of the sigmoid function: σ'(x) = σ(x) * (1 - σ(x)).
    
    Args:
        x: A float or NumPy array of input values.
    Returns:
        NumPy array or float of slopes at x.
    """
    ### HINT Use the sigmoid(x) helper defined above.
    ### HINT Return sigmoid(x) * (1 - sigmoid(x)).
    ### BEGIN SOLUTION
    return sigmoid(x) * (1 - sigmoid(x))
    ### END SOLUTION

xs = np.linspace(-5, 5, 201)

# %%
check(lambda: np.allclose(d_sigmoid(xs), central(sigmoid, xs)), "σ(x)(1 − σ(x)): its peak is 0.25 at x = 0")

# %%
def d_tanh(x):
    """Derivative of tanh: tanh'(x) = 1 - tanh(x)^2.
    
    Args:
        x: A float or NumPy array of input values.
    Returns:
        NumPy array or float of slopes at x.
    """
    ### HINT Compute tanh using np.tanh(x).
    ### HINT Return 1 - np.tanh(x) ** 2.
    ### BEGIN SOLUTION
    return 1 - np.tanh(x) ** 2
    ### END SOLUTION

# %%
check(lambda: np.allclose(d_tanh(xs), central(np.tanh, xs)), "1 − tanh²(x): its peak is 1 at x = 0")

# %%
def d_relu(x):
    """Derivative of ReLU: 1 where x > 0, else 0.
    
    Args:
        x: A float or NumPy array of input values.
    Returns:
        NumPy array of slopes (1.0 where x > 0, 0.0 elsewhere).
    """
    ### HINT Check condition x > 0.
    ### HINT Convert boolean array to float using .astype(float).
    ### BEGIN SOLUTION
    return (x > 0).astype(float)
    ### END SOLUTION

# %%
check(lambda: np.array_equal(d_relu(np.array([-2.0, 0.0, 3.0])), [0, 0, 1]), "0 for x ≤ 0 and 1 for x > 0, as floats: (x > 0) gives True/False, .astype(float) makes them 1.0/0.0")

# %%
for f, df, name in [(sigmoid, d_sigmoid, "sigmoid"), (np.tanh, d_tanh, "tanh"), (relu, d_relu, "relu")]:
    if df(xs) is not None:
        plt.plot(xs, df(xs), label=f"slope of {name}")
plt.legend(); plt.grid(alpha=0.3); plt.show()

# %% [markdown]
# ## 2. A gradient checker
# Write `grad_check(f, df, xs)` returning the largest **relative error** between `df(x)` and `central(f, x)` over
# the points `xs` (relative error = |a − b| / (|a| + |b|), with a floor of 1e-12 below). Under about 1e-7: correct.

# %%
def grad_check(f, df, xs):
    """Compute the maximum relative error between analytical df(xs) and numerical central(f, xs).
    
    Args:
        f: The forward function, e.g. sigmoid or relu
        df: The analytical derivative function to test, e.g. d_sigmoid
        xs: 1D NumPy array of evaluation points
    Returns:
        float: Maximum relative error across all points in xs
    """
    ### HINT Evaluate analytical derivative a = df(xs) and central difference b = central(f, xs).
    ### HINT Calculate relative error |a - b| / max(1e-12, |a| + |b|) elementwise.
    ### HINT Return the maximum relative error using np.max(...).
    ### BEGIN SOLUTION
    a, b = df(xs), central(f, xs)
    return np.max(np.abs(a - b) / np.maximum(1e-12, np.abs(a) + np.abs(b)))
    ### END SOLUTION

pts = np.array([-3, -0.7, 0.4, 2.5])         # avoid x = 0, where ReLU has a kink
for f, df, name in [(sigmoid, d_sigmoid, "sigmoid"), (np.tanh, d_tanh, "tanh"), (relu, d_relu, "relu")]:
    print(name, grad_check(f, df, pts))

# %%
check(lambda: all(grad_check(f, df, pts) < 1e-7 for f, df in [(sigmoid, d_sigmoid), (np.tanh, d_tanh), (relu, d_relu)]), 
      "Check that grad_check returns relative error < 1e-7 for sigmoid, tanh, and relu.")
check(lambda: grad_check(sigmoid, lambda x: sigmoid(x) * (1 + sigmoid(x)), pts) > 0.1, 
      "A deliberately incorrect derivative formula should produce relative error > 0.1.")

# %% [markdown]
# ## 3. Vanishing gradients
# Backprop multiplies one slope per layer. The best a sigmoid ever does is 0.25 (at 0). Set `vanished` to the
# product of `d_sigmoid` at the 20 pre-activations below (a 20-layer sigmoid network's slope chain), and
# `relu_chain` to the same product with `d_relu` (all these inputs are positive).

# %%
z = np.abs(np.random.default_rng(1).normal(0, 1, 20)) + 0.1
vanished = relu_chain = None
### HINT Calculate the product of all 20 sigmoid slopes using np.prod(d_sigmoid(z)).
### HINT Calculate the product of all 20 ReLU slopes using np.prod(d_relu(z)).
### BEGIN SOLUTION
vanished = np.prod(d_sigmoid(z))
relu_chain = np.prod(d_relu(z))
### END SOLUTION
print("sigmoid chain:", vanished, " ReLU chain:", relu_chain)

# %%
check(lambda: vanished < 1e-12, 
      "20 sigmoid slopes of at most 0.25 multiplied together should be < 1e-12 (vanished gradient).")
check(lambda: relu_chain == 1, 
      "ReLU slopes on positive inputs are exactly 1, so the chain product should be 1.0.")

# %% [markdown]
# ## 4. Autograd agrees
# Make `x = torch.tensor([...], dtype=torch.float64, requires_grad=True)` with double precision `float64`, compute `sigmoid` (`torch.sigmoid(x).sum()`), call `.backward()`, and set
# `auto` to `x.grad` as a NumPy array. (Summing works because each output depends on its own input only.)

# %%
import torch
auto = None
### HINT Convert pts into a torch.tensor with dtype=torch.float64 and requires_grad=True.
### HINT Forward pass torch.sigmoid(xt).sum() and call .backward() on it.
### HINT Extract the gradients into `auto` with xt.grad.numpy().
### BEGIN SOLUTION
xt = torch.tensor(pts, dtype=torch.float64, requires_grad=True)
torch.sigmoid(xt).sum().backward()
auto = xt.grad.numpy()
### END SOLUTION
print(auto)

# %%
check(lambda: np.allclose(auto, d_sigmoid(pts)), 
      "torch autograd's x.grad.numpy() should match your analytical d_sigmoid(pts).")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: calculus 2, many inputs.
