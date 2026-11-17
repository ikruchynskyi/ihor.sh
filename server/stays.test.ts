import assert from "node:assert/strict";
import http from "node:http";
import { callStays } from "./stays.ts";

let sessions = 0;
const srv = http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  if (body.method === "initialize") {
    return res.writeHead(200, { "content-type": "application/json", "mcp-session-id": `st-${++sessions}` })
      .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: {} } }));
  }
  if (body.method === "notifications/initialized") return res.writeHead(202).end();
  if (body.method === "tools/call") {
    if (body.params.name === "search_hotels") {
      const hotels = Array.from({ length: 14 }, (_, i) => ({ name: `Hotel ${i}`, entity_key: `k${i}`, display_price: 100 + i }));
      return res.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { success: true, count: 14, hotels } } }));
    }
    if (body.params.name === "get_hotel_details") {
      const rooms = Array.from({ length: 8 }, (_, r) => ({
        name: `Room ${r}`, bed_config: "1 King", max_occupancy: 2,
        rates: Array.from({ length: 7 }, (_, p) => ({
          provider: `OTA ${p}`, price: 150 + p, currency: "USD",
          cancellation_kind: "FREE", deeplink_url: `https://example.com/book/${r}/${p}`, extra: "drop-me",
        })),
      }));
      return res.writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { success: true, hotel: { name: "Inn", amenity_details: ["spa"], description: "x".repeat(500), rooms } } } }));
    }
  }
  res.writeHead(404).end();
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
process.env.STAYS_MCP_URL = `http://127.0.0.1:${(srv.address() as any).port}/mcp`;

const list: any = await callStays("search_hotels", { query: "Hunter Mountain", check_in: "2026-11-27", check_out: "2026-11-29", empty: "" });
assert.equal(list.hotels.length, 10);
assert.equal(list.hotels[0].entity_key, "k0");

const det: any = await callStays("get_hotel_details", { entity_key: "k0", check_in: "2026-11-27", check_out: "2026-11-29" });
assert.equal(det.hotel.amenity_details, undefined);
assert.equal(det.hotel.rooms.length, 6);
assert.equal(det.hotel.rooms[0].rates.length, 5);
assert.equal(det.hotel.rooms[0].rates[0].deeplink_url, "https://example.com/book/0/0");
assert.equal(det.hotel.rooms[0].rates[0].extra, undefined);
assert.ok(det.hotel.description.length <= 401);

srv.close();
console.log("stays ok");
