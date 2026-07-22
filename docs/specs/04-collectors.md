# Collectors

_Draft. Collectors are the pluggable "tools" of the map phase: each one knows how to extract one kind of raw snapshot from a commit._

## Interface sketch

```ts
type Collector = {
  readonly name: string; // "languages", "eslint", …
  readonly description: string; // one line, shown by `repo-dive collectors`
  readonly version: string; // bump to invalidate previous outputs
  /** Config slice that shapes collected output; folded into the cache fingerprint */
  readonly cacheConfig?: (config: ResolvedConfig) => unknown;
  readonly strategy: "log" | "tree" | "worktree";
  /** Which commits to run on unless `scan --sample` overrides it */
  readonly defaultSampling: SamplingPolicy;
  /** Produce raw output for one commit; persisted verbatim into the catalog */
  readonly collect: (context: CollectContext) => Effect.Effect<unknown, Error>;
  /** Optional bulk path: many commits in O(1) subprocesses (see below) */
  readonly collectBatch?: (context: {
    readonly repoRoot: string;
    readonly shas: ReadonlySet<string>;
  }) => Effect.Effect<ReadonlyMap<string, unknown>, Error>;
  /** Turn one raw output into facts for the cube (pure, re-runnable) */
  readonly normalize: (raw: unknown) => readonly Fact[];
};

type CollectContext = {
  readonly repoRoot: string;
  readonly sha: string;
  /** This collector's cache fingerprint; pass it to content caches */
  readonly cacheKey: string;
  /** Present only for `worktree` collectors: a detached checkout of the commit */
  readonly worktreePath?: string | undefined;
};

type Fact = {
  readonly metric: string; // "languages.lines", "churn.added", …
  readonly value: number;
  readonly categories?: Readonly<Record<string, string>>;
  // e.g. { language: "TypeScript" } or { rule: "no-unused-vars", severity: "error" }
};
```

Raw output is typed `unknown` on purpose: it is written to the catalog as JSON and read back from there, so `normalize` re-parses rather than trusting an in-memory shape.

The `collect`/`normalize` split mirrors the catalog's raw-before-derived principle: `collect` is expensive and runs once per (commit, cache fingerprint); `normalize` is cheap, pure and re-runnable whenever indexing logic improves. Because `normalize` re-runs on every `index`, config that only affects normalization must **not** feed `cacheConfig` — only config that changes the collected output belongs in the fingerprint.

## Collection strategies

Ordered by cost; the strategy tells the runner what context a collector needs:

1.  **`log`** — derived from commit metadata / `git log --numstat` only. Near-free, runs on every commit. (Examples: commit metadata, churn, author stats.)
1.  **`tree`** — reads the commit's tree and file contents from the object database (`git ls-tree`, `git cat-file`) without touching the filesystem. Cheap, and cacheable per blob when the result depends on content alone (see [content caching](#content-caching)). (Examples: file size distributions, suppression-comment counts, line survival.)
1.  **`worktree`** — needs a real checkout: the runner materializes the commit via `git worktree add` in a temporary directory and hands the collector a path. Expensive; sampled by default. (Examples: ESLint, type-checking, building, test counting — anything that needs `node_modules` or real files.)

## Sampling

Every-commit collection is the semantic default, but expensive collectors need a budget. Each collector declares a `defaultSampling`; `scan --sample POLICY` overrides it for every collector in the run. Policies:

- `all` — every commit (the default for the cheap `log` and `tree` collectors)
- `weekly` / `monthly` / `quarterly` — the newest commit of each period, so HEAD is always sampled (`languages` defaults to `monthly`, `survival` to `quarterly`)
- `every-nth:<n>` — a count-based budget, taken over the newest-first commit list
- Tags/releases as natural sample points (future)

Period buckets are computed from the author date in UTC (ISO weeks for `weekly`).

Which commits a collector was actually run on stays visible in the cube (facts carry the collector that produced them), so charts can interpolate honestly rather than pretending to be continuous.

`tree` and `worktree` collectors sample the **first-parent chain only**. Their output describes the state of the tree, and only first-parent commits are states the repository actually passed through: a commit on a merged side branch — or one that arrived with a foreign history absorbed by an unrelated-histories merge — carries a tree that was never HEAD, so sampling it puts a cliff into the timeline. `log` collectors see every commit, since a commit's own authorship and diff are facts wherever it sits in the graph.

## Incrementality

The unit of work is **(commit, collector, cache fingerprint)** — the fingerprint being a short hash of the collector version and the config it depends on. Before running, the scanner diffs the plan against `collector.json` sidecars already in the catalog and only schedules the gap. Interrupting a scan loses at most the in-flight commits; re-running continues where it stopped. Effect's structured concurrency handles parallelism (several collectors per commit, several commits in flight) with clean cancellation.

## Batch collection

`collect` is defined per commit, which for a `log` collector means one `git show` subprocess per commit — on a 30k-commit repository, the difference between minutes and hours. A collector that can answer for many commits in a single pass therefore also implements the optional **`collectBatch`**: it receives the repo root and the set of shas still to do, and returns a map from sha to raw output.

`scan` runs a batch phase before the per-commit walk. For each collector with a `collectBatch`, it works out which of its planned shas lack a current sidecar, hands that set over, and writes every returned output through the same catalog path a per-commit run would use — same `output.json`, same `collector.json` fingerprint. Shas the batch covered are then removed from the per-commit walk.

The contract a collector must honor:

- **Same output shape as `collect`.** The two paths write into one catalog and `normalize` cannot tell them apart, so a value produced in batch must be indistinguishable from the per-commit one. In practice both call the same parser.
- **Partial results are allowed.** Any sha missing from the returned map falls back to `collect`, so a batch pass may cover what is convenient (e.g. only commits `git log` reaches) and skip the rest. Returning an empty map is legal and simply degrades to the per-commit path.
- **Only requested shas.** Every entry of the returned map is written to the catalog, including one for a sha nobody asked about, so a batch pass must filter its stream against `shas` rather than dumping the whole history.
- **Whole-pass failure is not fatal.** A failing `collectBatch` is recorded as one failure and the scan continues per commit.
- **No worktree, no cache key.** The batch context carries neither, so this is a fit for `log` collectors reading history in bulk, not for collectors that need a checkout or a content cache.

Implemented by `commit-meta` and `churn`: both replace one `git show` per commit with a single `git log` pass (`--format` with a record separator, plus `--numstat` for churn), parsing the stream into per-commit records.

## Content caching

Tree collectors face the mirror-image problem: successive commits share almost their whole tree, so scanning every file of every commit re-reads bytes that have not changed. Collectors whose per-file result depends on **content alone** therefore compute per blob and cache by blob sha, in `.repo-dive/cache/blob-cache.sqlite` — see [catalog](03-catalog.md#blob-cache) for the store itself.

A collector opts in by calling one of the shared helpers instead of walking the tree itself, passing the `cacheKey` from its collect context so cached results share the collector's invalidation:

- `scanTreeWithBlobCache` — every source-like file in the tree (extension allowlist, `node_modules`/`dist`/lockfiles excluded), for a `(content) => result` scan. Used by `directives` and `todo-comments`.
- `scanTreeFilesWithBlobCache` — files selected by path predicate, for a `(content, filePath) => result` scan. Used by `dependencies` to parse lockfiles.

Both return one result per file path in the tree; merging those into the commit's raw output stays the collector's job. The scan function must be pure and its result JSON-serializable — it is the value that gets cached, and it is reused for identical content under a different path.

## Built-in roster

Implemented, in `src/lib/collectors/` (strategy, then default sampling where it is not `all`):

1.  **commit-meta** (`log`) — author/committer identities, dates, parents, subject and trailers incl. co-authors; the base everything else joins against. Batched.
1.  **churn** (`log`) — lines added/deleted per commit vs first parent, by file extension. Batched.
1.  **file-types** (`tree`) — file count and bytes per extension at the commit's tree, straight from `git ls-tree -l`.
1.  **directives** (`tree`) — ESLint suppression comments by rule (block disables counted as gray areas) and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` counts. Blob-cached.
1.  **dependencies** (`tree`) — total resolved packages and direct/dev dependencies from package-manager lockfiles, per package manager (pnpm so far; parser registry keyed by lockfile name generalizes to npm/yarn/bun). Blob-cached.
1.  **todo-comments** (`tree`) — TODO/FIXME/HACK/XXX counts in source files. Blob-cached.
1.  **languages** (`worktree`, `monthly`) — LOC per language, by shelling out to `tokei` on the checkout; embedded languages (code fences in Markdown, …) fold back into their parent. Missing `tokei` fails with an install hint rather than silently skipping.
1.  **survival** (`tree`, `quarterly`) — living lines by extension, author and authoring-month cohort, via `git blame --line-porcelain` per file. The expensive one.

Planned next:

1.  **authors** (`log`) — commits/churn per author over time (mailmap-aware)
1.  **eslint** (`worktree`, sampled) — diagnostics by rule and severity — the proof that arbitrary external tools fit

## Third-party plugins (later)

Two candidate mechanisms, not mutually exclusive:

- **npm packages** (`repo-dive-collector-*`) default-exporting a `Collector`, loaded via dynamic import — idiomatic, TypeScript-friendly, but code execution requires trust.
- **Command protocol**: a config file maps a collector name to a shell command that receives a checkout path / commit sha and prints JSON — zero-code extensibility for anything (`tokei --output json` works as-is).

The built-in roster deliberately uses the same `Collector` interface a plugin would, so the seam is proven before it is public.
