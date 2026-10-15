# %% [markdown]
# # Practice: serving a model
# *AI from scratch, stage 7* · lesson: https://ihor.sh/ai/serving.html
#
# Put the toolkit's outage model behind a FastAPI service and call it the way other programs will: a typed input that
# rejects bad requests, a predict endpoint that returns its version, latency percentiles over many calls, a batch
# endpoint and its throughput, then int8 quantization written by hand, and a cache. Runs on a CPU in a minute.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import copy, functools, subprocess, sys, time
import numpy as np
import pandas as pd
try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except ImportError:                                   # preinstalled on Colab and Kaggle; elsewhere, install it
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "fastapi", "httpx"])
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
from pydantic import BaseModel
from sklearn.compose import make_column_transformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression

# The toolkit 2 model: will an elevator or escalator outage last more than 4 hours?
df = pd.read_csv("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/outages.csv", parse_dates=["start", "last_seen"])
f = df[df["finished"]].copy()
f["hours"] = (f["last_seen"] - f["start"]).dt.total_seconds() / 3600
f["hour"] = f["start"].dt.hour; f["n_lines"] = f["lines"].str.count("/") + 1
X, y = f[["kind", "reason", "ada", "hour", "n_lines"]], (f["hours"] > 4).astype(int)
model = make_pipeline(make_column_transformer((OneHotEncoder(handle_unknown="ignore"), ["kind", "reason"]), (StandardScaler(), ["ada", "hour", "n_lines"])),
                      LogisticRegression(max_iter=2000)).fit(X, y)
VERSION = "outages-logreg-2026-10-15"
print("trained on", len(X), "outages")

# %% [markdown]
# ## 1. The input contract
# The pydantic class `Outage` lists the fields a request must have, each as `name: type`. Three are written; add the
# last two: `hour` and `n_lines`, both whole numbers (`int`).

# %%
class Outage(BaseModel):
    kind: str
    reason: str
    ada: int
    ### HINT Two more lines in the same style:   hour: int
    ### HINT hour: int   and   n_lines: int, one per line
    ### BEGIN SOLUTION
    hour: int
    n_lines: int
    ### END SOLUTION

# %%
check(lambda: Outage(kind="EL", reason="Repair", ada=1, hour=9, n_lines=4).hour == 9 and set(Outage.model_fields) == {"kind", "reason", "ada", "hour", "n_lines"},
      "five fields, each with its type")

# %% [markdown]
# ## 2. The predict endpoint
# Write the body of `predict`: turn the validated input into a one-row DataFrame (`pd.DataFrame([o.model_dump()])`),
# take `model.predict_proba(...)[0, 1]`, and return `{"p_long": float(p), "model_version": VERSION}`.

# %%
app = FastAPI()

@app.post("/predict")
def predict(o: Outage):
    ### HINT p = model.predict_proba(pd.DataFrame([o.model_dump()]))[0, 1]
    ### HINT return {"p_long": float(p), "model_version": VERSION}
    ### BEGIN SOLUTION
    p = model.predict_proba(pd.DataFrame([o.model_dump()]))[0, 1]
    return {"p_long": float(p), "model_version": VERSION}
    ### END SOLUTION

client = TestClient(app)                     # calls the app like a real HTTP client would, without starting a server
good = {"kind": "EL", "reason": "Maintenance", "ada": 1, "hour": 9, "n_lines": 4}
r = client.post("/predict", json=good)
print(r.status_code, r.json())

# %%
check(lambda: r.status_code == 200 and 0 <= r.json()["p_long"] <= 1 and r.json()["model_version"] == VERSION,
      "200 OK with a probability and the model version")

# %% [markdown]
# ## 3. Bad input never reaches the model
# **Predict** the status code for a request whose `hour` is the text "morning", then run it. Set `guess_code`.

# %%
guess_code = None
### HINT pydantic rejects it before predict runs; FastAPI answers "422 Unprocessable Entity".
### BEGIN SOLUTION
guess_code = 422
### END SOLUTION

# %%
bad = client.post("/predict", json={**good, "hour": "morning"})
print(bad.status_code, bad.json())
check(lambda: guess_code == bad.status_code == 422, "422, with a message naming the field: the model never saw garbage")

# %% [markdown]
# ## 4. Latency percentiles
# Call the endpoint 300 times and time each call with `time.perf_counter()` (given). Set `p50`, `p95` and `p99` in
# milliseconds with `np.percentile(lat_ms, q)`.

# %%
lat_ms = []
for _ in range(300):
    t = time.perf_counter(); client.post("/predict", json=good); lat_ms.append((time.perf_counter() - t) * 1000)
p50 = p95 = p99 = None
### HINT p50 = np.percentile(lat_ms, 50), the same for 95 and 99
### BEGIN SOLUTION
p50, p95, p99 = np.percentile(lat_ms, 50), np.percentile(lat_ms, 95), np.percentile(lat_ms, 99)
### END SOLUTION
print(f"mean {np.mean(lat_ms):.2f} ms", "· p50", p50, "· p95", p95, "· p99", p99)

# %%
check(lambda: p50 <= p95 <= p99 and abs(p95 - np.percentile(lat_ms, 95)) < 1e-9, "the tail is always above the median, often by a lot")

# %% [markdown]
# ## 5. A batch endpoint
# Write `predict_batch`, taking a list of outages and returning one probability per item, from a *single*
# `predict_proba` call on a DataFrame of all of them. Then compare throughput: 300 single calls vs 3 batch calls of 100.

# %%
@app.post("/predict_batch")
def predict_batch(items: list[Outage]):
    ### HINT frame = pd.DataFrame([o.model_dump() for o in items])
    ### HINT return {"p_long": model.predict_proba(frame)[:, 1].tolist(), "model_version": VERSION}
    ### BEGIN SOLUTION
    frame = pd.DataFrame([o.model_dump() for o in items])
    return {"p_long": model.predict_proba(frame)[:, 1].tolist(), "model_version": VERSION}
    ### END SOLUTION

batch = [{**good, "hour": h % 24} for h in range(100)]
t = time.perf_counter()
for b in batch * 3:
    client.post("/predict", json=b)
single = 300 / (time.perf_counter() - t)
t = time.perf_counter()
for _ in range(3):
    out = client.post("/predict_batch", json=batch)
batched = 300 / (time.perf_counter() - t)
print(f"one at a time: {single:.0f} predictions/s · batches of 100: {batched:.0f} predictions/s")

# %%
check(lambda: len(out.json()["p_long"]) == 100 and batched > 3 * single, "the same predictions, many times faster: per-call overhead is paid once per batch")

# %% [markdown]
# ## 6. Quantize a network to int8, by hand
# The toolkit's digit network (given, 91.7% accurate). Write `quantize_(net, bits)`: for every `nn.Linear` in the
# network, give each row of its weight one scale, `scale = row's largest |weight| / qmax` with `qmax = 2**(bits-1) - 1`,
# and replace the weights by `round(w / scale)` clipped to `[-qmax, qmax]`, times `scale`, as in the one-row example
# below. Write the result into the layer with `layer.weight.copy_(...)`, which changes the network in place.

# %%
import torch
from torch import nn
from sklearn.datasets import load_digits
Xd, yd = load_digits(return_X_y=True); Xd = torch.tensor(Xd / 16, dtype=torch.float32); yd = torch.tensor(yd)
torch.manual_seed(0)
net = nn.Sequential(nn.Linear(64, 512), nn.ReLU(), nn.Linear(512, 512), nn.ReLU(), nn.Linear(512, 10))
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
for _ in range(200):
    opt.zero_grad(); nn.functional.cross_entropy(net(Xd[:1400]), yd[:1400]).backward(); opt.step()
accuracy = lambda m: (m(Xd[1400:]).argmax(1) == yd[1400:]).float().mean().item()

# One row of weights, quantized to 8 bits step by step: its scale, the integers, and what they stand for.
w_row = torch.tensor([[0.50, -1.27, 0.03, 0.90]])
scale_row = w_row.abs().amax(1, keepdim=True) / 127             # the row's largest |w| maps to 127
ints = torch.round(w_row / scale_row).clamp(-127, 127)
print("scale", scale_row.item(), "· integers", ints.tolist(), "· back to weights", (ints * scale_row).tolist())

# %%
@torch.no_grad()
def quantize_(net, bits):
    qmax = 2 ** (bits - 1) - 1
    for layer in net:
        if isinstance(layer, nn.Linear):
            w = layer.weight
            ### HINT scale = w.abs().amax(1, keepdim=True) / qmax
            ### HINT layer.weight.copy_(torch.round(w / scale).clamp(-qmax, qmax) * scale)
            ### BEGIN SOLUTION
            scale = w.abs().amax(1, keepdim=True) / qmax
            layer.weight.copy_(torch.round(w / scale).clamp(-qmax, qmax) * scale)
            ### END SOLUTION

results = {}
with torch.no_grad():
    results["float32"] = accuracy(net)
    for bits in [8, 4, 2]:
        q = copy.deepcopy(net); quantize_(q, bits); results[f"{bits}-bit"] = accuracy(q)
print(results)

# %%
check(lambda: abs(results["8-bit"] - results["float32"]) < 0.01 and results["2-bit"] < results["float32"] - 0.2,
      "8 bits: no loss; 4 bits: almost none; 2 bits: the network falls apart")

# %% [markdown]
# ## 7. Cache a slow, repeatable call
# `slow_lookup` takes 50 ms. Make `cached_lookup`, the same function wrapped with `functools.lru_cache(maxsize=1024)`,
# so repeated arguments come back instantly. The timing (given) calls it with 20 distinct stations, 5 times each.

# %%
def slow_lookup(station):
    time.sleep(0.05)
    return len(station)
cached_lookup = None
### HINT cached_lookup = functools.lru_cache(maxsize=1024)(slow_lookup)
### BEGIN SOLUTION
cached_lookup = functools.lru_cache(maxsize=1024)(slow_lookup)
### END SOLUTION
calls = [f"station {i}" for i in range(20)] * 5
t = time.perf_counter()
for s in calls:
    (cached_lookup or slow_lookup)(s)
took = time.perf_counter() - t
print(f"{len(calls)} calls in {took:.2f} s")

# %%
check(lambda: took < 2.0 and cached_lookup.cache_info().hits == 80, "20 misses at 50 ms, then 80 hits for free: about 1 s instead of 5")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · FastAPI's tutorial: https://fastapi.tiangolo.com/tutorial/
