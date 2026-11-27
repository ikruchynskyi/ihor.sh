# 2D Studio: instructions for agents

A local studio for cute 2D anime characters made from one picture. The image service draws a chibi character; the
builder cuts her out; you place her joints by reading them off a grid; the engine bends her picture along that skeleton
(hair, ears and tail on springs, faces swapped in for blinking, talking and feelings), and clips (dances and moves)
pose her over time. Any clip works on any character. An LLM directs the stage through MCP.

The owner can't code. They give one-line requests ("make a bunny girl", "copy the dance in ~/Downloads/x.gif",
"make her wave"); you do the work, look at every picture the tools return, and hand over a link.

```
server.mjs        the page, the command link to open pages, MCP at /mcp, the builder's tools
index.html, src/  the studio (studio.js) and the engine (puppet.js)
tools/build.py    character builder: generate, cutout, grid, overlay, faces, facesheet, frames (Python: numpy, scipy, Pillow)
tools/shot.mjs    headless pictures and videos: snapshots, contact sheets, labels, side-by-side videos
characters/NAME/  source.png (generated), base.png (cut out), rig.json, faces/*.png, prompt.json, back/ (her back view)
pictures.html     every picture a character has, and a form for a new outfit
clips/NAME.json   dances and moves; idle.json plays underneath everything
```

## Run

```sh
node studio2d/server.mjs                                           # http://127.0.0.1:8793/  (?character=NAME&clip=NAME)
claude mcp add --transport http studio2d http://127.0.0.1:8793/mcp  # once
```

Stage tools (show, play, say, face, snapshot, preview_clip) need the studio open in a browser; the builder and clip
tools don't. `tools/shot.mjs` opens its own headless studio, so you can always check your work with it.

## Characters stay wholesome (not a setting)

Every character is fully clothed and never sexualized; chibi characters look like children, so they get nothing
revealing at all. `tools/build.py` refuses nudity, underwear, lingerie and sexual words in any look, outfit, face or
back-view request (and swimwear for chibi characters) before anything is drawn. Don't work around it, don't remove
"general" or "fully clothed" from the prompts, and refuse such requests whoever asks. If a picture comes back
revealing anyway, delete it and say so.

## The image service

`~/AI/fast_35.py` on port 6000 (not in this repo; never copy or commit it). `tools/build.py` asks for the anime model
with the request field `"model": "nsfw"` and for speed with `"fast": true` (8 steps). Those fields route exactly like
the words in a prompt, and keep the word "nsfw" out of what the picture is drawn from: these are cute chibi characters,
so every prompt stays wholesome (fully clothed, the "general" rating tag; the house style in `build.py` STYLE does
this). Never put "nsfw", nudity or anything sexual into a prompt, whatever the request.

## Make a character

1. `create_character {name, look, style}`: `look` is tags for her hair, eyes, clothes, ears, tail, accessories;
   `style` is `chibi` (default, cute, big head: Mochi) or `adult` (a grown woman, flat cel shading with bold outlines,
   arms held out: Hana). It returns her cut-out on a grid (25 px, labels every 100). Check she's whole, on a clean
   background, with her arms clear of her body (else a new seed): clean outlines and free arms are what rig well.
2. Read her joints off the grid and `rig_character {name, rig}` with:
   - `joints` (picture pixels): `hips` (pelvis centre), `spine` (waist), `chest`, `neck` (where the head turns),
     `head` (top of the head), and per side (`L` = HER left = the right of the picture): `shoulder`, `elbow`, `wrist`,
     `hand` (fingertips), `hip`, `knee`, `ankle`, `toe` (bottom of the shoe).
   - `ground`: the y of the soles. `face`: the box around eyes and mouth `[x0, y0, x1, y1]` (faces are redrawn inside it).
   - `thickness`: half-widths in pixels `{upperArm, foreArm, hand, thigh, shin, foot}` (measure sleeves and legs).
   - `regions`: polygons that override the automatic split (`"bone"`: any joint or pose name pins the area to it): `{"name": "head", "bone": "head", "poly": [...]}` for the
     head with hat and ears (everything above the chin), and spring regions for long hair, a tail, ribbons:
     `{"name": "hairR", "spring": "hairR", "poly": [...]}` (add `"layer": "back"` for a tail behind her).
   - soft regions (lag and settle as she moves): `{"name": "hemL", "soft": {"bone": "hips", "stiffness": 80,
     "damping": 6, "max": 0.03}, "poly": [...]}` for a skirt hem, ears (`bone: "head"`), sleeves; an adult character's
     chest `{"bone": "chest", "stiffness": 120, "damping": 10, "max": 0.012}` (keep it subtle and natural; never on a
     chibi or young-looking character).
   - `springs`: chains that swing: `{"name": "tail", "parent": "hips", "points": [[x,y], ...], "stiffness": 28,
     "damping": 5, "gravity": 0.15}` (hair: parent `head`, stiffer). Points go from the root to the tip.
   It returns the rig drawn over her. Then check what each pixel follows:
   `node studio2d/tools/shot.mjs --query character=NAME '{"labels":"labels"}'` (a colour per bone). Fix thickness or
   regions until arms, legs, head, hair and tail each have their own colour and the coat or dress is the body's.
3. `make_faces {name}`: blink, talk, joy, wink, surprised, sad, angry, shy (or your own words), ~10 s each. Look at
   the sheet: same face, only the expression changed.
4. Her back, so she can turn round and dance facing away: `make_back_view {name}` (she looks back over her shoulder;
   ~2 min), then `rig_character {name: "NAME/back", rig}` the same way. From behind her LEFT is on the picture's LEFT;
   no face box; her tail is in front (`"layer": "front"` on its region). Check with
   `{"labels": {"name": "back", "back": true}}`. Pin a coat or dress that touches her sleeves to the chest with a
   region `{"name": "coat", "bone": "chest", "poly": [...]}` (keep the cuffs out of it).
5. Try her with an existing dance: `preview_clip` (or shot.mjs `{"sheet": {"clip": "cheer_dance"}}`). Torn or
   stretched bits mean a labels problem (step 2).

## Outfits

`change_outfit {name, new_name, outfit}` redraws her clothes in the same pose (front and back) as a new character and
copies her rig. The picture editor can shift her a little: look at the returned overlay (and `NAME/back`'s), move any
joint that's off with `rig_character`, then `make_faces`. The owner can do the same from the pictures page
(`http://127.0.0.1:8793/pictures.html`), which also shows every picture a character has. `remove_outfit {name}` (or
the page's *Remove this outfit*) deletes an outfit's folder; only outfits can go (their `prompt.json` has `from`),
never a character drawn from scratch.

Pose for rigging: the house style asks for arms and legs a little away from the body; that is what lets limbs move
without dragging the clothes. Mochi (`characters/mochi/rig.json`) is a complete example.

## Make a new animation

1. **Plan the beats** in words with times, like a choreographer: "0.0 stand, 0.3 dip (anticipation), 0.5 jump with
   arms up, 0.9 land in a crouch (squash), 1.3 fists up, smiling, 1.9 back to standing". 1–3 s for a gesture, 5–7 s
   for a routine; a dance loops.
2. **Build each beat from named poses** (`poses.json`: `fists_chest`, `heart_hands`, `hands_cheeks`, `wave_up_R`,
   `peace_R`, `point_R`, `arms_up`, `arm_out_L`, `hands_hips`, `hands_together_low`, `knees_bent`, `crouch`,
   `knees_together`, `lunge_R`, `lean_L`, `lean_R`, `nod_down`, `bow`, `rest`, …) with `"use"`, and tweak on top with
   `"pose"`. Missing a pose you'll reuse? Add it to `poses.json` (name, `about`, `pose`; `squash`/`face` optional).
3. **Act it**: a face per beat; squash on landings `[1.05, 0.95]`, stretch on take-offs `[0.95, 1.06]`; `lift` for
   hops; a small opposite move before a big one; `ease: "out"` into a pose, `"in"` out of it, `"back"` to overshoot.
   Hair, ears, tails, hems and the arms' follow-through are automatic: don't animate them.
4. **Look**: `preview_clip` (or shot.mjs `{"sheet": {"clip": "NAME"}}`) and fix what reads wrong; a video:
   `{"video": {"clip": "NAME"}}`. Try it on two characters (Mochi, Hana): poses mean the same on everyone.

Examples: `wave_hello`, `happy_jump`, `bow`, `shy`, `clap`, `cheer_dance` (a copied dance), `idle`.

## Clips (clips/NAME.json)

```json
{ "about": "Waves hello with her right hand.", "duration": 2.6, "loop": false, "fade": 0.25,
  "keys": [
    { "t": 0,    "use": "rest", "face": "base" },
    { "t": 0.35, "ease": "out", "use": ["wave_up_R", "lean_L"], "face": "joy", "squash": [0.98, 1.02] },
    { "t": 0.6,  "pose": { "foreArmR": 25 } }, { "t": 0.85, "pose": { "foreArmR": 72 } }
  ],
  "events": [ { "t": 0.6, "say": "Hi hi!" } ] }
```

- Each pose name is its own track: keys glide between values (`ease`: `smooth` default, `linear`, `in`, `out`,
  `back`, `snap`); a name a clip never keys stays as the picture has it. `"use"` merges named poses; `"pose"` wins.
- Angles are degrees **from one standard stance, the same on every character**: upper arms 45° out from the body,
  forearms straight, thighs 15° apart (the engine measures each picture and corrects for it). **Arms and legs: +
  raises / opens**, mirrored per side; **body, waist, chest, head: + leans toward her left**. Names: `body`, `waist`,
  `chest`, `head`, `upperArmL/R` (0 = A-pose, 90 = level, 180 = straight up, − toward her body), `foreArmL/R` (+ keeps
  turning the raising way, − folds it in across her body; past 110° it turns over by itself so a fist at her chest
  shows the sleeve the right way up), `handL/R`, `thighL/R` (+ spreads), `shinL/R` (− tucks the foot in), `footL/R`.
- `[angle, length, width]`: `length` shortens a bone along itself (a forearm reaching toward us `0.8`, a knee bending
  toward us `0.85`; her feet stay on the ground so she dips); `width` -1 shows its other side. `"ground": false` on a
  clip lets her leave the ground.
- `pos [x, y]` (share of her height, x to the picture's right), `lift` (a hop, share of her height),
  `squash [sx, sy]` (squash and stretch around her feet), `turn` 1 → -1 (she turns round:
  below 0 she shows her back view, or her front mirrored if she has none; a quick 0.1 s flip reads like an anime spin;
  -1 → 1 turns her back), `face` (a face name; held until the next one). Poses mean the same from behind: her right
  arm is her right arm, shown on the other side.
- Motion is softened for you: each bone follows its pose with a little lag and overshoot (hands most), and hair,
  tails, ears and soft regions swing on their own.

## Copy a dance from a GIF or video

1. `reference_frames {path, every, start, count}`: frames with times and a 50 px grid.
2. For each key moment, read the joint points off the frame and `pose_from_points {character, points}`: it returns
   the pose (and `pos`) for that moment, in this character's terms. Use the frame's time for the key.
3. Write the clip, add faces, squash and stretch, and the spins (when the reference turns her back to us, `turn` to -1:
   her back view). `preview_clip`, then compare side by side:
   `node studio2d/tools/shot.mjs --query character=NAME '{"video":{"clip":"NAME","reference":"/path/ref.gif"}}'`
   writes `studio2d/shots/NAME-vs-reference.mp4` and `.gif`. Look at matching moments and fix the keys that differ.

## Done means

Every picture the tools returned was looked at; labels are clean (no torn or dragged pieces); a new clip was checked
on a sheet; a copied dance was compared side by side with its reference. Give the owner the studio link
(`http://127.0.0.1:8793/?character=NAME&clip=NAME`) and say in a sentence or two what you made. Commit only your
files; `shots/` and the image service stay out of git.
