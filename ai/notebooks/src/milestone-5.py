# kaggle: gpu
# %% [markdown]
# # Milestone 5: Fine-tuning a pretrained vision model
# *AI from scratch, milestone 5* · combine notebook for Stage 5
#
# Transfer learning on real photos:
# 1. Take a modern pretrained vision backbone (`MobileNetV3-Small`, trained on 1.2M ImageNet photos).
# 2. Freeze its convolutional feature extractor and replace its final classification head for a new 4-class task.
# 3. Fine-tune the classifier head using Adam on real photos.
# 4. Measure per-class performance with precision, recall, and a full confusion matrix.
#
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import io, urllib.request
import numpy as np
import pandas as pd
from PIL import Image
import torch
from torch import nn
import torchvision
from torchvision import transforms as T
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from sklearn.metrics import confusion_matrix, precision_score, recall_score

torch.manual_seed(42)
np.random.seed(42)
device = "cuda" if torch.cuda.is_available() else "cpu"

# Load photo dataset (CIFAR-10 test parquet from Hugging Face hub)
url = "https://huggingface.co/datasets/uoft-cs/cifar10/resolve/main/plain_text/test-00000-of-00001.parquet"
df = pd.read_parquet(io.BytesIO(urllib.request.urlopen(url).read()))

# Focus on 4 distinct categories: 0: plane, 1: car, 2: bird, 3: cat
sub = df[df["label"].isin([0, 1, 2, 3])].reset_index(drop=True)
imgs = [Image.open(io.BytesIO(r["bytes"])).convert("RGB") for r in sub["img"]]
labels = sub["label"].to_numpy()
class_names = ["plane", "car", "bird", "cat"]

# Split into 600 training photos and 200 testing photos
tr_idx, te_idx = np.arange(600), np.arange(600, 800)
print(f"Data ready: {len(tr_idx)} train photos, {len(te_idx)} test photos across {class_names}")

# %% [markdown]
# ## 1. Image preprocessing transforms
# Pretrained PyTorch models expect images normalized with ImageNet channel means and standard deviations:
# Mean: `[0.485, 0.456, 0.406]`, Std: `[0.229, 0.224, 0.225]`.
# Build `transform`: a `T.Compose` that:
# - Resizes images to `(112, 112)`
# - Converts to Tensor (`T.ToTensor()`)
# - Normalizes with ImageNet mean and std (`T.Normalize(mean, std)`)
# Assign to `transform`.

# %%
mean = [0.485, 0.456, 0.406]
std = [0.229, 0.224, 0.225]

### HINT transform = T.Compose([T.Resize((112, 112)), T.ToTensor(), T.Normalize(mean, std)])
### BEGIN SOLUTION
transform = T.Compose([
    T.Resize((112, 112)),
    T.ToTensor(),
    T.Normalize(mean, std)
])
### END SOLUTION

# %%
check(lambda: transform is not None and transform(imgs[0]).shape == (3, 112, 112), "transform resizes images to (3, 112, 112) and normalizes channels")

# %% [markdown]
# ## 2. Freezing the backbone and adapting the head
# Load `mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)`.
# Freeze all feature backbone parameters by setting `p.requires_grad = False`.
# Replace the final linear classification layer:
# `model.classifier[3] = nn.Linear(1024, 4)`
# Assign the model to `model`.

# %%
### HINT model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
### HINT for p in model.parameters(): p.requires_grad = False
### HINT model.classifier[3] = nn.Linear(1024, 4)
### BEGIN SOLUTION
model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
for p in model.parameters():
    p.requires_grad = False
model.classifier[3] = nn.Linear(1024, 4)
### END SOLUTION

# %%
check(lambda: sum(p.numel() for p in model.parameters() if p.requires_grad) == 1024 * 4 + 4 and model.classifier[3].out_features == 4, "backbone is frozen (0 gradients) and classifier head has 4,100 trainable parameters")

# %% [markdown]
# ## 3. Fine-tuning the classifier
# Train `model.classifier[3]` for 3 epochs with Adam (`lr=0.005`) and `CrossEntropyLoss`.
# Pre-transform training and test images into batched tensors.
# Store the fine-tuned model in `model`.

# %%
if "model" in locals() and model is not None:
    X_tr = torch.stack([transform(imgs[i]) for i in tr_idx])
    y_tr = torch.tensor(labels[tr_idx], dtype=torch.int64)
    X_te = torch.stack([transform(imgs[i]) for i in te_idx])
    y_te = torch.tensor(labels[te_idx], dtype=torch.int64)

    model = model.to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.classifier[3].parameters(), lr=0.005)

    ### HINT for epoch in range(3): for i in range(0, len(X_tr), 64): bx, by = X_tr[i:i+64].to(device), y_tr[i:i+64].to(device); optimizer.zero_grad(); loss = criterion(model(bx), by); loss.backward(); optimizer.step()
    ### BEGIN SOLUTION
    model.train()
    for epoch in range(3):
        for i in range(0, len(X_tr), 64):
            bx = X_tr[i:i + 64].to(device)
            by = y_tr[i:i + 64].to(device)
            optimizer.zero_grad()
            loss = criterion(model(bx), by)
            loss.backward()
            optimizer.step()
    ### END SOLUTION

# %%
check(lambda: (model(X_te.to(device)).argmax(dim=1).cpu().numpy() == y_te.numpy()).mean() > 0.70, "Transfer learning achieves > 70% accuracy on fine-tuning with only 600 photos")

# %% [markdown]
# ## 4. Per-class precision and recall
# Overall accuracy hides per-category weaknesses (e.g. confusing cats with birds).
# Compute:
# - `cm`: 4x4 confusion matrix using `confusion_matrix(y_te.numpy(), test_preds)`
# - `precision`: 4-element array of precision scores per class: `precision_score(y_te.numpy(), test_preds, average=None)`
# - `recall`: 4-element array of recall scores per class: `recall_score(y_te.numpy(), test_preds, average=None)`

# %%
### HINT model.eval(); with torch.no_grad(): test_preds = model(X_te.to(device)).argmax(dim=1).cpu().numpy()
### HINT cm = confusion_matrix(y_te.numpy(), test_preds); precision = precision_score(y_te.numpy(), test_preds, average=None); recall = recall_score(y_te.numpy(), test_preds, average=None)
### BEGIN SOLUTION
model.eval()
with torch.no_grad():
    test_preds = model(X_te.to(device)).argmax(dim=1).cpu().numpy()
cm = confusion_matrix(y_te.numpy(), test_preds)
precision = precision_score(y_te.numpy(), test_preds, average=None)
recall = recall_score(y_te.numpy(), test_preds, average=None)
### END SOLUTION

if "precision" in locals() and precision is not None:
    for name, p, r in zip(class_names, precision, recall):
        print(f"Class '{name}': Precision = {p:.2f}, Recall = {r:.2f}")

# %%
check(lambda: cm.shape == (4, 4) and len(precision) == 4 and len(recall) == 4 and (precision > 0.5).all(), "confusion matrix and per-class precision and recall calculated across all 4 categories")

# %% [markdown]
# ## 5. Macro F1-score
# Write `macro_f1`: the arithmetic mean of each class's harmonic mean ($F_1 = 2 \frac{P \cdot R}{P + R}$).
# Compute and store in `f1`.

# %%
### HINT f1_per_class = 2 * (precision * recall) / (precision + recall + 1e-12)
### HINT f1 = float(np.mean(f1_per_class))
### BEGIN SOLUTION
f1_per_class = 2 * (precision * recall) / (precision + recall + 1e-12)
f1 = float(np.mean(f1_per_class))
### END SOLUTION

if "f1" in locals() and f1 is not None:
    print(f"Macro F1-Score: {f1:.3f}")

# %%
check(lambda: f1 > 0.65, "Macro F1 balances precision and recall across all categories equally")
