---
"repo-dive": patch
---

Teach `gc` to reclaim the two kinds of dead weight it could not reach before: the per-blob cache, and tree snapshots taken off HEAD's first-parent chain.

- **`gc --stale` now prunes the blob cache** (`.repo-dive/cache/blob-cache.sqlite`) as well as the catalog. Cached per-blob results are namespaced by `(collector, fingerprint)`, and that pair is exactly what a lookup keys on — so once a collector's version or the config it depends on changes, every entry under the old fingerprint is unreachable by construction and can go. Entries under a fingerprint some registered collector still computes are always kept, so this never costs a re-scan of live data. The file is `VACUUM`ed afterwards, and `gc` reports how much it shrank by.
- **`gc --off-mainline` removes snapshots that the cube already ignores.** Since 0.4.1, `tree` and `worktree` collectors only ever run on HEAD's first-parent chain, but catalogs written by earlier versions are full of snapshots stored under commits that sit on side branches or arrived through an unrelated-histories merge. `--unreachable` could not clear them — those commits are still perfectly reachable from HEAD — so on a repo like react roughly 27k outputs had no way out. The new flag drops them, and only them: `log` outputs (commit metadata, churn) are left alone at every commit, because a commit's own authorship and diff are facts wherever it sits in the graph.

Both are separate, explicit flags rather than a widening of `--unreachable`, whose established meaning is "the commit itself is gone". Running `gc` with no flags still lists everything it found and asks, and `--dry-run` reports the full plan without touching anything.
