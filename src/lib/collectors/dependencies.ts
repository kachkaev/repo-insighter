import { Effect } from "effect";

import { arrayAt, numberAt, recordAt, stringAt } from "../json.ts";
import {
  type LockfileSummary,
  parserForFile,
} from "./lockfile-parsers/registry.ts";
import {
  type ManifestSummary,
  parsePackageManifest,
} from "./package-manifest.ts";
import { scanTreeFilesWithBlobCache } from "./tree-files.ts";
import type { Collector, Fact } from "./types.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const basenameOf = (filePath: string): string =>
  filePath.split("/").at(-1) ?? "";

type DependencyLockfile = LockfileSummary & { readonly path: string };
type DependencyManifest = ManifestSummary & { readonly path: string };

type DependenciesOutput = {
  readonly lockfiles: readonly DependencyLockfile[];
  readonly manifests: readonly DependencyManifest[];
};

/** Tagged per-file scan result, so one pass can carry both file kinds. */
type ScanResult =
  | { readonly kind: "lockfile"; readonly summary: LockfileSummary }
  | { readonly kind: "manifest"; readonly summary: ManifestSummary };

const scanDependencyFile = (
  content: string,
  filePath: string,
): ScanResult | undefined => {
  const parser = parserForFile(filePath);
  if (parser) {
    const summary = parser.parse(content);
    return summary ? { kind: "lockfile", summary } : undefined;
  }
  if (basenameOf(filePath) === "package.json") {
    const summary = parsePackageManifest(content);
    return summary ? { kind: "manifest", summary } : undefined;
  }
  return undefined;
};

/**
 * Dependency counts from a commit's tree, from two complementary sources:
 * lockfiles give the resolved graph size (total packages, per package manager),
 * while `package.json` manifests give the direct/dev/optional dependencies the
 * project declares — the authoritative source for those, since some managers'
 * lockfiles (npm v1, yarn) do not record which packages are direct, and a
 * repository may declare dependencies before any lockfile exists. Both are
 * counted as occurrences, so a monorepo's duplicates add up and distinct
 * versions of the same package count separately.
 */
export const dependenciesCollector: Collector = {
  name: "dependencies",
  description:
    "Dependency counts: total resolved packages from lockfiles (pnpm, npm, yarn) and direct/dev/optional dependencies from package.json manifests",
  version: "4",
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
        (parserForFile(filePath) !== undefined ||
          basenameOf(filePath) === "package.json"),
      scanContent: (content, filePath) => scanDependencyFile(content, filePath),
    }).pipe(
      Effect.map((files): DependenciesOutput => {
        const lockfiles: DependencyLockfile[] = [];
        const manifests: DependencyManifest[] = [];
        for (const file of files) {
          if (!isRecord(file.result)) {
            continue;
          }
          const summary = recordAt(file.result, "summary");
          if (stringAt(file.result, "kind") === "lockfile") {
            lockfiles.push({
              path: file.filePath,
              packageManager: stringAt(summary, "packageManager"),
              lockfileVersion: stringAt(summary, "lockfileVersion"),
              resolvedCount: numberAt(summary, "resolvedCount"),
            });
          } else if (stringAt(file.result, "kind") === "manifest") {
            const direct = recordAt(summary, "direct");
            manifests.push({
              path: file.filePath,
              direct: {
                prod: numberAt(direct, "prod"),
                dev: numberAt(direct, "dev"),
                optional: numberAt(direct, "optional"),
              },
            });
          }
        }
        lockfiles.sort((left, right) => left.path.localeCompare(right.path));
        manifests.sort((left, right) => left.path.localeCompare(right.path));
        return { lockfiles, manifests };
      }),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    const lockfiles = arrayAt(raw, "lockfiles");
    for (const lockfile of lockfiles) {
      facts.push({
        metric: "dependencies.resolved",
        value: numberAt(lockfile, "resolvedCount"),
        categories: {
          packageManager: stringAt(lockfile, "packageManager"),
          lockfile: stringAt(lockfile, "path"),
        },
      });
    }
    const manifests = arrayAt(raw, "manifests");
    for (const manifest of manifests) {
      const path = stringAt(manifest, "path");
      // One per package.json, so the dashboard can chart how many manifests
      // (workspaces) a repository carries over time.
      facts.push({
        metric: "dependencies.manifest",
        value: 1,
        categories: { manifest: path },
      });
      const direct = recordAt(manifest, "direct");
      for (const kind of ["prod", "dev", "optional"] as const) {
        facts.push({
          metric: "dependencies.direct",
          value: numberAt(direct, kind),
          categories: { manifest: path, kind },
        });
      }
    }
    // A tree with neither a lockfile nor a manifest still yields a fact so the
    // dashboard can tell "we scanned this commit and it had no dependencies"
    // (zero) apart from "this commit was never scanned" (a gap). Without it the
    // two look identical.
    if (lockfiles.length === 0 && manifests.length === 0) {
      facts.push({ metric: "dependencies.scanned", value: 1 });
    }
    return facts;
  },
};
