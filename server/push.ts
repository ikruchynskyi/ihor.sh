// Web push with node:crypto alone: RFC 8291 (the message encrypted for one browser, aes128gcm) and RFC 8292 (VAPID:
// this server signs each request to the browser's push service). Used by the jobs alerts (server.ts): a signed-in
// visitor's browser subscribes on the jobs page, and a morning cron sends one note when there's news for them.
import { createECDH, createCipheriv, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type ECDH } from "node:crypto";

export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Jwk = { kty: string; crv: string; x: string; y: string; d: string };
const b64u = (b: Buffer) => b.toString("base64url");

/** A VAPID key pair (P-256), kept as a JWK. */
export const newVapid = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" }) as Jwk;
/** The public half as browsers want it (applicationServerKey): the uncompressed point, base64url. */
export const vapidPublic = (k: Jwk) => b64u(Buffer.concat([Buffer.from([4]), Buffer.from(k.x, "base64url"), Buffer.from(k.y, "base64url")]));

/** RFC 8291: the payload as one aes128gcm record for this subscription. as and salt are parameters only for the self-test. */
export function encrypt(sub: Sub, payload: Buffer, as?: ECDH, salt = randomBytes(16)) {
  if (!as) { as = createECDH("prime256v1"); as.generateKeys(); }
  const ua = Buffer.from(sub.keys.p256dh, "base64url"), auth = Buffer.from(sub.keys.auth, "base64url"), asPub = as.getPublicKey();
  const ikm = Buffer.from(hkdfSync("sha256", as.computeSecret(ua), auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)), nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const c = createCipheriv("aes-128-gcm", cek, nonce), body = Buffer.concat([c.update(Buffer.concat([payload, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, body]);
}
/** RFC 8292: the Authorization header for one push service (a JWT for its origin, 12 hours, signed ES256). */
export function vapidAuth(endpoint: string, k: Jwk, subject = "https://ihor.sh") {
  const enc = (o: object) => b64u(Buffer.from(JSON.stringify(o))), unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = sign("sha256", Buffer.from(unsigned), { key: createPrivateKey({ key: k as any, format: "jwk" }), dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${vapidPublic(k)}`;
}
/** Sends one note; the push service's status: 201 sent, 404 or 410 the subscription is gone (drop it). */
export async function sendPush(sub: Sub, k: Jwk, note: { title: string; body: string; url: string }) {
  const r = await fetch(sub.endpoint, { method: "POST", signal: AbortSignal.timeout(15_000), body: encrypt(sub, Buffer.from(JSON.stringify(note))),
    headers: { TTL: String(24 * 3600), "content-encoding": "aes128gcm", "content-type": "application/octet-stream", authorization: vapidAuth(sub.endpoint, k) } });
  return r.status;
}

if (import.meta.url === `file://${process.argv[1]}`) { // node server/push.ts: a browser's side decrypts what we send; the JWT verifies
  const assert = (await import("node:assert/strict")).default, { createDecipheriv, verify, createPublicKey } = await import("node:crypto");
  const ua = createECDH("prime256v1"); ua.generateKeys(); const authSecret = randomBytes(16);
  const sub: Sub = { endpoint: "https://push.example.com/send/abc", keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(authSecret) } };
  const rec = encrypt(sub, Buffer.from("hello, 3 new jobs"));
  const salt = rec.subarray(0, 16), idlen = rec[20], asPub = rec.subarray(21, 21 + idlen), ct = rec.subarray(21 + idlen);
  const ikm = Buffer.from(hkdfSync("sha256", ua.computeSecret(asPub), authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32));
  const d = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)), Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12)));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), "hello, 3 new jobs"); assert.equal(plain[plain.length - 1], 2); assert.equal(rec.readUInt32BE(16), 4096);
  const k = newVapid(), h = vapidAuth(sub.endpoint, k), [, jwt] = h.match(/t=([^,]+)/)!, [a, b, s] = jwt.split(".");
  assert.ok(verify("sha256", Buffer.from(`${a}.${b}`), { key: createPublicKey({ key: k as any, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(b, "base64url").toString()).aud, "https://push.example.com"); assert.equal(Buffer.from(vapidPublic(k), "base64url").length, 65);
  console.log("push ok");
}
