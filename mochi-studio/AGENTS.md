# Mochi Studio: instructions for agents

Mochi Studio is a 3D anime world in the browser: Mochi (a VRM catgirl) lives in a cozy room with her dog. An LLM directs
her through MCP (walk, sit, act, talk, camera), and agents make new content as JSON files: **clips** (animations),
**rooms** and **characters**. The owner can't code: they give one-line requests ("make her bow", "add a bed"), and
you turn them into content and check it with your own eyes before you say it's done.

Everything is in this folder. No build step and no npm install: three.js and three-vrm load from a CDN.

```
server.mjs            local server: the pages, the command link to them, MCP at /mcp, content writes
index.html, src/      the world (world.js), Mochi (actor.js), the room (room.js), the dog (dog.js), shared stage (stage.js)
preview.html          one clip on a loop, with a scrubber: send the owner here to watch a clip
tools/shot.mjs        headless pictures: run commands, save snapshots and contact sheets
content/clips/        animations (JSON)          content/rooms/   rooms (JSON)          content/characters/   characters (JSON)
assets/               the VRM model, the furniture kit (GLB), the dog (FBX); licences in assets/LICENSES.md
```

## Run it

```sh
node mochi-studio/server.mjs                 # http://127.0.0.1:8792/ (the world), /preview.html?clip=NAME (one clip)
claude mcp add --transport http mochi http://127.0.0.1:8792/mcp   # once: lets Claude Code direct her
```

The world page must be open in a browser for MCP commands to work (it runs the scene). Content files reload by
themselves in open pages when you save them.

## How to work (every request)

1. **Read what exists**: `ls content/clips content/rooms content/characters` and read the closest file. Extend or
   copy it; never start from nothing when a similar clip exists (wave → bow, stand → a new idle).
2. **Write the JSON** in the formats below.
3. **Look at it**, always, before you report: `node mochi-studio/tools/shot.mjs '{"sheet":{"clip":"NAME"}}'` writes
   `mochi-studio/shots/sheet-NAME.jpg` (frames over time, front and side). Read the image. Fix what looks wrong
   (an arm through her body, a foot under the floor, a face that doesn't match) and look again.
4. **Hand it over**: tell the owner the URL `http://127.0.0.1:8792/preview.html?clip=NAME` (or the world URL) and
   what it does in one or two plain sentences. Commit only your files.

## Clips (content/clips/NAME.json)

```json
{
 "about": "Waves hello with her right hand, smiling.",        // one line: what it is (shown to the LLM and the owner)
 "duration": 2.6,                                             // seconds
 "loop": false,                                               // true: repeats (base poses, dances)
 "fade": 0.25,                                                // seconds to blend in and out (transitions)
 "keys": [
  { "t": 0,    "pose": { "rightUpperArm": [0, 0, 72] }, "hands": { "right": "relaxed" }, "face": { "happy": 0 } },
  { "t": 0.35, "ease": "out", "pose": { "rightUpperArm": [-15, 0, -10], "rightLowerArm": [0, 0, -80] },
    "hands": { "right": "open" }, "face": { "happy": 0.55, "aa": 0.35 } }
 ]
}
```

- **keys** are poses at times. Each bone, face value or hand is its own track: a bone keyed at 0 s and 2 s glides
  between them, whatever other keys set. Bones a clip never keys stay in the pose underneath (standing or sitting).
- **ease** (on the key it arrives at): `smooth` (default), `linear`, `in`, `out`, `back` (overshoots and settles),
  `snap` (jumps at the key).
- **pose**: bone → `[x, y, z]` degrees, applied z first, then y, then x. All zeros is the T-pose (arms straight out).
  Bones: `hips spine chest upperChest neck head`, `left|right` + `Shoulder UpperArm LowerArm Hand UpperLeg LowerLeg Foot Toes`.
- **pos**: `[x, y, z]` metres added to her hips (x to her left, z forward). **lift**: metres up off the floor (hops).
  Her feet are kept on the floor automatically (knees bent → she goes down); `"ground": false` on the clip turns that off.
- **hands**: `left` / `right` → `open`, `relaxed`, `fist`, `point`, `peace`, `cup`, `paw`, a number 0–1 (curl), or five numbers (thumb → little).
- **face**: `happy` (eyes closed smile), `relaxed` (gentle smile, eyes open), `angry`, `sad`, `blink`, mouth
  shapes `aa ih ou ee oh`; 0–1, they add up. On this model `surprised` does nothing. An open-mouthed bright smile is
  `relaxed 0.8 + aa 0.45`. `happy` above 0.8 looks odd; keep it at 0.75 or less.
- **events**: `[{ "t": 0.7, "grab": "cup", "hand": "right", "offset": [x, y, z], "turn": [x, y, z] }, { "t": 4.9, "put": "cup" },
  { "t": 0.8, "dog": "petted", "seconds": 3 }, { "t": 1, "say": "Ta-da!" }]`. Offsets are metres in the hand (x her left, y up, z forward).
- **needs** / **near**: `"needs": "dog"` or a prop id (`"cup"`): she goes there first, unless she's within `near` metres.
- Base poses: `stand`, `sit` (`"seated": true`), `walk` (`"speed"` metres a second). These are held, not acted.

### Which way bones turn (checked on renders; she faces +z, her left is +x)

| bone | x | y | z |
|---|---|---|---|
| left/right UpperArm | − swings the arm forward, + back | left: − forward, right: + forward (for a level arm) | left −72 / right +72 = arms down at her sides; left +80 / right −80 = straight up |
| left/right LowerArm | twist | elbow bend: left −, right + (−130 / +130 brings a fist to her chin) | with the arm level: left +90 / right −90 points the forearm up |
| left/right Hand | right −90 turns the palm forward when the forearm points up | | |
| left/right UpperLeg | − leg forward (hip bend), −88 = thigh level (sitting) | | left + / right − spreads the legs |
| left/right LowerLeg | + bends the knee | | |
| left/right Foot | + toes down, − toes up; keep thigh + knee + foot ≈ 0 for a flat foot | | |
| spine, chest, neck, head | + bends or nods forward, − leans back | + turns to her left | + tilts to her right |

Left and right mirror: a right-side value is `[x, −y, −z]` of the left one. Reference poses to copy:
`stand.json` (rest), `sit.json` (sitting), `cheer_dance.json` (fists by her chin, knee bounces, sway, a hop),
`walk.json` (a gait), `wave.json`, `pet_dog.json` (a deep crouch), `drink_tea.json` (holding a prop).

### Good animation, briefly

Anticipate big moves (a small dip before a hop), overshoot and settle (`back`), keep the head and chest moving a little
against the hips, and leave holds. 5–7 s is a good length for an action; dances loop. Hair, skirt, chest and tail
move by physics: animate the body and let them follow. Check the sheet from the side too: arms pass in front of her
body, not through it.

## Characters (content/characters/NAME.json)

```json
{ "name": "Mochi", "about": "...", "model": "assets/characters/mochi.vrm", "height": 1.63, "base": "stand",
  "body": { "head": 0.92, "legs": 1.05, "bust": 1.18 },
  "springs": { "Bust": { "stiffness": 0.5, "gravity": 0.06, "drag": 0.16, "limit": 24 }, "Skirt": { "stiffness": 0.45, "gravity": 0.08, "drag": 0.1 } },
  "colors": { "HAIR": "#ffe7b8", "Onepice": "#9db8ff" },
  "ears": { "color": "#f6dca6", "inner": "#ffb3c6", "size": 1.3, "at": [0.058, 0.19, -0.015], "tilt": 22 },
  "tail": { "color": "#f6dca6", "tip": "#fff6e3", "length": 0.7, "thickness": 0.03 },
  "voice": { "lang": "en-US", "pitch": 1.35, "rate": 1.05 } }
```

- **model**: any VRM (0.x or 1.0). New characters come from VRoid Studio (free; sliders, no drawing) or VRoid Hub
  models whose licence allows it; put the file in `assets/characters/`, note its licence in `assets/LICENSES.md`.
- **body**: bone scales (1 = as modelled). **springs**: physics for the model's spring bones whose name contains the
  key (`Bust`, `Skirt`, `Sleeve`, `Hair`): stiffness (spring back), gravity (pull down), drag (low = bouncier), limit
  (most degrees from rest). **colors**: tints for materials whose name contains the key (a texture multiply: light
  parts take colour best). **ears** / **tail**: cat ears on the head and a tail (omit for a character without them).
- Outfits are recolours today; new clothes need a new VRM from VRoid Studio.
- Mochi's rules from the owner: she's an adult catgirl (a person with cat ears and a tail, not a cat), never says
  "nya", cheerful and playful, lightly flirty but never sexual. Her physics stays natural, never exaggerated.

## Rooms (content/rooms/NAME.json)

`size` [width, depth] metres (centred on 0,0; the back wall at −depth/2, the front open for the camera), `height`,
colours (`wall floor floorLines trim curtains skyTop skyBottom sun`), `window` {at, width, bottom, top} on the back
wall, `start` {mochi: [x, z, turn°], dog: [x, z, turn°]}, and `objects`:

```json
{ "id": "sofa", "model": "loungeSofa", "at": [-0.6, -2.05], "turn": 0, "seat": [0, 0.08, 0.42], "about": "the pink sofa (sit on it)" }
{ "id": "cup", "prop": true, "model": "cup", "on": "table", "at": [-0.3, -0.85], "about": "her tea cup" }
```

- **model**: a furniture file name from `assets/furniture/` (Kenney's kit: `ls assets/furniture`; e.g. `bedSingle`,
  `bookcaseOpen`, `chair`, `deskCorner`, `kitchenFridge`, `lampRoundFloor`, `loungeChair`, `pottedPlant`, `rugRound`,
  `televisionModern`, `bear`), a built-in shape (`cup teapot kettle cushion box`), or a path to any GLB.
- **at** [x, z] is the centre of its footprint; **turn** degrees (0 = its front faces +z, the camera's side).
  `scale`, `color` (recolour), `walk: true` (she can walk over it, like a rug).
- **seat** [x, z, height] makes it sittable (local to the object); **use** [x, z] is where she stands to use it
  (default: in front of it). **prop** objects stand `on` another object (or at height `y`) and can be grabbed by clips.
- **about** puts it in the LLM's list; leave it out for decoration.

Check a room with `node mochi-studio/tools/shot.mjs --query room=NAME '{"camera":{"shot":"wide"}}' '{"snapshot":"room"}'`.

## Directing (MCP tools, or the same commands in shot.mjs)

`look` (start here: where she is, what's around, the clips), `walk_to {target, run}`, `sit {on}`, `stand_up`,
`act {clip, times}`, `say {text, mood}`, `feel {mood, seconds}`, `look_at {target}` (an object, `dog`, `camera`,
`none`), `camera {shot}` (`auto wide medium closeup two_shot follow`), `dog {action, target}` (`come go sit lie stand
wander wag jump bark`), `wait {seconds}`, `snapshot` (a JPEG of the view), and `list_content`, `read_content`,
`write_content` for clips, rooms and characters. Each returns when it's done, so a scene is a sequence of calls:
`sit sofa → say "Tea time!" → act drink_tea → dog come → act pet_dog → camera two_shot → act cheer_dance`.

## shot.mjs

```sh
node mochi-studio/tools/shot.mjs [--out DIR] [--size WxH] [--query "room=cozy"] STEP...
  {"sheet": {"clip": "wave", "frames": 8, "views": ["front","side"], "focus": "body|face|chest"}}
  {"snapshot": "name"}   {"wait": 2}   {"view": [[x,y,z],[x,y,z]]}   {"eval": "JS on window.world"}
  {"walk_to": {"target": "sofa"}}  ...any command above, fast-forwarded
```

Pictures go to `mochi-studio/shots/` (git-ignored). It starts its own server and headless browser, so it works while
the owner's world is open.

## Done means

- Every clip, room or character you touched renders without page errors, and you looked at its sheet or snapshot.
- Positions are believable: no limb through the body, feet on the floor, props in the hand.
- You gave the owner the preview URL and a plain description. No new dependencies; keys never in files.
