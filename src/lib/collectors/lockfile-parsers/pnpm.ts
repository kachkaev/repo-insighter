// eslint-disable-next-line import/no-extraneous-dependencies -- bundled into dist by Vite (like effect), so it lives in devDependencies by design
import { parseAllDocuments } from "yaml";

import { countKeys, isRecord } from "./helpers.ts";
import type { LockfileParser, LockfileSummary } from "./types.ts";

const standardGroups = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

/**
 * Parses a pnpm-lock.yaml (v9). The file can hold several YAML documents: pnpm
 * writes a separate one for the package manager it manages for itself
 * (`packageManagerDependencies`), which we skip so its platform binaries don't
 * masquerade as project dependencies. Totals come from the real lockfile
 * document(s): `packages` for the resolved graph, `importers` for direct deps.
 */
export const parsePnpmLockfile = (
  content: string,
): LockfileSummary | undefined => {
  let documents;
  try {
    documents = parseAllDocuments(content);
  } catch {
    return undefined;
  }

  let lockfileVersion = "";
  let resolvedCount = 0;
  let importerCount = 0;
  const direct = { prod: 0, dev: 0, optional: 0 };
  let sawLockfile = false;

  for (const document of documents) {
    let root: unknown;
    try {
      root = document.toJS();
    } catch {
      continue;
    }
    if (!isRecord(root)) {
      continue;
    }

    const importerEntries = isRecord(root["importers"])
      ? Object.values(root["importers"]).filter(isRecord)
      : [];
    const projectImporters = importerEntries.filter((importer) =>
      standardGroups.some((group) => group in importer),
    );

    // A document with only `packageManagerDependencies`/`configDependencies`
    // importers is pnpm managing its own version — not project dependencies.
    const isPackageManagerDoc =
      importerEntries.length > 0 &&
      projectImporters.length === 0 &&
      importerEntries.some(
        (importer) =>
          "packageManagerDependencies" in importer ||
          "configDependencies" in importer,
      );
    if (isPackageManagerDoc) {
      continue;
    }

    sawLockfile = true;
    const version = root["lockfileVersion"];
    if (
      lockfileVersion === "" &&
      (typeof version === "string" || typeof version === "number")
    ) {
      lockfileVersion = String(version);
    }
    // `packages` holds one entry per resolved name@version; `snapshots` (peer
    // permutations) is the fallback for formats that omit `packages`.
    resolvedCount +=
      countKeys(root["packages"]) || countKeys(root["snapshots"]);

    for (const importer of projectImporters) {
      importerCount += 1;
      direct.prod += countKeys(importer["dependencies"]);
      direct.dev += countKeys(importer["devDependencies"]);
      direct.optional += countKeys(importer["optionalDependencies"]);
    }
  }

  if (!sawLockfile) {
    return undefined;
  }
  return {
    packageManager: "pnpm",
    lockfileVersion,
    resolvedCount,
    importerCount,
    direct,
  };
};

export const pnpmParser: LockfileParser = {
  fileName: "pnpm-lock.yaml",
  parse: parsePnpmLockfile,
};
