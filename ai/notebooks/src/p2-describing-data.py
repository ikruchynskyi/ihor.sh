# %% [markdown]
# # Practice: describing real data with pandas
# *AI from scratch, probability 2* · lesson: https://ihor.sh/ai/p2-describing-data.html
#
# The first thing an ML engineer does with any dataset: look at it. Typical values, spread, outliers, skew, and
# which columns move together, on this site's NYC subway outage data and scikit-learn's wine data.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# On Kaggle, turn on *Internet* in the notebook settings.

# %%
import json, urllib.request
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
data = json.load(urllib.request.urlopen(DATA + "outages.json"))
df = pd.DataFrame(data["rows"], columns=data["columns"])
df.describe()

# %% [markdown]
# ## 1. Typical values
# Set `mean_h` and `median_h` for the `hours` column, and `share_below_mean`: the fraction of outages shorter than
# the mean. What does that say about using the mean as "typical" here?

# %%
mean_h = median_h = share_below_mean = None
### BEGIN SOLUTION
mean_h, median_h = df.hours.mean(), df.hours.median()
share_below_mean = (df.hours < mean_h).mean()
### END SOLUTION
print(mean_h, median_h, share_below_mean)

# %%
check(lambda: round(mean_h, 2) == 8.25 and median_h == 1.62, "mean 8.25 h, median 1.62 h")
check(lambda: share_below_mean > 0.9, "95% of outages are shorter than the mean: a few huge ones drag it up")

# %% [markdown]
# ## 2. Outliers by the 1.5 × IQR rule
# A box plot marks a point as an outlier if it's more than 1.5 IQR above Q3 (or below Q1). Set `q1`, `q3`, `iqr`,
# and `n_outliers`: how many outages lie above $Q_3 + 1.5\,\text{IQR}$.

# %%
q1 = q3 = iqr = n_outliers = None
### BEGIN SOLUTION
q1, q3 = df.hours.quantile([0.25, 0.75])
iqr = q3 - q1
n_outliers = (df.hours > q3 + 1.5 * iqr).sum()
### END SOLUTION
print(q1, q3, iqr, n_outliers)
df.boxplot(column="hours", by="kind", figsize=(6, 3)); plt.yscale("log"); plt.suptitle(""); plt.show()

# %%
check(lambda: abs(q1 - 0.95) < 0.01 and abs(q3 - 3.56) < 0.01, "Q1 ≈ 0.95 h, Q3 ≈ 3.56 h")
Q1, Q3 = df.hours.quantile(0.25), df.hours.quantile(0.75)
check(lambda: n_outliers == (df.hours > Q3 + 1.5 * (Q3 - Q1)).sum(), "count the hours above Q3 + 1.5·IQR")

# %% [markdown]
# ## 3. Skew, and the log fix
# Set `skew_raw` to the skewness of `hours` (`.skew()`) and `skew_log` to that of `np.log10(hours)`. Then plot both
# histograms side by side.

# %%
skew_raw = skew_log = None
### BEGIN SOLUTION
skew_raw = df.hours.skew()
skew_log = np.log10(df.hours).skew()
fig, ax = plt.subplots(1, 2, figsize=(10, 3))
df.hours.hist(bins=40, ax=ax[0]); ax[0].set_title("hours")
np.log10(df.hours).hist(bins=40, ax=ax[1]); ax[1].set_title("log10(hours)")
plt.show()
### END SOLUTION
print(skew_raw, skew_log)

# %%
check(lambda: skew_raw > 10 and 0.5 < skew_log < 2, "hugely skewed raw (about 12); the log brings it near 1")

# %% [markdown]
# ## 4. A correlation decided by a few points
# Set `r_all`: the correlation of `estimated` and `hours` over all outages, and `r_short`: the same over outages
# shorter than 12 hours. What does the difference tell you?

# %%
r_all = r_short = None
### BEGIN SOLUTION
r_all = df.estimated.corr(df.hours)
short = df[df.hours < 12]
r_short = short.estimated.corr(short.hours)
### END SOLUTION
print(r_all, r_short)

# %%
check(lambda: r_all > 0.98 and r_short < 0.3, "0.99 over all, but only about 0.2 for everyday outages: ten long ones set the number")

# %% [markdown]
# ## 5. Which features move together?
# scikit-learn's wine data: 178 wines, 13 chemical measurements. Compute the correlation matrix (`.corr()`), show it
# as a heat map with `plt.imshow`, and set `pair` to the two different columns with the highest correlation
# (as a sorted tuple of names). Strongly correlated features carry overlapping information: L1 and L2 showed what
# that does to a linear model.

# %%
from sklearn.datasets import load_wine
wine = load_wine(as_frame=True).frame.drop(columns="target")
pair = None
### BEGIN SOLUTION
C = wine.corr()
plt.figure(figsize=(6, 5)); plt.imshow(C, cmap="coolwarm", vmin=-1, vmax=1); plt.colorbar()
plt.xticks(range(13), C.columns, rotation=90); plt.yticks(range(13), C.columns); plt.show()
upper = C.where(np.triu(np.ones(C.shape, dtype=bool), k=1))
pair = tuple(sorted(upper.stack().idxmax()))
### END SOLUTION
print(pair)

# %%
check(lambda: pair == ("flavanoids", "total_phenols"), "flavanoids and total phenols, correlation about 0.86")

# %% [markdown]
# ## 6. Standardize
# Make `z`: every wine column turned into z-scores (subtract the column mean, divide by its standard deviation,
# with `ddof=0`). This is the feature scaling that makes gradient descent behave (calculus 3).

# %%
z = None
### BEGIN SOLUTION
z = (wine - wine.mean()) / wine.std(ddof=0)
### END SOLUTION

# %%
check(lambda: np.allclose(z.mean(), 0) and np.allclose(z.std(ddof=0), 1), "every column: mean 0, standard deviation 1")
from sklearn.preprocessing import StandardScaler
check(lambda: np.allclose(z.values, StandardScaler().fit_transform(wine)), "the same as scikit-learn's StandardScaler")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: linear algebra 2, eigenvectors and PCA.
