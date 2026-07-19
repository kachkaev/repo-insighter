# Prior art: git-history analytics tools

_Research date: 2026-07-19. All GitHub/npm dates were verified against the registries and the GitHub API on that day._

This document surveys existing tools that analyze git repository history and assesses how closely each matches the repo-insighter vision: an npx-runnable TypeScript CLI that walks history map-reduce style, runs pluggable collectors per commit, stores raw snapshots in a local catalog, indexes them into a queryable metrics cube and feeds visualizations and AI exploration.

## Verdict

**Nothing reaches even ~60% of the vision.** The landscape splits into:

- **git-log statistics parsers** (gitstats lineage, gilot, git-quick-stats) — never look at file contents per commit;
- **fixed-analysis engines** (hercules, code-maat, git-of-theseus) — no arbitrary-tool execution, no queryable store;
- **visualizers** (Gource, git-truck, CodeCharta) — no open metrics cube;
- **server platforms** (Apache DevLake, GrimoireLab, commercial SEI SaaS) — neither local-first nor npx-runnable;
- **tiny "run cloc/tokei per commit and plot it" scripts** — all dormant, none extensible.

The two closest architectural ancestors (hercules, MergeStat) are both unmaintained. No Effect-based tool in this space exists at all. The niche is open.

## Name collision on npm

`repo-insights` was claimed on npm on 2026-02-22 by [uncazzy/repo-insights](https://github.com/uncazzy/repo-insights) — "zero-config git repository analytics" producing a self-contained HTML report via `npx repo-insights`. It is a real (not squatted) but dormant tool: one 0.1.0 release, ~1 download/week, ~1,100 lines of plain JS parsing `git log` metadata. No per-commit tool execution, no store, no plugins (match score vs our vision: ~30/100).

Free alternatives checked the same day: `repo-insight`, `repo-metrics`, `repoinsights` (all 404), or a scoped `@kachkaev/repo-insights`. `git-insights` and `repo-stats` are taken by abandoned placeholders. npm's dispute policy generally will not transfer a name from an actively published, on-topic package. See [open questions](../specs/06-open-questions.md).

## Closest matches (ranked)

| Score | Tool                                                           | What it is                                                                                                                      | Why it falls short                                                                                                   |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 55    | [hercules](https://github.com/src-d/hercules) + labours        | Go DAG of analyses over full history (burndown, ownership, couples), plugin system, YAML/protobuf out, matplotlib charts        | Dead upstream (last commit 2022-11, release 2020-01); built-in analyzers only, no queryable store, no incrementality |
| 50    | [git-truck](https://github.com/git-truck/git-truck)            | TypeScript, `npx git-truck`, local web app: treemap of authorship/churn/truck-factor, caches analysis. Active (v4.0.0, 2026-05) | Fixed analyses, no plugins, no metrics cube, no SQL/AI querying. Best UX reference                                   |
| 45    | [mergestat-lite](https://github.com/mergestat/mergestat-lite)  | SQL over git via SQLite virtual tables (commits, stats, blame)                                                                  | Abandoned (2024-03); metadata only, never executes tools per commit, no charts. Schema is instructive                |
| 45    | [code-forensics](https://github.com/smontanari/code-forensics) | Node CLI over code-maat: hotspots, complexity trends (does check out revisions), local D3 reports                               | Abandoned 2021, gulp-era, JVM dependency, no cube                                                                    |
| 40    | [CodeCharta](https://github.com/MaibornWolff/codecharta)       | Active TS: merges metrics from tokei/sonar/git-log/code-maat into one `cc.json` → 3D city map                                   | Per-snapshot, not a time series; no per-commit pipeline                                                              |

## Other notable tools

- **[code-maat](https://github.com/adamtornhill/code-maat)** (35) — Adam Tornhill's behavioral analyses (churn, coupling, ownership, hotspots); log-parsing only, Clojure, CSV. A catalog of analyses worth reimplementing.
- **[EnricoPicci/git-metrics](https://github.com/EnricoPicci/git-metrics)** (40) — TypeScript npx CLI running cloc across checkouts/commits; CSV out, dormant, near-zero adoption. Proof-of-concept of one slice of the vision (RxJS where we would use Effect).
- **[git-of-theseus](https://github.com/erikbern/git-of-theseus)** (35) — line-cohort survival; its commit sampling and two-phase analyze/plot split is a miniature of our architecture.
- **[simonw/git-history](https://github.com/simonw/git-history)** (40) — per-commit versions of data files into SQLite for Datasette exploration; cleanest existing "snapshots → SQLite → explore" example, but aimed at data files, not code metrics.
- **[PyDriller](https://github.com/ishepard/pydriller)** (30) — active Python framework for iterating commits/diffs; API-design reference, not a product.
- **[Apache DevLake](https://github.com/apache/devlake)** (35) — active ASF platform: pluggable collectors → normalized metrics DB → Grafana; Docker-deployed team server, not a local CLI. Schema inspiration.
- **[git-loc](https://lib.rs/crates/git-loc)** (35) — Rust; tokei counts per commit _without checkouts_ (reads blobs, caches per-blob results). The caching trick is worth stealing.
- **[jdrouet/git-metrics](https://github.com/jdrouet/git-metrics)** (30) — active Rust; stores user-defined metrics in git notes, CI-oriented, forward-tracking only. Git-notes publishing is an interesting optional output.
- **Sourcegraph Code Insights** (35) — strongest conceptual precedent ("run a computation over historical commits, compress the backfill, chart the series") but enterprise server-side and de-emphasized.
- **GrimoireLab/Augur (CHAOSS)** (30), **gitstats/git_stats/gitinspector/gilot/git-quick-stats** (25), **Gource** (15), **onefetch** (15) — different scale, scope or era.
- **Commercial**: CodeScene (40 — highest goal overlap, opposite form factor), GitClear (25), LinearB (20), Code Climate Velocity (shut down 2024-03).

## Ideas to borrow

- **Engines to embed as collectors**: `tokei` or `scc` (active; scc adds complexity/COCOMO, clean JSON) for language/LOC; `cloc --git --diff`; ESLint `--format json`; code-maat-style analyses reimplemented from `git log --numstat`.
- **Performance** (hercules, git-loc): avoid full worktree checkouts when a tool can run on blobs/trees read from the object database; cache per-blob results so identical blobs across commits are counted once. Reserve real checkouts (`git worktree` in a temp dir) for filesystem-dependent tools like ESLint.
- **Sampling** (git-of-theseus, Sourcegraph): sample commits by time interval and interpolate rather than analyzing every commit.
- **Storage patterns**: mergestat-lite's SQLite schema for git entities; simonw/git-history's per-commit-versioned rows; DevLake's normalized dimension schema.
- **UX** (git-truck): `npx -y` instant start, cache on first run; labours' "analyze once, plot many" split; CodeCharta's merge-many-tools-into-one-model file format.
- **Multi-repo rollups** (hercules) and git-notes metric publishing (jdrouet/git-metrics) as future options.

## Stack notes (verified 2026-07-19)

- `effect@beta` = **4.0.0-beta.99** (2026-07-17, near-weekly releases; effect-smol repo merged into Effect-TS/effect, main branch is now v4). No stable date announced.
- **`@effect/cli` is v3-only.** In v4 the CLI is merged into core as `effect/unstable/cli` (`Command`, `Flag`, `Argument`, `Prompt`, wizard mode, completions). Everything under `unstable/` may break between betas — pin exact versions, keep `effect` and `@effect/platform-node` on the same beta N.
- **SQLite**: `@effect/sql-sqlite-node@beta` is built on Node's built-in `node:sqlite` (no native/node-gyp dependency — good for npx) and plugs into the driver-agnostic `effect/unstable/sql` interfaces. Requires a Node version with `node:sqlite` available; `@effect/sql-libsql` exists as an alternative.
