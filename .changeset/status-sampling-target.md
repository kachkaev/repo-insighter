---
"repo-dive": patch
---

Report `status` progress against each collector's sampling target rather than the repository's full commit count. Sampled collectors previously looked barely started once a repo grew — a monthly collector that had captured everything it will ever capture still read as `languages: 1/45 commits collected`. It now reads `languages: 1/1 commits collected (monthly sample of 45)`, so a complete collector looks complete and the policy behind the smaller target is visible.
