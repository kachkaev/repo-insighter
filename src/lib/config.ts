import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Effect } from "effect";

import type { ContributorKind } from "../config.ts";
import { prettifyAuthorEmail } from "./indexing.ts";

/** Config file names, in resolution order. First match wins. */
const configFileNames = [
  "repo-dive.config.ts",
  "repo-dive.config.mts",
  "repo-dive.config.mjs",
  "repo-dive.config.js",
];

export const defaultMaxInCharts = 10;

/** Automation bots — commits that don't reflect authored work. */
const botPattern = /\brenovate\b|\bdependabot\b|github-actions|\[bot\]/i;
/** Known AI coding agents (mirrors the co-author heuristic in indexing.ts). */
const aiPattern =
  /claude|copilot|cursor|chatgpt|openai|gemini|aider|devin|coderabbit|codegen|sweep|windsurf/i;

/** Classifies a `"Name <email>"` identity when the config leaves `kind` unset. */
export const deriveContributorKind = (identity: string): ContributorKind =>
  botPattern.test(identity) ? "bot" : aiPattern.test(identity) ? "ai" : "human";

/**
 * Tidies an auto-derived name for display. The kind badge (🤖 / ✨) already
 * marks bots and AI agents, so the `[bot]` suffix GitHub bakes into author names
 * is redundant double-labeling: `renovate[bot]` reads better as `Renovate`.
 * Strips a trailing `[bot]` and capitalizes the leading letter; leaves names
 * without the suffix (ordinary people, configured display names) untouched.
 */
export const normalizeContributorName = (name: string): string => {
  const stripped = name.replace(/\s*\[bot\]$/i, "");
  if (stripped === name || stripped === "") {
    return name;
  }
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

/** A contributor's canonical, display-ready identity after alias resolution. */
type ResolvedContributor = {
  /** Prettified canonical email — shown in the contributors table's email column. */
  readonly canonicalEmail: string;
  /** The label used in charts and as the name: `displayName` if set. */
  readonly label: string;
  /** Explicit display-name override from the config, if any. */
  readonly displayName: string | undefined;
  /** Profile URL from the config, if any. */
  readonly url: string | undefined;
  /** Explicit or auto-derived contributor kind. */
  readonly kind: ContributorKind;
};

export type ResolvedConfig = {
  /**
   * Resolves a commit author's email (and optional name) to its canonical
   * contributor identity: alias groups fold to their first entry, GitHub
   * noreply addresses are prettified, `displayName`/`url` overrides are applied
   * and `kind` is taken from the config or derived from the identity.
   */
  readonly resolveContributor: (
    email: string,
    name?: string,
  ) => ResolvedContributor;
  /** How many contributors per-contributor charts keep before folding into "Other". */
  readonly maxInCharts: number;
};

/** Internal per-group metadata keyed by every email (and handle) in the group. */
type AliasEntry = {
  readonly canonicalEmail: string;
  readonly displayName: string | undefined;
  readonly url: string | undefined;
  readonly kind: ContributorKind | undefined;
};

const bareResolveContributor = (
  aliases: ReadonlyMap<string, AliasEntry>,
  email: string,
  name: string | undefined,
): ResolvedContributor => {
  const entry =
    aliases.get(email.toLowerCase()) ??
    aliases.get(prettifyAuthorEmail(email).toLowerCase());
  const canonicalEmail = prettifyAuthorEmail(entry?.canonicalEmail ?? email);
  return {
    canonicalEmail,
    label: entry?.displayName ?? normalizeContributorName(canonicalEmail),
    displayName: entry?.displayName,
    url: entry?.url,
    kind: entry?.kind ?? deriveContributorKind(`${name ?? ""} <${email}>`),
  };
};

/** The zero-config resolution: no aliases, default chart cap. */
const defaultResolvedConfig: ResolvedConfig = {
  // Wrapped (not a bare reference) to defer the cross-module lookup to call
  // time — `indexing.ts` and this module import each other.
  resolveContributor: (email, name) =>
    bareResolveContributor(new Map(), email, name),
  maxInCharts: defaultMaxInCharts,
};

const configError = (message: string): Error =>
  new Error(`Invalid repo-dive config: ${message}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads a property by (variable) key — avoids literal index-signature access. */
const prop = (record: Record<string, unknown>, key: string): unknown =>
  record[key];

const parseOptionalString = (
  value: unknown,
  label: string,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw configError(`${label} must be a non-empty string.`);
  }
  return value.trim();
};

const contributorKinds: readonly ContributorKind[] = ["human", "bot", "ai"];

const parseKind = (
  value: unknown,
  label: string,
): ContributorKind | undefined => {
  if (value === undefined) {
    return undefined;
  }
  for (const kind of contributorKinds) {
    if (value === kind) {
      return kind;
    }
  }
  throw configError(`${label} must be one of "human", "bot" or "ai".`);
};

const parseEmails = (rawEmails: unknown, at: string): string[] => {
  if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
    throw configError(
      `${at} must be a non-empty array of emails, or an object with a non-empty \`emails\` array.`,
    );
  }
  return rawEmails.map((entry, entryIndex) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw configError(
        `${at}\`.emails[${entryIndex}]\` must be a non-empty string.`,
      );
    }
    return entry.trim();
  });
};

/** Normalizes one alias group (array shorthand or rich object) to its parts. */
const parseAliasGroup = (
  group: unknown,
  groupIndex: number,
): {
  emails: string[];
  displayName: string | undefined;
  url: string | undefined;
  kind: ContributorKind | undefined;
} => {
  const at = `\`contributors.aliases[${groupIndex}]\``;
  if (Array.isArray(group)) {
    return {
      emails: parseEmails(group, at),
      displayName: undefined,
      url: undefined,
      kind: undefined,
    };
  }
  if (isPlainObject(group)) {
    return {
      emails: parseEmails(prop(group, "emails"), at),
      displayName: parseOptionalString(
        prop(group, "displayName"),
        `${at}\`.displayName\``,
      ),
      url: parseOptionalString(prop(group, "url"), `${at}\`.url\``),
      kind: parseKind(prop(group, "kind"), `${at}\`.kind\``),
    };
  }
  throw configError(
    `${at} must be a non-empty array of emails, or an object with a non-empty \`emails\` array.`,
  );
};

/** Validates the raw `contributors.aliases` and builds the email → group-metadata map. */
const buildAliasMap = (aliases: unknown): Map<string, AliasEntry> => {
  const map = new Map<string, AliasEntry>();
  if (aliases === undefined) {
    return map;
  }
  if (!Array.isArray(aliases)) {
    throw configError("`contributors.aliases` must be an array.");
  }
  for (const [groupIndex, group] of aliases.entries()) {
    const { emails, displayName, url, kind } = parseAliasGroup(
      group,
      groupIndex,
    );
    const [canonicalEmail] = emails;
    if (canonicalEmail === undefined) {
      continue;
    }
    const entry: AliasEntry = { canonicalEmail, displayName, url, kind };
    for (const email of emails) {
      const key = email.toLowerCase();
      const existing = map.get(key);
      if (
        existing !== undefined &&
        existing.canonicalEmail !== canonicalEmail
      ) {
        throw configError(
          `email "${email}" appears in more than one alias group.`,
        );
      }
      map.set(key, entry);
    }
  }
  return map;
};

const parseMaxInCharts = (value: unknown): number => {
  if (value === undefined) {
    return defaultMaxInCharts;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw configError(
      "`contributors.maxInCharts` must be an integer between 1 and 100.",
    );
  }
  return value;
};

/** Validates a raw imported config value and turns it into a {@link ResolvedConfig}. */
export const resolveConfig = (raw: unknown): ResolvedConfig => {
  if (!isPlainObject(raw)) {
    throw configError("the default export must be an object.");
  }
  const contributors = prop(raw, "contributors");
  if (contributors !== undefined && !isPlainObject(contributors)) {
    throw configError("`contributors` must be an object.");
  }
  const aliasMap = buildAliasMap(
    contributors === undefined ? undefined : prop(contributors, "aliases"),
  );
  const maxInCharts = parseMaxInCharts(
    contributors === undefined ? undefined : prop(contributors, "maxInCharts"),
  );

  return {
    resolveContributor: (email, name) =>
      bareResolveContributor(aliasMap, email, name),
    maxInCharts,
  };
};

const firstExistingConfigPath = async (
  repoRoot: string,
): Promise<string | undefined> => {
  for (const fileName of configFileNames) {
    const candidate = path.join(repoRoot, fileName);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
};

/**
 * Loads `repo-dive.config.*` from the analyzed repo root, if present.
 *
 * `.ts` config relies on Node's built-in type stripping (unflagged on Node
 * ≥ 22.18); on older runtimes, use a `.mjs`/`.js` config instead. Returns the
 * zero-config defaults when no file is found.
 */
export const loadConfig = (
  repoRoot: string,
): Effect.Effect<ResolvedConfig, Error> =>
  Effect.gen(function* () {
    const configPath = yield* Effect.tryPromise({
      try: () => firstExistingConfigPath(repoRoot),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
    if (configPath === undefined) {
      return defaultResolvedConfig;
    }

    const raw = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => {
        const module: unknown = await import(pathToFileURL(configPath).href);
        return isPlainObject(module) ? prop(module, "default") : undefined;
      },
      catch: (error) =>
        new Error(
          `Failed to load ${path.basename(configPath)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
    });

    if (raw === undefined) {
      return yield* Effect.fail(
        configError(
          `${path.basename(configPath)} must \`export default defineConfig(...)\`.`,
        ),
      );
    }

    return yield* Effect.try({
      try: () => resolveConfig(raw),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  });
