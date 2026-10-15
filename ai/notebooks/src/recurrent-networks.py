# %% [markdown]
# # Practice: recurrent networks
# *AI from scratch, stage 5* · lesson: https://ihor.sh/ai/recurrent-networks.html
#
# Count an RNN's weights, write one step by hand and check it against PyTorch, watch a plain RNN fail to remember
# something 40 steps back while an LSTM succeeds (with one line of yours), then train a character-level LSTM on NYC
# subway station names, stop it at the right moment, and sample new names. About two minutes on a CPU.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import math, random, urllib.request
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
torch.manual_seed(0)

# %% [markdown]
# ## 1. How many weights?
# PyTorch's `nn.RNN(24, 64)` reads 24 numbers per step into a state of 64. It has a 64 × 64 matrix `W`, a 64 × 24
# matrix `U`, and *two* bias vectors of 64 (one added with each matrix). Set `n_rnn` to its number of parameters,
# counted from `.parameters()` as in earlier notebooks.

# %%
n_rnn = None
### HINT sum(p.numel() for p in nn.RNN(24, 64).parameters())
### BEGIN SOLUTION
n_rnn = sum(p.numel() for p in nn.RNN(24, 64).parameters())
### END SOLUTION
print(n_rnn, " · an LSTM of the same size:", sum(p.numel() for p in nn.LSTM(24, 64).parameters()))

# %%
check(lambda: n_rnn == 64 * 64 + 64 * 24 + 2 * 64, "4,096 + 1,536 + 128 = 5,760; the LSTM has four blocks like it: 23,040")

# %% [markdown]
# ## 2. One step by hand
# `cell = nn.RNNCell(3, 4)` holds `weight_ih` (that's U, 4 × 3), `weight_hh` (W, 4 × 4) and the two biases. Write
# `step(x, h)`: `tanh(U x + b_ih + W h + b_hh)` for a batch of rows, so the products are `x @ U.T` and `h @ W.T`.

# %%
cell = nn.RNNCell(3, 4)
U, W, b_ih, b_hh = cell.weight_ih, cell.weight_hh, cell.bias_ih, cell.bias_hh
def step(x, h):
    ### HINT torch.tanh(x @ U.T + b_ih + h @ W.T + b_hh)
    ### BEGIN SOLUTION
    return torch.tanh(x @ U.T + b_ih + h @ W.T + b_hh)
    ### END SOLUTION

# %%
x, h = torch.randn(2, 3), torch.randn(2, 4)
check(lambda: torch.allclose(step(x, h), cell(x, h), atol=1e-6), "the same numbers as PyTorch's RNNCell: one layer, fed its own output")

# %% [markdown]
# ## 3. Remember the first symbol
# Each sequence is 40 random symbols from 8; the answer is the *first* one, asked for only at the end. `memory_test`
# (given) trains a network for 2,000 steps and returns its accuracy on new sequences (chance is 1/8 = 0.125).
#
# Before the LSTM runs, start its forget gates open: PyTorch stores an LSTM's biases as four blocks of `H` (input,
# forget, candidate, output), so the forget block is `[H:2 * H]`. In `open_forget_gates`, set that block of every bias
# to 1.0: loop over `lstm.named_parameters()` and, when `"bias" in name`, do `p.data[H:2 * H] = 1.0`.

# %%
def open_forget_gates(lstm, H):
    ### HINT for name, p in lstm.named_parameters():   then, indented, if "bias" in name:
    ### HINT and inside that: p.data[H:2 * H] = 1.0
    ### BEGIN SOLUTION
    for name, p in lstm.named_parameters():
        if "bias" in name:
            p.data[H:2 * H] = 1.0
    ### END SOLUTION

def memory_test(kind, L=40, steps=2000, H=32):
    torch.manual_seed(0)
    rnn = (nn.LSTM if kind == "lstm" else nn.RNN)(8, H, batch_first=True); head = nn.Linear(H, 8)
    if kind == "lstm":
        open_forget_gates(rnn, H)
    params = list(rnn.parameters()) + list(head.parameters()); opt = torch.optim.Adam(params, lr=3e-3)
    for s in range(steps):
        x = torch.randint(8, (64, L)); out = head(rnn(F.one_hot(x, 8).float())[0][:, -1])
        loss = F.cross_entropy(out, x[:, 0]); opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(params, 1.0); opt.step()
    x = torch.randint(8, (1000, L))
    with torch.no_grad():
        return (head(rnn(F.one_hot(x, 8).float())[0][:, -1]).argmax(1) == x[:, 0]).float().mean().item()

results = {kind: memory_test(kind) for kind in ["rnn", "lstm"]}
print(results)

# %%
check(lambda: results["rnn"] < 0.3 and results["lstm"] > 0.95,
      "the plain RNN is at chance after 40 steps; the LSTM, its forget gates started at 1, remembers every time")

# %% [markdown]
# ## 4. A character model of station names
# The 379 station names, shuffled and split by name: 340 to learn from, 39 never seen. The model (given) is an
# embedding, an LSTM and a layer of 68 next-character scores, chapter 10's task with recurrence instead of attention.
# The training loop is given; it measures the held-out loss every 100 steps. **Your part:** keep a copy of the weights
# whenever the held-out loss reaches a new low: inside the `if`, set `best_loss = val` and
# `best_state = {k: v.clone() for k, v in model.state_dict().items()}`.

# %%
text = urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/stations.txt").read().decode()
names = [n for n in text.split("\n") if n]; random.Random(0).shuffle(names)
chars = sorted(set("\n".join(names) + "\n")); V = len(chars); idx = {c: i for i, c in enumerate(chars)}
encode = lambda ns: torch.tensor([idx[c] for c in "\n" + "\n".join(ns) + "\n"])
train_ids, val_ids = encode(names[:340]), encode(names[340:])
print(V, "characters ·", len(train_ids), "training characters · uniform guessing costs ln", V, "=", round(math.log(V), 2))

class CharLSTM(nn.Module):
    def __init__(self, H=64):
        super().__init__()
        self.emb, self.rnn, self.out = nn.Embedding(V, 24), nn.LSTM(24, H, batch_first=True), nn.Linear(H, V)
    def forward(self, x, state=None):
        y, state = self.rnn(self.emb(x), state)
        return self.out(y), state

torch.manual_seed(0)
model = CharLSTM(); opt = torch.optim.Adam(model.parameters(), lr=3e-3)
best_loss, best_state, history = float("inf"), None, []
for step in range(1, 2001):
    i = torch.randint(len(train_ids) - 33, (32,))
    x = torch.stack([train_ids[j:j + 32] for j in i]); y = torch.stack([train_ids[j + 1:j + 33] for j in i])
    loss = F.cross_entropy(model(x)[0].reshape(-1, V), y.reshape(-1))
    opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
    if step % 100 == 0:
        with torch.no_grad():
            val = F.cross_entropy(model(val_ids[None, :-1])[0].reshape(-1, V), val_ids[1:]).item()
        history.append((step, loss.item(), val))
        if val < best_loss:
            ### HINT best_loss = val
            ### HINT best_state = {k: v.clone() for k, v in model.state_dict().items()}
            ### BEGIN SOLUTION
            best_loss = val
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            ### END SOLUTION
            pass
h = np.array(history)
plt.plot(h[:, 0], h[:, 1], label="training loss (one batch)"); plt.plot(h[:, 0], h[:, 2], label="held-out names")
plt.axhline(math.log(V), ls="--", c="gray", label="ln 68"); plt.xlabel("step"); plt.legend(); plt.show()
print("best held-out loss:", best_loss)

# %%
check(lambda: best_state is not None and abs(best_loss - h[:, 2].min()) < 1e-9 and best_loss < 2.6,
      "the lowest held-out loss (about 2.2, far below ln 68 ≈ 4.2), with the weights from that moment saved")
if best_state is not None:
    model.load_state_dict(best_state)          # back to the best moment

# %% [markdown]
# ## 5. Sample new station names
# Write `sample(temperature)`: start from the "\n" character and the empty state; repeatedly run the model on the last
# character (`model(x, state)` returns scores and the new state), divide the scores by `temperature`, turn them into
# probabilities with `F.softmax`, and draw the next character with `torch.multinomial(probs, 1)`. Stop at the next
# "\n" or after 40 characters; return the name as a string.

# %%
def sample(temperature=0.8):
    x, state, out = torch.tensor([[idx["\n"]]]), None, ""
    with torch.no_grad():
        for _ in range(40):
            ### HINT scores, state = model(x, state); probs = F.softmax(scores[0, -1] / temperature, dim=0)
            ### HINT nxt = torch.multinomial(probs, 1).item(); stop if chars[nxt] == "\n", else add it to out and set x = torch.tensor([[nxt]])
            ### BEGIN SOLUTION
            scores, state = model(x, state)
            probs = F.softmax(scores[0, -1] / temperature, dim=0)
            nxt = torch.multinomial(probs, 1).item()
            if chars[nxt] == "\n":
                break
            out += chars[nxt]
            x = torch.tensor([[nxt]])
            ### END SOLUTION
    return out

torch.manual_seed(1)
for t in [0.5, 1.0]:
    made = [sample(t) for _ in range(8)]
    print(f"temperature {t}:", " · ".join(f"{m}{'' if m in names else ' (new)'}" for m in made))

# %%
torch.manual_seed(2)
check(lambda: all(isinstance(s, str) and 0 < len(s) <= 40 and "\n" not in s for s in [sample(0.8) for _ in range(20)]),
      "names of 1 to 40 characters, one per call, no line breaks inside")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Olah, "Understanding LSTM Networks": https://colah.github.io/posts/2015-08-Understanding-LSTMs/
