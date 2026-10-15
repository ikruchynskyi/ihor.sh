# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: training in PyTorch
# *AI from scratch, stage 2* · lesson: https://ihor.sh/ai/training-in-pytorch.html
#
# The lesson's pieces, for real: tensors on a GPU, gradients that add up, a DataLoader, an `nn.Module`, the
# five-line training loop, the "overfit one batch" habit, and saving a model. The data is Fashion-MNIST: 70,000
# small grayscale photos of clothes in 10 kinds. Replace each `...` under `# YOUR CODE HERE`, run the cell, then
# the check under it; `hint(n)` and `answer(n)` are there when you're stuck.
#
# A GPU makes it quicker (Colab: Runtime → Change runtime type → T4 GPU; Kaggle: Settings → Accelerator → GPU,
# Internet on), but every cell also runs on a CPU in a few minutes.

# %%
import os
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print("device:", device)

# %% [markdown]
# ## 1. Tensors live somewhere
# A tensor is made like a NumPy array, and `.to(device)` moves it to the GPU (or leaves it on the CPU when there is
# none). Set `xt`: the array `x` as a float32 tensor (`torch.tensor(x, dtype=torch.float32)`, as in chapter 1's
# notebook), moved to `device`.

# %%
x = np.array([[1.0, 2.0], [3.0, 4.0]])
xt = None
### HINT Make the tensor first, then call .to(device) on it.
### HINT xt = torch.tensor(x, dtype=torch.float32).to(device)
### BEGIN SOLUTION
xt = torch.tensor(x, dtype=torch.float32).to(device)
### END SOLUTION
print(xt)

# %%
check(lambda: torch.is_tensor(xt) and xt.dtype == torch.float32 and xt.device.type == torch.device(device).type,
      "a float32 tensor on the device: torch.tensor(x, dtype=torch.float32) and then .to(device)")

# %% [markdown]
# ## 2. Gradients add up
# Below, $L = w^2$ at $w = 3$, so $\partial L/\partial w = 2w = 6$, and `.backward()` puts 6 into `w.grad`.
#
# **Predict:** if we compute the same loss again and call `.backward()` a second time *without* clearing `w.grad`,
# what will `w.grad` be? Set `guess_grad`, then run the cell after it to see.

# %%
w = torch.tensor(3.0, requires_grad=True)
L = w ** 2
L.backward()
print("after one backward:", w.grad)
guess_grad = None
### HINT The lesson's tensors section: .backward() adds to .grad, it doesn't replace it.
### BEGIN SOLUTION
guess_grad = 12
### END SOLUTION

# %%
L = w ** 2
L.backward()
print("after two backwards, without zero_grad:", w.grad)
check(lambda: guess_grad == 12, "6 + 6 = 12: backward() adds. That's why every training step starts with zero_grad()")

# %% [markdown]
# ## 3. Data in batches
# Fashion-MNIST: 60,000 training photos and 10,000 test photos, 28 × 28 pixels, 10 kinds of clothes.

# %%
tf = transforms.ToTensor()                    # a photo → a (1, 28, 28) tensor of numbers from 0 to 1
train_ds = datasets.FashionMNIST("data", train=True, download=True, transform=tf)
test_ds = datasets.FashionMNIST("data", train=False, download=True, transform=tf)
names = train_ds.classes
fig, axes = plt.subplots(1, 8, figsize=(12, 2))
for ax, i in zip(axes, range(8)):
    img, label = train_ds[i]
    ax.imshow(img[0], cmap="gray"); ax.set_title(names[label], fontsize=8); ax.axis("off")
plt.show()

# %% [markdown]
# Set `train_dl` and `test_dl` with `DataLoader`, as in the lesson's section 5: the training set in batches of 128,
# shuffled; the test set in batches of 512, not shuffled (order doesn't matter when you only measure).

# %%
train_dl = test_dl = None
### HINT DataLoader(dataset, batch_size=..., shuffle=...): shuffle=True for training, leave it out for testing.
### HINT train_dl = DataLoader(train_ds, batch_size=128, shuffle=True), test_dl = DataLoader(test_ds, batch_size=512)
### BEGIN SOLUTION
train_dl = DataLoader(train_ds, batch_size=128, shuffle=True)
test_dl = DataLoader(test_ds, batch_size=512)
### END SOLUTION
print("steps per epoch:", len(train_dl) if train_dl else None)

# %%
check(lambda: train_dl.batch_size == 128 and isinstance(train_dl.sampler, torch.utils.data.RandomSampler),
      "the training loader: batch_size=128 and shuffle=True")
check(lambda: test_dl.batch_size == 512 and not isinstance(test_dl.sampler, torch.utils.data.RandomSampler),
      "the test loader: batch_size=512, not shuffled")
check(lambda: len(train_dl) == 469, "60,000 / 128 = 468.75, so 469 steps per epoch (the last batch has 96 photos)")

# %%
if train_dl is None or test_dl is None:       # exercise 3 not done yet: ready-made loaders so the rest still runs
    train_dl, test_dl = DataLoader(train_ds, batch_size=128, shuffle=True), DataLoader(test_ds, batch_size=512)

# %% [markdown]
# ## 4. The model: an nn.Module
# `MLP` starts as a plain linear model: flatten the 28 × 28 photo into 784 numbers, then one `nn.Linear` to 10
# scores. Make it deeper, like the lesson's MLP: flatten, `nn.Linear(784, 256)`, `nn.ReLU()`, `nn.Linear(256, 10)`,
# all inside `nn.Sequential(...)`.

# %%
class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(nn.Flatten(), nn.Linear(784, 10))      # the plain linear model
        ### HINT Replace the line above with a deeper stack: nn.Sequential(nn.Flatten(), nn.Linear(784, 256), ...)
        ### HINT self.layers = nn.Sequential(nn.Flatten(), nn.Linear(784, 256), nn.ReLU(), nn.Linear(256, 10))
        ### BEGIN SOLUTION
        self.layers = nn.Sequential(nn.Flatten(), nn.Linear(784, 256), nn.ReLU(), nn.Linear(256, 10))
        ### END SOLUTION

    def forward(self, x):
        return self.layers(x)

n_params = sum(p.numel() for p in MLP().parameters())
print(MLP(), "\nparameters:", n_params)

# %%
check(lambda: n_params == 784 * 256 + 256 + 256 * 10 + 10,
      "784·256 + 256 weights and biases into the hidden layer, 256·10 + 10 out: 203,530 parameters")

# %% [markdown]
# ## 5. The loop
# Here is the lesson's five-line loop with its last three lines missing. After the loss, write them in the right
# order: clear the old gradients, backpropagate, step.

# %%
torch.manual_seed(0)
model = MLP().to(device)
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)

def evaluate(m):
    m.eval(); right = 0
    with torch.no_grad():
        for xb, yb in test_dl:
            right += (m(xb.to(device)).argmax(1) == yb.to(device)).sum().item()
    m.train()
    return right / len(test_ds)

print("before training:", evaluate(model), "(10 kinds: guessing gets 0.1)")
for epoch in range(2):
    for xb, yb in train_dl:
        xb, yb = xb.to(device), yb.to(device)
        loss = F.cross_entropy(model(xb), yb)
        ### HINT The lesson's loop: optimizer.zero_grad(), then loss.backward(), then optimizer.step(). Here it's opt.
        ### HINT opt.zero_grad()  then  loss.backward()  then  opt.step(), one per line
        ### BEGIN SOLUTION
        opt.zero_grad()
        loss.backward()
        opt.step()
        ### END SOLUTION
    print("epoch", epoch + 1, " last batch loss", round(loss.item(), 3), " test accuracy", evaluate(model))
test_acc = evaluate(model)

# %%
check(lambda: test_acc > 0.84, "two epochs should reach about 86%. Stuck near 0.1? The step isn't happening; swinging wildly? zero_grad is missing")

# %% [markdown]
# ## 6. The habit: overfit one batch
# A fresh model trained on a single batch of 128 photos, over and over, should drive its loss to nearly 0. If it
# can't, the bug is in the model or the loop. Its loss starts near $\ln 10 \approx 2.3$, the "knows nothing" loss.
# Write the loop body: the loss of `small` on `xb, yb` with `F.cross_entropy`, then the same three lines as above,
# with `opt_small`.

# %%
torch.manual_seed(0)
xb, yb = next(iter(train_dl))
xb, yb = xb.to(device), yb.to(device)
small = MLP().to(device)
opt_small = torch.optim.AdamW(small.parameters(), lr=1e-3)
print("starting loss:", F.cross_entropy(small(xb), yb).item())
for step in range(300):
    ### HINT The same as part 5's loop body, with small and opt_small, and no inner loop over batches.
    ### HINT loss = F.cross_entropy(small(xb), yb), then opt_small.zero_grad(), loss.backward(), opt_small.step()
    ### BEGIN SOLUTION
    loss = F.cross_entropy(small(xb), yb)
    opt_small.zero_grad()
    loss.backward()
    opt_small.step()
    ### END SOLUTION
final_one_batch = F.cross_entropy(small(xb), yb).item()
print("after 300 steps on one batch:", final_one_batch)

# %%
check(lambda: final_one_batch < 0.05, "the loss on the one memorized batch should fall below 0.05 (from about 2.3)")

# %% [markdown]
# ## 7. Save it, load it back
# Save the trained model's weights to `fashion.pt` with `torch.save(model.state_dict(), ...)` (Start 4 did the
# same). The cell then builds a fresh `MLP`, loads the file into it, and measures it.

# %%
### HINT torch.save(what, filename): what is model.state_dict(), the filename "fashion.pt".
### BEGIN SOLUTION
torch.save(model.state_dict(), "fashion.pt")
### END SOLUTION
if os.path.exists("fashion.pt"):
    loaded = MLP().to(device)
    loaded.load_state_dict(torch.load("fashion.pt", map_location=device))
    print("file:", round(os.path.getsize("fashion.pt") / 1e6, 2), "MB  loaded model's accuracy:", evaluate(loaded))

# %%
check(lambda: os.path.exists("fashion.pt") and abs(evaluate(loaded) - test_acc) < 1e-9,
      "fashion.pt should exist, and the loaded copy should score exactly like the model you trained")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · stage 3 starts with chapter 11, overfitting. PyTorch's own "Learn the
# Basics" tutorial walks the same ground on the same data: https://pytorch.org/tutorials/beginner/basics/intro.html
