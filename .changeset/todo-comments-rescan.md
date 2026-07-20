---
"repo-insighter": patch
---

Fix the `todo-comments` collector reporting 0 TODO/FIXME/HACK/XXX comments in existing catalogs. An early build of the collector recorded zeros for every commit, and because the scan is resumable and its per-blob cache is version-keyed, those stale zeros survived every subsequent re-scan. Bumping the collector version invalidates the old outputs so the next `scan` re-collects them correctly (no `--force` needed). The marker matching itself was already correct — it counts markers wherever they appear on a line, including ones tucked after a `--` suppression rationale and inside JSX/block comments; regression tests now cover those shapes.
