// Mapbox vector tiles (protobuf), just enough to read point layers: every Mapillary photo as a point.
type P = { i: number };
const varint = (b: Uint8Array, p: P) => { let v = 0, m = 1, c: number; do { c = b[p.i++]; v += (c & 127) * m; m *= 128; } while (c & 128); return v; };
function* fields(b: Uint8Array): Generator<[number, number | Uint8Array]> {
  const p = { i: 0 };
  while (p.i < b.length) {
    const key = varint(b, p), wt = key & 7, tag = key >>> 3;
    if (wt === 0) yield [tag, varint(b, p)];
    else { const n = wt === 2 ? varint(b, p) : wt === 5 ? 4 : wt === 1 ? 8 : NaN; if (Number.isNaN(n)) throw new Error("bad tile"); yield [tag, b.subarray(p.i, p.i + n)]; p.i += n; }
  }
}
const packed = (b: Uint8Array) => { const p = { i: 0 }, o: number[] = []; while (p.i < b.length) o.push(varint(b, p)); return o; };
const zz = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);
const text = new TextDecoder();
function value(b: Uint8Array): unknown {
  for (const [t, v] of fields(b)) {
    if (typeof v === "number") return t === 6 ? zz(v) : t === 7 ? !!v : v; // int, uint, sint, bool
    const dv = new DataView(v.buffer, v.byteOffset, v.length);
    return t === 1 ? text.decode(v) : t === 2 ? dv.getFloat32(0, true) : dv.getFloat64(0, true);
  }
  return null;
}
/** The points of one layer of tile z/x/y, each with its properties and lat/lon. */
export function mvtPoints(tile: Uint8Array, layer: string, z: number, x: number, y: number) {
  const n = 2 ** z, out: Record<string, any>[] = [];
  for (const [t, lb] of fields(tile)) {
    if (t !== 3 || typeof lb === "number") continue;
    let name = "", extent = 4096; const keys: string[] = [], vals: unknown[] = [], feats: Uint8Array[] = [];
    for (const [lt, v] of fields(lb)) {
      if (typeof v === "number") { if (lt === 5) extent = v; }
      else if (lt === 1) name = text.decode(v); else if (lt === 2) feats.push(v); else if (lt === 3) keys.push(text.decode(v)); else if (lt === 4) vals.push(value(v));
    }
    if (name !== layer) continue;
    for (const fb of feats) {
      const o: Record<string, any> = {}; let g: number[] = [];
      for (const [ft, v] of fields(fb)) if (typeof v !== "number") { if (ft === 2) { const tags = packed(v); for (let i = 0; i < tags.length; i += 2) o[keys[tags[i]]] = vals[tags[i + 1]]; } else if (ft === 4) g = packed(v); }
      if (g.length < 3) continue;
      const px = (x + zz(g[1]) / extent) / n, py = (y + zz(g[2]) / extent) / n;
      o.lon = px * 360 - 180; o.lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * py))) * 180) / Math.PI;
      out.push(o);
    }
  }
  return out;
}
