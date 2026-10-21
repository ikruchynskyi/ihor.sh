# %% [markdown]
# # Milestone 7: Production AI Copilot from scratch
# *AI from scratch, milestone 7* · capstone combine notebook for Stage 7
#
# Build a complete production AI Copilot ("Personal Second-Brain & Incident Partner") that ties together every pillar of the curriculum:
# 1. **Data Engineering with SQL**: Ingest documents into an SQLite relational store and use window functions to retrieve point-in-time chunk states without leakage.
# 2. **Multimodal Voice & Receipt OCR Ingestion**: Clean Whisper voice-memo transcripts and parse structured fields from receipt OCR scans before indexing.
# 3. **Classic Tabular Classifier & Cost Matrix**: Predict document urgency and priority using metadata, tuning the decision threshold against asymmetric false-negative vs false-positive mistake costs.
# 4. **PyTorch Neural Bi-Encoder**: Implement a custom neural projection head in PyTorch that maps text vectors to unit-normalized embeddings, and build cosine vector search.
# 5. **2D SVD Semantic Topic Map**: Project high-dimensional TF-IDF vectors onto their top 2 right singular vectors so the copilot can render an interactive 2D topic map.
# 6. **Grounded RAG with Strict Provenance**: Format multi-chunk contexts with explicit `[doc#chunk]` citation brackets.
# 7. **Automated Grounding Evaluation**: Quantify the citation grounding ratio mathematically to catch hallucinations before reaching users.
# 8. **Production Serving & MLOps Drift**: Wrap the pipeline in a FastAPI-compatible service handler with a 100 ms latency budget, and compute the Population Stability Index (PSI) to detect distribution drift.
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import math, time, sqlite3, json, re
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer

print(f"PyTorch version: {torch.__version__} · SQLite3 version: {sqlite3.sqlite_version}")

# %% [markdown]
# ## 1. Data engineering & SQL window functions
# Our copilot ingests technical documents, voice memos, receipts, and incident reports.
# An in-memory SQLite database has been initialized below with two tables:
# - `documents`: `doc_id TEXT PRIMARY KEY, title TEXT, is_incident INT, created_hour INT, is_urgent INT`
# - `chunks`: `chunk_id TEXT PRIMARY KEY, doc_id TEXT, text TEXT, word_count INT, chunk_seq INT`
#
# Write a SQL query using the window function `ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY chunk_seq ASC)`
# to extract the first chunk (`chunk_seq = 1`) of every document.
# Fetch and store the resulting list of tuples `[(doc_id, chunk_id, text), ...]` in `first_chunks`.

# %%
conn = sqlite3.connect(":memory:")
cur = conn.cursor()
cur.execute("CREATE TABLE documents (doc_id TEXT PRIMARY KEY, title TEXT, is_incident INT, created_hour INT, is_urgent INT)")
cur.execute("CREATE TABLE chunks (chunk_id TEXT PRIMARY KEY, doc_id TEXT, text TEXT, word_count INT, chunk_seq INT)")

docs_data = [
    ("doc-1", "Transformer Attention Guide", 0, 14, 0),
    ("doc-2", "API Gateway Outage Report", 1, 9, 1),
    ("doc-3", "Optimizer Convergence Notes", 0, 11, 0),
    ("doc-4", "Database Pool Exhaustion", 1, 8, 1),
    ("doc-5", "LoRA Adapter Training", 0, 15, 0),
]
cur.executemany("INSERT INTO documents VALUES (?,?,?,?,?)", docs_data)

chunks_data = [
    ("c-1-1", "doc-1", "Self-attention computes dynamic weights from query and key dot products.", 11, 1),
    ("c-1-2", "doc-1", "Multi-head attention projects vectors into multiple representation subspaces.", 8, 2),
    ("c-2-1", "doc-2", "Production router failed due to memory exhaustion under spike load.", 10, 1),
    ("c-3-1", "doc-3", "Learning rates exceeding two over L cause oscillations in steep valleys.", 11, 1),
    ("c-4-1", "doc-4", "Backend database pool exhausted after connection leak in service worker.", 10, 1),
    ("c-5-1", "doc-5", "LoRA freezes base model weights and fine-tunes low rank adapter matrices.", 12, 1),
]
cur.executemany("INSERT INTO chunks VALUES (?,?,?,?,?)", chunks_data)
conn.commit()

### HINT Start by partitioning rows per document: SELECT doc_id, chunk_id, text, ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY chunk_seq ASC) as rn FROM chunks
### HINT Filter the outer query with WHERE rn = 1 and call cur.execute(query).fetchall()
### BEGIN SOLUTION
query = """
SELECT doc_id, chunk_id, text
FROM (
    SELECT doc_id, chunk_id, text,
           ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY chunk_seq ASC) as rn
    FROM chunks
) WHERE rn = 1
"""
first_chunks = cur.execute(query).fetchall()
### END SOLUTION

if "first_chunks" in locals() and isinstance(first_chunks, list):
    print(f"Extracted {len(first_chunks)} first-chunks using SQL window partition.")

# %%
check(lambda: len(first_chunks) == 5 and all(len(row) == 3 for row in first_chunks), "SQL window function extracts exactly one starting chunk per document without duplicates")

# %% [markdown]
# ## 2. Multimodal ingestion: Whisper voice transcripts & receipt OCR
# A real second-brain copilot ingests more than clean markdown: it receives raw Whisper audio transcripts
# with `[MM:SS]` timestamps and spoken fillers (`uhm`, `uh`), plus OCR text from receipts (`VENDOR: ... | ITEM: ... | TOTAL: $...`).
#
# Write `parse_multimodal_item(raw_text, source_kind)`:
# - When `source_kind == "voice"`:
#   1. Strip `[MM:SS]` timestamps using `re.sub(r"\[\d{2}:\d{2}\]\s*", "", raw_text)`.
#   2. Strip filler words `uhm` and `uh` using `re.sub(r"\b(uhm|uh)\b,?\s*", "", text, flags=re.I).strip()`.
#   3. Set `is_incident = int(any(w in cleaned.lower() for w in ("failed", "outage", "exhausted", "leak")))`.
#   4. Return `{"text": cleaned, "is_incident": is_incident, "word_count": len(cleaned.split())}`.
# - When `source_kind == "receipt"`:
#   1. Extract `vendor = re.search(r"VENDOR:\s*([^|]+)", raw_text).group(1).strip()`.
#   2. Extract `item = re.search(r"ITEM:\s*([^|]+)", raw_text).group(1).strip()`.
#   3. Extract `total = float(re.search(r"TOTAL:\s*\$?([0-9.]+)", raw_text).group(1))`.
#   4. Format `summary = f"Receipt from {vendor}: {item} totaling ${total:.2f}."` and return
#      `{"text": summary, "is_incident": 0, "word_count": len(summary.split()), "total_usd": total}`.

# %%
sample_voice = "[00:01] Uhm, production router failed due to memory exhaustion under spike load."
sample_receipt = "VENDOR: CloudGPU Inc | DATE: 2026-10-20 | ITEM: 8x H100 Spot Node | TOTAL: $412.50"

### HINT For "voice", chain the two re.sub(...) calls, check whether any incident keyword is in cleaned.lower(), and count cleaned.split().
### HINT For "receipt", extract vendor, item, and total with re.search(...), build the summary string, and return the dict including "total_usd".
### BEGIN SOLUTION
def parse_multimodal_item(raw_text, source_kind):
    if source_kind == "voice":
        cleaned = re.sub(r"\[\d{2}:\d{2}\]\s*", "", raw_text)
        cleaned = re.sub(r"\b(uhm|uh)\b,?\s*", "", cleaned, flags=re.I).strip()
        is_inc = int(any(w in cleaned.lower() for w in ("failed", "outage", "exhausted", "leak")))
        return {"text": cleaned, "is_incident": is_inc, "word_count": len(cleaned.split())}
    vendor = re.search(r"VENDOR:\s*([^|]+)", raw_text).group(1).strip()
    item = re.search(r"ITEM:\s*([^|]+)", raw_text).group(1).strip()
    total = float(re.search(r"TOTAL:\s*\$?([0-9.]+)", raw_text).group(1))
    summary = f"Receipt from {vendor}: {item} totaling ${total:.2f}."
    return {"text": summary, "is_incident": 0, "word_count": len(summary.split()), "total_usd": total}
### END SOLUTION

if "parse_multimodal_item" in locals() and callable(parse_multimodal_item):
    try:
        print("Voice:", parse_multimodal_item(sample_voice, "voice"))
        print("Receipt:", parse_multimodal_item(sample_receipt, "receipt"))
    except Exception:
        pass

# %%
check(lambda: parse_multimodal_item(sample_voice, "voice")["is_incident"] == 1 and "[00:01]" not in parse_multimodal_item(sample_voice, "voice")["text"] and abs(parse_multimodal_item(sample_receipt, "receipt")["total_usd"] - 412.50) < 1e-6, "multimodal parser cleans Whisper voice transcripts and extracts structured receipt totals")

# %% [markdown]
# ## 3. Tabular metadata classifier & asymmetric cost-aware threshold
# Before running expensive RAG search, the copilot triages incoming documents: is this an urgent incident?
# Features: `[word_count, is_incident, created_hour]`.
# 1. Fit a `LogisticRegression` on `X` and labels `y = [0, 1, 0, 1, 0]`.
# 2. Get predicted positive-class probabilities `probs = clf.predict_proba(X)[:, 1]`.
# 3. In production, missing an urgent incident (False Negative) costs **10x** more than a false alarm (False Positive):
#    $\text{Cost} = 10 \cdot \text{FN} + 1 \cdot \text{FP}$.
# 4. Search across candidate thresholds `np.linspace(0.1, 0.9, 9)`. Find the threshold that minimizes total cost,
#    and assign it to `best_threshold`.

# %%
X = np.array([
    [11, 0, 14],  # doc-1: non-incident
    [10, 1, 9],   # doc-2: incident
    [11, 0, 11],  # doc-3: non-incident
    [10, 1, 8],   # doc-4: incident
    [12, 0, 15]   # doc-5: non-incident
])
y = np.array([0, 1, 0, 1, 0])

### HINT Fit LogisticRegression().fit(X, y) and take column 1 of predict_proba(X).
### HINT Loop over np.linspace(0.1, 0.9, 9), compute fn and fp at each threshold, and keep the threshold with lowest 10 * fn + fp.
### BEGIN SOLUTION
clf = LogisticRegression().fit(X, y)
probs = clf.predict_proba(X)[:, 1]

thresholds = np.linspace(0.1, 0.9, 9)
best_cost = float("inf")
best_threshold = 0.5

for th in thresholds:
    preds = (probs >= th).astype(int)
    fn = np.sum((preds == 0) & (y == 1))
    fp = np.sum((preds == 1) & (y == 0))
    cost = 10 * fn + fp
    if cost < best_cost:
        best_cost = cost
        best_threshold = float(th)
### END SOLUTION

if "best_threshold" in locals() and isinstance(best_threshold, float):
    print(f"Optimal cost-aware decision threshold: {best_threshold:.2f} (Total Cost: {best_cost})")

# %%
check(lambda: best_threshold <= 0.5 and best_cost == 0, "asymmetric threshold prevents costly false negatives (missing an urgent alert)")

# %% [markdown]
# ## 4. PyTorch Neural Bi-Encoder projection head
# Implement a PyTorch `nn.Module` class named `BiEncoderHead`:
# - Has a linear layer `self.proj = nn.Linear(in_features, out_features, bias=False)`.
# - In `forward(x)`, passes `x` through `self.proj` and returns the L2-normalized vector `F.normalize(..., p=2, dim=-1)`.
#
# Instantiate `model = BiEncoderHead(vocab_size, 16)` and project `D_tensor` into `doc_embeddings`.

# %%
all_chunk_texts = [row[2] for row in chunks_data]
tfidf = TfidfVectorizer().fit(all_chunk_texts)
vocab_size = len(tfidf.get_feature_names_out())
D_tensor = torch.tensor(tfidf.transform(all_chunk_texts).toarray(), dtype=torch.float32)

### HINT Subclass nn.Module, create self.proj = nn.Linear(in_features, out_features, bias=False) in __init__.
### HINT In forward(self, x), return F.normalize(self.proj(x), p=2, dim=-1).
### BEGIN SOLUTION
class BiEncoderHead(nn.Module):
    def __init__(self, in_features, out_features=16):
        super().__init__()
        self.proj = nn.Linear(in_features, out_features, bias=False)

    def forward(self, x):
        return F.normalize(self.proj(x), p=2, dim=-1)

torch.manual_seed(42)
model = BiEncoderHead(vocab_size, 16)
with torch.no_grad():
    doc_embeddings = model(D_tensor)
### END SOLUTION

if "doc_embeddings" in locals() and isinstance(doc_embeddings, torch.Tensor):
    print(f"Projected chunks shape: {doc_embeddings.shape}")

# %%
check(lambda: doc_embeddings.shape == (6, 16) and torch.allclose(torch.norm(doc_embeddings, dim=-1), torch.ones(6)), "PyTorch bi-encoder projects document chunks into unit-normalized 16D embedding vectors")

# %% [markdown]
# ## 5. 2D SVD semantic topic map projection
# To visualize the knowledge base in the browser, the copilot projects the high-dimensional TF-IDF matrix onto 2D
# using Singular Value Decomposition ($\mathbf{X}_c = \mathbf{U}\boldsymbol{\Sigma}\mathbf{V}^\top$, from L3 SVD):
# Write `project_chunks_2d(tfidf_matrix)` that:
# 1. Centers the matrix by subtracting the column mean: `X_c = tfidf_matrix - np.mean(tfidf_matrix, axis=0, keepdims=True)`.
# 2. Computes `U, S, Vt = np.linalg.svd(X_c, full_matrices=False)`.
# 3. Projects onto the first 2 right singular vectors: `coords_2d = X_c @ Vt[:2].T`.
# 4. Computes the fraction of variance captured by the first 2 singular values: `var_ratio = float(np.sum(S[:2] ** 2) / np.sum(S ** 2))`.
# Return `(coords_2d, var_ratio)`.

# %%
X_tfidf_np = D_tensor.numpy()

### HINT Center the columns first: X_c = tfidf_matrix - np.mean(tfidf_matrix, axis=0, keepdims=True), then call np.linalg.svd(X_c, full_matrices=False).
### HINT Multiply X_c @ Vt[:2].T for the (N, 2) coordinates, and divide np.sum(S[:2] ** 2) by np.sum(S ** 2).
### BEGIN SOLUTION
def project_chunks_2d(tfidf_matrix):
    X_c = tfidf_matrix - np.mean(tfidf_matrix, axis=0, keepdims=True)
    U, S, Vt = np.linalg.svd(X_c, full_matrices=False)
    coords_2d = X_c @ Vt[:2].T
    var_ratio = float(np.sum(S[:2] ** 2) / np.sum(S ** 2))
    return coords_2d, var_ratio
### END SOLUTION

if "project_chunks_2d" in locals() and callable(project_chunks_2d):
    try:
        coords_2d, svd_var = project_chunks_2d(X_tfidf_np)
        print(f"2D SVD shape: {coords_2d.shape} · Variance explained by top 2 axes: {svd_var:.3f}")
    except Exception:
        pass

# %%
check(lambda: project_chunks_2d(X_tfidf_np)[0].shape == (6, 2) and abs(project_chunks_2d(X_tfidf_np)[1] - 0.4323) < 0.01, "SVD projects the 6 chunks into 2D coordinates capturing 43.2% of total variance")

# %% [markdown]
# ## 6. Cosine vector retrieval
# Write `retrieve_top_k(query_str, top_k=3)` that:
# 1. Transforms `query_str` into TF-IDF vector, converts to PyTorch float tensor `q_tensor`.
# 2. Computes query embedding `q_emb = model(q_tensor)`.
# 3. Computes cosine similarities with all chunks via matrix multiplication: `sims = torch.mm(q_emb, doc_embeddings.T)[0]`.
# 4. Returns the top `top_k` indices sorted descending by similarity as a list of integers.

# %%
### HINT Transform [query_str] with tfidf, wrap in torch.tensor(..., dtype=torch.float32), and pass through model(q_tensor).
### HINT Compute sims = torch.mm(q_emb, doc_embeddings.T)[0] and return [int(idx) for idx in torch.argsort(-sims)[:top_k].numpy()].
### BEGIN SOLUTION
def retrieve_top_k(query_str, top_k=3):
    q_tensor = torch.tensor(tfidf.transform([query_str]).toarray(), dtype=torch.float32)
    with torch.no_grad():
        q_emb = model(q_tensor)
        sims = torch.mm(q_emb, doc_embeddings.T)[0]
    return [int(idx) for idx in torch.argsort(-sims)[:top_k].numpy()]
### END SOLUTION

if "retrieve_top_k" in locals() and callable(retrieve_top_k):
    try:
        top_hits = retrieve_top_k("memory router load spike", top_k=3)
        print(f"Top-3 retrieved chunk indices for incident query: {top_hits}")
    except Exception:
        top_hits = None

# %%
check(lambda: len(retrieve_top_k("memory router load spike", top_k=3)) == 3 and retrieve_top_k("memory router load spike", top_k=3)[0] == 2, "vector search retrieves the router memory outage chunk as the top match for memory spike query")

# %% [markdown]
# ## 7. Grounded RAG context assembly with citation provenance
# Write `build_grounded_context(retrieved_indices)` that accepts a list of chunk indices and builds
# a context string where each retrieved chunk is tagged with its provenance identifier:
# `[{doc_id}#{chunk_seq}] {text}`
# joined by newlines.
# Example: `"[doc-2#1] Production router failed due to memory exhaustion under spike load."`

# %%
### HINT For each index i in retrieved_indices, format f"[{chunks_data[i][1]}#{chunks_data[i][4]}] {chunks_data[i][2]}".
### HINT Join the formatted lines with "\n".join(lines).
### BEGIN SOLUTION
def build_grounded_context(retrieved_indices):
    lines = [f"[{chunks_data[i][1]}#{chunks_data[i][4]}] {chunks_data[i][2]}" for i in retrieved_indices]
    return "\n".join(lines)
### END SOLUTION

if "build_grounded_context" in locals() and callable(build_grounded_context):
    try:
        ctx = build_grounded_context([2, 4, 0])
        print(f"Grounded context:\n{ctx}")
    except Exception:
        ctx = ""

# %%
check(lambda: "[doc-2#1]" in build_grounded_context([2, 4, 0]) and "Production router failed" in build_grounded_context([2, 4, 0]), "grounded context includes chunk text with strict document citation brackets")

# %% [markdown]
# ## 8. Automated grounding evaluation (hallucination detection)
# To verify the copilot doesn't hallucinate unsupported facts, evaluate grounding mathematically:
# Write `compute_grounding_ratio(answer_sentence, context_text)` that:
# 1. Normalizes `answer_sentence` and `context_text` to lowercase and strips punctuation.
# 2. Extracts words with length $> 3$ from the answer (`ans_tokens`).
# 3. Extracts words with length $> 3$ from the context (`ctx_tokens`).
# 4. Computes the fraction of answer tokens that appear in the context:
#    $\text{ratio} = \frac{|\text{ans\_tokens} \cap \text{ctx\_tokens}|}{|\text{ans\_tokens}|}$
# Returns float (or `0.0` if `ans_tokens` is empty).

# %%
grounded_ans = "The production router failed because memory was exhausted under spike load [doc-2#1]."
hallucinated_ans = "The quantum neural database was hacked by unauthorized alien actors."
sample_ctx = "[doc-2#1] Production router failed due to memory exhaustion under spike load."

### HINT Tokenize lowercase alphanumeric words longer than 3 characters into sets a_toks and c_toks.
### HINT Return len(a_toks & c_toks) / len(a_toks) if a_toks is non-empty, else 0.0.
### BEGIN SOLUTION
def compute_grounding_ratio(answer_sentence, context_text):
    def clean(s):
        return [w for w in "".join(c if c.isalnum() else " " for c in s.lower()).split() if len(w) > 3]
    a_toks = set(clean(answer_sentence))
    c_toks = set(clean(context_text))
    if not a_toks:
        return 0.0
    return float(len(a_toks.intersection(c_toks)) / len(a_toks))
### END SOLUTION

if "compute_grounding_ratio" in locals() and callable(compute_grounding_ratio):
    try:
        g_score = compute_grounding_ratio(grounded_ans, sample_ctx)
        h_score = compute_grounding_ratio(hallucinated_ans, sample_ctx)
        print(f"Grounded answer score: {g_score:.2f} · Hallucinated answer score: {h_score:.2f}")
    except Exception:
        pass

# %%
check(lambda: compute_grounding_ratio(grounded_ans, sample_ctx) >= 0.75 and compute_grounding_ratio(hallucinated_ans, sample_ctx) < 0.15, "grounding evaluator verifies cited statements and rejects ungrounded hallucinations")

# %% [markdown]
# ## 9. Production FastAPI service handler
# Write `copilot_service(request_dict)` simulating a FastAPI endpoint handler:
# `request_dict` contains `{"query": str, "metadata": [word_count, is_incident, hour]}`.
# 1. Start timer `t0 = time.perf_counter()`.
# 2. Score urgency using `clf.predict_proba([request_dict["metadata"]])[0, 1]`. Mark `is_urgent = bool(p_urgent >= best_threshold)`.
# 3. Retrieve top-2 chunk indices with `retrieve_top_k(query, top_k=2)`.
# 4. Build context and citations list `[f"{chunks_data[i][1]}#{chunks_data[i][4]}" for i in hits]`.
# 5. Measure latency in milliseconds: `latency_ms = (time.perf_counter() - t0) * 1000`.
# Return a dictionary:
# `{"citations": list[str], "is_urgent": bool, "urgency_score": float, "latency_ms": float}`

# %%
### HINT Score urgency probability p with clf.predict_proba([request_dict["metadata"]])[0, 1] and retrieve hits = retrieve_top_k(request_dict["query"], top_k=2).
### HINT Format citations as [f"{chunks_data[i][1]}#{chunks_data[i][4]}" for i in hits] and measure latency_ms = (time.perf_counter() - t0) * 1000.
### BEGIN SOLUTION
def copilot_service(request_dict):
    t0 = time.perf_counter()
    p = float(clf.predict_proba([request_dict["metadata"]])[0, 1])
    hits = retrieve_top_k(request_dict["query"], top_k=2)
    cits = [f"{chunks_data[i][1]}#{chunks_data[i][4]}" for i in hits]
    latency_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "citations": cits,
        "is_urgent": bool(p >= best_threshold),
        "urgency_score": p,
        "latency_ms": latency_ms
    }
### END SOLUTION

req = {"query": "router load spike", "metadata": [10, 1, 9]}
if "copilot_service" in locals() and callable(copilot_service):
    try:
        res = copilot_service(req)
        print(f"Service Response: {res}")
    except Exception:
        res = None

# %%
check(lambda: copilot_service({"query": "router load spike", "metadata": [10, 1, 9]})["is_urgent"] is True and "doc-2#1" in copilot_service({"query": "router load spike", "metadata": [10, 1, 9]})["citations"] and copilot_service({"query": "router load spike", "metadata": [10, 1, 9]})["latency_ms"] < 100, "production service completes classification, vector retrieval, and provenance formatting in under 100 ms")

# %% [markdown]
# ## 10. Real-time MLOps drift monitor: Population Stability Index (PSI)
# In production, query distributions drift over time (e.g. shifts from routine ML questions to outage incidents).
# Implement `calculate_psi(baseline_scores, production_scores, num_bins=4)`:
# 1. Compute empirical histograms using `np.histogram` across range `(0, 1)`.
# 2. Add small epsilon `1e-4` to prevent division by zero or $\log(0)$.
# 3. Normalize into probability distributions $P$ and $Q$.
# 4. Return:
#    $\text{PSI} = \sum_{b=1}^B (P_b - Q_b) \cdot \ln(P_b / Q_b)$

# %%
baseline_traffic = np.array([0.05, 0.12, 0.18, 0.08, 0.15, 0.22, 0.09, 0.14])
in_distribution_batch = np.array([0.08, 0.14, 0.16, 0.11, 0.17, 0.20, 0.10, 0.15])
drifted_incident_batch = np.array([0.85, 0.92, 0.78, 0.88, 0.95, 0.81, 0.90, 0.86])

### HINT Bin both arrays over range=(0.0, 1.0) with np.histogram, add 1e-4 to counts, and divide each by its sum to get p and q.
### HINT Return float(np.sum((p - q) * np.log(p / q))).
### BEGIN SOLUTION
def calculate_psi(baseline_scores, production_scores, num_bins=4):
    p_counts, bins = np.histogram(baseline_scores, bins=num_bins, range=(0.0, 1.0))
    q_counts, _ = np.histogram(production_scores, bins=bins)
    p = (p_counts + 1e-4) / np.sum(p_counts + 1e-4)
    q = (q_counts + 1e-4) / np.sum(q_counts + 1e-4)
    return float(np.sum((p - q) * np.log(p / q)))
### END SOLUTION

if "calculate_psi" in locals() and callable(calculate_psi):
    try:
        stable_psi = calculate_psi(baseline_traffic, in_distribution_batch)
        drift_psi = calculate_psi(baseline_traffic, drifted_incident_batch)
        print(f"Normal traffic PSI: {stable_psi:.3f} (stable) · Incident surge PSI: {drift_psi:.3f} (alert)")
    except Exception:
        pass

# %%
check(lambda: calculate_psi(baseline_traffic, in_distribution_batch) < 0.10 and calculate_psi(baseline_traffic, drifted_incident_batch) > 0.25, "PSI drift monitor detects distribution drift when incoming query patterns deviate from training baseline")
