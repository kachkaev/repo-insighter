import { Effect } from "effect";

import { numberAt, recordAt } from "../json.ts";
import { scanTreeWithBlobCache } from "./tree-scan.ts";
import type { Collector, Fact } from "./types.ts";

type RuleCounts = Record<string, number>;

export type DirectivesOutput = {
  readonly eslintNextLine: { count: number; byRule: RuleCounts };
  readonly eslintLine: { count: number; byRule: RuleCounts };
  /**
   * Block-level `eslint-disable` … `eslint-enable` regions. Rule hits inside a
   * block are unknowable without running ESLint, so blocks are counted as
   * "gray areas" (one hit per rule per block), separately from line-level
   * directives. `coveredLines` sums lines strictly between matched pairs;
   * unmatched disables run to end of file and are only counted.
   */
  readonly eslintBlocks: {
    count: number;
    closedCount: number;
    unboundedCount: number;
    coveredLines: number;
    byRule: RuleCounts;
  };
  readonly tsDirectives: {
    ignore: number;
    expectError: number;
    nocheck: number;
  };
};

const emptyOutput = (): DirectivesOutput => ({
  eslintNextLine: { count: 0, byRule: {} },
  eslintLine: { count: 0, byRule: {} },
  eslintBlocks: {
    count: 0,
    closedCount: 0,
    unboundedCount: 0,
    coveredLines: 0,
    byRule: {},
  },
  tsDirectives: { ignore: 0, expectError: 0, nocheck: 0 },
});

/** Extracts rule names following a directive keyword, stopping at a comment terminator or `--`. */
const parseRules = (content: string, keyword: string): string[] => {
  const keywordIndex = content.indexOf(keyword);
  if (keywordIndex === -1) {
    return [];
  }
  let rest = content.slice(keywordIndex + keyword.length);
  for (const terminator of ["*/", "-->", "--"]) {
    const terminatorIndex = rest.indexOf(terminator);
    if (terminatorIndex !== -1) {
      rest = rest.slice(0, terminatorIndex);
    }
  }
  return rest
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => /^[@\w/-]+$/.test(rule) && rule.length > 0);
};

const addRules = (byRule: RuleCounts, rules: readonly string[]) => {
  for (const rule of rules.length > 0 ? rules : ["(all)"]) {
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
};

const quickPattern =
  /eslint-disable|eslint-enable|@ts-(?:ignore|expect-error|nocheck)/;

/** Scans one file's content; results are cached per blob by the tree scanner. */
export const scanFileForDirectives = (content: string): DirectivesOutput => {
  const output = emptyOutput();
  if (!quickPattern.test(content)) {
    return output;
  }

  let openBlock: { line: number } | undefined;

  for (const [index, line] of content.split("\n").entries()) {
    if (!quickPattern.test(line)) {
      continue;
    }
    if (line.includes("@ts-ignore")) {
      output.tsDirectives.ignore += 1;
    } else if (line.includes("@ts-expect-error")) {
      output.tsDirectives.expectError += 1;
    } else if (line.includes("@ts-nocheck")) {
      output.tsDirectives.nocheck += 1;
    } else if (line.includes("eslint-disable-next-line")) {
      output.eslintNextLine.count += 1;
      addRules(
        output.eslintNextLine.byRule,
        parseRules(line, "eslint-disable-next-line"),
      );
    } else if (line.includes("eslint-disable-line")) {
      output.eslintLine.count += 1;
      addRules(
        output.eslintLine.byRule,
        parseRules(line, "eslint-disable-line"),
      );
    } else if (line.includes("eslint-disable")) {
      output.eslintBlocks.count += 1;
      addRules(output.eslintBlocks.byRule, parseRules(line, "eslint-disable"));
      openBlock = { line: index };
    } else if (line.includes("eslint-enable") && openBlock) {
      output.eslintBlocks.closedCount += 1;
      output.eslintBlocks.coveredLines += Math.max(
        0,
        index - openBlock.line - 1,
      );
      openBlock = undefined;
    }
  }

  output.eslintBlocks.unboundedCount =
    output.eslintBlocks.count - output.eslintBlocks.closedCount;

  return output;
};

const mergeRuleCounts = (target: RuleCounts, source: unknown) => {
  for (const [rule, count] of Object.entries(
    recordAt({ wrapped: source }, "wrapped"),
  )) {
    if (typeof count === "number") {
      target[rule] = (target[rule] ?? 0) + count;
    }
  }
};

/** Sums per-file results (as re-read from the blob cache, hence `unknown`). */
export const mergeDirectives = (
  fileResults: readonly unknown[],
): DirectivesOutput => {
  const merged = emptyOutput();
  for (const result of fileResults) {
    const nextLine = recordAt(result, "eslintNextLine");
    merged.eslintNextLine.count += numberAt(nextLine, "count");
    mergeRuleCounts(merged.eslintNextLine.byRule, nextLine["byRule"]);

    const line = recordAt(result, "eslintLine");
    merged.eslintLine.count += numberAt(line, "count");
    mergeRuleCounts(merged.eslintLine.byRule, line["byRule"]);

    const blocks = recordAt(result, "eslintBlocks");
    merged.eslintBlocks.count += numberAt(blocks, "count");
    merged.eslintBlocks.closedCount += numberAt(blocks, "closedCount");
    merged.eslintBlocks.unboundedCount += numberAt(blocks, "unboundedCount");
    merged.eslintBlocks.coveredLines += numberAt(blocks, "coveredLines");
    mergeRuleCounts(merged.eslintBlocks.byRule, blocks["byRule"]);

    const ts = recordAt(result, "tsDirectives");
    merged.tsDirectives.ignore += numberAt(ts, "ignore");
    merged.tsDirectives.expectError += numberAt(ts, "expectError");
    merged.tsDirectives.nocheck += numberAt(ts, "nocheck");
  }
  return merged;
};

export const directivesCollector: Collector = {
  name: "directives",
  description:
    "ESLint suppression comments (by rule; block disables as gray areas) and @ts-ignore/@ts-expect-error/@ts-nocheck counts",
  version: "1",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha, cacheKey }) =>
    scanTreeWithBlobCache({
      repoRoot,
      sha,
      collectorName: "directives",
      cacheKey,
      scanContent: scanFileForDirectives,
    }).pipe(
      Effect.map((files) => mergeDirectives(files.map((file) => file.result))),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    const kinds = [
      ["eslintNextLine", "next-line"],
      ["eslintLine", "line"],
      ["eslintBlocks", "block"],
    ] as const;
    for (const [key, type] of kinds) {
      for (const [rule, count] of Object.entries(
        recordAt(recordAt(raw, key), "byRule"),
      )) {
        if (typeof count === "number") {
          facts.push({
            metric: "directives.eslint",
            value: count,
            categories: { type, rule },
          });
        }
      }
    }
    facts.push({
      metric: "directives.eslintBlockCoveredLines",
      value: numberAt(recordAt(raw, "eslintBlocks"), "coveredLines"),
    });
    const ts = recordAt(raw, "tsDirectives");
    for (const type of ["ignore", "expectError", "nocheck"] as const) {
      facts.push({
        metric: "directives.ts",
        value: numberAt(ts, type),
        categories: { type },
      });
    }
    return facts;
  },
};
