import type { Effect } from "effect";

import type { ResolvedConfig } from "../config.ts";
import type { SamplingPolicy } from "../sampling.ts";

type CollectContext = {
  readonly repoRoot: string;
  readonly sha: string;
  /**
   * The collector's cache fingerprint for this run — a short hash of its
   * {@link Collector.version} and {@link Collector.cacheConfig} slice. Pass it
   * to content caches (e.g. `scanTreeWithBlobCache`) so cached results are
   * invalidated whenever the version or the relevant config changes.
   */
  readonly cacheKey: string;
  /** Present only for `worktree` collectors: a detached checkout of the commit. */
  readonly worktreePath?: string | undefined;
};

/**
 * One numeric value at an intersection of open-ended categories — the unit of
 * the metrics cube. Metric names are namespaced per collector by convention
 * (e.g. "churn.added"); category keys are free-form strings.
 */
export type Fact = {
  readonly metric: string;
  readonly value: number;
  readonly categories?: Readonly<Record<string, string>>;
};

/**
 * A collector extracts one kind of raw snapshot from a commit (the map phase).
 * Its output is persisted verbatim into the catalog; normalization into the
 * metrics cube is a separate concern handled by the `index` command.
 */
export type Collector = {
  readonly name: string;
  /** One-line human description shown by `repo-dive collectors`. */
  readonly description: string;
  /** Bump to invalidate previously collected outputs of this collector. */
  readonly version: string;
  /**
   * The slice of resolved config that shapes this collector's *collected*
   * output, if any. It is folded together with {@link version} into the cache
   * fingerprint, so changing it re-collects this collector (and only this one)
   * on the next scan. Return a JSON-serializable value; omit for collectors
   * whose output does not depend on config. Config that only affects
   * `normalize` must NOT go here — `index` re-runs normalization every time.
   */
  readonly cacheConfig?: (config: ResolvedConfig) => unknown;
  /**
   * What the collector needs: `log` — commit metadata/diffs only; `tree` —
   * object-database reads; `worktree` — a real checkout.
   */
  readonly strategy: "log" | "tree" | "worktree";
  /**
   * Which commits to run on by default. Expensive collectors sample; cheap
   * ones run everywhere. Overridable via `scan --sample`.
   */
  readonly defaultSampling: SamplingPolicy;
  readonly collect: (context: CollectContext) => Effect.Effect<unknown, Error>;
  /**
   * Optional bulk path: produce outputs for many commits in O(1) subprocesses
   * (e.g. one `git log` pass over the whole history). Commits missing from
   * the returned map fall back to per-commit collect().
   */
  readonly collectBatch?: (context: {
    readonly repoRoot: string;
    readonly shas: ReadonlySet<string>;
  }) => Effect.Effect<ReadonlyMap<string, unknown>, Error>;
  /**
   * Turns one raw output (as re-read from the catalog, hence `unknown`) into
   * facts for the cube. Pure and cheap: `index` re-runs it freely, so
   * normalization logic can improve without re-collecting.
   */
  readonly normalize: (raw: unknown) => readonly Fact[];
};

/** File extension used as a category key, e.g. ".ts"; files without one map to "(none)". */
export const extensionOf = (filePath: string): string => {
  const basename = filePath.split("/").at(-1) ?? "";
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex).toLowerCase() : "(none)";
};

/**
 * Extensions considered source-like for content-scanning collectors
 * (directives, survival). Deliberately excludes binaries and lockfiles.
 */
const sourceExtensions = new Set([
  ".astro",
  ".c",
  ".cjs",
  ".cpp",
  ".cs",
  ".css",
  ".cts",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".less",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".php",
  ".prisma",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);

const excludedPathSegments = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  ".min.",
  "generated",
];

const excludedFileNames = new Set([
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "composer.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "uv.lock",
]);

/** Whether a repo path should be scanned by content-level collectors. */
export const isScannableSourceFile = (filePath: string): boolean => {
  const fileName = filePath.split("/").at(-1) ?? "";
  if (excludedFileNames.has(fileName)) {
    return false;
  }
  if (excludedPathSegments.some((segment) => filePath.includes(segment))) {
    return false;
  }
  return sourceExtensions.has(extensionOf(filePath));
};
