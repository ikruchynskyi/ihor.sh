// A tiny GPT, from scratch: one transformer block (single-head causal self-attention + an MLP, with residual connections)
// over characters, trained by hand-written backpropagation and Adam. Small enough to train in a browser tab in a minute,
// big enough to learn what NYC subway station names look like and invent new ones.
// Pure (no DOM), so node can test it: node ai/tinygpt.test.mjs

const randn = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// matrices are Float32Arrays, row-major: A is n×k, B is k×m
function mm(A, B, n, k, m, out = new Float32Array(n * m)) { out.fill(0); for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i * k + p]; if (a) for (let j = 0; j < m; j++) out[i * m + j] += a * B[p * m + j]; } return out; }
function mmTA(A, B, n, k, m, out = new Float32Array(k * m)) { out.fill(0); for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i * k + p]; if (a) for (let j = 0; j < m; j++) out[p * m + j] += a * B[i * m + j]; } return out; } // Aᵀ·B, A n×k, B n×m
function mmTB(A, B, n, k, m, out = new Float32Array(n * m)) { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let p = 0; p < k; p++) s += A[i * k + p] * B[j * k + p]; out[i * m + j] = s; } return out; } // A·Bᵀ, A n×k, B m×k

export class TinyGPT {
  constructor(chars, { d = 48, T = 32, seed = 1 } = {}) {
    this.chars = chars; this.V = chars.length; this.d = d; this.T = T; this.rng = mulberry(seed);
    const V = this.V, w = (n, s) => Float32Array.from({ length: n }, () => randn(this.rng) * s);
    // the parameters, named as in the chapter
    this.p = { E: w(V * d, 0.1), P: w(T * d, 0.1), Wq: w(d * d, 1 / Math.sqrt(d)), Wk: w(d * d, 1 / Math.sqrt(d)), Wv: w(d * d, 1 / Math.sqrt(d)), Wo: w(d * d, 0.5 / Math.sqrt(d)),
      W1: w(d * 4 * d, 1 / Math.sqrt(d)), b1: new Float32Array(4 * d), W2: w(4 * d * d, 0.5 / Math.sqrt(4 * d)), b2: new Float32Array(d), U: w(d * V, 1 / Math.sqrt(d)), bu: new Float32Array(V) };
    this.m = {}; this.v = {}; for (const k in this.p) { this.m[k] = new Float32Array(this.p[k].length); this.v[k] = new Float32Array(this.p[k].length); }
    this.step = 0;
  }
  get size() { return Object.values(this.p).reduce((a, x) => a + x.length, 0); }
  encode(s) { return [...s].map((c) => Math.max(0, this.chars.indexOf(c))); }

  /** Forward over B sequences of length t (tokens: B·t ids). Keeps what backward needs. Returns logits (B·t × V). */
  forward(tokens, B, t) {
    const { d, V, p } = this, N = B * t, X = new Float32Array(N * d);
    for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) X[i * d + j] = p.E[tokens[i] * d + j] + p.P[(i % t) * d + j];
    const Q = mm(X, p.Wq, N, d, d), K = mm(X, p.Wk, N, d, d), Vv = mm(X, p.Wv, N, d, d), H = new Float32Array(N * d), As = [], sc = 1 / Math.sqrt(d);
    for (let b = 0; b < B; b++) {
      const o = b * t * d, A = new Float32Array(t * t);
      for (let i = 0; i < t; i++) {
        let mx = -Infinity;
        for (let j = 0; j <= i; j++) { let s = 0; for (let k = 0; k < d; k++) s += Q[o + i * d + k] * K[o + j * d + k]; A[i * t + j] = s * sc; if (A[i * t + j] > mx) mx = A[i * t + j]; }
        let z = 0; for (let j = 0; j <= i; j++) { A[i * t + j] = Math.exp(A[i * t + j] - mx); z += A[i * t + j]; }
        for (let j = 0; j <= i; j++) { A[i * t + j] /= z; for (let k = 0; k < d; k++) H[o + i * d + k] += A[i * t + j] * Vv[o + j * d + k]; }
      }
      As.push(A);
    }
    const O = mm(H, p.Wo, N, d, d), X2 = new Float32Array(N * d); for (let i = 0; i < N * d; i++) X2[i] = X[i] + O[i];
    const M1 = mm(X2, p.W1, N, d, 4 * d); for (let i = 0; i < N; i++) for (let j = 0; j < 4 * d; j++) M1[i * 4 * d + j] += p.b1[j];
    const R = M1.map((x) => (x > 0 ? x : 0)), M2 = mm(R, p.W2, N, 4 * d, d), X3 = new Float32Array(N * d);
    for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) X3[i * d + j] = X2[i * d + j] + M2[i * d + j] + p.b2[j];
    const L = mm(X3, p.U, N, d, V); for (let i = 0; i < N; i++) for (let j = 0; j < V; j++) L[i * V + j] += p.bu[j];
    this.cache = { tokens, B, t, X, Q, K, Vv, H, As, X2, M1, R, X3 };
    return L;
  }

  /** Cross-entropy of predicting targets from logits, and its gradient, backpropagated through the block by hand. */
  backward(L, targets) {
    const { d, V, p } = this, { tokens, B, t, X, Q, K, Vv, H, As, X2, M1, R, X3 } = this.cache, N = B * t, g = {};
    let loss = 0; const dL = new Float32Array(N * V);
    for (let i = 0; i < N; i++) {
      let mx = -Infinity; for (let j = 0; j < V; j++) mx = Math.max(mx, L[i * V + j]);
      let z = 0; for (let j = 0; j < V; j++) z += Math.exp(L[i * V + j] - mx);
      for (let j = 0; j < V; j++) dL[i * V + j] = Math.exp(L[i * V + j] - mx) / z / N;
      loss -= Math.log(Math.exp(L[i * V + targets[i]] - mx) / z); dL[i * V + targets[i]] -= 1 / N;
    }
    g.U = mmTA(X3, dL, N, d, V); g.bu = new Float32Array(V); for (let i = 0; i < N; i++) for (let j = 0; j < V; j++) g.bu[j] += dL[i * V + j];
    const dX3 = mmTB(dL, p.U, N, V, d);                                     // through the output layer
    g.W2 = mmTA(R, dX3, N, 4 * d, d); g.b2 = new Float32Array(d); for (let i = 0; i < N; i++) for (let j = 0; j < d; j++) g.b2[j] += dX3[i * d + j];
    const dR = mmTB(dX3, p.W2, N, d, 4 * d); for (let i = 0; i < dR.length; i++) if (M1[i] <= 0) dR[i] = 0; // ReLU
    g.W1 = mmTA(X2, dR, N, d, 4 * d); g.b1 = new Float32Array(4 * d); for (let i = 0; i < N; i++) for (let j = 0; j < 4 * d; j++) g.b1[j] += dR[i * 4 * d + j];
    const dX2 = mmTB(dR, p.W1, N, 4 * d, d); for (let i = 0; i < dX2.length; i++) dX2[i] += dX3[i]; // the MLP's residual
    g.Wo = mmTA(H, dX2, N, d, d); const dH = mmTB(dX2, p.Wo, N, d, d);
    const dQ = new Float32Array(N * d), dK = new Float32Array(N * d), dVv = new Float32Array(N * d), sc = 1 / Math.sqrt(d);
    for (let b = 0; b < B; b++) {                                          // attention, one sequence at a time
      const o = b * t * d, A = As[b];
      for (let i = 0; i < t; i++) {
        const dA = new Float32Array(i + 1); let dot = 0;
        for (let j = 0; j <= i; j++) { let s = 0; for (let k = 0; k < d; k++) { s += dH[o + i * d + k] * Vv[o + j * d + k]; dVv[o + j * d + k] += A[i * t + j] * dH[o + i * d + k]; } dA[j] = s; dot += s * A[i * t + j]; }
        for (let j = 0; j <= i; j++) { const dS = A[i * t + j] * (dA[j] - dot) * sc; for (let k = 0; k < d; k++) { dQ[o + i * d + k] += dS * K[o + j * d + k]; dK[o + j * d + k] += dS * Q[o + i * d + k]; } }
      }
    }
    g.Wq = mmTA(X, dQ, N, d, d); g.Wk = mmTA(X, dK, N, d, d); g.Wv = mmTA(X, dVv, N, d, d);
    const dX = mmTB(dQ, p.Wq, N, d, d), dXk = mmTB(dK, p.Wk, N, d, d), dXv = mmTB(dVv, p.Wv, N, d, d);
    g.E = new Float32Array(p.E.length); g.P = new Float32Array(p.P.length);
    for (let i = 0; i < N; i++) for (let k = 0; k < d; k++) { const v = dX[i * d + k] + dXk[i * d + k] + dXv[i * d + k] + dX2[i * d + k]; g.E[tokens[i] * d + k] += v; g.P[(i % t) * d + k] += v; }
    return { loss: loss / N, grads: g };
  }

  /** One Adam step on a batch of B random windows of the text. Returns the batch's loss. */
  train(ids, { B = 8, lr = 3e-3 } = {}) {
    const t = this.T, tokens = new Int32Array(B * t), targets = new Int32Array(B * t);
    for (let b = 0; b < B; b++) { const s = Math.floor(this.rng() * (ids.length - t - 1)); for (let i = 0; i < t; i++) { tokens[b * t + i] = ids[s + i]; targets[b * t + i] = ids[s + i + 1]; } }
    const { loss, grads } = this.backward(this.forward(tokens, B, t), targets);
    this.step++;
    const b1 = 0.9, b2 = 0.99, c1 = 1 - b1 ** this.step, c2 = 1 - b2 ** this.step;
    for (const k in this.p) { const P = this.p[k], G = grads[k], M = this.m[k], S = this.v[k];
      for (let i = 0; i < P.length; i++) { const gi = Math.max(-1, Math.min(1, G[i])); M[i] = b1 * M[i] + (1 - b1) * gi; S[i] = b2 * S[i] + (1 - b2) * gi * gi; P[i] -= (lr * (M[i] / c1)) / (Math.sqrt(S[i] / c2) + 1e-8); } }
    return loss;
  }

  /** The next character's probabilities after `context` (a string), at a temperature, and the attention of the last position. */
  next(context, temperature = 1) {
    const ids = this.encode(context).slice(-this.T), L = this.forward(ids, 1, ids.length), V = this.V, last = ids.length - 1;
    const logits = Array.from({ length: V }, (_, j) => L[last * V + j] / temperature), mx = Math.max(...logits), e = logits.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b, 0);
    const A = this.cache.As[0], t = ids.length;
    return { probs: e.map((x) => x / z), attention: Array.from({ length: t }, (_, j) => A[last * t + j]) };
  }
  /** A new name: characters sampled one at a time until the end-of-name mark. */
  sample(temperature = 0.8, start = "\n", max = 40) {
    let s = start;
    for (let k = 0; k < max; k++) {
      const { probs } = this.next(s, temperature); let r = this.rng(), j = 0;
      while (j < probs.length - 1 && (r -= probs[j]) > 0) j++;
      if (this.chars[j] === "\n") break;
      s += this.chars[j];
    }
    return s.slice(start.length);
  }
}
