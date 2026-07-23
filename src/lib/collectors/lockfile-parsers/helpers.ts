/** Shared shape guards for the lockfile parsers. */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const countKeys = (value: unknown): number =>
  isRecord(value) ? Object.keys(value).length : 0;
