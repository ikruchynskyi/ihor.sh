# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: a pet-breed classifier on the web
# *AI from scratch, Start 4* · lesson: https://ihor.sh/ai/s4-your-first-shared-model.html
#
# Train a model that tells 37 cat and dog breeds apart, save it, load it back, wrap it in a Gradio app, and (with
# a free Hugging Face account) publish it as a public web page. The PyTorch code is written for you, with notes:
# stages 2 and 5 teach it line by line. Your exercises are the decisions around it, each a line or two of the Python
# from Start 2. Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and
# `answer(n)` are there when you're stuck.
#
# Use a GPU: Colab → Runtime → Change runtime type → T4 GPU; Kaggle → Settings → Accelerator → GPU, Internet on.

# %%
%pip install -q gradio huggingface_hub

# %%
import json, os
import numpy as np
import torch, torchvision
from torch import nn
from torch.utils.data import DataLoader, Subset

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print("device:", device)

# %% [markdown]
# ## 1. The data, with the model's own preprocessing
# The Oxford-IIIT Pet dataset: 37 breeds, about 100 training photos each. We take the preprocessing recipe from the
# pretrained weights (`weights.transforms()`): the same function will run in the app, so the two can't drift apart.

# %%
weights = torchvision.models.ResNet18_Weights.DEFAULT
preprocess = weights.transforms()
train_ds = torchvision.datasets.OxfordIIITPet("data", split="trainval", transform=preprocess, download=True)
test_ds = torchvision.datasets.OxfordIIITPet("data", split="test", transform=preprocess, download=True)
labels = [c.replace("_", " ") for c in train_ds.classes]
print(len(train_ds), "training photos,", len(test_ds), "test photos,", len(labels), "breeds:", labels[:5], "…")

# %% [markdown]
# ## 2. A new last layer
# ResNet-18 was trained to give 1,000 scores, one per ImageNet category. We keep everything it learned and swap only
# its last layer for a fresh one with **one score per breed**.
#
# **Exercise 1.** How many scores should the new last layer give? Set `n_outputs` (the cell above printed it, and
# `len(labels)` counts it).

# %%
n_outputs = None
### HINT One score for each breed in labels.
### HINT n_outputs = len(labels), which is 37
### BEGIN SOLUTION
n_outputs = len(labels)
### END SOLUTION
print(n_outputs)

# %%
check(lambda: n_outputs == 37, "one score per breed: 37")

# %% [markdown]
# ## 3. Two learning rates
# The new layer starts from random numbers and has everything to learn. The pretrained body already recognizes
# fur, ears and eyes, and only needs gentle adjusting: big steps would wreck what it knows (one learning rate of
# 1e-3 for everything ends near 68% instead of 90%).
#
# **Exercise 2.** Set `lr_new` (for the new layer) and `lr_body` (for the pretrained body) to `1e-3` and `1e-4`:
# which gets the bigger steps?

# %%
lr_new = lr_body = None
### HINT 1e-3 = 0.001 is ten times bigger than 1e-4 = 0.0001.
### HINT The layer that starts from random has the most to learn.
### BEGIN SOLUTION
lr_new = 1e-3
lr_body = 1e-4
### END SOLUTION
print(lr_new, lr_body)

# %%
check(lambda: lr_new == 1e-3 and lr_body == 1e-4, "the random new layer takes big steps (1e-3); the pretrained body small ones (1e-4)")

# %% [markdown]
# Now train for 3 passes over the photos (epochs), with those two learning rates (compare with your answers). Read the
# comments; stage 2 builds this loop from scratch.
# It takes a few minutes on a GPU.

# %%
torch.manual_seed(0)
train_dl = DataLoader(train_ds, batch_size=64, shuffle=True, num_workers=2)
test_dl = DataLoader(test_ds, batch_size=128, num_workers=2)

model = torchvision.models.resnet18(weights=weights)            # the pretrained model
model.fc = nn.Linear(model.fc.in_features, len(labels))         # its new last layer: one score per breed
model = model.to(device)
body = [p for name, p in model.named_parameters() if not name.startswith("fc.")]
opt = torch.optim.AdamW([{"params": body, "lr": 1e-4},                     # gentle steps for the pretrained body
                         {"params": model.fc.parameters(), "lr": 1e-3}])   # bigger ones for the new layer
for epoch in range(3):
    model.train()
    for x, y in train_dl:                                       # 64 photos at a time
        loss = nn.functional.cross_entropy(model(x.to(device)), y.to(device))   # how wrong (stage 2)
        opt.zero_grad(); loss.backward(); opt.step()            # nudge every knob downhill
    print("epoch", epoch + 1, "done")

def accuracy(m):
    m.eval(); right = 0
    with torch.no_grad():                                       # no training here, so no gradients needed
        for x, y in test_dl:
            right += (m(x.to(device)).argmax(1).cpu() == y).sum().item()
    return right / len(test_ds)

test_acc = accuracy(model)
print("test accuracy:", test_acc)

# %%
check(lambda: test_acc > 0.85, "fine-tuning reaches 85%+ on 37 breeds (random guessing: 2.7%)")

# %% [markdown]
# ## 4. Save it, and prove the saved copy is the same model
# The weights go into one file; the labels into another. Then we build a **fresh** ResNet-18 with 37 outputs, load
# the file into it, and give both models the same batch of test photos.

# %%
os.makedirs("space", exist_ok=True)
torch.save(model.state_dict(), "space/model.pt")
json.dump(labels, open("space/labels.json", "w"))
print("model file:", round(os.path.getsize("space/model.pt") / 1e6, 1), "MB")

fresh = torchvision.models.resnet18(num_classes=len(labels))
fresh.load_state_dict(torch.load("space/model.pt", map_location=device))
fresh = fresh.to(device).eval(); model.eval()
x, _ = next(iter(test_dl))
with torch.no_grad():
    scores_model, scores_fresh = model(x.to(device)), fresh(x.to(device))

# %% [markdown]
# **Exercise 3.** Set `same` to whether the two sets of scores match. Tiny rounding differences are fine, so don't
# use `==`: `allclose` (`torch.allclose(a, b)`) says whether every number in `a` is within a hair of the one in `b`.

# %%
same = None
### HINT Give torch.allclose the two score tensors from the cell above.
### HINT same = torch.allclose(scores_model, scores_fresh)
### BEGIN SOLUTION
same = torch.allclose(scores_model, scores_fresh)
### END SOLUTION
print(same)

# %%
check(lambda: same is True or same == True, "the reloaded model gives the same scores: same should be True")

# %% [markdown]
# ## 5. The prediction function
# The lesson's flow: **input → preprocess → model → postprocess**. Below, `predict(img)` preprocesses a photo, runs
# the model and turns its scores into probabilities `p`, with `top5` the positions of the five biggest.
#
# **Exercise 4.** Finish the postprocess: return a dictionary `{breed: probability}` for the five, like the last
# line of the lesson's `top_k` box (`float(...)` turns a one-number tensor into a plain number).

# %%
def predict(img):
    model.eval()
    with torch.no_grad():
        p = model(preprocess(img)[None].to(device)).softmax(-1)[0].cpu()
    top5 = p.argsort(descending=True)[:5]
    ### HINT A dictionary comprehension: {key: value for i in top5}. The key is the breed's name, labels[i].
    ### HINT return {labels[i]: float(p[i]) for i in top5}
    ### BEGIN SOLUTION
    return {labels[i]: float(p[i]) for i in top5}
    ### END SOLUTION

raw = torchvision.datasets.OxfordIIITPet("data", split="test")       # without the transform: PIL images
img, true = raw[7]
print("really:", labels[true], " model says:", predict(img))

# %%
check(lambda: len(predict(img)) == 5 and list(predict(img))[0] in labels, "five breed names, each with its probability")

# %% [markdown]
# ## 6. The app
# Gradio builds a web page around a function: what goes in, what comes out.

# %%
import gradio as gr
photo_in = gr.Image(type="pil")                   # an upload box that hands predict a PIL image
top5_out = gr.Label(num_top_classes=5)            # shows a {name: probability} dict as bars

# %% [markdown]
# **Exercise 5.** Create an `Interface` with `demo = gr.Interface(fn=..., inputs=..., outputs=...)`: the function is your `predict`, the
# input `photo_in`, the output `top5_out`. Then set `LAUNCH = True` and run the cell again to try the app right here.

# %%
LAUNCH = False
demo = None
### HINT Named arguments, as in Start 2: fn=predict, inputs=photo_in, outputs=top5_out.
### BEGIN SOLUTION
demo = gr.Interface(fn=predict, inputs=photo_in, outputs=top5_out)
### END SOLUTION
if LAUNCH and demo is not None:
    demo.launch(share=True)

# %%
check(lambda: isinstance(demo, gr.Interface), "demo should be a gr.Interface around predict")

# %% [markdown]
# ## 7. Files for a Hugging Face Space
# A Space is a folder: `app.py` (the app), `requirements.txt` (the libraries to install, one per line) and the model
# files. This cell writes `app.py`: the same steps as above, as one file.

# %%
open("space/app.py", "w").write('''import gradio as gr, torch, torchvision, json

labels = json.load(open("labels.json"))
model = torchvision.models.resnet18(num_classes=len(labels))
model.load_state_dict(torch.load("model.pt", map_location="cpu"))
model.eval()
preprocess = torchvision.models.ResNet18_Weights.DEFAULT.transforms()

def predict(img):
    with torch.no_grad():
        p = model(preprocess(img)[None]).softmax(-1)[0]
    return {labels[i]: float(p[i]) for i in p.argsort(descending=True)[:5]}

gr.Interface(predict, gr.Image(type="pil"), gr.Label(num_top_classes=5), title="Pet breed classifier").launch()
''')

# %% [markdown]
# **Exercise 6.** Set `packages` to the list of libraries `app.py` imports from outside Python itself (look at its first
# line: `json` comes with Python). The cell then writes them into `requirements.txt`.

# %%
packages = None
### HINT A list of strings, like ["numpy", "pandas"]. app.py imports gradio, torch, torchvision and json.
### HINT packages = ["gradio", "torch", "torchvision"]
### BEGIN SOLUTION
packages = ["gradio", "torch", "torchvision"]
### END SOLUTION
if packages:
    open("space/requirements.txt", "w").write("\n".join(packages) + "\n")
print(sorted(os.listdir("space")))

# %%
check(lambda: sorted(packages) == ["gradio", "torch", "torchvision"], "gradio, torch and torchvision; json comes with Python")
check(lambda: {"app.py", "requirements.txt", "model.pt", "labels.json"} <= set(os.listdir("space")), "all four files are in space/")

# %% [markdown]
# ## 8. Publish it
# 1. Make a free account at https://huggingface.co and create an access token with **write** permission
#    (Settings → Access Tokens).
# 2. In Colab, store it under 🔑 Secrets as `HF_TOKEN`; on Kaggle, under Add-ons → Secrets.
# 3. Run the cell below. It creates a Space called `pet-breeds` and uploads the folder; a minute later the app is live
#    at `https://huggingface.co/spaces/<your name>/pet-breeds`. Send the link to a friend.

# %%
token = os.environ.get("HF_TOKEN")
try:
    from google.colab import userdata
    token = token or userdata.get("HF_TOKEN")
except Exception:
    pass
if token:
    from huggingface_hub import HfApi
    try:
        api = HfApi(token=token)
        repo = api.create_repo("pet-breeds", repo_type="space", space_sdk="gradio", exist_ok=True).repo_id
        api.upload_folder(folder_path="space", repo_id=repo, repo_type="space")
        print("live soon at https://huggingface.co/spaces/" + repo)
    except Exception as e:
        print("Hugging Face refused:", str(e).splitlines()[0], "→ check the token has *write* permission.")
else:
    print("No HF_TOKEN found: add one as a secret (step 2) and run this cell again.")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · stage 1 starts with chapter 1, matrices are moves. Every piece you used here
# (images as numbers, the network, the loss, the optimizer, transfer learning) gets its own lesson along the way.
