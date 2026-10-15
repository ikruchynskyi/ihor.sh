# %% [markdown]
# # Practice: inside a detector
# *AI from scratch, stage 5* · lesson: https://ihor.sh/ai/inside-a-detector.html
#
# Build a tiny YOLO-style detector from scratch: find the responsible cell, encode a box as the four numbers a network
# learns, decode them back, write the loss that only counts the responsible cell, train it on 3,000 synthetic images of
# squares, discs and bars, and score it. Then a tiny U-Net for segmentation, with its skip connections and Dice score.
# About two minutes on a CPU. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it;
# `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import math
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from torchvision.ops import box_iou
torch.manual_seed(0)
rng = np.random.default_rng(0)
G, IMG, C = 4, 64, 3          # a 4 × 4 grid over 64 × 64 images; 3 classes
CELL = IMG / G                # each cell is 16 pixels
NAMES = ["square", "disc", "bar"]

def make(n):
    "n noisy 64 × 64 images, each with one object; returns images, boxes [x1, y1, x2, y2] and classes."
    X = np.zeros((n, 1, IMG, IMG), np.float32); boxes = np.zeros((n, 4), np.float32); cls = np.zeros(n, int)
    yy, xx = np.mgrid[:IMG, :IMG]
    for i in range(n):
        c = rng.integers(3); cls[i] = c
        w = rng.uniform(10, 28); h = w if c < 2 else w * 0.35
        if c == 2 and rng.random() < 0.5:
            w, h = h, w
        cx, cy = rng.uniform(w / 2, IMG - w / 2), rng.uniform(h / 2, IMG - h / 2)
        m = ((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2 <= 1 if c == 1 else (abs(xx - cx) <= w / 2) & (abs(yy - cy) <= h / 2)
        X[i, 0] = m * rng.uniform(0.6, 1) + rng.normal(0, 0.1, (IMG, IMG)); boxes[i] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    return torch.tensor(X), torch.tensor(boxes), torch.tensor(cls)

Xtr, Btr, Ctr = make(3000); Xte, Bte, Cte = make(500)
fig, axes = plt.subplots(1, 6, figsize=(12, 2))
for ax, i in zip(axes, range(6)):
    ax.imshow(Xtr[i, 0], cmap="gray"); x1, y1, x2, y2 = Btr[i].tolist()
    ax.add_patch(plt.Rectangle((x1, y1), x2 - x1, y2 - y1, fill=False, ec="r")); ax.set_title(NAMES[Ctr[i]]); ax.axis("off")
plt.show()

# %% [markdown]
# ## 1. Which cell is responsible?
# The box `b = [20, 30, 44, 42]` has its center at the middle of its corners. Set `gx` and `gy`: the column and row of
# the cell containing that center (each cell is `CELL = 16` pixels; `//` divides and rounds down).

# %%
b = [20, 30, 44, 42]
gx = gy = None
### HINT The center is ((20 + 44) / 2, (30 + 42) / 2) = (32, 36).
### HINT gx = int(32 // CELL), gy = int(36 // CELL)
### BEGIN SOLUTION
gx, gy = int((b[0] + b[2]) / 2 // CELL), int((b[1] + b[3]) / 2 // CELL)
### END SOLUTION
print(gx, gy)

# %%
check(lambda: (gx, gy) == (2, 2), "center (32, 36): column 32 // 16 = 2, row 36 // 16 = 2")

# %% [markdown]
# ## 2. A box as four learnable numbers
# Here each cell's "anchor" is simply the cell size. Write `encode(b)` returning `(fx, fy, tw, th)`: the center's
# position inside its cell as a fraction from 0 to 1 (`cx / CELL - gx`), and the log size ratios `log(w / CELL)`,
# `log(h / CELL)` (`math.log`).

# %%
def encode(b):
    cx, cy, w, h = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, b[2] - b[0], b[3] - b[1]
    gx, gy = int(cx // CELL), int(cy // CELL)
    ### HINT fx = cx / CELL - gx, the same for fy with cy and gy.
    ### HINT tw = math.log(w / CELL), th = math.log(h / CELL); then return fx, fy, tw, th
    ### BEGIN SOLUTION
    fx, fy = cx / CELL - gx, cy / CELL - gy
    tw, th = math.log(w / CELL), math.log(h / CELL)
    return fx, fy, tw, th
    ### END SOLUTION

# %%
check(lambda: np.allclose(encode([20, 30, 44, 42]), (0.0, 0.25, math.log(1.5), math.log(0.75))),
      "center exactly on the cell's left edge (0.0), a quarter down (0.25); 24 px wide = 1.5 cells → ln 1.5; 12 px tall → ln 0.75")

# %% [markdown]
# ## 3. And back again
# Write `decode(fx, fy, tw, th, gx, gy)` returning the box `[x1, y1, x2, y2]`: center `((gx + fx) * CELL, (gy + fy) * CELL)`,
# size `(CELL * exp(tw), CELL * exp(th))` (`math.exp`). It should undo `encode`.

# %%
def decode(fx, fy, tw, th, gx, gy):
    ### HINT cx = (gx + fx) * CELL; w = CELL * math.exp(tw); the same for y and h.
    ### HINT return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    ### BEGIN SOLUTION
    cx, cy = (gx + fx) * CELL, (gy + fy) * CELL
    w, h = CELL * math.exp(tw), CELL * math.exp(th)
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    ### END SOLUTION

# %%
check(lambda: np.allclose(decode(*encode([20, 30, 44, 42]), 2, 2), [20, 30, 44, 42]), "decode(encode(b)) gives b back")

# %% [markdown]
# ## 4. The detector, and the loss that only counts the responsible cell
# The network (given) is chapter 6's kind of CNN: four conv-and-pool layers shrink 64 × 64 to the 4 × 4 grid, and a
# 1 × 1 convolution outputs 8 numbers per cell: objectness, fx, fy, tw, th, and 3 class scores. `targets` builds the
# same 8 numbers from the true boxes (1 for objectness only at the responsible cell).
#
# Write the box term of `detection_loss`: `m` marks the responsible cells (given). Take the predicted `fx, fy`
# through a sigmoid and `tw, th` as they are, select the responsible cells with `[m]`, and compare with the targets by
# `F.mse_loss`. The objectness and class terms are given.

# %%
def targets(boxes, cls):
    T = torch.zeros(len(boxes), 5 + C, G, G)
    for i, (b, c) in enumerate(zip(boxes.tolist(), cls.tolist())):
        fx, fy, tw, th = encode(b) if encode(b) is not None else (0, 0, 0, 0)
        gx, gy = int((b[0] + b[2]) / 2 // CELL), int((b[1] + b[3]) / 2 // CELL)
        T[i, :5, gy, gx] = torch.tensor([1.0, fx, fy, tw, th]); T[i, 5 + c, gy, gx] = 1
    return T

net = nn.Sequential(nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(64, 5 + C, 1))

def detection_loss(P, T):
    cells = lambda x: x.permute(0, 2, 3, 1)          # (n, numbers, G, G) → (n, G, G, numbers), so [m] picks whole cells
    m = T[:, 0].bool()                               # the responsible cells
    objectness = F.binary_cross_entropy_with_logits(P[:, 0], T[:, 0])
    classes = F.cross_entropy(cells(P[:, 5:])[m], cells(T[:, 5:])[m].argmax(1))
    box = torch.tensor(0.0)
    ### HINT Center: F.mse_loss(cells(torch.sigmoid(P[:, 1:3]))[m], cells(T[:, 1:3])[m])
    ### HINT Size: F.mse_loss(cells(P[:, 3:5])[m], cells(T[:, 3:5])[m]). box = 5 * center + size (YOLO weights the box term).
    ### BEGIN SOLUTION
    center = F.mse_loss(cells(torch.sigmoid(P[:, 1:3]))[m], cells(T[:, 1:3])[m])
    size = F.mse_loss(cells(P[:, 3:5])[m], cells(T[:, 3:5])[m])
    box = 5 * center + size
    ### END SOLUTION
    return objectness + box + classes

# %%
Ttr = targets(Btr, Ctr)
def perfect(T):
    "Network outputs that match targets T exactly: big objectness logits, centers before the sigmoid, sizes, class logits."
    return torch.cat([T[:, :1] * 40 - 20, torch.logit(T[:, 1:3].clamp(1e-4, 1 - 1e-4)), T[:, 3:5], T[:, 5:] * 40 - 20], 1)
P_ok = perfect(Ttr[:8]); P_bad = P_ok.clone(); P_bad[:, 3:5] += 1          # every size off by 1
check(lambda: detection_loss(P_ok, Ttr[:8]).item() < 0.01 and abs(detection_loss(P_bad, Ttr[:8]).item() - detection_loss(P_ok, Ttr[:8]).item() - 1) < 1e-3,
      "a perfect prediction costs ~0, and sizes off by 1 at the responsible cells add exactly 1 (and nothing anywhere else)")

# %% [markdown]
# ## 5. Train it, decode its answers, score them
# Training is given (12 epochs, about 40 seconds on a CPU). Then decode each test image's prediction from the cell with
# the highest objectness. Set `hit_rate`: the share of test images whose predicted box has IoU above 0.5 with the true
# box. `box_iou(pred_boxes, Bte)` gives every pair; its diagonal (`.diag()`) pairs each image with its own box.

# %%
opt = torch.optim.Adam(net.parameters(), lr=2e-3)
for epoch in range(12):
    perm = torch.randperm(len(Xtr))
    for i in range(0, len(Xtr), 64):
        idx = perm[i:i + 64]; opt.zero_grad(); detection_loss(net(Xtr[idx]), Ttr[idx]).backward(); opt.step()
with torch.no_grad():
    P = net(Xte)
n = len(P); k = P[:, 0].reshape(n, -1).argmax(1); cy_, cx_ = k // G, k % G; ar = torch.arange(n)
cx = (cx_ + torch.sigmoid(P[ar, 1, cy_, cx_])) * CELL; cy = (cy_ + torch.sigmoid(P[ar, 2, cy_, cx_])) * CELL
w = torch.exp(P[ar, 3, cy_, cx_]) * CELL; h = torch.exp(P[ar, 4, cy_, cx_]) * CELL
pred_boxes = torch.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1); pred_cls = P[ar, 5:, cy_, cx_].argmax(1)
hit_rate = None
### HINT ious = box_iou(pred_boxes, Bte).diag()
### HINT hit_rate = (ious > 0.5).float().mean().item()
### BEGIN SOLUTION
ious = box_iou(pred_boxes, Bte).diag()
hit_rate = (ious > 0.5).float().mean().item()
### END SOLUTION
print("boxes with IoU > 0.5:", hit_rate, " · classes right:", (pred_cls == Cte).float().mean().item())
fig, axes = plt.subplots(1, 6, figsize=(12, 2))
for ax, i in zip(axes, range(6)):
    ax.imshow(Xte[i, 0], cmap="gray"); x1, y1, x2, y2 = pred_boxes[i].tolist()
    ax.add_patch(plt.Rectangle((x1, y1), x2 - x1, y2 - y1, fill=False, ec="lime")); ax.set_title(NAMES[pred_cls[i]]); ax.axis("off")
plt.show()

# %%
check(lambda: hit_rate > 0.9, "nearly every box lands with IoU above 0.5, from a network that started knowing nothing")

# %% [markdown]
# ## 6. A tiny U-Net: write the skip connections
# Segmentation of discs in noisy images. In `forward`, the decoder upsamples (`self.u2`, `self.u1`); before each
# decoder block, glue on the encoder's map of the same size along the channel axis: `torch.cat([up, enc], dim=1)`.
# The encoder maps are `a` (64 × 64) and `b` (32 × 32).

# %%
def make_masks(n):
    X = np.zeros((n, 1, IMG, IMG), np.float32); M = np.zeros((n, IMG, IMG), np.float32); yy, xx = np.mgrid[:IMG, :IMG]
    for i in range(n):
        for _ in range(rng.integers(1, 4)):
            r = rng.uniform(5, 14); cx, cy = rng.uniform(r, IMG - r, 2); M[i][(xx - cx) ** 2 + (yy - cy) ** 2 <= r * r] = 1
        X[i, 0] = M[i] * rng.uniform(0.5, 1) + rng.normal(0, 0.35, (IMG, IMG))
    return torch.tensor(X), torch.tensor(M)
def block(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.ReLU(), nn.Conv2d(o, o, 3, padding=1), nn.ReLU())

class UNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.d1, self.d2, self.mid = block(1, 16), block(16, 32), block(32, 64)
        self.u2, self.c2 = nn.ConvTranspose2d(64, 32, 2, stride=2), block(64, 32)     # 32 upsampled + 32 from the skip
        self.u1, self.c1 = nn.ConvTranspose2d(32, 16, 2, stride=2), block(32, 16)     # 16 upsampled + 16 from the skip
        self.out = nn.Conv2d(16, 1, 1)

    def forward(self, x):
        a = self.d1(x)                          # 64 × 64, 16 channels
        b = self.d2(F.max_pool2d(a, 2))         # 32 × 32, 32 channels
        m = self.mid(F.max_pool2d(b, 2))        # 16 × 16, 64 channels
        up = self.u2(m)                         # back to 32 × 32
        ### HINT up = self.c2(torch.cat([up, b], dim=1)), then up = self.u1(up)
        ### HINT then up = self.c1(torch.cat([up, a], dim=1)) and return self.out(up)[:, 0]
        ### BEGIN SOLUTION
        up = self.c2(torch.cat([up, b], dim=1))
        up = self.u1(up)
        up = self.c1(torch.cat([up, a], dim=1))
        return self.out(up)[:, 0]
        ### END SOLUTION

# %%
check(lambda: UNet()(torch.zeros(2, 1, 64, 64)).shape == (2, 64, 64), "one score per pixel: (2, 64, 64)")

# %% [markdown]
# ## 7. Train it and score it with Dice
# Training is given (3 epochs, about a minute). Write `dice(pred, mask)`: `2 × |P ∩ M| / (|P| + |M|)` per image, then
# the mean. With 0/1 masks, `|P ∩ M|` is `(pred * mask).sum(dim=(1, 2))` and `|P|` is `pred.sum(dim=(1, 2))`.

# %%
Str, Mtr = make_masks(2000); Ste, Mte = make_masks(300)
seg = UNet()
try:
    seg(Str[:1])
    opt = torch.optim.Adam(seg.parameters(), lr=2e-3)
    for epoch in range(3):
        perm = torch.randperm(len(Str))
        for i in range(0, len(Str), 32):
            idx = perm[i:i + 32]; opt.zero_grad(); F.binary_cross_entropy_with_logits(seg(Str[idx]), Mtr[idx]).backward(); opt.step()
except Exception as e:
    print("the U-Net can't run yet:", type(e).__name__)

def dice(pred, mask):
    ### HINT inter = (pred * mask).sum(dim=(1, 2)); total = pred.sum(dim=(1, 2)) + mask.sum(dim=(1, 2))
    ### HINT return (2 * inter / (total + 1e-6)).mean().item()
    ### BEGIN SOLUTION
    inter = (pred * mask).sum(dim=(1, 2))
    total = pred.sum(dim=(1, 2)) + mask.sum(dim=(1, 2))
    return (2 * inter / (total + 1e-6)).mean().item()
    ### END SOLUTION

with torch.no_grad():
    try:
        pred = (seg(Ste) > 0).float()
        print("Dice on test images:", dice(pred, Mte))
        fig, axes = plt.subplots(2, 5, figsize=(10, 4))
        for j in range(5):
            axes[0, j].imshow(Ste[j, 0], cmap="gray"); axes[1, j].imshow(pred[j], cmap="gray"); axes[0, j].axis("off"); axes[1, j].axis("off")
        plt.show()
    except Exception as e:
        pred = None; print("not yet:", type(e).__name__)

# %%
check(lambda: np.isclose(dice(torch.ones(1, 4, 4), torch.ones(1, 4, 4)), 1) and np.isclose(dice(torch.ones(1, 2, 2), torch.tensor([[[1.0, 1], [0, 0]]])), 2 * 2 / 6, atol=1e-4)
      and dice(pred, Mte) > 0.9,
      "1 for a perfect mask; and the U-Net's masks score above 0.9 on noisy test images")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · The original YOLO paper, readable in an afternoon: https://arxiv.org/abs/1506.02640
