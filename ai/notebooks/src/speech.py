# %% [markdown]
# # Practice: listening
# *AI from scratch, elective* · lesson: https://ihor.sh/ai/speech.html
#
# The Free Spoken Digit Dataset: 3,000 recordings of "zero" to "nine" by six speakers, 8,000 samples a second. Compute
# log-mel spectrograms with NumPy (frames, Fourier transform, mel bands, log), train a small CNN on them, and compare a
# random split with a test on a speaker the model never heard. About a minute on a CPU. Replace each `...` under
# `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import io, re, urllib.request, zipfile
import numpy as np
import matplotlib.pyplot as plt
import torch
from torch import nn
import torch.nn.functional as F
from scipy.io import wavfile
z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen("https://codeload.github.com/Jakobovski/free-spoken-digit-dataset/zip/refs/heads/master").read()))
recs = []
for name in z.namelist():
    m = re.search(r"(\d)_(\w+)_(\d+)\.wav$", name)
    if m:
        sr, x = wavfile.read(io.BytesIO(z.read(name)))
        recs.append((int(m[1]), m[2], x.astype(np.float32) / 32768))
SR = 8000
digits = np.array([r[0] for r in recs]); speakers = np.array([r[1] for r in recs])
print(len(recs), "recordings ·", sorted(set(speakers)))
plt.figure(figsize=(9, 2)); plt.plot(recs[0][2]); plt.title(f"'{recs[0][0]}' by {recs[0][1]}: {len(recs[0][2])} samples"); plt.show()

# %% [markdown]
# ## 1. How long is it?
# Set `seconds`: the length of the first recording in seconds (its number of samples divided by `SR`).

# %%
seconds = None
### HINT len(recs[0][2]) / SR
### BEGIN SOLUTION
seconds = len(recs[0][2]) / SR
### END SOLUTION
print(seconds)

# %%
check(lambda: abs(seconds - len(recs[0][2]) / 8000) < 1e-12, "samples ÷ samples per second: under half a second for one spoken digit")

# %% [markdown]
# ## 2. Frames
# Each window is `N = 256` samples (32 ms), and a new one starts every `HOP = 128` samples. For a clip padded to
# `L = 6000` samples, set `n_frames` with the lesson's rule: `(L - N) // HOP + 1`.

# %%
N, HOP, L = 256, 128, 6000
n_frames = None
### HINT n_frames = (L - N) // HOP + 1
### BEGIN SOLUTION
n_frames = (L - N) // HOP + 1
### END SOLUTION
print(n_frames)

# %%
check(lambda: n_frames == 45, "45 frames: chapter 6's size rule, applied to time")

# %% [markdown]
# ## 3. The log-mel spectrogram
# The mel filter bank `FB` (32 bands, given) and the framing are done. Write the last two lines of `logmel`: the power
# spectrum of each frame, `abs(np.fft.rfft(frames, axis=1)) ** 2`, then the log of its mel bands,
# `np.log(power @ FB.T + 1e-6)`.

# %%
def mel_filterbank(n_mels=32, n_fft=N, sr=SR):
    mel, imel = lambda f: 2595 * np.log10(1 + f / 700), lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(0), mel(sr / 2), n_mels + 2)); bins = np.floor((n_fft + 1) * pts / sr).astype(int)
    fb = np.zeros((n_mels, n_fft // 2 + 1))
    for i in range(1, n_mels + 1):
        l, c, r = bins[i - 1], bins[i], bins[i + 1]
        fb[i - 1, l:c] = (np.arange(l, c) - l) / max(c - l, 1)
        fb[i - 1, c:r] = (r - np.arange(c, r)) / max(r - c, 1)
    return fb
FB = mel_filterbank()

def logmel(x):
    x = np.pad(x[:L], (0, max(0, L - len(x))))
    frames = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * np.hanning(N)
    ### HINT power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    ### HINT return np.log(power @ FB.T + 1e-6)
    ### BEGIN SOLUTION
    power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    return np.log(power @ FB.T + 1e-6)
    ### END SOLUTION

S0 = logmel(recs[0][2])
if S0 is not None:
    plt.figure(figsize=(6, 2.5)); plt.imshow(S0.T, origin="lower", aspect="auto"); plt.xlabel("frame"); plt.ylabel("mel band"); plt.title(f"log-mel of '{recs[0][0]}'"); plt.show()

# %%
check(lambda: S0.shape == (45, 32) and np.isfinite(S0).all(), "45 frames × 32 mel bands: a small image of the word")

# %% [markdown]
# ## 4. Two ways to split
# All 3,000 spectrograms (given, standardized). Set `random_test`: a True/False array marking a random 20% of the
# recordings (`rng.random(len(digits)) < 0.2`), and `speaker_test`: True for every recording by `"theo"`.

# %%
specs = np.stack([logmel(r[2]) for r in recs]) if S0 is not None else np.zeros((len(recs), 45, 32))
specs = (specs - specs.mean()) / (specs.std() + 1e-9)
rng = np.random.default_rng(0)
random_test = speaker_test = None
### HINT random_test = rng.random(len(digits)) < 0.2
### HINT speaker_test = speakers == "theo"
### BEGIN SOLUTION
random_test = rng.random(len(digits)) < 0.2
speaker_test = speakers == "theo"
### END SOLUTION

# %%
check(lambda: 0.15 < random_test.mean() < 0.25 and speaker_test.sum() == 500, "about 600 random recordings, and all 500 of theo's")

# %% [markdown]
# ## 5. Train a CNN, test both ways
# The CNN (chapter 6's kind) and its training are given. **Predict first:** which accuracy will be lower, the random
# split or the new speaker? Then run it (about a minute).

# %%
def train_and_test(test_mask, epochs=15):
    torch.manual_seed(0)
    net = nn.Sequential(nn.Conv2d(1, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2), nn.Flatten(), nn.Linear(32 * 11 * 8, 64), nn.ReLU(), nn.Linear(64, 10))
    Xtr = torch.tensor(specs[~test_mask], dtype=torch.float32)[:, None]; ytr = torch.tensor(digits[~test_mask])
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    for epoch in range(epochs):
        perm = torch.randperm(len(Xtr))
        for i in range(0, len(Xtr), 64):
            idx = perm[i:i + 64]; opt.zero_grad(); F.cross_entropy(net(Xtr[idx]), ytr[idx]).backward(); opt.step()
    with torch.no_grad():
        pred = net(torch.tensor(specs[test_mask], dtype=torch.float32)[:, None]).argmax(1).numpy()
    return (pred == digits[test_mask]).mean(), pred

if random_test is not None and speaker_test is not None:
    acc_random, _ = train_and_test(random_test)
    acc_speaker, pred_speaker = train_and_test(speaker_test)
    print(f"random split: {acc_random:.3f} · a speaker it never heard: {acc_speaker:.3f}")
else:
    acc_random = acc_speaker = None

# %%
check(lambda: acc_random > 0.9 and acc_speaker < acc_random - 0.05,
      "about 96% vs 79%: the random split let the test speaker's own voice into training. Test on new voices, as you'd split by group in features and leakage")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · OpenAI's Whisper paper, "Robust Speech Recognition via Large-Scale Weak Supervision": https://arxiv.org/abs/2212.04356
