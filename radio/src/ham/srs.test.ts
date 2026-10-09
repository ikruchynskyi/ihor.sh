// Checks for the license-prep engine. Run: node src/ham/srs.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answer, exam, groupChances, groupOf, nextNew, passChance, scoreDistribution, session, answerOrder, ruleLinks, type Memory, type Pool } from "./srs.ts";

const load = (id: string): Pool => JSON.parse(readFileSync(new URL(`./pool-${id}.json`, import.meta.url), "utf8"));
const pools = { T: load("T"), G: load("G"), E: load("E") };

// The pools match the official counts (after the published errata deletions) and every question belongs to a listed group.
for (const [id, n, groups, pass] of [["T", 409, 35, 26], ["G", 423, 35, 26], ["E", 599, 50, 37]] as const) {
  const p = pools[id], gs = new Set(p.subs.flatMap((s) => s.groups.map((g) => g.id)));
  assert.equal(p.q.length, n); assert.equal(gs.size, groups); assert.equal(p.exam, groups); assert.equal(p.pass, pass);
  assert.ok(p.q.every((q) => gs.has(groupOf(q.id))), `${id}: question outside the syllabus`);
}

// Score distribution: certain and coin-flip cases.
assert.deepEqual(scoreDistribution([1, 1, 0]), [0, 0, 1, 0]);
const coin = scoreDistribution(new Array(10).fill(0.5));
assert.ok(Math.abs(coin[5] - 252 / 1024) < 1e-12 && Math.abs(coin.reduce((a, b) => a + b) - 1) < 1e-12);

// A blank memory: pure guessing almost never passes; knowing everything almost always does.
const T = pools.T, blank: Memory = {};
const guess = passChance(scoreDistribution([...groupChances(T, blank).values()]), T.pass);
assert.ok(guess < 1e-6, `guessing passes with ${guess}`);
const all: Memory = {}; for (const q of T.q) all[q.id] = { b: 5, due: 0, n: 3, ok: 3 };
assert.ok(passChance(scoreDistribution([...groupChances(T, all).values()]), T.pass) > 0.999);

// Leitner boxes: right first time jumps to box 2; wrong drops to 0 and is due now.
const m: Memory = {}, now = 1e12;
assert.equal(answer(m, "T1A01", true, now).b, 2);
assert.equal(answer(m, "T1A01", true, now).b, 3);
const miss = answer(m, "T1A01", false, now); assert.equal(miss.b, 0); assert.equal(miss.due, now);

// New questions come from the smallest groups first, spread across groups rather than draining one.
const fresh = nextNew(T, {}, () => true, 10), size = (g: string) => T.q.filter((q) => groupOf(q.id) === g).length;
assert.equal(new Set(fresh.map((q) => groupOf(q.id))).size, 10);
assert.ok(size(groupOf(fresh[0].id)) <= Math.min(...T.subs.flatMap((s) => s.groups.map((g) => size(g.id)))));

// A session puts due reviews first; a scoped session stays in scope.
const s = session(T, m, (q) => q.id.startsWith("T5"), 20, 10, now);
assert.ok(s.every((q) => q.id.startsWith("T5")) && s.length === 10);
assert.equal(session(T, m, () => true, 20, 10, now)[0].id, "T1A01");

// A mock exam: one question per group, in order.
const e = exam(pools.E, () => 0.5);
assert.equal(e.length, 50); assert.deepEqual(e.map((q) => groupOf(q.id)), pools.E.subs.flatMap((s) => s.groups.map((g) => g.id)));

// Answers keep their order when the wording points at positions; otherwise they're a permutation.
const allChoices = T.q.find((q) => q.a.some((a) => /All these choices/.test(a)))!;
assert.deepEqual(answerOrder(allChoices, () => 0), [0, 1, 2, 3]);
assert.deepEqual([...answerOrder(T.q[1], Math.random)].sort(), [0, 1, 2, 3]);

assert.deepEqual(ruleLinks("97.13(c)(2), 1.1307(b), 97.13"), [
  { text: "§97.13", url: "https://www.ecfr.gov/current/title-47/section-97.13" },
  { text: "§1.1307", url: "https://www.ecfr.gov/current/title-47/section-1.1307" },
]);
console.log("ham srs: all checks passed");

// Every exam group is taught by at least one planned lesson.
const { LESSONS } = await import("./lessons.ts");
const taught = new Set(LESSONS.flatMap((l) => l.groups));
for (const p of Object.values(pools)) for (const s of p.subs) for (const g of s.groups) assert.ok(taught.has(g.id), `no lesson covers ${g.id}`);
console.log("lessons cover every group");

// The band plan agrees with the pool's own answers.
const { check } = await import("./bands.ts");
assert.ok(!check(14.348, 14.351, "phone", "E").ok, "E1A01: 3 kHz USB at 14.348 spills out of the band");
assert.ok(check(14.1472, 14.15, "data", "E").ok && !check(14.1473, 14.1501, "data", "E").ok, "E1A03: highest 2.8 kHz USB data carrier is 14.1472");
assert.ok(!check(3.598, 3.601, "phone", "E").ok, "E1A04: LSB at 3.601 spills below the phone segment");
assert.ok(check(28.3, 28.5, "phone", "T").ok && !check(28.5, 28.503, "phone", "T").ok, "T1B01/T1B06: Technician phone 28.300–28.500");
assert.ok(!check(7.15, 7.153, "phone", "G").ok, "G1A05: General can't use 7.125–7.175");
assert.ok(check(21.297, 21.3, "phone", "G").ok, "G1A09: 21300 kHz is General");
assert.ok(!check(10.12, 10.123, "phone", "E").ok, "G1A02: no phone on 30 m");
assert.ok(check(28.0, 29.7, "cw", "G").ok, "G1A07: General CW on all of 10 m");
assert.ok(!check(50.05, 50.053, "phone", "T").ok && !check(144.05, 144.053, "phone", "T").ok, "T1B07: 50.0–50.1 and 144.0–144.1 are CW only");
console.log("band plan agrees with the pool");

// Every L-network solution really transforms its load to 50 Ω.
const { lMatch, zIn } = await import("./match.ts");
for (const [R, X] of [[200, 0], [10, 0], [100, 80], [25, -40], [300, -150], [5, 30], [60, -20]]) {
  const sols = lMatch(R, X);
  assert.ok(sols.length >= 1, `no match for ${R}+j${X}`);
  for (const n of sols) { const [r, x] = zIn(R, X, n); assert.ok(Math.abs(r - 50) < 1e-6 && Math.abs(x) < 1e-6, `${R}+j${X} → ${r}+j${x}`); }
}
console.log("L-networks match to 50 Ω");

// Every Handbook companion link points at a real page and anchor.
const { chapters, resolve } = await import("./handbook/map.ts");
const { existsSync } = await import("node:fs");
const chs = chapters();
assert.equal(chs.length, 27);
for (const c of chs) for (const s of c.sections) for (const key of s.links) {
  const { href } = resolve(key), [file, anchor] = href.split("#");
  const path = new URL(`../../ham/handbook/${file.endsWith("/") ? file + "index.html" : file}`, import.meta.url);
  assert.ok(existsSync(path), `${s.num}: ${href} missing`);
  if (anchor) assert.ok(readFileSync(path, "utf8").includes(`id="${anchor}"`), `${s.num}: #${anchor} missing in ${file}`);
}
console.log(`handbook map: ${chs.reduce((a, c) => a + c.sections.length, 0)} sections, all links resolve`);
