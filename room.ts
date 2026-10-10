// Rooms: a small live chat shared by everyone on a page (Spectrum Lab first), with the page's actions mixed in
// ("tuned to 100.3 MHz WFM"), so people listening to the same radio can follow and join each other.
// Names are a masked IP plus a country flag from Cloudflare (never the full address: other visitors see it).
// Server-sent events out, POST in; the last 100 events are kept in memory per room.
import type http from "node:http";
import { createHash } from "node:crypto";

export type Who = { name: string; flag: string; key: string };
type Ev = { id: number; at: number; who: Who; kind: "say" | "action" | "join" | "leave"; text: string; data?: Record<string, unknown> };
const rooms = new Map<string, { clients: Set<{ res: http.ServerResponse; who: Who }>; log: Ev[]; seq: number }>();
const room = (name: string) => rooms.get(name) ?? rooms.set(name, { clients: new Set(), log: [], seq: 0 }).get(name)!;
const lastPost = new Map<string, number[]>();

const flagOf = (cc: string) => (/^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1" ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🏳️");
/** 73.12.x.x·a3 for 73.12.44.5: the network part shows, the rest doesn't; two hex letters from a hash tell neighbors apart. */
export function who(req: http.IncomingMessage): Who {
  const ip = String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "?").replace(/^::ffff:/, "");
  const tag = createHash("sha256").update(`room:${ip}`).digest("hex").slice(0, 2);
  const masked = ip.includes(":") ? `${ip.split(":").slice(0, 2).join(":")}:…` : ip.split(".").slice(0, 2).concat("x", "x").join(".");
  return { name: `${masked}·${tag}`, flag: flagOf(String(req.headers["cf-ipcountry"] ?? "XX").toUpperCase()), key: tag + masked };
}

function broadcast(name: string, ev: Omit<Ev, "id" | "at">) {
  const r = room(name), full: Ev = { id: ++r.seq, at: Date.now(), ...ev };
  r.log.push(full); if (r.log.length > 100) r.log.shift();
  const line = `event: ev\ndata: ${JSON.stringify(full)}\n\n`;
  for (const c of r.clients) c.res.write(line);
}
const people = (name: string) => [...new Map([...room(name).clients].map((c) => [c.who.key, c.who])).values()];
function presence(name: string) {
  const line = `event: people\ndata: ${JSON.stringify(people(name))}\n\n`;
  for (const c of room(name).clients) c.res.write(line);
}

/** GET: the live feed (recent events, who's here, then everything new). */
export function roomStream(name: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const me = who(req), r = room(name);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
  res.write(`event: hello\ndata: ${JSON.stringify({ me, log: r.log })}\n\n`);
  const client = { res, who: me }, first = !people(name).some((p) => p.key === me.key);
  r.clients.add(client);
  if (first) broadcast(name, { who: me, kind: "join", text: "joined" });
  presence(name);
  const beat = setInterval(() => res.write(": keep-alive\n\n"), 25_000); // proxies close quiet connections
  req.on("close", () => {
    clearInterval(beat); r.clients.delete(client);
    if (!people(name).some((p) => p.key === me.key)) broadcast(name, { who: me, kind: "leave", text: "left" });
    presence(name);
  });
}

/** POST {text} to say something, or {action, data} for a page action. A few per 10 s per person. */
export async function roomPost(name: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const send = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 2000) return send(413, { error: "Too long." }); }
  const me = who(req), now = Date.now(), recent = (lastPost.get(me.key) ?? []).filter((t) => now - t < 10_000);
  if (recent.length >= 5) return send(429, { error: "Slow down a little." });
  lastPost.set(me.key, [...recent, now]); if (lastPost.size > 5000) lastPost.clear();
  let body: any;
  try { body = JSON.parse(raw || "{}"); } catch { return send(400, { error: "Bad request." }); }
  const text = String(body.text ?? body.action ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) return send(400, { error: "Say something." });
  const data = body.action && body.data && typeof body.data === "object" ? Object.fromEntries(Object.entries(body.data).slice(0, 6).map(([k, v]) => [String(k).slice(0, 20), typeof v === "number" ? v : String(v).slice(0, 40)])) : undefined;
  broadcast(name, { who: me, kind: body.action ? "action" : "say", text, data });
  return send(200, { ok: true });
}
