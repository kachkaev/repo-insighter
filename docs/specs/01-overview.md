# Overview

## Vision

A repository's history hides insights that are hard to see from HEAD: how languages rise and fall, who owns what and when that changed, how lint debt accumulates, where churn concentrates. repo-insighter extracts those insights from any local git repository and turns them into material for exploration, charts and presentations:

```sh
npx repo-insighter scan # eventually: one command from zero to explorable insights
```

## The pipeline (map → reduce → explore)

```text
 git history          catalog (raw)               index (cube)            outputs
┌────────────┐   ┌──────────────────────┐   ┌─────────────────────┐   ┌──────────────┐
│ commit A   │──▶│ commits/A/languages/ │──▶│                     │   │ charts       │
│ commit B   │──▶│ commits/A/eslint/    │   │ metrics × categories│──▶│ reports      │
│ commit C   │──▶│ commits/B/…          │──▶│ (SQLite)            │   │ AI questions │
│ …          │   │ …                    │   │                     │   │              │
└────────────┘   └──────────────────────┘   └─────────────────────┘   └──────────────┘
     walk              collect (map)              index (reduce)           explore
```

1.  **Collect (map).** Walk commits (all of them or a sample) and run _collectors_ against each: language/LOC breakdown, author metadata, lint diagnostics, dependency counts — an open list. Each collector writes its raw output into a per-commit, per-collector folder in the catalog.
1.  **Index (reduce).** Normalize raw outputs into _metrics_: numeric values at intersections of open-ended _categories_ (commit, author, language, lint rule, date, directory, …). Load them into a queryable cube backed by SQLite.
1.  **Explore.** Query the cube to draw charts, generate reports and presentations, and let AI tools answer questions about the repository's evolution.

Each step is independently runnable and resumable; users iterate in multiple passes rather than one monolithic run.

## Principles

- **Local-first.** Everything runs on the user's machine against a local clone. No server, no forge API required.
- **Incremental and resumable.** Work already done is never redone: collectors skip commits they have already processed, indexing picks up only new raw outputs, and a `scan` after `git pull` only touches new commits.
- **Raw before derived.** Collectors store the raw tool output verbatim. Indexing is a separate, re-runnable step, so improving normalization logic never requires re-running expensive collection.
- **Open-ended categories.** The metrics model does not enumerate dimensions up front. A collector can introduce a new category (say, `lint-rule` or `test-suite`) without schema migrations.
- **Pluggable collectors.** Built-in collectors cover the basics; the architecture treats them exactly like third-party plugins.
- **Cheap by default, expensive by choice.** Metadata-level collectors run on every commit in seconds; checkout-based collectors (ESLint & co) run on samples unless asked otherwise.
- **npx-friendly.** No native dependencies, instant start, sensible zero-config behavior.

## Non-goals (for now)

- Hosting, dashboards-as-a-service, or team/DORA metrics from forge APIs (PRs, issues, CI) — the unit of analysis is the git repository itself.
- Real-time monitoring of new commits (CI integration may come later).
- Multi-repo aggregation (interesting later; the cube design should not preclude it).
- Other version control systems. The tool is git-only for now and for the foreseeable future; a very distant multi-VCS future should merely remain structurally possible (see [open questions](06-open-questions.md#scope)).
- Windows-first polish (should work, but macOS/Linux are the primary targets early on).
