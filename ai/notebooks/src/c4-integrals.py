# %% [markdown]
# # Practice: integrals, densities and minibatch noise
# *AI from scratch, calculus 4* · lesson: https://ihor.sh/ai/c4-integrals.html
#
# Areas by strips and by SciPy, probabilities as areas under the bell curve, Monte Carlo and its 1/√N error, and the
# reason minibatch training works: a batch's gradient is a noisy guess at the full one, with noise shrinking like 1/√B.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt
from scipy import integrate, stats

# %% [markdown]
# ## 1. Area by strips
# `midpoint(f, a, b, n)` cuts [a, b] into n strips of width `dx` = (b − a)/n; `x` holds the middle of every strip.
# Finish it: each strip's area is f at its middle times `dx`, and the integral is the sum of the areas. Then compare
# it with `integrate.quad` on $\int_0^2 e^{-x^2} dx$.

# %%
def midpoint(f, a, b, n):
    """Numerical integration of f from a to b using the midpoint rule with n strips.
    
    Args:
        f: Callable function f(x) accepting float or array of floats.
        a: Float lower integration limit.
        b: Float upper integration limit.
        n: Integer number of subdivisions (strips).
    Returns:
        Float approximation of the definite integral.
    """
    dx = (b - a) / n
    x = a + (np.arange(n) + 0.5) * dx            # the middle of every strip, as one array
    ### HINT f(x) gives all n heights at once; multiply by dx for the areas, then add them up with np.sum.
    ### HINT return np.sum(f(x)) * dx
    ### BEGIN SOLUTION
    return np.sum(f(x)) * dx
    ### END SOLUTION

g = lambda x: np.exp(-x ** 2)
exact = integrate.quad(g, 0, 2)[0]
print(exact, midpoint(g, 0, 2, 10), midpoint(g, 0, 2, 1000))

# %%
check(lambda: abs(midpoint(g, 0, 2, 1000) - exact) < 1e-6, 
      "midpoint with 1000 strips should approximate the exact quad integral to within 1e-6.")
check(lambda: abs(midpoint(g, 0, 2, 10) - exact) / abs(midpoint(g, 0, 2, 100) - exact) > 50, 
      "Midpoint rule has O(h^2) error: 10x more strips should decrease error by roughly 100x (>50x).")

# %% [markdown]
# ## 2. Probability is area
# For the standard normal, set `within_1` = P(−1 < X < 1) by integrating its density `pdf` (`stats.norm.pdf`) with `quad`,
# and `within_1_cdf` the same from the CDF `cdf`: `norm.cdf(1) − norm.cdf(−1)`. Then `p_tail` = P(X > 2).

# %%
within_1 = within_1_cdf = p_tail = None
### HINT Use integrate.quad(stats.norm.pdf, -1, 1)[0] to get the area between -1 and 1.
### HINT Use stats.norm.cdf(1) - stats.norm.cdf(-1) for the CDF formula.
### HINT Use 1 - stats.norm.cdf(2) to find the right-tail probability P(X > 2).
### BEGIN SOLUTION
within_1 = integrate.quad(stats.norm.pdf, -1, 1)[0]
within_1_cdf = stats.norm.cdf(1) - stats.norm.cdf(-1)
p_tail = 1 - stats.norm.cdf(2)
### END SOLUTION
print(within_1, within_1_cdf, p_tail)

# %%
check(lambda: np.isclose(within_1, 0.6827, atol=1e-4) and np.isclose(within_1, within_1_cdf), 
      "About 68.27% of probability mass lies within 1 standard deviation for a standard normal.")
check(lambda: np.isclose(p_tail, 0.0228, atol=1e-4), 
      "P(X > 2) should be approximately 0.0228 (one-sided 2-sigma tail).")

# %% [markdown]
# ## 3. Monte Carlo and its 1/√N error
# Estimate $E[X^2] = 1$ for a standard normal by averaging $x^2$ over N random draws, 200 times for each N in `Ns`.
# Set `spread`: the standard deviation of those 200 estimates for each N using `std` (`np.std`). On a log-log plot the slope should be −½.

# %%
rng = np.random.default_rng(0)
Ns = [10, 100, 1000, 10_000]
spread = None
### HINT For each N in Ns, compute 200 sample estimates: np.mean(rng.standard_normal(N) ** 2).
### HINT Compute np.std of those 200 estimates for each N.
### HINT Store the list of standard deviations in `spread`.
### BEGIN SOLUTION
spread = [np.std([np.mean(rng.standard_normal(N) ** 2) for _ in range(200)]) for N in Ns]
### END SOLUTION
if spread is not None and len(spread):
    plt.loglog(Ns, spread, "o-", label="measured"); plt.loglog(Ns, np.sqrt(2) / np.sqrt(Ns), "--", label="√2/√N"); plt.legend(); plt.show()
print(spread)

# %%
slope = lambda s: np.polyfit(np.log(Ns), np.log(s), 1)[0]
check(lambda: abs(slope(spread) + 0.5) < 0.1, 
      "Monte Carlo estimation error standard deviation falls at rate N^(-1/2) (slope on log-log plot ≈ -0.5).")

# %% [markdown]
# ## 4. Minibatch gradients are noisy guesses
# Linear regression on the diabetes data: the **full** gradient uses all 442 patients; a **minibatch** gradient uses
# a random B of them. For each B in `Bs`, draw 300 minibatches and set `noise`: the average distance
# $\lVert g_B - g_{\text{full}} \rVert$. It should fall roughly like $1/\sqrt{B}$.

# %%
from sklearn.datasets import load_diabetes
d = load_diabetes()
X = np.column_stack([(d.data - d.data.mean(0)) / d.data.std(0), np.ones(len(d.data))]); y = d.target
w = np.zeros(X.shape[1])
grad = lambda Xb, yb: 2 / len(yb) * Xb.T @ (Xb @ w - yb)
g_full = grad(X, y)
Bs = [4, 16, 64, 256]

def batch_distance(B):
    "How far one random minibatch's gradient lands from the full gradient."
    i = rng.choice(len(y), B, replace=False)            # B different patients
    return np.linalg.norm(grad(X[i], y[i]) - g_full)

noise = None
### HINT Start with noise = [], then for each B append the mean of 300 calls of batch_distance(B).
### HINT A comprehension makes the 300: [batch_distance(B) for _ in range(300)]
### HINT noise = [], for B in Bs:, then indented: noise.append(np.mean([batch_distance(B) for _ in range(300)]))
### BEGIN SOLUTION
noise = []
for B in Bs:
    noise.append(np.mean([batch_distance(B) for _ in range(300)]))
### END SOLUTION
print(dict(zip(Bs, np.round(noise, 1))) if noise else noise)

# %%
check(lambda: noise[0] / noise[2] > 3 and noise[1] / noise[3] > 3, 
      "Increasing batch size 16x should reduce gradient noise by ~4x (1/sqrt(B) scaling).")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 3, MLE and MAP.
