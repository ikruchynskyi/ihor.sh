# %% [markdown]
# # Milestone 6: Grounded QA bot over course documents
# *AI from scratch, milestone 6* · combine notebook for Stage 6
#
# Build a complete retrieval-augmented generation (RAG) question-answering bot over the 254 lesson sections
# of the *AI from scratch* curriculum:
# 1. Index course document chunks using TF-IDF and cosine vector representations.
# 2. Build a top-$k$ retriever and measure context recall on a 35-question human-written evaluation set.
# 3. Assemble grounded prompt contexts with bracketed passage citations (`[1]`, `[2]`, `[3]`).
# 4. Formulate grounded answers and evaluate grounding (measuring whether answer statements are faithful to retrieved facts vs hallucinations).
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import json, urllib.request, re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

DATA = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/"
index = json.load(urllib.request.urlopen(DATA + "course-chunks.json"))
sections = index["sections"]
questions = json.load(urllib.request.urlopen(DATA + "retrieval-questions.json"))["questions"]

docs = [f"{s['lesson']}: {s['section']}. {s['text']}" for s in sections]
target = [next(i for i, s in enumerate(sections) if s["page"] == q["page"] and s["section"].startswith(f"{q['section']}.")) for q in questions]

print(f"Loaded {len(docs)} course chunks and {len(questions)} test evaluation questions.")
print(f"Sample test: '{questions[0]['q']}' → target: '{sections[target[0]]['section']}'")

# %% [markdown]
# ## 1. Building the document retriever index
# Fit a `TfidfVectorizer` with `stop_words="english"` and `sublinear_tf=True` across all `docs`.
# Compute the document matrix `D = tfidf.transform(docs)`.
# Assign to `tfidf` and `D`.

# %%
### HINT tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(docs); D = tfidf.transform(docs)
### BEGIN SOLUTION
tfidf = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(docs)
D = tfidf.transform(docs)
### END SOLUTION

# %%
check(lambda: D.shape == (254, len(tfidf.get_feature_names_out())), "retriever index transforms 254 course chunks into normalized sparse TF-IDF vectors")

# %% [markdown]
# ## 2. The top-k retriever
# Write `retrieve(query, k=3)` that:
# - Transforms `query` into vector `q_vec = tfidf.transform([query])`
# - Computes cosine similarities: `scores = (q_vec @ D.T).toarray()[0]`
# - Finds the top `k` chunk indices sorted descending by score: `np.argsort(-scores)[:k]`
# Returns a list of the top `k` indices.

# %%
def retrieve(query, k=3):
    ### HINT q_vec = tfidf.transform([query]); scores = (q_vec @ D.T).toarray()[0]; return list(np.argsort(-scores)[:k])
    ### BEGIN SOLUTION
    q_vec = tfidf.transform([query])
    scores = (q_vec @ D.T).toarray()[0]
    return list(np.argsort(-scores)[:k])
    ### END SOLUTION

# %%
check(lambda: len(retrieve(questions[0]["q"], k=3)) == 3, "retrieve(query, k=3) returns list of top 3 chunk indices")

# %% [markdown]
# ## 3. Measuring context recall on the eval set
# Evaluate the retriever across all 35 questions.
# A question is a "hit" if its ground-truth `target[i]` appears anywhere in the top 3 retrieved chunks.
# Compute the fraction of hits across all 35 questions and store in `recall_at_3`.

# %%
### HINT hits = [target[i] in retrieve(questions[i]["q"], k=3) for i in range(len(questions))]
### HINT recall_at_3 = float(np.mean(hits))
### BEGIN SOLUTION
hits = [target[i] in retrieve(questions[i]["q"], k=3) for i in range(len(questions))]
recall_at_3 = float(np.mean(hits))
### END SOLUTION

if "recall_at_3" in locals() and recall_at_3 is not None:
    print(f"Retriever Context Recall@3: {recall_at_3 * 100:.1f}%")

# %%
check(lambda: recall_at_3 > 0.70, "retriever successfully surfaces the ground-truth answer chunk in top-3 for over 70% of questions")

# %% [markdown]
# ## 4. Formulating the grounded RAG context prompt
# Write `build_rag_prompt(query, chunk_indices)` that assembles:
# ```text
# CONTEXT:
# [1] <chunk text 1>
# [2] <chunk 2 text>
# ...
# QUESTION: <query>
# INSTRUCTIONS: Answer the question using ONLY the provided context. Cite sources using [1], [2].
# ```
# Return the assembled string.

# %%
def build_rag_prompt(query, chunk_indices):
    ### HINT lines = ["CONTEXT:"] + [f"[{i+1}] {docs[idx]}" for i, idx in enumerate(chunk_indices)] + [f"QUESTION: {query}", "INSTRUCTIONS: Answer using ONLY the context above. Cite sources with [1], [2]."]
    ### BEGIN SOLUTION
    lines = ["CONTEXT:"]
    for i, idx in enumerate(chunk_indices):
        lines.append(f"[{i+1}] {docs[idx]}")
    lines.append(f"QUESTION: {query}")
    lines.append("INSTRUCTIONS: Answer using ONLY the context above. Cite sources with [1], [2].")
    return "\n\n".join(lines)
    ### END SOLUTION

# %%
check(lambda: "[1]" in build_rag_prompt(questions[0]["q"], [0, 1]) and "[2]" in build_rag_prompt(questions[0]["q"], [0, 1]) and questions[0]["q"] in build_rag_prompt(questions[0]["q"], [0, 1]), "RAG prompt builder attaches numbered source citations and user query")

# %% [markdown]
# ## 5. Grounding evaluation: measuring faithfulness
# When an LLM generates a response, we must verify that its assertions are grounded in the retrieved chunks,
# rather than hallucinated facts or prior knowledge.
#
# Write `grounding_ratio(answer, context_text)`:
# - Extract lowercase alphabetic words of length $\ge 4$ from both `answer` and `context_text` using `re.findall(r'[a-z]{4,}', text.lower())`.
# - If `answer_words` is empty, return 1.0.
# - Compute the fraction of unique words in `answer_words` that appear in `context_words`:
#   $$\text{ratio} = \frac{|\text{unique words in answer} \cap \text{unique words in context}|}{|\text{unique words in answer}|}$$
# Return `ratio` as a float.

# %%
def grounding_ratio(answer, context_text):
    ### HINT a_words = set(re.findall(r'[a-z]{4,}', answer.lower()))
    ### HINT if not a_words: return 1.0
    ### HINT c_words = set(re.findall(r'[a-z]{4,}', context_text.lower()))
    ### HINT return float(len(a_words & c_words) / len(a_words))
    ### BEGIN SOLUTION
    a_words = set(re.findall(r'[a-z]{4,}', answer.lower()))
    if not a_words:
        return 1.0
    c_words = set(re.findall(r'[a-z]{4,}', context_text.lower()))
    return float(len(a_words & c_words) / len(a_words))
    ### END SOLUTION

# %%
ctx = docs[target[0]]
grounded_ans = "The training error falls because high-degree polynomials bend to fit noisy points, but validation error rises [1]."
hallucinated_ans = "Quantum entanglement explains why deep quantum circuits outperform classical gradient descent on supercomputers."

check(lambda: grounding_ratio(grounded_ans, ctx) > 0.65 and grounding_ratio(hallucinated_ans, ctx) < 0.20, "grounding evaluator correctly gives high scores to faithful responses and flags hallucinations")

# %% [markdown]
# ## 6. The complete QA Bot function
# Write `qa_bot(query)` that:
# 1. Calls `indices = retrieve(query, k=2)`
# 2. Extracts top chunk: `best_doc = docs[indices[0]]`
# 3. Returns a dictionary:
#    - `"query"`: query string
#    - `"citations"`: `[sections[i]["lesson"] for i in indices]`
#    - `"top_chunk"`: `best_doc`
#    - `"is_grounded"`: `True`

# %%
def qa_bot(query):
    ### HINT indices = retrieve(query, k=2); return {"query": query, "citations": [sections[i]["lesson"] for i in indices], "top_chunk": docs[indices[0]], "is_grounded": True}
    ### BEGIN SOLUTION
    indices = retrieve(query, k=2)
    return {
        "query": query,
        "citations": [sections[i]["lesson"] for i in indices],
        "top_chunk": docs[indices[0]],
        "is_grounded": True
    }
    ### END SOLUTION

# %%
check(lambda: isinstance(qa_bot("Why does my model overfit on small datasets?"), dict) and len(qa_bot("Why does my model overfit on small datasets?")["citations"]) == 2, "QA bot retrieves relevant course chunks and returns verifiable citations")
