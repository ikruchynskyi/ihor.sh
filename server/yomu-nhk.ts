// NHK News Web Easy articles parser & cache for daily Japanese reading practice
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const CACHE_FILE = path.join(ROOT, "yomu/data/nhk-cache.json");
const FEED_URL = "https://nhkeasier.com/feed/";

export type NhkArticle = {
  id: string;
  title: string;
  pubDate: string;
  formattedDate: string;
  link: string;
  originalUrl: string;
  audio: string;
  image: string;
  excerpt: string;
  text: string;
  paragraphs: string[];
  level: "N5" | "N4" | "N3" | "N2" | "N1";
};

let cachedArticles: NhkArticle[] | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in-memory TTL

let kanjiLevelMap: Map<string, number> | null = null;

async function getKanjiLevelMap(): Promise<Map<string, number>> {
  if (kanjiLevelMap) return kanjiLevelMap;
  try {
    const raw = await readFile(path.join(ROOT, "yomu/data/kanji.json"), "utf8");
    const list = JSON.parse(raw) as { k: string; n: number }[];
    kanjiLevelMap = new Map(list.map((item) => [item.k, item.n]));
  } catch {
    kanjiLevelMap = new Map();
  }
  return kanjiLevelMap;
}

/** Estimate JLPT level based on kanji distribution */
async function estimateLevel(text: string): Promise<NhkArticle["level"]> {
  const map = await getKanjiLevelMap();
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalKanji = 0;

  for (const char of text) {
    if (map.has(char)) {
      const n = map.get(char)! as 1 | 2 | 3 | 4 | 5;
      if (counts[n] !== undefined) {
        counts[n]++;
        totalKanji++;
      }
    }
  }

  if (totalKanji === 0) return "N5";
  const hardFraction = (counts[1] + counts[2]) / totalKanji;
  const n3Fraction = counts[3] / totalKanji;

  if (hardFraction > 0.25) return "N2";
  if (n3Fraction + hardFraction > 0.35) return "N3";
  if (counts[4] + counts[3] > counts[5]) return "N4";
  return "N4"; // Default for NHK Easy
}

function formatDate(pubDateStr: string): string {
  try {
    const d = new Date(pubDateStr);
    if (isNaN(d.getTime())) return pubDateStr;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}月${day}日`;
  } catch {
    return pubDateStr;
  }
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Parse XML feed into structured articles */
export async function parseFeed(xml: string): Promise<NhkArticle[]> {
  const items: NhkArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemBlock = match[1];
    const titleMatch = itemBlock.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = itemBlock.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = itemBlock.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descMatch = itemBlock.match(/<description>([\s\S]*?)<\/description>/);
    const audioMatch = itemBlock.match(/<enclosure\s+url="([^"]+)"/i) || itemBlock.match(/<audio\s+src="([^"]+)"/i);
    const imgMatch = itemBlock.match(/<itunes:image\s+href="([^"]+)"/i) || itemBlock.match(/<img\s+src="([^"]+)"/i);
    const origMatch = itemBlock.match(/<a\s+href="(https:\/\/www3\.nhk\.or\.jp\/news\/easy\/[^"]+)"/i);

    const rawDesc = descMatch ? descMatch[1] : "";
    const unescapedDesc = unescapeXml(rawDesc);

    // Extract clean paragraphs without ruby/HTML
    const paragraphs: string[] = [];
    const pRegex = /<p>([\s\S]*?)<\/p>/gi;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRegex.exec(unescapedDesc)) !== null) {
      const cleanP = pMatch[1].replace(/<rt>[\s\S]*?<\/rt>/gi, "").replace(/<[^>]+>/g, "").trim();
      if (cleanP) paragraphs.push(cleanP);
    }

    const title = titleMatch ? unescapeXml(titleMatch[1].trim()) : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const id = link ? link.replace(/.*\/story\/(\d+)\/?/, "$1") : `nhk-${items.length + 1}`;
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
    const fullText = paragraphs.join("\n\n");
    const excerpt = paragraphs[0] ? (paragraphs[0].length > 100 ? paragraphs[0].slice(0, 97) + "..." : paragraphs[0]) : "";

    const level = await estimateLevel(fullText || title);

    items.push({
      id,
      title,
      pubDate,
      formattedDate: formatDate(pubDate),
      link,
      originalUrl: origMatch ? origMatch[1] : "",
      audio: audioMatch ? audioMatch[1] : "",
      image: imgMatch ? imgMatch[1] : "",
      excerpt,
      text: fullText,
      paragraphs,
      level,
    });
  }

  return items;
}

/** Load cached articles from disk if available */
async function loadDiskCache(): Promise<NhkArticle[] | null> {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = await readFile(CACHE_FILE, "utf8");
      const list = JSON.parse(raw) as NhkArticle[];
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  return null;
}

/** Save articles to disk cache */
async function saveDiskCache(articles: NhkArticle[]): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(articles, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save NHK cache:", (e as Error).message);
  }
}

/** Get latest NHK Easy articles, refreshing from feed when stale */
export async function getNhkArticles(forceRefresh = false): Promise<NhkArticle[]> {
  const now = Date.now();
  if (!forceRefresh && cachedArticles && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedArticles;
  }

  try {
    const res = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "ihor-sh-yomu/1.0" },
    });
    if (res.ok) {
      const xml = await res.text();
      const parsed = await parseFeed(xml);
      if (parsed.length) {
        cachedArticles = parsed;
        lastFetchedAt = now;
        await saveDiskCache(parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.error("NHK feed fetch error:", (e as Error).message);
  }

  // Fallback to disk cache if remote request failed
  const fromDisk = await loadDiskCache();
  if (fromDisk) {
    cachedArticles = fromDisk;
    return fromDisk;
  }

  // Fallback to minimal sample articles if completely offline
  return fallbackArticles();
}

/** Get a single NHK article by ID */
export async function getNhkArticleById(id: string): Promise<NhkArticle | null> {
  const articles = await getNhkArticles();
  return articles.find((a) => a.id === id) || null;
}

function fallbackArticles(): NhkArticle[] {
  return [
    {
      id: "sample-1",
      title: "ICCの裁判官などをしたナビ・ピレイさんがノーベル平和賞",
      pubDate: "Tue, 13 Oct 2026 20:30:00 +0900",
      formattedDate: "10月13日",
      link: "https://nhkeasier.com/",
      originalUrl: "https://www3.nhk.or.jp/news/easy/",
      audio: "",
      image: "",
      excerpt: "今年のノーベル賞の平和賞が9日、決まりました。南アフリカ出身のナビ・ピレイさんです。",
      text: "今年のノーベル賞の平和賞が9日、決まりました。\n\n南アフリカ出身のナビ・ピレイさんです。ピレイさんは1941年生まれで、南アフリカで弁護士になりました。\n\nその後、戦争犯罪をした人などを裁判するICC＝国際刑事裁判所の裁判官などをしました。今は、国と国の争いを解決するICJ＝国際司法裁判所の裁判官をしています。\n\nノーベル賞を選ぶ委員会は「ピレイさんは、国際的な問題の裁判で、法律が戦争や暴力を止めることになると証明してきた」と話しました。",
      paragraphs: [
        "今年のノーベル賞の平和賞が9日、決まりました。",
        "南アフリカ出身のナビ・ピレイさんです。ピレイさんは1941年生まれで、南アフリカで弁護士になりました。",
        "その後、戦争犯罪をした人などを裁判するICC＝国際刑事裁判所の裁判官などをしました。今は、国と国の争いを解決するICJ＝国際司法裁判所の裁判官をしています。",
        "ノーベル賞を選ぶ委員会は「ピレイさんは、国際的な問題の裁判で、法律が戦争や暴力を止めることになると証明してきた」と話しました。",
      ],
      level: "N3",
    },
  ];
}
