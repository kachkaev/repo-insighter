---
"repo-dive": minor
---

Count direct dependencies from `package.json` manifests and chart them over time.

The dependencies collector now reads every `package.json` in a commit's tree (workspaces and root, `node_modules` excluded) and counts the `dependencies`, `devDependencies` and `optionalDependencies` it declares, plus how many manifests the tree carries.
`package.json` is the single source of truth for what a project _declares_, so these direct counts are accurate for every package manager — including yarn and npm v1, whose lockfiles do not record which resolved packages are direct and so previously reported zero — and even for a repository that declares dependencies before any lockfile exists.

The dashboard gains a **"Direct dependencies over time"** chart, stacked by kind (`dependencies` / `devDependencies` / `optionalDependencies`), next to the existing resolved-packages chart, and the header's dependencies tile now shows the number of `package.json` files.
Lockfiles keep their one job: counting the total resolved graph, split by package manager.
New metrics `dependencies.direct` (now sourced from manifests, categorized by manifest and kind) and `dependencies.manifest` (one per `package.json`) land in the cube.

The collector version is bumped, so run `scan` again to read manifests across the existing history.
