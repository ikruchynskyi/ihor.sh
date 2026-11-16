// Cron for the server's own background work (it runs inside the web container): five-field expressions, minute hour
// day-of-month month day-of-week, in New York time, checked at the top of every minute. A task still running when its
// next time comes is skipped, not stacked. /api/jobs/schedule shows each task's schedule, last run and last error.

type Task = { name: string; cron: string; note: string; run: () => Promise<unknown>; running?: boolean; last?: number; ms?: number; error?: string };
const tasks: Task[] = [];

/** The values one field allows: "*", "5", "1-5", "*\/15", "0,30", "9-17/2". */
function values(f: string, min: number, max: number) {
  const out = new Set<number>();
  for (const part of f.split(",")) {
    const [range, stepS] = part.split("/"), step = Math.max(1, Number(stepS ?? 1));
    const [a, b] = range === "*" ? [min, max] : range.includes("-") ? range.split("-").map(Number) : [Number(range), stepS ? max : Number(range)];
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}
export type When = { minute: number; hour: number; dom: number; month: number; dow: number };
export const matches = (cron: string, w: When) => {
  const [m, h, dom, mon, dow] = cron.trim().split(/\s+/);
  return values(m, 0, 59).has(w.minute) && values(h, 0, 23).has(w.hour) && values(dom, 1, 31).has(w.dom) && values(mon, 1, 12).has(w.month) && values(dow, 0, 6).has(w.dow);
};
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, minute: "numeric", hour: "numeric", day: "numeric", month: "numeric", weekday: "short" });
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const nyNow = (d = new Date()): When => {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { minute: +p.minute, hour: +p.hour % 24, dom: +p.day, month: +p.month, dow: DOW[p.weekday] };
};

/** Runs one task now (unless it's already running); its result and timing go into the status. */
export function runTask(name: string) {
  const t = tasks.find((x) => x.name === name);
  if (!t || t.running) return false;
  t.running = true; const t0 = Date.now();
  t.run().then(() => (t.error = undefined)).catch((e) => { t.error = (e as Error).message; console.log(`cron ${t.name}: ${t.error}`); })
    .finally(() => { t.running = false; t.last = Math.floor(t0 / 1000); t.ms = Date.now() - t0; });
  return true;
}
export function schedule(name: string, cron: string, note: string, run: () => Promise<unknown>) { tasks.push({ name, cron, note, run }); }
export const cronStatus = () => tasks.map(({ name, cron, note, running, last, ms, error }) => ({ name, cron, note, running: !!running, last: last ?? null, seconds: ms != null ? Math.round(ms / 1000) : null, error: error ?? null }));
let started = false;
export function startCron() {
  if (started) return; started = true;
  const tick = () => { const w = nyNow(); for (const t of tasks) if (matches(t.cron, w)) runTask(t.name); };
  setTimeout(() => { tick(); setInterval(tick, 60_000); }, 60_000 - (Date.now() % 60_000) + 500); // at the top of each minute
}

if (import.meta.url === `file://${process.argv[1]}`) { // node server/cron.ts
  const assert = (await import("node:assert/strict")).default;
  const w = (minute: number, hour: number, dow = 1, dom = 16, month = 11): When => ({ minute, hour, dom, month, dow });
  assert.ok(matches("5 * * * *", w(5, 13)) && !matches("5 * * * *", w(6, 13)));
  assert.ok(matches("20 */4 * * *", w(20, 8)) && !matches("20 */4 * * *", w(20, 9)));
  assert.ok(matches("*/30 * * * *", w(30, 2)) && !matches("*/30 * * * *", w(15, 2)));
  assert.ok(matches("0 6 * * 1", w(0, 6, 1)) && !matches("0 6 * * 1", w(0, 6, 2)));
  assert.ok(matches("0 9-17/2 * * 1-5", w(0, 11, 3)) && !matches("0 9-17/2 * * 1-5", w(0, 12, 3)) && !matches("0 9-17/2 * * 1-5", w(0, 11, 6)));
  const n = nyNow(new Date("2026-11-16T15:07:00Z")); assert.deepEqual([n.hour, n.minute, n.dow], [10, 7, 1]); // 10:07 in New York, a Monday
  console.log("cron ok");
}
