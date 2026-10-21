// node session.test.ts: who a request is from (clientIp, clientCountry): Cloudflare's headers count only via the tunnel.
import assert from "node:assert/strict";
process.env.TRUSTED_PROXY = "172.30.0.10";
const { clientIp, clientCountry } = await import("./session.ts");
const req = (peer: string, headers: Record<string, string> = {}) => ({ headers, socket: { remoteAddress: peer } });
const cf = { "cf-connecting-ip": "203.0.113.7", "cf-ipcountry": "ua" };
assert.equal(clientIp(req("127.0.0.1", cf)), "203.0.113.7");          // cloudflared on this Mac
assert.equal(clientIp(req("::ffff:127.0.0.1", cf)), "203.0.113.7");
assert.equal(clientIp(req("172.30.0.10", cf)), "203.0.113.7");        // the tunnel container (TRUSTED_PROXY)
assert.equal(clientIp(req("192.168.0.50", cf)), "192.168.0.50");      // straight from the LAN: the header is ignored
assert.equal(clientIp(req("::ffff:192.168.0.50", cf)), "192.168.0.50");
assert.equal(clientIp(req("127.0.0.1")), "127.0.0.1");                // local, no header
assert.equal(clientCountry(req("127.0.0.1", cf)), "UA");
assert.equal(clientCountry(req("192.168.0.50", cf)), "XX");
console.log("session ok: Cloudflare headers trusted only from the tunnel");
