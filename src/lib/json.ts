/** Structural accessors for JSON read back from the catalog (no type assertions). */

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

export const numberAt = (value: unknown, key: string): number => {
  const record = asRecord(value);
  const inner = record?.[key];
  return typeof inner === "number" && Number.isFinite(inner) ? inner : 0;
};

export const stringAt = (value: unknown, key: string): string => {
  const record = asRecord(value);
  const inner = record?.[key];
  return typeof inner === "string" ? inner : "";
};

export const recordAt = (
  value: unknown,
  key: string,
): Record<string, unknown> => asRecord(asRecord(value)?.[key]) ?? {};

export const arrayAt = (value: unknown, key: string): readonly unknown[] =>
  asArray(asRecord(value)?.[key]);
