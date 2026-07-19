# repo-insighter

Derive insights from a git repository's history: per-commit snapshots, an indexed metrics catalog and material for visualizations.

> **Status: early development.** The project is at the specification and scaffolding stage. The architecture is being designed in [docs/specs](docs/specs/README.md) and the CLI currently exposes a single placeholder command. Nothing is published to npm yet.

## Vision

Run one command against any git repository and get an explorable catalog of insights derived from its history:

```sh
npx repo-insighter scan
```

- **Map**: walk the repo's commits (all or sampled) and let pluggable collectors capture raw snapshots per commit — language/LOC breakdowns, author stats, lint diagnostics and more.
- **Reduce**: index those snapshots into a local metrics store shaped like a data cube — numbers at intersections of open-ended categories (author, language, date, lint rule, …).
- **Explore**: query the cube to draw charts, build presentations and ask AI questions about how the codebase evolved.

Everything is local-first, incremental and resumable: results live in a catalog folder inside the repo being analyzed and are refined over multiple runs.

See [docs/specs](docs/specs/README.md) for the architecture being designed and [docs/research/prior-art.md](docs/research/prior-art.md) for a survey of existing tools and why none of them fills this niche.

## Current CLI

```sh
pnpm install
pnpm build
node dist/cli.js scan --repo /path/to/repo      # collect snapshots into .repo-insighter/
node dist/cli.js index --repo /path/to/repo     # roll up into the metrics cube + dashboard data
node dist/cli.js dashboard --repo /path/to/repo # serve the interactive dashboard
node dist/cli.js status --repo /path/to/repo    # show catalog coverage
node dist/cli.js collectors                     # list available collectors
node dist/cli.js gc --repo /path/to/repo        # clean up the catalog interactively
```

`scan` walks the repository's history and runs collectors against every commit (or a sample, per collector), writing raw snapshots into a `.repo-insighter/` catalog inside the analyzed repo. It is resumable: re-running skips everything already collected, and bumping a collector's version invalidates only that collector's outputs. Checkout-based collectors use temporary detached worktrees — the analyzed repo's working tree is never touched. Collectors so far:

- **commit-meta** — identities, dates, parents, subject and trailers (incl. AI co-authors)
- **churn** — lines added/deleted per commit, by file extension
- **file-types** — file count and bytes per extension at each commit's tree
- **directives** — eslint-disable comments by rule (block disables tracked as gray areas) and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`
- **todo-comments** — TODO/FIXME/HACK/XXX counts
- **languages** — tokei language/LOC breakdown (sampled monthly; markdown counted whole)
- **survival** — `git blame` line survival by extension, author and age cohort (sampled monthly)

`index` normalizes raw snapshots into `.repo-insighter/index/metrics.sqlite` (a facts-by-categories cube, rebuildable at any time) plus `dashboard.json`, and `dashboard` serves a local React app with interactive charts: languages over time, monthly commits with AI-assisted share, churn, lint-suppression trends, code survival by cohort and author, and more.

## Development

The project is written in TypeScript with [Effect](https://effect.website) v4 (beta) and its built-in CLI toolkit (`effect/unstable/cli`).

```sh
pnpm install
pnpm test
pnpm lint
pnpm fix
```

## License

[BSD 3-Clause](LICENSE.md)
