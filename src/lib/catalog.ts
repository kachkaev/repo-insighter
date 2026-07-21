import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Effect } from "effect";

import type { Collector } from "./collectors/types.ts";

export const catalogDirName = ".repo-insighter";
const catalogFormatVersion = 1;

export type Catalog = {
  readonly repoRoot: string;
  readonly rootPath: string;
};

type CatalogManifest = {
  readonly formatVersion: number;
  readonly vcs: "git";
  readonly createdAt: string;
};

type CollectorSidecar = {
  readonly collector: string;
  /** Human-readable version — kept for inspection; `cacheKey` is the real key. */
  readonly version: string;
  /** Cache fingerprint (version + relevant config) that decides re-collection. */
  readonly cacheKey: string;
  readonly completedAt: string;
  readonly durationMs: number;
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const writeJson = (filePath: string, value: unknown) =>
  Effect.tryPromise({
    try: () =>
      writeFile(filePath, `${JSON.stringify(value, undefined, 2)}\n`, "utf8"),
    catch: toError,
  });

const readJsonIfExists = (filePath: string) =>
  Effect.tryPromise({
    try: async (): Promise<unknown> => {
      try {
        return JSON.parse(await readFile(filePath, "utf8"));
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return undefined;
        }
        throw error;
      }
    },
    catch: toError,
  });

const cacheKeyOf = (sidecar: unknown): unknown =>
  typeof sidecar === "object" && sidecar !== null && "cacheKey" in sidecar
    ? sidecar.cacheKey
    : undefined;

const formatVersionOf = (manifest: unknown): unknown =>
  typeof manifest === "object" &&
  manifest !== null &&
  "formatVersion" in manifest
    ? manifest.formatVersion
    : undefined;

/**
 * Opens (creating if needed) the catalog folder at the root of the analyzed
 * repository. The catalog ignores itself via its own .gitignore.
 */
export const openCatalog = (repoRoot: string): Effect.Effect<Catalog, Error> =>
  Effect.gen(function* () {
    const rootPath = path.join(repoRoot, catalogDirName);
    yield* Effect.tryPromise({
      try: () => mkdir(rootPath, { recursive: true }),
      catch: toError,
    });

    const manifestPath = path.join(rootPath, "catalog.json");
    const manifest = yield* readJsonIfExists(manifestPath);

    if (manifest === undefined) {
      yield* Effect.tryPromise({
        try: () => writeFile(path.join(rootPath, ".gitignore"), "*\n", "utf8"),
        catch: toError,
      });
      yield* writeJson(manifestPath, {
        formatVersion: catalogFormatVersion,
        vcs: "git",
        createdAt: new Date().toISOString(),
      } satisfies CatalogManifest);
    } else {
      const formatVersion = formatVersionOf(manifest);
      if (formatVersion !== catalogFormatVersion) {
        return yield* Effect.fail(
          new Error(
            `Catalog at ${rootPath} has format version ${String(formatVersion)}, ` +
              `but this version of repo-insighter expects ${catalogFormatVersion}. ` +
              "Delete the folder to re-collect from scratch.",
          ),
        );
      }
    }

    return { repoRoot, rootPath };
  });

const collectorDir = (catalog: Catalog, sha: string, collectorName: string) =>
  path.join(catalog.rootPath, "commits", sha, collectorName);

/** Reads the cache fingerprint recorded in a collector's sidecar, if any. */
export const readCollectorCacheKey = (
  catalog: Catalog,
  sha: string,
  collectorName: string,
): Effect.Effect<unknown, Error> =>
  readJsonIfExists(
    path.join(collectorDir(catalog, sha, collectorName), "collector.json"),
  ).pipe(Effect.map(cacheKeyOf));

/**
 * A (commit, collector) pair is done when a sidecar recording the current cache
 * fingerprint exists. `cacheKey` folds in the collector version and any config
 * it depends on, so a version bump or a relevant config change re-collects it.
 */
export const isCollected = (
  catalog: Catalog,
  sha: string,
  collector: Collector,
  cacheKey: string,
): Effect.Effect<boolean, Error> =>
  readCollectorCacheKey(catalog, sha, collector.name).pipe(
    Effect.map((stored) => stored === cacheKey),
  );

export const writeCollectorOutput = ({
  catalog,
  sha,
  collector,
  cacheKey,
  output,
  durationMs,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collector: Collector;
  readonly cacheKey: string;
  readonly output: unknown;
  readonly durationMs: number;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const dir = collectorDir(catalog, sha, collector.name);
    yield* Effect.tryPromise({
      try: () => mkdir(dir, { recursive: true }),
      catch: toError,
    });
    yield* writeJson(path.join(dir, "output.json"), output);
    yield* writeJson(path.join(dir, "collector.json"), {
      collector: collector.name,
      version: collector.version,
      cacheKey,
      completedAt: new Date().toISOString(),
      durationMs,
    } satisfies CollectorSidecar);
  });
