# %% [markdown]
# # Practice: maximum likelihood, priors and ridge
# *AI from scratch, probability 3* · lesson: https://ihor.sh/ai/p3-mle-and-map.html
#
# Fit distributions by maximum likelihood (by formula, by SciPy, by gradient descent in PyTorch), watch the central
# limit theorem, update a Beta prior, and confirm that ridge regression is MAP with a Gaussian prior.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# On Kaggle, turn on *Internet* in the notebook settings for part 1's data.

# %%
import json, urllib.request
import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

rng = np.random.default_rng(0)

# %% [markdown]
# ## 1. MLE for a log-normal: the outage durations
# Probability 2 found outage hours roughly log-normal: their logs are roughly normal. The MLE of a normal is the
# sample mean and the variance dividing by n. Set `mu_hat` and `sigma_hat` for the natural log of `hours`, and
# check them against SciPy's fitter `stats.norm.fit`.

# %%
DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
hours = np.array([r[0] for r in json.load(urllib.request.urlopen(DATA + "outages.json"))["rows"]])
mu_hat = sigma_hat = None
### BEGIN SOLUTION
logs = np.log(hours)
mu_hat, sigma_hat = logs.mean(), logs.std()
### END SOLUTION
print(mu_hat, sigma_hat, " typical outage:", np.exp(mu_hat) if mu_hat is not None else None, "hours")

# %%
check(lambda: np.allclose([mu_hat, sigma_hat], stats.norm.fit(np.log(hours))), "the same as SciPy's maximum-likelihood fit")
check(lambda: abs(np.exp(mu_hat) - 1.85) < 0.1, "e^μ̂ ≈ 1.85 h: close to the median, as a log-normal's should be")

# %% [markdown]
# ## 2. MLE by gradient descent
# The same fit without a formula: minimize the negative log-likelihood of a normal,
# $\sum_i \frac{(x_i - \mu)^2}{2\sigma^2} + n \ln \sigma$, over μ and $s = \ln\sigma$ (so σ stays positive) with
# PyTorch and `torch.optim.Adam(lr=0.05)` for 1000 steps. Set `mu_gd` and `sigma_gd`.

# %%
import torch
x = torch.tensor(np.log(hours))
mu_gd = sigma_gd = None
### BEGIN SOLUTION
mu = torch.zeros((), requires_grad=True, dtype=torch.float64); s = torch.zeros((), requires_grad=True, dtype=torch.float64)
opt = torch.optim.Adam([mu, s], lr=0.05)
for _ in range(1000):
    opt.zero_grad()
    nll = ((x - mu) ** 2 / (2 * torch.exp(2 * s))).sum() + len(x) * s
    nll.backward(); opt.step()
mu_gd, sigma_gd = mu.item(), torch.exp(s).item()
### END SOLUTION
print(mu_gd, sigma_gd)

# %%
check(lambda: abs(mu_gd - mu_hat) < 1e-3 and abs(sigma_gd - sigma_hat) < 1e-3, "gradient descent lands on the formula's answer")

# %% [markdown]
# ## 3. The central limit theorem
# Make 100,000 sums of 30 exponential waits each (`rng.exponential(4, (100_000, 30)).sum(axis=1)`). A single wait
# is very skewed (skewness 2). Set `skew_sum` (`stats.skew`) and plot the histogram: the sum is nearly a bell.

# %%
skew_sum = None
### BEGIN SOLUTION
sums = rng.exponential(4, (100_000, 30)).sum(axis=1)
skew_sum = stats.skew(sums)
plt.hist(sums, bins=80, density=True); plt.title("sums of 30 waits"); plt.show()
### END SOLUTION
print(skew_sum)

# %%
check(lambda: 0.2 < skew_sum < 0.5, "skewness falls like 2/√30 ≈ 0.37: well on its way to a bell")

# %% [markdown]
# ## 4. A Beta prior meets a coin
# A coin of unknown bias. Prior Beta(2, 2). You see 7 heads in 10 flips. Set `a_post`, `b_post` (the posterior's
# parameters), `p_map` (its peak), and `interval`: the central 95% credible interval (`stats.beta.ppf` at 0.025 and
# 0.975).

# %%
a_post = b_post = p_map = interval = None
### BEGIN SOLUTION
a_post, b_post = 2 + 7, 2 + 3
p_map = (a_post - 1) / (a_post + b_post - 2)
interval = stats.beta.ppf([0.025, 0.975], a_post, b_post)
### END SOLUTION
print(a_post, b_post, p_map, interval)

# %%
check(lambda: (a_post, b_post) == (9, 5) and np.isclose(p_map, 2 / 3), "posterior Beta(9, 5), peak 8/12")
check(lambda: interval[0] < 0.5 < interval[1], "with only 10 flips, a fair coin is still plausible")

# %% [markdown]
# ## 5. Ridge is MAP
# For a linear model with Gaussian noise σ and a Gaussian prior on the weights with spread τ, the MAP weights solve
# $(X^\top X + \lambda I) w = X^\top y$ with $\lambda = \sigma^2/\tau^2$. On the standardized diabetes data
# (no intercept: center y), set `w_map` from that formula with λ = 50, and `w_ridge` from
# `Ridge(alpha=50, fit_intercept=False)`.

# %%
from sklearn.datasets import load_diabetes
from sklearn.linear_model import Ridge
d = load_diabetes()
X = (d.data - d.data.mean(0)) / d.data.std(0); y = d.target - d.target.mean()
w_map = w_ridge = None
### BEGIN SOLUTION
w_map = np.linalg.solve(X.T @ X + 50 * np.eye(X.shape[1]), X.T @ y)
w_ridge = Ridge(alpha=50, fit_intercept=False).fit(X, y).coef_
### END SOLUTION
print(np.round(w_map, 2) if w_map is not None else None)

# %%
check(lambda: np.allclose(w_map, w_ridge), "the formula and scikit-learn agree: ridge is MAP")
check(lambda: np.linalg.norm(w_map) < np.linalg.norm(np.linalg.lstsq(X, y, rcond=None)[0]), "the prior shrinks the weights")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: deep networks, layer by layer.
