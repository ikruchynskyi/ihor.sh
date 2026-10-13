#!/usr/bin/env python3
"""
Batch Audio Generator for Yomu Japanese stories, vocabulary, kana, grammar, and talk scenes using Irodori-TTS.
Uses local checkpoint: Aratako/Irodori-TTS-v4.1-Small on Apple Silicon MPS.

Usage:
  /Users/irishdash/Irodori-TTS/.venv/bin/python yomu/src/irodori_gen.py --kana
  /Users/irishdash/Irodori-TTS/.venv/bin/python yomu/src/irodori_gen.py --talk
  /Users/irishdash/Irodori-TTS/.venv/bin/python yomu/src/irodori_gen.py --grammar [--level N5]
  /Users/irishdash/Irodori-TTS/.venv/bin/python yomu/src/irodori_gen.py --words [--level N5]
  /Users/irishdash/Irodori-TTS/.venv/bin/python yomu/src/irodori_gen.py [--unit n5-01] [--level N5]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
import numpy as np
import torch

# Add Irodori-TTS to python search path
IRODORI_REPO = Path("/Users/irishdash/Irodori-TTS")
if str(IRODORI_REPO) not in sys.path:
    sys.path.insert(0, str(IRODORI_REPO))

from irodori_tts.inference_runtime import (
    InferenceRuntime,
    RuntimeKey,
    SamplingRequest,
    default_runtime_device,
    save_wav,
)

DEFAULT_CHECKPOINT = (
    "/Users/irishdash/.cache/huggingface/hub/models--Aratako--Irodori-TTS-v4.1-Small/"
    "snapshots/2b28324dc263ed5e6638b3cf3dd94c82ead07b4b/model.safetensors"
)
DEFAULT_CODEC_REPO = "Aratako/Semantic-DACVAE-Japanese-32dim"

AUDIO_REF_DIR = Path(__file__).resolve().parent.parent / "data" / "audio" / "ref"

CHARACTER_PROFILES: dict[str, dict[str, any]] = {
    "サム": {
        "caption": "落ち着いた若い男性の声、自然な日常会話",
        "ref_wav": str(AUDIO_REF_DIR / "sam.wav"),
        "seed": 1001,
    },
    "ゆき": {
        "caption": "明るく優しい若い女性の声、自然な日常会話",
        "ref_wav": str(AUDIO_REF_DIR / "yuki.wav"),
        "seed": 2002,
    },
    "ブリップ": {
        "caption": "可愛らしく元気なマスコットキャラクターの声",
        "ref_wav": str(AUDIO_REF_DIR / "blip.wav"),
        "seed": 3003,
    },
    "ケン": {
        "caption": "明るく親切な若い男性の大学生の声、自然な日常会話",
        "seed": 2040,
    },
    "駅員": {
        "caption": "落ち着いた親切な駅員の男性の声",
        "seed": 4004,
    },
    "係{かかり}の人{ひと}": {
        "caption": "落ち着いた親切な係員の男性の声",
        "seed": 4004,
    },
    "店員": {
        "caption": "丁寧で礼儀正しい店員の女性の声",
        "seed": 5005,
    },
    "店の人": {
        "caption": "丁寧で親切な店員の女性の声",
        "seed": 5005,
    },
    "お父さん": {
        "caption": "落ち着いた優しい父親の男性の声",
        "seed": 6006,
    },
    "お母さん": {
        "caption": "温かく優しい母親の女性の声",
        "seed": 7007,
    },
    "おばあさん": {
        "caption": "優しく穏やかな高齢の女性の声",
        "seed": 8008,
    },
    "アナウンス": {
        "caption": "明瞭で丁寧なアナウンスの声",
        "seed": 9009,
    },
    "ホテル": {
        "caption": "丁寧で品のあるホテルの声",
        "seed": 1010,
    },
    "職人": {
        "caption": "落ち着いた熟練の年配の職人男性の声、経験豊富な響き",
        "seed": 6500,
    },
    "住人": {
        "caption": "親切で落ち着いた大人の声、自然な日常会話",
        "seed": 7500,
    },
    "担ぎ手": {
        "caption": "力強く元気な祭りの若者の男性の声、活気ある掛け声",
        "seed": 8200,
    },
    "ニュース": {
        "caption": "明瞭で正確なニュースキャスターの女性の声",
        "seed": 9009,
    },
    "管理人": {
        "caption": "頼もしく落ち着いた山荘の管理人の年配男性の声",
        "seed": 8500,
    },
    "救助隊": {
        "caption": "明瞭で緊迫感のある山岳救助隊の男性無線の声",
        "seed": 9500,
    },
}

DEFAULT_PROFILE = {
    "caption": "自然で明瞭な日本語の話し声",
    "seed": 42,
}

KANA_LIST = [
    # basic gojuon
    "あ", "い", "う", "え", "お",
    "か", "き", "く", "け", "こ",
    "さ", "し", "す", "せ", "そ",
    "た", "ち", "つ", "て", "と",
    "な", "に", "ぬ", "ね", "の",
    "は", "ひ", "ふ", "へ", "ほ",
    "ま", "み", "む", "め", "も",
    "や", "ゆ", "よ",
    "ら", "り", "る", "れ", "ろ",
    "わ", "を", "ん",
    # dakuten
    "が", "ぎ", "ぐ", "げ", "ご",
    "ざ", "じ", "ず", "ぜ", "ぞ",
    "だ", "ぢ", "づ", "で", "ど",
    "ば", "び", "ぶ", "べ", "ぼ",
    # handakuten
    "ぱ", "ぴ", "ぷ", "ぺ", "ぽ",
    # yoon
    "きゃ", "きゅ", "きょ",
    "しゃ", "しゅ", "しょ",
    "ちゃ", "ちゅ", "ちょ",
    "にゃ", "にゅ", "にょ",
    "ひゃ", "ひゅ", "ひょ",
    "みゃ", "みゅ", "みょ",
    "りゃ", "りゅ", "りょ",
    "ぎゃ", "ぎゅ", "ぎょ",
    "じゃ", "じゅ", "じょ",
    "びゃ", "びゅ", "びょ",
    "ぴゃ", "ぴゅ", "ぴょ",
    # loanwords
    "ふぁ", "ふぃ", "ふぇ", "ふぉ",
    "てぃ", "でぃ", "とぅ", "どぅ",
    "うぃ", "うぇ", "うぉ",
    "ちぇ", "しぇ", "じぇ",
    "ゔぁ", "ゔぃ", "ゔぇ", "ゔぉ", "ゔ",
]


def to_katakana(hira: str) -> str:
    res = []
    for c in hira:
        code = ord(c)
        if 0x3041 <= code <= 0x3096:
            res.append(chr(code + 0x60))
        else:
            res.append(c)
    return "".join(res)


def extract_plain_text(tokens: list) -> str:
    """Extract full surface string from story token list."""
    out = []
    for tok in tokens:
        if isinstance(tok, list) and len(tok) > 0 and tok[0]:
            out.append(str(tok[0]))
    return "".join(out).strip()


def extract_tts_text(tokens: list) -> tuple[str, str]:
    """Extract display text and normalized TTS prompt string."""
    display_text = extract_plain_text(tokens)
    tts_text = display_text.rstrip("。. \t\r\n")
    return display_text, tts_text


def clean_audio_boundaries(
    raw_audio: np.ndarray,
    sr: int,
    lead_pad_ms: int = 25,
    tail_pad_ms: int = 80,
    threshold: float = 0.015,
) -> np.ndarray:
    """Trim leading dead air and trailing artifacts from synthesized audio.
    Finds first audible sample above threshold, preserves 25ms lead-in with 10ms fade-in.
    Finds last audible sample above threshold, preserves 80ms decay with 20ms fade-out."""
    if raw_audio.ndim > 1:
        mono = np.mean(raw_audio, axis=0) if raw_audio.shape[0] < raw_audio.shape[1] else np.mean(raw_audio, axis=1)
    else:
        mono = raw_audio

    abs_mono = np.abs(mono)
    above = np.where(abs_mono > threshold)[0]
    if len(above) == 0:
        return raw_audio

    first_idx = above[0]
    last_idx = above[-1]

    lead_samples = int(lead_pad_ms * sr / 1000)
    start_idx = max(0, first_idx - lead_samples)

    tail_samples = int(tail_pad_ms * sr / 1000)
    end_idx = min(len(mono), last_idx + tail_samples)

    if end_idx <= start_idx:
        return raw_audio

    out = raw_audio[..., start_idx:end_idx].copy()

    fade_in_len = min(int(0.01 * sr), out.shape[-1] // 4)
    if fade_in_len > 0:
        fade_in = np.linspace(0.0, 1.0, fade_in_len)
        out[..., :fade_in_len] *= fade_in

    fade_out_len = min(int(0.02 * sr), out.shape[-1] // 4)
    if fade_out_len > 0:
        fade_out = np.linspace(1.0, 0.0, fade_out_len)
        out[..., -fade_out_len:] *= fade_out

    return out


def clean_audio_tail(raw_audio: np.ndarray, sr: int, pad_ms: int = 100) -> np.ndarray:
    return clean_audio_boundaries(raw_audio, sr)


def convert_wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    """Convert WAV to MP3 using ffmpeg or afconvert."""
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        wav_path,
        "-b:a",
        "128k",
        mp3_path,
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode == 0:
        return True

    cmd_af = ["afconvert", "-f", "mp4f", "-d", "aac", "-b", "128000", wav_path, mp3_path]
    res_af = subprocess.run(cmd_af, capture_output=True)
    return res_af.returncode == 0


def text_hash(text: str) -> str:
    """Deterministic 12-char sha1 hex hash for audio files."""
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:12]


def save_section_manifest(out_dir: Path, section_key: str, data_map: dict[str, str]) -> dict:
    manifest_path = out_dir / "manifest.json"
    existing = {}
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as fp:
                existing = json.load(fp).get(section_key, {})
        except Exception:
            pass
    merged = {**existing, **data_map}
    data = {
        "_v": int(time.time()),
        section_key: merged,
    }
    with open(manifest_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, indent=2, ensure_ascii=False)
    return data


def update_manifest(out_dir: Path) -> dict[str, list[int]]:
    """Scan existing story audio files and save manifest.json."""
    manifest: dict[str, list[int]] = {}
    for f in out_dir.glob("*.mp3"):
        stem = f.stem
        parts = stem.split("_")
        if len(parts) == 2 and parts[1].isdigit():
            story_id, idx = parts[0], int(parts[1])
            manifest.setdefault(story_id, []).append(idx)
    for k in manifest:
        manifest[k].sort()
    manifest["_v"] = int(time.time())
    manifest_path = out_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, indent=2, ensure_ascii=False)
    return manifest


def get_runtime(checkpoint: str, device: str) -> InferenceRuntime:
    print(f"\nInitializing Irodori-TTS runtime on device '{device}'...")
    t_start = time.time()
    runtime = InferenceRuntime.from_key(
        RuntimeKey(
            checkpoint=checkpoint,
            model_device=device,
            codec_repo=DEFAULT_CODEC_REPO,
            model_precision="fp32",
            codec_device=device,
            codec_precision="fp32",
        )
    )
    if hasattr(runtime, "watermarker"):
        runtime.watermarker.model = None
    print(f"Runtime initialized in {time.time() - t_start:.2f}s\n")
    return runtime


def synthesize_batch(
    runtime: InferenceRuntime,
    jobs: list[dict],
    default_caption: str,
    default_seed: int,
    ref_wav: str | None = None,
    num_steps: int = 25,
    on_success: Callable[[dict], None] | None = None,
) -> int:
    has_ref = bool(ref_wav and Path(ref_wav).is_file())
    t_start = time.time()
    success = 0
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_wav = os.path.join(tmp_dir, "synth.wav")
        for idx, job in enumerate(jobs, 1):
            text = job["tts_text"]
            target_mp3 = Path(job["target_mp3"])
            caption = job.get("caption", default_caption)
            seed = job.get("seed", default_seed)
            job_ref = job.get("ref_wav", ref_wav)
            has_job_ref = bool(job_ref and Path(job_ref).is_file())

            print(f"[{idx}/{len(jobs)}] \"{job.get('label', text)}\" ... ", end="", flush=True)
            t_item = time.time()
            req = SamplingRequest(
                text=text.rstrip("。. \t\r\n"),
                caption=caption,
                ref_wav=job_ref if has_job_ref else None,
                no_ref=not has_job_ref,
                seed=seed,
                num_steps=num_steps,
            )
            try:
                res = runtime.synthesize(req)
                raw_audio = res.audio.squeeze().cpu().numpy()
                clean_audio = clean_audio_tail(raw_audio, runtime.codec.sample_rate)
                clean_tensor = torch.from_numpy(clean_audio).unsqueeze(0)
                if clean_tensor.ndim == 2 and clean_tensor.shape[0] != 1:
                    clean_tensor = clean_tensor.unsqueeze(0)
                save_wav(tmp_wav, clean_tensor, sample_rate=runtime.codec.sample_rate)
                ok = convert_wav_to_mp3(tmp_wav, str(target_mp3))
                if ok and target_mp3.exists():
                    sz = target_mp3.stat().st_size // 1024
                    print(f"DONE ({sz} KB, {time.time() - t_item:.2f}s)")
                    success += 1
                    if on_success:
                        try:
                            on_success(job)
                        except Exception:
                            pass
                else:
                    print("FAILED (conversion error)")
            except Exception as e:
                print(f"FAILED ({e})")
    total_time = time.time() - t_start
    print(f"\nBatch complete: {success}/{len(jobs)} in {total_time:.1f}s")
    return success


def main():
    parser = argparse.ArgumentParser(description="Generate story, words, kana, grammar, and talk audio with Irodori-TTS.")
    parser.add_argument("--unit", default=None, help="Specific unit id, e.g. n5-01")
    parser.add_argument("--level", default=None, help="Specific JLPT level, e.g. N5, N4, N3")
    parser.add_argument("--all", action="store_true", help="Process all items")
    parser.add_argument("--words", action="store_true", help="Generate vocabulary word audio")
    parser.add_argument("--kana", action="store_true", help="Generate kana audio")
    parser.add_argument("--talk", action="store_true", help="Generate talk scenes audio")
    parser.add_argument("--grammar", action="store_true", help="Generate grammar examples audio")
    parser.add_argument("--text", default=None, help="Single phrase to synthesize on demand")
    parser.add_argument("--output", default=None, help="Output MP3 path for single text mode")
    parser.add_argument("--device", default="mps", help="Inference device (mps, cpu, cuda)")
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT, help="Checkpoint path")
    parser.add_argument("--steps", type=int, default=30, help="Diffusion sampling steps (default: 30)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing audio files")
    parser.add_argument("--dry-run", action="store_true", help="Print lines without generating")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent

    # --- Mode 1: Single text on demand ---
    if args.text and args.output:
        out_mp3 = Path(args.output)
        out_mp3.parent.mkdir(parents=True, exist_ok=True)
        runtime = get_runtime(args.checkpoint, args.device)
        clean_text = args.text.strip().rstrip("。. \t\r\n")
        ref_wav = str(AUDIO_REF_DIR / "yuki.wav")
        has_ref = Path(ref_wav).is_file()
        req = SamplingRequest(
            text=clean_text,
            caption="優しく明瞭な若い女性の声、自然な日常会話",
            ref_wav=ref_wav if has_ref else None,
            no_ref=not has_ref,
            seed=42,
            num_steps=args.steps,
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_wav = os.path.join(tmp_dir, "single.wav")
            res = runtime.synthesize(req)
            raw_audio = res.audio.squeeze().cpu().numpy()
            clean_audio = clean_audio_tail(raw_audio, runtime.codec.sample_rate)
            clean_tensor = torch.from_numpy(clean_audio).unsqueeze(0)
            if clean_tensor.ndim == 2 and clean_tensor.shape[0] != 1:
                clean_tensor = clean_tensor.unsqueeze(0)
            save_wav(tmp_wav, clean_tensor, sample_rate=runtime.codec.sample_rate)
            convert_wav_to_mp3(tmp_wav, str(out_mp3))
        print("Done!")
        return

    # --- Mode 2: Kana Generation ---
    if args.kana:
        kana_dir = project_root / "data" / "audio" / "kana"
        kana_dir.mkdir(parents=True, exist_ok=True)
        kana_map: dict[str, str] = {}
        jobs = []
        for k in KANA_LIST:
            h = text_hash(k)
            kana_map[k] = h
            kana_map[to_katakana(k)] = h
            target_mp3 = kana_dir / f"{h}.mp3"
            if not target_mp3.exists() or args.force:
                jobs.append({
                    "label": k,
                    "tts_text": k,
                    "target_mp3": target_mp3,
                })
        print(f"Kana terms: {len(KANA_LIST)} (with Katakana aliases: {len(kana_map)})")
        print(f"Kana needing generation: {len(jobs)}")
        if args.dry_run:
            for j in jobs:
                print(f"Kana '{j['label']}' -> {j['target_mp3'].name}")
            return
        if not jobs:
            print("All kana audio already generated! Updating manifest.")
            save_section_manifest(kana_dir, "kana", kana_map)
            return

        runtime = get_runtime(args.checkpoint, args.device)
        ref_wav = str(AUDIO_REF_DIR / "yuki.wav")
        synthesize_batch(
            runtime,
            jobs,
            default_caption="優しく明瞭な女性の声、日本語の五十音の正確な発音",
            default_seed=1001,
            ref_wav=ref_wav,
            num_steps=min(25, args.steps),
        )
        save_section_manifest(kana_dir, "kana", kana_map)
        print(f"Kana manifest saved to {kana_dir / 'manifest.json'}")
        return

    # --- Mode 3: Talk Scenes Generation ---
    if args.talk:
        talk_dir = project_root / "data" / "audio" / "talk"
        talk_dir.mkdir(parents=True, exist_ok=True)
        talk_js_path = project_root / "talk.js"
        with open(talk_js_path, "r", encoding="utf-8") as fp:
            content = fp.read()

        blip_matches = re.findall(r'blip:\s*"([^"]+)"', content)
        you_blocks = re.findall(r'you:\s*\[([^\]]+)\]', content)
        you_matches = []
        for blk in you_blocks:
            for item in re.findall(r'"([^"]+)"', blk):
                if not item.startswith("re:"):
                    you_matches.append(item)

        talk_map: dict[str, str] = {}
        jobs = []
        seen = set()

        for b_text in blip_matches:
            clean = b_text.strip()
            h = text_hash(clean)
            talk_map[clean] = h
            if clean not in seen:
                seen.add(clean)
                target_mp3 = talk_dir / f"{h}.mp3"
                if not target_mp3.exists() or args.force:
                    jobs.append({
                        "label": f"Blip: {clean}",
                        "tts_text": clean,
                        "target_mp3": target_mp3,
                        "caption": "可愛らしく元気なマスコットキャラクターの声",
                        "ref_wav": str(AUDIO_REF_DIR / "blip.wav"),
                        "seed": 3003,
                    })

        for y_text in you_matches:
            clean = y_text.strip()
            h = text_hash(clean)
            talk_map[clean] = h
            if clean not in seen:
                seen.add(clean)
                target_mp3 = talk_dir / f"{h}.mp3"
                if not target_mp3.exists() or args.force:
                    jobs.append({
                        "label": f"You: {clean}",
                        "tts_text": clean,
                        "target_mp3": target_mp3,
                        "caption": "優しく明瞭な若い女性の声、自然な日常会話",
                        "ref_wav": str(AUDIO_REF_DIR / "yuki.wav"),
                        "seed": 2002,
                    })

        print(f"Talk scene phrases collected: {len(talk_map)}")
        print(f"Talk phrases needing generation: {len(jobs)}")
        if args.dry_run:
            for j in jobs:
                print(f"{j['label']} -> {j['target_mp3'].name}")
            return
        if not jobs:
            print("All talk phrases already generated! Updating manifest.")
            save_section_manifest(talk_dir, "talk", talk_map)
            return

        runtime = get_runtime(args.checkpoint, args.device)
        synthesize_batch(
            runtime,
            jobs,
            default_caption="優しく明瞭な若い女性の声、自然な日常会話",
            default_seed=2002,
            ref_wav=str(AUDIO_REF_DIR / "yuki.wav"),
            num_steps=min(25, args.steps),
        )
        save_section_manifest(talk_dir, "talk", talk_map)
        print(f"Talk manifest saved to {talk_dir / 'manifest.json'}")
        return

    # --- Mode 4: Grammar Examples Generation ---
    if args.grammar:
        grammar_dir = project_root / "data" / "audio" / "grammar"
        grammar_dir.mkdir(parents=True, exist_ok=True)
        grammar_path = project_root / "data" / "grammar.json"
        with open(grammar_path, "r", encoding="utf-8") as fp:
            grammar_data = json.load(fp)

        grammar_map: dict[str, str] = {}
        jobs = []
        seen = set()

        # Quiz negative prompt
        chigau = "ちがう"
        h_chigau = text_hash(chigau)
        grammar_map[chigau] = h_chigau
        seen.add(chigau)
        target_chigau = grammar_dir / f"{h_chigau}.mp3"
        if not target_chigau.exists() or args.force:
            jobs.append({
                "label": chigau,
                "tts_text": chigau,
                "target_mp3": target_chigau,
            })

        for p in grammar_data:
            if args.level and p.get("level", "").upper() != args.level.upper():
                continue
            for ex in p.get("examples", []):
                t_tokens = ex.get("t", [])
                plain = extract_plain_text(t_tokens)
                if not plain:
                    continue
                h = text_hash(plain)
                grammar_map[plain] = h
                grammar_map[plain.rstrip("。. \t\r\n")] = h
                if plain not in seen:
                    seen.add(plain)
                    target_mp3 = grammar_dir / f"{h}.mp3"
                    if not target_mp3.exists() or args.force:
                        jobs.append({
                            "label": plain,
                            "tts_text": plain,
                            "target_mp3": target_mp3,
                        })

        print(f"Grammar sentences collected: {len(seen)}")
        print(f"Grammar sentences needing generation: {len(jobs)}")
        if args.dry_run:
            for j in jobs:
                print(f"Grammar '{j['label']}' -> {j['target_mp3'].name}")
            return
        if not jobs:
            print("All grammar audio already generated! Updating manifest.")
            save_section_manifest(grammar_dir, "grammar", grammar_map)
            return

        runtime = get_runtime(args.checkpoint, args.device)
        ref_wav = str(AUDIO_REF_DIR / "yuki.wav")
        synthesize_batch(
            runtime,
            jobs,
            default_caption="優しく明瞭な若い女性の声、標準語の例文発音",
            default_seed=2002,
            ref_wav=ref_wav,
            num_steps=min(25, args.steps),
        )
        save_section_manifest(grammar_dir, "grammar", grammar_map)
        print(f"Grammar manifest saved to {grammar_dir / 'manifest.json'}")
        return

    # --- Mode 5: Vocabulary words generation ---
    if args.words:
        words_dir = project_root / "data" / "audio" / "words"
        words_dir.mkdir(parents=True, exist_ok=True)
        unique_words: dict[str, str] = {}
        reading_aliases: dict[str, str] = {}
        jobs = []
        seen = set()

        stories_dir = project_root / "stories"

        def story_sort_key(p: Path):
            stem = p.stem.lower()
            lvl_rank = 0 if stem.startswith("n5") else 1 if stem.startswith("n4") else 2
            try:
                num = int(stem.split("-")[1])
            except Exception:
                num = 999
            return (lvl_rank, num, stem)

        story_files = sorted(stories_dir.glob("n*.json"), key=story_sort_key)
        if args.unit:
            story_files = [f for f in story_files if f.stem == args.unit.lower()]
        elif args.level:
            lvl = args.level.lower()
            story_files = [f for f in story_files if f.stem.startswith(lvl)]

        for sf in story_files:
            try:
                with open(sf, "r", encoding="utf-8") as fp:
                    data = json.load(fp)
            except Exception:
                continue

            for w_entry in data.get("words", []):
                s = w_entry.get("s", "").strip()
                r = w_entry.get("r", "").strip()
                if s:
                    h = text_hash(s)
                    unique_words[s] = h
                    if r and r != s and re.search(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\w]", r):
                        reading_aliases[r] = h
                    if s not in seen:
                        seen.add(s)
                        target_mp3 = words_dir / f"{h}.mp3"
                        if not target_mp3.exists() or args.force:
                            jobs.append({"label": s, "tts_text": s, "target_mp3": target_mp3})

            for line in data.get("lines", []):
                for tok in line.get("t", []):
                    if not isinstance(tok, list) or len(tok) == 0 or not tok[0]:
                        continue
                    if len(tok) > 3 and tok[3] == "x":
                        continue
                    w = str(tok[0]).strip()
                    if len(w) == 1 and not (0x4E00 <= ord(w) <= 0x9FFF):
                        continue
                    if not re.search(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\w]", w):
                        continue
                    h = text_hash(w)
                    unique_words[w] = h
                    if len(tok) > 1 and tok[1]:
                        r = str(tok[1]).strip()
                        if r and r != w and re.search(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\w]", r):
                            reading_aliases[r] = h

                    if w not in seen:
                        seen.add(w)
                        target_mp3 = words_dir / f"{h}.mp3"
                        if not target_mp3.exists() or args.force:
                            jobs.append({"label": w, "tts_text": w, "target_mp3": target_mp3})

        def save_current_words_manifest():
            existing_stems = {f.stem for f in words_dir.glob("*.mp3")}
            word_map = {}
            prev_path = words_dir / "manifest.json"
            if prev_path.exists():
                try:
                    with open(prev_path, "r", encoding="utf-8") as fp:
                        for k, v in json.load(fp).get("words", {}).items():
                            if v in existing_stems:
                                word_map[k] = v
                except Exception:
                    pass

            for r, h in reading_aliases.items():
                if (words_dir / f"{text_hash(r)}.mp3").exists():
                    word_map[r] = text_hash(r)
                elif h in existing_stems:
                    word_map[r] = h

            for w, h in unique_words.items():
                if h in existing_stems:
                    word_map[w] = h

            save_section_manifest(words_dir, "words", word_map)
            return word_map

        # Save verified words to manifest immediately before generation
        initial_map = save_current_words_manifest()
        print(f"Total vocabulary terms collected: {len(unique_words)} (aliases: {len(reading_aliases)})")
        print(f"Words manifest currently has {len(initial_map)} verified playable entries.")
        print(f"Words needing generation: {len(jobs)}")

        if args.dry_run:
            for j in jobs:
                print(f"Word '{j['label']}' -> {j['target_mp3'].name}")
            return

        if not jobs:
            print("All words already generated! Words manifest up to date.")
            return

        runtime = get_runtime(args.checkpoint, args.device)
        ref_wav = str(AUDIO_REF_DIR / "yuki.wav")
        steps = 18 if args.steps == 30 else args.steps

        last_save_count = 0
        def on_item_success(job):
            nonlocal last_save_count
            last_save_count += 1
            if last_save_count >= 15:
                last_save_count = 0
                save_current_words_manifest()

        synthesize_batch(
            runtime,
            jobs,
            default_caption="優しく明瞭な若い女性の声、標準語の単語発音",
            default_seed=5555,
            ref_wav=ref_wav,
            num_steps=steps,
            on_success=on_item_success,
        )
        final_map = save_current_words_manifest()
        print(f"Manifest written to {words_dir / 'manifest.json'} with {len(final_map)} words.")
        return

    # --- Mode 6: Story lines generation ---
    stories_dir = project_root / "stories"
    story_files = sorted(stories_dir.glob("n*.json"))
    if args.unit:
        story_files = [f for f in story_files if f.stem == args.unit.lower()]
    elif args.level:
        lvl = args.level.lower()
        story_files = [f for f in story_files if f.stem.startswith(lvl)]
    elif not args.all:
        story_files = [f for f in story_files if f.stem == "n5-01"]

    audio_dir = project_root / "data" / "audio" / "stories"
    audio_dir.mkdir(parents=True, exist_ok=True)
    jobs = []
    for sf in story_files:
        try:
            with open(sf, "r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception as e:
            print(f"Error loading {sf}: {e}")
            continue

        story_id = data.get("id", sf.stem)
        lines = data.get("lines", [])
        for i, l in enumerate(lines):
            raw_text, tts_text = extract_tts_text(l.get("t", []))
            who = l.get("who", "")
            target_mp3 = audio_dir / f"{story_id}_{i}.mp3"
            if not target_mp3.exists() or args.force:
                profile = CHARACTER_PROFILES.get(who, DEFAULT_PROFILE)
                jobs.append({
                    "label": f"{story_id} L{i:02d} ({who}): {raw_text}",
                    "tts_text": tts_text,
                    "target_mp3": target_mp3,
                    "caption": profile.get("caption", DEFAULT_PROFILE["caption"]),
                    "seed": profile.get("seed", DEFAULT_PROFILE["seed"]),
                    "ref_wav": profile.get("ref_wav"),
                })

    print(f"Target stories: {len(story_files)}")
    print(f"Total lines to generate: {len(jobs)}")

    if args.dry_run:
        for j in jobs:
            print(f"[{j['label']}] -> {j['target_mp3'].name}")
        return

    if not jobs:
        print("All requested audio files already exist! Updating manifest.")
        manifest = update_manifest(audio_dir)
        print(f"Manifest updated with {sum(len(v) for v in manifest.values())} total lines.")
        return

    runtime = get_runtime(args.checkpoint, args.device)
    synthesize_batch(
        runtime,
        jobs,
        default_caption=DEFAULT_PROFILE["caption"],
        default_seed=DEFAULT_PROFILE["seed"],
        num_steps=args.steps,
    )
    manifest = update_manifest(audio_dir)
    print(f"Manifest written to {audio_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
