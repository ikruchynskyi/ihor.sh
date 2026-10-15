# %% [markdown]
# # Practice: support vector machines
# *AI from scratch, model zoo 8* · lesson: https://ihor.sh/ai/zoo-svm.html
#
# Hinge loss and the street's width, the RBF kernel's γ on handwritten digits, C and the support vectors, scaling on
# the bank calls, training time as the data doubles, and a linear SVM on 5,574 text messages. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.
# On Kaggle, turn on *Internet* in the notebook settings.
#
# Bank marketing: Moro, Cortez and Rita (2014), UCI, CC BY 4.0. SMS Spam Collection: Almeida, Gómez Hidalgo and
# Yamakami (2011), UCI, CC BY 4.0.

# %%
import time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.svm import SVC, LinearSVC
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import roc_auc_score

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
d = load_digits()
Xtr, Xte, ytr, yte = train_test_split(d.data, d.target, test_size=0.25, stratify=d.target, random_state=0)
print(len(Xtr), "training digits")

# %% [markdown]
# ## 1. Hinge loss
# `yf` holds \(y \cdot f(x)\) for five dots: positive means the right side, 1 or more means beyond the street's edge.
# Set `hinge` to \(\max(0, 1 - y f(x))\) for each, with `np.maximum`. Predict first: which dots cost nothing?

# %%
yf = np.array([3.0, 1.0, 0.5, 0.0, -2.0])
hinge = None
### HINT np.maximum(0, something) takes the bigger of 0 and each entry.
### HINT hinge = np.maximum(0, 1 - yf)
### BEGIN SOLUTION
hinge = np.maximum(0, 1 - yf)
### END SOLUTION
print(hinge)

# %%
check(lambda: np.allclose(hinge, [0, 0, 0.5, 1, 3]),
      "[0, 0, 0.5, 1, 3]: dots at or beyond the edge cost nothing; inside the street or across it, the cost grows linearly")

# %% [markdown]
# ## 2. The width of the street
# The edges are where \(f = \pm 1\), so the street is \(2 / \lVert w \rVert\) wide. Set `width` for this `w`, with
# `np.linalg.norm`.

# %%
w = np.array([3.0, 4.0])
width = None
### HINT np.linalg.norm(w) is the length of w: 5 here.
### HINT width = 2 / np.linalg.norm(w)
### BEGIN SOLUTION
width = 2 / np.linalg.norm(w)
### END SOLUTION
print(width)

# %%
check(lambda: abs(width - 0.4) < 1e-9, "2 / 5 = 0.4: halving the weights would double the width, which is why the SVM minimizes |w|²")

# %% [markdown]
# ## 3. The kernel's reach, γ
# For each γ in `gammas`, fit `SVC(gamma=g)` on the digits and record the test accuracy and the share of training
# digits that are support vectors (`model.n_support_.sum() / len(Xtr)`). `run(g)` returns both; set `results` to
# `run(g)` for each γ.

# %%
def run(g):
    model = SVC(gamma=g).fit(Xtr, ytr)
    return model.score(Xte, yte), model.n_support_.sum() / len(Xtr)

gammas = [1e-4, 1e-3, 1e-2, 1e-1]
results = None
### HINT results = [run(g) for g in gammas]
### BEGIN SOLUTION
results = [run(g) for g in gammas]
### END SOLUTION
pd.DataFrame(results, index=gammas, columns=["test accuracy", "support vector share"]) if results else None

# %%
check(lambda: results[1][0] > 0.98 and results[3][0] < 0.2 and results[3][1] > 0.99,
      "99.1% at γ = 0.001 with half the digits as support vectors; at 0.1 every digit is one and accuracy falls to chance (10%)")

# %% [markdown]
# ## 4. The soft margin, C
# Set `sv_shares` to the support vector share for each C in `Cs`, with the default γ
# (`SVC(C=c).fit(Xtr, ytr).n_support_.sum() / len(Xtr)`). Predict first: does a bigger C mean more or fewer support
# vectors?

# %%
Cs = [0.1, 1, 10, 100]
sv_shares = None
### HINT sv_shares = [SVC(C=c).fit(Xtr, ytr).n_support_.sum() / len(Xtr) for c in Cs]
### BEGIN SOLUTION
sv_shares = [SVC(C=c).fit(Xtr, ytr).n_support_.sum() / len(Xtr) for c in Cs]
### END SOLUTION
print(sv_shares)

# %%
check(lambda: sv_shares[0] > 0.7 and sv_shares[-1] < 0.5,
      "about 84% at C = 0.1 and 41% at C = 100: a cheap margin violation means a wide street with many dots inside it")

# %% [markdown]
# ## 5. Scaling, on the bank calls
# Set `auc_raw` and `auc_scaled` to the test AUC of `SVC()` without and with `StandardScaler()` first. SVMs give
# scores, not probabilities, so use `model.decision_function(Bte)` as the score.

# %%
bk = pd.read_csv(DATA + "bank.csv")
yb = (bk["y"] == "yes").astype(int).values
Xb = pd.get_dummies(bk.drop(columns=["y", "duration"]), dtype=float)
Btr, Bte, bytr, byte = train_test_split(Xb, yb, test_size=0.25, stratify=yb, random_state=0)
auc_raw = auc_scaled = None
### HINT auc_raw = roc_auc_score(byte, SVC().fit(Btr, bytr).decision_function(Bte))
### HINT the scaled one is make_pipeline(StandardScaler(), SVC()), fitted and scored the same way
### BEGIN SOLUTION
auc_raw = roc_auc_score(byte, SVC().fit(Btr, bytr).decision_function(Bte))
auc_scaled = roc_auc_score(byte, make_pipeline(StandardScaler(), SVC()).fit(Btr, bytr).decision_function(Bte))
### END SOLUTION
print("unscaled:", auc_raw, "· scaled:", auc_scaled)

# %%
check(lambda: auc_scaled > auc_raw + 0.01,
      "about 0.68 unscaled and 0.71 scaled: better, and still the lowest in the zoo on this table (logistic regression: 0.78)")

# %% [markdown]
# ## 6. Training time as the data doubles
# `fit_time(n)` trains an RBF SVM on n synthetic rows and returns the seconds. Set `times` for each n in `sizes`, then
# `growth` to the last time divided by the one before it.

# %%
rng = np.random.default_rng(0)
def fit_time(n):
    Z = rng.normal(size=(n, 10)); zy = (Z[:, 0] * Z[:, 1] + np.sin(Z[:, 2]) + 0.5 * rng.normal(size=n) > 0).astype(int)
    t = time.time(); SVC().fit(Z, zy); return time.time() - t

sizes = [2000, 4000, 8000, 16000]
times = growth = None
### HINT times = [fit_time(n) for n in sizes]
### HINT growth = times[-1] / times[-2]
### BEGIN SOLUTION
times = [fit_time(n) for n in sizes]
growth = times[-1] / times[-2]
### END SOLUTION
print(times, "· doubling the rows multiplied the time by", growth)

# %%
check(lambda: growth > 2.5, "about 4: the time grows like the square of the rows, so a million rows would take hours")

# %% [markdown]
# ## 7. Where SVMs still shine: text
# 7,166 word columns (tf-idf weights) from the text messages. Set `acc_text` to `LinearSVC()`'s test accuracy.

# %%
from sklearn.feature_extraction.text import TfidfVectorizer
sms = pd.read_csv(DATA + "sms-spam.tsv", sep="\t", names=["label", "text"], quoting=3)
ys = (sms["label"] == "spam").astype(int).values
ttr, tte, ystr, yste = train_test_split(sms["text"], ys, test_size=0.3, stratify=ys, random_state=0)
vec = TfidfVectorizer().fit(ttr)
T, U = vec.transform(ttr), vec.transform(tte)
acc_text = None
### HINT acc_text = LinearSVC().fit(T, ystr).score(U, yste)
### BEGIN SOLUTION
acc_text = LinearSVC().fit(T, ystr).score(U, yste)
### END SOLUTION
print(acc_text)

# %%
check(lambda: acc_text > 0.97, "about 97.9% in milliseconds: thousands of sparse columns, where a straight street is all you need")
