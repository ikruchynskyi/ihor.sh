// Handwriting box: which kanji did the learner draw? Our own recognizer over KanjiVG reference strokes
// (data/strokes.json, built by src/strokes.py). Two scores, so a wrong stroke order or direction doesn't sink it:
//  1. strokes, order-free: each drawn stroke pairs with its closest unused reference stroke, either direction;
//  2. the picture: both are rasterized to a blurred grid and compared, ignoring strokes entirely.
// Pure functions, so node can test them (handwriting.test.mjs).

const PTS = 10, BOX = 109, GRID = 32;

/** Strokes ([[x, y], …] each, any units) → each resampled to PTS points, the whole fitted into BOX keeping its shape. */
export function normalize(strokes) {
  const all = strokes.flat();
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0, 1), k = (BOX * 0.8) / size;
  const ox = (BOX - (x1 - x0) * k) / 2, oy = (BOX - (y1 - y0) * k) / 2;
  return strokes.map((s) => resample(s.map(([x, y]) => [ox + (x - x0) * k, oy + (y - y0) * k])));
}
function resample(pts) {
  if (pts.length < 2) return Array.from({ length: PTS }, () => pts[0]);
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1, out = [];
  let acc = 0, j = 0;
  for (let n = 0; n < PTS; n++) {
    const t = (total * n) / (PTS - 1);
    while (j < seg.length - 1 && acc + seg[j] < t) acc += seg[j++];
    const f = seg[j] ? Math.min(1, (t - acc) / seg[j]) : 0, a = pts[j], b = pts[j + 1] ?? a;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

const strokeDist = (a, b) => {
  let fwd = 0, rev = 0;
  for (let i = 0; i < PTS; i++) {
    fwd += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    rev += Math.hypot(a[i][0] - b[PTS - 1 - i][0], a[i][1] - b[PTS - 1 - i][1]);
  }
  return Math.min(fwd, rev + 15) / PTS; // a backwards stroke costs a little, not a lot
};
/** Order-free stroke cost: pair strokes greedily by distance; every unpaired stroke costs MISS. */
function strokeCost(drawn, ref) {
  const MISS = 30, pairs = [];
  for (let i = 0; i < drawn.length; i++) for (let j = 0; j < ref.length; j++) pairs.push([strokeDist(drawn[i], ref[j]), i, j]);
  pairs.sort((a, b) => a[0] - b[0]);
  const usedD = new Set(), usedR = new Set();
  let cost = 0;
  for (const [d, i, j] of pairs) if (!usedD.has(i) && !usedR.has(j)) { usedD.add(i); usedR.add(j); cost += d; }
  cost += MISS * (Math.max(drawn.length, ref.length) - Math.min(drawn.length, ref.length));
  return cost / Math.max(drawn.length, ref.length);
}

/** Rasterize normalized strokes to a GRID×GRID bitmap, thick lines, then blur: a picture to compare. */
export function picture(strokes) {
  const g = new Float32Array(GRID * GRID), s = GRID / BOX;
  const dot = (x, y) => { const i = Math.round(x * s), j = Math.round(y * s); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const u = i + dx, v = j + dy; if (u >= 0 && v >= 0 && u < GRID && v < GRID) g[v * GRID + u] = 1; } };
  for (const st of strokes) for (let k = 1; k < st.length; k++) {
    const [a, b] = [st[k - 1], st[k]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * s) + 1;
    for (let t = 0; t <= n; t++) dot(a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n);
  }
  const out = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    let v = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const u = x + dx, w = y + dy; if (u >= 0 && w >= 0 && u < GRID && w < GRID) v += g[w * GRID + u] / (1 + dx * dx + dy * dy); }
    out[y * GRID + x] = v;
  }
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return out.map((v) => v / norm);
}
const pictureDist = (a, b) => { let dot = 0; for (let i = 0; i < a.length; i++) dot += a[i] * b[i]; return (1 - dot) * 100; };

/** Turn data/strokes.json ({ kanji: [[x0, y0, x1, y1, …] per stroke] }) into ready references. */
export function references(json) {
  return Object.entries(json).map(([k, strokes]) => {
    const st = normalize(strokes.map((flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]])));
    return { k, n: st.length, strokes: st, pic: picture(st) };
  });
}

/** The likeliest kanji for a drawing (raw strokes), best first: [{ k, score }]. */
export function recognize(raw, refs, top = 10) {
  if (!raw.length) return [];
  const drawn = normalize(raw), pic = picture(drawn);
  return refs
    .filter((r) => Math.abs(r.n - drawn.length) <= Math.max(3, r.n * 0.4))
    .map((r) => ({ k: r.k, score: strokeCost(drawn, r.strokes) + 0.8 * pictureDist(pic, r.pic) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, top);
}
