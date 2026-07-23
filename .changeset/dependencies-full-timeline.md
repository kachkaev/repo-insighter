---
"repo-dive": patch
---

Show the dependencies chart against the repo's full timeline, and tell "no dependencies" apart from "not scanned".

The "Dependencies over time" chart used to begin at the first commit that carried a lockfile — often long after the repository started — because a commit only produced a dependency fact once a parseable lockfile existed in its tree. The chart now shares the repo's full timeline like every other time-series chart: its axis starts at the first commit and the area begins where the first lockfile appears, an honest step up rather than a chart that looks like the project itself began mid-history.

The hover crosshair now tracks the cursor across the whole axis instead of snapping to the nearest data point, so the empty early stretch is inspectable too. A genuinely unscanned instant reads "No data"; a commit that was scanned and simply had no lockfile reads "No lockfile". To make that distinction real rather than assumed, the dependencies collector now records a `dependencies.scanned` marker for a scanned tree that holds no lockfile, so indexing can keep those commits as explicit zeros. The collector version is bumped, so run `scan` again to backfill the pre-lockfile commits.
