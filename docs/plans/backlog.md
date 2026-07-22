# Backlog

Known-important items not yet done, in rough priority order. See also [specs/06-open-questions.md](../specs/06-open-questions.md) and [config-file.md](config-file.md) (the next planned feature).

## Product

- **README demo assets**: generate screenshots/report from a large public repo (e.g. facebook/react — a full scan takes ~1–2 h, dominated by quarterly blame snapshots; scan/index have been validated at that scale: 21.6k commits → 319k facts, index < 5 s).
- **Dashboard interactions**: time-range brush/filter; author/language filters; commit drill-down on chart hover.

## Engineering

- **Perf, next lever**: tree collectors each run their own `ls-tree` per commit — share one listing per commit across collectors. After that, survival is the bottleneck; an incremental diff-based line-tracking algorithm (hercules-style burndown) would replace per-snapshot blame if quarterly sampling still feels coarse/slow.
- **gc**: blob cache is not covered by `gc` yet (only commits/ is); add cache pruning. Separately, snapshots taken off HEAD's first-parent chain by older versions are now excluded from the cube but cannot be reclaimed — `--unreachable` compares against `rev-list HEAD`, which still reaches them (27k such outputs on react). Wants a `--off-mainline` mode, or for `--unreachable` to drop tree/worktree collector folders that `rev-list --first-parent HEAD` misses.
- **Windows**: untested end to end (paths, `open` command, worktrees).

## Housekeeping

- **History scrub**: old commit `7c3dcb3` on GitHub still contains a since-removed local config file with a machine-specific path; fully purging cached/unreachable commits requires a GitHub Support request (owner's call).
