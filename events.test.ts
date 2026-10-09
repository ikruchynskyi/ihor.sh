// Run: node events.test.ts
import assert from "node:assert/strict";
import { hhmm, isoDate, parseEvents } from "./events.ts";

assert.equal(isoDate("October 7, 2026"), "2026-10-07");
assert.equal(isoDate("Smarch 1, 2026"), null);
assert.equal(hhmm("1:00 PM"), "13:00");
assert.equal(hhmm("12:30 AM"), "00:30");
assert.equal(hhmm("12:00 PM"), "12:00");

// The shape of one list item on nycforfree.co/events (attributes trimmed).
const html = `<div class="w-dyn-item"></div><div end-date="October 18, 2026" class="w-dyn-item" slug="boo" borough="Brooklyn"
  role="listitem" start-time="1:00 PM" title="Boo &amp; Brew" start-date="October 17, 2026" frequency="One-time"
  long="-73.98" description="Spooky &quot;fun&quot;…" category="Halloween" end-time="4:00 PM" lat="40.57"><a href="/events/boo">`;
const [e, ...rest] = parseEvents(html);
assert.equal(rest.length, 0, "items without a slug are skipped");
assert.deepEqual(
  [e.title, e.start_date, e.end_date, e.start_time, e.end_time, e.lat, e.lon, e.teaser],
  ["Boo & Brew", "2026-10-17", "2026-10-18", "13:00", "16:00", 40.57, -73.98, 'Spooky "fun"'],
);
assert.ok(parseEvents(html.replace("Spooky", "x ".repeat(200)))[0].teaser.length <= 181, "long teasers are cut at a word");
const multi = `<div class="w-dyn-item" slug="m" title="M" start-date="October 1, 2026"><div event-data="occurrences" class="hide">2026-10-01|06:00|08:00,2026-10-15|06:00|08:00</div></div>
  <div class="w-dyn-item" slug="n" title="N" start-date="October 2, 2026"><div event-data="occurrences" class="hide w-dyn-bind-empty"></div></div>`;
assert.deepEqual(parseEvents(multi).map((e) => e.occurrences), ["2026-10-01|06:00|08:00,2026-10-15|06:00|08:00", ""], "occurrences stay with their own item");
console.log("events ok");
