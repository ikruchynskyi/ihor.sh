// Fli (https://github.com/punitarani/fli) Google Flights MCP client over Streamable HTTP (FLI_MCP_URL).
import { createMcpClient, parseMcpResponse } from "./mcp-client.ts";

export { parseMcpResponse };

function compactFli(payload: any) {
  let out = payload;
  if (Array.isArray(out.flights)) {
    // Strip verbose amenities / duplicate airport names so 6 flights fit comfortably under Blip's 8 KB tool cap with every booking_url intact.
    out = {
      ...out,
      flights: out.flights.slice(0, 6).map((f: any) => ({
        ...f,
        return_flight: undefined,
        legs: Array.isArray(f?.legs)
          ? f.legs.map(({ departure_airport, arrival_airport, departure_time, arrival_time, duration, airline, airline_code, flight_number, cabin }: any) => ({
              departure_airport, arrival_airport, departure_time, arrival_time, duration, airline, airline_code, flight_number, cabin,
            }))
          : f?.legs,
      })),
    };
  }
  if (Array.isArray(out.dates)) out = { ...out, dates: out.dates.slice(0, 12) };
  return out;
}

/** Call one Fli MCP tool over Streamable HTTP, retrying once if the server restarted and dropped our session. */
export const callFli = createMcpClient(() => process.env.FLI_MCP_URL ?? "http://127.0.0.1:8000/mcp", "Fli", compactFli);
