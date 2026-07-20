---
"repo-insighter": minor
---

Add a `dependencies` collector that counts a repository's packages from its package-manager lockfiles.

- **Total resolved packages** — the full set of `name@version` a lockfile resolves (attributed to its package manager), tracked at every commit so you can see the dependency graph grow over the repo's history.
- **Direct and dev dependencies** — counted per workspace importer and summed, so a monorepo's duplicates add up and distinct versions of the same package count separately (React 19 in one package + React 18 in another = two direct dependencies).
- **pnpm first, built to generalize** — parsing goes through a per-package-manager registry keyed by lockfile name; only `pnpm-lock.yaml` (v9) is implemented for now, with npm/yarn/bun slotting in later behind the same `packageManager` category. pnpm's multi-document lockfiles are handled, skipping the package-manager-management document so pnpm's own binaries don't masquerade as project dependencies.

The dashboard gains a **Dependencies** stat tile and a **Dependencies over time** chart (resolved packages split by package manager, with a direct/dev/optional breakdown table).
