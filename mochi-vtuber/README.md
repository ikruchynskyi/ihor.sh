# Mochi: a reusable stream vtuber overlay

A Live2D catgirl co-host (Mochi) plus a hero speech feed and a stream HUD, as transparent,
click-through overlays you can put on any web page or in OBS. Everything is driven by small JSON
commands over HTTP, so an AI agent, a script or a hook can run the show.

## Quick start

    python3 vtuber_server.py            # no dependencies, Python 3.8+
    open http://localhost:8790/         # demo page with buttons for every command

The Live2D libraries (Cubism Core, PixiJS 6.5.10, pixi-live2d-display 0.4.0) load from public
CDNs, so the browser needs internet.

## Put it on your page

    <script src="http://localhost:8790/__vtuber/inject.js"></script>

This adds three iframes with `pointer-events: none` (they never take clicks):
- bottom right: the avatar (`/__vtuber/overlay.html`)
- top left: the hero's bubbles (`/__vtuber/monologue.html`)
- full screen: alerts, counters and the goal bar (`/__vtuber/hud.html`)

In **OBS**, add each page as a Browser Source instead (transparent background works out of the box).

## Commands: `POST /__vtuber/cmd` with JSON (fields combine)

    curl -X POST localhost:8790/__vtuber/cmd -H 'Content-Type: application/json' \
         -d '{"emote":"nya","say":"GOOD MORNING CHAT!!"}'

| field | what it does |
|---|---|
| `mood` | resting reaction held >= 6 s: `hyper` (default base), `idle`, `happy`, `smug`, `curious`, `cheer`, `proud`, `no`, `angry`, `scared`, `hug`, `cry`, `shocked`, `soul`, `sleepy` |
| `hold`, `base` | seconds to keep the mood (0 = until changed); the mood she returns to |
| `emote` | a 3-6 s anime reaction with manga symbols and a face close-up: `rage`, `sweat`, `shock`, `confused`, `sob`, `blush`, `sparkle`, `dead`, `gloom`, `sleep`, `love`, `doya`, `dots`, `hop`, `nya`, `paw`, `purr` |
| `say` | her own line, yellow "hype" bubble; with `"kind": "chat"` it's a pink chat bubble (viewer/user messages) |
| `antics` | `false` stops her random idle antics |
| `monologue` | the hero's speech bubble (top left); `"thought": true` makes it a thought cloud; `mood_text` adds a small mood label |
| `hero` | the name on the hero's bubbles |
| `alert` | `{"title", "sub", "style": raid/level/death/dog/clip/loot/info, "icon"}` banner |
| `counters` | `{"Deaths": 1}` merged by name; `null` removes one |
| `goal` | `{"label", "value", "max"}` progress bar; `null` hides it |

Counters, goal, base mood and hero name are replayed to overlays that (re)connect. When the server
restarts with new code, open overlays reload themselves.

## Server options

    python3 vtuber_server.py --port 8790 --model model/huohuo.model3.json --theme catgirl \
        --hero "Truman Burbank" --size 420x720

`--theme ''` removes the bell accessory. Any Cubism 3/4 model works; the moods and emotes use
this model's motion/expression file names (`haoqi`, `keshui`, `linghun`, `qizi`, `yaotou`,
`zhentou`, `angry`, `baozhen`, `cry`, `qizi1`, `qizi2`, `white eyes`). For another model, edit
`MOTIONS`, `EXPRESSIONS`, `MOODS` and `EMOTES` at the top of `web/overlay.js`, and `FACE`
(the face centre as a fraction of the model canvas) for the camera.

## Tools

- `tools/chat_hook.py`: a Claude Code `UserPromptSubmit` hook that shows what you type as her chat
  bubble. In `.claude/settings.json`:
  `{"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 /path/to/tools/chat_hook.py", "async": true}]}]}}`
  (`VTUBER_URL` overrides the server address.)
- `tools/prepare_model.py`: makes a browser-sized copy of a model (2048 px textures).
- `tools/recolor_model.py`: the recolour that turned the source model into Mochi.

## Licence of the model (read this)

`model/` is a recoloured, downscaled copy of a fan-made Huohuo Live2D model (art 伊白EX, rig 白狸Baily;
character © miHoYo). Its terms: no for-profit live streaming, no secondary distribution, follow
miHoYo's fan-content rules. **Keep this zip private, for your own projects.** Don't upload or
share it. The code (`vtuber_server.py`, `web/`, `tools/`) is yours to reuse freely.
