---
"repo-dive": patch
---

Enable React Compiler in the dashboard so chart hover no longer re-renders the
stacked areas and bars.

The dashboard's Vite build now runs React Compiler (via `@vitejs/plugin-react`'s
`reactCompilerPreset`), which auto-memoizes components. Moving the cursor across a
time-series or diverging-bar chart now updates only the crosshair and tooltip; the
area, bar and line shapes underneath stay put instead of being reconciled on every
mouse move. Manual `useMemo` calls in the charts and dashboard were removed since
the compiler covers them. Existing dashboards render identically — nothing to
re-scan.
