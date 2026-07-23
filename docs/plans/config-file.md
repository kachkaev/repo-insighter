# Plan: `repo-dive.config.ts`

_Implemented. See [docs/specs/07-config.md](../specs/07-config.md) for the shipped behavior; this file is kept as the original design note._

Let users drop a `repo-dive.config.ts` at the root of the **analyzed** repository (knip-style) to alter how the tool works.
Everything must keep working with zero config.

## Feature 1: author aliases (deduplication)

People appear under multiple identities (work + personal email, GitHub noreply, name variants).
The config declares alias groups; the **index step** (not scan — raw catalog stays raw) merges them before building the cube and dashboard data.

```ts
import { defineConfig } from "repo-dive/config";

export default defineConfig({
  authors: {
    // First entry of each group is the canonical identity.
    aliases: [
      [
        "alice@work.example",
        "alice@personal.example",
        "12345+alice@users.noreply.github.com",
      ],
    ],
    // How many authors charts keep before folding the rest into "Other".
    maxInCharts: 10,
  },
});
```

Merging applies to: `commits.count`/churn attribution, the authors table, survival-by-author, and AI co-author identities (aliases may also unify assistant name variants later — out of scope for v1).

## Feature 2: author cap in charts

The dashboard currently folds authors into "Other" beyond hard-coded caps (6 in the survival-by-author stacked area, 10 in the authors bar list).
Raise the default to **10** for stacked areas (20 for bar lists) and make it configurable via `authors.maxInCharts`.
Note the categorical palette has 8 slots — beyond 8, series need the sequential-ramp fallback or "Other" folding; check the data-viz guidance before exceeding 8 in one stack.

## Implementation notes

- **Loading**: the config lives in the analyzed repo, not in repo-dive. Node ≥ 22.18 strips types on `import()`, so a plain dynamic `import(pathToFileURL(configPath))` of the `.ts` file should work without a bundler — verify, and fall back to also accepting `.mjs`/`.js`. Check whether Effect v4 has file-config helpers worth using (`effect/config` is env-oriented; probably not a fit — confirm against the cloned Effect source, which is the API source of truth).
- **`defineConfig` export**: needs a `repo-dive/config` subpath export in package.json that ships types but almost no runtime (identity function). The CLI bundle currently has no secondary entry — add one to the vite config.
- **Validation**: parse the imported object structurally (same no-assertions style as `src/lib/json.ts`) and fail with a friendly message on malformed config.
- **Plumbing**: `runIndex` gets the config (resolved from `--repo` root); alias resolution is a `canonicalizeAuthor(email)` step applied wherever `prettifyAuthorEmail` is used today ([indexing.ts](../../src/lib/indexing.ts)). Dashboard data shape doesn't change.
- **Docs**: README section + spec update (02-cli or a new 07-config spec). Changeset: minor.

## Testing

- Unit: alias resolution, config parsing, cap plumbing.
- Fixture e2e: repo with two commits under different emails + a config file → one author in dashboard.json after `index`.
- Real-world: the user has a locally scanned private repo for validation (ask them; **never name it in committed docs or commits**). Query the cube for candidate duplicate identities (same display name, different emails; noreply variants) and propose an alias config for that repo — the config file belongs to that repo and must not be committed here.
