// Fli (https://github.com/punitarani/fli) Google Flights MCP client over Streamable HTTP (FLI_MCP_URL).
const FLI_URL = () => process.env.FLI_MCP_URL ?? "http://127.0.0.1:8000/mcp";

let sessionId: string | null = null;
let initInFlight: Promise<string | null> | null = null;

/** Parse either plain JSON or SSE `data:` frames from a Streamable HTTP MCP response. */
export function parseMcpResponse(text: string, contentType: string) {
  if (/text\/event-stream/i.test(contentType)) {
    const msgs = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean)
      .map((s) => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean);
    return msgs.findLast((m: any) => m.result !== undefined || m.error !== undefined) ?? msgs.at(-1) ?? {};
  }
  return JSON.parse(text);
}

async function rpc(method: string, params: unknown, id: number | null, sid: string | null) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(sid ? { "mcp-session-id": sid } : {}),
  };
  const r = await fetch(FLI_URL(), {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", ...(id != null ? { id } : {}), method, params }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = id == null ? "" : await r.text();
  return { status: r.status, sid: r.headers.get("mcp-session-id"), data: body ? parseMcpResponse(body, r.headers.get("content-type") ?? "") : null };
}

async function ensureSession(force = false) {
  if (sessionId && !force) return sessionId;
  if (force) sessionId = null;
  if (!initInFlight) {
    initInFlight = (async () => {
      const res = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ihor.sh-blip", version: "1.0.0" } }, 1, null);
      if (res.status < 200 || res.status >= 300 || res.data?.error) throw new Error(res.data?.error?.message ?? `Fli MCP init HTTP ${res.status}`);
      sessionId = res.sid;
      await rpc("notifications/initialized", {}, null, sessionId).catch(() => {});
      return sessionId;
    })().finally(() => { initInFlight = null; });
  }
  return initInFlight;
}

/** Call one Fli MCP tool over Streamable HTTP, retrying once if the server restarted and dropped our session. */
export async function callFli(name: string, rawArgs: Record<string, unknown> = {}) {
  const args = Object.fromEntries(Object.entries(rawArgs).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const run = async (forceInit: boolean) => rpc("tools/call", { name, arguments: args }, 2, await ensureSession(forceInit));
  try {
    let res = await run(false);
    if (res.status === 404 || (res.status === 400 && /session/i.test(JSON.stringify(res.data ?? "")))) {
      res = await run(true);
    }
    if (res.status < 200 || res.status >= 300) return { error: `Fli server returned HTTP ${res.status}` };
    if (res.data?.error) return { error: String(res.data.error.message ?? "Fli MCP error") };
    const result = res.data?.result ?? {};
    const text = result.content?.find((c: any) => c.type === "text")?.text;
    let payload: any = result.structuredContent;
    if (payload === undefined && typeof text === "string") {
      try { payload = JSON.parse(text); } catch { payload = { text }; }
    }
    if (result.isError) return { error: typeof payload === "string" ? payload : payload?.error ?? payload?.text ?? text ?? "Flight search failed." };
    return payload ?? {};
  } catch (e) {
    return { error: `Flight server unavailable: ${(e as Error).message}` };
  }
}
