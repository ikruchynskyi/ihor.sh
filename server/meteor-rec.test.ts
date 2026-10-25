// Tests Meteor pass retention: keep passes with usable picture indefinitely, and all passes for the last 3 days.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prunePasses, PASS_RETENTION_MS } from "./meteor-rec.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "meteor-rec-test-"));

try {
  const now = 1729600000000;
  const day = 24 * 60 * 60 * 1000;

  const passes = [
    { id: "202610170000-meteor-m2-3", sat: "meteor-m2-3", start: now - 5 * day, end: now - 5 * day + 15 * 60e3, ok: true },   // old, usable -> KEEP
    { id: "202610171200-meteor-m2-4", sat: "meteor-m2-4", start: now - 5 * day, end: now - 5 * day + 15 * 60e3, ok: false },  // old, failed -> PRUNE
    { id: "202610210000-meteor-m2-3", sat: "meteor-m2-3", start: now - 1 * day, end: now - 1 * day + 15 * 60e3, ok: false },  // recent (<3d), failed -> KEEP
    { id: "202610211200-meteor-m2-4", sat: "meteor-m2-4", start: now - 2 * day, end: now - 2 * day + 15 * 60e3, ok: true },   // recent (<3d), usable -> KEEP
    { id: "202610160000-meteor-m2-4", sat: "meteor-m2-4", start: now - 6 * day, end: now - 6 * day + 15 * 60e3, ok: false, rawKept: true }, // old, failed, strongest raw -> KEEP
  ];

  for (const p of passes) {
    mkdirSync(path.join(tmp, p.id));
    writeFileSync(path.join(tmp, p.id, "meta.json"), JSON.stringify(p));
  }

  // Orphan aborted pass (not in index.json, older than 2 hours)
  const orphanId = "202610180100-meteor-m2-3";
  const orphanDir = path.join(tmp, orphanId);
  mkdirSync(orphanDir);
  writeFileSync(path.join(orphanDir, "raw.cu8"), "dummy");
  // Set mtime to 3 hours ago
  const threeHoursAgo = (now - 3 * 3600 * 1000) / 1000;
  utimesSync(orphanDir, threeHoursAgo, threeHoursAgo);

  writeFileSync(path.join(tmp, "index.json"), JSON.stringify(passes));

  const res = prunePasses(tmp, now, PASS_RETENTION_MS);
  assert.equal(res.kept, 4, "should keep 4 passes");
  assert.equal(res.pruned, 1, "should prune 1 pass from index");

  assert.ok(existsSync(path.join(tmp, "202610170000-meteor-m2-3")), "old pass with usable picture is kept");
  assert.ok(!existsSync(path.join(tmp, "202610171200-meteor-m2-4")), "old pass without usable picture is deleted");
  assert.ok(existsSync(path.join(tmp, "202610210000-meteor-m2-3")), "recent failed pass is kept (< 3 days)");
  assert.ok(existsSync(path.join(tmp, "202610211200-meteor-m2-4")), "recent usable pass is kept");
  assert.ok(!existsSync(orphanDir), "orphaned pass directory older than 2 hours is deleted");

  const updatedIndex = JSON.parse(readFileSync(path.join(tmp, "index.json"), "utf8"));
  assert.deepEqual(updatedIndex.map((p: any) => p.id), [
    "202610170000-meteor-m2-3",
    "202610210000-meteor-m2-3",
    "202610211200-meteor-m2-4",
    "202610160000-meteor-m2-4",
  ]);

  console.log("meteor-rec: prunePasses retention test passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
