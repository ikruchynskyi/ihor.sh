# %% [markdown]
# # Practice: text as numbers, tokens
# *AI from scratch, stage 5* · lesson: https://ihor.sh/ai/tokens.html
#
# Count UTF-8 bytes, build byte-pair encoding from scratch on the NYC station names (pair counts, merges, training,
# encoding new text), then open GPT-2's real tokenizer and measure what the lesson claims about "strawberry" and
# about English versus Ukrainian. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import urllib.request
from collections import Counter
import matplotlib.pyplot as plt

text = urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/stations.txt").read().decode()
names = [n for n in text.split("\n") if n]
print(len(names), "names, for example:", names[:5])

# %% [markdown]
# ## 1. Bytes
# Set `n_bytes` to the number of UTF-8 bytes in `"Привіт"` ("hello" in Ukrainian): `.encode("utf-8")` gives the bytes.

# %%
n_bytes = None
### HINT len("Привіт".encode("utf-8"))
### BEGIN SOLUTION
n_bytes = len("Привіт".encode("utf-8"))
### END SOLUTION
print(n_bytes)

# %%
check(lambda: n_bytes == 12, "6 Cyrillic letters × 2 bytes each = 12")

# %% [markdown]
# ## 2. Count neighboring pairs
# Write `count_pairs(words)`: `words` is a list of token lists (like `[["C", "o", "u"], ["A", "v"]]`). Return a
# `Counter` of every neighboring pair `(a, b)` over all the words, as the lesson's box does with `zip(w, w[1:])`.

# %%
def count_pairs(words):
    ### HINT Counter((a, b) for w in words for a, b in zip(w, w[1:]))
    ### BEGIN SOLUTION
    return Counter((a, b) for w in words for a, b in zip(w, w[1:]))
    ### END SOLUTION

# %%
check(lambda: count_pairs([["a", "b", "a", "b"], ["a", "b"]]) == Counter({("a", "b"): 3, ("b", "a"): 1}),
      "('a','b') appears 3 times (twice in the first word, once in the second), ('b','a') once")

# %% [markdown]
# ## 3. Merge one pair
# Write `merge(w, a, b)`: walk through the token list `w`; wherever `a` is directly followed by `b`, put the single
# token `a + b`, otherwise keep the token. (The lesson's box has one; write it without looking if you can.)

# %%
def merge(w, a, b):
    out, i = [], 0
    ### HINT A while loop over i: if i < len(w) - 1 and w[i] == a and w[i + 1] == b, append a + b and move i by 2.
    ### HINT Otherwise append w[i] and move i by 1. Return out at the end.
    ### BEGIN SOLUTION
    while i < len(w):
        if i < len(w) - 1 and w[i] == a and w[i + 1] == b:
            out.append(a + b); i += 2
        else:
            out.append(w[i]); i += 1
    return out
    ### END SOLUTION

# %%
check(lambda: merge(["S", "t", " ", "S", "t", "S"], "S", "t") == ["St", " ", "St", "S"] and merge(["a", "a", "a"], "a", "a") == ["aa", "a"],
      "pairs merge left to right and don't overlap: 'aaa' becomes 'aa', 'a'")

# %% [markdown]
# ## 4. Train BPE
# Starting from `words` (every name as characters), do 200 merges: each time, find the most common pair with
# `count_pairs(words).most_common(1)[0][0]`, append it to `merges`, and replace `words` by every word merged.
# `avg_tokens` (given) then records the average tokens per name after each merge.

# %%
words = [list(n) for n in names]
merges, avg_tokens = [], [sum(map(len, words)) / len(words)]
### HINT for step in range(200):   then a, b = count_pairs(words).most_common(1)[0][0]
### HINT merges.append((a, b)); words = [merge(w, a, b) for w in words]; avg_tokens.append(sum(map(len, words)) / len(words))
### BEGIN SOLUTION
for step in range(200):
    a, b = count_pairs(words).most_common(1)[0][0]
    merges.append((a, b))
    words = [merge(w, a, b) for w in words]
    avg_tokens.append(sum(map(len, words)) / len(words))
### END SOLUTION
print("first 10 merges:", [a + b for a, b in merges[:10]])
plt.plot(avg_tokens); plt.xlabel("merges"); plt.ylabel("average tokens per station name"); plt.show()

# %%
check(lambda: len(merges) == 200 and merges[0] == (" ", "S") and 5.4 < avg_tokens[-1] < 6.0,
      "the first merge is ' ' + 'S' (all those ' St' and ' Sq'); after 200 merges a name is about 5.7 tokens instead of 12")

# %% [markdown]
# ## 5. Tokenize new text
# Write `encode(text)`: start from `list(text)` and apply every learned merge, in the order learned.

# %%
def encode(text):
    ### HINT w = list(text), then for a, b in merges: w = merge(w, a, b). Return w.
    ### BEGIN SOLUTION
    w = list(text)
    for a, b in merges:
        w = merge(w, a, b)
    return w
    ### END SOLUTION

for t in ["Court Sq", "Times Sq-42 St", "Strawberry Av", "Kyiv Av"]:
    print(repr(t), "→", encode(t))

# %%
check(lambda: encode("Court Sq")[-1] == " Sq" and "".join(encode("Zzyzx Rd")) == "Zzyzx Rd",
      "learned pieces are used, and a never-seen word still comes out whole, just in smaller pieces")

# %% [markdown]
# ## 6. A real tokenizer: GPT-2's
# Hugging Face's `transformers` (preinstalled on Colab and Kaggle) downloads GPT-2's tokenizer, 50,257 tokens learned
# with byte-level BPE. Set `en` and `uk` to the number of tokens (`len(tok.encode(...))`) for the English and Ukrainian
# sentences, and `ratio = uk / en`.

# %%
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("gpt2")
english, ukrainian = "Hello, how are you today?", "Привіт, як ти сьогодні?"
en = uk = ratio = None
### HINT en = len(tok.encode(english)); uk = len(tok.encode(ukrainian))
### HINT ratio = uk / en
### BEGIN SOLUTION
en = len(tok.encode(english))
uk = len(tok.encode(ukrainian))
ratio = uk / en
### END SOLUTION
print(en, uk, ratio)

# %%
check(lambda: (en, uk) == (7, 26) and abs(ratio - 26 / 7) < 1e-9, "7 against 26: the same question costs 3.7 times as many tokens in Ukrainian")

# %% [markdown]
# ## 7. What does the model see of "strawberry"?
# Set `pieces` to the list of strings for each token of `"strawberry"`: encode it, then decode each id on its own
# (`tok.decode([i])`). Then set `pieces_space` the same way for `" strawberry"` (with a leading space).

# %%
pieces = pieces_space = None
### HINT pieces = [tok.decode([i]) for i in tok.encode("strawberry")]
### HINT the same with " strawberry" for pieces_space
### BEGIN SOLUTION
pieces = [tok.decode([i]) for i in tok.encode("strawberry")]
pieces_space = [tok.decode([i]) for i in tok.encode(" strawberry")]
### END SOLUTION
print(pieces, pieces_space, tok.encode(" strawberry"))

# %%
check(lambda: pieces == ["st", "raw", "berry"] and pieces_space == [" strawberry"],
      "three pieces at the start of a line, one id with a space: either way, no letters for the model to count")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Karpathy, "Let's build the GPT Tokenizer": https://www.youtube.com/watch?v=zduSFxRajkE
