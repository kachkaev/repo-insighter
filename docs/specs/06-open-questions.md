# Open questions

Decisions still to make, roughly ordered by how soon they bite.

## Naming

`repo-insights` on npm is taken by a [real but dormant tool](../research/prior-art.md#name-collision-on-npm). **Current draft name: `repo-insighter`** (verified free on npm 2026-07-19). Other candidates checked free the same day: `repo-insight`, `repo-metrics`, `repoinsights`; a scoped `@kachkaev/repo-insights` also remains an option. The catalog folder name (`.repo-insighter/`) follows the package name — worth settling both before first publish.

## Catalog

- Self-ignoring catalog (`.repo-insighter/.gitignore` containing `*`) vs appending to the repo's `.gitignore` — leaning self-ignoring.
- When to introduce sha sharding and tree-level deduplication (measure first).
- Lock mechanism for concurrent runs.

## Collectors

- Embed a JS LOC counter vs shell out to tokei/scc if present (with graceful fallback)?
- Default sampling policy for `worktree` collectors (`weekly`? `max:200`?).
- Plugin distribution: npm packages (dynamic import, trusted code) vs command protocol (config-mapped shell commands) — or both, and in which order.
- How collectors declare the category keys they emit (needed for dynamic index creation and for discoverability in `status`).

## Cube

- JSON categories column vs EAV table if multi-category filtering gets slow at scale.
- Whether `normalize` output should be streamed into SQLite during `scan` too (single-command UX) or stay strictly a separate `index` step.

## Exploration layer

- `report` output: self-contained HTML file (gitstats/git-truck lineage) vs local web app vs static image/markdown export for presentations. Presentations are a stated goal, so an export path matters early.
- ~~AI integration~~ — answered: `repo-insighter mcp` serves the cube over MCP (stdio), and `query --json` gives agents a scriptable contract.
- Chart library and theming for whatever HTML output exists.

## Scope

- Branch handling: walk first-parent history of the default branch only (simplest, likely v1) vs all branches/merges.
- Shallow clones and partial clones: detect and warn, or attempt to unshallow?
- Monorepos: per-directory scoping (`--path`) as a first-class filter?
- Other VCSs: git-only for now and for the foreseeable future, but a very distant Mercurial/Jujutsu/Pijul future shouldn't be structurally impossible — the catalog manifest records the VCS, and git-specific code stays behind the collector/runner seam rather than leaking into the cube model.

## Project

- When to split into a monorepo (probably only when plugins become real).
- Publish cadence: hold 0.x until `scan` + `index` + one real chart work end to end, or publish placeholder earlier to hold the name?
