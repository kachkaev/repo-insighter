import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

function runCli(...args: readonly string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
}

function runGit(cwd: string, ...args: readonly string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const commitEnvironment = {
  GIT_AUTHOR_DATE: "2026-01-02T03:04:05Z",
  GIT_COMMITTER_DATE: "2026-01-02T03:04:05Z",
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "author@example.com",
  GIT_COMMITTER_NAME: "Test Author",
  GIT_COMMITTER_EMAIL: "author@example.com",
};

function createFixtureRepo(): string {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-test-"));
  runGit(repoPath, "init", "-b", "main");

  for (const [key, value] of Object.entries(commitEnvironment)) {
    process.env[key] = value;
  }

  writeFileSync(path.join(repoPath, "hello.txt"), "hello\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Add hello");

  writeFileSync(path.join(repoPath, "hello.txt"), "hello world\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Update hello");

  return repoPath;
}

void test("root help lists the available subcommands", () => {
  const result = runCli("--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /SUBCOMMANDS/);
  assert.match(result.stdout, /scan/);
});

void test("scan help exposes the repo flag", () => {
  const result = runCli("scan", "--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--repo string/);
});

void test("scan summarizes a repository", () => {
  const repoPath = createFixtureRepo();

  try {
    const result = runCli("scan", "--repo", repoPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Commits: 2/);
    assert.match(result.stdout, /Authors: 1/);
    assert.match(result.stdout, /First commit: 2026-01-02T03:04:05/);
    assert.match(result.stdout, /Latest commit: 2026-01-02T03:04:05/);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

void test("scan fails gracefully outside a git repository", () => {
  const nonRepoPath = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-no-"));

  try {
    const result = runCli("scan", "--repo", nonRepoPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Not a git repository/);
  } finally {
    rmSync(nonRepoPath, { force: true, recursive: true });
  }
});
