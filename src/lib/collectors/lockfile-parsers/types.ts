/**
 * A package manager's take on one lockfile: how many packages it resolves.
 * Deliberately manager-agnostic — every parser returns this same shape, so the
 * collector, the cube and the dashboard never learn about individual managers.
 * A future manager (cargo, bun, composer, …) slots in by producing this from
 * its own lockfile; nothing downstream changes.
 *
 * Direct dependency counts deliberately do not live here: a lockfile is the
 * resolved graph, and only some managers (pnpm, npm v2/v3) record which of
 * those packages a project declared directly. `package.json` is the single
 * source of truth for direct/dev/optional dependencies, so those are read from
 * manifests instead (see `../package-manifest.ts`).
 */
export type LockfileSummary = {
  /** e.g. "pnpm"; becomes the `packageManager` category on every fact. */
  readonly packageManager: string;
  readonly lockfileVersion: string;
  /** Distinct resolved packages (name + version) across the whole graph. */
  readonly resolvedCount: number;
};

/**
 * Recognizes one lockfile format and distills it to a {@link LockfileSummary}.
 * Adding a package manager means writing one of these and listing it in the
 * registry (see `./registry.ts`) — the single extension point for new managers.
 */
export type LockfileParser = {
  /** Lockfile basename this parser claims, e.g. "pnpm-lock.yaml". */
  readonly fileName: string;
  /** Returns undefined for content it cannot make sense of (the file is skipped). */
  readonly parse: (content: string) => LockfileSummary | undefined;
};
