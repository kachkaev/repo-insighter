import assert from "node:assert/strict";
import test from "node:test";

import { parseNumstat } from "../src/lib/collectors/churn.ts";
import { parseCommitMeta } from "../src/lib/collectors/commit-meta.ts";
import { parseLsTree } from "../src/lib/collectors/file-types.ts";
import { extensionOf } from "../src/lib/collectors/types.ts";

const separator = "\u001F";

void test("extensionOf maps paths to extension categories", () => {
  assert.equal(extensionOf("src/lib/scan.ts"), ".ts");
  assert.equal(extensionOf("README.MD"), ".md");
  assert.equal(extensionOf("Makefile"), "(none)");
  assert.equal(extensionOf(".gitignore"), "(none)");
  assert.equal(extensionOf("a/b.c/d"), "(none)");
});

void test("parseCommitMeta extracts full commit metadata", () => {
  const meta = parseCommitMeta(
    [
      "aaa111",
      "Alice",
      "alice@example.com",
      "2026-02-03T04:05:06+00:00",
      "Bob",
      "bob@example.com",
      "2026-02-03T05:06:07+00:00",
      "parent1 parent2",
      "Merge things",
      "Co-authored-by: Claude <noreply@anthropic.com>",
    ].join(separator),
  );

  assert.deepEqual(meta, {
    sha: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authoredAt: "2026-02-03T04:05:06+00:00",
    committerName: "Bob",
    committerEmail: "bob@example.com",
    committedAt: "2026-02-03T05:06:07+00:00",
    parents: ["parent1", "parent2"],
    subject: "Merge things",
    trailers: [
      { key: "Co-authored-by", value: "Claude <noreply@anthropic.com>" },
    ],
    coAuthors: ["Claude <noreply@anthropic.com>"],
  });
});

void test("parseNumstat aggregates churn by extension", () => {
  const churn = parseNumstat(
    [
      "10\t2\tsrc/a.ts",
      "5\t0\tsrc/b.ts",
      "1\t1\tREADME.md",
      "-\t-\tlogo.png",
      "",
    ].join("\n"),
  );

  assert.equal(churn.filesChanged, 4);
  assert.equal(churn.added, 16);
  assert.equal(churn.deleted, 3);
  assert.equal(churn.binaryFiles, 1);
  assert.deepEqual(churn.byExtension[".ts"], {
    files: 2,
    added: 15,
    deleted: 2,
  });
  assert.deepEqual(churn.byExtension[".png"], {
    files: 1,
    added: 0,
    deleted: 0,
  });
});

void test("parseLsTree aggregates blob sizes by extension", () => {
  const fileTypes = parseLsTree(
    [
      "100644 blob 1111111111111111111111111111111111111111     120\tsrc/a.ts",
      "100644 blob 2222222222222222222222222222222222222222      30\tREADME.md",
      "120000 blob 3333333333333333333333333333333333333333       -\tlink",
      "160000 commit 4444444444444444444444444444444444444444       -\tsubmodule",
      "",
    ].join("\n"),
  );

  assert.equal(fileTypes.totalFiles, 3);
  assert.equal(fileTypes.totalBytes, 150);
  assert.deepEqual(fileTypes.byExtension[".ts"], { files: 1, bytes: 120 });
  assert.deepEqual(fileTypes.byExtension["(none)"], { files: 1, bytes: 0 });
});

void test("parseTrailers extracts key-value trailers", async () => {
  const { parseTrailers } =
    await import("../src/lib/collectors/commit-meta.ts");
  assert.deepEqual(
    parseTrailers(
      "Co-Authored-By: Claude <noreply@anthropic.com>\nReviewed-by: Alice\n",
    ),
    [
      { key: "Co-Authored-By", value: "Claude <noreply@anthropic.com>" },
      { key: "Reviewed-by", value: "Alice" },
    ],
  );
  assert.deepEqual(parseTrailers(""), []);
});

void test("directives scanning classifies directives and pairs blocks", async () => {
  const { mergeDirectives, scanFileForDirectives } =
    await import("../src/lib/collectors/directives.ts");

  const fileA = [
    "const a = 1;",
    "",
    "// eslint-disable-next-line no-console, unicorn/no-null -- why",
    ...Array.from({ length: 6 }, () => "code();"),
    "/* eslint-disable no-alert */",
    ...Array.from({ length: 9 }, () => "alert();"),
    "/* eslint-enable no-alert */",
    "// @ts-expect-error legacy",
  ].join("\n");
  const fileB = [
    "/* eslint-disable */",
    "code();",
    "code();",
    "code();",
    "const x = 1; // eslint-disable-line no-magic-numbers",
    "code();",
    "code();",
    "// @ts-ignore",
  ].join("\n");
  const fileC = "// @ts-nocheck\ncode();";

  const output = mergeDirectives([
    scanFileForDirectives(fileA),
    scanFileForDirectives(fileB),
    scanFileForDirectives(fileC),
  ]);

  assert.equal(output.eslintNextLine.count, 1);
  assert.deepEqual(output.eslintNextLine.byRule, {
    "no-console": 1,
    "unicorn/no-null": 1,
  });
  assert.equal(output.eslintLine.count, 1);
  assert.deepEqual(output.eslintLine.byRule, { "no-magic-numbers": 1 });
  assert.equal(output.eslintBlocks.count, 2);
  assert.equal(output.eslintBlocks.closedCount, 1);
  assert.equal(output.eslintBlocks.unboundedCount, 1);
  assert.equal(output.eslintBlocks.coveredLines, 9);
  assert.deepEqual(output.eslintBlocks.byRule, { "no-alert": 1, "(all)": 1 });
  assert.deepEqual(output.tsDirectives, {
    ignore: 1,
    expectError: 1,
    nocheck: 1,
  });
});

void test("parseTokeiJson folds embedded children into the parent language", async () => {
  const { parseTokeiJson } = await import("../src/lib/collectors/languages.ts");
  const output = parseTokeiJson(
    JSON.stringify({
      Markdown: {
        blanks: 10,
        code: 0,
        comments: 90,
        reports: [
          {
            name: "./README.md",
            stats: { blanks: 10, code: 0, comments: 90, blobs: {} },
          },
        ],
        children: {
          JavaScript: [
            {
              name: "./README.md",
              stats: { blanks: 1, code: 8, comments: 1, blobs: {} },
            },
          ],
        },
      },
      TypeScript: {
        blanks: 5,
        code: 100,
        comments: 20,
        reports: [
          {
            name: "./a.ts",
            stats: { blanks: 5, code: 100, comments: 20, blobs: {} },
          },
        ],
        children: {},
      },
      Total: { blanks: 0, code: 0, comments: 0, reports: [], children: {} },
    }),
  );

  assert.deepEqual(output.byLanguage["Markdown"], {
    files: 1,
    code: 0,
    comments: 90,
    blanks: 10,
    lines: 110,
  });
  assert.equal(output.byLanguage["TypeScript"]?.lines, 125);
  assert.equal(output.totalLines, 235);
  assert.equal(output.totalFiles, 2);
});

void test("parseBlamePorcelain attributes lines to authors and cohorts", async () => {
  const { parseBlamePorcelain } =
    await import("../src/lib/collectors/survival.ts");
  const stdout = [
    "abc123 1 1 2",
    "author Alice",
    "author-mail <alice@example.com>",
    "author-time 1767225600", // 2026-01-01
    "filename a.ts",
    "\tconst a = 1;",
    "abc123 2 2",
    "author Alice",
    "author-mail <alice@example.com>",
    "author-time 1767225600",
    "filename a.ts",
    "\tconst b = 2;",
    "def456 3 3 1",
    "author Bob",
    "author-mail <bob@example.com>",
    "author-time 1751328000", // 2025-07-01
    "filename a.ts",
    "\tconst c = 3;",
    "",
  ].join("\n");

  const attributions = parseBlamePorcelain(stdout);
  assert.equal(attributions.length, 3);
  assert.deepEqual(attributions[0], {
    authorEmail: "alice@example.com",
    cohortMonth: "2026-01",
  });
  assert.deepEqual(attributions[2], {
    authorEmail: "bob@example.com",
    cohortMonth: "2025-07",
  });
});

void test("parsePnpmLockfile counts resolved and direct deps, version-aware", async () => {
  const { parsePnpmLockfile } =
    await import("../src/lib/collectors/dependencies.ts");

  // A monorepo: React 19 in one package, React 18 in another → two prod deps.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      react:",
      "        specifier: ^19",
      "        version: 19.2.0",
      "    devDependencies:",
      "      typescript:",
      "        specifier: '5'",
      "        version: 5.9.0",
      "",
      "  packages/legacy:",
      "    dependencies:",
      "      react:",
      "        specifier: ^18",
      "        version: 18.3.1",
      "    optionalDependencies:",
      "      fsevents:",
      "        specifier: ^2",
      "        version: 2.3.3",
      "",
      "packages:",
      "",
      "  react@19.2.0: {}",
      "  react@18.3.1: {}",
      "  typescript@5.9.0: {}",
      "  fsevents@2.3.3: {}",
    ].join("\n"),
  );

  assert.deepEqual(summary, {
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 4,
    importerCount: 2,
    direct: { prod: 2, dev: 1, optional: 1 },
  });
});

void test("parsePnpmLockfile skips pnpm's package-manager document", async () => {
  const { parsePnpmLockfile } =
    await import("../src/lib/collectors/dependencies.ts");

  // First document manages pnpm itself; only the second is a real lockfile.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    configDependencies: {}",
      "    packageManagerDependencies:",
      "      pnpm:",
      "        specifier: 11.15.0",
      "        version: 11.15.0",
      "",
      "packages:",
      "",
      "  pnpm@11.15.0: {}",
      "",
      "---",
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      lodash:",
      "        specifier: ^4",
      "        version: 4.17.21",
      "",
      "packages:",
      "",
      "  lodash@4.17.21: {}",
    ].join("\n"),
  );

  assert.deepEqual(summary, {
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 1,
    importerCount: 1,
    direct: { prod: 1, dev: 0, optional: 0 },
  });
});

void test("parsePnpmLockfile returns undefined for non-lockfile content", async () => {
  const { parsePnpmLockfile } =
    await import("../src/lib/collectors/dependencies.ts");
  assert.equal(parsePnpmLockfile("just a string"), undefined);
});

void test("dependencies collector normalizes lockfiles into facts", async () => {
  const { dependenciesCollector } =
    await import("../src/lib/collectors/dependencies.ts");
  const facts = dependenciesCollector.normalize({
    lockfiles: [
      {
        path: "pnpm-lock.yaml",
        packageManager: "pnpm",
        lockfileVersion: "9.0",
        resolvedCount: 741,
        importerCount: 1,
        direct: { prod: 0, dev: 36, optional: 0 },
      },
    ],
  });

  assert.deepEqual(facts, [
    {
      metric: "dependencies.resolved",
      value: 741,
      categories: { packageManager: "pnpm", lockfile: "pnpm-lock.yaml" },
    },
    {
      metric: "dependencies.direct",
      value: 0,
      categories: {
        packageManager: "pnpm",
        lockfile: "pnpm-lock.yaml",
        kind: "prod",
      },
    },
    {
      metric: "dependencies.direct",
      value: 36,
      categories: {
        packageManager: "pnpm",
        lockfile: "pnpm-lock.yaml",
        kind: "dev",
      },
    },
    {
      metric: "dependencies.direct",
      value: 0,
      categories: {
        packageManager: "pnpm",
        lockfile: "pnpm-lock.yaml",
        kind: "optional",
      },
    },
  ]);
});

void test("scanFileForTodos counts markers per line", async () => {
  const { scanFileForTodos } =
    await import("../src/lib/collectors/todo-comments.ts");
  const output = scanFileForTodos(
    [
      "// TODO: fix",
      "// FIXME and TODO on one line",
      "code();",
      "// HACK",
    ].join("\n"),
  );
  assert.equal(output.total, 4);
  assert.deepEqual(output.byMarker, { TODO: 2, FIXME: 1, HACK: 1 });
});
