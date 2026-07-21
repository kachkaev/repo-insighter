import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { arrayAt, numberAt, recordAt, stringAt } from "../src/lib/json.ts";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

// Several tests exercise the full pipeline, which needs the built dashboard.
const dashboardBuilt = existsSync(
  path.join(rootDirectory, "dist", "dashboard", "index.html"),
);

function runCli(...args: readonly string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
}

function runGit(cwd: string, ...args: readonly string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
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

test("root help lists the available subcommands", () => {
  const result = runCli("--help");

  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/SUBCOMMANDS/);
  expect(result.stdout).toMatch(/scan/);
  expect(result.stdout).toMatch(/status/);
});

test("scan help exposes the flags", () => {
  const result = runCli("scan", "--help");

  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/--repo string/);
  expect(result.stdout).toMatch(/--collectors string/);
  expect(result.stdout).toMatch(/--max-commits integer/);
});

// tokei isn't guaranteed on CI runners, so e2e scans avoid the languages collector.
const ciSafeCollectors =
  "commit-meta,churn,file-types,directives,todo-comments,survival";

test("scan collects snapshots into the catalog and is resumable", () => {
  const repoPath = createFixtureRepo();

  try {
    const firstRun = runCli(
      "scan",
      "--repo",
      repoPath,
      "--collectors",
      ciSafeCollectors,
    );

    expect(firstRun.status, firstRun.stderr).toBe(0);
    expect(firstRun.stdout).toMatch(/Commits: 2 \(1 authors/);
    // 5 all-sampled collectors × 2 commits + survival on 1 monthly sample.
    expect(firstRun.stdout).toMatch(
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
      expect(
        existsSync(path.join(commitDir, collector, "output.json")),
        `${collector} output should exist`,
      ).toBe(true);
      expect(
        existsSync(path.join(commitDir, collector, "collector.json")),
        `${collector} sidecar should exist`,
      ).toBe(true);
    }

    const commitMeta = readFileSync(
      path.join(commitDir, "commit-meta", "output.json"),
      "utf8",
    );
    expect(commitMeta).toMatch(/"subject": "Update hello, add readme"/);
    expect(commitMeta).toMatch(/"authorEmail": "author@example\.com"/);

    const churn = readFileSync(
      path.join(commitDir, "churn", "output.json"),
      "utf8",
    );
    expect(churn).toMatch(/"filesChanged": 2/);

    const fileTypes = readFileSync(
      path.join(commitDir, "file-types", "output.json"),
      "utf8",
    );
    expect(fileTypes).toMatch(/"totalFiles": 2/);

    const secondRun = runCli(
      "scan",
      "--repo",
      repoPath,
      "--collectors",
      ciSafeCollectors,
    );
    expect(secondRun.status, secondRun.stderr).toBe(0);
    expect(secondRun.stdout).toMatch(
      /Collector runs: 0 new, 11 already collected/,
    );
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("status reports catalog coverage", () => {
  const repoPath = createFixtureRepo();

  try {
    const beforeScan = runCli("status", "--repo", repoPath);
    expect(beforeScan.status, beforeScan.stderr).toBe(0);
    expect(beforeScan.stdout).toMatch(/No catalog found/);

    runCli("scan", "--repo", repoPath, "--collectors", "commit-meta");

    const afterScan = runCli("status", "--repo", repoPath);
    expect(afterScan.status, afterScan.stderr).toBe(0);
    expect(afterScan.stdout).toMatch(/commit-meta: 2\/2 commits collected/);
    expect(afterScan.stdout).toMatch(/churn: 0\/2 commits collected/);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("scan rejects unknown collectors", () => {
  const repoPath = createFixtureRepo();

  try {
    const result = runCli("scan", "--repo", repoPath, "--collectors", "nope");

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown collector: nope/);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("scan fails gracefully outside a git repository", () => {
  const nonRepoPath = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-no-"));

  try {
    const result = runCli("scan", "--repo", nonRepoPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Not a git repository/);
  } finally {
    rmSync(nonRepoPath, { force: true, recursive: true });
  }
});

test.skipIf(!dashboardBuilt)(
  "bare invocation runs the whole pipeline and serves the dashboard",
  async () => {
    const repoPath = createFixtureRepo();
    const port = 4900 + Math.floor(Math.random() * 90);

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

      expect(output).toMatch(/Step 1\/3/);
      expect(output).toMatch(/Step 2\/3/);
      expect(output).toMatch(/Indexed 2 commits/);

      const response = await fetch(`http://localhost:${port}/dashboard.json`);
      expect(response.ok).toBe(true);
      const body = await response.text();
      expect(body).toMatch(/"commitCount":2/);
    } finally {
      pipeline.kill();
      rmSync(repoPath, { force: true, recursive: true });
    }
  },
);

test.skipIf(!dashboardBuilt)(
  "report exports a self-contained HTML file",
  () => {
    const repoPath = createFixtureRepo();

    try {
      runCli("scan", "--repo", repoPath, "--collectors", "commit-meta,churn");
      runCli("index", "--repo", repoPath);
      const result = runCli("report", "--repo", repoPath);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/self-contained/);

      const reportHtml = readFileSync(
        path.join(repoPath, ".repo-insighter", "index", "report.html"),
        "utf8",
      );
      expect(reportHtml).toMatch(/window\.__REPO_INSIGHTER_DATA__ = \{/);
      expect(reportHtml).toMatch(/"commitCount":2/);
      expect(reportHtml).not.toMatch(/src="\/assets/);
      expect(reportHtml).not.toMatch(/<link rel="stylesheet"/);
    } finally {
      rmSync(repoPath, { force: true, recursive: true });
    }
  },
);

test("index merges contributor aliases from repo-insighter.config.ts", () => {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), "repo-insighter-alias-"));
  runGit(repoPath, "init", "-b", "main");

  function commitAs(email: string, name: string, subject: string) {
    for (const [key, value] of Object.entries({
      ...commitEnvironment,
      GIT_AUTHOR_EMAIL: email,
      GIT_AUTHOR_NAME: name,
      GIT_COMMITTER_EMAIL: email,
      GIT_COMMITTER_NAME: name,
    })) {
      process.env[key] = value;
    }
    writeFileSync(path.join(repoPath, "file.txt"), `${subject}\n`);
    runGit(repoPath, "add", ".");
    runGit(repoPath, "commit", "-m", subject);
  }

  try {
    commitAs("alice@work.example", "Alice", "first");
    commitAs("alice@personal.example", "Alice", "second");
    // A bot identity — its kind should be auto-derived without config.
    commitAs(
      "29139614+renovate[bot]@users.noreply.github.com",
      "renovate[bot]",
      "bump deps",
    );

    // A .ts config (exercises Node's type stripping through the real CLI). The
    // `defineConfig` import is covered by unit tests — a temp repo has no
    // node_modules to resolve `repo-insighter/config` from, so use a typed
    // plain object here.
    writeFileSync(
      path.join(repoPath, "repo-insighter.config.ts"),
      [
        "const config = {",
        "  contributors: {",
        "    aliases: [",
        "      {",
        '        emails: ["alice@work.example", "alice@personal.example"],',
        '        displayName: "Alice A.",',
        '        url: "https://github.com/alice",',
        "      },",
        "    ],",
        "  },",
        "};",
        "export default config;",
        "",
      ].join("\n"),
    );

    runCli("scan", "--repo", repoPath, "--collectors", "commit-meta,churn");
    const indexRun = runCli("index", "--repo", repoPath);
    expect(indexRun.status, indexRun.stderr).toBe(0);

    const dashboard: unknown = JSON.parse(
      readFileSync(
        path.join(repoPath, ".repo-insighter", "index", "dashboard.json"),
        "utf8",
      ),
    );
    const contributorCount = numberAt(
      recordAt(dashboard, "repo"),
      "contributorCount",
    );
    expect(contributorCount, "Alice's aliases collapse; bot is separate").toBe(
      2,
    );

    const contributors = arrayAt(dashboard, "contributors");
    const alice = contributors.find(
      (row) => stringAt(row, "email") === "alice@work.example",
    );
    expect(alice, "Alice should be present").toBeTruthy();
    expect(stringAt(alice, "name")).toBe("Alice A.");
    expect(stringAt(alice, "url")).toBe("https://github.com/alice");
    expect(stringAt(alice, "kind")).toBe("human");
    expect(numberAt(alice, "commits")).toBe(2);

    const bot = contributors.find((row) => stringAt(row, "kind") === "bot");
    expect(bot, "renovate should be auto-classified as a bot").toBeTruthy();
    expect(stringAt(bot, "email")).toBe("renovate[bot]");
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("query runs read-only SQL against the cube", () => {
  const repoPath = createFixtureRepo();

  try {
    runCli("scan", "--repo", repoPath, "--collectors", "commit-meta,churn");
    runCli("index", "--repo", repoPath);

    const result = runCli(
      "query",
      "--repo",
      repoPath,
      "--json",
      "SELECT count(*) AS n FROM commits",
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/"n": 2/);

    const rejected = runCli("query", "--repo", repoPath, "DELETE FROM facts");
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/Only read-only queries/);
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});

test("mcp serves the cube over stdio", async () => {
  const repoPath = createFixtureRepo();

  try {
    runCli("scan", "--repo", repoPath, "--collectors", "commit-meta");
    runCli("index", "--repo", repoPath);

    const server = spawn(
      process.execPath,
      ["src/cli.ts", "mcp", "--repo", repoPath],
      { cwd: rootDirectory, stdio: ["pipe", "pipe", "ignore"] },
    );

    try {
      let output = "";
      const done = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timed out. Output so far:\n${output}`));
        }, 20_000);
        server.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes('"structuredContent"')) {
            clearTimeout(timer);
            resolve();
          }
        });
        server.on("exit", () => {
          clearTimeout(timer);
          reject(new Error(`Server exited early. Output:\n${output}`));
        });
      });

      server.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } })}\n`,
      );
      server.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
      );
      server.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "query", arguments: { sql: "SELECT count(*) AS n FROM commits" } } })}\n`,
      );
      await done;

      expect(output).toMatch(/"serverInfo":\{"name":"repo-insighter"/);
      expect(output).toMatch(/"rows":\[\{"n":2\}\]/);
    } finally {
      server.kill();
    }
  } finally {
    rmSync(repoPath, { force: true, recursive: true });
  }
});
