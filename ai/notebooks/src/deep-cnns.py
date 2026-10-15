# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: deep CNNs and transfer learning
# *AI from scratch, stage 5* · lesson: https://ihor.sh/ai/deep-cnns.html
#
# A pretrained ResNet-18 from torchvision against a small CNN trained from scratch, on 2,000 CIFAR-10 photos (10 kinds:
# planes, cars, birds, cats, deer, dogs, frogs, horses, ships, trucks). Count what's inside it, freeze it and give it a
# new head, write an augmentation pipeline, and measure how far its borrowed features go with 20, 100 and 2,000 photos.
# Runs on a CPU in a few minutes. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import io, time, urllib.request
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from PIL import Image
import torch
from torch import nn
import torch.nn.functional as F
import torchvision
from torchvision import transforms as T
from sklearn.linear_model import LogisticRegression
torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"

# CIFAR-10's 10,000 test photos (32 × 32), one parquet file from the Hugging Face hub
url = "https://huggingface.co/datasets/uoft-cs/cifar10/resolve/main/plain_text/test-00000-of-00001.parquet"
df = pd.read_parquet(io.BytesIO(urllib.request.urlopen(url).read()))
imgs = [Image.open(io.BytesIO(r["bytes"])).convert("RGB") for r in df["img"]]
labels = df["label"].to_numpy()
names = ["plane", "car", "bird", "cat", "deer", "dog", "frog", "horse", "ship", "truck"]
tr, te = np.arange(2000), np.arange(5000, 6000)     # 2,000 photos to learn from, 1,000 to test on
fig, axes = plt.subplots(1, 8, figsize=(12, 2))
for ax, i in zip(axes, range(8)):
    ax.imshow(imgs[i]); ax.set_title(names[labels[i]]); ax.axis("off")
plt.show()

# %% [markdown]
# ## 1. What's inside a ResNet-18
# Load it with ImageNet weights (given). Set `n_params` to its number of parameters, as in the GPUs lesson.

# %%
weights = torchvision.models.ResNet18_Weights.DEFAULT
model = torchvision.models.resnet18(weights=weights)
n_params = None
### HINT Count total scalar weights and biases across all model parameters with p.numel().
### HINT sum(p.numel() for p in model.parameters())
### BEGIN SOLUTION
n_params = sum(p.numel() for p in model.parameters())
### END SOLUTION
print(n_params)

# %%
check(lambda: n_params == 11_689_512, "about 11.7 million numbers, learned from 1.2 million ImageNet photos")

# %% [markdown]
# ## 2. How much of it is ImageNet-specific?
# The last layer, `model.fc`, maps 512 features to ImageNet's 1,000 classes. Set `fc_share` to the fraction of all
# parameters that live in it: `fc_params / n_params`, where `fc_params` counts `model.fc.parameters()` the same way.

# %%
fc_share = None
### HINT fc_params = sum(p.numel() for p in model.fc.parameters())
### HINT fc_share = fc_params / n_params
### BEGIN SOLUTION
fc_params = sum(p.numel() for p in model.fc.parameters())
fc_share = fc_params / n_params
### END SOLUTION
print(fc_share)

# %%
check(lambda: abs(fc_share - 513_000 / 11_689_512) < 1e-6, "about 4.4%: 512 × 1,000 weights + 1,000 biases. The other 95.6% is the reusable body")

# %% [markdown]
# ## 3. Freeze the body, give it a new head
# Switch off learning for every parameter (`p.requires_grad = False` in a loop over `model.parameters()`), then replace
# `model.fc` with a new `nn.Linear(512, 10)` for CIFAR's 10 classes (new layers are trainable by default). Then
# `trainable` (given) counts what's left to learn.

# %%
### HINT for p in model.parameters(): p.requires_grad = False   (on two lines)
### HINT Then model.fc = nn.Linear(512, 10)
### BEGIN SOLUTION
for p in model.parameters():
    p.requires_grad = False
model.fc = nn.Linear(512, 10)
### END SOLUTION
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print("trainable:", trainable)

# %%
check(lambda: trainable == 5130 and model.fc.out_features == 10, "5,130 numbers to learn (512 × 10 + 10), out of 11 million")

# %% [markdown]
# ## 4. An augmentation pipeline
# Write `train_tf`: a `T.Compose` of `T.RandomResizedCrop(112, scale=(0.7, 1.0))`, `T.RandomHorizontalFlip()`,
# `T.ToTensor()` and `norm` (given). Flips are fine here: a mirrored ship is still a ship. `test_tf` has no randomness.

# %%
norm = T.Normalize(weights.transforms().mean, weights.transforms().std)
test_tf = T.Compose([T.Resize(112), T.ToTensor(), norm])
train_tf = None
### HINT T.Compose([...]) with the four steps in that order.
### HINT train_tf = T.Compose([T.RandomResizedCrop(112, scale=(0.7, 1.0)), T.RandomHorizontalFlip(), T.ToTensor(), norm])
### BEGIN SOLUTION
train_tf = T.Compose([T.RandomResizedCrop(112, scale=(0.7, 1.0)), T.RandomHorizontalFlip(), T.ToTensor(), norm])
### END SOLUTION
if train_tf is not None:
    fig, axes = plt.subplots(1, 6, figsize=(10, 2))
    for ax in axes:
        x = train_tf(imgs[3]) * torch.tensor(norm.std)[:, None, None] + torch.tensor(norm.mean)[:, None, None]
        ax.imshow(x.permute(1, 2, 0).clamp(0, 1)); ax.axis("off")
    plt.show()

# %%
check(lambda: [type(t).__name__ for t in train_tf.transforms] == ["RandomResizedCrop", "RandomHorizontalFlip", "ToTensor", "Normalize"]
      and train_tf(imgs[0]).shape == (3, 112, 112),
      "crop, flip, tensor, normalize: a (3, 112, 112) tensor that's a little different every call")

# %% [markdown]
# ## 5. Borrowed features + a logistic regression
# With the head removed (`nn.Identity()` passes the 512 features through), the frozen network turns each photo into an
# embedding (given, about 20 seconds on a CPU). Fit `LogisticRegression(max_iter=3000)` on the training embeddings
# `Ftr` and labels, and set `acc` to its score on the test embeddings.

# %%
body = torchvision.models.resnet18(weights=weights); body.fc = nn.Identity(); body.eval().to(device)
def embed(idx):
    xs = torch.stack([test_tf(imgs[i]) for i in idx])
    with torch.no_grad():
        return torch.cat([body(xs[i:i + 250].to(device)).cpu() for i in range(0, len(xs), 250)]).numpy()
t = time.time(); Ftr, Fte = embed(tr), embed(te)
print("embeddings:", Ftr.shape, Fte.shape, f"in {time.time() - t:.0f} s")
acc = None
### HINT clf = LogisticRegression(max_iter=3000).fit(Ftr, labels[tr])
### HINT acc = clf.score(Fte, labels[te])
### BEGIN SOLUTION
clf = LogisticRegression(max_iter=3000).fit(Ftr, labels[tr])
acc = clf.score(Fte, labels[te])
### END SOLUTION
print("frozen ResNet-18 + logistic regression:", acc)

# %%
check(lambda: 0.70 < acc < 0.85, "about 77% on photos it never saw, from a network that never saw CIFAR")

# %% [markdown]
# ## 6. Against a CNN from scratch
# The same 2,000 photos, a small chapter-6-style CNN trained from nothing for 15 epochs (given, about 15 seconds).
# **Predict first:** set `guess_scratch` to the accuracy you expect it to reach (a number between 0 and 1).

# %%
guess_scratch = None
### HINT It has to learn edges, textures and parts from 2,000 tiny photos without pretrained weights.
### HINT Better than random chance (0.1), but well below transfer learning (~0.77). Try ~0.50.
### BEGIN SOLUTION
guess_scratch = 0.5
### END SOLUTION

# %%
tf32 = T.Compose([T.ToTensor(), T.Normalize([0.5] * 3, [0.5] * 3)])
Xtr = torch.stack([tf32(imgs[i]) for i in tr]); Xte = torch.stack([tf32(imgs[i]) for i in te])
ytr, yte = torch.tensor(labels[tr]), torch.tensor(labels[te])
torch.manual_seed(0)
cnn = nn.Sequential(nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
                    nn.MaxPool2d(2), nn.Flatten(), nn.Linear(64 * 8 * 8, 128), nn.ReLU(), nn.Linear(128, 10))
opt = torch.optim.Adam(cnn.parameters(), lr=1e-3)
for epoch in range(15):
    perm = torch.randperm(2000)
    for i in range(0, 2000, 64):
        idx = perm[i:i + 64]; opt.zero_grad(); F.cross_entropy(cnn(Xtr[idx]), ytr[idx]).backward(); opt.step()
with torch.no_grad():
    scratch = (cnn(Xte).argmax(1) == yte).float().mean().item()
print("from scratch:", scratch, " · borrowed:", acc)
check(lambda: guess_scratch is not None and abs(guess_scratch - scratch) < 0.15, "about 0.5: half the borrowed features' accuracy, from the same photos")

# %% [markdown]
# ## 7. How few photos?
# For `n` in `[20, 100, 500, 2000]`, take the first `n // 10` training photos of each class (given as `subset(n)`), fit
# a logistic regression on their embeddings and score it on `Fte`. Set `curve` to the list of the four accuracies.

# %%
def subset(n):
    return np.concatenate([np.where(labels[tr] == c)[0][:n // 10] for c in range(10)])
curve = None
### HINT Iterate over sample counts n in [20, 100, 500, 2000] and fit LogisticRegression on Ftr[subset(n)].
### HINT A list comprehension: for each n, LogisticRegression(max_iter=3000).fit(Ftr[subset(n)], labels[tr][subset(n)]).score(Fte, labels[te])
### BEGIN SOLUTION
curve = [LogisticRegression(max_iter=3000).fit(Ftr[subset(n)], labels[tr][subset(n)]).score(Fte, labels[te]) for n in [20, 100, 500, 2000]]
### END SOLUTION
if curve is not None:
    plt.semilogx([20, 100, 500, 2000], curve, "o-"); plt.axhline(0.1, ls="--", c="gray", label="chance")
    plt.xlabel("labeled photos"); plt.ylabel("test accuracy"); plt.legend(); plt.show()

# %%
check(lambda: len(curve) == 4 and curve[0] > 0.3 and curve[-1] > curve[0], "even 2 photos per class beat chance by 4×; more photos keep helping")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · fast.ai lesson 1 (a pretrained classifier in a few lines): https://course.fast.ai/
