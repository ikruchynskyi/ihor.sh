---
name: studio2d
description: Make or change things in the 2D Studio (studio2d/): cute chibi anime characters built from one generated picture, their faces, and their dances and moves (clips), and direct its stage. Use for any request to create a character, rig or fix one, make faces, write or copy a dance (e.g. from a GIF or video), make a character move, talk or react, or fix the studio itself.
---

# 2D Studio

Read `studio2d/AGENTS.md` first and follow it: the character workflow (generate → rig from the grid → check labels →
faces), the clip format and its angle conventions, copying a dance from a GIF, and what "done" means.

The owner gives one-line requests and can't code. Pick sensible defaults from the existing content (Mochi is the
worked example) and say what you picked; ask only when you can't tell. Start `node studio2d/server.mjs` in the
background if it isn't running. Look at every picture the tools return before going on, and end with the studio link
(`http://127.0.0.1:8793/?character=NAME&clip=NAME`). Characters stay wholesome: fully clothed, cute, never sexual.
