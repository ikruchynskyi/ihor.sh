# %% [markdown]
# # Practice: an agent loop, guardrails, a real MCP tool and evals
# *AI from scratch, chapter 8* · lesson: https://ihor.sh/ai/08-agents.html
#
# Build the loop every agent runs, validate what the model asks for, call a real tool over the **Model Context
# Protocol** (this site's own MCP server), and measure a tool router with an eval set, error bars and a paired test.
# Fill in each `...` under `# YOUR CODE HERE`, then run the check under it (✓ = right, ✗ = not yet).
# On Kaggle, turn on *Internet* in the notebook settings.

# %%
import json, re, urllib.request
import numpy as np
from scipy import stats

# %% [markdown]
# ## 1. The loop
# The "model" here is a stand-in with rules, so the loop itself is what you see. Each round, `run_agent` asks the
# model, which either answers (`{"answer": ...}`) or asks for a tool (`{"tool": name, "args": {...}}`). The middle
# branch is written for you: a tool that doesn't exist becomes an error message with role "tool", so the model can
# recover. Two branches are yours:
# 1. When `"answer" in out`: append `{"role": "assistant", "content": out["answer"]}` to `messages` and `break`.
# 2. Otherwise, after the tool has run: append the call as an assistant message (`call` text is made for you), then
#    `{"role": "tool", "content": result}`.

# %%
tools = {
    "weather": lambda: {"tempC": 18, "sky": "cloudy"},
    "subway_arrivals": lambda station: {"station": station, "next": [{"line": "L", "min": 3}]},
}

def model(messages):
    last = messages[-1]
    if last["role"] == "tool":
        return {"answer": "Here's what I found: " + json.dumps(last["content"])}
    if re.search("train|subway", last["content"], re.I):
        return {"tool": "subway_arrivals", "args": {"station": "Union Sq"}}
    if re.search("weather|rain", last["content"], re.I):
        return {"tool": "weather", "args": {}}
    if re.search("taxi", last["content"], re.I):
        return {"tool": "taxi_fare", "args": {}}            # a tool that doesn't exist
    return {"answer": "I can't help with that."}

def run_agent(question, max_rounds=4):
    """Execute the ReAct-style agent loop between model and tools.
    
    Args:
        question: User query string.
        max_rounds: Maximum interaction turns before terminating.
    Returns:
        list: History of message dicts [{"role": "...", "content": ...}].
    """
    messages = [{"role": "user", "content": question}]
    for _ in range(max_rounds):
        out = model(messages)
        if "answer" in out:
            ### HINT messages.append({...}) adds one message; break leaves the for loop.
            ### HINT messages.append({"role": "assistant", "content": out["answer"]}), then break on the next line
            ### BEGIN SOLUTION
            messages.append({"role": "assistant", "content": out["answer"]})
            break
            ### END SOLUTION
        if out["tool"] not in tools:
            messages.append({"role": "tool", "content": {"error": f"no tool named {out['tool']}"}})
            continue                                            # next round: the model sees the error
        result = tools[out["tool"]](**out["args"])             # ** passes the dict as named arguments
        call = f"call {out['tool']}({json.dumps(out['args'])})"
        ### HINT Two appends, like the error branch above: first role "assistant" with call, then role "tool" with result.
        ### BEGIN SOLUTION
        messages.append({"role": "assistant", "content": call})
        messages.append({"role": "tool", "content": result})
        ### END SOLUTION
    return messages

for m in run_agent("Next train at Union Sq?"):
    print(f"{m['role']:9}", m["content"])

# %%
check(lambda: [m["role"] for m in run_agent("Will it rain?")] == ["user", "assistant", "tool", "assistant"], 
      "Interaction sequence should be user question -> assistant tool call -> tool result -> assistant answer.")
check(lambda: "no tool" in json.dumps(run_agent("How much is a taxi?")[1]["content"]), 
      "An unknown tool request should be caught gracefully as an error message without crashing.")

# %% [markdown]
# ## 2. Guardrails: validate before you run
# Models invent arguments. Write `validate(args, schema)` for a JSON-schema-like dict (`{"required": [...],
# "properties": {name: {"type": "string" | "number"}}}`): return a list of problems (missing required fields, wrong
# types, unexpected fields). An empty list means it's safe to run.

# %%
schema = {"required": ["station"], "properties": {"station": {"type": "string"}, "limit": {"type": "number"}}}

def validate(args, schema):
    """Validate tool argument dictionary against a JSON schema specification.
    
    Args:
        args: Dictionary of arguments supplied by the model.
        schema: Dictionary specifying required keys and property types.
    Returns:
        list of str: Discovered validation errors, or empty list if valid.
    """
    ### HINT Check for any required fields missing from args.
    ### HINT Check for unexpected fields not declared in schema['properties'].
    ### HINT Verify types of present arguments (str for 'string', (int, float) for 'number', excluding bool).
    ### BEGIN SOLUTION
    problems = [f"missing {k}" for k in schema["required"] if k not in args]
    types = {"string": str, "number": (int, float)}
    for k, v in args.items():
        if k not in schema["properties"]:
            problems.append(f"unexpected {k}")
        elif not isinstance(v, types[schema["properties"][k]["type"]]) or isinstance(v, bool):
            problems.append(f"{k} should be a {schema['properties'][k]['type']}")
    return problems
    ### END SOLUTION

for a in [{"station": "Union Sq"}, {"station": 5}, {"limit": 3}, {"station": "Union Sq", "drop_table": True}]:
    print(a, "→", validate(a, schema))

# %%
check(lambda: validate({"station": "Union Sq", "limit": 2}, schema) == [], 
      "Valid arguments matching schema should pass with 0 errors.")
check(lambda: len(validate({"station": 5}, schema)) == 1 and len(validate({"limit": 3}, schema)) == 1, 
      "Wrong parameter type and missing required parameter must both produce validation errors.")
check(lambda: any("unexpected" in p for p in validate({"station": "x", "drop_table": True}, schema)), 
      "Hallucinated or unapproved argument keys must be flagged as unexpected.")

# %% [markdown]
# ## 3. A real tool over MCP
# The **Model Context Protocol** is how agents discover and call tools: JSON-RPC over HTTP. This site runs an MCP
# server at https://ihor.sh/mcp, and its `site_search` tool is public. `mcp(method, params)` builds the request for
# you: the JSON-RPC message `{"jsonrpc": "2.0", "id": 1, "method": method, "params": params}` as bytes, POSTed with
# a User-Agent header (the site's firewall blocks Python's default one). Finish it: send `req` with
# `urllib.request.urlopen(req, timeout=30)`, parse the reply with `json.load` (as this path's data downloads do), and
# return its `"result"`. The cell then lists the tools and searches the site for "attention".

# %%
UA = "ai-from-scratch-notebook/1.0 (+https://ihor.sh/ai/)"
def mcp(method, params=None):
    """Invoke a remote MCP tool over JSON-RPC via HTTP POST.
    
    Args:
        method: MCP JSON-RPC method name (e.g. 'tools/list' or 'tools/call').
        params: Optional dictionary of method parameters.
    Returns:
        dict: Parsed JSON result payload.
    """
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).encode()   # text → bytes
    req = urllib.request.Request("https://ihor.sh/mcp", data=body, method="POST",
                                 headers={"content-type": "application/json", "accept": "application/json, text/event-stream", "user-agent": UA})
    ### HINT json.load(urllib.request.urlopen(req, timeout=30)) is the whole reply, a dictionary.
    ### HINT return json.load(urllib.request.urlopen(req, timeout=30))["result"]
    ### BEGIN SOLUTION
    return json.load(urllib.request.urlopen(req, timeout=30))["result"]
    ### END SOLUTION

tool_names = hit = None
try:
    tool_names = [t["name"] for t in mcp("tools/list")["tools"]]
    found = mcp("tools/call", {"name": "site_search", "arguments": {"query": "attention transformer"}})
    hit = found["content"][0]["text"]
    print(len(tool_names), "tools:", tool_names[:8], "…"); print(hit[:400])
except Exception as e:
    print("MCP call failed:", e)

# %%
check(lambda: "site_search" in tool_names, 
      "The MCP server at https://ihor.sh/mcp must list 'site_search' as an available tool.")
check(lambda: "07-attention" in hit, 
      "Searching for 'attention transformer' through MCP site_search should retrieve the attention chapter.")

# %% [markdown]
# ## 4. An eval with error bars
# A router picks a tool for a question. `router_v1` uses a few keywords; `router_v2` more. On 40 labeled questions,
# set `acc1`, `acc2` and the 95% interval `ci2` for v2's accuracy (normal approximation, p ± 1.96·√(p(1−p)/n)).
# Then compare them fairly on the same questions: count `b` (v1 right, v2 wrong) and `c` (v1 wrong, v2 right) and
# set `p_value = stats.binomtest(c, b + c, 0.5).pvalue` (McNemar, probability 4).

# %%
cases = [("next train at Union Sq", "subway"), ("is the L running", "subway"), ("when does the 4 come", "subway"),
         ("will it rain tonight", "weather"), ("do I need an umbrella", "weather"), ("how cold is it", "weather"),
         ("bus to Brooklyn", "bus"), ("when is the M15", "bus"), ("next bus on 14 St", "bus"),
         ("ferry to Rockaway", "ferry"), ("East River ferry times", "ferry")] * 3 + \
        [("subway delays now", "subway"), ("temperature tomorrow", "weather"), ("M101 arrival", "bus"),
         ("St. George ferry schedule", "ferry"), ("rain on Saturday", "weather"), ("is the A train late", "subway"), ("Q train arrivals", "subway")]
def router_v1(q):
    return "subway" if re.search("train|subway", q, re.I) else "weather" if re.search("rain|weather", q, re.I) else "bus"
def router_v2(q):
    if re.search(r"ferry", q, re.I): return "ferry"
    if re.search(r"\bbus\b|\bM\d+", q, re.I): return "bus"
    if re.search(r"rain|umbrella|cold|weather|temperature", q, re.I): return "weather"
    return "subway"
acc1 = acc2 = ci2 = p_value = None
### HINT Compute boolean correctness arrays r1 and r2 for router_v1 and router_v2.
### HINT Compute accuracies acc1 and acc2.
### HINT Compute 95% confidence interval for acc2: acc2 ± 1.96 * sqrt(acc2*(1-acc2)/n).
### HINT Count disagreement counts b and c, and compute McNemar exact binomtest p-value.
### BEGIN SOLUTION
r1 = np.array([router_v1(q) == t for q, t in cases]); r2 = np.array([router_v2(q) == t for q, t in cases])
acc1, acc2 = r1.mean(), r2.mean()
se = np.sqrt(acc2 * (1 - acc2) / len(cases)); ci2 = (acc2 - 1.96 * se, min(1.0, acc2 + 1.96 * se))
b, c = int((r1 & ~r2).sum()), int((~r1 & r2).sum())
p_value = stats.binomtest(c, b + c, 0.5).pvalue
### END SOLUTION
print(len(cases), "cases · v1", acc1, " v2", acc2, ci2, " McNemar p =", p_value)

# %%
check(lambda: acc2 > acc1 and ci2[0] < acc2 <= ci2[1], 
      "router_v2 should outperform router_v1 with accuracy inside its 95% confidence interval.")
check(lambda: p_value < 0.05, 
      "The paired McNemar test should show statistically significant improvement (p < 0.05).")

# %% [markdown]
# Notice the duplicated cases: 33 of the 40 questions are 11 questions repeated 3 times. An eval set with copies
# makes the interval look narrower than it really is. Real eval sets need many *different* questions, written
# before you tune the system (chapter 11's "touch the test set once").
#
# ## Next
# Back to the path: https://ihor.sh/ai/ · stage 6 (LLM engineering) builds on this with real language models.
