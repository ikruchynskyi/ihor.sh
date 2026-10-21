// Run: node deals.test.ts
import assert from "node:assert/strict";
import { parseSales } from "./deals.ts";

const html = `<script type="application/ld+json">{"@type":"Event","name":" Coat Sale ","startDate":"2026-10-08T13:30:00-0400","endDate":"2026-10-12T19:00:00-0400",
"url":"http://www.chicmi.com/event/coat/?utm_medium=referral","location":{"@type":"Place","name":"489 Broome St","address":{"streetAddress":"489 Broome St","addressLocality":"New York","postalCode":"10013"},
"geo":{"latitude":"40.72295","longitude":"-74.00270"}},"description":"30–70% off   outerwear"}</script>
<script type="application/ld+json">{"@type":"Organization","name":"Chicmi"}</script><script type="application/ld+json">{ broken</script>`;
const [s, ...rest] = parseSales(html);
assert.equal(rest.length, 0, "only Events, and broken JSON is skipped");
assert.deepEqual(s, { name: "Coat Sale", start: "2026-10-08T13:30:00-0400", end: "2026-10-12T19:00:00-0400", place: "489 Broome St",
  address: "489 Broome St, New York, 10013", lat: 40.72295, lon: -74.0027, url: "https://www.chicmi.com/event/coat/", summary: "30–70% off outerwear" });
console.log("deals ok");
