// Run: node src/meteor-image.test.ts. Finished Meteor pictures: composites, palettes, gap filling, the spread scan and maps.
import assert from "node:assert/strict";
import { Channel, WIDTH } from "./meteor.ts";
import { PRESETS, canMake, render, fillGaps, rotate180, thermalColor, rainColor, Spread, MapView } from "./meteor-image.ts";

// composites: channel 2 in red and green, channel 1 in blue
const chs = new Map<number, Channel>(), px = (v: number) => new Uint8Array(112 * 8).fill(v);
for (const [apid, v] of [[64, 50], [65, 200], [68, 240]] as const) { const c = new Channel(); for (let m = 0; m < 196; m += 14) c.add(m, m / 14, px(v)); chs.set(apid, c); }
const same = (a: number, b: number) => chs.get(b)!.rows.map((_, i) => i);
const p221 = PRESETS.find((p) => p.id === "221")!, img = render(p221, chs, same);
assert.deepEqual([...img.data.subarray(0, 4)], [200, 200, 50, 255], "2-2-1: channel 2 red and green, channel 1 blue");
assert.equal(canMake(PRESETS.find((p) => p.id === "321")!, [...chs.keys()]), false, "3-2-1 needs channel 3, which this pass lacks");
const rain = render(PRESETS.find((p) => p.id === "rain")!, chs, same);
assert.deepEqual([...rain.data.subarray(0, 3)], rainColor(240), "infrared 240 (a very cold top) is painted as rain");
assert.equal(rainColor(150), null); assert.deepEqual(thermalColor(255), [255, 255, 255]);

// gaps: a black band between two gray lines is blended over; rotation is a half turn
const pic = { data: new Uint8ClampedArray(WIDTH * 10 * 4), width: WIDTH, height: 10 };
for (const y of [0, 1, 2, 7, 8, 9]) for (let x = 0; x < WIDTH; x++) pic.data.set([y < 5 ? 100 : 200, 100, 100, 255], (y * WIDTH + x) * 4);
fillGaps(pic);
assert.ok(pic.data[(5 * WIDTH + 9) * 4] > 100 && pic.data[(5 * WIDTH + 9) * 4] < 200, "a lost line is filled in between its neighbors");
const r = rotate180(pic); assert.deepEqual([...r.data.subarray(0, 4)], [...pic.data.subarray(pic.data.length - 4)]);

// spreading: nadir keeps its scale, the edges stretch, and the column mapping goes both ways
const sp = new Spread(109.55, 830);
assert.ok(sp.width > 2700 && sp.width < 2850, `a 2,800 km swath at ~1 km a pixel: ${sp.width} px`);
for (const x of [0, 200, 784, 1300, 1567]) assert.ok(Math.abs(sp.raw(sp.x(x)) - x) < 1e-6, "raw → spread → raw");
assert.ok(Math.abs(sp.x(785) - sp.x(784) - 1) < 0.01 && sp.x(1567) - sp.x(1566) > 3, "1 px at the track, 3+ px at the edge");

// maps: lat/lon → pixel → lat/lon, around New York
const area: [number, number][] = []; for (let la = 30; la <= 50; la += 2) for (let lo = -85; lo <= -60; lo += 2) area.push([la, lo]);
for (const kind of ["mercator", "azeq"] as const) {
  const m = new MapView(kind, area, [40.7, -74]);
  assert.ok(m.width > 500 && m.height > 500 && m.width <= 2600 && m.height <= 2600, `${kind}: ${m.width}×${m.height}`);
  for (const [la, lo] of [[40.7, -74], [33, -80], [48, -62]]) { const p = m.fwd(la, lo)!, [a, b] = m.inv(p[0], p[1]); assert.ok(Math.abs(a - la) < 1e-6 && Math.abs(b - lo) < 1e-6, `${kind} round trip at ${la}, ${lo}`); }
  const ny = m.fwd(40.7, -74)!, north = m.fwd(45, -74)!, east = m.fwd(40.7, -68)!;
  assert.ok(north[1] < ny[1] && east[0] > ny[0], `${kind}: north is up, east is right`);
}
console.log("meteor image ok: composites, rain and temperature colors, gap filling, spread scan, Mercator and azimuthal maps");
