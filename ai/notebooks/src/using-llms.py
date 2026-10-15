# %% [markdown]
# # Practice: using LLMs
# *AI from scratch, stage 6* · lesson: https://ihor.sh/ai/using-llms.html
#
# An open instruction-tuned model, SmolLM2-360M-Instruct, runs right here. Render a chat template, count tokens, see
# greedy vs sampled answers, then build a station-and-line extractor that a program can rely on: few-shot examples,
# parsing with try/except, validation and retries, measured over many calls. Ends with the cost of a day of requests.
# A few minutes on a CPU (first run downloads 0.7 GB). Replace each `...` under `# YOUR CODE HERE`, run the cell, then
# the check under it; `hint(n)` and `answer(n)` are there when you're stuck.

# %%
import json, time
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
torch.manual_seed(0)
name = "HuggingFaceTB/SmolLM2-360M-Instruct"
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(name)

def chat(messages, temperature=0.0, max_new_tokens=60):
    "Send a list of {role, content} turns, get the assistant's reply as text."
    ids = tok(tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True), return_tensors="pt").input_ids
    out = model.generate(ids, max_new_tokens=max_new_tokens, do_sample=temperature > 0, temperature=temperature or None, top_p=None, top_k=None)
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)

print(chat([{"role": "user", "content": "Name three boroughs of New York City."}]))

# %% [markdown]
# ## 1. What the model actually reads
# Set `prompt` to the text the chat template makes from `messages`, ready for the assistant to answer:
# `tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)`.

# %%
messages = [{"role": "system", "content": "You are a concise assistant."}, {"role": "user", "content": "Is the 7 train running?"}]
prompt = None
### HINT prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
### BEGIN SOLUTION
prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
### END SOLUTION
print(prompt)

# %%
check(lambda: prompt.startswith("<|im_start|>system") and prompt.rstrip().endswith("<|im_start|>assistant"),
      "special tokens mark each turn, and the text ends by opening the assistant's turn")

# %% [markdown]
# ## 2. Count the tokens
# Set `n_tokens` to the number of tokens in `prompt`: `tok(prompt).input_ids` is the list of ids.

# %%
n_tokens = None
### HINT len(tok(prompt).input_ids)
### BEGIN SOLUTION
n_tokens = len(tok(prompt).input_ids)
### END SOLUTION
print(n_tokens, "tokens, for a question of", len(messages[1]["content"].split()), "words")

# %%
check(lambda: n_tokens == len(tok(prompt).input_ids) and n_tokens > 15, "the template's special tokens and the system message cost tokens on every call, too")

# %% [markdown]
# ## 3. Greedy or sampled?
# **Predict:** asked the same thing twice at temperature 0, will the answers match? And twice at temperature 0.9?
# Set `same_greedy` and `same_sampled` to `True` or `False`, then run the cell after.

# %%
same_greedy = same_sampled = None
### HINT Temperature 0 always takes the most likely token (chapter 10); sampling draws at random.
### BEGIN SOLUTION
same_greedy, same_sampled = True, False
### END SOLUTION

# %%
q = [{"role": "user", "content": "Describe the New York subway in one sentence."}]
g1, g2 = chat(q), chat(q)
torch.manual_seed(1); s1 = chat(q, 0.9); torch.manual_seed(2); s2 = chat(q, 0.9)
print("greedy: ", g1, "\n        ", g2, "\nsampled:", s1, "\n        ", s2)
check(lambda: same_greedy == (g1 == g2) and same_sampled == (s1 == s2), "greedy repeats itself exactly; sampling differs from draw to draw")

# %% [markdown]
# ## 4. Few-shot: examples as earlier turns
# The task: extract the station and the line from a sentence, as JSON. Write `extraction_messages(text, shots)`: for
# each `(example_text, example_answer)` in `shots`, add a user turn `ASK.format(example_text)` and an assistant turn
# `json.dumps(example_answer)`; then add the real user turn `ASK.format(text)`. Return the list.

# %%
ASK = 'Extract the station and the line from: "{}" Answer only with JSON like {{"station": "...", "line": "..."}}'
SHOTS = [("The A train is running late at 125 St.", {"station": "125 St", "line": "A"}),
         ("Delays on the L at Bedford Av.", {"station": "Bedford Av", "line": "L"})]

def extraction_messages(text, shots):
    msgs = []
    ### HINT for t, a in shots: msgs.append({"role": "user", "content": ASK.format(t)}), then the assistant turn with json.dumps(a)
    ### HINT After the loop: msgs.append({"role": "user", "content": ASK.format(text)}); return msgs
    ### BEGIN SOLUTION
    for t, a in shots:
        msgs.append({"role": "user", "content": ASK.format(t)})
        msgs.append({"role": "assistant", "content": json.dumps(a)})
    msgs.append({"role": "user", "content": ASK.format(text)})
    return msgs
    ### END SOLUTION

# %%
m = extraction_messages("The G is stuck at Nassau Av.", SHOTS)
check(lambda: [x["role"] for x in m] == ["user", "assistant", "user", "assistant", "user"] and json.loads(m[1]["content"])["line"] == "A"
      and "Nassau Av" in m[-1]["content"] and len(extraction_messages("x", [])) == 1,
      "user/assistant pairs for each example, the real question last; with no shots, just the question")

# %% [markdown]
# ## 5. Parse and check (try/except)
# Write `parse(text)`: return the dict if `text` is valid JSON with both keys `"station"` and `"line"`, otherwise
# `None`. Wrap `json.loads` in `try:` / `except json.JSONDecodeError:` as in the lesson's box.

# %%
def parse(text):
    ### HINT try: d = json.loads(text)   then   except json.JSONDecodeError: return None
    ### HINT Then: if isinstance(d, dict) and "station" in d and "line" in d: return d, else return None
    ### BEGIN SOLUTION
    try:
        d = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(d, dict) and "station" in d and "line" in d:
        return d
    return None
    ### END SOLUTION

# %%
check(lambda: parse('{"station": "Court Sq", "line": "7"}') == {"station": "Court Sq", "line": "7"} and parse("The station is Court Sq.") is None
      and parse('{"station": "Court Sq"}') is None and parse('{"station": "Court Sq", "line": "7"') is None,
      "the dict when it's complete JSON with both fields; None for prose, missing fields or cut-off JSON")

# %% [markdown]
# ## 6. Retry until it parses
# Write `extract(text, shots, tries=3)`: up to `tries` times, sample an answer with `chat(extraction_messages(text,
# shots), temperature=0.7)` and `parse` it; return the first dict that parses. If none does, return `None`.

# %%
def extract(text, shots, tries=3):
    ### HINT for attempt in range(tries): d = parse(chat(extraction_messages(text, shots), temperature=0.7))
    ### HINT if d is not None: return d   (and after the loop: return None)
    ### BEGIN SOLUTION
    for attempt in range(tries):
        d = parse(chat(extraction_messages(text, shots), temperature=0.7))
        if d is not None:
            return d
    return None
    ### END SOLUTION

# %%
torch.manual_seed(0)
check(lambda: (extract("The 7 train is delayed at Court Sq.", SHOTS) or {}).get("station", "").strip(". ") == "Court Sq",
      "a parsed dict with the right station")

# %% [markdown]
# ## 7. Measure: zero-shot vs few-shot, one try vs three
# Ten sentences, each extraction scored right only if both fields match exactly. Given; it uses your functions.
# **Predict first** which setting will win, then run it (about a minute).

# %%
TESTS = [("The 7 train is delayed at Court Sq.", "Court Sq", "7"), ("Expect delays on the Q at DeKalb Av.", "DeKalb Av", "Q"),
         ("The G is stuck at Nassau Av.", "Nassau Av", "G"), ("No F trains at Jay St-MetroTech.", "Jay St-MetroTech", "F"),
         ("The J is skipping Marcy Av.", "Marcy Av", "J")] * 2
def score(shots, tries):
    right = 0
    for k, (text, station, line) in enumerate(TESTS):
        torch.manual_seed(k)
        d = extract(text, shots, tries) or {}
        right += str(d.get("station", "")).strip(". ") == station and str(d.get("line", "")).strip() == line
    return right
t = time.time()
results = {(label, tries): score(shots, tries) for label, shots in [("zero-shot", []), ("few-shot", SHOTS)] for tries in [1, 3]}
for k, v in results.items():
    print(f"{k[0]:9s}, {k[1]} {'try ' if k[1] == 1 else 'tries'}: {v}/10 right")
print(f"({time.time() - t:.0f} s)")

# %%
check(lambda: results[("few-shot", 3)] >= 8 and results[("few-shot", 3)] > results[("zero-shot", 1)],
      "two examples lift it from about 3/10 to 9/10; retries barely matter, since they fix answers that don't parse, not wrong values")

# %% [markdown]
# ## 8. What would a day cost on a hosted API?
# Write `day_cost(n, tokens_in, tokens_out, price_in, price_out)` in dollars, with prices per million tokens. Then
# `few_shot_day`: 5,000 requests a day, each the few-shot prompt (count its tokens below) plus 20 output tokens, at
# \$3 and \$15 per million.

# %%
few_shot_tokens = len(tok(tok.apply_chat_template(extraction_messages("The 7 train is delayed at Court Sq.", SHOTS), tokenize=False, add_generation_prompt=True)).input_ids) if extraction_messages("x", []) else 0
print("tokens in the few-shot prompt:", few_shot_tokens)
def day_cost(n, tokens_in, tokens_out, price_in, price_out):
    ### HINT n × (tokens_in × price_in + tokens_out × price_out) / 1e6
    ### BEGIN SOLUTION
    return n * (tokens_in * price_in + tokens_out * price_out) / 1e6
    ### END SOLUTION
few_shot_day = None
### HINT few_shot_day = day_cost(5000, few_shot_tokens, 20, 3, 15)
### BEGIN SOLUTION
few_shot_day = day_cost(5000, few_shot_tokens, 20, 3, 15)
### END SOLUTION
print("a day:", few_shot_day, "dollars")

# %%
check(lambda: abs(day_cost(1000, 400, 30, 3, 15) - 1.65) < 1e-9 and abs(few_shot_day - 5000 * (few_shot_tokens * 3 + 20 * 15) / 1e6) < 1e-9,
      "the lesson's $1.65 example checks out; the examples repeat on every call, so they dominate the bill (prompt caching exists for this)")

# %% [markdown]
# ## Next
# Back to the path: https://ihor.sh/ai/ · Anthropic's prompt engineering guide: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
