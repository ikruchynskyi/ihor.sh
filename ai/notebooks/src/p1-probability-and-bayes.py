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

rng = np.random.default_rng(0)

# %% [markdown]
# ## 1. At least one six
# Roll 4 dice. The chance of no six on one die is 5/6, so of no six on all four, $(5/6)^4$, and of at least one six
# the complement, $1 - (5/6)^4$. Set `p_exact` to that.

# %%
p_exact = None
### HINT ** is "to the power of": (5 / 6) ** 4.
### HINT p_exact = 1 - (5 / 6) ** 4
### BEGIN SOLUTION
p_exact = 1 - (5 / 6) ** 4
### END SOLUTION
print(p_exact)

# %%
check(lambda: abs(p_exact - 0.5177) < 1e-3, "1 − (5/6)⁴ is about 0.5177")

# %% [markdown]
# Now check it by simulation: a million rolls of 4 dice, one roll per row. `rolls == 6` marks every six True;
# `.any(axis=1)` asks of each row "is any of them True?". Set `p_sim` to the fraction of rows with at least one six.

# %%
rolls = rng.integers(1, 7, size=(1_000_000, 4))
print(rolls[:3])
p_sim = None
### HINT (rolls == 6).any(axis=1) is one True/False per roll; the mean of True/False is the share that are True.
### HINT p_sim = (rolls == 6).any(axis=1).mean()
### BEGIN SOLUTION
p_sim = (rolls == 6).any(axis=1).mean()
### END SOLUTION
print(p_sim, p_exact)

# %%
check(lambda: abs(p_sim - p_exact) < 0.003, "a million rolls should land within 0.003 of the exact 0.5177")

# %% [markdown]
# ## 2. The birthday problem, simulated
# Fill 100,000 rooms of 23 people with random birthdays (0–364). Set `p_shared` to the fraction of rooms where two
# people share one. Hint: sort each row (`np.sort(..., axis=1)`), then look for equal neighbors with `diff` (`np.diff(...) == 0`).

# %%
p_shared = None
### HINT Sample random birthdays (100_000 rooms, 23 people each) from 0 to 364.
### HINT Sort each room along axis 1 using np.sort(..., axis=1).
### HINT Check for equal adjacent days with (np.diff(days, axis=1) == 0).any(axis=1).
### HINT Take the mean across all rooms and assign to p_shared.
### BEGIN SOLUTION
days = np.sort(rng.integers(0, 365, size=(100_000, 23)), axis=1)
p_shared = (np.diff(days, axis=1) == 0).any(axis=1).mean()
### END SOLUTION
print(p_shared)

# %%
check(lambda: abs(p_shared - 0.507) < 0.01, 
      "With 23 people, the probability of at least one shared birthday should be ~50.7%.")

# %% [markdown]
# ## 3. Monty Hall, a million games at once
# `car` and `pick` are random doors (0–2) for each game. When you switch, you win exactly when your first pick was
# wrong (the host opens the other goat door). Set `p_stay` and `p_switch` to the win rates.

# %%
n = 1_000_000
car, pick = rng.integers(0, 3, n), rng.integers(0, 3, n)
p_stay = p_switch = None
### HINT Compute p_stay = (pick == car).mean() (win if initial pick was already the car).
### HINT Compute p_switch = (pick != car).mean() (win if initial pick was a goat, because host reveals the other).
### BEGIN SOLUTION
p_stay = (pick == car).mean()
p_switch = (pick != car).mean()
### END SOLUTION
print(p_stay, p_switch)

# %%
check(lambda: abs(p_stay - 1 / 3) < 0.003 and abs(p_switch - 2 / 3) < 0.003, 
      "Staying should yield ~33.3% wins (1/3) and switching should yield ~66.7% wins (2/3).")

# %% [markdown]
# ## 4. Bayes' rule
# Write `posterior(prior, sensitivity, false_positive)`: the probability of having the condition after a positive
# test, $\frac{P(+\mid\text{sick})P(\text{sick})}{P(+\mid\text{sick})P(\text{sick}) + P(+\mid\text{healthy})P(\text{healthy})}$.

# %%
def posterior(prior, sensitivity, false_positive):
    """Compute P(condition | positive test) via Bayes' theorem.
    
    Args:
        prior: Float P(condition), the base rate of the condition in the population.
        sensitivity: Float P(+ | condition), true positive rate.
        false_positive: Float P(+ | healthy), false positive rate.
    Returns:
        Float posterior probability P(condition | +).
    """
    ### HINT Compute P(+ and condition) = sensitivity * prior.
    ### HINT Compute P(+ and healthy) = false_positive * (1 - prior).
    ### HINT Return P(+ and condition) / (P(+ and condition) + P(+ and healthy)).
    ### BEGIN SOLUTION
    return sensitivity * prior / (sensitivity * prior + false_positive * (1 - prior))
    ### END SOLUTION

print(posterior(0.01, 0.9, 0.09))

# %%
check(lambda: abs(posterior(0.01, 0.9, 0.09) - 0.0917) < 1e-3, 
      "For a rare condition (1% prior, 90% sensitivity, 9% false positive), posterior should be ~9.17%.")
check(lambda: posterior(0.01, 0.9, 0.01) > 0.45, 
      "Reducing the false positive rate to 1% should dramatically raise the posterior above 45%.")

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
# 1. split messages with `.text` via `train_test_split(sms.text, sms.label == "spam", test_size=0.2, random_state=0)`
# 2. turn texts into word counts with `CountVectorizer` (`fit_transform` on train, only `transform` on test)
# 3. fit `MultinomialNB()` and set `accuracy` on the test set, plus `spam_recall`: the share of real spam it caught.

# %%
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
accuracy = spam_recall = None
### HINT Split sms.text and (sms.label == "spam") using train_test_split(..., test_size=0.2, random_state=0).
### HINT Initialize CountVectorizer(), fit_transform on Xtr, transform on Xte.
### HINT Fit MultinomialNB().fit(Xtr_vec, ytr) and predict labels on Xte_vec.
### HINT Compute test accuracy = (pred == yte).mean() and spam_recall = pred[yte.values].mean().
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
check(lambda: accuracy > 0.97, 
      "Naive Bayes test accuracy should exceed 97% on SMS spam classification.")
check(lambda: spam_recall > 0.85, 
      "Spam recall (fraction of actual spam correctly caught) should exceed 85%.")

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
# Set `p2` to the exact chance of exactly 2 heads in 4 fair flips with `comb` (`math.comb`), and `p2_sim` by simulating
# 1,000,000 rounds with `rng.binomial(4, 0.5, 1_000_000)`.

# %%
p2 = p2_sim = None
### HINT math.comb(4, 2) counts the orders with 2 heads (6); each order has chance 0.5 ** 4.
### HINT rng.binomial(4, 0.5, 1_000_000) gives the heads count of each round; == 2 then .mean() is the share with exactly 2.
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
