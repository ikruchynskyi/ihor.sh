// Run: node server/ocr.test.ts (no OCR, no network): lines into signs
import assert from "node:assert/strict";
const { groupSigns } = await import("./ocr.ts");
// from the Columbus Circle night photo (Apple Vision's lines)
const signs = groupSigns([
  { text: "DO NOT", conf: 1, box: [0.6173, 0.5748, 0.6334, 0.5792] }, { text: "ENTER", conf: 1, box: [0.6193, 0.583, 0.6327, 0.586] },       // one sign
  { text: "© Intrepid", conf: 1, box: [0.8407, 0.577, 0.8733, 0.583] },                                                                  // bigger letters: an ad above…
  { text: "S9 St - Columbus Circle", conf: 1, box: [0.8333, 0.5915, 0.8793, 0.595] }, { text: "Station", conf: 0.5, box: [0.8347, 0.594, 0.8487, 0.5985] },
  { text: "59 St - Columbus Cir", conf: 1, box: [0.8347, 0.6005, 0.876, 0.6045] }, { text: "Station", conf: 1, box: [0.8342, 0.6027, 0.8498, 0.6076] }, // …the station's two boards
]);
assert.deepEqual(signs.map((s) => s.text), ["DO NOT ENTER", "© Intrepid", "S9 St - Columbus Circle Station"]);
assert.equal(signs[2].query, "S9 St - Columbus Circle");
console.log("ocr ok");
