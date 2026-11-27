#!/usr/bin/env python3
"""Recolour a Live2D model's textures into a theme (a local, private copy; the source stays as is).

    python3 vtuber/recolor_model.py ~/vtube/huohuo-web ~/vtube/mochi-cat

Theme "catgirl" (Mochi): sage-green hair -> honey blonde, cyan ghost tail/flames -> fluffy blonde,
teal/navy outfit -> royal blue, dark cloth -> deep navy. Skin, whites and gold stay as they are.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, dst = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm, gm, bm = m & (mx == r), m & (mx == g) & (mx != r), m & (mx == b) & (mx != r) & (mx != g)
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    z = np.zeros_like(h)
    k = (h // 60).astype(int) % 6
    r = np.choose(k, [c, x, z, z, x, c]); g = np.choose(k, [x, c, c, x, z, z]); b = np.choose(k, [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def recolor(img):
    a = np.asarray(img.convert("RGBA")).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    h, s, v = rgb_to_hsv(rgb)
    h2, s2, v2 = h.copy(), s.copy(), v.copy()
    hair = (h >= 65) & (h < 162) & (s > 0.12)                      # sage-green hair, hair tufts, eyes
    h2[hair] = 38; s2[hair] = np.clip(s[hair] * 1.15, 0, 0.62); v2[hair] = np.clip(v[hair] * 1.12 + 0.06, 0, 1)
    tail = (h >= 162) & (h < 200) & (s > 0.2) & (v > 0.5)         # bright cyan: ghost tail, flames, hair glow
    h2[tail] = 36; s2[tail] = s[tail] * 0.55; v2[tail] = np.clip(v[tail] * 1.05 + 0.05, 0, 1)
    cloth = (h >= 162) & (h < 250) & ~tail & (s > 0.08)           # teal trims, navy coat
    h2[cloth] = 220; s2[cloth] = np.clip(s[cloth] * 1.6 + 0.2, 0, 0.85); v2[cloth] = np.clip(v[cloth] * 1.15 + 0.04, 0, 1)
    dark = (v < 0.22) & (s < 0.35) & ~hair                         # near-black cloth -> deep navy
    h2[dark] = 222; s2[dark] = 0.55; v2[dark] = np.maximum(v[dark], 0.16) * 1.1
    out = hsv_to_rgb(h2, s2, v2)
    return Image.fromarray((np.concatenate([out, alpha], -1) * 255).round().astype(np.uint8), "RGBA")


if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst)
for tex in sorted((dst / "textures").glob("*.png")):
    recolor(Image.open(tex)).save(tex)
    print("recoloured", tex.name)
