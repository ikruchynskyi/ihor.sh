// Run: node src/meteor-map.test.ts. A real Meteor-M2 3 orbit over New York: pixels → ground (by intersecting each
// scan ray with the Earth) → back to pixels with the projector must land where they started.
import assert from "node:assert/strict";
import { parseTle, sgp4, gmst, passes } from "../../sat.ts";
import { Projector, rowTimes, ecef } from "./meteor-map.ts";
import { WIDTH } from "./meteor.ts";

const tle = parseTle("1 57166U 23091A   26285.29562635  .00000011  00000+0  23388-4 0  9990", "2 57166  98.5951 337.7972 0003997 173.6140 186.5090 14.24054036171188", "METEOR-M2 3");
const pass = passes(tle, 40.71, -74.0, tle.epoch, 48).find((p) => p.maxEl > 60)!;
const at = (t: number) => { const r = sgp4(tle, (t - tle.epoch) / 60000).r, g = gmst(t), c = Math.cos(g), s = Math.sin(g); return [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]]; };
const track: number[][] = []; for (let t = Math.floor(pass.rise / 1000) * 1000; t <= pass.set; t += 1000) track.push([t, ...at(t)]);
const rows = Array.from({ length: Math.floor((pass.set - pass.rise) / 1333) }, (_, i) => pass.rise + i * 1333);

// the satellite's clock in Moscow time comes back as UTC
const msk = rows.map((t) => (t + 3 * 3600e3) % 864e5), back = rowTimes(msk, pass.rise + 5 * 60e3)!;
assert.ok(back.every((t, i) => Math.abs(t - rows[i]) < 1), "Moscow ms-of-day → UTC");

// forward: row r, column x → the ray from the satellite at that angle across the track → where it meets the Earth
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]), dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => { const l = Math.sqrt(dot(a, a)); return a.map((v) => v / l); };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ground(r: number, x: number) {
  const t = rows[r], S = at(t), V = sub(at(t + 500), at(t - 500)), v = norm(V);
  const down = norm(sub(S.map((c) => -c), v.map((c) => c * dot(S.map((q) => -q), v)))), right = norm(cross(V, S));
  const th = ((x - WIDTH / 2) / (WIDTH / 2)) * (55.3 * Math.PI) / 180, d = down.map((c, i) => c * Math.cos(th) + right[i] * Math.sin(th));
  let k = 0; for (let i = 0; i < 40; i++) { const p = S.map((c, j) => c + k * d[j]), lat = Math.atan2(p[2], Math.hypot(p[0], p[1])); const R = Math.hypot(...ecef((lat * 180) / Math.PI, 0)); k += Math.hypot(...p) - R; }
  const p = S.map((c, j) => c + k * d[j]), lon = (Math.atan2(p[1], p[0]) * 180) / Math.PI;
  let lat = Math.atan2(p[2], Math.hypot(p[0], p[1])); for (let i = 0; i < 5; i++) { const N = 6378.137 / Math.sqrt(1 - 0.00669437999014 * Math.sin(lat) ** 2); lat = Math.atan2(p[2] + N * 0.00669437999014 * Math.sin(lat), Math.hypot(p[0], p[1])); }
  return [(lat * 180) / Math.PI, lon];
}
const pr = new Projector(track, rows);
let worst = 0, n = 0;
for (const r of [40, rows.length >> 1, rows.length - 40]) for (const x of [100, 500, 784, 1100, 1450]) {
  const [la, lo] = ground(r, x), px = pr.toPixel(la, lo); assert.ok(px, `row ${r} x ${x} should be in view`);
  worst = Math.max(worst, Math.hypot(px![0] - x, px![1] - (8 * r + 0))); n++;
}
console.log(`pass of ${new Date(pass.rise).toISOString()} (${pass.maxEl.toFixed(0)}°): ${n} pixels → ground → pixels, worst ${worst.toFixed(1)} px`);
assert.ok(worst < 3);
// the satellite's right is east on a northbound pass, west on a southbound one
const mid = rows.length >> 1, [la0, lo0] = ground(mid, 784), [la1] = ground(mid + 20, 784), [, loR] = ground(mid, 1300);
assert.equal(Math.sign(loR - lo0), la1 > la0 ? 1 : -1, "right of the image is the satellite's right");
assert.equal(pr.toPixel(-40, 100), null, "the other side of the world is not in the picture");
console.log("map projection ok");
