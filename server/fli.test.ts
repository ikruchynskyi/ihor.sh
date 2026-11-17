import assert from "node:assert/strict";
import http from "node:http";
import { parseMcpResponse, callFli } from "./fli.ts";

// SSE parsing
const sse = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"ok\\\":true}\"}]}}\n\n";
assert.equal(parseMcpResponse(sse, "text/event-stream").result.content[0].text, '{"ok":true}');

// Mock Streamable HTTP MCP server with session expiry + retry + parallel unique ids
let sessions = 0, calls = 0;
const seenIds: number[] = [];
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
    seenIds.push(body.id);
    if (calls === 1 && req.headers["mcp-session-id"] === "s-1") {
      // Simulate server restart dropping first session
      return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Session not found" }));
    }
    return res.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { id: body.id, tool: body.params.name, args: body.params.arguments } } }));
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

const batch: any[] = await Promise.all(["CUN", "SJU", "MIA", "AUA"].map((d) => callFli("search_dates", { destination: d })));
assert.deepEqual(batch.map((b) => b.args.destination), ["CUN", "SJU", "MIA", "AUA"]);
assert.equal(new Set(batch.map((b) => b.id)).size, 4);
assert.equal(new Set(seenIds).size, seenIds.length);

// Flights compaction keeps <= 6 itineraries, preserves booking_url, strips legroom/amenities bloat
const richFlights = Array.from({ length: 8 }, (_, i) => ({
  price: 200 + i, currency: "USD", booking_url: `https://www.google.com/travel/flights/booking?tfs=x${i}`,
  return_flight: { primary_airline: "B6" },
  legs: [{ departure_airport: "JFK", departure_airport_name: "JFK Long", arrival_airport: "SJU", departure_time: "2027-01-13T08:00:00", arrival_time: "2027-01-13T12:00:00", duration: 240, airline: "JetBlue", airline_code: "B6", flight_number: "1", cabin: "ECONOMY", amenities: { wifi: true } }],
}));
const origRpc = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 99, result: { structuredContent: { flights: richFlights } } }), { status: 200, headers: { "content-type": "application/json" } })) as any;
try {
  const compacted: any = await callFli("search_flights", { origin: "JFK", destination: "SJU", departure_date: "2027-01-13" });
  assert.equal(compacted.flights.length, 6);
  assert.equal(compacted.flights[0].booking_url, "https://www.google.com/travel/flights/booking?tfs=x0");
  assert.equal(compacted.flights[0].legs[0].amenities, undefined);
  assert.equal(compacted.flights[0].legs[0].departure_airport_name, undefined);
} finally {
  globalThis.fetch = origRpc;
}
srv.close();
console.log("fli ok");
