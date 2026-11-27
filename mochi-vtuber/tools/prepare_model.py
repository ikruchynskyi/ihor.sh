#!/usr/bin/env python3
"""Make a browser-friendly copy of a Live2D model for the stream overlay.

The huohuo model ships 4 textures of 8192x8192 (about 1 GB of GPU memory); the overlay is a
small corner window, so the copy gets 2048x2048 textures. Everything else is copied as is.

    python3 vtuber/prepare_model.py ~/vtube/huohuo ~/vtube/huohuo-web
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()
size = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
model_file = next(src.glob("*.model3.json"))
model = json.loads(model_file.read_text())
dst.mkdir(parents=True, exist_ok=True)
for f in src.iterdir():
    if f.is_file() and (f.suffix == ".moc3" or f.name.endswith(".json")):
        shutil.copy2(f, dst / f.name)
textures = []
for i, rel in enumerate(model["FileReferences"]["Textures"]):
    out = dst / "textures" / ("texture_%02d.png" % i)
    out.parent.mkdir(exist_ok=True)
    subprocess.run(["sips", "-z", str(size), str(size), str(src / rel), "--out", str(out)],
                   check=True, stdout=subprocess.DEVNULL)
    textures.append("textures/" + out.name)
model["FileReferences"]["Textures"] = textures
(dst / model_file.name).write_text(json.dumps(model, indent=1, ensure_ascii=False))
print("model:", dst / model_file.name, "| textures:", len(textures), "x", size)
