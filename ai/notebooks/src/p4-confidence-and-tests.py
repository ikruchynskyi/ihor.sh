# %% [markdown]
# # Practice: is model B really better?
# *AI from scratch, probability 4* · lesson: https://ihor.sh/ai/p4-confidence-and-tests.html
#
# Confidence intervals by formula and by bootstrap, a proper comparison of two models on one test set (paired test
# and paired bootstrap), sample sizes for an A/B test, and peeking, simulated.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
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
# ## 1. A confidence interval, two ways
# 25 measured response times (ms). Set `ci_t`: the 95% interval for the mean from the t-distribution
# (`stats.t.interval(0.95, df=n-1, loc=mean, scale=std/√n)`, with `ddof=1`), and `ci_boot`: a **bootstrap** interval:
# resample the data with replacement 10,000 times, take each resample's mean, and use the 2.5th and 97.5th percentiles.

# %%
times = rng.lognormal(mean=4.5, sigma=0.4, size=25)
ci_t = ci_boot = None
### BEGIN SOLUTION
n = len(times)
ci_t = stats.t.interval(0.95, df=n - 1, loc=times.mean(), scale=times.std(ddof=1) / np.sqrt(n))
boot = rng.choice(times, size=(10_000, n), replace=True).mean(axis=1)
ci_boot = np.percentile(boot, [2.5, 97.5])
### END SOLUTION
print(times.mean(), ci_t, ci_boot)

# %%
check(lambda: ci_t[0] < times.mean() < ci_t[1] and ci_boot[0] < times.mean() < ci_boot[1], "both intervals contain the sample mean")
check(lambda: abs((ci_t[1] - ci_t[0]) - (ci_boot[1] - ci_boot[0])) < 0.3 * (ci_t[1] - ci_t[0]), "and they roughly agree in width")

# %% [markdown]
# ## 2. Two models, one test set
# Logistic regression vs a decision tree on the breast-cancer data. Set `acc_a`, `acc_b`, and the disagreement
# counts `b_only` (A right, B wrong) and `c_only` (A wrong, B right). Then `p_mcnemar`: the exact McNemar test,
# `stats.binomtest(c_only, b_only + c_only, 0.5).pvalue`.

# %%
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
d = load_breast_cancer()
Xtr, Xte, ytr, yte = train_test_split(d.data, d.target, test_size=0.5, random_state=1)
pa = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(Xtr, ytr).predict(Xte)
pb = DecisionTreeClassifier(max_depth=3, random_state=0).fit(Xtr, ytr).predict(Xte)
acc_a = acc_b = b_only = c_only = p_mcnemar = None
### BEGIN SOLUTION
ra, rb = pa == yte, pb == yte
acc_a, acc_b = ra.mean(), rb.mean()
b_only, c_only = int((ra & ~rb).sum()), int((~ra & rb).sum())
p_mcnemar = stats.binomtest(c_only, b_only + c_only, 0.5).pvalue
### END SOLUTION
print(acc_a, acc_b, b_only, c_only, p_mcnemar)

# %%
check(lambda: acc_a > acc_b and b_only > c_only, "logistic regression wins more of the disagreements")
check(lambda: p_mcnemar == stats.binomtest(c_only, b_only + c_only, 0.5).pvalue, "the exact McNemar p-value")

# %% [markdown]
# ## 3. A paired bootstrap for the difference
# Resample **test examples** (not models) 10,000 times; for each resample compute accuracy A − accuracy B on the
# same examples. Set `diff_ci`: the 95% interval of that difference. If it excludes 0, A is better on data like this.

# %%
diff_ci = None
### BEGIN SOLUTION
idx = rng.integers(0, len(yte), size=(10_000, len(yte)))
diffs = (pa[idx] == yte[idx]).mean(1) - (pb[idx] == yte[idx]).mean(1)
diff_ci = np.percentile(diffs, [2.5, 97.5])
### END SOLUTION
print("A − B:", acc_a - acc_b if acc_a is not None else None, " 95% interval:", diff_ci)

# %%
check(lambda: diff_ci[0] < acc_a - acc_b < diff_ci[1], "the interval surrounds the observed difference")

# %% [markdown]
# ## 4. How many users does an A/B test need?
# Write `n_per_group(p, lift)` with the rule of thumb $n \approx 16\,p(1-p)/\delta^2$ (α = 0.05, 80% power). Then
# check it by simulation: with that n per group, baseline 10% and a real lift to 11%, run 500 tests and set `power`:
# the share where a two-proportion z-test gives p < 0.05.

# %%
def n_per_group(p, lift):
    ### BEGIN SOLUTION
    return round(16 * p * (1 - p) / lift ** 2)        # round, not ceil: 0.1·0.9/0.01² is 14400.000000000002 in floating point
    ### END SOLUTION

power = None
### BEGIN SOLUTION
n = n_per_group(0.10, 0.01)
a = rng.binomial(n, 0.10, 500) / n; b = rng.binomial(n, 0.11, 500) / n
pooled = (a + b) / 2
z = (b - a) / np.sqrt(2 * pooled * (1 - pooled) / n)
power = (2 * stats.norm.sf(np.abs(z)) < 0.05).mean()
### END SOLUTION
print(n_per_group(0.10, 0.01), power)

# %%
check(lambda: n_per_group(0.10, 0.01) == 14_400, "16 × 0.1 × 0.9 / 0.01² = 14,400 per group")
check(lambda: 0.72 < power < 0.88, "and that size really detects the lift about 80% of the time")

# %% [markdown]
# ## 5. Peeking, simulated
# 1,000 A/A tests (no real difference), 5,000 visitors per arm, 10% conversion. Check after every 250 visitors and
# stop at the first p < 0.05. Set `false_rate`: the share of tests that declare a winner anyway.

# %%
false_rate = None
### BEGIN SOLUTION
A = rng.random((1000, 5000)) < 0.1; B = rng.random((1000, 5000)) < 0.1
looks = np.arange(250, 5001, 250)
ra_, rb_ = A.cumsum(1)[:, looks - 1] / looks, B.cumsum(1)[:, looks - 1] / looks
pool = (ra_ + rb_) / 2
zz = (rb_ - ra_) / np.sqrt(2 * pool * (1 - pool) / looks)
false_rate = (2 * stats.norm.sf(np.abs(zz)) < 0.05).any(axis=1).mean()
### END SOLUTION
print(false_rate)

# %%
check(lambda: false_rate > 0.15, "20 looks turn a 5% false-alarm rate into roughly 20–25%")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 13, trees and boosting.
