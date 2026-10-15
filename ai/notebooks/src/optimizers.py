# %% [markdown]
# # Practice: optimizers and schedules
# *AI from scratch, toolkit 3* · lesson: https://ihor.sh/ai/optimizers.html
#
# Build an exponentially weighted average, momentum and Adam from their formulas, check your Adam against
# PyTorch's, then train a small network on handwritten digits with SGD, Adam and a warmup-plus-cosine schedule, and
# pick a learning rate by random search on a log scale. Everything runs on a CPU in a minute or two.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from sklearn.datasets import load_digits
torch.manual_seed(0)

# %% [markdown]
# ## 1. How much does an average remember?
# An exponentially weighted average with factor `beta` remembers about `1 / (1 - beta)` recent values. Set `window`
# for `beta = 0.95`.

# %%
beta = 0.95
window = None
### HINT 1 / (1 - beta)
### BEGIN SOLUTION
window = 1 / (1 - beta)
### END SOLUTION
print(window)

# %%
check(lambda: abs(window - 20) < 1e-9, "1 / (1 − 0.95) = 20 values")

# %% [markdown]
# ## 2. An EWA with bias correction
# Write `ewa(xs, beta)`: start with `v = 0`, and for each value (counting `t` from 1) update
# `v = beta * v + (1 - beta) * x`, then append the corrected `v / (1 - beta ** t)` to a list. Return the list.

# %%
def ewa(xs, beta):
    out = []
    ### HINT A for loop over enumerate(xs, start=1) gives t and x together.
    ### HINT Inside: v = beta * v + (1 - beta) * x, then out.append(v / (1 - beta ** t)). Set v = 0 before the loop.
    ### BEGIN SOLUTION
    v = 0.0
    for t, x in enumerate(xs, start=1):
        v = beta * v + (1 - beta) * x
        out.append(v / (1 - beta ** t))
    ### END SOLUTION
    return out

# %%
check(lambda: np.allclose(ewa([5.0] * 6, 0.9), 5.0) and np.isclose(ewa([2.0, 4.0], 0.5)[1], (0.25 * 2 + 0.5 * 4) / 0.75),
      "a constant input gives that constant from the first step (that's what the correction is for)")

# %% [markdown]
# ## 3. Momentum on the valley
# The lesson's valley: $L = \tfrac12(x^2 + 50y^2)$, so the gradient is `H * w` with `H = [1, 50]`. Plain SGD is
# given. Write the momentum version in `momentum_steps(lr, beta)`: keep `v`, update `v = beta * v + g`, then
# `w = w - lr * v`, and return the step at which the loss first drops below 0.001.

# %%
H = np.array([1.0, 50.0])
loss = lambda w: 0.5 * (H * w * w).sum()

def sgd_steps(lr):
    w = np.array([-4.5, 0.8])
    for t in range(1, 1001):
        w = w - lr * H * w
        if loss(w) < 1e-3:
            return t

def momentum_steps(lr, beta=0.9):
    w, v = np.array([-4.5, 0.8]), np.zeros(2)
    for t in range(1, 1001):
        ### HINT The gradient is g = H * w. Then the two lines from the lesson's formula.
        ### HINT g = H * w ; v = beta * v + g ; w = w - lr * v   (one per line)
        ### BEGIN SOLUTION
        g = H * w
        v = beta * v + g
        w = w - lr * v
        ### END SOLUTION
        if loss(w) < 1e-3:
            return t

print("SGD at its best rate (0.039):", sgd_steps(0.039), "steps · momentum at 0.01:", momentum_steps(0.01))

# %%
check(lambda: momentum_steps(0.01) == 61 and sgd_steps(0.039) == 118, "momentum: 61 steps, against 118 for the best plain SGD")

# %% [markdown]
# ## 4. One Adam step
# Write `adam_step(w, g, m, s, t, lr)`, returning the new `(w, m, s)`, with `b1 = 0.9`, `b2 = 0.999`, `eps = 1e-8`:
# update `m` and `s` as exponentially weighted averages of `g` and `g ** 2`, correct both by `1 - b ** t`, and step
# `w` by `lr * m_hat / (np.sqrt(s_hat) + eps)`. Arrays in, arrays out (NumPy works element by element).

# %%
def adam_step(w, g, m, s, t, lr, b1=0.9, b2=0.999, eps=1e-8):
    ### HINT m = b1 * m + (1 - b1) * g and s = b2 * s + (1 - b2) * g ** 2
    ### HINT m_hat = m / (1 - b1 ** t); s_hat = s / (1 - b2 ** t); w = w - lr * m_hat / (np.sqrt(s_hat) + eps)
    ### BEGIN SOLUTION
    m = b1 * m + (1 - b1) * g
    s = b2 * s + (1 - b2) * g ** 2
    m_hat = m / (1 - b1 ** t)
    s_hat = s / (1 - b2 ** t)
    w = w - lr * m_hat / (np.sqrt(s_hat) + eps)
    ### END SOLUTION
    return w, m, s

# %% [markdown]
# Is it the same Adam PyTorch uses? Run both for 30 steps on the valley from the same start.

# %%
def mine(steps=30, lr=0.1):
    w, m, s = np.array([-4.5, 0.8]), np.zeros(2), np.zeros(2)
    for t in range(1, steps + 1):
        out = adam_step(w, H * w, m, s, t, lr)
        if out[0] is None:
            return None
        w, m, s = out
    return w

wt = torch.tensor([-4.5, 0.8], requires_grad=True)
opt = torch.optim.Adam([wt], lr=0.1)
for _ in range(30):
    opt.zero_grad()
    (0.5 * (torch.tensor([1.0, 50.0]) * wt * wt).sum()).backward()
    opt.step()
print("PyTorch's Adam after 30 steps:", wt.detach().numpy(), " yours:", mine())

# %%
check(lambda: np.allclose(mine(), wt.detach().numpy(), atol=1e-5), "your Adam lands where torch.optim.Adam does")

# %% [markdown]
# ## 5. A network on digits: which optimizer?
# 1,797 handwritten digits, 8 × 8 pixels. `train(opt_name, lr, epochs)` trains a small network full-batch and
# returns its validation accuracy per epoch. **Predict first:** after 40 epochs at their usual rates, will SGD
# (lr 0.1) or Adam (lr 0.01) be ahead? Set `guess` to `"sgd"` or `"adam"`, then run the next cell.

# %%
X, y = load_digits(return_X_y=True)
X = torch.tensor(X / 16, dtype=torch.float32); y = torch.tensor(y)
perm = torch.randperm(len(X), generator=torch.Generator().manual_seed(0))
tr, va = perm[:1400], perm[1400:]

def train(opt_name, lr, epochs=40, schedule=None, seed=0):
    torch.manual_seed(seed)
    model = nn.Sequential(nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 10))
    opt = {"sgd": torch.optim.SGD, "adam": torch.optim.Adam, "adamw": torch.optim.AdamW}[opt_name](model.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, schedule) if schedule else None
    accs = []
    for epoch in range(epochs):
        model.train(); opt.zero_grad()
        F.cross_entropy(model(X[tr]), y[tr]).backward()
        opt.step()
        if sched:
            sched.step()
        model.eval()
        with torch.no_grad():
            accs.append((model(X[va]).argmax(1) == y[va]).float().mean().item())
    return accs

guess = None
### HINT The race in the lesson: per-weight step sizes get going fast without tuning.
### BEGIN SOLUTION
guess = "adam"
### END SOLUTION

# %%
curves = {name: train(name, lr) for name, lr in [("sgd", 0.1), ("adam", 0.01)]}
for name, acc in curves.items():
    plt.plot(acc, label=f"{name}: {acc[-1]:.3f}")
plt.xlabel("epoch"); plt.ylabel("validation accuracy"); plt.legend(); plt.show()
check(lambda: guess == max(curves, key=lambda k: curves[k][-1]), "Adam is far ahead after 40 full-batch steps: plain SGD at 0.1 is still crawling")

# %% [markdown]
# ## 6. Warmup, then cosine
# `LambdaLR` multiplies the base learning rate by a function of the step number. Write `warm_cos(t)` for 200 steps:
# a linear ramp `(t + 1) / 20` for the first 20 steps, then `0.5 * (1 + math.cos(math.pi * (t - 20) / 180))`.

# %%
def warm_cos(t, warm=20, total=200):
    ### HINT if t < warm: return (t + 1) / warm
    ### HINT Otherwise return 0.5 * (1 + math.cos(math.pi * (t - warm) / (total - warm)))
    ### BEGIN SOLUTION
    if t < warm:
        return (t + 1) / warm
    return 0.5 * (1 + math.cos(math.pi * (t - warm) / (total - warm)))
    ### END SOLUTION

# %%
check(lambda: np.isclose(warm_cos(0), 0.05) and np.isclose(warm_cos(19), 1) and np.isclose(warm_cos(20), 1) and np.isclose(warm_cos(110), 0.5) and warm_cos(199) < 0.001,
      "0.05 at step 0, 1 at the end of warmup, 0.5 halfway down, almost 0 at the end")

# %% [markdown]
# Compare a constant rate with your schedule (the schedule cell runs only once `warm_cos` works).

# %%
flat = train("adamw", 0.03, epochs=200)
sched = train("adamw", 0.03, epochs=200, schedule=warm_cos) if warm_cos(0) is not None else None
plt.plot(flat, label=f"constant: {flat[-1]:.3f}")
if sched is not None:
    plt.plot(sched, label=f"warmup + cosine: {sched[-1]:.3f}")
plt.xlabel("epoch"); plt.ylabel("validation accuracy"); plt.legend(); plt.show()

# %% [markdown]
# ## 7. Random search on a log scale
# Try 8 learning rates for Adam drawn at random between 1e-4 and 1, *uniformly in the exponent*:
# `10 ** rng.uniform(-4, 0, size=8)`. Train each for 40 epochs (`train("adam", lr)[-1]` is its final accuracy) and set
# `best_lr` to the one with the highest accuracy.

# %%
rng = np.random.default_rng(0)
best_lr = None
### HINT lrs = 10 ** rng.uniform(-4, 0, size=8), then scores = [train("adam", float(lr))[-1] for lr in lrs]
### HINT best_lr = lrs[np.argmax(scores)]
### BEGIN SOLUTION
lrs = 10 ** rng.uniform(-4, 0, size=8)
scores = [train("adam", float(lr))[-1] for lr in lrs]
best_lr = lrs[np.argmax(scores)]
for lr, sc in sorted(zip(lrs, scores)):
    print(f"lr {lr:.1e}: accuracy {sc:.3f}")
### END SOLUTION
print("best:", best_lr)

# %%
check(lambda: 3e-3 < best_lr < 0.3, "the best is somewhere around 1e-2: too small barely moves in 40 steps, too big bounces")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Distill, "Why Momentum Really Works": https://distill.pub/2017/momentum/
