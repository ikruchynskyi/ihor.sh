# %% [markdown]
# # Practice: math warm-up in NumPy
# *AI from scratch, Start 3* · lesson: https://ihor.sh/ai/s3-math-warm-up.html
#
# Functions, powers, logs and Σ, the way ML code writes them: as NumPy operations on whole arrays.
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
# ## 1. Functions on whole arrays
# Write `sigmoid(z)` = $1 / (1 + e^{-z})$ with `np.exp`, so it works on a single number and on an array.
# Then plot it, together with $e^x$ and $\ln x$, for x from −4 to 4 (`np.linspace`).

# %%
def sigmoid(z):
    ### BEGIN SOLUTION
    return 1 / (1 + np.exp(-z))
    ### END SOLUTION

x = np.linspace(-4, 4, 200)
plt.plot(x, sigmoid(x) if sigmoid(0) is not None else 0 * x, label="sigmoid")
plt.plot(x, np.exp(x), label="exp")
plt.plot(x[x > 0], np.log(x[x > 0]), label="ln")
plt.ylim(-3, 5); plt.legend(); plt.grid(alpha=0.3); plt.show()

# %%
check(lambda: sigmoid(0) == 0.5, "sigmoid(0) is exactly 0.5")
check(lambda: np.allclose(sigmoid(np.array([-100, 100])), [0, 1]), "far left → 0, far right → 1, on arrays too")

# %% [markdown]
# ## 2. Powers and scientific notation
# Set `lr` to the learning rate written `3e-4`, but computed from powers: 3 times 10 to the −4 (`**`).
# Set `params` to 7 billion written as `7e9`, then compute how many **gigabytes** those parameters take if each is
# a 2-byte number (1 GB = $10^9$ bytes). That's the memory math of stage 4.

# %%
lr = params = gigabytes = None
### BEGIN SOLUTION
lr = 3 * 10 ** -4
params = 7e9
gigabytes = params * 2 / 1e9
### END SOLUTION
print(lr, params, gigabytes)

# %%
check(lambda: np.isclose(lr, 0.0003), "3 · 10⁻⁴ = 0.0003")
check(lambda: gigabytes == 14, "7 billion × 2 bytes = 14 GB")

# %% [markdown]
# ## 3. Logs turn products into sums
# A model gave each of 5000 test examples the probability below for the right answer. Compute
# - `product`: all of them multiplied (`np.prod`), and
# - `log_likelihood`: the sum of their natural logs (`np.log`, `np.sum`).
# One of them is useless. Which, and why?

# %%
rng = np.random.default_rng(0)
probs = rng.uniform(0.5, 0.99, 5000)
product = log_likelihood = None
### BEGIN SOLUTION
product = np.prod(probs)
log_likelihood = np.sum(np.log(probs))
### END SOLUTION
print("product:", product, " log-likelihood:", log_likelihood)

# %%
check(lambda: product is not None and product < 1e-300, "5000 numbers below 1 multiply out to 0, or the tiniest float a computer has (5e-324): useless either way")
check(lambda: np.isclose(log_likelihood, np.log(probs).sum()), "Σ ln p, a perfectly usable number")

# %% [markdown]
# ## 4. Σ is a loop, or one NumPy call
# Compute $\sum_{i=1}^{100} \frac{1}{i^2}$ two ways: `loop_sum` with a `for` loop, and `np_sum` with
# `np.arange` and `np.sum`. (The infinite sum is $\pi^2/6$: a famous result.)

# %%
loop_sum = np_sum = None
### BEGIN SOLUTION
loop_sum = 0
for i in range(1, 101):
    loop_sum += 1 / i ** 2
i = np.arange(1, 101)
np_sum = np.sum(1 / i ** 2)
### END SOLUTION
print(loop_sum, np_sum, np.pi ** 2 / 6)

# %%
check(lambda: np.isclose(loop_sum, np_sum) and abs(np_sum - 1.635) < 0.001, "both should be about 1.635")

# %% [markdown]
# ## 5. Formulas into code
# Translate each formula into one line of NumPy, using the arrays below:
# - `y_hat` = $\sigma(w x + b)$ for every example
# - `L` = $\frac{1}{n}\sum_i (\hat y_i - y_i)^2$
# - `theta_new` = $\theta - \eta\, g$ for the knob vector `theta`, step size `eta`, gradient `g`

# %%
x = np.array([2.0, -1.0, 0.5, 3.0]); y = np.array([1, 0, 1, 1]); w, b = 2.0, -1.0
theta = np.array([3.0, -1.0]); eta = 0.1; g = np.array([4.0, -2.0])
y_hat = L = theta_new = None
### BEGIN SOLUTION
y_hat = sigmoid(w * x + b)
L = np.mean((y_hat - y) ** 2)
theta_new = theta - eta * g
### END SOLUTION
print(y_hat, L, theta_new)

# %%
check(lambda: np.allclose(y_hat, 1 / (1 + np.exp(-(2 * x - 1)))), "σ applied to every w·x + b")
check(lambda: abs(L - 0.0636) < 1e-3, "the mean squared error is about 0.0636")
check(lambda: np.allclose(theta_new, [2.6, -0.8]), "θ − η·g = [2.6, −0.8]")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next lesson: chapter 1, matrices are moves.
