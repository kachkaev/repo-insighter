import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  writeFileSync(path.join(repoPath, "readme.md"), "# Fixture\n");
  runGit(repoPath, "add", ".");
  runGit(repoPath, "commit", "-m", "Update hello, add readme");

  return repoPath;
}

void test("root help lists the available subcommands", () => {
  const result = runCli("--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /SUBCOMMANDS/);
  assert.match(result.stdout, /scan/);
  assert.match(result.stdout, /status/);
});

void test("scan help exposes the flags", () => {
  const result = runCli("scan", "--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--repo string/);
  assert.match(result.stdout, /--collectors string/);
  assert.match(result.stdout, /--max-commits integer/);
});

// tokei isn't guaranteed on CI runners, so e2e scans avoid the languages collector.
const ciSafeCollectors =
  "commit-meta,churn,file-types,directives,todo-comments,survival";

void test("scan collects snapshots into the catalog and is resumable", () => {
  const repoPath = createFixtureRepo();

  try {
    const firstRun = runCli(
      "scan",
      "--repo",
      repoPath,
      "--collectors",
      ciSafeCollectors,
    );

    assert.equal(firstRun.status, 0, firstRun.stderr);
    assert.match(firstRun.stdout, /Commits: 2 \(1 authors/);
    // 5 all-sampled collectors × 2 commits + survival on 1 monthly sample.
    assert.match(
      firstRun.stdout,
      /Collector runs: 11 new, 0 already collected/,
    );

    const headSha = runGit(repoPath, "rev-parse", "HEAD").trim();
    const commitDir = path.join(
      repoPath,
      ".repo-insighter",
      "commits",
      headSha,
    );
    for (const collector of ["commit-meta", "churn", "file-types"]) {
      assert.ok(
        existsSync(path.join(commitDir, collector, "output.json")),
        `${collector} output should exist`,
      );
      assert.ok(
        existsSync(path.join(commitDir, collector, "collector.json")),
        `${collector} sidecar should exist`,
      );
    }

    const commitMeta = readFileSync(
      path.join(commitDir, "commit-meta", "output.json"),
      "utf8",
    );
    assert.match(commitMeta, /"subject": "Update hello, add readme"/);
    assert.match(commitMeta, /"authorEmail": "author@example\.com"/);

    const churn = readFileSync(
      path.join(commitDir, "churn", "output.json"),
      "utf8",
    );
    assert.match(churn, /"filesChanged": 2/);

    const fileTypes = readFileSync(
      path.join(commitDir, "file-types", "output.json"),
      "utf8",
    );
    assert.match(fileTypes, /"totalFiles": 2/);

    const secondRun = runCli(
      "scan",
      "--repo",
      repoPath,
      "--collectors",
      ciSafeCollectors,
    );
    assert.equal(secondRun.status, 0, secondRun.stderr);
    assert.match(
      secondRun.stdout,
      /Collector runs: 0 new, 11 already collected/,
    );
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

void test("status reports catalog coverage", () => {
  const repoPath = createFixtureRepo();

  try {
    const beforeScan = runCli("status", "--repo", repoPath);
    assert.equal(beforeScan.status, 0, beforeScan.stderr);
    assert.match(beforeScan.stdout, /No catalog found/);

    runCli("scan", "--repo", repoPath, "--collectors", "commit-meta");

    const afterScan = runCli("status", "--repo", repoPath);
    assert.equal(afterScan.status, 0, afterScan.stderr);
    assert.match(afterScan.stdout, /commit-meta: 2\/2 commits collected/);
    assert.match(afterScan.stdout, /churn: 0\/2 commits collected/);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

void test("scan rejects unknown collectors", () => {
  const repoPath = createFixtureRepo();

  try {
    const result = runCli("scan", "--repo", repoPath, "--collectors", "nope");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown collector: nope/);
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

void test("bare invocation runs the whole pipeline and serves the dashboard", async (testContext) => {
  if (
    !existsSync(path.join(rootDirectory, "dist", "dashboard", "index.html"))
  ) {
    testContext.skip("dist/dashboard not built");
    return;
  }

  const repoPath = createFixtureRepo();
  const port = 4900 + Math.floor(Math.random() * 90);
  const { spawn } = await import("node:child_process");

  const pipeline = spawn(
    process.execPath,
    ["src/cli.ts", "--repo", repoPath, "--port", String(port), "--no-open"],
    { cwd: rootDirectory, stdio: ["ignore", "pipe", "pipe"] },
  );

  try {
    let output = "";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out. Output so far:\n${output}`));
      }, 30_000);
      pipeline.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("Serving on")) {
          clearTimeout(timer);
          resolve();
        }
      });
      pipeline.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      pipeline.on("exit", () => {
        clearTimeout(timer);
        reject(new Error(`Pipeline exited early. Output:\n${output}`));
      });
    });

    assert.match(output, /Step 1\/3/);
    assert.match(output, /Step 2\/3/);
    assert.match(output, /Indexed 2 commits/);

    const response = await fetch(`http://localhost:${port}/dashboard.json`);
    assert.equal(response.ok, true);
    const body = await response.text();
    assert.match(body, /"commitCount":2/);
  } finally {
    pipeline.kill();
    rmSync(repoPath, { force: true, recursive: true });
  }
});
