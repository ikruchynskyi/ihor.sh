// When each page's content last changed, from git: one `git log` pass at startup (a deploy restarts the server). It dates
// the sitemap's <lastmod>, the pages' JSON-LD dateModified and their visible "Last updated" line. File mtimes were used
// before, but a checkout or pull touches them, so every page looked fresh. Without git (a container without .git), the
// file's mtime is the fallback. Built radio pages (radio/dist/…) are dated by their source (radio/…).
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const changed = new Map<string, string>(); // repo-relative path → YYYY-MM-DD of the newest commit that touched it
try {
  const log = execFileSync("git", ["-c", `safe.directory=${ROOT}`, "log", "--name-only", "--no-renames", "--format=@%cs"], { cwd: ROOT, maxBuffer: 256 * 2 ** 20 }).toString();
  let day = "";
  for (const line of log.split("\n")) if (line.startsWith("@")) day = line.slice(1); else if (line && !changed.has(line)) changed.set(line, day);
} catch { /* no git here: mtimes below */ }

/** The day a repo file's content last changed (YYYY-MM-DD), or "" if the file doesn't exist. */
export function lastChanged(rel: string): string {
  const src = rel.replace(/^radio\/dist\//, "radio/");
  const git = changed.get(src) ?? changed.get(rel);
  if (git) return git;
  try { return statSync(path.join(ROOT, rel)).mtime.toISOString().slice(0, 10); } catch { return ""; }
}

/** The newest of several files' dates (a page and the data it shows). */
export const newest = (...rels: string[]) => rels.map(lastChanged).filter(Boolean).sort().at(-1) ?? "";

/** "October 19, 2026" for a YYYY-MM-DD. */
export const longDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
