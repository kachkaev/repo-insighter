# repo-dive

Dive into a git repository's history: per-commit snapshots, an indexed metrics catalog and an interactive dashboard.

> **Still 0.x.** The pipeline works end to end and has been run against repositories with tens of thousands of commits, but interfaces, the catalog format and the collector roster still move between minor versions — pin the version if you script against it. Renamed from `repo-insighter` in 0.4.0.

## What it does

Point it at any git repository and get an explorable catalog of insights derived from its history:

```sh
cd /path/to/your/repo
npx repo-dive
```

One command runs the whole pipeline — scan, index, dashboard — and opens the results in your browser.

- **Map**: walk the repo's commits (all or sampled) and let pluggable collectors capture raw snapshots per commit — language/LOC breakdowns, author stats, lint diagnostics and more.
- **Reduce**: index those snapshots into a local metrics store shaped like a data cube — numbers at intersections of open-ended categories (author, language, date, lint rule, …).
- **Explore**: query the cube to draw charts, build presentations and ask AI questions about how the codebase evolved.

Everything is local-first, incremental and resumable: results live in a catalog folder inside the repo being analyzed and are refined over multiple runs.

See [docs/specs](docs/specs/README.md) for the architecture and [docs/research/prior-art.md](docs/research/prior-art.md) for a survey of existing tools and why none of them fills this niche.

## Usage

Run from inside the repository you want to analyze (or pass `--repo /path/to/repo`):

```sh
cd /path/to/your/repo
npx repo-dive            # the whole pipeline: scan + index + dashboard
npx repo-dive scan       # collect snapshots into .repo-dive/
npx repo-dive index      # roll up into the metrics cube + dashboard data
npx repo-dive dashboard  # serve the interactive dashboard
npx repo-dive status     # show catalog coverage
npx repo-dive collectors # list available collectors
npx repo-dive report     # export one shareable self-contained HTML file
npx repo-dive query "SELECT metric, sum(value) FROM facts GROUP BY metric"
npx repo-dive mcp # serve the cube to AI agents (Model Context Protocol)
npx repo-dive gc  # clean up the catalog interactively
```

`scan` walks the repository's history and runs collectors against every commit (or a sample, per collector), writing raw snapshots into a `.repo-dive/` catalog inside the analyzed repo. It is resumable: re-running skips everything already collected, and bumping a collector's version invalidates only that collector's outputs. Checkout-based collectors use temporary detached worktrees — the analyzed repo's working tree is never touched. Collectors so far:

- **commit-meta** — identities, dates, parents, subject and trailers (incl. AI co-authors)
- **churn** — lines added/deleted per commit, by file extension
- **file-types** — file count and bytes per extension at each commit's tree
- **directives** — eslint-disable comments by rule (block disables tracked as gray areas) and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`
- **dependencies** — total resolved packages and direct/dev dependencies from package-manager lockfiles, per package manager (pnpm so far; version-aware and monorepo-aware)
- **todo-comments** — TODO/FIXME/HACK/XXX counts
- **languages** — tokei language/LOC breakdown (sampled monthly; markdown counted whole)
- **survival** — `git blame` line survival by extension, author and age cohort (sampled monthly)

`index` normalizes raw snapshots into `.repo-dive/index/metrics.sqlite` (a facts-by-categories cube, rebuildable at any time) plus `dashboard.json`, and `dashboard` serves a local React app with interactive charts: languages over time, monthly commits with AI-assisted share, churn, lint-suppression trends, dependency counts over time, code survival by cohort and author, and more.

## Configuration

Everything works with zero config. To refine it, drop a `repo-dive.config.ts` at the root of the repository you analyze (`.mjs`/`.js` also work):

```ts
import { defineConfig } from "repo-dive/config";

export default defineConfig({
  contributors: {
    aliases: [
      // Shorthand: emails only, the first is canonical.
      ["alice@work.example", "alice@personal.example"],
      // Rich form: a display name, a profile link and an explicit kind.
      {
        displayName: "Bob",
        emails: ["bob@work.example", "12345+bob@users.noreply.github.com"],
        url: "https://github.com/bob",
      },
    ],
    // How many contributors charts keep before folding the rest into "Other" (default 10).
    maxInCharts: 10,
  },
});
```

`contributors.aliases` merges the multiple identities one person commits under (work + personal email, GitHub noreply, name variants) so attribution, the contributors table and code-survival-by-contributor count them once; a group can also carry a `displayName`, a profile `url` and a `kind` (`human`/`bot`/`ai`, otherwise auto-derived — the dashboard badges bots and AI agents and lists them apart from humans). The config is read by `index`. See [docs/specs/07-config.md](docs/specs/07-config.md) for details.

## Development

The project is written in TypeScript with [Effect](https://effect.website) v4 (beta) and its built-in CLI toolkit (`effect/unstable/cli`).

```sh
pnpm install
pnpm test
pnpm lint
pnpm fix
```

## Acknowledgements

Thanks to [@WillJack20](https://github.com/WillJack20) for suggesting the name **repo-dive**.

## License

[BSD 3-Clause](LICENSE.md)
