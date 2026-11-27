# Mochi Studio

Mochi in 3D: an anime catgirl in her cozy room with her dog, directed by an LLM through MCP, with an editor that AI
agents use to make her new animations, rooms and looks from plain requests. Runs on this Mac only (not part of ihor.sh).

## Watch her

```sh
node mochi-studio/server.mjs
```

- **The world**: http://127.0.0.1:8792/ . ☰ (or H) opens the controls: sit, walk, actions, the dog, camera shots,
  a line for her to say, and her voice (the browser's).
- **One animation on a loop**: http://127.0.0.1:8792/preview.html?clip=cheer_dance (scrub, slow down, front / side / face).

## Let an LLM direct her

Once: `claude mcp add --transport http mochi http://127.0.0.1:8792/mcp`, then keep the world open and ask Claude Code
things like "have Mochi make tea, sit on the sofa and tell the dog about her day". Any MCP client works the same way.

## Make new things

Ask an agent in this repo, e.g. "use the mochi-studio skill: make Mochi bow politely", "add a bed by the left
wall", "give her a red dress". The rules and formats it follows are in [AGENTS.md](AGENTS.md); it checks its work
with pictures before telling you, and gives you a preview link.

## What it can and can't do

- Animations of any length (a few seconds is typical; dances loop), with smooth transitions, facial expressions,
  hand shapes, props in her hands, and physics on her hair, skirt, chest and tail.
- Rooms from 140 furniture models plus simple shapes; recolours; proportions.
- New clothes or a new face need a new 3D model: make one in **VRoid Studio** (free, sliders, no drawing; cat ears
  and tail too), export VRM, drop it in `assets/characters/`. Today's body is a free VRoid sample made to look like her.
- The Live2D Mochi on ihor.sh (Yomu chat, the site companion) is separate and unchanged.
