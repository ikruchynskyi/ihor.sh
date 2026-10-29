// Run in the web container: docker exec ihor-web node server/evening.test.ts (it imports modules that open the live DBs)
import assert from "node:assert/strict";
process.env.EVENING_DB = ":memory:"; process.env.CITY_DB = ":memory:";
const { save, dedupe, events, PRIVATE, permitPlace, ebOrgIds, ebEvent } = await import("./evening.ts");
await (await import("./city.ts")).loadBoroughs();

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
// Eventbrite: organizer ids from search result URLs; only dated events at NYC venues
assert.deepEqual(ebOrgIds(["https://www.eventbrite.com/o/written-in-brooklyn-58266358303", "https://www.eventbrite.com/o/written-in-brooklyn-58266358303?x=1", "https://www.eventbrite.com/e/a-show-tickets-123456789012", "https://www.eventbrite.co.uk/o/x-y-12345678"]), ["58266358303", "12345678"]);
const ebx = { id: "1", name: { text: "Jazz Night" }, summary: "Live jazz trio", url: "https://eventbrite.com/e/1", start: { local: "2026-11-01T19:30:00" }, end: { local: "2026-11-01T22:00:00" }, is_free: false, status: "live",
  venue: { name: "Bar", latitude: "40.7128", longitude: "-74.0060", address: { localized_address_display: "1 Main St, New York, NY", city: "New York" } }, ticket_availability: { minimum_ticket_price: { major_value: "15.00" } } };
const m = ebEvent(ebx)!;
assert.equal(m.start, "2026-11-01 19:30"); assert.equal(m.priceMin, 15); assert.equal(m.category, "music"); assert.equal(m.id, "eb:1");
assert.equal(ebEvent({ ...ebx, venue: { ...ebx.venue, latitude: "40.72", longitude: "-74.05" } }), null); // Jersey City
assert.equal(ebEvent({ ...ebx, online_event: true }), null);
assert.equal(ebEvent({ ...ebx, name: { text: "Steve Martin Presents" }, category_id: "105", subcategory_id: "5010" })!.category, "comedy");
console.log("evening ok");
