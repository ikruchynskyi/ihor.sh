# %% [markdown]
# # Practice: just enough Python
# *AI from scratch, Start 2* · lesson: https://ihor.sh/ai/s2-just-enough-code.html
#
# Each exercise has a cell with `# YOUR CODE HERE`: replace the `...` with your code, run it, then run the check
# cell under it. A check that passes prints ✓; one that fails prints ✗ and what it expected.
# Run the cells top to bottom (Shift+Enter).
#
# On **Kaggle**, turn on *Internet* in the notebook settings (right panel) so the last part can download data.

# %%
import math
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

# %% [markdown]
# ## 1. Loops: a sum of squares
# Set `total` to $1^2 + 2^2 + \dots + 10^2$ using a `for` loop over `range`.

# %%
total = None
### BEGIN SOLUTION
total = 0
for i in range(1, 11):
    total += i * i
### END SOLUTION

# %%
check(lambda: total == 385, f"expected 385, got {total}")

# %% [markdown]
# ## 2. Functions: a model
# Write `predict(km, a, b)` that returns the taxi model's guess, $a \cdot km + b$.

# %%
def predict(km, a, b):
    ### BEGIN SOLUTION
    return a * km + b
    ### END SOLUTION

# %%
check(lambda: predict(4, 2.6, 6) == 2.6 * 4 + 6, "predict(4, 2.6, 6) should be 16.4")
check(lambda: np.allclose(predict(np.array([1, 2]), 2, 1), [3, 5]), "it should work on a whole NumPy array too")

# %% [markdown]
# ## 3. NumPy: mean squared error in one line
# Write `mse(guess, truth)`: the mean of the squared differences. No loops: use NumPy.

# %%
km = np.array([1, 2, 3, 5, 8, 10])
minutes = np.array([9, 11, 14, 19, 27, 33])

def mse(guess, truth):
    ### BEGIN SOLUTION
    return np.mean((guess - truth) ** 2)
    ### END SOLUTION

# %%
check(lambda: math.isclose(mse(predict(km, 2.5, 6), minutes), 5.75 / 6), "with a = 2.5, b = 6 the MSE is 0.958")

# %% [markdown]
# ## 4. Search for the best knob
# Keep $b = 6$. Try 301 values of $a$ from 1 to 4 (`np.linspace`), compute the MSE for each,
# and set `best_a` to the one with the smallest error (`np.argmin`). Then plot MSE against $a$.

# %%
a_values = np.linspace(1, 4, 301)
best_a = None
### BEGIN SOLUTION
errors = np.array([mse(predict(km, a, 6), minutes) for a in a_values])
best_a = a_values[np.argmin(errors)]
plt.plot(a_values, errors); plt.xlabel("a"); plt.ylabel("MSE"); plt.show()
### END SOLUTION
print("best a:", best_a)

# %%
check(lambda: abs(best_a - 2.66) < 0.006, f"the best a on this grid is about 2.66; got {best_a}")

# %% [markdown]
# ## 5. pandas: real data
# Every NYC subway elevator (EL) and escalator (ES) outage that this site's archive saw finish over four days in
# October 2026. Columns: actual hours out, the MTA's estimated hours, kind, reason, hour of day it started.

# %%
import json, urllib.request
DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"   # the path's datasets, on GitHub
data = json.load(urllib.request.urlopen(DATA + "outages.json"))
df = pd.DataFrame(data["rows"], columns=data["columns"])
df.head()

# %% [markdown]
# Using `df`, set:
# - `n_elevators`: how many outages are elevators (`kind == "EL"`)
# - `median_by_kind`: a Series with the median `hours` for each kind (`groupby`)
# - `share_long`: the fraction of all outages that lasted more than 24 hours

# %%
n_elevators = median_by_kind = share_long = None
### BEGIN SOLUTION
n_elevators = (df["kind"] == "EL").sum()
median_by_kind = df.groupby("kind")["hours"].median()
share_long = (df["hours"] > 24).mean()
### END SOLUTION
print(n_elevators, median_by_kind, share_long)

# %%
check(lambda: n_elevators == 158, "158 elevator outages")
check(lambda: math.isclose(median_by_kind["ES"], 1.17), "escalators' median is 1.17 hours")
check(lambda: math.isclose(share_long, 10 / 340), "10 of 340 lasted over a day")

# %% [markdown]
# ## 6. matplotlib: see the skew
# Draw two histograms side by side: `hours`, and `np.log10(hours)`. Which one would you rather fit a bell curve to?
# (Probability 2 explains why durations look like this.) No check here: look at it.

# %%
fig, ax = plt.subplots(1, 2, figsize=(10, 3))
### BEGIN SOLUTION
ax[0].hist(df["hours"], bins=40); ax[0].set_title("hours")
ax[1].hist(np.log10(df["hours"]), bins=40); ax[1].set_title("log10(hours)")
### END SOLUTION
plt.show()

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · For a bigger, top-down taste of deep learning, fast.ai's free course
# starts with training an image classifier in lesson 1: https://course.fast.ai/
