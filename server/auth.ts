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
// cloud: the admin let this user use the cloud model, unthrottled (admin.html; user, 2026-11-16)
if (!(db.prepare("pragma table_info(users)").all() as any[]).some((c) => c.name === "cloud")) db.exec("alter table users add column cloud int not null default 0");
const now = () => Math.floor(Date.now() / 1000);
export const ADMIN = "irishdash";
db.prepare("insert or ignore into users (id, name, provider, role, created) values (?, ?, 'token', 'admin', ?)").run(ADMIN, ADMIN, now());

export type User = { id: string; email: string | null; name: string; picture: string | null; provider: string; role: string; cloud: boolean };
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
  const u = db.prepare("select id, email, name, picture, provider, role, gen, cloud from users where id = ?").get(unb64(m[1])) as any;
  return u && String(u.gen) === m[2] ? { id: u.id, email: u.email, name: u.name, picture: u.picture, provider: u.provider, role: u.role, cloud: u.role === "admin" || !!u.cloud } : null;
}
/** Every account, newest first (admin.html). */
export const listUsers = () => db.prepare("select id, email, name, picture, provider, role, cloud, created, seen from users order by created desc").all() as any[];
export const setCloud = (id: string, on: boolean) => db.prepare("update users set cloud = ? where id = ? and role != 'admin'").run(on ? 1 : 0, id).changes;
export const signOutEverywhere = (id: string) => db.prepare("update users set gen = gen + 1 where id = ?").run(id);

// ---------- a user's own data (the jobs pages: applications, saved searches, and a résumé only if they ask) ----------
db.exec("create table if not exists user_data (user_id text, key text, value text, at int, primary key (user_id, key))");
export const DATA_KEYS = ["tracker", "saved", "resume"];
// web push (push.ts): each browser that asked for alerts, and this server's VAPID key, made once
db.exec("create table if not exists push_subs (endpoint text primary key, user_id text, sub text, at int, last int); create table if not exists kv (k text primary key, v text)");
export const vapidKey = (make: () => object) => { const r = db.prepare("select v from kv where k = 'vapid'").get() as any; if (r) return JSON.parse(r.v); const k = make(); db.prepare("insert into kv values ('vapid', ?)").run(JSON.stringify(k)); return k; };
export const savePush = (uid: string, sub: { endpoint: string }) => db.prepare("insert or replace into push_subs (endpoint, user_id, sub, at, last) values (?, ?, ?, ?, ?)").run(String(sub.endpoint), uid, JSON.stringify(sub), now(), now());
export const dropPush = (endpoint: string) => db.prepare("delete from push_subs where endpoint = ?").run(endpoint);
export const pushSubs = () => db.prepare("select endpoint, user_id, sub, last from push_subs").all() as { endpoint: string; user_id: string; sub: string; last: number }[];
export const pushed = (endpoint: string) => db.prepare("update push_subs set last = ? where endpoint = ?").run(now(), endpoint);
export const getData = (uid: string) => Object.fromEntries((db.prepare("select key, value from user_data where user_id = ?").all(uid) as any[]).map((r) => [r.key, r.value]));
export const putData = (uid: string, key: string, value: string) => value
  ? db.prepare("insert into user_data values (?, ?, ?, ?) on conflict(user_id, key) do update set value = excluded.value, at = excluded.at").run(uid, key, value, now())
  : db.prepare("delete from user_data where user_id = ? and key = ?").run(uid, key);

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
