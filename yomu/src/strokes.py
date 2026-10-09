# Builds data/strokes.json for the handwriting box: every deck kanji's strokes from KanjiVG (CC BY-SA 3.0,
# kanjivg.tagaini.net), each stroke sampled to 10 points in KanjiVG's 109×109 box, in stroke order.
# Run: python3 yomu/src/strokes.py   (downloads ~612 small SVGs; reuses a local cache on later runs)
import json, math, pathlib, re, urllib.request

root = pathlib.Path(__file__).parent.parent
cache = pathlib.Path("/tmp/kanjivg"); cache.mkdir(exist_ok=True)
POINTS = 10

def path_points(d):
    """Dense points along an SVG path (the M/L/C/S/Z commands KanjiVG uses, absolute and relative)."""
    toks = re.findall(r"[MmLlCcSsZz]|-?\d*\.?\d+(?:e-?\d+)?", d)
    pts, i, cur, start, last_ctrl, cmd = [], 0, (0.0, 0.0), (0.0, 0.0), None, None
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    def cubic(p0, p1, p2, p3):
        for k in range(1, 21):
            t = k / 20
            pts.append(tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t**2*c + t**3*e for a, b, c, e in zip(p0, p1, p2, p3)))
    while i < len(toks):
        if re.fullmatch(r"[A-Za-z]", toks[i]): cmd = toks[i]; i += 1
        rel = cmd.islower(); off = cur if rel else (0.0, 0.0)
        P = lambda: (num() + off[0], num() + off[1])
        if cmd in "Mm":
            cur = start = P(); pts.append(cur); cmd = "l" if rel else "L"; last_ctrl = None
        elif cmd in "Ll":
            cur = P(); pts.append(cur); last_ctrl = None
        elif cmd in "Cc":
            c1, c2, end = P(), P(), P(); cubic(cur, c1, c2, end); last_ctrl, cur = c2, end
        elif cmd in "Ss":
            c1 = (2*cur[0] - last_ctrl[0], 2*cur[1] - last_ctrl[1]) if last_ctrl else cur
            c2, end = P(), P(); cubic(cur, c1, c2, end); last_ctrl, cur = c2, end
        elif cmd in "Zz":
            cur = start; pts.append(cur)
    return pts

def resample(pts, n=POINTS):
    """n points evenly spaced along the polyline."""
    seg = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    total = sum(seg) or 1
    out, acc, j = [], 0.0, 0
    for k in range(n):
        target = total * k / (n - 1)
        while j < len(seg) - 1 and acc + seg[j] < target: acc += seg[j]; j += 1
        f = 0 if not seg or seg[j] == 0 else min(1, (target - acc) / seg[j])
        a, b = pts[j], pts[min(j + 1, len(pts) - 1)]
        out.append((round(a[0] + (b[0] - a[0]) * f), round(a[1] + (b[1] - a[1]) * f)))
    return out

kanji = json.loads((root / "data" / "kanji.json").read_text())
out, missing = {}, []
for k in kanji:
    ch = k["k"]; code = f"{ord(ch):05x}"; f = cache / f"{code}.svg"
    if not f.exists():
        for url in (f"https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/{code}.svg", f"https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg"):
            try: f.write_bytes(urllib.request.urlopen(url, timeout=30).read()); break
            except Exception: pass
        else: missing.append(ch); continue
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', f.read_text(encoding="utf-8"))
    out[ch] = [[c for p in resample(path_points(d)) for c in p] for d in paths]
(root / "data" / "strokes.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
print(f"{len(out)} kanji, {sum(len(v) for v in out.values())} strokes" + (f"; missing {''.join(missing)}" if missing else ""))
