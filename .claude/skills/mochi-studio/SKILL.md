---
name: mochi-studio
description: Make or change things in Mochi Studio (mochi-studio/), the 3D anime world where an LLM directs Mochi, the VRM catgirl, and her dog through MCP. Use for any request to animate Mochi (a new move, dance, gesture, reaction), change her look (colours, proportions, physics, a new VRM character), build or edit a room or its furniture, direct a scene, or fix the studio itself.
---

# Mochi Studio

Read `mochi-studio/AGENTS.md` first and follow it: the clip, character and room formats, which way each bone
turns, the shot tool, and what "done" means.

The owner gives one-line requests and can't code. If a request leaves something open that changes the result (which
room, how long, which hand), pick the sensible default from the existing content and say what you picked; ask only
when you truly can't tell. Always look at your result (a contact sheet or snapshot from `tools/shot.mjs`) before you
report, and end with the preview link (`http://127.0.0.1:8792/preview.html?clip=NAME` for a clip, the world for the
rest; start `node mochi-studio/server.mjs` in the background if it isn't running).
