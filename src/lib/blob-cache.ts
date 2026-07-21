import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { catalogDirName } from "./catalog.ts";

/**
 * Content-addressed cache for per-blob collector results. Identical blobs
 * appear in thousands of commits, so content-derived metrics (directives,
 * todo counts, …) are computed once per blob instead of once per commit.
 * Lives under the catalog's cache/ folder and is safe to delete at any time.
 */
export type BlobCache = {
  readonly getMany: (
    collector: string,
    cacheKey: string,
    blobShas: readonly string[],
  ) => Map<string, string>;
  readonly setMany: (
    collector: string,
    cacheKey: string,
    entries: ReadonlyMap<string, string>,
  ) => void;
};

const openCaches = new Map<string, BlobCache>();

/** Bump when the table shape changes; a mismatch drops the cache and rebuilds. */
const schemaVersion = 2;

export const getBlobCache = (repoRoot: string): BlobCache => {
  const existing = openCaches.get(repoRoot);
  if (existing) {
    return existing;
  }

  const cacheDir = path.join(repoRoot, catalogDirName, "cache");
  mkdirSync(cacheDir, { recursive: true });
  const db = new DatabaseSync(path.join(cacheDir, "blob-cache.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  // The result column is content-derived and cheap to recompute, so on any
  // schema change we simply drop it rather than migrate.
  const storedSchema = db.prepare("PRAGMA user_version").get();
  if (Number(storedSchema?.["user_version"] ?? 0) !== schemaVersion) {
    db.exec("DROP TABLE IF EXISTS blob_results");
    db.exec(`PRAGMA user_version = ${schemaVersion}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS blob_results (
      collector TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      blob_sha TEXT NOT NULL,
      result TEXT NOT NULL,
      PRIMARY KEY (collector, cache_key, blob_sha)
    )
  `);
  const selectOne = db.prepare(
    "SELECT result FROM blob_results WHERE collector = ? AND cache_key = ? AND blob_sha = ?",
  );
  const insertOne = db.prepare(
    "INSERT OR REPLACE INTO blob_results (collector, cache_key, blob_sha, result) VALUES (?, ?, ?, ?)",
  );

  const cache: BlobCache = {
    getMany: (collector, cacheKey, blobShas) => {
      const results = new Map<string, string>();
      for (const blobSha of blobShas) {
        const row = selectOne.get(collector, cacheKey, blobSha);
        const result =
          row && typeof row["result"] === "string" ? row["result"] : undefined;
        if (result !== undefined) {
          results.set(blobSha, result);
        }
      }
      return results;
    },
    setMany: (collector, cacheKey, entries) => {
      if (entries.size === 0) {
        return;
      }
      db.exec("BEGIN");
      try {
        for (const [blobSha, result] of entries) {
          insertOne.run(collector, cacheKey, blobSha, result);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  openCaches.set(repoRoot, cache);
  return cache;
};
