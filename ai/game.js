// The AI path's game rules, as pure functions (no storage, no DOM), so they can be tested in Node: how much XP each
// learning act earns, how a daily streak grows, survives a missed day on a freeze, or resets, and what counts as a
// week's study days. ai/learn.js keeps the state and calls these. The plan these rules come from: ai/PLAN.md.

/** XP per learning act. Only acts of learning earn XP (never clicks or time on a page), and each lesson's questions,
 *  checkpoint and notebook pay once. */
export const XP = {
  question: 5,          // an inline question right on the first try (once per question)
  checkpoint: 50,       // a lesson's checkpoint passed for the first time …
  checkpointBonus: 10,  // … plus this per point above 4 (a 5/5 earns 60)
  notebook: 30,         // "I finished the practice notebook" (self-reported, once per lesson)
  review: 2,            // a concept card graded in the review deck
  daily: 30,            // the daily quiz finished (once a day)            — ai/daily.html (plan lane B)
  drill: 10,            // a gap drill passed                              — ai/drill.html (plan lane C)
  exam: 100,            // a stage exam passed (once per stage)            — ai/exam.html (plan lane D)
  game: 5,              // a mini-game round won (capped by the game)      — ai/games/ (plan lane E)
  practice: 3,          // a generated practice problem solved            — ai/practice.html (plan lane K)
};
export const LEECH = 4;          // a review card forgotten this many times is a leech: reread, don't repeat
export const MAX_FREEZES = 2;    // streak freezes you can hold; one is earned every 7 days of streak

/** A local calendar day, "YYYY-MM-DD" (local time: a streak follows the learner's midnight, not UTC's). */
export const dayOf = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 864e5);

/** The streak after studying on `day`: same day, no change; the next day, +1; one missed day with a freeze in hand
 *  spends it and continues; otherwise it starts again at 1. Every 7th day earns a freeze (up to MAX_FREEZES). */
export function nextStreak(s = { last: "", days: 0, best: 0, freezes: 0 }, day) {
  if (s.last === day) return s;
  const gap = s.last ? daysBetween(s.last, day) : Infinity;
  let { days, freezes } = s;
  if (gap === 1) days += 1;
  else if (gap === 2 && freezes > 0) { days += 1; freezes -= 1; }
  else days = 1;
  if (days % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return { last: day, days, best: Math.max(s.best ?? 0, days), freezes };
}

/** The streak as it stands on `day` without studying yet: still alive if the last study day was yesterday, or the day
 *  before with a freeze to spend; otherwise 0. */
export const liveStreak = (s, day) => { if (!s?.last) return 0; const gap = daysBetween(s.last, day); return gap <= 1 || (gap === 2 && s.freezes > 0) ? s.days : 0; };

/** Checkpoint XP for a first pass with `score` of 5. */
export const checkpointXP = (score) => XP.checkpoint + XP.checkpointBonus * Math.max(0, score - 4);

/** Study days (days with any XP) in the Monday-to-Sunday week containing `day`, from a log { "YYYY-MM-DD": {xp} }. */
export function weekDays(log, day) {
  const d = new Date(day + "T12:00:00"), monday = new Date(d - ((d.getDay() + 6) % 7) * 864e5);
  return Array.from({ length: 7 }, (_, i) => dayOf(+monday + i * 864e5)).filter((k) => (log[k]?.xp ?? 0) > 0).length;
}

/** Progress as a code to copy to another browser, and back (plain base64 of the JSON; nothing secret is in it). */
export const exportCode = (state) => btoa(unescape(encodeURIComponent(JSON.stringify(state))));
export const importCode = (code) => JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
