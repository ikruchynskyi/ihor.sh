// Stays (https://github.com/him229/stays) Google Hotels MCP client over Streamable HTTP (STAYS_MCP_URL).
import { createMcpClient } from "./mcp-client.ts";

function compactRate(r: any) {
  return {
    provider: r.provider, price: r.price, currency: r.currency,
    breakfast_included: r.breakfast_included, includes_taxes_and_fees: r.includes_taxes_and_fees,
    cancellation_kind: r.cancellation_kind, cancellation_free_until: r.cancellation_free_until,
    cancellation_description: r.cancellation_description, deeplink_url: r.deeplink_url,
  };
}

function compactHotel(h: any, maxRooms = 4, maxRates = 4, maxDesc = 240) {
  if (!h || typeof h !== "object") return h;
  const out: any = { ...h };
  delete out.amenity_details;
  if (typeof out.description === "string" && out.description.length > maxDesc) out.description = out.description.slice(0, maxDesc) + "…";
  if (Array.isArray(out.rooms)) {
    out.rooms = out.rooms.slice(0, maxRooms).map((rm: any) => ({
      name: rm.name, bed_config: rm.bed_config, max_occupancy: rm.max_occupancy,
      rates: Array.isArray(rm.rates) ? rm.rates.slice(0, maxRates).map(compactRate) : rm.rates,
    }));
  }
  return out;
}

function compactStays(payload: any) {
  let out = payload;
  if (Array.isArray(out.hotels)) {
    const detailed = out.hotels.some((h: any) => Array.isArray(h?.rooms));
    out = { ...out, hotels: out.hotels.slice(0, detailed ? 5 : 10).map((h: any) => compactHotel(h)) };
  }
  if (out.hotel && typeof out.hotel === "object") out = { ...out, hotel: compactHotel(out.hotel, 6, 5, 400) };
  return out;
}

/** Call one Stays MCP tool over Streamable HTTP, retrying once if the server restarted and dropped our session. */
export const callStays = createMcpClient(() => process.env.STAYS_MCP_URL ?? "http://127.0.0.1:8001/mcp", "Stays", compactStays);
