#!/usr/bin/env python3
"""Claude Code UserPromptSubmit hook: show what the user typed as the stream avatar's speech.

Reads the hook JSON from stdin and posts the prompt to the proxy (POST /__vtuber/cmd) as a
"chat" bubble. Never blocks or fails the prompt: any error is swallowed.
"""
import json
import os
import re
import sys
import urllib.request

PROXY = os.environ.get("VTUBER_URL", "http://localhost:8790").rstrip("/")
MAX_CHARS = 220

try:
    prompt = (json.load(sys.stdin).get("prompt") or "").strip()
    if prompt and not prompt.startswith("/"):
        home = os.path.expanduser("~")
        prompt = prompt.replace(home, "~").replace(os.path.basename(home), "<user>")
        prompt = re.sub(r"/Users/[^/\s]+", "~", prompt)
        prompt = " ".join(prompt.split())
        if len(prompt) > MAX_CHARS:
            prompt = prompt[:MAX_CHARS - 1].rstrip() + "…"
        body = json.dumps({"say": prompt, "kind": "chat", "mood": "curious", "hold": 8}).encode()
        req = urllib.request.Request(PROXY + "/__vtuber/cmd", body, {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=1.5).read()
except Exception:
    pass
