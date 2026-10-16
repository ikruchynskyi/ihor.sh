#!/usr/bin/env python3
"""
Edge TTS In-Memory Streaming Server for Yomu Japanese Reader & Chat.
Synthesizes speech using Microsoft Edge Neural Voice (ja-JP-NanamiNeural).
Audio is generated directly in memory and streamed to the client with long-lived browser caching headers.
Zero server-side disk storage.
"""
import os
import sys
import asyncio
from aiohttp import web
import edge_tts

PORT = int(os.environ.get("EDGE_TTS_PORT", 5056))
HOST = os.environ.get("EDGE_TTS_HOST", "127.0.0.1")
DEFAULT_VOICE = "ja-JP-NanamiNeural"

async def handle_tts(request: web.Request) -> web.Response:
    text = request.query.get("text", "").strip()
    if not text:
        return web.json_response({"error": "text query parameter required"}, status=400)

    try:
        speed_param = float(request.query.get("speed", "1.0"))
    except ValueError:
        speed_param = 1.0
    speed = max(0.5, min(2.0, speed_param))
    voice = request.query.get("voice", DEFAULT_VOICE)

    percent = int(round((speed - 1.0) * 100))
    rate_str = f"{percent:+d}%"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])

        return web.Response(
            body=bytes(audio),
            content_type="audio/mpeg",
            headers={
                # Browser-level caching and reuse: browser caches audio for 1 year
                "Cache-Control": "public, max-age=31536000, immutable",
            }
        )
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "status": "ok",
        "service": "edge-tts",
        "voice": DEFAULT_VOICE,
        "storage": "in-memory (no server disk storage)"
    })

def create_app():
    app = web.Application()
    app.router.add_get("/tts", handle_tts)
    app.router.add_get("/health", handle_health)
    return app

if __name__ == "__main__":
    app = create_app()
    web.run_app(app, host=HOST, port=PORT, print=print)
