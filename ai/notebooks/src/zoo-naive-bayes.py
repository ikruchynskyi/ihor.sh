# %% [markdown]
# # Practice: naive Bayes
# *AI from scratch, model zoo 4* · lesson: https://ihor.sh/ai/zoo-naive-bayes.html
#
# 5,574 real text messages: a spam filter built by counting, each word's evidence, naive Bayes against logistic
# regression when labeled data is scarce, what smoothing does to the probabilities, and how copies of one column make
# the model overconfident. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck. On Kaggle, turn on *Internet* in the notebook settings.
#
# SMS Spam Collection: Almeida, Gómez Hidalgo and Yamakami (2011), UCI Machine Learning Repository, CC BY 4.0.
# Bank marketing: Moro, Cortez and Rita (2014), UCI, CC BY 4.0.

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB, GaussianNB
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
df = pd.read_csv(DATA + "sms-spam.tsv", sep="\t", names=["label", "text"], quoting=3)
y = (df["label"] == "spam").astype(int).values
tr, te, ytr, yte = train_test_split(df["text"], y, test_size=0.3, stratify=y, random_state=0)
vec = CountVectorizer().fit(tr)
A, B = vec.transform(tr).toarray(), vec.transform(te).toarray()     # word counts: (messages, words)
words = vec.get_feature_names_out()
print(len(df), "messages,", y.mean().round(3), "spam,", len(words), "different words in training")
df.sample(5, random_state=1)

# %% [markdown]
# ## 1. The prior
# Set `priors` to the share of ham and of spam among the training messages, as an array of two numbers:
# `np.array([(ytr == 0).mean(), (ytr == 1).mean()])`.

# %%
priors = None
### HINT (ytr == 1).mean() is the share of spam.
### HINT priors = np.array([(ytr == 0).mean(), (ytr == 1).mean()])
### BEGIN SOLUTION
priors = np.array([(ytr == 0).mean(), (ytr == 1).mean()])
### END SOLUTION
print(priors)

# %%
check(lambda: np.allclose(priors, [0.866, 0.134], atol=0.002), "about 87% ham and 13% spam, adding to 1")

# %% [markdown]
# ## 2. Word probabilities, by counting
# `counts` holds each word's total count in ham (row 0) and spam (row 1), plus 1 (Laplace smoothing). Set
# `word_prob` to P(word | class): each row divided by its own total, `counts / counts.sum(axis=1, keepdims=True)`.

# %%
counts = np.array([A[ytr == c].sum(axis=0) + 1 for c in (0, 1)])
word_prob = None
### HINT counts.sum(axis=1, keepdims=True) is each class's total, shaped (2, 1) so it divides each row.
### HINT word_prob = counts / counts.sum(axis=1, keepdims=True)
### BEGIN SOLUTION
word_prob = counts / counts.sum(axis=1, keepdims=True)
### END SOLUTION
print(word_prob.shape if word_prob is not None else None)

# %%
check(lambda: word_prob.shape == (2, len(words)) and np.allclose(word_prob.sum(axis=1), 1),
      "one row per class, and each row sums to 1: a probability for every word")

# %% [markdown]
# ## 3. Classify by adding log-evidence
# Set `scores` to each test message's log-score for both classes: its word counts times the log word probabilities,
# plus the log priors: `B @ np.log(word_prob).T + np.log(priors)`. The class with the bigger score wins.

# %%
scores = None
### HINT B is (messages, words) and np.log(word_prob).T is (words, 2), so @ gives (messages, 2).
### HINT scores = B @ np.log(word_prob).T + np.log(priors)
### BEGIN SOLUTION
scores = B @ np.log(word_prob).T + np.log(priors)
### END SOLUTION
acc = (scores.argmax(axis=1) == yte).mean() if scores is not None else None
print("accuracy:", acc, "· scikit-learn:", MultinomialNB().fit(A, ytr).score(B, yte))

# %%
check(lambda: abs(acc - MultinomialNB().fit(A, ytr).score(B, yte)) < 1e-9 and acc > 0.97,
      "98.3%, exactly scikit-learn's MultinomialNB: it's the same counting")

# %% [markdown]
# ## 4. Each word's evidence
# Set `evidence` to \(\ln \frac{P(w \mid \text{spam})}{P(w \mid \text{ham})}\) for every word:
# `np.log(word_prob[1] / word_prob[0])`. Positive means spammy.

# %%
evidence = None
### HINT row 1 is spam, row 0 is ham
### HINT evidence = np.log(word_prob[1] / word_prob[0])
### BEGIN SOLUTION
evidence = np.log(word_prob[1] / word_prob[0])
### END SOLUTION
if evidence is not None:
    ev = pd.Series(evidence, index=words)
    print("spammiest:", list(ev.nlargest(10).index)); print("hammiest: ", list(ev.nsmallest(10).index))
    print(ev[["free", "call", "now", "later", "love"]].round(2))

# %%
check(lambda: evidence[list(words).index("prize")] > 3 and evidence[list(words).index("later")] < -2,
      "'prize' is strongly spammy (about +4), 'later' strongly hammy (about −3); 'call' and 'free' are spammy but appear in ham too")

# %% [markdown]
# ## 5. When labels are scarce
# `small(n, model)` trains a model on `n` random training messages and returns its test accuracy, averaged over 10
# draws. For n = 50, set `acc_nb` with `MultinomialNB()` and `acc_lr` with `LogisticRegression(max_iter=2000)`.
# Predict first: which wins with only 50 labeled messages?

# %%
def small(n, model):
    accs = []
    for seed in range(10):
        idx = np.random.default_rng(seed).choice(len(tr), n, replace=False)
        v = CountVectorizer().fit(tr.iloc[idx])
        accs.append(model.fit(v.transform(tr.iloc[idx]), ytr[idx]).score(v.transform(te), yte))
    return np.mean(accs)

acc_nb = acc_lr = None
### HINT acc_nb = small(50, MultinomialNB())
### HINT acc_lr = small(50, LogisticRegression(max_iter=2000))
### BEGIN SOLUTION
acc_nb = small(50, MultinomialNB())
acc_lr = small(50, LogisticRegression(max_iter=2000))
### END SOLUTION
print("naive Bayes:", acc_nb, "· logistic regression:", acc_lr, "· always ham:", 1 - yte.mean())

# %%
check(lambda: acc_nb > acc_lr + 0.02,
      "about 91% vs 87%: with 50 messages, logistic regression barely beats 'always ham' (86.6%), while naive Bayes's word-by-word counts already work")

# %% [markdown]
# ## 6. Smoothing and honest probabilities
# For each `a` in `alphas`, fit `MultinomialNB(alpha=a, force_alpha=True)` on all the training messages and compute
# its test log-loss (`log_loss(yte, model.predict_proba(B))`). Set `losses` to the list.

# %%
alphas = [1e-10, 0.01, 0.1, 1.0]
losses = None
### HINT log_loss(yte, MultinomialNB(alpha=a, force_alpha=True).fit(A, ytr).predict_proba(B)) for one a
### HINT losses = [log_loss(yte, MultinomialNB(alpha=a, force_alpha=True).fit(A, ytr).predict_proba(B)) for a in alphas]
### BEGIN SOLUTION
losses = [log_loss(yte, MultinomialNB(alpha=a, force_alpha=True).fit(A, ytr).predict_proba(B)) for a in alphas]
### END SOLUTION
print([round(l, 3) for l in losses] if losses else None)

# %%
check(lambda: losses[0] > 3 * losses[-1],
      "about 0.53 with almost no smoothing vs 0.11 at alpha = 1: unsmoothed, words seen in one class only make it certain, and certain-and-wrong costs a lot")

# %% [markdown]
# ## 7. Counting one witness ten times
# Gaussian naive Bayes on five bank-call columns. `with_copies(k)` adds `k - 1` copies of the euribor column. For
# k = 1 and k = 10, set `sure_1` and `sure_10`: the share of test calls given over 90% chance of a yes
# (`(model.predict_proba(Xte_k)[:, 1] > 0.9).mean()`).

# %%
b = pd.read_csv(DATA + "bank.csv")
yb = (b["y"] == "yes").astype(int).values
five = ["age", "campaign", "pdays", "previous", "euribor3m"]
btr, bte, ybtr, ybte = train_test_split(b[five], yb, test_size=0.25, stratify=yb, random_state=0)
def with_copies(k):
    add = lambda X: pd.concat([X] + [X[["euribor3m"]].add_suffix(f"_{i}") for i in range(k - 1)], axis=1)
    return add(btr), add(bte)

sure_1 = sure_10 = None
### HINT T, U = with_copies(1); model = GaussianNB().fit(T, ybtr); then the share of model.predict_proba(U)[:, 1] > 0.9
### HINT do the same for with_copies(10)
### BEGIN SOLUTION
T, U = with_copies(1)
sure_1 = (GaussianNB().fit(T, ybtr).predict_proba(U)[:, 1] > 0.9).mean()
T, U = with_copies(10)
sure_10 = (GaussianNB().fit(T, ybtr).predict_proba(U)[:, 1] > 0.9).mean()
### END SOLUTION
print("over 90% sure, one euribor:", sure_1, "· ten copies:", sure_10)

# %%
check(lambda: sure_10 > 4 * sure_1,
      "about 5% vs 33%: ten copies count as ten independent witnesses, though they add nothing (the AUC barely moves: 0.74 → 0.75)")
