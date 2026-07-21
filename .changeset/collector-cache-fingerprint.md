---
"repo-insighter": patch
---

Key each collector's cached output by a **fingerprint** instead of its bare version. The fingerprint is a short hash (sha256, 12 hex) of the collector's `version` and the slice of config it declares a dependency on via the new optional `Collector.cacheConfig`. It is written into the `collector.json` sidecar and used as the per-blob cache namespace, so a collector re-collects whenever its version is bumped **or** the config it depends on changes — and only that collector re-collects. Config that solely affects `normalize` (contributor aliases, chart caps) is deliberately excluded, since `index` re-normalizes on every run.

This is a generic mechanism: collectors with no config dependency (all of them today) behave exactly as before — their fingerprint tracks the version alone. It closes the gap where the version-only key could not notice config changes, which was fine when config did not exist yet.

Upgrading resets the catalog's blob cache and sidecar keys, so the next `scan` re-collects everything once (cheap, resumable). No user-facing config changes.
