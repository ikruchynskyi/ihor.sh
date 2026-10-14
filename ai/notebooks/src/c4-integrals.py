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

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. Area by strips
# Write `midpoint(f, a, b, n)`: the sum of n strips of width (b − a)/n, each as tall as f at its middle. Compare it
# with `integrate.quad` on $\int_0^2 e^{-x^2} dx$.

# %%
def midpoint(f, a, b, n):
    ### BEGIN SOLUTION
    dx = (b - a) / n
    x = a + (np.arange(n) + 0.5) * dx
    return np.sum(f(x)) * dx
    ### END SOLUTION

g = lambda x: np.exp(-x ** 2)
exact = integrate.quad(g, 0, 2)[0]
print(exact, midpoint(g, 0, 2, 10), midpoint(g, 0, 2, 1000))

# %%
check(lambda: abs(midpoint(g, 0, 2, 1000) - exact) < 1e-6, "1000 strips are accurate to about 7 digits")
check(lambda: abs(midpoint(g, 0, 2, 10) - exact) / abs(midpoint(g, 0, 2, 100) - exact) > 50, "10× more strips cut the error about 100× (h² accuracy)")

# %% [markdown]
# ## 2. Probability is area
# For the standard normal, set `within_1` = P(−1 < X < 1) by integrating its density `stats.norm.pdf` with `quad`,
# and `within_1_cdf` the same from the CDF: `norm.cdf(1) − norm.cdf(−1)`. Then `p_tail` = P(X > 2).

# %%
within_1 = within_1_cdf = p_tail = None
### BEGIN SOLUTION
within_1 = integrate.quad(stats.norm.pdf, -1, 1)[0]
within_1_cdf = stats.norm.cdf(1) - stats.norm.cdf(-1)
p_tail = 1 - stats.norm.cdf(2)
### END SOLUTION
print(within_1, within_1_cdf, p_tail)

# %%
check(lambda: np.isclose(within_1, 0.6827, atol=1e-4) and np.isclose(within_1, within_1_cdf), "about 68% within one standard deviation")
check(lambda: np.isclose(p_tail, 0.0228, atol=1e-4), "about 2.3% beyond two standard deviations, one side")

# %% [markdown]
# ## 3. Monte Carlo and its 1/√N error
# Estimate $E[X^2] = 1$ for a standard normal by averaging $x^2$ over N random draws, 200 times for each N in `Ns`.
# Set `spread`: the standard deviation of those 200 estimates for each N. On a log-log plot the slope should be −½.

# %%
rng = np.random.default_rng(0)
Ns = [10, 100, 1000, 10_000]
spread = None
### BEGIN SOLUTION
spread = [np.std([np.mean(rng.standard_normal(N) ** 2) for _ in range(200)]) for N in Ns]
plt.loglog(Ns, spread, "o-", label="measured"); plt.loglog(Ns, np.sqrt(2) / np.sqrt(Ns), "--", label="√2/√N"); plt.legend(); plt.show()
### END SOLUTION
print(spread)

# %%
slope = lambda s: np.polyfit(np.log(Ns), np.log(s), 1)[0]
check(lambda: abs(slope(spread) + 0.5) < 0.1, "the error falls like N^(−1/2): 100× more samples, 10× smaller error")

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
noise = None
### BEGIN SOLUTION
noise = []
for B in Bs:
    dists = []
    for _ in range(300):
        i = rng.choice(len(y), B, replace=False)
        dists.append(np.linalg.norm(grad(X[i], y[i]) - g_full))
    noise.append(np.mean(dists))
### END SOLUTION
print(dict(zip(Bs, np.round(noise, 1))) if noise else noise)

# %%
check(lambda: noise[0] / noise[2] > 3 and noise[1] / noise[3] > 3, "16× bigger batch → about 4× less noise")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 3, MLE and MAP.
