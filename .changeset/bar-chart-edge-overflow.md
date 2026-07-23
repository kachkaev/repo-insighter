---
"repo-dive": patch
---

Keep bar-chart bars inside the plot area. Bars are centred on their data point, so with the first and last points pinned to the chart edges the outermost bars spilled halfway past the left and right sides. Bar charts now inset the time scale by half a bucket slot, so every bar sits fully within the plot while areas and lines — which want their points on the edges — keep the full width. The commits-per-month and churn-per-month charts are the ones affected.

The inset lives on the shared x scale, so any marks overlaid on a bar chart later (e.g. a trend line) line up with the bars automatically.
