#!/usr/bin/env node
// The 2D studio's local server (no dependencies): the studio page, its characters and clips, the command link to open
// pages, the character builder (tools/build.py, which calls the image service), and an MCP server so an LLM can build
// characters, write dances and direct the stage.
//
//   node studio2d/server.mjs            then open http://127.0.0.1:8793/
//   claude mcp add --transport http studio2d http://127.0.0.1:8793/mcp
//
// Local only: it listens on 127.0.0.1 and writes only inside studio2d/characters and studio2d/clips.
import http from "node:http";
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PORT = Number(process.env.STUDIO_PORT ?? 8793);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif" };
const NAME = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const checkName = (n) => { if (!NAME.test(String(n))) throw new Error("names: lowercase letters, digits, - and _"); return n; };

// ---- open pages: commands go to every studio page, the first answer wins ----
const pages = new Set();
const waiting = new Map();
let nextId = 1;
const send = (msg) => { for (const res of pages) res.write(`data: ${JSON.stringify(msg)}\n\n`); };
export async function command(cmd, args = {}, ms = 120_000) {
  for (let i = 0; !pages.size && i < 40; i++) await new Promise((r) => setTimeout(r, 250));
  if (!pages.size) throw new Error(`The studio isn't open. Open http://127.0.0.1:${PORT}/ in a browser first.`);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${cmd} took longer than ${ms / 1000} s`)); }, ms);
    waiting.set(id, { resolve, reject, timer });
    send({ id, cmd, args });
  });
}
let reloadT;
for (const dir of ["characters", "clips"]) {
  try { watch(path.join(ROOT, dir), { recursive: true }, () => { clearTimeout(reloadT); reloadT = setTimeout(() => send({ reload: dir }), 300); }); } catch { /* reload by hand */ }
}

// ---- content ----
export async function characters() {
  const out = [];
  for (const d of (await readdir(path.join(ROOT, "characters")).catch(() => [])).sort()) {
    if (await stat(path.join(ROOT, "characters", d, "rig.json")).catch(() => null)) out.push(d);
  }
  return out;
}
export async function clips() {
  const out = {};
  for (const f of (await readdir(path.join(ROOT, "clips")).catch(() => [])).filter((f) => f.endsWith(".json")).sort()) {
    out[f.slice(0, -5)] = JSON.parse(await readFile(path.join(ROOT, "clips", f), "utf8"));
  }
  return out;
}
const charDir = (n) => path.join(ROOT, "characters", checkName(n));
const image = async (file) => ({ image: `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(file)).toString("base64")}` });

// the builder (Python: numpy, scipy, Pillow), one JSON line per result
function build(...args) {
  return new Promise((resolve, reject) => {
    execFile("python3", [path.join(ROOT, "tools", "build.py"), ...args.map(String)], { timeout: 1_800_000, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const lines = String(stdout).trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { text: l }; } });
      const bad = lines.find((l) => l.ok === false);
      if (err || bad) reject(new Error(bad?.error ?? String(stderr || err).slice(-800)));
      else resolve(lines);
    });
  });
}

// Joint points from a reference picture (a GIF frame, a drawing) -> a pose for this character: each bone's turn from the
// character's own picture, as clips use them (limbs: + raises/opens; trunk and head: + leans to her left).
const CHAINS = { body: ["hips", "spine", null], waist: ["spine", "chest", "body"], chest: ["chest", "neck", "waist"], head: ["neck", "head", "chest"],
  upperArmL: ["shoulderL", "elbowL", "chest", 1], foreArmL: ["elbowL", "wristL", "upperArmL", 1], handL: ["wristL", "handL", "foreArmL", 1],
  upperArmR: ["shoulderR", "elbowR", "chest", -1], foreArmR: ["elbowR", "wristR", "upperArmR", -1], handR: ["wristR", "handR", "foreArmR", -1],
  thighL: ["hipL", "kneeL", "body", 1], shinL: ["kneeL", "ankleL", "thighL", 1], footL: ["ankleL", "toeL", "shinL", 1],
  thighR: ["hipR", "kneeR", "body", -1], shinR: ["kneeR", "ankleR", "thighR", -1], footR: ["ankleR", "toeR", "shinR", -1] };
export function poseFromPoints(rig, P) {
  const R = rig.joints, ang = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]); // y up, counter-clockwise +
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const scale = P.hips && P.neck ? len(P.hips, P.neck) / len(R.hips, R.neck) : 1;
  const world = {}, pose = {};
  for (const [name, [a, b, parent, side = 0]] of Object.entries(CHAINS)) {
    if (!P[a] || !P[b] || !R[a] || !R[b]) { world[name] = world[parent] ?? 0; continue; }
    let d = ang(P[a], P[b]) - ang(R[a], R[b]);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    world[name] = d;
    let local = d - (world[parent] ?? 0);
    local = Math.atan2(Math.sin(local), Math.cos(local)) * 180 / Math.PI;
    let v = side === 0 ? -local : side * local;
    if (/Arm/.test(name) && v > 160) v -= 360; // a fold all the way in is -180, not +180: keys then blend the short way
    const stretch = len(P[a], P[b]) / scale / len(R[a], R[b]);
    pose[name] = /^(thigh|shin)/.test(name) && stretch < 0.93 ? [Math.round(v), +Math.max(0.5, stretch).toFixed(2)] : Math.round(v);
  }
  const out = { pose };
  const feet = ["ankleL", "ankleR"].filter((k) => P[k]);
  if (P.hips && feet.length === 2) {
    const mid = (Q) => (Q.ankleL[0] + Q.ankleR[0]) / 2, h = (rig.ground ?? 0) - Math.min(...Object.values(R).map((p) => p[1]));
    out.pos = [+(((P.hips[0] - mid(P)) / scale - (R.hips[0] - mid(R))) / h).toFixed(3), 0];
  }
  return out;
}

// ---- MCP tools ----
const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (d) => ({ type: "string", description: d });
const num = (d) => ({ type: "number", description: d });
const obj = (d) => ({ type: "object", description: d });
export const TOOLS = [
  { name: "studio_state", description: "What's in the studio: the characters, the clips (dances and moves, with what each is), and what's on stage now. Call it first.", inputSchema: S({}) },
  { name: "create_character", description: "Draw a new cute chibi character with the image service from a description of her look, cut her out, and return her picture on a coordinate grid. Next, read her joints off the grid and call rig_character.", inputSchema: S({ name: str("folder name, lowercase, e.g. luna"), look: str("her look in tags: hair, eyes, clothes, accessories, animal ears/tail… (e.g. 'silver twin tails, red eyes, black hoodie with bunny ears, pleated skirt, sneakers')"), seed: num("a seed to redo the same picture (optional)") }, ["name", "look"]) },
  { name: "rig_character", description: "Save a character's rig (merged into characters/NAME/rig.json; format in studio2d/AGENTS.md): joints, ground, face box, regions, spring chains, name and about. Returns the rig drawn over her picture so you can check it.", inputSchema: S({ name: str("character folder"), rig: obj("rig fields to set: joints {hips: [x,y], …}, ground, face [x0,y0,x1,y1], regions [...], springs [...], name, about") }, ["name", "rig"]) },
  { name: "make_faces", description: "Redraw a character's face box for each face (blink, talk, joy, wink, surprised, sad, angry, shy, or your own words) with the image service, so she can blink, talk and show feelings. Returns the faces side by side. Takes about 30 s a face.", inputSchema: S({ name: str("character folder"), faces: { type: "array", items: { type: "string" }, description: "face names (omit for all the usual ones)" } }, ["name"]) },
  { name: "show", description: "Put a character on the stage.", inputSchema: S({ character: str("character folder") }, ["character"]) },
  { name: "play", description: "The character on stage plays a clip (a dance or a move); returns when it ends (a looping clip plays `times` times).", inputSchema: S({ clip: str("clip name"), times: num("how many times (default 1)") }, ["clip"]) },
  { name: "stop", description: "Stop the clip playing on stage.", inputSchema: S({}) },
  { name: "face", description: "Show a face for a while.", inputSchema: S({ name: str("blink, talk, joy, wink, surprised, sad, angry, shy, base…"), seconds: num("how long (default 4)") }, ["name"]) },
  { name: "say", description: "She says a line: a speech bubble while her mouth moves; returns when she's done.", inputSchema: S({ text: str("one or two short sentences"), face: str("a face to show while saying it (optional)") }, ["text"]) },
  { name: "snapshot", description: "A picture of the stage now.", inputSchema: S({}) },
  { name: "preview_clip", description: "A contact sheet of a clip on the character on stage: frames over time. Look at it after writing a clip.", inputSchema: S({ clip: str("clip name"), frames: num("how many frames (default 12)") }, ["clip"]) },
  { name: "read_clip", description: "Read a clip (JSON; format in studio2d/AGENTS.md).", inputSchema: S({ name: str("clip name") }, ["name"]) },
  { name: "write_clip", description: "Create or replace a clip. Any clip works on any character. The open studio reloads it at once.", inputSchema: S({ name: str("lowercase name, e.g. bow"), clip: obj("the clip: about, duration, loop, fade, keys [...]") }, ["name", "clip"]) },
  { name: "reference_frames", description: "Frames of a reference GIF or video (e.g. a dance to copy) on a sheet with times and a 50 px grid, so you can read joint points off them for pose_from_points.", inputSchema: S({ path: str("absolute path of the GIF or video"), every: num("seconds between frames (default 0.16)"), start: num("from this second (default 0)"), count: num("how many frames (default 12)") }, ["path"]) },
  { name: "pose_from_points", description: "Turn joint points read off a reference picture (pixels, any size) into a pose for a character's clip key: {pose: {upperArmL: …}, pos}. Give as many of these as you can see: hips, spine, chest, neck, head (top of head), shoulderL/R, elbowL/R, wristL/R, handL/R, hipL/R, kneeL/R, ankleL/R, toeL/R (L = her left).", inputSchema: S({ character: str("character folder"), points: obj("joint name -> [x, y] in the reference picture") }, ["character", "points"]) },
];

async function runTool(name, a = {}) {
  switch (name) {
    case "studio_state": {
      const cl = await clips();
      let stage = null;
      try { stage = pages.size ? await command("state") : null; } catch { /* no page */ }
      return { characters: await characters(), clips: Object.fromEntries(Object.entries(cl).map(([k, v]) => [k, v.about ?? ""])), stage, studio: `http://127.0.0.1:${PORT}/` };
    }
    case "create_character": {
      checkName(a.name);
      await build("generate", a.name, a.look, ...(a.seed ? [a.seed] : []));
      await build("cutout", a.name);
      await build("grid", a.name);
      return image(path.join(charDir(a.name), "grid.png"));
    }
    case "rig_character": {
      const file = path.join(charDir(a.name), "rig.json");
      const rig = { ...JSON.parse(await readFile(file, "utf8").catch(() => "{}")), ...a.rig };
      await writeFile(file, JSON.stringify(rig, null, 1) + "\n");
      await build("overlay", a.name);
      return image(path.join(charDir(a.name), "overlay.png"));
    }
    case "make_faces": {
      await build("faces", a.name, ...(a.faces ?? []));
      await build("facesheet", a.name);
      return image(path.join(charDir(a.name), "faces.jpg"));
    }
    case "show": return command("character", { name: checkName(a.character) });
    case "play": return command("play", a, 300_000);
    case "stop": case "face": case "say": case "snapshot": return command(name, a);
    case "preview_clip": return command("sheet", { clip: a.clip, frames: a.frames ?? 12 });
    case "read_clip": return JSON.parse(await readFile(path.join(ROOT, "clips", checkName(a.name) + ".json"), "utf8"));
    case "write_clip": {
      const c = typeof a.clip === "string" ? JSON.parse(a.clip) : a.clip;
      if (!Array.isArray(c?.keys)) throw new Error("a clip needs keys: [{t, pose, …}]");
      await writeFile(path.join(ROOT, "clips", checkName(a.name) + ".json"), JSON.stringify(c, null, 1) + "\n");
      return `saved clips/${a.name}.json`;
    }
    case "reference_frames": {
      const out = path.join(ROOT, "characters", ".refs");
      await mkdir(out, { recursive: true });
      await build("frames", "_", a.path, a.every ?? 0.16, a.start ?? 0, a.count ?? 12, out);
      return image(path.join(out, "frames.jpg"));
    }
    case "pose_from_points": {
      const rig = JSON.parse(await readFile(path.join(charDir(a.character), "rig.json"), "utf8"));
      return poseFromPoints(rig, a.points);
    }
    default: throw new Error(`unknown tool ${name}`);
  }
}
const asContent = (out) => typeof out === "object" && out?.image
  ? [{ type: "image", data: out.image.split(",")[1], mimeType: out.image.slice(5, out.image.indexOf(";")) }]
  : [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }];
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
async function rpc(m) {
  switch (m.method) {
    case "initialize": return { protocolVersion: VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0],
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "studio2d", version: "1.0.0" },
      instructions: "A 2D anime studio: build cute chibi characters from a description (create_character → rig_character → make_faces), write dances and moves as clips (write_clip, preview_clip; copy a GIF with reference_frames + pose_from_points), and direct the stage (show, play, say, face, snapshot). Always look at the pictures the tools return before going on. Formats: studio2d/AGENTS.md." };
    case "ping": return {};
    case "tools/list": return { tools: TOOLS };
    case "tools/call":
      try { return { content: asContent(await runTool(m.params?.name, m.params?.arguments)) }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    default: throw Object.assign(new Error(`Method not found: ${m.method}`), { code: -32601 });
  }
}

// ---- HTTP ----
const body = (req) => new Promise((resolve, reject) => { let s = ""; req.on("data", (c) => { s += c; if (s.length > 2e7) req.destroy(); }); req.on("end", () => resolve(s)); req.on("error", reject); });
const json = (res, code, o) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(o));
async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": hi\n\n");
    pages.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => { clearInterval(ping); pages.delete(res); });
    return;
  }
  if (req.method === "POST" && url.pathname === "/done") {
    const { id, result, error } = JSON.parse(await body(req));
    const w = waiting.get(id);
    if (w) { waiting.delete(id); clearTimeout(w.timer); error ? w.reject(new Error(error)) : w.resolve(result); }
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/cmd") {
    const { cmd, args } = JSON.parse((await body(req)) || "{}");
    try { return json(res, 200, { result: await runTool(cmd, args) }); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (url.pathname === "/mcp") {
    if (req.method !== "POST") return res.writeHead(405, { allow: "POST" }).end();
    let msg;
    try { msg = JSON.parse(await body(req)); } catch { return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    const one = async (m) => {
      if (m.id === undefined) return null;
      try { return { jsonrpc: "2.0", id: m.id, result: await rpc(m) }; } catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: e.code ?? -32603, message: e.message } }; }
    };
    const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
    return !out || (Array.isArray(out) && !out.length) ? res.writeHead(202).end() : json(res, 200, out);
  }
  if (url.pathname === "/api/characters") return json(res, 200, await characters());
  if (url.pathname === "/api/clips") return json(res, 200, await clips());
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1);
  const f = path.resolve(ROOT, rel);
  if (!f.startsWith(ROOT + path.sep) || !/^(index\.html$|src\/|characters\/|clips\/)/.test(rel)) return res.writeHead(404).end();
  const data = await readFile(f).catch(() => null);
  if (!data) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-cache" }).end(data);
}

export function start(port = PORT) {
  const server = http.createServer((req, res) => handle(req, res).catch((e) => { if (!res.headersSent) json(res, 500, { error: e.message }); }));
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await start();
  console.log(`2D Studio: http://127.0.0.1:${PORT}/  (MCP: http://127.0.0.1:${PORT}/mcp)`);
}
