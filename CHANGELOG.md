# repo-insighter

## 0.0.3

### Patch Changes

- 4181c5b: New `report` command: exports the dashboard as one self-contained HTML file (charts, data and styles inlined) that opens anywhere without installing anything.

## 0.0.2

### Patch Changes

- 69bfbe4: Bare `npx repo-insighter` now runs the whole pipeline — scan, index and dashboard (with browser auto-open) — and scan progress includes a rate/ETA estimate.

## 0.0.1

### Patch Changes

- `index` command (SQLite metrics cube + dashboard data) and `dashboard` command serving an interactive React/visx dashboard: languages over time, monthly commits with AI co-author share, churn, lint-suppression trends, top suppressed rules, code survival by cohort and author.

- Four new collectors (languages via tokei, eslint/ts directives, todo-comments, line survival via blame), commit trailers in commit-meta, per-collector sampling policies, and lifecycle commands: `collectors` and interactive `gc`.

- AI co-author detection excludes automation bots (renovate, dependabot, github-actions); GitHub noreply author emails are shortened to usernames in dashboard data.

- README reflects the implemented pipeline and npx-based usage from inside the analyzed repository.

- Initial end-to-end release test: catalog scaffolding, first collectors (`commit-meta`, `churn`, `file-types`) and the `scan`/`status` commands.
