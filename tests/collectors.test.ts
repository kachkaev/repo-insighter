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

void test("aggregateDirectives classifies directives and pairs blocks", async () => {
  const { aggregateDirectives } =
    await import("../src/lib/collectors/directives.ts");
  const matches = [
    {
      filePath: "a.ts",
      line: 3,
      content: "// eslint-disable-next-line no-console, unicorn/no-null -- why",
    },
    { filePath: "a.ts", line: 10, content: "/* eslint-disable no-alert */" },
    { filePath: "a.ts", line: 20, content: "/* eslint-enable no-alert */" },
    { filePath: "a.ts", line: 30, content: "// @ts-expect-error legacy" },
    { filePath: "b.ts", line: 1, content: "/* eslint-disable */" },
    {
      filePath: "b.ts",
      line: 5,
      content: "const x = 1; // eslint-disable-line no-magic-numbers",
    },
    { filePath: "b.ts", line: 8, content: "// @ts-ignore" },
    { filePath: "c.ts", line: 1, content: "// @ts-nocheck" },
  ];

  const output = aggregateDirectives(matches);

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
