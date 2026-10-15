# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: GPUs and scale
# *AI from scratch, toolkit 5* · lesson: https://ihor.sh/ai/gpus-and-scale.html
#
# Count a model's parameters and estimate its memory, see what 16-bit numbers do, run a layer under autocast, find the
# batch size where throughput stops growing, and write gradient accumulation that matches a big batch exactly.
# Everything runs on a CPU; with a GPU (Colab: Runtime → Change runtime type → T4 GPU; Kaggle: Accelerator → GPU)
# the timings in section 5 get far more interesting. Replace each `...` under `# YOUR CODE HERE`, run the cell, then
# the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import time
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
print("device:", device, "·", torch.cuda.get_device_name(0) if device == "cuda" else "no GPU: timings are CPU timings")

# %% [markdown]
# ## 1. Count the parameters
# A small transformer-sized MLP block. Set `n_params` to its number of parameters: add up `p.numel()` (the number of
# entries in each weight tensor) over `model.parameters()`.

# %%
model = nn.Sequential(nn.Linear(1024, 4096), nn.GELU(), nn.Linear(4096, 1024))
n_params = None
### HINT sum(p.numel() for p in model.parameters())
### BEGIN SOLUTION
n_params = sum(p.numel() for p in model.parameters())
### END SOLUTION
print(n_params)

# %%
check(lambda: n_params == 1024 * 4096 + 4096 + 4096 * 1024 + 1024, "two 1024 × 4096 matrices plus their biases: 8,393,728")

# %% [markdown]
# ## 2. Will it fit?
# Write `gb_needed(n, bytes_per_param)`: the gigabytes (1 GB = 10⁹ bytes) for `n` parameters. Then use it for a
# 7-billion-parameter model: `run_fp16` (2 bytes per parameter) and `train_adam` (16 bytes per parameter).

# %%
def gb_needed(n, bytes_per_param):
    ### HINT n × bytes per parameter, divided by 1e9
    ### BEGIN SOLUTION
    return n * bytes_per_param / 1e9
    ### END SOLUTION

run_fp16 = train_adam = None
### HINT gb_needed(7e9, 2) and gb_needed(7e9, 16)
### BEGIN SOLUTION
run_fp16 = gb_needed(7e9, 2)
train_adam = gb_needed(7e9, 16)
### END SOLUTION
print("run in float16:", run_fp16, "GB · train with Adam:", train_adam, "GB (plus activations)")

# %%
check(lambda: np.isclose(run_fp16, 14) and np.isclose(train_adam, 112), "14 GB to run (fits a 16 GB T4, barely), 112 GB to train (doesn't fit one 80 GB GPU)")

# %% [markdown]
# ## 3. Predict: what does float16 do to 70,000?
# float16's largest number is 65,504. Set `guess` to what you expect `torch.tensor(70000.0).half()` to be (a number,
# or `float("inf")`). Then run the cell after it.

# %%
guess = None
### HINT Past the largest number a format can hold, there's only one thing left.
### BEGIN SOLUTION
guess = float("inf")
### END SOLUTION

# %%
for x in [70000.0, 2049.0, 1e-8]:
    print(x, "→ float16:", torch.tensor(x).half().item(), " bfloat16:", torch.tensor(x).bfloat16().item())
check(lambda: guess == torch.tensor(70000.0).half().item(), "inf: float16 overflows past 65,504 (bfloat16 keeps it, as 70,144)")

# %% [markdown]
# ## 4. Autocast
# Run `layer` on `x` inside `with torch.autocast(device, dtype=torch.bfloat16):` and set `out` to the result. The
# weights stay float32; autocast does the matrix product in bfloat16. (`with`: the training-in-PyTorch lesson.)

# %%
layer = nn.Linear(256, 256).to(device)
x = torch.randn(64, 256, device=device)
out = None
### HINT with torch.autocast(device, dtype=torch.bfloat16):
### HINT     out = layer(x)      (indented under the with)
### BEGIN SOLUTION
with torch.autocast(device, dtype=torch.bfloat16):
    out = layer(x)
### END SOLUTION
print(out.dtype if out is not None else None, "· weights stay", layer.weight.dtype)

# %%
check(lambda: out.dtype == torch.bfloat16 and layer.weight.dtype == torch.float32 and torch.allclose(out.float(), layer(x), atol=0.1),
      "a bfloat16 output from float32 weights, close to the float32 answer (about 2 significant digits)")

# %% [markdown]
# ## 5. Throughput against batch size
# Examples per second for the block from section 1 at several batch sizes (given). Set `best` to the batch size with
# the highest throughput, from the dict `speed` (`max(speed, key=speed.get)` gives the key with the biggest value).

# %%
block = model.to(device)
def examples_per_second(bs, reps=10):
    xb = torch.randn(bs, 1024, device=device)
    with torch.no_grad():
        block(xb)                                    # warm up
        if device == "cuda": torch.cuda.synchronize()
        t = time.perf_counter()
        for _ in range(reps):
            block(xb)
        if device == "cuda": torch.cuda.synchronize()
    return bs * reps / (time.perf_counter() - t)

speed = {bs: examples_per_second(bs) for bs in [1, 4, 16, 64, 256, 1024]}
plt.semilogx(list(speed), list(speed.values()), "o-"); plt.xlabel("batch size"); plt.ylabel("examples / second"); plt.show()
best = None
### HINT best = max(speed, key=speed.get)
### BEGIN SOLUTION
best = max(speed, key=speed.get)
### END SOLUTION
print("best batch size:", best, "· speed-up over batch 1:", round(speed[best] / speed[1]) if best else None, "×")

# %%
check(lambda: best == max(speed, key=speed.get) and speed[best] > 3 * speed[1], "throughput grows with the batch until the hardware is busy, then flattens")

# %% [markdown]
# ## 6. Gradient accumulation, exactly
# The gradient of the loss on all 64 rows is `big_grad` (given). Reproduce it with 4 micro-batches of 16: for each,
# compute the loss on its rows, divide by 4, and call `.backward()` (gradients add up in `.grad`). Then set
# `acc_grad` to `net.weight.grad.clone()`.

# %%
torch.manual_seed(1)
net = nn.Linear(10, 1)
X64, y64 = torch.randn(64, 10), torch.randn(64, 1)
F.mse_loss(net(X64), y64).backward()
big_grad = net.weight.grad.clone()
net.zero_grad()
acc_grad = None
### HINT for i in range(4): rows i*16 to (i+1)*16 are X64[i * 16:(i + 1) * 16]
### HINT Inside: (F.mse_loss(net(xb), yb) / 4).backward(). After the loop: acc_grad = net.weight.grad.clone()
### BEGIN SOLUTION
for i in range(4):
    xb, yb = X64[i * 16:(i + 1) * 16], y64[i * 16:(i + 1) * 16]
    (F.mse_loss(net(xb), yb) / 4).backward()
acc_grad = net.weight.grad.clone()
### END SOLUTION

# %%
check(lambda: torch.allclose(acc_grad, big_grad, atol=1e-6), "the same gradient: four means of 16, each divided by 4, add up to the mean of 64")

# %% [markdown]
# ## 7. Data parallel: what batch does the optimizer see?
# 8 GPUs, each with a batch of 32, average their gradients before every step. Set `effective_batch`.

# %%
effective_batch = None
### HINT 8 slices of 32 examples, averaged into one step.
### BEGIN SOLUTION
effective_batch = 8 * 32
### END SOLUTION

# %%
check(lambda: effective_batch == 256, "256: retune the learning rate and warmup for it")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Horace He, "Making Deep Learning Go Brrrr From First Principles":
# https://horace.io/brrr_intro.html
