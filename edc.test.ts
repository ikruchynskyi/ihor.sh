// Run: node edc.test.ts
import assert from "node:assert/strict";
import { parseFeed, tags, cluster } from "./edc.ts";

const rss = `<rss><channel><item><title><![CDATA[Spyderco Para 3 in MagnaCut &amp; more]]></title><link>https://a.example/p3</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;The Para 3 gets &#8220;MagnaCut&#8221; steel.&lt;/p&gt;</description></item></channel></rss>`;
const [r] = parseFeed(rss);
assert.equal(r.title, "Spyderco Para 3 in MagnaCut & more"); assert.equal(r.link, "https://a.example/p3");
assert.equal(r.published, Date.UTC(2026, 9, 9, 10) / 1000); assert.equal(r.teaser, "The Para 3 gets “MagnaCut” steel.");
const atom = `<feed><entry><title>Emisar D4K review</title><link rel="alternate" href="https://b.example/d4k"/><updated>2026-10-08T12:00:00Z</updated><summary>Bright.</summary></entry></feed>`;
assert.deepEqual(parseFeed(atom).map((i) => [i.title, i.link]), [["Emisar D4K review", "https://b.example/d4k"]]);
// tags: whole-word brands (Zebra is not in Zebralight), categories by keyword
assert.deepEqual(tags("Zebralight SC64 headlamp, 18650"), { brands: ["Zebralight"], cats: ["lights"] });
assert.deepEqual(tags("Böker Plus knife with D2 steel").brands, ["Boker"]);
assert.ok(tags("Leatherman Arc multi-tool").cats.includes("multitools"));
// the same story from two sources groups; another source's different story doesn't
const items = [
  { title: "Spyderco Para 3 MagnaCut released", source: "A", published: 3, brands: ["Spyderco"], link: "a" },
  { title: "New Spyderco Para 3 in MagnaCut steel", source: "B", published: 2, brands: ["Spyderco"], link: "b" },
  { title: "Olight Arkfeld Ultra review", source: "B", published: 1, brands: ["Olight"], link: "c" },
];
const g = cluster(items);
assert.equal(g.length, 2); assert.equal(g[0].also.length, 1); assert.equal(g[0].also[0].source, "B");
console.log("edc ok");
