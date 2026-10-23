// Run: node city.test.ts
import assert from "node:assert/strict";
process.env.CITY_DB = ":memory:";
const { save, snapshot, active, corner, notifyItems, orbit, cluster, faithful, inRing } = await import("./city.ts");

// A snapshot feed ends what it no longer lists; a plain save doesn't.
const t = Math.floor(Date.now() / 1000) - 100;
snapshot("511ny", [{ id: "a", kind: "road:incident", sev: 1, lat: 40.7, lon: -74, title: "A" }, { id: "b", kind: "road:closure", sev: 1, lat: 40.7, lon: -74, title: "B" }], t);
save("notify", [{ id: "n", kind: "alert:fire", sev: 3, lat: 40.7, lon: -74, starts: t, ends: t + 7200, title: "Fire" }], t);
snapshot("511ny", [{ id: "a", kind: "road:incident", sev: 1, lat: 40.7, lon: -74, title: "A" }], t + 50);
assert.deepEqual(active().map((e) => e.id).sort(), ["511ny:a", "notify:n"]);

assert.equal(corner("EAST   18 STREET between 5 AVENUE and BROADWAY", "Manhattan"), "EAST 18 STREET & 5 AVENUE, Manhattan");
assert.equal(corner("Union Square Park", "Manhattan"), "Union Square Park, Manhattan");

// Notify NYC sends each alert in many languages; only the English one is kept, with its type, place and borough.
const rss = `<rss><channel><item><title>Notify NYC - Incendio</title><description>El FDNY…</description><guid>2</guid><pubDate>Fri, 23 Oct 2026 17:09:10 GMT</pubDate><author>NYCEM [Spanish]</author><link>x</link></item>
<item><title>Notify NYC - Fire - Wright Avenue &amp; Tillotson Avenue</title><description>Notification issued 10-23-2026 at 01:05 PM.

Emergency personnel are on the scene of a three alarm fire located at Wright Avenue and Tillotson Avenue in The Bronx. To view this message in ASL: http://on.nyc.gov/1kdbhe2.</description><guid>1</guid><pubDate>Fri, 23 Oct 2026 17:05:51 GMT</pubDate><author>NYCEM [English]</author><link>https://cap/1.xml</link></item></channel></rss>`;
const [n, ...more] = notifyItems(rss);
assert.equal(more.length, 0);
assert.deepEqual({ type: n.type, where: n.where, borough: n.borough, cap: n.cap }, { type: "Fire", where: "Wright Avenue & Tillotson Avenue", borough: "Bronx", cap: "https://cap/1.xml" });
assert.match(n.body, /^Emergency personnel .* in The Bronx\.$/);

// A helicopter that turns a full circle in a small area is circling; one flying straight isn't.
const circle = Array.from({ length: 10 }, (_, i) => ({ lat: 40.75 + 0.005 * Math.sin(i), lon: -73.98 + 0.005 * Math.cos(i), trk: (i * 57) % 360 }));
assert.ok(orbit(circle) && orbit(circle)!.turn >= 360);
assert.equal(orbit(Array.from({ length: 10 }, (_, i) => ({ lat: 40.7 + i * 0.01, lon: -74, trk: 0 }))), null);

// Reports within 300 m of one thing merge; Waze drivers and NYSDOT count as different witnesses; closures don't join.
const ev = (id: string, source: string, kind: string, sev: number, lat: number, lon = -73.9) => ({ id, source, kind, sev, lat, lon, starts: 0, ends: null, first_seen: 0, last_seen: 0, title: id, detail: "{}", url: null });
const inc = cluster([ev("fire", "notify", "alert:fire", 3, 40.8), ev("w1", "511ny", "road:waze-hazard-on-the-road", 0, 40.801), ev("w2", "511ny", "road:waze-minor-accident", 1, 40.8005),
  ev("c", "511ny", "road:closure", 1, 40.8), ev("far", "511ny", "road:incident", 1, 40.9)]);
assert.equal(inc.length, 2);
assert.deepEqual([inc[0].id, inc[0].events.length, inc[0].confidence, inc[0].sources], ["fire", 3, 2, ["notify", "waze"]]);

// A brief's bullet must cite real facts, and every number in it must be in them.
const F = new Map([["F1", "Fire - Wright Avenue: 3 reports from Notify NYC, severity 3 of 3, since 1:05 PM"], ["F2", "Air quality index 42"]]);
assert.ok(faithful({ text: "A 3-report fire on Wright Avenue since 1:05 PM.", facts: ["F1"] }, F));
assert.ok(!faithful({ text: "A fire with 12 engines on Wright Avenue.", facts: ["F1"] }, F)); // 12 isn't in F1
assert.ok(!faithful({ text: "Air is fine.", facts: ["F9"] }, F)); // no such fact
assert.ok(!faithful({ text: "Air is fine.", facts: [] }, F));

// Point in polygon (a unit square), as boroughs use it.
const sq = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
assert.ok(inRing(sq, 0.5, 0.5) && !inRing(sq, 1.5, 0.5));
console.log("city.test.ts: OK");
