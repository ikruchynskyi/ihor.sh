#!/usr/bin/env python3
"""Mochi vtuber overlay server: serves the overlay pages and the Live2D model, and relays commands.

    python3 vtuber_server.py                 # http://localhost:8790/
    python3 vtuber_server.py --port 8790 --model model/huohuo.model3.json --theme catgirl

Pages (transparent, meant to be click-through iframes or OBS browser sources):
    /__vtuber/overlay.html     the avatar (moods, emotes, speech bubble, face camera)
    /__vtuber/monologue.html   the hero's speech/thought bubbles
    /__vtuber/hud.html         alert banners, counters, goal bar
    /__vtuber/inject.js        one <script> that adds all three to any page on this origin
Control:
    POST /__vtuber/cmd   JSON {mood, emote, say, kind, hold, base, antics, monologue, thought,
                         mood_text, hero, alert, counters, goal}
    GET  /__vtuber/state the last state
"""
import argparse
import asyncio
import json
import mimetypes
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent


class Server:
    def __init__(self, args):
        self.model = (HERE / args.model).resolve() if not Path(args.model).is_absolute() else Path(args.model)
        self.theme = args.theme
        self.hero = args.hero
        self.build = str(int(time.time()))
        self.clients = set()
        self.state = {"base": "hyper", "counters": {}, "goal": None, "hero": self.hero}
        self.size = args.size

    async def handle(self, reader, writer):
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            lines = head.decode("latin-1").split("\r\n")
            method, target, _ = lines[0].split(" ", 2)
            headers = {k.strip().lower(): v.strip() for k, v in (l.split(":", 1) for l in lines[1:] if ":" in l)}
            await self.route(reader, writer, method, urlsplit(target).path, headers)
        except Exception as e:  # keep serving
            if not isinstance(e, (asyncio.IncompleteReadError, ConnectionError)):
                print("error", e)
        finally:
            writer.close()

    def reply(self, writer, status, body, ctype="application/json"):
        writer.write(("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nCache-Control: no-cache\r\n"
                      "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
                      "Connection: close\r\n\r\n" % (status, ctype, len(body))).encode())
        writer.write(body)

    async def route(self, reader, writer, method, path, headers):
        if method == "OPTIONS":
            self.reply(writer, "204 No Content", b"")
        elif path == "/__vtuber/cmd" and method == "POST":
            n = int(headers.get("content-length", "0"))
            cmd = json.loads(await reader.readexactly(n) if n else b"{}")
            if cmd.get("base"):
                self.state["base"] = cmd["base"]
            if cmd.get("hero"):
                self.state["hero"] = cmd["hero"]
            for k, v in (cmd.get("counters") or {}).items():
                if v is None:
                    self.state["counters"].pop(k, None)
                else:
                    self.state["counters"][k] = v
            if "goal" in cmd:
                self.state["goal"] = cmd["goal"]
            for q in list(self.clients):
                q.put_nowait(cmd)
            self.reply(writer, "200 OK", json.dumps({"ok": True, "overlays": len(self.clients)}).encode())
        elif path == "/__vtuber/events":
            q = asyncio.Queue()
            self.clients.add(q)
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n"
                         b"Access-Control-Allow-Origin: *\r\n\r\n")
            writer.write(("data: %s\n\n" % json.dumps({"initial": True, "build": self.build, **self.state})).encode())
            try:
                await writer.drain()
                while True:
                    try:
                        writer.write(("data: %s\n\n" % json.dumps(await asyncio.wait_for(q.get(), 15), ensure_ascii=False)).encode())
                    except asyncio.TimeoutError:
                        writer.write(b": keep-alive\n\n")
                    await writer.drain()
            except (ConnectionError, OSError):
                pass
            finally:
                self.clients.discard(q)
        elif path == "/__vtuber/state":
            self.reply(writer, "200 OK", json.dumps({**self.state, "overlays": len(self.clients)}).encode())
        elif path == "/__vtuber/config":
            self.reply(writer, "200 OK", json.dumps({"model": self.model.name, "theme": self.theme}).encode())
        elif path == "/__vtuber/inject.js":
            w, h = (int(x) for x in self.size.lower().split("x"))
            self.reply(writer, "200 OK", INJECT.replace("%W", str(w)).replace("%H", str(h)).encode(), "text/javascript")
        elif path in ("/", "/index.html"):
            self.reply(writer, "200 OK", DEMO.encode(), "text/html; charset=utf-8")
        elif path.startswith("/__vtuber/"):
            sub = unquote(path[len("/__vtuber/"):])
            root, rel = (self.model.parent, sub[len("model/"):]) if sub.startswith("model/") else (HERE / "web", sub)
            f = (root / rel).resolve()
            if not f.is_file() or root.resolve() not in f.parents:
                self.reply(writer, "404 Not Found", b"")
            else:
                ctype = "application/json" if f.name.endswith(".json") else (mimetypes.guess_type(f.name)[0] or "application/octet-stream")
                self.reply(writer, "200 OK", f.read_bytes(), ctype)
        else:
            self.reply(writer, "404 Not Found", b"")
        await writer.drain()

    async def run(self, port):
        srv = await asyncio.start_server(self.handle, "127.0.0.1", port)
        print("Mochi vtuber: http://localhost:%d/  (model %s, theme %s)" % (port, self.model.name, self.theme or "none"))
        async with srv:
            await srv.serve_forever()


# Adds the three click-through overlays to a page. Load it from this server:
#   <script src="http://localhost:8790/__vtuber/inject.js"></script>
INJECT = r"""(function () {
	var base = (document.currentScript && new URL(document.currentScript.src).origin) || "";
	function frame(id, src, place) {
		if (document.getElementById(id)) return;
		var f = document.createElement("iframe");
		f.id = id; f.src = base + src;
		f.setAttribute("aria-hidden", "true"); f.setAttribute("tabindex", "-1");
		f.style.cssText = "position:fixed;" + place + "border:0;background:transparent;pointer-events:none;z-index:2147483647;color-scheme:normal;";
		document.body.appendChild(f);
	}
	function add() {
		if (!document.body) return;
		frame("vtuber-avatar", "/__vtuber/overlay.html", "right:0;bottom:0;width:min(%Wpx,34vw);height:min(%Hpx,74vh);");
		frame("vtuber-talk", "/__vtuber/monologue.html", "left:16px;top:8px;width:min(520px,calc(100vw - 32px));height:420px;");
		frame("vtuber-hud", "/__vtuber/hud.html", "left:0;top:0;width:100vw;height:100vh;");
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
})();
"""

DEMO = """<!doctype html><html><head><meta charset="utf-8"><title>Mochi vtuber demo</title>
<style>body{margin:0;min-height:100vh;background:#2b2b36;color:#eee;font:16px system-ui;padding:20px}
button{margin:4px;padding:8px 12px;font:600 14px system-ui;border-radius:8px;border:0;cursor:pointer}</style></head>
<body><h2>Mochi vtuber demo</h2><p>Click to send commands (the overlays are click-through).</p><div id="b"></div>
<script>
const cmds = {
 "Mochi: hype": {emote:"hop", say:"GOOD MORNING CHAT!! Mochi is HERE!!"},
 "nya": {emote:"nya"}, "purr": {emote:"purr"}, "shock": {emote:"shock"}, "rage": {emote:"rage"},
 "sob": {emote:"sob"}, "doya": {emote:"doya"}, "sparkle": {emote:"sparkle"}, "dead": {emote:"dead"},
 "chat message": {say:"hello from the chat!", kind:"chat"},
 "hero line": {monologue:"I did not ask for a cat.", mood_text:"tired 3/10"},
 "hero thought": {monologue:"...but she is a good cat.", thought:true},
 "alert": {alert:{title:"RAID WON", sub:"the big lion fell", style:"raid"}},
 "counters": {counters:{"Dog count":1,"Deaths":0}},
 "goal": {goal:{label:"Boss HP", value:4720610, max:5675000}},
};
for (const [k, v] of Object.entries(cmds)) {
 const b = document.createElement("button"); b.textContent = k;
 b.onclick = () => fetch("/__vtuber/cmd", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(v)});
 document.getElementById("b").appendChild(b);
}
</script><script src="/__vtuber/inject.js"></script></body></html>"""


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8790)
    p.add_argument("--model", default="model/huohuo.model3.json")
    p.add_argument("--theme", default="catgirl", help="'catgirl' adds the bell; '' for none")
    p.add_argument("--hero", default="Truman Burbank", help="name on the hero's bubbles")
    p.add_argument("--size", default="420x720", help="avatar corner size WIDTHxHEIGHT")
    a = p.parse_args()
    try:
        asyncio.run(Server(a).run(a.port))
    except KeyboardInterrupt:
        pass
