import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import { withTemporaryWorktree } from "../src/lib/worktree.ts";

function runGit(cwd: string, ...args: readonly string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

test("withTemporaryWorktree checks out inertly and cleans up", async () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-dive-wt-"));

  try {
    runGit(repoPath, "init", "-b", "main");
    writeFileSync(path.join(repoPath, "hello.txt"), "hello\n");
    runGit(repoPath, "add", ".");
    runGit(
      repoPath,
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "Init",
    );
    const sha = runGit(repoPath, "rev-parse", "HEAD").trim();

    // A hostile/failing post-checkout hook must neither run nor break the scan.
    const markerPath = path.join(repoPath, "hook-ran");
    const hookPath = path.join(repoPath, ".git", "hooks", "post-checkout");
    writeFileSync(hookPath, `#!/bin/sh\ntouch "${markerPath}"\nexit 1\n`);
    chmodSync(hookPath, 0o755);

    let seenWorktreePath = "";
    const sawFile = await Effect.runPromise(
      withTemporaryWorktree(repoPath, sha, (worktreePath) =>
        Effect.sync(() => {
          seenWorktreePath = worktreePath;
          return existsSync(path.join(worktreePath, "hello.txt"));
        }),
      ),
    );

    expect(sawFile).toBe(true);
    expect(existsSync(markerPath), "repo hook must not run").toBe(false);
    expect(
      existsSync(seenWorktreePath),
      "temporary worktree must be removed",
    ).toBe(false);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});
