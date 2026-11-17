// Cron for the server's own background work (it runs inside the web container): five-field expressions, minute hour
// day-of-month month day-of-week, in New York time, checked at the top of every minute. A task still running when its
// next time comes is skipped, not stacked, and a hung task is aborted after maxMs. /api/jobs/schedule shows status.

type Task = { name: string; cron: string; note: string; maxMs: number; run: (signal: AbortSignal) => Promise<unknown>; running?: boolean; startedAt?: number; last?: number; ms?: number; error?: string };
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

/** Runs one task now (unless it's already running); aborts after maxMs so a hung task can't wedge future runs. */
export function runTask(name: string) {
  const t = tasks.find((x) => x.name === name);
  if (!t || t.running) return false;
  const t0 = Date.now(), ac = new AbortController();
  t.running = true; t.startedAt = t0;
  const timer = setTimeout(() => ac.abort(new Error(`timed out after ${Math.round(t.maxMs / 1000)}s`)), t.maxMs);
  const timeout = new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(ac.signal.reason instanceof Error ? ac.signal.reason : new Error("timed out")), { once: true }));
  const work = Promise.resolve().then(() => t.run(ac.signal));
  work.catch(() => {}); // prevent unhandled rejection if work settles after timeout wins the race
  Promise.race([work, timeout]).then(() => (t.error = undefined)).catch((e) => { t.error = (e as Error).message; console.log(`cron ${t.name}: ${t.error}`); })
    .finally(() => { clearTimeout(timer); t.running = false; t.startedAt = undefined; t.last = Math.floor(t0 / 1000); t.ms = Date.now() - t0; });
  return true;
}
export function schedule(name: string, cron: string, note: string, run: (signal: AbortSignal) => Promise<unknown>, maxMs = 45 * 60_000) {
  const i = tasks.findIndex((x) => x.name === name);
  const task: Task = { name, cron, note, maxMs, run };
  if (i >= 0) tasks[i] = task; else tasks.push(task);
}
export const cronStatus = () => tasks.map(({ name, cron, note, maxMs, running, startedAt, last, ms, error }) => ({
  name, cron, note, running: !!running, runningSeconds: running && startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
  maxSeconds: Math.round(maxMs / 1000), last: last ?? null, seconds: ms != null ? Math.round(ms / 1000) : null, error: error ?? null,
}));
let started = false;
export function startCron() {
  if (started) return; started = true;
  let lastMinute = Math.floor(Date.now() / 60_000) - 1;
  const tick = () => {
    const nowMin = Math.floor(Date.now() / 60_000);
    if (nowMin <= lastMinute) return;
    for (let m = Math.max(lastMinute + 1, nowMin - 4); m <= nowMin; m++) {
      const w = nyNow(new Date(m * 60_000));
      for (const t of tasks) if (matches(t.cron, w)) runTask(t.name);
    }
    lastMinute = nowMin;
  };
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
  // no overlap while running, and watchdog clears a hung task so future runs recover
  let sawAbort = false, runs = 0;
  schedule("test-hang", "* * * * *", "hang check", (sig) => new Promise((res) => { runs++; sig.addEventListener("abort", () => { sawAbort = true; }, { once: true }); if (runs > 1) res(null); }), 40);
  assert.equal(runTask("test-hang"), true);
  assert.equal(runTask("test-hang"), false, "running task must not stack");
  assert.equal(cronStatus().find((x) => x.name === "test-hang")?.running, true);
  await new Promise((r) => setTimeout(r, 80));
  const st = cronStatus().find((x) => x.name === "test-hang")!;
  assert.equal(st.running, false); assert.ok(sawAbort); assert.match(st.error ?? "", /timed out/);
  assert.equal(runTask("test-hang"), true, "recovered task runs cleanly after timeout");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cronStatus().find((x) => x.name === "test-hang")?.error, null);
  console.log("cron ok");
}
