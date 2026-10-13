#!/usr/bin/env python3
"""
Generate slow (0.7x) version of all dialogue lines for Yomu Japanese stories.
Uses FFmpeg high-quality pitch-preserving time stretching (atempo=0.7).
"""

import os
import re
import sys
import time
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

AUDIO_DIR = Path(__file__).resolve().parent.parent / "data" / "audio" / "stories"

PATTERN = re.compile(r"^[nN][1-5]-\d+_\d+\.mp3$")

def convert_slow(src_file: Path) -> tuple[Path, bool]:
    dst_file = src_file.parent / f"{src_file.stem}_slow.mp3"
    if dst_file.exists() and dst_file.stat().st_size > 1000:
        return dst_file, False  # already exists

    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel", "error",
        "-i", str(src_file),
        "-filter:a", "atempo=0.7",
        "-b:a", "128k",
        str(dst_file)
    ]
    res = subprocess.run(cmd, capture_output=True)
    return dst_file, (res.returncode == 0)

def main():
    if not AUDIO_DIR.exists():
        print(f"Error: audio directory not found: {AUDIO_DIR}")
        sys.exit(1)

    all_files = [f for f in AUDIO_DIR.glob("*.mp3") if PATTERN.match(f.name)]
    all_files.sort(key=lambda p: (p.stem.split("_")[0], int(p.stem.split("_")[1])))

    print(f"Found {len(all_files)} dialogue audio files to process for 0.7x slow mode.")

    t0 = time.time()
    generated = 0
    skipped = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(convert_slow, f) for f in all_files]
        for idx, fut in enumerate(futures, 1):
            dst, created = fut.result()
            if created:
                generated += 1
            elif dst.exists():
                skipped += 1
            else:
                failed += 1
            if idx % 100 == 0 or idx == len(futures):
                print(f"Progress: {idx}/{len(futures)} (new: {generated}, skipped: {skipped}, failed: {failed})")

    total_time = time.time() - t0
    print(f"\nCompleted slow audio generation in {total_time:.2f}s!")
    print(f"Generated: {generated}, Already existed: {skipped}, Failed: {failed}")

if __name__ == "__main__":
    main()
