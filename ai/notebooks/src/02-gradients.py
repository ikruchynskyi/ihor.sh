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

# %% [markdown]
# ## 1. A derivative by nudging
# Write `derivative(f, x, h=1e-5)` using the **centered** difference $\frac{f(x+h) - f(x-h)}{2h}$.

# %%
def derivative(f, x, h=1e-5):
    """Estimate derivative f'(x) using central difference approximation.
    
    Formula: (f(x + h) - f(x - h)) / (2 * h)
    
    Args:
        f: Callable scalar mathematical function.
        x: Float evaluation point.
        h: Float small step size (default 1e-5).
    Returns:
        float: Approximate slope f'(x).
    """
    ### HINT Evaluate f(x + h) and f(x - h).
    ### HINT Return (f(x + h) - f(x - h)) / (2 * h).
    ### BEGIN SOLUTION
    return (f(x + h) - f(x - h)) / (2 * h)
    ### END SOLUTION

# %%
check(lambda: np.isclose(derivative(lambda x: x ** 3, 2), 12), 
      "d/dx x^3 = 3x^2, which equals 12 when evaluated at x = 2.")
check(lambda: np.isclose(derivative(np.sin, 0), 1), 
      "d/dx sin(x) = cos(x), which equals 1.0 when evaluated at x = 0.")

# %% [markdown]
# ## 2. Gradient descent on a bumpy curve
# $f(x) = x^4 - 3x^2 + x$ has two valleys. Write `descend(x, lr, steps)` that repeats `x = x - lr * f'(x)`
# (use your `derivative`) and returns the final `x`. Then run it from x = −2 and from x = 2.
# Which valley you end in depends on where you start: gradient descent finds *a* bottom, not *the* bottom.

# %%
def f(x):
    return x ** 4 - 3 * x ** 2 + x

def descend(x, lr=0.01, steps=500):
    """Perform gradient descent optimization on f(x).
    
    Args:
        x: Float starting location.
        lr: Float learning rate step size.
        steps: Integer number of iterations.
    Returns:
        float: Final x position after optimization.
    """
    ### HINT In each step, calculate numerical slope with derivative(f, x).
    ### HINT Update x by taking a step downhill: x = x - lr * slope.
    ### HINT Return final optimized position x.
    ### BEGIN SOLUTION
    for _ in range(steps):
        x = x - lr * derivative(f, x)
    return x
    ### END SOLUTION

left, right = descend(-2.0), descend(2.0)
print("from −2 →", left, " from 2 →", right)
xs = np.linspace(-2.2, 2.2, 200); plt.plot(xs, f(xs)); plt.grid(alpha=0.3); plt.show()

# %%
check(lambda: abs(left + 1.30) < 0.01 and abs(right - 1.13) < 0.01, 
      "Starting at -2.0 should converge near -1.30, and starting at 2.0 should converge near +1.13.")
check(lambda: f(left) < f(right), 
      "The left local minimum f(-1.30) should be strictly deeper than the right local minimum f(1.13).")

# %% [markdown]
# ## 3. Too big a step
# For $f(x) = x^2$ the step is `x = x - lr * 2x`. Find the learning rates that make it blow up: set `diverges` to a
# list of the values in `rates` for which |x| after 50 steps from x = 1 is bigger than 1.

# %%
rates = [0.1, 0.5, 0.9, 0.99, 1.01, 1.1, 1.5]
diverges = None
### HINT Simulate 50 steps: x = x - lr * 2 * x starting from x = 1.0.
### HINT Filter `rates` for values where |x| after 50 steps is strictly greater than 1.0.
### BEGIN SOLUTION
def after(lr, x=1.0):
    for _ in range(50):
        x = x - lr * 2 * x
    return x
diverges = [lr for lr in rates if abs(after(lr)) > 1]
### END SOLUTION
print(diverges)

# %%
check(lambda: diverges == [1.01, 1.1, 1.5], 
      "Learning rates strictly above 1.0 (2/k for curvature k=2) must diverge: [1.01, 1.1, 1.5].")

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
### HINT In each of 300 steps, compute residual r = w * x + b - y.
### HINT Update w = w - lr * np.mean(2 * r * x).
### HINT Update b = b - lr * np.mean(2 * r).
### BEGIN SOLUTION
for step in range(300):
    r = w * x + b - y
    w, b = w - lr * np.mean(2 * r * x), b - lr * np.mean(2 * r)
### END SOLUTION
print("w =", w, " b =", b)
plt.scatter(x, y, s=8); plt.plot(np.sort(x), w * np.sort(x) + b, "r"); plt.xlabel("BMI (scaled)"); plt.show()

# %%
w_exact, b_exact = np.polyfit(x, y, 1)
check(lambda: abs(w - w_exact) < 0.1 and abs(b - b_exact) < 0.1, 
      f"Weights after 300 steps should match least squares: w ≈ {w_exact:.1f}, b ≈ {b_exact:.1f}.")

# %% [markdown]
# ## 5. Let PyTorch find the gradients
# PyTorch tracks every operation on a tensor made with `requires_grad=True`. Call `.backward()` on the loss and
# each tensor's `.grad` holds its derivative: no formulas by hand. The loop below is the same training as part 4.
# Fill in its first two lines: compute `loss`, the mean squared error, with tensor arithmetic (it reads just like
# NumPy, with `.mean()` at the end), then call `loss.backward()`. The update is written for you.

# %%
import torch
xt, yt = torch.tensor(x, dtype=torch.float32), torch.tensor(y, dtype=torch.float32)
wt = torch.zeros(1, requires_grad=True)
bt = torch.zeros(1, requires_grad=True)
for step in range(300):
    ### HINT The model's guess is wt * xt + bt; the loss is the mean of (guess - yt) squared.
    ### HINT loss = ((wt * xt + bt - yt) ** 2).mean(), then on the next line: loss.backward()
    ### BEGIN SOLUTION
    loss = ((wt * xt + bt - yt) ** 2).mean()
    loss.backward()
    ### END SOLUTION
    if wt.grad is None:
        break                           # backward() hasn't run yet: finish the two lines above first
    with torch.no_grad():               # "don't record this": the update itself is not part of the model
        wt -= 0.1 * wt.grad
        bt -= 0.1 * bt.grad
    wt.grad.zero_(); bt.grad.zero_()    # gradients add up across backward() calls unless you clear them
print("PyTorch:", wt.item(), bt.item())

# %%
check(lambda: abs(wt.item() - w_exact) < 0.1 and abs(bt.item() - b_exact) < 0.1, 
      "PyTorch autograd training should converge to the exact least-squares solution.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · fast.ai lesson 3 builds this same "SGD from scratch" idea up to a neural
# network: https://course.fast.ai/Lessons/lesson3.html
