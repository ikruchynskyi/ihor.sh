# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: detecting objects on NYC traffic cameras
# *AI from scratch, chapter 9* · lesson: https://ihor.sh/ai/09-vision.html
#
# The two pieces of geometry every detector uses (IoU and non-maximum suppression), checked against torchvision,
# then a pretrained detector counting cars, buses and people on live frames from New York City's traffic cameras.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# Kaggle: turn on *Internet* (and a GPU if you like) in the notebook settings.

# %%
import io, json, urllib.request
import numpy as np
import matplotlib.pyplot as plt
import torch, torchvision
from torchvision.ops import box_iou, nms

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## 1. IoU for every pair at once
# Boxes as corners `[x1, y1, x2, y2]` (torchvision's format). Write `iou_matrix(A, B)` for arrays of shape (n, 4) and
# (m, 4) returning the (n, m) matrix of intersection-over-union, with broadcasting: the intersection's corners are the
# max of the top-lefts and the min of the bottom-rights (clip negative widths to 0).

# %%
def iou_matrix(A, B):
    ### BEGIN SOLUTION
    tl = np.maximum(A[:, None, :2], B[None, :, :2])
    br = np.minimum(A[:, None, 2:], B[None, :, 2:])
    inter = np.clip(br - tl, 0, None).prod(-1)
    area = lambda X: (X[:, 2] - X[:, 0]) * (X[:, 3] - X[:, 1])
    return inter / (area(A)[:, None] + area(B)[None, :] - inter)
    ### END SOLUTION

rng = np.random.default_rng(0)
xy = rng.uniform(0, 100, (6, 2)); A = np.hstack([xy, xy + rng.uniform(10, 40, (6, 2))])
xy = rng.uniform(0, 100, (4, 2)); B = np.hstack([xy, xy + rng.uniform(10, 40, (4, 2))])

# %%
check(lambda: np.allclose(iou_matrix(A, B), box_iou(torch.tensor(A), torch.tensor(B)).numpy()), "matches torchvision.ops.box_iou")

# %% [markdown]
# ## 2. Non-maximum suppression
# Write `my_nms(boxes, scores, limit)`: repeatedly keep the highest-scoring box and drop every remaining box whose IoU
# with it is above `limit`. Return the kept indices, best first. torchvision's `nms` checks you.

# %%
def my_nms(boxes, scores, limit=0.5):
    ### BEGIN SOLUTION
    order, keep = list(np.argsort(-scores)), []
    while order:
        best = order.pop(0); keep.append(best)
        order = [i for i in order if iou_matrix(boxes[[best]], boxes[[i]])[0, 0] <= limit]
    return keep
    ### END SOLUTION

xy = rng.uniform(0, 60, (30, 2)); boxes = np.hstack([xy, xy + 30]); scores = rng.random(30)
ref = nms(torch.tensor(boxes), torch.tensor(scores), 0.5).tolist()

# %%
check(lambda: list(map(int, my_nms(boxes, scores))) == ref, "the same boxes, in the same order, as torchvision.ops.nms")

# %% [markdown]
# ## 3. A pretrained detector
# torchvision ships detectors trained on COCO (80 everyday classes). Load the light Faster R-CNN with a MobileNet
# backbone, run it on a test photo, and set `top_label` (class name) and `top_score` of its most confident detection.

# %%
from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_fpn, FasterRCNN_MobileNet_V3_Large_FPN_Weights
from torchvision.io import decode_image
weights = FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT
detector = fasterrcnn_mobilenet_v3_large_fpn(weights=weights).eval()
classes = weights.meta["categories"]
fetch = lambda url: decode_image(torch.frombuffer(bytearray(urllib.request.urlopen(url, timeout=20).read()), dtype=torch.uint8))
dog = fetch("https://raw.githubusercontent.com/pytorch/vision/main/gallery/assets/dog1.jpg")
top_label = top_score = None
### BEGIN SOLUTION
with torch.no_grad():
    out = detector([weights.transforms()(dog)])[0]
top_label, top_score = classes[out["labels"][0]], out["scores"][0].item()
### END SOLUTION
print(top_label, top_score)

# %%
check(lambda: top_label == "dog" and top_score > 0.8, "it finds the dog, confidently")

# %% [markdown]
# ## 4. Count the street
# Six live frames from NYC DOT's public traffic cameras (Manhattan). Write `count(img, threshold=0.5)` returning a dict
# {"car": n, "bus": n, "truck": n, "person": n} of detections above the threshold. Then look at the frames.

# %%
cams = [c for c in json.load(urllib.request.urlopen("https://webcams.nyctmc.org/api/cameras", timeout=20))
        if c.get("area") == "Manhattan" and c.get("isOnline") in ("true", True)][:6]
frames = []
for c in cams:
    try:
        frames.append((c["name"], fetch(f"https://webcams.nyctmc.org/api/cameras/{c['id']}/image")))
    except Exception as e:
        print("skipped", c["name"], e)

def count(img, threshold=0.5):
    ### BEGIN SOLUTION
    with torch.no_grad():
        out = detector([weights.transforms()(img)])[0]
    names = [classes[l] for l, s in zip(out["labels"], out["scores"]) if s >= threshold]
    return {k: names.count(k) for k in ("car", "bus", "truck", "person")}
    ### END SOLUTION

fig, axes = plt.subplots(2, 3, figsize=(15, 7))
for ax, (name, img) in zip(axes.flat, frames):
    ax.imshow(img.permute(1, 2, 0)); ax.set_title(f"{name}\n{count(img)}", fontsize=9); ax.axis("off")
plt.show()

# %%
check(lambda: len(frames) > 0 and all(set(count(img)) == {"car", "bus", "truck", "person"} for _, img in frames[:2]), "a dict of four counts per frame")
check(lambda: all(count(frames[0][1], 0.9)[k] <= count(frames[0][1], 0.3)[k] for k in ("car", "person")), "a stricter threshold never counts more")

# %% [markdown]
# Traffic cameras are low resolution and far away, so small or overlapping vehicles get missed. Try thresholds
# between 0.3 and 0.7 and compare with what you see. Chapter 9's page does the same counting live in your browser.
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 7, attention.
