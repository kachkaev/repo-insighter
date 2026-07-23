---
"repo-dive": patch
---

Fix duplicate-key warnings in the contributor bar lists. `BarList` keyed each row by its label, which is a contributor's display name — not unique, so aliases that collapse to the same name (e.g. two "Alex" entries) triggered React's "two children with the same key" console error. Rows now use an index-disambiguated key, which is stable for these static ranked lists. This covers the human-contributor, AI-identity and bots/AI-agent lists, since they all render through `BarList`.
