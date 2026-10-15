"""Pedagogy linter for the AI path (the standard is PEDAGOGY.md; stdlib only).

It walks the path in order (ai/index.html) and keeps a ledger of what a learner has been taught and shown so far, then
checks every notebook exercise against it: an exercise may only ask for what the ledger already holds.

    python3 ai/notebooks/lint.py              # lint every notebook and lesson page, exit 1 on errors
    python3 ai/notebooks/lint.py s1 c2        # only lessons whose name contains one of these
    python3 ai/notebooks/lint.py --ledger s1  # print what a learner knows when that lesson's notebook starts
    python3 ai/notebooks/lint.py --depth      # lessons still short of the depth standard (a to-do list, not errors)

The ledger has two kinds of entries:
  taught   syntax (py:*) and math notation (math:*) a lesson explains, declared in course.json "teaches" and confirmed
           against the lesson's own code and text (a declaration nothing on the page backs up is an error)
  seen     library calls and attributes (np.mean, .backward) that appeared in code the learner has run: lesson code
           boxes, earlier notebooks, and this notebook's cells above the exercise
"""
import ast, html, json, re, sys, textwrap
from pathlib import Path

AI = Path(__file__).resolve().parent.parent
SRC = AI / "notebooks" / "src"

# Syntax a solution may use without anyone teaching it: a name, a number or string, `=`.
BASE = {"py:assign"}

SYNTAX = {  # AST node → ledger id
    ast.BinOp: "py:arith", ast.UnaryOp: "py:arith", ast.Call: "py:call", ast.Import: "py:import", ast.ImportFrom: "py:import",
    ast.FunctionDef: "py:def", ast.Return: "py:def", ast.For: "py:for", ast.While: "py:while", ast.If: "py:if", ast.IfExp: "py:if",
    ast.ListComp: "py:comprehension", ast.GeneratorExp: "py:comprehension", ast.DictComp: "py:comprehension",
    ast.SetComp: "py:comprehension", ast.Lambda: "py:lambda", ast.With: "py:with", ast.ClassDef: "py:class", ast.Try: "py:try",
    ast.AugAssign: "py:augassign", ast.JoinedStr: "py:fstring", ast.Compare: "py:compare", ast.BoolOp: "py:boolop",
    ast.List: "py:list", ast.Tuple: "py:tuple", ast.Dict: "py:dict", ast.Subscript: "py:index", ast.Slice: "py:slice",
    ast.keyword: "py:keyword-arg", ast.Attribute: "py:attribute", ast.Starred: "py:star", ast.Yield: "py:generator",
}

NOTATION = {  # ledger id → (pattern inside math: $...$ or \(...\)), pattern for Unicode symbols in plain text)
    "math:sum": (r"\\sum", "Σ"), "math:product": (r"\\prod", "∏"), "math:log": (r"\\log|\\ln\b", None),
    "math:exp": (r"\\exp|e\^", None),
    "math:greek": (r"\\(alpha|beta|gamma|delta|theta|sigma|mu|lambda|eta|tau|epsilon|varepsilon|pi|rho|phi)\b", "[αβγδθσμλητεπρφ]"),
    "math:subscript": (r"_", None), "math:derivative": (r"\\frac\{d|'\(|\\prime|\\mathrm\{d\}", "f′"),
    "math:partial": (r"\\partial", "∂"), "math:gradient": (r"\\nabla", "∇"), "math:integral": (r"\\int", "∫"),
    "math:norm": (r"\\lVert|\\\|", "‖"), "math:transpose": (r"\^\\top|\^\{?T\b", "ᵀ"), "math:matrix": (r"\\begin\{[bp]matrix\}", None),
    "math:dot": (r"\\cdot", None), "math:probability": (r"\bP\(|\\mid", None), "math:expectation": (r"\\mathbb\{E\}|\\operatorname\{E\}", "𝔼"),
    "math:hat": (r"\\hat", None), "math:argmax": (r"\\arg\s*\\?(max|min)|argmax|argmin", None), "math:inverse": (r"\^\{-1\}", "⁻¹"),
    "math:set": (r"\\in\b|\\mathbb\{R\}", "∈|ℝ"), "math:limit": (r"\\lim", None), "math:approx": (r"\\approx", "≈"),
}

CEILING = {0: 3, 1: 6, 2: 8}   # most lines a solution may have, by stage (later stages: 10)
FIRST = 2                      # the first exercise in a notebook is the smallest step: at most this many lines
NEW_PER_EXERCISE = 2           # calls an exercise may introduce (they must be named in its text)
BUILTINS = {"print", "range", "len", "sum", "min", "max", "abs", "round", "list", "tuple", "int", "float", "str", "zip",
            "sorted", "enumerate", "dict", "set", "bool", "isinstance", "any", "all", "map", "type"}


def path():
    "[(lesson stem, stage number)] in path order, live lessons only."
    out, stage = [], 0
    for m in re.finditer(r'<h2 class="stage" id="([^"]+)"|<li( class="[^"]*soon[^"]*")?[^>]*>(?:<span[^>]*>[^<]*</span>)?\s*<a href="\./([^"#]+)\.html"',
                         (AI / "index.html").read_text()):
        if m.group(1):
            stage = int(m.group(1).split("-")[1]) if m.group(1).startswith("stage-") else 5
        elif not m.group(2):
            out.append((m.group(3), stage))
    return out


def page(stem):
    "A lesson page's code boxes and its prose (tags stripped, LaTeX kept)."
    f = AI / f"{stem}.html"
    if not f.exists():
        return [], ""
    s = f.read_text()
    code = [html.unescape(c) for c in re.findall(r"<textarea[^>]*>(.*?)</textarea>", s, flags=re.S)]
    prose = re.sub(r"<script.*?</script>|<style.*?</style>|<textarea.*?</textarea>", "", s, flags=re.S)
    return code, html.unescape(re.sub(r"<[^>]+>", " ", prose))


def parse(code):
    "Parse code, even a fragment from inside a function or loop (wrapped in a `def _` / `for _` that features() skips)."
    code = textwrap.dedent(code)
    for src in (code, "def _():\n" + textwrap.indent(code, "    "), "for _ in _:\n" + textwrap.indent(code, "    ")):
        try:
            return ast.parse(src)
        except SyntaxError:
            pass
    return None


def wrapper(tree):
    first = tree.body[0] if len(tree.body) == 1 else None
    if isinstance(first, ast.FunctionDef) and first.name == "_" or isinstance(first, ast.For) and getattr(first.target, "id", "") == "_":
        return first


def modules(tree):
    return {a.asname or a.name.split(".")[0] for n in ast.walk(tree) if isinstance(n, (ast.Import, ast.ImportFrom)) for a in n.names}


def dotted(node, mods):
    "np.linalg.norm → 'np.linalg.norm'; x.mean → '.mean'."
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name) and node.id in mods:
        return ".".join([node.id] + parts[::-1])
    return "." + parts[0]


def features(code, mods=frozenset()):
    "(syntax ids, called/attribute names, names it defines) used by a piece of code."
    tree = parse(code)
    if tree is None:
        return set(), set(), set()
    mods = set(mods) | modules(tree) | {"np", "pd", "plt", "torch", "nn", "F", "stats", "math", "sns"}
    syn, names, defined = set(), set(), set()
    skip = wrapper(tree)
    for n in ast.walk(tree):
        if n is skip or skip and n in (skip.target if isinstance(skip, ast.For) else None, getattr(skip, "iter", None)):
            continue
        for t, f in SYNTAX.items():
            if isinstance(n, t):
                syn.add(f)
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.MatMult):
            syn.add("py:matmul")
        if isinstance(n, ast.Assign) and any(isinstance(t, ast.Tuple) for t in n.targets):
            syn.add("py:unpack")
        if isinstance(n, ast.Attribute) and not isinstance(n.ctx, ast.Store):
            names.add(dotted(n, mods))
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
            names.add(n.func.id)
        if isinstance(n, (ast.FunctionDef, ast.ClassDef)):
            defined.add(n.name)
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            defined.add(n.id)
        if isinstance(n, ast.Attribute) and isinstance(n.ctx, ast.Store):
            defined.add("." + n.attr)                # self.w = ...: the learner's own attribute
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            defined |= {a.asname or a.name.split(".")[0] for a in n.names}
    # Tuples and lists that only hold several targets/values of one `a, b = 1, 2` are part of unpacking, not syntax.
    if "py:unpack" in syn and not any(isinstance(n, ast.List) for n in ast.walk(tree)):
        syn.discard("py:list")
    return syn, names, defined


def notation(text):
    "Math notation used in Markdown or lesson prose: LaTeX inside math spans, symbols outside code spans."
    math = " ".join(re.findall(r"\$\$.*?\$\$|\$.*?\$|\\\(.*?\\\)|\\\[.*?\\\]", text, flags=re.S))
    plain = re.sub(r"`[^`]*`", "", text)
    return {k for k, (tex, sym) in NOTATION.items() if re.search(tex, math) or sym and re.search(sym, plain)}


def notebook(stem):
    "The notebook's cells as (kind, text) plus its exercises."
    f = SRC / f"{stem}.py"
    if not f.exists():
        return None
    cells = []
    for chunk in re.split(r"^# %%", f.read_text(), flags=re.M)[1:]:
        head, _, body = chunk.partition("\n")
        if "[markdown]" in head:
            cells.append(("md", "\n".join(re.sub(r"^# ?", "", l) for l in body.splitlines())))
        else:
            cells.append(("code", body))
    return cells


SOL = re.compile(r"((?:^[ \t]*### HINT[^\n]*\n)*)^[ \t]*### BEGIN SOLUTION\n(.*?)^[ \t]*### END SOLUTION", re.M | re.S)


def lint(only=(), show_ledger=None):
    course = json.loads((AI / "course.json").read_text())
    taught, seen, mods = set(BASE), set(BUILTINS), set()
    errors = warnings = 0

    def report(where, msg, level="error"):
        nonlocal errors, warnings
        if level == "error":
            errors += 1
        else:
            warnings += 1
        if not only or any(o in where for o in only):
            print(f"{'✗' if level == 'error' else '·'} {where}: {msg}")

    for stem, stage in path():
        teaches = set(course.get(f"{stem}.html", {}).get("teaches", []))
        code, prose = page(stem)
        cells = notebook(stem) or []
        visible = [c for k, c in cells if k == "code"]
        md = "\n".join(c for k, c in cells if k == "md")
        # A declaration must be backed by the lesson itself: the syntax in its code, the notation in its text.
        own_syn = set().union(*(features(SOL.sub("", c))[0] for c in code + visible)) if code + visible else set()
        own_math = notation(prose + md)
        for t in sorted(teaches):
            if (t.startswith("py:") and t not in own_syn) or (t.startswith("math:") and t not in own_math):
                report(stem, f'"teaches" lists {t} but nothing in the lesson or its notebook uses it')
        taught |= teaches
        for t in sorted(notation(prose) - taught):
            report(stem + ".html", f"uses notation {t} before any lesson teaches it", "warning")
        for c in code:
            tree = parse(c)
            mods |= modules(tree) if tree else set()
            _, names, defined = features(c, mods)
            seen |= names | defined
        if show_ledger and show_ledger in stem:
            print(f"Taught before {stem}'s notebook:", " ".join(sorted(taught)))
            print("Seen:", " ".join(sorted(seen)))
            return 0
        if not cells:
            continue
        for t in sorted(notation(md) - taught):
            report(f"{stem} notebook", f"uses notation {t} that no lesson so far teaches")
        n, prompt = 0, ""
        for i, (kind, text) in enumerate(cells):
            if kind == "md":
                prompt = text
                continue
            if re.search(r"^def check\(", text, re.M):
                report(f"{stem} notebook", "defines its own check(): build.py adds the standard helpers")
            for m in SOL.finditer(text):
                n += 1
                where = f"{stem} exercise {n}"
                above = features(SOL.sub("", text[:m.start()]), mods)       # given code above it in the same cell
                seen |= above[1] | above[2]
                hints, sol = re.findall(r"### HINT (.*)", m.group(1)), m.group(2)
                lines = [l for l in sol.splitlines() if l.strip() and not l.strip().startswith("#")]
                syn, names, defined = features(sol, mods)
                cell_text = SOL.sub("", text)
                words = prompt + "\n" + cell_text + "\n" + "\n".join(hints)
                for t in sorted(syn - taught):
                    report(where, f"needs {t}, which no lesson so far teaches")
                new = {x for x in names - seen - defined - {"." + d for d in defined} if not x.startswith("_")}
                new = sorted(x for x in new if not any(y.startswith(x + ".") for y in new))   # torch.autograd.functional.jacobian counts once
                unnamed = [x for x in new if not re.search(r"\b" + re.escape(x.split(".")[-1]) + r"\b", words)]
                if unnamed:
                    report(where, f"uses {', '.join(unnamed)} without showing or naming it first")
                if len(new) - len(unnamed) > NEW_PER_EXERCISE:
                    report(where, f"introduces {len(new) - len(unnamed)} new calls at once ({', '.join(new)}): one step at a time")
                limit = FIRST if n == 1 else CEILING.get(stage, 10)
                if len(lines) > limit:
                    report(where, f"solution is {len(lines)} lines; {'a first exercise' if n == 1 else f'stage {stage}'} allows {limit}: split it or give more of it")
                if not hints:
                    report(where, "has no ### HINT: every exercise needs a way forward for a stuck learner")
                after = [c for k, c in cells[i + 1:] if k == "code"]
                after = after[:next((j for j, c in enumerate(after) if SOL.search(c)), len(after))]
                if not re.search(r"\bcheck\(", SOL.sub("", text) + "\n".join(after)):
                    report(where, "has no check() after it")
                seen |= names | defined
            # Given code runs in the blank notebook too, where answers are None: formatting one ({x:.3f}) crashes it.
            answers = set().union(*(features(m.group(2), mods)[2] for k, c in cells if k == "code" for m in SOL.finditer(c)))
            tree = parse(SOL.sub("", text))
            for f in (n for n in ast.walk(tree) if isinstance(n, ast.FormattedValue) and n.format_spec) if tree else []:
                used = {x.id for x in ast.walk(f.value) if isinstance(x, ast.Name)} & answers
                if used:
                    report(f"{stem} notebook", f"given code formats the answer {', '.join(sorted(used))} with a format spec: a blank answer (None) crashes it")
            prompt = prompt if not SOL.search(text) else ""
            for c in [SOL.sub("", text)]:
                tree = parse(c)
                mods |= modules(tree) if tree else set()
                _, names, defined = features(c, mods)
                seen |= names | defined
    print(f"{errors} errors, {warnings} warnings")
    return errors


def depth(verbose=False):
    "The depth standard (PEDAGOGY.md, Depth): each lesson has a gist, a Why box, a Where-it-breaks box, a why question."
    course, short = json.loads((AI / "course.json").read_text()), []
    for stem, _ in path():
        s = (AI / f"{stem}.html").read_text() if (AI / f"{stem}.html").exists() else ""
        boxes = [re.sub(r"<[^>]+>", "", t).strip().lower() for t in re.findall(r'<details class="deeper">\s*<summary>(.*?)</summary>', s, re.S)]
        missing = [name for name, ok in [
            ("gist", 'class="gist"' in s), ("why box", any(b.startswith("why") for b in boxes)),
            ("where-it-breaks box", any("break" in b for b in boxes)),
            ("why question", any(q["q"].startswith("Why") for q in course.get(f"{stem}.html", {}).get("check", [])))] if not ok]
        if missing:
            short.append((stem, missing))
    if verbose:
        for stem, missing in short:
            print(f"· {stem}: no {', no '.join(missing)}")
    print(f"depth: {len(path()) - len(short)} of {len(path())} lessons meet the depth standard" + ("" if verbose else " (--depth lists the rest)"))


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--ledger" in args:
        sys.exit(lint(show_ledger=args[args.index("--ledger") + 1]))
    if "--depth" in args:
        sys.exit(depth(verbose=True))
    bad = lint([a for a in args if not a.startswith("-")])
    depth()
    sys.exit(1 if bad else 0)
