---
name: pr-authoring
description: Conventions for authoring PRs in this repo — changesets (including attribution overrides for backfills), bump levels, summary style, PR titles. Use when creating a PR, writing or reviewing a changeset, or fixing changelog attribution.
---

# PR authoring

## Every user-facing change needs a changeset

If a PR changes what users see or run — the CLI, collectors, indexing, the dashboard, config, the report — it must include a changeset in the same PR. Internal-only changes (tests, CI, lint setup, docs) don't get one.

Create `.changeset/<kebab-slug>.md` (pick a descriptive slug, not the generator's random name):

```md
---
"repo-dive": patch
---

Imperative first sentence matching the PR title. Then paragraphs (and bullets
where they help) written for CHANGELOG readers: what changed, why, and what —
if anything — users must do. Mention when existing catalogs heal without a
re-scan, or when they don't.
```

Bump levels while the package is 0.x:

- `patch` — features and fixes, which is almost everything.
- `minor` — breaking changes only (renames, catalog/config format changes users must act on).

## Backfilling a missed changeset

When a changeset lands in a _different_ PR than the change it describes, the changelog would attribute it to the wrong PR/commit. `@changesets/changelog-github` supports overrides: put these lines at the top of the changeset body (they are parsed out and never rendered):

```md
---
"repo-dive": patch
---

pr: #37
commit: cfc01d3239cd95ea917f4f1409d668c595c7619b

Actual summary starts here…
```

Use the full SHA of the squash-merge commit on `main` and the merged PR's number. `author: @login` is also supported but unused here (`disableThanks` is on).

## PR conventions

- Open PRs as **drafts**.
- Title: one imperative sentence in the style of `main`'s history ("Add year shading to the lines-by-language chart"), no trailing period.
- Body: short — what and why, plus anything the diff can't say (verification done, known trade-offs). No boilerplate sections.
- Versioning and CHANGELOG generation are automated (`changesets:version` + release CI); never edit `CHANGELOG.md` or `package.json` version by hand.
