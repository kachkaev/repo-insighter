---
"repo-dive": patch
---

pr: #38
commit: 57f238a235145415b221c20d89eb47b57689e270

Bring "Shade by year written" to the lines-by-language chart, mirroring the toggle the code-survival-by-contributor chart already had. The survival collector's raw snapshots always recorded each living line's extension and authoring cohort, so `index` now cross-tabulates them into a per-extension-per-year breakdown — existing catalogs pick it up on the next `repo-dive index`, no re-scan needed.

Because tokei snapshots carry no per-line age, shading switches the chart to the blame-based data: languages are approximated from file extensions (mapped to tokei's names), only scannable source files are counted, and the chart's subtitle changes to say so. Languages shared with the tokei view keep its colors, so toggling never recolors the stack. Composes with percent mode — the normalized, year-shaded view shows old cohorts thinning inside each language's share.
