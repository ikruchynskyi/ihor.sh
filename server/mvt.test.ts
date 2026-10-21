// Run: node mvt.test.ts — a hand-built vector tile: one "image" layer with a point and its properties.
import assert from "node:assert/strict";
import { mvtPoints } from "./mvt.ts";

const varint = (n: number) => { const o: number[] = []; while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const field = (tag: number, body: number[] | string) => { const b = typeof body === "string" ? [...new TextEncoder().encode(body)] : body; return [...varint(tag * 8 + 2), ...varint(b.length), ...b]; };
const num = (tag: number, n: number) => [...varint(tag * 8), ...varint(n)];
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
// a feature at the middle of tile 14/4824/6158 (lon 4824.5/16384·360−180, lat atan(sinh(π(1−2·6158.5/16384)))), with id = 764986377545348 (above 2^32) and is_pano = true
const feature = [...field(2, [...varint(0), ...varint(0), ...varint(1), ...varint(1)]), ...num(3, 1), ...field(4, [...varint(9), ...varint(zz(2048)), ...varint(zz(2048))])];
const layer = [...field(1, "image"), ...field(2, feature), ...field(3, "id"), ...field(3, "is_pano"), ...field(4, num(5, 764986377545348)), ...field(4, num(7, 1)), ...num(5, 4096)];
const other = [...field(1, "sequence"), ...field(2, feature), ...num(5, 4096)];
const tile = new Uint8Array([...field(3, other), ...field(3, layer)]);

const pts = mvtPoints(tile, "image", 14, 4824, 6158);
assert.equal(pts.length, 1);
assert.equal(pts[0].id, 764986377545348);
assert.equal(pts[0].is_pano, true);
assert.ok(Math.abs(pts[0].lat - 40.7389) < 0.0005 && Math.abs(pts[0].lon - -73.9929) < 0.0005, `${pts[0].lat},${pts[0].lon}`);
console.log("mvt ok");
