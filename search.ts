// Site search: every page, Yomu story and grammar point in an in-memory full-text index (SQLite FTS5, porter stemming),
// built from the files at startup. Serves /api/site/search, the search box in the site bar, and Blip's site_search tool.
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const db = new DatabaseSync(":memory:");
db.exec(`create virtual table pages using fts5(url unindexed, world unindexed, title, description, headings, body, tokenize = 'porter unicode61')`);
const put = db.prepare(`insert into pages (url, world, title, description, headings, body) values (?, ?, ?, ?, ?, ?)`);
let ready: Promise<number> | null = null;

const text = (html: string) => html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const grab = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => text(m[1])).filter(Boolean);

/** Reads every world's pages (and Yomu's stories and grammar) into the index. Returns how many entries. */
export function buildIndex(root: string, worlds: Record<string, { dir: string; label: string }>) {
  return (ready ??= (async () => {
    let n = 0;
    const add = (url: string, world: string, title: string, description: string, headings: string, body: string) => { put.run(url, world, title, description, headings, body.slice(0, 30_000)); n++; };
    add("/", "home", "ihor.sh: the home page", "Every world and project on one screen.", "", text(await readFile(path.join(root, "index.html"), "utf8")));
    for (const [name, { dir, label }] of Object.entries(worlds)) {
      for (const f of (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".html")).sort()) {
        const html = await readFile(path.join(dir, f), "utf8");
        if (html.includes('name="ihor-bare"')) continue;
        const body = html.match(/<body[\s\S]*$/i)?.[0] ?? html;
        add(`/${name}/${f.replace(/index\.html$/, "")}`, label, text(html.match(/<title>([^<]*)/)?.[1] ?? f), text(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ""), grab(body, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi).join(" · "), text(body));
      }
    }
    try {
      const yomu = worlds.yomu?.label ?? "Yomu";
      for (const st of JSON.parse(await readFile(path.join(root, "yomu/stories/index.json"), "utf8"))) {
        const story = JSON.parse(await readFile(path.join(root, `yomu/stories/${st.id}.json`), "utf8"));
        const lines = (story.lines ?? []).map((l: any) => `${(l.t ?? []).map((t: any) => t[0]).join("")} ${l.en ?? ""}`).join(" ");
        add(`/yomu/story.html?u=${st.id}`, yomu, `${st.title.ja} · ${st.title.en} (a ${st.level} story)`, story.scene ?? "", (story.grammar ?? []).map((g: any) => g.title).join(" · "), lines);
      }
      for (const g of JSON.parse(await readFile(path.join(root, "yomu/data/grammar.json"), "utf8")))
        add(`/yomu/grammar.html?level=${g.level}#${g.id}`, yomu, `${g.pattern}: ${g.meaning} (${g.level} grammar)`, g.explain ?? "", "", (g.examples ?? []).map((ex: any) => `${(ex.t ?? []).map((t: any) => t[0]).join("")} ${ex.en ?? ""}`).join(" "));
    } catch {}
    return n;
  })());
}

export type Hit = { url: string; world: string; title: string; snippet: string };
/** The best pages for a query: every word must match (stemmed; the last one as a prefix), else any word. */
export async function siteSearch(q: string, limit = 8): Promise<Hit[]> {
  await ready;
  const terms = String(q ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((t) => t.length > 1).slice(0, 8);
  if (!terms.length) return [];
  const quoted = terms.map((t, i) => `"${t}"${i === terms.length - 1 ? "*" : ""}`);
  const sql = `select url, world, title, snippet(pages, 5, '<b>', '</b>', '…', 16) as snippet from pages where pages match ? order by bm25(pages, 0, 0, 10, 4, 4, 1) limit ?`;
  for (const match of [quoted.join(" "), quoted.join(" OR ")]) {
    try { const rows = db.prepare(sql).all(match, limit) as Hit[]; if (rows.length) return rows; } catch {}
  }
  return [];
}
