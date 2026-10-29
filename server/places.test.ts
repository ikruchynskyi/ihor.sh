// Run: node server/places.test.ts (no network, no live DB)
import assert from "node:assert/strict";
const { openNow } = await import("./nycapi.ts");
// Mon–Fri 9:00–17:00 and Saturday 22:00 → Sunday 02:00 (past midnight at the end of the week)
const week = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 17, minute: 0 } })).concat([{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }]);
const ny = (s: string) => new Date(`${s}-04:00`); // EDT
assert.equal(openNow(week, ny("2026-10-28T10:00:00")), true);  // Wednesday 10 am
assert.equal(openNow(week, ny("2026-10-28T17:00:00")), false); // closes at 5
assert.equal(openNow(week, ny("2026-11-01T01:30:00")), true);  // Sunday 1:30 am, Saturday's late opening
assert.equal(openNow(week, ny("2026-11-01T12:00:00")), false);
assert.equal(openNow([{ open: { day: 0, hour: 0, minute: 0 } }], ny("2026-10-28T03:00:00")), true); // open 24 hours
assert.equal(openNow(undefined), null);
console.log("places ok");

// One line per business (the Columbus Circle click, 2026-10-28): inspections, OpenStreetMap and Google merged by name
const { mergeBusinesses, nameKey } = await import("./nycapi.ts");
assert.equal(nameKey("Angelina Bakery & Pizzeria (Columbus Circle)"), "angelina pizzeria");
const m = mergeBusinesses([
  { name: "Marea Restaurant", kind: "restaurant · Italian", address: "240 Central Park South", camis: "1", grade: "A", source: "Health inspections" },
  { name: "Starbucks", kind: "restaurant · Coffee/Tea", camis: "2", grade: "A", source: "Health inspections" },
  { name: "Marea", kind: "restaurant", address: "Central Park South", source: "OpenStreetMap" },
  { name: "Bakery On 58 Corp.", kind: "restaurant", source: "Health inspections" },
], [
  { name: "Marea", kind: "Italian Restaurant", rating: 4.5, reviews: 2000, url: "g/marea", website: "https://marea.com", phone: "1", open: false },
  { name: "Manhattan Club 1 Bedroom hotel suite with AC, WiFi in amazing New York", kind: "Lodging", rating: null, website: "" },
  { name: "Wendy Mayer, DDS", kind: "Dentist", rating: 4.6, reviews: 132, url: "g/w", website: "https://w.com" },
]);
assert.deepEqual(m.map((b: any) => b.name), ["Marea Restaurant", "Starbucks", "Bakery On 58 Corp.", "Wendy Mayer, DDS"]); // street level first; the unrated listing is gone
assert.equal(m[0].grade, "A"); assert.equal(m[0].rating, 4.5); assert.equal(m[0].website, "https://marea.com"); assert.equal(m[0].source, "Health inspections, OpenStreetMap, Google");
// Places off (quota used up, key gone, API down): every business is still listed, without Google's link, so the page
// shows its Google Maps search link (nyc/index.html: b.ratingUrl ? "" : maps search)
const off = mergeBusinesses([{ name: "Rookie USA", kind: "shoes shop", source: "OpenStreetMap" }, { name: "Lids", kind: "hat shop", source: "OpenStreetMap" }], []);
assert.equal(off.length, 2); assert.ok(off.every((b: any) => !b.ratingUrl));
console.log("merge ok");

