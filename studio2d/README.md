# 2D Studio

Cute 2D anime characters made from one picture, that dance, talk and react, built and directed by AI. Runs on this
Mac only (not part of ihor.sh). The pictures come from the image service on this Mac (`~/AI/fast_35.py`).

## Watch

```sh
node studio2d/server.mjs
```

Open http://127.0.0.1:8793/ . At the bottom: the character, the dance, play/pause, a scrubber, speed, her faces, and
a line for her to say. `?character=mochi&clip=cheer_dance` opens straight to one; `&ui=0&bg=transparent` is for OBS.

## Ask an AI to make things

In Claude Code, say for example:

- "use the studio2d skill: make a new character, a sleepy bunny girl in pajamas"
- "use the studio2d skill: copy the dance in ~/Downloads/dance.gif onto Mochi"
- "use the studio2d skill: make Mochi wave and say hello"

To let an LLM direct the stage live (play, say, faces): `claude mcp add --transport http studio2d http://127.0.0.1:8793/mcp`,
keep the studio open, and ask.

How the AI works here is in [AGENTS.md](AGENTS.md).
