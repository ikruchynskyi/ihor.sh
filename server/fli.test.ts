import assert from "node:assert/strict";
import http from "node:http";
import { parseMcpResponse, callFli } from "./fli.ts";

// SSE parsing
const sse = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"ok\\\":true}\"}]}}\n\n";
assert.equal(parseMcpResponse(sse, "text/event-stream").result.content[0].text, '{"ok":true}');

// Mock Streamable HTTP MCP server with session expiry + retry
let sessions = 0, calls = 0;
const srv = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  if (body.method === "initialize") {
    const sid = `s-${++sessions}`;
    return res.writeHead(200, { "content-type": "application/json", "mcp-session-id": sid })
      .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: {} } }));
  }
  if (body.method === "notifications/initialized") return res.writeHead(202).end();
  if (body.method === "tools/call") {
    calls++;
    if (calls === 1 && req.headers["mcp-session-id"] === "s-1") {
      // Simulate server restart dropping first session
      return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Session not found" }));
    }
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { tool: body.params.name, args: body.params.arguments } } }));
  }
  res.writeHead(404).end();
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
const port = (srv.address() as any).port;
process.env.FLI_MCP_URL = `http://127.0.0.1:${port}/mcp`;

const out: any = await callFli("find_airports", { query: "New York", limit: 3, empty: "" });
assert.equal(out.tool, "find_airports");
assert.equal(out.args.query, "New York");
assert.equal(out.args.empty, undefined);
assert.equal(sessions, 2);
srv.close();
console.log("fli ok");
