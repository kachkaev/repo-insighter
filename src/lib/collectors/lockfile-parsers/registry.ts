import { npmParser } from "./npm.ts";
import { pnpmParser } from "./pnpm.ts";
import type { LockfileParser } from "./types.ts";
import { yarnParser } from "./yarn.ts";

export type { LockfileSummary } from "./types.ts";

/**
 * Every lockfile format repo-dive understands, one entry per package manager.
 * This array is the single extension point: teaching the tool a new manager
 * (cargo's `Cargo.lock`, `bun.lock`, `composer.lock`, …) means adding a parser
 * module and appending it here — the collector, cube and dashboard are already
 * manager-agnostic and need no changes.
 */
const lockfileParsers: readonly LockfileParser[] = [
  pnpmParser,
  npmParser,
  yarnParser,
];

const basenameOf = (filePath: string): string =>
  filePath.split("/").at(-1) ?? "";

/** The parser claiming `filePath`'s basename, or undefined if none does. */
export const parserForFile = (filePath: string): LockfileParser | undefined =>
  lockfileParsers.find((parser) => parser.fileName === basenameOf(filePath));
