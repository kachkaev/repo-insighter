import { countKeys, isRecord } from "./helpers.ts";
import type { LockfileParser, LockfileSummary } from "./types.ts";

const versionString = (value: unknown): string =>
  typeof value === "number" || typeof value === "string" ? String(value) : "";

/** Recursively counts every resolved node in a legacy v1 `dependencies` tree. */
const countTree = (dependencies: unknown): number => {
  if (!isRecord(dependencies)) {
    return 0;
  }
  let total = 0;
  for (const entry of Object.values(dependencies)) {
    total += 1;
    if (isRecord(entry)) {
      total += countTree(entry["dependencies"]);
    }
  }
  return total;
};

/**
 * Parses an npm `package-lock.json` (also `npm-shrinkwrap.json`-shaped). Two
 * layouts exist: lockfileVersion 2/3 carry a flat `packages` map keyed by
 * install path — `""` and workspace folders are importers, `node_modules/…`
 * entries are the resolved graph (symlinked workspaces excluded). The legacy
 * v1 layout has only a nested `dependencies` tree, which records the resolved
 * graph but not which packages are direct, so direct counts read zero there.
 */
export const parseNpmLockfile = (
  content: string,
): LockfileSummary | undefined => {
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(root)) {
    return undefined;
  }
  const lockfileVersion = versionString(root["lockfileVersion"]);

  // v2/v3: the `packages` map is authoritative and splits direct vs resolved.
  if (isRecord(root["packages"])) {
    let resolvedCount = 0;
    let importerCount = 0;
    const direct = { prod: 0, dev: 0, optional: 0 };
    for (const [path, value] of Object.entries(root["packages"])) {
      const entry = isRecord(value) ? value : {};
      if (path.includes("node_modules/")) {
        // An installed package — unless it's a symlink to a local workspace.
        if (entry["link"] !== true) {
          resolvedCount += 1;
        }
      } else {
        // `""` (the root) or a workspace folder: an importer that declares deps.
        importerCount += 1;
        direct.prod += countKeys(entry["dependencies"]);
        direct.dev += countKeys(entry["devDependencies"]);
        direct.optional += countKeys(entry["optionalDependencies"]);
      }
    }
    return {
      packageManager: "npm",
      lockfileVersion: lockfileVersion || "3",
      resolvedCount,
      importerCount,
      direct,
    };
  }

  // v1: only the nested `dependencies` tree, no direct/dev breakdown.
  if (isRecord(root["dependencies"])) {
    return {
      packageManager: "npm",
      lockfileVersion: lockfileVersion || "1",
      resolvedCount: countTree(root["dependencies"]),
      importerCount: 1,
      direct: { prod: 0, dev: 0, optional: 0 },
    };
  }

  return undefined;
};

export const npmParser: LockfileParser = {
  fileName: "package-lock.json",
  parse: parseNpmLockfile,
};
