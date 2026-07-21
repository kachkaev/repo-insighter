# Collectors

_Draft. Collectors are the pluggable "tools" of the map phase: each one knows how to extract one kind of raw snapshot from a commit._

## Interface sketch

```ts
type Collector = {
  readonly name: string; // "languages", "eslint", …
  readonly version: string; // bump to invalidate previous outputs
  /** Config slice that shapes collected output; folded into the cache fingerprint */
  readonly cacheConfig?: (config: ResolvedConfig) => unknown;
  readonly strategy: CollectionStrategy;
  /** Produce raw output for one commit; persisted verbatim into the catalog */
  readonly collect: (
    context: CollectContext,
  ) => Effect.Effect<RawOutput, CollectorError>;
  /** Turn one raw output into metric rows for the cube (pure, re-runnable) */
  readonly normalize: (raw: RawOutput) => readonly Metric[];
};

type Metric = {
  readonly name: string; // "loc", "lint.errors", …
  readonly value: number;
  readonly categories: Readonly<Record<string, string>>;
  // e.g. { language: "TypeScript" } or { rule: "no-unused-vars", severity: "error" }
};
```

The `collect`/`normalize` split mirrors the catalog's raw-before-derived principle: `collect` is expensive and runs once per (commit, cache fingerprint); `normalize` is cheap, pure and re-runnable whenever indexing logic improves. Because `normalize` re-runs on every `index`, config that only affects normalization must **not** feed `cacheConfig` — only config that changes the collected output belongs in the fingerprint.

## Collection strategies

Ordered by cost; the strategy tells the runner what context a collector needs:

1.  **`log`** — derived from commit metadata / `git log --numstat` only. Near-free, runs on every commit. (Examples: commit metadata, churn, author stats.)
1.  **`tree`** — reads file contents from the object database (`git cat-file`, `git ls-tree`) without touching the filesystem. Cheap, cacheable per blob/tree. (Examples: language/LOC via tokei-style counting, file size distributions.)
1.  **`worktree`** — needs a real checkout: the runner materializes the commit via `git worktree add` in a temporary directory and hands the collector a path. Expensive; sampled by default. (Examples: ESLint, type-checking, building, test counting — anything that needs `node_modules` or real files.)

## Sampling

Every-commit collection is the semantic default, but `worktree` collectors need a budget. Sampling policies (per collector, overridable via `--sample`):

- `all` — every commit (default for `log`/`tree`)
- `daily` / `weekly` / `monthly` — last commit per period on the walked branch (default for `worktree`: e.g. `weekly`)
- `every-nth:<n>`, `max:<n>` — count-based budgets
- Tags/releases as natural sample points (future)

The cube records which commits were sampled so charts can interpolate honestly rather than pretending to be continuous.

## Incrementality

The unit of work is **(commit, collector, cache fingerprint)** — the fingerprint being a short hash of the collector version and the config it depends on. Before running, the scanner diffs the plan against `collector.json` sidecars already in the catalog and only schedules the gap. Interrupting a scan loses at most the in-flight commits; re-running continues where it stopped. Effect's structured concurrency handles parallelism (several collectors per commit, several commits in flight) with clean cancellation.

## Built-in roster

Implemented (v0, in `src/lib/collectors/`):

1.  **commit-meta** (`log`) — author/committer identities, dates, parents, subject; the base everything else joins against
1.  **churn** (`log`) — lines added/deleted per commit vs first parent, by file extension
1.  **file-types** (`tree`) — file count and bytes per extension at the commit's tree (cheap stand-in for a real language breakdown)
1.  **dependencies** (`tree`) — total resolved packages and direct/dev dependencies from package-manager lockfiles, per package manager (pnpm so far; parser registry keyed by lockfile name generalizes to npm/yarn/bun)

Planned next:

1.  **languages** (`tree`) — LOC per language per commit (tokei/scc-style; embed vs reimplement TBD)
1.  **authors** (`log`) — commits/churn per author over time (mailmap-aware)
1.  **eslint** (`worktree`, sampled) — diagnostics by rule and severity — the proof that arbitrary external tools fit

## Third-party plugins (later)

Two candidate mechanisms, not mutually exclusive:

- **npm packages** (`repo-insighter-collector-*`) default-exporting a `Collector`, loaded via dynamic import — idiomatic, TypeScript-friendly, but code execution requires trust.
- **Command protocol**: a config file maps a collector name to a shell command that receives a checkout path / commit sha and prints JSON — zero-code extensibility for anything (`tokei --output json` works as-is).

The built-in roster deliberately uses the same `Collector` interface a plugin would, so the seam is proven before it is public.
