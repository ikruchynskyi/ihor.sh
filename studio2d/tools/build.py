#!/usr/bin/env python3
"""Character builder for the 2D studio: picture -> cut-out -> grid for placing joints -> rig overlay -> face variants.

    python3 studio2d/tools/build.py generate NAME "look" [SEED] [adult]   picture from the image service (anime model; chibi, or adult)
    python3 studio2d/tools/build.py cutout NAME                             source.png -> base.png (background removed)
    python3 studio2d/tools/build.py grid NAME                               grid.png: base.png with coordinates, to read joints off
    python3 studio2d/tools/build.py overlay NAME                            overlay.png: the rig (bones, regions, face box) over the picture
    python3 studio2d/tools/build.py faces NAME [face ...]                   faces/<face>.png: the face redrawn (eyes closed, talking, ...)
    python3 studio2d/tools/build.py facesheet NAME                          faces.jpg: all the faces side by side
    python3 studio2d/tools/build.py back NAME                               back/: her back view (cut out, on a grid) to rig for turning
    python3 studio2d/tools/build.py outfit NAME NEW "outfit"                NEW: the same character in other clothes, rig copied
    python3 studio2d/tools/build.py frames _ PATH EVERY START COUNT OUTDIR   frames.jpg: a GIF's frames with times and a grid

Characters live in studio2d/characters/NAME/. The image service is ~/AI/fast_35.py on port 6000 (IMAGE_URL overrides it):
the anime model is asked for with the request field "model": "nsfw" (the same routing as the word in the prompt, without
putting that word into the picture's prompt), and "fast": true (DMD2, 8 steps). Prints one JSON line per result.
"""
import base64, io, json, os, sys, urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
IMAGE_URL = os.environ.get("IMAGE_URL", "http://127.0.0.1:6000")
# The house style: one cute chibi character, whole body, arms and legs a little away from the body (they rig cleanly), on white.
STYLE = ("general, 1girl, solo, chibi, full body, standing, a-pose, arms slightly away from body, legs slightly apart, "
         "front view, looking at viewer, {look}, (white background:1.5), (plain background:1.3)")
# An adult character (style "adult"): grown-up proportions, not chibi; the same open pose so she rigs the same way.
# Flat cel shading with bold outlines and arms held well away from the body: the rigger follows outlines, and a sleeve
# that doesn't touch the body moves without dragging it.
STYLE_ADULT = ("general, 1girl, solo, adult woman, mature female, (adult:1.2), full body, standing, (arms spread away from body:1.3), "
               "legs slightly apart, front view, looking at viewer, {look}, fully clothed, anime coloring, flat color, cel shading, "
               "(bold outlines:1.2), (white background:1.5), (plain background:1.3)")
# Faces the studio uses: what to redraw inside the face box. "base" is the picture itself.
FACES = {
    "blink": "eyes closed, closed eyes, gentle smile",
    "talk": "open mouth, talking, smile, eyes open",
    "joy": "happy closed eyes, ^_^, big open mouth smile, blush",
    "wink": "one eye closed, wink, smile, eyes open",
    "surprised": "surprised, wide open eyes, small open mouth",
    "sad": "sad, teary eyes, frown",
    "angry": "angry, furrowed brows, pout",
    "shy": "embarrassed, heavy blush, shy smile, eyes looking aside",
}


def char(name):
    d = ROOT / "characters" / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def say(**kw):
    print(json.dumps(kw), flush=True)


def call(route, body, timeout=600):
    req = urllib.request.Request(f"{IMAGE_URL}{route}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    out = json.load(urllib.request.urlopen(req, timeout=timeout))
    if "image" not in out:
        raise RuntimeError(out.get("message", "the image service returned no image"))
    return Image.open(io.BytesIO(base64.b64decode(out["image"].split(",")[-1]))), out.get("seed")


def b64(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def generate(name, look, seed=None, style="chibi"):
    prompt = (STYLE_ADULT if style == "adult" else STYLE).format(look=look) + (f", seed {seed}" if seed else "")
    img, seed = call("/generate", {"prompt": prompt, "model": "nsfw", "fast": True, "width": 832, "height": 1216})
    d = char(name)
    img.convert("RGB").save(d / "source.png")
    (d / "prompt.json").write_text(json.dumps({"look": look, "style": style, "prompt": prompt, "seed": seed}, indent=1) + "\n")
    say(ok=True, step="generate", file=str(d / "source.png"), seed=seed)


def cutout(name):
    """Remove the white background: flood-fill near-white from the picture's edges (the outlines stop it), keep the rest,
    and soften the edge. White parts inside the character (sleeves, socks) stay, as long as an outline closes them."""
    d = char(name)
    rgb = np.asarray(Image.open(d / "source.png").convert("RGB")).astype(np.float32) / 255
    white = (rgb.min(-1) > 0.9) & (rgb.max(-1) - rgb.min(-1) < 0.08)
    labels, _ = ndimage.label(white)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(edge))
    bg = ndimage.binary_opening(bg, iterations=1)
    keep = ~bg
    lab, n = ndimage.label(keep)  # drop specks: keep the biggest piece and anything large
    if n > 1:
        sizes = ndimage.sum(keep, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(800, sizes.max() * 0.02)])
    keep = ndimage.binary_fill_holes(keep) | (keep & ~bg)
    # soft edge: background-coloured pixels next to the character fade by how white they are
    alpha = keep.astype(np.float32)
    ring = ndimage.binary_dilation(keep, iterations=1) & ~keep
    alpha[ring] = np.clip((1 - rgb.min(-1)[ring]) * 4, 0, 1)
    alpha = ndimage.gaussian_filter(alpha, 0.6) * (ndimage.binary_dilation(keep, iterations=1))
    out = np.dstack([rgb, alpha])
    Image.fromarray((out * 255).round().astype(np.uint8), "RGBA").save(d / "base.png")
    ys, xs = np.nonzero(keep)
    say(ok=True, step="cutout", file=str(d / "base.png"), size=list(rgb.shape[1::-1]), box=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])


def font(size):
    for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def grid(name):
    """The cut-out on grey with a 25 px grid (labels every 100 px), to read joint coordinates off."""
    d = char(name)
    im = Image.open(d / "base.png")
    w, h = im.size
    bg = Image.new("RGBA", im.size, (200, 200, 205, 255))
    bg.alpha_composite(im)
    g = ImageDraw.Draw(bg)
    f = font(14)
    for x in range(0, w, 25):
        g.line([(x, 0), (x, h)], fill=(255, 0, 0, 255) if x % 100 == 0 else (120, 120, 255, 255), width=1)
        if x % 100 == 0:
            g.text((x + 2, 2), str(x), fill=(200, 0, 0), font=f)
    for y in range(0, h, 25):
        g.line([(0, y), (w, y)], fill=(255, 0, 0, 255) if y % 100 == 0 else (120, 120, 255, 255), width=1)
        if y % 100 == 0:
            g.text((2, y + 2), str(y), fill=(200, 0, 0), font=f)
    bg.convert("RGB").save(d / "grid.png")
    say(ok=True, step="grid", file=str(d / "grid.png"))


BONES = [("hips", "spine"), ("spine", "chest"), ("chest", "neck"), ("neck", "head"),
         ("chest", "shoulderL"), ("shoulderL", "elbowL"), ("elbowL", "wristL"), ("wristL", "handL"),
         ("chest", "shoulderR"), ("shoulderR", "elbowR"), ("elbowR", "wristR"), ("wristR", "handR"),
         ("hips", "hipL"), ("hipL", "kneeL"), ("kneeL", "ankleL"), ("ankleL", "toeL"),
         ("hips", "hipR"), ("hipR", "kneeR"), ("kneeR", "ankleR"), ("ankleR", "toeR")]


def overlay(name):
    """The rig drawn over the picture: joints, bones, spring chains, region outlines and the face box."""
    d = char(name)
    rig = json.loads((d / "rig.json").read_text())
    im = Image.open(d / "base.png")
    bg = Image.new("RGBA", im.size, (235, 235, 240, 255))
    bg.alpha_composite(im)
    bg = bg.convert("RGB")
    g = ImageDraw.Draw(bg, "RGBA")  # on an RGB picture, RGBA fills blend
    f = font(13)
    J = rig["joints"]
    for reg in rig.get("regions", []):
        g.polygon([tuple(p) for p in reg["poly"]], outline=(0, 160, 255, 255), fill=(0, 160, 255, 40))
    for a, b in BONES:
        if a in J and b in J:
            g.line([tuple(J[a]), tuple(J[b])], fill=(255, 40, 120, 255), width=4)
    for s in rig.get("springs", []):
        pts = [tuple(p) for p in s["points"]]
        g.line(pts, fill=(0, 200, 120, 255), width=4)
    for k, (x, y) in J.items():
        g.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(255, 220, 0, 255), outline=(0, 0, 0, 255))
        g.text((x + 8, y - 8), k, fill=(0, 0, 0, 255), font=f)
    if "face" in rig:
        x0, y0, x1, y1 = rig["face"]
        g.rectangle([x0, y0, x1, y1], outline=(255, 120, 0, 255), width=3)
    bg.convert("RGB").save(d / "overlay.png")
    say(ok=True, step="overlay", file=str(d / "overlay.png"))


def faces(name, wanted):
    """Redraw only the face box for each face (the anime model's inpainting; the rest of the picture stays pixel for pixel)."""
    d = char(name)
    rig = json.loads((d / "rig.json").read_text())
    src = Image.open(d / "source.png").convert("RGB")
    x0, y0, x1, y1 = rig["face"]
    mask = Image.new("L", src.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=(x1 - x0) // 5, fill=255)
    look = json.loads((d / "prompt.json").read_text())["look"] if (d / "prompt.json").exists() else ""
    (d / "faces").mkdir(exist_ok=True)
    alpha = Image.open(d / "base.png").getchannel("A")
    for face in wanted or FACES:
        prompt = f"1girl, chibi, face close-up of the same character, {FACES.get(face, face)}, {look}, strength 0.75"
        img, seed = call("/edit", {"prompt": prompt, "image": b64(src), "mask": b64(mask), "model": "nsfw", "fast": True})
        img = img.convert("RGB").resize(src.size)
        # keep the original outside the face box (the service blends its edge already), then the cut-out's alpha
        img = Image.composite(img, src, mask.filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(3)))
        out = img.convert("RGBA")
        out.putalpha(alpha)
        out.save(d / "faces" / f"{face}.png")
        rig["faces"] = sorted(f.stem for f in (d / "faces").glob("*.png"))  # the studio loads just these
        (d / "rig.json").write_text(json.dumps(rig, indent=1) + "\n")
        say(ok=True, step="face", face=face, file=str(d / "faces" / f"{face}.png"), seed=seed)


BACK = ("Show the same character from behind: back view, her back to the viewer, the back of her head and hair, the back of "
        "her outfit, {extra} her head turned to look back over her right shoulder at the viewer with a cheerful smile. Same "
        "character, same outfit, same colours, same cute chibi anime style, same size and position, standing with arms slightly "
        "away from her body and legs slightly apart. Plain white background.")


def back(name, extra=""):
    """Her back view (for turning round): the image service's picture editor redraws her from behind, looking back over her
    shoulder; then the cut-out and the grid, in characters/NAME/back/ (rig it like the front)."""
    d = char(name)
    src = Image.open(d / "source.png").convert("RGB")
    img, seed = call("/edit", {"prompt": BACK.format(extra=extra + "," if extra else ""), "image": b64(src)}, timeout=900)
    b = char(f"{name}/back")
    img.convert("RGB").save(b / "source.png")
    say(ok=True, step="back", file=str(b / "source.png"), seed=seed)
    cutout(f"{name}/back")
    grid(f"{name}/back")


OUTFIT = ("Change only her clothes to: {outfit}. Keep everything else exactly the same: the same character, face, hair, ears and "
          "tail, the same pose with arms slightly away from her body and legs slightly apart, the same size and position, the same "
          "cute chibi anime style, fully clothed. Plain white background.")


def outfit(name, new, wear):
    """The same character in other clothes, as a new character NEW: the picture editor redraws her outfit in the same pose, so
    her rig (joints, regions, springs) is copied over; check its overlay and labels, then make her faces."""
    d, n = char(name), char(new)
    src = Image.open(d / "source.png").convert("RGB")
    img, seed = call("/edit", {"prompt": OUTFIT.format(outfit=wear), "image": b64(src)}, timeout=900)
    img = img.convert("RGB")
    if img.size != src.size:  # the editor may return another size: back to the original's, so the joints still fit
        img = img.resize(src.size, Image.LANCZOS)
    img.save(n / "source.png")
    rig = json.loads((d / "rig.json").read_text())
    rig.pop("faces", None)
    who = rig.get("name", name).split(" (")[0]
    rig["name"] = f"{who} ({new})"
    rig["about"] = f"{who} in {wear}."
    (n / "rig.json").write_text(json.dumps(rig, indent=1) + "\n")
    (n / "prompt.json").write_text(json.dumps({"look": f"outfit: {wear}", "from": name, "seed": seed}, indent=1) + "\n")
    say(ok=True, step="outfit", file=str(n / "source.png"), seed=seed)
    cutout(new)
    overlay(new)
    if (d / "back" / "rig.json").exists():  # her back view in the same clothes, with the same back rig
        bs = Image.open(d / "back" / "source.png").convert("RGB")
        bimg, _ = call("/edit", {"prompt": OUTFIT.format(outfit=wear).replace("the same pose", "seen from behind, looking back over her shoulder, the same pose"), "image": b64(bs)}, timeout=900)
        bimg = bimg.convert("RGB")
        if bimg.size != bs.size:
            bimg = bimg.resize(bs.size, Image.LANCZOS)
        nb = char(f"{new}/back")
        bimg.save(nb / "source.png")
        (nb / "rig.json").write_text((d / "back" / "rig.json").read_text())
        cutout(f"{new}/back")
        overlay(f"{new}/back")
        say(ok=True, step="outfit-back", file=str(nb / "source.png"))


def facesheet(name):
    """All of a character's faces side by side (cropped around the face box), labelled."""
    d = char(name)
    rig = json.loads((d / "rig.json").read_text())
    x0, y0, x1, y1 = rig["face"]
    pad = (x1 - x0) // 3
    box = (max(0, x0 - pad), max(0, y0 - pad * 2), x1 + pad, y1 + pad)
    files = [("base", d / "base.png")] + sorted((f.stem, f) for f in (d / "faces").glob("*.png"))
    cw, chh = box[2] - box[0], box[3] - box[1]
    sheet = Image.new("RGB", (cw * min(5, len(files)), (chh + 24) * ((len(files) + 4) // 5)), (255, 244, 250))
    g = ImageDraw.Draw(sheet)
    for i, (label, f) in enumerate(files):
        im = Image.open(f).convert("RGBA").crop(box)
        bg = Image.new("RGBA", im.size, (255, 244, 250, 255)); bg.alpha_composite(im)
        x, y = (i % 5) * cw, (i // 5) * (chh + 24)
        sheet.paste(bg.convert("RGB"), (x, y + 24))
        g.text((x + 6, y + 4), label, fill=(90, 60, 110), font=font(16))
    sheet.save(d / "faces.jpg", quality=88)
    say(ok=True, step="facesheet", file=str(d / "faces.jpg"))


def frames(path, every, start, count, out):
    """Frames of a GIF or video every `every` seconds, on one sheet with their times and a 50 px grid (to read joints off)."""
    import subprocess, tempfile
    every, start, count = float(every), float(start), int(count)
    tmp = Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-i", path, "-vf", f"fps={1 / every}", "-frames:v", str(count), str(tmp / "f%03d.png")], check=True)
    fs = sorted(tmp.glob("f*.png"))
    if not fs:
        raise RuntimeError("no frames: check the path and the start time")
    w, h = Image.open(fs[0]).size
    cols = min(4, len(fs))
    sheet = Image.new("RGB", (w * cols, (h + 22) * ((len(fs) + cols - 1) // cols)), (30, 30, 36))
    g = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGB")
        gd = ImageDraw.Draw(im)
        for x in range(0, w, 50):
            gd.line([(x, 0), (x, h)], fill=(255, 60, 60) if x % 100 == 0 else (80, 80, 160), width=1)
        for y in range(0, h, 50):
            gd.line([(0, y), (w, y)], fill=(255, 60, 60) if y % 100 == 0 else (80, 80, 160), width=1)
        x, y = (i % cols) * w, (i // cols) * (h + 22)
        sheet.paste(im, (x, y + 22))
        g.text((x + 4, y + 3), f"#{i}  {start + i * every:.2f} s   (grid: 50 px, red every 100)", fill=(255, 230, 120), font=font(14))
    Path(out).mkdir(parents=True, exist_ok=True)
    sheet.save(Path(out) / "frames.jpg", quality=88)
    say(ok=True, step="frames", file=str(Path(out) / "frames.jpg"), frame_size=[w, h], frames=len(fs))


if __name__ == "__main__":
    cmd, name, *rest = sys.argv[1:]
    try:
        if cmd == "generate":  # generate NAME "look" [seed] [chibi|adult]
            generate(name, rest[0], rest[1] if len(rest) > 1 and rest[1] else None, rest[2] if len(rest) > 2 else "chibi")
        elif cmd == "cutout":
            cutout(name)
        elif cmd == "grid":
            grid(name)
        elif cmd == "overlay":
            overlay(name)
        elif cmd == "faces":
            faces(name, rest)
        elif cmd == "back":
            back(name, rest[0] if rest else "")
        elif cmd == "outfit":
            outfit(name, rest[0], rest[1])
        elif cmd == "facesheet":
            facesheet(name)
        elif cmd == "frames":
            frames(*rest)
        else:
            raise SystemExit(f"unknown command {cmd}")
    except Exception as e:
        say(ok=False, step=cmd, error=str(e))
        sys.exit(1)
