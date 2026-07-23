---
"repo-dive": patch
---

Read npm and yarn lockfiles in the dependencies collector, not just pnpm.

The collector now understands `package-lock.json` (npm lockfile versions 1, 2 and 3) and `yarn.lock` (both Yarn Classic v1 and Yarn Berry), alongside the existing pnpm support. Each produces the same manager-agnostic summary — resolved packages, importers and direct dependencies — so a repository that used npm or yarn before switching package managers now shows its earlier history on the "Dependencies over time" chart instead of a flat pre-pnpm stretch. npm v1 and yarn lockfiles do not record which resolved packages are direct, so their direct counts read zero.

The chart ranks package managers by their peak usage rather than their latest value, so a manager retired mid-history (yarn or npm before a pnpm migration) stays its own named series across the whole timeline instead of folding into "Other" once it disappears from the current snapshot.

Parsers now live in `src/lib/collectors/lockfile-parsers/`, one module per manager behind a small registry. Adding a future manager (cargo, bun, composer, …) is a new parser module and one line in the registry; the collector, cube and dashboard stay unchanged. The collector version is bumped, so run `scan` again to pick up the newly readable lockfiles.
