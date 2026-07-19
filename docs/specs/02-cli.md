# CLI surface

_Draft. Only `scan` exists today, as a placeholder._

## Commands

```sh
npx repo-insighter scan [--repo [--collectors a,b] [--sample < path > ] < policy > ]
npx repo-insighter index [--repo < path > ]
npx repo-insighter status [--repo < path > ]
npx repo-insighter report [--repo [--open] < path > ]
npx repo-insighter query [--repo "<sql or dsl>" < path > ]
```

- **`scan`** — the map phase. Enumerates commits, decides which (commit, collector) pairs still need work, runs collectors and fills the catalog with raw snapshots. Safe to interrupt and re-run; shows progress and an ETA. Flags to scope work: `--collectors`, `--sample` (see [collectors](04-collectors.md)), `--since`, `--max-commits`.
- **`index`** — the reduce phase. Normalizes raw snapshots into the SQLite cube. Fast, idempotent, re-runnable from scratch (`--rebuild`) since raw data is the source of truth.
- **`status`** — inspects the catalog: which collectors have run over which commit ranges, catalog size, index freshness. The "where am I?" command for the multi-step workflow.
- **`report`** — generates human-facing output from the cube (initial idea: a self-contained HTML file with charts, à la git-truck/gitstats; format TBD, see open questions).
- **`query`** — escape hatch: run a query against the cube and print rows (also the likely seam for AI/MCP integration later).

A future `repo-insighter` with no arguments could run `scan` + `index` + `report` in sequence — the zero-config happy path.

## Conventions

- `--repo` defaults to the current directory; the repo root is resolved via `git rev-parse --show-toplevel`.
- All commands are non-interactive by default and safe to run in scripts; anything destructive (e.g. `--rebuild`) is explicit.
- Structured output (`--json`) for machine consumption where it makes sense.
- Exit code 0 on success, 1 on user-facing errors (not a repo, git missing), with messages on stderr.

## Implementation notes

- Commands are defined with `effect/unstable/cli` (`Command.make` + `Flag`), one file per command under `src/commands/`, mirroring the s20-wifi-setup bootstrap.
- Command handlers stay thin; the real logic lives in `src/lib/` so it can be unit-tested without spawning the CLI.
