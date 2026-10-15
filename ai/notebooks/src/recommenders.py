# %% [markdown]
# # Practice: recommenders
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/recommenders.html
#
# MovieLens: 100,000 ratings of 9,700 movies by 610 people. Measure how empty the table is, beat "the average" with
# biases and taste vectors in PyTorch on a time split, see what regularization does, recommend movies to one person,
# and compare against plain popularity on the metric that matters for a feed, recall@10. A few minutes on a CPU.
# MovieLens is © GroupLens (University of Minnesota) and is downloaded from them, not redistributed here.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import io, urllib.request, zipfile
import numpy as np
import pandas as pd
import torch
from torch import nn
torch.manual_seed(0)
z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen("https://files.grouplens.org/datasets/movielens/ml-latest-small.zip").read()))
ratings = pd.read_csv(z.open("ml-latest-small/ratings.csv")).sort_values("timestamp")
movies = pd.read_csv(z.open("ml-latest-small/movies.csv")).set_index("movieId")
print(len(ratings), "ratings ·", ratings["userId"].nunique(), "people ·", ratings["movieId"].nunique(), "movies")

# %% [markdown]
# ## 1. How empty is the table?
# Set `filled`: the share of the people × movies table that has a rating (ratings divided by people times movies).

# %%
filled = None
### HINT len(ratings) / (ratings["userId"].nunique() * ratings["movieId"].nunique())
### BEGIN SOLUTION
filled = len(ratings) / (ratings["userId"].nunique() * ratings["movieId"].nunique())
### END SOLUTION
print(filled)

# %%
check(lambda: abs(filled - 100836 / (610 * 9724)) < 1e-12, "1.7%: more than 98% of the table is empty, and the model fills it in")

# %% [markdown]
# ## 2. A time split, and the do-nothing baseline
# Train on the first 90% of ratings in time, test on the rest (keeping people and movies seen in training). Set
# `rmse_mean`: the RMSE on the test ratings of predicting the training mean `mu` for everything.

# %%
cut = ratings["timestamp"].quantile(0.9)
train, test = ratings[ratings["timestamp"] < cut], ratings[ratings["timestamp"] >= cut]
test = test[test["userId"].isin(train["userId"]) & test["movieId"].isin(train["movieId"])]
uid = {u: i for i, u in enumerate(train["userId"].unique())}; mid = {m: i for i, m in enumerate(train["movieId"].unique())}
tensors = lambda df: (torch.tensor(df["userId"].map(uid).values), torch.tensor(df["movieId"].map(mid).values), torch.tensor(df["rating"].values, dtype=torch.float32))
U, M, R = tensors(train); Ut, Mt, Rt = tensors(test)
mu = R.mean()
rmse_mean = None
### HINT torch.sqrt(((Rt - mu) ** 2).mean()).item()
### BEGIN SOLUTION
rmse_mean = torch.sqrt(((Rt - mu) ** 2).mean()).item()
### END SOLUTION
print(len(train), "training ratings ·", len(test), "test ratings · predict-the-mean RMSE", rmse_mean)

# %%
check(lambda: abs(rmse_mean - 0.908) < 0.01, "about 0.91 stars: the number every model has to beat")

# %% [markdown]
# ## 3. The model
# `MFParts` (given) holds the learned numbers as embeddings: `self.P` and `self.Q` (k taste and trait numbers per person
# and per movie) and `self.bu`, `self.bi` (one bias each).

# %%
class MFParts(nn.Module):
    def __init__(self, k):
        super().__init__()
        self.P, self.Q = nn.Embedding(len(uid), k), nn.Embedding(len(mid), k)
        self.bu, self.bi = nn.Embedding(len(uid), 1), nn.Embedding(len(mid), 1)
        for e in (self.P, self.Q):
            nn.init.normal_(e.weight, 0, 0.01)
        for e in (self.bu, self.bi):
            nn.init.zeros_(e.weight)
parts = MFParts(4)
print("P", parts.P, "· Q", parts.Q, "· bu", parts.bu, "· bi", parts.bi)

# %% [markdown]
# Write `forward` for `MF`: the lesson's `mu + b_u + b_i + p_u · q_i`. The embeddings return shapes `(batch, 1)` for
# the biases (take `[:, 0]`) and `(batch, k)` for the vectors (multiply them and `.sum(1)`).

# %%
class MF(MFParts):
    def forward(self, u, m):
        ### HINT return mu + self.bu(u)[:, 0] + self.bi(m)[:, 0] + (self.P(u) * self.Q(m)).sum(1)
        ### BEGIN SOLUTION
        return mu + self.bu(u)[:, 0] + self.bi(m)[:, 0] + (self.P(u) * self.Q(m)).sum(1)
        ### END SOLUTION

# %%
check(lambda: torch.allclose(MF(4)(U[:5], M[:5]), torch.full((5,), mu.item()), atol=0.01), "at the start (zero biases, tiny vectors) every prediction is about the mean")

# %% [markdown]
# ## 4. Train with a penalty
# Write the loss inside `fit`: the mean squared error on the batch, plus `lam` times the mean (over the batch) of the
# squared size of everything used: `P(u)`, `Q(m)` (summed over their k numbers) and the two biases.

# %%
def fit(k, lam, epochs=10):
    torch.manual_seed(0); model = MF(k); opt = torch.optim.Adam(model.parameters(), lr=5e-3)
    for epoch in range(epochs):
        perm = torch.randperm(len(R))
        for i in range(0, len(R), 1024):
            u, m, r = U[perm[i:i + 1024]], M[perm[i:i + 1024]], R[perm[i:i + 1024]]
            loss = None
            ### HINT mse = ((model(u, m) - r) ** 2).mean()
            ### HINT size = (model.P(u) ** 2).sum(1) + (model.Q(m) ** 2).sum(1) + model.bu(u)[:, 0] ** 2 + model.bi(m)[:, 0] ** 2; loss = mse + lam * size.mean()
            ### BEGIN SOLUTION
            mse = ((model(u, m) - r) ** 2).mean()
            size = (model.P(u) ** 2).sum(1) + (model.Q(m) ** 2).sum(1) + model.bu(u)[:, 0] ** 2 + model.bi(m)[:, 0] ** 2
            loss = mse + lam * size.mean()
            ### END SOLUTION
            if loss is not None:
                opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        pred = model(Ut, Mt)
        return model, (torch.sqrt(((pred.clamp(0.5, 5) - Rt) ** 2).mean()).item() if pred is not None else float("nan"))

# %% [markdown]
# ## 5. How much penalty?
# Run it (about a minute): 16 taste numbers with a small, a medium and a large penalty, plus a 1-number model.

# %%
results = {}
for k, lam in [(16, 0.0), (16, 0.02), (16, 0.1), (1, 0.02)]:
    try:
        results[(k, lam)] = fit(k, lam)[1]
    except Exception as e:
        print("not yet:", type(e).__name__); break
for (k, lam), v in results.items():
    print(f"k = {k:2d}, penalty {lam}: test RMSE {v:.3f}")

# %%
check(lambda: results[(16, 0.1)] < rmse_mean - 0.05 and results[(16, 0.0)] > results[(16, 0.1)],
      "with a strong penalty the tastes help (0.83 vs 0.91); with none they memorize the training ratings and do worse")

# %% [markdown]
# ## 6. Recommend for one person
# Using the best model, score every movie for user 0 (the first person in `uid`), drop the movies they already rated in
# training, and set `top10`: the titles of the 10 highest scores (`movies.loc[movie_id, "title"]`).

# %%
best, _ = fit(16, 0.1)
inv_mid = {i: m for m, i in mid.items()}
seen = set(train.loc[train["userId"] == next(iter(uid)), "movieId"])
top10 = None
### HINT with torch.no_grad(): scores = best(torch.zeros(len(mid), dtype=torch.long), torch.arange(len(mid)))
### HINT order = scores.argsort(descending=True); keep movie ids not in seen; top10 = [movies.loc[m, "title"] for m in ...first 10]
### BEGIN SOLUTION
with torch.no_grad():
    scores = best(torch.zeros(len(mid), dtype=torch.long), torch.arange(len(mid)))
ranked = [inv_mid[i.item()] for i in scores.argsort(descending=True)]
top10 = [movies.loc[m, "title"] for m in ranked if m not in seen][:10]
### END SOLUTION
print("\n".join(top10 or []))

# %%
check(lambda: len(top10) == 10 and not set(top10) & {movies.loc[m, "title"] for m in seen}, "ten titles, none already rated: a personal list")

# %% [markdown]
# ## 7. Against popularity, on the top of the list
# For each test person, the movies they rated 4 or more in the test period are what they liked next. `recall_at_10`
# (given) measures the share of those that a list of 10 contains, averaged over people. Set `pop_recall` for the same
# 10 most-rated training movies for everyone, and `mf_recall` for each person's own top 10 from `best`, unseen only.

# %%
liked = test[test["rating"] >= 4].groupby("userId")["movieId"].apply(set)
def recall_at_10(lists):
    return np.mean([len(lists[u] & liked[u]) / len(liked[u]) for u in liked.index])
popular = list(train["movieId"].value_counts().index)
pop_recall = mf_recall = None
### HINT pop_recall = recall_at_10({u: set([m for m in popular if m not in seen_u][:10]) ...}); seen_u = set(train.loc[train["userId"] == u, "movieId"])
### HINT for MF: score all movies for uid[u] with best, rank, skip seen, keep 10, then recall_at_10 of those sets
### BEGIN SOLUTION
pop_lists, mf_lists = {}, {}
with torch.no_grad():
    for u in liked.index:
        seen_u = set(train.loc[train["userId"] == u, "movieId"])
        pop_lists[u] = set([m for m in popular if m not in seen_u][:10])
        s = best(torch.full((len(mid),), uid[u], dtype=torch.long), torch.arange(len(mid)))
        mf_lists[u] = set([inv_mid[i.item()] for i in s.argsort(descending=True) if inv_mid[i.item()] not in seen_u][:10])
pop_recall, mf_recall = recall_at_10(pop_lists), recall_at_10(mf_lists)
### END SOLUTION
print("recall@10 · popularity:", pop_recall, "· matrix factorization:", mf_recall)

# %%
check(lambda: 0 <= pop_recall <= 1 and 0 <= mf_recall <= 1,
      "both measured; whichever wins, that's the honest comparison. Better star predictions don't automatically make better top-10 lists")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Koren, Bell & Volinsky, "Matrix Factorization Techniques for Recommender Systems" (2009).
