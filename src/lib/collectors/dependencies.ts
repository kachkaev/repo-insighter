import { Effect } from "effect";

import { arrayAt, numberAt, recordAt, stringAt } from "../json.ts";
import {
  type LockfileSummary,
  parserForFile,
} from "./lockfile-parsers/registry.ts";
import { scanTreeFilesWithBlobCache } from "./tree-files.ts";
import type { Collector, Fact } from "./types.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type DependencyLockfile = LockfileSummary & { readonly path: string };

type DependenciesOutput = {
  readonly lockfiles: readonly DependencyLockfile[];
};

/**
 * Dependency counts read from package-manager lockfiles: how many packages the
 * lockfile resolves in total, and how many direct/dev dependencies the
 * repository (or each package of a monorepo) declares. Version-aware — the
 * same package pinned to two versions counts twice.
 */
export const dependenciesCollector: Collector = {
  name: "dependencies",
  description:
    "Dependency counts from package-manager lockfiles: total resolved packages and direct/dev dependencies (pnpm, npm, yarn)",
  version: "3",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha, cacheKey }) =>
    scanTreeFilesWithBlobCache({
      repoRoot,
      sha,
      collectorName: "dependencies",
      cacheKey,
      include: (filePath) =>
        !filePath.includes("node_modules/") &&
        parserForFile(filePath) !== undefined,
      scanContent: (content, filePath) =>
        parserForFile(filePath)?.parse(content),
    }).pipe(
      Effect.map((files): DependenciesOutput => {
        const lockfiles: DependencyLockfile[] = [];
        for (const file of files) {
          if (!isRecord(file.result)) {
            continue;
          }
          const direct = recordAt(file.result, "direct");
          lockfiles.push({
            path: file.filePath,
            packageManager: stringAt(file.result, "packageManager"),
            lockfileVersion: stringAt(file.result, "lockfileVersion"),
            resolvedCount: numberAt(file.result, "resolvedCount"),
            importerCount: numberAt(file.result, "importerCount"),
            direct: {
              prod: numberAt(direct, "prod"),
              dev: numberAt(direct, "dev"),
              optional: numberAt(direct, "optional"),
            },
          });
        }
        lockfiles.sort((left, right) => left.path.localeCompare(right.path));
        return { lockfiles };
      }),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    const lockfiles = arrayAt(raw, "lockfiles");
    for (const lockfile of lockfiles) {
      const packageManager = stringAt(lockfile, "packageManager");
      const path = stringAt(lockfile, "path");
      const categories = { packageManager, lockfile: path };
      facts.push({
        metric: "dependencies.resolved",
        value: numberAt(lockfile, "resolvedCount"),
        categories,
      });
      const direct = recordAt(lockfile, "direct");
      for (const kind of ["prod", "dev", "optional"] as const) {
        facts.push({
          metric: "dependencies.direct",
          value: numberAt(direct, kind),
          categories: { ...categories, kind },
        });
      }
    }
    // A tree with no parseable lockfile still yields a fact so the dashboard can
    // tell "we scanned this commit and it had no dependencies" (zero) apart from
    // "this commit was never scanned" (a gap). Without it the two look identical.
    if (lockfiles.length === 0) {
      facts.push({ metric: "dependencies.scanned", value: 1 });
    }
    return facts;
  },
};
