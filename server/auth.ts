// Accounts. A user lives in data/users.db; the admin ("irishdash") signs in with the owner key (MESH_OWNER_KEY), and
// anyone can make an account with Google (OpenID Connect; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, redirect
// URI <site>/auth/google/callback). A session is a signed cookie, iha = user . generation . issued . signature: nothing
// to look up but the user's row, and "sign out everywhere" bumps the generation so every older cookie stops working.
import { DatabaseSync } from "node:sqlite";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.USERS_DB ?? path.join(dir, "users.db")); // tests: USERS_DB=:memory:
db.exec(`create table if not exists users (id text primary key, email text, name text, picture text, provider text, role text not null default 'user', gen int not null default 0, created int, seen int);
  create unique index if not exists users_email on users (email) where email is not null;`);
const now = () => Math.floor(Date.now() / 1000);
export const ADMIN = "irishdash";
db.prepare("insert or ignore into users (id, name, provider, role, created) values (?, ?, 'token', 'admin', ?)").run(ADMIN, ADMIN, now());

export type User = { id: string; email: string | null; name: string; picture: string | null; provider: string; role: string };
const TTL = 90 * 86400;
const sig = (secret: string, body: string) => createHmac("sha256", secret).update(`account:${body}`).digest("base64url").slice(0, 32);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const b64 = (s: string) => Buffer.from(s).toString("base64url"), unb64 = (s: string) => Buffer.from(s, "base64url").toString();

/** A session cookie's value for this user. */
export function sessionFor(secret: string, id: string) {
  const u = db.prepare("select gen from users where id = ?").get(id) as { gen: number } | undefined;
  if (!u) throw new Error(`no user ${id}`);
  db.prepare("update users set seen = ? where id = ?").run(now(), id);
  const body = `${b64(id)}.${u.gen}.${now().toString(36)}`;
  return `${body}.${sig(secret, body)}`;
}
/** The user behind a session cookie, or null: forged, older than 90 days, signed out everywhere since, or deleted. */
export function userFrom(secret: string, token?: string): User | null {
  const m = token?.match(/^([\w-]+)\.(\d+)\.([0-9a-z]+)\.([\w-]{32})$/);
  if (!m || !same(sig(secret, `${m[1]}.${m[2]}.${m[3]}`), m[4]) || now() - parseInt(m[3], 36) > TTL) return null;
  const u = db.prepare("select id, email, name, picture, provider, role, gen from users where id = ?").get(unb64(m[1])) as any;
  return u && String(u.gen) === m[2] ? { id: u.id, email: u.email, name: u.name, picture: u.picture, provider: u.provider, role: u.role } : null;
}
export const signOutEverywhere = (id: string) => db.prepare("update users set gen = gen + 1 where id = ?").run(id);

// ---------- Google ----------
export const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** A path on this site to go back to after signing in; anything else (another site, //host) becomes "/". */
export const safeNext = (s: string) => (/^\/(?![/\\])[^\s]*$/.test(s) ? s : "/");
/** Where to send the browser to sign in with Google, and the cookie that carries state, nonce and the way back (10 min). */
export function googleStart(secret: string, redirectUri: string, next: string) {
  const state = randomBytes(16).toString("base64url"), nonce = randomBytes(16).toString("base64url"), body = `${state}.${nonce}.${b64(safeNext(next))}.${now().toString(36)}`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" })}`;
  return { url, cookie: `${body}.${sig(secret, body)}` };
}
/** Google sent the browser back: the state must match the cookie we set, the code is exchanged for an ID token straight
 *  from Google over TLS (so its claims are checked, not its signature, as Google's guide for this flow says), and the
 *  account is made on first sign-in. Returns the user id and the page to go back to. */
export async function googleFinish(secret: string, redirectUri: string, code: string, state: string, cookieVal?: string) {
  const m = cookieVal?.match(/^([\w-]+)\.([\w-]+)\.([\w-]*)\.([0-9a-z]+)\.([\w-]{32})$/);
  if (!m || !same(sig(secret, `${m[1]}.${m[2]}.${m[3]}.${m[4]}`), m[5]) || !same(m[1], state) || now() - parseInt(m[4], 36) > 600) throw new Error("That sign-in expired or didn't start on this site. Try again.");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const tok: any = await r.json().catch(() => ({}));
  if (!r.ok || typeof tok.id_token !== "string") throw new Error("Google didn't confirm the sign-in. Try again.");
  const c = JSON.parse(unb64(tok.id_token.split(".")[1] ?? ""));
  if (c.aud !== process.env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(c.iss) || c.exp < now() || c.nonce !== m[2] || !c.sub || !c.email || c.email_verified !== true)
    throw new Error("Google's answer didn't check out. Try again.");
  const id = `g:${c.sub}`;
  db.prepare(`insert into users (id, email, name, picture, provider, role, created, seen) values (?, ?, ?, ?, 'google', 'user', ?, ?)
    on conflict(id) do update set email = excluded.email, name = excluded.name, picture = excluded.picture, seen = excluded.seen`).run(id, String(c.email).slice(0, 200), String(c.name ?? c.email).slice(0, 100), c.picture ? String(c.picture).slice(0, 500) : null, now(), now());
  return { id, next: safeNext(unb64(m[3])) };
}

if (import.meta.url === `file://${process.argv[1]}`) { // USERS_DB=:memory: node server/auth.ts
  const assert = (await import("node:assert/strict")).default;
  const s = sessionFor("secret", ADMIN), u = userFrom("secret", s);
  assert.equal(u?.id, ADMIN); assert.equal(u?.role, "admin");
  assert.equal(userFrom("other", s), null); // another secret
  assert.equal(userFrom("secret", s.slice(0, -1) + (s.endsWith("A") ? "B" : "A")), null); // tampered
  signOutEverywhere(ADMIN); assert.equal(userFrom("secret", s), null); // signed out everywhere
  assert.equal(userFrom("secret", sessionFor("secret", ADMIN))?.id, ADMIN); // a new sign-in works
  assert.equal(safeNext("/nyc/jobs.html?x=1#mine"), "/nyc/jobs.html?x=1#mine"); assert.equal(safeNext("//evil.com"), "/"); assert.equal(safeNext("https://evil.com"), "/"); assert.equal(safeNext("/\\evil.com"), "/");
  await assert.rejects(googleFinish("secret", "http://x/cb", "code", "state", "forged.cookie"), /expired|didn't start/);
  console.log("auth ok");
}
