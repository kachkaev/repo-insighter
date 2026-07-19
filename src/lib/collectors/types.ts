import type { Effect } from "effect";

import type { SamplingPolicy } from "../sampling.ts";

type CollectContext = {
  readonly repoRoot: string;
  readonly sha: string;
  /** Present only for `worktree` collectors: a detached checkout of the commit. */
  readonly worktreePath?: string | undefined;
};

/**
 * A collector extracts one kind of raw snapshot from a commit (the map phase).
 * Its output is persisted verbatim into the catalog; normalization into the
 * metrics cube is a separate concern handled by the `index` command.
 */
export type Collector = {
  readonly name: string;
  /** One-line human description shown by `repo-insighter collectors`. */
  readonly description: string;
  /** Bump to invalidate previously collected outputs of this collector. */
  readonly version: string;
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
