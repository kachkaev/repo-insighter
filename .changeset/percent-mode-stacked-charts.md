---
"repo-dive": patch
---

pr: #37
commit: cfc01d3239cd95ea917f4f1409d668c595c7619b

Add a percent mode to stacked time-series charts. Every stacked dashboard chart with more than one series — lines by language, dependencies over time, commits per month, both code-survival views — gains a `#`/`%` toggle next to its legend. Percent mode renormalizes each date to its total, turning the chart into a composition view where shifts in share stay readable even while absolute volume grows.

Tooltips on these charts now show the absolute value and the share side by side for every series, with the active mode's column emphasized. Line charts are unchanged — their series are not parts of a whole.
