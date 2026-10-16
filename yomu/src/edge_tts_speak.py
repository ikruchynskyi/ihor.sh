#!/usr/bin/env python3
"""
One-shot Edge TTS generator for Yomu (ja-JP-NanamiNeural).
Streams MP3 audio bytes directly to stdout buffer.
Zero disk storage on the server.
"""
import asyncio
import sys
import edge_tts

async def speak():
    if len(sys.argv) < 2:
        print("Usage: edge_tts_speak.py <text> [speed] [voice]", file=sys.stderr)
        sys.exit(1)

    text = sys.argv[1].strip()
    speed = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    voice = sys.argv[3] if len(sys.argv) > 3 else "ja-JP-NanamiNeural"

    percent = int(round((speed - 1.0) * 100))
    rate_str = f"{percent:+d}%"

    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])

    sys.stdout.buffer.write(audio)

if __name__ == "__main__":
    asyncio.run(speak())
