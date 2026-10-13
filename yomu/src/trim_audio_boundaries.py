#!/usr/bin/env python3
"""
Audio Boundary Trimmer for Yomu audio assets.
Trims leading dead air (leaving a clean 25ms lead-in with 10ms fade-in)
and trailing artifacts (leaving 80ms decay with 20ms fade-out).
Processes audio files in parallel across all CPU cores.
"""

import concurrent.futures
import glob
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import numpy as np

SAMPLE_RATE = 48000
THRESHOLD = 0.015  # ~ -36 dB
LEAD_PAD_MS = 25   # 25ms lead-in breath
TAIL_PAD_MS = 80   # 80ms decay room
FADE_IN_MS = 10
FADE_OUT_MS = 20


def trim_file(path_str: str) -> tuple[str, bool, float, float]:
    path = Path(path_str)
    if not path.is_file() or path.suffix.lower() != ".mp3":
        return path_str, False, 0.0, 0.0

    # 1. Decode to raw 16-bit mono PCM via ffmpeg pipe
    decode_cmd = [
        "ffmpeg", "-nostdin", "-loglevel", "error",
        "-i", str(path),
        "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-"
    ]
    res = subprocess.run(decode_cmd, capture_output=True)
    if res.returncode != 0 or len(res.stdout) == 0:
        return path_str, False, 0.0, 0.0

    raw = np.frombuffer(res.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    abs_raw = np.abs(raw)
    above = np.where(abs_raw > THRESHOLD)[0]

    if len(above) == 0:
        return path_str, False, 0.0, 0.0

    first_idx = above[0]
    last_idx = above[-1]

    lead_samples = int(LEAD_PAD_MS * SAMPLE_RATE / 1000)
    tail_samples = int(TAIL_PAD_MS * SAMPLE_RATE / 1000)

    start_idx = max(0, first_idx - lead_samples)
    end_idx = min(len(raw), last_idx + tail_samples)

    orig_lead_ms = (first_idx / SAMPLE_RATE) * 1000.0
    trimmed_lead_ms = (first_idx - start_idx) / SAMPLE_RATE * 1000.0

    # If leading silence was already minimal (<= 40ms) and tail was already trimmed, skip re-encoding
    if start_idx == 0 and end_idx >= len(raw) - int(0.05 * SAMPLE_RATE):
        return path_str, False, orig_lead_ms, trimmed_lead_ms

    trimmed = raw[start_idx:end_idx].copy()
    fade_in_len = min(int(FADE_IN_MS * SAMPLE_RATE / 1000), len(trimmed) // 4)
    if fade_in_len > 0:
        trimmed[:fade_in_len] *= np.linspace(0.0, 1.0, fade_in_len)

    fade_out_len = min(int(FADE_OUT_MS * SAMPLE_RATE / 1000), len(trimmed) // 4)
    if fade_out_len > 0:
        trimmed[-fade_out_len:] *= np.linspace(1.0, 0.0, fade_out_len)

    out_int16 = (trimmed * 32767.0).astype(np.int16).tobytes()

    # Re-encode back to mp3
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_fp:
        tmp_name = tmp_fp.name

    try:
        encode_cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1",
            "-i", "pipe:0",
            "-b:a", "128k",
            tmp_name
        ]
        res_enc = subprocess.run(encode_cmd, input=out_int16, capture_output=True)
        if res_enc.returncode == 0 and os.path.exists(tmp_name) and os.path.getsize(tmp_name) > 0:
            os.replace(tmp_name, path)
            return path_str, True, orig_lead_ms, trimmed_lead_ms
    finally:
        if os.path.exists(tmp_name):
            try:
                os.remove(tmp_name)
            except Exception:
                pass

    return path_str, False, orig_lead_ms, trimmed_lead_ms


def process_directories(dirs: list[Path]):
    all_files = []
    for d in dirs:
        if d.is_dir():
            all_files.extend(list(d.glob("*.mp3")))

    print(f"Found {len(all_files)} audio files across {len(dirs)} directories to inspect/trim.")
    t0 = time.time()
    trimmed_count = 0
    max_workers = min(12, os.cpu_count() or 4)

    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(trim_file, str(f)): f for f in all_files}
        for future in concurrent.futures.as_completed(futures):
            path_str, changed, orig_lead, new_lead = future.result()
            if changed:
                trimmed_count += 1
                if trimmed_count % 50 == 0:
                    print(f"Trimmed {trimmed_count} files (e.g. {Path(path_str).name}: lead {orig_lead:.0f}ms -> {new_lead:.0f}ms)")

    elapsed = time.time() - t0
    print(f"\nCompleted! Trimmed leading delay on {trimmed_count}/{len(all_files)} files in {elapsed:.2f}s.")


def main():
    root = Path(__file__).resolve().parent.parent / "data" / "audio"
    target_dirs = [
        root / "words",
        root / "kana",
        root / "grammar",
        root / "talk",
    ]
    if len(sys.argv) > 1:
        target_dirs = [Path(a) for a in sys.argv[1:]]

    process_directories(target_dirs)


if __name__ == "__main__":
    main()
