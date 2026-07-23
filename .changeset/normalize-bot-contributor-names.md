---
"repo-dive": patch
---

Drop the redundant `[bot]` suffix from auto-derived contributor names. Bots and AI agents already carry a kind badge (🤖 / ✨) in the dashboard, so a name like `🤖 renovate[bot]` labelled the same thing twice. Names are now tidied when derived: the trailing `[bot]` is stripped and the leading letter capitalized, so Renovate shows as `🤖 Renovate` and Dependabot as `🤖 Dependabot`.

Only auto-derived names change — an explicit `displayName` in your config is still used verbatim. Existing catalogs heal on the next `repo-dive index` (no re-scan needed).
