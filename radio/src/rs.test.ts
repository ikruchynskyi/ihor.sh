// Run: node src/rs.test.ts. Encode random blocks, damage them, and check the decoder's limits.
import assert from "node:assert/strict";
import { rsEncode, rsDecode, rsDecodeInterleaved } from "./rs.ts";

let seed = 11; const rnd = (n: number) => ((seed = (seed * 16807) % 2147483647) % n);
const block = () => { const d = Uint8Array.from({ length: 223 }, () => rnd(256)), b = new Uint8Array(255); b.set(d); b.set(rsEncode(d), 223); return b; };
for (const errors of [0, 1, 5, 16]) for (let k = 0; k < 20; k++) {
  const good = block(), bad = good.slice(), where = new Set<number>();
  while (where.size < errors) where.add(rnd(255));
  for (const i of where) bad[i] ^= 1 + rnd(255);
  assert.equal(rsDecode(bad), errors); assert.deepEqual(bad, good);
}
let caught = 0;
for (let k = 0; k < 20; k++) { const bad = block(); for (let i = 0; i < 40; i++) bad[i * 6] ^= 0x5a; if (rsDecode(bad) < 0) caught++; }
assert.ok(caught >= 19, "40 wrong bytes: reported as unfixable");
// interleaved ×4: a burst of 60 bytes is only 15 per codeword
const f = new Uint8Array(1020), cws = [0, 1, 2, 3].map(block);
for (let c = 0; c < 4; c++) for (let j = 0; j < 255; j++) f[j * 4 + c] = cws[c][j];
const clean = f.slice(); for (let i = 300; i < 360; i++) f[i] ^= 0xff;
assert.equal(rsDecodeInterleaved(f), 60); assert.deepEqual(f, clean);
console.log(`rs ok: up to 16 bytes fixed per block, ${caught}/20 hopeless blocks flagged, a 60-byte burst fixed through interleaving`);
