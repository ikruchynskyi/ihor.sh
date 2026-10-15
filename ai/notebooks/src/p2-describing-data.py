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
### HINT Compute mean and median of df.hours.
### HINT Compute share_below_mean = (df.hours < mean_h).mean().
### BEGIN SOLUTION
mean_h, median_h = df.hours.mean(), df.hours.median()
share_below_mean = (df.hours < mean_h).mean()
### END SOLUTION
print(mean_h, median_h, share_below_mean)

# %%
check(lambda: round(mean_h, 2) == 8.25 and median_h == 1.62, 
      "mean_h should round to 8.25 hours and median_h should be 1.62 hours.")
check(lambda: share_below_mean > 0.9, 
      "Over 90% of outages should be shorter than the mean due to heavy right skew.")

# %% [markdown]
# ## 2. Outliers by the 1.5 × IQR rule
# A box plot marks a point as an outlier if it's more than 1.5 IQR above Q3 (or below Q1). Using `.quantile([0.25, 0.75])`, set `q1`, `q3`, `iqr`,
# and `n_outliers`: how many outages lie above $Q_3 + 1.5\,\text{IQR}$.

# %%
q1 = q3 = iqr = n_outliers = None
### HINT Compute quartiles q1, q3 using df.hours.quantile([0.25, 0.75]).
### HINT Compute iqr = q3 - q1.
### HINT Count outages above Q3 + 1.5 * iqr using (df.hours > q3 + 1.5 * iqr).sum().
### BEGIN SOLUTION
q1, q3 = df.hours.quantile([0.25, 0.75])
iqr = q3 - q1
n_outliers = (df.hours > q3 + 1.5 * iqr).sum()
### END SOLUTION
print(q1, q3, iqr, n_outliers)
df.boxplot(column="hours", by="kind", figsize=(6, 3)); plt.yscale("log"); plt.suptitle(""); plt.show()

# %%
check(lambda: abs(q1 - 0.95) < 0.01 and abs(q3 - 3.56) < 0.01, 
      "Q1 should be ~0.95 hours and Q3 should be ~3.56 hours.")
Q1, Q3 = df.hours.quantile(0.25), df.hours.quantile(0.75)
check(lambda: n_outliers == (df.hours > Q3 + 1.5 * (Q3 - Q1)).sum(), 
      "n_outliers must equal the count of outages where hours > Q3 + 1.5 * IQR.")

# %% [markdown]
# ## 3. Skew, and the log fix
# Set `skew_raw` to the skewness of `hours` (`.skew()`) and `skew_log` to that of `np.log10(hours)`. Then plot both
# histograms side by side.

# %%
skew_raw = skew_log = None
### HINT Compute skewness of raw hours with df.hours.skew().
### HINT Compute skewness of log-transformed hours with np.log10(df.hours).skew().
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
check(lambda: skew_raw > 10 and 0.5 < skew_log < 2, 
      "Raw hours should be severely skewed (> 10), while log10(hours) brings skewness between 0.5 and 2.0.")

# %% [markdown]
# ## 4. A correlation decided by a few points
# Set `r_all`: the correlation of `estimated` and `hours` over all outages, and `r_short`: the same over outages
# shorter than 12 hours. What does the difference tell you?

# %%
r_all = r_short = None
### HINT Compute overall Pearson correlation: df.estimated.corr(df.hours).
### HINT Filter df for hours < 12 and compute correlation on that subset.
### BEGIN SOLUTION
r_all = df.estimated.corr(df.hours)
short = df[df.hours < 12]
r_short = short.estimated.corr(short.hours)
### END SOLUTION
print(r_all, r_short)

# %%
check(lambda: r_all > 0.98 and r_short < 0.3, 
      "Overall correlation r_all should exceed 0.98, but drop below 0.3 for short outages (< 12h).")

# %% [markdown]
# ## 5. Which features move together?
# scikit-learn's wine data: 178 wines, 13 chemical measurements. `.corr()` gives the correlation of every pair of
# columns; the heat map shows it (red: rise together, blue: one rises as the other falls). Strongly correlated
# features carry overlapping information: L1 and L2 showed what that does to a linear model.

# %%
from sklearn.datasets import load_wine
wine = load_wine(as_frame=True).frame.drop(columns="target")
C = wine.corr()
plt.figure(figsize=(6, 5)); plt.imshow(C, cmap="coolwarm", vmin=-1, vmax=1); plt.colorbar()
plt.xticks(range(13), C.columns, rotation=90); plt.yticks(range(13), C.columns); plt.show()

# keep each pair of different columns once (the part above the diagonal), as a list labeled by the two names
pairs = C.where(np.triu(np.ones(C.shape, dtype=bool), k=1)).stack()
pairs.sort_values().tail(3)

# %% [markdown]
# Set `pair` to the label of the most correlated pair: `.idxmax()` gives the label of a Series' biggest value.

# %%
pair = None
### HINT pairs is labeled by (name, name); ask it for the label of its maximum.
### HINT pair = pairs.idxmax()
### BEGIN SOLUTION
pair = pairs.idxmax()
### END SOLUTION
print(pair)

# %%
check(lambda: tuple(sorted(pair)) == ("flavanoids", "total_phenols"), 
      "The most correlated pair of chemical measurements should be ('flavanoids', 'total_phenols').")

# %% [markdown]
# ## 6. Standardize
# Make `z`: every wine column turned into z-scores (subtract the column mean, divide by its standard deviation,
# with `ddof=0`). This is the feature scaling that makes gradient descent behave (calculus 3).

# %%
z = None
### HINT Standardize wine dataframe: (wine - wine.mean()) / wine.std(ddof=0).
### BEGIN SOLUTION
z = (wine - wine.mean()) / wine.std(ddof=0)
### END SOLUTION

# %%
check(lambda: np.allclose(z.mean(), 0) and np.allclose(z.std(ddof=0), 1), 
      "Standardized features z must have mean 0 and standard deviation 1 for every column.")
from sklearn.preprocessing import StandardScaler
check(lambda: np.allclose(z.values, StandardScaler().fit_transform(wine)), 
      "Manual standardization must match sklearn's StandardScaler().fit_transform(wine).")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: linear algebra 2, eigenvectors and PCA.
