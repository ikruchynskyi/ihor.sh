# %% [markdown]
# # Practice: ML strategy, what to fix next
# *AI from scratch, stage 3* · lesson: https://ihor.sh/ai/ml-strategy.html
#
# Read the gaps between human, training, train-dev and dev error; do an error analysis with a ceiling for each fix;
# read a learning curve; and find and fix a data mismatch, on scikit-learn's handwritten digits. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

digits = load_digits()
X, y = digits.data, digits.target
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, stratify=y, random_state=0)
print(X.shape, "scans of 8×8 pixels")

# %% [markdown]
# ## 1. Read the gaps
# A team reports: human-level error 2%, training error 9%, dev error 10% (train and dev from the same source). Set
# `avoidable_bias` (training − human) and `variance` (dev − training), in points.

# %%
human, train_err, dev_err = 2, 9, 10
avoidable_bias = variance = None
### HINT Both are differences between two of the three numbers above.
### HINT avoidable_bias = train_err - human, variance = dev_err - train_err
### BEGIN SOLUTION
avoidable_bias = train_err - human
variance = dev_err - train_err
### END SOLUTION
print(avoidable_bias, variance)

# %%
check(lambda: avoidable_bias == 7 and variance == 1, "avoidable bias 9 − 2 = 7 points, variance 10 − 9 = 1 point")

# %% [markdown]
# Which should they work on first? Set `fix_first` to `"bias"` or `"variance"`.

# %%
fix_first = None
### HINT The biggest gap goes first.
### BEGIN SOLUTION
fix_first = "bias"
### END SOLUTION

# %%
check(lambda: fix_first == "bias", "7 points of avoidable bias against 1 of variance: a bigger model or better features first, not more data")

# %% [markdown]
# ## 2. Look at the mistakes
# The cell trains a logistic regression and lists its test mistakes as "true read as predicted", most common first.
# Set `top_share`: the fraction of all mistakes that the most common kind makes up (`pairs.iloc[0]` is its count,
# `wrong.sum()` the number of mistakes).

# %%
model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xtr, ytr)
pred = model.predict(Xte)
wrong = pred != yte
pairs = pd.Series([f"{t} read as {p}" for t, p in zip(yte[wrong], pred[wrong])]).value_counts()
print("error rate:", wrong.mean()); print(pairs.head())
top_share = None
### HINT A share is a part divided by the whole: the top kind's count over all mistakes.
### HINT top_share = pairs.iloc[0] / wrong.sum()
### BEGIN SOLUTION
top_share = pairs.iloc[0] / wrong.sum()
### END SOLUTION
print(top_share)

# %%
check(lambda: abs(top_share - 0.2) < 1e-9, "3 of the 15 mistakes are an 8 read as a 1: 0.2")

# %% [markdown]
# The **ceiling**: if every one of those mistakes were fixed, the error rate would fall to `wrong.mean() × (1 −
# top_share)` and no lower. Set `ceiling` to that.

# %%
ceiling = None
### HINT The error that would remain is the error rate times the share of mistakes that are left.
### HINT ceiling = wrong.mean() * (1 - top_share)
### BEGIN SOLUTION
ceiling = wrong.mean() * (1 - top_share)
### END SOLUTION
print(ceiling)

# %%
check(lambda: abs(ceiling - wrong.mean() * 0.8) < 1e-12, "2.78% × 0.8 ≈ 2.22%: even a perfect fix for 8s read as 1s leaves most of the errors")

# %% [markdown]
# ## 3. Error per group
# The same mistakes, grouped by the true digit. Set `per_digit`: the error rate for each digit, with `groupby` as in
# Start 2 (`pd.Series(wrong)` is True for each mistake, and its mean per group is that group's error rate).

# %%
per_digit = None
### HINT pd.Series(wrong).groupby(yte) splits the mistakes by the true digit; .mean() gives each group's error rate.
### HINT per_digit = pd.Series(wrong).groupby(yte).mean()
### BEGIN SOLUTION
per_digit = pd.Series(wrong).groupby(yte).mean()
### END SOLUTION
print(per_digit.round(3) if per_digit is not None else None)

# %%
check(lambda: per_digit.idxmax() == 8 and per_digit[0] == 0, "the 8s are hardest (7.7% wrong); no 0 was misread")

# %% [markdown]
# ## 4. Will more data help?
# The cell computes a learning curve with shuffled folds (as in the lesson). Set `still_falling`: True if the
# validation error at the largest size is lower than at the size before it.

# %%
from sklearn.model_selection import learning_curve, StratifiedKFold
sizes, tr_scores, val_scores = learning_curve(make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)), X, y,
                                              train_sizes=[0.1, 0.25, 0.5, 0.75, 1.0], cv=StratifiedKFold(5, shuffle=True, random_state=0))
val_err = 1 - val_scores.mean(axis=1)
plt.plot(sizes, 1 - tr_scores.mean(axis=1), "o-", label="training error"); plt.plot(sizes, val_err, "o-", label="validation error")
plt.xlabel("training examples"); plt.legend(); plt.show()
still_falling = None
### HINT val_err[-1] is the error at the largest size, val_err[-2] at the one before.
### HINT still_falling = val_err[-1] < val_err[-2]
### BEGIN SOLUTION
still_falling = val_err[-1] < val_err[-2]
### END SOLUTION
print(still_falling)

# %%
check(lambda: still_falling == True, "validation error drops from about 4.7% to 3.1% at full size: more data would likely help")

# %% [markdown]
# ## 5. A mismatch, and its fix
# The model learns from clean scans, but users will send noisy "phone" scans. `err(model, X, y)` is the error in
# percent. The cell measures training, train-dev (clean, held out) and dev (phone) error. Set `variance` and `mismatch`
# from them, in points.

# %%
rng = np.random.default_rng(0)
def phone(images):
    return np.clip(images + rng.normal(0, 3, images.shape), 0, 16)
Xa, Xb, ya, yb = train_test_split(X, y, test_size=0.5, stratify=y, random_state=1)
Xtrain, Xtraindev, ytrain, ytraindev = train_test_split(Xa, ya, test_size=0.2, stratify=ya, random_state=2)
Xdev, ydev = phone(Xb[:450]), yb[:450]
err = lambda m, X_, y_: 100 * (1 - m.score(X_, y_))
clean = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xtrain, ytrain)
e_train, e_traindev, e_dev = err(clean, Xtrain, ytrain), err(clean, Xtraindev, ytraindev), err(clean, Xdev, ydev)
print(round(e_train, 1), round(e_traindev, 1), round(e_dev, 1))
variance = mismatch = None
### HINT Variance: train-dev − training. Mismatch: dev − train-dev.
### HINT variance = e_traindev - e_train, mismatch = e_dev - e_traindev
### BEGIN SOLUTION
variance = e_traindev - e_train
mismatch = e_dev - e_traindev
### END SOLUTION
print(variance, mismatch)

# %%
check(lambda: variance < 5 and mismatch > 40, "about 2 points of variance and about 50 of mismatch: real use looks nothing like training")

# %% [markdown]
# The fix: make training look like real use. Stack the clean training scans with phone versions of the scans the dev set
# didn't use (`phone(Xb[450:])`, labels `yb[450:]`) into `Xmix`, `ymix` (`np.vstack` stacks rows, `np.concatenate` joins
# label arrays), then fit `fixed`, the same pipeline, on them.

# %%
Xmix = ymix = fixed = None
### HINT Xmix = np.vstack([Xtrain, phone(Xb[450:])]); ymix = np.concatenate([ytrain, yb[450:]])
### HINT fixed = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xmix, ymix)
### BEGIN SOLUTION
Xmix = np.vstack([Xtrain, phone(Xb[450:])])
ymix = np.concatenate([ytrain, yb[450:]])
fixed = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xmix, ymix)
### END SOLUTION
if fixed is not None:
    print("dev error before:", round(e_dev, 1), " after:", round(err(fixed, Xdev, ydev), 1))

# %%
check(lambda: err(fixed, Xdev, ydev) < 20, "with phone-like training data the dev error should drop from about 52% to about 12%")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Andrew Ng's free "Machine Learning Yearning" is a short book on exactly these
# decisions.
