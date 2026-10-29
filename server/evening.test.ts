// Run in the web container: docker exec ihor-web node server/evening.test.ts (it imports modules that open the live DBs)
import assert from "node:assert/strict";
process.env.EVENING_DB = ":memory:"; process.env.CITY_DB = ":memory:";
const { save, dedupe, events, PRIVATE, permitPlace } = await import("./evening.ts");

// permits: private gatherings out, public ones in
for (const t of ["Celebration", "Picnic", "Party", "Redbud Lawn Closure", "stephanie and remi's cakewalk wedding", "BiB October Work Days at Claremont Park", "MUTS- Asser Levy Playground"]) assert.ok(PRIVATE.test(t), t);
for (const t of ["CalabazaFest 2026", "2026 TCS NYC Marathon - Manhatta - Central Park", "Movies in the Park at Halloween on the Waterfront", "APA Pumpkin Smash"]) assert.ok(!PRIVATE.test(t), t);
assert.equal(permitPlace("Central Park: 102nd Street Cross Drive   ,Central Park: Merchants' Gate", "Manhattan"), "Central Park, Manhattan");
assert.equal(permitPlace("BAY STREET between SLOSSON TERRACE and CENTRAL AVENUE,  BAY STREET between X and Y", "Staten Island"), "BAY STREET & SLOSSON TERRACE, Staten Island");

const day = new Date(Date.now() + 2 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ev = (id: string, source: string, title: string, time: string, lat: number | null, lon: number | null, more = {}) => save({ id, source, title, start: `${day} ${time}`, lat, lon, category: "other", url: "x", ...more });
ev("parks:1", "parks", "Pumpkin Palooza", "12:00", 40.81, -73.92);
ev("permit:1", "permits", "Pumpkin Palooza", "11:00", 40.815, -73.915); // the same fair, permit placed at the park's center
ev("parks:2", "parks", "Halloween Party", "14:00", 40.70, -73.99);
ev("parks:3", "parks", "Halloween Party", "14:00", 40.85, -73.88); // another park: another party
ev("city:1", "city", "TCS New York City Marathon", "00:01", null, null, { allDay: true, venue: "All boroughs" });
ev("tm:1", "ticketmaster", "A show far away", "14:30", 40.60, -74.10);
dedupe();

// a 2-4 pm plan near Central Park: the citywide marathon (all day, no one place) shows up; the duplicate permit doesn't
const r = await events({ date: day, from: "14:00", to: "16:00", near: "40.7829,-73.9654", km: 3 });
assert.deepEqual(r.events.map((e: any) => e.id), ["city:1"]);
const all = (await events({ date: day, from: "00:00", to: "23:59" })).events.map((e: any) => e.id).sort();
assert.deepEqual(all, ["city:1", "parks:1", "parks:2", "parks:3", "tm:1"]);
console.log("evening ok");
