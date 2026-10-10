// Did the agent make it up? Checks every number and clock time in an answer against the data its tools returned
// (and the question). A number counts as supported if the data has it, or something that rounds to it (72 from 72.4).
// Unsupported doesn't always mean invented (the model may have computed it, like "in 4 minutes" from a timestamp),
// but it's where to look. Pure, so node can test it: node ai/faithful.test.mjs

const TIME = /(?<![\d.])(\d{1,2})(?::(\d{2})(?::\d{2})?)?\s*(?:([ap])\.?m\.?(?![a-z]))?/gi; // 3:15, 15:15:00, 6am, 3:15 p.m.
const NUM = /(?<![\d.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)|(?<![\d.,])\d+(?:\.\d+)?(?!\d)/g; // times are taken out first

const times = (s) => [...String(s).matchAll(TIME)].filter((m) => m[2] || m[3]).map((m) => {
  let h = +m[1]; const ap = m[3]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0;
  return { text: m[0].trim(), min: h * 60 + +(m[2] ?? 0), ampm: !!ap, at: m.index, end: m.index + m[0].length };
});
const numbers = (s) => {
  const t = times(s), inTime = (i) => t.some((x) => i >= x.at && i < x.end);
  return [...String(s).matchAll(NUM)].filter((m) => !inTime(m.index)).map((m) => ({ text: m[0], value: +m[0].replace(/,/g, ""), at: m.index, places: (m[0].split(".")[1] ?? "").length }));
};

/** [{ text, kind: "number" | "time", found: "data" | "question" | false }] for each number and time in the answer. */
export function check(answer, data, question = "") {
  const src = typeof data === "string" ? data : JSON.stringify(data);
  const srcNums = numbers(src).map((n) => n.value), srcTimes = times(src).map((x) => x.min), qNums = new Set(numbers(question).map((n) => n.value));
  // ISO timestamps in the data ("2026-10-10T15:15:00") are times too; the regex above already catches their HH:MM part
  const out = [];
  for (const x of times(answer)) {
    const ok = srcTimes.some((m) => m === x.min || (!x.ampm && (m % 720) === (x.min % 720)));
    out.push({ text: x.text, kind: "time", at: x.at, found: ok ? "data" : false });
  }
  for (const n of numbers(answer)) {
    const half = 0.5 * 10 ** -n.places;
    const ok = srcNums.some((v) => Math.abs(v - n.value) <= half + 1e-9);
    out.push({ text: n.text, kind: "number", at: n.at, found: ok ? "data" : qNums.has(n.value) ? "question" : false });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The share of an answer's numbers and times that the data supports (1 when there are none to check). */
export const faithfulness = (checks) => { const c = checks.filter((x) => x.found !== "question"); return c.length ? c.filter((x) => x.found).length / c.length : 1; };
