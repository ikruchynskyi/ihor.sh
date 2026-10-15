# %% [markdown]
# # Practice: information, entropy, cross-entropy and KL
# *AI from scratch, probability 5* · lesson: https://ihor.sh/ai/p5-information.html
#
# Count bits: the surprise of an outcome, the entropy of a forecast and of subway station names, the extra bits a
# wrong belief costs, a classifier's loss and perplexity, and the information gain of a decision tree's question.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import urllib.request
from collections import Counter
import numpy as np

# %% [markdown]
# ## 1. Surprise
# An outcome with probability $p$ carries $-\log_2 p$ bits of surprise. Set `bits` for an outcome with probability 1/8.

# %%
bits = None
### HINT np.log2 is the base-2 logarithm; surprise is minus it.
### HINT bits = -np.log2(1 / 8)
### BEGIN SOLUTION
bits = -np.log2(1 / 8)
### END SOLUTION
print(bits)

# %%
check(lambda: np.isclose(bits, 3), "1/8 = 2⁻³, so 3 bits: three yes/no questions")

# %% [markdown]
# ## 2. Entropy
# Write `entropy(p)`: the average surprise $-\sum_i p_i \log_2 p_i$ of a NumPy array of probabilities. Outcomes with
# probability 0 never happen and add nothing, so keep only `p[p > 0]` first (as in the lesson's wine box).

# %%
def entropy(p):
    ### HINT Two lines: p = p[p > 0], then return minus the sum of p times its log2.
    ### HINT return -np.sum(p * np.log2(p))
    ### BEGIN SOLUTION
    p = p[p > 0]
    return -np.sum(p * np.log2(p))
    ### END SOLUTION

print(entropy(np.array([0.5, 0.25, 0.125, 0.125])))

# %%
check(lambda: np.isclose(entropy(np.array([0.5, 0.25, 0.125, 0.125])), 1.75), "½ ¼ ⅛ ⅛ should give 1.75 bits, as in the lesson")
check(lambda: np.isclose(entropy(np.array([0.5, 0.5, 0, 0])), 1) and entropy(np.array([1.0, 0, 0])) == 0, "a coin flip is 1 bit (zeros skipped); a sure thing is 0")
check(lambda: np.isclose(entropy(np.full(6, 1 / 6)), np.log2(6)), "a fair die: log₂ 6 ≈ 2.585 bits")

# %% [markdown]
# ## 3. How many bits per character?
# The cell counts the characters in the 379 NYC subway station names. Turn the counts into probabilities `probs` (a
# NumPy array: each count over `n`), then set `H` with your `entropy`.

# %%
text = urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/stations.txt").read().decode().lower()
counts = Counter(text); n = len(text)
print(len(counts), "different characters,", n, "in all")
probs = H = None
### HINT np.array(list(counts.values())) is the counts as an array; divide it by n.
### HINT probs = np.array(list(counts.values())) / n, then H = entropy(probs)
### BEGIN SOLUTION
probs = np.array(list(counts.values())) / n
H = entropy(probs)
### END SOLUTION
print(H)

# %%
check(lambda: np.isclose(probs.sum(), 1), "the probabilities should add up to 1")
check(lambda: abs(H - 4.68) < 0.01, "about 4.68 bits per character, below log₂ 43 ≈ 5.43 for blind guessing")

# %% [markdown]
# ## 4. Cross-entropy and KL
# Write `cross_entropy(p, q)`, $-\sum_i p_i \log_2 q_i$, and `kl(p, q)`, the extra bits: cross-entropy minus the
# entropy of `p`. (Assume no zeros here.)

# %%
def cross_entropy(p, q):
    ### HINT Like entropy, but the log is of q while the weights are p.
    ### HINT return -np.sum(p * np.log2(q))
    ### BEGIN SOLUTION
    return -np.sum(p * np.log2(q))
    ### END SOLUTION

def kl(p, q):
    ### HINT Use the two functions you already have.
    ### HINT return cross_entropy(p, q) - entropy(p)
    ### BEGIN SOLUTION
    return cross_entropy(p, q) - entropy(p)
    ### END SOLUTION

truth = np.array([0.5, 0.25, 0.2, 0.05])               # sun, clouds, rain, storm
uniform = np.full(4, 0.25)
print(kl(truth, uniform), kl(uniform, truth))

# %%
check(lambda: np.isclose(kl(truth, uniform), 2 - entropy(truth)), "against a uniform belief the extra bits are log₂ 4 − H(p) ≈ 0.32")
check(lambda: np.isclose(kl(truth, truth), 0), "believing the truth costs no extra bits")
check(lambda: not np.isclose(kl(truth, uniform), kl(uniform, truth)), "KL isn't symmetric: 0.32 one way, 0.41 the other")

# %% [markdown]
# The lesson proved the extra bits are never negative. Test it: the cell makes 1,000 random pairs of distributions over
# 5 outcomes. Set `smallest`: the smallest `kl` among them.

# %%
rng = np.random.default_rng(0)
pairs = [(rng.dirichlet(np.ones(5)), rng.dirichlet(np.ones(5))) for _ in range(1000)]
smallest = None
### HINT min(...) over kl(p, q) for each (p, q) in pairs, with a comprehension.
### HINT smallest = min(kl(p, q) for p, q in pairs)
### BEGIN SOLUTION
smallest = min(kl(p, q) for p, q in pairs)
### END SOLUTION
print(smallest)

# %%
check(lambda: 0 <= smallest < 0.05, "never below 0 (ln x ≤ x − 1 at work), and close to 0 for the pair that happens to be most alike")

# %% [markdown]
# ## 5. A classifier's loss, in bits and as perplexity
# A model gave these probabilities to three classes for five examples; `y` holds the right classes. Set `loss`: the
# mean of $-\ln$ of the probability each example gave its right class, as PyTorch reports it (in nats; chapter 5's
# `P[np.arange(180), y]` picks those probabilities). Then convert: `bits` = loss / ln 2, and `perplexity` = 2 to the bits.

# %%
probs5 = np.array([[0.7, 0.2, 0.1], [0.1, 0.8, 0.1], [0.3, 0.3, 0.4], [0.6, 0.3, 0.1], [0.2, 0.2, 0.6]])
y = np.array([0, 1, 2, 1, 2])
loss = bits = perplexity = None
### HINT probs5[np.arange(5), y] are the five right-class probabilities.
### HINT loss = -np.mean(np.log(probs5[np.arange(5), y])); bits = loss / np.log(2); perplexity = 2 ** bits
### BEGIN SOLUTION
loss = -np.mean(np.log(probs5[np.arange(5), y]))
bits = loss / np.log(2)
perplexity = 2 ** bits
### END SOLUTION
print(loss, bits, perplexity)

# %%
from sklearn.metrics import log_loss
check(lambda: np.isclose(loss, log_loss(y, probs5)), "should match scikit-learn's log_loss: about 0.64 nats")
check(lambda: np.isclose(bits, 0.926, atol=1e-3) and np.isclose(perplexity, np.exp(loss)), "about 0.93 bits, perplexity about 1.9: a little surer than a coin flip between two classes")

# %% [markdown]
# ## 6. Information gain
# Write `gain(y, mask)`: how many bits the yes/no question `mask` (True or False for each row) tells you about the
# labels `y`. That's the labels' entropy minus the entropy left in each group, weighted by the group's size. `label_entropy`
# is given.

# %%
from sklearn.datasets import load_wine
wine = load_wine(); X, yw = wine.data, wine.target
label_entropy = lambda labels: entropy(np.bincount(labels) / len(labels))

def gain(y, mask):
    ### HINT The two groups are y[mask] and y[~mask]; their sizes are len(y[mask]) and len(y[~mask]).
    ### HINT after = (len(y[mask]) * label_entropy(y[mask]) + len(y[~mask]) * label_entropy(y[~mask])) / len(y)
    ### HINT return label_entropy(y) - after
    ### BEGIN SOLUTION
    after = (len(y[mask]) * label_entropy(y[mask]) + len(y[~mask]) * label_entropy(y[~mask])) / len(y)
    return label_entropy(y) - after
    ### END SOLUTION

flav = X[:, wine.feature_names.index("flavanoids")]
print(gain(yw, flav <= 1.57))

# %%
check(lambda: np.isclose(gain(yw, flav <= 1.57), 0.647, atol=1e-3), "the lesson's best first question: 0.647 bits")
check(lambda: np.isclose(gain(yw, np.arange(len(yw)) % 2 == 0), 0, atol=0.02), "splitting by odd and even rows tells you almost nothing")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Chris Olah's "Visual Information Theory" (colah.github.io) draws all of this.
