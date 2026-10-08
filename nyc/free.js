// Curated "free/cheap NYC" rules → what applies on a given day. Pure, so node can test it.
// ponytail: uses the device's local time; correct for people in NYC, which is the audience.

/** Is `date` the nth (1-based) occurrence of its weekday in its month? */
const isNth = (date, nth) => Math.ceil(date.getDate() / 7) === nth;

function matches(w, date) {
  const month = date.getMonth() + 1;
  if (w.days && !w.days.includes(date.getDay())) return false;
  if (w.nth && !isNth(date, w.nth)) return false;
  if (w.months && !w.months.includes(month)) return false;
  if (w.exceptMonths?.includes(month)) return false;
  return true;
}

/** Everything that applies on `date`: [{ ...rule, start, end, price }]. Perks/always-on rules come with no times. */
export function onDay(rules, date) {
  const out = [];
  for (const r of rules) {
    if (r.when === "always") { out.push({ ...r, start: null, end: null }); continue; }
    for (const w of r.when) if (matches(w, date)) out.push({ ...r, start: w.start ?? null, end: w.end ?? null, price: w.price ?? r.price });
  }
  return out;
}

const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** "now" | "later" | "over" | "allday", relative to `now` (only meaningful when date is today). */
export function status(item, now) {
  if (!item.start && !item.end) return "allday";
  const t = now.getHours() * 60 + now.getMinutes();
  if (item.end && t >= mins(item.end)) return "over";
  if (item.start && t < mins(item.start)) return "later";
  return "now";
}

export function timeLabel(item) {
  if (item.start && item.end) return `${item.start}–${item.end}`;
  if (item.end) return `until ${item.end}`;
  if (item.start) return `from ${item.start}`;
  return "all day";
}
