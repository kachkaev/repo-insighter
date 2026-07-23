# repo-dive

## 0.5.0

### Minor Changes

- [#59](https://github.com/kachkaev/repo-dive/pull/59) [`566bd64`](https://github.com/kachkaev/repo-dive/commit/566bd6402728d2607dc4e91d713fb2681e465a3d) - Count direct dependencies from `package.json` manifests and chart them over time.

  The dependencies collector now reads every `package.json` in a commit's tree (workspaces and root, `node_modules` excluded) and counts the `dependencies`, `devDependencies` and `optionalDependencies` it declares, plus how many manifests the tree carries.
  `package.json` is the single source of truth for what a project _declares_, so these direct counts are accurate for every package manager — including yarn and npm v1, whose lockfiles do not record which resolved packages are direct and so previously reported zero — and even for a repository that declares dependencies before any lockfile exists.

  The dashboard gains a **"Direct dependencies over time"** chart, stacked by kind (`dependencies` / `devDependencies` / `optionalDependencies`), next to the existing resolved-packages chart, and the header's dependencies tile now shows the number of `package.json` files.
  Lockfiles keep their one job: counting the total resolved graph, split by package manager.
  New metrics `dependencies.direct` (now sourced from manifests, categorized by manifest and kind) and `dependencies.manifest` (one per `package.json`) land in the cube.

  The collector version is bumped, so run `scan` again to read manifests across the existing history.

### Patch Changes

- [#53](https://github.com/kachkaev/repo-dive/pull/53) [`b05cfaa`](https://github.com/kachkaev/repo-dive/commit/b05cfaae621d9e76e6a2e712697acf08f267adca) - Fix duplicate-key warnings in the contributor bar lists. `BarList` keyed each row by its label, which is a contributor's display name — not unique, since two distinct people can share a name — so React logged its "two children with the same key" console error. `BarList` items now carry a required `id` used as the key: the contributor lists pass their canonical email (the indexer guarantees one row per email), and the top-rule and AI-identity lists pass their already-unique rule/identity string.

- [#57](https://github.com/kachkaev/repo-dive/pull/57) [`b5cd6c3`](https://github.com/kachkaev/repo-dive/commit/b5cd6c349a46e0e00a2cbe374ba66fdef712607f) - Enable React Compiler in the dashboard so chart hover no longer re-renders the stacked areas and bars.

  The dashboard's Vite build now runs React Compiler (via `@vitejs/plugin-react`'s `reactCompilerPreset`), which auto-memoizes components.
  Moving the cursor across a time-series or diverging-bar chart now updates only the crosshair and tooltip; the area, bar and line shapes underneath stay put instead of being reconciled on every mouse move.
  Manual `useMemo` calls in the charts and dashboard were removed since the compiler covers them.
  Existing dashboards render identically — nothing to re-scan.

- [#62](https://github.com/kachkaev/repo-dive/pull/62) [`e115add`](https://github.com/kachkaev/repo-dive/commit/e115addfb0fb0c2eb2ddbf88878b6cb8d22872f5) - Change the dashboard's default port from `4936` to `2141`.
  `2141` spells "DIVE" in Scrabble tile values (D=2, I=1, V=4, E=1), a nod to the project name, whereas `4936` was arbitrary.
  It stays in the registered range and below the OS ephemeral range (Linux 32768+, macOS 49152+), so it won't randomly clash with outbound-connection source ports, and IANA has no service assigned to it.
  The default now lives in a single shared constant instead of being duplicated across the root and `dashboard` commands.
  Pass `--port` to override it, exactly as before.

- [#54](https://github.com/kachkaev/repo-dive/pull/54) [`fa4cc9e`](https://github.com/kachkaev/repo-dive/commit/fa4cc9e69ec5a40127291ffb6c95c01447beedb9) - Read npm and yarn lockfiles in the dependencies collector, not just pnpm.

  The collector now understands `package-lock.json` (npm lockfile versions 1, 2 and 3) and `yarn.lock` (both Yarn Classic v1 and Yarn Berry), alongside the existing pnpm support. Each produces the same manager-agnostic summary — resolved packages, importers and direct dependencies — so a repository that used npm or yarn before switching package managers now shows its earlier history on the "Dependencies over time" chart instead of a flat pre-pnpm stretch. npm v1 and yarn lockfiles do not record which resolved packages are direct, so their direct counts read zero.

  The chart ranks package managers by their peak usage rather than their latest value, so a manager retired mid-history (yarn or npm before a pnpm migration) stays its own named series across the whole timeline instead of folding into "Other" once it disappears from the current snapshot.

  Parsers now live in `src/lib/collectors/lockfile-parsers/`, one module per manager behind a small registry. Adding a future manager (cargo, bun, composer, …) is a new parser module and one line in the registry; the collector, cube and dashboard stay unchanged. The collector version is bumped, so run `scan` again to pick up the newly readable lockfiles.

- [#60](https://github.com/kachkaev/repo-dive/pull/60) [`621c5bb`](https://github.com/kachkaev/repo-dive/commit/621c5bbb08923f299ca708a0d03c4253747e4558) - Actually stop the dashboard's stacked areas and bars from re-rendering while the cursor moves over a chart.

  Enabling React Compiler alone did not deliver this: the compiler silently bailed (its `panicThreshold` defaults to `"none"`) on the three components that use a default value in a typed destructured parameter or the `??=` operator — including the main time-series chart — leaving them with no memoization after their `useMemo`s had been removed.
  Those patterns are rewritten so every dashboard component now compiles.

  Even compiled, the shapes still reconciled on every mouse move because they shared a parent with the hover crosshair.
  The static marks (grid, areas, bars, lines, dots) are now their own `ChartMarks` component whose props exclude hover state, so the compiler memoizes it and hovering only updates the crosshair and tooltip.
  No visible change.

## 0.4.3

### Patch Changes

- [#42](https://github.com/kachkaev/repo-dive/pull/42) [`72d8d7b`](https://github.com/kachkaev/repo-dive/commit/72d8d7b6418e6fcfe1630416e46bdf36a05f7b3d) - Keep bar-chart bars inside the plot area. Bars are centred on their data point, so with the first and last points pinned to the chart edges the outermost bars spilled halfway past the left and right sides. Bar charts now inset the time scale by half a bucket slot, so every bar sits fully within the plot while areas and lines — which want their points on the edges — keep the full width. The commits-per-month and churn-per-month charts are the ones affected.

  The inset lives on the shared x scale, so any marks overlaid on a bar chart later (e.g. a trend line) line up with the bars automatically.

- [#41](https://github.com/kachkaev/repo-dive/pull/41) [`16d232b`](https://github.com/kachkaev/repo-dive/commit/16d232b178a61f6fe71ec8dd6518b7a6bc3fe1ea) - Show the dependencies chart against the repo's full timeline, and tell "no dependencies" apart from "not scanned".

  The "Dependencies over time" chart used to begin at the first commit that carried a lockfile — often long after the repository started — because a commit only produced a dependency fact once a parseable lockfile existed in its tree. The chart now shares the repo's full timeline like every other time-series chart: its axis starts at the first commit and the area begins where the first lockfile appears, an honest step up rather than a chart that looks like the project itself began mid-history.

  The hover crosshair now tracks the cursor across the whole axis instead of snapping to the nearest data point, so the empty early stretch is inspectable too. A genuinely unscanned instant reads "No data"; a commit that was scanned and simply had no lockfile reads "No lockfile". To make that distinction real rather than assumed, the dependencies collector now records a `dependencies.scanned` marker for a scanned tree that holds no lockfile, so indexing can keep those commits as explicit zeros. The collector version is bumped, so run `scan` again to backfill the pre-lockfile commits.

- [#38](https://github.com/kachkaev/repo-dive/pull/38) [`57f238a`](https://github.com/kachkaev/repo-dive/commit/57f238a235145415b221c20d89eb47b57689e270) - Bring "Shade by year written" to the lines-by-language chart, mirroring the toggle the code-survival-by-contributor chart already had. The survival collector's raw snapshots always recorded each living line's extension and authoring cohort, so `index` now cross-tabulates them into a per-extension-per-year breakdown — existing catalogs pick it up on the next `repo-dive index`, no re-scan needed.

  Because tokei snapshots carry no per-line age, shading switches the chart to the blame-based data: languages are approximated from file extensions (mapped to tokei's names), only scannable source files are counted, and the chart's subtitle changes to say so. Languages shared with the tokei view keep its colors, so toggling never recolors the stack. Composes with percent mode — the normalized, year-shaded view shows old cohorts thinning inside each language's share.

- [#43](https://github.com/kachkaev/repo-dive/pull/43) [`b85be0f`](https://github.com/kachkaev/repo-dive/commit/b85be0fca7c67c0fd25d0746e7d2f84094665cd1) - Drop the redundant `[bot]` suffix from auto-derived contributor names. Bots and AI agents already carry a kind badge (🤖 / ✨) in the dashboard, so a name like `🤖 renovate[bot]` labelled the same thing twice. Names are now tidied when derived: the trailing `[bot]` is stripped and the leading letter capitalized, so Renovate shows as `🤖 Renovate` and Dependabot as `🤖 Dependabot`.

  Only auto-derived names change — an explicit `displayName` in your config is still used verbatim. Existing catalogs heal on the next `repo-dive index` (no re-scan needed).

- [#37](https://github.com/kachkaev/repo-dive/pull/37) [`cfc01d3`](https://github.com/kachkaev/repo-dive/commit/cfc01d3239cd95ea917f4f1409d668c595c7619b) - Add a percent mode to stacked time-series charts. Every stacked dashboard chart with more than one series — lines by language, dependencies over time, commits per month, both code-survival views — gains a `#`/`%` toggle next to its legend. Percent mode renormalizes each date to its total, turning the chart into a composition view where shifts in share stay readable even while absolute volume grows.

  Tooltips on these charts now show the absolute value and the share side by side for every series, with the active mode's column emphasized. Line charts are unchanged — their series are not parts of a whole.

## 0.4.2

### Patch Changes

- [#33](https://github.com/kachkaev/repo-dive/pull/33) [`733e681`](https://github.com/kachkaev/repo-dive/commit/733e68112a7a9151fbbc3164edec5947d639fc13) - Teach `gc` to reclaim the two kinds of dead weight it could not reach before: the per-blob cache, and tree snapshots taken off HEAD's first-parent chain.

  - **`gc --stale` now prunes the blob cache** (`.repo-dive/cache/blob-cache.sqlite`) as well as the catalog. Cached per-blob results are namespaced by `(collector, fingerprint)`, and that pair is exactly what a lookup keys on — so once a collector's version or the config it depends on changes, every entry under the old fingerprint is unreachable by construction and can go. Entries under a fingerprint some registered collector still computes are always kept, so this never costs a re-scan of live data. The file is `VACUUM`ed afterwards, and `gc` reports how much it shrank by.
  - **`gc --off-mainline` removes snapshots that the cube already ignores.** Since 0.4.1, `tree` and `worktree` collectors only ever run on HEAD's first-parent chain, but catalogs written by earlier versions are full of snapshots stored under commits that sit on side branches or arrived through an unrelated-histories merge. `--unreachable` could not clear them — those commits are still perfectly reachable from HEAD — so on a repo like react roughly 27k outputs had no way out. The new flag drops them, and only them: `log` outputs (commit metadata, churn) are left alone at every commit, because a commit's own authorship and diff are facts wherever it sits in the graph.

  Both are separate, explicit flags rather than a widening of `--unreachable`, whose established meaning is "the commit itself is gone". Running `gc` with no flags still lists everything it found and asks, and `--dry-run` reports the full plan without touching anything.

## 0.4.1

### Patch Changes

- [#24](https://github.com/kachkaev/repo-dive/pull/24) [`a196adf`](https://github.com/kachkaev/repo-dive/commit/a196adf81ed4fac06cb443589a79a605f360cf76) - Take tree snapshots only on HEAD's first-parent chain, removing the cliffs that appeared in every "state over time" chart.

  `scan` enumerates commits with a full `git log`, which walks every parent. Sampling a period then picked whichever commit was newest in that walk — often one that lives on a side branch, or one that arrived with a foreign history absorbed by an unrelated-histories merge. Such a commit's tree was never the repository's state, so charting it produced a sheer drop and recovery. React is a good example: its `compiler/` directory came from a separate repository, and monthly sampling kept landing on commits whose entire tree is that one directory — the lines-by-language and code-survival charts dropped by 90% at those points.

  Collectors whose output describes the tree at a commit (`tree` and `worktree` strategies — languages, survival, file-types, directives, dependencies, todo-comments) are now sampled from the first-parent chain only. `log` collectors (commit metadata, churn) are unaffected and still see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.

  Existing catalogs heal without a re-scan: `index` leaves off-mainline snapshots out of the cube and reports how many it skipped. Run `scan` again afterwards to fill the periods whose sample had been landing off the mainline.

  `status` counts those collectors against the mainline too, so a snapshot collector that has captured everything `scan` will ever give it reads as complete rather than stalling a few commits short.

- [#26](https://github.com/kachkaev/repo-dive/pull/26) [`a72fc66`](https://github.com/kachkaev/repo-dive/commit/a72fc66f254c7f829f7948a9917b941ec1130262) - Report `status` progress against each collector's sampling target rather than the repository's full commit count. Sampled collectors previously looked barely started once a repo grew — a monthly collector that had captured everything it will ever capture still read as `languages: 1/45 commits collected`. It now reads `languages: 1/1 commits collected (monthly sample of 45)`, so a complete collector looks complete and the policy behind the smaller target is visible.

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

- [#7](https://github.com/kachkaev/repo-dive/pull/7) [`8d88562`](https://github.com/kachkaev/repo-dive/commit/8d88562b3b9717828378c6dd3dc8996695704280) - Add a `dependencies` collector that counts a repository's packages from its package-manager lockfiles.

  - **Total resolved packages** — the full set of `name@version` a lockfile resolves (attributed to its package manager), tracked at every commit so you can see the dependency graph grow over the repo's history.
  - **Direct and dev dependencies** — counted per workspace importer and summed, so a monorepo's duplicates add up and distinct versions of the same package count separately (React 19 in one package + React 18 in another = two direct dependencies).
  - **pnpm first, built to generalize** — parsing goes through a per-package-manager registry keyed by lockfile name; only `pnpm-lock.yaml` (v9) is implemented for now, with npm/yarn/bun slotting in later behind the same `packageManager` category. pnpm's multi-document lockfiles are handled, skipping the package-manager-management document so pnpm's own binaries don't masquerade as project dependencies.

  The dashboard gains a **Dependencies** stat tile and a **Dependencies over time** chart (resolved packages split by package manager, with a direct/dev/optional breakdown table).

- [#21](https://github.com/kachkaev/repo-dive/pull/21) [`d74a129`](https://github.com/kachkaev/repo-dive/commit/d74a129880f18bfa0a529439afd6f6e0a4d31e82) - Break the code-survival charts down by the year each surviving line was authored.

  - **Survival by contributor** starts as one flat color per contributor; a **"Shade by year written"** checkbox splits every contributor's area into per-year age bands. Each band is a lightness shade of the contributor's base color — the newest year at full color, older years fading toward the surface — so you can see, within one person's contribution, how much is fresh versus long-lived. The legend and hover tooltip stay one row per contributor either way.
  - **Survival by cohort** flips its ramp for consistency: the newest year is now the fullest color and the oldest the palest (previously reversed).
  - Both charts share a single, repo-wide set of age shades so a given year reads the same everywhere. The number of shades is the repo's age in years, capped at 10 (intended to become a config option); years beyond the window fold into a single `≤YYYY` band.

  `dashboard.json` survival rows gain a `byContributorYear` field (living lines per contributor, split by authoring year); it is rebuilt from cached facts on the next `index`, and older dashboards without it fall back to the flat contributor chart.

### Patch Changes

- [#20](https://github.com/kachkaev/repo-dive/pull/20) [`b93c771`](https://github.com/kachkaev/repo-dive/commit/b93c7716175d156fdce4756566f7dea72c9b4d38) - Key each collector's cached output by a **fingerprint** instead of its bare version. The fingerprint is a short hash (sha256, 12 hex) of the collector's `version` and the slice of config it declares a dependency on via the new optional `Collector.cacheConfig`. It is written into the `collector.json` sidecar and used as the per-blob cache namespace, so a collector re-collects whenever its version is bumped **or** the config it depends on changes — and only that collector re-collects. Config that solely affects `normalize` (contributor aliases, chart caps) is deliberately excluded, since `index` re-normalizes on every run.

  This is a generic mechanism: collectors with no config dependency (all of them today) behave exactly as before — their fingerprint tracks the version alone. It closes the gap where the version-only key could not notice config changes, which was fine when config did not exist yet.

  Upgrading resets the catalog's blob cache and sidecar keys, so the next `scan` re-collects everything once (cheap, resumable). No user-facing config changes.

- [#11](https://github.com/kachkaev/repo-dive/pull/11) [`27d2342`](https://github.com/kachkaev/repo-dive/commit/27d23428903cc0d0c8d628100ea7f20b4a875770) - Fix the `todo-comments` collector reporting 0 TODO/FIXME/HACK/XXX comments in existing catalogs. An early build of the collector recorded zeros for every commit, and because the scan is resumable and its per-blob cache is version-keyed, those stale zeros survived every subsequent re-scan. Bumping the collector version invalidates the old outputs so the next `scan` re-collects them correctly (no `--force` needed). The marker matching itself was already correct — it counts markers wherever they appear on a line, including ones tucked after a `--` suppression rationale and inside JSX/block comments; regression tests now cover those shapes.

## 0.2.0

### Minor Changes

- [`2ad06f6`](https://github.com/kachkaev/repo-dive/commit/2ad06f64e76e00026631a6395197d5d937e73be9) - Add an optional `repo-insighter.config.ts` at the root of the analyzed repository (knip-style; `.mjs`/`.js` also accepted). Everything keeps working with zero config.

  - **Contributor aliases** — `contributors.aliases` declares groups of email identities that belong to one person (work + personal email, GitHub noreply, name variants); the first entry of each group is canonical. A group can be a plain array of emails or a rich object that also sets a `displayName` (shown in charts and the contributors table), a `url` (the name links to it, e.g. a GitHub profile) and a `kind`. Emails match either the raw commit email or its prettified noreply handle, so you can list the handle you see in the report. The `index` step merges them before building the cube's dashboard data, so commit/churn attribution, the contributors table, and code-survival-by-contributor all count each person once.
  - **Contributor kinds** — each contributor is a `human` (default), `bot`, or `ai` agent. `kind` can be set explicitly per alias group or is auto-derived from the commit author's name/email (automation bots and known AI coding agents are recognized). The dashboard badges non-humans with an icon and lists bots & AI agents separately from human contributors.
  - **Configurable chart cap** — `contributors.maxInCharts` (default 10) sets how many contributors the per-contributor charts keep before folding the rest into "Other"; the contributors bar list keeps twice that. The categorical palette was widened to 20 slots so larger stacks stay legible.

  The dashboard now speaks of **contributors** (the people concept) rather than "authors"; the raw git-author fields in the cube are unchanged.

  Import `defineConfig` from the new `repo-insighter/config` entry point for type-checking and editor IntelliSense.

## 0.1.1

### Patch Changes

- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Declare the true Node floor: `node:sqlite` (used by index/query/mcp) requires Node ≥ 22.13, and `engines` now says so instead of promising 22.0.
- [`0ec82a1`](https://github.com/kachkaev/repo-dive/commit/0ec82a18ac89fc4d9adc50dca160f52cd61c062c) - Large-repo scan performance: log-strategy collectors (commit-meta, churn) batch the whole history into one `git log` pass, and content-scanning collectors (directives, todo-comments) cache results per blob (`git cat-file --batch` + SQLite blob cache + in-process memo) so only never-seen file contents are scanned. Survival sampling defaults to quarterly, and `engines.node` honestly reflects the `node:sqlite` floor (≥ 22.13).

## 0.1.0

### Minor Changes

- [`17ad1f1`](https://github.com/kachkaev/repo-dive/commit/17ad1f1922f87c0b2c0a7182179656b1a67ad925) - Ask the repository questions: new `query` command runs read-only SQL against the metrics cube, and `repo-insighter mcp` serves the cube over the Model Context Protocol (stdio) with `schema` and `query` tools for AI agents.

## 0.0.3

### Patch Changes

- [`4181c5b`](https://github.com/kachkaev/repo-dive/commit/4181c5b5ce35e2500b864248121a1505d27a1483) - New `report` command: exports the dashboard as one self-contained HTML file (charts, data and styles inlined) that opens anywhere without installing anything.

## 0.0.2

### Patch Changes

- [`69bfbe4`](https://github.com/kachkaev/repo-dive/commit/69bfbe4d765b710c0e7ddd7d9c94172533f17f46) - Bare `npx repo-insighter` now runs the whole pipeline — scan, index and dashboard (with browser auto-open) — and scan progress includes a rate/ETA estimate.

## 0.0.1

### Patch Changes

- `index` command (SQLite metrics cube + dashboard data) and `dashboard` command serving an interactive React/visx dashboard: languages over time, monthly commits with AI co-author share, churn, lint-suppression trends, top suppressed rules, code survival by cohort and author.

- Four new collectors (languages via tokei, eslint/ts directives, todo-comments, line survival via blame), commit trailers in commit-meta, per-collector sampling policies, and lifecycle commands: `collectors` and interactive `gc`.

- AI co-author detection excludes automation bots (renovate, dependabot, github-actions); GitHub noreply author emails are shortened to usernames in dashboard data.

- README reflects the implemented pipeline and npx-based usage from inside the analyzed repository.

- Initial end-to-end release test: catalog scaffolding, first collectors (`commit-meta`, `churn`, `file-types`) and the `scan`/`status` commands.
