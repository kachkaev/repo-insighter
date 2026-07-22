# Catalog

_Draft. The catalog is the on-disk home of everything repo-dive derives from a repository._

## Location

A dot-folder at the root of the analyzed repository:

```text
<repo>/.repo-dive/
```

- Lives inside the repo so that the derived data travels with the working copy and is trivially discoverable, but is **never committed**: the catalog self-ignores. Creating it writes `.repo-dive/.gitignore` containing `*`, so the analyzed repo's own `.gitignore` is left untouched (the zero-touch option, chosen over appending `/.repo-dive/` to it).
- Folder name follows the package name, settled as `repo-dive` (see [open questions](06-open-questions.md#naming)); a catalog left by the former name, `.repo-insighter/`, is detected and reported rather than silently ignored. Relocation (an `--out` flag or an environment variable, e.g. to put a huge repo's catalog on an external disk) is not implemented — the catalog always sits at the repo root.

## Layout

```text
.repo-dive/
  .gitignore              # "*" — the catalog ignores itself
  catalog.json            # manifest: formatVersion, vcs ("git"), createdAt
  commits/
    <full-sha>/
      commit-meta/        # one subfolder per collector
        output.json       # the collector's raw output, stored verbatim
        collector.json    # sidecar: collector name+version, cacheKey fingerprint, timing (the incrementality marker)
      churn/
        output.json
        collector.json
      file-types/
        output.json
        collector.json
  cache/
    blob-cache.sqlite     # content-addressed per-blob collector results (see below)
  index/
    metrics.sqlite        # the queryable cube (rebuildable from commits/)
    dashboard.json        # pre-shaped data the dashboard and report read
  logs/                   # per-run logs (planned; nothing writes here yet)
```

## Blob cache

`cache/blob-cache.sqlite` holds **per-blob collector results, content-addressed by the blob's git object id**. It exists because a file's content usually outlives the commits it appears in: a source file untouched for two years has the same blob sha in every commit of that range, so anything derived from its bytes alone is worth computing once rather than once per commit. It is an accelerator, not data — deleting it at any time costs only recomputation.

Schema (one table, WAL journal mode):

```sql
CREATE TABLE blob_results (
  collector TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  blob_sha  TEXT NOT NULL,
  result    TEXT NOT NULL,          -- the collector's per-file result, JSON-encoded
  PRIMARY KEY (collector, cache_key, blob_sha)
);
```

- **Keying.** A row is identified by collector name, cache fingerprint and blob sha. The fingerprint is the very same `cacheKey` written into `collector.json` (see the design notes below), so the cache is namespaced per (collector version, relevant config) and invalidates in lockstep with per-commit outputs: bumping a collector's version or changing the config it depends on moves it to a fresh namespace, and the previous namespace's rows simply stop being read.
- **Who writes it.** Only content-scanning `tree` collectors, through two shared helpers: `scanTreeWithBlobCache` (whole source tree, 2 MiB blob cap — used by `directives` and `todo-comments`) and `scanTreeFilesWithBlobCache` (path-selected files, 32 MiB cap — used by `dependencies` for lockfiles). Both take the fingerprint from the `cacheKey` on their collect context, so a collector never invents its own namespace.
- **Three levels.** A lookup checks an in-process memo of already-parsed results first, then this table, and only then reads the blobs nobody has seen — all missing blobs of a commit in a single `git cat-file --batch`. The memo is bounded and cleared wholesale when it overflows.
- **Schema versioning.** `PRAGMA user_version` records the table shape. On a mismatch `blob_results` is dropped and recreated rather than migrated: every row is derived from content that is still in the object database.
- **Not garbage-collected.** `gc` operates on `commits/` only; nothing prunes `blob_results`, so rows of superseded fingerprints and of blobs no longer reachable accumulate. Removing `cache/` by hand is safe and the only cleanup available today.

See [collectors](04-collectors.md#content-caching) for how a collector opts into this.

## Design notes

- **Per-commit, per-collector folders** make the catalog greppable and debuggable by hand — a design goal in itself. Raw outputs are the source of truth; everything under `index/` can be deleted and rebuilt.
- **`collector.json` sidecar** records the collector version and a `cacheKey` — a short fingerprint (sha256, 12 hex) over the version and the slice of config the collector depends on (`Collector.cacheConfig`). This is what makes incrementality and cache invalidation possible: a (commit, collector) pair whose sidecar carries the current `cacheKey` is done. Bumping a collector's version or changing the config it depends on changes the fingerprint and invalidates only that collector's outputs; config that only affects `normalize` is deliberately excluded, since `index` re-normalizes every time. The same `cacheKey` namespaces the [blob cache](#blob-cache), so it invalidates in lockstep.
- **Sharding**: repos with 100k+ commits would strain some filesystems with flat `commits/<sha>/`. If that bites, shard as `commits/ab/<sha>/` (first byte of sha) — decision deferred until measured.
- **Deduplication**: distinct commits often share identical trees or blobs. The blob level of this is done — content-scanning collectors compute per blob and cache the result (borrowed from hercules/git-loc blob caching). Tree-level content addressing (store per-tree collector outputs under `trees/<tree-sha>/`, referenced from commits) would extend the saving to the catalog's own footprint; still an optimization for later, and `collector.json` leaves room for it.
- **Format versioning**: `catalog.json` carries a `formatVersion`; a catalog written by an incompatible version is refused with a message naming both versions, rather than read as if it were current. Migration is not implemented — the message tells the user to delete the folder and re-collect. A catalog left by the tool's former name (`.repo-insighter/`) is detected in the same spot and reported with the `mv` that preserves it.
- **Concurrency**: nothing guards against two concurrent `scan` runs interleaving writes today. A lock file in the catalog is the intended fix (mechanism TBD).
- **Reclaiming space**: `gc` is the only thing that deletes from the catalog, and it deletes only what can be proven dead — commit folders git can no longer reach, tree snapshots stored off HEAD's first-parent chain, and outputs (plus the blob-cache entries beside them) whose `cacheKey` no longer matches any registered collector. Everything it removes can be produced again by a re-`scan`, so a mistaken `gc` costs time rather than data. See [the CLI surface](02-cli.md) for the flags.
