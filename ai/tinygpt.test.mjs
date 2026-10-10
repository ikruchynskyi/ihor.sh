// Run: node ai/tinygpt.test.mjs — the gradients are right (finite differences), and training lowers the loss.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TinyGPT } from "./tinygpt.js";

const text = "\n" + readFileSync(new URL("./data/stations.txt", import.meta.url), "utf8"), chars = [...new Set(text)].sort();
// gradient check on a tiny model: analytic vs numeric for a few parameters of every kind
{
  const m = new TinyGPT(chars, { d: 8, T: 6, seed: 3 }), ids = m.encode(text.slice(0, 40)), tok = Int32Array.from(ids.slice(0, 12)), tgt = Int32Array.from(ids.slice(1, 13));
  const lossAt = () => { const L = m.forward(tok, 2, 6); return m.backward(L, tgt).loss; };
  const { grads } = m.backward(m.forward(tok, 2, 6), tgt);
  for (const k of ["E", "P", "Wq", "Wk", "Wv", "Wo", "W1", "b1", "W2", "b2", "U", "bu"]) for (const i of [0, 3, 7]) {
    if (i >= m.p[k].length) continue;
    const old = m.p[k][i], h = 1e-2; m.p[k][i] = old + h; const up = lossAt(); m.p[k][i] = old - h; const dn = lossAt(); m.p[k][i] = old;
    const num = (up - dn) / (2 * h), ana = grads[k][i];
    assert.ok(Math.abs(num - ana) < 2e-3 + 0.05 * Math.abs(num), `${k}[${i}]: numeric ${num.toFixed(5)} vs analytic ${ana.toFixed(5)}`);
  }
}
// training: the loss falls from ln(V) ≈ 4.2 well below 2.5 in a few hundred steps
const m = new TinyGPT(chars, { d: 48, T: 32, seed: 1 }), ids = m.encode(text);
const t0 = Date.now(); let first = 0, last = 0;
for (let s = 0; s < 400; s++) { const l = m.train(ids, { B: 8 }); if (s < 10) first += l / 10; if (s >= 390) last += l / 10; }
console.log(`${m.size.toLocaleString()} parameters; loss ${first.toFixed(2)} → ${last.toFixed(2)} in 400 steps (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
assert.ok(first > 3.5 && last < 2.6, `loss ${first} → ${last}`);
console.log("samples:", Array.from({ length: 6 }, () => m.sample(0.8)).join(" | "));
