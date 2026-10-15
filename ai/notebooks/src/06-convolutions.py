# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: convolutions and a CNN that reads digits
# *AI from scratch, chapter 6* · lesson: https://ihor.sh/ai/06-convolutions.html
#
# Write a convolution, check it against PyTorch, work out output sizes and parameter counts, then train a small
# convolutional network on the 70,000 MNIST handwritten digits and look at the filters it learned.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# A GPU helps (Colab: Runtime → Change runtime type → T4 GPU; Kaggle: Accelerator → GPU, Internet on).

# %%
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from numpy.lib.stride_tricks import sliding_window_view

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print("device:", device)

# %% [markdown]
# ## 1. A convolution without loops
# `sliding_window_view(I, (k, k))` gives every k×k patch of an image (shape (H−k+1, W−k+1, k, k)). Write
# `conv2d(I, K)`: multiply each patch by the filter and sum (`np.einsum("rcij,ij->rc", ...)` or `(patches * K).sum(...)`).
# PyTorch's `F.conv2d` does the same ("valid" mode, no flipping).

# %%
def conv2d(I, K):
    """Compute 2D valid cross-correlation (convolution without flipping) of image I with kernel K.
    
    Args:
        I: 2D NumPy array representing image of shape (H, W).
        K: 2D NumPy array representing filter kernel of shape (k, k).
    Returns:
        NumPy array of shape (H - k + 1, W - k + 1).
    """
    ### HINT Extract sliding patches with sliding_window_view(I, K.shape).
    ### HINT Multiply each patch by K and sum spatial axes: np.einsum("rcij,ij->rc", sliding_window_view(I, K.shape), K).
    ### BEGIN SOLUTION
    return np.einsum("rcij,ij->rc", sliding_window_view(I, K.shape), K)
    ### END SOLUTION

I, K = np.random.default_rng(0).random((10, 12)), np.random.default_rng(1).standard_normal((3, 3))
ref = F.conv2d(torch.tensor(I)[None, None], torch.tensor(K)[None, None])[0, 0].numpy()

# %%
check(lambda: np.allclose(conv2d(I, K), ref), 
      "Your conv2d(I, K) implementation must match PyTorch's F.conv2d output.")

# %% [markdown]
# ## 2. Output size
# Write `out_size(n, k, p=0, s=1)`: the output width of a convolution on an n-wide input with kernel k, padding p,
# stride s: $\lfloor (n + 2p - k)/s \rfloor + 1$. PyTorch's `nn.Conv2d` checks you.

# %%
def out_size(n, k, p=0, s=1):
    """Calculate the output spatial dimension for a 1D/2D convolution.
    
    Formula: floor((n + 2*p - k) / s) + 1
    
    Args:
        n: Input spatial dimension (height or width).
        k: Kernel filter size.
        p: Symmetric padding applied to both sides (default 0).
        s: Convolution stride step (default 1).
    Returns:
        int: Output spatial dimension.
    """
    ### HINT Compute floor((n + 2 * p - k) // s) + 1.
    ### BEGIN SOLUTION
    return (n + 2 * p - k) // s + 1
    ### END SOLUTION

cases = [(28, 3, 0, 1), (28, 3, 1, 1), (28, 5, 2, 2), (224, 7, 3, 2)]
torch_sizes = [nn.Conv2d(1, 1, k, stride=s, padding=p)(torch.zeros(1, 1, n, n)).shape[-1] for n, k, p, s in cases]

# %%
check(lambda: [out_size(*c) for c in cases] == torch_sizes, 
      f"out_size results must match PyTorch's output sizes: {torch_sizes}")

# %% [markdown]
# ## 3. Why convolutions: parameter counts
# Set `conv_params`: the parameters of `nn.Conv2d(3, 64, 3)` (64 filters over 3 colour channels, plus 64 biases),
# and `dense_params`: a fully connected layer mapping a 32×32×3 image to a 30×30×64 output. Count by formula, then
# confirm the first with PyTorch (`sum(p.numel() for p in layer.parameters())`).

# %%
conv_params = dense_params = None
### HINT Compute conv_params = out_channels * (in_channels * k * k) + out_channels = 64 * (3 * 3 * 3) + 64.
### HINT Compute dense_params = in_features * out_features + out_features = (32 * 32 * 3) * (30 * 30 * 64) + (30 * 30 * 64).
### BEGIN SOLUTION
conv_params = 64 * 3 * 3 * 3 + 64
dense_params = (32 * 32 * 3) * (30 * 30 * 64) + 30 * 30 * 64
### END SOLUTION
print(conv_params, dense_params)

# %%
check(lambda: conv_params == sum(p.numel() for p in nn.Conv2d(3, 64, 3).parameters()), 
      "nn.Conv2d(3, 64, 3) must have 1,792 total parameters.")
check(lambda: dense_params > 10_000 * conv_params, 
      "An equivalent unshared dense layer requires over 10,000x more parameters (> 170M params).")

# %% [markdown]
# ## 4. Train a CNN on MNIST
# Two conv blocks (conv 3×3 with padding 1 → ReLU → 2×2 max pool with `MaxPool2d(2)`), then a linear layer to 10 scores:
# `Conv2d(1, 16, 3, padding=1)`, `ReLU()`, `MaxPool2d(2)`, `Conv2d(16, 32, 3, padding=1)`, `Flatten()`, `Linear(32 * 7 * 7, 10)`.
# Build it as `nn.Sequential` in `model`. The training loop below runs 2 epochs with Adam.

# %%
from torchvision import datasets, transforms
tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))])
train_ds = datasets.MNIST("data", train=True, download=True, transform=tf)
test_ds = datasets.MNIST("data", train=False, download=True, transform=tf)
train_dl = torch.utils.data.DataLoader(train_ds, batch_size=128, shuffle=True)
test_dl = torch.utils.data.DataLoader(test_ds, batch_size=512)

torch.manual_seed(0)
model = None
### HINT Two blocks of nn.Conv2d(in, out, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2): 1 → 16 channels, then 16 → 32.
### HINT Each MaxPool2d(2) halves the size: 28 → 14 → 7. So the last layer is nn.Linear(32 * 7 * 7, 10) after nn.Flatten().
### BEGIN SOLUTION
model = nn.Sequential(
    nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),     # 28×28 → 14×14
    nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),    # 14×14 → 7×7
    nn.Flatten(), nn.Linear(32 * 7 * 7, 10))
### END SOLUTION

def evaluate():
    model.eval(); right = 0
    with torch.no_grad():
        for x, y in test_dl:
            right += (model(x.to(device)).argmax(1).cpu() == y).sum().item()
    return right / len(test_ds)

test_acc = None
if model is not None:
    model = model.to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    for epoch in range(2):
        model.train()
        for x, y in train_dl:
            loss = F.cross_entropy(model(x.to(device)), y.to(device))
            opt.zero_grad(); loss.backward(); opt.step()
        test_acc = evaluate()
        print(f"epoch {epoch + 1}: test accuracy {test_acc:.4f}")

# %%
check(lambda: test_acc > 0.98, 
      "The two-layer CNN should reach > 98% test accuracy on MNIST.")
check(lambda: sum(p.numel() for p in model.parameters()) < 25_000, 
      "The entire CNN architecture should contain fewer than 25,000 parameters.")

# %% [markdown]
# ## 5. What did the first layer learn?
# Plot the 16 first-layer filters (`model[0].weight`, shape (16, 1, 3, 3)) as small grey images. Many look like the
# lesson's edge detectors: light on one side, dark on the other.

# %%
if test_acc is not None:
    w = model[0].weight.detach().cpu()[:, 0]
    fig, ax = plt.subplots(2, 8, figsize=(10, 3))
    for a, k in zip(ax.flat, w):
        a.imshow(k, cmap="gray"); a.axis("off")
    plt.show()

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · fast.ai lesson 1 trains an image classifier on photos you collect
# yourself (https://course.fast.ai/Lessons/lesson1.html).
