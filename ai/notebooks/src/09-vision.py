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

# %% [markdown]
# ## 1. IoU for every pair at once
# Boxes as corners `[x1, y1, x2, y2]` (torchvision's format). `iou_matrix(A, B)` takes arrays of shape (n, 4) and
# (m, 4) and returns the (n, m) matrix of intersection-over-union. Broadcasting does every pair at once: the
# intersection's corners are the max of the top-lefts (`tl`) and the min of the bottom-rights (`br`), both written for
# you, with shape (n, m, 2). Finish it: the intersection's width and height are `br - tl`, clipped at 0 when boxes don't
# overlap (`np.clip(..., 0, None)`); its area is their product (`.prod(-1)` multiplies along the last axis). Then
# return intersection / union, where union = area of A + area of B − intersection.

# %%
def iou_matrix(A, B):
    """Compute pairwise Intersection-over-Union (IoU) between bounding box sets A and B.
    
    Args:
        A: NumPy array of shape (n, 4) with boxes in [x1, y1, x2, y2] format.
        B: NumPy array of shape (m, 4) with boxes in [x1, y1, x2, y2] format.
    Returns:
        NumPy array of shape (n, m) with IoU values in [0.0, 1.0].
    """
    tl = np.maximum(A[:, None, :2], B[None, :, :2])            # (n, m, 2): every pair's top-left
    br = np.minimum(A[:, None, 2:], B[None, :, 2:])            # (n, m, 2): every pair's bottom-right
    area = lambda X: (X[:, 2] - X[:, 0]) * (X[:, 3] - X[:, 1])  # each box's own area
    ### HINT inter = np.clip(br - tl, 0, None).prod(-1) is the (n, m) matrix of intersection areas.
    ### HINT The areas need the same (n, m) shape to combine: area(A)[:, None] and area(B)[None, :].
    ### HINT return inter / (area(A)[:, None] + area(B)[None, :] - inter)
    ### BEGIN SOLUTION
    inter = np.clip(br - tl, 0, None).prod(-1)
    return inter / (area(A)[:, None] + area(B)[None, :] - inter)
    ### END SOLUTION

rng = np.random.default_rng(0)
xy = rng.uniform(0, 100, (6, 2)); A = np.hstack([xy, xy + rng.uniform(10, 40, (6, 2))])
xy = rng.uniform(0, 100, (4, 2)); B = np.hstack([xy, xy + rng.uniform(10, 40, (4, 2))])

# %%
check(lambda: np.allclose(iou_matrix(A, B), box_iou(torch.tensor(A), torch.tensor(B)).numpy()), 
      "Your vectorized iou_matrix(A, B) must match torchvision.ops.box_iou.")

# %% [markdown]
# ## 2. Non-maximum suppression
# Write `my_nms(boxes, scores, limit)`: go through the boxes from the highest score down, and keep a box only if its
# IoU with every box kept so far is at most `limit`. Return the kept indices, best first. `np.argsort(-scores)` lists
# the indices from the highest score down; torchvision's `nms` checks you.

# %%
def my_nms(boxes, scores, limit=0.5):
    """Perform Non-Maximum Suppression (NMS) on bounding boxes.
    
    Args:
        boxes: NumPy array of shape (N, 4) with box coordinates.
        scores: 1D NumPy array of shape (N,) with detection confidence scores.
        limit: IoU overlap threshold above which lower-scoring boxes are suppressed.
    Returns:
        list of int: Indices of retained boxes, ordered by descending score.
    """
    ### HINT keep = [], then for i in np.argsort(-scores): ... and return keep at the end.
    ### HINT The IoU of boxes i and k is iou_matrix(boxes[[i]], boxes[[k]])[0, 0]; all(... for k in keep) checks every kept one.
    ### HINT if all(iou_matrix(boxes[[i]], boxes[[k]])[0, 0] <= limit for k in keep): keep.append(i)
    ### BEGIN SOLUTION
    keep = []
    for i in np.argsort(-scores):
        if all(iou_matrix(boxes[[i]], boxes[[k]])[0, 0] <= limit for k in keep):
            keep.append(i)
    return keep
    ### END SOLUTION

xy = rng.uniform(0, 60, (30, 2)); boxes = np.hstack([xy, xy + 30]); scores = rng.random(30)
ref = nms(torch.tensor(boxes), torch.tensor(scores), 0.5).tolist()

# %%
check(lambda: list(map(int, my_nms(boxes, scores))) == ref, 
      "my_nms retained box indices must match torchvision.ops.nms in exact order.")

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
### HINT Run inference inside with torch.no_grad(): out = detector([weights.transforms()(dog)])[0].
### HINT Extract top_label = classes[out['labels'][0]] and top_score = out['scores'][0].item().
### BEGIN SOLUTION
with torch.no_grad():
    out = detector([weights.transforms()(dog)])[0]
top_label, top_score = classes[out["labels"][0]], out["scores"][0].item()
### END SOLUTION
print(top_label, top_score)

# %%
check(lambda: top_label == "dog" and top_score > 0.8, 
      "The pretrained detector should identify 'dog' as top detection with confidence > 0.8.")

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
    """Count detected traffic entities (car, bus, truck, person) above a score threshold.
    
    Args:
        img: Torch tensor representing image [C, H, W].
        threshold: Float confidence cutoff score (default 0.5).
    Returns:
        dict: Counts mapping class names {"car": int, "bus": int, "truck": int, "person": int}.
    """
    ### HINT Pass transformed image through detector inside torch.no_grad().
    ### HINT Filter detected class labels having confidence score >= threshold.
    ### HINT Count occurrences of "car", "bus", "truck", "person".
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
check(lambda: len(frames) > 0 and all(set(count(img)) == {"car", "bus", "truck", "person"} for _, img in frames[:2]), 
      "count() should return a dictionary with counts for 'car', 'bus', 'truck', and 'person'.")
check(lambda: all(count(frames[0][1], 0.9)[k] <= count(frames[0][1], 0.3)[k] for k in ("car", "person")), 
      "A higher threshold (0.9) must result in equal or fewer detections than a lower threshold (0.3).")

# %% [markdown]
# Traffic cameras are low resolution and far away, so small or overlapping vehicles get missed. Try thresholds
# between 0.3 and 0.7 and compare with what you see. Chapter 9's page does the same counting live in your browser.
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · next: chapter 7, attention.
