#!/usr/bin/env node
// Mochi Studio's local server (no dependencies). It serves the world page and its content, passes commands to the open
// world page(s) and back, and is an MCP server, so an LLM can direct Mochi and edit her clips, rooms and characters.
//
//   node mochi-studio/server.mjs        then open http://127.0.0.1:8792/
//   claude mcp add --transport http mochi http://127.0.0.1:8792/mcp
//
// Routes: GET / (the world), static files under src/ content/ assets/, GET /events (the page's command stream),
// POST /done (the page's answers), POST /cmd {cmd, args} (one command, for scripts and curl), POST /mcp (JSON-RPC).
// Local only: it listens on 127.0.0.1, and content writes stay inside content/<kind>/.
import http from "node:http";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PORT = Number(process.env.MOCHI_PORT ?? 8792);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary",
  ".vrm": "model/gltf-binary", ".fbx": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".md": "text/markdown; charset=utf-8" };
export const KINDS = ["clips", "rooms", "characters"]; // content/<kind>/<name>.json
const NAME = /^[a-z0-9][a-z0-9_-]{0,40}$/;

// ---- the world pages: commands go to every open world page, the first answer wins; previews only hear of reloads ----
const pages = new Set(), watchers = new Set();
const waiting = new Map(); // id -> {resolve, reject, timer}
let nextId = 1;
function toPages(msg, to = pages) { for (const res of to) res.write(`data: ${JSON.stringify(msg)}\n\n`); }
export async function command(cmd, args = {}, ms = 90_000) {
  for (let i = 0; !pages.size && i < 40; i++) await new Promise((r) => setTimeout(r, 250)); // a page that's still loading
  if (!pages.size) throw new Error(`No world is open. Open http://127.0.0.1:${PORT}/ in a browser first (the owner watches it there).`);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${cmd} took longer than ${ms / 1000} s`)); }, ms);
    waiting.set(id, { resolve, reject, timer });
    toPages({ id, cmd, args });
  });
}

// ---- content: clips, rooms, characters as JSON files the page reads and agents write ----
const file = (kind, name) => {
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  if (!NAME.test(name)) throw new Error("name: lowercase letters, digits, - and _ (up to 41)");
  return path.join(ROOT, "content", kind, name + ".json");
};
export async function listContent(kind) {
  const kinds = kind ? [kind] : KINDS, out = {};
  for (const k of kinds) {
    file(k, "x");
    out[k] = {};
    for (const f of (await readdir(path.join(ROOT, "content", k))).filter((f) => f.endsWith(".json")).sort()) {
      const j = JSON.parse(await readFile(path.join(ROOT, "content", k, f), "utf8"));
      out[k][f.slice(0, -5)] = j.about ?? j.name ?? "";
    }
  }
  return out;
}
const readContent = async (kind, name) => JSON.parse(await readFile(file(kind, name), "utf8"));
async function writeContent(kind, name, json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("json must be an object");
  await writeFile(file(kind, name), JSON.stringify(data, null, 1) + "\n");
  return `saved content/${kind}/${name}.json; the open world reloads it`;
}
// Any change under content/ tells the pages to reload that file (agents may also edit the files directly).
let reloadT;
try {
  watch(path.join(ROOT, "content"), { recursive: true }, (_e, f) => {
    clearTimeout(reloadT);
    reloadT = setTimeout(() => toPages({ reload: String(f ?? "") }, [...pages, ...watchers]), 150);
  });
} catch { /* no recursive watch on this platform: reload the page by hand */ }

// ---- MCP tools ----
const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description) => ({ type: "number", description });
export const TOOLS = [
  { name: "look", description: "What is happening now: where Mochi is and what she is doing, the room's objects (their ids and what she can do there), the dog, the clips (actions) she knows, her moods and the camera. Call it first.", inputSchema: S({}) },
  { name: "walk_to", description: "Mochi walks to an object, a spot or the dog (an id from look) and faces it. Returns when she arrives.", inputSchema: S({ target: str("object id, 'dog', or 'x,z' in metres"), run: { type: "boolean", description: "hurry" } }, ["target"]) },
  { name: "sit", description: "Mochi walks to a seat (sofa, chair, bed, cushion…) and sits down.", inputSchema: S({ on: str("seat object id") }, ["on"]) },
  { name: "stand_up", description: "Mochi stands up if she is sitting.", inputSchema: S({}) },
  { name: "act", description: "Mochi plays an action clip (wave, dance, drink_tea, pet_dog, stretch, ... see look.clips). A clip that needs a place or the dog walks her there first. Returns when it ends.", inputSchema: S({ clip: str("clip name"), times: num("repeat a looping clip this many times (default 1)") }, ["clip"]) },
  { name: "say", description: "Mochi says a line out loud: a speech bubble, her mouth moves, and her face shows the mood. Returns when she has finished.", inputSchema: S({ text: str("what she says (one or two sentences)"), mood: str("happy, angry, sad, relaxed, surprised or neutral") }, ["text"]) },
  { name: "feel", description: "Set Mochi's facial expression for a while.", inputSchema: S({ mood: str("happy, angry, sad, relaxed, surprised, neutral"), seconds: num("how long (default 4; 0 = until changed)") }, ["mood"]) },
  { name: "look_at", description: "Mochi turns her head and eyes to an object, the dog, or the camera.", inputSchema: S({ target: str("object id, 'dog', 'camera' or 'none'") }, ["target"]) },
  { name: "camera", description: "Choose the shot, like an anime director: wide (the room), medium (her from the knees up), closeup (her face), two_shot (her and the dog), follow, or auto (the director picks with each action).", inputSchema: S({ shot: str("wide, medium, closeup, two_shot, follow or auto") }, ["shot"]) },
  { name: "dog", description: "Tell the dog what to do: come (to Mochi), go (to a target), sit, lie, wander, wag, bark, jump.", inputSchema: S({ action: str("come, go, sit, lie, wander, wag, bark or jump"), target: str("for go: an object id") }, ["action"]) },
  { name: "wait", description: "Let a few seconds pass (pacing between beats of a scene).", inputSchema: S({ seconds: num("1 to 20") }, ["seconds"]) },
  { name: "snapshot", description: "A picture of what the camera sees now (JPEG).", inputSchema: S({}) },
  { name: "list_content", description: "List the editable content: clips (animations), rooms and characters, with what each is.", inputSchema: S({ kind: str("clips, rooms or characters (omit for all)") }) },
  { name: "read_content", description: "Read one clip, room or character as JSON (see mochi-studio/AGENTS.md for the formats).", inputSchema: S({ kind: str("clips, rooms or characters"), name: str("its name") }, ["kind", "name"]) },
  { name: "write_content", description: "Create or replace a clip, room or character (JSON in the formats of mochi-studio/AGENTS.md). The open world reloads it at once.", inputSchema: S({ kind: str("clips, rooms or characters"), name: str("lowercase name, e.g. bow"), json: { type: "object", description: "the content" } }, ["kind", "name", "json"]) },
];
async function runTool(name, args = {}) {
  switch (name) {
    case "wait": await new Promise((r) => setTimeout(r, Math.max(0.2, Math.min(20, Number(args.seconds) || 1)) * 1000)); return "ok";
    case "list_content": return listContent(args.kind);
    case "read_content": return readContent(args.kind, args.name);
    case "write_content": return writeContent(args.kind, args.name, args.json);
    default:
      if (!TOOLS.some((t) => t.name === name)) throw new Error(`unknown tool ${name}`);
      return command(name, args);
  }
}
const asContent = (out) => typeof out === "object" && out?.image
  ? [{ type: "image", data: out.image.split(",")[1], mimeType: out.image.slice(5, out.image.indexOf(";")) }]
  : [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }];

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
async function rpc(m) {
  switch (m.method) {
    case "initialize": return { protocolVersion: VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0],
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "mochi-studio", version: "1.0.0" },
      instructions: "You direct Mochi, an anime catgirl, in her 3D room, like the director of an anime episode. Call look first, then act in short beats (walk_to, sit, act, say, feel, camera, dog) and check with snapshot when unsure. New clips, rooms and characters: read_content an existing one and write_content a new one (formats in mochi-studio/AGENTS.md)." };
    case "ping": return {};
    case "tools/list": return { tools: TOOLS };
    case "tools/call":
      try { return { content: asContent(await runTool(m.params?.name, m.params?.arguments)) }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    default: throw Object.assign(new Error(`Method not found: ${m.method}`), { code: -32601 });
  }
}

// ---- HTTP ----
const body = (req) => new Promise((resolve, reject) => {
  let s = ""; req.on("data", (c) => { s += c; if (s.length > 4e6) req.destroy(); }); req.on("end", () => resolve(s)); req.on("error", reject);
});
const json = (res, code, obj) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(obj));

async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": hi\n\n");
    const set = url.searchParams.has("watch") ? watchers : pages;
    set.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => { clearInterval(ping); set.delete(res); });
    return;
  }
  if (req.method === "POST" && url.pathname === "/done") {
    const { id, result, error } = JSON.parse(await body(req));
    const w = waiting.get(id);
    if (w) { waiting.delete(id); clearTimeout(w.timer); error ? w.reject(new Error(error)) : w.resolve(result); }
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/cmd") {
    const { cmd, args } = JSON.parse(await body(req) || "{}");
    try { return json(res, 200, { result: await runTool(cmd, args) }); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (url.pathname === "/mcp") {
    if (req.method !== "POST") return res.writeHead(405, { allow: "POST" }).end();
    let msg;
    try { msg = JSON.parse(await body(req)); } catch { return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    const one = async (m) => {
      if (m.id === undefined) return null; // a notification
      try { return { jsonrpc: "2.0", id: m.id, result: await rpc(m) }; }
      catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: e.code ?? -32603, message: e.message } }; }
    };
    const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
    return !out || (Array.isArray(out) && !out.length) ? res.writeHead(202).end() : json(res, 200, out);
  }
  if (req.method === "GET" && url.pathname === "/content-index") return json(res, 200, await listContent());
  // static: the page, its code, content and assets
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1);
  const f = path.resolve(ROOT, rel);
  if (!f.startsWith(ROOT + path.sep) || !/^((index|preview)\.html$|src\/|content\/|assets\/)/.test(rel)) return res.writeHead(404).end();
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
  console.log(`Mochi Studio: http://127.0.0.1:${PORT}/  (MCP: http://127.0.0.1:${PORT}/mcp)`);
}
