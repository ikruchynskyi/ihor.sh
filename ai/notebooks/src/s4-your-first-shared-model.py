# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: a pet-breed classifier on the web
# *AI from scratch, Start 4* · lesson: https://ihor.sh/ai/s4-your-first-shared-model.html
#
# Train a model that tells 37 cat and dog breeds apart, save it, load it back, wrap it in a Gradio app, and (with
# a free Hugging Face account) publish it as a public web page. Fill in each `...` under `# YOUR CODE HERE`, then run
# the check under it (✓ = right, ✗ = not yet).
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

def check(test, msg="not yet"):
    "Runs test() and prints ✓ if it's true, ✗ and a hint if not (it never stops the notebook)."
    try:
        ok = bool(test())
    except Exception as e:
        ok, msg = False, f"{msg} ({type(e).__name__}: {e})"
    print("✓" if ok else f"✗ {msg}")

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
# ## 2. Fine-tune a pretrained ResNet-18
# Replace the last layer with one that outputs 37 scores (`nn.Linear(model.fc.in_features, 37)`), then train for
# 3 epochs with AdamW and cross-entropy, using **two learning rates**: 1e-3 for the new last layer, which starts
# from random, and 1e-4 for the pretrained body, which only needs gentle adjusting (one learning rate of 1e-3 for
# everything partly wrecks the pretrained features: about 68% instead of about 90%). Set `model`.
# Hint: `torch.optim.AdamW([{"params": body_params, "lr": 1e-4}, {"params": model.fc.parameters(), "lr": 1e-3}])`.

# %%
torch.manual_seed(0)
train_dl = DataLoader(train_ds, batch_size=64, shuffle=True, num_workers=2)
test_dl = DataLoader(test_ds, batch_size=128, num_workers=2)
model = None
### BEGIN SOLUTION
model = torchvision.models.resnet18(weights=weights)
model.fc = nn.Linear(model.fc.in_features, len(labels))
model = model.to(device)
body = [p for n, p in model.named_parameters() if not n.startswith("fc.")]
opt = torch.optim.AdamW([{"params": body, "lr": 1e-4}, {"params": model.fc.parameters(), "lr": 1e-3}])
for epoch in range(3):
    model.train()
    for x, y in train_dl:
        loss = nn.functional.cross_entropy(model(x.to(device)), y.to(device))
        opt.zero_grad(); loss.backward(); opt.step()
    print("epoch", epoch + 1, "done")
### END SOLUTION

def accuracy(m):
    m.eval(); right = 0
    with torch.no_grad():
        for x, y in test_dl:
            right += (m(x.to(device)).argmax(1).cpu() == y).sum().item()
    return right / len(test_ds)

test_acc = accuracy(model) if model is not None else None
print("test accuracy:", test_acc)

# %%
check(lambda: test_acc > 0.85, "fine-tuning reaches 85%+ on 37 breeds (random guessing: 2.7%)")

# %% [markdown]
# ## 3. Save it, and prove the saved copy is the same model
# Save the weights with `torch.save(model.state_dict(), "space/model.pt")` and the labels as JSON in
# `space/labels.json`. Then build a **fresh** ResNet-18 with 37 outputs, load the file into it, and set `same`: True if
# both models give identical scores on a batch of test photos.

# %%
os.makedirs("space", exist_ok=True)
same = None
### BEGIN SOLUTION
torch.save(model.state_dict(), "space/model.pt")
json.dump(labels, open("space/labels.json", "w"))
fresh = torchvision.models.resnet18(num_classes=len(labels))
fresh.load_state_dict(torch.load("space/model.pt", map_location=device))
fresh = fresh.to(device).eval(); model.eval()
x, _ = next(iter(test_dl))
with torch.no_grad():
    same = torch.allclose(model(x.to(device)), fresh(x.to(device)), atol=1e-5)
### END SOLUTION
print("same:", same, " file size:", round(os.path.getsize("space/model.pt") / 1e6, 1) if os.path.exists("space/model.pt") else None, "MB")

# %%
check(lambda: same is True or same == True, "the reloaded model gives exactly the same answers")

# %% [markdown]
# ## 4. The prediction function
# Write `predict(img)`: a PIL image in, a dict {breed: probability} of the top 5 out. Preprocess with `preprocess`,
# add a batch dimension, run the model, softmax, take the five biggest.

# %%
def predict(img):
    ### BEGIN SOLUTION
    model.eval()
    with torch.no_grad():
        p = model(preprocess(img)[None].to(device)).softmax(-1)[0].cpu()
    return {labels[i]: float(p[i]) for i in p.argsort(descending=True)[:5]}
    ### END SOLUTION

raw = torchvision.datasets.OxfordIIITPet("data", split="test")       # without the transform: PIL images
img, true = raw[7]
print("really:", labels[true], " model says:", predict(img))

# %%
check(lambda: len(predict(img)) == 5 and abs(sum(predict(img).values()) - 1) < 1 and list(predict(img))[0] in labels, "five breeds with probabilities")

# %% [markdown]
# ## 5. The app
# Gradio builds the web page around `predict`. Create `demo = gr.Interface(fn=predict, inputs=gr.Image(type="pil"),
# outputs=gr.Label(num_top_classes=5), title=...)`. Set `LAUNCH = True` and run the cell to try it right here (in
# Colab, `share=True` gives a temporary public link).

# %%
import gradio as gr
LAUNCH = False
demo = None
### BEGIN SOLUTION
demo = gr.Interface(fn=predict, inputs=gr.Image(type="pil"), outputs=gr.Label(num_top_classes=5),
                    title="Pet breed classifier", description="37 cat and dog breeds, ResNet-18 fine-tuned on Oxford-IIIT Pet")
### END SOLUTION
if LAUNCH and demo is not None:
    demo.launch(share=True)

# %%
check(lambda: isinstance(demo, gr.Interface), "a Gradio interface around predict")

# %% [markdown]
# ## 6. Files for a Hugging Face Space
# A Space needs `app.py`, `requirements.txt` and the model files. Write `space/app.py` (the lesson shows one: it loads
# labels.json and model.pt, rebuilds the model, defines predict and launches the interface) and
# `space/requirements.txt` with `torch`, `torchvision` and `gradio`, one per line.

# %%
### BEGIN SOLUTION
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
open("space/requirements.txt", "w").write("torch\ntorchvision\ngradio\n")
### END SOLUTION
print(sorted(os.listdir("space")))

# %%
check(lambda: {"app.py", "requirements.txt", "model.pt", "labels.json"} <= set(os.listdir("space")), "all four files are in space/")
check(lambda: compile(open("space/app.py").read(), "app.py", "exec") is not None and "launch" in open("space/app.py").read(), "app.py is valid Python and launches the interface")

# %% [markdown]
# ## 7. Publish it
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
