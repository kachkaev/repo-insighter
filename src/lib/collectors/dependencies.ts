import { Effect } from "effect";
// eslint-disable-next-line import/no-extraneous-dependencies -- bundled into dist by Vite (like effect), so it lives in devDependencies by design
import { parseAllDocuments } from "yaml";

import { arrayAt, numberAt, recordAt, stringAt } from "../json.ts";
import { scanTreeFilesWithBlobCache } from "./tree-files.ts";
import type { Collector, Fact } from "./types.ts";

/**
 * A package manager's take on one dependency-manifest/lockfile pair. The shape
 * is deliberately manager-agnostic — pnpm is the only parser implemented so
 * far, but npm/yarn/bun/cargo would each populate the same summary from their
 * own lockfile and slot in via the {@link lockfileParsers} registry.
 */
export type LockfileSummary = {
  /** e.g. "pnpm"; becomes the `packageManager` category on every fact. */
  readonly packageManager: string;
  readonly lockfileVersion: string;
  /** Distinct resolved packages (name + version) across the whole graph. */
  readonly resolvedCount: number;
  /** Workspace packages declaring dependencies (1 outside a monorepo). */
  readonly importerCount: number;
  /**
   * Direct dependencies declared across all importers, counted as occurrences
   * so a monorepo's duplicates add up and distinct versions of the same
   * package count separately (React 19 in one package + React 18 in another =
   * two prod entries).
   */
  readonly direct: {
    readonly prod: number;
    readonly dev: number;
    readonly optional: number;
  };
};

type LockfileParser = {
  /** Lockfile basename this parser claims, e.g. "pnpm-lock.yaml". */
  readonly fileName: string;
  /** Returns undefined for content it cannot make sense of (skipped). */
  readonly parse: (content: string) => LockfileSummary | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const countKeys = (value: unknown): number =>
  isRecord(value) ? Object.keys(value).length : 0;

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

/** Registry of lockfile parsers, one per package manager. pnpm-only for now. */
const lockfileParsers: readonly LockfileParser[] = [
  { fileName: "pnpm-lock.yaml", parse: parsePnpmLockfile },
];

const basenameOf = (filePath: string): string =>
  filePath.split("/").at(-1) ?? "";

const parserFor = (filePath: string): LockfileParser | undefined =>
  lockfileParsers.find((parser) => parser.fileName === basenameOf(filePath));

type DependencyLockfile = LockfileSummary & { readonly path: string };

type DependenciesOutput = {
  readonly lockfiles: readonly DependencyLockfile[];
};

const collectorVersion = "1";

/**
 * Dependency counts read from package-manager lockfiles: how many packages the
 * lockfile resolves in total, and how many direct/dev dependencies the
 * repository (or each package of a monorepo) declares. Version-aware — the
 * same package pinned to two versions counts twice.
 */
export const dependenciesCollector: Collector = {
  name: "dependencies",
  description:
    "Dependency counts from package-manager lockfiles: total resolved packages and direct/dev dependencies (pnpm)",
  version: collectorVersion,
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    scanTreeFilesWithBlobCache({
      repoRoot,
      sha,
      collectorName: "dependencies",
      collectorVersion,
      include: (filePath) =>
        !filePath.includes("node_modules/") &&
        parserFor(filePath) !== undefined,
      scanContent: (content, filePath) => parserFor(filePath)?.parse(content),
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
    for (const lockfile of arrayAt(raw, "lockfiles")) {
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
    return facts;
  },
};
