# kaggle: gpu  (build.py: publish with a GPU)
# %% [markdown]
# # Practice: fine-tuning and LoRA
# *AI from scratch, stage 6* · lesson: https://ihor.sh/ai/fine-tuning-and-lora.html
#
# Teach SmolLM2-135M-Instruct to turn subway service alerts into JSON with no examples in the prompt, using LoRA
# written by hand: a 6-line layer, frozen weights, answer-only labels, 80 training steps. Then test it three ways and
# watch it forget how to chat, and fix that by switching the adapter off. About two minutes on a CPU.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)` are
# there when you're stuck.

# %%
import json, random, time, urllib.request
import torch
from torch import nn
from transformers import AutoTokenizer, AutoModelForCausalLM
random.seed(0); torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
name = "HuggingFaceTB/SmolLM2-135M-Instruct"
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(name, dtype=torch.float32).to(device)

# Alerts made from real station names: 300 stations for training, 79 held out; seven phrasings for training, three new ones for testing.
stations = [n for n in urllib.request.urlopen("https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/stations.txt").read().decode().split("\n") if n]
random.Random(1).shuffle(stations); train_st, held_st = stations[:300], stations[300:]
LINES = list("1234567ABCDEFGJLMNQRWZ") + ["S"]
TRAIN_T = ["The {l} train is delayed at {s}.", "Expect delays on the {l} at {s}.", "No {l} trains at {s} this weekend.", "The {l} is skipping {s}.",
           "{s}: {l} trains are running with delays.", "Signal problems near {s} on the {l} line.", "Elevator out at {s}; {l} riders use another entrance."]
NEW_T = ["Riders at {s} should avoid the {l} tonight.", "{l} service suspended at {s} due to a sick passenger.", "Shuttle buses replace the {l} near {s}."]
ASK = 'Extract the station and the line: "{}"'
def make(rng, pool, templates):
    s, l = rng.choice(pool), rng.choice(LINES)
    return rng.choice(templates).format(s=s, l=l), {"station": s, "line": l}
def ask(text, max_new_tokens=30):
    ids = tok(tok.apply_chat_template([{"role": "user", "content": text}], tokenize=False, add_generation_prompt=True), return_tensors="pt").input_ids.to(device)
    with torch.no_grad():
        return tok.decode(model.generate(ids, max_new_tokens=max_new_tokens, do_sample=False)[0, ids.shape[1]:], skip_special_tokens=True)
def score(pool, templates, n=30):
    rng, right = random.Random(123), 0
    for _ in range(n):
        text, ans = make(rng, pool, templates)
        try:
            right += json.loads(ask(ASK.format(text))) == ans
        except json.JSONDecodeError:
            pass
    return right
print("before fine-tuning:", score(train_st, TRAIN_T), "/ 30 ·", ask(ASK.format("The B train is delayed at 169 St.")))
general_before = ask("Name three boroughs of New York City.")
print("general:", general_before)

# %% [markdown]
# ## 1. How many numbers will LoRA train?
# Rank 8 on two matrices in each of 30 layers: the query projection is 576 → 576, the value projection 576 → 192
# (grouped-query attention: fewer value heads). A rank-`r` adapter on a `d_in → d_out` matrix has `r * (d_in + d_out)`
# numbers. Set `lora_numbers` for the whole model.

# %%
lora_numbers = None
### HINT Calculate parameters per layer: r * (d_in + d_out) for both Q and V projections, then multiply by 30 layers.
### HINT Per layer: 8 * (576 + 576) + 8 * (576 + 192). Then times 30 layers.
### BEGIN SOLUTION
lora_numbers = 30 * (8 * (576 + 576) + 8 * (576 + 192))
### END SOLUTION
print(lora_numbers, "of", sum(p.numel() for p in model.parameters()))

# %%
check(lambda: lora_numbers == 460_800, "30 × (9,216 + 6,144) = 460,800: about a third of a percent of the model")

# %% [markdown]
# ## 2. The LoRA layer
# `LoRAParts` (given) wraps a frozen `nn.Linear` called `self.base`, and makes the adapter: `self.A` (r × d_in, small
# random), `self.B` (d_out × r, zeros), the factor `self.scale` = alpha / r, and a switch `self.enabled`.

# %%
class LoRAParts(nn.Module):
    def __init__(self, base, r=8, alpha=16):
        super().__init__()
        self.base, self.scale, self.enabled = base, alpha / r, True
        self.A = nn.Parameter(torch.randn(r, base.in_features, device=base.weight.device) * 0.01)
        self.B = nn.Parameter(torch.zeros(base.out_features, r, device=base.weight.device))
part = LoRAParts(nn.Linear(6, 4), r=2)
print("A", tuple(part.A.shape), "· B", tuple(part.B.shape), "· scale", part.scale, "· enabled", part.enabled, "· base", part.base)

# %% [markdown]
# Write `forward` for `LoRA`, which inherits all of that: the base layer's output, plus (when `self.enabled`) the
# low-rank correction `(x @ self.A.T @ self.B.T) * self.scale`.

# %%
class LoRA(LoRAParts):
    def forward(self, x):
        ### HINT out = self.base(x); if self.enabled: add (x @ self.A.T @ self.B.T) * self.scale
        ### HINT return out at the end
        ### BEGIN SOLUTION
        out = self.base(x)
        if self.enabled:
            out = out + (x @ self.A.T @ self.B.T) * self.scale
        return out
        ### END SOLUTION

# %%
lin = nn.Linear(6, 4); wrapped = LoRA(lin, r=2); x = torch.randn(3, 6)
check(lambda: torch.allclose(wrapped(x), lin(x)) and (wrapped.B.data.fill_(1.0) is not None) and not torch.allclose(wrapped(x), lin(x)),
      "with B = 0 it's exactly the original layer; once B changes, so does the output")

# %% [markdown]
# ## 3. Freeze everything, then add adapters
# Set `requires_grad = False` on every parameter of `model`, then replace each layer's `self_attn.q_proj` and
# `self_attn.v_proj` with `LoRA(...)` wrapping it (the layers are `model.model.layers`). New `LoRA` parameters are
# trainable by default.

# %%
### HINT for p in model.parameters(): p.requires_grad = False   (two lines)
### HINT for layer in model.model.layers: layer.self_attn.q_proj = LoRA(layer.self_attn.q_proj), and the same for v_proj
### BEGIN SOLUTION
for p in model.parameters():
    p.requires_grad = False
for layer in model.model.layers:
    layer.self_attn.q_proj = LoRA(layer.self_attn.q_proj)
    layer.self_attn.v_proj = LoRA(layer.self_attn.v_proj)
### END SOLUTION
trainable = [p for p in model.parameters() if p.requires_grad]
print("trainable:", sum(p.numel() for p in trainable))

# %%
check(lambda: sum(p.numel() for p in trainable) == 460_800, "exactly your count from section 1, and nothing else trains")

# %% [markdown]
# ## 4. Loss on the answer only
# Write `encode(text, answer)`: the token ids of the prompt-plus-reply, and labels that are `-100` for every prompt
# token (the loss skips them) and the token ids themselves for the reply. `p` (prompt ids) and `f` (full ids) are given.

# %%
def encode(text, answer):
    prompt = tok.apply_chat_template([{"role": "user", "content": ASK.format(text)}], tokenize=False, add_generation_prompt=True)
    p = tok(prompt).input_ids
    f = tok(prompt + json.dumps(answer) + "<|im_end|>").input_ids
    ### HINT labels = [-100] * len(p) + f[len(p):]
    ### HINT return f, labels
    ### BEGIN SOLUTION
    labels = [-100] * len(p) + f[len(p):]
    return f, labels
    ### END SOLUTION

# %%
pair = encode("The B train is delayed at 169 St.", {"station": "169 St", "line": "B"})
f, lab = pair if pair is not None else ([], [])
check(lambda: len(f) == len(lab) and lab[0] == -100 and lab[-1] == f[-1] and tok.decode([t for t in lab if t != -100]).startswith('{"station"'),
      "the same length as the ids, -100 over the prompt, and the reply's own ids where the loss counts")

# %% [markdown]
# ## 5. Train (given)
# 80 steps of 8 generated alerts, AdamW at 2e-3 on the adapters only. About half a minute on a CPU.

# %%
opt = torch.optim.AdamW(trainable, lr=2e-3) if trainable else None
rng = random.Random(0); model.train(); t = time.time()
for step in range(1, 81 if opt else 1):
    batch = [encode(*make(rng, train_st, TRAIN_T)) for _ in range(8)]
    if batch[0] is None:
        break
    L = max(len(ids) for ids, _ in batch)
    ids = torch.tensor([i + [tok.eos_token_id] * (L - len(i)) for i, _ in batch], device=device)
    labels = torch.tensor([l + [-100] * (L - len(l)) for _, l in batch], device=device)
    loss = model(input_ids=ids, labels=labels).loss
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 20 == 0:
        print(f"step {step}: loss {loss.item():.4f} ({time.time() - t:.0f} s)")
model.eval()

# %% [markdown]
# ## 6. Three tests
# **Predict first**, from the lesson: which of the three will be lowest? Then run.

# %%
results = {"seen stations, seen phrasings": score(train_st, TRAIN_T), "held-out stations": score(held_st, TRAIN_T), "held-out stations, new phrasings": score(held_st, NEW_T)}
for k, v in results.items():
    print(f"{k:34s} {v} / 30")
general_after = ask("Name three boroughs of New York City.")
print("general question, adapters on:", general_after)
check(lambda: results["seen stations, seen phrasings"] >= 27 and results["held-out stations"] >= 24,
      "nearly perfect on the task, and it carries over to stations it never saw; new phrasings are where it slips")

# %% [markdown]
# ## 7. Switch the adapter off
# The general answer probably came out as JSON: the fine-tune took over everything. Write `set_adapters(on)`: for
# every module in `model.modules()` that `isinstance(m, LoRA)`, set `m.enabled = on`. With them off, the model is
# exactly the original.

# %%
def set_adapters(on):
    ### HINT Loop over model.modules() and toggle m.enabled for all instances of LoRA.
    ### HINT for m in model.modules(): if isinstance(m, LoRA): m.enabled = on
    ### BEGIN SOLUTION
    for m in model.modules():
        if isinstance(m, LoRA):
            m.enabled = on
    ### END SOLUTION

set_adapters(False)
general_off = ask("Name three boroughs of New York City.")
print("adapters off:", general_off)
set_adapters(True)

# %%
check(lambda: general_off == general_before and general_after != general_before,
      "off: word for word the original answer; on: the extraction habit. One base model, adapters switched per request")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Hugging Face PEFT (LoRA for any model): https://huggingface.co/docs/peft
