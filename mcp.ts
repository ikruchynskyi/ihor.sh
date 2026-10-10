// Blip as an MCP server: every Blip tool (NYC transit, weather, aircraft, ISS, storms, radio, events, restaurants, trips,
// ham radio, web search…) for any MCP client, plus `ask_blip` for a whole answer. Auth: "Authorization: Bearer <MCP_TOKEN
// from .env>" (the bare token works too). Both transports:
//   Streamable HTTP (current): POST /mcp with JSON-RPC, the answer comes back as JSON.
//   HTTP+SSE (older clients): GET /mcp opens an event stream that names a URL; POST there, answers arrive on the stream.
// CORS is open, so clients running in a browser engine can call it (the token is the protection).
import type http from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { toolDefs, runTool } from "./blip.ts";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]; // newest first
const sha = (s: string) => createHash("sha256").update(s).digest();
const authorized = (header: string | undefined) => {
  const token = process.env.MCP_TOKEN ?? "", got = String(header ?? "").replace(/^(Bearer\s+)+/i, "").trim();
  return token.length >= 24 && timingSafeEqual(sha(got), sha(token)); // hashes: equal length, so the compare is constant-time
};

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
const ASK = { name: "ask_blip", description: "Ask Blip, ihor.sh's assistant, a question in plain words; it picks and chains its own tools (and web search) and answers in a few sentences with links.", inputSchema: { type: "object", properties: { question: { type: "string", description: "The question" } }, required: ["question"] } };

async function handle(m: Rpc, ask: (q: string) => Promise<{ reply: string; tools: string[] }>) {
  switch (m.method) {
    case "initialize": {
      const v = VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0];
      return { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ihor.sh Blip", version: "1.0.0" },
        instructions: "Live NYC data (subway, buses, ferries, Citi Bike, traffic, 311, events, restaurants, trips), the sky (weather, aircraft, ISS, hurricanes), radio (stations, callsigns, repeaters) and web search. Call ask_blip for a composed answer." };
    }
    case "ping": return {};
    case "tools/list": return { tools: [ASK, ...toolDefs()] };
    case "tools/call": {
      const { name, arguments: args } = m.params ?? {};
      try {
        if (name === "ask_blip") { const a = await ask(String(args?.question ?? "")); return { content: [{ type: "text", text: a.reply }], structuredContent: { reply: a.reply, toolsUsed: a.tools } }; }
        const out = await runTool(String(name), args ?? {});
        return { content: [{ type: "text", text: JSON.stringify(out).slice(0, 60_000) }] };
      } catch (e) { return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true }; }
    }
    default: throw Object.assign(new Error(`Method not found: ${m.method}`), { code: -32601 });
  }
}

const sse = new Map<string, http.ServerResponse>(); // older-transport sessions: id → their event stream

/** /mcp: POST JSON-RPC (one message or a batch; notifications get 202), or GET for the older SSE transport. */
export async function mcp(req: http.IncomingMessage, res: http.ServerResponse, ask: (q: string) => Promise<{ reply: string; tools: string[] }>) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-expose-headers", "mcp-session-id, www-authenticate");
  if (req.method === "OPTIONS") return res.writeHead(204).end(); // CORS preflight: no token on these
  const send = (code: number, body?: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(body === undefined ? undefined : JSON.stringify(body));
  if (!authorized(req.headers.authorization)) { res.setHeader("www-authenticate", 'Bearer realm="ihor.sh mcp"'); return send(401, { error: "Missing or wrong bearer token." }); }
  const session = new URL(req.url ?? "/", "http://x").searchParams.get("session");
  if (req.method === "GET") { // older HTTP+SSE transport: announce where to post, then stream the answers
    const id = Math.random().toString(36).slice(2, 14);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
    res.write(`event: endpoint\ndata: /mcp?session=${id}\n\n`);
    sse.set(id, res);
    const beat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    req.on("close", () => { clearInterval(beat); sse.delete(id); });
    return;
  }
  if (req.method === "DELETE") return send(200, {}); // end of a session: nothing kept
  if (req.method !== "POST") { res.setHeader("allow", "GET, POST, DELETE, OPTIONS"); return send(405, { error: "Use POST (or GET for the SSE transport)." }); }
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 100_000) return send(413); }
  let msg: Rpc | Rpc[];
  try { msg = JSON.parse(raw); } catch { return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const one = async (m: Rpc) => {
    if (m?.jsonrpc !== "2.0" || typeof m.method !== "string") return { jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
    if (m.id === undefined) return null; // a notification (e.g. notifications/initialized): nothing to answer
    try { return { jsonrpc: "2.0", id: m.id, result: await handle(m, ask) }; }
    catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: (e as any).code ?? -32603, message: (e as Error).message } }; }
  };
  if (session) { // older transport: accept now, answer on the session's event stream
    const stream = sse.get(session);
    if (!stream) return send(404, { error: "Unknown session: open GET /mcp first." });
    send(202);
    const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
    for (const o of Array.isArray(out) ? out : out ? [out] : []) stream.write(`event: message\ndata: ${JSON.stringify(o)}\n\n`);
    return;
  }
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
  return out === null || (Array.isArray(out) && !out.length) ? send(202) : send(200, out);
}
