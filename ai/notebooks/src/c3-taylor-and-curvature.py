# %% [markdown]
# # Practice: curvature, learning rates and Newton's method
# *AI from scratch, calculus 3* · lesson: https://ihor.sh/ai/c3-taylor-and-curvature.html
#
# Taylor approximations, the learning-rate limit 2/k found by experiment, a Hessian from PyTorch, the condition
# number of a real dataset before and after scaling, and Newton's method racing gradient descent.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. Taylor polynomials
# $e^x \approx \sum_{k=0}^{n} x^k / k!$. Write `taylor_exp(x, n)` and set `errors`: the absolute error at x = 1 for
# n = 1 … 8. Each extra term should win roughly another digit.

# %%
def taylor_exp(x, n):
    ### BEGIN SOLUTION
    return sum(x ** k / math.factorial(k) for k in range(n + 1))
    ### END SOLUTION

errors = None
### BEGIN SOLUTION
errors = [abs(taylor_exp(1.0, n) - math.e) for n in range(1, 9)]
### END SOLUTION
print(errors)

# %%
check(lambda: np.isclose(taylor_exp(0.5, 12), math.exp(0.5)), "12 terms match eˣ to many digits")
check(lambda: errors[-1] < 1e-4 and all(a > b for a, b in zip(errors, errors[1:])), "the error shrinks with every term")

# %% [markdown]
# ## 2. The learning-rate limit, by experiment
# On $f(x) = \frac{k}{2}x^2$ (curvature k = 8), gradient descent multiplies x by $(1 - \eta k)$ each step.
# Run 100 steps from x = 1 for each learning rate in `rates` and set `stable` to the rates where |x| ends below 1.
# The lesson says the limit is $2/k = 0.25$.

# %%
k = 8.0
rates = [0.05, 0.1, 0.2, 0.24, 0.26, 0.3]
stable = None
### BEGIN SOLUTION
def run(eta, x=1.0):
    for _ in range(100):
        x -= eta * k * x
    return x
stable = [eta for eta in rates if abs(run(eta)) < 1]
### END SOLUTION
print(stable)

# %%
check(lambda: stable == [0.05, 0.1, 0.2, 0.24], "everything under 2/k = 0.25 is stable, everything over explodes")

# %% [markdown]
# ## 3. A Hessian from PyTorch
# For $f(x, y) = 3x^2 + 2xy + y^2$, get the Hessian at (1, 1) with `torch.autograd.functional.hessian` (set `H`),
# its eigenvalues (`evals`, ascending) and the condition number `cond` = largest / smallest.

# %%
f = lambda v: 3 * v[0] ** 2 + 2 * v[0] * v[1] + v[1] ** 2
H = evals = cond = None
### BEGIN SOLUTION
H = torch.autograd.functional.hessian(f, torch.tensor([1.0, 1.0])).numpy()
evals = np.linalg.eigvalsh(H)
cond = evals[-1] / evals[0]
### END SOLUTION
print(H, evals, cond)

# %%
check(lambda: np.allclose(H, [[6, 2], [2, 2]]), "∂²f/∂x² = 6, ∂²f/∂x∂y = 2, ∂²f/∂y² = 2")
check(lambda: np.isclose(cond, (4 + 2 * np.sqrt(2)) / (4 - 2 * np.sqrt(2))), "about 5.8")

# %% [markdown]
# ## 4. Scaling a real dataset un-stretches the valley
# For least squares the Hessian is $\frac{2}{n} X^\top X$. Compute the condition number of $X^\top X$ for the
# diabetes features **raw** (with an intercept column of 1s) and **standardized** (z-scores, then the 1s).
# Set `cond_raw` and `cond_std`.

# %%
from sklearn.datasets import load_diabetes
D = load_diabetes(scaled=False).data
cond_raw = cond_std = None
### BEGIN SOLUTION
Xr = np.column_stack([D, np.ones(len(D))])
Xs = np.column_stack([(D - D.mean(0)) / D.std(0), np.ones(len(D))])
cond_raw = np.linalg.cond(Xr.T @ Xr)
cond_std = np.linalg.cond(Xs.T @ Xs)
### END SOLUTION
print("raw:", cond_raw, "  standardized:", cond_std)

# %%
check(lambda: cond_raw > 1e6 and cond_std < 1e3, "scaling cuts the condition number by many orders of magnitude")

# %% [markdown]
# ## 5. Newton vs gradient descent
# Minimize $f(x) = e^x - 2x$ (minimum at $\ln 2$) from x = 0. Gradient descent: `x -= 0.3 * f'(x)`.
# Newton: `x -= f'(x) / f''(x)`. Record each method's error after every step for 8 steps in `gd_err` and `nt_err`.

# %%
d1, d2 = lambda x: math.exp(x) - 2, lambda x: math.exp(x)
gd_err = nt_err = None
### BEGIN SOLUTION
gd = nt = 0.0; gd_err, nt_err = [], []
for _ in range(8):
    gd -= 0.3 * d1(gd); nt -= d1(nt) / d2(nt)
    gd_err.append(abs(gd - math.log(2))); nt_err.append(abs(nt - math.log(2)))
plt.semilogy(gd_err, "o-", label="gradient descent"); plt.semilogy(np.maximum(nt_err, 1e-17), "o-", label="Newton"); plt.legend(); plt.show()
### END SOLUTION

# %%
check(lambda: nt_err[4] < 1e-12 and gd_err[4] > 1e-3, "Newton doubles its correct digits each step; GD gains a steady fraction")

# %% [markdown]
# ## 6. Minimum, maximum or saddle?
# Write `kind(H)`: "minimum" if every eigenvalue of the symmetric matrix H is positive, "maximum" if all are
# negative, otherwise "saddle".

# %%
def kind(H):
    ### BEGIN SOLUTION
    ev = np.linalg.eigvalsh(H)
    return "minimum" if (ev > 0).all() else "maximum" if (ev < 0).all() else "saddle"
    ### END SOLUTION

# %%
check(lambda: [kind(np.diag([3, 1])), kind(np.diag([-1, -2])), kind(np.array([[1, 2], [2, 1]]))] == ["minimum", "maximum", "saddle"], "[[1, 2], [2, 1]] has eigenvalues 3 and −1: a saddle")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 5, probability and loss.
