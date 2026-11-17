// Shared Streamable HTTP MCP client used by Fli (flights) and Stays (hotels).
let nextId = 1; // JSON-RPC ids must be unique per request or FastMCP routes parallel calls onto one stream

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

/** Create a session-aware Streamable HTTP MCP tool caller with session-expiry retry. */
export function createMcpClient(
  getUrl: () => string,
  label: string,
  compact?: (payload: any) => any,
  timeoutMs = 45_000,
) {
  let sessionId: string | null = null;
  let initInFlight: Promise<string | null> | null = null;

  async function rpc(method: string, params: unknown, id: number | null, sid: string | null) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sid ? { "mcp-session-id": sid } : {}),
    };
    const r = await fetch(getUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", ...(id != null ? { id } : {}), method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = id == null ? "" : await r.text();
    return { status: r.status, sid: r.headers.get("mcp-session-id"), data: body ? parseMcpResponse(body, r.headers.get("content-type") ?? "") : null };
  }

  async function ensureSession(expiredSid?: string | null) {
    if (expiredSid !== undefined && sessionId === expiredSid) sessionId = null;
    if (sessionId) return sessionId;
    if (!initInFlight) {
      initInFlight = (async () => {
        const res = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ihor.sh-blip", version: "1.0.0" } }, ++nextId, null);
        if (res.status < 200 || res.status >= 300 || res.data?.error) throw new Error(res.data?.error?.message ?? `${label} MCP init HTTP ${res.status}`);
        sessionId = res.sid;
        await rpc("notifications/initialized", {}, null, sessionId).catch(() => {});
        return sessionId;
      })().finally(() => { initInFlight = null; });
    }
    return initInFlight;
  }

  return async function callTool(name: string, rawArgs: Record<string, unknown> = {}) {
    const args = Object.fromEntries(Object.entries(rawArgs).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    try {
      let sid = await ensureSession();
      let res = await rpc("tools/call", { name, arguments: args }, ++nextId, sid);
      if (res.status === 404 || (res.status === 400 && /session/i.test(JSON.stringify(res.data ?? "")))) {
        sid = await ensureSession(sid);
        res = await rpc("tools/call", { name, arguments: args }, ++nextId, sid);
      }
      if (res.status < 200 || res.status >= 300) return { error: `${label} server returned HTTP ${res.status}` };
      if (res.data?.error) return { error: String(res.data.error.message ?? `${label} MCP error`) };
      const result = res.data?.result ?? {};
      const text = result.content?.find((c: any) => c.type === "text")?.text;
      let payload: any = result.structuredContent;
      if (payload === undefined && typeof text === "string") {
        try { payload = JSON.parse(text); } catch { payload = { text }; }
      }
      if (result.isError || (payload?.success === false && payload.error)) {
        return { error: typeof payload === "string" ? payload : payload?.error ?? payload?.text ?? text ?? `${label} search failed.` };
      }
      return compact && payload && typeof payload === "object" ? compact(payload) : (payload ?? {});
    } catch (e) {
      return { error: `${label} server unavailable: ${(e as Error).message}` };
    }
  };
}
