// Run: node src/rds.test.ts — RDS block checkwords and US call letters (PI codes as decoded off the air in NYC).
import assert from "node:assert/strict";
import { syndrome, callLetters } from "./rds.ts";

// a block = 16 data bits + (their remainder mod g) XOR the offset word; its remainder is then the offset word itself
for (const [offset, data] of [[0x0fc, 0x7fb1], [0x198, 0x2405], [0x168, 0x4854], [0x1b4, 0x4f54]]) {
  const block = (data << 10) | (syndrome(data << 10) ^ offset);
  assert.equal(syndrome(block), offset);
  assert.notEqual(syndrome(block ^ (1 << 13)), offset); // one flipped bit is caught
}
assert.equal(callLetters(0x7fb1), "WQHT"); // Hot 97, 97.1 MHz
assert.equal(callLetters(0x8544), "WSKQ"); // 97.9 MHz
assert.equal(callLetters(0xa6cb), ""); // outside the call-letter range
console.log("rds ok");
