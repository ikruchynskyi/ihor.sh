// The AI path's learning record, kept in this browser (localStorage, nothing leaves it): finished lessons, concept
// cards on a spaced-repetition schedule, and knowledge gaps (sections where a question was missed). Lesson content
// (goals, prerequisites, cards, checkpoint questions) lives in /ai/course.json. Used by path.js, the index and review.
const KEY = "ai:learn", DAY = 864e5;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
export const state = { done: {}, cards: {}, gaps: {}, ...read() };
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
}

// ---------- spaced repetition (SM-2 style, as in Yomu: 0 again · 1 hard · 2 good · 3 easy) ----------
/** The card after grading it g (0 again · 1 hard · 2 good · 3 easy): a new interval in days, ease and due time. */
export function next(c, g, now = Date.now()) {
  if (g === 0) return { ...c, reps: 0, interval: 0, ease: Math.max(1.3, c.ease - 0.2), due: now + 10 * 60_000 };
  const reps = c.reps + 1, interval = reps === 1 ? [1, 3, 5][g - 1] : Math.max(c.interval + 1, Math.round(c.interval * c.ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1)));
  return { ...c, reps, interval, ease: Math.max(1.3, c.ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0)), due: now + interval * DAY };
}
export function grade(id, g) {
  if (state.cards[id]) { state.cards[id] = next(state.cards[id], g); save(); }
}
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
