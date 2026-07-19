# repo-insighter

## 0.0.1

### Patch Changes

- [`01b7976`](https://github.com/kachkaev/repo-insighter/commit/01b7976545431617225a94cde5e54cf1297db16a) Thanks [@kachkaev](https://github.com/kachkaev)! - `index` command (SQLite metrics cube + dashboard data) and `dashboard` command serving an interactive React/visx dashboard: languages over time, monthly commits with AI co-author share, churn, lint-suppression trends, top suppressed rules, code survival by cohort and author.

- [`d2a4782`](https://github.com/kachkaev/repo-insighter/commit/d2a4782f9b87217896b8ddb29afb00bbc373f582) Thanks [@kachkaev](https://github.com/kachkaev)! - Four new collectors (languages via tokei, eslint/ts directives, todo-comments, line survival via blame), commit trailers in commit-meta, per-collector sampling policies, and lifecycle commands: `collectors` and interactive `gc`.

- [`7c3dcb3`](https://github.com/kachkaev/repo-insighter/commit/7c3dcb3cd7d6cb27ca2f5d18c8a411cab67e2251) Thanks [@kachkaev](https://github.com/kachkaev)! - AI co-author detection excludes automation bots (renovate, dependabot, github-actions); GitHub noreply author emails are shortened to usernames in dashboard data.

- [`0710ae6`](https://github.com/kachkaev/repo-insighter/commit/0710ae6de86c97b15ea82a31a4fb8bc411af061d) Thanks [@kachkaev](https://github.com/kachkaev)! - README reflects the implemented pipeline and npx-based usage from inside the analyzed repository.

- [`b16bf91`](https://github.com/kachkaev/repo-insighter/commit/b16bf910e4a2ea543edc2c4d3aa28484628b237e) Thanks [@kachkaev](https://github.com/kachkaev)! - Initial end-to-end release test: catalog scaffolding, first collectors (`commit-meta`, `churn`, `file-types`) and the `scan`/`status` commands.
