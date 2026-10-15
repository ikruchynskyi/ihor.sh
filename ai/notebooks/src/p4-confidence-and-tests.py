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

rng = np.random.default_rng(0)

# %% [markdown]
# ## 1. A confidence interval, two ways
# 25 measured response times (ms). First the formula way: the 95% interval for the mean from the t-distribution.
# `n`, the mean and the standard error `se` are computed for you; set `ci_t` with
# `stats.t.interval(0.95, df=n - 1, loc=..., scale=...)`: centered on the mean, scaled by the standard error.

# %%
times = rng.lognormal(mean=4.5, sigma=0.4, size=25)
n = len(times)
se = times.std(ddof=1) / np.sqrt(n)             # the standard error of the mean
print("mean", times.mean(), " se", se)
ci_t = None
### HINT loc is where the interval is centered (times.mean()), scale is its unit of spread (se).
### HINT ci_t = stats.t.interval(0.95, df=n - 1, loc=times.mean(), scale=se)
### BEGIN SOLUTION
ci_t = stats.t.interval(0.95, df=n - 1, loc=times.mean(), scale=se)
### END SOLUTION
print(ci_t)

# %%
check(lambda: ci_t[0] < times.mean() < ci_t[1] and abs((ci_t[1] - ci_t[0]) - 2 * stats.t.ppf(0.975, n - 1) * se) < 1e-9,
      "mean ± 2.064 standard errors (2.064 is the t value for 95% with 24 degrees of freedom)")

# %% [markdown]
# Now the **bootstrap** way, with no formula: resample the 25 times with replacement 10,000 times (done for you:
# `boot` holds each resample's mean), and set `ci_boot` to the 2.5th and 97.5th percentiles of `boot` with `percentile`
# (`np.percentile(values, [2.5, 97.5])`).

# %%
boot = rng.choice(times, size=(10_000, n), replace=True).mean(axis=1)
ci_boot = None
### HINT The middle 95% of the 10,000 resampled means leaves 2.5% below and 2.5% above.
### HINT ci_boot = np.percentile(boot, [2.5, 97.5])
### BEGIN SOLUTION
ci_boot = np.percentile(boot, [2.5, 97.5])
### END SOLUTION
print(times.mean(), ci_t, ci_boot)

# %%
check(lambda: ci_boot[0] < times.mean() < ci_boot[1], "the bootstrap interval should contain the sample mean")
check(lambda: abs((ci_t[1] - ci_t[0]) - (ci_boot[1] - ci_boot[0])) < 0.3 * (ci_t[1] - ci_t[0]),
      "the two intervals should be about as wide (within 30%): two roads to the same answer")

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
### HINT Compute boolean correctness arrays ra = (pa == yte) and rb = (pb == yte).
### HINT Compute overall accuracies acc_a = ra.mean() and acc_b = rb.mean().
### HINT Count disagreement cases: b_only = int((ra & ~rb).sum()) and c_only = int((~ra & rb).sum()).
### HINT Compute exact binomial McNemar test p-value: stats.binomtest(c_only, b_only + c_only, 0.5).pvalue.
### BEGIN SOLUTION
ra, rb = pa == yte, pb == yte
acc_a, acc_b = ra.mean(), rb.mean()
b_only, c_only = int((ra & ~rb).sum()), int((~ra & rb).sum())
p_mcnemar = stats.binomtest(c_only, b_only + c_only, 0.5).pvalue
### END SOLUTION
print(acc_a, acc_b, b_only, c_only, p_mcnemar)

# %%
check(lambda: acc_a > acc_b and b_only > c_only, 
      "Logistic regression should achieve higher accuracy and win more disagreements than depth-3 decision tree.")
check(lambda: p_mcnemar == stats.binomtest(c_only, b_only + c_only, 0.5).pvalue, 
      "p_mcnemar should match exact binomial test p-value stats.binomtest(c_only, b_only + c_only, 0.5).pvalue.")

# %% [markdown]
# ## 3. A paired bootstrap for the difference
# Resample **test examples** (not models) 10,000 times; for each resample compute accuracy A − accuracy B on the
# same examples. Set `diff_ci`: the 95% interval of that difference. If it excludes 0, A is better on data like this.

# %%
diff_ci = None
### HINT Generate 10,000 resampled index arrays: idx = rng.integers(0, len(yte), size=(10_000, len(yte))).
### HINT For each resample, compute accuracy difference: (pa[idx] == yte[idx]).mean(1) - (pb[idx] == yte[idx]).mean(1).
### HINT Compute 2.5th and 97.5th percentiles of differences: np.percentile(diffs, [2.5, 97.5]).
### BEGIN SOLUTION
idx = rng.integers(0, len(yte), size=(10_000, len(yte)))
diffs = (pa[idx] == yte[idx]).mean(1) - (pb[idx] == yte[idx]).mean(1)
diff_ci = np.percentile(diffs, [2.5, 97.5])
### END SOLUTION
print("A − B:", acc_a - acc_b if acc_a is not None else None, " 95% interval:", diff_ci)

# %%
check(lambda: diff_ci[0] < acc_a - acc_b < diff_ci[1], 
      "The 95% paired bootstrap interval should surround the point estimate of accuracy difference acc_a - acc_b.")

# %% [markdown]
# ## 4. How many users does an A/B test need?
# Write `n_per_group(p, lift)` with the rule of thumb $n \approx 16\,p(1-p)/\delta^2$ (α = 0.05, 80% power). Then
# check it by simulation: with that n per group, baseline 10% and a real lift to 11%, run 500 tests and set `power`:
# the share where a two-proportion z-test gives p < 0.05.

# %%
def n_per_group(p, lift):
    """Estimate required sample size per variant for a two-sample proportion test (alpha=0.05, 80% power).
    
    Formula: round(16 * p * (1 - p) / (lift ** 2))
    
    Args:
        p: Baseline conversion rate (e.g. 0.10 for 10%).
        lift: Minimum detectable absolute effect size delta (e.g. 0.01 for 1% lift).
    Returns:
        int: Required sample size per arm.
    """
    ### HINT Apply rule of thumb n = round(16 * p * (1 - p) / (lift ** 2)).
    ### BEGIN SOLUTION
    return round(16 * p * (1 - p) / lift ** 2)        # round, not ceil: 0.1·0.9/0.01² is 14400.000000000002 in floating point
    ### END SOLUTION

power = None
### HINT Compute sample size n = n_per_group(0.10, 0.01).
### HINT Simulate 500 experiments: sample a ~ Binomial(n, 0.10)/n and b ~ Binomial(n, 0.11)/n.
### HINT Compute pooled standard error and z-scores for two-sample test.
### HINT Calculate empirical power as fraction of simulations with two-sided p < 0.05.
### BEGIN SOLUTION
n = n_per_group(0.10, 0.01)
a = rng.binomial(n, 0.10, 500) / n; b = rng.binomial(n, 0.11, 500) / n
pooled = (a + b) / 2
z = (b - a) / np.sqrt(2 * pooled * (1 - pooled) / n)
power = (2 * stats.norm.sf(np.abs(z)) < 0.05).mean()
### END SOLUTION
print(n_per_group(0.10, 0.01), power)

# %%
check(lambda: n_per_group(0.10, 0.01) == 14_400, 
      "Sample size per group for p=0.10, lift=0.01 should be 16 * 0.1 * 0.9 / (0.01^2) = 14,400.")
check(lambda: 0.72 < power < 0.88, 
      "Simulated statistical power with n=14,400 should achieve approximately 80% (between 72% and 88%).")

# %% [markdown]
# ## 5. Peeking, simulated
# 1,000 A/A tests (no real difference), 5,000 visitors per arm, 10% conversion. Check after every 250 visitors and
# stop at the first p < 0.05. Set `false_rate`: the share of tests that declare a winner anyway.

# %%
false_rate = None
### HINT Generate 1000 simulated A/A tests (5000 users per arm, 10% conversion rate).
### HINT Track cumulative conversion rates at intervals of 250 visitors (looks = np.arange(250, 5001, 250)).
### HINT At each look, compute two-sample test z-scores and two-sided p-values.
### HINT Determine false_rate = (p < 0.05).any(axis=1).mean().
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
check(lambda: false_rate > 0.15, 
      "Repeated peeking (checking p-values 20 times) inflates false positive rate from 5% to over 15%.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 13, trees and boosting.
