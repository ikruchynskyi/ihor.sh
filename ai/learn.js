// The AI path's learning record, kept in this browser (localStorage, nothing leaves it): finished lessons, concept
// cards on a spaced-repetition schedule, and knowledge gaps (sections where a question was missed). Lesson content
// (goals, prerequisites, cards, checkpoint questions) lives in /ai/course.json. Used by path.js, the index and review.
// Also the game layer: XP, a daily streak, a day-by-day log, badges and personal bests (rules in /ai/game.js).
import { XP, dayOf, nextStreak, liveStreak, checkpointXP, weekDays, LEECH, exportCode, importCode } from "/ai/game.js";
export { XP };
const KEY = "ai:learn", DAY = 864e5;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const EMPTY = { done: {}, cards: {}, gaps: {}, xp: 0, log: {}, streak: { last: "", days: 0, best: 0, freezes: 0 }, once: {}, badges: {}, best: {}, weekGoal: 4 };
export const state = { ...structuredClone(EMPTY), ...read() };
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
export const course = fetch("/ai/course.json").then((r) => r.json()).catch(() => ({}));
/** The path in order, read from ai/index.html (the one place it's defined): [{ href, title, stage }]. */
export const path = fetch("/ai/").then((r) => r.text()).catch(() => "").then((html) => {
  const doc = new DOMParser().parseFromString(html, "text/html"), out = [];
  for (const h of doc.querySelectorAll("h2.stage")) {
    const ol = h.nextElementSibling?.nextElementSibling;
    for (const a of ol?.matches("ol.path") ? ol.querySelectorAll("li:not(.soon) a") : []) out.push({ href: a.getAttribute("href").replace("./", ""), title: a.textContent, stage: h.textContent });
  }
  return out;
});

/** A finished lesson: remember it and put its concept cards into the review deck. */
export function finish(lesson, score, cards = []) {
  state.done[lesson] = { at: Date.now(), score };
  cards.forEach((_, i) => { state.cards[`${lesson}#${i}`] ??= { due: Date.now() + DAY, interval: 0, ease: 2.5, reps: 0 }; });
  save();
  gain(checkpointXP(score), "checkpoint", `checkpoint:${lesson}`);
}

// ---------- spaced repetition (SM-2 style, as in Yomu: 0 again · 1 hard · 2 good · 3 easy) ----------
/** The card after grading it g (0 again · 1 hard · 2 good · 3 easy): a new interval in days, ease and due time. */
export function next(c, g, now = Date.now()) {
  if (g === 0) return { ...c, reps: 0, interval: 0, ease: Math.max(1.3, c.ease - 0.2), due: now + 10 * 60_000 };
  const reps = c.reps + 1, interval = reps === 1 ? [1, 3, 5][g - 1] : Math.max(c.interval + 1, Math.round(c.interval * c.ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1)));
  return { ...c, reps, interval, ease: Math.max(1.3, c.ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0)), due: now + interval * DAY };
}
export function grade(id, g) {
  const c = state.cards[id];
  if (!c) return;
  state.cards[id] = { ...next(c, g), lapses: (c.lapses ?? 0) + (g === 0 ? 1 : 0) };
  save();
  gain(XP.review, "review");
}
/** Cards forgotten LEECH (4) or more times: repeating them isn't working, rereading the lesson section might. */
export const leeches = () => Object.entries(state.cards).filter(([, c]) => (c.lapses ?? 0) >= LEECH).map(([id]) => id);
export const dueCards = (now = Date.now()) => Object.entries(state.cards).filter(([, c]) => c.due <= now).map(([id]) => id);

// ---------- knowledge gaps: a missed question marks its section; two right answers there later clear it ----------
export function answered(lesson, section, label, right) {
  const id = `${lesson}#${section}`, g = state.gaps[id];
  if (!right) state.gaps[id] = { lesson, section, label, misses: (g?.misses ?? 0) + 1, at: Date.now(), streak: 0 };
  else if (g && ++g.streak >= 2) delete state.gaps[id];
  save();
}

/** A heading's anchor: "3. Logarithms: counting…" → "logarithms-counting". */
export const slug = (text) => text.replace(/^\s*\d+\.\s*/, "").toLowerCase().replace(/\\\(|\\\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

// ---------- the game layer: XP, streak, badges, personal bests (rules and amounts in /ai/game.js) ----------
/** Earn xp for a learning act ("question", "checkpoint", "review", "notebook", "daily", "drill", "exam", "game").
 *  With onceKey, it pays only the first time (e.g. "notebook:03-a-neuron.html"). Updates today's log and the streak,
 *  then announces it as an "ai:xp" event ({ xp, total, act, streak }) for the strip (ai/hud.js) and Blip. Returns the
 *  XP actually earned. */
export function gain(xp, act, onceKey) {
  if (onceKey) { if (state.once[onceKey]) return 0; state.once[onceKey] = Date.now(); }
  const day = dayOf(), entry = (state.log[day] ??= { xp: 0, acts: {} });
  state.xp += xp; entry.xp += xp; entry.acts[act] = (entry.acts[act] ?? 0) + 1;
  state.streak = nextStreak(state.streak, day);
  save();
  dispatchEvent(new CustomEvent("ai:xp", { detail: { xp, total: state.xp, act, streak: state.streak.days } }));
  return xp;
}
/** Has this once-only act been done (e.g. "daily:2026-10-15", "exam:stage-1")? */
export const did = (onceKey) => !!state.once[onceKey];
/** What the strip shows: total XP, the streak as of today, freezes, best, study days this week and the goal, and
 *  today's acts ({ question: 3, review: 12, … }). */
export function progress() {
  const day = dayOf();
  return { xp: state.xp, streak: liveStreak(state.streak, day), best: state.streak.best, freezes: state.streak.freezes,
    week: weekDays(state.log, day), weekGoal: state.weekGoal, today: state.log[day]?.acts ?? {} };
}
export function setWeekGoal(days) { state.weekGoal = days; save(); }
/** Award a badge once (id like "stage-1", "zoo", "capstone"); returns true if it's new. */
export function badge(id, label) {
  if (state.badges[id]) return false;
  state.badges[id] = { label, at: Date.now() }; save();
  dispatchEvent(new CustomEvent("ai:badge", { detail: { id, label } }));
  return true;
}
/** Record a mini-game score; returns true if it beats the personal best (higher is better). */
export function best(game, score) {
  if ((state.best[game] ?? -Infinity) >= score) return false;
  state.best[game] = score; save(); return true;
}
/** Progress as a code to paste into another browser, and loading one (replaces this browser's progress). */
export const progressCode = () => exportCode(state);
export function loadProgressCode(code) {
  const next = importCode(code);
  if (typeof next !== "object" || !next.done) throw new Error("not a progress code");
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, structuredClone(EMPTY), next); save();
}
