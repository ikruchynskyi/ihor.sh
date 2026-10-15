# %% [markdown]
# # Practice: evaluating LLMs
# *AI from scratch, stage 6* · lesson: https://ihor.sh/ai/evaluating-llms.html
#
# Build the grading side of an eval: a normalizing check, Cohen's kappa, a small model as judge (and how far to trust
# it), a position-bias test for pairwise judging, and a paired comparison of SmolLM2 with and without retrieval on 20
# questions about this course. A few minutes on a CPU. Replace each `...` under `# YOUR CODE HERE`, run the cell, then
# the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import json, re, urllib.request
import numpy as np
import torch
from scipy import stats
from transformers import AutoTokenizer, AutoModelForCausalLM
from sklearn.feature_extraction.text import TfidfVectorizer

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
ev = json.load(urllib.request.urlopen(DATA + "llm-eval.json"))
graded, qa = ev["graded"], ev["qa"]
labels = [d["label"] for d in graded]
print(len(graded), "graded answers,", sum(labels), "of them correct ·", len(qa), "questions with accepted answers")
print(graded[0])

# %% [markdown]
# ## 1. Normalize before comparing
# Write `norm(s)`: lowercase, drop commas (so 65,504 = 65504), keep only runs of letters and digits
# (`re.findall(r"[a-z0-9]+", ...)`), joined by single spaces.

# %%
def norm(s):
    ### HINT " ".join(re.findall(r"[a-z0-9]+", s.lower().replace(",", "")))
    ### BEGIN SOLUTION
    return " ".join(re.findall(r"[a-z0-9]+", s.lower().replace(",", "")))
    ### END SOLUTION

# %%
check(lambda: norm("ResNet-50 has 50 layers.") == "resnet 50 has 50 layers" and norm("65,504") == "65504", "lowercase words and numbers, punctuation gone")

# %% [markdown]
# ## 2. A contains-check, and its agreement
# Write `contains(answer, ref)`: true when the normalized reference appears as whole words in the normalized answer
# (pad both with spaces: `f" {norm(ref)} " in f" {norm(answer)} "`). Then set `calls`, its 0/1 verdict on every graded
# answer, and `agree`, the share that match `labels`.

# %%
def contains(answer, ref):
    ### HINT return f" {norm(ref)} " in f" {norm(answer)} "
    ### BEGIN SOLUTION
    return f" {norm(ref)} " in f" {norm(answer)} "
    ### END SOLUTION

calls = agree = None
### HINT calls = [int(contains(d["answer"], d["reference"])) for d in graded]
### HINT agree = np.mean([c == l for c, l in zip(calls, labels)])
### BEGIN SOLUTION
calls = [int(contains(d["answer"], d["reference"])) for d in graded]
agree = np.mean([c == l for c, l in zip(calls, labels)])
### END SOLUTION
print("contains-check agrees on", agree)
for d, c in zip(graded, calls or []):
    if c != d["label"]:
        print("  disagrees:", d["answer"])

# %%
check(lambda: abs(agree - 16 / 18) < 1e-9, "16 of 18: it's fooled by the two answers that mention the right word next to a wrong claim")

# %% [markdown]
# ## 3. Cohen's kappa
# Write `kappa(a, b)` for two lists of 0/1 verdicts: observed agreement `po`, chance agreement
# `pe = pa * pb + (1 - pa) * (1 - pb)` where `pa`, `pb` are each grader's share of 1s, and `(po - pe) / (1 - pe)`.

# %%
def kappa(a, b):
    a, b = np.array(a), np.array(b)
    ### HINT po = np.mean(a == b); pa, pb = a.mean(), b.mean()
    ### HINT pe = pa * pb + (1 - pa) * (1 - pb); return (po - pe) / (1 - pe)
    ### BEGIN SOLUTION
    po = np.mean(a == b)
    pa, pb = a.mean(), b.mean()
    pe = pa * pb + (1 - pa) * (1 - pb)
    return (po - pe) / (1 - pe)
    ### END SOLUTION

print("contains-check kappa:", kappa(calls, labels) if calls is not None else None, "· always 'correct':", kappa([1] * len(labels), labels))

# %%
check(lambda: abs(kappa([1] * 18, labels)) < 1e-9 and abs(kappa(labels, labels) - 1) < 1e-9 and abs(kappa(calls, labels) - 0.7778) < 1e-3,
      "1 for perfect agreement, 0 for the do-nothing grader, about 0.78 for the contains-check")

# %% [markdown]
# ## 4. A small model as judge
# `judge(item)` (given) asks SmolLM2-360M whether the answer is correct, given the question and reference. Set
# `verdicts` to its 0/1 verdict on every graded answer, and `judge_kappa` to its kappa against `labels`.

# %%
name = "HuggingFaceTB/SmolLM2-360M-Instruct"
tok = AutoTokenizer.from_pretrained(name)
llm = AutoModelForCausalLM.from_pretrained(name, dtype=torch.float32)
def generate(prompt, n=40):
    ids = tok(tok.apply_chat_template([{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True), return_tensors="pt").input_ids
    with torch.no_grad():
        return tok.decode(llm.generate(ids, max_new_tokens=n, do_sample=False)[0, ids.shape[1]:], skip_special_tokens=True)
def judge(item):
    reply = generate(f"Question: {item['q']}\nReference answer: {item['reference']}\nStudent answer: {item['answer']}\n"
                     "Is the student answer correct? Reply with only yes or no.", 5)
    return 1 if reply.strip().lower().startswith("yes") else 0

verdicts = judge_kappa = None
### HINT verdicts = [judge(d) for d in graded]
### HINT judge_kappa = kappa(verdicts, labels)
### BEGIN SOLUTION
verdicts = [judge(d) for d in graded]
judge_kappa = kappa(verdicts, labels)
### END SOLUTION
print("judge says correct", sum(verdicts) if verdicts else None, "times · kappa", judge_kappa)

# %%
check(lambda: len(verdicts) == 18 and judge_kappa < 0.5, "a weak judge: it agrees barely more than chance (kappa about 0.2). Validate judges before using them")

# %% [markdown]
# ## 5. Position bias
# Pairwise judging asks "which answer is better, 1 or 2?". `prefer(q, first, second)` (given) returns 1 or 2. For each
# question below there's a right and a wrong answer. Ask both orders; the judge is *consistent* on a pair if it picks
# the same answer both times, meaning 1 in one order and 2 in the other. Set `consistent` to the share of consistent
# pairs.

# %%
def prefer(q, first, second):
    reply = generate(f"Question: {q}\nAnswer 1: {first}\nAnswer 2: {second}\nWhich answer is correct? Reply with only 1 or 2.", 3)
    return 2 if "2" in reply else 1
pairs = [(d["q"], d["answer"], e["answer"]) for d in graded if d["label"] == 1 for e in graded if e["q"] == d["q"] and e["label"] == 0][:8]
consistent = None
### HINT For each (q, right, wrong): a = prefer(q, right, wrong), b = prefer(q, wrong, right); consistent when a != b.
### HINT consistent = np.mean([prefer(q, r, w) != prefer(q, w, r) for q, r, w in pairs])
### BEGIN SOLUTION
consistent = np.mean([prefer(q, r, w) != prefer(q, w, r) for q, r, w in pairs])
### END SOLUTION
print(len(pairs), "pairs · consistent across orders:", consistent)

# %%
check(lambda: 0 <= consistent <= 1 and len(pairs) == 8, "the share of pairs where swapping the order didn't change which answer won; anything under 1 is position bias")

# %% [markdown]
# ## 6. Did retrieval help? A paired comparison
# Both systems answer the same 20 questions (given: plain, and with the 3 best course passages by TF-IDF). Each answer
# is graded with your `contains` against any accepted answer. Set `b` (questions only plain got right), `c` (only RAG
# got right), and `p`: the exact paired test from Probability 4, `stats.binomtest(c, b + c, 0.5).pvalue`.

# %%
idx = json.load(urllib.request.urlopen(DATA + "course-chunks.json")); sec = idx["sections"]
docs = [f"{s['lesson']}: {s['section']}. {s['text']}" for s in sec]
tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(docs); D = tfidf.transform(docs)
def rag_answer(q):
    top = np.argsort(-(tfidf.transform([q]) @ D.T).toarray()[0])[:3]
    ctx = "\n\n".join(f"[{k + 1}] {sec[i]['text'][:600]}" for k, i in enumerate(top))
    return generate(f"Use the passages to answer briefly.\n\n{ctx}\n\nQuestion: {q}")
right = lambda ans, accept: any(contains(ans, a) for a in accept)
plain_ok = [right(generate(f"Answer briefly: {x['q']}"), x["accept"]) for x in qa]
rag_ok = [right(rag_answer(x["q"]), x["accept"]) for x in qa]
print("plain:", sum(plain_ok), "/ 20 · with retrieval:", sum(rag_ok), "/ 20")
b = c = p = None
### HINT b = sum(x and not y for x, y in zip(plain_ok, rag_ok)); c the other way round
### HINT p = stats.binomtest(c, b + c, 0.5).pvalue
### BEGIN SOLUTION
b = sum(x and not y for x, y in zip(plain_ok, rag_ok))
c = sum(y and not x for x, y in zip(plain_ok, rag_ok))
p = stats.binomtest(c, b + c, 0.5).pvalue
### END SOLUTION
print("only plain right:", b, "· only RAG right:", c, "· paired p =", p)

# %%
check(lambda: b + c > 0 and abs(p - stats.binomtest(c, b + c, 0.5).pvalue) < 1e-12 and c > b,
      "retrieval wins every question that changed, and with 20 questions that's still not conclusive (p ≈ 0.1): eval sets need hundreds")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Anthropic, "Create strong empirical evaluations":
# https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests
