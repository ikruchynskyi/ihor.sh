# %% [markdown]
# # Practice: probability, simulation and a real spam filter
# *AI from scratch, probability 1* · lesson: https://ihor.sh/ai/p1-probability-and-bayes.html
#
# Answer probability questions by simulation (a million trials take a fraction of a second in NumPy), check them
# against the exact formulas, apply Bayes' rule, and train a naive Bayes spam filter on 5,574 real text messages.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# On Kaggle, turn on *Internet* in the notebook settings for part 5's download.

# %%
import math
import numpy as np

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

rng = np.random.default_rng(0)

# %% [markdown]
# ## 1. At least one six
# Roll 4 dice, 1,000,000 times (`rng.integers(1, 7, size=(1_000_000, 4))`). Set `p_sim` to the fraction of rolls with
# at least one six, and `p_exact` to the complement formula $1 - (5/6)^4$.

# %%
p_sim = p_exact = None
### BEGIN SOLUTION
rolls = rng.integers(1, 7, size=(1_000_000, 4))
p_sim = (rolls == 6).any(axis=1).mean()
p_exact = 1 - (5 / 6) ** 4
### END SOLUTION
print(p_sim, p_exact)

# %%
check(lambda: abs(p_exact - 0.5177) < 1e-3, "1 − (5/6)⁴ ≈ 0.518")
check(lambda: abs(p_sim - p_exact) < 0.003, "a million trials land within a few thousandths of the exact answer")

# %% [markdown]
# ## 2. The birthday problem, simulated
# Fill 100,000 rooms of 23 people with random birthdays (0–364). Set `p_shared` to the fraction of rooms where two
# people share one. Hint: sort each row (`np.sort(..., axis=1)`), then look for equal neighbors (`np.diff(...) == 0`).

# %%
p_shared = None
### BEGIN SOLUTION
days = np.sort(rng.integers(0, 365, size=(100_000, 23)), axis=1)
p_shared = (np.diff(days, axis=1) == 0).any(axis=1).mean()
### END SOLUTION
print(p_shared)

# %%
check(lambda: abs(p_shared - 0.507) < 0.01, "about 50.7%: more likely than not, with only 23 people")

# %% [markdown]
# ## 3. Monty Hall, a million games at once
# `car` and `pick` are random doors (0–2) for each game. When you switch, you win exactly when your first pick was
# wrong (the host opens the other goat door). Set `p_stay` and `p_switch` to the win rates.

# %%
n = 1_000_000
car, pick = rng.integers(0, 3, n), rng.integers(0, 3, n)
p_stay = p_switch = None
### BEGIN SOLUTION
p_stay = (pick == car).mean()
p_switch = (pick != car).mean()
### END SOLUTION
print(p_stay, p_switch)

# %%
check(lambda: abs(p_stay - 1 / 3) < 0.003 and abs(p_switch - 2 / 3) < 0.003, "staying wins 1/3, switching 2/3")

# %% [markdown]
# ## 4. Bayes' rule
# Write `posterior(prior, sensitivity, false_positive)`: the probability of having the condition after a positive
# test, $\frac{P(+\mid\text{sick})P(\text{sick})}{P(+\mid\text{sick})P(\text{sick}) + P(+\mid\text{healthy})P(\text{healthy})}$.

# %%
def posterior(prior, sensitivity, false_positive):
    ### BEGIN SOLUTION
    return sensitivity * prior / (sensitivity * prior + false_positive * (1 - prior))
    ### END SOLUTION

print(posterior(0.01, 0.9, 0.09))

# %%
check(lambda: abs(posterior(0.01, 0.9, 0.09) - 0.0917) < 1e-3, "1% sick, 90% sensitive, 9% false positives → about 9.2%")
check(lambda: posterior(0.01, 0.9, 0.01) > 0.45, "cutting false positives to 1% raises it to about 48%")

# %% [markdown]
# ## 5. A real spam filter
# The SMS Spam Collection (Almeida & Hidalgo, UCI, CC BY 4.0): 5,574 real text messages labeled spam or ham.

# %%
import io, urllib.request, zipfile
import pandas as pd
raw = urllib.request.urlopen("https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip").read()
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    sms = pd.read_csv(z.open("SMSSpamCollection"), sep="\t", names=["label", "text"], quoting=3)
print(sms.label.value_counts()); sms.head()

# %% [markdown]
# Train naive Bayes on 80% and test on the held-out 20%:
# 1. split with `train_test_split(sms.text, sms.label == "spam", test_size=0.2, random_state=0)`
# 2. turn texts into word counts with `CountVectorizer` (`fit_transform` on train, only `transform` on test)
# 3. fit `MultinomialNB()` and set `accuracy` on the test set, plus `spam_recall`: the share of real spam it caught.

# %%
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
accuracy = spam_recall = None
### BEGIN SOLUTION
Xtr, Xte, ytr, yte = train_test_split(sms.text, sms.label == "spam", test_size=0.2, random_state=0)
vec = CountVectorizer()
model = MultinomialNB().fit(vec.fit_transform(Xtr), ytr)
pred = model.predict(vec.transform(Xte))
accuracy = (pred == yte).mean()
spam_recall = pred[yte.values].mean()
### END SOLUTION
print("accuracy", accuracy, " spam caught", spam_recall)

# %%
check(lambda: accuracy > 0.97, "naive Bayes gets over 97% of test messages right")
check(lambda: spam_recall > 0.85, "and catches most of the spam")

# %% [markdown]
# Why is "accuracy" not enough here? Only about 13% of messages are spam: a filter that never flags anything
# scores 87%. Chapter 12 (measuring a model) is about exactly this. Which words push hardest toward spam?

# %%
if accuracy is not None:
    log_ratio = model.feature_log_prob_[1] - model.feature_log_prob_[0]
    words = np.array(vec.get_feature_names_out())
    print("spammiest words:", list(words[np.argsort(log_ratio)[-15:]][::-1]))

# %% [markdown]
# ## 6. The binomial
# Set `p2` to the exact chance of exactly 2 heads in 4 fair flips with `math.comb`, and `p2_sim` by simulating
# 1,000,000 rounds with `rng.binomial(4, 0.5, 1_000_000)`.

# %%
p2 = p2_sim = None
### BEGIN SOLUTION
p2 = math.comb(4, 2) * 0.5 ** 4
p2_sim = (rng.binomial(4, 0.5, 1_000_000) == 2).mean()
### END SOLUTION
print(p2, p2_sim)

# %%
check(lambda: p2 == 0.375 and abs(p2_sim - 0.375) < 0.003, "6 orders × (1/2)⁴ = 0.375")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: probability 2, describing data.
