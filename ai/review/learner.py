"""The simulated-learner review of any course on ihor.sh (ai/PLAN.md §10): one tool for both agents, stdlib only.

The student (.agents/skills/course-student) sees lessons the way a learner does, with answers hidden until it has
committed to one, and everything it does lands in a shared log. The editor (.claude/skills/course-editor) waits on
that log for struggles and questions, replies, fixes the course, and audits the student's citations.

  student:  init [--from LESSON] · path · show [lesson] · answer L Q VALUE --quote "…" · run L BOX [--file F] · note (JSON on stdin)
            ask "question" [--wait S] · inbox · done (JSON on stdin) · nb L · hint L N · nbcheck L · clean
  editor:   watch [--timeout S] · reply ID "text" · audit · report · selftest

COURSE picks the course (ai, electronics, radio, ham, yomu; the COURSES table below), each with its own run folder:
ai/review/run/ for AI, ai/review/run-COURSE/ for the rest (git-ignored), holding log.jsonl (student → editor), replies.jsonl (editor → student),
seen.txt (every lesson view shown, for citation checks), state.json, editor.json, nb/ (the student's notebooks).
COURSE_ROOT points at another copy of the course (the editor's calibration run with planted gaps); REVIEW_PY is the Python
that runs notebooks (one with numpy, pandas, scikit-learn, torch).
"""
import ast, html, json, os, re, shutil, subprocess, sys, time
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Every course on the site, as the student meets it: where its lessons live, their order (the course's own index),
# where each lesson is on the site, and the run folder. COURSE=… picks one (default ai); each keeps its own run.
def _radio_order(root):  # radio/course/index.html builds its chapter list from a PARTS array in its script
    return re.findall(r'\["(\d\d-[a-z0-9-]+)", "', (root / "index.html").read_text())
def _numbered(root): return sorted(p.stem for p in root.glob("[0-9][0-9]-*.html"))
COURSES = {
    "ai":          {"root": "ai",                "url": "/ai/{}.html",                "run": "ai/review/run",             "order": lambda root: [s for s, _ in lint.path()]},
    "electronics": {"root": "learn/electronics", "url": "/learn/electronics/{}.html", "run": "ai/review/run-electronics", "order": _numbered},
    "radio":       {"root": "radio/course",      "url": "/radio/course/{}.html",      "run": "ai/review/run-radio",       "order": _radio_order},
    "ham":         {"root": "radio/ham/lessons", "url": "/radio/ham/lessons/{}.html", "run": "ai/review/run-ham",         "order": _numbered},
    "yomu":        {"root": "yomu/stories",      "url": "/yomu/story.html?u={}",      "run": "ai/review/run-yomu",
                    "order": lambda root: [s["id"] for s in json.loads((root / "index.json").read_text())]},
}
COURSE = os.environ.get("COURSE", "ai")
if COURSE not in COURSES: sys.exit(f"COURSE={COURSE}: choose one of {', '.join(COURSES)}.")
C = COURSES[COURSE]
ROOT = Path(os.environ.get("COURSE_ROOT", REPO / C["root"]))
RUN = REPO / C["run"]
def url(stem): return C["url"].format(stem)   # where the lesson is on the site
sys.path.insert(0, str(REPO / "ai" / "notebooks"))
import build, lint  # the notebooks' exercise numbering and the path order, shared with the course's own tools

ATTENTION = {"struggle", "ask", "quit", "guess", "error", "wrong_twice", "answer_used", "done"}
NOTE_KINDS = {"struggle", "guess", "quit", "observation", "exercise"}
STRUGGLES = {"unknown term or symbol", "step too big", "unclear wording", "example missing", "widget confusing or broken",
             "code error", "question ambiguous", "answer seems wrong", "too long or boring"}


# ---------- files ----------
def jload(p, default):
    try: return json.loads(Path(p).read_text())
    except (OSError, ValueError): return default
def jsave(p, d): Path(p).write_text(json.dumps(d, ensure_ascii=False, indent=1))
def lines(p): return [json.loads(l) for l in Path(p).read_text().splitlines() if l.strip()] if Path(p).exists() else []
def append(p, ev):
    ev = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **ev}
    with open(p, "a") as f: f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    return ev
def state(): return jload(RUN / "state.json", {"current": 0, "shown": [], "hints": {}, "replies_read": 0, "asks": 0})
def log(kind, **kw): return append(RUN / "log.jsonl", {"kind": kind, **kw})
def work(stem):
    """One scratch folder per lesson for code and notebooks, with every download cache pointed inside it, so datasets
    and model weights never land in the repo or the machine's shared caches. `done` and `clean` delete it."""
    w = RUN / "work" / stem; w.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "MPLBACKEND": "Agg", "TMPDIR": str(w / "tmp"), "TORCH_HOME": str(w / "torch"), "HF_HOME": str(w / "hf"),
           "XDG_CACHE_HOME": str(w / "cache"), "SCIKIT_LEARN_DATA": str(w / "sklearn"), "KAGGLEHUB_CACHE": str(w / "kaggle"), "MPLCONFIGDIR": str(w / "mpl")}
    (w / "tmp").mkdir(exist_ok=True)
    return w, env
def size(p): return sum(f.stat().st_size for f in Path(p).rglob("*") if f.is_file()) if Path(p).exists() else 0


# ---------- the path ----------
LESSONS = C["order"](ROOT)
def lesson(name=None):
    if name is None: return LESSONS[min(state()["current"], len(LESSONS) - 1)]
    name = name.removesuffix(".html")
    hits = [s for s in LESSONS if s == name] or [s for s in LESSONS if s.startswith(name + "-") or s.startswith(name)]
    if not hits: sys.exit(f"No lesson '{name}'. `path` lists them.")
    return hits[0]
def allowed(stem):
    if LESSONS.index(stem) > state()["current"]: sys.exit(f"{stem} is ahead of you: finish {lesson()} first (`done`).")


# ---------- a lesson as a learner sees it ----------
class Lesson(HTMLParser):
    """Text of <main>, questions with their answers kept aside, code boxes. Scripts, styles and .why text are hidden."""
    VOID = {"input", "br", "img", "meta", "link", "hr", "source", "col", "wbr"}

    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.qs, self.boxes, self.inmain, self.skip = [], [], [], [], False, 0
        self.sec, self.widget_secs = 0, set()   # h2 sections that hold a widget (a picture to drag, a slider, a menu)
        self.feed(src)
        self.text = re.sub(r"\n{3,}", "\n\n", "".join(self.out)).strip()
        # widgets a script builds into an empty <div id="…"> (the schematic, pinout and breadboard views) count too
        body = src[src.find("<main"):src.find("</main>")]
        for m in re.finditer(r'<div[^>]*\bid="[^"]+"[^>]*>\s*</div>', body): self.widget_secs.add(body[:m.start()].count("<h2"))

    def cls(self, a): return (dict(a).get("class") or "").split()
    def within(self, c): return any(c in s[1] for s in self.stack)
    def q(self): return self.qs[-1] if self.within("q") and self.qs else None

    def handle_starttag(self, tag, a):
        d, c = dict(a), self.cls(a)
        if tag == "main": self.inmain = True
        if not self.inmain: return
        if tag in ("script", "style"): self.skip += 1
        if tag == "h2": self.sec += 1
        if tag == "canvas" or (tag == "input" and d.get("type") in ("range", "checkbox")) or tag == "select":
            if not self.within("q"): self.widget_secs.add(self.sec)
        if tag == "canvas": self.out.append(f"\n[interactive picture: {d.get('aria-label') or d.get('id') or 'drag or click it on the page'}]\n")
        if tag == "input" and d.get("type") == "range": self.out.append(f" [slider {d.get('min')}…{d.get('max')}, now {d.get('value')}] ")
        if tag in self.VOID: return
        self.stack.append((tag, c, d))
        if tag == "div" and "q" in c:
            kind = "choice" if "data-answer" in d else "number" if "data-num" in d else "open"
            self.qs.append({"n": len(self.qs) + 1, "kind": kind, "key": d.get("data-answer"), "num": d.get("data-num"),
                            "tol": float(d.get("data-tol") or 0.01), "stem": "", "options": {}, "says": {}, "why": ""})
            self.out.append(f"\n\nQ{len(self.qs)} [" + {"choice": "pick one letter", "number": "type a number", "open": "think, then answer in words"}[kind] + "]: ")
        elif tag == "li" and self.q() and "data-k" in d:
            self.q()["options"][d["data-k"]] = ""
            if d.get("data-says"): self.q()["says"][d["data-k"]] = d["data-says"]
            self.out.append(f"\n   {d['data-k']}) ")
        elif tag == "div" and "code" in c:
            self.boxes.append({"n": len(self.boxes) + 1, "id": d.get("id"), "uses": d.get("data-uses"), "title": d.get("data-title", ""), "code": ""})
            self.out.append(f"\n\n[code box {len(self.boxes)}{': ' + d['data-title'] if d.get('data-title') else ''}]\n```python\n")
        elif tag == "details" and "deeper" in c: self.out.append("\n\n[optional deeper box] ")
        elif tag in ("h1", "h2", "h3"): self.out.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li": self.out.append("\n- ")
        elif tag in ("td", "th"): self.out.append(" | ")
        elif tag in ("p", "div", "summary", "tr"): self.out.append("\n")

    def handle_endtag(self, tag):
        if not self.inmain: return
        if tag in ("script", "style"): self.skip = max(0, self.skip - 1)
        if tag == "main": self.inmain = False
        while self.stack:
            t, c, _ = self.stack.pop()
            if t == "div" and "code" in c: self.out.append("```\n")
            if t == tag: break

    def handle_data(self, data):
        if not self.inmain or self.skip: return
        q = self.q()
        if q and self.within("why"): q["why"] += data; return
        if self.within("code") and any(s[0] == "textarea" for s in self.stack):
            self.boxes[-1]["code"] += data; self.out.append(data); return
        if q:
            if any(s[0] == "li" for s in self.stack) and q["options"]: q["options"][list(q["options"])[-1]] += data
            else: q["stem"] += data
        self.out.append(re.sub(r"\s+", " ", data) if not self.within("code") else data)


class Story:
    """A Yomu story as its page shows it: the scene, each line with the words' glosses (what tapping a word shows),
    the grammar notes, and its questions (answers kept aside, like Lesson's)."""
    def __init__(self, d):
        L = lambda x: (x or {}).get("en", "") if isinstance(x, dict) else (x or "")
        out = [f"# {L(d.get('title'))} ({(d.get('title') or {}).get('ja', '')})", L(d.get("scene"))]
        for line in d.get("lines", []):
            words = "".join(t[0] for t in line["t"])
            gloss = "; ".join(f"{t[0]} = {t[2]}" for t in line["t"] if len(t) > 2 and t[2])
            out.append(f"\n{line.get('who', '')}: {words}\n   [tap a word: {gloss}]")
        def note(g):  # a grammar point: its title, explanation and examples (its practice quiz stays on the page)
            if not isinstance(g, dict): return str(g)
            ex = "".join(f"\n    e.g. {''.join(t[0] for t in e.get('t', []))} ({e.get('en', '')})" for e in g.get("examples", []))
            return f"{g.get('title', '')}: {g.get('explain', '')}{ex}"
        if d.get("grammar"): out.append("\n## Grammar in this story\n- " + "\n- ".join(note(g) for g in d["grammar"]))
        self.qs, self.boxes, self.widget_secs = [], [], set()
        for n, q in enumerate(d.get("questions", []), 1):
            opts = {chr(97 + k): c for k, c in enumerate(q["choices"])}
            self.qs.append({"n": n, "kind": "choice", "key": chr(97 + q["answer"]), "num": None, "tol": 0.01,
                            "stem": q["q"], "options": opts, "says": {}, "why": ""})
            out.append(f"\n\nQ{n} [pick one letter]: {q['q']} ({q.get('en', '')})" + "".join(f"\n   {k}) {v}" for k, v in opts.items()))
        self.text = "\n".join(out).strip()

def parsed(stem):
    if COURSE == "yomu": return Story(json.loads((ROOT / f"{stem}.json").read_text()))
    return Lesson((ROOT / f"{stem}.html").read_text())


# ---------- student commands ----------
def cmd_init(args):
    RUN.mkdir(parents=True, exist_ok=True)
    if (RUN / "log.jsonl").exists() and "--fresh" not in args: sys.exit(f"A run exists in {RUN}. Continue it, or `init --fresh` to start over.")
    for f in ("log.jsonl", "replies.jsonl", "seen.txt", "state.json", "editor.json"): (RUN / f).unlink(missing_ok=True)
    st = state()
    start = flag(args, "--from")  # begin later in the path: the earlier lessons count as read (their text is quotable)
    if start:
        st["current"] = LESSONS.index(lesson(start))
        for stem in LESSONS[:st["current"]]:
            st["shown"].append(stem)
            with open(RUN / "seen.txt", "a") as f: f.write(f"\n\n===== {stem} =====\n{parsed(stem).text}\n")
    jsave(RUN / "state.json", st)
    log("start", course=COURSE, lessons=len(LESSONS), root=str(ROOT), first=LESSONS[st["current"]])
    print(f"Run started ({COURSE}): {len(LESSONS)} lessons, first {LESSONS[st['current']]}. Next: `show`.")

def cmd_path(args):
    cur = state()["current"]
    for i, s in enumerate(LESSONS): print(("✓ " if i < cur else "→ " if i == cur else "  ") + s)

def cmd_show(args):
    stem = lesson(args[0] if args else None); allowed(stem)
    cmd_inbox([])
    les, st = parsed(stem), state()
    if stem not in st["shown"]:
        st["shown"].append(stem); jsave(RUN / "state.json", st)
        with open(RUN / "seen.txt", "a") as f: f.write(f"\n\n===== {stem} =====\n{les.text}\n")
        log("show", lesson=stem, questions=len(les.qs), boxes=len(les.boxes))
    print(f"===== {stem} ({len(les.qs)} questions, {len(les.boxes)} code boxes) =====\n{les.text}")

def flag(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default

def cmd_answer(args):
    if len(args) < 3: sys.exit('answer LESSON Q VALUE --quote "the words from the lesson you relied on"')
    stem, n, value = lesson(args[0]), int(args[1]), args[2]; allowed(stem)
    cmd_inbox([])  # editor messages arrive between steps, not only at the next lesson
    quote = flag(args, "--quote")
    q = parsed(stem).qs[n - 1]
    norm = lambda t: re.sub(r"\W+", " ", t or "").strip().lower()   # the option itself, or barely more, justifies nothing
    if quote and q["options"] and any(norm(quote) and (norm(quote) in norm(o) or (norm(o) in norm(quote) and len(norm(quote)) <= 1.3 * len(norm(o)) + 5)) for o in q["options"].values() if norm(o)):
        sys.exit("That quote is one of the options, so it can't justify choosing it. Quote the lesson's own words that made you pick it.")
    prev = [e for e in lines(RUN / "log.jsonl") if e["kind"] == "answer" and e["lesson"] == stem]
    if prev and time.time() - time.mktime(time.strptime(prev[-1]["ts"], "%Y-%m-%dT%H:%M:%S")) < 15:
        sys.exit("Slow down: answer a question only after reading its section and doing what it asks (widgets, code).")
    tries = sum(1 for e in lines(RUN / "log.jsonl") if e["kind"] == "answer" and e["lesson"] == stem and e["q"] == n)
    if q["kind"] == "choice": ok = value.strip().lower() == q["key"]
    elif q["kind"] == "number":
        try: v, t = float(value.replace(",", "")), float(q["num"]); ok = abs(v - t) <= max(abs(t) * q["tol"], 1e-9) if q["tol"] < 1 else abs(v - t) <= q["tol"]
        except ValueError: ok = False
    else: ok = None
    log("answer", lesson=stem, q=n, value=value, correct=ok, attempt=tries + 1, quote=quote)
    if ok is False and tries >= 1: log("wrong_twice", lesson=stem, q=n, stem=q["stem"].strip()[:200], value=value)
    if q["kind"] == "choice" and not ok and value in q["says"]: print("Not quite:", q["says"][value])
    print({True: "✓ Right.", False: "✗ Not right.", None: "Here's the lesson's answer; compare it with yours."}[ok])
    if ok is not False or tries >= 1: print("Why:", re.sub(r"\s+", " ", q["why"]).strip() or "(no explanation in the lesson)")
    else: print("Try once more before the explanation is shown.")

PRELUDE = '''import os, sys, ast, io, contextlib, urllib.request
os.environ.setdefault("MPLBACKEND", "Agg")
REPO, LESSON_DIR = {repo!r}, {root!r}
def get(url):
    if url.startswith("http"): return urllib.request.urlopen(url).read().decode()
    return open(os.path.join(REPO, url.lstrip("/")) if url.startswith("/") else os.path.join(LESSON_DIR, url), encoding="utf-8").read()
def plot(*a, **k): print("[a plot is drawn here]")
def table(rows): print(rows)
def _run(src, quiet=False):
    tree = ast.parse(src); last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
    with (contextlib.redirect_stdout(io.StringIO()) if quiet else contextlib.nullcontext()):
        exec(compile(tree, "<box>", "exec"), globals())
        if last is not None:
            v = eval(compile(ast.Expression(last.value), "<box>", "eval"), globals())
            if v is not None: print(v)
'''

def cmd_run(args):
    if len(args) < 2: sys.exit("run LESSON BOX [--file your_version.py]")
    stem, n = lesson(args[0]), int(args[1]); allowed(stem); cmd_inbox([])
    les = parsed(stem); box = les.boxes[n - 1]
    code = Path(flag(args, "--file")).read_text() if flag(args, "--file") else html.unescape(box["code"])
    uses = [b for b in les.boxes if box["uses"] and b["id"] in box["uses"].split()]
    script = PRELUDE.format(repo=str(REPO), root=str(ROOT)) + "".join(f"_run({b['code']!r}, quiet=True)\n" for b in uses) + f"_run({code!r})\n"
    w, env = work(stem)
    try: r = subprocess.run([os.environ.get("REVIEW_PY", sys.executable), "-c", script], capture_output=True, text=True, timeout=300, cwd=w, env=env)
    except subprocess.TimeoutExpired: r = subprocess.CompletedProcess([], 1, "", "timed out after 300 s")
    out = (r.stdout + ("\n" + r.stderr.strip().splitlines()[-1] if r.returncode and r.stderr.strip() else "")).strip()
    log("run", lesson=stem, box=n, own_code=bool(flag(args, "--file")), ok=r.returncode == 0, output=out[-400:])
    if r.returncode: log("error", lesson=stem, box=n, what="code box failed", output=out[-400:])
    print(out or "(no output)")

def cmd_note(args):
    ev = json.loads(sys.stdin.read())
    if ev.get("kind") not in NOTE_KINDS: sys.exit(f"kind must be one of {sorted(NOTE_KINDS)}")
    if ev["kind"] == "struggle" and ev.get("type") not in STRUGGLES: sys.exit(f"a struggle's type is one of {sorted(STRUGGLES)}")
    if ev["kind"] == "exercise" and not (ev.get("exercise") and ev.get("quote")): sys.exit('an exercise note needs "exercise": N and "quote": where the course showed you how')
    ev.setdefault("lesson", lesson()); cmd_inbox([])
    print("logged:", log(ev.pop("kind"), **ev)["kind"])

def cmd_inbox(args):
    st, rs = state(), lines(RUN / "replies.jsonl")
    for r in rs[st["replies_read"]:]: print(f"📩 From the editor ({r.get('to') or 'note'}): {r['text']}\n")
    st["replies_read"] = len(rs); jsave(RUN / "state.json", st)

def cmd_ask(args):
    if not args: sys.exit('ask "your question" [--wait SECONDS]')
    st = state(); st["asks"] += 1; jsave(RUN / "state.json", st)
    aid = f"ask-{st['asks']}"
    log("ask", id=aid, lesson=lesson(), question=args[0])
    wait, t0 = int(flag(args, "--wait", 300)), time.time()
    while time.time() - t0 < wait:
        if any(r.get("to") == aid for r in lines(RUN / "replies.jsonl")): return cmd_inbox([])
        time.sleep(5)
    print(f"No answer yet ({aid}). Carry on as a real learner would; the answer will show in `inbox` and at the next `show`.")

def cmd_done(args):
    st, stem = state(), lesson()
    les, evs = parsed(stem), [e for e in lines(RUN / "log.jsonl") if e.get("lesson") == stem]
    missing = [q["n"] for q in les.qs if not any(e["kind"] == "answer" and e["q"] == q["n"] for e in evs)]
    if missing: sys.exit(f"Answer every question first: Q{', Q'.join(map(str, missing))} of {stem}.")
    dos = sum(1 for e in evs if e["kind"] == "ui" and e.get("action") == "do")
    if dos < len(les.widget_secs):
        sys.exit(f"{len(les.widget_secs)} sections have a widget (sections {sorted(les.widget_secs)}), and you've used `B do` {dos} times. "
                 "Do what each section asks with its widget, then `done`.")
    shown = next((e["ts"] for e in evs if e["kind"] == "show"), None)
    if shown and (time.time() - time.mktime(time.strptime(shown, "%Y-%m-%dT%H:%M:%S"))) < 60 * max(3, len(les.qs)):
        sys.exit(f"Under {max(3, len(les.qs))} minutes on a lesson with {len(les.qs)} questions: that's skimming, not learning. Work through it, then `done`.")
    if any(e["kind"] == "nb_start" for e in evs):
        cited = {int(e["exercise"]) for e in evs if e["kind"] == "exercise"}
        uncited = [n for n in range(1, len(exercises(stem)) + 1) if n not in cited]
        if uncited: sys.exit(f"For each notebook exercise, note where the course showed you how (kind \"exercise\"): {uncited} still need one.")
    summary = json.loads(sys.stdin.read() or "{}") if not sys.stdin.isatty() else {}
    if summary.get("hardest") and not any(e["kind"] == "struggle" for e in evs):  # named it, didn't log it: log it
        log("struggle", lesson=stem, type="step too big", section="?", quote="", auto=True, expected="(from the lesson summary)", happened=summary["hardest"], quit=False)
    start = next((e["ts"] for e in evs if e["kind"] == "show"), None)
    wall = round((time.time() - time.mktime(time.strptime(start, "%Y-%m-%dT%H:%M:%S"))) / 60) if start else None
    log("done", lesson=stem, wall_minutes=wall, **{("estimated_minutes" if k == "minutes" else k): v for k, v in summary.items()})
    st["current"] += 1; jsave(RUN / "state.json", st)
    cmd_clean([])
    print(f"✓ {stem} done. Next: {LESSONS[st['current']] if st['current'] < len(LESSONS) else 'the path is finished'}.")


# ---------- notebooks ----------
def exercises(stem):
    "[(hints, solution)] numbered as build.py numbers them."
    src, out = (REPO / "ai" / "notebooks" / "src" / f"{stem}.py").read_text(), []
    for chunk in re.split(r"^# %%", src, flags=re.M)[1:]:
        head, _, body = chunk.partition("\n")
        if "[markdown]" in head: continue
        for m in build.EXERCISE.finditer(body.strip("\n")):
            if not m.group(0).startswith("check("):
                out.append(([h.split("### HINT", 1)[1].strip() for h in m.group(1).splitlines()], m.group(3).strip()))
    return out

def nbfile(stem): return RUN / "nb" / f"{stem}.py"

def cmd_nb(args):
    stem = lesson(args[0] if args else None); allowed(stem)
    src = (REPO / "ai" / "notebooks" / "src" / f"{stem}.py")
    if not src.exists(): sys.exit(f"{stem} has no notebook.")
    f = nbfile(stem)
    if not f.exists():
        cells = build.cells(src.read_text(), solutions=False)
        helpers = build.HELPERS % ("{}", "{}") + '\ndef hint(n): print("Use: python3 ai/review/learner.py hint %s %%d" %% n)\nanswer = hint\n' % stem
        parts, first = [], True
        for c in cells:
            body = "".join(c["source"])
            if c["cell_type"] == "markdown": parts.append("\n".join("# " + l for l in body.splitlines()))
            elif first and "_HINTS" in body: parts.append(helpers); first = False
            else: parts.append(re.sub(r"(?m)^(\s*)([!%].*)$", r"\1# notebook command, skipped here: \2", body))
        f.parent.mkdir(parents=True, exist_ok=True); f.write_text("\n\n# %%\n".join(parts) + "\n")
        log("nb_start", lesson=stem, exercises=len(exercises(stem)))
    if "# kaggle: gpu" in src.read_text(): print("Note: this notebook is meant for a GPU (Colab or Kaggle); `nbcheck` won't run it here.")
    print(f"Your notebook: {f}\nFill each `# YOUR CODE HERE` / `...`, then `nbcheck {stem}`. {len(exercises(stem))} exercises.")

def cmd_hint(args):
    stem, n = lesson(args[0]), int(args[1]); allowed(stem)
    hints, sol = exercises(stem)[n - 1]
    st = state(); k = f"{stem}:{n}"; i = st["hints"].get(k, 0); st["hints"][k] = i + 1; jsave(RUN / "state.json", st)
    if i < len(hints): log("hint", lesson=stem, exercise=n, level=i + 1); print(f"Hint {i + 1} of {len(hints)}: {hints[i]}")
    else: log("answer_used", lesson=stem, exercise=n); print("No hints left. The solution:\n" + sol)

def cmd_nbcheck(args):
    stem = lesson(args[0] if args else None); f = nbfile(stem)
    if not f.exists(): sys.exit(f"Run `nb {stem}` first.")
    if "# kaggle: gpu" in (REPO / "ai" / "notebooks" / "src" / f"{stem}.py").read_text() and "--force" not in args:
        log("nbcheck_skipped", lesson=stem, why="GPU notebook")
        return print("This notebook says to use a GPU (Colab or Kaggle), and this machine would take over 30 minutes.\n"
                     "Do what a learner can do here: fill every exercise and cite it with an exercise note; the editor checks\n"
                     "GPU notebooks separately. `nbcheck LESSON --force` runs it anyway.")
    w, env = work(stem)
    try: r = subprocess.run([os.environ.get("REVIEW_PY", sys.executable), str(f)], capture_output=True, text=True, timeout=1800, cwd=w, env=env)
    except subprocess.TimeoutExpired: r = subprocess.CompletedProcess([], 1, "", "timed out after 30 min")
    ok, bad = r.stdout.count("✓"), r.stdout.count("✗")
    log("nbcheck", lesson=stem, passed=ok, failed=bad, crashed=r.returncode != 0, tail=(r.stdout + r.stderr)[-300:])
    if r.returncode: log("error", lesson=stem, what="notebook crashed", output=r.stderr.strip()[-300:])
    print(r.stdout[-3000:], r.stderr[-800:] if r.returncode else "", f"\n{ok} ✓, {bad} ✗")


def cmd_clean(args):
    "Delete every lesson's scratch folder (downloads, caches, files the code wrote) and stray downloads; keep logs and notes."
    freed = sum(size(p) for p in [RUN / "work", RUN / "nb" / "data"])
    for p in [RUN / "work", RUN / "nb" / "data"]: shutil.rmtree(p, ignore_errors=True)
    print(f"cleaned {freed / 1e6:.0f} MB; the run now takes {size(RUN) / 1e6:.1f} MB")

# ---------- editor commands ----------
def cmd_watch(args):
    "Block until the student logs something that needs the editor, print it compactly, and remember where we were."
    ed = jload(RUN / "editor.json", {"offset": 0})
    wait, t0 = int(flag(args, "--timeout", 3000)), time.time()
    while True:
        evs = lines(RUN / "log.jsonl")[ed["offset"]:]
        hits = [e for e in evs if e["kind"] in ATTENTION]
        if hits or time.time() - t0 > wait:
            ed["offset"] += len(evs); jsave(RUN / "editor.json", ed)
            for e in hits: print(json.dumps({k: v for k, v in e.items() if v not in (None, "", [])}, ensure_ascii=False))
            print(f"-- {len(evs)} new events, {len(hits)} need you; student is on {lesson()}" if evs else "-- nothing new")
            return
        time.sleep(10)

def cmd_reply(args):
    if len(args) < 2: sys.exit('reply ask-N|note "text"')
    append(RUN / "replies.jsonl", {"to": None if args[0] == "note" else args[0], "text": args[1]})
    print("sent")

def norm(s): return re.sub(r"\s+", " ", re.sub(r"\\[()\[\]]", "", html.unescape(s or ""))).strip().lower()  # math as rendered or as source

def cmd_audit(args):
    seen, bad = norm((RUN / "seen.txt").read_text() if (RUN / "seen.txt").exists() else ""), 0
    for e in lines(RUN / "log.jsonl"):
        if e["kind"] in ("answer", "struggle", "guess", "exercise") and not e.get("auto"):
            q = norm(e.get("quote"))
            if not q: print(f"no quote: {e['kind']} {e.get('lesson')} Q{e.get('q', '')} {e.get('value', '')}"); bad += 1
            elif q not in seen: print(f"quote not in what it was shown: {e.get('lesson')} Q{e.get('q', '')}: {e.get('quote')[:120]!r}"); bad += 1
    print(f"{bad} citation problems")

def cmd_report(args):
    rows, evs = {}, lines(RUN / "log.jsonl")
    for e in evs:
        if "lesson" not in e: continue
        r = rows.setdefault(e["lesson"], {"q": set(), "first": 0, "hints": 0, "answers_used": 0, "struggles": 0, "asks": 0, "quits": 0, "errors": 0})
        if e["kind"] == "answer":
            if e["attempt"] == 1 and e["correct"]: r["first"] += 1
            r["q"].add(e["q"])
        r["hints"] += e["kind"] == "hint"; r["answers_used"] += e["kind"] == "answer_used"; r["struggles"] += e["kind"] == "struggle"
        r["asks"] += e["kind"] == "ask"; r["quits"] += e["kind"] == "quit"; r["errors"] += e["kind"] == "error"
    print("lesson | questions | right first try | hints | answers used | struggles | asks | quit points | errors")
    for s, r in rows.items():
        print(f"{s} | {len(r['q'])} | {r['first']}/{len(r['q'])} | {r['hints']} | {r['answers_used']} | {r['struggles']} | {r['asks']} | {r['quits']} | {r['errors']}")

def cmd_selftest(args):
    "Every lesson parses; no explanation text leaks into the learner's view; every choice key is one of the options."
    problems = 0
    for stem in LESSONS:
        les = parsed(stem)
        for q in les.qs:
            why = norm(q["why"])
            if len(why) > 30 and why[:80] in norm(les.text): print(f"{stem} Q{q['n']}: explanation visible"); problems += 1
            if q["kind"] == "choice" and q["key"] not in q["options"]: print(f"{stem} Q{q['n']}: answer {q['key']} not among {list(q['options'])}"); problems += 1
    print(f"{len(LESSONS)} lessons, {problems} problems"); sys.exit(1 if problems else 0)


if __name__ == "__main__":
    cmds = {k[4:]: v for k, v in globals().items() if k.startswith("cmd_")}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds: sys.exit(__doc__)
    if sys.argv[1] not in ("init", "selftest", "path") and not RUN.exists(): sys.exit("No run yet: `init` first.")
    cmds[sys.argv[1]](sys.argv[2:])
