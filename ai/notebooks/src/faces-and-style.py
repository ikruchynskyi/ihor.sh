# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: faces and style
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/faces-and-style.html
#
# Face recognition's method without faces: learn an embedding of handwritten characters from 30 alphabets with a
# triplet loss, then verify same-or-different on 20 alphabets it never saw, and pick a threshold the way a phone
# unlock would. Then neural style transfer: Gram matrices of VGG-19 features repaint a photo. A few minutes on a CPU
# (VGG-19's weights are a 548 MB download). Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check
# under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import io, urllib.request
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
import torchvision
from torchvision import transforms as T
from PIL import Image
from sklearn.metrics import roc_auc_score
torch.manual_seed(0); rng = np.random.default_rng(0)
tf = T.Compose([T.Resize(28), T.ToTensor()])
background = torchvision.datasets.Omniglot("data", background=True, download=True, transform=tf)
evaluation = torchvision.datasets.Omniglot("data", background=False, download=True, transform=tf)
def load(ds):
    X = torch.stack([1 - ds[i][0] for i in range(len(ds))]); Y = torch.tensor([ds[i][1] for i in range(len(ds))])
    return X, Y
Xb, Yb = load(background); Xe, Ye = load(evaluation)
print(len(Xb), "training images of", int(Yb.max()) + 1, "characters ·", len(Xe), "test images of", int(Ye.max()) + 1, "characters it never sees")
fig, axes = plt.subplots(1, 10, figsize=(10, 1.2))
for ax, i in zip(axes, range(0, 200, 20)):
    ax.imshow(Xb[i, 0], cmap="gray_r"); ax.axis("off")
plt.show()

# %% [markdown]
# ## 1. The triplet loss
# Write `triplet_loss(ea, ep, en, margin)` for batches of embeddings: the mean over the batch of
# `max(0, |ea − ep|² − |ea − en|² + margin)` (`F.relu` is `max(0, …)`; `.pow(2).sum(1)` is a squared distance per row).

# %%
def triplet_loss(ea, ep, en, margin=0.2):
    ### HINT F.relu((ea - ep).pow(2).sum(1) - (ea - en).pow(2).sum(1) + margin).mean()
    ### BEGIN SOLUTION
    return F.relu((ea - ep).pow(2).sum(1) - (ea - en).pow(2).sum(1) + margin).mean()
    ### END SOLUTION

# %%
a = torch.tensor([[0.0, 1.0]])
check(lambda: triplet_loss(a, torch.tensor([[0.1, 0.9]]), torch.tensor([[1.0, 0.0]])).item() == 0
      and abs(triplet_loss(a, torch.tensor([[1.0, 0.0]]), torch.tensor([[0.1, 0.9]])).item() - 2.18) < 1e-5,
      "0 when the negative is far enough; large when they're the wrong way round")

# %% [markdown]
# ## 2. Train the embedding (given)
# A small CNN maps each 28 × 28 character to 128 numbers of unit length. Each step: 64 anchors, a second drawing of
# the same character as the positive, a drawing of another character as the negative. About a minute.

# %%
net = nn.Sequential(nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
                    nn.MaxPool2d(2), nn.Flatten(), nn.Linear(64 * 7 * 7, 128))
embed = lambda x: F.normalize(net(x), dim=1)
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
by_char = {}
for i, c in enumerate(Yb.tolist()):
    by_char.setdefault(c, []).append(i)
chars = list(by_char)
for step in range(1000):
    cs = rng.choice(chars, 64)
    pairs = [rng.choice(by_char[c], 2, replace=False) for c in cs]
    neg = [rng.choice(by_char[chars[(chars.index(c) + rng.integers(1, len(chars))) % len(chars)]]) for c in cs]
    loss = triplet_loss(embed(Xb[[p[0] for p in pairs]]), embed(Xb[[p[1] for p in pairs]]), embed(Xb[neg]))
    if loss is None:
        break
    opt.zero_grad(); loss.backward(); opt.step()
print("last batch's loss:", loss.item() if loss is not None else None)

# %% [markdown]
# ## 3. Verify characters it never saw
# 4,000 test pairs from the 20 unseen alphabets, half same character, half different (given: `I`, `J`, `same`). Set
# `auc_emb`: the AUC of minus the embedding distance as a same-character score (`roc_auc_score(same, -dist)`), and
# `auc_raw`: the same with raw pixel distances (`(Xe[I] - Xe[J]).pow(2).flatten(1).sum(1)`).

# %%
by_test = {}
for i, c in enumerate(Ye.tolist()):
    by_test.setdefault(c, []).append(i)
tchars = list(by_test); I, J, same = [], [], []
for k in range(4000):
    c = rng.choice(tchars)
    if k % 2 == 0:
        i, j = rng.choice(by_test[c], 2, replace=False); same.append(1)
    else:
        i, j = rng.choice(by_test[c]), rng.choice(by_test[tchars[(tchars.index(c) + rng.integers(1, len(tchars))) % len(tchars)]]); same.append(0)
    I.append(i); J.append(j)
I, J, same = torch.tensor(I), torch.tensor(J), np.array(same)
with torch.no_grad():
    dist = (embed(Xe[I]) - embed(Xe[J])).pow(2).sum(1).numpy()
auc_emb = auc_raw = None
### HINT auc_emb = roc_auc_score(same, -dist)
### HINT auc_raw = roc_auc_score(same, -(Xe[I] - Xe[J]).pow(2).flatten(1).sum(1).numpy())
### BEGIN SOLUTION
auc_emb = roc_auc_score(same, -dist)
auc_raw = roc_auc_score(same, -(Xe[I] - Xe[J]).pow(2).flatten(1).sum(1).numpy())
### END SOLUTION
print("same-or-different AUC on unseen alphabets · learned embedding:", auc_emb, "· raw pixels:", auc_raw)

# %%
check(lambda: auc_emb > 0.9 and auc_emb > auc_raw + 0.2, "about 0.96 against 0.65: the embedding learned what 'same character' means, for characters it never saw")

# %% [markdown]
# ## 4. A threshold, like a phone unlock
# Pick the threshold that lets in only 1% of different-character pairs: the 1st percentile of the different pairs'
# distances (`np.quantile(dist[same == 0], 0.01)`). Set `thr` and `frr`: the share of same-character pairs rejected
# (distance at or above `thr`).

# %%
thr = frr = None
### HINT thr = np.quantile(dist[same == 0], 0.01)
### HINT frr = np.mean(dist[same == 1] >= thr)
### BEGIN SOLUTION
thr = np.quantile(dist[same == 0], 0.01)
frr = np.mean(dist[same == 1] >= thr)
### END SOLUTION
print("threshold", thr, "· false accepts 1% · false rejects", frr)

# %%
check(lambda: abs(np.mean(dist[same == 0] < thr) - 0.01) < 0.005 and 0 < frr < 1,
      "holding false accepts at 1% costs this many false rejects: the trade every verification system tunes (and must check per group)")

# %% [markdown]
# ## 5. Gram matrices
# Write `gram(f)` for a feature map of shape `(1, C, H, W)`: reshape it to `(C, H·W)`, multiply it by its own transpose,
# and divide by `C·H·W`.

# %%
def gram(f):
    _, C, H, W = f.shape
    ### HINT m = f.view(C, H * W)
    ### HINT return m @ m.T / (C * H * W)
    ### BEGIN SOLUTION
    m = f.view(C, H * W)
    return m @ m.T / (C * H * W)
    ### END SOLUTION

# %%
f = torch.rand(1, 3, 4, 4); shuffled = f.view(1, 3, 16)[:, :, torch.randperm(16)].view(1, 3, 4, 4)
check(lambda: gram(f).shape == (3, 3) and torch.allclose(gram(f), gram(shuffled)), "a 3 × 3 matrix that ignores where things are: shuffle the positions, same Gram")

# %% [markdown]
# ## 6. Repaint a photo
# Run it (given): VGG-19's features of a photo and of a swirly pattern; the photo's pixels are optimized to keep its
# deep features while matching the pattern's Gram matrices. About 30 seconds on a CPU after the download.

# %%
vgg = torchvision.models.vgg19(weights=torchvision.models.VGG19_Weights.DEFAULT).features[:29].eval()
for p in vgg.parameters():
    p.requires_grad = False
content = Image.open(io.BytesIO(urllib.request.urlopen("https://raw.githubusercontent.com/pytorch/vision/main/gallery/assets/dog1.jpg").read())).convert("RGB")
yy, xx = np.mgrid[:256, :256] / 256
style = Image.fromarray((np.stack([np.sin(12 * xx + 6 * np.sin(8 * yy)), np.sin(14 * yy + 5 * np.cos(9 * xx)), np.sin(10 * (xx + yy))], -1) * 127.5 + 127.5).astype(np.uint8))
MEAN, STD = torch.tensor([0.485, 0.456, 0.406])[:, None, None], torch.tensor([0.229, 0.224, 0.225])[:, None, None]
prep = T.Compose([T.Resize(160), T.CenterCrop(160), T.ToTensor(), T.Normalize(MEAN.flatten(), STD.flatten())])
c_img, s_img = prep(content)[None], prep(style)[None]
STYLE_LAYERS, CONTENT_LAYER = [0, 5, 10, 19, 28], 21
def features(x):
    out = {}
    for i, layer in enumerate(vgg):
        x = layer(x)
        if i in STYLE_LAYERS or i == CONTENT_LAYER:
            out[i] = x
    return out
fc, fs = features(c_img), features(s_img)
try:
    targets = {i: gram(fs[i]) for i in STYLE_LAYERS}
    x = c_img.clone().requires_grad_(True); opt = torch.optim.Adam([x], lr=0.03)
    for step in range(200):
        f = features(x)
        loss = F.mse_loss(f[CONTENT_LAYER], fc[CONTENT_LAYER]) + 1e5 * sum(F.mse_loss(gram(f[i]), targets[i]) for i in STYLE_LAYERS)
        opt.zero_grad(); loss.backward(); opt.step()
    show = lambda t: (t[0] * STD + MEAN).clamp(0, 1).permute(1, 2, 0).detach().numpy()
    fig, axes = plt.subplots(1, 3, figsize=(10, 3.5))
    for ax, im, title in zip(axes, [show(c_img), show(s_img), show(x)], ["content", "style", "result"]):
        ax.imshow(im); ax.set_title(title); ax.axis("off")
    plt.show()
except Exception as e:
    print("gram() isn't written yet:", type(e).__name__)

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · NIST, "Face Recognition Vendor Test Part 3: Demographic Effects": https://nvlpubs.nist.gov/nistpubs/ir/2019/NIST.IR.8280.pdf
