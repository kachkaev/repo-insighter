# Specs

Design documents for repo-insighter. Everything here is a **working draft**: the project is at the specification stage and these documents are the primary deliverable right now. Confirmed decisions are marked as such; everything else is a best guess open for debate.

1.  [Overview](01-overview.md) — vision, principles, non-goals
1.  [CLI surface](02-cli.md) — commands and user workflow
1.  [Catalog](03-catalog.md) — the on-disk layout of derived data inside an analyzed repo
1.  [Collectors](04-collectors.md) — the plugin model and the map phase
1.  [Metrics cube](05-metrics-cube.md) — the indexed store and the reduce phase
1.  [Open questions](06-open-questions.md) — decisions still to make

Confirmed so far:

- TypeScript + Effect v4 (beta) with `effect/unstable/cli`; bootstrap copied from [kachkaev/s20-wifi-setup](https://github.com/kachkaev/s20-wifi-setup)
- Distributed as an npx-runnable npm CLI; single package for now
- SQLite as the first index backend
- BSD 3-Clause license
- Multi-step, resumable derivation: collect raw per-commit snapshots first, index them second, explore third

See also [prior-art research](../research/prior-art.md) for the landscape this design responds to.
