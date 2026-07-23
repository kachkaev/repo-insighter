---
"repo-dive": patch
---

Actually stop the dashboard's stacked areas and bars from re-rendering while the cursor moves over a chart.

Enabling React Compiler alone did not deliver this: the compiler silently bailed (its `panicThreshold` defaults to `"none"`) on the three components that use a default value in a typed destructured parameter or the `??=` operator — including the main time-series chart — leaving them with no memoization after their `useMemo`s had been removed.
Those patterns are rewritten so every dashboard component now compiles.

Even compiled, the shapes still reconciled on every mouse move because they shared a parent with the hover crosshair.
The static marks (grid, areas, bars, lines, dots) are now their own `ChartMarks` component whose props exclude hover state, so the compiler memoizes it and hovering only updates the crosshair and tooltip.
No visible change.
