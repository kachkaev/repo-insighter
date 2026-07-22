# repo-dive

## 0.4.0

### Minor Changes

- **Renamed from `repo-insighter` to `repo-dive`.** The old name was a working title — "insighter" is not a word, and it was awkward to say and easy to misspell. Install `repo-dive` instead; `repo-insighter` is deprecated on npm and receives no further releases.

  Everything user-facing follows the new name:

  - **Package and command** — `npx repo-dive`, and the config entry point is now `repo-dive/config`.
  - **Catalog folder** — `.repo-insighter/` → `.repo-dive/`. Existing catalogs are **not** migrated automatically, but they are not silently ignored either: running against a repo that still has the old folder fails with a message telling you to `mv .repo-insighter .repo-dive`, so a full re-scan is never triggered by accident.
  - **Config file** — `repo-insighter.config.ts` → `repo-dive.config.ts` (`.mts`/`.mjs`/`.js` likewise). The old filename is no longer read; rename it by hand.
  - **Exported type** — `RepoInsighterConfig` → `RepoDiveConfig`. `defineConfig` is unchanged, so configs that only import it need no edit beyond the package name.

  No behavior changed beyond the rename. Version numbering continues from 0.3.0 rather than restarting.

## 0.3.0

### Minor Changes

- 8d88562: Add a `dependencies` collector that counts a repository's packages from its package-manager lockfiles.

  - **Total resolved packages** — the full set of `name@version` a lockfile resolves (attributed to its package manager), tracked at every commit so you can see the dependency graph grow over the repo's history.
  - **Direct and dev dependencies** — counted per workspace importer and summed, so a monorepo's duplicates add up and distinct versions of the same package count separately (React 19 in one package + React 18 in another = two direct dependencies).
  - **pnpm first, built to generalize** — parsing goes through a per-package-manager registry keyed by lockfile name; only `pnpm-lock.yaml` (v9) is implemented for now, with npm/yarn/bun slotting in later behind the same `packageManager` category. pnpm's multi-document lockfiles are handled, skipping the package-manager-management document so pnpm's own binaries don't masquerade as project dependencies.

  The dashboard gains a **Dependencies** stat tile and a **Dependencies over time** chart (resolved packages split by package manager, with a direct/dev/optional breakdown table).

- d74a129: Break the code-survival charts down by the year each surviving line was authored.

  - **Survival by contributor** starts as one flat color per contributor; a **"Shade by year written"** checkbox splits every contributor's area into per-year age bands. Each band is a lightness shade of the contributor's base color — the newest year at full color, older years fading toward the surface — so you can see, within one person's contribution, how much is fresh versus long-lived. The legend and hover tooltip stay one row per contributor either way.
  - **Survival by cohort** flips its ramp for consistency: the newest year is now the fullest color and the oldest the palest (previously reversed).
  - Both charts share a single, repo-wide set of age shades so a given year reads the same everywhere. The number of shades is the repo's age in years, capped at 10 (intended to become a config option); years beyond the window fold into a single `≤YYYY` band.

  `dashboard.json` survival rows gain a `byContributorYear` field (living lines per contributor, split by authoring year); it is rebuilt from cached facts on the next `index`, and older dashboards without it fall back to the flat contributor chart.

### Patch Changes

- b93c771: Key each collector's cached output by a **fingerprint** instead of its bare version. The fingerprint is a short hash (sha256, 12 hex) of the collector's `version` and the slice of config it declares a dependency on via the new optional `Collector.cacheConfig`. It is written into the `collector.json` sidecar and used as the per-blob cache namespace, so a collector re-collects whenever its version is bumped **or** the config it depends on changes — and only that collector re-collects. Config that solely affects `normalize` (contributor aliases, chart caps) is deliberately excluded, since `index` re-normalizes on every run.

  This is a generic mechanism: collectors with no config dependency (all of them today) behave exactly as before — their fingerprint tracks the version alone. It closes the gap where the version-only key could not notice config changes, which was fine when config did not exist yet.

  Upgrading resets the catalog's blob cache and sidecar keys, so the next `scan` re-collects everything once (cheap, resumable). No user-facing config changes.

- 27d2342: Fix the `todo-comments` collector reporting 0 TODO/FIXME/HACK/XXX comments in existing catalogs. An early build of the collector recorded zeros for every commit, and because the scan is resumable and its per-blob cache is version-keyed, those stale zeros survived every subsequent re-scan. Bumping the collector version invalidates the old outputs so the next `scan` re-collects them correctly (no `--force` needed). The marker matching itself was already correct — it counts markers wherever they appear on a line, including ones tucked after a `--` suppression rationale and inside JSX/block comments; regression tests now cover those shapes.

## 0.2.0

### Minor Changes

- 2ad06f6: Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

  - **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the contributors table), a `url` (the name links to it, e.g. a GitHub profile) and a `kind`. Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the contributors table, and code-survival-by-contributor all count each person once.
  - **Contributor kinds** — each contributor is a `human` (default), `bot`, or `ai` agent. `kind` can be set explicitly per alias group or is auto-derived from the commit author's name/email (automation bots and known AI coding agents are recognized). The dashboard badges non-humans with an icon and lists bots & AI agents separately from human contributors.
  - **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other"; the contributors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

  The dashboard now speaks of **contributors** (the people concept) rather than "authors"; the raw git-author fields in the cube are unchanged.

  Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

## 0.1.1

### Patch Changes

- 0ec82a1: Declare the true Node floor: `node:sqlite` (used by index/query/mcp) requires Node ≥ 22.13, and `engines` now says so instead of promising 22.0.
- 0ec82a1: Large-repo scan performance: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob (`git cat-file --batch` + SQLite blob cache + in-process memo) so only never-seen file contents are scanned. Survival sampling defaults to quarterly, and `engines.node` honestly reflects the `node:sqlite` floor (≥ 22.13).

## 0.1.0

### Minor Changes

- 17ad1f1: Ask the repository questions: new `query` command runs read-only SQL against the metrics cube, and `repo-insighter mcp` serves the cube over the Model Context Protocol (stdio) with `schema` and `query` tools for AI agents.

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
