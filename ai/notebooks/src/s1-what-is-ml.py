# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: your first models
# *AI from scratch, Start 1* · lesson: https://ihor.sh/ai/s1-what-is-ml.html
#
# Two parts. First you train Start 1's taxi model yourself, by hand and then by gradient descent, in NumPy.
# Then, the fast.ai way, you jump ahead and train a real image classifier in a few minutes with PyTorch, before
# understanding every piece of it: the rest of the path opens that box up.
#
# Fill in each `...` under `# YOUR CODE HERE`, run it, then run the check under it (✓ = right, ✗ = not yet).
# **Part 2 wants a GPU**: in Colab, *Runtime → Change runtime type → T4 GPU*; on Kaggle, *Settings → Accelerator →
# GPU* and turn *Internet* on.

# %%
import numpy as np
import matplotlib.pyplot as plt

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

# %% [markdown]
# ## Part 1. A model is a function with knobs
# 40 made-up taxi rides: distance in km, time in minutes. The hidden rule was minutes ≈ 2.6 × km + 6, plus traffic.

# %%
rng = np.random.default_rng(11)
km = rng.uniform(0.5, 12, 40)
minutes = np.maximum(2, 2.6 * km + 6 + 3 * rng.standard_normal(40))
plt.scatter(km, minutes); plt.xlabel("km"); plt.ylabel("minutes"); plt.show()

# %% [markdown]
# ### 1.1 The error
# Write `mse(a, b)`: the mean squared error of the line `a * km + b` on these rides.

# %%
def mse(a, b):
    ### BEGIN SOLUTION
    return np.mean((a * km + b - minutes) ** 2)
    ### END SOLUTION

# %%
check(lambda: abs(mse(2.6, 6) - np.mean((2.6 * km + 6 - minutes) ** 2)) < 1e-9, "average of (a·km + b − minutes)²")

# %% [markdown]
# ### 1.2 Turn the knobs by hand
# Set `a` and `b` to get the error under 10. Plot your line over the dots to see how you're doing.

# %%
a, b = 1.0, 15.0
### BEGIN SOLUTION
a, b = 2.6, 6.0
### END SOLUTION
plt.scatter(km, minutes); plt.plot([0, 12], [b, a * 12 + b], "r"); plt.show()
print("error:", mse(a, b))

# %%
check(lambda: mse(a, b) < 10, "get the mean squared error under 10")

# %% [markdown]
# ### 1.3 Let the computer turn them: gradient descent
# The slope of the error with respect to each knob tells it which way is downhill (stage 1 derives these):
#
# $$\frac{\partial L}{\partial a} = \frac{2}{n}\sum (a\,km_i + b - y_i)\,km_i \qquad \frac{\partial L}{\partial b} = \frac{2}{n}\sum (a\,km_i + b - y_i)$$
#
# Fill in one training step: compute both slopes and move each knob a small step (`lr`) against its slope.

# %%
a, b, lr = 0.0, 0.0, 0.01
history = []
for step in range(3000):
    ### BEGIN SOLUTION
    err = a * km + b - minutes
    grad_a = 2 * np.mean(err * km)
    grad_b = 2 * np.mean(err)
    a -= lr * grad_a
    b -= lr * grad_b
    ### END SOLUTION
    history.append(mse(a, b))
plt.plot(history); plt.yscale("log"); plt.xlabel("step"); plt.ylabel("error"); plt.show()
print("a =", a, " b =", b, " error =", mse(a, b))

# %%
best_a, best_b = np.polyfit(km, minutes, 1)        # the exact least-squares line, for comparison
check(lambda: abs(a - best_a) < 0.05 and abs(b - best_b) < 0.3, f"training should land near a = {best_a:.2f}, b = {best_b:.2f}")

# %% [markdown]
# ## Part 2. A real model in five minutes: cats vs dogs
# The Oxford-IIIT Pet dataset has 7,349 photos of 37 breeds; we only ask "cat or dog?". Instead of training from
# scratch, we start from **ResNet-18**, a network already trained on 1.2 million everyday photos (ImageNet), and
# retrain it briefly on pets. This is **transfer learning**, and it's how most image models at work are built.
# Don't worry about every line yet: just run it and look at the result.

# %%
import torch, torchvision
from torchvision import transforms as T
from torch.utils.data import DataLoader, Subset

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print("training on", device, "(a GPU makes this about 20× faster)")

tf = T.Compose([T.Resize(160), T.CenterCrop(144), T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
pets = torchvision.datasets.OxfordIIITPet("data", split="trainval", target_types="binary-category", transform=tf, download=True)
print(len(pets), "photos; label 0 = cat, 1 = dog")

# %%
N_TRAIN, N_VALID = 2000, 500       # a subset keeps this quick; use more for a better model
idx = torch.randperm(len(pets), generator=torch.Generator().manual_seed(0))
train = DataLoader(Subset(pets, idx[:N_TRAIN]), batch_size=64, shuffle=True)
valid = DataLoader(Subset(pets, idx[N_TRAIN:N_TRAIN + N_VALID]), batch_size=128)

model = torchvision.models.resnet18(weights="IMAGENET1K_V1")      # downloads the pretrained knobs
model.fc = torch.nn.Linear(model.fc.in_features, 2)                # a new last layer: 2 answers, cat or dog
model = model.to(device)
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)

def accuracy():
    model.eval(); right = total = 0
    with torch.no_grad():
        for x, y in valid:
            right += (model(x.to(device)).argmax(1).cpu() == y).sum().item(); total += len(y)
    return right / total

print("before training:", accuracy())
for epoch in range(2):
    model.train()
    for x, y in train:
        loss = torch.nn.functional.cross_entropy(model(x.to(device)), y.to(device))
        opt.zero_grad(); loss.backward(); opt.step()
    print(f"after epoch {epoch + 1}: validation accuracy {accuracy():.3f}")

# %% [markdown]
# Before training, the new last layer guesses (about 50%). Two short passes over 2,000 photos get it to about
# 90–95% on photos it never saw; train on all 7,349 for longer and it passes 98%. Every piece of that cell gets its own lesson later: images as numbers
# (chapter 6), the network (stage 2), the loss (chapter 5), the optimizer (stage 4), transfer learning (stage 5).
#
# ### 2.1 Your turn: what does it get wrong?
# Collect the validation photos the model misclassifies into `mistakes`, a list of (image tensor, true label)
# pairs. Then look at a few: are they hard for a person too?

# %%
mistakes = []
model.eval()
with torch.no_grad():
    for x, y in valid:
        pred = model(x.to(device)).argmax(1).cpu()
        ### BEGIN SOLUTION
        mistakes += [(img, int(t)) for img, p, t in zip(x, pred, y) if p != t]
        ### END SOLUTION
print(len(mistakes), "mistakes out of", N_VALID)
mean, std = torch.tensor([0.485, 0.456, 0.406])[:, None, None], torch.tensor([0.229, 0.224, 0.225])[:, None, None]
fig, axes = plt.subplots(1, min(6, len(mistakes)) or 1, figsize=(14, 3))
for ax, (img, t) in zip(np.atleast_1d(axes), mistakes[:6]):
    ax.imshow((img * std + mean).permute(1, 2, 0).clamp(0, 1)); ax.set_title("really a " + ["cat", "dog"][t]); ax.axis("off")
plt.show()

# %%
check(lambda: 0 < len(mistakes) < N_VALID * 0.2 and all(len(m) == 2 for m in mistakes), "a list of (image, label) pairs, the misclassified ones")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/s2-just-enough-code.html · The same top-down idea is the heart of fast.ai's
# free course: lesson 1 trains a classifier on photos you find yourself (https://course.fast.ai/Lessons/lesson1.html).
