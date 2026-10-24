// Run: node city.test.ts
import assert from "node:assert/strict";
process.env.CITY_DB = ":memory:";
const { save, snapshot, active, corner, notifyItems, orbit, cluster, faithful, inRing, newsItems, explore, pickCameras, likelihood, PRIOR, poissonTail, bh } = await import("./city.ts");

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

const [g] = notifyItems(`<item><title>Notify NYC - Planned Natural Gas Work -10/24- Springfield Boulevard (QN)</title><description>Notification issued 10-23-2026 at 03:00 PM. National Grid is scheduled to conduct natural gas work near Springfield Boulevard between 115th Road and Linden Boulevard in Queens. The work is scheduled to take place between 8:00 AM and 8:00 PM on 10/24.</description><guid>3</guid><pubDate>Fri, 23 Oct 2026 19:00:00 GMT</pubDate><author>NYCEM [English]</author><link>c</link></item>`);
assert.deepEqual({ type: g.type, where: g.where, borough: g.borough, day: g.day }, { type: "Planned Natural Gas Work", where: "Springfield Boulevard & 115th Road", borough: "Queens", day: { month: 10, date: 24 } });

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

// A fire story placed only at its neighborhood joins the fire 1 km away (same family), not the crash next to it.
const story = { ...ev("s", "news", "news-rough", 2, 40.809), detail: JSON.stringify({ topic: "fire", outlet: "PIX11" }) };
const merged = cluster([ev("fire2", "notify", "alert:fire", 3, 40.8), ev("crash", "511ny", "road:waze-minor-accident", 1, 40.8095, -73.9), story]);
assert.deepEqual(merged.find((c) => c.id === "fire2")!.sources, ["notify", "news:PIX11"]);
const alone = cluster([ev("crash", "511ny", "road:waze-minor-accident", 1, 40.8095), story]);
assert.equal(alone.length, 2); assert.ok(alone.find((c) => c.id === "s")!.rough);

// A brief's bullet must cite real facts, and every number in it must be in them.
const F = new Map([["F1", "Fire - Wright Avenue: 3 reports from Notify NYC, severity 3 of 3, since 1:05 PM"], ["F2", "Air quality index 42"]]);
assert.ok(faithful({ text: "A 3-report fire on Wright Avenue since 1:05 PM.", facts: ["F1"] }, F));
assert.ok(!faithful({ text: "A fire with 12 engines on Wright Avenue.", facts: ["F1"] }, F)); // 12 isn't in F1
assert.ok(!faithful({ text: "Air is fine.", facts: ["F9"] }, F)); // no such fact
assert.ok(!faithful({ text: "Air is fine.", facts: [] }, F));

// Point in polygon (a unit square), as boroughs use it.
const sq = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
assert.ok(inRing(sq, 0.5, 0.5) && !inRing(sq, 1.5, 0.5));
// News: today's stories only, CDATA unwrapped and tags stripped, Atom links too.
const since = Date.parse("2026-10-23T04:00:00Z") / 1000;
const feed = `<rss><channel><item><title><![CDATA[Fire in Crown Heights]]></title><link>https://x/1</link><description><![CDATA[<p>FDNY &amp; EMS on Eastern Pkwy</p>]]></description><pubDate>Fri, 23 Oct 2026 18:00:00 GMT</pubDate></item>
<item><title>Yesterday's story</title><link>https://x/2</link><pubDate>Thu, 22 Oct 2026 18:00:00 GMT</pubDate></item></channel></rss>`;
assert.deepEqual(newsItems(feed, since).map((x) => [x.title, x.summary]), [["Fire in Crown Heights", "FDNY & EMS on Eastern Pkwy"]]);
assert.equal(newsItems(`<rss><item><title>Tish James&#8217; rival &amp; more</title><link>https://z/1</link><pubDate>Fri, 23 Oct 2026 18:00:00 GMT</pubDate></item></rss>`, since)[0].title, "Tish James\u2019 rival & more");
assert.equal(newsItems(`<feed><entry><title>Atom story</title><link href="https://y/1"/><published>2026-10-23T15:00:00Z</published></entry></feed>`, since)[0].link, "https://y/1");

// explore counts what matches, grouped, from the store.
save("311", [{ id: "a", kind: "311:Noise - Residential", sev: 0, lat: 40.71, lon: -73.96, starts: t, ends: t, title: "Noise - Residential: Loud Music" }, { id: "b", kind: "311:Noise - Street", sev: 0, lat: 40.711, lon: -73.961, starts: t, ends: t, title: "Noise - Street: Loud Talking" },
  { id: "c", kind: "311:HEAT/HOT WATER", sev: 0, lat: 40.71, lon: -73.96, starts: t, ends: t, title: "HEAT/HOT WATER: Entire Building" }], t);
const x = explore({ query: "noise", lat: 40.71, lon: -73.96, r: 1, hours: 24 });
assert.deepEqual([x.total, x.groups.length], [2, 2]);
// The brief's cameras: 5 (all if fewer), spread over the area instead of bunched along one road.
const cam = (lat: number, lon: number, h?: number) => ({ lat, lon, h });
assert.equal(pickCameras([cam(40.7, -74), cam(40.71, -74)]).length, 2);
const road = Array.from({ length: 8 }, (_, i) => cam(40.70 + i * 0.002, -74.01, 240)), grid = [cam(40.70, -73.98), cam(40.72, -73.98), cam(40.71, -73.995), cam(40.70, -73.995)];
const got = pickCameras([...road, ...grid]);
assert.equal(got.length, 5);
assert.ok(got.filter((c) => c.lon === -74.01).length <= 2); // at most two from the row along one road
// Likely real: independent witnesses combine (1 − Π(1 − r)); a Waze report halves each hour.
const pri = new Map(Object.entries(PRIOR).map(([k, p]) => [k, { r: p, yes: 0, no: 0 }])), T = 1_800_000_000;
const at = (e: any, starts: number) => ({ ...e, starts });
assert.equal(likelihood({ events: [at(ev("f", "notify", "alert:fire", 3, 40.8), T)] }, pri, T).probability, 0.95);
assert.equal(likelihood({ events: [at(ev("f", "notify", "alert:fire", 3, 40.8), T), at(ev("w", "511ny", "road:waze-hazard-on-the-road", 0, 40.8), T)] }, pri, T).probability, 0.98);
assert.equal(likelihood({ events: [at(ev("w", "511ny", "road:waze-minor-accident", 1, 40.8), T - 7200)] }, pri, T).probability, 0.15); // 0.6 × ½ × ½
assert.equal(likelihood({ events: [at(ev("w1", "511ny", "road:waze-minor-accident", 1, 40.8), T), at(ev("w2", "511ny", "road:waze-minor-accident", 1, 40.8), T)] }, pri, T).probability, 0.6); // two drivers are one witness
// Poisson tails and Benjamini–Hochberg, against hand values.
assert.ok(Math.abs(poissonTail(1, 1) - (1 - Math.exp(-1))) < 1e-12);
assert.ok(Math.abs(poissonTail(5, 1) - 0.0036598468) < 1e-9);
assert.ok(poissonTail(400, 100) > 0 && poissonTail(400, 100) < 1e-60); // far tail, no underflow to 0 or NaN
assert.deepEqual(bh([0.01, 0.04, 0.03, 0.5]).map((x) => +x.toFixed(4)), [0.04, 0.0533, 0.0533, 0.5]);
console.log("city.test.ts: OK");
