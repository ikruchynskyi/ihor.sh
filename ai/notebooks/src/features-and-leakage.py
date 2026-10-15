# %% [markdown]
# # Practice: features and leakage
# *AI from scratch, stage 3* · lesson: https://ihor.sh/ai/features-and-leakage.html
#
# The lesson's bank calls, all 41,188 of them: find a sentinel code, catch a leaking column, build a pipeline that
# learns only from training rows, handle a rare "yes", and see how much a random split flatters a model when the
# world changes over time. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# Data: Bank Marketing (Moro, Cortez and Rita, UCI Machine Learning Repository, CC BY 4.0).

# %%
import io, urllib.request, zipfile
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

raw = urllib.request.urlopen("https://archive.ics.uci.edu/static/public/222/bank+marketing.zip").read()
with zipfile.ZipFile(io.BytesIO(raw)) as outer:                       # a zip inside a zip
    with zipfile.ZipFile(io.BytesIO(outer.read("bank-additional.zip"))) as inner:
        df = pd.read_csv(inner.open("bank-additional/bank-additional-full.csv"), sep=";")
print(df.shape, "calls, in date order from May 2008 to November 2010")
df.head()

# %% [markdown]
# ## 1. Look first
# Set `share_yes`: the fraction of calls that ended in a yes (the `y` column says `"yes"` or `"no"`).

# %%
share_yes = None
### HINT A comparison makes a True/False column; its .mean() is the share that are True.
### HINT share_yes = (df["y"] == "yes").mean()
### BEGIN SOLUTION
share_yes = (df["y"] == "yes").mean()
### END SOLUTION
print(share_yes)

# %%
check(lambda: abs(share_yes - 0.1127) < 0.001, "about 11.3% said yes, so saying 'no' to everyone is already 88.7% accurate")

# %% [markdown]
# ## 2. A code that pretends to be a number
# `pdays` is the days since the person was last contacted, except that 999 means "never contacted". Add a column
# `contacted_before`: True where `pdays` is not 999. The cell then compares the yes rates.

# %%
### HINT != means "is not equal"; a comparison on a column gives one True/False per row.
### HINT df["contacted_before"] = df["pdays"] != 999
### BEGIN SOLUTION
df["contacted_before"] = df["pdays"] != 999
### END SOLUTION
if "contacted_before" in df:
    print(df.groupby("contacted_before")["y"].apply(lambda s: (s == "yes").mean()))

# %%
check(lambda: df["contacted_before"].sum() == 1515, "1,515 people were contacted before (pdays is not 999), and about 64% of them said yes")

# %% [markdown]
# ## 3. Find the leak
# A quick screen for leaks: how well does each number column predict the answer **on its own**? The cell computes
# each column's AUC (chapter 12), as if the column's value were the model's score. Look at the top of the list and
# set `leak` to the name of the column that can't be known before the call is made. (The next three, employment,
# the interest rate and its change, aren't leaks: they're known in advance. But they drift slowly over the years,
# which matters in part 6.)

# %%
from sklearn.metrics import roc_auc_score
y = (df["y"] == "yes").astype(int)
numbers = df.drop(columns=["y"]).select_dtypes("number").columns
alone = {c: max(roc_auc_score(y, df[c]), 1 - roc_auc_score(y, df[c])) for c in numbers}   # either direction
print(pd.Series(alone).sort_values(ascending=False).round(3))

# %%
leak = None
### HINT It's the strongest single column. What does it measure, and when is that number known?
### HINT The call's length is only known when the call is over, and by then you know the answer.
### BEGIN SOLUTION
leak = "duration"
### END SOLUTION

# %%
check(lambda: leak == "duration", "duration (how long the call lasted) is known only after the call, when the answer is known too")

# %% [markdown]
# ## 4. A pipeline that learns from training rows only
# The honest columns are everything except the answer and the leak. Split them 75/25 with `stratify=y` (done for you),
# then build `prep` with `make_column_transformer`, as in the lesson's imbalance box: one-hot encoding
# (`OneHotEncoder(handle_unknown="ignore")`) for the category columns `cats`, `StandardScaler()` for the number
# columns `nums`. The cell puts it in a pipeline with logistic regression and measures the AUC.

# %%
from sklearn.model_selection import train_test_split
from sklearn.compose import make_column_transformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score, precision_score

X = df.drop(columns=["y", "duration", "contacted_before"], errors="ignore")
cats = list(X.select_dtypes(exclude="number").columns)
nums = [c for c in X.columns if c not in cats]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
print("category columns:", cats)
print("number columns:", nums)
prep = None
### HINT make_column_transformer((step, columns), (step, columns)): one pair per group of columns.
### HINT prep = make_column_transformer((OneHotEncoder(handle_unknown="ignore"), cats), (StandardScaler(), nums))
### BEGIN SOLUTION
prep = make_column_transformer((OneHotEncoder(handle_unknown="ignore"), cats), (StandardScaler(), nums))
### END SOLUTION
if prep is not None:
    model = make_pipeline(prep, LogisticRegression(max_iter=2000)).fit(Xtr, ytr)
    auc_random = roc_auc_score(yte, model.predict_proba(Xte)[:, 1])
    recall_plain = recall_score(yte, model.predict(Xte))
    print("AUC", auc_random, " recall of yes at threshold 0.5:", recall_plain)

# %%
check(lambda: 0.77 < auc_random < 0.81, "about 0.79 with honest columns on a random split")

# %% [markdown]
# The recall is low: at the default threshold, the model finds only about a fifth of the people who'd say yes.
#
# ## 5. A rare yes
# Fit `weighted`: the same pipeline with `LogisticRegression(max_iter=2000, class_weight="balanced")`, on `Xtr, ytr`.
# Then set `recall_weighted`: its recall on the test rows (`recall_score(yte, weighted.predict(Xte))`).

# %%
weighted = recall_weighted = None
### HINT make_pipeline(prep, LogisticRegression(max_iter=2000, class_weight="balanced")).fit(Xtr, ytr)
### HINT recall_weighted = recall_score(yte, weighted.predict(Xte))
### BEGIN SOLUTION
weighted = make_pipeline(prep, LogisticRegression(max_iter=2000, class_weight="balanced")).fit(Xtr, ytr)
recall_weighted = recall_score(yte, weighted.predict(Xte))
### END SOLUTION
if weighted is not None:
    print("recall", recall_plain, "→", recall_weighted, "  precision", precision_score(yte, weighted.predict(Xte)),
          "  AUC", roc_auc_score(yte, weighted.predict_proba(Xte)[:, 1]))

# %%
check(lambda: recall_weighted > 0.55 and recall_weighted > 2 * recall_plain,
      "balanced class weights should find well over half the yeses (about 0.62), roughly three times as many")

# %% [markdown]
# Precision fell (more calls flagged, a smaller share of them yes) and the AUC hardly moved: weighting moves the
# threshold, not the ranking.
#
# ## 6. Split by time
# The rows are in date order. Train on the first 75% of calls and test on the last 25%, the way the model would
# really be used. Set `cut` to the row where the test period starts, then `Xtr_t, Xte_t, ytr_t, yte_t` with `.iloc`
# (rows before `cut` and from `cut` on). The cell refits the same pipeline and measures it.

# %%
cut = Xtr_t = Xte_t = ytr_t = yte_t = None
### HINT cut = int(len(X) * 0.75); X.iloc[:cut] is the past, X.iloc[cut:] the future.
### HINT Xtr_t, Xte_t, ytr_t, yte_t = X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]
### BEGIN SOLUTION
cut = int(len(X) * 0.75)
Xtr_t, Xte_t, ytr_t, yte_t = X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]
### END SOLUTION
if Xtr_t is not None:
    timed = make_pipeline(prep, LogisticRegression(max_iter=2000)).fit(Xtr_t, ytr_t)
    auc_time = roc_auc_score(yte_t, timed.predict_proba(Xte_t)[:, 1])
    print("random split AUC", auc_random, "  time split AUC", auc_time)
    print("share yes in the training period:", ytr_t.mean(), "  in the test period:", yte_t.mean())

# %%
check(lambda: cut == 30891 and auc_time < auc_random - 0.05,
      "the time split should start at row 30,891 and score clearly lower: the later months behave differently")

# %%
roll = y.rolling(1000, center=True).mean()
plt.figure(figsize=(9, 3))
plt.plot(roll.values, label="share saying yes (1,000-call window)")
plt.plot(df["euribor3m"].values / 10, label="interest rate ÷ 10")
plt.axvline(cut if cut else int(len(df) * 0.75), color="r", ls="--", label="time split")
plt.xlabel("call number (time order)"); plt.legend(); plt.show()

# %% [markdown]
# The training period mostly comes from before the crash, when few people said yes; the test period from after,
# when many did. A random split mixes both periods into training and hides that. On launch day, the model always
# meets the future.
#
# ## 7. A step that saw the test rows
# The lesson's noise demo: 100 people, 5,000 random columns, coin-flip labels. The first cell chooses 20 columns
# with all the labels in view, then cross-validates: it looks like real skill. Set `inside` to a pipeline with
# `SelectKBest(f_classif, k=20)` and `LogisticRegression()`, and `honest_score` to its 5-fold
# `cross_val_score(...).mean()` on the full `Xn, yn`.

# %%
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.model_selection import cross_val_score
rng = np.random.default_rng(0)
Xn, yn = rng.standard_normal((100, 5000)), rng.integers(0, 2, 100)
chosen = SelectKBest(f_classif, k=20).fit_transform(Xn, yn)
print("select first, then cross-validate:", cross_val_score(LogisticRegression(), chosen, yn, cv=5).mean())

# %%
inside = honest_score = None
### HINT make_pipeline(step1, step2) chains the selection and the model, so each fold selects on its own training rows.
### HINT inside = make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression()), then cross_val_score(inside, Xn, yn, cv=5).mean()
### BEGIN SOLUTION
inside = make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression())
honest_score = cross_val_score(inside, Xn, yn, cv=5).mean()
### END SOLUTION
print("selection inside the pipeline:", honest_score)

# %%
check(lambda: honest_score < 0.65, "on coin flips the honest score is about 0.5: there is nothing to learn")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Kaggle Learn's "Intermediate Machine Learning" course has short lessons
# on pipelines and data leakage: https://www.kaggle.com/learn/intermediate-machine-learning
