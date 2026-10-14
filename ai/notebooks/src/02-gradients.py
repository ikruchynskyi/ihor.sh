# %% [markdown]
# # Practice: gradients and gradient descent
# *AI from scratch, chapter 2* · lesson: https://ihor.sh/ai/02-gradients.html
#
# Derivatives by nudging, gradient descent by hand, a line fitted to real data, and then the same training loop
# with **PyTorch's autograd**, which computes gradients for you: the engine of every later lesson.
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
# ## 1. A derivative by nudging
# Write `derivative(f, x, h=1e-5)` using the **centered** difference $\frac{f(x+h) - f(x-h)}{2h}$.

# %%
def derivative(f, x, h=1e-5):
    ### BEGIN SOLUTION
    return (f(x + h) - f(x - h)) / (2 * h)
    ### END SOLUTION

# %%
check(lambda: np.isclose(derivative(lambda x: x ** 3, 2), 12), "d/dx x³ = 3x² = 12 at x = 2")
check(lambda: np.isclose(derivative(np.sin, 0), 1), "d/dx sin x = cos x = 1 at 0")

# %% [markdown]
# ## 2. Gradient descent on a bumpy curve
# $f(x) = x^4 - 3x^2 + x$ has two valleys. Write `descend(x, lr, steps)` that repeats `x = x - lr * f'(x)`
# (use your `derivative`) and returns the final `x`. Then run it from x = −2 and from x = 2.
# Which valley you end in depends on where you start: gradient descent finds *a* bottom, not *the* bottom.

# %%
def f(x):
    return x ** 4 - 3 * x ** 2 + x

def descend(x, lr=0.01, steps=500):
    ### BEGIN SOLUTION
    for _ in range(steps):
        x = x - lr * derivative(f, x)
    return x
    ### END SOLUTION

left, right = descend(-2.0), descend(2.0)
print("from −2 →", left, " from 2 →", right)
xs = np.linspace(-2.2, 2.2, 200); plt.plot(xs, f(xs)); plt.grid(alpha=0.3); plt.show()

# %%
check(lambda: abs(left + 1.30) < 0.01 and abs(right - 1.13) < 0.01, "the valleys are near −1.30 and 1.13")
check(lambda: f(left) < f(right), "the left valley is deeper: starting on the right misses it")

# %% [markdown]
# ## 3. Too big a step
# For $f(x) = x^2$ the step is `x = x - lr * 2x`. Find the learning rates that make it blow up: set `diverges` to a
# list of the values in `rates` for which |x| after 50 steps from x = 1 is bigger than 1.

# %%
rates = [0.1, 0.5, 0.9, 0.99, 1.01, 1.1, 1.5]
diverges = None
### BEGIN SOLUTION
def after(lr, x=1.0):
    for _ in range(50):
        x = x - lr * 2 * x
    return x
diverges = [lr for lr in rates if abs(after(lr)) > 1]
### END SOLUTION
print(diverges)

# %%
check(lambda: diverges == [1.01, 1.1, 1.5], "anything above 1 (= 2/k with curvature k = 2) explodes; Calculus 3 explains")

# %% [markdown]
# ## 4. Fit a line to real data
# From scikit-learn's diabetes data: body-mass index (standardized) vs a disease-progression score.
# Fit `y ≈ w x + b` by gradient descent on the mean squared error. Use the gradients
# $\partial L/\partial w = \text{mean}(2 r x)$, $\partial L/\partial b = \text{mean}(2r)$ with residual $r = wx + b - y$.

# %%
from sklearn.datasets import load_diabetes
d = load_diabetes()
x = (d.data[:, 2] - d.data[:, 2].mean()) / d.data[:, 2].std()      # BMI, scaled to mean 0, spread 1
y = d.target
w, b, lr = 0.0, 0.0, 0.1
### BEGIN SOLUTION
for step in range(300):
    r = w * x + b - y
    w, b = w - lr * np.mean(2 * r * x), b - lr * np.mean(2 * r)
### END SOLUTION
print("w =", w, " b =", b)
plt.scatter(x, y, s=8); plt.plot(np.sort(x), w * np.sort(x) + b, "r"); plt.xlabel("BMI (scaled)"); plt.show()

# %%
w_exact, b_exact = np.polyfit(x, y, 1)
check(lambda: abs(w - w_exact) < 0.1 and abs(b - b_exact) < 0.1, f"should match least squares: w ≈ {w_exact:.1f}, b ≈ {b_exact:.1f}")

# %% [markdown]
# ## 5. Let PyTorch find the gradients
# PyTorch tracks every operation on a tensor made with `requires_grad=True`. Call `.backward()` on the loss and
# each tensor's `.grad` holds its derivative: no formulas by hand. Write the same training loop with autograd:
# compute `loss`, call `loss.backward()`, update `w` and `b` inside `torch.no_grad()`, then zero their `.grad`.

# %%
import torch
xt, yt = torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.float32)
wt = torch.zeros(1, requires_grad=True)
bt = torch.zeros(1, requires_grad=True)
for step in range(300):
    ### BEGIN SOLUTION
    loss = ((wt * xt + bt - yt) ** 2).mean()
    loss.backward()
    with torch.no_grad():
        wt -= 0.1 * wt.grad
        bt -= 0.1 * bt.grad
    wt.grad.zero_(); bt.grad.zero_()
    ### END SOLUTION
print("PyTorch:", wt.item(), bt.item())

# %%
check(lambda: abs(wt.item() - w_exact) < 0.1 and abs(bt.item() - b_exact) < 0.1, "autograd lands on the same line")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · fast.ai lesson 3 builds this same "SGD from scratch" idea up to a neural
# network: https://course.fast.ai/Lessons/lesson3.html
