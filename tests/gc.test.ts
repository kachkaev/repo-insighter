import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import {
  getBlobCache,
  listBlobCacheNamespaces,
  pruneBlobCacheNamespaces,
} from "../src/lib/blob-cache.ts";
import { openCatalog, writeCollectorOutput } from "../src/lib/catalog.ts";
import { collectorCacheKey } from "../src/lib/collectors/cache-key.ts";
import { builtInCollectors } from "../src/lib/collectors/roster.ts";
import { loadConfig } from "../src/lib/config.ts";
import { runGc } from "../src/lib/gc.ts";

const commitEnvironment = {
  GIT_AUTHOR_DATE: "2026-01-02T03:04:05Z",
  GIT_COMMITTER_DATE: "2026-01-02T03:04:05Z",
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "author@example.com",
  GIT_COMMITTER_NAME: "Test Author",
  GIT_COMMITTER_EMAIL: "author@example.com",
};

function runGit(cwd: string, ...args: readonly string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...commitEnvironment },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function collectorNamed(name: string) {
  const collector = builtInCollectors.find(
    (candidate) => candidate.name === name,
  );
  if (!collector) {
    throw new Error(`No such collector: ${name}`);
  }
  return collector;
}

/**
 * A repository whose history has a side branch merged back into main, so that
 * one commit is reachable from HEAD yet off its first-parent chain.
 */
function createMergeFixtureRepo() {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-gc-"));
  runGit(repoPath, "init", "-b", "main");

  writeFileSync(path.join(repoPath, "hello.txt"), "hello\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Add hello");
  const baseSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  runGit(repoPath, "checkout", "-b", "side");
  writeFileSync(path.join(repoPath, "side.txt"), "side\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Add side");
  const sideSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  runGit(repoPath, "checkout", "main");
  runGit(repoPath, "merge", "--no-ff", "-m", "Merge side", "side");
  const mergeSha = runGit(repoPath, "rev-parse", "HEAD").trim();

  return { repoPath, baseSha, sideSha, mergeSha };
}

/** Writes a realistic catalog output, sidecar included, for one (commit, collector). */
async function seedOutput(
  repoRoot: string,
  sha: string,
  collectorName: string,
) {
  const collector = collectorNamed(collectorName);
  await Effect.runPromise(
    Effect.gen(function* () {
      const catalog = yield* openCatalog(repoRoot);
      const config = yield* loadConfig(repoRoot);
      yield* writeCollectorOutput({
        catalog,
        sha,
        collector,
        cacheKey: collectorCacheKey(collector, config),
        output: {},
        durationMs: 1,
      });
    }),
  );
}

function outputPath(repoRoot: string, sha: string, collectorName: string) {
  return path.join(
    repoRoot,
    ".repo-dive",
    "commits",
    sha,
    collectorName,
    "output.json",
  );
}

test("gc --off-mainline reclaims snapshots off the first-parent chain only", async () => {
  const { repoPath, baseSha, sideSha, mergeSha } = createMergeFixtureRepo();

  try {
    for (const sha of [baseSha, sideSha, mergeSha]) {
      // file-types is a tree collector, commit-meta a log one.
      await seedOutput(repoPath, sha, "file-types");
      await seedOutput(repoPath, sha, "commit-meta");
    }

    await Effect.runPromise(
      runGc({ repoPath, offMainline: true, dryRun: true, yes: true }),
    );
    expect(
      existsSync(outputPath(repoPath, sideSha, "file-types")),
      "--dry-run must leave the catalog alone",
    ).toBe(true);

    await Effect.runPromise(runGc({ repoPath, offMainline: true, yes: true }));

    expect(
      existsSync(outputPath(repoPath, sideSha, "file-types")),
      "the side branch's tree snapshot is off the mainline",
    ).toBe(false);
    expect(
      existsSync(outputPath(repoPath, sideSha, "commit-meta")),
      "a commit's own metadata is valid wherever the commit sits",
    ).toBe(true);
    for (const sha of [baseSha, mergeSha]) {
      expect(
        existsSync(outputPath(repoPath, sha, "file-types")),
        "mainline snapshots stay",
      ).toBe(true);
    }
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("gc --unreachable leaves off-mainline snapshots alone", async () => {
  const { repoPath, sideSha } = createMergeFixtureRepo();

  try {
    await seedOutput(repoPath, sideSha, "file-types");

    await Effect.runPromise(runGc({ repoPath, unreachable: true, yes: true }));

    expect(
      existsSync(outputPath(repoPath, sideSha, "file-types")),
      "the side commit is still reachable from HEAD",
    ).toBe(true);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("gc --stale drops blob-cache namespaces no collector can look up", async () => {
  const { repoPath } = createMergeFixtureRepo();

  try {
    const collector = collectorNamed("directives");
    const config = await Effect.runPromise(loadConfig(repoPath));
    const liveCacheKey = collectorCacheKey(collector, config);
    const cache = getBlobCache(repoPath);
    const entries = new Map([["0".repeat(40), "[]"]]);

    cache.setMany(collector.name, liveCacheKey, entries);
    // An earlier version of the same collector, and one that no longer exists.
    cache.setMany(collector.name, "000000000000", entries);
    cache.setMany("retired-collector", liveCacheKey, entries);

    expect(listBlobCacheNamespaces(repoPath)).toHaveLength(3);

    await Effect.runPromise(
      runGc({ repoPath, stale: true, dryRun: true, yes: true }),
    );
    expect(
      listBlobCacheNamespaces(repoPath),
      "--dry-run must leave the cache alone",
    ).toHaveLength(3);

    await Effect.runPromise(runGc({ repoPath, stale: true, yes: true }));

    expect(listBlobCacheNamespaces(repoPath)).toEqual([
      { collector: collector.name, cacheKey: liveCacheKey, entryCount: 1 },
    ]);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("pruneBlobCacheNamespaces compacts the file it prunes", () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cache-"));

  try {
    const cache = getBlobCache(repoPath);
    const bulk = new Map(
      Array.from({ length: 2000 }, (_, index) => [
        String(index).padStart(40, "0"),
        JSON.stringify({
          rules: Array.from({ length: 10 }, () => "no-shadow"),
        }),
      ]),
    );
    cache.setMany("directives", "deadbeef0000", bulk);
    cache.setMany(
      "directives",
      "cafebabe1111",
      new Map([["a".repeat(40), "[]"]]),
    );

    const bytesReclaimed = pruneBlobCacheNamespaces(repoPath, [
      { collector: "directives", cacheKey: "deadbeef0000" },
    ]);

    expect(
      bytesReclaimed,
      "VACUUM should hand back the freed pages",
    ).toBeGreaterThan(0);
    expect(listBlobCacheNamespaces(repoPath)).toEqual([
      { collector: "directives", cacheKey: "cafebabe1111", entryCount: 1 },
    ]);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});
