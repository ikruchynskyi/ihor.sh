import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Visitor sessions: every page hands out a signed cookie ("ihs"), and the API only answers requests that bring it
// back. A caller that never loaded a page through the site has none. A scraper that does load a page first gets a
// session like any visitor, and with it the same per-session limits (spend below).

export const TTL = 24 * 3600_000;
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url").slice(0, 32);

/** A new session token: issued-at (base 36) . random id . signature. */
export function issue(secret: string, now = Date.now()) {
  const body = `${now.toString(36)}.${randomBytes(9).toString("base64url")}`;
  return `${body}.${sign(secret, body)}`;
}

/** The session behind a token, or null if it's forged, expired or missing. */
export function check(secret: string, token: string | undefined, now = Date.now()) {
  const m = token?.match(/^([0-9a-z]+)\.([\w-]{12})\.([\w-]{32})$/);
  if (!m) return null;
  const want = Buffer.from(sign(secret, `${m[1]}.${m[2]}`)), got = Buffer.from(m[3]);
  if (!timingSafeEqual(want, got)) return null;
  const age = now - parseInt(m[1], 36);
  return age >= 0 && age < TTL ? { id: m[2], age } : null;
}

export const cookie = (header: string | undefined, name = "ihs") => header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

// ponytail: in-memory windows, reset on restart; fine for one server.
const used = new Map<string, number[]>();
/** Count one call against `key`; false when it already made `limit` calls in the last `windowMs`. */
export function spend(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (used.size > 50_000) used.clear();
  const recent = (used.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  used.set(key, recent);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) { // node session.ts: self-check
  const assert = (await import("node:assert/strict")).default;
  const t = issue("s", 1_000_000);
  assert.equal(check("s", t, 1_000_000 + 5_000)?.age, 5_000);
  assert.equal(check("other secret", t, 1_000_000), null);
  assert.equal(check("s", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), 1_000_000), null);
  assert.equal(check("s", t, 1_000_000 + TTL), null);
  assert.equal(check("s", undefined), null);
  assert.equal(cookie("a=1; ihs=xyz; b=2"), "xyz");
  assert.ok(spend("k", 2, 1000, 0) && spend("k", 2, 1000, 1) && !spend("k", 2, 1000, 2) && spend("k", 2, 1000, 1001));
  console.log("session ok");
}
