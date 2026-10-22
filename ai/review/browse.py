"""The student's eyes and hands on the real pages (Playwright, headless Chromium): what a visitor sees and does.

  look LESSON [--section N] [--width 390|1280]   screenshot a section (or the top), list its controls, check the page
  do LESSON --steps 'JSON' [--width W]           act on the page, then read and screenshot what changed
  runbox LESSON N [--width W]                    press ▶ Run on code box N (in-page Python) and print its output

Steps for `do`, run in order: {"set": "#id", "value": "0.5"} (slider, number box, select), {"click": "selector"},
{"drag": "selector", "from": [x, y], "to": [x, y]} (fractions of the element's box), {"key": "ArrowRight", "on": "selector"},
{"wait": ms}, {"read": "selector"}, {"shot": "name"}.
Every call logs a `ui` event to the run's log.jsonl (ai/review/run/, or ai/review/run-COURSE/); JavaScript errors, horizontal overflow and failed requests
are also logged as `error`, so the editor sees them at once. Screenshots go to the run's shots/.
BASE is the site (default http://localhost:8080; https://ihor.sh also works).
"""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import learner as L
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8080")
SHOTS = L.RUN / "shots"

CONTROLS = """([n]) => {
  const hs = [...document.querySelectorAll("main h2")], start = n ? hs[n - 1] : null, end = n ? hs[n] : hs[0];
  const inside = (el) => (!start || start.compareDocumentPosition(el) & 4) && (!end || el.compareDocumentPosition(end) & 4);
  const sel = (el) => el.id ? "#" + el.id : el.tagName.toLowerCase() + ":nth-of-type(" + ([...el.parentNode.children].filter((c) => c.tagName === el.tagName).indexOf(el) + 1) + ")";
  const label = (el) => (el.closest("label")?.innerText || el.getAttribute("aria-label") || el.innerText || el.title || "").trim().replace(/\\s+/g, " ").slice(0, 70);
  return [...document.querySelectorAll("main input, main select, main button, main canvas")].filter(inside)
    .filter((el) => !el.closest(".code") && !el.closest(".q"))
    .map((el) => ({ sel: sel(el), what: el.tagName === "INPUT" ? el.type : el.tagName.toLowerCase(), label: label(el),
                    value: el.value ?? null, min: el.min || null, max: el.max || null, keyboard: el.tabIndex >= 0 }));
}"""

def page(p, stem, width):
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": width, "height": 900})
    issues = []
    pg.on("pageerror", lambda e: issues.append(f"JS error: {str(e)[:160]}"))
    pg.on("response", lambda r: issues.append(f"HTTP {r.status}: {r.url[-80:]}") if r.status >= 400 and BASE in r.url else None)
    pg.goto(f"{BASE}{L.url(stem)}", wait_until="load"); pg.wait_for_timeout(1500)
    return b, pg, issues

def finish(pg, stem, width, issues, extra):
    if pg.evaluate("document.documentElement.scrollWidth") > width: issues.append(f"page scrolls sideways at {width} px")
    L.log("ui", lesson=stem, width=width, issues=issues, **extra)
    if issues: L.log("error", lesson=stem, what="page problem", output="; ".join(issues)[:400])
    for i in issues: print("⚠", i)

def shot(pg, name, section=None):
    SHOTS.mkdir(parents=True, exist_ok=True)
    f = SHOTS / f"{name}.png"
    hs = pg.query_selector_all("main h2")
    if section and section <= len(hs):
        top = hs[section - 1].bounding_box()["y"] + pg.evaluate("scrollY")
        bottom = (hs[section].bounding_box()["y"] + pg.evaluate("scrollY")) if section < len(hs) else top + 2400
        pg.screenshot(path=f, full_page=True, clip={"x": 0, "y": top - 10, "width": pg.viewport_size["width"], "height": min(2400, bottom - top + 10)})
    else: pg.screenshot(path=f)
    return str(f)

def flag(args, name, default=None): return args[args.index(name) + 1] if name in args else default

def cmd_look(stem, args, p, width):
    sec = int(flag(args, "--section", 0)) or None
    b, pg, issues = page(p, stem, width)
    f = shot(pg, f"{stem}-s{sec or 0}-{width}", sec)
    controls = pg.evaluate(CONTROLS, [sec or 0])
    print(f"screenshot: {f}  (open it and look at it)")
    for c in controls: print(json.dumps(c, ensure_ascii=False))
    finish(pg, stem, width, issues, {"action": "look", "section": sec, "shot": f, "controls": len(controls)}); b.close()

def cmd_do(stem, args, p, width):
    steps = json.loads(flag(args, "--steps", "[]"))
    b, pg, issues = page(p, stem, width)
    pg.set_default_timeout(5000)
    misses = []  # the student's own wrong selectors: told to it, not to the editor
    for i, s in enumerate(steps):
        try:
            if "set" in s:
                el = pg.locator(s["set"]).first
                if el.evaluate("e => e.tagName") == "SELECT": el.select_option(str(s["value"]))
                else: el.evaluate("(e, v) => { e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }", str(s["value"]))
            elif "click" in s: pg.locator(s["click"]).first.click()
            elif "drag" in s:
                bb = pg.locator(s["drag"]).first.bounding_box(); (x0, y0), (x1, y1) = s.get("from", [0.5, 0.5]), s["to"]
                pg.mouse.move(bb["x"] + x0 * bb["width"], bb["y"] + y0 * bb["height"]); pg.mouse.down()
                pg.mouse.move(bb["x"] + x1 * bb["width"], bb["y"] + y1 * bb["height"], steps=12); pg.mouse.up()
            elif "key" in s: pg.locator(s["on"]).first.focus(); pg.keyboard.press(s["key"])
            elif "wait" in s: pg.wait_for_timeout(int(s["wait"]))
            elif "read" in s: print(f"{s['read']}: {pg.locator(s['read']).first.inner_text().strip()[:400]}")
            elif "shot" in s: print("screenshot:", shot(pg, f"{stem}-{s['shot']}-{width}"))
            pg.wait_for_timeout(250)
        except Exception as e: misses.append(f"step {i + 1} {json.dumps(s)} didn't work: {str(e).splitlines()[0][:120]}")
    for m in misses: print("✗", m, "(check the selector with `look`)")
    finish(pg, stem, width, issues, {"action": "do", "steps": steps, "step_failures": misses}); b.close()

def cmd_runbox(stem, args, p, width):
    n = int(args[0])
    b, pg, issues = page(p, stem, width)
    box = pg.locator("main .code").nth(n - 1)
    box.scroll_into_view_if_needed(); box.locator("button.run").click()
    out = box.locator(".out")
    for _ in range(120):  # the first run loads Python into the page (~10 MB)
        t = out.inner_text()
        if t.strip() and "Running…" not in t and "Starting Python" not in t: break
        pg.wait_for_timeout(1000)
    text = out.inner_text().strip()
    print(text or "(no output after 2 minutes)")
    if not text or "Error" in text: issues.append(f"code box {n} in the page: {(text or 'no output')[-200:]}")
    finish(pg, stem, width, issues, {"action": "runbox", "box": n, "output": text[-400:]}); b.close()

if __name__ == "__main__":
    cmds = {"look": cmd_look, "do": cmd_do, "runbox": cmd_runbox}
    if len(sys.argv) < 3 or sys.argv[1] not in cmds: sys.exit(__doc__)
    stem = L.lesson(sys.argv[2]); L.allowed(stem)
    with sync_playwright() as p: cmds[sys.argv[1]](stem, sys.argv[3:], p, int(flag(sys.argv, "--width", 1280)))
