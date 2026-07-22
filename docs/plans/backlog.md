# Backlog

Known-important items not yet done, in rough priority order.

This file tracks **work**: things that are decided and just need doing. Decisions that are still open live in [specs/06-open-questions.md](../specs/06-open-questions.md); an item graduates from there to here once the design question behind it is settled. [config-file.md](config-file.md) is a shipped design note, kept for the reasoning rather than as a plan — the behavior it describes is documented in [specs/07-config.md](../specs/07-config.md).

## Product

- **README demo assets**: generate screenshots/report from a large public repo (e.g. facebook/react — a full scan takes ~1–2 h, dominated by quarterly blame snapshots; scan/index have been validated at that scale: 21.6k commits → 319k facts, index < 5 s).
- **Dashboard interactions**: time-range brush/filter; author/language filters; commit drill-down on chart hover.
- **MCP docs**: README shows the `mcp` command; add a `.mcp.json` example for wiring it into Claude Code / other agents.

## Engineering

- **Docs drift**: specs 03/04 don't yet document the blob cache (`.repo-dive/cache/blob-cache.sqlite`, content-addressed per-blob results) or `collectBatch`; sync them.
- **Perf, next lever**: tree collectors each run their own `ls-tree` per commit — share one listing per commit across collectors. After that, survival is the bottleneck; an incremental diff-based line-tracking algorithm (hercules-style burndown) would replace per-snapshot blame if quarterly sampling still feels coarse/slow.
- **gc**: blob cache is not covered by `gc` yet (only commits/ is); add cache pruning. Separately, snapshots taken off HEAD's first-parent chain by older versions are now excluded from the cube but cannot be reclaimed — `--unreachable` compares against `rev-list HEAD`, which still reaches them (27k such outputs on react). Wants a `--off-mainline` mode, or for `--unreachable` to drop tree/worktree collector folders that `rev-list --first-parent HEAD` misses.
- **Windows**: untested end to end (paths, `open` command, worktrees).
- **Effect v4 is beta**: `effect` and `@effect/platform-node` are pinned to `4.0.0-beta.x`, and the CLI is built on `effect/unstable/cli` — an import path that advertises its own instability. Both the beta line and that `unstable` namespace will move before v4 goes GA. Decide how much churn to absorb per beta bump versus holding on a known-good pin, and keep the CLI wiring thin enough that the `unstable` path can be swapped in one place.
- **Node support window**: three things disagree about which Node versions are supported — `engines` says `>=22.13.0`, `.tool-versions` pins `22.22.2`, and CI tests exactly that one version. Renovate has 22.23.1, 24 and 26 waiting on the dependency dashboard with nothing to say which of them the project actually intends to support. Pick the range, then decide whether CI matrixes across it or keeps testing a single version and relies on `engines` to fail fast.

## Housekeeping

- **History scrub**: old commit `7c3dcb3` on GitHub still contains a since-removed local config file with a machine-specific path; fully purging cached/unreachable commits requires a GitHub Support request (owner's call).
- **cspell is a no-op in git worktrees**: `cspell.config.ts` sets `useGitignore: true`, and cspell resolves the ignore root by looking for a `.git` **directory**. In a linked worktree `.git` is a file, so nothing resolves and `pnpm lint:cspell` reports `Files checked: 0` and exits 1 — a check that looks red for the wrong reason and silently proofreads nothing. CI clones normally and is unaffected, so this only bites local worktree-based work (including agents). Either drop `useGitignore` in favor of explicit `ignorePaths`, or pass the ignore root explicitly.
- **Release smoke test**: CI and the release workflow both run `node dist/cli.js --help` from the build tree, which proves the bundle works but not that the published tarball contains it. `files` ships `dist/` only, so a packaging mistake would surface as a broken `npx repo-dive` rather than as a red check. `npm pack` followed by an install-and-run in a temp dir would close that gap cheaply.
