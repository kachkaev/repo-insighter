import { access } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";

import {
  catalogDirName,
  findLegacyCatalog,
  isCollected,
  legacyCatalogHint,
} from "./catalog.ts";
import { collectorCacheKey } from "./collectors/cache-key.ts";
import { builtInCollectors } from "./collectors/roster.ts";
import { loadConfig } from "./config.ts";
import { listCommits, resolveRepoRoot } from "./scan.ts";

const exists = (filePath: string) =>
  Effect.promise(() =>
    access(filePath).then(
      () => true,
      () => false,
    ),
  );

export const runStatus = ({
  repoPath,
}: {
  readonly repoPath: string;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const commits = yield* listCommits(repoRoot);
    const config = yield* loadConfig(repoRoot);
    const catalogPath = path.join(repoRoot, catalogDirName);

    if (!(yield* exists(path.join(catalogPath, "catalog.json")))) {
      const legacyRootPath = yield* findLegacyCatalog(repoRoot);
      yield* Console.log(
        [
          `Repository: ${repoRoot}`,
          `Commits: ${commits.length}`,
          legacyRootPath === undefined
            ? `No catalog found at ${catalogPath} — run \`repo-dive scan\` first.`
            : legacyCatalogHint(legacyRootPath),
        ].join("\n"),
      );
      return;
    }

    const catalog = { repoRoot, rootPath: catalogPath };
    const lines = [
      `Repository: ${repoRoot}`,
      `Commits: ${commits.length}`,
      `Catalog: ${catalogPath}`,
    ];

    for (const collector of builtInCollectors) {
      let collected = 0;
      const cacheKey = collectorCacheKey(collector, config);
      yield* Effect.forEach(
        commits,
        (commit) =>
          isCollected(catalog, commit.hash, collector, cacheKey).pipe(
            Effect.map((done) => {
              if (done) {
                collected += 1;
              }
            }),
          ),
        { concurrency: 16, discard: true },
      );
      lines.push(
        `  ${collector.name}: ${collected}/${commits.length} commits collected`,
      );
    }

    yield* Console.log(lines.join("\n"));
  });
