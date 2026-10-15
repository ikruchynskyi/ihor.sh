// The AI path's game strip: XP, the daily streak (and freezes in hand), study days this week against the goal, and
// what you did today. strip(el) fills an element and keeps it current as "ai:xp" events arrive; every gain also
// flashes a small "+5 XP" and Blip cheers at milestones. State and rules: /ai/learn.js, /ai/game.js.
import { progress, setWeekGoal } from "/ai/learn.js";

const css = `
.ai-hud { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; font-size: .9rem; }
.ai-hud b { font-variant-numeric: tabular-nums; }
.ai-hud .dim { color: var(--muted); }
.ai-hud select { font: inherit; padding: 0 2px; }
.ai-xp-pop { position: fixed; right: 16px; bottom: 96px; z-index: 50; padding: 4px 10px; border-radius: 999px; background: var(--accent, #c2410c);
  color: #fff; font: 700 .9rem ui-sans-serif, system-ui, sans-serif; pointer-events: none; animation: ai-xp-pop 1.4s ease-out forwards; }
@keyframes ai-xp-pop { 0% { opacity: 0; transform: translateY(8px); } 15% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-16px); } }
@media (prefers-reduced-motion: reduce) { .ai-xp-pop { animation-duration: 2s; animation-name: ai-xp-fade; } @keyframes ai-xp-fade { 0%, 80% { opacity: 1; } 100% { opacity: 0; } } }
`;
if (!document.getElementById("ai-hud-css")) document.head.insertAdjacentHTML("beforeend", `<style id="ai-hud-css">${css}</style>`);

// how today's acts read: [one, many]
const ACTS = { checkpoint: ["a lesson finished", "lessons finished"], question: ["a question", "questions"], review: ["a card reviewed", "cards reviewed"], notebook: ["a notebook", "notebooks"],
  daily: ["the daily quiz", "daily quizzes"], drill: ["a gap drill", "gap drills"], exam: ["a stage exam", "stage exams"], game: ["a game round", "game rounds"], practice: ["a practice problem", "practice problems"] };
const html = () => {
  const p = progress(), today = Object.entries(p.today).map(([a, n]) => (n > 1 ? `${n} ${ACTS[a]?.[1] ?? a}` : ACTS[a]?.[0] ?? a)).join(", ");
  return `<span title="experience: earned by answering, finishing lessons and notebooks, and reviewing">⚡ <b>${p.xp.toLocaleString()}</b> XP</span>`
    + `<span title="days in a row with any study${p.best ? `; your best: ${p.best}` : ""}">🔥 <b>${p.streak}</b> day${p.streak === 1 ? "" : "s"}${p.freezes ? ` <span class="dim">❄ ${p.freezes}</span>` : ""}</span>`
    + `<span>this week <b>${p.week}</b> of <select aria-label="study days per week goal">${[2, 3, 4, 5, 6, 7].map((d) => `<option${d === p.weekGoal ? " selected" : ""}>${d}</option>`).join("")}</select> days${p.week >= p.weekGoal ? " ✓" : ""}</span>`
    + `<span class="dim">today: ${today || "nothing yet"}</span>`;
};

/** Fill el with the strip and keep it current. */
export function strip(el) {
  el.classList.add("ai-hud");
  const render = () => { el.innerHTML = html(); el.querySelector("select").onchange = (e) => { setWeekGoal(+e.target.value); render(); }; };
  render();
  addEventListener("ai:xp", render);
  return el;
}

// a "+N XP" flash for every gain, and Blip at milestones
let lastStreak = progress().streak;
addEventListener("ai:xp", ({ detail: { xp, streak } }) => {
  if (!xp) return;
  const pop = document.createElement("div");
  pop.className = "ai-xp-pop"; pop.textContent = `+${xp} XP`; pop.setAttribute("aria-hidden", "true");
  document.body.append(pop); setTimeout(() => pop.remove(), 2100);
  if (streak > lastStreak && [3, 7, 14, 30, 50, 100].includes(streak))
    dispatchEvent(new CustomEvent("blip:say", { detail: { text: `${streak} days in a row! ${streak % 7 === 0 ? "You earned a streak freeze ❄ (it covers one missed day)." : "Keep it going."}`, mood: "happy" } }));
  lastStreak = streak;
});
