// Blip as an MCP server: every Blip tool (NYC transit, weather, aircraft, ISS, storms, radio, events, restaurants, trips,
// ham radio, web search…) for any MCP client, plus `ask_blip` for a whole answer. Auth: "Authorization: Bearer <MCP_TOKEN
// from .env>" (the bare token works too). Both transports:
//   Streamable HTTP (current): POST /mcp with JSON-RPC, the answer comes back as JSON.
//   HTTP+SSE (older clients): GET /mcp opens an event stream that names a URL; POST there, answers arrive on the stream.
// CORS is open, so clients running in a browser engine can call it (the token is the protection).
// The same Blip answers A2A agents at /a2a (JSON-RPC binding, SendMessage), with the same token. Discovery cards for
// both are served under /.well-known/ (serverCard, agentCard).
import type http from "node:http";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { toolDefs, runTool } from "./blip.ts";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]; // newest first
const sha = (s: string) => createHash("sha256").update(s).digest();
const authorized = (header: string | undefined) => {
  const token = process.env.MCP_TOKEN ?? "", got = String(header ?? "").replace(/^(Bearer\s+)+/i, "").trim();
  return token.length >= 24 && timingSafeEqual(sha(got), sha(token)); // hashes: equal length, so the compare is constant-time
};

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
const INSTRUCTIONS = "Live NYC data (subway, buses, ferries, Citi Bike, traffic, 311, events, restaurants, trips), the sky (weather, aircraft, ISS, hurricanes), radio (stations, callsigns, repeaters) and web search. Call ask_blip for a composed answer.";
const ASK = { name: "ask_blip", description: "Ask Blip, ihor.sh's assistant, a question in plain words; it picks and chains its own tools (and web search) and answers in a few sentences with links.", inputSchema: { type: "object", properties: { question: { type: "string", description: "The question" } }, required: ["question"] } };

async function handle(m: Rpc, ask: (q: string) => Promise<{ reply: string; tools: string[] }>) {
  switch (m.method) {
    case "initialize": {
      const v = VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0];
      return { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ihor.sh Blip", version: "1.0.0" }, instructions: INSTRUCTIONS };
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

/** /.well-known/mcp/server-card.json (SEP-1649): what /mcp is before connecting. */
export const serverCard = (site: string) => ({
  version: "1.0", protocolVersion: VERSIONS[0], serverInfo: { name: "ihor.sh Blip", title: "Blip, ihor.sh's assistant", version: "1.0.0" },
  description: INSTRUCTIONS, documentationUrl: `${site}/llms.txt`,
  transport: { type: "streamable-http", endpoint: `${site}/mcp` },
  capabilities: { tools: { listChanged: false } }, authentication: { required: true, schemes: ["bearer"] },
  tools: [ASK, ...toolDefs()],
});

/** /.well-known/agent-card.json (A2A): Blip as an agent at /a2a. */
export const agentCard = (site: string) => ({
  name: "Blip (ihor.sh)", version: "1.0.0", description: `ihor.sh's assistant. ${INSTRUCTIONS.replace(/ Call ask_blip.*/, "")} Answers in a few sentences with links.`,
  supportedInterfaces: [{ url: `${site}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  provider: { organization: "ihor.sh", url: site }, documentationUrl: `${site}/llms.txt`,
  capabilities: { streaming: false, pushNotifications: false },
  securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: "Bearer" } } }, securityRequirements: [{ schemes: { bearer: { list: [] } } }],
  defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"],
  skills: [
    { id: "nyc-live", name: "NYC right now", description: "Subway, bus and ferry arrivals, Citi Bike, trip plans, events, restaurant inspections, 311 and traffic in New York City.", tags: ["nyc", "transit", "events"], examples: ["When's the next L train at Bedford Av?", "Free events in Brooklyn tonight"] },
    { id: "sky", name: "The sky", description: "Weather, aircraft and ships around NYC, ISS and satellite passes, tropical storms.", tags: ["weather", "aircraft", "iss"], examples: ["What plane is flying over Midtown?"] },
    { id: "radio", name: "Radio", description: "Radio stations, ham callsigns, repeaters, HF propagation and what the site's receiver heard on air.", tags: ["radio", "ham", "sdr"], examples: ["Look up callsign W1AW"] },
    { id: "site-and-web", name: "ihor.sh and the web", description: "Finds pages on ihor.sh (radio, AI, electronics and Japanese courses, NYC tools) and searches the web.", tags: ["search"], examples: ["Which ihor.sh lesson explains attention?"] },
  ],
});

// CORS and the bearer token for /mcp and /a2a; false when the request was answered here.
function gate(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id, a2a-version");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-expose-headers", "mcp-session-id, www-authenticate");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return false; } // CORS preflight: no token on these
  if (authorized(req.headers.authorization)) return true;
  res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": 'Bearer realm="ihor.sh mcp"' }).end(JSON.stringify({ error: "Missing or wrong bearer token." }));
  return false;
}

/** /a2a: A2A JSON-RPC, SendMessage only; the text parts go to Blip and its answer comes back as one message. */
export async function a2a(req: http.IncomingMessage, res: http.ServerResponse, ask: (q: string) => Promise<{ reply: string; tools: string[] }>) {
  if (!gate(req, res)) return;
  const send = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
  if (req.method !== "POST") return send(405, { error: "POST JSON-RPC (SendMessage)." });
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 100_000) return send(413, { error: "Too large." }); }
  let m: Rpc;
  try { m = JSON.parse(raw); } catch { return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const id = m?.id ?? null, err = (code: number, message: string) => send(200, { jsonrpc: "2.0", id, error: { code, message } });
  if (m?.method !== "SendMessage") return err(-32601, `Method not found: ${m?.method} (only SendMessage)`);
  const text = (Array.isArray(m.params?.message?.parts) ? m.params.message.parts : []).map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim();
  if (!text) return err(-32602, "The message has no text parts.");
  const a = await ask(text.slice(0, 2000));
  send(200, { jsonrpc: "2.0", id, result: { message: { messageId: randomUUID(), contextId: m.params.message.contextId ?? randomUUID(), role: "ROLE_AGENT", parts: [{ text: a.reply }] } } });
}

const sse = new Map<string, http.ServerResponse>(); // older-transport sessions: id → their event stream

/** /mcp: POST JSON-RPC (one message or a batch; notifications get 202), or GET for the older SSE transport. */
export async function mcp(req: http.IncomingMessage, res: http.ServerResponse, ask: (q: string) => Promise<{ reply: string; tools: string[] }>) {
  if (!gate(req, res)) return;
  const send = (code: number, body?: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(body === undefined ? undefined : JSON.stringify(body));
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
