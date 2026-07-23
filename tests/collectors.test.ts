import { expect, test } from "vitest";

import { parseNumstat } from "../src/lib/collectors/churn.ts";
import {
  parseCommitMeta,
  parseTrailers,
} from "../src/lib/collectors/commit-meta.ts";
import {
  dependenciesCollector,
  parsePnpmLockfile,
} from "../src/lib/collectors/dependencies.ts";
import {
  mergeDirectives,
  scanFileForDirectives,
} from "../src/lib/collectors/directives.ts";
import { parseLsTree } from "../src/lib/collectors/file-types.ts";
import { parseTokeiJson } from "../src/lib/collectors/languages.ts";
import { parseBlamePorcelain } from "../src/lib/collectors/survival.ts";
import { scanFileForTodos } from "../src/lib/collectors/todo-comments.ts";
import { extensionOf } from "../src/lib/collectors/types.ts";

const separator = "\u001F";

test("extensionOf maps paths to extension categories", () => {
  expect(extensionOf("src/lib/scan.ts")).toBe(".ts");
  expect(extensionOf("README.MD")).toBe(".md");
  expect(extensionOf("Makefile")).toBe("(none)");
  expect(extensionOf(".gitignore")).toBe("(none)");
  expect(extensionOf("a/b.c/d")).toBe("(none)");
});

test("parseCommitMeta extracts full commit metadata", () => {
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

  expect(meta).toStrictEqual({
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

test("parseNumstat aggregates churn by extension", () => {
  const churn = parseNumstat(
    [
      "10\t2\tsrc/a.ts",
      "5\t0\tsrc/b.ts",
      "1\t1\tREADME.md",
      "-\t-\tlogo.png",
      "",
    ].join("\n"),
  );

  expect(churn.filesChanged).toBe(4);
  expect(churn.added).toBe(16);
  expect(churn.deleted).toBe(3);
  expect(churn.binaryFiles).toBe(1);
  expect(churn.byExtension[".ts"]).toStrictEqual({
    files: 2,
    added: 15,
    deleted: 2,
  });
  expect(churn.byExtension[".png"]).toStrictEqual({
    files: 1,
    added: 0,
    deleted: 0,
  });
});

test("parseLsTree aggregates blob sizes by extension", () => {
  const fileTypes = parseLsTree(
    [
      "100644 blob 1111111111111111111111111111111111111111     120\tsrc/a.ts",
      "100644 blob 2222222222222222222222222222222222222222      30\tREADME.md",
      "120000 blob 3333333333333333333333333333333333333333       -\tlink",
      "160000 commit 4444444444444444444444444444444444444444       -\tsubmodule",
      "",
    ].join("\n"),
  );

  expect(fileTypes.totalFiles).toBe(3);
  expect(fileTypes.totalBytes).toBe(150);
  expect(fileTypes.byExtension[".ts"]).toStrictEqual({ files: 1, bytes: 120 });
  expect(fileTypes.byExtension["(none)"]).toStrictEqual({ files: 1, bytes: 0 });
});

test("parseTrailers extracts key-value trailers", () => {
  expect(
    parseTrailers(
      "Co-Authored-By: Claude <noreply@anthropic.com>\nReviewed-by: Alice\n",
    ),
  ).toStrictEqual([
    { key: "Co-Authored-By", value: "Claude <noreply@anthropic.com>" },
    { key: "Reviewed-by", value: "Alice" },
  ]);
  expect(parseTrailers("")).toStrictEqual([]);
});

test("directives scanning classifies directives and pairs blocks", () => {
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

  expect(output.eslintNextLine.count).toBe(1);
  expect(output.eslintNextLine.byRule).toStrictEqual({
    "no-console": 1,
    "unicorn/no-null": 1,
  });
  expect(output.eslintLine.count).toBe(1);
  expect(output.eslintLine.byRule).toStrictEqual({ "no-magic-numbers": 1 });
  expect(output.eslintBlocks.count).toBe(2);
  expect(output.eslintBlocks.closedCount).toBe(1);
  expect(output.eslintBlocks.unboundedCount).toBe(1);
  expect(output.eslintBlocks.coveredLines).toBe(9);
  expect(output.eslintBlocks.byRule).toStrictEqual({
    "no-alert": 1,
    "(all)": 1,
  });
  expect(output.tsDirectives).toStrictEqual({
    ignore: 1,
    expectError: 1,
    nocheck: 1,
  });
});

test("parseTokeiJson folds embedded children into the parent language", () => {
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

  expect(output.byLanguage["Markdown"]).toStrictEqual({
    files: 1,
    code: 0,
    comments: 90,
    blanks: 10,
    lines: 110,
  });
  expect(output.byLanguage["TypeScript"]?.lines).toBe(125);
  expect(output.totalLines).toBe(235);
  expect(output.totalFiles).toBe(2);
});

test("parseBlamePorcelain attributes lines to authors and cohorts", () => {
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
  expect(attributions.length).toBe(3);
  expect(attributions[0]).toStrictEqual({
    authorEmail: "alice@example.com",
    cohortMonth: "2026-01",
  });
  expect(attributions[2]).toStrictEqual({
    authorEmail: "bob@example.com",
    cohortMonth: "2025-07",
  });
});

test("parsePnpmLockfile counts resolved and direct deps, version-aware", () => {
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

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 4,
    importerCount: 2,
    direct: { prod: 2, dev: 1, optional: 1 },
  });
});

test("parsePnpmLockfile skips pnpm's package-manager document", () => {
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

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 1,
    importerCount: 1,
    direct: { prod: 1, dev: 0, optional: 0 },
  });
});

test("parsePnpmLockfile returns undefined for non-lockfile content", () => {
  expect(parsePnpmLockfile("just a string")).toBeUndefined();
});

test("dependencies collector normalizes lockfiles into facts", () => {
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

  expect(facts).toStrictEqual([
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

test("dependencies collector marks a scanned tree with no lockfile", () => {
  const facts = dependenciesCollector.normalize({ lockfiles: [] });

  // A single presence marker (and no resolved/direct facts) so indexing can
  // distinguish "scanned, zero dependencies" from a commit that was never
  // scanned — see the dependencies filter in indexing.
  expect(facts).toStrictEqual([{ metric: "dependencies.scanned", value: 1 }]);
});

test("scanFileForTodos counts markers per line", () => {
  const output = scanFileForTodos(
    [
      "// TODO: fix",
      "// FIXME and TODO on one line",
      "code();",
      "// HACK",
    ].join("\n"),
  );
  expect(output.total).toBe(4);
  expect(output.byMarker).toStrictEqual({ TODO: 2, FIXME: 1, HACK: 1 });
});

// A marker is counted anywhere on a line, so it need not open the comment.
// These are the shapes seen in real codebases (labelled TODOs, markers tucked
// after a `--` suppression rationale, JSX and block comments) — all must count.
test("scanFileForTodos matches markers embedded mid-line", () => {
  const output = scanFileForTodos(
    [
      "// TODO (Ada Lovelace) [2024-01-01]: extract a helper",
      "const x = 1; // @ts-expect-error -- TODO (Bob) [2024-02-02]: fix types",
      "// eslint-disable-next-line no-console -- FIXME (Cleo): remove logging",
      "/* HACK (Dan): workaround until upstream ships the patch */",
      "{/* TODO (Eve) [2024-03-03]: replace with real component */}",
      "const label = 'a todo written in prose stays uncounted';",
    ].join("\n"),
  );
  expect(output.total).toBe(5);
  expect(output.byMarker).toStrictEqual({ TODO: 3, FIXME: 1, HACK: 1 });
});
