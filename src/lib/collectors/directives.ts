import { Effect } from "effect";

import { runGit } from "../git.ts";
import { type Collector, isScannableSourceFile } from "./types.ts";

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

const grepPattern =
  "eslint-disable|eslint-enable|@ts-ignore|@ts-expect-error|@ts-nocheck";

type Match = {
  readonly filePath: string;
  readonly line: number;
  readonly content: string;
};

const parseGrepOutput = (stdout: string, shaPrefixLength: number): Match[] => {
  const matches: Match[] = [];

  for (const rawLine of stdout.split("\n")) {
    // Format: <sha>:<path>:<line>:<content>; content may contain colons.
    const rest = rawLine.slice(shaPrefixLength + 1);
    const pathEnd = rest.indexOf(":");
    if (pathEnd <= 0) {
      continue;
    }
    const lineEnd = rest.indexOf(":", pathEnd + 1);
    if (lineEnd <= pathEnd) {
      continue;
    }
    const line = Number(rest.slice(pathEnd + 1, lineEnd));
    if (!Number.isInteger(line)) {
      continue;
    }
    matches.push({
      filePath: rest.slice(0, pathEnd),
      line,
      content: rest.slice(lineEnd + 1),
    });
  }

  return matches;
};

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

export const aggregateDirectives = (
  matches: readonly Match[],
): DirectivesOutput => {
  const output: DirectivesOutput = {
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
  };

  /** Per file: line number and rules of the currently open block disable. */
  const openBlocks = new Map<string, { line: number; rules: string[] }>();

  const sorted = [...matches].toSorted(
    (a, b) =>
      (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0) ||
      a.line - b.line,
  );

  for (const match of sorted) {
    const { filePath, line, content } = match;

    if (content.includes("@ts-ignore")) {
      output.tsDirectives.ignore += 1;
    } else if (content.includes("@ts-expect-error")) {
      output.tsDirectives.expectError += 1;
    } else if (content.includes("@ts-nocheck")) {
      output.tsDirectives.nocheck += 1;
    } else if (content.includes("eslint-disable-next-line")) {
      output.eslintNextLine.count += 1;
      addRules(
        output.eslintNextLine.byRule,
        parseRules(content, "eslint-disable-next-line"),
      );
    } else if (content.includes("eslint-disable-line")) {
      output.eslintLine.count += 1;
      addRules(
        output.eslintLine.byRule,
        parseRules(content, "eslint-disable-line"),
      );
    } else if (content.includes("eslint-disable")) {
      output.eslintBlocks.count += 1;
      const rules = parseRules(content, "eslint-disable");
      addRules(output.eslintBlocks.byRule, rules);
      openBlocks.set(filePath, { line, rules });
    } else if (content.includes("eslint-enable")) {
      const open = openBlocks.get(filePath);
      if (open) {
        output.eslintBlocks.closedCount += 1;
        output.eslintBlocks.coveredLines += Math.max(0, line - open.line - 1);
        openBlocks.delete(filePath);
      }
    }
  }

  output.eslintBlocks.unboundedCount =
    output.eslintBlocks.count - output.eslintBlocks.closedCount;

  return output;
};

export const directivesCollector: Collector = {
  name: "directives",
  description:
    "ESLint suppression comments (by rule; block disables as gray areas) and @ts-ignore/@ts-expect-error/@ts-nocheck counts",
  version: "1",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    runGit(
      ["-C", repoRoot, "grep", "-I", "-n", "-E", grepPattern, sha],
      { okExitCodes: [1] }, // 1 = no matches
    ).pipe(
      Effect.map((stdout) =>
        aggregateDirectives(
          parseGrepOutput(stdout, sha.length).filter((match) =>
            isScannableSourceFile(match.filePath),
          ),
        ),
      ),
    ),
};
