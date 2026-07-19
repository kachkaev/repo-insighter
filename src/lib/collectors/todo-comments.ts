import { Effect } from "effect";

import { runGit } from "../git.ts";
import { type Collector, isScannableSourceFile } from "./types.ts";

const markers = ["TODO", "FIXME", "HACK", "XXX"] as const;

type TodoCommentsOutput = {
  readonly total: number;
  readonly byMarker: Record<string, number>;
};

const aggregateTodoComments = (
  stdout: string,
  shaPrefixLength: number,
): TodoCommentsOutput => {
  const byMarker: Record<string, number> = {};
  let total = 0;

  for (const rawLine of stdout.split("\n")) {
    const rest = rawLine.slice(shaPrefixLength + 1);
    const pathEnd = rest.indexOf(":");
    if (pathEnd <= 0 || !isScannableSourceFile(rest.slice(0, pathEnd))) {
      continue;
    }
    const content = rest.slice(pathEnd + 1);
    for (const marker of markers) {
      // \b doesn't treat "XXX:" specially; a simple containment check per
      // marker keeps one grep line from double-counting the same marker.
      if (new RegExp(String.raw`\b${marker}\b`).test(content)) {
        byMarker[marker] = (byMarker[marker] ?? 0) + 1;
        total += 1;
      }
    }
  }

  return { total, byMarker };
};

export const todoCommentsCollector: Collector = {
  name: "todo-comments",
  description: "TODO/FIXME/HACK/XXX comment counts in source files",
  version: "1",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    runGit(
      [
        "-C",
        repoRoot,
        "grep",
        "-I",
        "-E",
        String.raw`\b(${markers.join("|")})\b`,
        sha,
      ],
      { okExitCodes: [1] },
    ).pipe(Effect.map((stdout) => aggregateTodoComments(stdout, sha.length))),
};
