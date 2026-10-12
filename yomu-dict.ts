// Yomu's dictionary: kanji pages and word search from jisho.org, each fetched once and cached as JSON in
// yomu/data/jisho/ (committed to git, so the site never asks Jisho twice for the same thing). Jisho has no kanji API,
// so a kanji is read from its kanji page (meanings, kun/on readings, JLPT level, grade, frequency, strokes, compounds)
// and its sentence search (Tatoeba and Jreibun sentences, with their credit); words come from its word API.
// Stroke order isn't stored: the page draws KanjiVG's strokes itself (yomu/lib.js), the same data Jisho shows.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "yomu", "data", "jisho");
const UA = { "user-agent": "ihor.sh Yomu (https://ihor.sh/yomu/; caches every page it reads, so it asks once)" };
const GAP_MS = 400; // politeness: at most one Jisho request every 400 ms, whoever asks
let next = 0;
async function jisho(url: string) {
  const at = Math.max(Date.now(), next); next = at + GAP_MS;
  if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Jisho answered ${r.status}`);
  return r.text();
}
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
async function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  const f = path.join(DIR, file);
  try { return JSON.parse(await readFile(f, "utf8")); } catch {}
  const v = await make();
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, JSON.stringify(v, null, 1));
  return v;
}
const inflight = new Map<string, Promise<unknown>>(); // two visitors asking for the same kanji share one fetch
const once = <T>(key: string, f: () => Promise<T>) => (inflight.get(key) as Promise<T>) ?? (inflight.set(key, f().finally(() => inflight.delete(key))).get(key) as Promise<T>);

export type Seg = [string, string?]; // text, and its reading if it has kanji
export type Sentence = { ja: Seg[]; en: string; src: string };
export type KanjiInfo = { k: string; found: boolean; meanings: string[]; kun: string[]; on: string[]; radical: { meaning: string; char: string } | null; parts: string[]; jlpt: string; grade: string; freq: number | null; strokes: number | null;
  onWords: [string, string, string][]; kunWords: [string, string, string][]; sentences: Sentence[]; fetched: string };
export const isKanji = (s: string) => /^[㐀-䶿一-鿿豈-﫿々]$/u.test(s);

/** The kanji page, parsed. Exported for tests. */
export function parseKanjiPage(k: string, html: string): Omit<KanjiInfo, "sentences" | "fetched"> {
  const m = (re: RegExp) => html.match(re)?.[1];
  // blocks by their label (the radical and parts reuse the readings' CSS class)
  const dd = (label: string) => m(new RegExp(`<dt>${label}:</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`)) ?? "";
  const links = (html: string) => [...html.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((x) => decode(x[1]).trim());
  const compounds = (title: string) => {
    const block = m(new RegExp(`<h2>${title}</h2>\\s*<ul class="no-bullet">([\\s\\S]*?)</ul>`)) ?? "";
    return [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => text(x[1]).match(/^(\S+)\s*【([^】]+)】\s*(.+)$/)).filter(Boolean).map((x) => [x![1], x![2], x![3]] as [string, string, string]).slice(0, 8);
  };
  const meanings = text(m(/kanji-details__main-meanings">([\s\S]*?)<\/div>/) ?? "");
  const rad = dd("Radical"), radMeaning = text(rad.match(/radical_meaning">([\s\S]*?)<\/span>/)?.[1] ?? "");
  return { k, found: !!meanings, meanings: meanings ? meanings.split(/,\s*/) : [], kun: links(dd("Kun")), on: links(dd("On")),
    radical: rad ? { meaning: radMeaning, char: text(rad).replace(radMeaning, "").trim() } : null, parts: links(dd("Parts")),
    jlpt: m(/JLPT level <strong>(N\d)<\/strong>/) ?? "", grade: text(m(/taught in <strong>([^<]+)<\/strong>/) ?? m(/<div class="grade">([\s\S]*?)<\/div>/) ?? ""),
    freq: Number(m(/<strong>(\d+)<\/strong> of 2500 most used/)) || null, strokes: Number(m(/<strong>(\d+)<\/strong> strokes/)) || null,
    onWords: compounds("On reading compounds"), kunWords: compounds("Kun reading compounds") };
}
/** Sentences from a sentence-search page: each as segments (furigana kept for the kanji part) and its English. */
export function parseSentences(html: string): Sentence[] {
  return [...html.matchAll(/<li class="entry sentence clearfix">([\s\S]*?)<a class="light-details_link"/g)].map(([, li]) => {
    const ja = li.match(/<ul class="japanese_sentence[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "", segs: Seg[] = [];
    let rest = ja;
    for (const w of ja.matchAll(/<li class="clearfix">(?:<span class="furigana">([^<]*)<\/span>)?<span class="unlinked">([^<]*)<\/span><\/li>/g)) {
      const [whole, furi, word] = w, at = rest.indexOf(whole);
      if (at > 0) segs.push([text(rest.slice(0, at))]);
      const kan = decode(word).match(/^([㐀-鿿々]+)(.*)$/); // furigana covers the leading kanji; the kana after it is okurigana
      if (furi && kan) { segs.push([kan[1], decode(furi)]); if (kan[2]) segs.push([kan[2]]); } else segs.push([decode(word)]);
      rest = rest.slice(at + whole.length);
    }
    if (text(rest)) segs.push([text(rest)]);
    return { ja: segs.filter((s) => s[0]), en: text(li.match(/<span class="english">([\s\S]*?)<\/span>/)?.[1] ?? ""), src: li.match(/inline_copyright (\w+)/)?.[1] ?? "" };
  }).filter((s) => s.ja.length && s.en);
}

/** Everything about one kanji (cached in yomu/data/jisho/kanji/<code point>.json). */
export function kanjiInfo(k: string): Promise<KanjiInfo> {
  if (!isKanji(k)) return Promise.reject(new Error("One kanji, please."));
  return once(`k:${k}`, () => cached(`kanji/${k.codePointAt(0)!.toString(16)}.json`, async () => {
    const q = encodeURIComponent(k);
    const page = parseKanjiPage(k, await jisho(`https://jisho.org/search/${q}%20%23kanji`));
    // the shortest few of the first page of sentences: easier to read, and still real usage
    const sentences = page.found ? parseSentences(await jisho(`https://jisho.org/search/${q}%20%23sentences`).catch(() => "")).sort((a, b) => a.ja.map((s) => s[0]).join("").length - b.ja.map((s) => s[0]).join("").length).slice(0, 6) : [];
    return { ...page, sentences, fetched: new Date().toISOString() };
  }));
}

export type WordHit = { w: string; r: string; m: string; jlpt: string; common: boolean };
/** Jisho's word search, top 20 (cached in yomu/data/jisho/search/<hash>.json): for words beyond the JLPT lists. */
export function wordSearch(q: string): Promise<{ q: string; results: WordHit[] }> {
  q = q.trim().slice(0, 40);
  if (!q) return Promise.resolve({ q, results: [] });
  const key = createHash("sha1").update(q.toLowerCase()).digest("hex").slice(0, 16);
  return once(`s:${key}`, () => cached(`search/${key}.json`, async () => {
    const d = JSON.parse(await jisho(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}`));
    const results = (d.data as any[]).slice(0, 20).map((x) => ({ w: x.japanese[0].word ?? x.japanese[0].reading, r: x.japanese[0].reading ?? x.japanese[0].word,
      m: (x.senses as any[]).filter((s) => !s.parts_of_speech.includes("Wikipedia definition")).map((s) => s.english_definitions.join(", ")).filter((m, i, a) => a.indexOf(m) === i).slice(0, 3).join("; "), // senses, without repeats
      jlpt: String(x.jlpt?.[0] ?? "").replace("jlpt-", "").toUpperCase(), common: !!x.is_common }));
    return { q, results };
  }));
}
