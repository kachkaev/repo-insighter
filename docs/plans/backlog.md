# Backlog

Known-important items not yet done, in rough priority order.

Items here are changes worth making; [specs/06-open-questions.md](../specs/06-open-questions.md) holds the questions whose answers are not settled, and an item tends to move from there to here once one is.
The split is a soft one — several entries below still name two possible approaches.
[config-file.md](config-file.md) is a shipped design note kept for its reasoning rather than as a plan; the behavior it describes is documented in [specs/07-config.md](../specs/07-config.md).

## Product

- **README demo assets**: generate screenshots/report from a large public repo (e.g. facebook/react — a full scan takes ~1–2 h, dominated by quarterly blame snapshots; scan/index have been validated at that scale: 21.6k commits → 319k facts, index < 5 s).
- **Dashboard interactions**: time-range brush/filter; author/language filters; commit drill-down on chart hover.
- **Undocumented `tokei` prerequisite**: the `languages` collector shells out to `tokei` and fails with an install hint if it is missing, but nothing tells you that before you start. The README's usage section presents `npx repo-dive` as the whole story and mentions tokei only in passing, inside the collector list. On a clean machine the first run gets some way into a scan and then stops. Either say so up front, or let the collector skip itself with a warning — see the related open question in [specs/06-open-questions.md](../specs/06-open-questions.md) about a graceful fallback.

## Engineering

- **Perf, next lever**: tree collectors each run their own `ls-tree` per commit — share one listing per commit across collectors. After that, survival is the bottleneck; an incremental diff-based line-tracking algorithm (hercules-style burndown) would replace per-snapshot blame if quarterly sampling still feels coarse/slow.
- **Windows**: untested end to end (paths, `open` command, worktrees).
- **Effect v4 is beta**: `effect` and `@effect/platform-node` are pinned to `4.0.0-beta.x`, and the CLI is built on `effect/unstable/cli` — an import path that advertises its own instability. Both the beta line and that `unstable` namespace will move before v4 goes GA. Decide how much churn to absorb per beta bump versus holding on a known-good pin, and keep the CLI wiring thin enough that the `unstable` path can be swapped in one place.
- **MCP protocol rough edges**: two things in `src/lib/mcp.ts` that strict clients may not tolerate. The zero-argument `schema` tool is declared with `Schema.Struct({})`, which `effect/unstable/ai` advertises as `{"anyOf":[{"type":"object"},{"type":"array"}]}` rather than a plain `{"type":"object"}` — `query`, which has real parameters, serializes fine. And tool failures come back as `Effect.succeed({ error: message })`, so the client sees a successful result carrying an `error` field instead of an MCP error. Both work with the clients tried so far; neither is what the protocol expects.
- **Node support window**: three things disagree about which Node versions are supported — `engines` says `>=22.13.0`, `.tool-versions` pins `22.22.2`, and CI tests exactly that one version. Renovate has 22.23.1, 24 and 26 waiting on the dependency dashboard with nothing to say which of them the project actually intends to support. Pick the range, then decide whether CI matrixes across it or keeps testing a single version and relies on `engines` to fail fast.

## Housekeeping

- **History scrub**: old commit `7c3dcb3` on GitHub still contains a since-removed local config file with a machine-specific path; fully purging cached/unreachable commits requires a GitHub Support request (owner's call).
- **cspell is a no-op in worktrees under `.claude/`**: `.gitignore` excludes `/.claude/`, agent worktrees are created at `.claude/worktrees/<name>/`, and `cspell.config.ts` sets `useGitignore: true` — so every file in such a worktree is inside an ignored path and cspell checks none of them. `pnpm lint:cspell` reports `Files checked: 0` and exits 1, which reads as a failing check while in fact proofreading nothing; typos then sail through local review and only surface in CI, which clones normally. Either drop `useGitignore` in favor of the explicit `ignorePaths` list that is already there, or keep worktrees outside the ignored directory.
- **Release smoke test**: CI and the release workflow both run `node dist/cli.js --help` from the build tree, which proves the bundle works but not that the published tarball contains it. `files` ships `dist/` only, so a packaging mistake would surface as a broken `npx repo-dive` rather than as a red check. `npm pack` followed by an install-and-run in a temp dir would close that gap cheaply.
