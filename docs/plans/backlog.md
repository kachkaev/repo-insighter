# Backlog

Known-important items not yet done, in rough priority order. See also [specs/06-open-questions.md](../specs/06-open-questions.md) and [config-file.md](config-file.md) (the next planned feature).

## Product

- **`repodive` placeholder**: publish the undashed name on npm as a no-dependency stub whose bin points at `repo-dive`, then `npm deprecate` it. Holds the name; deliberately not worth a monorepo.
- **README demo assets**: generate screenshots/report from a large public repo (e.g. facebook/react — a full scan takes ~1–2 h, dominated by quarterly blame snapshots; scan/index have been validated at that scale: 21.6k commits → 319k facts, index < 5 s).
- **Dashboard interactions**: time-range brush/filter; author/language filters; commit drill-down on chart hover.
- **MCP docs**: README shows the `mcp` command; add a `.mcp.json` example for wiring it into Claude Code / other agents.

## Engineering

- **Docs drift**: specs 03/04 don't yet document the blob cache (`.repo-dive/cache/blob-cache.sqlite`, content-addressed per-blob results) or `collectBatch`; sync them.
- **Perf, next lever**: tree collectors each run their own `ls-tree` per commit — share one listing per commit across collectors. After that, survival is the bottleneck; an incremental diff-based line-tracking algorithm (hercules-style burndown) would replace per-snapshot blame if quarterly sampling still feels coarse/slow.
- **`status` command**: shows sampled collectors as `n/total-commits`, which reads as incomplete; report against each collector's sampled target instead.
- **gc**: blob cache is not covered by `gc` yet (only commits/ is); add cache pruning.
- **Windows**: untested end to end (paths, `open` command, worktrees).

## Housekeeping

- **History scrub**: old commit `7c3dcb3` on GitHub still contains a since-removed local config file with a machine-specific path; fully purging cached/unreachable commits requires a GitHub Support request (owner's call).
