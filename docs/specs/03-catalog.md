# Catalog

_Draft. The catalog is the on-disk home of everything repo-insighter derives from a repository._

## Location

A dot-folder at the root of the analyzed repository:

```text
<repo>/.repo-insighter/
```

- Lives inside the repo so that the derived data travels with the working copy and is trivially discoverable, but is **never committed**: `scan` offers to append `/.repo-insighter/` to `.gitignore` (or writes `.repo-insighter/.gitignore` containing `*` so the catalog self-ignores — leaning toward the latter, zero-touch option).
- Folder name is a working title, like the package name (see [open questions](06-open-questions.md)). An `--out` flag and an environment variable will allow relocation (e.g. to an external disk for huge repos).

## Layout

```text
.repo-insighter/
  .gitignore              # "*" — the catalog ignores itself
  catalog.json            # manifest: format version, tool version, vcs ("git"), repo identity, config
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
  index/
    metrics.sqlite        # the queryable cube (rebuildable from commits/)
  logs/                   # per-run logs (rotation TBD)
```

## Design notes

- **Per-commit, per-collector folders** make the catalog greppable and debuggable by hand — a design goal in itself. Raw outputs are the source of truth; everything under `index/` can be deleted and rebuilt.
- **`collector.json` sidecar** records the collector version and a `cacheKey` — a short fingerprint (sha256, 12 hex) over the version and the slice of config the collector depends on (`Collector.cacheConfig`). This is what makes incrementality and cache invalidation possible: a (commit, collector) pair whose sidecar carries the current `cacheKey` is done. Bumping a collector's version or changing the config it depends on changes the fingerprint and invalidates only that collector's outputs; config that only affects `normalize` is deliberately excluded, since `index` re-normalizes every time. The same `cacheKey` namespaces the per-blob cache, so it invalidates in lockstep.
- **Sharding**: repos with 100k+ commits would strain some filesystems with flat `commits/<sha>/`. If that bites, shard as `commits/ab/<sha>/` (first byte of sha) — decision deferred until measured.
- **Deduplication**: distinct commits often share identical trees or blobs. Tree-level content addressing (store per-tree collector outputs under `trees/<tree-sha>/`, referenced from commits) can save large amounts of work and space — borrowed from hercules/git-loc blob caching. Planned as an optimization once the naive layout works; `collector.json` input hashes leave room for it.
- **Format versioning**: `catalog.json` carries a `formatVersion`; incompatible changes trigger an explicit migrate-or-recollect prompt rather than silent corruption.
- **Concurrency**: a lock file in the catalog prevents two concurrent `scan` runs from interleaving writes (mechanism TBD).
