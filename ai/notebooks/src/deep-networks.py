# %% [markdown]
# # Practice: deep networks, in NumPy and PyTorch
# *AI from scratch, deep networks layer by layer* · lesson: https://ihor.sh/ai/deep-networks.html
#
# Count parameters, watch signals vanish or survive through 20 layers depending on the starting weights, then
# train the same spiral network in PyTorch and compare deep against wide at the same size.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).

# %%
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. Count the knobs
# Write `n_params(sizes)`: the total weights and biases of a fully connected network with those layer sizes.

# %%
def n_params(sizes):
    ### BEGIN SOLUTION
    return sum(n * m + n for m, n in zip(sizes, sizes[1:]))
    ### END SOLUTION

# %%
check(lambda: n_params([2, 16, 16, 1]) == 337 and n_params([784, 128, 10]) == 101_770, "2-16-16-1 has 337; a 784-128-10 digit reader 101,770")
check(lambda: n_params([2, 16, 16, 1]) == sum(p.numel() for p in nn.Sequential(nn.Linear(2, 16), nn.Linear(16, 16), nn.Linear(16, 1)).parameters()), "PyTorch counts the same")

# %% [markdown]
# ## 2. How the starting weights decide everything
# Push 1000 random inputs through 20 tanh layers of 256 units, with weights drawn at scale `s`. Record the standard
# deviation of the activations after the last layer, for s = 0.01, Xavier ($\sqrt{1/256}$) and 0.2.
# Set `final_std` as a dict {name: std}.

# %%
rng = np.random.default_rng(0)
X0 = rng.standard_normal((256, 1000))
scales = {"tiny (0.01)": 0.01, "Xavier": np.sqrt(1 / 256), "big (0.2)": 0.2}
final_std = None
### BEGIN SOLUTION
final_std = {}
for name, s in scales.items():
    A = X0
    for _ in range(20):
        A = np.tanh(rng.standard_normal((256, 256)) * s @ A)
    final_std[name] = A.std()
### END SOLUTION
print(final_std)

# %%
check(lambda: final_std["tiny (0.01)"] < 1e-10, "too small: the signal vanishes")
check(lambda: 0.1 < final_std["Xavier"] < 0.9, "Xavier keeps it alive through 20 layers")
check(lambda: final_std["big (0.2)"] > 0.8, "too big: outputs crowd toward ±1 (half of them past 0.95), where tanh's slope is nearly 0")

# %% [markdown]
# ## 3. The spiral in PyTorch
# Build `nn.Sequential(nn.Linear(2, 16), nn.Tanh(), nn.Linear(16, 16), nn.Tanh(), nn.Linear(16, 1))` and train it
# with `nn.BCEWithLogitsLoss()` and `torch.optim.SGD(lr=0.5)`, full batch, 4000 steps. Set `acc`.
# (PyTorch's `nn.Linear` already starts with sensible random weights.)

# %%
def spiral(m=200, seed=1):
    g = np.random.default_rng(seed)
    t = np.tile(np.linspace(0, 1, m // 2, endpoint=False), 2); c = np.repeat([0, 1], m // 2)
    r, a = 0.15 + 0.85 * t, 3.5 * np.pi * t + c * np.pi + 0.15 * g.standard_normal(m)
    return torch.tensor(np.column_stack([r * np.cos(a), r * np.sin(a)]), dtype=torch.float32), torch.tensor(c, dtype=torch.float32)

Xs, ys = spiral()
def train(model, steps=4000, lr=0.5):
    opt, loss_fn = torch.optim.SGD(model.parameters(), lr=lr), nn.BCEWithLogitsLoss()
    for _ in range(steps):
        opt.zero_grad(); loss_fn(model(Xs).squeeze(1), ys).backward(); opt.step()
    with torch.no_grad():
        return ((model(Xs).squeeze(1) > 0).float() == ys).float().mean().item()

torch.manual_seed(0)
acc = None
### BEGIN SOLUTION
deep = nn.Sequential(nn.Linear(2, 16), nn.Tanh(), nn.Linear(16, 16), nn.Tanh(), nn.Linear(16, 1))
acc = train(deep)
### END SOLUTION
print("2-16-16-1:", acc)

# %%
check(lambda: acc > 0.95, "two hidden layers of 16 learn the spiral")

# %% [markdown]
# ## 4. Deep vs wide, same size
# A single hidden layer with 84 units also has 337 parameters. Train it the same way (same steps, same learning
# rate) and set `acc_wide`. Then, for a fair comparison, try 3 different seeds for each and compare the averages.

# %%
acc_wide = None
### BEGIN SOLUTION
torch.manual_seed(0)
acc_wide = train(nn.Sequential(nn.Linear(2, 84), nn.Tanh(), nn.Linear(84, 1)))
### END SOLUTION
print("2-84-1:", acc_wide, " parameters:", n_params([2, 84, 1]))

# %%
check(lambda: acc_wide < acc, "at the same size, depth wins on this problem")

# %% [markdown]
# ## 5. What the deep one learned
# The decision regions of your deep network over the plane.

# %%
if acc is not None:
    xx, yy = np.meshgrid(np.linspace(-1.2, 1.2, 200), np.linspace(-1.2, 1.2, 200))
    with torch.no_grad():
        zz = deep(torch.tensor(np.column_stack([xx.ravel(), yy.ravel()]), dtype=torch.float32)).reshape(xx.shape).numpy()
    plt.figure(figsize=(5, 5)); plt.contourf(xx, yy, zz > 0, alpha=0.3, cmap="coolwarm")
    plt.scatter(Xs[:, 0], Xs[:, 1], c=ys, cmap="coolwarm", s=12); plt.axis("equal"); plt.show()

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · stage 3 starts with chapter 11, overfitting. Milestone for stage 2: train a
# digit reader from scratch, then in PyTorch (the next notebooks build up to it).
