# Open questions

Decisions still to make, roughly ordered by how soon they bite.

## Naming

~~What to call the tool~~ — answered 2026-07-22: **`repo-dive`**, replacing the working title `repo-insighter` ("insighter" is not a word, and it showed: hard to say, easy to misspell). The dashed form is canonical everywhere — npm package, CLI command, catalog folder (`.repo-dive/`) and config file (`repo-dive.config.ts`) — with `repodive` held on npm as a placeholder pointing at it.

Checked before committing to the name: `repo-dive` and `repodive` are free on npm, crates.io and PyPI; [gitext-rs/git-dive](https://github.com/gitext-rs/git-dive) and [wagoodman/dive](https://github.com/wagoodman/dive) share the verb but not the name; CMS's [repodive-tools](https://github.com/DSACMS/repodive-tools) uses "repodiving" as a generic practice term rather than a product name. `repo-insights` on npm remains taken by a [real but dormant tool](../research/prior-art.md#name-collision-on-npm). The trade accepted: a crowded lexical neighborhood (search results are polluted by "deep dive" course repos) in exchange for a name people can say and spell.

## Catalog

- Self-ignoring catalog (`.repo-dive/.gitignore` containing `*`) vs appending to the repo's `.gitignore` — leaning self-ignoring.
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
- ~~AI integration~~ — answered: `repo-dive mcp` serves the cube over MCP (stdio), and `query --json` gives agents a scriptable contract.
- Chart library and theming for whatever HTML output exists.

## Scope

- Branch handling: walk first-parent history of the default branch only (simplest, likely v1) vs all branches/merges.
- Shallow clones and partial clones: detect and warn, or attempt to unshallow?
- Monorepos: per-directory scoping (`--path`) as a first-class filter?
- Other VCSs: git-only for now and for the foreseeable future, but a very distant Mercurial/Jujutsu/Pijul future shouldn't be structurally impossible — the catalog manifest records the VCS, and git-specific code stays behind the collector/runner seam rather than leaking into the cube model.

## Project

- When to split into a monorepo (probably only when plugins become real — the `repodive` placeholder package is deliberately not a reason to restructure).
- ~~Publish cadence~~ — answered: published on npm from 0.0.1, with every user-visible change landing behind a changeset.
