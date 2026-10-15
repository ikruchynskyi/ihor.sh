// CCSDS Reed-Solomon (255,223): 32 check bytes per 223 data bytes fix up to 16 wrong bytes anywhere in the block.
// The CCSDS flavor (as in Phil Karn's libfec, which every Meteor/CCSDS decoder descends from): field polynomial
// x⁸+x⁷+x²+x+1, roots α^(11·(112+i)), and bytes on the wire in the "dual basis" (a change of coordinates, Tal below)
// or, as Meteor-M2 3 and 4 send them, in the plain ("conventional") basis: `dual` picks which.
// Berlekamp–Massey finds the error locator, Chien search its roots, Forney the error values.
const NN = 255, NROOTS = 32, FCR = 112, PRIM = 11, A0 = NN;
const alpha = new Uint8Array(256), index = new Uint8Array(256);
{ let sr = 1; for (let i = 0; i < NN; i++) { index[sr] = i; alpha[i] = sr; sr <<= 1; if (sr & 256) sr ^= 0x187; sr &= 255; } index[0] = A0; alpha[A0] = 0; }
const mod = (x: number) => x % NN;
let iprim = 1; while (iprim % PRIM) iprim += NN; iprim /= PRIM;
const gen = (() => { // the generator polynomial, in index form
  const g = new Uint8Array(NROOTS + 1); g[0] = 1;
  for (let i = 0, root = FCR * PRIM; i < NROOTS; i++, root += PRIM) {
    g[i + 1] = 1;
    for (let j = i; j > 0; j--) g[j] = g[j] ? g[j - 1] ^ alpha[mod(index[g[j]] + root)] : g[j - 1];
    g[0] = alpha[mod(index[g[0]] + root)];
  }
  return g.map((v) => index[v]);
})();
// conventional ↔ dual basis
const TAL = [0x8d, 0xef, 0xec, 0x86, 0xfa, 0x99, 0xaf, 0x7b], toDual = new Uint8Array(256), fromDual = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let v = 0; for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) if (i & (1 << k)) v ^= TAL[7 - k] & (1 << j);
  toDual[i] = v; fromDual[v] = i;
}

/** 223 data bytes → 32 check bytes, both in the dual basis (or the conventional one). */
export function rsEncode(data: Uint8Array, dual = true): Uint8Array {
  const d = dual ? data.map((v) => fromDual[v]) : data.slice(), par = new Uint8Array(NROOTS);
  for (let i = 0; i < NN - NROOTS; i++) {
    const fb = index[d[i] ^ par[0]];
    if (fb !== A0) for (let j = 1; j < NROOTS; j++) par[j] ^= alpha[mod(fb + gen[NROOTS - j])];
    par.copyWithin(0, 1);
    par[NROOTS - 1] = fb !== A0 ? alpha[mod(fb + gen[0])] : 0;
  }
  return dual ? par.map((v) => toDual[v]) : par;
}

/** Corrects a 255-byte block in place. Returns how many bytes were wrong, or -1 if there are too many to fix. */
export function rsDecode(block: Uint8Array, dual = true): number {
  const d = dual ? block.map((v) => fromDual[v]) : block.slice(), s = new Uint8Array(NROOTS);
  // syndromes: the block evaluated at each root; all zero means no errors
  s.fill(d[0]);
  for (let j = 1; j < NN; j++) for (let i = 0; i < NROOTS; i++) s[i] = s[i] ? d[j] ^ alpha[mod(index[s[i]] + (FCR + i) * PRIM)] : d[j];
  let any = 0; for (let i = 0; i < NROOTS; i++) { any |= s[i]; s[i] = index[s[i]]; }
  if (!any) return 0;
  // Berlekamp–Massey: the shortest error-locator polynomial lambda
  let lambda = new Uint8Array(NROOTS + 1); lambda[0] = 1;
  const b = new Uint8Array(NROOTS + 1).map((_, i) => index[lambda[i]]), t = new Uint8Array(NROOTS + 1);
  let el = 0;
  for (let r = 1; r <= NROOTS; r++) {
    let discr = 0;
    for (let i = 0; i < r; i++) if (lambda[i] && s[r - i - 1] !== A0) discr ^= alpha[mod(index[lambda[i]] + s[r - i - 1])];
    const dr = index[discr];
    if (dr === A0) { b.copyWithin(1, 0, NROOTS); b[0] = A0; continue; }
    t[0] = lambda[0];
    for (let i = 0; i < NROOTS; i++) t[i + 1] = b[i] !== A0 ? lambda[i + 1] ^ alpha[mod(dr + b[i])] : lambda[i + 1];
    if (2 * el <= r - 1) { el = r - el; for (let i = 0; i <= NROOTS; i++) b[i] = lambda[i] ? mod(index[lambda[i]] - dr + NN) : A0; }
    else { b.copyWithin(1, 0, NROOTS); b[0] = A0; }
    lambda = t.slice();
  }
  let deg = 0; const lam = lambda.map((v, i) => { const x = index[v]; if (x !== A0) deg = i; return x; });
  // Chien search: the roots of lambda are where the errors are
  const reg = lam.slice(), root: number[] = [], loc: number[] = [];
  for (let i = 1, k = iprim - 1; i <= NN; i++, k = mod(k + iprim)) {
    let q = 1;
    for (let j = deg; j > 0; j--) if (reg[j] !== A0) { reg[j] = mod(reg[j] + j); q ^= alpha[reg[j]]; }
    if (q) continue;
    root.push(i); loc.push(k);
    if (root.length === deg) break;
  }
  if (root.length !== deg) return -1;
  // Forney: the error values, from omega = s·lambda mod x^NROOTS
  const omega = new Uint8Array(deg);
  for (let i = 0; i < deg; i++) { let v = 0; for (let j = i; j >= 0; j--) if (s[i - j] !== A0 && lam[j] !== A0) v ^= alpha[mod(s[i - j] + lam[j])]; omega[i] = index[v]; }
  for (let j = root.length - 1; j >= 0; j--) {
    let num1 = 0; for (let i = deg - 1; i >= 0; i--) if (omega[i] !== A0) num1 ^= alpha[mod(omega[i] + i * root[j])];
    const num2 = alpha[mod(root[j] * (FCR - 1) + NN)];
    let den = 0; for (let i = Math.min(deg, NROOTS - 1) & ~1; i >= 0; i -= 2) if (lam[i + 1] !== A0) den ^= alpha[mod(lam[i + 1] + i * root[j])];
    if (num1 && den) d[loc[j]] ^= alpha[mod(index[num1] + index[num2] + NN - index[den])];
  }
  for (let i = 0; i < NN; i++) block[i] = dual ? toDual[d[i]] : d[i];
  return deg;
}

/** A CADU body (1020 bytes) is 4 codewords interleaved byte by byte. Fixes it in place; -1 if any codeword can't be fixed. */
export function rsDecodeInterleaved(f: Uint8Array, depth = 4, dual = true): number {
  let total = 0; const cw = new Uint8Array(NN);
  for (let c = 0; c < depth; c++) {
    for (let j = 0; j < NN; j++) cw[j] = f[j * depth + c];
    const n = rsDecode(cw, dual); if (n < 0) return -1;
    total += n; for (let j = 0; j < NN; j++) f[j * depth + c] = cw[j];
  }
  return total;
}
