import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";

import { runGit } from "./git.ts";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Materializes a commit into a detached temporary worktree, runs `use` and
 * always cleans up. The user's own working tree is never touched: the checkout
 * lives under the OS temp directory and is removed via `git worktree remove`.
 */
export const withTemporaryWorktree = <A>(
  repoRoot: string,
  sha: string,
  use: (worktreePath: string) => Effect.Effect<A, Error>,
): Effect.Effect<A, Error> =>
  Effect.gen(function* () {
    const parentDir = yield* Effect.tryPromise({
      try: () => mkdtemp(path.join(os.tmpdir(), "repo-insighter-wt-")),
      catch: toError,
    });
    const worktreePath = path.join(parentDir, sha.slice(0, 12));

    yield* runGit([
      "-C",
      repoRoot,
      "worktree",
      "add",
      "--detach",
      "--force",
      worktreePath,
      sha,
    ]);

    return yield* use(worktreePath).pipe(
      Effect.ensuring(
        runGit([
          "-C",
          repoRoot,
          "worktree",
          "remove",
          "--force",
          worktreePath,
        ]).pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: () => rm(parentDir, { force: true, recursive: true }),
              catch: toError,
            }),
          ),
          Effect.ignore,
        ),
      ),
    );
  });
