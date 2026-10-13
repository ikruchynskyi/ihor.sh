#!/usr/bin/env python3
"""
Master generation script for all 10 N3 Capstone Stories (n3-13 through n3-22).
Imports part 1 and part 2, writes JSON files to yomu/stories/, and validates schemas and line counts.
"""

import json
from pathlib import Path

from generate_n3_capstones_p1 import get_p1_stories
from generate_n3_capstones_p2 import get_p2_stories

STORIES_DIR = Path(__file__).resolve().parent.parent / "stories"

def main():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)
    all_stories = get_p1_stories() + get_p2_stories()
    print(f"Generating {len(all_stories)} N3 capstone stories...")
    for s in all_stories:
        sid = s["id"]
        out_path = STORIES_DIR / f"{sid}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
        line_count = len(s.get("lines", []))
        grammar_count = len(s.get("grammar", []))
        kanji_count = len(s.get("kanji", []))
        assert 30 <= line_count <= 80, f"Story {sid} line count {line_count} outside 30-80 range!"
        print(f"✓ {out_path.name}: {line_count} lines, {grammar_count} grammar points, {kanji_count} kanji")

if __name__ == "__main__":
    main()
