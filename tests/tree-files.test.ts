import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import { scanTreeFilesWithBlobCache } from "../src/lib/collectors/tree-files.ts";

function git(cwd: string, ...args: readonly string[]) {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args],
    { cwd, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

// A matched file whose scan yields undefined (e.g. a package.json that isn't a
// JSON object) must not break the blob-cache write — JSON.stringify(undefined)
// is undefined, which cannot be bound to SQLite and used to fail the batch.
test("scanTreeFilesWithBlobCache caches an undefined scan result without failing", async () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-tf-"));

  try {
    git(repoPath, "init", "-b", "main");
    writeFileSync(
      path.join(repoPath, "package.json"),
      JSON.stringify({ dependencies: { a: "^1" } }),
    );
    // Valid JSON, but an array — the kind of package.json a scan skips.
    mkdirSync(path.join(repoPath, "fixture"));
    writeFileSync(path.join(repoPath, "fixture", "package.json"), "[]");
    git(repoPath, "add", ".");
    git(repoPath, "commit", "-m", "Add manifests");
    const sha = git(repoPath, "rev-parse", "HEAD");

    const scan = Effect.runPromise(
      scanTreeFilesWithBlobCache({
        repoRoot: repoPath,
        sha,
        collectorName: "test",
        cacheKey: "v1",
        include: (filePath) => filePath.endsWith("package.json"),
        scanContent: (content) => {
          const parsed: unknown = JSON.parse(content);
          return typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? { ok: true }
            : undefined;
        },
      }),
    );

    const results = await scan;
    const byPath = new Map(results.map((file) => [file.filePath, file.result]));
    expect(byPath.get("package.json")).toStrictEqual({ ok: true });
    // The skipped file still appears (as a non-record), and the run persisted a
    // cache entry for it rather than throwing.
    expect(byPath.get("fixture/package.json")).not.toStrictEqual({ ok: true });
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});
