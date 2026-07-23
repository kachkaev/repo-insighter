// eslint-disable-next-line import/no-extraneous-dependencies -- bundled into dist by Vite (like effect), so it lives in devDependencies by design
import { parse as parseYaml } from "yaml";

import { isRecord } from "./helpers.ts";
import type { LockfileParser, LockfileSummary } from "./types.ts";

const versionString = (value: unknown): string =>
  typeof value === "number" || typeof value === "string" ? String(value) : "";

/**
 * Yarn Berry (v2+) writes YAML: one top-level key per resolution (comma-joined
 * ranges share a key, so a key is one resolved version), plus a `__metadata`
 * block and the project's own `@workspace:` entries, both of which we exclude.
 */
const parseBerryLockfile = (content: string): LockfileSummary | undefined => {
  let root: unknown;
  try {
    root = parseYaml(content);
  } catch {
    return undefined;
  }
  if (!isRecord(root)) {
    return undefined;
  }
  const metadata = isRecord(root["__metadata"]) ? root["__metadata"] : {};
  const resolvedCount = Object.keys(root).filter(
    (key) => key !== "__metadata" && !key.includes("@workspace:"),
  ).length;
  return {
    packageManager: "yarn",
    lockfileVersion: versionString(metadata["version"]) || "berry",
    resolvedCount,
  };
};

/**
 * Yarn Classic (v1) uses a bespoke, YAML-adjacent format that the YAML parser
 * rejects (a resolution's key can be several comma-separated ranges). Every
 * resolution is one un-indented block header ending in `:`, so counting those
 * headers counts the resolved packages.
 */
const parseClassicLockfile = (content: string): LockfileSummary => {
  let resolvedCount = 0;
  for (const line of content.split("\n")) {
    // Block bodies are indented; comments and blanks carry no resolution.
    if (line.length === 0 || /^[\s#]/.test(line)) {
      continue;
    }
    if (line.trimEnd().endsWith(":")) {
      resolvedCount += 1;
    }
  }
  return {
    packageManager: "yarn",
    lockfileVersion: "1",
    resolvedCount,
  };
};

/**
 * Parses a `yarn.lock`, dispatching on format: Berry (v2+) is YAML and carries
 * a `__metadata` block; Classic (v1) is the bespoke line format.
 */
export const parseYarnLockfile = (
  content: string,
): LockfileSummary | undefined =>
  content.includes("__metadata:")
    ? parseBerryLockfile(content)
    : parseClassicLockfile(content);

export const yarnParser: LockfileParser = {
  fileName: "yarn.lock",
  parse: parseYarnLockfile,
};
