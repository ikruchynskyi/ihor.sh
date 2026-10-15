// The model zoo's shared pieces: five toy 2-D datasets, a small version of every model in the zoo (each one returns
// p(x, y), the chance of class 1), and a map that shades the plane by that chance. Each zoo page shows its own
// model with its own knobs; the "which model when" page shows them all on one dataset.

// ---------- data: points in −1…1 × −1…1, class 0 (blue) or 1 (red), a share of labels flipped as noise ----------
export function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 || 1e-12; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());

export const DATASETS = {
  moons: { label: "two moons", make: (r) => { const c = r() < 0.5 ? 1 : 0, a = Math.PI * r(); return c ? { x: 0.55 * Math.cos(a) - 0.25 + 0.1 * gauss(r), y: -0.55 * Math.sin(a) + 0.2 + 0.1 * gauss(r), c } : { x: 0.55 * Math.cos(a) + 0.25 + 0.1 * gauss(r), y: 0.55 * Math.sin(a) - 0.2 + 0.1 * gauss(r), c }; } },
  circles: { label: "ring around a disc", make: (r) => { const c = r() < 0.5 ? 1 : 0, a = 2 * Math.PI * r(), d = c ? 0.35 * Math.sqrt(r()) : 0.6 + 0.3 * r(); return { x: d * Math.cos(a), y: d * Math.sin(a), c }; } },
  diagonal: { label: "a diagonal edge", make: (r) => { const x = 2 * r() - 1, y = 2 * r() - 1; return { x, y, c: y > x ? 1 : 0 }; } },
  xor: { label: "checkerboard (XOR)", make: (r) => { const x = 2 * r() - 1, y = 2 * r() - 1; return { x, y, c: x * y > 0 ? 1 : 0 }; } },
  blobs: { label: "two overlapping blobs", make: (r) => { const c = r() < 0.5 ? 1 : 0; return { x: (c ? 0.3 : -0.3) + 0.35 * gauss(r), y: (c ? 0.25 : -0.25) + 0.35 * gauss(r), c }; } },
};

/** {train, val}: n training points and 600 validation points; `noise` is the share of labels flipped. */
export function data(name, { n = 200, noise = 0.05, seed = 7, stretch = 1 } = {}) {
  const r = rng(seed), make = () => { const p = DATASETS[name].make(r); p.x = Math.max(-1, Math.min(1, p.x)); p.y = Math.max(-1, Math.min(1, p.y)); if (r() < noise) p.c = 1 - p.c; p.x *= stretch; return p; };
  return { train: Array.from({ length: n }, make), val: Array.from({ length: 600 }, make) };
}
export const accuracy = (p, set) => set.filter((d) => (p(d.x, d.y) > 0.5 ? 1 : 0) === d.c).length / set.length;

// ---------- the map: the plane shaded by p(x, y), the training points on top ----------
export const C = { blue: "#58c4dd", red: "#fc6255", text: "#d7dde5", muted: "#8f98a8", stage: "#14171d" };
/** Draws model p on the canvas (span: the plane's half width), then overlay(g, toPx) if given. */
export function map(canvas, p, points, { overlay, span = 1, cell = 4 } = {}) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, toPx = (x, y) => [((x / span + 1) / 2) * W, ((1 - y / span) / 2) * H];
  for (let py = 0; py < H; py += cell) for (let px = 0; px < W; px += cell) {
    const q = p(((px + cell / 2) / W * 2 - 1) * span, (1 - (py + cell / 2) / H * 2) * span), s = Math.abs(q - 0.5) * 2;
    g.fillStyle = q > 0.5 ? `rgb(${30 + 80 * s},${32 + 8 * s},${44 - 4 * s})` : `rgb(${30 - 6 * s},${32 + 18 * s},${44 + 40 * s})`;
    g.fillRect(px, py, cell, cell);
  }
  for (const d of points) { const [x, y] = toPx(d.x, d.y); g.fillStyle = d.c ? C.red : C.blue; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  overlay?.(g, toPx);
}
/** Fit, time and draw: returns "train 98.0% · validation 95.2% · fit 12 ms". */
export function show(canvas, fit, set, opts) {
  const t = performance.now(), p = fit(set.train), ms = performance.now() - t;
  map(canvas, p, set.train, opts);
  return { p, ms, text: `train ${(100 * accuracy(p, set.train)).toFixed(1)}% · validation ${(100 * accuracy(p, set.val)).toFixed(1)}% · fit ${ms < 1 ? "<1" : Math.round(ms)} ms` };
}

// ---------- the models (small and readable; the pages' Python boxes are the real versions) ----------
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Logistic regression by gradient descent; poly adds x², y², xy columns; lambda is an L2 penalty. */
export function logistic(train, { poly = false, lambda = 0, steps = 1500 } = {}) {
  const f = (x, y) => (poly ? [1, x, y, x * x, y * y, x * y] : [1, x, y]), X = train.map((d) => f(d.x, d.y)), w = X[0].map(() => 0);
  for (let it = 0; it < steps; it++) {
    const g = w.map((_, j) => (j ? lambda * w[j] : 0));
    X.forEach((row, i) => { const e = sigmoid(row.reduce((s, v, j) => s + v * w[j], 0)) - train[i].c; row.forEach((v, j) => (g[j] += (e * v) / X.length)); });
    w.forEach((_, j) => (w[j] -= 2 * g[j]));
  }
  const p = (x, y) => sigmoid(f(x, y).reduce((s, v, j) => s + v * w[j], 0));
  p.w = w; return p;
}

/** k nearest neighbors: the share of red among the k closest training points. wx stretches x in the distance (a
 *  column measured in smaller units counts that many times more); p.near(x, y) lists the k neighbors. */
export function knn(train, { k = 5, wx = 1 } = {}) {
  const near = (x, y) => train.map((t) => [(wx * (t.x - x)) ** 2 + (t.y - y) ** 2, t]).sort((a, b) => a[0] - b[0]).slice(0, k).map((d) => d[1]);
  const p = (x, y) => near(x, y).reduce((s, t) => s + t.c, 0) / k;
  p.near = near; return p;
}

/** Gaussian naive Bayes: per class, a bell curve for x and one for y, multiplied as if independent. */
export function naiveBayes(train) {
  const stats = [0, 1].map((c) => { const s = train.filter((d) => d.c === c), m = (k) => s.reduce((a, d) => a + d[k], 0) / s.length, v = (k, mu) => s.reduce((a, d) => a + (d[k] - mu) ** 2, 0) / s.length + 1e-4, mx = m("x"), my = m("y"); return { prior: s.length / train.length, mx, my, vx: v("x", mx), vy: v("y", my) }; });
  const logLik = (s, x, y) => Math.log(s.prior) - ((x - s.mx) ** 2) / (2 * s.vx) - Math.log(s.vx) / 2 - ((y - s.my) ** 2) / (2 * s.vy) - Math.log(s.vy) / 2;
  const p = (x, y) => sigmoid(logLik(stats[1], x, y) - logLik(stats[0], x, y));
  p.stats = stats; return p;
}

/** A classification tree (Gini), grown to `depth`; leaves smaller than minLeaf aren't split; features: which
 *  columns a split may try (a random pair of choices per split when `mtry` is 1, for forests). */
export function tree(train, { depth = 4, minLeaf = 1, mtry = 2, r = Math.random } = {}) {
  const grow = (pts, d) => {
    const ones = pts.reduce((s, q) => s + q.c, 0), leaf = { leaf: (ones + 0.5) / (pts.length + 1), n: pts.length };
    if (d === 0 || pts.length < 2 * minLeaf || ones === 0 || ones === pts.length) return leaf;
    const keys = mtry === 2 ? ["x", "y"] : [r() < 0.5 ? "x" : "y"];
    let best = null;
    for (const k of keys) {
      const s = [...pts].sort((a, b) => a[k] - b[k]); let a = 0;
      for (let i = 0; i < s.length - 1; i++) {
        a += s[i].c; const nL = i + 1, nR = s.length - nL;
        if (s[i][k] === s[i + 1][k] || nL < minLeaf || nR < minLeaf) continue;
        const gini = (o, n) => 1 - (o / n) ** 2 - (1 - o / n) ** 2, score = nL * gini(a, nL) + nR * gini(ones - a, nR);
        if (!best || score < best.score) best = { score, k, cut: (s[i][k] + s[i + 1][k]) / 2 };
      }
    }
    if (!best) return leaf;
    return { k: best.k, cut: best.cut, l: grow(pts.filter((q) => q[best.k] < best.cut), d - 1), r: grow(pts.filter((q) => q[best.k] >= best.cut), d - 1) };
  };
  const root = grow(train, depth), walk = (t, x, y) => (t.leaf !== undefined ? t.leaf : (t.k === "x" ? x : y) < t.cut ? walk(t.l, x, y) : walk(t.r, x, y));
  const p = (x, y) => walk(root, x, y);
  p.root = root; p.leaves = (t = root) => (t.leaf !== undefined ? 1 : p.leaves(t.l) + p.leaves(t.r)); return p;
}

/** A random forest: many deep trees, each on a bootstrap sample (rows drawn with replacement), averaged. */
export function forest(train, { trees = 50, depth = 12, minLeaf = 1, mtry = 1, seed = 3 } = {}) {
  const r = rng(seed), ts = Array.from({ length: trees }, () => tree(Array.from(train, () => train[Math.floor(r() * train.length)]), { depth, minLeaf, mtry, r }));
  const p = (x, y) => ts.reduce((s, t) => s + t(x, y), 0) / ts.length;
  p.trees = ts; return p;
}

/** Gradient boosting for log-loss: each small regression tree fits the gradient (label − current chance). */
export function boost(train, { trees = 100, eta = 0.1, depth = 2 } = {}) {
  const F = train.map(() => 0), hs = [];
  const reg = (pts, r, d) => { // a regression tree on residuals r, by squared error; leaves hold a Newton step
    const idx = pts.map((_, i) => i), node = (ix, d) => {
      const g = ix.reduce((s, i) => s + r[i], 0), h = ix.reduce((s, i) => { const q = sigmoid(F[i]); return s + q * (1 - q); }, 0), leaf = { leaf: g / (h + 1) };
      if (d === 0 || ix.length < 4) return leaf;
      let best = null;
      for (const k of ["x", "y"]) {
        const s = [...ix].sort((a, b) => pts[a][k] - pts[b][k]); let sl = 0;
        for (let j = 0; j < s.length - 1; j++) { sl += r[s[j]]; if (pts[s[j]][k] === pts[s[j + 1]][k]) continue; const nl = j + 1, gain = sl ** 2 / nl + (g - sl) ** 2 / (s.length - nl); if (!best || gain > best.gain) best = { gain, k, cut: (pts[s[j]][k] + pts[s[j + 1]][k]) / 2 }; }
      }
      if (!best) return leaf;
      return { k: best.k, cut: best.cut, l: node(ix.filter((i) => pts[i][best.k] < best.cut), d - 1), r: node(ix.filter((i) => pts[i][best.k] >= best.cut), d - 1) };
    };
    const root = node(idx, d), walk = (t, x, y) => (t.leaf !== undefined ? t.leaf : (t.k === "x" ? x : y) < t.cut ? walk(t.l, x, y) : walk(t.r, x, y));
    return (x, y) => walk(root, x, y);
  };
  for (let m = 0; m < trees; m++) {
    const h = reg(train, train.map((d, i) => d.c - sigmoid(F[i])), depth); hs.push(h);
    train.forEach((d, i) => (F[i] += eta * h(d.x, d.y)));
  }
  const p = (x, y) => sigmoid(hs.reduce((s, h) => s + eta * h(x, y), 0));
  p.trees = hs; return p;
}

/** A support vector machine (simplified SMO): a linear or RBF kernel, soft margin C. p is a squashed margin
 *  (SVMs give a score, not a probability). p.sv: the support vectors (points with a nonzero weight). */
export function svm(train, { kernel = "rbf", C: Cc = 1, gamma = 2, passes = 8, seed = 5 } = {}) {
  const n = train.length, y = train.map((d) => (d.c ? 1 : -1)), r = rng(seed);
  const K = kernel === "rbf" ? (a, b) => Math.exp(-gamma * ((a.x - b.x) ** 2 + (a.y - b.y) ** 2)) : (a, b) => a.x * b.x + a.y * b.y;
  const G = train.map((a) => train.map((b) => K(a, b))), al = new Float64Array(n); let b = 0, quiet = 0, rounds = 0;
  const f = (i) => { let s = b; for (let j = 0; j < n; j++) if (al[j]) s += al[j] * y[j] * G[j][i]; return s; };
  while (quiet < passes && rounds++ < 200) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const Ei = f(i) - y[i];
      if (!((y[i] * Ei < -1e-3 && al[i] < Cc) || (y[i] * Ei > 1e-3 && al[i] > 0))) continue;
      let j = Math.floor(r() * (n - 1)); if (j >= i) j++;
      const Ej = f(j) - y[j], ai = al[i], aj = al[j];
      const L = y[i] !== y[j] ? Math.max(0, aj - ai) : Math.max(0, ai + aj - Cc), H = y[i] !== y[j] ? Math.min(Cc, Cc + aj - ai) : Math.min(Cc, ai + aj);
      const eta = 2 * G[i][j] - G[i][i] - G[j][j];
      if (L === H || eta >= 0) continue;
      al[j] = Math.min(H, Math.max(L, aj - (y[j] * (Ei - Ej)) / eta));
      if (Math.abs(al[j] - aj) < 1e-5) continue;
      al[i] = ai + y[i] * y[j] * (aj - al[j]);
      const b1 = b - Ei - y[i] * (al[i] - ai) * G[i][i] - y[j] * (al[j] - aj) * G[i][j], b2 = b - Ej - y[i] * (al[i] - ai) * G[i][j] - y[j] * (al[j] - aj) * G[j][j];
      b = al[i] > 0 && al[i] < Cc ? b1 : al[j] > 0 && al[j] < Cc ? b2 : (b1 + b2) / 2; changed++;
    }
    quiet = changed ? 0 : quiet + 1;
  }
  const sv = train.map((d, i) => ({ ...d, a: al[i], i })).filter((d) => d.a > 1e-6);
  const score = (x, yy) => sv.reduce((s, d) => s + d.a * y[d.i] * K(d, { x, y: yy }), b);
  const p = (x, yy) => sigmoid(3 * score(x, yy));
  p.sv = sv; p.score = score; return p;
}

/** A multilayer perceptron, 2 → hidden (tanh) → 1 (sigmoid), trained full-batch with Adam. */
export function mlp(train, { hidden = 8, steps = 1500, lr = 0.03, lambda = 0, seed = 11 } = {}) {
  const r = rng(seed), init = (fan) => gauss(r) / Math.sqrt(fan);
  const P = { W1: Array.from({ length: hidden }, () => [init(2), init(2)]), b1: Array(hidden).fill(0), W2: Array.from({ length: hidden }, () => init(hidden)), b2: 0 };
  const flat = () => [...P.W1.flat(), ...P.b1, ...P.W2, P.b2], m = flat().map(() => 0), v = m.map(() => 0);
  const set = (th) => { let k = 0; P.W1.forEach((w) => { w[0] = th[k++]; w[1] = th[k++]; }); P.b1.forEach((_, i) => (P.b1[i] = th[k++])); P.W2.forEach((_, i) => (P.W2[i] = th[k++])); P.b2 = th[k]; };
  for (let t = 1; t <= steps; t++) {
    const gW1 = P.W1.map(() => [0, 0]), gb1 = P.b1.map(() => 0), gW2 = P.W2.map((w) => lambda * w), n = train.length; let gb2 = 0;
    for (const d of train) {
      const h = P.W1.map((w, j) => Math.tanh(w[0] * d.x + w[1] * d.y + P.b1[j])), e = sigmoid(h.reduce((s, hj, j) => s + hj * P.W2[j], P.b2)) - d.c;
      gb2 += e / n; h.forEach((hj, j) => { gW2[j] += (e * hj) / n; const back = (e * P.W2[j] * (1 - hj * hj)) / n; gW1[j][0] += back * d.x; gW1[j][1] += back * d.y; gb1[j] += back; });
    }
    const g = [...gW1.flat(), ...gb1, ...gW2, gb2], th = flat();
    g.forEach((gi, k) => { m[k] = 0.9 * m[k] + 0.1 * gi; v[k] = 0.999 * v[k] + 0.001 * gi * gi; th[k] -= (lr * m[k] / (1 - 0.9 ** t)) / (Math.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8); });
    set(th);
  }
  const p = (x, y) => sigmoid(P.W1.reduce((s, w, j) => s + Math.tanh(w[0] * x + w[1] * y + P.b1[j]) * P.W2[j], P.b2));
  p.units = P.W1.map((w, j) => ({ wx: w[0], wy: w[1], b: P.b1[j], out: P.W2[j] })); // each hidden unit's line w·x + b = 0 and its weight
  return p;
}
