# Open questions

Decisions still to make, roughly ordered by how soon they bite.

## Naming

~~What to call the tool~~ — answered 2026-07-22: **`repo-dive`**, replacing the working title `repo-insighter` ("insighter" is not a word, and it showed: hard to say, easy to misspell). The dashed form is canonical everywhere — npm package, CLI command, catalog folder (`.repo-dive/`) and config file (`repo-dive.config.ts`) — with `repodive` held on npm as a placeholder pointing at it.

Checked before committing to the name: `repo-dive` and `repodive` are free on npm, crates.io and PyPI; [gitext-rs/git-dive](https://github.com/gitext-rs/git-dive) and [wagoodman/dive](https://github.com/wagoodman/dive) share the verb but not the name; CMS's [repodive-tools](https://github.com/DSACMS/repodive-tools) uses "repodiving" as a generic practice term rather than a product name. `repo-insights` on npm remains taken by a [real but dormant tool](../research/prior-art.md#name-collision-on-npm). The trade accepted: a crowded lexical neighborhood (search results are polluted by "deep dive" course repos) in exchange for a name people can say and spell.

**No `repodive` placeholder package exists, and none can.** The original plan was to publish an undashed stub to stop anyone squatting it. npm refuses to create it: [package moniker rules](https://blog.npmjs.org/post/168978377570/new-package-moniker-rules.html) strip punctuation before comparing against existing names, so `repodive` collides with `repo-dive` and publishing returns `E403 … Package name too similar to existing package repo-dive`. The check runs on the name before ownership, so it blocks everyone equally — including this project's own maintainer, who hit it while trying to publish the stub. That is stronger protection than a stub would have given, since it also covers `repo_dive`, `repo.dive` and (new packages cannot use uppercase) the case variants. Do not re-litigate this: the only thing a stub would add back is a friendlier message than npm's 404 for `npx repodive`. Note this is an npm-specific rule — PyPI ([PEP 503](https://peps.python.org/pep-0503/)) and crates.io collapse `-`/`_`/`.` rather than deleting them, so `repodive` stays a distinct name there.

## Catalog

- ~~Self-ignoring catalog vs appending to the repo's `.gitignore`~~ — answered: self-ignoring. Creating the catalog writes `.repo-dive/.gitignore` containing `*` and never touches the analyzed repo's own files.
- When to introduce sha sharding and tree-level deduplication of catalog outputs (measure first). Blob-level deduplication is done — see the [blob cache](03-catalog.md#blob-cache).
- Pruning the blob cache: `gc` covers `commits/` only, so `cache/blob-cache.sqlite` grows without bound and can only be reclaimed by deleting it.
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

- ~~Branch handling: first-parent history only vs everything reachable~~ — answered by strategy rather than globally: `log` collectors see every commit reachable from HEAD, while `tree` and `worktree` collectors are restricted to HEAD's first-parent chain, since only those trees are states the repository passed through (see [collectors](04-collectors.md#sampling)). Still open: whether anything should walk branches other than HEAD's.
- Shallow clones and partial clones: detect and warn, or attempt to unshallow?
- Monorepos: per-directory scoping (`--path`) as a first-class filter?
- Other VCSs: git-only for now and for the foreseeable future, but a very distant Mercurial/Jujutsu/Pijul future shouldn't be structurally impossible — the catalog manifest records the VCS, and git-specific code stays behind the collector/runner seam rather than leaking into the cube model.

## Project

- When to split into a monorepo (probably only when plugins become real; the abandoned `repodive` placeholder is no longer a reason, see Naming).
- ~~Publish cadence~~ — answered: published on npm from 0.0.1, with every user-visible change landing behind a changeset.
