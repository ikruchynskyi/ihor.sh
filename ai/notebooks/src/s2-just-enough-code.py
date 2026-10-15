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

# %% [markdown]
# ## 1. Lists
# `rides` holds the distances of five taxi rides. Set `last` to the last one, without typing the number itself.

# %%
rides = [1.5, 4.0, 2.2, 9.1, 3.3]
last = None
### HINT Lists count from 0 at the front; negative numbers count from the back.
### HINT rides[-1] is the last item.
### BEGIN SOLUTION
last = rides[-1]
### END SOLUTION
print(last)

# %%
check(lambda: last == 3.3, "the last item of rides is 3.3: rides[-1]")

# %% [markdown]
# ## 2. Loops: a sum of squares
# Set `total` to 1² + 2² + ... + 10² with a `for` loop over `range`, like the lesson's sum box.

# %%
total = None
### HINT Start with total = 0, then add i * i once for every i.
### HINT range(1, 11) counts 1, 2, ..., 10 (it stops before 11).
### HINT total = 0, then: for i in range(1, 11):  and on the next line, indented:  total += i * i
### BEGIN SOLUTION
total = 0
for i in range(1, 11):
    total += i * i
### END SOLUTION

# %%
check(lambda: total == 385, "the squares 1, 4, 9, ..., 100 add up to 385. Is your range stopping one number too early?")

# %% [markdown]
# ## 3. Functions: a model
# Write `predict(km, a, b)` that returns the taxi model's guess, `a * km + b`.

# %%
def predict(km, a, b):
    """
    Computes predicted ride duration: minutes = a * km + b
    
    Parameters:
      km: distance in kilometers (single number or NumPy array)
      a: slope (minutes per km)
      b: intercept (starting delay in minutes)
    """
    ### HINT A function hands its answer back with return.
    ### HINT return a * km + b
    ### BEGIN SOLUTION
    return a * km + b
    ### END SOLUTION

# %%
check(lambda: predict(4, 2.6, 6) == 2.6 * 4 + 6, "predict(4, 2.6, 6) should be 16.4")
check(lambda: np.allclose(predict(np.array([1, 2]), 2, 1), [3, 5]), "it should work on a whole NumPy array too")

# %% [markdown]
# ## 4. NumPy: mean squared error in one line
# Write `mse(guess, truth)`: the mean of the squared differences. No loops: use NumPy.

# %%
km = np.array([1, 2, 3, 5, 8, 10])
minutes = np.array([9, 11, 14, 19, 27, 33])

def mse(guess, truth):
    """
    Computes the Mean Squared Error between predictions and ground truth.
    
    Parameters:
      guess: array of predicted values
      truth: array of actual values
    """
    ### HINT The lesson's NumPy box does exactly this in two lines: errors = guess - truth, then np.mean(errors ** 2).
    ### HINT In one line: return np.mean((guess - truth) ** 2)
    ### BEGIN SOLUTION
    return np.mean((guess - truth) ** 2)
    ### END SOLUTION

# %%
check(lambda: math.isclose(mse(predict(km, 2.5, 6), minutes), 5.75 / 6), "with a = 2.5, b = 6 the MSE is 0.958")

# %% [markdown]
# ## 5. Search for the best knob
# Keep $b = 6$. Try 301 values of $a$ from 1 to 4 (`np.linspace`), compute the MSE for each,
# and set `best_a` to the one with the smallest error (`np.argmin`). Then plot MSE against $a$.

# %%
a_values = np.linspace(1, 4, 301)
best_a = None
### HINT The lesson's matplotlib box does this for 61 values: a list comprehension computes one MSE per a.
### HINT errors = [mse(predict(km, a, 6), minutes) for a in a_values], then best_a = a_values[np.argmin(errors)]
### BEGIN SOLUTION
errors = [mse(predict(km, a, 6), minutes) for a in a_values]
best_a = a_values[np.argmin(errors)]
plt.plot(a_values, errors); plt.xlabel("a"); plt.ylabel("MSE"); plt.show()
### END SOLUTION
print("best a:", best_a)

# %%
check(lambda: abs(best_a - 2.66) < 0.006, "the best a on this grid is about 2.66. best_a should be a value from a_values, not an error.")

# %% [markdown]
# ## 6. pandas: real data
# Every NYC subway elevator (EL) and escalator (ES) outage that this site's archive saw finish over four days in
# October 2026. Columns: actual hours out, the MTA's estimated hours, kind, reason, hour of day it started.

# %%
import json, urllib.request
DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"   # the path's datasets, on GitHub
data = json.load(urllib.request.urlopen(DATA + "outages.json"))
df = pd.DataFrame(data["rows"], columns=data["columns"])
df.head()

# %% [markdown]
# Set `n_elevators`: how many outages are elevators. The `kind` column says `"EL"` for an elevator.

# %%
n_elevators = None
### HINT df["kind"] == "EL" is a column of True/False; True counts as 1.
### HINT (df["kind"] == "EL").sum()
### BEGIN SOLUTION
n_elevators = (df["kind"] == "EL").sum()
### END SOLUTION
print(n_elevators)

# %%
check(lambda: n_elevators == 158, "158 of the 340 outages are elevators")

# %% [markdown]
# Set `share_long`: the fraction of all outages that lasted more than 24 hours.

# %%
share_long = None
### HINT Make the True/False column first: df["hours"] > 24. Its .mean() is the share that are True.
### BEGIN SOLUTION
share_long = (df["hours"] > 24).mean()
### END SOLUTION
print(share_long)

# %%
check(lambda: math.isclose(share_long, 10 / 340), "10 of 340 lasted over a day, a share of about 0.029")

# %% [markdown]
# Set `median_by_kind`: the median `hours` for each kind, with `groupby` as in the lesson's pandas box (which used
# `.mean()`; the median is `.median()`).

# %%
median_by_kind = None
### HINT df.groupby("kind")["hours"] splits the hours by kind; then ask each part for its median.
### HINT df.groupby("kind")["hours"].median()
### BEGIN SOLUTION
median_by_kind = df.groupby("kind")["hours"].median()
### END SOLUTION
print(median_by_kind)

# %%
check(lambda: math.isclose(median_by_kind["ES"], 1.17), "escalators' median is 1.17 hours")

# %% [markdown]
# ## 7. matplotlib: see the skew
# Run this: two histograms side by side, of `hours` and of `np.log10(hours)` (`log10` turns 1, 10, 100 into 0, 1, 2).
# Which one would you rather fit a bell curve to? Probability 2 explains why durations look like this.

# %%
fig, ax = plt.subplots(1, 2, figsize=(10, 3))
ax[0].hist(df["hours"], bins=40); ax[0].set_title("hours")
ax[1].hist(np.log10(df["hours"]), bins=40); ax[1].set_title("log10(hours)")
plt.show()

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · For a bigger, top-down taste of deep learning, fast.ai's free course
# starts with training an image classifier in lesson 1: https://course.fast.ai/
