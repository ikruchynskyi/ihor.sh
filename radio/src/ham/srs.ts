// The license-prep engine: question pools, spaced repetition, mock exams, and an honest pass-probability estimate.
// Pure logic, no DOM, so it runs in Node for the tests (srs.test.ts).

export interface Question { id: string; q: string; a: string[]; c: number; ref: string; fig?: string }
export interface Group { id: string; title: string }
export interface Sub { id: string; title: string; groups: Group[] }
export interface Pool { id: "T" | "G" | "E"; name: string; element: number; valid: [string, string]; exam: number; pass: number; source: string; subs: Sub[]; q: Question[] }

/** What we remember about one question: Leitner box (0 = just missed, 5 = solid), when it's due, how it went. */
export interface Card { b: number; due: number; n: number; ok: number }
export type Memory = Record<string, Card>;

const DAY = 864e5;
/** Days until the next review after a correct answer lands a card in box b. */
export const INTERVAL = [0, 1, 3, 7, 16, 35];
/** Rough chance of answering right: unseen (a guess), then by box. Tuned to be a little pessimistic. */
export const P_UNSEEN = 0.25;
export const P_BOX = [0.4, 0.65, 0.8, 0.88, 0.94, 0.97];

export const groupOf = (id: string) => id.slice(0, 3);
export const subOf = (id: string) => id.slice(0, 2);

export function answer(mem: Memory, id: string, right: boolean, now = Date.now()): Card {
  const c = mem[id] ?? { b: 0, due: now, n: 0, ok: 0 };
  c.n++;
  if (right) { c.ok++; c.b = Math.min(5, c.n === 1 ? 2 : c.b + 1); } // right the first time: you probably knew it already
  else c.b = 0;
  c.due = now + INTERVAL[c.b] * DAY;
  return (mem[id] = c);
}

export const pCorrect = (mem: Memory, id: string) => (mem[id] ? P_BOX[mem[id].b] : P_UNSEEN);

/** The exam draws one random question from every group, so a group's chance is the average of its questions'. */
export function groupChances(pool: Pool, mem: Memory): Map<string, number> {
  const sum = new Map<string, [number, number]>();
  for (const q of pool.q) { const g = groupOf(q.id), s = sum.get(g) ?? [0, 0]; s[0] += pCorrect(mem, q.id); s[1]++; sum.set(g, s); }
  return new Map([...sum].map(([g, [p, n]]) => [g, p / n]));
}

/** Probability of each possible exam score: a sum of one coin flip per group, each with its own odds (Poisson binomial). */
export function scoreDistribution(chances: number[]): number[] {
  let dist = [1];
  for (const p of chances) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((d, k) => { next[k] += d * (1 - p); next[k + 1] += d * p; });
    dist = next;
  }
  return dist;
}
export const passChance = (dist: number[], pass: number) => dist.slice(pass).reduce((a, b) => a + b, 0);

/** Learning one new question in group g raises your expected score by about (P_BOX[2] − P_UNSEEN) / |g|, so small groups pay
 *  off most. New questions come round-robin from the groups, best payoff first (ties: the group you're weakest in). */
export function nextNew(pool: Pool, mem: Memory, scope: (q: Question) => boolean, count: number): Question[] {
  const unseen = new Map<string, Question[]>(), size = new Map<string, number>();
  for (const q of pool.q) {
    const g = groupOf(q.id); size.set(g, (size.get(g) ?? 0) + 1);
    if (!mem[q.id] && scope(q)) unseen.set(g, [...(unseen.get(g) ?? []), q]);
  }
  const chances = groupChances(pool, mem);
  const order = [...unseen.keys()].sort((a, b) => size.get(a)! - size.get(b)! || chances.get(a)! - chances.get(b)!);
  const out: Question[] = [];
  for (let round = 0; out.length < count && order.some((g) => unseen.get(g)!.length > round); round++)
    for (const g of order) { const q = unseen.get(g)![round]; if (q && out.length < count) out.push(q); }
  return out;
}

/** A study session: everything due (oldest first), then new questions, up to `total`. */
export function session(pool: Pool, mem: Memory, scope: (q: Question) => boolean, total = 20, maxNew = 10, now = Date.now()): Question[] {
  const due = pool.q.filter((q) => mem[q.id] && mem[q.id].due <= now && scope(q)).sort((a, b) => mem[a.id].due - mem[b.id].due).slice(0, total);
  return [...due, ...nextNew(pool, mem, scope, Math.min(maxNew, total - due.length))];
}

/** A mock exam built like the real one: one random question from each group, in syllabus order. */
export function exam(pool: Pool, rnd = Math.random): Question[] {
  return pool.subs.flatMap((s) => s.groups.map((g) => { const qs = pool.q.filter((q) => groupOf(q.id) === g.id); return qs[Math.floor(rnd() * qs.length)]; }));
}

/** Shuffle answers unless the wording refers to positions ("All these choices", "Both A and B"). Returns the new order. */
export function answerOrder(q: Question, rnd = Math.random): number[] {
  const order = [0, 1, 2, 3];
  if (q.a.some((a) => /choices|\b(both|neither|none of)\b/i.test(a) || /\b[A-D]\b\s*(,|and|or)/.test(a))) return order;
  for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/** "97.301(d), 1.1307(b)" → links to the rule text on eCFR (the official, current Code of Federal Regulations). */
export function ruleLinks(ref: string): { text: string; url: string }[] {
  return [...ref.matchAll(/\b(97|1)\.(\d+)/g)].map((m) => ({ text: `§${m[1]}.${m[2]}`, url: `https://www.ecfr.gov/current/title-47/section-${m[1]}.${m[2]}` }))
    .filter((l, i, all) => all.findIndex((x) => x.url === l.url) === i);
}
