"""Builds the practice notebooks: ai/notebooks/src/NAME.py -> ai/notebooks/NAME.ipynb (stdlib only).

Sources are Python files split into cells by "# %%" lines; "# %% [markdown]" cells are Markdown written as
"# " comment lines. Exercise answers sit between "### BEGIN SOLUTION" and "### END SOLUTION": the published
notebook replaces them with "# YOUR CODE HERE" and "..." (so a fresh notebook still runs top to bottom, which Kaggle
needs, and its checks print ✗ instead of crashing); --solutions keeps them (used to test). Every build also writes
index.json (lesson → title, Kaggle link) for the lesson pages. "### HINT ..." lines just above an exercise become its
hints: build numbers the exercises and adds a helpers cell with check(n, test, msg), hint(n) and answer(n) (the
answer stored base64-encoded, out of sight until asked for), so nobody is ever stuck with no move (PEDAGOGY.md); --kaggle publishes each notebook to Kaggle as a public
notebook with the kaggle CLI (needs KAGGLE_API_TOKEN).

    python ai/notebooks/build.py                 # build every notebook
    python ai/notebooks/build.py --solutions DIR  # write runnable copies with answers into DIR (for testing)
    python ai/notebooks/build.py --kaggle [names]  # build, then publish to Kaggle (all, or those whose name matches)
A source containing "# kaggle: gpu" is published with Kaggle's GPU turned on.
"""
import base64, json, os, re, subprocess, sys, tempfile, textwrap
from pathlib import Path

HERE = Path(__file__).parent
KAGGLE_USER = "irishdash"
COLAB = "https://colab.research.google.com/github/ikruchynskyi/ihor.sh/blob/main/ai/notebooks/"


def title_of(src: str):
    "The notebook's Kaggle title, from its first heading (Kaggle allows 5-50 characters)."
    h = re.search(r"^# # (?:Practice: )?(.+)$", src, flags=re.M).group(1).strip()
    return f"AI from scratch: {h}"[:50]


def slug(title: str):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


EXERCISE = re.compile(r"((?:^[ \t]*### HINT[^\n]*\n)*)^([ \t]*)### BEGIN SOLUTION\n(.*?)^[ \t]*### END SOLUTION\n?|\bcheck\(", re.M | re.S)

HELPERS = """# Helpers: run this cell first. check() marks an answer ✓ or ✗; stuck? hint(n) gives the next hint for
# exercise n, answer(n) shows a solution.
import base64 as _b64
_HINTS = %s
_ANSWERS = %s
_given = {}

def check(n, test, msg=""):
    try:
        ok = bool(test())
    except NameError as e:
        return print("✗ %%s: run the exercise cell above first." %% e)
    except Exception as e:
        if "NoneType" in str(e) or "ellipsis" in str(e):
            return print("✗ Not answered yet: replace the ... in exercise %%d and run that cell. Stuck? hint(%%d)" %% (n, n))
        ok, msg = False, msg + " (the check stopped with %%s: %%s)" %% (type(e).__name__, e)
    print("✓ Right." if ok else "✗ Not yet. " + msg + "\\n  Stuck? hint(%%d) for a hint, answer(%%d) for a solution." %% (n, n))

def hint(n):
    hints, i = _HINTS.get(n, []), _given.get(n, 0)
    if not hints:
        return print("No hints for this one: answer(%%d) shows a solution." %% n)
    print("Hint %%d of %%d: %%s" %% (min(i, len(hints) - 1) + 1, len(hints), hints[min(i, len(hints) - 1)]))
    _given[n] = i + 1

def answer(n):
    print(_b64.b64decode(_ANSWERS[n]).decode())
    print("\\n(Put this in place of the ..., run it, then close it and try writing it yourself.)")
"""


def cells(src: str, solutions: bool):
    out, hints, answers, n = [], {}, {}, 0

    def exercise(m):
        nonlocal n
        if m.group(0).startswith("check("):
            return f"check({n}, "
        n += 1
        hints[n] = [h.split("### HINT", 1)[1].strip() for h in m.group(1).splitlines()]
        answers[n] = base64.b64encode(textwrap.dedent(m.group(3)).strip().encode()).decode()
        indent = m.group(2)
        if solutions:
            return m.group(3)
        return f"{indent}# YOUR CODE HERE (stuck? hint({n}), then answer({n}))\n{indent}...\n"

    for chunk in re.split(r"^# %%", src, flags=re.M)[1:]:
        head, _, body = chunk.partition("\n")
        body = body.strip("\n")
        if "[markdown]" in head:
            text = "\n".join(re.sub(r"^# ?", "", l) for l in body.splitlines())
            out.append({"cell_type": "markdown", "metadata": {}, "source": text.splitlines(keepends=True)})
            continue
        body = EXERCISE.sub(exercise, body).rstrip("\n")
        out.append({"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": body.splitlines(keepends=True)})
    helpers = HELPERS % (repr(hints), repr(answers))
    first = next(i for i, c in enumerate(out) if c["cell_type"] == "code")
    out.insert(first, {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": helpers.splitlines(keepends=True)})
    return out


def build(path: Path, dest: Path, solutions: bool):
    nb = {"cells": cells(path.read_text(), solutions), "nbformat": 4, "nbformat_minor": 5,
          "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                       "language_info": {"name": "python"}, "accelerator": "GPU", "colab": {"provenance": []}}}
    dest.write_text(json.dumps(nb, indent=1, ensure_ascii=False) + "\n")


def publish(nb: Path, title: str, gpu: bool):
    env = dict(os.environ)
    dotenv = HERE.parent.parent / ".env"
    if dotenv.exists():
        for line in dotenv.read_text().splitlines():
            line = line.strip()
            if line.startswith("KAGGLE_") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip("'\"\n ")
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / nb.name).write_bytes(nb.read_bytes())
        (Path(d) / "kernel-metadata.json").write_text(json.dumps({
            "id": f"{KAGGLE_USER}/{slug(title)}", "title": title, "code_file": nb.name, "language": "python",
            "kernel_type": "notebook", "is_private": "false", "enable_gpu": "true" if gpu else "false", "enable_internet": "true",
            "dataset_sources": [], "competition_sources": [], "kernel_sources": [], "model_sources": []}))
        r = subprocess.run(["kaggle", "kernels", "push", "-p", d], env=env, capture_output=True, text=True)
        print(nb.name, "→", (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else r.returncode)


if __name__ == "__main__":
    solutions = "--solutions" in sys.argv
    dest_dir = Path(sys.argv[sys.argv.index("--solutions") + 1]) if solutions else HERE
    index = {}
    for src in sorted((HERE / "src").glob("*.py")):
        build(src, dest_dir / f"{src.stem}.ipynb", solutions)
        title = title_of(src.read_text())
        index[f"{src.stem}.html"] = {"notebook": f"{src.stem}.ipynb", "title": title, "colab": f"{COLAB}{src.stem}.ipynb",
                                     "gpu": "# kaggle: gpu" in src.read_text(),
                                     "kaggle": f"https://www.kaggle.com/code/{KAGGLE_USER}/{slug(title)}"}
        print(("solutions → " if solutions else "") + str(dest_dir / f"{src.stem}.ipynb"))
    if not solutions:
        (HERE / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    if "--kaggle" in sys.argv:
        for page, n in index.items():
            if only := [a for a in sys.argv[2:] if not a.startswith("-")]:
                if not any(o in page for o in only): continue
            publish(HERE / n["notebook"], n["title"], n["gpu"])
