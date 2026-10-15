# %% [markdown]
# # Practice: how image generators work
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/diffusion.html
#
# A real diffusion model, small enough for a CPU: on scikit-learn's 1,797 handwritten digits (8 × 8 pixels), build
# the noise schedule, noise images in one shot, write the training loss and the sampling step, check whether the
# samples copy the training set, then add classifier-free guidance and measure what the guidance scale trades.
# About half a minute. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and
# `answer(n)` are there when you're stuck.

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
digits = load_digits()
X = torch.tensor(digits.data / 8 - 1, dtype=torch.float32)     # 64 pixels per image, scaled to -1…1
Y = torch.tensor(digits.target)
clf = LogisticRegression(max_iter=3000).fit(digits.data / 16, digits.target)     # reads 8 × 8 digits, for checking samples
T = 200
beta = torch.linspace(1e-4, 0.05, T)                            # how much noise each step adds
alpha = 1 - beta
def show(images, title=""):
    fig, axes = plt.subplots(1, len(images), figsize=(len(images), 1.3))
    for ax, im in zip(axes, images):
        ax.imshow(np.asarray(im).reshape(8, 8), cmap="gray", vmin=-1, vmax=1); ax.axis("off")
    fig.suptitle(title); plt.show()
show(X[:10], "training digits")

# %% [markdown]
# ## 1. The schedule
# `abar[t]` is the product of `alpha[0]` … `alpha[t]`: how much image is left after `t + 1` steps. Set `abar` with
# `torch.cumprod(alpha, 0)` (a running product, like `np.cumsum` is a running sum).

# %%
abar = None
### HINT abar = torch.cumprod(alpha, 0)
### BEGIN SOLUTION
abar = torch.cumprod(alpha, 0)
### END SOLUTION
print("image variance left after 1, 50, 100, 200 steps:", abar[[0, 49, 99, 199]] if abar is not None else None)

# %%
check(lambda: abs(abar[0] - alpha[0]) < 1e-9 and abar[-1] < 0.01, "almost all image at the start, under 1% at the end")

# %% [markdown]
# ## 2. Noise an image in one shot
# Write `q_sample(x0, t, noise)`: the lesson's `sqrt(abar_t) · x0 + sqrt(1 − abar_t) · noise`, for a batch: `t` is a
# tensor of steps, so `abar[t]` has one number per image; add `[:, None]` to line it up with the 64 pixels.

# %%
def q_sample(x0, t, noise):
    ### HINT a = abar[t][:, None]
    ### HINT return a.sqrt() * x0 + (1 - a).sqrt() * noise
    ### BEGIN SOLUTION
    a = abar[t][:, None]
    return a.sqrt() * x0 + (1 - a).sqrt() * noise
    ### END SOLUTION

if abar is not None:
    torch.manual_seed(0)
    show([q_sample(X[:1], torch.tensor([t]), torch.randn(1, 64))[0] for t in [0, 20, 50, 100, 150, 199]], "one digit at steps 0, 20, 50, 100, 150, 199")

# %%
check(lambda: torch.allclose(q_sample(X[:3], torch.tensor([0, 0, 0]), torch.zeros(3, 64)), abar[0].sqrt() * X[:3])
      and abs(q_sample(X, torch.full((len(X),), T - 1), torch.randn(len(X), 64)).std().item() - 1) < 0.1,
      "step 0 is (almost) the image; the last step is noise with spread about 1")

# %% [markdown]
# ## 3. The training loss
# The network (given) sees a noisy image, its step (as sine waves) and a label (10 means "no label": dropped 10% of
# the time, for guidance in section 6). Write the loss in `train_step`: noise the batch with `q_sample` at random steps
# `t`, and return the mean squared error between the true noise and the network's guess `net(xt, t, y)`.

# %%
class Denoiser(nn.Module):
    def __init__(self):
        super().__init__()
        self.label = nn.Embedding(11, 32)
        self.f = nn.Sequential(nn.Linear(64 + 32 + 32, 256), nn.SiLU(), nn.Linear(256, 256), nn.SiLU(), nn.Linear(256, 64))
    def forward(self, x, t, y):
        freqs = torch.exp(-math.log(1000) * torch.arange(16) / 16)
        angles = t[:, None].float() * freqs[None]
        return self.f(torch.cat([x, torch.sin(angles), torch.cos(angles), self.label(y)], 1))

def train_step(net, x0, y):
    t = torch.randint(T, (len(x0),))
    noise = torch.randn_like(x0)
    ### HINT xt = q_sample(x0, t, noise)
    ### HINT return F.mse_loss(net(xt, t, y), noise)
    ### BEGIN SOLUTION
    xt = q_sample(x0, t, noise)
    return F.mse_loss(net(xt, t, y), noise)
    ### END SOLUTION

torch.manual_seed(0); net = Denoiser(); opt = torch.optim.Adam(net.parameters(), lr=2e-3); losses = []
for step in range(6000):
    i = torch.randint(len(X), (128,)); y = Y[i].clone(); y[torch.rand(128) < 0.1] = 10
    loss = train_step(net, X[i], y)
    if loss is None:
        break
    opt.zero_grad(); loss.backward(); opt.step(); losses.append(loss.item())
print("loss: first 100 steps", np.mean(losses[:100]) if losses else None, "· last 100", np.mean(losses[-100:]) if losses else None)

# %%
check(lambda: np.mean(losses[-100:]) < 0.3, "from about 1 (guessing nothing) to under 0.3: it learned to see noise")

# %% [markdown]
# ## 4. Sampling: one step back
# Write the update inside `sample`, the DDPM step: from the predicted noise `eps`,
# `x = (x − beta[t] / sqrt(1 − abar[t]) · eps) / sqrt(alpha[t])`, then (except at the last step) add fresh noise
# `sqrt(beta[t]) · randn`. The guidance mix is given: with `w = 1` it's the plain conditional prediction.

# %%
@torch.no_grad()
def sample(label, w=1.0, n=10, seed=0):
    torch.manual_seed(seed); x = torch.randn(n, 64)
    for t in reversed(range(T)):
        tt = torch.full((n,), t)
        cond, uncond = net(x, tt, torch.full((n,), label)), net(x, tt, torch.full((n,), 10))
        eps = uncond + w * (cond - uncond)                       # classifier-free guidance (section 6)
        ### HINT x = (x - beta[t] / (1 - abar[t]).sqrt() * eps) / alpha[t].sqrt()
        ### HINT if t > 0: x = x + beta[t].sqrt() * torch.randn_like(x)
        ### BEGIN SOLUTION
        x = (x - beta[t] / (1 - abar[t]).sqrt() * eps) / alpha[t].sqrt()
        if t > 0:
            x = x + beta[t].sqrt() * torch.randn_like(x)
        ### END SOLUTION
    return x.clamp(-1, 1)

for label in [0, 3, 7]:
    show(sample(label), f"generated: {label}")

# %%
s3 = sample(3, n=100)
check(lambda: (clf.predict(((s3 + 1) / 2).numpy()) == 3).mean() > 0.7, "a classifier reads them as 3s: digits drawn from nothing but noise and a label")

# %% [markdown]
# ## 5. New digits, or copies?
# For each of 100 generated 3s, the distance to its nearest training image (given). Set `typical`: the average distance
# between two *different* training images, from the first 100 against the next 100 (`torch.cdist(A, B)` gives every pair).

# %%
nearest = torch.cdist(s3, X).min(dim=1).values
typical = None
### HINT typical = torch.cdist(X[:100], X[100:200]).mean().item()
### BEGIN SOLUTION
typical = torch.cdist(X[:100], X[100:200]).mean().item()
### END SOLUTION
print("generated → nearest training image:", nearest.mean().item(), "· two training images apart:", typical, "· closest copy:", nearest.min().item())

# %%
check(lambda: 0 < nearest.min().item() and nearest.mean().item() < typical,
      "closer to the training set than two random digits are to each other, but not copies: a network too small to memorize every pixel generalizes")

# %% [markdown]
# ## 6. The guidance scale
# The classifier from the setup reads the generated images. Set `rates`: for `w` in `[0, 1, 3]`, the share of 100 samples of
# label 3 that the classifier calls a 3, and `spread`: the average per-pixel standard deviation across those 100
# samples (variety: `samples.std(dim=0).mean().item()`).

# %%
rates = spread = None
### HINT rates, spread = {}, {} then for w in [0, 1, 3]: s = sample(3, w=w, n=100)
### HINT the classifier wants pixels 0…1: rates[w] = (clf.predict(((s + 1) / 2).numpy()) == 3).mean(); spread[w] = s.std(dim=0).mean().item()
### BEGIN SOLUTION
rates, spread = {}, {}
for w in [0, 1, 3]:
    s = sample(3, w=w, n=100)
    rates[w] = (clf.predict(((s + 1) / 2).numpy()) == 3).mean()
    spread[w] = s.std(dim=0).mean().item()
### END SOLUTION
print("called a 3:", rates, "\nvariety:", spread)

# %%
check(lambda: rates[0] < 0.5 < rates[1] <= rates[3] and spread[3] < spread[0],
      "w = 0 ignores the label (a few 3s by chance); w = 1 follows it; w = 3 follows it always, with less variety: the guidance trade-off")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Hugging Face's "Annotated Diffusion Model": https://huggingface.co/blog/annotated-diffusion
