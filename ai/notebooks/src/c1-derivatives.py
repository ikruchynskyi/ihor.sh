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

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

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
    ### BEGIN SOLUTION
    return sigmoid(x) * (1 - sigmoid(x))
    ### END SOLUTION

def d_tanh(x):
    ### BEGIN SOLUTION
    return 1 - np.tanh(x) ** 2
    ### END SOLUTION

def d_relu(x):
    ### BEGIN SOLUTION
    return (x > 0).astype(float)
    ### END SOLUTION

xs = np.linspace(-5, 5, 201)
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
    ### BEGIN SOLUTION
    a, b = df(xs), central(f, xs)
    return np.max(np.abs(a - b) / np.maximum(1e-12, np.abs(a) + np.abs(b)))
    ### END SOLUTION

pts = np.array([-3, -0.7, 0.4, 2.5])         # avoid x = 0, where ReLU has a kink
for f, df, name in [(sigmoid, d_sigmoid, "sigmoid"), (np.tanh, d_tanh, "tanh"), (relu, d_relu, "relu")]:
    print(name, grad_check(f, df, pts))

# %%
check(lambda: all(grad_check(f, df, pts) < 1e-7 for f, df in [(sigmoid, d_sigmoid), (np.tanh, d_tanh), (relu, d_relu)]), "all three slopes pass")
check(lambda: grad_check(sigmoid, lambda x: sigmoid(x) * (1 + sigmoid(x)), pts) > 0.1, "a sign bug must fail the check")

# %% [markdown]
# ## 3. Vanishing gradients
# Backprop multiplies one slope per layer. The best a sigmoid ever does is 0.25 (at 0). Set `vanished` to the
# product of `d_sigmoid` at the 20 pre-activations below (a 20-layer sigmoid network's slope chain), and
# `relu_chain` to the same product with `d_relu` (all these inputs are positive).

# %%
z = np.abs(np.random.default_rng(1).normal(0, 1, 20)) + 0.1
vanished = relu_chain = None
### BEGIN SOLUTION
vanished = np.prod(d_sigmoid(z))
relu_chain = np.prod(d_relu(z))
### END SOLUTION
print("sigmoid chain:", vanished, " ReLU chain:", relu_chain)

# %%
check(lambda: vanished < 1e-12, "20 slopes of at most 0.25: under 0.25²⁰ ≈ 1e-12, the first layers can't learn")
check(lambda: relu_chain == 1, "ReLU's slope is exactly 1 where active: the signal survives")

# %% [markdown]
# ## 4. Autograd agrees
# Make `x = torch.tensor([...], requires_grad=True)`, compute `torch.sigmoid(x).sum()`, call `.backward()`, and set
# `auto` to `x.grad` as a NumPy array. (Summing works because each output depends on its own input only.)

# %%
import torch
auto = None
### BEGIN SOLUTION
xt = torch.tensor(pts, dtype=torch.float64, requires_grad=True)
torch.sigmoid(xt).sum().backward()
auto = xt.grad.numpy()
### END SOLUTION
print(auto)

# %%
check(lambda: np.allclose(auto, d_sigmoid(pts)), "autograd's slope equals your formula")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: calculus 2, many inputs.
